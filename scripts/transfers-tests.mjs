import { generatePlayerId, ensurePlayerId } from '../js/engine/player-identity.js';
import { estimatePlayerValue, ensureMarketFields } from '../js/engine/player-value.js';
import { createTransfersEngine } from '../js/engine/transfers.js';
import { collectWorldRosters, applyWorldRosters, stampWorldPlayers } from '../js/engine/world-rosters.js';
import { playerKey } from '../js/engine/player-match-stats.js';

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

const makePlayer = (overrides = {}) =>
  ensureMarketFields(
    ensurePlayerId(
      {
        name: 'Teste Silva',
        pos: 'ATA',
        age: 24,
        overall: 72,
        potential: 80,
        fatigue: 100,
        ...overrides,
      },
      { seed: 1, club: 'Clube A', index: 1 },
    ),
    { division: 'C', season: 2030 },
  );

check('playerId stable', () => {
  const a = generatePlayerId({ seed: 42, club: 'X', index: 3 });
  const b = generatePlayerId({ seed: 42, club: 'X', index: 3 });
  assert(a === b, 'deterministic');
  assert(a.startsWith('p-'), 'prefix');
});

check('playerKey prefers playerId', () => {
  const p = makePlayer({ playerId: 'p-abc' });
  assert(playerKey(p) === 'p-abc', playerKey(p));
});

check('valuation scales with overall', () => {
  const low = estimatePlayerValue({ overall: 60, age: 28, potential: 60 }, 'C');
  const high = estimatePlayerValue({ overall: 80, age: 28, potential: 80 }, 'C');
  assert(high > low, `${high} > ${low}`);
});

check('buy transfer moves roster and spends', () => {
  const sellerPlayer = makePlayer({ name: 'Atacante Alvo', overall: 74, potential: 78 });
  const clubs = {
    'Meu Clube': {
      name: 'Meu Clube',
      division: 'C',
      budget: 20_000_000,
      budgetLedger: [],
      roster: Array.from({ length: 18 }, (_, i) => makePlayer({ name: `Meu ${i}`, playerId: `p-me-${i}` })),
    },
    'Rival FC': {
      name: 'Rival FC',
      division: 'C',
      budget: 1_000_000,
      budgetLedger: [],
      roster: [
        sellerPlayer,
        ...Array.from({ length: 18 }, (_, i) =>
          makePlayer({ name: `Rival ${i}`, playerId: `p-riv-${i}`, overall: 65 }),
        ),
      ],
    },
  };
  const engine = createTransfersEngine({
    getClubs: () => clubs,
    getUserClub: () => 'Meu Clube',
    getCareerSeason: () => 2030,
    spend: (club, amount) => {
      club.budget -= amount;
      return { ok: true, balance: club.budget };
    },
    credit: (club, amount) => {
      club.budget = (club.budget || 0) + amount;
      return { ok: true, balance: club.budget };
    },
    canAfford: (club, amount) => (club.budget || 0) >= amount,
    isMarketOpen: () => true,
  });
  const beforeBuyer = clubs['Meu Clube'].roster.length;
  const beforeSeller = clubs['Rival FC'].roster.length;
  const result = engine.buyPlayer(sellerPlayer.playerId);
  assert(result.ok, result.reason || 'buy ok');
  assert(clubs['Meu Clube'].roster.length === beforeBuyer + 1, 'buyer +1');
  assert(clubs['Rival FC'].roster.length === beforeSeller - 1, 'seller -1');
  assert(clubs['Meu Clube'].roster.some(p => p.playerId === sellerPlayer.playerId), 'moved');
});

check('world roster roundtrip', () => {
  const clubs = {
    Alpha: {
      division: 'B',
      roster: Array.from({ length: 18 }, (_, i) =>
        makePlayer({ name: `Alpha ${i}`, playerId: `p-a${i}` }),
      ),
    },
  };
  stampWorldPlayers(clubs, { seed: 9, season: 2030 });
  const snap = collectWorldRosters(clubs);
  assert(!snap.Alpha[0].workload, 'slim: no workload');
  assert(!snap.Alpha[0].injuryHistory, 'slim: no injuryHistory');
  const other = {
    Alpha: { division: 'B', roster: [] },
  };
  applyWorldRosters(other, snap, { seed: 9, season: 2030 });
  assert(other.Alpha.roster.length === 18, `restored=${other.Alpha.roster.length}`);
  assert(other.Alpha.roster[0].playerId === 'p-a0', 'id kept');
});

check('collectWorldRosters can skip user club', () => {
  const clubs = {
    User: { division: 'C', roster: Array.from({ length: 18 }, (_, i) => makePlayer({ playerId: `u${i}` })) },
    Rival: { division: 'C', roster: Array.from({ length: 18 }, (_, i) => makePlayer({ playerId: `r${i}` })) },
  };
  const snap = collectWorldRosters(clubs, { skipClub: 'User' });
  assert(!snap.User, 'user skipped');
  assert(snap.Rival?.length === 18, 'rival kept');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
