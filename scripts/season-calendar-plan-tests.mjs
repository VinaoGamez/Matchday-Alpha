import {
  buildCupPhaseNominalDates,
  compressPendingCupDates,
  COMPETITION_DATE_REGISTRY,
  seasonBounds,
  seasonEndDate,
  totalSeasonMatchBudget,
  clampToSeason,
} from '../js/engine/season-calendar-plan.js';
import {
  rescheduleCupFixtures,
  createClubOccupancy,
  scheduleAllLeagueCompetitions,
  findAvailableDate,
  countRestConflicts,
  DEFAULT_MIN_REST_DAYS,
} from '../js/engine/season-scheduler.js';
import { WEEKDAY, getCupLegWeekdays } from '../js/engine/season-week-slots.js';
import { buildCompetitionRoundRobinFixtures } from '../js/engine/competition-calendar.js';

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

const inSeason = (date, year) => date.getFullYear() === year;

check('orçamento: nacional + copa + Série D mata-mata', () => {
  const total = totalSeasonMatchBudget();
  assert(total >= 38 + 13, String(total));
  const leagueShare = Math.round((COMPETITION_DATE_REGISTRY.league.matchDays / total) * 100);
  assert(leagueShare > 50, `league share ${leagueShare}%`);
});

check('Copa: nominais das 9 fases ficam no ano da temporada', () => {
  const year = 2027;
  const nominals = buildCupPhaseNominalDates(year);
  for (let phase = 1; phase <= 9; phase += 1) {
    assert(Array.isArray(nominals[phase]), `phase ${phase}`);
    nominals[phase].forEach(date => assert(inSeason(date, year), `${phase} ${date}`));
    if (nominals[phase].length === 2) {
      assert(nominals[phase][1] >= nominals[phase][0], 'ida before volta');
    }
  }
});

check('Copa: mata-mata e final em paralelo ao Brasileirão A (antes de 6/dez)', () => {
  const year = 2026;
  const nominals = buildCupPhaseNominalDates(year);
  const leagueEnd = new Date(year, 11, 6, 12);
  for (const phase of [6, 7, 8, 9]) {
    nominals[phase].forEach(date => {
      assert(date.getTime() <= leagueEnd.getTime(), `fase ${phase} ${date.toISOString()} após liga`);
    });
  }
  assert(nominals[6][0].getMonth() >= 6, 'oitavas a partir de jul/agosto');
  assert(nominals[9][0].getTime() <= leagueEnd.getTime(), 'final antes do fim da Série A');
});

check('compressPendingCupDates: remarca dentro da janela da fase (não joga tudo em dez)', () => {
  const year = 2027;
  const floor = new Date(year, 9, 5, 12);
  const games = [
    { home: 'A', away: 'B', phaseIndex: 7, leg: 'IDA', tieId: 'Q1', completed: false },
    { home: 'B', away: 'A', phaseIndex: 7, leg: 'VOLTA', tieId: 'Q1', completed: false },
  ];
  compressPendingCupDates(year, games, { floor, twoLegGapDays: 3 });
  games.forEach(game => {
    assert(inSeason(game.date, year), String(game.date));
    assert(game.date.getMonth() <= 9, `quartas em out ${game.date}`);
  });
  assert(games[1].date >= games[0].date, 'volta after ida');
});

check('rescheduleCupFixtures: nunca agenda Copa em janeiro do ano seguinte', () => {
  const year = 2027;
  const fixtures = buildCompetitionRoundRobinFixtures(['X', 'Y', 'Z', 'W'], 'brasileirao');
  const national = { A: { fixtures } };
  const occupancy = scheduleAllLeagueCompetitions(year, national);
  const cupGames = [
    {
      home: 'X',
      away: 'Y',
      date: new Date(year, 11, 20, 12),
      leg: 'IDA',
      tieId: 'K1',
      phaseIndex: 7,
      completed: false,
    },
    {
      home: 'Y',
      away: 'X',
      date: new Date(year, 11, 27, 12),
      leg: 'VOLTA',
      tieId: 'K1',
      phaseIndex: 7,
      completed: false,
    },
  ];
  rescheduleCupFixtures(cupGames, occupancy, {
    careerFloor: new Date(year, 11, 31, 12),
    seasonYear: year,
    twoLegGapDays: 3,
  });
  cupGames.forEach(game => assert(inSeason(game.date, year), String(game.date)));
});

check('findAvailableDate respeita maxDate = 31/dez', () => {
  const year = 2027;
  const maxDate = seasonEndDate(year);
  const occupancy = createClubOccupancy();
  const next = findAvailableDate(occupancy, 'A', 'B', {
    nominalDate: new Date(year, 11, 30, 12),
    minDate: new Date(year, 11, 31, 12),
    maxDate,
  });
  assert(inSeason(next, year), String(next));
  assert(next.getTime() <= maxDate.getTime(), String(next));
});

check('Copa: fases 1–5 em quartas; mata-mata ida dom / volta qua (molde CBF)', () => {
  const year = 2026;
  const nominals = buildCupPhaseNominalDates(year);
  for (let phase = 1; phase <= 5; phase += 1) {
    nominals[phase].forEach(date => {
      assert(date.getDay() === WEEKDAY.WED, `fase ${phase} ${date} not Wed`);
    });
  }
  assert(nominals[6][0].getDay() === WEEKDAY.SUN, 'oitavas ida dom');
  assert(nominals[6][1].getDay() === WEEKDAY.WED, 'oitavas volta qua');
  assert(nominals[9][0].getDay() === WEEKDAY.SUN, 'final dom');
});

check('Liga + Copa (20 clubes): zero conflitos Qua/Dom', () => {
  const year = 2026;
  const teams = Array.from({ length: 20 }, (_, index) => `T${index}`);
  const fixtures = buildCompetitionRoundRobinFixtures(teams, 'brasileirao');
  const national = { A: { fixtures } };
  const occupancy = scheduleAllLeagueCompetitions(year, national);
  fixtures.flat().forEach(game => {
    assert(game.date.getDay() === WEEKDAY.SUN, `liga ${game.date} not Sun`);
  });

  const nominals = buildCupPhaseNominalDates(year);
  const cupTeams = teams.slice(0, 8);
  const cupGames = [];
  let tie = 0;
  for (const phase of [6, 7, 8, 9]) {
    const dates = nominals[phase];
    const pairs = phase === 9
      ? [[cupTeams[0], cupTeams[1]]]
      : [[cupTeams[0], cupTeams[1]], [cupTeams[2], cupTeams[3]]];
    pairs.forEach(([home, away]) => {
      tie += 1;
      const tieId = `K${tie}`;
      if (phase === 9) {
        cupGames.push({
          home, away, phaseIndex: phase, leg: 'JOGO ÚNICO', tieId,
          completed: false, date: new Date(dates[0]),
        });
      } else {
        cupGames.push({
          home, away, phaseIndex: phase, leg: 'IDA', tieId,
          completed: false, date: new Date(dates[0]),
        });
        cupGames.push({
          home: away, away: home, phaseIndex: phase, leg: 'VOLTA', tieId,
          completed: false, date: new Date(dates[1]),
        });
      }
    });
  }

  rescheduleCupFixtures(cupGames, occupancy, { seasonYear: year, twoLegGapDays: 7 });
  cupGames.forEach(game => {
    const leg = game.leg === 'VOLTA' ? 'VOLTA' : 'IDA';
    const allowed = getCupLegWeekdays(game.phaseIndex, leg);
    assert(allowed.includes(game.date.getDay()), `${game.phaseIndex} ${game.leg} ${game.date}`);
  });
  assert(countRestConflicts(occupancy, DEFAULT_MIN_REST_DAYS) === 0, 'rest conflicts');
});

check('clampToSeason mantém datas dentro do ano', () => {
  const year = 2027;
  const { end } = seasonBounds(year);
  const clamped = clampToSeason(new Date(year + 1, 0, 3, 12), year);
  assert(clamped.getTime() === end.getTime(), String(clamped));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
