import { MODULE_VERSIONS } from '../core/constants.js';
import { getSponsors, sponsorLogoSlug } from './economy.js';
import { allowsExtendedSecondHalfStoppage, rollStoppageMinutes } from './match-clock.js';
import { isKnockoutShootoutCompetition } from './knockout-shootout.js';
import { enginePenaltyChance } from './match-tuning.js';
import {
  resolveShootoutTakerPool,
  decideShootoutWinner,
  shootoutChoiceOptions,
} from './shootout-takers.js';
import { isPenaltySpecialist } from './player-generation.js';

const SPONSOR_LOGO_URLS = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../assets/sponsors/icons/*.png', {
      eager: true,
      import: 'default',
    }),
  ).map(([path, url]) => {
    const file = path.split('/').pop() || '';
    return [file.replace(/\.png$/i, ''), url];
  }),
);

/**
 * Orquestração da partida ao vivo — desgaste por minuto, ciclo tick/advance,
 * faltas/cartões, lesões em jogo (evento + play-through + rehab) e o fluxo
 * completo de pênaltis/shootout. Ratings ao vivo em `engine/match-ratings.js`.
 * Sem DOM direto: interações usam `$`/callbacks fornecidos.
 * @param {object} deps
 * @param {Function} deps.injuryInAcutePhase
 * @param {Function} deps.getNextUserGame — () => nextUserGame (fixture calendário)
 */
export function createLiveMatchOrchestration(deps) {
  const {
    $,
    clamp,
    rnd,
    log,
    getMinute,
    setMinute,
    getHalftimeShown,
    setHalftimeShown,
    getMatchFinished,
    setMatchFinished,
    getMatchStarted,
    getStats,
    getCards,
    getShootoutState,
    setShootoutState,
    getPendingPenalty,
    setPendingPenalty,
    getDisciplineEvents,
    setDisciplineEvents,
    getMatchDiscipline,
    getLiveInjuries,
    getLiveDeferredInjuries,
    getLiveMinutesPlayed,
    getPostMatchMedicalQueue,
    pushLiveVolumeIncident,
    getUserClub,
    getClubs,
    getMatchClub,
    getLiveMatchGame,
    getStarters,
    getActiveStarters,
    getCurrentRound,
    userAtHomeInLiveMatch,
    profile,
    opponentForMatch,
    liveOverall,
    cautionPenalty,
    tacticFor,
    playerFor,
    actorData,
    tacticalDiscipline,
    totalCards,
    influencePossession,
    engineTuning,
    compatibleRoles,
    playerUnavailable,
    injuryInAcutePhase,
    getNextUserGame,
    playerRehabMaxMinutes,
    resolvePhysicalIncident,
    assignPlayerInjury,
    buildDeferredInjuryEntry,
    calculatePlayThroughSubChance,
    injurySeverityLabel,
    pickInjuryVictim,
    directRedDismissalType,
    directRedSuspensionGames,
    applyMinuteWearToLineup,
    clubInstitutionalContext,
    stopMatchClock,
    startMatchClock,
    openPreparation,
    renderRoster,
    drawBoard,
    renderSubstitutionControls,
    renderStats,
    renderLiveOpponent,
    makeAwayFatigueSubstitution,
    simulateRoundResults,
    renderFinalSummary,
    showFinalActions,
    cupLiveMatchNeedsShootout,
    optionsUi,
    knockoutCompetitionLabel,
    getKnockoutTieGames,
    shot,
    planPenaltyOutcome,
    takeFreeKick,
    penaltyTaker,
    buildAttack,
    addPasses,
    timeline,
    resetLiveClockSeconds,
    updateLiveMatchClock,
    getAwaySubstitutions,
    incrementAwaySubstitutions,
    getStoppageFirst,
    setStoppageFirst,
    getStoppageSecond,
    setStoppageSecond,
    getStoppageElapsed,
    setStoppageElapsed,
    getStoppageActive,
    setStoppageActive,
    getSubstitutions,
    getHomeScore,
    getAwayScore,
    getStoppageHalfSnap,
    setStoppageHalfSnap,
    getLeaguePhaseRounds,
  } = deps;

  /** Contagens acumuladas no momento (faltas/cartões/subs/gols). */
  const stoppageTotals = () => {
    const stats = getStats();
    const homeSubs = Number(getSubstitutions?.() || 0);
    const awaySubs = Number(getAwaySubstitutions?.() || 0);
    const goals =
      Math.max(0, Number(getHomeScore?.() || 0)) + Math.max(0, Number(getAwayScore?.() || 0));
    return {
      fouls: (stats?.home?.fouls || 0) + (stats?.away?.fouls || 0),
      yellow: (stats?.home?.yellow || 0) + (stats?.away?.yellow || 0),
      red: (stats?.home?.red || 0) + (stats?.away?.red || 0),
      subs: homeSubs + awaySubs,
      goals,
    };
  };

  /** Mata-mata sempre; liga só nas últimas 2 rodadas da fase. */
  const extendedSecondStoppage = () => {
    const game = getLiveMatchGame?.() || null;
    const knockout = isKnockoutShootoutCompetition(game);
    const round = Number(game?.round) || Number(getCurrentRound?.() || 0);
    const totalRounds = Number(getLeaguePhaseRounds?.(game) || 0);
    return allowsExtendedSecondHalfStoppage({ knockout, round, totalRounds });
  };

  /**
   * Contexto da etapa: 1º = totais até o intervalo; 2º = delta desde o snapshot do HT.
   * (Antes o 2º usava a partida inteira e quase sempre batia no teto de 7'.)
   */
  const stoppageContext = half => {
    const totals = stoppageTotals();
    const extendedStoppage = half === 'second' ? extendedSecondStoppage() : false;
    if (half !== 'second') {
      return { ...totals, half: 'first', extendedStoppage: false, random: Math.random };
    }
    const snap = getStoppageHalfSnap?.() || null;
    if (!snap) {
      // Fallback se o save antigo não tem snapshot: estima ~metade no 2º.
      return {
        fouls: Math.round(totals.fouls * 0.5),
        yellow: Math.round(totals.yellow * 0.5),
        red: Math.round(totals.red * 0.5),
        subs: Math.max(0, totals.subs - 1),
        goals: Math.round(totals.goals * 0.55),
        half: 'second',
        extendedStoppage,
        random: Math.random,
      };
    }
    return {
      fouls: Math.max(0, totals.fouls - (Number(snap.fouls) || 0)),
      yellow: Math.max(0, totals.yellow - (Number(snap.yellow) || 0)),
      red: Math.max(0, totals.red - (Number(snap.red) || 0)),
      subs: Math.max(0, totals.subs - (Number(snap.subs) || 0)),
      goals: Math.max(0, totals.goals - (Number(snap.goals) || 0)),
      half: 'second',
      extendedStoppage,
      random: Math.random,
    };
  };

  /** Congela o relógio no fim da etapa (45+N ou 90+N) sem seguir avançando. */
  const freezeStoppageDisplay = (half) => {
    const allowance =
      half === 'second'
        ? Math.max(Number(getStoppageSecond?.() || 0), Number(getStoppageElapsed?.() || 0))
        : Math.max(Number(getStoppageFirst?.() || 0), Number(getStoppageElapsed?.() || 0));
    if (half === 'second') {
      if (allowance > 0) setStoppageSecond?.(allowance);
      setMinute(90);
    } else {
      if (allowance > 0) setStoppageFirst?.(allowance);
      setMinute(45);
    }
    setStoppageElapsed?.(allowance);
    setStoppageActive?.(null);
  };

  const finishRegulation = () => {
    freezeStoppageDisplay('second');
    if (cupLiveMatchNeedsShootout()) {
      stopMatchClock();
      log('Fim de jogo no tempo regulamentar.', '');
      // Pode ser empate no jogo OU só no agregado (ida+volta) — pênaltis obrigatórios
      $('#matchStatus').textContent = 'Empate no agregado — disputa de pênaltis.';
      updateLiveMatchClock();
      startPenaltyShootout();
      return;
    }
    setMatchFinished(true);
    log('Fim de jogo.');
    $('#matchStatus').textContent = 'Partida encerrada.';
    stopMatchClock();
    updateLiveMatchClock();
    simulateRoundResults();
    renderFinalSummary();
    showFinalActions();
  };

  const openFirstHalfInterval = () => {
    freezeStoppageDisplay('first');
    setHalftimeShown(true);
    log('Intervalo de jogo.');
    $('#matchStatus').textContent = 'Intervalo: faça os ajustes que considerar necessários.';
    updateLiveMatchClock();
    openPreparation('INTERVALO');
  };

  // --- Lesões ao vivo (evento, play-through, rehab) --------------------------

  const tryLiveEventInjury = (side, playerName, eventContext) => {
    const minute = getMinute(), userClub = getUserClub(), clubs = getClubs(), matchClub = getMatchClub(), cards = getCards(), liveMinutesPlayed = getLiveMinutesPlayed(), liveInjuries = getLiveInjuries(), liveDeferredInjuries = getLiveDeferredInjuries(), postMatchMedicalQueue = getPostMatchMedicalQueue(), currentRound = getCurrentRound();
    const lineup = side === 'home' ? getStarters() : matchClub.roster.slice(0, 11);
    const index = lineup.findIndex(player => player.name === playerName);
    if (index < 0) return false;
    const player = lineup[index];
    if (cards[side][index]?.red || cards[side][index]?.injured || injuryInAcutePhase(player.injury)) return false;
    if (cards[side][index]?.playThroughRisk) return escalateLivePlayThroughInjury(side, index, player);
    if (liveDeferredInjuries[side].some(entry => entry.name === player.name)) return false;
    const club = side === 'home' ? clubs[userClub] : matchClub;
    const incident = resolvePhysicalIncident(player, { ...eventContext, minute, fatigue: player.fatigue, minutesPlayed: liveMinutesPlayed[side].get(player.name) ?? 0, club, pitchCondition: club.pitchCondition, tactic: tacticFor(side), occurredDuring: 'match' });
    if (!incident) return false;
    const liveText = incident.comment.replace(/^\d+'\s*/, '');
    if (incident.tier === 'discomfort') { player.fatigue = clamp(player.fatigue - 2, 0, 100); log(liveText, 'discomfort', side); renderRoster(); return false; }
    if (incident.tier === 'playThrough') return handleLivePlayThroughIncident(side, index, player, club, incident, liveText, eventContext);
    const injury = assignPlayerInjury(player, incident.injury, currentRound, { club, liveContext: side === 'home' ? { side, index } : null });
    if (!injury) { stopMatchClock(); $('#matchStatus').textContent = 'Departamento médico aguarda decisão sobre o tratamento.'; return true; }
    const needsPostMatchTreatment = postMatchMedicalQueue.some(item => item.player === player);
    cards[side][index].injured = true; liveInjuries[side].push({ name: player.name, injury: { ...injury } });
    log(liveText, 'injury', side);
    pushLiveVolumeIncident?.(side, 'injury', { name: player.name });
    if (needsPostMatchTreatment) {
      log(`${player.name} será reavaliado após o apito final. Defina cirurgia ou tratamento conservador no pós-jogo.`, 'injury', side);
      if (side === 'home') $('#matchStatus').textContent = 'Lesão em campo — avaliação completa e tratamento ficam para o pós-jogo.';
    }
    if (side === 'home') {
      $('#matchStatus').textContent = 'Partida pausada: jogador lesionado. Faça a substituição ou reorganize a equipe.';
      openPreparation('LESÃO');
    } else {
      const bench = club.roster.slice(11).filter(candidate => !playerUnavailable(candidate) && !liveInjuries.away.some(item => item.name === candidate.name));
      if (bench.length && liveInjuries.away.length <= 5) {
        const expected = player.pos;
        const compatible = bench.filter(
          candidate =>
            candidate.pos === expected || (compatibleRoles[expected] || []).includes(candidate.pos),
        );
        const incoming = [...(compatible.length ? compatible : bench)].sort(
          (a, b) => b.overall - a.overall,
        )[0];
        const incomingIndex = club.roster.indexOf(incoming);
        [club.roster[index], club.roster[incomingIndex]] = [incoming, player];
        cards.away[index] = {
          yellow: 0,
          red: false,
          dismissal: null,
          injured: false,
          playThroughRisk: false,
        };
        liveMinutesPlayed.away.set(incoming.name, liveMinutesPlayed.away.get(incoming.name) ?? 0);
        log(
          `${club.name} substitui o lesionado ${player.name} por ${incoming.name}.`,
          'injury-substitution',
          side,
        );
        pushLiveVolumeIncident?.(side, 'substitution', {
          name: `${player.name} → ${incoming.name}`,
        });
      }
    }
    renderRoster(); drawBoard(); renderSubstitutionControls(); renderStats(); return true;
  };

  const escalateLivePlayThroughInjury = (side, index, player) => {
    const cards = getCards(), liveInjuries = getLiveInjuries(), liveDeferredInjuries = getLiveDeferredInjuries(), liveMinutesPlayed = getLiveMinutesPlayed(), postMatchMedicalQueue = getPostMatchMedicalQueue(), currentRound = getCurrentRound(), userClub = getUserClub(), clubs = getClubs(), matchClub = getMatchClub();
    const entry = liveDeferredInjuries[side].find(item => item.name === player.name);
    if (!entry || entry.preemptiveSubstitution || entry.aggravated) return false;
    entry.aggravated = true;
    const grade = Math.min(3, (entry.injury.grade || 1) + 1);
    entry.injury = { ...entry.injury, grade, severity: injurySeverityLabel(grade), matchStatus: 'confirmed', substitutionRequired: true, diagnosisPending: false, playedThrough: true };
    cards[side][index].playThroughRisk = false;
    const club = side === 'home' ? clubs[userClub] : matchClub;
    const injury = assignPlayerInjury(player, entry.injury, currentRound, { club, liveContext: side === 'home' ? { side, index } : null });
    if (!injury) { stopMatchClock(); $('#matchStatus').textContent = 'Departamento médico aguarda decisão sobre o tratamento.'; return true; }
    const needsPostMatchTreatment = postMatchMedicalQueue.some(item => item.player === player);
    cards[side][index].injured = true; liveInjuries[side].push({ name: player.name, injury: { ...injury } });
    liveDeferredInjuries[side] = liveDeferredInjuries[side].filter(item => item.name !== player.name);
    log(`${player.name} teve o quadro agravado após insistir em campo.`, 'injury', side);
    pushLiveVolumeIncident?.(side, 'injury', { name: player.name });
    if (needsPostMatchTreatment) {
      log(`${player.name} precisa de definição de tratamento após o apito final.`, 'injury', side);
      if (side === 'home') $('#matchStatus').textContent = 'Lesão agravada — tratamento será definido no pós-jogo.';
    }
    if (side === 'home') {
      $('#matchStatus').textContent = 'Partida pausada: jogador lesionado. Faça a substituição ou reorganize a equipe.';
      openPreparation('LESÃO');
    } else {
      const bench = club.roster.slice(11).filter(candidate => !playerUnavailable(candidate) && !liveInjuries.away.some(item => item.name === candidate.name));
      if (bench.length && liveInjuries.away.length <= 5) {
        const expected = player.pos;
        const compatible = bench.filter(
          candidate =>
            candidate.pos === expected || (compatibleRoles[expected] || []).includes(candidate.pos),
        );
        const incoming = [...(compatible.length ? compatible : bench)].sort(
          (a, b) => b.overall - a.overall,
        )[0];
        const incomingIndex = club.roster.indexOf(incoming);
        [club.roster[index], club.roster[incomingIndex]] = [incoming, player];
        cards.away[index] = {
          yellow: 0,
          red: false,
          dismissal: null,
          injured: false,
          playThroughRisk: false,
        };
        liveMinutesPlayed.away.set(incoming.name, liveMinutesPlayed.away.get(incoming.name) ?? 0);
        log(
          `${club.name} substitui ${player.name} após agravamento por ${incoming.name}.`,
          'injury-substitution',
          side,
        );
        pushLiveVolumeIncident?.(side, 'substitution', {
          name: `${player.name} → ${incoming.name}`,
        });
      }
    }
    renderRoster(); drawBoard(); renderSubstitutionControls(); renderStats(); return true;
  };

  const handleLivePlayThroughIncident = (side, index, player, club, incident, liveText, eventContext = {}) => {
    const minute = getMinute(), cards = getCards(), liveInjuries = getLiveInjuries(), liveDeferredInjuries = getLiveDeferredInjuries(), liveMinutesPlayed = getLiveMinutesPlayed(), playerUnavailableFn = playerUnavailable;
    const entry = buildDeferredInjuryEntry(player, incident.injury, { ...eventContext, minute, fatigue: player.fatigue }, minute);
    liveDeferredInjuries[side].push(entry);
    cards[side][index].playThroughRisk = true;
    log(liveText, 'discomfort', side);
    if (side === 'home') {
      $('#matchStatus').textContent = 'Alerta médico: jogador com incômodo. Substitua-o para evitar agravamento ou retome mantendo-o em campo.';
      openPreparation('ALERTA MÉDICO');
      renderRoster(); drawBoard(); renderSubstitutionControls();
      return true;
    }
    if (Math.random() < calculatePlayThroughSubChance(player, incident.injury, entry.context)) {
      const bench = club.roster.slice(11).filter(candidate => !playerUnavailableFn(candidate) && !liveInjuries.away.some(item => item.name === candidate.name) && !liveDeferredInjuries.away.some(item => item.name === candidate.name));
      if (bench.length) {
        const expected = player.pos, compatible = bench.filter(candidate => candidate.pos === expected || (compatibleRoles[expected] || []).includes(candidate.pos)), incoming = [...(compatible.length ? compatible : bench)].sort((a, b) => b.overall - a.overall)[0], incomingIndex = club.roster.indexOf(incoming);
        [club.roster[index], club.roster[incomingIndex]] = [incoming, player];
        entry.preemptiveSubstitution = true; entry.keptPlaying = false; cards.away[index].playThroughRisk = false;
        cards.away[index] = { yellow: 0, red: false, dismissal: null, injured: false, playThroughRisk: false };
        liveMinutesPlayed.away.set(incoming.name, liveMinutesPlayed.away.get(incoming.name) ?? 0);
        log(`${club.name} substitui ${player.name} por precaução após incômodo (${incoming.name}).`, 'injury-substitution', side);
        pushLiveVolumeIncident?.(side, 'substitution', {
          name: `${player.name} → ${incoming.name}`,
        });
        renderRoster(); drawBoard(); renderStats();
      }
    }
    return false;
  };

  const checkMinuteAggravation = (side, index, player) => {
    const minute = getMinute(), liveDeferredInjuries = getLiveDeferredInjuries(), cards = getCards();
    const entry = liveDeferredInjuries[side]?.find(item => item.name === player.name);
    if (!entry || entry.preemptiveSubstitution || entry.aggravated || !cards[side][index]?.playThroughRisk) return;
    const minutesAfter = minute - (entry.minuteAtIncident ?? minute), energy = player.fatigue;
    const chance = clamp(.0014 + minutesAfter * .002 + (energy < 40 ? .015 : 0) + (energy < 25 ? .02 : 0), .0008, .09);
    if (Math.random() < chance) escalateLivePlayThroughInjury(side, index, player);
  };

  const enforceLiveRehabLimit = (side, index, player) => {
    const cards = getCards(), liveMinutesPlayed = getLiveMinutesPlayed(), liveInjuries = getLiveInjuries(), liveDeferredInjuries = getLiveDeferredInjuries(), userClub = getUserClub(), clubs = getClubs(), matchClub = getMatchClub();
    const max = playerRehabMaxMinutes(player);
    if (!max || cards[side][index]?.red || cards[side][index]?.injured) return;
    const mins = liveMinutesPlayed[side].get(player.name) ?? 0;
    if (mins < max || cards[side][index]?.minuteLimitWarned) return;
    cards[side][index].minuteLimitWarned = true;
    const club = side === 'home' ? clubs[userClub] : matchClub;
    log(`${player.name} atinge o limite médico de ${max} minutos.`, 'injury-substitution', side);
    if (side === 'home') {
      $('#matchStatus').textContent = `Limite médico: ${player.name} atingiu ${max} minutos. Substitua-o para evitar recaída.`;
      openPreparation('LIMITE MÉDICO');
      return;
    }
    const bench = club.roster.slice(11).filter(candidate => !playerUnavailable(candidate) && !liveInjuries.away.some(item => item.name === candidate.name) && !liveDeferredInjuries.away.some(item => item.name === candidate.name));
    if (!bench.length || getAwaySubstitutions() >= 5) return;
    const expected = player.pos, compatible = bench.filter(candidate => candidate.pos === expected || (compatibleRoles[expected] || []).includes(candidate.pos)), incoming = [...(compatible.length ? compatible : bench)].sort((a, b) => b.overall - a.overall)[0], incomingIndex = club.roster.indexOf(incoming);
    [club.roster[index], club.roster[incomingIndex]] = [incoming, player];
    cards.away[index] = { yellow: 0, red: false, dismissal: null, injured: false, playThroughRisk: false, minuteLimitWarned: false };
    liveMinutesPlayed.away.set(incoming.name, liveMinutesPlayed.away.get(incoming.name) ?? 0);
    incrementAwaySubstitutions();
    log(`${club.name} substitui ${player.name} ao atingir limite médico por ${incoming.name}.`, 'injury-substitution', side);
    pushLiveVolumeIncident?.(side, 'substitution', {
      name: `${player.name} → ${incoming.name}`,
    });
    renderRoster(); drawBoard(); renderSubstitutionControls(); renderStats();
  };

  // --- Ciclo minuto a minuto --------------------------------------------------

  const applyWear = () => {
    const userClub = getUserClub(), clubs = getClubs(), matchClub = getMatchClub(), cards = getCards(), liveMinutesPlayed = getLiveMinutesPlayed(), nextUserGame = getNextUserGame();
    [[getStarters(), clubs[userClub], 'home'], [matchClub.roster.slice(0, 11), matchClub, 'away']].forEach(([lineup, club, side]) => {
      const wear = clubInstitutionalContext(club, nextUserGame?.home === club.name).wear;
      applyMinuteWearToLineup({ lineup, side, cards, liveMinutesPlayed, wear, onPlayThrough: checkMinuteAggravation, onRehab: enforceLiveRehabLimit });
    });
    makeAwayFatigueSubstitution();
    renderRoster();
  };

  // Um erro de dados não pode continuar avançando apenas o relógio e encerrar
  // uma partida sem eventos. Além de interromper o ciclo, a interface informa o
  // problema em vez de produzir silenciosamente um 0 x 0 com estatísticas zeradas.
  const tick = () => {
    try { applyWear(); advance(); }
    catch (error) {
      stopMatchClock();
      console.error('Falha no ciclo da simulação ao vivo:', error);
      $('#matchStatus').textContent = 'A simulação foi pausada para preservar a partida.';
      log('O motor encontrou uma inconsistência e interrompeu o relógio. Reabra a partida para continuar.', 'engine-warning');
    }
  };

  const foul = (side, otherSide, details = {}) => {
    const stats = getStats(), cards = getCards(), matchDiscipline = getMatchDiscipline(), userClub = getUserClub(), matchClub = getMatchClub();
    const s = stats[side], defending = side === 'home' ? profile() : opponentForMatch();
    const attacking = otherSide === 'home' ? profile() : opponentForMatch();
    const fouler = details.foulerName || playerFor(side, 'foul');
    const attacker = details.attackerName || playerFor(otherSide, 'shot');
    const foulerData = actorData(side, fouler), attackerData = actorData(otherSide, attacker);
    const tactical = tacticalDiscipline(side);
    const duel = clamp((attackerData.dribble * .42 + attackerData.speed * .24 + attackerData.finishing * .18 + attacking.attack * .16 - (foulerData.marking * .45 + foulerData.tackling * .43 + defending.defense * .12)) / 125, -.35, .42);
    const threat = clamp(.32 + (details.phase === 'final' ? .24 : 0) + (attackerData.speed + attackerData.dribble - foulerData.speed) / 230 + (attacking.attack - defending.defense) / 190, .16, .93);
    const type = threat > .68 && Math.random() < .62 ? 'falta para matar contra-ataque' : threat > .52 ? 'falta defensiva' : 'falta ofensiva';
    const zone = threat > .78 ? 'na faixa final do campo' : threat > .57 ? 'na entrada da área' : threat > .38 ? 'na intermediária' : 'no corredor lateral';
    s.fouls++;
    const lineup = side === 'home' ? getStarters() : matchClub.roster.slice(0, 11);
    const index = lineup.findIndex(player => player.name === fouler);
    const state = cards[side][index];
    if (!state) return false;
    // Cartões permanecem seletivos: a frequência vem da gravidade do duelo,
    // do local da falta e do contexto tático, não somente do aumento de faltas.
    const yellowChance = clamp(engineTuning.bookingBase + tactical * .34 + Math.max(0, duel) * .20 + (type.includes('contra') ? .15 : type === 'falta defensiva' ? .065 : .018) + (zone.includes('final') ? .065 : zone.includes('área') ? .04 : 0), .035, .36);
    // Depois de advertido, o atleta tende a se conter. O segundo amarelo só
    // volta a ser provável em uma falta grave/interrompendo contra-ataque.
    const severeSecondYellow = type.includes('contra') && (zone.includes('final') || threat > .82);
    const bookingChance = state.yellow ? yellowChance * (severeSecondYellow ? .52 : .16) : yellowChance;
    // Nem toda falta frontal vira chute direto: a maioria é cruzada ou
    // trabalhada. As elegíveis mantêm boa conversão para especialistas.
    const directFreeKick = zone === 'na entrada da área' && type !== 'falta ofensiva' && Math.random() < .12;
    let message = `${type[0].toUpperCase() + type.slice(1)} de ${fouler} em ${attacker}, ${zone}.`;
    if (Math.random() >= bookingChance || totalCards() >= 5) {
      log(message, 'foul', side);
      if (directFreeKick) takeFreeKick(otherSide, attacking, defending);
    } else {
      // Vermelho direto: punição de 1 a 3 jogos conforme gravidade da falta.
      const directRed = threat > .90 && type.includes('contra') && Math.random() < .012;
      if (!directRed) { state.yellow++; s.yellow++; }
      if (directRed || state.yellow >= 2) {
        const dismissalType = directRed ? directRedDismissalType({ threat, type, zone }) : 'secondYellow';
        state.red = true; state.dismissal = dismissalType; s.red++;
        setDisciplineEvents(getDisciplineEvents() + 1);
        const gamesLabel = directRed ? ` Suspenso por ${directRedSuspensionGames({ threat, type, zone })} jogo${directRedSuspensionGames({ threat, type, zone }) === 1 ? '' : 's'}.` : '';
        message += directRed ? ` Cartão vermelho direto.${gamesLabel}` : ' Segundo amarelo: cartão vermelho.';
        log(message, 'red', side);
        pushLiveVolumeIncident?.(side, 'red', { name: fouler });
        matchDiscipline[side].set(fouler, { name: fouler, yellow: 0, dismissal: state.dismissal, redContext: directRed ? { threat, type, zone } : null });
        const attackerPlayer = actorData(otherSide, attacker), foulerPlayer = actorData(side, fouler);
        const foulVictim = pickInjuryVictim({ eventPhase: details.phase || 'duel', contact: true, intensity: clamp(threat, .45, .9), phase: details.phase, zone: details.phase === 'final' ? 'entrada da área' : undefined }, attackerPlayer, foulerPlayer);
        if (side === 'home') {
          drawBoard();
          openPreparation('CARTÃO VERMELHO');
          return tryLiveEventInjury(foulVictim === attackerPlayer ? otherSide : side, foulVictim.name, { eventPhase: details.phase || 'duel', contact: true, intensity: clamp(threat, .45, .9), phase: details.phase, zone: details.phase === 'final' ? 'entrada da área' : undefined }) || true;
        }
        renderStats();
        return tryLiveEventInjury(foulVictim === attackerPlayer ? otherSide : side, foulVictim.name, { eventPhase: details.phase || 'duel', contact: true, intensity: clamp(threat, .45, .9), phase: details.phase, zone: details.phase === 'final' ? 'entrada da área' : undefined });
      } else {
        setDisciplineEvents(getDisciplineEvents() + 1);
        message += ' Cartão amarelo.'; log(message, 'yellow', side);
        pushLiveVolumeIncident?.(side, 'yellow', { name: fouler });
        if (side === 'home') drawBoard();
        if (directFreeKick) takeFreeKick(otherSide, attacking, defending);
      }
    }
    matchDiscipline[side].set(fouler, { name: fouler, yellow: state.dismissal ? 0 : state.yellow, dismissal: state.dismissal || null });
    const attackerPlayer = actorData(otherSide, attacker), foulerPlayer = actorData(side, fouler);
    const foulVictim = pickInjuryVictim({ eventPhase: details.phase || 'duel', contact: true, intensity: clamp(threat, .45, .9), phase: details.phase, zone: details.phase === 'final' ? 'entrada da área' : undefined }, attackerPlayer, foulerPlayer);
    return tryLiveEventInjury(foulVictim === attackerPlayer ? otherSide : side, foulVictim.name, { eventPhase: details.phase || 'duel', contact: true, intensity: clamp(threat, .45, .9), phase: details.phase, zone: details.phase === 'final' ? 'entrada da área' : undefined });
  };

  // --- Pênaltis / shootout -----------------------------------------------------

  const shootoutGoalsCount = club => (getShootoutState()?.results?.[club] || []).filter(Boolean).length;
  const shootoutAttemptsCount = club => (getShootoutState()?.results?.[club] || []).length;
  const currentShootoutClub = () => { const shootoutState = getShootoutState(); return shootoutState?.clubs?.[(shootoutState.firstKicker + shootoutState.kickIndex) % 2]; };
  const shootoutLineup = clubName => {
    const userClub = getUserClub(), matchClub = getMatchClub(), clubs = getClubs();
    if (clubName === userClub) return getActiveStarters();
    const opponent = matchClub.name;
    if (clubName === opponent) return matchClub.roster.slice(0, 11);
    return clubs[clubName]?.roster?.slice(0, 11) || [];
  };
  const shootoutCardsFor = clubName => {
    const userClub = getUserClub(), matchClub = getMatchClub(), cards = getCards();
    if (clubName === userClub) return cards.home;
    if (clubName === matchClub.name) return cards.away;
    return [];
  };

  const renderShootoutTrack = () => {
    const shootoutState = getShootoutState();
    if (!shootoutState) return;
    const [c0, c1] = shootoutState.clubs, mark = kicks => (kicks || []).map(hit => `<i class="${hit ? 'hit' : 'miss'}">${hit ? '✓' : '✗'}</i>`).join('') || '<i class="pending">·</i>';
    $('#shootoutTitle').textContent = `${c0} ${shootoutGoalsCount(c0)} — ${shootoutGoalsCount(c1)} ${c1}`;
    $('#shootoutTrack').innerHTML = `<article><b>${c0.toUpperCase()}</b><div class="shootout-kicks">${mark(shootoutState.results[c0])}</div></article><article><b>${c1.toUpperCase()}</b><div class="shootout-kicks">${mark(shootoutState.results[c1])}</div></article>`;
    $('#shootoutHint').textContent = shootoutState.suddenDeath
      ? 'Morte súbita: cada cobrança pode decidir. Se todos cobrarem, a lista reinicia até haver vencedor.'
      : 'Disputa alternada — escolha um cobrador diferente a cada vez.';
  };

  const logShootout = (text, type = '', side = null) => {
    const shootoutState = getShootoutState();
    const kickNo = Math.max(1, Math.ceil((shootoutState?.kickIndex || 0) / 2));
    log(`PÊN ${kickNo} · ${text}`, type || 'penalty', side);
  };

  const evaluateShootoutWinner = () => {
    const shootoutState = getShootoutState();
    if (!shootoutState) return null;
    const decided = decideShootoutWinner({
      clubs: shootoutState.clubs,
      results: shootoutState.results,
      suddenDeath: shootoutState.suddenDeath,
    });
    shootoutState.suddenDeath = !!decided.suddenDeath;
    return decided.winner || null;
  };

  /** Pool de cobradores; reinicia a lista se todos já cobraram. */
  const shootoutTakersFor = clubName => {
    const shootoutState = getShootoutState();
    if (!shootoutState) return [];
    shootoutState.usedNames[clubName] = shootoutState.usedNames[clubName] || [];
    const { takers, recycled, usedNames } = resolveShootoutTakerPool(
      shootoutLineup(clubName),
      shootoutCardsFor(clubName),
      shootoutState.usedNames[clubName],
    );
    shootoutState.usedNames[clubName] = usedNames;
    if (recycled) {
      logShootout(`Todos já cobraram por ${clubName} — lista de cobradores reiniciada.`, 'penalty');
      if ($('#shootoutHint')) {
        $('#shootoutHint').textContent = 'Morte súbita: a lista de cobradores reinicia até haver um vencedor.';
      }
    }
    return takers;
  };

  const pickShootoutCpuTaker = clubName => {
    const eligible = shootoutTakersFor(clubName);
    if (!eligible.length) return null;
    return eligible[Math.random() < .82 ? 0 : Math.min(1, eligible.length - 1)] || eligible[0];
  };

  let penaltyDuelTimer = null;
  let penaltyAgainstStartTimer = null;

  const setPenaltyDuelNarration = text => {
    const el = $('#penaltyDuelNarration');
    if (el) el.textContent = text;
  };

  const setPenaltyDuelHint = text => {
    const el = $('#penaltyDuelHint');
    if (el) el.textContent = text;
  };

  const clearPenaltyDuelKick = () => {
    const stage = $('#penaltyDuelStage');
    const pitch = stage?.querySelector('.penalty-duel-pitch');
    stage?.classList.remove('is-resolving', 'is-result', 'outcome-goal', 'outcome-save', 'outcome-wide');
    if (pitch) {
      pitch.removeAttribute('data-kick');
      pitch.classList.remove('is-kicking');
    }
  };

  const resetPenaltyDuelStage = (narration = 'Escolha o cobrador para iniciar a cobrança.') => {
    if (penaltyDuelTimer) { clearTimeout(penaltyDuelTimer); penaltyDuelTimer = null; }
    const stage = $('#penaltyDuelStage');
    clearPenaltyDuelKick();
    stage?.classList.add('is-idle');
    setPenaltyDuelNarration(narration);
    $('#penaltyTakers')?.querySelectorAll('button').forEach(btn => {
      btn.disabled = false;
      btn.classList.remove('is-selected');
    });
  };

  const closePenaltyDuel = () => {
    if (penaltyDuelTimer) { clearTimeout(penaltyDuelTimer); penaltyDuelTimer = null; }
    if (penaltyAgainstStartTimer) {
      clearTimeout(penaltyAgainstStartTimer);
      penaltyAgainstStartTimer = null;
    }
    const modal = $('#penaltyDuelModal');
    modal?.classList.add('hidden');
    modal?.classList.remove('is-defend');
    const eyebrow = modal?.querySelector('.penalty-duel-eyebrow');
    if (eyebrow) eyebrow.textContent = 'MOMENTO DECISIVO';
    $('#penaltyChoice')?.classList.add('hidden');
    $('#penaltyCompare')?.classList.add('hidden');
    setPenaltyDuelHint(
      'À esquerda, o cobrador. À direita, só o gol e a marca — a batida segue a narração.',
    );
    resetPenaltyDuelStage();
  };

  const sponsorLedCell = (name, { master = false } = {}) => {
    const slug = sponsorLogoSlug(name);
    const url = slug ? SPONSOR_LOGO_URLS[slug] : null;
    const label = String(name || '—');
    const logo = url
      ? `<img src="${url}" alt="${label}" width="72" height="72" loading="lazy" decoding="async">`
      : `<span class="penalty-duel-led-fallback" aria-hidden="true">${label
          .split(' ')
          .map(part => part[0])
          .join('')
          .slice(0, 3)
          .toUpperCase()}</span>`;
    return `<div class="penalty-duel-led ${master ? 'is-master' : ''}" title="${label}" aria-label="${label}">${logo}</div>`;
  };

  /** Mini placas LED com master + secundários do clube do usuário. */
  const renderPenaltySponsorBoards = () => {
    const root = $('#penaltyDuelBoards');
    if (!root) return;
    const club = getClubs()?.[getUserClub()];
    const sponsors = getSponsors(club);
    const names = [];
    if (sponsors?.master?.name) names.push({ name: sponsors.master.name, master: true });
    (sponsors?.secondaries || []).forEach(item => {
      if (item?.name) names.push({ name: item.name, master: false });
    });
    if (!names.length) {
      root.innerHTML = '';
      root.classList.add('is-empty');
      return;
    }
    root.classList.remove('is-empty');
    // Duplica a faixa para o scroll contínuo estilo placar eletrônico.
    const cells = names.map(item => sponsorLedCell(item.name, { master: item.master })).join('');
    root.innerHTML = `<div class="penalty-duel-boards-rail is-scrolling" aria-hidden="true">${cells}${cells}</div>`;
  };

  const openPenaltyDuel = (title = 'Disputa de pênalti', idleText, options = {}) => {
    const titleEl = $('#penaltyDuelTitle');
    if (titleEl) titleEl.textContent = title;
    const against = options.mode === 'against';
    const eyebrow = $('#penaltyDuelModal')?.querySelector('.penalty-duel-eyebrow');
    if (eyebrow) eyebrow.textContent = against ? 'PERIGO NO GOL' : 'MOMENTO DECISIVO';
    resetPenaltyDuelStage(
      idleText ||
        (against
          ? 'Pênalti contra o seu gol. Seu goleiro se prepara…'
          : 'O juiz aponta a marca da cal. Escolha o cobrador.'),
    );
    renderPenaltySponsorBoards();
    const modal = $('#penaltyDuelModal');
    modal?.classList.toggle('is-defend', against);
    if (against) {
      $('#penaltyChoice')?.classList.add('hidden');
      $('#penaltyCompare')?.classList.remove('hidden');
      setPenaltyDuelHint(
        'À esquerda, cobrador adversário × seu goleiro. À direita, a cobrança animada.',
      );
    } else {
      $('#penaltyCompare')?.classList.add('hidden');
      $('#penaltyChoice')?.classList.remove('hidden');
      setPenaltyDuelHint(
        'À esquerda, o cobrador. À direita, só o gol e a marca — a batida segue a narração.',
      );
    }
    modal?.classList.remove('hidden');
  };

  const renderPenaltyAgainstCompare = (
    taker,
    keeper,
    {
      title = 'Pênalti contra o seu gol',
      subtitle = 'Comparativo da cobrança',
      attackLabel = 'COBRADOR · ADVERSÁRIO',
      defendLabel = 'SEU GOLEIRO',
      note = 'Leia o comparativo e toque em ASSISTIR para a cobrança.',
    } = {},
  ) => {
    const specialist = isPenaltySpecialist(taker);
    const goalChance = Math.round(
      clamp(
        0.69 +
          ((taker?.penaltyTaking || 70) - (keeper?.penaltySaving || 70)) / 95 +
          ((taker?.penaltyTaking || 70) - 70) / 260 +
          (specialist ? 0.035 : 0),
        0.56,
        0.94,
      ) * 100,
    );
    const root = $('#penaltyCompare');
    if (!root) return;
    root.innerHTML = `
      <header class="penalty-compare-header">
        <strong>${title}</strong>
        <span>${subtitle}</span>
      </header>
      <div class="penalty-compare-vs">
        <article class="penalty-compare-card is-attack">
          <small>${attackLabel}</small>
          <b>${taker.name}</b>
          <em>${taker.pos} · OVR ${taker.overall}</em>
          ${specialist ? '<i class="penalty-specialist">ESPECIALISTA</i>' : ''}
          <dl>
            <div><dt>Cobrança</dt><dd>${taker.penaltyTaking}</dd></div>
            <div><dt>Finalização</dt><dd>${taker.finishing ?? '—'}</dd></div>
          </dl>
        </article>
        <div class="penalty-compare-mid" aria-label="Chance estimada de gol">
          <span>VS</span>
          <strong>${goalChance}%</strong>
          <small>chance de gol</small>
        </div>
        <article class="penalty-compare-card is-defend">
          <small>${defendLabel}</small>
          <b>${keeper.name}</b>
          <em>GOL · OVR ${keeper.overall}</em>
          <dl>
            <div><dt>Def. pênalti</dt><dd>${keeper.penaltySaving ?? '—'}</dd></div>
            <div><dt>Reflexos</dt><dd>${keeper.reflexes ?? '—'}</dd></div>
          </dl>
        </article>
      </div>
      <button type="button" id="penaltyWatchBtn" class="penalty-watch-btn">ASSISTIR</button>
      <p class="penalty-compare-note">${note}</p>`;
  };

  /** Pausa de leitura: só inicia a cobrança após o clique em ASSISTIR. */
  const wirePenaltyWatchButton = onWatch => {
    const btn = $('#penaltyWatchBtn');
    if (!btn || typeof onWatch !== 'function') return;
    btn.onclick = () => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = 'ASSISTINDO…';
      onWatch();
    };
  };

  const isPenaltyDuelOpen = () => {
    const modal = $('#penaltyDuelModal');
    if (modal) return !modal.classList.contains('hidden');
    return !!$('#penaltyChoice') && !$('#penaltyChoice').classList.contains('hidden');
  };

  const cornerNarration = corner => {
    if (corner === 'left') return 'Aponta o canto esquerdo…';
    if (corner === 'right') return 'Olha o canto direito…';
    if (corner === 'over') return 'Sobe a bola demais…';
    return 'Bate no meio do gol…';
  };

  const resultNarration = (plan, takerName) => {
    const { outcome, corner, goalkeeper } = plan;
    if (outcome === 'goal') {
      if (corner === 'left') return `GOOOL! ${takerName} enterra no ângulo esquerdo!`;
      if (corner === 'right') return `GOOOL! ${takerName} crava no ângulo direito!`;
      return `GOOOL! ${takerName} converte no meio do gol!`;
    }
    if (outcome === 'save') {
      if (corner === 'left') return `${goalkeeper} voa no canto esquerdo e defende!`;
      if (corner === 'right') return `${goalkeeper} estica no canto direito e pega!`;
      return `${goalkeeper} fica no meio e faz a defesa!`;
    }
    if (corner === 'over') return `Por cima da trave! ${takerName} manda para fora.`;
    if (corner === 'left') return `Raspou a trave esquerda e foi para fora!`;
    return `Passou rente à trave direita e foi para fora!`;
  };

  /**
   * Anima a cobrança com o plano já definido (outcome/canto) e só então chama onDone(plan).
   * @param {string} takerName
   * @param {{ outcome:string, corner:string, kickKey:string, goalkeeper?:string }} plan
   * @param {Function} onDone
   */
  const runPenaltyDuelResolve = (takerName, plan, onDone) => {
    if (penaltyDuelTimer || !takerName || !plan?.outcome) return false;
    const stage = $('#penaltyDuelStage');
    const pitch = stage?.querySelector('.penalty-duel-pitch');
    const buttons = [...($('#penaltyTakers')?.querySelectorAll('button') || [])];
    buttons.forEach(btn => {
      btn.disabled = true;
      btn.classList.toggle('is-selected', btn.dataset.taker === takerName);
    });
    clearPenaltyDuelKick();
    stage?.classList.remove('is-idle');
    stage?.classList.add('is-resolving');
    const steps = [
      { text: `${takerName} coloca a bola na marca…`, ms: 750 },
      { text: cornerNarration(plan.corner), ms: 820 },
      { text: 'Ele corre e chuta!', ms: 480, kick: true },
      { text: resultNarration(plan, takerName), ms: 1250, result: true },
    ];
    let index = 0;
    const play = () => {
      const step = steps[index];
      setPenaltyDuelNarration(step.text);
      if (step.kick && pitch) {
        pitch.setAttribute('data-kick', plan.kickKey || `${plan.outcome}-${plan.corner}`);
        pitch.classList.add('is-kicking');
        stage.classList.add(`outcome-${plan.outcome}`);
      }
      if (step.result) {
        stage.classList.add('is-result');
        stage.classList.remove('is-resolving');
      }
      index += 1;
      if (index < steps.length) {
        penaltyDuelTimer = setTimeout(play, step.ms);
        return;
      }
      penaltyDuelTimer = setTimeout(() => {
        penaltyDuelTimer = null;
        onDone?.(plan);
      }, step.ms);
    };
    play();
    return true;
  };

  const executeShootoutKick = (kickingClub, taker, plan = null) => {
    const shootoutState = getShootoutState();
    if (!shootoutState || !taker) return;
    const userClub = getUserClub();
    const isUser = kickingClub === userClub, side = isUser ? 'home' : 'away', current = isUser ? profile() : opponentForMatch(), other = isUser ? opponentForMatch() : profile();
    shootoutState.usedNames[kickingClub] = shootoutState.usedNames[kickingClub] || [];
    shootoutState.usedNames[kickingClub].push(taker.name);
    const resolved = plan || planPenaltyOutcome?.(side, { ...current, attack: current.attack + 9 }, other, {
      taker: taker.name,
      penaltySkill: taker.penaltyTaking,
    });
    const scored = shot(side, { ...current, attack: current.attack + 9 }, other, {
      penalty: true,
      shootout: true,
      taker: taker.name,
      penaltySkill: taker.penaltyTaking,
      forcedOutcome: resolved?.outcome,
      logFn: logShootout,
    }) || false;
    shootoutState.results[kickingClub] = shootoutState.results[kickingClub] || [];
    shootoutState.results[kickingClub].push(scored);
    shootoutState.kickIndex++;
    renderShootoutTrack();
    closePenaltyDuel();
    const winner = evaluateShootoutWinner();
    if (winner) return completePenaltyShootout(winner);
    scheduleNextShootoutKick();
  };

  const startShootoutTakerChoice = kickingClub => {
    const shootoutState = getShootoutState(), userClub = getUserClub();
    stopMatchClock(); setPendingPenalty({ mode: 'shootout', kickingClub }); $('#matchActions').classList.add('hidden');
    const section = $('#penaltyChoice'), keeperClub = shootoutState.clubs.find(name => name !== kickingClub), keeperLineup = shootoutLineup(keeperClub), keeper = keeperLineup.find(player => player.pos === 'GOL') || keeperLineup[0];
    let heading = section.querySelector('.penalty-choice-heading');
    if (!heading) { heading = document.createElement('div'); heading.className = 'penalty-choice-heading'; section.prepend(heading); }
    const kickNo = shootoutAttemptsCount(kickingClub) + 1;
    heading.innerHTML = `<div><strong>Cobrança ${kickNo} — escolha o batedor</strong></div><span class="penalty-goalkeeper"><small>GOLEIRO ADVERSÁRIO</small><b>${keeper.name}</b><em>DEF. PÊNALTI ${keeper.penaltySaving}</em></span>`;
    const takers = shootoutChoiceOptions(shootoutTakersFor(kickingClub), 5);
    const chanceFor = player => Math.round(clamp(.69 + (player.penaltyTaking - keeper.penaltySaving) / 95 + (player.penaltyTaking - 70) / 260 + (isPenaltySpecialist(player) ? .035 : 0), .56, .94) * 100);
    $('#penaltyTakers').innerHTML = takers.length ? takers.map((player, index) => `<button class="${index === 0 ? 'best-option' : ''}" data-taker="${player.name}"><span class="penalty-taker-title"><b>${player.name} · ${player.pos}</b>${index === 0 ? '<i class="penalty-best-badge">MELHOR OPÇÃO</i>' : isPenaltySpecialist(player) ? '<i class="penalty-specialist">ESPECIALISTA</i>' : ''}</span><span class="penalty-metric"><small>OVERALL</small><strong>${player.overall}</strong></span><span class="penalty-metric chance"><small>CHANCE ESTIMADA</small><strong>${chanceFor(player)}%</strong></span></button>`).join('') : '<p class="shootout-empty">Sem cobradores disponíveis.</p>';
    openPenaltyDuel(
      'Disputa de pênaltis',
      `Cobrança ${kickNo}. Escolha o batedor com calma — cada chute decide.`,
    );
    $('#matchStatus').textContent = `Disputa de pênaltis: escolha o cobrador da ${kickNo}ª cobrança.`;
  };

  /** Cobrança da IA no mata-mata: comparativo + animação (mesmo fluxo do pênalti contra). */
  const startShootoutCpuKick = (kickingClub, taker) => {
    const shootoutState = getShootoutState();
    if (!shootoutState || !taker) return;
    if (penaltyAgainstStartTimer) {
      clearTimeout(penaltyAgainstStartTimer);
      penaltyAgainstStartTimer = null;
    }
    const kickNo = shootoutAttemptsCount(kickingClub) + 1;
    const keeperClub = shootoutState.clubs.find(name => name !== kickingClub);
    const keeperLineup = shootoutLineup(keeperClub);
    const keeper = keeperLineup.find(player => player.pos === 'GOL') || keeperLineup[0];
    const userClub = getUserClub();
    const defendingUser = keeperClub === userClub;
    stopMatchClock();
    setPendingPenalty({
      mode: 'shootout-cpu',
      kickingClub,
      takerName: taker.name,
    });
    $('#matchActions').classList.add('hidden');
    renderPenaltyAgainstCompare(taker, keeper, {
      title: `Cobrança ${kickNo} · ${kickingClub}`,
      subtitle: 'Comparativo da disputa',
      attackLabel: `COBRADOR · ${kickingClub}`,
      defendLabel: defendingUser ? 'SEU GOLEIRO' : `GOLEIRO · ${keeperClub}`,
      note: 'Leia o comparativo e toque em ASSISTIR para a cobrança.',
    });
    openPenaltyDuel(
      'Disputa de pênaltis',
      `${taker.name} coloca a bola na marca…`,
      { mode: 'against' },
    );
    $('#matchStatus').textContent = `Disputa de pênaltis: ${kickingClub} prepara a ${kickNo}ª — toque em ASSISTIR.`;

    const side = kickingClub === userClub ? 'home' : 'away';
    const current = side === 'home' ? profile() : opponentForMatch();
    const other = side === 'home' ? opponentForMatch() : profile();
    const plan = planPenaltyOutcome?.(
      side,
      { ...current, attack: current.attack + 9 },
      other,
      { taker: taker.name, penaltySkill: taker.penaltyTaking },
    );

    wirePenaltyWatchButton(() => {
      const pending = getPendingPenalty?.();
      if (!pending || pending.mode !== 'shootout-cpu') return;
      if (!plan) {
        // Limpa o modo CPU antes de avançar — a próxima cobrança (usuário) redefine pending.
        setPendingPenalty(null);
        executeShootoutKick(kickingClub, taker);
        return;
      }
      const note = $('#penaltyCompare')?.querySelector('.penalty-compare-note');
      if (note) note.textContent = 'Bola rolando — acompanhe a cobrança.';
      runPenaltyDuelResolve(taker.name, plan, () => {
        // Não limpar depois do execute: scheduleNext pode já ter aberto a escolha do usuário.
        setPendingPenalty(null);
        executeShootoutKick(kickingClub, taker, plan);
      });
    });
  };

  const scheduleNextShootoutKick = () => {
    const shootoutState = getShootoutState(), userClub = getUserClub();
    if (!shootoutState) return;
    const club = currentShootoutClub();
    if (club === userClub) startShootoutTakerChoice(club);
    else {
      $('#matchStatus').textContent = `${club} prepara a cobrança…`;
      setTimeout(() => {
        const taker = pickShootoutCpuTaker(club);
        if (taker) {
          startShootoutCpuKick(club, taker);
          return;
        }
        // Não pode travar: tenta de novo com pool reiniciado; se ainda falhar, encerra com empate técnico.
        const retry = pickShootoutCpuTaker(club);
        if (retry) {
          startShootoutCpuKick(club, retry);
          return;
        }
        log('Disputa sem cobrador elegível — encerrando por falta de elenco.', 'penalty');
        const [c0, c1] = shootoutState.clubs;
        const g0 = shootoutGoalsCount(c0), g1 = shootoutGoalsCount(c1);
        completePenaltyShootout(g0 >= g1 ? c0 : c1);
      }, Math.max(450, optionsUi.getPaceMs() * 2));
    }
  };

  const completePenaltyShootout = winner => {
    const liveMatchGame = getLiveMatchGame();
    if (!getShootoutState() || !liveMatchGame) return;
    const penFor = club => shootoutGoalsCount(club);
    liveMatchGame.shootoutWinner = winner;
    liveMatchGame.shootoutPenalties = `${penFor(liveMatchGame.home)}–${penFor(liveMatchGame.away)}`;
    liveMatchGame.penalties = liveMatchGame.shootoutPenalties;
    log('Disputa de pênaltis encerrada.', 'penalty');
    renderShootoutTrack();
    $('#matchStatus').textContent = `Shootout: ${winner} venceu ${liveMatchGame.shootoutPenalties}.`;
    closePenaltyDuel();
    setShootoutState(null);
    setMatchFinished(true);
    simulateRoundResults();
    renderFinalSummary();
    showFinalActions();
  };

  const startPenaltyShootout = () => {
    const liveMatchGame = getLiveMatchGame();
    const games = getKnockoutTieGames(liveMatchGame), clubs = [games[0]?.home, games[0]?.away].filter(Boolean);
    if (clubs.length < 2) return;
    setShootoutState({ clubs, firstKicker: 1, kickIndex: 0, results: { [clubs[0]]: [], [clubs[1]]: [] }, usedNames: { [clubs[0]]: [], [clubs[1]]: [] }, suddenDeath: false, competition: liveMatchGame?.competition });
    log(`Empate no agregado. Disputa de pênaltis — ${knockoutCompetitionLabel(liveMatchGame)}!`, 'penalty');
    $('#matchStatus').textContent = 'Disputa de pênaltis — escolha os cobradores quando for sua vez.';
    $('#matchActions').classList.add('hidden');
    const panel = $('#shootoutPanel');
    $('#matchModal .score').after(panel);
    panel.classList.remove('hidden');
    renderShootoutTrack();
    scheduleNextShootoutKick();
  };

  const startPenaltyChoice = (current, other) => {
    const matchClub = getMatchClub(), cards = getCards();
    setPendingPenalty({ current, other }); stopMatchClock(); $('#matchActions').classList.add('hidden');
    const section = $('#penaltyChoice'), keeper = matchClub.roster.slice(0, 11).find((player, index) => player.pos === 'GOL' && !cards.away[index]?.red) || matchClub.roster[0];
    let heading = section.querySelector('.penalty-choice-heading');
    if (!heading) { heading = document.createElement('div'); heading.className = 'penalty-choice-heading'; section.prepend(heading); }
    heading.innerHTML = `<div><strong>Escolha o cobrador</strong></div><span class="penalty-goalkeeper"><small>GOLEIRO ADVERSÁRIO</small><b>${keeper.name}</b><em>DEF. PÊNALTI ${keeper.penaltySaving}</em></span>`;
    const takers = getActiveStarters().filter(player => player.pos !== 'GOL').sort((a, b) => b.penaltyTaking - a.penaltyTaking || b.overall - a.overall).slice(0, 3);
    const chanceFor = player => Math.round(clamp(.69 + (player.penaltyTaking - keeper.penaltySaving) / 95 + (player.penaltyTaking - 70) / 260 + (isPenaltySpecialist(player) ? .035 : 0), .56, .94) * 100);
    $('#penaltyTakers').innerHTML = takers.map((player, index) => `<button class="${index === 0 ? 'best-option' : ''}" data-taker="${player.name}"><span class="penalty-taker-title"><b>${player.name} · ${player.pos}</b>${index === 0 ? '<i class="penalty-best-badge">MELHOR BATEDOR</i>' : isPenaltySpecialist(player) ? '<i class="penalty-specialist">ESPECIALISTA</i>' : ''}</span><span class="penalty-metric"><small>OVERALL</small><strong>${player.overall}</strong></span><span class="penalty-metric chance"><small>CHANCE ESTIMADA</small><strong>${chanceFor(player)}%</strong></span></button>`).join('');
    openPenaltyDuel('Pênalti!', 'O juiz aponta a marca da cal. Escolha o cobrador.');
    $('#matchStatus').textContent = 'Pênalti: escolha o cobrador na janela da disputa.';
  };

  /**
   * Pênalti do adversário: janela com comparativo (cobrador IA × seu goleiro).
   * A cobrança só começa ao clicar em ASSISTIR (tempo para ler o painel).
   */
  const startPenaltyAgainst = (current, other) => {
    const cards = getCards();
    const taker = penaltyTaker('away');
    const starters = getStarters();
    const keeper =
      starters.find((player, index) => player.pos === 'GOL' && !cards.home[index]?.red) ||
      starters.find(player => player.pos === 'GOL') ||
      starters[0];
    if (!taker || !keeper) {
      if (taker) {
        shot(
          'away',
          { ...current, attack: current.attack + 35 },
          other,
          { penalty: true, taker: taker.name, penaltySkill: taker.penaltyTaking },
        );
        renderStats();
      }
      return;
    }
    if (penaltyAgainstStartTimer) {
      clearTimeout(penaltyAgainstStartTimer);
      penaltyAgainstStartTimer = null;
    }
    setPendingPenalty({
      mode: 'against',
      current,
      other,
      takerName: taker.name,
      keeperName: keeper.name,
    });
    stopMatchClock();
    $('#matchActions').classList.add('hidden');
    renderPenaltyAgainstCompare(taker, keeper);
    openPenaltyDuel(
      'Pênalti contra!',
      `${taker.name} vai à marca. ${keeper.name} se prepara no gol.`,
      { mode: 'against' },
    );
    $('#matchStatus').textContent = `Pênalti contra: ${taker.name} × ${keeper.name} — toque em ASSISTIR.`;

    wirePenaltyWatchButton(() => {
      const pending = getPendingPenalty?.();
      if (!pending || pending.mode !== 'against') return;
      const plan = planPenaltyOutcome?.(
        'away',
        { ...current, attack: current.attack + 35 },
        other,
        { taker: taker.name, penaltySkill: taker.penaltyTaking },
      );
      if (!plan) {
        shot(
          'away',
          { ...current, attack: current.attack + 35 },
          other,
          { penalty: true, taker: taker.name, penaltySkill: taker.penaltyTaking },
        );
        closePenaltyDuel();
        setPendingPenalty(null);
        $('#matchActions').classList.remove('hidden');
        $('#matchStatus').textContent = 'A partida está em andamento…';
        renderStats();
        startMatchClock();
        return;
      }
      const note = $('#penaltyCompare')?.querySelector('.penalty-compare-note');
      if (note) note.textContent = 'Bola rolando — acompanhe a cobrança.';
      runPenaltyDuelResolve(taker.name, plan, () => {
        shot(
          'away',
          { ...current, attack: current.attack + 35 },
          other,
          {
            penalty: true,
            taker: taker.name,
            penaltySkill: taker.penaltyTaking,
            forcedOutcome: plan.outcome,
          },
        );
        closePenaltyDuel();
        setPendingPenalty(null);
        $('#matchActions').classList.remove('hidden');
        $('#matchStatus').textContent = 'A partida está em andamento…';
        renderStats();
        startMatchClock();
      });
    });
  };

  // --- Avanço de minuto --------------------------------------------------------

  const advance = () => {
    const stats = getStats(), cards = getCards(), userClub = getUserClub(), matchClub = getMatchClub();
    const minute0 = getMinute();
    const elapsed = Math.max(1, Math.floor(rnd(1, 3)));
    let minute = minute0;
    const stoppageActive = getStoppageActive?.() || null;

    // Acréscimos: relógio fica em 45'/90', display 45+N / 90+N.
    if (stoppageActive === 'first' && !getHalftimeShown()) {
      const allowance = Math.max(1, Number(getStoppageFirst?.() || 1));
      const cur = Number(getStoppageElapsed?.() || 0);
      if (cur >= allowance) {
        openFirstHalfInterval();
        return;
      }
      setStoppageElapsed?.(cur + 1);
      setMinute(45);
      resetLiveClockSeconds();
      updateLiveMatchClock();
      minute = 45;
    } else if (stoppageActive === 'second') {
      const allowance = Math.max(1, Number(getStoppageSecond?.() || 1));
      const cur = Number(getStoppageElapsed?.() || 0);
      if (cur >= allowance) {
        finishRegulation();
        return;
      }
      setStoppageElapsed?.(cur + 1);
      setMinute(90);
      resetLiveClockSeconds();
      updateLiveMatchClock();
      minute = 90;
    } else {
      minute = minute0 + elapsed;
      // Entra nos acréscimos do 1º tempo.
      if (!getHalftimeShown() && minute0 < 45 && minute >= 45) {
        setMinute(45);
        const halfCtx = stoppageContext('first');
        setStoppageHalfSnap?.({
          fouls: halfCtx.fouls,
          yellow: halfCtx.yellow,
          red: halfCtx.red,
          subs: halfCtx.subs,
          goals: halfCtx.goals,
        });
        const allowance = rollStoppageMinutes(halfCtx);
        setStoppageFirst?.(allowance);
        setStoppageSecond?.(Number(getStoppageSecond?.() || 0));
        setStoppageElapsed?.(1);
        setStoppageActive?.('first');
        resetLiveClockSeconds();
        updateLiveMatchClock();
        log(
          `Árbitro indica ${allowance} minuto${allowance > 1 ? 's' : ''} de acréscimo no 1º tempo.`,
          'stoppage',
        );
        $('#matchStatus').textContent = `Acréscimos: ${allowance}' no 1º tempo.`;
        minute = 45;
      } else if (getHalftimeShown() && minute0 < 90 && minute >= 90) {
        setMinute(90);
        const allowance = rollStoppageMinutes(stoppageContext('second'));
        setStoppageSecond?.(allowance);
        setStoppageElapsed?.(1);
        setStoppageActive?.('second');
        resetLiveClockSeconds();
        updateLiveMatchClock();
        log(
          `Árbitro indica ${allowance} minuto${allowance > 1 ? 's' : ''} de acréscimo no 2º tempo.`,
          'stoppage',
        );
        $('#matchStatus').textContent = `Acréscimos: ${allowance}' no 2º tempo.`;
        minute = 90;
      } else if (!getHalftimeShown() && minute >= 45) {
        setMinute(45);
        openFirstHalfInterval();
        return;
      } else if (getHalftimeShown() && minute >= 90) {
        setMinute(90);
        finishRegulation();
        return;
      } else {
        setMinute(minute);
        resetLiveClockSeconds();
        updateLiveMatchClock();
      }
    }

    const homeBase = profile(), awayBase = opponentForMatch();
    const homeLive = liveOverall('home', homeBase), awayLive = liveOverall('away', awayBase);
    // A média efetiva ajusta as ações em escala moderada: favorece o melhor
    // momento, mas atributos individuais e aleatoriedade continuam decisivos.
    const homeProfile = { ...homeBase, overall: homeLive, attack: homeBase.attack + (homeLive - homeBase.overall) * .30, passing: homeBase.passing + (homeLive - homeBase.overall) * .26, defense: homeBase.defense + (homeLive - homeBase.overall) * .26 - cautionPenalty('home') };
    const awayProfile = { ...awayBase, overall: awayLive, attack: awayBase.attack + (awayLive - awayBase.overall) * .30, passing: awayBase.passing + (awayLive - awayBase.overall) * .26, defense: awayBase.defense + (awayLive - awayBase.overall) * .26 - cautionPenalty('away') };
    // Posse: força + tática + mando real do calendário (não o "home" interno do motor).
    // Alinhado ao match-sim: swings perceptíveis sem extremos irreais (ex.: 62–38 constantes).
    const overallGap = homeLive - awayLive;
    const openingPressure = minute <= 15 && Math.abs(overallGap) > 5 ? clamp((Math.abs(overallGap) - 5) * .55 + 1.5, 1.5, 5.5) : 0;
    const homeOpeningBias = overallGap > 5 ? openingPressure : overallGap < -5 ? -openingPressure : 0;
    stats.home.momentum = clamp(stats.home.momentum * .88, -12, 12);
    stats.away.momentum = clamp(stats.away.momentum * .88, -12, 12);
    const homeTactic = tacticFor('home'), awayTactic = tacticFor('away');
    const passRate = team => stats[team].passes ? stats[team].accurate / stats[team].passes : .72;
    const passControl = clamp((passRate('home') - passRate('away')) * 4, -1.2, 1.2);
    const attackControl = clamp((stats.home.goodAttacks - stats.away.goodAttacks) * .04 + (stats.home.attacks - stats.away.attacks) * .015, -1, 1);
    const redControl = ((cards.away?.filter(card => card.red).length || 0) - (cards.home?.filter(card => card.red).length || 0)) * 2;
    // Motor home = usuário; o bônus de mando segue o calendário (casa/fora de verdade).
    const venueBias = userAtHomeInLiveMatch() ? 2.2 : -2.2;
    const structuralControl = (homeProfile.passing - awayProfile.passing) * .40 + (homeProfile.overall - awayProfile.overall) * .16 + (homeTactic.possession - awayTactic.possession) * .10 + (homeTactic.press - awayTactic.press) * .03 + (homeTactic.mentality - awayTactic.mentality) * .02 + (stats.home.momentum - stats.away.momentum) * .12 + passControl + attackControl + redControl + homeOpeningBias * .2 + venueBias;
    const hasRed = cards.home?.some(card => card.red) || cards.away?.some(card => card.red);
    const possMin = hasRed ? 30 : 36, possMax = hasRed ? 70 : 64;
    const targetPossession = clamp(50 + structuralControl, possMin, possMax);
    // Motor: home = usuário, away = adversário. Espelhar visitante (como no match-sim).
    stats.home.possession = stats.home.possession * .78 + targetPossession * .22;
    // Âncora suave no volume de passes — posse e estatística de passe ficam coerentes.
    const passTotal = (stats.home.passes || 0) + (stats.away.passes || 0);
    if (passTotal >= 40) {
      const passShare = (stats.home.passes / passTotal) * 100;
      stats.home.possession = clamp(stats.home.possession * .88 + passShare * .12, possMin, possMax);
    }
    stats.away.possession = 100 - stats.home.possession;
    const side = Math.random() * 100 < stats.home.possession ? 'home' : 'away';
    const otherSide = side === 'home' ? 'away' : 'home';
    const current = side === 'home' ? homeProfile : awayProfile;
    const other = side === 'home' ? awayProfile : homeProfile;
    const homeShare = stats.home.possession / 100;
    // As estatísticas são produzidas antes da jogada e passam a influenciar o
    // ataque escolhido: melhor circulação aumenta a criação; desarmes e momento
    // defensivo reduzem as chegadas seguintes.
    const homePassQuality = addPasses('home', homeProfile, awayProfile, elapsed, homeShare);
    const awayPassQuality = addPasses('away', awayProfile, homeProfile, elapsed, 1 - homeShare);
    const passQuality = side === 'home' ? homePassQuality : awayPassQuality;
    // Teste: ?forcePenaltyAgainst — força 1 pênalti contra após o 3º minuto.
    const forcePenaltyAgainst =
      typeof location !== 'undefined' &&
      new URLSearchParams(location.search).has('forcePenaltyAgainst') &&
      stats.away.penalties < 1 &&
      minute >= 3;
    const penSide = forcePenaltyAgainst ? 'away' : side;
    const matchPenalties = (stats.home.penalties || 0) + (stats.away.penalties || 0);
    const homeGoalsLive = Math.max(0, Number(getHomeScore?.() || 0));
    const awayGoalsLive = Math.max(0, Number(getAwayScore?.() || 0));
    // Placar apertado / perseguição (não qualquer diferença de gols).
    const scoreChase = minute >= 55 && Math.abs(homeGoalsLive - awayGoalsLive) <= 1;
    const penaltyChance = enginePenaltyChance({
      minute,
      fouls: (stats.home.fouls || 0) + (stats.away.fouls || 0),
      yellow: (stats.home.yellow || 0) + (stats.away.yellow || 0),
      red: (stats.home.red || 0) + (stats.away.red || 0),
      pressHome: homeTactic.press,
      pressAway: awayTactic.press,
      alreadyAwarded: matchPenalties,
      scoreChase,
      duelEdge: (current.attack - other.defense) / 80,
    });
    const penRoll = forcePenaltyAgainst || Math.random() < penaltyChance;
    if (penRoll) {
      const penCurrent = penSide === 'home' ? homeProfile : awayProfile;
      const penOther = penSide === 'home' ? awayProfile : homeProfile;
      stats[penSide].penalties++;
      influencePossession(penSide, 2.5);
      log(
        `Pênalti para ${penSide === 'home' ? userClub : matchClub.name}!`,
        'penalty',
        penSide,
      );
      if (penSide === 'home') {
        startPenaltyChoice(penCurrent, penOther);
        return;
      }
      startPenaltyAgainst(penCurrent, penOther);
      return;
    }
    const openingBoost = minute <= 15 && Math.abs(overallGap) > 5 && ((overallGap > 5 && side === 'home') || (overallGap < -5 && side === 'away')) ? clamp(.08 + (Math.abs(overallGap) - 5) * .022, .08, .22) : 0;
    buildAttack(side, current, other, passQuality, openingBoost);
    renderStats();
    return;
    addPasses('home', homeProfile, awayProfile, elapsed, homeShare);
    addPasses('away', awayProfile, homeProfile, elapsed, 1 - homeShare);
    const event = Math.random(), team = side === 'home' ? userClub : matchClub.name;
    if (event < .25) shot(side, current, other);
    else if (event < .42) { const crosser = playerFor(side, 'pass'); stats[side].corners++; influencePossession(side, 1.5); log(`${crosser} ganha escanteio para o ${team}.`); if (Math.random() < .37) shot(side, { ...current, attack: current.attack + 6 }, other, { corner: true }); }
    else if (event < .61) { const defender = playerFor(otherSide, 'tackle'), attacker = playerFor(side, 'shot'), defenderData = actorData(otherSide, defender, 'tackle'), attackerData = actorData(side, attacker, 'shot'), success = clamp(.48 + ((defenderData.tackling + defenderData.marking) / 2 - (attackerData.dribble + attackerData.speed * .25)) / 120 + (other.defense - current.attack) / 300, .24, .82); if (Math.random() < success) { stats[otherSide].tackles++; influencePossession(otherSide, 2.1); log(`${defender} desarma ${attacker} e recupera a bola.`); } else { influencePossession(side, 1.6); log(`${attacker} supera ${defender} no drible e mantém o ataque.`); } }
    else if (event < .78) { const defender = playerFor(otherSide, 'foul'), attacker = playerFor(side, 'shot'); log(`${defender} derruba ${attacker}.`); foul(otherSide, side, true); }
    else if (event < .86) { const attacker = playerFor(side, 'shot'); stats[side].offsides++; influencePossession(otherSide, 1.2); log(`${attacker} é flagrado em impedimento.`); }
    else if (event < .875 && stats[side].penalties < 1) { stats[side].penalties++; influencePossession(side, 2.4); log(`Pênalti para ${team}!`, 'penalty', side); if (side === 'home') { startPenaltyChoice(current, other); return; } const taker = penaltyTaker(side); shot(side, { ...current, attack: current.attack + 9 }, other, { penalty: true, taker: taker.name, penaltySkill: taker.penaltyTaking }); }
    else { const organizer = playerFor(side, 'pass'); influencePossession(side, .65); log(`${organizer} conduz a posse no campo de ataque do ${team}.`); }
    renderStats();
  };

  return {
    moduleVersion: MODULE_VERSIONS.matchLiveOrchestration,
    tryLiveEventInjury,
    escalateLivePlayThroughInjury,
    handleLivePlayThroughIncident,
    checkMinuteAggravation,
    enforceLiveRehabLimit,
    applyWear,
    tick,
    foul,
    advance,
    shootoutGoalsCount,
    shootoutAttemptsCount,
    currentShootoutClub,
    shootoutLineup,
    shootoutCardsFor,
    renderShootoutTrack,
    logShootout,
    evaluateShootoutWinner,
    pickShootoutCpuTaker,
    executeShootoutKick,
    startShootoutTakerChoice,
    startShootoutCpuKick,
    scheduleNextShootoutKick,
    completePenaltyShootout,
    startPenaltyShootout,
    startPenaltyChoice,
    startPenaltyAgainst,
    openPenaltyDuel,
    closePenaltyDuel,
    isPenaltyDuelOpen,
    runPenaltyDuelResolve,
  };
}
