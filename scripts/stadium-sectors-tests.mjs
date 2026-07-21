/**
 * Estádio por setores v2.
 * node scripts/stadium-sectors-tests.mjs
 */
import {
  ensureStadiumSectors,
  computeSectorBreakdown,
  sectorSeats,
  effectiveSectorMax,
  canOfferStadiumNaming,
  migrateLegacyStadium,
  STADIUM_SECTOR_MODEL,
} from '../js/engine/stadium-sectors.js';

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

check('novo jogo: estrutura 0, popular 1, capacidade pequena A', () => {
  const club = { budget: 5_000_000, environment: 70, support: 70, ticketPrices: { national: 22, cups: 36 } };
  ensureStadiumSectors(club, 'A', { newGame: true });
  assert(club.stadiumStructure === 0, String(club.stadiumStructure));
  assert(club.stadiumSectors.popular === 1, JSON.stringify(club.stadiumSectors));
  assert(club.stadiumCapacity === 8000, String(club.stadiumCapacity));
  assert(club.stadiumInvestments === 0, String(club.stadiumInvestments));
});

check('arquibancada bloqueada sem estrutura 2', () => {
  const club = { stadiumStructure: 1, stadiumSectors: { popular: 1, stands: 0 }, stadiumSectorModel: STADIUM_SECTOR_MODEL };
  assert(effectiveSectorMax(club, 'A', 'stands') === 0, 'stands cap');
});

check('estrutura 2 libera arquibancada', () => {
  const club = { stadiumStructure: 2, stadiumSectors: { popular: 1, stands: 0 }, stadiumSectorModel: STADIUM_SECTOR_MODEL };
  assert(effectiveSectorMax(club, 'A', 'stands') === 3, String(effectiveSectorMax(club, 'A', 'stands')));
});

check('Série D: sem cadeiras', () => {
  const club = { stadiumStructure: 5, stadiumSectors: { popular: 2, stands: 1 }, stadiumSectorModel: STADIUM_SECTOR_MODEL };
  assert(effectiveSectorMax(club, 'D', 'seats') === 0, 'seats D');
  assert(effectiveSectorMax(club, 'D', 'stands') === 3, 'stands D');
});

check('migração legado capacityLevel → setores', () => {
  const club = {
    stadiumCapacityLevel: 4,
    stadiumStructure: 3,
    pitchLevel: 3,
    stadiumCapacity: 50000,
  };
  migrateLegacyStadium(club, 'A');
  assert(club.stadiumSectorModel === STADIUM_SECTOR_MODEL, 'model');
  assert(club.stadiumSectors.popular >= 1, JSON.stringify(club.stadiumSectors));
  assert(club.stadiumCapacity > 0, String(club.stadiumCapacity));
});

check('naming: exige A/B, estrutura 2+, 2 investimentos', () => {
  const club = { stadiumStructure: 2, stadiumInvestments: 2, stadiumSectorModel: STADIUM_SECTOR_MODEL };
  assert(canOfferStadiumNaming(club, 'A'), 'A ok');
  assert(!canOfferStadiumNaming(club, 'C'), 'C no');
  club.stadiumInvestments = 1;
  assert(!canOfferStadiumNaming(club, 'A'), 'invest low');
});

check('composição: soma setores = capacidade', () => {
  const club = {
    stadiumStructure: 3,
    stadiumSectors: { popular: 2, stands: 1, seats: 0, boxes: 0, vip: 0 },
    stadiumSectorModel: STADIUM_SECTOR_MODEL,
  };
  ensureStadiumSectors(club, 'A');
  const { total, rows } = computeSectorBreakdown(club, 'A');
  const sum = rows.reduce((s, r) => s + r.seats, 0);
  assert(total === club.stadiumCapacity, `${total} vs ${club.stadiumCapacity}`);
  assert(sum === total, `${sum} vs ${total}`);
  assert(sectorSeats('popular', 2, 'A') > sectorSeats('popular', 1, 'A'), 'popular grow');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
