/**
 * Simulação de risco: empréstimo máximo vs sem crédito.
 * Documentado em docs/09-RISCO-QUEBRA-FINANCEIRA.md
 *
 * node scripts/bank-loan-risk-sim.mjs
 */
import {
  resolveBankCredit,
  takeBankLoan,
  serviceBankLoan,
  payBankLoanMinimum,
  getBankLoan,
  bankLoanStatus,
} from '../js/engine/bank-loan.js';
import {
  getBalance,
  ensureBudget,
  estimateRoundRecurringRevenue,
  estimateRoundCostBill,
  credit,
  spend,
} from '../js/engine/economy.js';
import { createClubStatusEngine } from '../js/engine/club-status/index.js';

const DIVISION = 'D';
const ROUNDS = 22;
const CASH_START = 7_400_000;
const FINANCES_START = 80;

const fmt = n =>
  `R$ ${Math.round(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

const player = wage => ({
  name: `P${Math.random().toString(36).slice(2, 5)}`,
  pos: 'MC',
  age: 24,
  overall: 14,
  potential: 28,
  wage,
  starter: true,
});

function makeClub() {
  const club = {
    name: 'Sim FC',
    division: DIVISION,
    budget: CASH_START,
    finances: FINANCES_START,
    environment: 60,
    support: 60,
    board: 65,
    roster: Array.from({ length: 18 }, (_, i) => player(3500 + (i % 5) * 400)),
    sponsors: {
      season: 2027,
      division: DIVISION,
      master: { name: 'M', role: 'master', value: 900_000 },
      secondaries: [
        { name: 'S1', role: 'secondary', value: 220_000 },
        { name: 'S2', role: 'secondary', value: 180_000 },
        { name: 'S3', role: 'secondary', value: 160_000 },
      ],
      total: 1_460_000,
      installments: 22,
      paidAmount: 0,
      paidInstallments: 0,
    },
    tvRights: {
      season: 2027,
      division: DIVISION,
      total: 1_100_000,
      installments: 22,
      paidAmount: 0,
      paidInstallments: 0,
    },
    stadiumCapacity: 12_000,
    stadiumStructure: 1,
    pitchLevel: 1,
    ticketPrices: { national: 25, cups: 30 },
  };
  ensureBudget(club, DIVISION);
  club.budget = CASH_START;
  club.finances = FINANCES_START;
  return club;
}

const clone = c => JSON.parse(JSON.stringify(c));

const clubStatus = createClubStatusEngine({
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  getClubs: () => ({}),
  getUserClub: () => 'Sim FC',
  getUserDivision: () => DIVISION,
  getBalance,
  persistCareerStatus: () => {},
  onStatusChanged: () => {},
});

function advanceRound(club, round, { payMinimum = true } = {}) {
  const rev = estimateRoundRecurringRevenue(club, DIVISION);
  credit(club, rev, { reason: 'sim_revenue', label: 'Receita sim' });
  const cost = estimateRoundCostBill(club, DIVISION);
  const paid = Math.min(getBalance(club), cost);
  if (paid > 0) spend(club, paid, { reason: 'wages', label: 'Custos sim' });
  club.wageShortfall = paid < cost;
  const svc = serviceBankLoan(club, { division: DIVISION, round, season: 2027 });
  let amortExtra = 0;
  if (payMinimum && getBankLoan(club)?.minAmortDue > 0) {
    const minPay = payBankLoanMinimum(club, { division: DIVISION });
    if (minPay.ok) amortExtra = minPay.paid || 0;
  }
  clubStatus.syncFinancesFromBudget(club, DIVISION);
  const loan = getBankLoan(club);
  return {
    round,
    cash: getBalance(club),
    finances: Math.round(club.finances),
    debt: loan?.balance || 0,
    interestPaid: svc.interestPaid || 0,
    amortPaid: (svc.amortPaid || 0) + (svc.forceCollected || 0) + amortExtra,
    capitalized: svc.capitalized || 0,
    shortfall: (svc.shortfall || 0) + (club.wageShortfall ? cost - paid : 0),
    wageShortfall: !!club.wageShortfall,
    loanShortfall: !!(svc.delinquencyStreak > 0 || club.loanServiceShortfall),
    rev,
    cost,
  };
}

function simulate(label, { takeMax, burnPrincipal, payMinimum = true }) {
  const club = clone(makeClub());
  club.finances = FINANCES_START;
  const creditLine = resolveBankCredit(club, { division: DIVISION });
  const amount = takeMax ? creditLine.available : 0;
  if (amount > 0) {
    takeBankLoan(club, amount, { division: DIVISION, season: 2027, round: 0 });
    if (burnPrincipal) {
      spend(club, amount, { reason: 'transfer_out', label: 'Gasta empréstimo' });
    }
  }
  const rows = [
    {
      round: 0,
      cash: getBalance(club),
      finances: Math.round(club.finances),
      debt: getBankLoan(club)?.balance || 0,
      interestPaid: 0,
      amortPaid: 0,
      shortfall: 0,
      wageShortfall: false,
      loanShortfall: false,
    },
  ];
  for (let r = 1; r <= ROUNDS; r += 1) rows.push(advanceRound(club, r, { payMinimum }));

  const interestTotal = rows.reduce((s, x) => s + (x.interestPaid || 0), 0);
  const amortTotal = rows.reduce((s, x) => s + (x.amortPaid || 0), 0);
  const end = rows[rows.length - 1];
  const firstService = rows.find(r => r.round === 1);
  return {
    label,
    takeAmount: amount,
    ratePct: creditLine.ratePct,
    recurring: creditLine.recurring,
    roundCost: creditLine.roundCost,
    interestTotal,
    amortTotal,
    cashEnd: end.cash,
    debtEnd: end.debt,
    netWorthEnd: end.cash - end.debt,
    financesEnd: end.finances,
    minCash: Math.min(...rows.map(r => r.cash)),
    minFinances: Math.min(...rows.map(r => r.finances)),
    shortfallRounds: rows.filter(r => r.shortfall > 0 || r.wageShortfall || r.loanShortfall)
      .length,
    firstRoundDue: firstService
      ? (firstService.interestPaid || 0) + (firstService.amortPaid || 0)
      : 0,
    sample: [0, 1, 5, 10, 22]
      .map(n => rows.find(r => r.round === n))
      .filter(Boolean),
  };
}

const pre = resolveBankCredit(makeClub(), { division: DIVISION });
const scenarios = [
  simulate('Sem empréstimo', { takeMax: false, burnPrincipal: false }),
  simulate('Máximo e guarda + paga mínimo', { takeMax: true, burnPrincipal: false, payMinimum: true }),
  simulate('Máximo e gasta + paga mínimo', { takeMax: true, burnPrincipal: true, payMinimum: true }),
  simulate('Máximo e gasta + IGNORA mínimo', { takeMax: true, burnPrincipal: true, payMinimum: false }),
];

console.log('=== Premissas ===');
console.log(
  `Caixa ${fmt(CASH_START)} · crédito ${fmt(pre.available)} · juros ${pre.ratePct}%/rodada`,
);
console.log(
  `Receita/rodada ~${fmt(pre.recurring)} · custo/rodada ~${fmt(pre.roundCost)} · cobertura ${pre.coverage}`,
);
console.log(`Rodadas: ${ROUNDS} · divisão ${DIVISION}\n`);

for (const s of scenarios) {
  console.log(`--- ${s.label} ---`);
  console.log(`  Contratado: ${fmt(s.takeAmount)} @ ${s.ratePct}%`);
  if (s.firstRoundDue) console.log(`  1ª cobrança banco: ${fmt(s.firstRoundDue)}`);
  console.log(`  Juros na temporada: ${fmt(s.interestTotal)}`);
  console.log(`  Amortização paga: ${fmt(s.amortTotal)}`);
  console.log(
    `  Fim: caixa ${fmt(s.cashEnd)} · dívida ${fmt(s.debtEnd)} · PL ${fmt(s.netWorthEnd)} · saúde ${s.financesEnd}%`,
  );
  console.log(
    `  Mínimos: caixa ${fmt(s.minCash)} · saúde ${s.minFinances}% · rodadas com shortfall ${s.shortfallRounds}`,
  );
  console.log('');
}

console.log('=== Leitura de risco ===');
console.log(
  'Falência formal: não existe. Risco real = shortfall repetido → finanças < 40 → pressão na diretoria → demissão.',
);
const burnPay = scenarios[2];
const burnIgnore = scenarios[3];
const none = scenarios[0];
const plGap = none.netWorthEnd - scenarios[1].netWorthEnd;
console.log(
  `Custo de guardar o máximo vs não pegar (PL): ${fmt(plGap)} (≈ juros + mínimos).`,
);
console.log(
  `Gasta + paga mínimo: saúde ${FINANCES_START}% → ${burnPay.financesEnd}%; PL ${fmt(burnPay.netWorthEnd)}.`,
);
console.log(
  `Gasta + IGNORA mínimo: saúde → ${burnIgnore.financesEnd}%; dívida fim ${fmt(burnIgnore.debtEnd)}; shortfall ${burnIgnore.shortfallRounds}r — caminho de pane.`,
);
