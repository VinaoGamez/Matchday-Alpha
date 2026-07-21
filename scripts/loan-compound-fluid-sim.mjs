/**
 * Sim fluido: ignora mínimo → compostos (taxa reaplicada) → dívida sobe → caixa.
 * node scripts/loan-compound-fluid-sim.mjs
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
  loanCompoundApplications,
} from '../js/engine/bank-loan.js';
import { resolveClubBankruptcyRisk } from '../js/engine/club-solvency.js';
import { MANAGER_JOB_HONEYMOON_ROUNDS } from '../js/engine/manager-job.js';

const fmt = n =>
  `R$ ${Math.round(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

const roster = () =>
  Array.from({ length: 22 }, (_, i) => ({
    name: `P${i + 1}`,
    overall: 76,
    age: 24,
    pos: 'MC',
    wage: null,
  }));

function run({ payMinimum, spendMode, label, rounds = 18, division = 'A' }) {
  const club = {
    name: 'Sim FC',
    division,
    roster: roster(),
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
      spend(club, burn, { reason: 'transfer', label: 'Queima tudo', allowNegative: false });
    }
  }

  const gate = estimateGateReceipt(club, { channel: 'national', division }).revenue;
  const rows = [
    {
      r: 0,
      cash: getBalance(club),
      debt: bankLoanBalance(club),
      streak: 0,
      cap: 0,
      apps: 0,
      force: 0,
      status: 'ok',
    },
  ];

  let firstWarn = null;
  let firstRed = null;
  let bankrupt = null;

  for (let r = 1; r <= rounds; r += 1) {
    if (r % 2 === 1) {
      club.budget += gate;
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

    const svc = serviceBankLoan(club, { division, round: r, season: 2026 });
    if (payMinimum && getBankLoan(club)?.minAmortDue > 0) {
      payBankLoanMinimum(club, { division });
    }
    serviceOverdraft(club, { division, round: r, season: 2026 });

    const cash = getBalance(club);
    const debt = bankLoanBalance(club);
    const loan = getBankLoan(club);
    const streak = loan?.delinquencyStreak || 0;
    if (cash < 0 && firstRed == null) firstRed = r;

    const solvency = resolveClubBankruptcyRisk({
      cash,
      roundCost: estimateRoundCostBill(club, division, { managerReputation: 70 }),
      overdraftStreak: club.overdraftStreak || 0,
      finances: Math.max(28, 75 - streak * 3 - (cash < 0 ? 20 : 0)),
      loanBalance: debt,
      delinquencyStreak: streak,
      loanServiceShortfall: !!club.loanServiceShortfall,
      played: MANAGER_JOB_HONEYMOON_ROUNDS + r,
    });
    if (solvency.status === 'warn_insolvent' && firstWarn == null) firstWarn = r;
    if (solvency.status === 'bankrupt' && bankrupt == null) bankrupt = r;

    rows.push({
      r,
      cash,
      debt,
      streak,
      cap: svc.capitalized || 0,
      apps: svc.compoundApps || (streak ? loanCompoundApplications(streak) : 0),
      force: svc.forceCollected || 0,
      status: solvency.status,
    });

    if (bankrupt != null) break;
  }

  console.log(`\n=== ${label} ===`);
  console.log(
    `Loan ${fmt(loan0)} @ ${line.ratePct}% · aviso r${firstWarn ?? '—'} · vermelho r${firstRed ?? '—'} · quebra r${bankrupt ?? '—'}`,
  );
  console.log(
    'rod | caixa | dívida | Δ dívida | streak | apps | capitalizado | forçado(caixa) | status',
  );
  let prevDebt = rows[0].debt;
  for (const row of rows) {
    const delta = row.debt - prevDebt;
    const deltaStr = `${delta >= 0 ? '+' : ''}${fmt(delta)}`;
    console.log(
      [
        String(row.r).padStart(3),
        fmt(row.cash).padStart(14),
        fmt(row.debt).padStart(14),
        deltaStr.padStart(12),
        String(row.streak).padStart(6),
        String(row.apps || 0).padStart(4),
        fmt(row.cap).padStart(12),
        fmt(row.force).padStart(14),
        row.status,
      ].join(' | '),
    );
    prevDebt = row.debt;
  }
  const end = rows[rows.length - 1];
  console.log(
    `→ Dívida ${fmt(loan0)} → ${fmt(end.debt)} (Δ ${fmt(end.debt - loan0)})`,
  );
  return { firstWarn, firstRed, bankrupt, end, loan0, rows };
}

const pay = run({
  payMinimum: true,
  spendMode: 'loan',
  label: 'A · Gasta loan + PAGA mínimo',
});
const ignore = run({
  payMinimum: false,
  spendMode: 'loan',
  label: 'A · Gasta loan + IGNORA mínimo (compostos)',
  rounds: 22,
});
const burn = run({
  payMinimum: false,
  spendMode: 'all',
  label: 'A · QUEIMA TUDO + ignora mínimo',
  rounds: 16,
});

const SIM_ROUNDS = 22;
console.log(`\n=== Matriz ignore (gasta loan) A–D — mesmo modelo, ${SIM_ROUNDS}r ===`);
const matrix = {};
for (const div of ['A', 'B', 'C', 'D']) {
  matrix[div] = run({
    payMinimum: false,
    spendMode: 'loan',
    label: `${div} · IGNORA`,
    rounds: SIM_ROUNDS,
    division: div,
  });
}

console.log('\n=== Leitura ===');
console.log(
  `Paga mínimo: aviso=${pay.firstWarn ?? 'não'} · vermelho=${pay.firstRed ?? 'não'} · quebra=${pay.bankrupt ?? 'não'} · dívida fim ${fmt(pay.end.debt)}`,
);
console.log(
  `Ignora A: aviso r${ignore.firstWarn ?? '—'} (alvo streak 2) · vermelho r${ignore.firstRed ?? '—'} · quebra r${ignore.bankrupt ?? '—'} · dívida ${fmt(ignore.loan0)} → ${fmt(ignore.end.debt)}`,
);
console.log(
  `Queima+ignora: aviso r${burn.firstWarn ?? '—'} · vermelho r${burn.firstRed ?? '—'} · quebra r${burn.bankrupt ?? '—'} · dívida fim ${fmt(burn.end.debt)}`,
);
for (const div of ['A', 'B', 'C', 'D']) {
  const m = matrix[div];
  const ok = m.bankrupt != null && m.bankrupt <= 12 ? 'OK' : 'LENTO';
  console.log(
    `${div}: aviso r${m.firstWarn ?? '—'} · vermelho r${m.firstRed ?? '—'} · quebra r${m.bankrupt ?? '—'} (${ok})`,
  );
}
console.log('');
