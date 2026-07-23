/**
 * Histórico de jogadores (todos os clubes) — sobrevive a clearSeasonSave.
 * Chave: matchday-player-history
 *
 * matchLogs = buffer só da temporada corrente (cap ≈ nº de jogos do calendário).
 * No finalizeSeason os logs são apagados; permanece players.*.seasons (médias).
 */
import { SAVE_KEYS, SAVE_VERSION, MODULE_VERSIONS } from '../core/constants.js';
import { readJson, writeJson } from '../core/save.js';
import { buildMatchPlayerSheets, playerKey } from './player-match-stats.js';

export const PLAYER_HISTORY_LIMITS = {
  /** Teto de segurança se o orçamento da temporada não for informado. */
  maxMatchLogsPerSeason: 1600,
  maxSeasonArchives: 12,
  maxPlayersSoft: 8000,
};

/** @deprecated use maxMatchLogsPerSeason — mantido para leitores antigos/testes. */
Object.defineProperty(PLAYER_HISTORY_LIMITS, 'maxMatchLogs', {
  enumerable: true,
  get: () => PLAYER_HISTORY_LIMITS.maxMatchLogsPerSeason,
});

const emptyStore = (season = null) => ({
  version: SAVE_VERSION.playerHistory || 1,
  players: {},
  season: season ?? null,
  matchLogs: [],
  seasonArchives: [],
});

function slimLeaders(list, metric, limit = 5) {
  return (list || [])
    .filter(row => (Number(row?.[metric]) || 0) > 0)
    .slice(0, limit)
    .map(row => ({
      name: row.name,
      club: row.club,
      [metric]: Number(row[metric]) || 0,
    }));
}

function ensureSeasonBucket(player, year) {
  const key = String(year);
  if (!player.seasons[key]) {
    player.seasons[key] = {
      apps: 0,
      starts: 0,
      minutes: 0,
      goals: 0,
      assists: 0,
      yellow: 0,
      red: 0,
      passesEst: 0,
      ratingSum: 0,
      ratingCount: 0,
    };
  }
  return player.seasons[key];
}

function applySheetToSeason(player, year, sheet) {
  const bucket = ensureSeasonBucket(player, year);
  bucket.apps += 1;
  if (sheet.started) bucket.starts += 1;
  bucket.minutes += Number(sheet.minutes) || 0;
  bucket.goals += Number(sheet.goals) || 0;
  bucket.assists += Number(sheet.assists) || 0;
  if (sheet.yellow) bucket.yellow += 1;
  if (sheet.red) bucket.red += 1;
  bucket.passesEst += Number(sheet.passesEst) || 0;
  if (sheet.rating != null) {
    bucket.ratingSum += Number(sheet.rating) || 0;
    bucket.ratingCount += 1;
  }
}

/** Média da temporada (passo 0.5), ou null se não houver notas. */
export function seasonAverageRating(bucket) {
  const count = Number(bucket?.ratingCount) || 0;
  if (count <= 0) return null;
  const avg = (Number(bucket.ratingSum) || 0) / count;
  return Math.max(1, Math.min(10, Math.round(avg * 2) / 2));
}

/**
 * Mantém só logs da temporada corrente e aplica cap FIFO.
 * @param {Array} logs
 * @param {number|null} season
 * @param {number} [max]
 */
export function pruneMatchLogsForSeason(
  logs,
  season,
  max = PLAYER_HISTORY_LIMITS.maxMatchLogsPerSeason,
) {
  let next = Array.isArray(logs) ? logs : [];
  if (season != null && Number.isFinite(Number(season))) {
    const year = Number(season);
    next = next.filter(entry => Number(entry.season) === year);
  }
  const cap = Math.max(1, Math.floor(Number(max) || PLAYER_HISTORY_LIMITS.maxMatchLogsPerSeason));
  if (next.length <= cap) return next;
  return next.slice(next.length - cap);
}

function pruneArchives(archives, max = PLAYER_HISTORY_LIMITS.maxSeasonArchives) {
  if (!Array.isArray(archives) || archives.length <= max) return archives || [];
  return archives.slice(archives.length - max);
}

function prunePlayers(players, softMax = PLAYER_HISTORY_LIMITS.maxPlayersSoft) {
  const keys = Object.keys(players || {});
  if (keys.length <= softMax) return players || {};
  const scored = keys.map(key => {
    const seasons = players[key]?.seasons || {};
    const years = Object.keys(seasons).map(Number).filter(Number.isFinite);
    const lastYear = years.length ? Math.max(...years) : 0;
    const apps = years.reduce((sum, year) => sum + (seasons[year]?.apps || 0), 0);
    return { key, lastYear, apps };
  });
  scored.sort((a, b) => b.lastYear - a.lastYear || b.apps - a.apps);
  const keep = new Set(scored.slice(0, softMax).map(row => row.key));
  const next = {};
  keep.forEach(key => {
    next[key] = players[key];
  });
  return next;
}

function stampSeasonAverages(players, year) {
  const key = String(year);
  Object.values(players || {}).forEach(player => {
    const bucket = player?.seasons?.[key];
    if (!bucket) return;
    const avg = seasonAverageRating(bucket);
    if (avg != null) bucket.avgRating = avg;
  });
}

export function loadPlayerHistoryStore() {
  const raw = readJson(SAVE_KEYS.playerHistory, null);
  if (!raw || typeof raw !== 'object') return emptyStore();
  const season = raw.season ?? null;
  return {
    version: Number(raw.version) || SAVE_VERSION.playerHistory || 1,
    players: raw.players && typeof raw.players === 'object' ? raw.players : {},
    season,
    matchLogs: pruneMatchLogsForSeason(
      Array.isArray(raw.matchLogs) ? raw.matchLogs : [],
      season,
    ),
    seasonArchives: Array.isArray(raw.seasonArchives) ? raw.seasonArchives : [],
  };
}

export function savePlayerHistoryStore(store, options = {}) {
  const budget =
    Number(options.matchLogBudget) > 0
      ? Math.ceil(Number(options.matchLogBudget))
      : PLAYER_HISTORY_LIMITS.maxMatchLogsPerSeason;
  const applyOk = payload => {
    store.players = payload.players;
    store.matchLogs = payload.matchLogs;
    store.seasonArchives = payload.seasonArchives;
    store.season = payload.season ?? null;
    return true;
  };
  const payload = {
    version: SAVE_VERSION.playerHistory || 1,
    players: prunePlayers(store.players),
    season: store.season ?? null,
    matchLogs: pruneMatchLogsForSeason(store.matchLogs, store.season ?? null, budget),
    seasonArchives: pruneArchives(store.seasonArchives),
  };
  let rawSize = 0;
  try {
    rawSize = JSON.stringify(payload).length;
  } catch {
    rawSize = 0;
  }
  if (rawSize > 180_000) {
    payload.matchLogs = pruneMatchLogsForSeason(
      payload.matchLogs,
      store.season ?? null,
      Math.max(24, Math.floor(budget / 4)),
    );
    payload.players = prunePlayers(payload.players, 1500);
    payload.seasonArchives = [];
  }
  let ok = writeJson(SAVE_KEYS.playerHistory, payload);
  if (ok) return applyOk(payload);
  // Quota: corta logs pela metade e tenta de novo.
  payload.matchLogs = pruneMatchLogsForSeason(
    payload.matchLogs,
    store.season ?? null,
    Math.max(32, Math.floor(budget / 2)),
  );
  ok = writeJson(SAVE_KEYS.playerHistory, payload);
  if (ok) return applyOk(payload);
  // Ainda cheio: zera logs + arquivos de temporada.
  payload.matchLogs = [];
  payload.seasonArchives = [];
  ok = writeJson(SAVE_KEYS.playerHistory, payload);
  if (ok) return applyOk(payload);
  // Último recurso: corta jogadores pela metade.
  payload.players = prunePlayers(payload.players, Math.max(500, Math.floor(PLAYER_HISTORY_LIMITS.maxPlayersSoft / 2)));
  ok = writeJson(SAVE_KEYS.playerHistory, payload);
  if (ok) return applyOk(payload);
  payload.players = {};
  ok = writeJson(SAVE_KEYS.playerHistory, payload);
  if (ok) return applyOk(payload);
  return false;
}

export function clearPlayerHistoryStore() {
  try {
    localStorage.removeItem(SAVE_KEYS.playerHistory);
  } catch {
    /* ignore */
  }
}

export function createPlayerHistoryEngine(deps = {}) {
  const getClub = typeof deps.getClub === 'function' ? deps.getClub : () => null;
  const getMatchLogBudget =
    typeof deps.getMatchLogBudget === 'function' ? deps.getMatchLogBudget : null;
  let store = loadPlayerHistoryStore();

  const resolveBudget = () => {
    if (!getMatchLogBudget) return PLAYER_HISTORY_LIMITS.maxMatchLogsPerSeason;
    const n = Number(getMatchLogBudget());
    if (!Number.isFinite(n) || n <= 0) return PLAYER_HISTORY_LIMITS.maxMatchLogsPerSeason;
    return Math.max(1, Math.ceil(n));
  };

  const persist = () => {
    store.matchLogs = pruneMatchLogsForSeason(
      store.matchLogs,
      store.season ?? null,
      resolveBudget(),
    );
    store.players = prunePlayers(store.players);
    store.seasonArchives = pruneArchives(store.seasonArchives);
    try {
      localStorage.removeItem(SAVE_KEYS.liveMatch);
    } catch {
      /* ignore */
    }
    return savePlayerHistoryStore(store, { matchLogBudget: resolveBudget() });
  };

  const finalizeSeason = (year, { persist: doPersist = true, nextSeason = null } = {}) => {
    const y = Number(year);
    if (!Number.isFinite(y)) return store;
    // Congela média da temporada e descarta logs jogo a jogo (só rollup fica).
    stampSeasonAverages(store.players, y);
    store.matchLogs = [];
    store.season = nextSeason != null ? nextSeason : y + 1;
    store.players = prunePlayers(store.players);
    if (doPersist) persist();
    return store;
  };

  const ensureSeasonYear = year => {
    if (store.season != null && Number(store.season) !== Number(year)) {
      // Temporada mudou sem finalize — faz rollup defensivo.
      finalizeSeason(store.season, { persist: false });
    }
    store.season = year;
  };

  const recordMatch = (game, meta = {}) => {
    if (!game?.home || !game?.away) return null;
    const season = meta.season ?? store.season;
    if (season == null) return null;
    ensureSeasonYear(season);

    const built = buildMatchPlayerSheets(game, { getClub });
    const allSheets = [...built.home, ...built.away];
    if (!allSheets.length) return null;

    const id =
      meta.id ||
      `${season}-${meta.competition || 'L'}-${meta.round ?? 'x'}-${game.home}-${game.away}-${meta.leg || ''}`;

    // Evita duplicar o mesmo id na temporada corrente.
    if (store.matchLogs.some(entry => entry.id === id)) {
      return store.matchLogs.find(entry => entry.id === id);
    }

    allSheets.forEach(sheet => {
      let player = store.players[sheet.key];
      if (!player) {
        player = { name: sheet.name, club: sheet.club, seasons: {} };
        store.players[sheet.key] = player;
      }
      player.name = sheet.name;
      player.club = sheet.club;
      applySheetToSeason(player, season, sheet);
    });

    const log = {
      id,
      season,
      round: meta.round ?? game.round ?? null,
      competition: meta.competition || game.competition || 'LEAGUE',
      leg: meta.leg || game.leg || null,
      date: meta.date || null,
      home: game.home,
      away: game.away,
      homeGoals: Number(game.homeGoals) || 0,
      awayGoals: Number(game.awayGoals) || 0,
      players: allSheets.map(sheet => ({
        key: sheet.key,
        name: sheet.name,
        club: sheet.club,
        pos: sheet.pos,
        minutes: sheet.minutes,
        started: !!sheet.started,
        goals: sheet.goals,
        assists: sheet.assists,
        yellow: !!sheet.yellow,
        red: !!sheet.red,
        passesEst: sheet.passesEst,
        rating: sheet.rating,
      })),
    };
    store.matchLogs.push(log);
    store.matchLogs = pruneMatchLogsForSeason(
      store.matchLogs,
      store.season ?? season,
      resolveBudget(),
    );
    if (meta.persist !== false) persist();
    return log;
  };

  const findMatchLog = ({ home, away, season, round, competition, leg } = {}) => {
    const logs = store.matchLogs || [];
    return (
      logs.find(entry => {
        if (home && entry.home !== home) return false;
        if (away && entry.away !== away) return false;
        if (season != null && Number(entry.season) !== Number(season)) return false;
        if (round != null && Number(entry.round) !== Number(round)) return false;
        if (competition && entry.competition !== competition) return false;
        if (leg && entry.leg && entry.leg !== leg) return false;
        return true;
      }) || null
    );
  };

  const archiveSeasonBalance = payload => {
    if (!payload?.season) return null;
    const slim = {
      season: payload.season,
      userClub: payload.userClub || null,
      userDivision: payload.userDivision || null,
      userLine: payload.userLine || null,
      userStatus: payload.userStatus || null,
      seasonGoal: payload.seasonGoal
        ? { id: payload.seasonGoal.id, label: payload.seasonGoal.label, tier: payload.seasonGoal.tier }
        : null,
      seasonGoalResult: payload.seasonGoalResult
        ? {
            status: payload.seasonGoalResult.status,
            boardDelta: payload.seasonGoalResult.boardDelta,
            label: payload.seasonGoalResult.label,
            feeling: payload.seasonGoalResult.feeling,
          }
        : null,
      seasonObjectivesResult: payload.seasonObjectivesResult
        ? {
            boardDelta: payload.seasonObjectivesResult.boardDelta,
            feeling: payload.seasonObjectivesResult.feeling,
            metCount: payload.seasonObjectivesResult.metCount,
            missedCount: payload.seasonObjectivesResult.missedCount,
            items: Array.isArray(payload.seasonObjectivesResult.items)
              ? payload.seasonObjectivesResult.items.map(item => ({
                  id: item.id,
                  label: item.label,
                  status: item.status,
                }))
              : [],
          }
        : null,
      champions: payload.champions ? { ...payload.champions } : null,
      movements: Array.isArray(payload.movements)
        ? payload.movements.map(row => ({
            title: row.title,
            type: row.type,
            clubs: [...(row.clubs || [])].slice(0, 8),
          }))
        : [],
      leaders: payload.leadersByDivision
        ? {
            A: {
              scorers: slimLeaders(payload.leadersByDivision.A?.scorers, 'goals'),
              assistants: slimLeaders(payload.leadersByDivision.A?.assistants, 'assists'),
            },
            userDivision: payload.userDivision || null,
          }
        : null,
    };
    store.seasonArchives = store.seasonArchives.filter(
      entry => Number(entry.season) !== Number(slim.season),
    );
    store.seasonArchives.push(slim);
    store.seasonArchives = pruneArchives(store.seasonArchives);
    persist();
    return slim;
  };

  const getPlayer = key => store.players[key] || null;

  const reload = () => {
    store = loadPlayerHistoryStore();
    return store;
  };

  return {
    moduleVersion: MODULE_VERSIONS.playerHistory ?? 1,
    recordMatch,
    findMatchLog,
    archiveSeasonBalance,
    finalizeSeason,
    getPlayer,
    playerKey,
    getStore: () => store,
    reload,
    persist,
    clear: () => {
      clearPlayerHistoryStore();
      store = emptyStore();
    },
  };
}
