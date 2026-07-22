/**
 * Políticas de calendário por campeonato — mando de campo, persistência e matching.
 */
import { buildBrazilianLeagueFixtures } from './league-fixtures.js';

/** @typedef {{ type: string, balanceHomeAway?: { enabled: boolean, maxStreak?: number, scope?: string }, persistFixtures?: boolean }} CalendarPolicy */

/** Registry de campeonatos (extensível para estadual, continental, etc.). */
export const COMPETITION_CALENDAR_POLICIES = {
  brasileirao: {
    type: 'round-robin-double',
    balanceHomeAway: { enabled: true, maxStreak: 2, scope: 'first-leg-only' },
    persistFixtures: true,
  },
  'serie-d-groups': {
    type: 'round-robin-double',
    balanceHomeAway: { enabled: true, maxStreak: 2, scope: 'first-leg-only' },
    persistFixtures: true,
  },
  'copa-brasil': {
    type: 'knockout-two-legged',
    balanceHomeAway: { enabled: false },
    persistFixtures: true,
  },
  'serie-d-knockout': {
    type: 'knockout-two-legged',
    balanceHomeAway: { enabled: false },
    persistFixtures: true,
  },
};

/** Chave estável do par (independe de home/away). */
export function fixturePairKey(home, away) {
  const a = String(home || '');
  const b = String(away || '');
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Mesmo confronto na mesma rodada/competição (mando pode diferir). */
export function sameFixturePair(a, b) {
  if (!a || !b) return false;
  const compA = a.competition || 'LEAGUE';
  const compB = b.competition || 'LEAGUE';
  if (compA !== compB) return false;
  if ((a.round ?? null) !== (b.round ?? null)) return false;
  if ((a.tieId ?? null) !== (b.tieId ?? null)) return false;
  if ((a.leg ?? null) !== (b.leg ?? null)) return false;
  return fixturePairKey(a.home, a.away) === fixturePairKey(b.home, b.away);
}

export function gameMatchesRecorded(game, recorded) {
  return sameFixturePair(game, recorded);
}

export function findRecordedGame(game, games = []) {
  if (!game || !Array.isArray(games)) return null;
  return games.find(entry => gameMatchesRecorded(game, entry)) || null;
}

export function getCalendarPolicy(competitionKey) {
  return COMPETITION_CALENDAR_POLICIES[competitionKey] || COMPETITION_CALENDAR_POLICIES.brasileirao;
}

/**
 * Pontos corridos com política do campeonato (Brasileirão, grupos Série D).
 * @param {string[]} clubList
 * @param {string} competitionKey
 */
export function buildCompetitionRoundRobinFixtures(clubList, competitionKey = 'brasileirao') {
  const policy = getCalendarPolicy(competitionKey);
  const balance = policy.balanceHomeAway;
  const options = {
    balanceHomeAway: balance?.enabled !== false,
    maxHomeAwayStreak: balance?.maxStreak ?? 2,
    balanceScope: balance?.scope || 'first-leg-only',
  };
  return buildBrazilianLeagueFixtures(clubList, options);
}

/** Slim para save — identidade do confronto + data materializada. */
export function slimNationalFixturesForSave(fixtures) {
  if (!Array.isArray(fixtures)) return [];
  return fixtures.map(round => {
    if (!Array.isArray(round)) return [];
    return round.map(game => ({
      home: game.home,
      away: game.away,
      round: game.round ?? null,
      competition: game.competition || null,
      date: game.date instanceof Date ? game.date.toISOString() : (game.date || null),
      time: game.time || null,
    }));
  });
}

/** Restaura rodadas salvas (validação mínima). */
export function hydrateNationalFixtures(saved, expectedRounds = null) {
  if (!Array.isArray(saved)) return null;
  if (expectedRounds != null && saved.length !== expectedRounds) return null;
  const hydrated = saved.map(round => {
    if (!Array.isArray(round)) return [];
    return round
      .filter(game => game?.home && game?.away)
      .map(game => ({
        home: game.home,
        away: game.away,
        round: game.round ?? null,
        competition: game.competition || null,
        date: game.date ? new Date(game.date) : null,
        time: game.time || null,
      }));
  });
  if (!hydrated.some(round => round.length > 0)) return null;
  return hydrated;
}

/** Mescla rodada salva (mata-mata) preservando date/time materializados. */
export function mergeSerieDFixtureRound(existing, saved) {
  if (!Array.isArray(saved)) return existing;
  const hydrated = saved
    .filter(game => game?.home && game?.away)
    .map(game => ({
      ...game,
      date: game.date ? new Date(game.date) : null,
      time: game.time || null,
    }));
  if (!Array.isArray(existing)) return hydrated;
  return hydrated.map(savedGame => {
    const match =
      existing.find(entry => gameMatchesRecorded(entry, savedGame))
      || existing.find(
        entry =>
          savedGame.tieId
          && entry.tieId === savedGame.tieId
          && (entry.leg || '') === (savedGame.leg || ''),
      );
    if (!match) return savedGame;
    return {
      ...match,
      ...savedGame,
      date: savedGame.date || match.date,
      time: savedGame.time || match.time,
    };
  });
}

/** Aplica dFixtures do save nas rodadas ≥ fase de grupos (preserva agenda materializada). */
export function applySavedSerieDFixtures(fixtures, savedRounds, groupRounds = 10) {
  if (!Array.isArray(fixtures) || !Array.isArray(savedRounds)) return fixtures;
  savedRounds.forEach((round, index) => {
    if (index < groupRounds || !Array.isArray(round)) return;
    fixtures[index] = mergeSerieDFixtureRound(fixtures[index], round);
  });
  return fixtures;
}
