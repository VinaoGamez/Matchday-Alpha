import { SAVE_KEYS } from './constants.js';

/** Limites para conter crescimento de save/RAM em carreiras longas. */
export const MEMORY_LIMITS = {
  injuryHistory: 5,
  rankingTitles: 12,
  liveTimeline: 40,
  persistDebounceMs: 300,
};

export function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Grava JSON com proteção de cota. Retorna false se falhar.
 * Em QuotaExceeded, remove chave legada e tenta de novo uma vez.
 */
export function writeJson(key, value) {
  let raw;
  try {
    raw = JSON.stringify(value);
  } catch (error) {
    console.warn('[matchday] falha ao serializar save', key, error);
    return false;
  }

  try {
    localStorage.setItem(key, raw);
    return true;
  } catch (error) {
    const quota =
      error?.name === 'QuotaExceededError' ||
      error?.code === 22 ||
      error?.code === 1014;
    if (!quota) {
      console.warn('[matchday] falha ao gravar save', key, error);
      return false;
    }
    try {
      localStorage.removeItem(SAVE_KEYS.liveMatch);
      localStorage.setItem(key, raw);
      return true;
    } catch (retryError) {
      console.warn('[matchday] cota de localStorage esgotada', key, retryError);
      try {
        window.dispatchEvent(new CustomEvent('matchday:save-quota', { detail: { key } }));
      } catch {
        /* ignore */
      }
      return false;
    }
  }
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

/** Flag one-shot: impede persistSeason no beforeunload (Novo Jogo / troca de carreira). */
const SKIP_PERSIST_ONCE_KEY = 'matchday-skip-persist-once';

export function markSkipPersistOnce() {
  try {
    sessionStorage.setItem(SKIP_PERSIST_ONCE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function consumeSkipPersistOnce() {
  try {
    if (!sessionStorage.getItem(SKIP_PERSIST_ONCE_KEY)) return false;
    sessionStorage.removeItem(SKIP_PERSIST_ONCE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Limpa carreira + temporada + live (+ treino opcional) para liberar cota
 * e evitar conflito ao iniciar Novo Jogo.
 */
export function clearCareerStorage({ clearTraining = true } = {}) {
  try {
    localStorage.removeItem(SAVE_KEYS.career);
  } catch {
    /* ignore */
  }
  clearSeasonSave();
  if (clearTraining) {
    try {
      localStorage.removeItem(SAVE_KEYS.training);
    } catch {
      /* ignore */
    }
  }
}

export function hydrateMessages(season, valid) {
  if (!valid || !Array.isArray(season?.careerMessages)) return [];
  return season.careerMessages.map(message => ({ ...message, read: !!message.read }));
}

export function pruneInjuryHistory(history, limit = MEMORY_LIMITS.injuryHistory) {
  if (!Array.isArray(history) || !history.length) return [];
  const trimmed = history.length > limit ? history.slice(-limit) : history;
  return trimmed.map(entry => ({ ...entry }));
}

export function pruneRankingTitles(titles, limit = MEMORY_LIMITS.rankingTitles) {
  if (!Array.isArray(titles) || !titles.length) return [];
  const trimmed = titles.length > limit ? titles.slice(-limit) : titles;
  return trimmed.map(entry => ({ ...entry }));
}

export function involvesClub(game, clubName) {
  return !!(clubName && game && (game.home === clubName || game.away === clubName));
}

/** Compacta um resultado de partida para RAM/disco (sem events/fatigue/etc.). */
export function compactMatchResult(game, { keepData = false } = {}) {
  if (!game) return null;
  const compact = {
    home: game.home,
    away: game.away,
    homeGoals: game.homeGoals,
    awayGoals: game.awayGoals,
    data: keepData && game.data ? { ...game.data } : null,
    goals: game.goals
      ? { home: [...(game.goals.home || [])], away: [...(game.goals.away || [])] }
      : null,
  };
  // Público/bilheteria: necessário para resumo de temporada (ledger/mensagens são podados).
  if (Number.isFinite(Number(game.attendance))) {
    compact.attendance = Math.round(Number(game.attendance));
    if (Number.isFinite(Number(game.fillRate))) compact.fillRate = Number(game.fillRate);
  }
  if (Number.isFinite(Number(game.gateRevenue))) compact.gateRevenue = Number(game.gateRevenue);
  if (game.gateCredited) compact.gateCredited = true;
  return compact;
}

function compactUserStats(userStats) {
  if (!userStats) return null;
  return {
    home: { ...userStats.home },
    away: { ...userStats.away },
    goals: {
      home: [...(userStats.goals?.home || [])],
      away: [...(userStats.goals?.away || [])],
    },
  };
}

/** Compacta histórico de rodadas (extraído/estendido do motor legado). */
export function compactRoundHistory(history = [], userClub = null) {
  return history.map(item => ({
    round: item.round,
    games: (item.games || []).map(game =>
      compactMatchResult(game, { keepData: involvesClub(game, userClub) })
    ),
    userStats: compactUserStats(item.userStats),
  }));
}

export function compactCompetitionHistories(histories = {}, userClub = null) {
  return Object.fromEntries(
    Object.entries(histories).map(([division, history]) => [
      division,
      compactRoundHistory(history || [], userClub),
    ])
  );
}

/** Só persiste artilheiros/assistentes com produção (>0). */
export function slimLeaderboard(rows, metric) {
  return (rows || [])
    .filter(row => (Number(row?.[metric]) || 0) > 0)
    .map(row => ({
      name: row.name,
      club: row.club,
      division: row.division,
      games: row.games || 0,
      [metric]: row[metric],
      tieValue: row.tieValue || 0,
    }));
}

/** Snapshot magro de disponibilidade nacional. */
export function slimAvailabilitySnapshot(clubs, userClub) {
  return Object.fromEntries(
    Object.entries(clubs).map(([clubName, club]) => [
      clubName,
      Object.fromEntries(
        (club.roster || []).map(player => {
          const history =
            clubName === userClub || (Array.isArray(player.injuryHistory) && player.injuryHistory.length)
              ? pruneInjuryHistory(player.injuryHistory)
              : [];
          return [
            player.name,
            {
              injury: player.injury ? { ...player.injury } : null,
              injuryHistory: history,
              workload: player.workload ? { ...player.workload } : null,
              discipline: player.discipline ? { ...player.discipline } : null,
            },
          ];
        })
      ),
    ])
  );
}

/** Compacta fixture de copa no save (data só do clube do usuário). */
export function compactCupFixture(game, userClub) {
  if (!game) return null;
  const keepData = involvesClub(game, userClub);
  const compact = {
    home: game.home,
    away: game.away,
    competition: game.competition,
    phase: game.phase,
    phaseIndex: game.phaseIndex,
    leg: game.leg,
    date: game.date,
    time: game.time,
    gameNumber: game.gameNumber,
    tieId: game.tieId,
    completed: game.completed,
    homeGoals: game.homeGoals,
    awayGoals: game.awayGoals,
    penalties: game.penalties,
    winner: game.winner,
    data: keepData && game.data ? { ...game.data } : null,
    goals: game.goals
      ? { home: [...(game.goals.home || [])], away: [...(game.goals.away || [])] }
      : null,
  };
  if (keepData && Number.isFinite(Number(game.attendance))) {
    compact.attendance = Math.round(Number(game.attendance));
    if (Number.isFinite(Number(game.fillRate))) compact.fillRate = Number(game.fillRate);
  }
  if (keepData && Number.isFinite(Number(game.gateRevenue))) compact.gateRevenue = Number(game.gateRevenue);
  if (keepData && game.gateCredited) compact.gateCredited = true;
  return compact;
}

/** Aplica tetos de histórico in-place nos clubes (RAM). */
export function pruneClubMemory(clubs, rankingEntries) {
  Object.values(clubs || {}).forEach(club => {
    (club.roster || []).forEach(player => {
      if (Array.isArray(player.injuryHistory) && player.injuryHistory.length > MEMORY_LIMITS.injuryHistory) {
        player.injuryHistory = player.injuryHistory.slice(-MEMORY_LIMITS.injuryHistory);
      }
    });
  });
  Object.values(rankingEntries || {}).forEach(entry => {
    if (Array.isArray(entry?.titles) && entry.titles.length > MEMORY_LIMITS.rankingTitles) {
      entry.titles = entry.titles.slice(-MEMORY_LIMITS.rankingTitles);
    }
  });
}
