/**
 * Fase 1 (oportunidade) vs Fase 2 (oferta/contra) — D não “compra A” no geral.
 * node scripts/transfer-division-phase-tests.mjs
 */
import {
  evaluateSellerDivisionFit,
  isSellerStar,
  SELL_DOWN_ACCEPT,
} from '../js/engine/transfer-division-fit.js';
import { evaluateCounterOffer } from '../js/engine/transfer-counter-offer.js';
import { createTransfersEngine } from '../js/engine/transfers.js';
import { ensurePlayerId } from '../js/engine/player-identity.js';
import { ensureMarketFields } from '../js/engine/player-value.js';

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

check('doc: SELL_DOWN A→D base é ~2.5%', () => {
  assert(SELL_DOWN_ACCEPT[3] === 0.025, String(SELL_DOWN_ACCEPT[3]));
});

check('Fase 1 Monte Carlo: D←A normal listado abre em <12% dos casos', () => {
  const random = seeded(2026);
  let open = 0;
  const n = 5000;
  for (let i = 0; i < n; i += 1) {
    const fit = evaluateSellerDivisionFit({
      player: { overall: 50 + (i % 6), age: 25, listed: true },
      buyerDivision: 'D',
      sellerDivision: 'A',
      listed: true,
      rosterAvgOvr: 56,
      sellerPower: 58,
      unit: random,
    });
    if (fit.ok) open += 1;
  }
  const pct = (open / n) * 100;
  console.log(`  · Janela D←A (normal listado): ${pct.toFixed(2)}% (n=${n})`);
  assert(pct < 12, `esperado raro <12%, got ${pct}`);
  assert(pct > 0.5, `ainda deve existir chance residual, got ${pct}`);
});

check('Fase 1: estrela A→D nunca abre', () => {
  const random = seeded(3);
  let open = 0;
  for (let i = 0; i < 2000; i += 1) {
    const fit = evaluateSellerDivisionFit({
      player: { overall: 68, age: 27, listed: true },
      buyerDivision: 'D',
      sellerDivision: 'A',
      listed: true,
      rosterAvgOvr: 56,
      sellerPower: 58,
      unit: random,
    });
    if (fit.ok) open += 1;
  }
  assert(isSellerStar({ overall: 68 }, { power: 58, rosterAvgOvr: 56 }), 'é estrela');
  assert(open === 0, `estrela abriu ${open} vezes`);
});

check('Fase 1 sem unit: drop≥2 fecha (conservador)', () => {
  const fit = evaluateSellerDivisionFit({
    player: { overall: 50, age: 25, listed: true },
    buyerDivision: 'D',
    sellerDivision: 'A',
    listed: true,
    rosterAvgOvr: 56,
    sellerPower: 58,
  });
  assert(!fit.ok && fit.phase === 'no_window', fit.phase);
});

check('Fase 2 só após Fase 1: contra exige janela; sem janela = division_gap no motor', () => {
  const mk = (ovr, id) =>
    ensureMarketFields(
      ensurePlayerId(
        {
          name: id,
          pos: 'MC',
          age: 25,
          overall: ovr,
          potential: ovr + 4,
          wage: 1200,
          listed: true,
          askingPrice: 700_000,
          playerId: id,
        },
        { seed: 1, club: 'A', index: 1 },
      ),
      { division: 'A', season: 2030 },
    );
  const filler = (p, n, ovr) =>
    Array.from({ length: n }, (_, i) => mk(ovr, `${p}-${i}`));

  // Procura um normal A cuja Fase 1 FALHE e outro que PASSE (hash do motor).
  let closedId = null;
  let openId = null;
  for (let ovr = 48; ovr <= 54 && (!closedId || !openId); ovr += 1) {
    for (let n = 0; n < 40 && (!closedId || !openId); n += 1) {
      const id = `probe-${ovr}-${n}`;
      const target = mk(ovr, id);
      const clubs = {
        'Meu D': {
          name: 'Meu D',
          division: 'D',
          power: 15,
          budget: 30_000_000,
          finances: 80,
          roster: filler('d', 20, 14),
        },
        'Clube A': {
          name: 'Clube A',
          division: 'A',
          power: 58,
          budget: 40_000_000,
          finances: 85,
          roster: [target, ...filler('a', 21, 55)],
        },
      };
      const engine = createTransfersEngine({
        getClubs: () => clubs,
        getUserClub: () => 'Meu D',
        getCareerSeason: () => 2030,
        getCareerDate: () => new Date(2030, 0, 20, 12),
        spend: () => ({ ok: true }),
        credit: () => ({ ok: true }),
        canAfford: () => true,
        isMarketOpen: () => true,
      });
      const fit = engine.getBuyDivisionFit(id);
      if (!fit.ok && !closedId) closedId = { id, engine, clubs, target };
      if (fit.ok && !openId) openId = { id, engine, clubs, target, fit };
    }
  }

  assert(closedId, 'precisa achar caso sem janela');
  const closedBuy = closedId.engine.buyPlayer(closedId.id, 5_000_000);
  assert(
    !closedBuy.ok && closedBuy.reason === 'division_gap',
    `sem Fase 1 deve ser division_gap, got ${closedBuy.reason}`,
  );
  assert(closedBuy.reason !== 'counter_offer', 'sem janela não há contra');

  assert(openId, 'precisa achar caso raro COM janela (senão afrouxar seed loop)');
  console.log(`  · Janela aberta em ${openId.id} chance≈${openId.fit.chance?.toFixed?.(3)}`);
  const low = openId.engine.buyPlayer(openId.id, 100_000);
  assert(
    low.reason === 'counter_offer' || low.reason === 'rejected' || low.ok,
    `com Fase 1, oferta segue Fase 2 (got ${low.reason})`,
  );
  if (low.reason === 'counter_offer') {
    assert(low.counterFee >= low.floor, 'contra ≥ piso');
  }
});

check('contra-proposta pura (Fase 2) ainda ~50% quando já há piso/oferta', () => {
  const random = seeded(11);
  let c = 0;
  const n = 2000;
  for (let i = 0; i < n; i += 1) {
    if (
      evaluateCounterOffer({
        offerFee: 800_000,
        floor: 1_000_000,
        ask: 1_100_000,
        value: 1_050_000,
        buyerDivision: 'D',
        sellerDivision: 'A',
        player: { overall: 50, age: 25 },
        power: 58,
        rosterAvgOvr: 56,
        random,
      }).counter
    ) {
      c += 1;
    }
  }
  const pct = (c / n) * 100;
  console.log(`  · Contra (dado que Fase 1 abriu): ${pct.toFixed(1)}%`);
  assert(pct >= 25 && pct <= 75, String(pct));
});

console.log(`\ntransfer-division-phase: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
