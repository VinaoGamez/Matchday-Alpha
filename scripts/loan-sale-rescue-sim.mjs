/**
 * Resgate via venda de atletas (1–2) + pagamento do mínimo.
 * node scripts/loan-sale-rescue-sim.mjs
 */
import {
  initialBudget,
  ensureStadium,
  assignSponsors,
  assignTvRights,
  creditSponsorInstallment,
  creditHomeTv,
  chargeRoundCosts,
  estimateGateReceipt,
  getBalance,
  spend,
  tvHomeSlots,
  serviceOverdraft,
  estimateRoundCostBill,
} from '../js/engine/economy.js';
import {
  takeBankLoan,
  serviceBankLoan,
  payBankLoanMinimum,
  resolveBankCredit,
  bankLoanBalance,
  getBankLoan,
} from '../js/engine/bank-loan.js';
import { estimatePlayerValue } from '../js/engine/player-value.js';
import { resolveClubBankruptcyRisk } from '../js/engine/club-solvency.js';
import { MANAGER_JOB_HONEYMOON_ROUNDS } from '../js/engine/manager-job.js';

const POS = ['GK', 'ZG', 'LE', 'LD', 'VOL', 'MC', 'ME', 'MD', 'PE', 'PD', 'ATA'];

function buildRoster(division) {
  // Elenco misto: alguns vendáveis, maioria média da série.
  const specs = [
    { overall: 84, age: 24, potential: 88 },
    { overall: 80, age: 26, potential: 82 },
    { overall: 78, age: 23, potential: 84 },
    { overall: 76, age: 27, potential: 77 },
    { overall: 76, age: 25, potential: 79 },
    { overall: 74, age: 29, potential: 74 },
    { overall: 72, age: 22, potential: 80 },
    { overall: 72, age: 28, potential: 72 },
    { overall: 70, age: 30, potential: 70 },
    { overall: 70, age: 21, potential: 78 },
    { overall: 68, age: 26, potential: 70 },
    { overall: 68, age: 24, potential: 74 },
    { overall: 66, age: 32, potential: 66 },
    { overall: 66, age: 23, potential: 72 },
    { overall: 64, age: 20, potential: 76 },
    { overall: 64, age: 28, potential: 64 },
    { overall: 62, age: 31, potential: 62 },
    { overall: 62, age: 22, potential: 70 },
    { overall: 60, age: 34, potential: 60 },
    { overall: 60, age: 19, potential: 74 },
    { overall: 58, age: 27, potential: 60 },
    { overall: 58, age: 21, potential: 68 },
  ];
  return specs.map((s, i) => {
    const player = {
      id: `p${i}`,
      name: `Athlete ${i + 1}`,
      pos: POS[i % POS.length],
      overall: s.overall,
      potential: s.potential,
      age: s.age,
      wage: null,
    };
    player.marketValue = estimatePlayerValue(player, division);
    return player;
  });
}

function makeClub(division) {
  const club = {
    name: 'Sim FC',
    division,
    roster: buildRoster(division),
    budget: initialBudget(division),
    environment: 70,
    support: 70,
    board: 72,
    finances: 75,
    managerReputation: 70,
  };
  ensureStadium(club, division);
  assignSponsors(club, {
    division,
    season: 2026,
    installments: 38,
    creditPackage: false,
    random: () => 0.45,
  });
  assignTvRights(club, {
    division,
    season: 2026,
    installments: tvHomeSlots(division),
    random: () => 0.45,
  });
  return club;
}

/** Vende os N atletas de maior marketValue. Retorna { fees, sold }. */
function sellTopPlayers(club, n, division) {
  const sorted = [...club.roster].sort(
    (a, b) => (b.marketValue || 0) - (a.marketValue || 0),
  );
  const pick = sorted.slice(0, Math.max(0, n));
  let fees = 0;
  const sold = [];
  for (const p of pick) {
    const fee = Math.round(Number(p.marketValue) || estimatePlayerValue(p, division));
    club.roster = club.roster.filter(x => x.id !== p.id);
    club.budget = Math.round((club.budget || 0) + fee);
    fees += fee;
    sold.push({ name: p.name, ovr: p.overall, age: p.age, fee });
  }
  return { fees, sold };
}

/**
 * sellWhen: 'red1' | 'red2' | 'red3' | 'warn' | 'never'
 * sellCount: 1 | 2
 * thenPay: se true, paga mínimo após a venda e nas rodadas seguintes
 */
function run({
  division = 'A',
  spendMode = 'loan',
  sellWhen = 'red1',
  sellCount = 1,
  thenPay = true,
  rounds = 40,
} = {}) {
  const club = makeClub(division);
  const line = resolveBankCredit(club, { division });
  takeBankLoan(club, line.available, { division, season: 2026, round: 0 });
  const loan0 = line.available;
  if (spendMode === 'loan') {
    spend(club, Math.min(loan0, getBalance(club)), {
      reason: 'transfer',
      label: 'Gasta loan',
      allowNegative: false,
    });
  } else if (spendMode === 'all') {
    const burn = Math.max(0, getBalance(club));
    if (burn > 0) {
      spend(club, burn, { reason: 'transfer', label: 'Queima', allowNegative: false });
    }
  }

  let paying = false;
  let soldOnce = false;
  let saleInfo = null;
  let firstWarn = null;
  let firstRed = null;
  let bankrupt = null;
  let reason = null;
  let exitedRed = null;
  let clearedLoan = null;
  let payOk = 0;
  let payFail = 0;
  let cashAtSale = null;
  let debtAtSale = null;

  const maybeSell = (r, od, del) => {
    if (soldOnce || sellWhen === 'never') return;
    let trigger = false;
    if (sellWhen === 'warn' && del >= 2) trigger = true;
    if (sellWhen === 'red1' && od >= 1) trigger = true;
    if (sellWhen === 'red2' && od >= 2) trigger = true;
    if (sellWhen === 'red3' && od >= 3) trigger = true;
    if (!trigger) return;

    cashAtSale = getBalance(club);
    debtAtSale = bankLoanBalance(club);
    saleInfo = sellTopPlayers(club, sellCount, division);
    saleInfo.round = r;
    soldOnce = true;
    if (thenPay) paying = true;
  };

  const tryPay = () => {
    if (!paying || !getBankLoan(club)) return;
    const res = payBankLoanMinimum(club, { division });
    if (res?.ok) payOk += 1;
    else payFail += 1;
  };

  for (let r = 1; r <= rounds; r += 1) {
    if (r % 2 === 1) {
      club.budget += estimateGateReceipt(club, {
        channel: 'national',
        division,
      }).revenue;
      creditHomeTv(
        club,
        { home: club.name, away: `Opp ${r}`, round: r, competition: 'LEAGUE' },
        { division, season: 2026 },
      );
    }
    creditSponsorInstallment(club, { round: r, installments: 38 });
    chargeRoundCosts(club, {
      division,
      round: r,
      managerReputation: 70,
      managerId: 'sim',
      preferredDivision: division,
    });
    serviceBankLoan(club, { division, round: r, season: 2026 });

    // Venda no aviso (ainda azul) — antes do OD
    const delPre = getBankLoan(club)?.delinquencyStreak || 0;
    if (sellWhen === 'warn') maybeSell(r, club.overdraftStreak || 0, delPre);
    if (paying) tryPay();

    serviceOverdraft(club, { division, round: r, season: 2026 });
    const od = club.overdraftStreak || 0;
    if (sellWhen.startsWith('red')) maybeSell(r, od, delPre);
    if (paying) tryPay();

    const cash = getBalance(club);
    const debt = bankLoanBalance(club);
    const del = getBankLoan(club)?.delinquencyStreak || 0;
    if (cash < 0 && firstRed == null) firstRed = r;
    if (cash >= 0 && firstRed != null && exitedRed == null) exitedRed = r;
    if (!getBankLoan(club) && clearedLoan == null) clearedLoan = r;

    const solvency = resolveClubBankruptcyRisk({
      cash,
      roundCost: estimateRoundCostBill(club, division, { managerReputation: 70 }),
      overdraftStreak: club.overdraftStreak || 0,
      finances: Math.max(28, 75 - del * 3 - (cash < 0 ? 20 : 0)),
      loanBalance: debt,
      delinquencyStreak: del,
      loanServiceShortfall: !!club.loanServiceShortfall,
      played: MANAGER_JOB_HONEYMOON_ROUNDS + r,
    });
    if (solvency.status === 'warn_insolvent' && firstWarn == null) firstWarn = r;
    if (solvency.status === 'bankrupt' && bankrupt == null) {
      bankrupt = r;
      reason = solvency.reason;
      break;
    }
  }

  const endDebt = bankLoanBalance(club);
  const endCash = getBalance(club);
  let outcome = 'APERTADO';
  if (bankrupt) outcome = 'QUEBRA';
  else if (clearedLoan) outcome = 'QUITOU';
  else if (exitedRed && endCash >= 0 && !bankrupt) outcome = 'SALVO_AZUL';
  else if (!firstRed && !bankrupt) outcome = 'NUNCA_VERMELHO';
  else if (endCash >= 0 && !bankrupt) outcome = 'AZUL';

  return {
    division,
    sellWhen,
    sellCount,
    loan0,
    firstWarn,
    firstRed,
    exitedRed,
    clearedLoan,
    bankrupt,
    reason,
    saleRound: saleInfo?.round ?? null,
    saleFees: saleInfo?.fees ?? 0,
    sold: saleInfo?.sold ?? [],
    cashAtSale,
    debtAtSale,
    payOk,
    payFail,
    endCash,
    endDebt,
    outcome,
  };
}

const fmt = n =>
  `R$ ${Math.round(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

// Preview valores vendáveis
console.log('=== Top atletas vendáveis (marketValue) ===');
for (const div of ['A', 'B', 'C', 'D']) {
  const roster = buildRoster(div)
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 3);
  console.log(
    div,
    roster.map(p => `ovr${p.overall}/${p.age}y=${fmt(p.marketValue)}`).join(' · '),
  );
}

console.log('\n=== RESGATE: venda + pagar mínimo (gasta loan + ignora até vender) ===');
console.log(
  'div | vendas | quando | rod_venda | arrecadado | cash_antes | saiu_verm | quebra | outcome',
);

const rows = [];
for (const div of ['A', 'B', 'C', 'D']) {
  for (const sellCount of [1, 2]) {
    for (const sellWhen of ['warn', 'red1', 'red2', 'red3']) {
      const r = run({ division: div, sellCount, sellWhen, thenPay: true });
      rows.push(r);
      console.log(
        [
          div,
          `${sellCount}j`,
          sellWhen.padEnd(5),
          r.saleRound ?? '—',
          fmt(r.saleFees),
          r.cashAtSale != null ? fmt(r.cashAtSale) : '—',
          r.exitedRed ?? '—',
          r.bankrupt ?? '—',
          r.outcome,
        ].join(' | '),
      );
    }
  }
}

console.log('\n=== Controle: sem venda ===');
for (const div of ['A', 'B', 'C', 'D']) {
  const r = run({ division: div, sellWhen: 'never', thenPay: false });
  console.log(
    [div, '0j', 'never', '—', '—', '—', '—', r.bankrupt ?? '—', r.outcome].join(' | '),
  );
}

// Contagem
const rescued = rows.filter(r => !r.bankrupt && (r.exitedRed || r.outcome === 'NUNCA_VERMELHO' || r.outcome === 'QUITOU' || r.outcome === 'SALVO_AZUL' || r.outcome === 'AZUL'));
const broke = rows.filter(r => r.bankrupt);
console.log(`\n=== Leitura: ${rescued.length} salvos / ${broke.length} quebras em ${rows.length} tentativas de venda ===`);

// Detalhe A: 1 e 2 vendas na 1ª e 2ª vermelha
console.log('\n=== Detalhe A — quem vendeu ===');
for (const sellCount of [1, 2]) {
  for (const sellWhen of ['red1', 'red2']) {
    const r = run({ division: 'A', sellCount, sellWhen, thenPay: true });
    console.log(
      `A ${sellCount}j @${sellWhen}: ${r.sold.map(s => `ovr${s.ovr} ${fmt(s.fee)}`).join(' + ')} → ${r.outcome} (quebra ${r.bankrupt ?? 'não'}, azul ${r.exitedRed ?? '—'}, dívida fim ${fmt(r.endDebt)}, caixa fim ${fmt(r.endCash)})`,
    );
  }
}
