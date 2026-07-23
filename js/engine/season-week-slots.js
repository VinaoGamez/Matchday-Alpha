/**
 * Slots semanais por competição — calendário paralelo (molde CBF 2026).
 * Perfil ativo: Qua (Copa/meio de semana) + Dom (Série A) + Sáb (B/C/D).
 */
import { cupPhaseLegSlot } from './season-calendar-mold.js';

export const WEEKDAY = Object.freeze({
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
});

export const MATCH_WEEK_PROFILES = Object.freeze({
  /** Molde CBF 2026: Qua (CBR/meio) + Dom (BSA) + Sáb (BSB/BSC/BSD). */
  cbf_2026: Object.freeze({
    midweek: Object.freeze({ weekdays: [WEEKDAY.WED], defaultTime: '21:30' }),
    midweek_alt: Object.freeze({ weekdays: [WEEKDAY.THU], defaultTime: '21:30' }),
    weekend: Object.freeze({ weekdays: [WEEKDAY.SUN], defaultTime: '16:00' }),
    weekend_b: Object.freeze({ weekdays: [WEEKDAY.SAT], defaultTime: '16:00' }),
    knockout_ida: Object.freeze({ weekdays: [WEEKDAY.SUN], defaultTime: '18:00' }),
  }),
  /** Legado Qua/Sáb (testes / perfil alternativo). */
  wed_sat: Object.freeze({
    midweek: Object.freeze({ weekdays: [WEEKDAY.WED], defaultTime: '21:30' }),
    midweek_alt: Object.freeze({ weekdays: [WEEKDAY.THU], defaultTime: '21:30' }),
    weekend: Object.freeze({ weekdays: [WEEKDAY.SAT], defaultTime: '16:00' }),
    weekend_b: Object.freeze({ weekdays: [WEEKDAY.SAT], defaultTime: '16:00' }),
    knockout_ida: Object.freeze({ weekdays: [WEEKDAY.SAT], defaultTime: '16:00' }),
  }),
  /** Qui/Dom. */
  thu_sun: Object.freeze({
    midweek: Object.freeze({ weekdays: [WEEKDAY.THU], defaultTime: '21:30' }),
    midweek_alt: Object.freeze({ weekdays: [WEEKDAY.WED], defaultTime: '21:30' }),
    weekend: Object.freeze({ weekdays: [WEEKDAY.SUN], defaultTime: '16:00' }),
    weekend_b: Object.freeze({ weekdays: [WEEKDAY.SUN], defaultTime: '16:00' }),
    knockout_ida: Object.freeze({ weekdays: [WEEKDAY.SUN], defaultTime: '18:00' }),
  }),
});

/** Perfil ativo — alinhado ao calendário CBF 2026. */
export const ACTIVE_WEEK_PROFILE = 'cbf_2026';

export const MATCH_WEEK_SLOTS = MATCH_WEEK_PROFILES[ACTIVE_WEEK_PROFILE];

/**
 * Competição → slot semanal padrão.
 * Divisões nacionais usam league_a / league_b etc. (ver season-calendar-mold.js).
 */
export const COMPETITION_WEEK_SLOT_MAP = Object.freeze({
  league: 'weekend',
  league_a: 'weekend',
  league_b: 'weekend_b',
  league_c: 'weekend_b',
  league_d: 'weekend_b',
  cup: 'midweek',
  serie_d_knockout: 'midweek',
  // ——— futuras (molde CBF; enabled: false) ———
  state_league: 'weekend_b',
  recopa_national: 'knockout_ida',
  libertadores: 'midweek_alt',
  sudamericana: 'midweek_alt',
  recopa_sudamericana: 'midweek_alt',
  regional_cup: 'midweek',
  fifa_friendlies: null,
  world_cup: null,
});

export function getCompetitionSlotKey(competitionId) {
  const slot = COMPETITION_WEEK_SLOT_MAP[competitionId];
  if (slot === null) return null;
  return slot || 'weekend';
}

export function getSlotWeekdays(slotKey, profile = MATCH_WEEK_SLOTS) {
  if (!slotKey) return [];
  return profile[slotKey]?.weekdays || profile.weekend.weekdays;
}

export function getCompetitionWeekdays(competitionId, profile = MATCH_WEEK_SLOTS) {
  const slotKey = getCompetitionSlotKey(competitionId);
  if (!slotKey) return [];
  return getSlotWeekdays(slotKey, profile);
}

/** Weekdays de uma perna da Copa; mata-mata domingo inclui quarta como overflow (molde CBF). */
export function getCupLegWeekdays(phaseIndex, leg = 'IDA', profile = MATCH_WEEK_SLOTS) {
  const slotKey = cupPhaseLegSlot(phaseIndex, leg);
  const primary = getSlotWeekdays(slotKey, profile);
  if (slotKey === 'knockout_ida') {
    return [...new Set([...primary, ...getSlotWeekdays('midweek', profile)])];
  }
  return primary;
}

export function getSlotDefaultTime(slotKey, profile = MATCH_WEEK_SLOTS) {
  return profile[slotKey]?.defaultTime || '19:00';
}

function normalizeNoon(date) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  return next;
}

export function isWeekdayMatch(date, weekdays) {
  return weekdays.includes(normalizeNoon(date).getDay());
}

export function snapToNextWeekday(date, weekdays) {
  const cursor = normalizeNoon(date);
  for (let step = 0; step < 7; step += 1) {
    if (weekdays.includes(cursor.getDay())) return new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
  return normalizeNoon(date);
}

export function snapToNearestWeekday(date, weekdays) {
  const base = normalizeNoon(date);
  let best = null;
  let bestDist = Infinity;
  for (let offset = -3; offset <= 3; offset += 1) {
    const candidate = normalizeNoon(new Date(base));
    candidate.setDate(candidate.getDate() + offset);
    if (!weekdays.includes(candidate.getDay())) continue;
    const dist = Math.abs(offset);
    if (dist < bestDist || (dist === bestDist && offset > 0)) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best || snapToNextWeekday(date, weekdays);
}

export function listSlotDatesInRange(start, end, weekdays) {
  const from = normalizeNoon(start);
  const to = normalizeNoon(end);
  const dates = [];
  let cursor = snapToNextWeekday(from, weekdays);
  while (cursor.getTime() <= to.getTime()) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return dates;
}

/** União de slots para vários dias da semana (ex.: dom + qua overflow). */
export function collectMultiWeekdaySlots(start, end, weekdays) {
  const seen = new Map();
  weekdays.forEach(day => {
    listSlotDatesInRange(start, end, [day]).forEach(date => {
      seen.set(date.getTime(), date);
    });
  });
  return [...seen.values()].sort((a, b) => a - b);
}

export function pickSlotDatesEvenly(start, end, weekdays, count) {
  if (count <= 0) return [];
  const bandEnd = normalizeNoon(end);
  const slots = listSlotDatesInRange(start, end, weekdays);
  if (!slots.length) return [snapToNearestWeekday(bandEnd, weekdays)];
  if (count === 1) return [slots[Math.floor(slots.length / 2)]];
  if (slots.length >= count) {
    return Array.from({ length: count }, (_, index) => {
      const slotIndex = Math.round((index * (slots.length - 1)) / Math.max(1, count - 1));
      return new Date(slots[slotIndex]);
    });
  }
  const result = [...slots];
  let cursor = new Date(slots[slots.length - 1]);
  while (result.length < count) {
    cursor.setDate(cursor.getDate() + 7);
    if (cursor.getTime() > bandEnd.getTime()) break;
    result.push(normalizeNoon(cursor));
  }
  while (result.length < count) {
    result.push(new Date(result[result.length - 1] || snapToNearestWeekday(bandEnd, weekdays)));
  }
  return result.slice(0, count);
}

export function buildWeeklyCadenceDates(start, end, weekdays, count) {
  if (count <= 0) return [];
  const to = normalizeNoon(end);
  const dates = [];
  let cursor = snapToNextWeekday(start, weekdays);
  while (dates.length < count && cursor.getTime() <= to.getTime()) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  while (dates.length < count) {
    const last = dates[dates.length - 1] || snapToNearestWeekday(to, weekdays);
    const next = normalizeNoon(new Date(last));
    next.setDate(next.getDate() + 7);
    if (next.getTime() > to.getTime()) {
      dates.push(new Date(to));
      break;
    }
    dates.push(next);
  }
  return dates.slice(0, count);
}

export function twoLegSlotPairInBand(start, end, idaWeekdays, voltaWeekdays, legGapWeeks = 1) {
  const bandEnd = normalizeNoon(end);
  const ida = pickSlotDatesEvenly(start, end, idaWeekdays, 1)[0];
  let volta = snapToNearestWeekday(
    normalizeNoon(new Date(ida.getTime() + 7 * legGapWeeks * 86400000)),
    voltaWeekdays,
  );
  if (volta.getTime() > bandEnd.getTime()) {
    volta = snapToNearestWeekday(bandEnd, voltaWeekdays);
    const fixedIda = normalizeNoon(new Date(volta));
    fixedIda.setDate(fixedIda.getDate() - 7 * legGapWeeks);
    return [snapToNearestWeekday(fixedIda, idaWeekdays), volta];
  }
  return [ida, volta];
}

/** @deprecated use twoLegSlotPairInBand com ida/volta weekdays distintos */
export function twoLegSlotPairSameBand(start, end, weekdays, legGapWeeks = 1) {
  return twoLegSlotPairInBand(start, end, weekdays, weekdays, legGapWeeks);
}
