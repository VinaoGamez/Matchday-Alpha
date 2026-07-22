import {
  LEAGUE_CALENDAR_WINDOWS,
  DEFAULT_MIN_REST_DAYS,
  ensureLeagueScheduleMaterialized,
  scheduleAllLeagueCompetitions,
  rebuildOccupancyFromLeagueFixtures,
  rescheduleCupFixtures,
  countRestConflicts,
  serializeCompetitionWindows,
  leagueFixturesNeedScheduling,
  nominalRoundDate,
  findAvailableDate,
  createClubOccupancy,
  calendarAdvanceLimitDate,
} from '../js/engine/season-scheduler.js';
import {
  buildCompetitionRoundRobinFixtures,
  slimNationalFixturesForSave,
  hydrateNationalFixtures,
} from '../js/engine/competition-calendar.js';

let passed = 0;
let failed = 0;

const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${label}`);
    console.error(`  ${error.message}`);
  }
};

const assert = (cond, message) => {
  if (!cond) throw new Error(message || 'assertion failed');
};

const teams4 = ['A1', 'A2', 'A3', 'A4'];

check('Materializa datas em todas as rodadas', () => {
  const fixtures = buildCompetitionRoundRobinFixtures(teams4, 'brasileirao');
  const national = { A: { fixtures } };
  assert(leagueFixturesNeedScheduling(national), 'needs scheduling');
  ensureLeagueScheduleMaterialized(2026, national, { windows: LEAGUE_CALENDAR_WINDOWS });
  assert(!leagueFixturesNeedScheduling(national), 'all dated');
  fixtures.flat().forEach(game => {
    assert(game.date instanceof Date, `${game.home} vs ${game.away} date`);
    assert(game.time, `${game.home} time`);
  });
});

check('Descanso mínimo respeitado na liga (4 clubes)', () => {
  const fixtures = buildCompetitionRoundRobinFixtures(teams4, 'brasileirao');
  const national = { A: { fixtures } };
  const occupancy = scheduleAllLeagueCompetitions(2026, national);
  assert(countRestConflicts(occupancy, DEFAULT_MIN_REST_DAYS) === 0, 'rest conflicts');
});

check('Persistência slim/hydrate preserva date/time', () => {
  const fixtures = buildCompetitionRoundRobinFixtures(teams4, 'brasileirao');
  const national = { A: { fixtures } };
  ensureLeagueScheduleMaterialized(2026, national);
  const slim = slimNationalFixturesForSave(fixtures);
  assert(slim[0][0].date, 'slim date');
  assert(slim[0][0].time, 'slim time');
  const back = hydrateNationalFixtures(slim, fixtures.length);
  assert(back[0][0].date instanceof Date, 'hydrate date');
  assert(back[0][0].time === slim[0][0].time, 'hydrate time');
});

check('Rebuild occupancy a partir de jogos materializados', () => {
  const fixtures = buildCompetitionRoundRobinFixtures(teams4, 'brasileirao');
  const national = { A: { fixtures } };
  scheduleAllLeagueCompetitions(2026, national);
  const occupancy = rebuildOccupancyFromLeagueFixtures(national);
  assert(occupancy.size > 0, 'clubs occupied');
  assert(countRestConflicts(occupancy, DEFAULT_MIN_REST_DAYS) === 0, 'no conflicts after rebuild');
});

check('Copa re-agenda respeitando ocupação da liga', () => {
  const fixtures = buildCompetitionRoundRobinFixtures(teams4, 'brasileirao');
  const national = { A: { fixtures } };
  const occupancy = scheduleAllLeagueCompetitions(2026, national);
  const cupGames = [
    { home: 'A1', away: 'A2', date: nominalRoundDate(2026, 1, 6, LEAGUE_CALENDAR_WINDOWS.A), leg: 'IDA', tieId: 'T1' },
    { home: 'A2', away: 'A1', date: nominalRoundDate(2026, 2, 6, LEAGUE_CALENDAR_WINDOWS.A), leg: 'VOLTA', tieId: 'T1' },
  ];
  rescheduleCupFixtures(cupGames, occupancy, { minRestDays: DEFAULT_MIN_REST_DAYS, twoLegGapDays: 7, seasonYear: 2026 });
  cupGames.forEach(game => {
    assert(game.date instanceof Date, 'cup dated');
    assert(game.date.getFullYear() === 2026, String(game.date));
  });
  assert(cupGames[1].date.getTime() >= cupGames[0].date.getTime() + 7 * 86400000, 'volta gap');
  assert(countRestConflicts(occupancy, DEFAULT_MIN_REST_DAYS) === 0, 'cup + league rest');
});

check('serializeCompetitionWindows gera ISO por divisão', () => {
  const windows = serializeCompetitionWindows(2026);
  assert(windows.A?.start === '2026-04-11', windows.A?.start);
  assert(windows.D?.end === '2026-09-13', windows.D?.end);
});

check('findAvailableDate evita conflito no mesmo clube', () => {
  const occupancy = createClubOccupancy();
  const base = new Date(2026, 2, 15, 12);
  occupancy.set('Clube X', [base.getTime()]);
  const next = findAvailableDate(occupancy, 'Clube X', 'Clube Y', {
    nominalDate: base,
    maxDate: new Date(2026, 11, 31, 12),
    minRestDays: DEFAULT_MIN_REST_DAYS,
  });
  const gap = (DEFAULT_MIN_REST_DAYS + 1) * 86400000;
  assert(Math.abs(next.getTime() - base.getTime()) >= gap, `gap=${Math.abs(next - base)}`);
  assert(next.getFullYear() === 2026, String(next));
});

check('calendarAdvanceLimitDate = 31/dez (sem ano seguinte)', () => {
  const limit = calendarAdvanceLimitDate(2027);
  assert(limit.getFullYear() === 2027, String(limit));
  assert(limit.getMonth() === 11 && limit.getDate() === 31, String(limit));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
