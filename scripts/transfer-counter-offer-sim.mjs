/**
 * Contra-proposta (Fase 2) — assume janela já aberta.
 * Oportunidade D←A: ver transfer-division-phase-tests.mjs
 * node scripts/transfer-counter-offer-sim.mjs
 */
import { isSellerStar } from '../js/engine/transfer-division-fit.js';
import { evaluateCounterOffer } from '../js/engine/transfer-counter-offer.js';

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
const seeded = seed => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

check('estrela vs normal', () => {
  assert(isSellerStar({ overall: 66 }, { power: 58, rosterAvgOvr: 56 }), 'estrela');
  assert(!isSellerStar({ overall: 52 }, { power: 58, rosterAvgOvr: 56 }), 'normal');
});

check('Monte Carlo contra D→A oferta 80% piso', () => {
  const random = seeded(99);
  let counters = 0;
  const n = 2000;
  for (let i = 0; i < n; i += 1) {
    const r = evaluateCounterOffer({
      offerFee: 800_000,
      floor: 1_000_000,
      ask: 1_100_000,
      value: 1_050_000,
      buyerDivision: 'D',
      sellerDivision: 'A',
      player: { overall: 48 + (i % 8), age: 25 },
      power: 58,
      rosterAvgOvr: 56,
      random,
    });
    if (r.counter) {
      counters += 1;
      assert(r.fee >= 1_000_000, 'contra ≥ piso');
    }
  }
  const pct = (counters / n) * 100;
  console.log(`  · Contra Fase 2: ${pct.toFixed(1)}%`);
  assert(pct >= 25 && pct <= 75, String(pct));
});

check('estrela recebe menos contra que normal', () => {
  const run = (ovr, seed) => {
    const random = seeded(seed);
    let c = 0;
    for (let i = 0; i < 1500; i += 1) {
      if (
        evaluateCounterOffer({
          offerFee: 900_000,
          floor: 1_200_000,
          ask: 1_400_000,
          value: 1_300_000,
          buyerDivision: 'C',
          sellerDivision: 'A',
          player: { overall: ovr, age: 26 },
          power: 58,
          rosterAvgOvr: 55,
          random,
        }).counter
      ) {
        c += 1;
      }
    }
    return c / 1500;
  };
  const normalPct = run(50, 1);
  const starPct = run(68, 1);
  console.log(
    `  · Contra C→A: normal ${(normalPct * 100).toFixed(1)}% · estrela ${(starPct * 100).toFixed(1)}%`,
  );
  assert(normalPct > starPct * 1.25, 'normal contra mais');
});

console.log(`\ntransfer-counter-sim: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
