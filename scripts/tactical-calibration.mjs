/**
 * Calibração tática — 400 partidas por cenário, elencos idênticos (OVR 75).
 * Uso: node scripts/tactical-calibration.mjs
 */
import { createRoundMatchSimulator } from '../js/engine/match-sim.js';
import { FORMATION_PERFORMANCE, COMPATIBLE_ROLES } from '../js/engine/match-core.js';
import {
  ENGINE_TUNING,
  engineFoulRisk,
  engineBlowoutDamp,
  createSimLineupBuilder,
} from '../js/engine/match-tuning.js';
import { clamp } from '../js/ui/dom.js';

const SAMPLES = 400;
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

const buildTacticalRatings = (tv, rosterPlayers, isHome = true) => {
  const avg = key => rosterPlayers.reduce((s, p) => s + matchPlayerStat(p, key), 0) / rosterPlayers.length;
  const mentalShift = (tv.mentality - 50) / 50;
  const possessionShift = (tv.possession - 50) / 50;
  const pressShift = tv.press / 100;
  const lineShift = (tv.offsideLine - 50) / 50;
  const shape = FORMATION_PERFORMANCE[tv.formation] || { attack: 0, passing: 0, defense: 0 };
  const tiredness = (100 - avg('fatigue')) / 5;
  const homeBoost = isHome
    ? { overall: 0.65, attack: 1.1, passing: 0.35, defense: 0.45 }
    : { overall: 0, attack: 0, passing: 0, defense: 0 };
  const overallTacticBonus = mentalShift * 1.4 + possessionShift * 1 + pressShift * 0.55 - lineShift * 0.35;
  return {
    overall: avg('overall') - (100 - avg('fatigue')) * 0.1 + overallTacticBonus + homeBoost.overall,
    attack:
      avg('finishing') * 0.48 + avg('speed') * 0.17 + avg('dribble') * 0.12 + avg('playmaking') * 0.23 +
      shape.attack + mentalShift * 9 - possessionShift * 2.6 + pressShift * 1.75 + homeBoost.attack - tiredness,
    passing:
      avg('passing') * 0.6 + avg('playmaking') * 0.4 + shape.passing +
      possessionShift * 6.5 + pressShift * 0.75 + homeBoost.passing - tiredness,
    defense:
      avg('marking') * 0.52 + avg('tackling') * 0.48 + shape.defense +
      mentalShift * -5.5 + (1 - possessionShift) * 0.9 + pressShift * 3.5 - lineShift * 2.1 +
      homeBoost.defense - tiredness,
  };
};

const scenarios = [
  { id: 'baseline', label: 'Baseline (50/50/50/50)', home: {}, away: {} },
  { id: 'posse-max', label: 'Posse ↑ (100) vs baseline', home: { possession: 100 }, away: {} },
  { id: 'posse-min', label: 'Posse ↓ (0) vs baseline', home: { possession: 0 }, away: {} },
  { id: 'mental-max', label: 'Mentalidade ↑ (100) vs baseline', home: { mentality: 100 }, away: {} },
  { id: 'mental-min', label: 'Mentalidade ↓ (0) vs baseline', home: { mentality: 0 }, away: {} },
  { id: 'press-max', label: 'Pressão ↑ (100) vs baseline', home: { press: 100 }, away: {} },
  { id: 'press-min', label: 'Pressão ↓ (0) vs baseline', home: { press: 0 }, away: {} },
  { id: 'line-max', label: 'Linha ↑ (100) vs baseline', home: { offsideLine: 100 }, away: {} },
  { id: 'line-min', label: 'Linha ↓ (0) vs baseline', home: { offsideLine: 0 }, away: {} },
  {
    id: 'tiki-taka',
    label: 'Posse+pressão altas (100/100/80/55)',
    home: { possession: 100, press: 80, mentality: 55, offsideLine: 55 },
    away: {},
  },
  {
    id: 'low-block',
    label: 'Bloco baixo (15/25/35/25)',
    home: { mentality: 15, possession: 25, press: 35, offsideLine: 25 },
    away: {},
  },
  {
    id: 'all-out',
    label: 'Tudo pra frente (100/60/90/75)',
    home: { mentality: 100, possession: 60, press: 90, offsideLine: 75 },
    away: {},
  },
  {
    id: 'mirror-extreme',
    label: 'Espelho extremo (100) vs (0) posse',
    home: { possession: 100, mentality: 75, press: 70 },
    away: { possession: 0, mentality: 25, press: 40 },
  },
];

const runScenario = scenario => {
  const homeTactic = { ...BASE_TACTIC, ...scenario.home };
  const awayTactic = { ...BASE_TACTIC, ...scenario.away };
  clubs.HOME._benchmarkTactic = homeTactic;
  clubs.AWAY._benchmarkTactic = awayTactic;

  const homeRatings = buildTacticalRatings(homeTactic, roster.slice(0, 11), true);
  const awayRatings = buildTacticalRatings(awayTactic, roster.slice(0, 11), false);
  const baselineRatings = buildTacticalRatings(BASE_TACTIC, roster.slice(0, 11), true);
  const baselineAway = buildTacticalRatings(BASE_TACTIC, roster.slice(0, 11), false);

  const structuralTarget = (homePass, awayPass, homeOvr, awayOvr, hTac, aTac) =>
    clamp(
      50 +
        (homePass - awayPass) * 0.52 +
        (homeOvr - awayOvr) * 0.24 +
        (hTac.possession - aTac.possession) * 0.16 +
        (hTac.press - aTac.press) * 0.035 +
        (hTac.mentality - aTac.mentality) * 0.025 +
        2.5,
      32,
      68,
    );

  const targetPossession = structuralTarget(
    homeRatings.passing,
    awayRatings.passing,
    homeRatings.overall,
    awayRatings.overall,
    homeTactic,
    awayTactic,
  );
  const baselineTarget = structuralTarget(
    baselineRatings.passing,
    baselineAway.passing,
    baselineRatings.overall,
    baselineAway.overall,
    BASE_TACTIC,
    BASE_TACTIC,
  );

  const totals = {
    homePoss: 0, homeShots: 0, homeFouls: 0, homeOffsides: 0, homePassAcc: 0,
    homeGoals: 0, awayGoals: 0, homeWins: 0, draws: 0,
  };

  for (let i = 0; i < SAMPLES; i++) {
    const result = simulateRoundMatch('HOME', 'AWAY');
    const d = result.data;
    totals.homePoss += d.homePossession || 0;
    totals.homeShots += d.homeShots || 0;
    totals.homeFouls += d.homeFouls || 0;
    totals.homeOffsides += d.homeOffsides || 0;
    const passAcc = d.homePasses ? (d.homeAccurate / d.homePasses) * 100 : 0;
    totals.homePassAcc += passAcc;
    totals.homeGoals += result.homeGoals;
    totals.awayGoals += result.awayGoals;
    totals.homeWins += result.homeGoals > result.awayGoals ? 1 : 0;
    totals.draws += result.homeGoals === result.awayGoals ? 1 : 0;
  }

  const n = SAMPLES;
  const delta = (value, base) => Number((value - base).toFixed(1));
  const pct = value => Number((value / n).toFixed(1));

  return {
    scenario: scenario.label,
    ratings: {
      attack: `${Math.round(homeRatings.attack)} (${delta(homeRatings.attack, baselineRatings.attack) >= 0 ? '+' : ''}${Math.round(delta(homeRatings.attack, baselineRatings.attack))})`,
      passing: `${Math.round(homeRatings.passing)} (${delta(homeRatings.passing, baselineRatings.passing) >= 0 ? '+' : ''}${Math.round(delta(homeRatings.passing, baselineRatings.passing))})`,
      defense: `${Math.round(homeRatings.defense)} (${delta(homeRatings.defense, baselineRatings.defense) >= 0 ? '+' : ''}${Math.round(delta(homeRatings.defense, baselineRatings.defense))})`,
      vsAwayAttack: Math.round(homeRatings.attack - awayRatings.attack),
      vsAwayPassing: Math.round(homeRatings.passing - awayRatings.passing),
    },
    targetPossession: Number(targetPossession.toFixed(1)),
    targetPossessionDelta: Number(delta(targetPossession, baselineTarget).toFixed(1)),
    homePossession: pct(totals.homePoss),
    homePassAccuracy: pct(totals.homePassAcc),
    homeShots: pct(totals.homeShots),
    homeFouls: pct(totals.homeFouls),
    homeOffsides: pct(totals.homeOffsides),
    homeWinRate: Number((totals.homeWins / n * 100).toFixed(1)),
    drawRate: Number((totals.draws / n * 100).toFixed(1)),
    goalsPerMatch: Number(((totals.homeGoals + totals.awayGoals) / n).toFixed(2)),
  };
};

const baseline = runScenario(scenarios[0]);
const results = scenarios.map(runScenario);

console.log(JSON.stringify({ samples: SAMPLES, baseline, results }, null, 2));
