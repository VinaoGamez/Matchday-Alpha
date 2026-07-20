/**
 * Benchmark de gols / goleadas — simulação IA (match-sim).
 * Uso: node scripts/goals-blowout-benchmark.mjs [label]
 */
import { createRoundMatchSimulator } from '../js/engine/match-sim.js';
import { FORMATION_PERFORMANCE, COMPATIBLE_ROLES } from '../js/engine/match-core.js';
import {
  ENGINE_TUNING,
  engineFoulRisk,
  engineBlowoutDamp,
  engineScoreDamp,
  createSimLineupBuilder,
} from '../js/engine/match-tuning.js';
import { clamp } from '../js/ui/dom.js';
import fs from 'node:fs';

const SAMPLES = Number(process.env.BENCH_SAMPLES || 800);
const LABEL = process.argv[2] || 'baseline';
const OUT = process.argv[3] || `tmp-bench-${LABEL}.json`;
const BASE_TACTIC = { formation: '4-4-2', mentality: 50, possession: 50, press: 50, offsideLine: 50 };
const STAT_KEYS = [
  'overall', 'speed', 'dribble', 'finishing', 'passing', 'marking', 'tackling',
  'heading', 'playmaking', 'penaltyTaking', 'freeKick', 'reflexes', 'positioning',
  'penaltySaving',
];
const POS = ['GOL', 'LAT', 'ZAG', 'ZAG', 'LAT', 'MC', 'MC', 'PE', 'PD', 'ATA', 'VOL'];

const makePlayer = (index, overall) => {
  const pos = POS[index % POS.length];
  const player = { name: `P${index + 1}`, pos, age: 26, fatigue: 88, overall };
  STAT_KEYS.forEach(stat => {
    if (stat === 'overall') return;
    player[stat] = overall;
  });
  return player;
};

const makeClub = (name, overall) => ({
  name,
  formation: '4-4-2',
  mentality: 'Equilibrada',
  style: 'Equilibrada',
  position: 10,
  power: overall,
  roster: Array.from({ length: 18 }, (_, i) => makePlayer(i, overall)),
  pitchCondition: 'normal',
  _benchmarkTactic: { ...BASE_TACTIC },
});

const clubs = {
  HOME: makeClub('HOME', 75),
  AWAY: makeClub('AWAY', 75),
};

const matchPlayerStat = (player, stat) => player?.[stat] ?? 50;
const rnd = (min, max) => min + Math.random() * (max - min);
const noop = () => null;
const alwaysFalse = () => false;

const formationRoles = {
  '4-4-2': ['GOL', 'LAT', 'ZAG', 'ZAG', 'LAT', 'MC', 'MC', 'PE', 'PD', 'ATA', 'VOL'],
};

const lineupForRoles = (pool, roles) => {
  const sorted = [...pool].sort((a, b) => b.overall - a.overall);
  const map = new Map();
  roles.forEach((role, slot) => {
    const pick = sorted.find(p => p.pos === role) || sorted[slot];
    map.set(slot, pick);
  });
  return map;
};

const { buildSimLineup, substitutionPriority } = createSimLineupBuilder({
  formationRoles,
  lineupForRoles,
  playerUnavailable: alwaysFalse,
  playerStarterBlocked: alwaysFalse,
  playerInRestrictedReturn: alwaysFalse,
  workloadLabel: () => '',
  workloadRisk: () => 1,
  playerRehabMaxMinutes: () => null,
  matchDifficultyForClub: () => 0,
});

const { simulateRoundMatch } = createRoundMatchSimulator({
  clamp,
  rnd,
  random: Math.random,
  getClubs: () => clubs,
  getLeagueData: () => [
    { club: 'HOME', points: 20, played: 15 },
    { club: 'AWAY', points: 20, played: 15 },
  ],
  clubInstitutionalContext: () => ({
    overall: 0, attack: 0, passing: 0, defense: 0, keeper: 0,
    discipline: 0, wear: 1, recovery: 1, volatility: 0,
  }),
  buildSimLineup,
  substitutionPriority,
  engineTuning: ENGINE_TUNING,
  engineFoulRisk,
  engineBlowoutDamp,
  engineScoreDamp,
  formationPerformance: FORMATION_PERFORMANCE,
  compatibleRoles: COMPATIBLE_ROLES,
  matchPlayerStat,
  playerRehabMaxMinutes: () => null,
  injurySeverityLabel: () => 'leve',
  resolvePhysicalIncident: noop,
  buildDeferredInjuryEntry: noop,
  calculatePlayThroughSubChance: () => 0,
  pickInjuryVictim: (_, a) => a,
  directRedDismissalType: () => 'directRed',
});

const scenarios = [
  { id: 'even-75', home: 75, away: 75 },
  { id: 'gap-4', home: 78, away: 74 },
  { id: 'gap-8', home: 80, away: 72 },
  { id: 'gap-12', home: 82, away: 70 },
  { id: 'gap-18', home: 85, away: 67 },
  { id: 'gap-24', home: 88, away: 64 },
];

const percentile = (sorted, p) => {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};

const setPair = (homeOvr, awayOvr) => {
  clubs.HOME = makeClub('HOME', homeOvr);
  clubs.AWAY = makeClub('AWAY', awayOvr);
};

const runScenario = ({ id, home, away }) => {
  setPair(home, away);
  const totals = {
    goals: 0, homeGoals: 0, awayGoals: 0, draws: 0, homeWins: 0,
    over45: 0, over55: 0, over65: 0, over75: 0,
    margin3: 0, margin4: 0, margin5: 0, margin6: 0,
    maxGoals: 0, maxMargin: 0, shots: 0, on: 0, xg: 0,
  };
  const goalList = [];
  const scoreDist = {};

  for (let i = 0; i < SAMPLES; i++) {
    const result = simulateRoundMatch('HOME', 'AWAY');
    const hg = result.homeGoals;
    const ag = result.awayGoals;
    const tg = hg + ag;
    const margin = Math.abs(hg - ag);
    const key = `${hg}-${ag}`;
    scoreDist[key] = (scoreDist[key] || 0) + 1;
    goalList.push(tg);
    totals.goals += tg;
    totals.homeGoals += hg;
    totals.awayGoals += ag;
    totals.draws += hg === ag ? 1 : 0;
    totals.homeWins += hg > ag ? 1 : 0;
    totals.over45 += tg >= 5 ? 1 : 0;
    totals.over55 += tg >= 6 ? 1 : 0;
    totals.over65 += tg >= 7 ? 1 : 0;
    totals.over75 += tg >= 8 ? 1 : 0;
    totals.margin3 += margin >= 3 ? 1 : 0;
    totals.margin4 += margin >= 4 ? 1 : 0;
    totals.margin5 += margin >= 5 ? 1 : 0;
    totals.margin6 += margin >= 6 ? 1 : 0;
    totals.maxGoals = Math.max(totals.maxGoals, tg);
    totals.maxMargin = Math.max(totals.maxMargin, margin);
    totals.shots += (result.data.homeShots || 0) + (result.data.awayShots || 0);
    totals.on += (result.data.homeOnTarget || 0) + (result.data.awayOnTarget || 0);
    totals.xg += (result.data.homeXg || 0) + (result.data.awayXg || 0);
  }

  goalList.sort((a, b) => a - b);
  const n = SAMPLES;
  const pct = v => Number(((v / n) * 100).toFixed(2));
  const topScores = Object.entries(scoreDist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([score, count]) => ({ score, count, pct: pct(count) }));

  return {
    id,
    homeOvr: home,
    awayOvr: away,
    goalsPerMatch: Number((totals.goals / n).toFixed(3)),
    drawRate: pct(totals.draws),
    homeWinRate: pct(totals.homeWins),
    over45Rate: pct(totals.over45),
    over55Rate: pct(totals.over55),
    over65Rate: pct(totals.over65),
    over75Rate: pct(totals.over75),
    margin3Rate: pct(totals.margin3),
    margin4Rate: pct(totals.margin4),
    margin5Rate: pct(totals.margin5),
    margin6Rate: pct(totals.margin6),
    maxGoals: totals.maxGoals,
    maxMargin: totals.maxMargin,
    shotsPerMatch: Number((totals.shots / n).toFixed(2)),
    onTargetPerMatch: Number((totals.on / n).toFixed(2)),
    xgPerMatch: Number((totals.xg / n).toFixed(3)),
    percentiles: {
      p50: percentile(goalList, 0.5),
      p75: percentile(goalList, 0.75),
      p90: percentile(goalList, 0.9),
      p95: Number(percentile(goalList, 0.95).toFixed(2)),
      p99: Number(percentile(goalList, 0.99).toFixed(2)),
    },
    topScores,
  };
};

const started = Date.now();
const results = scenarios.map(runScenario);
const pooled = results.reduce(
  (acc, row) => {
    acc.gpm.push(row.goalsPerMatch);
    acc.over45.push(row.over45Rate);
    acc.over75.push(row.over75Rate);
    acc.margin5.push(row.margin5Rate);
    acc.maxGoals = Math.max(acc.maxGoals, row.maxGoals);
    return acc;
  },
  { gpm: [], over45: [], over75: [], margin5: [], maxGoals: 0 },
);

const report = {
  label: LABEL,
  samplesPerScenario: SAMPLES,
  elapsedMs: Date.now() - started,
  tuningSnapshot: {
    creationBase: ENGINE_TUNING.creationBase,
    actionRateBase: ENGINE_TUNING.actionRateBase,
    actionRateMin: ENGINE_TUNING.actionRateMin,
    actionRateMax: ENGINE_TUNING.actionRateMax,
    blowoutGapStart: ENGINE_TUNING.blowoutGapStart,
    blowoutDampPerPoint: ENGINE_TUNING.blowoutDampPerPoint,
    blowoutDampMin: ENGINE_TUNING.blowoutDampMin,
    scoreGapStart: ENGINE_TUNING.scoreGapStart ?? null,
    scoreDampPerGoal: ENGINE_TUNING.scoreDampPerGoal ?? null,
    scoreDampMin: ENGINE_TUNING.scoreDampMin ?? null,
    xgOpenBase: ENGINE_TUNING.xgOpenBase ?? null,
    xgOpenDivisor: ENGINE_TUNING.xgOpenDivisor ?? null,
    xgOpenCeil: ENGINE_TUNING.xgOpenCeil ?? null,
  },
  summary: {
    avgGoalsPerMatch: Number((pooled.gpm.reduce((a, b) => a + b, 0) / pooled.gpm.length).toFixed(3)),
    avgOver45Rate: Number((pooled.over45.reduce((a, b) => a + b, 0) / pooled.over45.length).toFixed(2)),
    avgOver75Rate: Number((pooled.over75.reduce((a, b) => a + b, 0) / pooled.over75.length).toFixed(2)),
    avgMargin5Rate: Number((pooled.margin5.reduce((a, b) => a + b, 0) / pooled.margin5.length).toFixed(2)),
    worstMaxGoals: pooled.maxGoals,
    even75: results.find(r => r.id === 'even-75'),
    gap24: results.find(r => r.id === 'gap-24'),
  },
  references: {
    brasileiraoGpm: '2.45–2.55',
    topLeaguesGpm: '2.6–2.9',
    targetOver45: '<6%',
    targetOver75: '<0.5%',
    targetMargin5: '<3% even / <8% strong gap',
  },
  scenarios: results,
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
console.log(`Wrote ${OUT}`);
console.log(JSON.stringify({ label: report.label, summary: report.summary, tuning: report.tuningSnapshot }, null, 2));
