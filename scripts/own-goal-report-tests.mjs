/**
 * Gol contra no relatório NOTAS — homônimos e atribuição ao lado que sofreu.
 * Uso: node scripts/own-goal-report-tests.mjs
 */
import assert from 'node:assert/strict';
import { buildMatchPlayerSheets } from '../js/engine/player-match-stats.js';
import {
  tipKey,
  buildPlayerTipIndex,
  ownGoalTipCount,
} from '../js/feature/calendar-view/match-report-tips.js';

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

function makeClubsWithHomonym(name = 'Caio Rocha') {
  const homeRoster = [
    { name: 'Gol Home', pos: 'GOL', age: 30 },
    { name, pos: 'MEI', age: 24 },
    { name: 'Ata Home', pos: 'ATA', age: 27 },
  ];
  const awayRoster = [
    { name: 'Gol Away', pos: 'GOL', age: 29 },
    { name, pos: 'ZAG', age: 26 },
    { name: 'Ata Away', pos: 'ATA', age: 25 },
  ];
  const clubs = {
    Alpha: { name: 'Alpha', roster: homeRoster },
    Beta: { name: 'Beta', roster: awayRoster },
  };
  const workload = sideRoster =>
    sideRoster.map(player => ({ name: player.name, minutes: 90, started: true }));
  return { clubs, homeRoster, awayRoster, workload };
}

check('tipKey scopes by side', () => {
  assert.equal(tipKey('home', 'Caio Rocha'), 'home|Caio Rocha');
  assert.equal(tipKey('away', 'Caio Rocha'), 'away|Caio Rocha');
  assert.equal(tipKey('home', ''), null);
  assert.equal(tipKey('mid', 'X'), null);
});

check('GC tip goes to conceding side only (home benefits)', () => {
  const goals = {
    home: [{ name: 'Caio Rocha', minute: 48, type: 'own' }],
    away: [],
  };
  const tips = buildPlayerTipIndex(goals);
  assert.equal(tips.get('away|Caio Rocha')?.ownGoals.length, 1);
  assert.equal(tips.get('away|Caio Rocha')?.ownGoals[0].minute, 48);
  assert.equal(tips.has('home|Caio Rocha'), false);
  assert.equal(
    ownGoalTipCount(tips, { side: 'home', name: 'Caio Rocha' }),
    0,
  );
  assert.equal(
    ownGoalTipCount(tips, { side: 'away', name: 'Caio Rocha' }),
    1,
  );
});

check('GC tip goes to conceding side only (away benefits)', () => {
  const goals = {
    home: [],
    away: [{ name: 'Caio Rocha', minute: 12, stoppage: 1, type: 'own' }],
  };
  const tips = buildPlayerTipIndex(goals);
  assert.equal(ownGoalTipCount(tips, { side: 'home', name: 'Caio Rocha' }), 1);
  assert.equal(ownGoalTipCount(tips, { side: 'away', name: 'Caio Rocha' }), 0);
  assert.equal(tips.get('home|Caio Rocha')?.ownGoals[0].stoppage, 1);
});

check('regular goal stays on scoring side; GC does not count as goal tip', () => {
  const goals = {
    home: [
      { name: 'Ata Home', minute: 20, type: 'normal' },
      { name: 'Caio Rocha', minute: 48, type: 'own' },
    ],
    away: [{ name: 'Ata Away', minute: 66, assist: 'Mei Away', type: 'normal' }],
  };
  const tips = buildPlayerTipIndex(goals);
  assert.equal(tips.get('home|Ata Home')?.goals.length, 1);
  assert.equal(tips.get('home|Caio Rocha')?.goals?.length || 0, 0);
  assert.equal(tips.get('away|Caio Rocha')?.ownGoals.length, 1);
  assert.equal(tips.get('away|Ata Away')?.goals.length, 1);
  assert.equal(tips.get('away|Mei Away')?.assists.length, 1);
});

check('subs and cards do not leak across homonyms', () => {
  const goals = {
    home: [{ name: 'Caio Rocha', minute: 48, type: 'own' }],
    away: [],
  };
  const incidents = [
    { side: 'away', type: 'substitution', name: 'Caio Rocha → Reserva Away', minute: 70 },
    { side: 'home', type: 'yellow', name: 'Caio Rocha', minute: 33 },
  ];
  const played = new Set(['away|Caio Rocha', 'away|Reserva Away', 'home|Caio Rocha']);
  const tips = buildPlayerTipIndex(goals, incidents, played);
  assert.equal(tips.get('away|Caio Rocha')?.ownGoals.length, 1);
  assert.equal(tips.get('away|Caio Rocha')?.subOut.length, 1);
  assert.equal(tips.get('away|Reserva Away')?.subIn.length, 1);
  assert.equal(tips.get('home|Caio Rocha')?.yellow.length, 1);
  assert.equal(tips.get('home|Caio Rocha')?.ownGoals?.length || 0, 0);
  assert.equal(tips.get('home|Caio Rocha')?.subOut?.length || 0, 0);
});

check('buildMatchPlayerSheets: homonym OG only on conceding side', () => {
  const { clubs, homeRoster, awayRoster, workload } = makeClubsWithHomonym();
  const game = {
    home: 'Alpha',
    away: 'Beta',
    homeGoals: 1,
    awayGoals: 0,
    goals: {
      home: [{ name: 'Caio Rocha', minute: 48, type: 'own' }],
      away: [],
    },
    data: { homePasses: 300, awayPasses: 280 },
    discipline: { home: [], away: [] },
    workload: {
      home: workload(homeRoster),
      away: workload(awayRoster),
    },
  };
  const built = buildMatchPlayerSheets(game, { getClub: name => clubs[name] });
  const homeTwin = built.home.find(row => row.name === 'Caio Rocha');
  const awayTwin = built.away.find(row => row.name === 'Caio Rocha');
  assert.equal(homeTwin.ownGoals, 0);
  assert.equal(awayTwin.ownGoals, 1);
  assert.equal(homeTwin.goals, 0);
  assert.equal(awayTwin.goals, 0);
  // Nota do autor do GC deve cair; homônimo mandante não.
  assert.ok(awayTwin.rating < homeTwin.rating);
});

check('fallback workload does not put OG scorer on benefiting side', () => {
  const { clubs } = makeClubsWithHomonym();
  // Sem workload: fallback usa nomes dos gols — GC não pode infiltrar o elenco do mandante.
  const game = {
    home: 'Alpha',
    away: 'Beta',
    homeGoals: 1,
    awayGoals: 0,
    goals: {
      home: [{ name: 'Caio Rocha', minute: 48, type: 'own' }],
      away: [],
    },
    data: {},
    discipline: { home: [], away: [] },
    workload: { home: [], away: [] },
  };
  const built = buildMatchPlayerSheets(game, { getClub: name => clubs[name] });
  const homeNames = built.home.map(row => row.name);
  // Caio Rocha do Alpha (MEI no roster) pode aparecer via slice(0,11) do roster;
  // o ponto crítico: ownGoals do mandante continua 0 e o visitante recebe o GC.
  const homeTwin = built.home.find(row => row.name === 'Caio Rocha');
  const awayTwin = built.away.find(row => row.name === 'Caio Rocha');
  assert.ok(homeNames.includes('Caio Rocha') || homeTwin == null || homeTwin.ownGoals === 0);
  if (homeTwin) assert.equal(homeTwin.ownGoals, 0);
  if (awayTwin) assert.equal(awayTwin.ownGoals, 1);
  // Nome do GC sozinho no array home não cria entrada só por causa do gol.
  assert.ok(
    !built.home.some(row => row.name === 'Caio Rocha' && row.ownGoals > 0),
    'mandante não pode herdar GC do homônimo visitante',
  );
});

check('end-to-end tip + sheets mirror the screenshot bug case', () => {
  const { clubs, homeRoster, awayRoster, workload } = makeClubsWithHomonym();
  const goals = {
    home: [{ name: 'Caio Rocha', minute: 48, type: 'own' }],
    away: [{ name: 'Ata Away', minute: 66, type: 'normal' }],
  };
  const game = {
    home: 'Alpha',
    away: 'Beta',
    homeGoals: 1,
    awayGoals: 1,
    goals,
    data: { homePasses: 300, awayPasses: 280 },
    discipline: { home: [], away: [] },
    workload: {
      home: workload(homeRoster),
      away: workload(awayRoster),
    },
  };
  const built = buildMatchPlayerSheets(game, { getClub: name => clubs[name] });
  const tips = buildPlayerTipIndex(goals);
  const homeMei = built.home.find(row => row.name === 'Caio Rocha');
  const awayZag = built.away.find(row => row.name === 'Caio Rocha');
  assert.equal(homeMei.side, 'home');
  assert.equal(awayZag.side, 'away');
  assert.equal(homeMei.ownGoals, 0);
  assert.equal(awayZag.ownGoals, 1);
  assert.equal(ownGoalTipCount(tips, homeMei), 0);
  assert.equal(ownGoalTipCount(tips, awayZag), 1);
  // Placar: GC no array home (time que se beneficia) — relatório de scorers inalterado.
  assert.equal(goals.home.filter(g => g.type === 'own').length, 1);
});

console.log(`own-goal-report tests: ${passed}/${results.length} passed`);
results.forEach(row => {
  console.log(`${row.ok ? '✓' : '✗'} ${row.name}${row.ok ? '' : ` — ${row.error}`}`);
});
if (results.some(row => !row.ok)) process.exit(1);
