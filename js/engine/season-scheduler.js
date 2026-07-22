/**
 * Motor de agenda mutável — janelas por competição, datas materializadas e descanso mínimo.
 */
import {
  seasonBounds,
  seasonEndDate as planSeasonEndDate,
  clampToSeason,
  refreshCupNominalDates,
} from './season-calendar-plan.js';

/** Janelas nacionais (início/fim por divisão) — inspiradas na CBF. */
export const LEAGUE_CALENDAR_WINDOWS = {
  A: { start: [3, 11], end: [11, 6], priority: 2, matchCount: 38 },
  B: { start: [2, 14], end: [10, 28], priority: 2, matchCount: 38 },
  C: { start: [3, 18], end: [10, 24], priority: 2, matchCount: null },
  D: { start: [3, 5], end: [8, 13], priority: 2, matchCount: 10 },
};

export const DEFAULT_FIXTURE_TIMES = ['19:00', '21:30', '16:00', '20:00'];
export const DEFAULT_MIN_REST_DAYS = 3;
export const DEFAULT_TWO_LEG_GAP_DAYS = 7;

const MS_DAY = 86400000;

export function windowToDates(season, window) {
  const year = Number(season) || 2026;
  return {
    start: new Date(year, window.start[0], window.start[1], 12, 0, 0, 0),
    end: new Date(year, window.end[0], window.end[1], 12, 0, 0, 0),
  };
}

/** Data nominal de rodada por interpolação na janela (seed inicial). */
export function nominalRoundDate(season, round, totalRounds, window) {
  const { start, end } = windowToDates(season, window);
  const rounds = Math.max(2, totalRounds || 2);
  const progress = Math.max(0, Math.min(1, (round - 1) / (rounds - 1)));
  const date = new Date(start.getTime() + (end.getTime() - start.getTime()) * progress);
  date.setHours(12, 0, 0, 0);
  return date;
}

export function createClubOccupancy() {
  return new Map();
}

export function reserveClubDate(occupancy, club, date) {
  if (!club || !date) return;
  if (!occupancy.has(club)) occupancy.set(club, []);
  occupancy.get(club).push(normalizeNoon(date).getTime());
}

export function unreserveClubDate(occupancy, club, timestamp) {
  const list = occupancy.get(club);
  if (!list) return;
  const index = list.indexOf(timestamp);
  if (index >= 0) list.splice(index, 1);
}

function normalizeNoon(date) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  return next;
}

/** Último dia do calendário da carreira (31/dez — sem estender pro ano seguinte). */
export function calendarAdvanceLimitDate(seasonYear) {
  return planSeasonEndDate(seasonYear);
}

export { seasonBounds, clampToSeason, planSeasonEndDate as seasonCalendarEndDate };

export function minimumMatchGapMs(minRestDays = DEFAULT_MIN_REST_DAYS) {
  return (minRestDays + 1) * MS_DAY;
}

export function isDateAvailable(occupancy, club, date, minRestDays = DEFAULT_MIN_REST_DAYS) {
  const gap = minimumMatchGapMs(minRestDays);
  const ts = normalizeNoon(date).getTime();
  return !(occupancy.get(club) || []).some(existing => Math.abs(existing - ts) < gap);
}

export function clubsAvailable(occupancy, home, away, date, minRestDays) {
  return isDateAvailable(occupancy, home, date, minRestDays)
    && isDateAvailable(occupancy, away, date, minRestDays);
}

/**
 * Encontra data livre para dois clubes, buscando a partir de nominal/minDate.
 */
export function findAvailableDate(occupancy, home, away, {
  nominalDate,
  minDate = null,
  maxDate = null,
  minRestDays = DEFAULT_MIN_REST_DAYS,
  maxSearchDays = 60,
} = {}) {
  const maxBound = maxDate ? normalizeNoon(maxDate) : null;
  const minBound = minDate ? normalizeNoon(minDate) : null;
  let base = normalizeNoon(
    minBound && minBound.getTime() > normalizeNoon(nominalDate).getTime() ? minBound : nominalDate,
  );
  if (maxBound && base.getTime() > maxBound.getTime()) base = new Date(maxBound);

  for (let offset = 0; offset <= maxSearchDays; offset += 1) {
    for (const sign of offset === 0 ? [0] : [-1, 1]) {
      const date = normalizeNoon(new Date(base));
      date.setDate(date.getDate() + offset * sign);
      if (minBound && date.getTime() < minBound.getTime()) continue;
      if (maxBound && date.getTime() > maxBound.getTime()) continue;
      if (clubsAvailable(occupancy, home, away, date, minRestDays)) return date;
    }
  }

  if (maxBound) {
    let cursor = new Date(maxBound);
    const floor = minBound || normalizeNoon(nominalDate);
    while (cursor.getTime() >= floor.getTime()) {
      if (clubsAvailable(occupancy, home, away, cursor, minRestDays)) return new Date(cursor);
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  const fallback = normalizeNoon(new Date(base));
  const seasonCap = maxBound?.getTime() ?? null;
  do {
    if (minBound && fallback.getTime() < minBound.getTime()) {
      fallback.setDate(fallback.getDate() + 1);
      continue;
    }
    if (seasonCap != null && fallback.getTime() > seasonCap) break;
    if (clubsAvailable(occupancy, home, away, fallback, minRestDays)) return fallback;
    fallback.setDate(fallback.getDate() + 1);
  } while (!seasonCap || fallback.getTime() <= seasonCap);

  return maxBound ? new Date(maxBound) : normalizeNoon(nominalDate);
}

export function unreserveScheduledGame(occupancy, game) {
  if (!game?._reservedTs) return;
  unreserveClubDate(occupancy, game.home, game._reservedTs);
  unreserveClubDate(occupancy, game.away, game._reservedTs);
  game._reservedTs = null;
}

/** Materializa date/time em um jogo e reserva clubes. */
export function scheduleGameOnOccupancy(game, occupancy, {
  nominalDate,
  minDate = null,
  maxDate = null,
  minRestDays = DEFAULT_MIN_REST_DAYS,
  time = null,
} = {}) {
  if (!game?.home || !game?.away) return game;
  unreserveScheduledGame(occupancy, game);
  const scheduled = findAvailableDate(occupancy, game.home, game.away, {
    nominalDate: nominalDate || new Date(),
    minDate,
    maxDate,
    minRestDays,
  });
  game.date = scheduled;
  game.time = time || game.time || DEFAULT_FIXTURE_TIMES[0];
  game._reservedTs = scheduled.getTime();
  reserveClubDate(occupancy, game.home, scheduled);
  reserveClubDate(occupancy, game.away, scheduled);
  return game;
}

/** Distribui datas do pontos corridos (rodada sincronizada, horários escalonados). */
export function scheduleLeagueDivision(season, division, fixtures, {
  window = LEAGUE_CALENDAR_WINDOWS[division],
  fixtureTimes = DEFAULT_FIXTURE_TIMES,
  minRestDays = DEFAULT_MIN_REST_DAYS,
  occupancy = createClubOccupancy(),
} = {}) {
  if (!window || !Array.isArray(fixtures)) return occupancy;
  const maxDate = planSeasonEndDate(season);
  const rounds = fixtures.length;
  fixtures.forEach((roundGames, roundIndex) => {
    if (!Array.isArray(roundGames)) return;
    const roundDate = clampToSeason(nominalRoundDate(season, roundIndex + 1, rounds, window), season);
    roundGames.forEach((game, gameIndex) => {
      scheduleGameOnOccupancy(game, occupancy, {
        nominalDate: roundDate,
        maxDate,
        minRestDays,
        time: fixtureTimes[gameIndex % fixtureTimes.length],
      });
      if (game.date) game.date = clampToSeason(game.date, season);
    });
  });
  return occupancy;
}

/** Agenda todas as divisões nacionais (A→D). */
export function scheduleAllLeagueCompetitions(season, nationalCompetitions, options = {}) {
  const occupancy = createClubOccupancy();
  const windows = options.windows || LEAGUE_CALENDAR_WINDOWS;
  const fixtureTimes = options.fixtureTimes || DEFAULT_FIXTURE_TIMES;
  const minRestDays = options.minRestDays ?? DEFAULT_MIN_REST_DAYS;
  ['A', 'B', 'C', 'D'].forEach(division => {
    const comp = nationalCompetitions?.[division];
    if (!comp?.fixtures?.length) return;
    scheduleLeagueDivision(season, division, comp.fixtures, {
      window: windows[division],
      fixtureTimes,
      minRestDays,
      occupancy,
    });
  });
  return occupancy;
}

/** Reconstrói ocupação a partir de jogos já materializados. */
export function rebuildOccupancyFromLeagueFixtures(nationalCompetitions, occupancy = createClubOccupancy()) {
  ['A', 'B', 'C', 'D'].forEach(division => {
    const rounds = nationalCompetitions?.[division]?.fixtures;
    if (!Array.isArray(rounds)) return;
    rounds.flat().forEach(game => {
      if (!game?.home || !game?.away || !game.date) return;
      const date = normalizeNoon(game.date);
      game.date = date;
      game._reservedTs = date.getTime();
      reserveClubDate(occupancy, game.home, date);
      reserveClubDate(occupancy, game.away, date);
    });
  });
  return occupancy;
}

/** Re-agenda Copa do Brasil respeitando ocupação (liga + fases anteriores), sempre no ano da temporada. */
export function rescheduleCupFixtures(cupGames, occupancy, {
  minRestDays = DEFAULT_MIN_REST_DAYS,
  twoLegGapDays = DEFAULT_TWO_LEG_GAP_DAYS,
  careerFloor = null,
  seasonYear = null,
} = {}) {
  const year = Number(seasonYear)
    || (cupGames.find(game => game?.date)?.date?.getFullYear?.())
    || new Date().getFullYear();
  const maxDate = planSeasonEndDate(year);
  const floor = careerFloor ? normalizeNoon(careerFloor) : null;

  refreshCupNominalDates(year, cupGames, { floor, twoLegGapDays });

  const twoLegGapMs = twoLegGapDays * MS_DAY;
  const tieIdaDates = new Map();

  [...cupGames]
    .sort(
      (a, b) =>
        normalizeNoon(a.date).getTime() - normalizeNoon(b.date).getTime()
        || (a.gameNumber || 0) - (b.gameNumber || 0)
        || (a.leg === 'VOLTA' ? 1 : 0) - (b.leg === 'VOLTA' ? 1 : 0),
    )
    .forEach(game => {
      if (game.completed) return;
      let minDate = game.leg === 'VOLTA' && tieIdaDates.has(game.tieId)
        ? new Date(tieIdaDates.get(game.tieId) + twoLegGapMs)
        : null;
      if (floor && normalizeNoon(game.date).getTime() < floor.getTime()) {
        if (!minDate || minDate.getTime() < floor.getTime()) minDate = new Date(floor);
      }
      scheduleGameOnOccupancy(game, occupancy, {
        nominalDate: clampToSeason(game.date, year),
        minDate: minDate ? clampToSeason(minDate, year) : null,
        maxDate,
        minRestDays,
        time: game.time,
      });
      game.date = clampToSeason(game.date, year);
      if (game.leg !== 'VOLTA') tieIdaDates.set(game.tieId, game.date.getTime());
    });
}

/** Data efetiva de um jogo (materializada ou fallback por rodada). */
export function gameScheduledDate(game, fallbackDate = null) {
  if (game?.date) return normalizeNoon(game.date);
  if (fallbackDate) return normalizeNoon(fallbackDate);
  return null;
}

/** Conta conflitos de descanso (< minRestDays) na ocupação. */
export function countRestConflicts(occupancy, minRestDays = DEFAULT_MIN_REST_DAYS) {
  const gap = minimumMatchGapMs(minRestDays);
  let total = 0;
  occupancy.forEach(dates => {
    const ordered = [...dates].sort((a, b) => a - b);
    total += ordered.slice(1).filter((ts, index) => ts - ordered[index] < gap).length;
  });
  return total;
}

/** Janelas serializáveis para o save (extensível: estadual, continental…). */
export function serializeCompetitionWindows(season, windows = LEAGUE_CALENDAR_WINDOWS) {
  const year = Number(season) || 2026;
  return Object.fromEntries(
    Object.entries(windows).map(([key, window]) => {
      const { start, end } = windowToDates(year, window);
      return [key, {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
        priority: window.priority ?? 2,
        matchCount: window.matchCount ?? null,
      }];
    }),
  );
}

/** Liga precisa de materialização de datas? */
export function leagueFixturesNeedScheduling(nationalCompetitions) {
  return Object.values(nationalCompetitions || {}).some(comp =>
    (comp.fixtures || []).flat().some(game => game?.home && game?.away && !game.date),
  );
}

/** Garante Date em todos os jogos de liga a partir do save ou gera novo calendário. */
export function ensureLeagueScheduleMaterialized(season, nationalCompetitions, options = {}) {
  if (!leagueFixturesNeedScheduling(nationalCompetitions)) {
    return rebuildOccupancyFromLeagueFixtures(nationalCompetitions);
  }
  return scheduleAllLeagueCompetitions(season, nationalCompetitions, options);
}
