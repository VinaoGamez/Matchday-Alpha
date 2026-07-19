import { MODULE_VERSIONS } from '../core/constants.js';

/**
 * Substituições do adversário ao vivo — banco, janelas e a decisão de troca
 * por fadiga/prioridade tática. Sem DOM: renderização fica em callbacks.
 * @param {object} deps
 * @param {Function} deps.getMatchClub — () => clube adversário ao vivo
 * @param {Function} deps.playerUnavailable
 * @param {Function} deps.getLiveInjuries — () => liveInjuries
 * @param {Function} deps.getLiveDeferredInjuries — () => liveDeferredInjuries
 * @param {Function} deps.getCards — () => cards
 * @param {Function} deps.getLiveMinutesPlayed — () => liveMinutesPlayed
 * @param {Function} deps.getAwaySubstitutions — () => awaySubstitutions
 * @param {Function} deps.incrementAwaySubstitutions
 * @param {Function} deps.getAwaySubWindows — () => awaySubWindows
 * @param {Function} deps.incrementAwaySubWindows
 * @param {Function} deps.getMatchStarted
 * @param {Function} deps.getPreMatchPreparation
 * @param {Function} deps.getMatchFinished
 * @param {Function} deps.getMinute — () => minute
 * @param {Function} deps.getHomeGoals — () => home (placar)
 * @param {Function} deps.getAwayGoals — () => away (placar)
 * @param {object} deps.engineTuning
 * @param {number} deps.FATIGUE_SUB_THRESHOLD
 * @param {Function} deps.substitutionPriority
 * @param {object} deps.compatibleRoles
 * @param {Function} deps.clamp
 * @param {Function} deps.log
 * @param {Function} deps.renderRoster
 * @param {Function} deps.drawBoard
 * @param {Function} deps.renderStats
 * @param {Function} deps.renderLiveOpponent
 * @param {Function} [deps.pushLiveVolumeIncident]
 */
export function createAwaySubController(deps) {
  const {
    getMatchClub,
    playerUnavailable,
    getLiveInjuries,
    getLiveDeferredInjuries,
    getCards,
    getLiveMinutesPlayed,
    getAwaySubstitutions,
    incrementAwaySubstitutions,
    getAwaySubWindows,
    incrementAwaySubWindows,
    getMatchStarted,
    getPreMatchPreparation,
    getMatchFinished,
    getMinute,
    getHomeGoals,
    getAwayGoals,
    engineTuning,
    FATIGUE_SUB_THRESHOLD,
    substitutionPriority,
    compatibleRoles,
    clamp,
    log,
    renderRoster,
    drawBoard,
    renderStats,
    renderLiveOpponent,
    pushLiveVolumeIncident,
  } = deps;

  const awayBenchPlayers = () =>
    getMatchClub().roster.slice(11).filter(candidate =>
      !playerUnavailable(candidate) &&
      !getLiveInjuries().away.some(item => item.name === candidate.name) &&
      !getLiveDeferredInjuries().away.some(item => item.name === candidate.name),
    );

  const replaceAwayPlayer = (index, incoming, minute, tag = 'substitution') => {
    const club = getMatchClub();
    const cards = getCards(), liveMinutesPlayed = getLiveMinutesPlayed();
    if (getAwaySubstitutions() >= 5 || !incoming || index < 0) return false;
    const outgoing = club.roster[index];
    const incomingIndex = club.roster.indexOf(incoming);
    if (incomingIndex < 11 || !outgoing) return false;
    [club.roster[index], club.roster[incomingIndex]] = [incoming, outgoing];
    cards.away[index] = { yellow: 0, red: false, dismissal: null, injured: false, playThroughRisk: false, minuteLimitWarned: false };
    incoming.fatigue = clamp(incoming.fatigue - minute * .02, 0, 100);
    liveMinutesPlayed.away.set(incoming.name, liveMinutesPlayed.away.get(incoming.name) ?? 0);
    incrementAwaySubstitutions();
    log(`${club.name}: sai ${outgoing.name}, entra ${incoming.name}${incoming.pos !== outgoing.pos ? ' improvisado na função' : ''}.`, tag, 'away');
    pushLiveVolumeIncident?.('away', 'substitution', { name: `${outgoing.name} → ${incoming.name}` });
    return true;
  };

  const maxAwaySubWindows = () => (getAwayGoals() < getHomeGoals() && getMinute() >= 70 ? 4 : 3);

  const buildLiveAwaySubState = () => {
    const club = getMatchClub(), liveMinutesPlayed = getLiveMinutesPlayed(), liveDeferredInjuries = getLiveDeferredInjuries();
    return {
      name: club.name,
      lineup: club.roster.slice(0, 11),
      fatigue: new Map(club.roster.slice(0, 11).map(player => [player.name, player.fatigue])),
      minutesPlayed: liveMinutesPlayed.away,
      deferredInjuries: liveDeferredInjuries.away,
      homeGoals: getHomeGoals(),
      awayGoals: getAwayGoals(),
    };
  };

  const makeAwayFatigueSubstitution = () => {
    const minute = getMinute(), home = getHomeGoals(), away = getAwayGoals(), cards = getCards();
    if (!getMatchStarted() || getPreMatchPreparation() || getMatchFinished() || getAwaySubstitutions() >= 5 || getAwaySubWindows() >= maxAwaySubWindows()) return;
    const chasing = away < home;
    const windows = [...new Set([...(engineTuning.subWindows || []), ...(chasing ? engineTuning.subChaseWindows || [] : [])])];
    if (!windows.includes(minute)) return;
    const bench = awayBenchPlayers();
    if (!bench.length) return;
    const club = getMatchClub();
    const lineup = club.roster.slice(0, 11);
    const state = buildLiveAwaySubState();
    const active = lineup.map((player, index) => ({ player, index })).filter(({ player, index }) => !cards.away[index]?.red && !cards.away[index]?.injured && player.pos !== 'GOL');
    const outgoingEntry = [...active].sort((a, b) => substitutionPriority(state, 'away', b.player, minute) - substitutionPriority(state, 'away', a.player, minute))[0];
    if (!outgoingEntry) return;
    const { player: outgoing, index } = outgoingEntry;
    const fatigue = outgoing.fatigue;
    const priority = substitutionPriority(state, 'away', outgoing, minute);
    const need = clamp(.3 + (chasing ? .28 : 0) + (minute >= 70 ? .22 : 0) + Math.max(0, FATIGUE_SUB_THRESHOLD - fatigue) / 42 + priority / 95, (fatigue < FATIGUE_SUB_THRESHOLD ? .45 : .22), .95);
    if (Math.random() > need) return;
    const expected = outgoing.pos, compatible = bench.filter(candidate => candidate.pos === expected || (compatibleRoles[expected] || []).includes(candidate.pos)), candidates = compatible.length ? compatible : bench, incoming = [...candidates].sort((a, b) => b.overall - a.overall || b.fatigue - a.fatigue)[0];
    if (!incoming || !replaceAwayPlayer(index, incoming, minute)) return;
    incrementAwaySubWindows();
    renderRoster(); drawBoard(); renderStats(); renderLiveOpponent();
  };

  return {
    moduleVersion: MODULE_VERSIONS.matchLiveAwaySubs,
    awayBenchPlayers,
    replaceAwayPlayer,
    maxAwaySubWindows,
    buildLiveAwaySubState,
    makeAwayFatigueSubstitution,
  };
}
