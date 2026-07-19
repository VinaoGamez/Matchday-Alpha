/**
 * Validação de frequência de pênaltis (match-sim + fórmula live).
 * Uso: node scripts/penalty-rate-sim.mjs
 */
import { createRoundMatchSimulator } from '../js/engine/match-sim.js';
import { FORMATION_PERFORMANCE, COMPATIBLE_ROLES } from '../js/engine/match-core.js';
import {
  ENGINE_TUNING,
  engineFoulRisk,
  engineBlowoutDamp,
  enginePenaltyChance,
  createSimLineupBuilder,
} from '../js/engine/match-tuning.js';
import { clamp } from '../js/ui/dom.js';

const SAMPLES = Number(process.argv[2]) || 2500;
const BASE_TACTIC = { formation: '4-4-2', mentality: 50, possession: 50, press: 50, offsideLine: 50 };

const STAT_KEYS = [
  'overall', 'speed', 'dribble', 'finishing', 'passing', 'marking', 'tackling',
  'heading', 'playmaking', 'penaltyTaking', 'freeKick', 'reflexes', 'positioning',
  'penaltySaving',
];
const POS = ['GOL', 'LAT', 'ZAG', 'ZAG', 'LAT', 'MC', 'MC', 'PE', 'PD', 'ATA', 'VOL'];

const makePlayer = (index, overall = 75) => {
  const pos = POS[index];
  const player = { name: `P${index + 1}`, pos, age: 26, fatigue: 88, overall };
  STAT_KEYS.forEach(stat => {
    if (stat === 'overall') return;
    player[stat] = overall;
  });
  return player;
};

const roster = Array.from({ length: 18 }, (_, i) => makePlayer(i));
const makeClub = (name, tactic) => ({
  name,
  formation: '4-4-2',
  mentality: 'Equilibrada',
  style: 'Equilibrada',
  position: 10,
  power: 75,
  roster: roster.map(p => ({ ...p })),
  pitchCondition: 'normal',
  _benchmarkTactic: { ...BASE_TACTIC, ...tactic },
});

const clubs = {
  HOME: makeClub('HOME', BASE_TACTIC),
  AWAY: makeClub('AWAY', BASE_TACTIC),
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
    map.set(slot, sorted.find(p => p.pos === role) || sorted[slot]);
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
  { id: 'calm', label: 'Calmo (pressão baixa)', home: { press: 25, mentality: 35 }, away: { press: 25, mentality: 35 } },
  { id: 'baseline', label: 'Baseline (50/50)', home: {}, away: {} },
  { id: 'press-high', label: 'Pressão alta um lado', home: { press: 90, mentality: 70 }, away: {} },
  { id: 'combat', label: 'Combativo (pressão alta ambos)', home: { press: 85, mentality: 80 }, away: { press: 85, mentality: 75 } },
  { id: 'all-out', label: 'Tudo pra frente espelho', home: { press: 95, mentality: 95, possession: 60 }, away: { press: 90, mentality: 90, possession: 40 } },
];

const pct = (n, d) => Number(((n / d) * 100).toFixed(1));
const avg = (n, d) => Number((n / d).toFixed(3));

const runSimScenario = scenario => {
  clubs.HOME._benchmarkTactic = { ...BASE_TACTIC, ...scenario.home };
  clubs.AWAY._benchmarkTactic = { ...BASE_TACTIC, ...scenario.away };

  let withPen = 0;
  let multi = 0;
  let threePlus = 0;
  let totalPens = 0;
  let totalFouls = 0;
  let totalYellow = 0;
  let totalRed = 0;
  let totalGoodAttacks = 0;
  const hist = [0, 0, 0, 0, 0]; // 0,1,2,3,4+

  for (let i = 0; i < SAMPLES; i++) {
    const result = simulateRoundMatch('HOME', 'AWAY');
    const d = result.data;
    const pens = (d.homePenalties || 0) + (d.awayPenalties || 0);
    totalPens += pens;
    totalFouls += (d.homeFouls || 0) + (d.awayFouls || 0);
    totalYellow += (d.homeYellow || 0) + (d.awayYellow || 0);
    totalRed += (d.homeRed || 0) + (d.awayRed || 0);
    if (pens > 0) withPen += 1;
    if (pens >= 2) multi += 1;
    if (pens >= 3) threePlus += 1;
    hist[Math.min(4, pens)] += 1;
    // goodAttacks não vem no data — estimar via eventos
    totalGoodAttacks += (result.events || []).filter(e => e.type === 'build').length;
  }

  return {
    id: scenario.id,
    label: scenario.label,
    samples: SAMPLES,
    pctWithPenalty: pct(withPen, SAMPLES),
    pct2plus: pct(multi, SAMPLES),
    pct3plus: pct(threePlus, SAMPLES),
    avgPenalties: avg(totalPens, SAMPLES),
    avgFouls: avg(totalFouls, SAMPLES),
    avgYellow: avg(totalYellow, SAMPLES),
    avgRed: avg(totalRed, SAMPLES),
    avgGoodAttacks: avg(totalGoodAttacks, SAMPLES),
    hist: {
      0: pct(hist[0], SAMPLES),
      1: pct(hist[1], SAMPLES),
      2: pct(hist[2], SAMPLES),
      3: pct(hist[3], SAMPLES),
      '4+': pct(hist[4], SAMPLES),
    },
  };
};

/** Proxy do live: ~55 advances com combatividade crescente até médias do cenário. */
const runLiveProxy = (profile, advances = 55) => {
  let withPen = 0;
  let multi = 0;
  let totalPens = 0;
  const n = SAMPLES;
  for (let m = 0; m < n; m++) {
    let pens = 0;
    for (let i = 1; i <= advances; i++) {
      const minute = Math.min(90, Math.max(1, Math.round((i * 90) / advances)));
      const t = minute / 90;
      const p = enginePenaltyChance({
        minute,
        fouls: Math.round(profile.fouls * t),
        yellow: Math.round(profile.yellow * t),
        red: minute > 60 ? profile.red : 0,
        pressHome: profile.pressHome,
        pressAway: profile.pressAway,
        alreadyAwarded: pens,
        scoreChase: minute >= 55 && profile.scoreChase,
        duelEdge: profile.duelEdge,
      });
      if (Math.random() < p) pens += 1;
    }
    totalPens += pens;
    if (pens > 0) withPen += 1;
    if (pens >= 2) multi += 1;
  }
  return {
    pctWithPenalty: pct(withPen, n),
    pct2plus: pct(multi, n),
    avgPenalties: avg(totalPens, n),
  };
};

console.log(`\n=== Pênaltis — match-sim (${SAMPLES} partidas/cenário) ===\n`);
const simResults = scenarios.map(runSimScenario);
for (const row of simResults) {
  console.log(
    `${row.id.padEnd(12)} | com pênalti ${String(row.pctWithPenalty).padStart(5)}% | 2+ ${String(row.pct2plus).padStart(4)}% | 3+ ${String(row.pct3plus).padStart(4)}% | média ${row.avgPenalties} | faltas ${row.avgFouls} | amarelos ${row.avgYellow} | vermelhos ${row.avgRed}`,
  );
  console.log(
    `${''.padEnd(12)} | hist 0/1/2/3/4+: ${row.hist[0]} / ${row.hist[1]} / ${row.hist[2]} / ${row.hist[3]} / ${row.hist['4+']}% | boas chegadas ~${row.avgGoodAttacks}`,
  );
}

const baseline = simResults.find(r => r.id === 'baseline');
const calm = simResults.find(r => r.id === 'calm');
const combat = simResults.find(r => r.id === 'combat');

console.log(`\n=== Proxy live (~55 ticks) usando médias do sim ===\n`);
const liveProfiles = {
  calm: {
    fouls: calm.avgFouls,
    yellow: calm.avgYellow,
    red: calm.avgRed,
    pressHome: 25,
    pressAway: 25,
    scoreChase: false,
    duelEdge: 0,
  },
  baseline: {
    fouls: baseline.avgFouls,
    yellow: baseline.avgYellow,
    red: baseline.avgRed,
    pressHome: 50,
    pressAway: 50,
    scoreChase: true,
    duelEdge: 0.08,
  },
  combat: {
    fouls: combat.avgFouls,
    yellow: combat.avgYellow,
    red: combat.avgRed,
    pressHome: 85,
    pressAway: 85,
    scoreChase: true,
    duelEdge: 0.2,
  },
};
const liveResults = {};
for (const [id, profile] of Object.entries(liveProfiles)) {
  const row = runLiveProxy(profile);
  liveResults[id] = row;
  console.log(
    `${id.padEnd(12)} | com pênalti ${String(row.pctWithPenalty).padStart(5)}% | 2+ ${String(row.pct2plus).padStart(4)}% | média ${row.avgPenalties}`,
  );
}

console.log('\n=== Chance pontual enginePenaltyChance @ min 60 ===\n');
for (const [id, profile] of Object.entries(liveProfiles)) {
  const p = enginePenaltyChance({
    minute: 60,
    fouls: Math.round(profile.fouls * (60 / 90)),
    yellow: Math.round(profile.yellow * (60 / 90)),
    red: profile.red,
    pressHome: profile.pressHome,
    pressAway: profile.pressAway,
    alreadyAwarded: 0,
    scoreChase: profile.scoreChase,
    duelEdge: profile.duelEdge,
  });
  console.log(`${id.padEnd(12)} | p=${p.toFixed(5)} (${(p * 100).toFixed(3)}% por tick)`);
}

console.log('\n=== Tuning ===\n');
console.log({
  base: ENGINE_TUNING.penaltyChanceBase,
  min: ENGINE_TUNING.penaltyChanceMin,
  max: ENGINE_TUNING.penaltyChanceMax,
  goodAttackBase: ENGINE_TUNING.penaltyChanceOnGoodAttackBase,
  damp: ENGINE_TUNING.penaltyRepeatSoftDamp,
});

const checks = [];
const push = (name, ok, detail) => checks.push({ name, ok, detail });
push('sim calmo raro (<18%)', calm.pctWithPenalty < 18, `${calm.pctWithPenalty}%`);
push('sim baseline (8–22%)', baseline.pctWithPenalty >= 8 && baseline.pctWithPenalty <= 22, `${baseline.pctWithPenalty}%`);
push('sim combativo > baseline+2pp', combat.pctWithPenalty > baseline.pctWithPenalty + 2, `${combat.pctWithPenalty}% vs ${baseline.pctWithPenalty}%`);
push('sim combativo 2+ (>0.8%)', combat.pct2plus > 0.8, `${combat.pct2plus}%`);
push('sim sem explosão 3+ (<4%)', combat.pct3plus < 4, `${combat.pct3plus}%`);
push('live proxy baseline <22%', liveResults.baseline.pctWithPenalty < 22, `${liveResults.baseline.pctWithPenalty}%`);
push('live proxy combativo > calmo', liveResults.combat.pctWithPenalty > liveResults.calm.pctWithPenalty + 3, `${liveResults.combat.pctWithPenalty}% vs ${liveResults.calm.pctWithPenalty}%`);

console.log('\n=== Checks ===\n');
for (const c of checks) {
  console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name} — ${c.detail}`);
}
const failed = checks.filter(c => !c.ok).length;
console.log(`\n${failed === 0 ? 'VALIDAÇÃO OK' : `VALIDAÇÃO COM ${failed} FALHA(S)`}\n`);
process.exit(failed === 0 ? 0 : 1);
