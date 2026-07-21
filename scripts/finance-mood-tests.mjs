/**
 * Pressão financeira → Torcida / Ambiente.
 * node scripts/finance-mood-tests.mjs
 */
import {
  resolveFinanceMood,
  snapMoodDelta,
} from '../js/engine/club-status/rules/finance-mood.js';

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

check('saudável sem alívio = 0', () => {
  const r = resolveFinanceMood({});
  assert(r.support === 0 && r.environment === 0, JSON.stringify(r));
  assert(!r.inCrisis, 'crise');
});

check('1º atraso: Torcida e Ambiente caem', () => {
  const r = resolveFinanceMood({ delinquencyStreak: 1 });
  assert(r.inCrisis && r.level === 1, String(r.level));
  assert(r.support === -1, String(r.support));
  assert(r.environment === -1, String(r.environment));
});

check('OD ≥ 3: pena mais forte', () => {
  const r = resolveFinanceMood({ overdraftStreak: 3 });
  assert(r.level === 3, String(r.level));
  assert(r.support <= -1 && r.environment <= -1, JSON.stringify(r));
});

check('atraso + vermelho: combo 30%', () => {
  const solo = resolveFinanceMood({ delinquencyStreak: 2 });
  const both = resolveFinanceMood({ delinquencyStreak: 2, overdraftStreak: 2 });
  assert(both.support <= solo.support, `${both.support} vs ${solo.support}`);
});

check('restrição: Torcida extra negativa', () => {
  const base = resolveFinanceMood({ delinquencyStreak: 1 });
  const rest = resolveFinanceMood({ delinquencyStreak: 1, restricted: true });
  assert(rest.support < base.support, `${rest.support} < ${base.support}`);
});

check('cura: 2 rodadas de alívio ao sair da crise', () => {
  const r1 = resolveFinanceMood({
    wasInCrisis: true,
    reliefRoundsRemaining: 0,
  });
  assert(r1.support === 1 && r1.environment === 1, JSON.stringify(r1));
  assert(r1.reliefRoundsRemaining === 1, String(r1.reliefRoundsRemaining));
  const r2 = resolveFinanceMood({
    wasInCrisis: false,
    reliefRoundsRemaining: 1,
  });
  assert(r2.support === 1, String(r2.support));
  assert(r2.reliefRoundsRemaining === 0, String(r2.reliefRoundsRemaining));
  const r3 = resolveFinanceMood({
    wasInCrisis: false,
    reliefRoundsRemaining: 0,
  });
  assert(r3.support === 0 && r3.environment === 0, JSON.stringify(r3));
});

check('snap: frações leves viram tick ±1', () => {
  assert(snapMoodDelta(-0.25) === -1, 'neg leve');
  assert(snapMoodDelta(-1.3) === -2, 'neg forte');
  assert(snapMoodDelta(0.25) === 1, 'pos leve');
  assert(snapMoodDelta(0) === 0, 'zero');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
