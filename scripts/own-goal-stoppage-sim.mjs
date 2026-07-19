/**
 * Smoke: gol contra + acréscimos na simulação IA.
 * Uso: node scripts/own-goal-stoppage-sim.mjs
 */
import {
  ownGoalChance,
  rollStoppageMinutes,
  allowsExtendedSecondHalfStoppage,
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

// Etapa quieta (caso do print: sem cartão/sub no 2º) → no máximo 2–3'.
for (let i = 0; i < 300; i++) {
  const quiet = rollStoppageMinutes({
    fouls: 4 + Math.floor(Math.random() * 5),
    yellow: 0,
    red: 0,
    subs: 0,
    goals: Math.floor(Math.random() * 2),
    half: 'second',
    random: Math.random,
  });
  assert(quiet >= 2 && quiet <= 3, `quiet 2H must be 2–3': ${quiet}`);
}

const histFirst = new Map();
const histSecond = new Map();
const N = 2000;

for (let i = 0; i < N; i++) {
  const first = rollStoppageMinutes({
    fouls: 8 + Math.floor(Math.random() * 6),
    yellow: 1 + Math.floor(Math.random() * 3),
    red: Math.random() < 0.08 ? 1 : 0,
    subs: Math.floor(Math.random() * 2),
    goals: Math.floor(Math.random() * 3),
    half: 'first',
    random: Math.random,
  });
  const second = rollStoppageMinutes({
    fouls: 8 + Math.floor(Math.random() * 8),
    yellow: 1 + Math.floor(Math.random() * 4),
    red: Math.random() < 0.12 ? 1 : 0,
    subs: 3 + Math.floor(Math.random() * 4),
    goals: Math.floor(Math.random() * 3),
    half: 'second',
    random: Math.random,
  });
  assert(first >= 1 && first <= 4, `first stoppage in range: ${first}`);
  assert(second >= 2 && second <= 7, `second stoppage in range: ${second}`);
  histFirst.set(first, (histFirst.get(first) || 0) + 1);
  histSecond.set(second, (histSecond.get(second) || 0) + 1);
}

const pct7 = (histSecond.get(7) || 0) / N;
const pctSecondAtMost5 =
  ((histSecond.get(2) || 0) +
    (histSecond.get(3) || 0) +
    (histSecond.get(4) || 0) +
    (histSecond.get(5) || 0)) /
  N;
const pctFirstAtMost3 =
  ((histFirst.get(1) || 0) + (histFirst.get(2) || 0) + (histFirst.get(3) || 0)) / N;
assert(pct7 < 0.08, `2H +7 too common: ${(pct7 * 100).toFixed(1)}%`);
assert(pctSecondAtMost5 > 0.75, `2H mostly 2–5': ${(pctSecondAtMost5 * 100).toFixed(1)}%`);
assert(pctFirstAtMost3 > 0.8, `1H mostly 1–3': ${(pctFirstAtMost3 * 100).toFixed(1)}%`);

assert(allowsExtendedSecondHalfStoppage({ knockout: true }), 'knockout allows extended');
assert(allowsExtendedSecondHalfStoppage({ knockout: false, round: 37, totalRounds: 38 }), 'league R37 allows');
assert(allowsExtendedSecondHalfStoppage({ knockout: false, round: 38, totalRounds: 38 }), 'league R38 allows');
assert(!allowsExtendedSecondHalfStoppage({ knockout: false, round: 36, totalRounds: 38 }), 'league R36 blocks');
assert(allowsExtendedSecondHalfStoppage({ knockout: false, round: 9, totalRounds: 10 }), 'serie D R9 allows');
assert(!allowsExtendedSecondHalfStoppage({ knockout: false, round: 8, totalRounds: 10 }), 'serie D R8 blocks');

const histExt = new Map();
const N_EXT = 8000;
for (let i = 0; i < N_EXT; i++) {
  const m = rollStoppageMinutes({
    fouls: 14,
    yellow: 4,
    red: 1,
    subs: 6,
    goals: 2,
    half: 'second',
    extendedStoppage: true,
    random: Math.random,
  });
  assert(m >= 2 && m <= 10, `extended 2H range: ${m}`);
  histExt.set(m, (histExt.get(m) || 0) + 1);
}
const pctLong = ((histExt.get(8) || 0) + (histExt.get(9) || 0) + (histExt.get(10) || 0)) / N_EXT;
assert(pctLong > 0.001, `extended long too rare: ${(pctLong * 100).toFixed(2)}%`);
assert(pctLong < 0.1, `extended long too common: ${(pctLong * 100).toFixed(2)}%`);
for (let i = 0; i < 500; i++) {
  const m = rollStoppageMinutes({
    fouls: 14,
    yellow: 4,
    red: 1,
    subs: 6,
    goals: 3,
    half: 'second',
    extendedStoppage: false,
    random: Math.random,
  });
  assert(m <= 7, `non-extended cannot exceed 7: ${m}`);
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

let hits = 0;
const chance = ownGoalChance({ corner: true });
for (let i = 0; i < 5000; i++) if (Math.random() < chance) hits++;
assert(hits > 20, `OG corner hits in 5000: ${hits}`);

const fmt = map =>
  [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, v]) => `${k}'=${((v / N) * 100).toFixed(1)}%`)
    .join('  ');

console.log('1H dist:', fmt(histFirst));
console.log('2H dist:', fmt(histSecond));
console.log(`2H +7 rate: ${(pct7 * 100).toFixed(1)}%`);
console.log(
  '2H extended long (8–10):',
  `${(pctLong * 100).toFixed(2)}%`,
  [...histExt.entries()]
    .filter(([k]) => k >= 8)
    .sort((a, b) => a[0] - b[0])
    .map(([k, v]) => `${k}'=${((v / N_EXT) * 100).toFixed(2)}%`)
    .join('  ') || 'none',
);

if (fails) {
  console.error(`\n${fails} assertion(s) failed`);
  process.exit(1);
}
console.log('\nOK own-goal-stoppage-sim');
