/**
 * Temporada completa: pega o maior empréstimo no dia 0 e joga até a última rodada.
 * node scripts/max-loan-season-sim.mjs [A|B|C|D] [--ignore-min] [--spend]
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
  estimateRoundCostBill,
  getBalance,
  spend,
  tvHomeSlots,
} from '../js/engine/economy.js';
import {
  takeBankLoan,
  serviceBankLoan,
  payBankLoanMinimum,
  resolveBankCredit,
  bankLoanBalance,
  getBankLoan,
  bankLoanStatus,
} from '../js/engine/bank-loan.js';

const args = process.argv.slice(2);
const DIVISION = (args.find(a => /^[ABCD]$/i.test(a)) || 'D').toUpperCase();
const IGNORE_MIN = args.includes('--ignore-min');
const SPEND = args.includes('--spend') || args.includes('--burn');
const EVERY = Number((args.find(a => a.startsWith('--every=')) || '--every=1').split('=')[1]) || 1;

const fmt = n =>
  `R$ ${Math.round(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
const seasonRounds = d => (d === 'D' ? 22 : 38);

const roster = (n, ovr) =>
  Array.from({ length: n }, (_, i) => ({
    name: `P${i + 1}`,
    overall: ovr,
    age: 24 + (i % 8),
    pos: 'MC',
    wage: null,
  }));

const midOvr = { A: 76, B: 72, C: 68, D: 64 }[DIVISION];

function makeClub() {
  const club = {
    name: 'Vinas FC',
    division: DIVISION,
    roster: roster(22, midOvr),
    budget: initialBudget(DIVISION),
    environment: 70,
    support: 75,
    board: 75,
    finances: 75,
    managerReputation: 70,
  };
  ensureStadium(club, DIVISION);
  return club;
}

function run({ payMinimum, spendLoan, label }) {
  const club = makeClub();
  const rounds = seasonRounds(DIVISION);
  const homes = tvHomeSlots(DIVISION);
  assignSponsors(club, {
    division: DIVISION,
    season: 2026,
    installments: rounds,
    creditPackage: false,
    random: () => 0.45,
  });
  assignTvRights(club, {
    division: DIVISION,
    season: 2026,
    installments: homes,
    random: () => 0.45,
  });

  const line = resolveBankCredit(club, { division: DIVISION });
  let loanTaken = 0;
  if (line.available > 0) {
    takeBankLoan(club, line.available, { division: DIVISION, season: 2026, round: 0 });
    loanTaken = line.available;
  }
  if (spendLoan && loanTaken > 0) {
    spend(club, Math.min(loanTaken, getBalance(club)), {
      reason: 'transfer',
      label: 'Queima do empréstimo',
      allowNegative: false,
    });
  }

  const gatePerHome = estimateGateReceipt(club, { channel: 'national', division: DIVISION }).revenue;
  const roundCost = estimateRoundCostBill(club, DIVISION, { managerReputation: 70 });

  const rows = [];
  let firstRed = null;
  let maxDebt = bankLoanBalance(club);

  rows.push({
    round: 0,
    cash: getBalance(club),
    debt: bankLoanBalance(club),
    minDue: getBankLoan(club)?.minAmortDue || 0,
    streak: 0,
    interest: 0,
    amort: 0,
    capitalized: 0,
    forced: 0,
    note: 'após máx. empréstimo' + (spendLoan ? ' + queima' : ''),
  });

  for (let round = 1; round <= rounds; round++) {
    const isHome = round % 2 === 1;
    if (isHome) {
      club.budget += gatePerHome;
      creditHomeTv(
        club,
        { home: club.name, away: `Opp ${round}`, round, competition: 'LEAGUE' },
        { division: DIVISION, season: 2026 },
      );
    }
    creditSponsorInstallment(club, { round, installments: rounds });
    chargeRoundCosts(club, {
      division: DIVISION,
      round,
      managerReputation: 70,
      managerId: 'sim',
      preferredDivision: DIVISION,
    });

    const bank = serviceBankLoan(club, { division: DIVISION, round, season: 2026 });
    let amort = bank.amortPaid || bank.forceCollected || 0;
    if (payMinimum && getBankLoan(club)?.minAmortDue > 0) {
      const paid = payBankLoanMinimum(club, { division: DIVISION });
      if (paid.ok) amort += paid.towardDue || paid.paid || 0;
    }

    const loan = getBankLoan(club);
    const cash = getBalance(club);
    maxDebt = Math.max(maxDebt, loan?.balance || 0);
    if (cash < 0 && firstRed == null) firstRed = round;

    rows.push({
      round,
      cash,
      debt: loan?.balance || 0,
      minDue: loan?.minAmortDue || 0,
      streak: loan?.delinquencyStreak || 0,
      interest: bank.interestPaid || 0,
      amort,
      capitalized: bank.capitalized || 0,
      forced: bank.forceCollected || 0,
      ratePct: bankLoanStatus(club, { division: DIVISION })?.effectiveRatePct,
    });
  }

  return {
    label,
    line,
    loanTaken,
    gatePerHome,
    roundCost,
    firstRed,
    maxDebt,
    end: rows[rows.length - 1],
    rows,
  };
}

const scenarios = [
  run({
    payMinimum: !IGNORE_MIN && true,
    spendLoan: SPEND,
    label: SPEND
      ? IGNORE_MIN
        ? 'Máx. + gasta + IGNORA mínimo'
        : 'Máx. + gasta + paga mínimo'
      : IGNORE_MIN
        ? 'Máx. + guarda + IGNORA mínimo'
        : 'Máx. + guarda + paga mínimo',
  }),
];

// Always also print the contrasting path for the same division
if (!IGNORE_MIN && !SPEND) {
  scenarios.push(run({ payMinimum: true, spendLoan: true, label: 'Máx. + gasta + paga mínimo' }));
  scenarios.push(
    run({ payMinimum: false, spendLoan: true, label: 'Máx. + gasta + IGNORA mínimo' }),
  );
}

console.log(`\n=== MAX LOAN SEASON · Série ${DIVISION} · ${seasonRounds(DIVISION)} rodadas ===\n`);

for (const s of scenarios) {
  console.log(`--- ${s.label} ---`);
  console.log(
    `Crédito disponível: ${fmt(s.line.available)} @ ${s.line.ratePct}%/rod · cobertura crédito ${s.line.coverage}`,
  );
  console.log(
    `Contrato: ${fmt(s.loanTaken)} · custo/rod ~${fmt(s.roundCost)} · gate/mando ~${fmt(s.gatePerHome)}`,
  );
  console.log(
    `Fim r${s.end.round}: caixa ${fmt(s.end.cash)} · dívida ${fmt(s.end.debt)} · atraso ${s.end.streak} · minDue ${fmt(s.end.minDue)}`,
  );
  console.log(
    `Pico dívida ${fmt(s.maxDebt)} · 1º vermelho: ${s.firstRed ?? 'nunca'}`,
  );
  console.log('');
  console.log(
    'rod | caixa | dívida | minDue | juros | amort | cap | forçado | atraso',
  );
  for (const r of s.rows) {
    if (r.round !== 0 && r.round % EVERY !== 0 && r.round !== seasonRounds(DIVISION)) continue;
    console.log(
      [
        String(r.round).padStart(3),
        fmt(r.cash).padStart(14),
        fmt(r.debt).padStart(14),
        fmt(r.minDue).padStart(12),
        fmt(r.interest).padStart(10),
        fmt(r.amort).padStart(10),
        fmt(r.capitalized).padStart(10),
        fmt(r.forced).padStart(10),
        String(r.streak || 0).padStart(6),
      ].join(' | '),
    );
  }
  console.log('');
}
