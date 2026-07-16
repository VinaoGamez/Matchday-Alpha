import { clamp } from '../ui/dom.js';

/** Parâmetros calibrados do motor de partida (P1/P2). */
export const ENGINE_TUNING = {
  foulRiskBase: 0.54,
  foulRiskMin: 0.44,
  foulRiskMax: 0.8,
  progressiveFoulBase: 0.26,
  progressiveFoulMin: 0.24,
  progressiveFoulMax: 0.42,
  creationBase: 0.47,
  actionRateBase: 0.6,
  actionRateMin: 0.56,
  actionRateMax: 0.76,
  bookingBase: 0.055,
  blowoutGapStart: 6,
  blowoutDampPerPoint: 0.045,
  blowoutDampMin: 0.78,
  subWindows: [58, 70, 80],
  subChaseWindows: [72, 78],
};

export const engineFoulRisk = (rivalTactic, attacker, defender) =>
  clamp(
    ENGINE_TUNING.foulRiskBase +
      rivalTactic.press / 400 +
      Math.max(0, attacker.dribble + attacker.speed - defender.marking - defender.tackling) / 220,
    ENGINE_TUNING.foulRiskMin,
    ENGINE_TUNING.foulRiskMax,
  );

export const engineProgressiveFoulRisk = (otherSide, attacker, defender, tacticalDiscipline) =>
  clamp(
    ENGINE_TUNING.progressiveFoulBase +
      tacticalDiscipline(otherSide) * 0.75 +
      Math.max(0, attacker.dribble - defender.marking) / 210,
    ENGINE_TUNING.progressiveFoulMin,
    ENGINE_TUNING.progressiveFoulMax,
  );

export const engineBlowoutDamp = gap =>
  gap > ENGINE_TUNING.blowoutGapStart
    ? clamp(
        1 - (gap - ENGINE_TUNING.blowoutGapStart) * ENGINE_TUNING.blowoutDampPerPoint,
        ENGINE_TUNING.blowoutDampMin,
        1,
      )
    : 1;

export const matchDifficultyForClub = (club, opponent, isHome) => {
  const ownPower = club?.power ?? 75;
  const oppPower = opponent?.power ?? 75;
  const tableGap = Math.abs((club?.position ?? 10) - (opponent?.position ?? 10));
  return clamp((ownPower - oppPower) / 8 + tableGap / 6 + (isHome ? 1 : 0), -3, 4);
};

/**
 * Escalação simulada — respeita lesões, reabilitação e carga.
 * @param {object} deps — formationRoles, lineupForRoles, injury helpers
 */
export function createSimLineupBuilder(deps) {
  const {
    formationRoles,
    lineupForRoles,
    playerUnavailable,
    playerStarterBlocked,
    playerInRestrictedReturn,
    workloadLabel,
    workloadRisk,
    playerRehabMaxMinutes,
    matchDifficultyForClub: difficultyForClub,
  } = deps;

  const buildSimLineup = (club, opponent, isHome) => {
    const eligible = club.roster.filter(player => !playerUnavailable(player));
    const easyGame = difficultyForClub(club, opponent, isHome) >= 2.5;
    const roles = formationRoles[club.formation] || formationRoles['4-3-3'];
    const starterScore = player => {
      let score = player.overall;
      if (playerStarterBlocked(player)) score -= 30;
      if (easyGame && workloadLabel(player)) score -= 24;
      if (playerInRestrictedReturn(player)) score -= 16;
      if (workloadRisk(player.workload) > 1.12) score -= 10;
      return score;
    };
    const preferred = eligible
      .filter(player => !playerStarterBlocked(player))
      .sort((a, b) => starterScore(b) - starterScore(a));
    const restricted = eligible
      .filter(player => playerInRestrictedReturn(player))
      .sort((a, b) => starterScore(b) - starterScore(a));
    const pool = [...preferred];
    if (pool.length < 11) {
      const benchAvg = pool.length ? pool.reduce((sum, p) => sum + p.overall, 0) / pool.length : 0;
      restricted.forEach(player => {
        if (pool.length < 11 && (benchAvg - player.overall > 6 || pool.length < 8)) pool.push(player);
      });
      eligible.filter(player => !pool.includes(player)).forEach(player => {
        if (pool.length < 11) pool.push(player);
      });
    }
    const assignment = lineupForRoles(pool.slice(0, Math.max(11, pool.length)), roles);
    const lineup = roles.map((_, slot) => assignment.get(slot)).filter(Boolean);
    while (lineup.length < 11 && pool.length > lineup.length) lineup.push(pool[lineup.length]);
    return { lineup: lineup.slice(0, 11), bench: eligible.filter(player => !lineup.includes(player)) };
  };

  const scoreForSide = (state, side) =>
    side === 'home' ? state.homeGoals - state.awayGoals : state.awayGoals - state.homeGoals;

  const substitutionPriority = (state, side, player, minute) => {
    let priority = 0;
    const fatigue = state.fatigue.get(player.name) ?? player.fatigue;
    priority += Math.max(0, 65 - fatigue) * 0.45;
    if (workloadRisk(player.workload) > 1.12) priority += 18;
    const max = playerRehabMaxMinutes(player);
    if (max) {
      const played = state.minutesPlayed.get(player.name) ?? 0;
      if (played >= max - 10) priority += 42;
      else if (played >= max - 18) priority += 20;
    }
    if (state.deferredInjuries.some(entry => entry.name === player.name && !entry.preemptiveSubstitution && !entry.aggravated))
      priority += 28;
    if (scoreForSide(state, side) < 0) priority += minute >= 70 ? 14 : 6;
    return priority;
  };

  return { buildSimLineup, substitutionPriority };
}
