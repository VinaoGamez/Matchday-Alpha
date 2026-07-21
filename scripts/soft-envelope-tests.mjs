/**
 * Phase B — envelope soft de transferências.
 * node scripts/soft-envelope-tests.mjs
 */
import {
  evaluateRosterPayroll,
  softEnvelopeFromPayroll,
  softCashEnvelope,
} from '../js/engine/economy.js';

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

const makeClub = ({ finances = 70, wages = [80_000, 70_000, 60_000] } = {}) => ({
  division: 'A',
  finances,
  budget: 5_000_000,
  roster: wages.map((wage, i) => ({
    name: `P${i}`,
    overall: 75,
    age: 24,
    pos: 'MC',
    wage,
  })),
  sponsors: { installments: 38, master: { value: 2_000_000 }, secondary: [] },
  tvRights: { installments: 19, total: 3_000_000 },
});

check('soft ok permite', () => {
  const club = makeClub({ wages: [40_000, 40_000, 40_000] });
  const payroll = evaluateRosterPayroll(club, { extraWage: 20_000, rosterDelta: 1 });
  const soft = softEnvelopeFromPayroll(payroll);
  assert(soft.allow, 'allow');
  assert(soft.level === 'ok' || soft.level === 'warn', soft.level);
});

check('soft warn permite (zona amarela)', () => {
  // Objeto sintético: wageAfter entre 85% e 100% do limite
  const soft = softEnvelopeFromPayroll({
    ok: true,
    tone: 'warn',
    reason: null,
    wageBefore: 150_000,
    wageAfter: 170_000,
    revenue: 200_000,
    limit: 200_000,
    pctBefore: 75,
    pctAfter: 85,
    finances: 60,
  });
  assert(soft.allow, 'warn ainda permite');
  assert(soft.level === 'warn', soft.level);
  assert(/ainda permitida/i.test(soft.message), soft.message);
});

check('evaluateRosterPayroll marca warn na faixa 85–100%', () => {
  // Folha atual baixa; receita fallback A = 180k; factor 1.15 (fin≥70) → limit ~207k
  // 85% do limit ≈ 176k — wages + extra devem cair nessa faixa
  const club = makeClub({
    finances: 80,
    wages: [50_000, 50_000, 50_000], // 150k
  });
  const payroll = evaluateRosterPayroll(club, { extraWage: 40_000, rosterDelta: 1 }); // 190k
  assert(payroll.ok, `ok ${payroll.wageAfter}/${payroll.limit}`);
  assert(payroll.tone === 'warn', `tone=${payroll.tone} after=${payroll.wageAfter} limit=${payroll.limit}`);
});

check('soft block não permite (espelha gate duro)', () => {
  const club = makeClub({ finances: 30, wages: [250_000, 240_000, 230_000, 220_000] });
  const payroll = evaluateRosterPayroll(club, { extraWage: 500_000, rosterDelta: 1 });
  assert(!payroll.ok, 'deve estourar folha');
  const soft = softEnvelopeFromPayroll(payroll);
  assert(!soft.allow, 'não permite');
  assert(soft.level === 'block', soft.level);
});

check('soft cash: taxa no vermelho = warn, permite', () => {
  const soft = softCashEnvelope({ balance: 100_000, fee: 250_000, roundCost: 200_000 });
  assert(soft.allow, 'permite');
  assert(soft.level === 'warn', soft.level);
  assert(/vermelho|cheque/i.test(soft.message), soft.message);
});

check('soft cash: runway curta = warn', () => {
  const soft = softCashEnvelope({ balance: 400_000, fee: 100_000, roundCost: 250_000 });
  assert(soft.allow, 'permite');
  assert(soft.level === 'warn', soft.level);
});

check('soft cash: folga = none', () => {
  const soft = softCashEnvelope({ balance: 5_000_000, fee: 100_000, roundCost: 200_000 });
  assert(soft.level === 'none', soft.level);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
