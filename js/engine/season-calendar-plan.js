/**
 * Plano anual mutável — orçamento de datas por competição dentro do ano da temporada.
 * Novas competições: registrar em COMPETITION_DATE_REGISTRY e (se mata-mata) CUP_PHASE_SCHEDULE / band.
 */

export const SEASON_CALENDAR_BOUNDS = {
  start: [0, 1],
  end: [11, 31],
};

/** Faixas do ano civil para distribuir fases da Copa. */
export const CALENDAR_BANDS = {
  early: { start: [1, 10], end: [3, 31] },
  mid: { start: [4, 1], end: [5, 31] },
  late: { start: [8, 1], end: [11, 28] },
};

/** Fases da Copa — slots de agenda (1 = jogo único; 2 = ida + volta). */
export const CUP_PHASE_SCHEDULE = [
  { index: 1, slots: 1, twoLegged: false, band: 'early' },
  { index: 2, slots: 1, twoLegged: false, band: 'early' },
  { index: 3, slots: 1, twoLegged: false, band: 'early' },
  { index: 4, slots: 1, twoLegged: false, band: 'early' },
  { index: 5, slots: 2, twoLegged: true, band: 'mid' },
  { index: 6, slots: 2, twoLegged: true, band: 'late' },
  { index: 7, slots: 2, twoLegged: true, band: 'late' },
  { index: 8, slots: 2, twoLegged: true, band: 'late' },
  { index: 9, slots: 1, twoLegged: false, band: 'late' },
];

/**
 * Registro extensível de competições e carga de datas no ano.
 * matchDays = janelas de agenda consumidas (rodadas / jogos de mata-mata).
 */
export const COMPETITION_DATE_REGISTRY = {
  league: {
    id: 'league',
    label: 'Campeonato Nacional',
    matchDays: 38,
    weight: 38,
  },
  cup: {
    id: 'cup',
    label: 'Copa do Brasil',
    matchDays: CUP_PHASE_SCHEDULE.reduce((sum, p) => sum + p.slots, 0),
    weight: CUP_PHASE_SCHEDULE.reduce((sum, p) => sum + p.slots, 0),
    phases: CUP_PHASE_SCHEDULE,
    bands: CALENDAR_BANDS,
  },
  serie_d_knockout: {
    id: 'serie_d_knockout',
    label: 'Série D · mata-mata',
    matchDays: 12,
    weight: 12,
    band: { start: [7, 15], end: [10, 31] },
  },
};

export function totalSeasonMatchBudget(registry = COMPETITION_DATE_REGISTRY) {
  return Object.values(registry).reduce((sum, spec) => sum + (spec.matchDays || spec.weight || 0), 0);
}

export function seasonBounds(seasonYear) {
  const y = Number(seasonYear) || 2026;
  return {
    start: new Date(y, SEASON_CALENDAR_BOUNDS.start[0], SEASON_CALENDAR_BOUNDS.start[1], 12, 0, 0, 0),
    end: new Date(y, SEASON_CALENDAR_BOUNDS.end[0], SEASON_CALENDAR_BOUNDS.end[1], 12, 0, 0, 0),
  };
}

export function seasonStartDate(seasonYear) {
  return seasonBounds(seasonYear).start;
}

export function seasonEndDate(seasonYear) {
  return seasonBounds(seasonYear).end;
}

function normalizeNoon(date) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  return next;
}

export function clampToSeason(date, seasonYear) {
  const { start, end } = seasonBounds(seasonYear);
  const d = normalizeNoon(date);
  if (d.getTime() < start.getTime()) return new Date(start);
  if (d.getTime() > end.getTime()) return new Date(end);
  return d;
}

function bandToRange(seasonYear, band) {
  const y = Number(seasonYear) || 2026;
  return {
    start: new Date(y, band.start[0], band.start[1], 12, 0, 0, 0),
    end: new Date(y, band.end[0], band.end[1], 12, 0, 0, 0),
  };
}

/** Distribui N dias de jogo uniformemente na faixa (inclusive extremos). */
export function distributeMatchDaysInBand(seasonYear, band, count) {
  if (count <= 0) return [];
  const { start, end } = bandToRange(seasonYear, band);
  if (count === 1) return [normalizeNoon(start)];
  const span = end.getTime() - start.getTime();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start.getTime() + (span * index) / (count - 1));
    return normalizeNoon(date);
  });
}

function twoLegPairInBand(seasonYear, band, twoLegGapDays = 7) {
  const { start, end } = bandToRange(seasonYear, band);
  const ida = normalizeNoon(new Date(start.getTime() + (end.getTime() - start.getTime()) * 0.38));
  let volta = normalizeNoon(new Date(ida.getTime() + twoLegGapDays * 86400000));
  if (volta.getTime() > end.getTime()) {
    volta = normalizeNoon(end);
    const idaBack = normalizeNoon(new Date(volta.getTime() - twoLegGapDays * 86400000));
    return [clampToSeason(idaBack, seasonYear), clampToSeason(volta, seasonYear)];
  }
  return [clampToSeason(ida, seasonYear), clampToSeason(volta, seasonYear)];
}

/** Mapa phaseIndex → [ida, volta?] — sempre dentro do ano da temporada. */
export function buildCupPhaseNominalDates(seasonYear, {
  registry = COMPETITION_DATE_REGISTRY,
  twoLegGapDays = 7,
} = {}) {
  const cup = registry.cup;
  const bands = cup.bands;
  const byBand = { early: [], mid: [], late: [] };
  cup.phases.forEach(phase => byBand[phase.band].push(phase));

  const earlyDates = distributeMatchDaysInBand(seasonYear, bands.early, byBand.early.length);
  const result = {};

  byBand.early.forEach((phase, index) => {
    result[phase.index] = [earlyDates[index]];
  });

  byBand.mid.forEach(phase => {
    result[phase.index] = twoLegPairInBand(seasonYear, bands.mid, twoLegGapDays);
  });

  const lateSlotCount = byBand.late.reduce((sum, phase) => sum + phase.slots, 0);
  const lateDates = distributeMatchDaysInBand(seasonYear, bands.late, lateSlotCount);
  let cursor = 0;
  byBand.late.forEach(phase => {
    if (phase.twoLegged) {
      result[phase.index] = [lateDates[cursor++], lateDates[cursor++]];
    } else {
      result[phase.index] = [lateDates[cursor++]];
    }
  });

  return result;
}

/**
 * Rebalanceia jogos pendentes da Copa entre floor e 31/dez (mutável, sem vazar pro ano seguinte).
 */
export function compressPendingCupDates(seasonYear, cupGames, {
  floor = null,
  twoLegGapDays = 7,
} = {}) {
  const { start, end } = seasonBounds(seasonYear);
  const floorDate = clampToSeason(floor || start, seasonYear);
  const pending = [...cupGames]
    .filter(game => !game.completed && game.home && game.away)
    .sort(
      (a, b) =>
        (a.phaseIndex || 0) - (b.phaseIndex || 0)
        || (a.leg === 'VOLTA' ? 1 : 0) - (b.leg === 'VOLTA' ? 1 : 0)
        || (a.gameNumber || 0) - (b.gameNumber || 0),
    );

  if (!pending.length) return;

  const gapMs = twoLegGapDays * 86400000;
  const spanStart = Math.max(floorDate.getTime(), start.getTime());
  const spanEnd = end.getTime();
  if (spanStart >= spanEnd) {
    pending.forEach(game => { game.date = normalizeNoon(end); });
    return;
  }

  const tieIda = new Map();
  const count = pending.length;
  pending.forEach((game, index) => {
    let target = spanStart + ((spanEnd - spanStart) * index) / Math.max(1, count - 1);
    if (game.leg === 'VOLTA' && tieIda.has(game.tieId)) {
      target = Math.max(target, tieIda.get(game.tieId) + gapMs);
    }
    target = Math.min(target, spanEnd);
    const date = normalizeNoon(new Date(target));
    game.date = date;
    if (game.leg !== 'VOLTA') tieIda.set(game.tieId, date.getTime());
  });
}

/** Aplica nominais da Copa a jogos pendentes; comprime se o calendário já passou da janela. */
export function refreshCupNominalDates(seasonYear, cupGames, {
  floor = null,
  twoLegGapDays = 7,
} = {}) {
  const nominals = buildCupPhaseNominalDates(seasonYear, { twoLegGapDays });
  const pending = cupGames.filter(game => !game.completed);
  pending.forEach(game => {
    const phaseDates = nominals[game.phaseIndex];
    if (!phaseDates?.length) return;
    const slot = game.leg === 'VOLTA' ? 1 : 0;
    if (phaseDates[slot]) game.date = normalizeNoon(new Date(phaseDates[slot]));
  });

  const floorDate = floor ? normalizeNoon(floor) : null;
  const needsCompress = floorDate && pending.some(game => normalizeNoon(game.date).getTime() < floorDate.getTime());
  if (needsCompress) compressPendingCupDates(seasonYear, cupGames, { floor: floorDate, twoLegGapDays });

  cupGames.forEach(game => {
    if (game.date) game.date = clampToSeason(game.date, seasonYear);
  });
}

/** Resumo do plano (debug / UI futura). */
export function describeSeasonCalendarPlan(seasonYear, registry = COMPETITION_DATE_REGISTRY) {
  const budget = totalSeasonMatchBudget(registry);
  return Object.values(registry).map(spec => ({
    id: spec.id,
    label: spec.label,
    matchDays: spec.matchDays,
    share: budget > 0 ? Math.round((spec.matchDays / budget) * 100) : 0,
    season: seasonYear,
  }));
}
