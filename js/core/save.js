import { SAVE_KEYS } from './constants.js';

/** Limites para conter crescimento de save/RAM em carreiras longas. */
export const MEMORY_LIMITS = {
  injuryHistory: 5,
  rankingTitles: 12,
  liveTimeline: 40,
  persistDebounceMs: 400,
  /** Mensagens gravadas no save da temporada (inbox já tem teto próprio). */
  seasonMessages: 80,
  /** Deals de mercado mantidos no save. */
  seasonTransferDeals: 40,
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
      // Libera espaço: live-match é regenerável; histórico grande bloqueia qualquer save.
      localStorage.removeItem(SAVE_KEYS.liveMatch);
      try {
        const hist = localStorage.getItem(SAVE_KEYS.playerHistory);
        // Se a própria gravação do histórico falhou, ou o blob já está enorme, apaga.
        if (key === SAVE_KEYS.playerHistory || (hist && hist.length > 250_000)) {
          localStorage.removeItem(SAVE_KEYS.playerHistory);
        }
      } catch {
        /* ignore */
      }
      localStorage.setItem(key, raw);
      return true;
    } catch (retryError) {
      // Último recurso: limpa histórico e tenta uma vez mais (save de carreira/temporada).
      try {
        localStorage.removeItem(SAVE_KEYS.playerHistory);
        localStorage.removeItem(SAVE_KEYS.liveMatch);
        localStorage.setItem(key, raw);
        return true;
      } catch {
        /* fall through */
      }
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
  // playerHistory (matchday-player-history) NÃO é limpo aqui — sobrevive entre temporadas.
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
export function clearCareerStorage({ clearTraining = true, clearPlayerHistory = true } = {}) {
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
  if (clearPlayerHistory && SAVE_KEYS.playerHistory) {
    try {
      localStorage.removeItem(SAVE_KEYS.playerHistory);
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
  };
  if (keepData && game.data) compact.data = { ...game.data };
  const homeGoalsList = game.goals?.home || [];
  const awayGoalsList = game.goals?.away || [];
  if (homeGoalsList.length || awayGoalsList.length) {
    compact.goals = { home: [...homeGoalsList], away: [...awayGoalsList] };
  }
  // Metadados de mata-mata — necessários para reabrir confrontos.
  if (game.competition) compact.competition = game.competition;
  if (game.leg) compact.leg = game.leg;
  if (game.tieId) compact.tieId = game.tieId;
  if (game.penalties) compact.penalties = game.penalties;
  if (game.shootoutWinner) compact.shootoutWinner = game.shootoutWinner;
  if (game.shootoutPenalties) compact.shootoutPenalties = game.shootoutPenalties;
  if (game.winner) compact.winner = game.winner;
  if (game.completed) compact.completed = true;
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

const workloadIsActive = workload => {
  if (!workload || typeof workload !== 'object') return false;
  return (
    Number(workload.minutesLast7Days) > 0 ||
    Number(workload.minutesLast14Days) > 0 ||
    Number(workload.matchesLast14Days) > 0 ||
    Number(workload.consecutiveStarts) > 0 ||
    Number(workload.highIntensityLoad) > 0 ||
    Number(workload.lastMatchRound) > 0
  );
};

const disciplineIsActive = discipline => {
  if (!discipline || typeof discipline !== 'object') return false;
  if (Number(discipline.suspendedGames) > 0) return true;
  if (discipline.competitionCards && Object.keys(discipline.competitionCards).length) return true;
  return Number(discipline.yellow) > 0 || Number(discipline.red) > 0;
};

/** Fadiga esparsa: só jogadores abaixo de 100 (fresh = omitido). */
export function slimFatigueSnapshot(clubs) {
  const out = {};
  Object.entries(clubs || {}).forEach(([clubName, club]) => {
    const tired = {};
    (club.roster || []).forEach(player => {
      const value = Math.round((Number(player.fatigue) || 100) * 10) / 10;
      if (value < 99.5) tired[player.name] = value;
    });
    if (Object.keys(tired).length) out[clubName] = tired;
  });
  return out;
}

/**
 * Disponibilidade esparsa.
 * - Clube do usuário: só campos ativos (sem nulls).
 * - IA: só jogadores com lesão/disciplina/carga relevante.
 */
export function slimAvailabilitySnapshot(clubs, userClub) {
  const out = {};
  Object.entries(clubs || {}).forEach(([clubName, club]) => {
    const isUser = clubName === userClub;
    const players = {};
    (club.roster || []).forEach(player => {
      const injury = player.injury ? { ...player.injury } : null;
      const history =
        isUser || (Array.isArray(player.injuryHistory) && player.injuryHistory.length)
          ? pruneInjuryHistory(player.injuryHistory)
          : [];
      const workload = workloadIsActive(player.workload) ? { ...player.workload } : null;
      const discipline = disciplineIsActive(player.discipline) ? { ...player.discipline } : null;
      if (!isUser && !injury && !history.length && !workload && !discipline) return;
      const entry = {};
      if (injury) entry.injury = injury;
      if (history.length) entry.injuryHistory = history;
      if (workload) entry.workload = workload;
      if (discipline) entry.discipline = discipline;
      if (Object.keys(entry).length) players[player.name] = entry;
    });
    if (Object.keys(players).length) out[clubName] = players;
  });
  return out;
}

/** Remove blobs pesados das fixtures da Série D (data/events de sim). */
export function slimSerieDFixturesForSave(fixtures) {
  if (!Array.isArray(fixtures)) return [];
  return fixtures.map(round => {
    if (!Array.isArray(round)) return round;
    return round.map(game => {
      if (!game || typeof game !== 'object') return game;
      const slim = {
        home: game.home,
        away: game.away,
        round: game.round,
        competition: game.competition,
        tieId: game.tieId,
        leg: game.leg,
        knockoutRound: game.knockoutRound,
        twoLegged: game.twoLegged,
        completed: !!game.completed,
      };
      if (game.homeGoals != null) slim.homeGoals = game.homeGoals;
      if (game.awayGoals != null) slim.awayGoals = game.awayGoals;
      if (game.penalties) slim.penalties = game.penalties;
      if (game.shootoutWinner) slim.shootoutWinner = game.shootoutWinner;
      if (game.shootoutPenalties) slim.shootoutPenalties = game.shootoutPenalties;
      if (game.winner) slim.winner = game.winner;
      if (game.date) {
        slim.date = game.date instanceof Date ? game.date.toISOString() : game.date;
      }
      if (game.time) slim.time = game.time;
      return slim;
    });
  });
}

/** Compacta fixture de copa no save (stats só do clube do usuário). */
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
    completed: !!game.completed,
  };
  if (game.homeGoals != null) compact.homeGoals = game.homeGoals;
  if (game.awayGoals != null) compact.awayGoals = game.awayGoals;
  if (game.penalties) compact.penalties = game.penalties;
  if (game.winner) compact.winner = game.winner;
  if (game.shootoutWinner) compact.shootoutWinner = game.shootoutWinner;
  if (game.shootoutPenalties) compact.shootoutPenalties = game.shootoutPenalties;
  if (keepData && game.data) compact.data = { ...game.data };
  const homeGoalsList = game.goals?.home || [];
  const awayGoalsList = game.goals?.away || [];
  if (keepData && (homeGoalsList.length || awayGoalsList.length)) {
    compact.goals = { home: [...homeGoalsList], away: [...awayGoalsList] };
  }
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
