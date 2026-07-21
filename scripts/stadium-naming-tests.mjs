/**
 * Naming do estádio — receita/rodada e penalidade.
 * node scripts/stadium-naming-tests.mjs
 */
import { getBankLoan } from '../js/engine/bank-loan.js';
import { ensureStadiumSectors } from '../js/engine/stadium-sectors.js';
import {
  generateNamingOffers,
  assignNamingContract,
  creditNamingRound,
  namingPenaltyMultiplier,
  estimateNamingRound,
} from '../js/engine/stadium-naming.js';
import { creditNamingInstallment } from '../js/engine/economy.js';

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

const eligibleClub = () => {
  const club = {
    budget: 5_000_000,
    support: 72,
    environment: 70,
    division: 'A',
    sponsors: { master: { name: 'Nubanco' }, secondaries: [{ name: 'iFome' }, { name: 'Googol' }, { name: 'Petrobraz' }] },
  };
  ensureStadiumSectors(club, 'A', { newGame: true });
  club.stadiumStructure = 2;
  club.stadiumInvestments = 2;
  club.stadiumSectors.popular = 2;
  ensureStadiumSectors(club, 'A');
  return club;
};

check('ofertas: 3 nomes, sem conflito com master', () => {
  const club = eligibleClub();
  const offers = generateNamingOffers(club, 'A', {
    pool: ['Nubanco', 'Tekno Cursos', 'Magazine Luizão', 'BetRegional', 'PicPaga', 'Metagol'],
    random: () => 0.3,
  });
  assert(offers.length >= 2, String(offers.length));
  assert(!offers.some(o => o.sponsor === 'Nubanco'), 'master');
  assert(offers.every(o => o.perRound > 0), 'perRound');
});

check('contrato persiste base/rodada', () => {
  const club = eligibleClub();
  const r = assignNamingContract(club, { sponsor: 'Tekno Cursos', perRound: 22000 }, { season: 1, division: 'A' });
  assert(r.ok, String(r.error));
  assert(club.namingRights.sponsor === 'Tekno Cursos', club.namingRights.sponsor);
  assert(club.namingRights.basePerRound === 22000, String(club.namingRights.basePerRound));
});

check('penalidade: vermelho 1r = 70%', () => {
  const club = eligibleClub();
  club.overdraftStreak = 1;
  assert(namingPenaltyMultiplier(club) === 0.7, String(namingPenaltyMultiplier(club)));
  assert(estimateNamingRound({ ...club, namingRights: { basePerRound: 20000, sponsor: 'X' } }, 'A') === 14000, '');
});

check('penalidade: restrição = 0%', () => {
  const club = eligibleClub();
  club.financialRestriction = { active: true };
  assert(namingPenaltyMultiplier(club) === 0, '0');
});

check('crédito idempotente por rodada', () => {
  const club = eligibleClub();
  assignNamingContract(club, { sponsor: 'Tekno Cursos', perRound: 10000 }, { season: 1, division: 'A' });
  const a = creditNamingInstallment(club, { round: 5, division: 'A', season: 1 });
  const b = creditNamingInstallment(club, { round: 5, division: 'A', season: 1 });
  assert(a.amount === 10000, String(a.amount));
  assert(b.amount === 0 && b.skipped, 'dup');
  assert(club.budget === 5_000_000 + 10000, String(club.budget));
});

check('Série C suspende (0)', () => {
  const club = eligibleClub();
  assignNamingContract(club, { sponsor: 'Tekno Cursos', perRound: 10000 }, { season: 1, division: 'A' });
  const r = creditNamingRound(club, { round: 2, division: 'C', season: 1 });
  assert(r.amount === 0, String(r.amount));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
