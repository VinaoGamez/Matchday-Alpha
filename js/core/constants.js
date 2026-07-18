/** Build e versões de save — contrato estável entre módulos. */
export const BUILD_VERSION = 'alpha-02-tester-21';

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
  save: 3,
  injury: 3,
  matchTuning: 1,
  matchSim: 1,
  matchCore: 1,
  matchLive: 1,
  calendar: 4,
  dashboard: 5,
  tactics: 2,
  seasonSummary: 2,
  discipline: 1,
  economy: 17,
  options: 2,
  sponsorPicker: 1,
  liveDayMatches: 1,
  fatigue: 1,
  matchLiveUi: 5,
  testerHub: 1,
  matchAvailability: 1,
  matchLiveAwaySubs: 1,
  matchLiveOrchestration: 1,
  matchLiveSession: 2,
  liveMatchPersist: 1,
  clubStatus: 8,
  managerRanking: 2,
  seasonGoals: 1,
  managerJob: 1,
  managerSack: 1,
};

/** Flags para builds de testers — evoluir sem quebrar fluxo congelado. */
export const FEATURES = {
  messagesHub: true,
  calendarRoutines: true,
  medicalTreatment: true,
  externalTunnel: true,
};
