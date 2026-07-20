/**
 * Smoke: pulsos, clamp anual, POT fixo, gate 180 min.
 */
import {
  rollPotential,
  rollSquadAge,
  computePulseDelta,
  applyOverallDelta,
  dueCalendarPulses,
  runDevelopmentPulse,
  emptyDevelopmentState,
  PULSE_IDS,
} from '../js/engine/player-development.js';

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// POT: jóia com gap alto; veterano quase zero
const potJewel = rollPotential(70, 18, 'A', () => 0.5);
const potOld = rollPotential(70, 34, 'A', () => 0.5);
assert(potJewel >= 86, `jewel pot ${potJewel}`);
assert(potOld === 70, `old pot ${potOld}`);

// Idade: <19 raro (~3%)
let under19 = 0;
const samples = 4000;
for (let k = 0; k < samples; k++) {
  if (rollSquadAge(Math.random) < 19) under19 += 1;
}
assert(under19 / samples < 0.08, `under19 rate ${under19 / samples}`);

// Gate 180
assert(
  computePulseDelta({ age: 22, overall: 70, potential: 85 }, { minutes: 100, starts: 2, ratingSum: 16, ratingCount: 2 }, 0) === 0,
  'under 180 should be 0',
);

// Young with play can rise
const up = computePulseDelta(
  { age: 22, overall: 70, potential: 85 },
  { minutes: 700, starts: 8, ratingSum: 64, ratingCount: 8 },
  0,
);
assert(up >= 1, `expected rise, got ${up}`);

// Hard year clamp: already +5
assert(
  computePulseDelta(
    { age: 22, overall: 70, potential: 85 },
    { minutes: 700, starts: 8, ratingSum: 64, ratingCount: 8 },
    5,
  ) === 0,
  'year max blocks further rise',
);

const player = {
  name: 'Test',
  playerId: 'p1',
  age: 21,
  pos: 'MEI',
  overall: 70,
  potential: 82,
  passing: 70,
  dribble: 70,
  finishing: 70,
  speed: 70,
};
assert(applyOverallDelta(player, 2), 'apply +2');
assert(player.overall === 72, `ovr ${player.overall}`);
assert(player.potential === 82, 'pot fixed');

const clubs = { X: { name: 'X', roster: [player] } };
const buckets = {
  p1: { minutes: 800, starts: 10, ratingSum: 80, ratingCount: 10 },
};
let state = emptyDevelopmentState(2026);
const r1 = runDevelopmentPulse({
  clubs,
  pulseId: PULSE_IDS.postFirstWindow,
  season: 2026,
  state,
  getSeasonBucket: () => buckets.p1,
});
assert(!r1.skipped, 'first pulse runs');
state = r1.state;

const due = dueCalendarPulses(new Date(2026, 6, 2), 2026, state.pulsesDone);
assert(due.includes(PULSE_IDS.mid), 'mid due in july');

console.log('smoke-player-development: ok');
