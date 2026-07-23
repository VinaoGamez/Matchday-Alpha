/**
 * Copa do Mundo — competição progressiva (grupos → mata-mata conforme resultados).
 */

import { prepareWorldCupEdition } from './world-cup-history.js';
import { buildWorldCupGroupFixtures, WORLD_CUP_COMPETITION } from './world-cup-calendar.js';
import {
  computeAllGroupStandings,
  isGroupStageComplete,
} from './world-cup-standings.js';
import {
  buildKnockoutContext,
  buildKnockoutPhaseFixtures,
  isKnockoutStageComplete,
  loserFromGame,
  recordKnockoutResult,
  winnerFromGame,
} from './world-cup-bracket.js';

const KNOCKOUT_STAGE_ORDER = Object.freeze(['R32', 'R16', 'QF', 'SF', '3P', 'F']);

function cloneGame(game) {
  return {
    ...game,
    date: game.date ? new Date(game.date) : game.date,
  };
}

/** Simulação leve seleções — teamPower da edição (sem elenco de clubes). */
export function simulateNationalTeamMatch(homeCode, awayCode, teamStrength, random = Math.random) {
  const homeMeta = teamStrength?.[homeCode];
  const awayMeta = teamStrength?.[awayCode];
  const homePower = Number(homeMeta?.teamPower) || 85;
  const awayPower = Number(awayMeta?.teamPower) || 85;
  const diff = (homePower - awayPower) / 18;
  const lamH = Math.max(0.35, 1.25 + diff * 0.45 + 0.12);
  const lamA = Math.max(0.35, 1.25 - diff * 0.45);

  const sampleGoals = lambda => {
    let p = Math.exp(-lambda);
    let sum = p;
    const r = random();
    for (let k = 1; k <= 8; k += 1) {
      p = (p * lambda) / k;
      sum += p;
      if (r <= sum) return k;
    }
    return 8;
  };

  let homeGoals = sampleGoals(lamH);
  let awayGoals = sampleGoals(lamA);

  if (homeGoals === awayGoals && random() < 0.28) {
    homeGoals += random() < 0.5 + diff * 0.02 ? 1 : 0;
    if (homeGoals === awayGoals) awayGoals += random() < 0.5 ? 1 : 0;
  }

  return { homeGoals, awayGoals };
}

export function createWorldCupCompetition({
  year,
  worldCupHistory = [],
  random = Math.random,
  saved = null,
}) {
  if (saved?.groupFixtures?.length) {
    return hydrateWorldCupCompetition(saved);
  }

  const edition = prepareWorldCupEdition(worldCupHistory, year, random);
  const groupFixtures = buildWorldCupGroupFixtures(year, worldCupHistory, random);

  return {
    year: Number(year),
    edition: edition.edition,
    teamStrength: edition.teamStrength,
    groupFixtures,
    knockoutFixtures: [],
    knockoutContext: null,
    groupStandings: null,
    phase: 'groups',
    knockoutStage: null,
    champion: null,
    bronze: null,
    knockoutGenerated: false,
  };
}

export function hydrateWorldCupCompetition(saved) {
  return {
    year: Number(saved.year),
    edition: saved.edition ?? null,
    teamStrength: saved.teamStrength || {},
    groupFixtures: (saved.groupFixtures || []).map(cloneGame),
    knockoutFixtures: (saved.knockoutFixtures || []).map(cloneGame),
    knockoutContext: saved.knockoutContext || null,
    groupStandings: saved.groupStandings || null,
    phase: saved.phase || 'groups',
    knockoutStage: saved.knockoutStage || null,
    champion: saved.champion || null,
    bronze: saved.bronze || null,
    knockoutGenerated: !!saved.knockoutGenerated,
  };
}

export function serializeWorldCupCompetition(competition) {
  if (!competition) return null;
  return {
    year: competition.year,
    edition: competition.edition,
    teamStrength: competition.teamStrength,
    groupFixtures: competition.groupFixtures,
    knockoutFixtures: competition.knockoutFixtures,
    knockoutContext: competition.knockoutContext,
    groupStandings: competition.groupStandings,
    phase: competition.phase,
    knockoutStage: competition.knockoutStage,
    champion: competition.champion,
    bronze: competition.bronze,
    knockoutGenerated: competition.knockoutGenerated,
  };
}

export function getWorldCupAllFixtures(competition) {
  if (!competition) return [];
  return [...competition.groupFixtures, ...competition.knockoutFixtures];
}

function applySimResult(game, result) {
  game.homeGoals = result.homeGoals;
  game.awayGoals = result.awayGoals;
  game.completed = true;
  if (game.knockout) {
    const winner = winnerFromGame(game);
    const loser = loserFromGame(game, winner);
    if (winner) {
      game.winnerCode = winner.code;
      game.winner = winner.name;
    }
    return { winner, loser };
  }
  return null;
}

function tryGenerateKnockout(competition, random) {
  if (competition.knockoutGenerated) return false;
  if (!isGroupStageComplete(competition.groupFixtures)) return false;

  competition.groupStandings = computeAllGroupStandings(competition.groupFixtures, random);
  competition.knockoutContext = buildKnockoutContext(competition.groupStandings, random);
  const startNum = Math.max(0, ...competition.groupFixtures.map(g => g.gameNumber || 0)) + 1;
  const r32 = buildKnockoutPhaseFixtures(competition.year, 'R32', competition.knockoutContext, startNum);
  if (!r32.length) return false;

  competition.knockoutFixtures.push(...r32);
  competition.knockoutGenerated = true;
  competition.phase = 'knockout';
  competition.knockoutStage = 'R32';
  return true;
}

function syncKnockoutResults(competition) {
  if (!competition.knockoutContext) return;
  for (const game of competition.knockoutFixtures) {
    if (!game.completed && game.homeGoals == null) continue;
    const winner = winnerFromGame(game);
    const loser = loserFromGame(game, winner);
    if (winner) recordKnockoutResult(competition.knockoutContext, game.id, winner, loser);
  }
}

function tryAdvanceKnockoutStage(competition) {
  if (!competition.knockoutGenerated || !competition.knockoutContext) return false;

  syncKnockoutResults(competition);
  const current = competition.knockoutStage;
  if (!current || !isKnockoutStageComplete(competition.knockoutFixtures, current)) return false;

  if (current === 'F') {
    const finalGame = competition.knockoutFixtures.find(g => g.id === 'F');
    const winner = finalGame ? winnerFromGame(finalGame) : null;
    competition.champion = winner?.code || null;
    competition.phase = 'complete';
    return true;
  }

  if (current === '3P') {
    const bronzeGame = competition.knockoutFixtures.find(g => g.id === '3P');
    const bronzeWinner = bronzeGame ? winnerFromGame(bronzeGame) : null;
    competition.bronze = bronzeWinner?.code || null;
    if (isKnockoutStageComplete(competition.knockoutFixtures, 'F')) {
      competition.knockoutStage = 'F';
      return true;
    }
    competition.knockoutStage = 'F';
    return false;
  }

  const idx = KNOCKOUT_STAGE_ORDER.indexOf(current);
  const nextStage = KNOCKOUT_STAGE_ORDER[idx + 1];
  if (!nextStage) return false;

  if (competition.knockoutFixtures.some(g => g.stage === nextStage)) {
    competition.knockoutStage = nextStage;
    return true;
  }

  const startNum = Math.max(0, ...getWorldCupAllFixtures(competition).map(g => g.gameNumber || 0)) + 1;

  if (current === 'SF') {
    const thirdFixtures = buildKnockoutPhaseFixtures(
      competition.year,
      '3P',
      competition.knockoutContext,
      startNum,
    );
    const finalFixtures = buildKnockoutPhaseFixtures(
      competition.year,
      'F',
      competition.knockoutContext,
      startNum + thirdFixtures.length,
    );
    competition.knockoutFixtures.push(...thirdFixtures, ...finalFixtures);
    competition.knockoutStage = '3P';
    return true;
  }

  const nextFixtures = buildKnockoutPhaseFixtures(
    competition.year,
    nextStage,
    competition.knockoutContext,
    startNum,
  );
  if (!nextFixtures.length) return false;

  competition.knockoutFixtures.push(...nextFixtures);
  competition.knockoutStage = nextStage;
  return true;
}

/**
 * Simula jogos da CMU até a data (CPU). Gera mata-mata quando grupos encerram.
 * @returns {boolean} houve mudança
 */
export function advanceWorldCupThroughDate(competition, date, {
  random = Math.random,
  isUserTeam = () => false,
  simulate = simulateNationalTeamMatch,
} = {}) {
  if (!competition || competition.phase === 'complete') return false;
  const cutoff = date?.getTime?.() ?? 0;
  if (!cutoff) return false;

  let changed = false;

  for (const game of competition.groupFixtures) {
    if (game.completed || game.homeGoals != null) continue;
    if (isUserTeam(game)) continue;
    const when = new Date(game.date).getTime();
    if (when > cutoff) continue;
    const result = simulate(game.homeCode, game.awayCode, competition.teamStrength, random);
    applySimResult(game, result);
    changed = true;
  }

  if (tryGenerateKnockout(competition, random)) changed = true;

  for (const game of competition.knockoutFixtures) {
    if (game.completed || game.homeGoals != null) continue;
    if (isUserTeam(game)) continue;
    const when = new Date(game.date).getTime();
    if (when > cutoff) continue;
    const result = simulate(game.homeCode, game.awayCode, competition.teamStrength, random);
    const ko = applySimResult(game, result);
    if (ko?.winner) recordKnockoutResult(competition.knockoutContext, game.id, ko.winner, ko.loser);
    changed = true;
  }

  while (tryAdvanceKnockoutStage(competition)) changed = true;

  if (competition.phase !== 'groups' && !competition.groupStandings) {
    competition.groupStandings = computeAllGroupStandings(competition.groupFixtures, random);
  }

  return changed;
}

export function isWorldCupUserFixture(game, userNationalTeamName) {
  if (!game || game.competition !== WORLD_CUP_COMPETITION || !userNationalTeamName) return false;
  return game.home === userNationalTeamName || game.away === userNationalTeamName;
}

export function worldCupCalendarSummary(competition) {
  if (!competition) return { groupCount: 0, knockoutCount: 0, totalScheduled: 0 };
  const groupCount = competition.groupFixtures.length;
  const knockoutCount = competition.knockoutFixtures.length;
  return {
    groupCount,
    knockoutCount,
    totalScheduled: groupCount + knockoutCount,
    phase: competition.phase,
    knockoutGenerated: competition.knockoutGenerated,
  };
}
