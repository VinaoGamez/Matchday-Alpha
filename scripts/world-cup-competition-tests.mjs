/**
 * Testes — Copa progressiva (grupos → mata-mata).
 * Uso: node scripts/world-cup-competition-tests.mjs
 */
import {
  createWorldCupCompetition,
  getWorldCupAllFixtures,
  advanceWorldCupThroughDate,
  simulateNationalTeamMatch,
} from '../js/engine/world-cup-competition.js';
import { WORLD_CUP_GROUP_FIXTURE_COUNT } from '../js/engine/world-cup-calendar.js';
import { isGroupStageComplete } from '../js/engine/world-cup-standings.js';

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK  ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${label}`, error.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

check('início só com 72 jogos de grupos', () => {
  const comp = createWorldCupCompetition({ year: 2026, random: () => 0.5 });
  assert(comp.groupFixtures.length === WORLD_CUP_GROUP_FIXTURE_COUNT);
  assert(comp.knockoutFixtures.length === 0);
  assert(getWorldCupAllFixtures(comp).length === 72);
});

check('grupo C = Brasil, Marrocos, Escócia, Haiti', () => {
  const comp = createWorldCupCompetition({ year: 2026, random: () => 0.5 });
  const groupC = comp.groupFixtures.filter(g => g.group === 'C');
  assert(groupC.length === 6);
  const teams = new Set(groupC.flatMap(g => [g.homeCode, g.awayCode]));
  assert(teams.has('BRA'));
  assert(teams.has('MAR'));
  assert(teams.has('SCO'));
  assert(teams.has('HAI'));
});

check('CPU simula grupos — mata-mata só depois', () => {
  const comp = createWorldCupCompetition({ year: 2026, random: () => 0.42 });
  const lastGroupDate = new Date(
    Math.max(...comp.groupFixtures.map(g => new Date(g.date).getTime())),
  );
  advanceWorldCupThroughDate(comp, lastGroupDate, {
    random: () => 0.42,
    isUserTeam: () => false,
    simulate: simulateNationalTeamMatch,
  });
  assert(isGroupStageComplete(comp.groupFixtures));
  assert(comp.knockoutGenerated === true);
  assert(comp.knockoutFixtures.length === 16);
  assert(getWorldCupAllFixtures(comp).length === 72 + 16);
});

check('julho sem final placeholder antes dos grupos', () => {
  const comp = createWorldCupCompetition({ year: 2026, random: () => 0.5 });
  const july19 = new Date(2026, 6, 19, 12);
  const beforeGroups = getWorldCupAllFixtures(comp).filter(
    g => new Date(g.date).getMonth() === 6 && new Date(g.date).getDate() === 19,
  );
  assert(beforeGroups.length === 0);
  advanceWorldCupThroughDate(comp, july19, {
    random: () => 0.42,
    isUserTeam: () => false,
    simulate: simulateNationalTeamMatch,
  });
  const after = getWorldCupAllFixtures(comp).filter(
    g => g.phase === 'FINAL' && new Date(g.date).getDate() === 19,
  );
  assert(after.length <= 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
