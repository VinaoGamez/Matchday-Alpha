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
  /**
   * Pênalti por tick (live ~55 advances): base rara; combatividade soma
   * (faltas/min, cartões, pressão, perseguição). Sem teto rígido de quantidade;
   * só amortecimento suave se já houve pênalti no jogo.
   */
  penaltyChanceBase: 0.0007,
  penaltyChanceMin: 0.0003,
  penaltyChanceMax: 0.0075,
  penaltyCombatFoulWeight: 0.0035,
  penaltyCombatCardWeight: 0.0004,
  penaltyCombatRedWeight: 0.0014,
  penaltyCombatPressWeight: 0.0048,
  penaltyCombatChaseWeight: 0.0007,
  penaltyCombatDuelWeight: 0.0011,
  penaltyRepeatSoftDamp: 0.9,
  /** Simulação (IA): chance por boa chegada (~30/jogo; base menor que o live/tick). */
  penaltyChanceOnGoodAttackBase: 0.00155,
  penaltyChanceOnGoodAttackMin: 0.0007,
  penaltyChanceOnGoodAttackMax: 0.012,
  blowoutGapStart: 6,
  blowoutDampPerPoint: 0.045,
  blowoutDampMin: 0.78,
  subWindows: [55, 58, 70, 78, 82],
  subChaseWindows: [72, 78],
};

/** Cansaço por minuto em campo (100 = fresco, 0 = exausto). */
export const fatigueMinuteWear = player =>
  0.28 +
  (player.age >= 33 ? 0.1 : player.age >= 30 ? 0.07 : player.age >= 27 ? 0.035 : 0);

/** Abaixo deste valor o jogador entra na fila de substituição por cansaço. */
export const FATIGUE_SUB_THRESHOLD = 72;

export const engineFoulRisk = (rivalTactic, attacker, defender) =>
  clamp(
    ENGINE_TUNING.foulRiskBase +
      rivalTactic.press / 200 +
      Math.max(0, attacker.dribble + attacker.speed - defender.marking - defender.tackling) / 220,
    ENGINE_TUNING.foulRiskMin,
    ENGINE_TUNING.foulRiskMax,
  );

export const engineProgressiveFoulRisk = (otherSide, attacker, defender, tacticalDiscipline) =>
  clamp(
    ENGINE_TUNING.progressiveFoulBase +
      tacticalDiscipline(otherSide) * 1.05 +
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

/**
 * Chance de pênalti no momento — sobe com combatividade, sem limite rígido.
 * @param {object} ctx
 * @param {number} ctx.minute
 * @param {number} ctx.fouls
 * @param {number} ctx.yellow
 * @param {number} ctx.red
 * @param {number} ctx.pressHome 0–100
 * @param {number} ctx.pressAway 0–100
 * @param {number} [ctx.alreadyAwarded] pênaltis já marcados no jogo
 * @param {boolean} [ctx.scoreChase] placar apertado / perseguição
 * @param {number} [ctx.duelEdge] vantagem de drible vs desarme (−1…1 aprox.)
 */
export const enginePenaltyChance = (ctx = {}) => {
  const minute = Math.max(1, Number(ctx.minute) || 1);
  const fouls = Math.max(0, Number(ctx.fouls) || 0);
  const yellow = Math.max(0, Number(ctx.yellow) || 0);
  const red = Math.max(0, Number(ctx.red) || 0);
  const pressHome = Number(ctx.pressHome) || 50;
  const pressAway = Number(ctx.pressAway) || 50;
  const already = Math.max(0, Number(ctx.alreadyAwarded) || 0);
  const duelEdge = Number(ctx.duelEdge) || 0;
  const foulRate = fouls / minute;
  // Pressão média acima de ~50 começa a aquecer o jogo.
  const pressHeat = Math.max(0, (pressHome + pressAway) / 200 - 0.5);
  const combat =
    foulRate * ENGINE_TUNING.penaltyCombatFoulWeight +
    yellow * ENGINE_TUNING.penaltyCombatCardWeight +
    red * ENGINE_TUNING.penaltyCombatRedWeight +
    pressHeat * ENGINE_TUNING.penaltyCombatPressWeight +
    (ctx.scoreChase ? ENGINE_TUNING.penaltyCombatChaseWeight : 0) +
    Math.max(0, duelEdge) * ENGINE_TUNING.penaltyCombatDuelWeight;
  // Amortece repetição sem proibir: 2º/3º pedem jogo ainda mais pegado.
  const repeatDamp = 1 / (1 + already * ENGINE_TUNING.penaltyRepeatSoftDamp);
  const useSimScale = ctx.forGoodAttack === true;
  const base = useSimScale
    ? ENGINE_TUNING.penaltyChanceOnGoodAttackBase
    : ENGINE_TUNING.penaltyChanceBase;
  const min = useSimScale
    ? ENGINE_TUNING.penaltyChanceOnGoodAttackMin
    : ENGINE_TUNING.penaltyChanceMin;
  const max = useSimScale
    ? ENGINE_TUNING.penaltyChanceOnGoodAttackMax
    : ENGINE_TUNING.penaltyChanceMax;
  const combatScale = useSimScale ? 1.15 : 1;
  return clamp((base + combat * combatScale) * repeatDamp, min, max);
};

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
    priority += Math.max(0, FATIGUE_SUB_THRESHOLD - fatigue) * 0.55;
    if (fatigue < 58) priority += 12;
    if (fatigue < 45) priority += 18;
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
