import { SAVE_KEYS } from './constants.js';

export function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadCareerSave() {
  return readJson(SAVE_KEYS.career, null);
}

export function loadSeasonSave() {
  return readJson(SAVE_KEYS.season, null);
}

export function isSeasonValidForCareer(career, season) {
  return !!(career && season?.seed === career.seed);
}

export function clearSeasonSave() {
  localStorage.removeItem(SAVE_KEYS.season);
  localStorage.removeItem(SAVE_KEYS.liveMatch);
}

export function hydrateMessages(season, valid) {
  if (!valid || !Array.isArray(season?.careerMessages)) return [];
  return season.careerMessages.map(message => ({ ...message, read: !!message.read }));
}

/** Compacta histórico de rodadas para persistência (extraído do motor legado). */
export function compactRoundHistory(history = []) {
  return history.map(item => ({
    round: item.round,
    games: (item.games || []).map(game => ({
      home: game.home,
      away: game.away,
      homeGoals: game.homeGoals,
      awayGoals: game.awayGoals,
      data: game.data ? { ...game.data } : null,
      goals: game.goals
        ? { home: [...(game.goals.home || [])], away: [...(game.goals.away || [])] }
        : null,
    })),
    userStats: item.userStats
      ? {
          home: { ...item.userStats.home },
          away: { ...item.userStats.away },
          goals: {
            home: [...(item.userStats.goals?.home || [])],
            away: [...(item.userStats.goals?.away || [])],
          },
        }
      : null,
  }));
}
