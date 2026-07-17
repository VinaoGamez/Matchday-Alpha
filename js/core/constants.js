/** Build e versões de save — contrato estável entre módulos. */
export const BUILD_VERSION = 'alpha-02-tester-5';

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
  save: 1,
  injury: 3,
  matchTuning: 1,
  matchSim: 1,
  matchCore: 1,
  matchLive: 1,
  calendar: 2,
};

/** Flags para builds de testers — evoluir sem quebrar fluxo congelado. */
export const FEATURES = {
  messagesHub: true,
  calendarRoutines: true,
  medicalTreatment: true,
  externalTunnel: true,
};
