/**
 * Validação integrada — alterações do dia (metas complementares, empréstimo bancário, split salário).
 * node scripts/today-changes-validation.mjs
 */
import {
  pickSeasonObjectives,
  seasonObjectiveLiveProgress,
  evaluateSeasonObjectives,
} from '../js/engine/season-objectives.js';
import {
  previewLoanPlan,
  resolveBankCredit,
  takeBankLoan,
  payBankLoanInstallment,
  getBankLoan,
  clearBankLoan,
} from '../js/engine/bank-loan.js';
import {
  formatBudgetExact,
  getBalance,
  ensureBudget,
  estimateWageBill,
} from '../js/engine/economy.js';
import {
  computeLoanSalaryShare,
  resolveHostRoundWage,
  resolveOwnerRoundWage,
  estimateLoanOutWageBill,
} from '../js/engine/loan-salary-split.js';
import { resolvePlayerRoundWage } from '../js/engine/economy.js';

let passed = 0;
let failed = 0;
const simRows = [];

const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${label}`);
    console.error(`  ${error.message}`);
  }
};

const assert = (cond, message) => {
  if (!cond) throw new Error(message || 'assertion failed');
};

const rosterPlayer = (wage, overall = 14) => ({
  name: `J${Math.random().toString(36).slice(2, 6)}`,
  pos: 'MC',
  age: 24,
  overall,
  potential: 30,
  wage,
  starter: true,
});

const clubOf = ({
  division = 'C',
  budget = 8_000_000,
  finances = 88,
  wages = [8_000, 7_000, 6_000, 5_500, 5_000],
} = {}) => ({
  name: 'Sim FC',
  division,
  budget,
  finances,
  wageShortfall: false,
  roster: wages.map(w => rosterPlayer(w)),
  sponsors: {
    season: 2026,
    division,
    master: { name: 'Master', role: 'master', value: 1_800_000 },
    secondaries: [
      { name: 'S1', role: 'secondary', value: 420_000 },
      { name: 'S2', role: 'secondary', value: 380_000 },
    ],
  },
  tvRights: { season: 2026, totalValue: 1_100_000, perRound: 30_000 },
});

const clubStub = (division, overrides = {}) => ({
  name: 'Sim FC',
  division,
  budget: 800_000,
  finances: 62,
  medicalInvestment: 1,
  preventionProgram: 0,
  stadiumCapacityLevel: 1,
  stadiumStructure: 1,
  pitchLevel: 1,
  ...overrides,
});

const player = (wage = 10_000, age = 24) => ({
  name: 'Loan Player',
  pos: 'MC',
  age,
  overall: 72,
  wage,
});

// ── Metas complementares ────────────────────────────────────────────────

check('pickSeasonObjectives — 3 metas por divisão', () => {
  for (const division of ['A', 'B', 'C', 'D']) {
    const objectives = pickSeasonObjectives({ division, seed: 42, club: clubStub(division) });
    assert(objectives.length === 3, `${division}: expected 3 objectives`);
    const cats = new Set(objectives.map(o => o.category));
    assert(cats.has('tournament'), `${division}: missing tournament`);
    assert(cats.has('economy'), `${division}: missing economy`);
    assert(cats.has('structure'), `${division}: missing structure`);
  }
});

const simSeasonEnd = (label, division, ctx, clubOverrides = {}) => {
  const club = clubStub(division, clubOverrides);
  const objectives = pickSeasonObjectives({ division, seed: 99, club, inCup: true });
  const live = objectives.map(obj => ({
    label: obj.label.slice(0, 40),
    status: seasonObjectiveLiveProgress(obj, ctx, club).status,
  }));
  const pack = evaluateSeasonObjectives(objectives, { ...ctx, season: 2026 }, club);
  assert(pack?.items?.length === 3, `${label}: pack incomplete`);
  assert(Math.abs(pack.boardDelta) <= 3, `${label}: board delta out of cap (${pack.boardDelta})`);
  simRows.push({
    label,
    division,
    met: pack.metCount,
    near: pack.nearCount,
    missed: pack.missedCount,
    board: pack.boardDelta,
    live: live.map(l => l.status).join('/'),
  });
};

check('sim fim de temporada — campanha forte Série A', () => {
  simSeasonEnd(
    'A forte',
    'A',
    {
      position: 6,
      played: 38,
      points: 58,
      goalDiff: 12,
      form: ['W', 'W', 'D', 'W', 'L'],
      balance: 1_200_000,
      finances: 68,
      runway: 5,
      cupPhaseIndex: 4,
    },
    { medicalInvestment: 3, stadiumStructure: 3, pitchLevel: 3 },
  );
});

check('sim fim de temporada — campanha fraca Série B', () => {
  simSeasonEnd(
    'B fraca',
    'B',
    {
      position: 18,
      played: 38,
      points: 32,
      goalDiff: -15,
      form: ['L', 'L', 'D', 'L', 'L'],
      balance: -80_000,
      finances: 38,
      runway: 0.8,
      cupPhaseIndex: 1,
    },
  );
});

check('sim fim de temporada — Série D grupos', () => {
  simSeasonEnd(
    'D grupos',
    'D',
    {
      position: 2,
      played: 14,
      points: 22,
      goalDiff: 4,
      form: ['W', 'D', 'W', 'W'],
      balance: 350_000,
      finances: 55,
      runway: 2.5,
      cupPhaseIndex: 0,
    },
  );
});

check('sim fim de temporada — pacote board sempre ±3', () => {
  let minDelta = 3;
  let maxDelta = -3;
  for (let seed = 1; seed <= 40; seed += 1) {
    const objectives = pickSeasonObjectives({ division: 'C', seed, club: clubStub('C') });
    const ctx = {
      position: seed % 2 ? 5 : 17,
      played: 30,
      points: seed % 2 ? 48 : 28,
      goalDiff: seed % 2 ? 8 : -6,
      balance: seed % 3 ? 600_000 : -50_000,
      finances: seed % 2 ? 65 : 42,
      runway: seed % 2 ? 4 : 1,
      cupPhaseIndex: seed % 4,
      season: 2026,
    };
    const pack = evaluateSeasonObjectives(objectives, ctx, clubStub('C'));
    minDelta = Math.min(minDelta, pack.boardDelta);
    maxDelta = Math.max(maxDelta, pack.boardDelta);
  }
  assert(minDelta >= -3 && maxDelta <= 3, `delta range ${minDelta}..${maxDelta}`);
});

// ── Empréstimo bancário ─────────────────────────────────────────────────

check('previewLoanPlan — prazo curto vs longo', () => {
  const principal = 1_000_000;
  const rate = 0.017;
  const shortPlan = previewLoanPlan(principal, rate, 12);
  const longPlan = previewLoanPlan(principal, rate, 48);
  assert(shortPlan.rate < longPlan.rate, 'taxa menor no prazo curto');
  assert(shortPlan.totalInterest < longPlan.totalInterest, 'juros totais menores no prazo curto');
  assert(shortPlan.installmentPrincipal > longPlan.installmentPrincipal, 'parcela maior no curto');
  simRows.push({
    label: 'Empréstimo 1M',
    division: '—',
    met: `12j juros ${Math.round(shortPlan.totalInterest / 1000)}k`,
    near: `48j juros ${Math.round(longPlan.totalInterest / 1000)}k`,
    missed: `taxa ${shortPlan.ratePct}%→${longPlan.ratePct}%`,
    board: '—',
    live: 'ok',
  });
});

check('resolveBankCredit + formatBudgetExact — teto legível', () => {
  const club = clubOf({ division: 'B', budget: 6_200_000, finances: 78 });
  ensureBudget(club, 'B');
  const credit = resolveBankCredit(club, { division: 'B' });
  assert(credit.available > 0, 'credit should be positive');
  const formatted = formatBudgetExact(credit.available);
  assert(!formatted.includes('mi'), `should not abbreviate: ${formatted}`);
  assert(formatted.includes('R$'), formatted);
  simRows.push({
    label: 'Teto crédito B',
    division: 'B',
    met: formatted,
    near: `${credit.ratePct}%/rod`,
    missed: `folha ${formatBudgetExact(estimateWageBill(club, 'B'))}`,
    board: '—',
    live: credit.tierLabel,
  });
});

check('sim empréstimo — contrata + amortiza parcela', () => {
  const club = clubOf({ division: 'C', budget: 8_000_000, finances: 90 });
  ensureBudget(club, 'C');
  clearBankLoan(club);
  const fee = Math.min(1_200_000, resolveBankCredit(club, { division: 'C' }).available);
  assert(takeBankLoan(club, fee, { division: 'C', term: 24 }).ok, 'take failed');
  const startDebt = getBankLoan(club).balance;
  const pay = payBankLoanInstallment(club, { division: 'C' });
  assert(pay.ok, `pay failed: ${pay.reason}`);
  const afterDebt = getBankLoan(club).balance;
  assert(afterDebt < startDebt, `debt ${startDebt} → ${afterDebt}`);
  simRows.push({
    label: 'Amort. 1 parcela',
    division: 'C',
    met: `dívida ${formatBudgetExact(startDebt)}`,
    near: `→ ${formatBudgetExact(afterDebt)}`,
    missed: `pago ${formatBudgetExact(pay.paid || 0)}`,
    board: '—',
    live: '24x',
  });
  clearBankLoan(club);
});

// ── Split salário em empréstimo (hospedeiro 100%) ───────────────────────

check('sim split — hospedeiro 100% em qualquer divisão', () => {
  const matrix = [
    ['A', 'A'],
    ['C', 'B'],
    ['C', 'A'],
    ['B', 'C'],
  ];
  for (const [host, owner] of matrix) {
    const share = computeLoanSalaryShare(player(), { division: owner }, { division: host });
    assert(share === 1, `${owner}→${host}: expected 1 got ${share}`);
  }
});

check('sim split — folha integral no hospedeiro, cedente zero', () => {
  const wage = 12_000;
  const p = { ...player(wage), onLoan: true, loanFrom: 'Owner', loanSalaryShare: 0.4 };
  const hostWage = resolveHostRoundWage(p, 'C', resolvePlayerRoundWage);
  const ownerWage = resolveOwnerRoundWage(p, 'A', resolvePlayerRoundWage);
  assert(hostWage === 12_000, `host ${hostWage}`);
  assert(ownerWage === 0, `owner ${ownerWage}`);
  simRows.push({
    label: 'Split 12k',
    division: 'A→C',
    met: `host ${formatBudgetExact(hostWage)}`,
    near: `owner ${formatBudgetExact(ownerWage)}`,
    missed: '100/0',
    board: '—',
    live: 'ok',
  });
});

// ── Relatório ───────────────────────────────────────────────────────────

console.log('\n── Simulações (resumo) ──');
console.log('Cenário'.padEnd(22), 'Div', 'Met', 'Near', 'Miss', 'Board', 'Live');
for (const row of simRows) {
  console.log(
    row.label.padEnd(22),
    String(row.division).padEnd(4),
    String(row.met).padEnd(12),
    String(row.near).padEnd(12),
    String(row.missed).padEnd(12),
    String(row.board).padEnd(6),
    row.live,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
