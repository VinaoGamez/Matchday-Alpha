import { MODULE_VERSIONS } from '../core/constants.js';

/**
 * Orquestração da partida ao vivo — desgaste por minuto, ciclo tick/advance,
 * faltas/cartões, lesões em jogo (evento + play-through + rehab) e o fluxo
 * completo de pênaltis/shootout. Cálculos de rating (profile/opponentForMatch/
 * playerFor/actorData/tacticalDiscipline/liveOverall) permanecem no engine —
 * estão fortemente acoplados ao restante do painel tático e são passados aqui
 * como callbacks. Sem DOM direto: interações usam `$`/callbacks fornecidos.
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
    takeFreeKick,
    penaltyTaker,
    buildAttack,
    addPasses,
    timeline,
    resetLiveClockSeconds,
    updateLiveMatchClock,
    getAwaySubstitutions,
    incrementAwaySubstitutions,
  } = deps;

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
      if (bench.length && liveInjuries.away.length <= 5) { const expected = player.pos, compatible = bench.filter(candidate => candidate.pos === expected || (compatibleRoles[expected] || []).includes(candidate.pos)), incoming = [...(compatible.length ? compatible : bench)].sort((a, b) => b.overall - a.overall)[0], incomingIndex = club.roster.indexOf(incoming); [club.roster[index], club.roster[incomingIndex]] = [incoming, player]; cards.away[index] = { yellow: 0, red: false, dismissal: null, injured: false, playThroughRisk: false }; liveMinutesPlayed.away.set(incoming.name, liveMinutesPlayed.away.get(incoming.name) ?? 0); log(`${club.name} substitui o lesionado ${player.name} por ${incoming.name}.`, 'injury-substitution', side); }
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
      if (bench.length && liveInjuries.away.length <= 5) { const expected = player.pos, compatible = bench.filter(candidate => candidate.pos === expected || (compatibleRoles[expected] || []).includes(candidate.pos)), incoming = [...(compatible.length ? compatible : bench)].sort((a, b) => b.overall - a.overall)[0], incomingIndex = club.roster.indexOf(incoming); [club.roster[index], club.roster[incomingIndex]] = [incoming, player]; cards.away[index] = { yellow: 0, red: false, dismissal: null, injured: false, playThroughRisk: false }; liveMinutesPlayed.away.set(incoming.name, liveMinutesPlayed.away.get(incoming.name) ?? 0); log(`${club.name} substitui ${player.name} após agravamento por ${incoming.name}.`, 'injury-substitution', side); }
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
    $('#shootoutHint').textContent = shootoutState.suddenDeath ? 'Morte súbita: cada cobrança pode decidir o confronto.' : 'Disputa alternada — escolha um cobrador diferente a cada vez.';
  };

  const logShootout = (text, type = '', side = null) => {
    const shootoutState = getShootoutState();
    const kickNo = Math.max(1, Math.ceil((shootoutState?.kickIndex || 0) / 2));
    log(`PÊN ${kickNo} · ${text}`, type || 'penalty', side);
  };

  const evaluateShootoutWinner = () => {
    const shootoutState = getShootoutState();
    const [c0, c1] = shootoutState.clubs, g0 = shootoutGoalsCount(c0), g1 = shootoutGoalsCount(c1), a0 = shootoutAttemptsCount(c0), a1 = shootoutAttemptsCount(c1);
    if (a0 <= 5 && a1 <= 5) {
      const rem0 = 5 - a0, rem1 = 5 - a1;
      if (g0 > g1 + rem1) return c0;
      if (g1 > g0 + rem0) return c1;
      if (a0 === 5 && a1 === 5) {
        if (g0 !== g1) return g0 > g1 ? c0 : c1;
        shootoutState.suddenDeath = true;
      }
      return null;
    }
    if (shootoutState.suddenDeath && a0 === a1 && a0 > 5 && g0 !== g1) return g0 > g1 ? c0 : c1;
    return null;
  };

  const pickShootoutCpuTaker = clubName => {
    const shootoutState = getShootoutState();
    const used = new Set(shootoutState.usedNames[clubName] || []), lineup = shootoutLineup(clubName), cardState = shootoutCardsFor(clubName);
    const eligible = lineup.map((player, index) => ({ player, index })).filter(({ player, index }) => player.pos !== 'GOL' && !cardState[index]?.red && !used.has(player.name)).map(({ player }) => player).sort((a, b) => b.penaltyTaking - a.penaltyTaking);
    return eligible[Math.random() < .82 ? 0 : Math.min(1, eligible.length - 1)] || eligible[0];
  };

  const executeShootoutKick = (kickingClub, taker) => {
    const shootoutState = getShootoutState();
    if (!shootoutState || !taker) return;
    const userClub = getUserClub();
    const isUser = kickingClub === userClub, side = isUser ? 'home' : 'away', current = isUser ? profile() : opponentForMatch(), other = isUser ? opponentForMatch() : profile();
    shootoutState.usedNames[kickingClub] = shootoutState.usedNames[kickingClub] || [];
    shootoutState.usedNames[kickingClub].push(taker.name);
    const scored = shot(side, { ...current, attack: current.attack + 9 }, other, { penalty: true, shootout: true, taker: taker.name, penaltySkill: taker.penaltyTaking, logFn: logShootout }) || false;
    shootoutState.results[kickingClub] = shootoutState.results[kickingClub] || [];
    shootoutState.results[kickingClub].push(scored);
    shootoutState.kickIndex++;
    renderShootoutTrack();
    $('#penaltyChoice').classList.add('hidden');
    const winner = evaluateShootoutWinner();
    if (winner) return completePenaltyShootout(winner);
    scheduleNextShootoutKick();
  };

  const startShootoutTakerChoice = kickingClub => {
    const shootoutState = getShootoutState(), userClub = getUserClub();
    stopMatchClock(); setPendingPenalty({ mode: 'shootout', kickingClub }); $('#matchActions').classList.add('hidden');
    const section = $('#penaltyChoice'), keeperClub = shootoutState.clubs.find(name => name !== kickingClub), keeperLineup = shootoutLineup(keeperClub), keeper = keeperLineup.find(player => player.pos === 'GOL') || keeperLineup[0];
    $('#matchModal .score').after(section);
    let heading = section.querySelector('.penalty-choice-heading');
    if (!heading) { heading = document.createElement('div'); heading.className = 'penalty-choice-heading'; section.prepend(heading); }
    const kickNo = shootoutAttemptsCount(kickingClub) + 1;
    heading.innerHTML = `<div><strong>Cobrança ${kickNo} — escolha o batedor</strong></div><span class="penalty-goalkeeper"><small>GOLEIRO ADVERSÁRIO</small><b>${keeper.name}</b><em>DEF. PÊNALTI ${keeper.penaltySaving}</em></span>`;
    const used = new Set(shootoutState.usedNames[kickingClub] || []), cardState = shootoutCardsFor(kickingClub);
    const takers = shootoutLineup(kickingClub).map((player, index) => ({ player, index })).filter(({ player, index }) => player.pos !== 'GOL' && !cardState[index]?.red && !used.has(player.name)).map(({ player }) => player).sort((a, b) => b.penaltyTaking - a.penaltyTaking || b.overall - a.overall).slice(0, 5);
    const chanceFor = player => Math.round(clamp(.69 + (player.penaltyTaking - keeper.penaltySaving) / 95 + (player.penaltyTaking - 70) / 260 + (player.penaltyTaking > 85 ? .035 : 0), .56, .94) * 100);
    $('#penaltyTakers').innerHTML = takers.length ? takers.map((player, index) => `<button class="${index === 0 ? 'best-option' : ''}" data-taker="${player.name}"><span class="penalty-taker-title"><b>${player.name} · ${player.pos}</b>${index === 0 ? '<i class="penalty-best-badge">MELHOR OPÇÃO</i>' : player.penaltyTaking > 85 ? '<i class="penalty-specialist">ESPECIALISTA</i>' : ''}</span><span class="penalty-metric"><small>OVERALL</small><strong>${player.overall}</strong></span><span class="penalty-metric chance"><small>CHANCE ESTIMADA</small><strong>${chanceFor(player)}%</strong></span></button>`).join('') : '<p class="shootout-empty">Sem cobradores disponíveis.</p>';
    section.classList.remove('hidden');
    $('#matchStatus').textContent = `Shootout: ${kickingClub} define o cobrador da ${kickNo}ª cobrança.`;
  };

  const scheduleNextShootoutKick = () => {
    const shootoutState = getShootoutState(), userClub = getUserClub();
    if (!shootoutState) return;
    const club = currentShootoutClub();
    if (club === userClub) startShootoutTakerChoice(club);
    else {
      $('#matchStatus').textContent = `${club} prepara a cobrança…`;
      setTimeout(() => { const taker = pickShootoutCpuTaker(club); if (taker) executeShootoutKick(club, taker); }, Math.max(450, optionsUi.getPaceMs() * 2));
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
    $('#penaltyChoice').classList.add('hidden');
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
    log(`Empate no tempo regulamentar. Disputa de pênaltis — ${knockoutCompetitionLabel(liveMatchGame)}!`, 'penalty');
    $('#matchStatus').textContent = 'Disputa de pênaltis — escolha os cobradores quando for sua vez.';
    $('#matchActions').classList.add('hidden');
    const panel = $('#shootoutPanel');
    $('#matchModal .score').after(panel);
    panel.classList.remove('hidden');
    renderShootoutTrack();
    scheduleNextShootoutKick();
  };

  const startPenaltyChoice = (current, other) => {
    const userClub = getUserClub(), matchClub = getMatchClub(), cards = getCards();
    setPendingPenalty({ current, other }); stopMatchClock(); $('#matchActions').classList.add('hidden');
    const section = $('#penaltyChoice'), keeper = matchClub.roster.slice(0, 11).find((player, index) => player.pos === 'GOL' && !cards.away[index]?.red) || matchClub.roster[0];
    // A decisão fica no topo da partida, imediatamente abaixo do placar.
    $('#matchModal .score').after(section);
    let heading = section.querySelector('.penalty-choice-heading');
    if (!heading) { heading = document.createElement('div'); heading.className = 'penalty-choice-heading'; section.prepend(heading); }
    heading.innerHTML = `<div><strong>Escolha o cobrador</strong></div><span class="penalty-goalkeeper"><small>GOLEIRO ADVERSÁRIO</small><b>${keeper.name}</b><em>DEF. PÊNALTI ${keeper.penaltySaving}</em></span>`;
    const takers = getActiveStarters().filter(player => player.pos !== 'GOL').sort((a, b) => b.penaltyTaking - a.penaltyTaking || b.overall - a.overall).slice(0, 3);
    const chanceFor = player => Math.round(clamp(.69 + (player.penaltyTaking - keeper.penaltySaving) / 95 + (player.penaltyTaking - 70) / 260 + (player.penaltyTaking > 85 ? .035 : 0), .56, .94) * 100);
    $('#penaltyTakers').innerHTML = takers.map((player, index) => `<button class="${index === 0 ? 'best-option' : ''}" data-taker="${player.name}"><span class="penalty-taker-title"><b>${player.name} · ${player.pos}</b>${index === 0 ? '<i class="penalty-best-badge">MELHOR BATEDOR</i>' : player.penaltyTaking > 85 ? '<i class="penalty-specialist">ESPECIALISTA</i>' : ''}</span><span class="penalty-metric"><small>OVERALL</small><strong>${player.overall}</strong></span><span class="penalty-metric chance"><small>CHANCE ESTIMADA</small><strong>${chanceFor(player)}%</strong></span></button>`).join('');
    section.classList.remove('hidden'); $('#matchStatus').textContent = 'Pênalti: escolha o cobrador destacado ou compare as opções.';
  };

  // --- Avanço de minuto --------------------------------------------------------

  const advance = () => {
    const stats = getStats(), cards = getCards(), userClub = getUserClub(), matchClub = getMatchClub();
    const minute0 = getMinute();
    const firstHalf = minute0 < 45;
    // Mais posses relevantes por partida: aumenta disputas, faltas e volume
    // ofensivo sem converter artificialmente uma finalização em interrupção.
    const elapsed = Math.floor(rnd(1, 3));
    let minute = minute0 + elapsed;
    setMinute(minute);
    resetLiveClockSeconds();
    updateLiveMatchClock();
    if (minute >= 90) {
      minute = 90; setMinute(90);
      if (cupLiveMatchNeedsShootout()) {
        stopMatchClock();
        log('Fim de jogo no tempo regulamentar.', '');
        $('#matchStatus').textContent = 'Empate — a disputa seguirá nos pênaltis.';
        startPenaltyShootout();
        return;
      }
      setMatchFinished(true); log('Fim de jogo.'); $('#matchStatus').textContent = 'Partida encerrada.'; stopMatchClock(); updateLiveMatchClock(); simulateRoundResults(); renderFinalSummary(); showFinalActions(); return;
    }
    if (firstHalf && minute >= 45 && !getHalftimeShown()) { minute = 45; setMinute(45); setHalftimeShown(true); log('Intervalo de jogo.'); $('#matchStatus').textContent = 'Intervalo: faça os ajustes que considerar necessários.'; openPreparation('INTERVALO'); return; }
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
    if (Math.random() < .012 && stats[side].penalties < 1) {
      stats[side].penalties++; influencePossession(side, 2.5); log(`Pênalti para ${side === 'home' ? userClub : matchClub.name}!`, 'penalty', side);
      if (side === 'home') { startPenaltyChoice(current, other); return; }
      const taker = penaltyTaker(side); shot(side, { ...current, attack: current.attack + 35 }, other, { penalty: true, taker: taker.name, penaltySkill: taker.penaltyTaking }); renderStats(); return;
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
    scheduleNextShootoutKick,
    completePenaltyShootout,
    startPenaltyShootout,
    startPenaltyChoice,
  };
}
