import { SAVE_KEYS, MODULE_VERSIONS } from '../core/constants.js';
import { readJson, writeJson, MEMORY_LIMITS } from '../core/save.js';

const LIVE_MATCH_VERSION = 1;

/** Identificador estável do confronto (liga ou mata-mata). */
export function fixtureIdFromGame(game) {
  if (!game) return null;
  const home = game.home || '';
  const away = game.away || '';
  const competition = game.competition || 'LEAGUE';
  const round = game.round ?? '';
  const tieId = game.tieId ?? '';
  const leg = game.leg ?? '';
  const date = game.date != null ? String(game.date) : '';
  const gameNumber = game.gameNumber ?? '';
  return [competition, round, home, away, tieId, leg, date, gameNumber].join('|');
}

export function loadLiveMatchSave() {
  return readJson(SAVE_KEYS.liveMatch, null);
}

export function saveLiveMatchSave(snapshot) {
  if (!snapshot) return false;
  return writeJson(SAVE_KEYS.liveMatch, snapshot);
}

export function clearLiveMatchSave() {
  try {
    localStorage.removeItem(SAVE_KEYS.liveMatch);
  } catch {
    /* ignore */
  }
}

function clonePlain(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function mapToObject(map) {
  if (!(map instanceof Map)) return map && typeof map === 'object' ? { ...map } : {};
  return Object.fromEntries([...map.entries()].map(([key, val]) => [key, clonePlain(val)]));
}

function objectToMap(obj) {
  const map = new Map();
  if (!obj || typeof obj !== 'object') return map;
  Object.entries(obj).forEach(([key, val]) => map.set(key, val));
  return map;
}

function serializeSideMaps(sideMaps) {
  return {
    home: mapToObject(sideMaps?.home),
    away: mapToObject(sideMaps?.away),
  };
}

function deserializeSideMaps(raw) {
  return {
    home: objectToMap(raw?.home),
    away: objectToMap(raw?.away),
  };
}

function compactFixture(game) {
  if (!game) return null;
  return {
    home: game.home,
    away: game.away,
    round: game.round ?? null,
    competition: game.competition || null,
    tieId: game.tieId ?? null,
    leg: game.leg ?? null,
    date: game.date ?? null,
    gameNumber: game.gameNumber ?? null,
    data: game.data ?? null,
    penalties: game.penalties ?? null,
    shootoutWinner: game.shootoutWinner ?? null,
    shootoutPenalties: game.shootoutPenalties ?? null,
    homeGoals: game.homeGoals,
    awayGoals: game.awayGoals,
    completed: !!game.completed,
    fillRate: game.fillRate ?? null,
  };
}

/**
 * Monta snapshot serializável do estado ao vivo.
 * @param {object} state
 */
export function buildLiveMatchSnapshot(state) {
  const game = state.liveMatchGame;
  if (!state.matchStarted || !game || !state.seed) return null;
  return {
    v: LIVE_MATCH_VERSION,
    moduleVersion: MODULE_VERSIONS.liveMatchPersist,
    savedAt: new Date().toISOString(),
    seed: state.seed,
    fixtureId: fixtureIdFromGame(game),
    fixture: compactFixture(game),
    minute: Number(state.minute) || 0,
    home: Number(state.home) || 0,
    away: Number(state.away) || 0,
    pauses: Number(state.pauses) || 0,
    halftimeShown: !!state.halftimeShown,
    matchStarted: true,
    matchFinished: !!state.matchFinished,
    preMatchPreparation: !!state.preMatchPreparation,
    activePreparationTitle: state.activePreparationTitle || '',
    substitutions: Number(state.substitutions) || 0,
    awaySubstitutions: Number(state.awaySubstitutions) || 0,
    awaySubWindows: Number(state.awaySubWindows) || 0,
    substitutedOut: [...(state.substitutedOut || [])],
    disciplineEvents: Number(state.disciplineEvents) || 0,
    availabilityCommitted: !!state.availabilityCommitted,
    roundResultMessagePushed: !!state.roundResultMessagePushed,
    stats: clonePlain(state.stats),
    cards: clonePlain(state.cards),
    goals: clonePlain(state.goals),
    matchFactors: clonePlain(state.matchFactors),
    liveInjuries: clonePlain(state.liveInjuries),
    liveDeferredInjuries: clonePlain(state.liveDeferredInjuries),
    liveOpeningLineup: clonePlain(state.liveOpeningLineup),
    liveMinutesPlayed: serializeSideMaps(state.liveMinutesPlayed),
    matchDiscipline: serializeSideMaps(state.matchDiscipline),
    liveVolumeSamples: clonePlain(state.liveVolumeSamples) || [],
    liveVolumePrev: clonePlain(state.liveVolumePrev),
    liveVolumePulse: clonePlain(state.liveVolumePulse),
    liveVolumeIncidents: clonePlain(state.liveVolumeIncidents) || [],
    postMatchMedicalQueue: clonePlain(state.postMatchMedicalQueue) || [],
    shootoutState: clonePlain(state.shootoutState),
    pendingPenalty: clonePlain(state.pendingPenalty),
    preMatchTacticSnapshot: clonePlain(state.preMatchTacticSnapshot),
    stoppageFirst: Number(state.stoppageFirst) || 0,
    stoppageSecond: Number(state.stoppageSecond) || 0,
    stoppageElapsed: Number(state.stoppageElapsed) || 0,
    stoppageActive: state.stoppageActive || null,
    userFormation: state.userFormation || null,
    userLineupOrder: Array.isArray(state.userLineupOrder) ? [...state.userLineupOrder] : [],
    awayFormation: state.awayFormation || null,
    awayLineupOrder: Array.isArray(state.awayLineupOrder) ? [...state.awayLineupOrder] : [],
    liveClockSeconds: Number(state.liveClockSeconds) || 0,
    timelineHtml: typeof state.timelineHtml === 'string' ? state.timelineHtml : '',
    matchStatusText: state.matchStatusText || '',
    ui: {
      pauseOpen: !!state.ui?.pauseOpen,
      statsOpen: !!state.ui?.statsOpen,
      penaltyOpen: !!state.ui?.penaltyOpen,
      shootoutOpen: !!state.ui?.shootoutOpen,
    },
  };
}

export function isValidLiveMatchSnapshot(snapshot, seed) {
  if (!snapshot || snapshot.v !== LIVE_MATCH_VERSION) return false;
  if (seed != null && snapshot.seed !== seed) return false;
  if (!snapshot.fixtureId || !snapshot.fixture?.home || !snapshot.fixture?.away) return false;
  return !!snapshot.matchStarted;
}

export function hydrateLiveMatchSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    ...snapshot,
    liveMinutesPlayed: deserializeSideMaps(snapshot.liveMinutesPlayed),
    matchDiscipline: deserializeSideMaps(snapshot.matchDiscipline),
    substitutedOut: new Set(Array.isArray(snapshot.substitutedOut) ? snapshot.substitutedOut : []),
    stats: snapshot.stats || null,
    cards: snapshot.cards || null,
    goals: snapshot.goals || { home: [], away: [] },
    liveInjuries: snapshot.liveInjuries || { home: [], away: [] },
    liveDeferredInjuries: snapshot.liveDeferredInjuries || { home: [], away: [] },
    liveOpeningLineup: snapshot.liveOpeningLineup || { home: [], away: [] },
    liveVolumeSamples: Array.isArray(snapshot.liveVolumeSamples) ? snapshot.liveVolumeSamples : [],
    liveVolumeIncidents: Array.isArray(snapshot.liveVolumeIncidents) ? snapshot.liveVolumeIncidents : [],
    postMatchMedicalQueue: Array.isArray(snapshot.postMatchMedicalQueue) ? snapshot.postMatchMedicalQueue : [],
  };
}

/**
 * Cria controlador de persistência com debounce.
 * @param {{ getState: () => object, onFlush?: (snap: object|null) => void }} deps
 */
export function createLiveMatchPersistController(deps) {
  const { getState, onFlush } = deps;
  let timer = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const state = getState();
    if (!state?.matchStarted || !state?.liveMatchGame) {
      onFlush?.(null);
      return null;
    }
    const snapshot = buildLiveMatchSnapshot(state);
    if (!snapshot) {
      onFlush?.(null);
      return null;
    }
    saveLiveMatchSave(snapshot);
    onFlush?.(snapshot);
    return snapshot;
  };

  const schedule = () => {
    const state = getState();
    if (!state?.matchStarted || !state?.liveMatchGame) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, MEMORY_LIMITS.persistDebounceMs);
  };

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    clearLiveMatchSave();
    onFlush?.(null);
  };

  return {
    moduleVersion: MODULE_VERSIONS.liveMatchPersist,
    schedule,
    flush,
    clear,
    load: loadLiveMatchSave,
  };
}
