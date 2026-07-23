/**
 * Calendário da Copa do Mundo — fixtures para a grade/agenda (48 seleções, 12 grupos).
 */

import { isWorldCupYear, WORLD_CUP_WINDOW } from './season-calendar-mold.js';
import { prepareWorldCupEdition, WORLD_CUP_GROUP_LETTERS } from './world-cup-history.js';

export const WORLD_CUP_COMPETITION = 'COPA DO MUNDO';
export const WORLD_CUP_CALENDAR_CODE = 'CMU';

const GROUP_MATCHDAYS = Object.freeze([
  { month: 5, startDay: 1, endDay: 4 },
  { month: 5, startDay: 5, endDay: 10 },
  { month: 5, startDay: 11, endDay: 15 },
]);

/** Mata-mata — datas dentro da janela FIFA (jun/jul). Exportado para geração após fase de grupos. */
export const KNOCKOUT_SCHEDULE = Object.freeze([
  {
    phase: '16 AVOS DE FINAL',
    round: 4,
    slots: [
      { month: 5, day: 18, count: 4 },
      { month: 5, day: 19, count: 4 },
      { month: 5, day: 20, count: 4 },
      { month: 5, day: 21, count: 4 },
    ],
  },
  {
    phase: 'OITAVAS DE FINAL',
    round: 5,
    slots: [
      { month: 5, day: 25, count: 2 },
      { month: 5, day: 26, count: 2 },
      { month: 5, day: 27, count: 2 },
      { month: 5, day: 28, count: 2 },
    ],
  },
  {
    phase: 'QUARTAS DE FINAL',
    round: 6,
    slots: [
      { month: 6, day: 3, count: 1 },
      { month: 6, day: 4, count: 1 },
      { month: 6, day: 5, count: 1 },
      { month: 6, day: 6, count: 1 },
    ],
  },
  {
    phase: 'SEMIFINAL',
    round: 7,
    slots: [
      { month: 6, day: 10, count: 1 },
      { month: 6, day: 11, count: 1 },
    ],
  },
  {
    phase: '3º LUGAR',
    round: 8,
    slots: [{ month: 6, day: 18, count: 1 }],
  },
  {
    phase: 'FINAL',
    round: 9,
    slots: [{ month: 6, day: 19, count: 1 }],
  },
]);

const FIXTURE_TIMES = Object.freeze(['13:00', '16:00', '19:00', '22:00']);

/** Pares de rodada dentro de cada grupo (4 seleções). */
const GROUP_ROUND_PAIRS = Object.freeze([
  [
    [0, 1],
    [2, 3],
  ],
  [
    [0, 2],
    [1, 3],
  ],
  [
    [0, 3],
    [1, 2],
  ],
]);

export function isWorldCupFixture(game) {
  return String(game?.competition || '') === WORLD_CUP_COMPETITION;
}

function dateInWindow(year, month, day) {
  const date = new Date(year, month, day, 12, 0, 0, 0);
  return date;
}

function dayForSlot(window, slotIndex) {
  const span = Math.max(1, window.endDay - window.startDay + 1);
  return window.startDay + (slotIndex % span);
}

/**
 * Gera apenas jogos da fase de grupos (72). Mata-mata entra depois dos resultados.
 * @param {number} seasonYear
 * @param {Array} worldCupHistory
 * @param {Function} [random]
 */
export function buildWorldCupGroupFixtures(seasonYear, worldCupHistory = [], random = Math.random) {
  const year = Number(seasonYear);
  if (!isWorldCupYear(year)) return [];

  const edition = prepareWorldCupEdition(worldCupHistory, year, random);
  const fixtures = [];
  let gameNumber = 1;

  GROUP_ROUND_PAIRS.forEach((dayPairs, mdIndex) => {
    const window = GROUP_MATCHDAYS[mdIndex];
    let mdSlot = 0;

    for (const letter of WORLD_CUP_GROUP_LETTERS) {
      const teams = edition.draw.groups[letter] || [];
      if (teams.length < 4) continue;

      dayPairs.forEach((pair, pairIndex) => {
        const home = teams[pair[0]];
        const away = teams[pair[1]];
        if (!home || !away) return;

        const slot = mdSlot + pairIndex;
        fixtures.push({
          home: home.name,
          away: away.name,
          homeCode: home.code,
          awayCode: away.code,
          competition: WORLD_CUP_COMPETITION,
          phase: `GRUPO ${letter}`,
          group: letter,
          round: mdIndex + 1,
          matchday: mdIndex + 1,
          date: dateInWindow(year, window.month, dayForSlot(window, slot)),
          time: FIXTURE_TIMES[(gameNumber + pairIndex) % FIXTURE_TIMES.length],
          gameNumber: gameNumber++,
          completed: false,
          isNationalTeamFixture: true,
        });
      });
      mdSlot += dayPairs.length;
    }
  });

  const [endMonth, endDay] = WORLD_CUP_WINDOW.end;
  const endCap = dateInWindow(year, endMonth, endDay);

  return fixtures
    .filter(game => game.date <= endCap)
    .sort((a, b) => a.date - b.date || a.gameNumber - b.gameNumber);
}

/** @deprecated Use buildWorldCupGroupFixtures — mantido como alias. */
export function buildWorldCupCalendarFixtures(seasonYear, worldCupHistory = [], random = Math.random) {
  return buildWorldCupGroupFixtures(seasonYear, worldCupHistory, random);
}

export const WORLD_CUP_GROUP_FIXTURE_COUNT = 72;
export const WORLD_CUP_KNOCKOUT_FIXTURE_COUNT = 32;
