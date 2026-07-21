/**
 * node scripts/club-solvency-tests.mjs
 */
import {
  resolveClubBankruptcyRisk,
  BANKRUPTCY_OVERDRAFT_STREAK,
  BANKRUPTCY_DELINQUENCY_WITH_RED,
  BANKRUPTCY_DEPTH_ROUNDS,
  BANKRUPTCY_DEPTH_STREAK,
  BANKRUPTCY_RED_STREAK,
  INSOLVENCY_WARN_STREAK,
  INSOLVENCY_WARN_DELINQUENCY,
} from '../js/engine/club-solvency.js';
import { STATUS_MIN } from '../js/engine/club-status/constants.js';
import { MANAGER_JOB_HONEYMOON_ROUNDS } from '../js/engine/manager-job.js';
import {
  compoundDelinquencyOnBalance,
  loanCompoundApplications,
} from '../js/engine/bank-loan.js';

let passed = 0;
let failed = 0;
const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${label}`);
  } catch (e) {
    failed += 1;
    console.error(`✗ ${label}`);
    console.error(`  ${e.message}`);
  }
};
const assert = (c, m) => {
  if (!c) throw new Error(m || 'fail');
};

check('saudável = ok', () => {
  const r = resolveClubBankruptcyRisk({
    cash: 5_000_000,
    roundCost: 300_000,
    overdraftStreak: 0,
    finances: 70,
    played: 20,
  });
  assert(r.status === 'ok', r.status);
});

check('atraso com caixa positivo NÃO quebra (só aviso na 2ª)', () => {
  const r = resolveClubBankruptcyRisk({
    cash: 3_000_000,
    roundCost: 300_000,
    overdraftStreak: 0,
    finances: 55,
    loanBalance: 2_000_000,
    delinquencyStreak: 4,
    played: 20,
  });
  assert(r.status !== 'bankrupt', `não deve quebrar: ${r.status}`);
  assert(r.status === 'warn_insolvent', r.status);
});

check('aviso exatamente na 2ª rodada de atraso', () => {
  const r = resolveClubBankruptcyRisk({
    cash: 2_000_000,
    roundCost: 300_000,
    loanBalance: 1_000_000,
    delinquencyStreak: INSOLVENCY_WARN_DELINQUENCY,
    played: 20,
  });
  assert(r.status === 'warn_insolvent', r.status);
  assert(r.reason === 'warn_loan', r.reason);
  assert(/compostos|reaplic/i.test(r.message), r.message);
});

check('1ª atraso ainda sem aviso de insolvência', () => {
  const r = resolveClubBankruptcyRisk({
    cash: 2_000_000,
    roundCost: 300_000,
    loanBalance: 1_000_000,
    delinquencyStreak: 1,
    played: 20,
  });
  assert(r.status === 'ok', r.status);
});

check('1ª rodada no vermelho NÃO quebra (mesmo com atraso)', () => {
  const r = resolveClubBankruptcyRisk({
    cash: -50_000,
    roundCost: 300_000,
    overdraftStreak: 1,
    finances: 35,
    loanBalance: 2_000_000,
    delinquencyStreak: BANKRUPTCY_DELINQUENCY_WITH_RED,
    played: 20,
  });
  assert(r.status !== 'bankrupt', `não deve quebrar na 1ª vermelha: ${r.status}`);
});

check('atraso + vermelho sustentado (4–5r) = bankrupt (espiral)', () => {
  const r = resolveClubBankruptcyRisk({
    cash: -50_000,
    roundCost: 300_000,
    overdraftStreak: BANKRUPTCY_RED_STREAK,
    finances: 35,
    loanBalance: 2_000_000,
    delinquencyStreak: BANKRUPTCY_DELINQUENCY_WITH_RED,
    played: 20,
  });
  assert(r.status === 'bankrupt', r.status);
  assert(r.reason === 'loan_default', r.reason);
});

check('overdraft sustentado + finanças piso = bankrupt', () => {
  const r = resolveClubBankruptcyRisk({
    cash: -500_000,
    roundCost: 300_000,
    overdraftStreak: BANKRUPTCY_OVERDRAFT_STREAK,
    finances: STATUS_MIN,
    played: MANAGER_JOB_HONEYMOON_ROUNDS + 1,
  });
  assert(r.status === 'bankrupt', r.status);
});

check('profundidade de caixa = bankrupt', () => {
  const cost = 400_000;
  const r = resolveClubBankruptcyRisk({
    cash: -(BANKRUPTCY_DEPTH_ROUNDS * cost),
    roundCost: cost,
    overdraftStreak: BANKRUPTCY_DEPTH_STREAK,
    finances: 40,
    played: 20,
  });
  assert(r.status === 'bankrupt', r.status);
  assert(r.reason === 'cash_depth', r.reason);
});

check('composto: 1º atraso aplica taxa 3×', () => {
  assert(loanCompoundApplications(1) === 3, 'apps');
  const { balance, compounded, apps } = compoundDelinquencyOnBalance(1_000_000, 0.01, 1);
  assert(apps === 3, String(apps));
  assert(compounded > 30_000, String(compounded));
  assert(balance > 1_030_000, String(balance));
});

check('composto: streak 3 aplica 5× (dívida salta mais)', () => {
  const a = compoundDelinquencyOnBalance(1_000_000, 0.01, 1);
  const b = compoundDelinquencyOnBalance(1_000_000, 0.01, 3);
  assert(b.apps === 5, String(b.apps));
  assert(b.compounded > a.compounded, `${b.compounded} > ${a.compounded}`);
});

check('aviso OD', () => {
  const r = resolveClubBankruptcyRisk({
    cash: -100_000,
    roundCost: 300_000,
    overdraftStreak: INSOLVENCY_WARN_STREAK,
    finances: 40,
    played: 20,
  });
  assert(r.status === 'warn_insolvent', r.status);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
