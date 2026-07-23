/**

 * Plano anual mutável — orçamento de datas por competição dentro do ano da temporada.

 * Molde CBF 2026: season-calendar-mold.js · slots semanais: season-week-slots.js.

 */

import {

  CUP_CALENDAR_BANDS,

  CUP_PHASE_MOLD,

  cupPhaseLegSlot,

} from './season-calendar-mold.js';

import {

  getCompetitionWeekdays,

  getCupLegWeekdays,

  pickSlotDatesEvenly,

  twoLegSlotPairInBand,

  snapToNearestWeekday,

  listSlotDatesInRange,

} from './season-week-slots.js';



export const SEASON_CALENDAR_BOUNDS = {

  start: [0, 1],

  end: [11, 31],

};



/** Faixas da Copa — reexport do molde CBF. */

export const CALENDAR_BANDS = CUP_CALENDAR_BANDS;



/** Fases da Copa — reexport do molde CBF (com slots por perna). */

export const CUP_PHASE_SCHEDULE = CUP_PHASE_MOLD;



export const COMPETITION_DATE_REGISTRY = {

  league: {

    id: 'league',

    label: 'Campeonato Nacional',

    matchDays: 38,

    weight: 38,

    weekSlot: 'weekend',

  },

  cup: {

    id: 'cup',

    label: 'Copa do Brasil',

    matchDays: CUP_PHASE_SCHEDULE.reduce((sum, p) => sum + p.slots, 0),

    weight: CUP_PHASE_SCHEDULE.reduce((sum, p) => sum + p.slots, 0),

    phases: CUP_PHASE_SCHEDULE,

    bands: CALENDAR_BANDS,

    weekSlot: 'midweek',

  },

  serie_d_knockout: {

    id: 'serie_d_knockout',

    label: 'Série D · mata-mata',

    matchDays: 12,

    weight: 12,

    band: { start: [7, 15], end: [10, 31] },

    weekSlot: 'midweek',

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



export function bandToRange(seasonYear, band) {

  const y = Number(seasonYear) || 2026;

  return {

    start: new Date(y, band.start[0], band.start[1], 12, 0, 0, 0),

    end: new Date(y, band.end[0], band.end[1], 12, 0, 0, 0),

  };

}



export function cupPhaseDateRange(seasonYear, phaseIndex, {

  registry = COMPETITION_DATE_REGISTRY,

} = {}) {

  const phase = registry.cup.phases.find(p => p.index === Number(phaseIndex));

  const bandKey = phase?.band || 'knockout_8';

  const band = registry.cup.bands[bandKey] || CALENDAR_BANDS.knockout_8;

  return bandToRange(seasonYear, band);

}



export function cupPhaseMaxDate(seasonYear, phaseIndex, options = {}) {

  return cupPhaseDateRange(seasonYear, phaseIndex, options).end;

}



export function distributeMatchDaysInBand(seasonYear, band, count, {

  competitionId = 'cup',

  phaseIndex = null,

  leg = 'IDA',

} = {}) {

  if (count <= 0) return [];

  const { start, end } = bandToRange(seasonYear, band);

  const weekdays = phaseIndex != null

    ? getCupLegWeekdays(phaseIndex, leg)

    : getCompetitionWeekdays(competitionId);

  return pickSlotDatesEvenly(start, end, weekdays, count)

    .map(date => clampToSeason(date, seasonYear));

}



function twoLegPairInBand(seasonYear, band, phaseIndex, twoLegGapDays = 7) {

  const { start, end } = bandToRange(seasonYear, band);

  const idaWeekdays = getCupLegWeekdays(phaseIndex, 'IDA');

  const voltaWeekdays = getCupLegWeekdays(phaseIndex, 'VOLTA');

  const legGapWeeks = Math.max(1, Math.round(twoLegGapDays / 7));

  const [ida, volta] = twoLegSlotPairInBand(start, end, idaWeekdays, voltaWeekdays, legGapWeeks);

  return [clampToSeason(ida, seasonYear), clampToSeason(volta, seasonYear)];

}



export function buildCupPhaseNominalDates(seasonYear, {

  registry = COMPETITION_DATE_REGISTRY,

  twoLegGapDays = 7,

} = {}) {

  const cup = registry.cup;

  const bands = cup.bands;

  const byBand = { early: [], mid: [], knockout_16: [], knockout_8: [], semi: [], final: [] };

  cup.phases.forEach(phase => {

    if (byBand[phase.band]) byBand[phase.band].push(phase);

  });



  const earlyDates = distributeMatchDaysInBand(seasonYear, bands.early, byBand.early.length);

  const result = {};



  byBand.early.forEach((phase, index) => {

    result[phase.index] = [earlyDates[index]];

  });



  byBand.mid.forEach(phase => {

    result[phase.index] = twoLegPairInBand(seasonYear, bands.mid, phase.index, twoLegGapDays);

  });



  ['knockout_16', 'knockout_8', 'semi'].forEach(bandKey => {

    byBand[bandKey].forEach(phase => {

      result[phase.index] = twoLegPairInBand(seasonYear, bands[bandKey], phase.index, twoLegGapDays);

    });

  });



  byBand.final.forEach(phase => {

    const weekdays = getCupLegWeekdays(phase.index, 'IDA');

    const { start, end } = bandToRange(seasonYear, bands.final);

    const slots = listSlotDatesInRange(start, end, weekdays);

    const pick = slots[0] || snapToNearestWeekday(end, weekdays);

    result[phase.index] = [clampToSeason(pick, seasonYear)];

  });



  return result;

}



export function compressPendingCupDates(seasonYear, cupGames, {

  floor = null,

  twoLegGapDays = 7,

  registry = COMPETITION_DATE_REGISTRY,

} = {}) {

  const floorDate = floor ? clampToSeason(floor, seasonYear) : null;

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

  const byPhase = new Map();

  pending.forEach(game => {

    const key = game.phaseIndex || 0;

    if (!byPhase.has(key)) byPhase.set(key, []);

    byPhase.get(key).push(game);

  });



  byPhase.forEach((games, phaseIndex) => {

    const { start: bandStart, end: bandEnd } = cupPhaseDateRange(seasonYear, phaseIndex, { registry });

    const rangeStart = floorDate && floorDate.getTime() > bandStart.getTime() ? floorDate : bandStart;

    const tieIda = new Map();



    games.forEach((game, index) => {

      const leg = game.leg === 'VOLTA' ? 'VOLTA' : 'IDA';

      const weekdays = getCupLegWeekdays(phaseIndex, leg);

      const slotDates = pickSlotDatesEvenly(

        clampToSeason(rangeStart, seasonYear),

        clampToSeason(bandEnd, seasonYear),

        weekdays,

        games.length,

      );

      let date = slotDates[index] || slotDates[slotDates.length - 1] || snapToNearestWeekday(bandEnd, weekdays);

      if (game.leg === 'VOLTA' && tieIda.has(game.tieId)) {

        const minVolta = tieIda.get(game.tieId) + gapMs;

        if (date.getTime() < minVolta) {

          date = snapToNearestWeekday(new Date(minVolta), weekdays);

        }

      }

      game.date = clampToSeason(normalizeNoon(date), seasonYear);

      if (game.leg !== 'VOLTA') tieIda.set(game.tieId, game.date.getTime());

    });

  });

}



export function refreshCupNominalDates(seasonYear, cupGames, {

  floor = null,

  twoLegGapDays = 7,

  registry = COMPETITION_DATE_REGISTRY,

} = {}) {

  const nominals = buildCupPhaseNominalDates(seasonYear, { twoLegGapDays, registry });

  const pending = cupGames.filter(game => !game.completed);

  const floorDate = floor ? normalizeNoon(floor) : null;



  pending.forEach(game => {

    const phaseDates = nominals[game.phaseIndex];

    if (!phaseDates?.length) return;

    const slot = game.leg === 'VOLTA' ? 1 : 0;

    if (phaseDates[slot]) game.date = normalizeNoon(new Date(phaseDates[slot]));

  });



  const overdue = floorDate

    ? pending.filter(game => normalizeNoon(game.date).getTime() < floorDate.getTime())

    : [];

  if (overdue.length) {

    compressPendingCupDates(seasonYear, cupGames, { floor: floorDate, twoLegGapDays, registry });

  }



  cupGames.forEach(game => {

    if (!game.date || game.completed) return;

    const maxPhase = cupPhaseMaxDate(seasonYear, game.phaseIndex, { registry });

    if (game.date.getTime() > maxPhase.getTime()) {

      game.date = normalizeNoon(maxPhase);

    }

    game.date = clampToSeason(game.date, seasonYear);

  });

}



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



export { cupPhaseLegSlot };


