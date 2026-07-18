import { MODULE_VERSIONS } from '../core/constants.js';

/**
 * Disponibilidade e carga de jogo — workload, disciplina/lesão pós-rodada e
 * o fechamento de disponibilidade da partida ao vivo do usuário.
 * Sem DOM: apenas leitura/escrita de estado dos clubes e do save.
 * @param {object} deps
 * @param {Function} deps.getClubs — () => clubs
 * @param {Function} deps.getUserClub — () => userClub
 * @param {Function} deps.getCurrentRound — () => currentRound
 * @param {Function} deps.recordPlayerMatchWorkload
 * @param {Function} deps.roundTactic
 * @param {Function} deps.applyDisciplineToPlayer
 * @param {Function} deps.assignPlayerInjury
 * @param {Function} deps.applyDeferredInjuryDiagnosis
 * @param {Function} deps.pushDisciplineDigest
 * @param {Function} deps.injuryInAcutePhase
 * @param {Function} deps.injuryInRestrictedPhase
 * @param {Function} deps.beginRestrictedReturn
 * @param {Function} deps.advanceRestrictedRehab
 * @param {Function} deps.decayPlayerWorkload
 * @param {Function} deps.refreshWorkloadWindows
 * @param {Function} deps.getAvailabilityCommitted — () => availabilityCommitted
 * @param {Function} deps.setAvailabilityCommitted — (v) => void
 * @param {Function} deps.getMatchStarted — () => matchStarted
 * @param {Function} deps.getLiveMatchGame — () => liveMatchGame
 * @param {Function} deps.getMatchDiscipline — () => matchDiscipline
 * @param {Function} deps.getLiveMinutesPlayed — () => liveMinutesPlayed
 * @param {Function} deps.getLiveOpeningLineup — () => liveOpeningLineup
 * @param {Function} deps.tacticFor — (side) => tactic ao vivo
 */
export function createMatchAvailability(deps) {
  const {
    getClubs,
    getUserClub,
    getCurrentRound,
    recordPlayerMatchWorkload,
    roundTactic,
    applyDisciplineToPlayer,
    assignPlayerInjury,
    applyDeferredInjuryDiagnosis,
    pushDisciplineDigest,
    injuryInAcutePhase,
    injuryInRestrictedPhase,
    beginRestrictedReturn,
    advanceRestrictedRehab,
    decayPlayerWorkload,
    refreshWorkloadWindows,
    getAvailabilityCommitted,
    setAvailabilityCommitted,
    getMatchStarted,
    getLiveMatchGame,
    getMatchDiscipline,
    getLiveMinutesPlayed,
    getLiveOpeningLineup,
    tacticFor,
  } = deps;

  const applyMatchWorkload = (clubName, entries, tactic) => {
    if (!clubName || !entries?.length) return;
    const club = getClubs()[clubName];
    if (!club) return;
    entries.forEach(entry => {
      const player = club.roster.find(candidate => candidate.name === entry.name);
      if (player) recordPlayerMatchWorkload(player, entry.minutes, !!entry.started, tactic || roundTactic(club), getCurrentRound());
    });
  };

  const applyMatchAvailability = (game, fixture = null) => {
    if (!game) return;
    const clubs = getClubs(), userClub = getUserClub(), currentRound = getCurrentRound();
    const matchFixture = fixture || game.fixture || game;
    const userDisciplineLines = [];
    const userOpponent = matchFixture.home === userClub ? matchFixture.away : matchFixture.away === userClub ? matchFixture.home : null;
    [['home', matchFixture.home], ['away', matchFixture.away]].forEach(([side, clubName]) => {
      const club = clubs[clubName];
      if (!club) return;
      applyMatchWorkload(clubName, game.workload?.[side], game.tactics?.[side] || roundTactic(club));
      (game.discipline?.[side] || []).forEach(entry => {
        const lines = applyDisciplineToPlayer(club.roster.find(player => player.name === entry.name), entry, currentRound, clubName, matchFixture);
        if (clubName === userClub) userDisciplineLines.push(...lines);
      });
      (game.injuries?.[side] || []).forEach(entry => {
        const player = club.roster.find(candidate => candidate.name === entry.name);
        if (player && !player.injury) assignPlayerInjury(player, entry.injury, currentRound, { club });
      });
      (game.deferredInjuries?.[side] || []).forEach(entry => {
        const player = club.roster.find(candidate => candidate.name === entry.name);
        if (player && !player.injury) applyDeferredInjuryDiagnosis(player, entry, club);
      });
    });
    if (userDisciplineLines.length) pushDisciplineDigest(userDisciplineLines, currentRound, userOpponent ? `vs ${userOpponent}` : `Rodada ${currentRound}`);
  };

  const serveAvailability = (days, participants = new Set(Object.keys(getClubs()))) =>
    Object.values(getClubs()).forEach(club =>
      club.roster.forEach(player => {
        decayPlayerWorkload(player, days);
        refreshWorkloadWindows(player, getCurrentRound());
        if (player.injury) {
          if (injuryInAcutePhase(player.injury) && Number(player.injury.startedRound ?? -1) < getCurrentRound()) {
            player.injury.daysRemaining = Math.max(0, player.injury.daysRemaining - days);
            if (!player.injury.daysRemaining) beginRestrictedReturn(player, club);
          } else if (injuryInRestrictedPhase(player.injury)) advanceRestrictedRehab(player, days, club);
        }
      }),
    );

  const commitLiveAvailability = () => {
    if (getAvailabilityCommitted() || !getMatchStarted() || !getLiveMatchGame()) return;
    const clubs = getClubs(), userClub = getUserClub(), currentRound = getCurrentRound();
    const liveMatchGame = getLiveMatchGame(), matchDiscipline = getMatchDiscipline(), liveMinutesPlayed = getLiveMinutesPlayed(), liveOpeningLineup = getLiveOpeningLineup();
    const userDisciplineLines = [];
    const userOpponent = liveMatchGame.home === userClub ? liveMatchGame.away : liveMatchGame.home;
    const opponentClub = liveMatchGame.home === userClub ? liveMatchGame.away : liveMatchGame.home;
    [['home', userClub], ['away', opponentClub]].forEach(([side, clubName]) => {
      const club = clubs[clubName];
      matchDiscipline[side].forEach(entry => userDisciplineLines.push(...applyDisciplineToPlayer(club.roster.find(player => player.name === entry.name), entry, currentRound, clubName, liveMatchGame)));
      const entries = [...liveMinutesPlayed[side].entries()].filter(([, mins]) => mins > 0).map(([name, mins]) => ({ name, minutes: mins, started: liveOpeningLineup[side].includes(name) }));
      applyMatchWorkload(clubName, entries, tacticFor(side));
    });
    if (userDisciplineLines.length) pushDisciplineDigest(userDisciplineLines, currentRound, userOpponent ? `vs ${userOpponent}` : `Rodada ${currentRound}`);
    setAvailabilityCommitted(true);
  };

  return {
    moduleVersion: MODULE_VERSIONS.matchAvailability,
    applyMatchWorkload,
    applyMatchAvailability,
    serveAvailability,
    commitLiveAvailability,
  };
}
