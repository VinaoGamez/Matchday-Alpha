/**
 * Histórico de jogadores + notas Brasfoot-like.
 * Uso: node scripts/player-history-tests.mjs
 */
import assert from 'node:assert/strict';
import {
  computeMatchRating,
  clampMatchRating,
  formatMatchRating,
  playerKey,
  buildMatchPlayerSheets,
} from '../js/engine/player-match-stats.js';
import {
  createPlayerHistoryEngine,
  PLAYER_HISTORY_LIMITS,
  clearPlayerHistoryStore,
} from '../js/engine/player-history.js';
import { SAVE_KEYS } from '../js/core/constants.js';

const memory = new Map();
globalThis.localStorage = {
  getItem: key => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => {
    memory.set(key, String(value));
  },
  removeItem: key => {
    memory.delete(key);
  },
};

let passed = 0;
const results = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    throw error;
  }
}

function makeRoster(names) {
  return names.map((name, index) => ({
    name,
    pos: index === 0 ? 'GOL' : index < 4 ? 'ZAG' : index < 8 ? 'MEI' : 'ATA',
    age: 20 + index,
  }));
}

function makeGame({
  home = 'Alpha',
  away = 'Beta',
  homeGoals = 2,
  awayGoals = 1,
  homeScorer = 'Ata Home',
  assist = 'Mei Home',
} = {}) {
  const homeRoster = makeRoster([
    'Gol Home',
    'Zag A',
    'Zag B',
    'Zag C',
    'Mei Home',
    'Mei B',
    'Mei C',
    'Mei D',
    'Ata Home',
    'Ata B',
    'Ata C',
  ]);
  const awayRoster = makeRoster([
    'Gol Away',
    'Zag X',
    'Zag Y',
    'Zag Z',
    'Mei Away',
    'Mei Y',
    'Mei Z',
    'Mei W',
    'Ata Away',
    'Ata Y',
    'Ata Z',
  ]);
  const clubs = {
    [home]: { name: home, roster: homeRoster },
    [away]: { name: away, roster: awayRoster },
  };
  const workloadSide = roster =>
    roster.slice(0, 11).map((player, index) => ({
      name: player.name,
      minutes: index < 11 ? 90 : 0,
      started: true,
    }));
  const game = {
    home,
    away,
    homeGoals,
    awayGoals,
    goals: {
      home: [
        { name: homeScorer, assist, minute: 22 },
        { name: homeScorer, minute: 70 },
      ].slice(0, homeGoals),
      away: awayGoals
        ? [{ name: 'Ata Away', assist: 'Mei Away', minute: 55 }]
        : [],
    },
    data: {
      homePasses: 420,
      awayPasses: 380,
      homeKeeperSaves: 4,
      awayKeeperSaves: 3,
      homeYellow: 1,
      awayYellow: 0,
      homeRed: 0,
      awayRed: 0,
    },
    discipline: {
      home: [{ name: 'Zag A', yellow: 1, dismissal: null }],
      away: [],
    },
    workload: {
      home: workloadSide(homeRoster),
      away: workloadSide(awayRoster),
    },
  };
  return { game, clubs };
}

memory.clear();
clearPlayerHistoryStore();

check('playerKey is stable slug#age', () => {
  assert.equal(playerKey({ name: 'José Silva', age: 28 }), 'jose-silva#28');
  assert.equal(playerKey('José Silva', 28), 'jose-silva#28');
});

check('clampMatchRating steps of 0.5 within 1–10', () => {
  assert.equal(clampMatchRating(6.24), 6);
  assert.equal(clampMatchRating(6.26), 6.5);
  assert.equal(clampMatchRating(0), 1);
  assert.equal(clampMatchRating(11), 10);
  assert.equal(formatMatchRating(7.5), '7.5');
});

check('goal + assist raises rating above base', () => {
  const base = computeMatchRating(
    { minutes: 90, goals: 0, assists: 0, role: 'ATA', started: true, passesEst: 20 },
    { resultDelta: 0.4 },
  );
  const scorer = computeMatchRating(
    { minutes: 90, goals: 2, assists: 1, role: 'ATA', started: true, passesEst: 20 },
    { resultDelta: 0.4 },
  );
  assert.ok(scorer > base);
  assert.ok(scorer >= 7);
});

check('yellow and red lower rating', () => {
  const clean = computeMatchRating(
    { minutes: 90, goals: 0, assists: 0, role: 'MEI', started: true, passesEst: 30 },
    { resultDelta: 0 },
  );
  const booked = computeMatchRating(
    { minutes: 90, goals: 0, assists: 0, role: 'MEI', started: true, passesEst: 30, yellow: true },
    { resultDelta: 0 },
  );
  const sentOff = computeMatchRating(
    { minutes: 45, goals: 0, assists: 0, role: 'MEI', started: true, passesEst: 10, red: true },
    { resultDelta: -0.35 },
  );
  assert.ok(booked < clean);
  assert.ok(sentOff <= 5);
});

check('buildMatchPlayerSheets estimates passes and ratings', () => {
  const { game, clubs } = makeGame();
  const built = buildMatchPlayerSheets(game, { getClub: name => clubs[name] });
  assert.equal(built.home.length, 11);
  assert.equal(built.away.length, 11);
  const scorer = built.home.find(row => row.name === 'Ata Home');
  assert.ok(scorer);
  assert.equal(scorer.goals, 2);
  assert.equal(scorer.assists, 0);
  assert.ok(scorer.passesEst > 0);
  assert.ok(scorer.rating >= 7);
  const assist = built.home.find(row => row.name === 'Mei Home');
  assert.equal(assist.assists, 1);
});

check('own goal counts only on conceding side (homonym safe)', () => {
  const { game, clubs } = makeGame({ homeGoals: 1, awayGoals: 0 });
  // Homônimo nos dois times; GC creditado ao mandante (array home), autor é visitante.
  game.goals = {
    home: [{ name: 'Caio Rocha', minute: 48, type: 'own' }],
    away: [],
  };
  clubs.Alpha.roster[4].name = 'Caio Rocha';
  clubs.Beta.roster[1].name = 'Caio Rocha';
  game.workload.home[4].name = 'Caio Rocha';
  game.workload.away[1].name = 'Caio Rocha';
  const built = buildMatchPlayerSheets(game, { getClub: name => clubs[name] });
  const homeTwin = built.home.find(row => row.name === 'Caio Rocha');
  const awayTwin = built.away.find(row => row.name === 'Caio Rocha');
  assert.ok(homeTwin);
  assert.ok(awayTwin);
  assert.equal(homeTwin.ownGoals, 0);
  assert.equal(awayTwin.ownGoals, 1);
  assert.equal(homeTwin.goals, 0);
  assert.equal(awayTwin.goals, 0);
});

check('recordMatch rolls into players.seasons and matchLogs', () => {
  memory.clear();
  clearPlayerHistoryStore();
  const { game, clubs } = makeGame();
  const history = createPlayerHistoryEngine({ getClub: name => clubs[name] });
  const log = history.recordMatch(game, {
    season: 2026,
    round: 3,
    competition: 'LEAGUE:A',
  });
  assert.ok(log);
  assert.equal(log.players.length, 22);
  const key = playerKey({ name: 'Ata Home', age: 28 });
  // age from roster index 8 → 28
  const player = history.getPlayer(key);
  assert.ok(player);
  assert.equal(player.seasons['2026'].goals, 2);
  assert.equal(player.seasons['2026'].apps, 1);
  assert.ok(player.seasons['2026'].ratingCount >= 1);
  const found = history.findMatchLog({ home: 'Alpha', away: 'Beta', season: 2026, round: 3 });
  assert.ok(found);
  assert.equal(found.id, log.id);
});

check('duplicate match id is ignored', () => {
  memory.clear();
  clearPlayerHistoryStore();
  const { game, clubs } = makeGame();
  const history = createPlayerHistoryEngine({ getClub: name => clubs[name] });
  history.recordMatch(game, { season: 2026, round: 1, competition: 'LEAGUE:A', id: 'dup-1' });
  history.recordMatch(game, { season: 2026, round: 1, competition: 'LEAGUE:A', id: 'dup-1' });
  assert.equal(history.getStore().matchLogs.length, 1);
  const player = history.getPlayer(playerKey({ name: 'Ata Home', age: 28 }));
  assert.equal(player.seasons['2026'].apps, 1);
});

check('archiveSeasonBalance keeps slim archive', () => {
  memory.clear();
  clearPlayerHistoryStore();
  const history = createPlayerHistoryEngine({ getClub: () => null });
  const archived = history.archiveSeasonBalance({
    season: 2026,
    userClub: 'Alpha',
    userDivision: 'A',
    seasonGoal: { id: 'A_top8', label: 'G8', tier: 'ambitious' },
    seasonGoalResult: { status: 'met', boardDelta: 8, label: 'Cumpriu', feeling: 'good' },
    champions: { A: 'Alpha', B: 'Beta' },
    movements: [{ title: 'Acesso', type: 'up', clubs: ['Gamma', 'Delta'] }],
    leadersByDivision: {
      A: {
        scorers: [{ name: 'Ata Home', club: 'Alpha', goals: 18 }],
        assistants: [{ name: 'Mei Home', club: 'Alpha', assists: 12 }],
      },
    },
  });
  assert.equal(archived.season, 2026);
  assert.equal(archived.champions.A, 'Alpha');
  assert.equal(history.getStore().seasonArchives.length, 1);
  assert.ok(globalThis.localStorage.getItem(SAVE_KEYS.playerHistory));
});

check('finalizeSeason clears matchLogs and keeps season average rollup', () => {
  memory.clear();
  clearPlayerHistoryStore();
  const { game, clubs } = makeGame();
  const history = createPlayerHistoryEngine({ getClub: name => clubs[name] });
  history.recordMatch(game, { season: 2026, round: 5, competition: 'LEAGUE:A' });
  assert.equal(history.getStore().matchLogs.length, 1);
  history.finalizeSeason(2026, { nextSeason: 2027 });
  assert.equal(history.getStore().matchLogs.length, 0);
  assert.equal(history.getStore().season, 2027);
  const player = history.getPlayer(playerKey({ name: 'Ata Home', age: 28 }));
  assert.equal(player.seasons['2026'].goals, 2);
  assert.ok(player.seasons['2026'].avgRating >= 1);
  assert.ok(player.seasons['2026'].avgRating <= 10);
});

check('matchLogs stay within season budget and drop other seasons', () => {
  memory.clear();
  clearPlayerHistoryStore();
  const { game, clubs } = makeGame({ homeGoals: 1, awayGoals: 0 });
  const budget = 8;
  const history = createPlayerHistoryEngine({
    getClub: name => clubs[name],
    getMatchLogBudget: () => budget,
  });
  for (let i = 0; i < budget + 4; i += 1) {
    history.recordMatch(
      { ...game, homeGoals: 1, awayGoals: 0 },
      { season: 2026, round: i + 1, competition: 'LEAGUE:A', id: `log-${i}`, persist: false },
    );
  }
  history.persist();
  assert.equal(history.getStore().matchLogs.length, budget);
  assert.equal(history.getStore().matchLogs[0].id, 'log-4');
  // Nova temporada descarta logs antigos (só buffer corrente).
  history.recordMatch(
    { ...game, home: 'Gamma', away: 'Delta', homeGoals: 1, awayGoals: 0 },
    { season: 2027, round: 1, competition: 'LEAGUE:A', id: 'next-1', persist: false },
  );
  assert.ok(history.getStore().matchLogs.every(entry => Number(entry.season) === 2027));
  assert.equal(history.getStore().matchLogs.length, 1);
});

console.log(`player-history tests: ${passed}/${results.length} passed`);
results.forEach(row => {
  console.log(`${row.ok ? '✓' : '✗'} ${row.name}${row.ok ? '' : ` — ${row.error}`}`);
});
if (passed !== results.length) process.exit(1);
