/** Build e versões de save — contrato estável entre módulos. */
export const BUILD_VERSION = 'alpha-02-tester-22';

export const SAVE_KEYS = {
  career: 'matchday-new-game',
  season: 'matchday-season',
  training: 'matchday-training-rules',
  pace: 'futmanager-pace',
  liveMatch: 'matchday-live-match',
  lastSeenBuild: 'matchday-last-seen-build',
};

export const SAVE_VERSION = {
  career: 4,
  season: 1,
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
  dashboard: 5,
  tactics: 3,
  seasonSummary: 2,
  discipline: 2,
  economy: 22,
  options: 3,
  sponsorPicker: 4,
  liveDayMatches: 1,
  fatigue: 1,
  matchLiveUi: 8,
  testerHub: 1,
  matchAvailability: 1,
  matchLiveAwaySubs: 1,
  matchLiveOrchestration: 4,
  matchLiveSession: 4,
  liveMatchPersist: 2,
  clubStatus: 8,
  managerRanking: 2,
  seasonGoals: 2,
  managerJob: 2,
  managerSack: 1,
};

/** Flags para builds de testers — evoluir sem quebrar fluxo congelado. */
export const FEATURES = {
  messagesHub: true,
  calendarRoutines: true,
  medicalTreatment: true,
  externalTunnel: true,
};
