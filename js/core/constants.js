/**
 * Build pública para testers.
 * Nomenclatura: Alpha V.X.YY — sobe +0.05 a cada publicação (1.00 → 1.05 → …).
 */
export const BUILD_VERSION = 'Alpha V.1.43';

export const SAVE_KEYS = {
  career: 'matchday-new-game',
  season: 'matchday-season',
  training: 'matchday-training-rules',
  pace: 'futmanager-pace',
  liveMatch: 'matchday-live-match',
  lastSeenBuild: 'matchday-last-seen-build',
  playerHistory: 'matchday-player-history',
};

export const SAVE_VERSION = {
  career: 4,
  season: 1,
  playerHistory: 1,
};

export const MODULE_VERSIONS = {
  messages: 1,
  save: 4,
  injury: 4,
  matchTuning: 1,
  matchSim: 2,
  matchCore: 1,
  matchLive: 4,
  calendar: 4,
  dashboard: 6,
  tactics: 3,
  seasonSummary: 2,
  discipline: 2,
  economy: 27,
  options: 3,
  sponsorPicker: 4,
  liveDayMatches: 1,
  fatigue: 1,
  matchLiveUi: 9,
  testerHub: 1,
  matchAvailability: 1,
  matchLiveAwaySubs: 1,
  matchLiveOrchestration: 5,
  matchLiveSession: 6,
  liveMatchPersist: 2,
  clubStatus: 9,
  managerRanking: 2,
  seasonGoals: 2,
  managerJob: 2,
  managerSack: 1,
  clubSolvency: 2,
  clubBankruptcy: 1,
  clubInsolvencyWarn: 3,
  clubFinancialRestriction: 1,
  playerHistory: 1,
  playerMatchStats: 1,
  playerDevelopment: 1,
  transfers: 5,
};

/** Vite injeta `__MATCHDAY_ENABLE_TRANSFERS__`; em Node/scripts fica off. */
function readTransfersFlag() {
  try {
    return Boolean(__MATCHDAY_ENABLE_TRANSFERS__);
  } catch {
    return false;
  }
}

/** Flags para builds de testers — evoluir sem quebrar fluxo congelado. */
export const FEATURES = {
  messagesHub: true,
  calendarRoutines: true,
  medicalTreatment: true,
  externalTunnel: true,
  /** Mercado ativo em local e GitHub Pages. */
  transfers: readTransfersFlag(),
};
