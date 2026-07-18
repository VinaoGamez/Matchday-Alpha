import {
  BOARD_CHEAP_RESULT_FINANCES,
  BOARD_CHEAP_RESULT_SCALE,
  BOARD_DRIFT_RATE,
  BOARD_FINANCE_GAP_SOFT_CAP,
  BOARD_FINANCE_PRESSURE_THRESHOLD,
  BOARD_RUNWAY_PRESSURE_ROUNDS,
  DRAW_POSITION_GAP,
  NEUTRAL,
  STATUS_MIN,
} from '../constants.js';

const dampPositiveIfBroke = (delta, finances) => {
  const fin = Number(finances);
  if (!(delta > 0) || !Number.isFinite(fin) || fin >= BOARD_CHEAP_RESULT_FINANCES) return delta;
  return delta * BOARD_CHEAP_RESULT_SCALE;
};

/**
 * Diretoria — projeto / PPG / posição + acoplamento com Finanças.
 * Resultado conta menos que Ambiente/Torcida; ignora público.
 * positionGap = posiçãoRival − suaPosição (positivo = rival pior na tabela).
 */
export function matchDelta(ctx = {}) {
  const { result, isHome = false, goalDiff = 0, positionGap = null, finances = null, clamp } = ctx;
  if (!result) return 0;
  const gd = clamp(Number(goalDiff) || 0, -4, 4);

  let delta = 0;
  if (result === 'W') {
    delta = 0.7 + Math.min(0.3, Math.max(0, gd) * 0.1);
  } else if (result === 'L') {
    delta = -1.15 - Math.min(0.35, Math.max(0, -gd) * 0.1);
  } else {
    // Empate: cobrança de projeto / obrigação.
    delta = -0.15;
    if (Number.isFinite(Number(positionGap))) {
      const gap = Number(positionGap);
      if (gap >= DRAW_POSITION_GAP) delta = -0.65;
      else if (!isHome && gap <= -DRAW_POSITION_GAP) delta = 0.25;
      else if (isHome) delta = -0.25;
    } else if (isHome) {
      delta = -0.25;
    }
  }
  return dampPositiveIfBroke(delta, finances);
}

export function tableDelta(ctx = {}) {
  const { position, clubsCount, points, played, finances = null, clamp } = ctx;
  if (!played || played < 1 || !position || !clubsCount) return 0;
  const ppg = points / played;
  const relative = (ppg - 1.35) * 0.55;
  const relegationBand = Math.max(3, Math.round(clubsCount * 0.2));
  const topBand = Math.max(3, Math.round(clubsCount * 0.15));
  let delta = clamp(relative, -0.7, 0.7);
  if (position <= topBand) delta += 0.35;
  else if (position > clubsCount - relegationBand) delta -= 0.55;
  delta = clamp(delta, -1.1, 0.95);
  return dampPositiveIfBroke(delta, finances);
}

export function driftDelta(value) {
  return (NEUTRAL.board - (Number(value) || NEUTRAL.board)) * BOARD_DRIFT_RATE;
}

/**
 * Pressão financeira sobre a Diretoria (por rodada).
 * Finanças baixas, cobertura curta ou shortfall de folha corroem o apoio da mesa
 * mesmo com campanha mediana — sem demitir só por dinheiro.
 */
export function financePressureDelta({
  finances = null,
  runwayRounds = 99,
  shortfall = false,
  clamp = (v, min, max) => Math.min(max, Math.max(min, v)),
} = {}) {
  let delta = 0;
  const fin = Number(finances);
  if (Number.isFinite(fin) && fin < BOARD_FINANCE_PRESSURE_THRESHOLD) {
    const span = BOARD_FINANCE_PRESSURE_THRESHOLD - STATUS_MIN;
    const depth = span > 0 ? (BOARD_FINANCE_PRESSURE_THRESHOLD - fin) / span : 1;
    delta -= 0.3 + clamp(depth, 0, 1) * 0.5;
  }
  if (Number.isFinite(Number(runwayRounds)) && Number(runwayRounds) < BOARD_RUNWAY_PRESSURE_ROUNDS) {
    delta -= Number(runwayRounds) < 1 ? 0.55 : Number(runwayRounds) < 2 ? 0.4 : 0.25;
  }
  if (shortfall) delta -= 0.45;
  if (!(delta < 0)) return 0;
  return clamp(delta, -1.2, 0);
}

/**
 * Impede Diretoria disparar longe das Finanças (ex.: 90% vs 59%).
 */
export function financeGapCeilingDelta({
  board = null,
  finances = null,
  clamp = (v, min, max) => Math.min(max, Math.max(min, v)),
} = {}) {
  const b = Number(board);
  const f = Number(finances);
  if (!Number.isFinite(b) || !Number.isFinite(f)) return 0;
  const gap = b - f;
  if (gap <= BOARD_FINANCE_GAP_SOFT_CAP) return 0;
  const excess = gap - BOARD_FINANCE_GAP_SOFT_CAP;
  return clamp(-(0.25 + excess * 0.035), -1.1, 0);
}
