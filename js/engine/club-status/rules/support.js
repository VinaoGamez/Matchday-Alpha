import { DRAW_POSITION_GAP, NEUTRAL, SUPPORT_DRIFT_RATE } from '../constants.js';

/**
 * Apoio da torcida — resultado manda; lotação/preço só nuance em casa.
 * positionGap = posiçãoRival − suaPosição (positivo = rival pior na tabela).
 */
export function matchDelta(ctx = {}) {
  const { result, isHome = false, goalDiff = 0, positionGap = null, fillRate = null, clamp } = ctx;
  if (!result) return 0;
  const gd = clamp(Number(goalDiff) || 0, -4, 4);
  let delta = 0;

  if (result === 'W') {
    delta = (isHome ? 1.35 : 1.55) + Math.min(0.85, Math.max(0, gd) * 0.28);
  } else if (result === 'L') {
    delta = (isHome ? -2.55 : -1.65) - Math.min(0.75, Math.max(0, -gd) * 0.25);
  } else {
    delta = 0;
    if (Number.isFinite(Number(positionGap))) {
      const gap = Number(positionGap);
      if (gap >= DRAW_POSITION_GAP) delta = -0.7;
      else if (!isHome && gap <= -DRAW_POSITION_GAP) delta = 0.45;
      else if (isHome) delta = -0.2;
    } else if (isHome) {
      delta = -0.2;
    }
  }

  // Lotação: só mando de casa, leve — preço impacta caixa; aqui é nuance.
  if (isHome && Number.isFinite(Number(fillRate))) {
    const fill = Number(fillRate);
    if (result === 'W') {
      if (fill >= 0.82) delta += 0.35;
      else if (fill >= 0.7) delta += 0.15;
      else if (fill <= 0.42) delta -= 0.25;
      else if (fill <= 0.52) delta -= 0.12;
    } else if (result === 'L') {
      if (fill >= 0.82) delta -= 0.25;
      else if (fill <= 0.42) delta -= 0.15;
    } else if (fill >= 0.82) {
      delta -= 0.1;
    } else if (fill <= 0.42) {
      delta -= 0.15;
    }
  }

  return delta;
}

export function tableDelta(ctx = {}) {
  const { position, clubsCount } = ctx;
  if (!position || !clubsCount) return 0;
  const topBand = Math.max(3, Math.round(clubsCount * 0.15));
  const relegationBand = Math.max(3, Math.round(clubsCount * 0.2));
  if (position <= topBand) return 0.18;
  if (position > clubsCount - relegationBand) return -0.32;
  return 0;
}

export function driftDelta(value) {
  return (NEUTRAL.support - (Number(value) || NEUTRAL.support)) * SUPPORT_DRIFT_RATE;
}
