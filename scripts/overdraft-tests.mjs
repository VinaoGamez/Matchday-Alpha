/**
 * Saldo negativo / cheque especial.
 * node scripts/overdraft-tests.mjs
 */
import {
  getBalance,
  ensureBudget,
  formatBudget,
  canAfford,
  spend,
  chargeRoundCosts,
  serviceOverdraft,
  credit,
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

const clubOf = (budget = 50_000) => {
  const club = {
    name: 'OD FC',
    division: 'D',
    budget,
    finances: 50,
    roster: [
      { name: 'A', pos: 'MC', age: 24, overall: 12, potential: 20, wage: 20_000, starter: true },
      { name: 'B', pos: 'ZA', age: 26, overall: 12, potential: 20, wage: 18_000, starter: true },
      { name: 'C', pos: 'ATA', age: 22, overall: 13, potential: 22, wage: 16_000, starter: true },
    ],
  };
  ensureBudget(club, 'D');
  club.budget = budget;
  return club;
};

check('formatBudget mostra saldo negativo', () => {
  assert(formatBudget(-1_500_000).includes('−'), formatBudget(-1_500_000));
  assert(formatBudget(-1_500_000).includes('1,5'), formatBudget(-1_500_000));
});

check('folha integral pode deixar caixa negativo', () => {
  const club = clubOf(10_000);
  const result = chargeRoundCosts(club, { division: 'D', round: 1 });
  assert(result.paid === result.due, 'débito integral');
  assert(getBalance(club) < 0, `negativo ${getBalance(club)}`);
  assert(result.overdraft > 0, 'overdraft');
  assert(club.wageShortfall === true, 'shortfall flag');
});

check('gasto voluntário bloqueado no vermelho', () => {
  const club = clubOf(-50_000);
  assert(!canAfford(club, 1_000), 'canAfford');
  const blocked = spend(club, 1_000, { reason: 'upgrade:test', label: 'Teste' });
  assert(!blocked.ok && blocked.error === 'insufficient_funds', 'spend bloqueado');
});

check('obrigação allowNegative aprofunda o vermelho', () => {
  const club = clubOf(-10_000);
  const before = getBalance(club);
  const ok = spend(club, 5_000, {
    reason: 'loan_interest',
    label: 'Juros',
    allowNegative: true,
  });
  assert(ok.ok, 'ok');
  assert(getBalance(club) === before - 5_000, 'mais negativo');
});

check('serviceOverdraft cobra juros sobre saldo negativo', () => {
  const club = clubOf(-100_000);
  const before = getBalance(club);
  const result = serviceOverdraft(club, { division: 'D', round: 3 });
  assert(result.ok && !result.skipped, 'cobrou');
  assert(result.fee > 0, `fee ${result.fee}`);
  assert(getBalance(club) === before - result.fee, 'saldo');
  assert(club.overdraftActive === true, 'flag');
  assert(club.overdraftStreak === 1, `streak ${club.overdraftStreak}`);
  assert(result.streak === 1, 'result streak');
  const again = serviceOverdraft(club, { division: 'D', round: 3 });
  assert(again.skipped, 'idempotente');
});

check('overdraftStreak sobe e zera ao sair do vermelho', () => {
  const club = clubOf(-50_000);
  serviceOverdraft(club, { division: 'D', round: 1 });
  serviceOverdraft(club, { division: 'D', round: 2 });
  assert(club.overdraftStreak === 2, `streak ${club.overdraftStreak}`);
  credit(club, 500_000, { reason: 'tv_rights', label: 'TV' });
  const cleared = serviceOverdraft(club, { division: 'D', round: 3 });
  assert(cleared.skipped && cleared.streak === 0, 'reset');
  assert(club.overdraftStreak === 0, 'club streak 0');
  assert(club.overdraftActive === false, 'flag off');
});

check('crédito pode sair do vermelho', () => {
  const club = clubOf(-80_000);
  credit(club, 200_000, { reason: 'tv_rights', label: 'TV' });
  assert(getBalance(club) === 120_000, 'positivo');
  assert(canAfford(club, 50_000), 'volta a poder gastar');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
