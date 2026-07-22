import {
  buildBrazilianLeagueFixtures,
  maxHomeAwayStreakAllTeams,
  maxHomeAwayStreakForTeam,
  balanceHomeAwayStreaks,
} from '../js/engine/league-fixtures.js';

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
const teams10 = Array.from({ length: 10 }, (_, i) => `Grupo ${i + 1}`);

check('Série A (20): cada clube joga 38 vezes', () => {
  const fixtures = buildBrazilianLeagueFixtures(teams20);
  assert(fixtures.length === 38, `rodadas=${fixtures.length}`);
  for (const team of teams20) {
    let count = 0;
    fixtures.forEach(round => {
      round.forEach(game => {
        if (game.home === team || game.away === team) count += 1;
      });
    });
    assert(count === 38, `${team}: ${count} jogos`);
  }
});

check('Série A (20): máx. 2 casa/fora seguidos por clube', () => {
  const fixtures = buildBrazilianLeagueFixtures(teams20);
  const worst = maxHomeAwayStreakAllTeams(fixtures, teams20);
  assert(worst <= 2, `pior sequência=${worst}`);
});

check('Grupo Série D (10): máx. 2 casa/fora seguidos', () => {
  const fixtures = buildBrazilianLeagueFixtures(teams10);
  const worst = maxHomeAwayStreakAllTeams(fixtures, teams10);
  assert(worst <= 2, `pior sequência=${worst}`);
});

check('Confrontos preservados após balanceamento', () => {
  const fixtures = buildBrazilianLeagueFixtures(teams20);
  const pairs = new Set();
  fixtures.forEach(round => {
    round.forEach(game => {
      const key = [game.home, game.away].sort().join(' vs ');
      pairs.add(key);
    });
  });
  assert(pairs.size === (20 * 19) / 2, `pares únicos=${pairs.size}`);
});

check('Balanceamento reduz sequências longas vs calendário cru', () => {
  const raw = [];
  let rotation = [...teams20];
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
  const rawReturn = raw.map((games, index) =>
    games.map(game => ({ home: game.away, away: game.home, round: index + 20 })),
  );
  const unbalanced = [...raw, ...rawReturn];
  const before = maxHomeAwayStreakAllTeams(unbalanced, teams20);
  const balanced = balanceHomeAwayStreaks(unbalanced, 2);
  const after = maxHomeAwayStreakAllTeams(balanced, teams20);
  assert(before >= 3, `antes deveria ter streak>=3 (${before})`);
  assert(after <= 2, `depois streak=${after}`);
});

check('Clube 1: alternância visível nas primeiras 8 rodadas', () => {
  const fixtures = buildBrazilianLeagueFixtures(teams20);
  const sample = [];
  for (let r = 0; r < 8; r += 1) {
    const game = fixtures[r].find(g => g.home === 'Clube 1' || g.away === 'Clube 1');
    sample.push(game.home === 'Clube 1' ? 'C' : 'F');
  }
  const longest = sample.join('').match(/(C|F)\1+/g)?.reduce((m, s) => Math.max(m, s.length), 0) ?? 0;
  assert(longest <= 2, `amostra ${sample.join('-')} (max run ${longest})`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
