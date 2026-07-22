/**
 * Salário em empréstimo — hospedeiro paga 100%.
 * node scripts/loan-salary-split-tests.mjs
 */
import {
  computeLoanSalaryShare,
  stampLoanSalaryShare,
  resolveHostRoundWage,
  resolveOwnerRoundWage,
  estimateLoanOutWageBill,
  previewLoanHostWage,
  loanOutPayrollDelta,
  LOAN_SALARY_SHARE_LEGACY,
} from '../js/engine/loan-salary-split.js';
import {
  estimateWageBill,
  evaluateRosterPayroll,
  chargeRoundCosts,
  resolvePlayerRoundWage,
} from '../js/engine/economy.js';

let passed = 0;
let failed = 0;

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

const player = (wage = 10_000, age = 24) => ({
  name: 'Test Player',
  pos: 'MC',
  age,
  overall: 72,
  wage,
});

check('hospedeiro paga 100% — mesma série', () => {
  assert(computeLoanSalaryShare(player(), { division: 'B' }, { division: 'B' }) === 1);
});

check('hospedeiro paga 100% — queda de divisão', () => {
  assert(computeLoanSalaryShare(player(), { division: 'A' }, { division: 'C' }) === 1);
});

check('hospedeiro paga 100% — jovem subindo série', () => {
  assert(computeLoanSalaryShare(player(10_000, 19), { division: 'C' }, { division: 'B' }) === 1);
});

check('save antigo com share parcial → hospedeiro 100%', () => {
  const p = {
    ...player(),
    onLoan: true,
    loanFrom: 'Owner FC',
    loanSalaryShare: 0.4,
  };
  assert(resolveHostRoundWage(p, 'B', resolvePlayerRoundWage) === 10_000);
  assert(resolveOwnerRoundWage(p, 'B', resolvePlayerRoundWage) === 0);
});

check('stamp persiste share 1 no jogador', () => {
  const p = player();
  assert(stampLoanSalaryShare(p, { division: 'A' }, { division: 'C' }) === 1);
  assert(p.loanSalaryShare === 1);
});

check('folha hospedeiro = salário integral', () => {
  const host = {
    division: 'C',
    roster: [{ ...player(10_000), onLoan: true, loanFrom: 'Owner', loanSalaryShare: 0.4 }],
  };
  assert(estimateWageBill(host, 'C', { softCap: false }) === 10_000);
});

check('cedente não paga salários emprestados fora', () => {
  const clubs = {
    Owner: { division: 'A', roster: [] },
    Host: {
      division: 'C',
      roster: [{ ...player(10_000), onLoan: true, loanFrom: 'Owner', loanSalaryShare: 0.4 }],
    },
  };
  assert(estimateLoanOutWageBill('Owner', clubs, resolvePlayerRoundWage) === 0);
});

check('payroll gate empréstimo usa salário integral', () => {
  const host = { division: 'C', finances: 80, roster: [] };
  const payroll = evaluateRosterPayroll(host, {
    division: 'C',
    extraWage: 10_000,
    rosterDelta: 1,
  });
  assert(payroll.wageAfter === 10_000);
});

check('chargeRoundCosts não debita cedente por emprestados', () => {
  const clubs = {
    Owner: { division: 'A', budget: 500_000, roster: [], finances: 80 },
    Host: {
      division: 'C',
      budget: 500_000,
      roster: [{ ...player(10_000), onLoan: true, loanFrom: 'Owner', loanSalaryShare: 0.6 }],
    },
  };
  const hostBefore = clubs.Host.budget;
  const ownerResult = chargeRoundCosts(clubs.Owner, 'A', { round: 1, clubs, clubName: 'Owner' });
  chargeRoundCosts(clubs.Host, 'C', { round: 1, clubs, clubName: 'Host' });
  assert(ownerResult.loanOutWages?.due === 0, 'cedente sem loan_out');
  assert(clubs.Host.budget < hostBefore, 'hospedeiro pagou folha');
});

check('previewLoanHostWage = salário integral', () => {
  const preview = previewLoanHostWage(
    player(10_000),
    { division: 'A' },
    { division: 'C' },
    resolvePlayerRoundWage,
  );
  assert(preview.hostWage === 10_000);
  assert(preview.ownerWage === 0);
  assert(preview.hostSharePct === 100);
});

check('loanOutPayrollDelta remove salário inteiro do cedente', () => {
  const delta = loanOutPayrollDelta(
    player(10_000),
    { division: 'A' },
    { division: 'C' },
    resolvePlayerRoundWage,
  );
  assert(delta.netRemoveWage === 10_000);
  assert(delta.ownerWage === 0);
});

check('legacy share constant = 1', () => {
  assert(LOAN_SALARY_SHARE_LEGACY === 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
