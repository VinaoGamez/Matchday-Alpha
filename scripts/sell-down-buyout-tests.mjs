/**
 * Atalho caro por queda de série (−1/−2/−3).
 * node scripts/sell-down-buyout-tests.mjs
 */
import {
  estimateSellDownBuyout,
  resolveSellDownBuyout,
  SELL_DOWN_BUYOUT,
} from '../js/engine/transfer-division-fit.js';

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

const player = { overall: 70, age: 26, marketValue: 1_000_000, contractUntil: 2033 };

check('mesma série / comprador acima: inelegível', () => {
  const r = estimateSellDownBuyout({
    player,
    fee: 5_000_000,
    value: 1_000_000,
    buyerDivision: 'A',
    sellerDivision: 'D',
  });
  assert(!r.eligible, 'não elegível');
});

check('D←A: abaixo do mín. (4,5×) não tenta', () => {
  const r = estimateSellDownBuyout({
    player,
    fee: 4_000_000,
    value: 1_000_000,
    buyerDivision: 'D',
    sellerDivision: 'A',
    sellerPower: 70,
    rosterAvgOvr: 68,
  });
  assert(r.eligible && !r.attemptable, 'abaixo');
  assert(r.minFee === Math.round(1_000_000 * SELL_DOWN_BUYOUT[3].minMult), String(r.minFee));
  assert(r.chance === 0, 'chance 0');
  assert(r.maxChance === SELL_DOWN_BUYOUT[3].cap, String(r.maxChance));
});

check('D←A: no mínimo chance baixa; no 2×mín chega ao teto ~5%', () => {
  const atMin = estimateSellDownBuyout({
    player,
    fee: 4_500_000,
    value: 1_000_000,
    buyerDivision: 'D',
    sellerDivision: 'A',
    sellerPower: 70,
    rosterAvgOvr: 68,
  });
  assert(atMin.attemptable, 'tentável');
  assert(atMin.chance > 0 && atMin.chance < atMin.maxChance, String(atMin.chance));
  const atCap = estimateSellDownBuyout({
    player,
    fee: 9_000_000,
    value: 1_000_000,
    buyerDivision: 'D',
    sellerDivision: 'A',
    sellerPower: 70,
    rosterAvgOvr: 68,
  });
  assert(Math.abs(atCap.chance - atCap.maxChance) < 1e-9, String(atCap.chance));
  assert(atCap.maxChance === 0.05, String(atCap.maxChance));
});

check('B←A e D←C compartilham drop −1', () => {
  const role = { ...player, overall: 50 }; // reserva nos dois contextos
  const a = estimateSellDownBuyout({
    player: role,
    fee: 3_000_000,
    value: 1_000_000,
    buyerDivision: 'B',
    sellerDivision: 'A',
    sellerPower: 70,
    rosterAvgOvr: 68,
  });
  const b = estimateSellDownBuyout({
    player: role,
    fee: 3_000_000,
    value: 1_000_000,
    buyerDivision: 'D',
    sellerDivision: 'C',
    sellerPower: 55,
    rosterAvgOvr: 52,
  });
  assert(a.drop === 1 && b.drop === 1, 'drop');
  assert(!a.star && !b.star, `star a=${a.star} b=${b.star}`);
  assert(a.minMult === b.minMult && a.maxChance === b.maxChance, 'mesma tabela');
});

check('C←A drop −2: teto 11%', () => {
  const r = estimateSellDownBuyout({
    player,
    fee: 10_000_000,
    value: 1_000_000,
    buyerDivision: 'C',
    sellerDivision: 'A',
    sellerPower: 70,
    rosterAvgOvr: 68,
  });
  assert(r.drop === 2, String(r.drop));
  assert(r.maxChance === 0.11, String(r.maxChance));
});

check('estrela D←A: teto 0,7% (<1%)', () => {
  const star = { ...player, overall: 82 };
  const r = estimateSellDownBuyout({
    player: star,
    fee: 20_000_000,
    value: 1_000_000,
    buyerDivision: 'D',
    sellerDivision: 'A',
    sellerPower: 70,
    rosterAvgOvr: 68,
  });
  assert(r.star, 'star');
  assert(r.maxChance === 0.007, String(r.maxChance));
  assert(r.maxChance < 0.01, 'abaixo de 1%');
});

check('estrela −1/−2 tetos reduzidos', () => {
  const star = { ...player, overall: 82 };
  const d1 = estimateSellDownBuyout({
    player: star,
    fee: 10_000_000,
    value: 1_000_000,
    buyerDivision: 'B',
    sellerDivision: 'A',
    sellerPower: 70,
    rosterAvgOvr: 68,
  });
  const d2 = estimateSellDownBuyout({
    player: star,
    fee: 10_000_000,
    value: 1_000_000,
    buyerDivision: 'C',
    sellerDivision: 'A',
    sellerPower: 70,
    rosterAvgOvr: 68,
  });
  assert(d1.star && d1.maxChance === 0.06, String(d1.maxChance));
  assert(d2.star && d2.maxChance === 0.02, String(d2.maxChance));
});

check('veterano ≥32: teto ×1,4 e mín. −0,3×', () => {
  const vet = { ...player, age: 33, overall: 72 };
  const r = estimateSellDownBuyout({
    player: vet,
    fee: 1,
    value: 1_000_000,
    buyerDivision: 'D',
    sellerDivision: 'A',
    sellerPower: 70,
    rosterAvgOvr: 68,
  });
  assert(r.minMult === 4.2, String(r.minMult)); // 4.5 - 0.3
  assert(Math.abs(r.maxChance - 0.05 * 1.4) < 1e-9, String(r.maxChance));
});

check('resolve: unit baixo aceita; alto recusa', () => {
  const base = {
    player,
    fee: 9_000_000,
    value: 1_000_000,
    buyerDivision: 'D',
    sellerDivision: 'A',
    sellerPower: 70,
    rosterAvgOvr: 68,
  };
  const yes = resolveSellDownBuyout({ ...base, unit: () => 0.001 });
  const no = resolveSellDownBuyout({ ...base, unit: () => 0.99 });
  assert(yes.accept, 'aceita');
  assert(!no.accept && no.reason === 'buyout_rejected', no.reason);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
