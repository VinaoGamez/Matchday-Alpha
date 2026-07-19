/**
 * Smoke: gol contra + acréscimos na simulação IA.
 * Uso: node scripts/own-goal-stoppage-sim.mjs
 */
import {
  ownGoalChance,
  rollStoppageMinutes,
  formatMatchMinuteLabel,
  formatLiveClockTime,
  toChartMinute,
  chartSpan,
} from '../js/engine/match-clock.js';

let fails = 0;
const assert = (cond, msg) => {
  if (!cond) {
    fails++;
    console.error('FAIL:', msg);
  }
};

assert(ownGoalChance({ penalty: true }) === 0, 'penalty OG chance 0');
assert(ownGoalChance({ shootout: true }) === 0, 'shootout OG chance 0');
assert(ownGoalChance({ corner: true }) > ownGoalChance({}), 'corner OG > normal');
assert(ownGoalChance({}) > 0, 'normal OG > 0');

for (let i = 0; i < 40; i++) {
  const first = rollStoppageMinutes({ fouls: 10, yellow: 3, red: 0, subs: 2, half: 'first', random: Math.random });
  const second = rollStoppageMinutes({ fouls: 12, yellow: 4, red: 1, subs: 3, half: 'second', random: Math.random });
  assert(first >= 1 && first <= 5, `first stoppage in range: ${first}`);
  assert(second >= 1 && second <= 7, `second stoppage in range: ${second}`);
}

assert(formatMatchMinuteLabel(45, 2) === '45+2', 'format 45+2');
assert(formatMatchMinuteLabel(90, 4) === '90+4', 'format 90+4');
assert(formatMatchMinuteLabel(67, 0) === '67', 'format 67');
assert(formatLiveClockTime(45, 5, 0) === '50:00(+5)', 'clock 50:00(+5)');
assert(formatLiveClockTime(90, 3, 12) === '93:12(+3)', 'clock 93:12(+3)');
assert(formatLiveClockTime(67, 0, 5) === '67:05', 'clock 67:05');
assert(toChartMinute({ minute: 30 }) === 30, 'chart 30');
assert(toChartMinute({ minute: 45, stoppage: 2, stoppageFirst: 5 }) === 47, 'chart 45+2');
assert(toChartMinute({ minute: 45, stoppage: 0, stoppageFirst: 5 }) === 50, 'chart 2H kickoff');
assert(toChartMinute({ minute: 60, stoppageFirst: 5 }) === 65, 'chart 60 with S1');
assert(toChartMinute({ minute: 90, stoppage: 3, stoppageFirst: 5 }) === 98, 'chart 90+3');
assert(chartSpan(5, 7) === 102, 'chart span');

// Force many on-target OG rolls to confirm RNG can hit
let hits = 0;
const chance = ownGoalChance({ corner: true });
for (let i = 0; i < 5000; i++) if (Math.random() < chance) hits++;
assert(hits > 20, `corner OG should fire often enough in 5k rolls (got ${hits})`);

if (fails) {
  console.error(`${fails} assertion(s) failed`);
  process.exit(1);
}
console.log('own-goal-stoppage-sim: OK');
