/**
 * Fit de divisão compra/venda + copy de recusa.
 * node scripts/transfer-division-fit-tests.mjs
 */
import {
  buyerDivisionGap,
  evaluateSellerDivisionFit,
  evaluateBuyerOfferDivisionFit,
  sellerAcceptRatioDeltaForDivision,
} from '../js/engine/transfer-division-fit.js';
import {
  formatSellerRejectLetter,
  formatUserRejectOfferLetter,
  formatOfferExpiredLetter,
  formatIncomingOfferLetter,
} from '../js/engine/transfer-offer-copy.js';
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
  } catch (error) {
    failed += 1;
    console.error(`✗ ${label}`);
    console.error(`  ${error.message}`);
  }
};

const assert = (cond, message) => {
  if (!cond) throw new Error(message || 'assertion failed');
};

const mkPlayer = (ovr, overrides = {}) =>
  ensureMarketFields(
    ensurePlayerId(
      {
        name: `J${ovr}`,
        pos: 'ATA',
        age: 26,
        overall: ovr,
        potential: ovr + 4,
        wage: 4000,
        listed: false,
        ...overrides,
      },
      { seed: ovr, club: 'T', index: ovr },
    ),
    { division: 'A', season: 2030 },
  );

check('gap A compra D = +3; D compra A = -3', () => {
  assert(buyerDivisionGap('A', 'D') === 3, 'A→D');
  assert(buyerDivisionGap('D', 'A') === -3, 'D→A');
  assert(buyerDivisionGap('C', 'C') === 0, 'C→C');
});

check('vendedor A bloqueia estrela para comprador D (não listado)', () => {
  const fit = evaluateSellerDivisionFit({
    player: mkPlayer(68),
    buyerDivision: 'D',
    sellerDivision: 'A',
    listed: false,
    rosterAvgOvr: 56,
    sellerPower: 58,
  });
  assert(!fit.ok && fit.reason === 'division_gap', String(fit.reason));
});

check('mesma série libera venda', () => {
  const fit = evaluateSellerDivisionFit({
    player: mkPlayer(34),
    buyerDivision: 'C',
    sellerDivision: 'C',
    listed: false,
  });
  assert(fit.ok, fit.reason);
});

check('clube A raramente oferta em reserva D não listada', () => {
  const fit = evaluateBuyerOfferDivisionFit({
    player: mkPlayer(14, { age: 28 }),
    buyerDivision: 'A',
    sellerDivision: 'D',
    listed: false,
    rosterAvgOvr: 16,
  });
  assert(!fit.ok, 'A não deveria ofertar em reserva D');
});

check('clube A pode ofertar em destaque listado da D', () => {
  const fit = evaluateBuyerOfferDivisionFit({
    player: mkPlayer(22, { listed: true, age: 22 }),
    buyerDivision: 'A',
    sellerDivision: 'D',
    listed: true,
    rosterAvgOvr: 15,
  });
  assert(fit.ok, `listado destaque: ${fit.chance}`);
});

check('piso sobe quando comprador é de série menor', () => {
  assert(sellerAcceptRatioDeltaForDivision('D', 'A') === 0.12, 'D←A');
  assert(sellerAcceptRatioDeltaForDivision('A', 'A') === 0, 'A←A');
  assert(sellerAcceptRatioDeltaForDivision('B', 'A') === 0.04, 'B←A');
});

check('copy de recusa tem tom de clube', () => {
  const letter = formatSellerRejectLetter({
    clubName: 'Palmeiras',
    playerName: 'Silva',
    reasons: ['division_gap', 'star'],
  });
  assert(letter.includes('Após avaliar'), letter);
  assert(letter.includes('Palmeiras'), letter);
  assert(letter.includes('séries') || letter.includes('série'), letter);
});

check('copy recusa do usuário e expiração', () => {
  const u = formatUserRejectOfferLetter({
    fromClub: 'Rival',
    playerName: 'João',
    offerType: 'buy',
  });
  assert(u.includes('declinou'), u);
  const e = formatOfferExpiredLetter({ fromClub: 'Rival', playerName: 'João' });
  assert(e.includes('caducou') || e.includes('encerrou'), e);
  const i = formatIncomingOfferLetter({
    fromClub: 'Rival',
    playerName: 'João',
    feeLabel: 'R$ 1 mi',
    offerType: 'buy',
  });
  assert(i.includes('Rival') && i.includes('R$ 1 mi'), i);
});

check('motor: estrela A→D sempre division_gap (mesmo listada)', () => {
  const star = mkPlayer(68, {
    playerId: 'star-a',
    name: 'Estrela',
    listed: true,
    askingPrice: 2_000_000,
    wage: 2000,
  });
  const filler = (prefix, n, ovr) =>
    Array.from({ length: n }, (_, i) =>
      mkPlayer(ovr, {
        playerId: `${prefix}-${i}`,
        name: `${prefix}${i}`,
        wage: 800,
        listed: false,
      }),
    );
  const clubs = {
    'Meu D': {
      name: 'Meu D',
      division: 'D',
      power: 15,
      budget: 20_000_000,
      finances: 80,
      roster: filler('d', 20, 14),
    },
    'Clube A': {
      name: 'Clube A',
      division: 'A',
      power: 58,
      budget: 50_000_000,
      finances: 85,
      roster: [star, ...filler('a', 21, 55)],
    },
  };
  const engine = createTransfersEngine({
    getClubs: () => clubs,
    getUserClub: () => 'Meu D',
    getCareerSeason: () => 2030,
    getCareerDate: () => new Date(2030, 0, 20, 12),
    spend: (club, amount) => {
      club.budget -= amount;
      return { ok: true };
    },
    credit: () => ({ ok: true }),
    canAfford: (club, amount) => (club.budget || 0) >= amount,
    isMarketOpen: () => true,
  });
  const fit = engine.getBuyDivisionFit(star.playerId);
  assert(!fit.ok, 'Fase 1 fechada para estrela');
  const result = engine.buyPlayer(star.playerId, 5_000_000);
  assert(result.reason === 'division_gap', `got ${result.reason}`);
});

check('motor: mesma série C compra C listado', () => {
  const target = mkPlayer(34, {
    playerId: 'c-buy',
    name: 'Alvo C',
    listed: true,
    askingPrice: 400_000,
    wage: 3000,
  });
  const filler = (prefix, n, ovr) =>
    Array.from({ length: n }, (_, i) =>
      mkPlayer(ovr, { playerId: `${prefix}-${i}`, name: `${prefix}${i}`, wage: 2500 }),
    );
  const clubs = {
    'Meu C': {
      name: 'Meu C',
      division: 'C',
      power: 34,
      budget: 15_000_000,
      finances: 75,
      roster: filler('me', 20, 32),
    },
    Rival: {
      name: 'Rival',
      division: 'C',
      power: 33,
      budget: 12_000_000,
      finances: 70,
      roster: [target, ...filler('riv', 21, 32)],
    },
  };
  const engine = createTransfersEngine({
    getClubs: () => clubs,
    getUserClub: () => 'Meu C',
    getCareerSeason: () => 2030,
    getCareerDate: () => new Date(2030, 0, 20, 12),
    spend: (club, amount) => {
      club.budget -= amount;
      return { ok: true };
    },
    credit: (club, amount) => {
      club.budget = (club.budget || 0) + amount;
      return { ok: true };
    },
    canAfford: (club, amount) => (club.budget || 0) >= amount,
    isMarketOpen: () => true,
  });
  const result = engine.buyPlayer(target.playerId, 400_000);
  assert(result.ok, result.reason || JSON.stringify(result.reasons));
});

console.log(`\ntransfer-division-fit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
