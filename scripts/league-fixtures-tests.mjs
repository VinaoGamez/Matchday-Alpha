import {
  buildBrazilianLeagueFixtures,
  maxHomeAwayStreakAllTeams,
  balanceHomeAwayStreaks,
  eachPairHasHomeAndAway,
} from '../js/engine/league-fixtures.js';
import {
  buildCompetitionRoundRobinFixtures,
  fixturePairKey,
  sameFixturePair,
  gameMatchesRecorded,
  slimNationalFixturesForSave,
  hydrateNationalFixtures,
  getCalendarPolicy,
} from '../js/engine/competition-calendar.js';

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

const teams20 = Array.from({ length: 20 }, (_, i) => `Clube ${i + 1}`);
const teams4 = teams20.slice(0, 4);

check('Política brasileirão: balanceamento no 1º turno', () => {
  const policy = getCalendarPolicy('brasileirao');
  assert(policy.balanceHomeAway.enabled, 'enabled');
  assert(policy.balanceHomeAway.scope === 'first-leg-only', policy.balanceHomeAway.scope);
});

check('Política copa: sem balanceamento de mando', () => {
  const policy = getCalendarPolicy('copa-brasil');
  assert(!policy.balanceHomeAway.enabled, 'copa off');
});

check('Série A (20): sequência casa/fora ≤ 3 na temporada (par simétrico)', () => {
  const fixtures = buildCompetitionRoundRobinFixtures(teams20, 'brasileirao');
  const worst = maxHomeAwayStreakAllTeams(fixtures, teams20);
  assert(worst <= 3, `pior sequência=${worst}`);
});

check('Série A (20): 1º turno ≤ 2 casa/fora seguidos', () => {
  const fixtures = buildCompetitionRoundRobinFixtures(teams20, 'brasileirao');
  const worst = maxHomeAwayStreakAllTeams(fixtures.slice(0, 19), teams20);
  assert(worst <= 2, `1º turno=${worst}`);
});

check('Cada par tem 1 casa + 1 fora (returno espelhado)', () => {
  const fixtures = buildBrazilianLeagueFixtures(teams20);
  assert(eachPairHasHomeAndAway(fixtures, teams20), 'pares simétricos');
});

check('Confrontos preservados após balanceamento', () => {
  const fixtures = buildCompetitionRoundRobinFixtures(teams20, 'brasileirao');
  const pairs = new Set();
  fixtures.forEach(round => {
    round.forEach(game => pairs.add([game.home, game.away].sort().join(' vs ')));
  });
  assert(pairs.size === (20 * 19) / 2, `pares=${pairs.size}`);
});

check('fixturePairKey ignora mando', () => {
  assert(fixturePairKey('A', 'B') === fixturePairKey('B', 'A'), 'par');
});

check('gameMatchesRecorded: mandos invertidos = mesmo jogo', () => {
  const a = { home: 'X', away: 'Y', round: 12 };
  const b = { home: 'Y', away: 'X', round: 12 };
  assert(sameFixturePair(a, b), 'same');
  assert(gameMatchesRecorded(a, b), 'match');
});

check('Persistência: slim + hydrate preserva calendário', () => {
  const fixtures = buildCompetitionRoundRobinFixtures(teams20, 'brasileirao');
  const slim = slimNationalFixturesForSave(fixtures);
  const back = hydrateNationalFixtures(slim, 38);
  assert(back?.length === 38, `rounds=${back?.length}`);
  assert(back[0][0].home === fixtures[0][0].home, 'home');
  assert(back[33][0].away === fixtures[33][0].away, 'away r34');
});

check('Persistência: slim + hydrate preserva date/time quando presentes', () => {
  const fixtures = buildCompetitionRoundRobinFixtures(teams4, 'brasileirao');
  const dated = new Date(2026, 4, 10, 12);
  fixtures[0][0].date = dated;
  fixtures[0][0].time = '20:00';
  const slim = slimNationalFixturesForSave(fixtures);
  assert(slim[0][0].date, 'slim date');
  assert(slim[0][0].time === '20:00', 'slim time');
  const back = hydrateNationalFixtures(slim, fixtures.length);
  assert(back[0][0].date instanceof Date, 'hydrated date');
  assert(back[0][0].time === '20:00', 'hydrated time');
});

check('Balanceamento 1º turno reduz sequências longas', () => {
  let rotation = [...teams20];
  const raw = [];
  for (let round = 0; round < 19; round += 1) {
    const games = [];
    for (let pair = 0; pair < 10; pair += 1) {
      let home = rotation[pair];
      let away = rotation[19 - pair];
      if ((round + pair) % 2) [home, away] = [away, home];
      games.push({ home, away, round: round + 1 });
    }
    raw.push(games);
    rotation = [rotation[0], rotation[19], ...rotation.slice(1, -1)];
  }
  const before = maxHomeAwayStreakAllTeams(raw, teams20);
  const balancedFirst = balanceHomeAwayStreaks(raw, 2);
  const full = [
    ...balancedFirst,
    ...balancedFirst.map((games, index) =>
      games.map(game => ({ home: game.away, away: game.home, round: index + 20 })),
    ),
  ];
  const after = maxHomeAwayStreakAllTeams(full, teams20);
  assert(before >= 3, `before=${before}`);
  assert(after <= 3, `after=${after}`);
  assert(eachPairHasHomeAndAway(full, teams20), 'simetria');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
