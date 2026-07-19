import { MODULE_VERSIONS } from '../../core/constants.js';

/**
 * Sessão da partida ao vivo — abertura/preparação, encerramento e o resumo
 * final (estatísticas + diagnósticos médicos). Orquestração de minuto a
 * minuto (tick/advance/pênaltis) permanece em `engine/match-live-orchestration.js`.
 * @param {object} deps
 * @param {Function} deps.$
 * @param {Function} deps.onClick
 * @param {Function} deps.getLiveInjuries — () => liveInjuries
 * @param {Function} deps.getLiveDeferredInjuries — () => liveDeferredInjuries
 * @param {Function} deps.getUserClub
 * @param {Function} deps.getMatchClub
 * @param {Function} deps.getClubs
 * @param {Function} deps.applyDeferredInjuryDiagnosis
 * @param {Function} deps.injuryDiagnosisComment
 * @param {Function} deps.calendarLiveSideStats
 * @param {Function} deps.calendarPossessionPair
 * @param {Function} deps.calendarLiveSideGoals
 * @param {Function} deps.getPostMatchMedicalQueue — () => postMatchMedicalQueue
 * @param {Function} deps.processPostMatchMedicalQueue
 * @param {Function} deps.pushMessage
 * @param {Function} deps.getCurrentRound
 * @param {Function} deps.getLiveMatchGame
 * @param {Function} deps.getNextUserGame
 * @param {Function} deps.fixtureDetails
 * @param {Function} deps.advanceCareerCalendarTo
 * @param {Function} deps.getHasCareer — () => !!savedNewGame
 * @param {Function} deps.persistSeason
 * @param {Function} deps.modal — elemento do modal da partida
 * @param {Function} deps.getMatchFinished
 * @param {Function} deps.getRoundCommitted
 * @param {Function} deps.advanceSeasonRound
 * @param {Function} deps.openChampionship
 * @param {Function} deps.simulateRoundResults
 * @param {Function} deps.openRoundResults
 * @param {Function} deps.stopMatchClock
 * @param {Function} deps.startMatchClock
 * @param {Function} deps.closeFormationSuggestion
 * @param {Function} deps.getMatchStarted
 * @param {Function} deps.renderLiveMatchHeader
 * @param {Function} deps.score
 * @param {Function} deps.updateLiveMatchClock
 * @param {Function} deps.getShootoutState
 * @param {Function} deps.renderShootoutTrack
 * @param {Function} deps.getPreMatchPreparation
 * @param {Function} deps.renderStats
 * @param {Function} deps.setActivePreparationTitle
 * @param {Function} [deps.onBeginLineupEdit] — snapshot do XI ao abrir pausa (trocas livres até retomar)
 * @param {Function} deps.syncTactics
 * @param {Function} deps.drawBoard
 * @param {Function} deps.renderSubstitutionControls
 * @param {Function} deps.renderTacticalConfrontation
 */
export function createMatchLiveSessionFeature(deps) {
  const {
    $,
    onClick,
    getLiveInjuries,
    getLiveDeferredInjuries,
    getUserClub,
    getMatchClub,
    getClubs,
    applyDeferredInjuryDiagnosis,
    injuryDiagnosisComment,
    calendarLiveSideStats,
    calendarPossessionPair,
    calendarLiveSideGoals,
    getPostMatchMedicalQueue,
    processPostMatchMedicalQueue,
    pushMessage,
    getCurrentRound,
    getLiveMatchGame,
    getNextUserGame,
    fixtureDetails,
    advanceCareerCalendarTo,
    getHasCareer,
    persistSeason,
    modal,
    getMatchFinished,
    getRoundCommitted,
    advanceSeasonRound,
    openChampionship,
    simulateRoundResults,
    openRoundResults,
    stopMatchClock,
    startMatchClock,
    closeFormationSuggestion,
    getMatchStarted,
    renderLiveMatchHeader,
    score,
    updateLiveMatchClock,
    getShootoutState,
    renderShootoutTrack,
    getPreMatchPreparation,
    renderStats,
    setActivePreparationTitle,
    onBeginLineupEdit,
    syncTactics,
    drawBoard,
    renderSubstitutionControls,
    renderTacticalConfrontation,
  } = deps;

  const renderFinalSummary = () => {
    const userClub = getUserClub(), club = getMatchClub(), clubs = getClubs(), currentRound = getCurrentRound();
    const liveInjuries = getLiveInjuries(), liveDeferredInjuries = getLiveDeferredInjuries();
    const medicalReports = [['home', liveInjuries.home, clubs[userClub]], ['away', liveInjuries.away, club]].flatMap(([, entries, matchClub]) => entries.map(entry => {
      entry.injury.diagnosisPending = false;
      return { text: injuryDiagnosisComment({ name: entry.name }, entry.injury, matchClub), outcome: 'confirmed' };
    }));
    [['home', userClub], ['away', club.name]].forEach(([side, clubName]) => {
      liveDeferredInjuries[side].forEach(entry => {
        const player = clubs[clubName].roster.find(candidate => candidate.name === entry.name);
        if (!player || liveInjuries[side].some(item => item.name === entry.name)) return;
        const result = applyDeferredInjuryDiagnosis(player, entry, clubs[clubName]);
        if (result.injury) entry.injury = { ...result.injury };
        medicalReports.push({ text: result.report, outcome: result.outcome });
      });
    });
    const h = calendarLiveSideStats().home, a = calendarLiveSideStats().away, { home: hp, away: ap } = calendarPossessionPair();
    const sideGoals = calendarLiveSideGoals();
    const groupGoalsByScorer = goals => {
      const order = [];
      const byKey = new Map();
      (goals || []).forEach(goal => {
        const own = goal?.type === 'own';
        const key = `${own ? 'own:' : ''}${goal?.name || '—'}`;
        if (!byKey.has(key)) {
          byKey.set(key, { name: goal?.name || '—', own, stamps: [] });
          order.push(key);
        }
        byKey.get(key).stamps.push({
          minute: Number(goal.minute) || 0,
          stoppage: Number(goal.stoppage) || 0,
        });
      });
      return order.map(key => {
        const entry = byKey.get(key);
        const minutes = entry.stamps
          .slice()
          .sort((a, b) => a.minute - b.minute || a.stoppage - b.stoppage)
          .map(stamp => {
            const base = stamp.stoppage > 0 ? (stamp.minute <= 45 ? 45 : 90) : stamp.minute;
            const label = stamp.stoppage > 0 ? `${base}+${stamp.stoppage}` : String(base);
            return `${label}'`;
          })
          .join(', ');
        return { name: entry.own ? `${entry.name} (GC)` : entry.name, minutes };
      });
    };
    const scorers = side =>
      sideGoals[side].length
        ? groupGoalsByScorer(sideGoals[side])
            .map(entry => `<span>${entry.name} ${entry.minutes}</span>`)
            .join('')
        : '<span>Nenhum gol</span>';
    const rows = [['Posse de bola', `${hp}%`, `${ap}%`], ['Total de Passes', h.passes, a.passes], ['Finalizações', h.shots, a.shots], ['Faltas Cometidas', h.fouls, a.fouls], ['Cartões Amarelos', h.yellow, a.yellow], ['Cartões Vermelhos', h.red, a.red]];
    const injuryReports = medicalReports.map(item => item.text);
    const injurySection = injuryReports.length ? `<section class="final-injuries"><h3>DIAGNÓSTICOS MÉDICOS</h3>${medicalReports.map(item => `<p class="${item.outcome === 'cleared' ? 'cleared' : item.outcome === 'monitoring' ? 'monitoring' : ''}">${item.text}</p>`).join('')}</section>` : '';
    const liveMatchGame = getLiveMatchGame(), nextUserGame = getNextUserGame();
    const homeClub = (liveMatchGame || nextUserGame)?.home || userClub, awayClub = (liveMatchGame || nextUserGame)?.away || club.name;
    $('#stats').innerHTML = `<section class="final-goals"><h3>GOLS</h3><div><article><b>${homeClub.toUpperCase()}</b>${scorers('home')}</article><article><b>${awayClub.toUpperCase()}</b>${scorers('away')}</article></div></section><section class="final-basic"><h3>ESTATÍSTICAS DA PARTIDA</h3>${rows.map(row => `<div class="stat"><span>${row[1]}</span><span>${row[0]}</span><span>${row[2]}</span></div>`).join('')}</section>${injurySection}`;
    $('#stats').classList.remove('hidden');
    const postMatchMedicalQueue = getPostMatchMedicalQueue();
    if (postMatchMedicalQueue.length) {
      if (postMatchMedicalQueue.length === 1) {
        const item = postMatchMedicalQueue[0];
        pushMessage({ category: 'medical', type: 'treatment-pending', title: 'Ação médica pós-jogo', body: `${item.player.name} — ${item.injury.name}. Escolha cirurgia ou tratamento conservador para concluir a avaliação do departamento médico.`, round: currentRound, meta: { competition: 'Departamento médico', requiresAction: true, player: item.player.name } });
      } else {
        pushMessage({ category: 'medical', type: 'treatment-pending', title: `Ações médicas pós-jogo (${postMatchMedicalQueue.length})`, body: postMatchMedicalQueue.map(item => `• ${item.player.name} — ${item.injury.name}`).join('\n') + '\n\nEscolha cirurgia ou tratamento conservador para cada caso pendente.', round: currentRound, meta: { competition: 'Departamento médico', requiresAction: true } });
      }
      processPostMatchMedicalQueue();
    }
    const medicalDigest = medicalReports.filter(item => item.outcome !== 'confirmed');
    if (medicalDigest.length) {
      pushMessage({ category: 'medical', type: 'digest', title: 'Relatório médico pós-jogo', body: medicalDigest.map(item => `• ${item.text}`).join('\n'), round: currentRound, meta: { competition: 'Departamento médico' } });
    }
  };

  const showFinalActions = () => {
    const liveMatchGame = getLiveMatchGame();
    if (liveMatchGame) {
      const matchDate = liveMatchGame.competition === 'COPA DO BRASIL' ? new Date(liveMatchGame.date) : fixtureDetails(liveMatchGame).date;
      if (matchDate) advanceCareerCalendarTo(matchDate);
      if (getHasCareer()) persistSeason(true);
    }
    $('#matchActions').classList.remove('hidden');
    $('#matchActions').innerHTML = '<button id="finalDashboard">CLASSIFICAÇÃO</button><button id="finalTable">TABELA DE JOGOS</button><button id="finalNext">SAIR</button>';
    onClick('#finalDashboard', () => {
      if (getMatchFinished() && !getRoundCommitted()) advanceSeasonRound({ navigateDashboard: false });
      modal.classList.add('hidden');
      openChampionship();
    });
    onClick('#finalTable', () => { simulateRoundResults(); modal.classList.add('hidden'); openRoundResults(); });
    onClick('#finalNext', () => exitLiveMatch());
  };

  const exitLiveMatch = () => {
    if (!getMatchFinished() || getRoundCommitted()) return;
    stopMatchClock();
    $('#shootoutPanel')?.classList.add('hidden');
    $('#penaltyDuelModal')?.classList.add('hidden');
    $('#penaltyChoice')?.classList.add('hidden');
    $('#penaltyCompare')?.classList.add('hidden');
    $('#liveOpponentModal').classList.add('hidden');
    closeFormationSuggestion();
    advanceSeasonRound();
  };

  const reopenMatchWindow = () => {
    if (!getMatchStarted()) return false;
    const liveMatchGame = getLiveMatchGame(), shootoutState = getShootoutState(), preMatchPreparation = getPreMatchPreparation();
    renderLiveMatchHeader(liveMatchGame);
    $('#roundResultsModal')?.classList.add('hidden');
    $('#liveOpponentModal').classList.add('hidden');
    modal.classList.remove('hidden');
    score();
    updateLiveMatchClock();
    if (getMatchFinished()) {
      stopMatchClock();
      $('#pausePanel').classList.add('hidden');
      $('#penaltyDuelModal')?.classList.add('hidden');
      $('#penaltyChoice').classList.add('hidden');
      if (shootoutState) { renderShootoutTrack(); $('#shootoutPanel').classList.remove('hidden'); }
      else if (liveMatchGame?.penalties) { $('#shootoutTitle').textContent = `Shootout ${liveMatchGame.penalties}`; $('#shootoutPanel').classList.remove('hidden'); }
      $('#matchStatus').textContent = shootoutState ? 'Disputa de pênaltis em andamento.' : liveMatchGame?.penalties ? `Partida encerrada · Shootout ${liveMatchGame.penalties}.` : 'Partida encerrada.';
      renderFinalSummary();
      showFinalActions();
      return true;
    }
    const penaltyOpen = !!$('#penaltyDuelModal')
      ? !$('#penaltyDuelModal').classList.contains('hidden')
      : !$('#penaltyChoice').classList.contains('hidden');
    const awaitingDecision = !$('#pausePanel').classList.contains('hidden') || penaltyOpen || shootoutState;
    if (awaitingDecision) {
      stopMatchClock();
      $('#matchActions').classList.add('hidden');
      if (shootoutState) { $('#shootoutPanel').classList.remove('hidden'); renderShootoutTrack(); }
      if (penaltyOpen) $('#penaltyDuelModal')?.classList.remove('hidden');
      $('#stats').classList.toggle('hidden', preMatchPreparation);
      if (!preMatchPreparation) renderStats();
    } else {
      $('#matchActions').classList.remove('hidden');
      startMatchClock();
    }
    return true;
  };

  const setPauseTacticsOpen = open => {
    const panel = $('#pauseTacticAdjust');
    const toggle = $('#togglePauseTactics');
    if (!panel || !toggle) return;
    panel.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.classList.toggle('open', !!open);
    toggle.textContent = open ? '✕ FECHAR AJUSTE TÁTICO' : '⚙ AJUSTE TÁTICO';
    $('#pausePanel')?.classList.toggle('tactics-open', !!open);
  };

  let pauseTacticsBound = false;
  const bindPauseTacticsToggle = () => {
    if (pauseTacticsBound) return;
    pauseTacticsBound = true;
    onClick('#togglePauseTactics', () => {
      const panel = $('#pauseTacticAdjust');
      if (!panel) return;
      setPauseTacticsOpen(panel.classList.contains('hidden'));
    });
  };

  const openPreparation = title => {
    stopMatchClock();
    setActivePreparationTitle(title);
    const preMatchPreparation = getPreMatchPreparation();
    onBeginLineupEdit?.();
    const pauseTitle = $('#pauseTitle');
    if (pauseTitle) {
      if (preMatchPreparation) {
        pauseTitle.textContent = '';
        pauseTitle.classList.add('hidden');
      } else {
        pauseTitle.textContent = title;
        pauseTitle.classList.remove('hidden');
      }
    }
    $('#pauseHeading').textContent = preMatchPreparation ? 'Preparação da Partida' : 'Ajuste do Time';
    $('.pause-heading small').textContent = preMatchPreparation ? 'Organize a formação, a tática e a escalação antes do apito inicial.' : title === 'CARTÃO VERMELHO' ? 'Arraste um jogador para a vaga destacada ou troque posições; a nova organização será aplicada ao motor.' : title === 'LESÃO' ? 'O atleta lesionado não participa mais das ações. Substitua-o ou reorganize o time antes de retomar.' : title === 'ALERTA MÉDICO' ? 'O atleta apresenta incômodo físico. Substitua-o para evitar agravamento ou mantenha-o em campo assumindo o risco.' : 'Altere a formação, a tática e os jogadores antes de retomar.';
    $('#resumeMatch').textContent = preMatchPreparation ? 'INICIAR PARTIDA →' : 'RETOMAR PARTIDA →';
    $('#stats').before($('#pausePanel'));
    $('#matchActions').classList.add('hidden');
    $('#stats').classList.toggle('hidden', preMatchPreparation);
    $('#pausePanel').classList.remove('hidden');
    bindPauseTacticsToggle();
    setPauseTacticsOpen(false);
    syncTactics(); drawBoard(); renderSubstitutionControls(); renderTacticalConfrontation({ context: 'pause' });
    if (!preMatchPreparation) renderStats();
    updateLiveMatchClock();
  };

  return {
    moduleVersion: MODULE_VERSIONS.matchLiveSession,
    renderFinalSummary,
    showFinalActions,
    exitLiveMatch,
    reopenMatchWindow,
    openPreparation,
  };
}
