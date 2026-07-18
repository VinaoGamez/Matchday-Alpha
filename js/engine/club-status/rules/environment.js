import { DRAW_POSITION_GAP, ENVIRONMENT_DRIFT_RATE, NEUTRAL } from '../constants.js';

/**
 * Ambiente — moral do vestiário (modelo calibrado).
 * Estável; derrota dói ~2× a vitória; empate contextual via positionGap.
 * positionGap = posiçãoRival − suaPosição (positivo = rival pior na tabela).
 */
export function matchDelta(ctx = {}) {
  const { result, isHome = false, goalDiff = 0, positionGap = null, clamp } = ctx;
  if (!result) return 0;
  const gd = clamp(Number(goalDiff) || 0, -4, 4);

  if (result === 'W') {
    return (isHome ? 1.15 : 0.95) + Math.min(0.55, Math.max(0, gd) * 0.18);
  }
  if (result === 'L') {
    return (isHome ? -2.4 : -1.55) - Math.min(0.7, Math.max(0, -gd) * 0.22);
  }

  // Empate: ok por padrão; frustração vs bem pior; alívio fora vs bem melhor.
  let delta = 0.15;
  if (Number.isFinite(Number(positionGap))) {
    const gap = Number(positionGap);
    if (gap >= DRAW_POSITION_GAP) delta = -0.55;
    else if (!isHome && gap <= -DRAW_POSITION_GAP) delta = 0.45;
  }
  return delta;
}

export function tableDelta(ctx = {}) {
  const { position, clubsCount } = ctx;
  if (!position || !clubsCount) return 0;
  const topBand = Math.max(3, Math.round(clubsCount * 0.15));
  const relegationBand = Math.max(3, Math.round(clubsCount * 0.2));
  if (position <= topBand) return 0.12;
  if (position > clubsCount - relegationBand) return -0.22;
  return 0;
}

export function driftDelta(value) {
  return (NEUTRAL.environment - (Number(value) || NEUTRAL.environment)) * ENVIRONMENT_DRIFT_RATE;
}
