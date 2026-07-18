import { MEMORY_LIMITS } from '../../core/save.js';
import { MODULE_VERSIONS } from '../../core/constants.js';

/**
 * Fatia de UI da partida ao vivo — modal do adversário, relógio, placar,
 * log da timeline e ações da barra (pausa/estatísticas/adversário).
 * Orquestração (tick/advance, injeção/pênaltis) permanece em `legacy/engine.js`.
 * @param {object} deps
 * @param {Function} deps.$
 * @param {Function} deps.onClick
 * @param {Function} deps.clamp
 * @param {string} deps.fieldMarkup
 * @param {Function} deps.getMinute
 * @param {Function} deps.getMatchStarted
 * @param {Function} deps.getMatchFinished
 * @param {Function} deps.getPreMatchPreparation
 * @param {Function} deps.getHalftimeShown
 * @param {Function} deps.getShootoutState
 * @param {Function} deps.getScores — () => ({ home, away }) já orientado ao calendário
 * @param {Function} deps.getUserClub
 * @param {Function} deps.fixtureDetails
 * @param {Function} deps.formatVenueCrowdLine
 * @param {Function} deps.clubCrestInitials
 * @param {Function} deps.getMatchClub — clube adversário ao vivo
 * @param {Function} deps.getStats
 * @param {Function} deps.getCards
 * @param {Function} deps.getFormations
 * @param {Function} deps.getTactics — () => feature de táticas (tacticForAway, boardPlayerLabel...)
 * @param {Function} deps.playerNameCell
 * @param {Function} deps.fatigueCell
 * @param {Function} deps.getPauses
 * @param {Function} deps.incrementPauses
 * @param {Function} deps.openPreparation
 * @param {Function} deps.renderStats
 */
export function createMatchLiveUiFeature(deps) {
  const {
    $,
    onClick,
    clamp,
    fieldMarkup,
    getMinute,
    getMatchStarted,
    getMatchFinished,
    getPreMatchPreparation,
    getHalftimeShown,
    getShootoutState,
    getScores,
    getUserClub,
    fixtureDetails,
    formatVenueCrowdLine,
    clubCrestInitials,
    getMatchClub,
    getStats,
    getCards,
    getFormations,
    getTactics,
    playerNameCell,
    fatigueCell,
    getPauses,
    incrementPauses,
    openPreparation,
    renderStats,
  } = deps;

  const timeline = $('#timeline');
  let liveClockSeconds = 0;
  let liveClockSecondTimer = null;

  const injectOpponentModal = () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="liveOpponentModal" class="modal hidden"><div class="modal-card live-opponent-modal"><button id="closeLiveOpponent" class="close">×</button><label>ANÁLISE DO ADVERSÁRIO · AO VIVO</label><h2 id="liveOpponentName"></h2><p id="liveOpponentMeta" class="live-opponent-meta"></p><div class="live-opponent-layout"><section><div id="liveOpponentRoster" class="live-opponent-roster"></div></section><div class="pause-pitch tactical-board live-opponent-pitch">${fieldMarkup}<div id="liveOpponentPitch"></div></div></div></div></div>`,
    );
    onClick('#closeLiveOpponent', () => $('#liveOpponentModal').classList.add('hidden'));
  };

  const clockPhase = () => {
    if (getPreMatchPreparation()) return 'PRÉ-JOGO';
    if (getMatchFinished()) return getShootoutState() ? 'DISPUTA DE PÊNALTIS' : 'FIM DE JOGO';
    if (getShootoutState()) return 'DISPUTA DE PÊNALTIS';
    const minute = getMinute();
    if (getHalftimeShown() && minute <= 45) return 'INTERVALO';
    if (minute > 45) return '2º TEMPO';
    return '1º TEMPO';
  };

  const updateClock = () => {
    const clock = $('#liveMatchClock');
    if (!clock) return;
    const show = getMatchStarted() && !getPreMatchPreparation();
    clock.classList.toggle('hidden', !show);
    if (!show) return;
    const timeEl = clock.querySelector('.live-match-clock-time'),
      phaseEl = clock.querySelector('.live-match-clock-phase');
    const mm = String(Math.min(90, Math.max(0, getMinute()))).padStart(2, '0'),
      ss = String(liveClockSeconds).padStart(2, '0');
    if (timeEl) timeEl.textContent = `${mm}:${ss}`;
    if (phaseEl) phaseEl.textContent = clockPhase();
  };

  const stopLiveSecondTimer = () => {
    clearInterval(liveClockSecondTimer);
    liveClockSecondTimer = null;
  };
  const startLiveSecondTimer = () => {
    stopLiveSecondTimer();
    liveClockSecondTimer = setInterval(() => {
      if (getMatchFinished() || getPreMatchPreparation()) return;
      liveClockSeconds = (liveClockSeconds + 1) % 60;
      updateClock();
    }, 1000);
  };
  const resetLiveClockSeconds = () => {
    liveClockSeconds = 0;
  };
  const getLiveClockSeconds = () => liveClockSeconds;
  const setLiveClockSeconds = value => {
    liveClockSeconds = value;
  };

  const renderHeader = game => {
    if (!game) return;
    const details = fixtureDetails(game);
    const homeClub = game.home,
      awayClub = game.away,
      userHome = homeClub === getUserClub();
    $('#liveMatchDateTime').textContent = `${details.display} · ${details.time}`;
    $('#liveMatchVenue').textContent = formatVenueCrowdLine(game);
    const homeCrest = $('#liveHomeCrest'),
      awayCrest = $('#liveAwayCrest');
    homeCrest.textContent = clubCrestInitials(homeClub);
    awayCrest.textContent = clubCrestInitials(awayClub);
    homeCrest.classList.remove('away');
    awayCrest.classList.add('away');
    $('#liveHomeName').textContent = homeClub.toUpperCase();
    $('#liveAwayName').textContent = awayClub.toUpperCase();
    $('#liveHomeName').classList.toggle('user-club-live', userHome);
    $('#liveAwayName').classList.toggle('user-club-live', !userHome);
  };

  const score = () => {
    const { home: homeGoals, away: awayGoals } = getScores();
    $('#score').textContent = `${homeGoals} — ${awayGoals}`;
    updateClock();
  };

  const log = (text, type = '') => {
    timeline.insertAdjacentHTML('beforeend', `<p class="${type}">${getMinute()}' · ${text}</p>`);
    while (timeline.children.length > MEMORY_LIMITS.liveTimeline) timeline.removeChild(timeline.firstChild);
    timeline.scrollTop = timeline.scrollHeight;
  };

  const renderLiveOpponent = () => {
    if (!getStats() || $('#liveOpponentModal').classList.contains('hidden')) return;
    const club = getMatchClub();
    const tactics = getTactics();
    const awayTactics = tactics?.tacticForAway?.() || {};
    const mentalityLabel =
      awayTactics.mentality > 65 ? 'Ofensiva' : awayTactics.mentality < 35 ? 'Defensiva' : club.mentality || 'Equilibrada';
    const styleLabel =
      awayTactics.possession > 65 ? 'Posse de bola' : awayTactics.possession < 35 ? 'Contra-ataque' : club.style || 'Misto';
    $('#liveOpponentName').textContent = club.name;
    $('#liveOpponentMeta').textContent = `${club.formation} · ${styleLabel} · Mentalidade ${mentalityLabel} · Atualizado aos ${getMinute() || 0}'`;
    const headers = '<div class="live-opponent-head"><span>JOGADOR</span><span>POS.</span><span>OVR</span><span>CANSAÇO</span></div>';
    const cards = getCards();
    const playerRow = (player, index, isStarter) => {
      const card = isStarter ? cards.away[index] : null;
      const liveState = {
        yellow: card?.yellow ? 1 : 0,
        red: !!card?.red,
        injured: !!card?.injured,
        playThroughRisk: !!card?.playThroughRisk,
      };
      return `<div class="live-opponent-player">${playerNameCell(player.name, player, { prefix: isStarter ? `${index + 1}. ` : '', liveState })}<span>${player.pos}</span><span>${player.overall}</span>${fatigueCell(player)}</div>`;
    };
    $('#liveOpponentRoster').innerHTML = `<h3>TITULARES</h3>${headers}${club.roster
      .slice(0, 11)
      .map((player, index) => playerRow(player, index, true))
      .join('')}<div class="live-opponent-bench"><h3>RESERVAS</h3>${headers}${club.roster
      .slice(11)
      .map((player, index) => playerRow(player, index + 11, false))
      .join('')}</div>`;
    const coords = getFormations()[club.formation] || getFormations()['4-3-3'];
    const pitch = $('#liveOpponentPitch');
    const board = pitch?.closest('.tactical-board');
    tactics?.ensureBoardLegend?.(board);
    const labelOf = tactics?.boardPlayerLabel || (name => (name || '—').split(' ').filter(Boolean).pop() || name);
    const badgesOf = tactics?.boardPlayerBadges || (() => '');
    if (pitch) {
      pitch.innerHTML = (coords || [])
        .map((point, index) => {
          const card = cards.away[index] || { yellow: 0, red: false, injured: false };
          const player = club.roster[index];
          const vacant = card.red || !player;
          const top = point[1] === 91 ? 90 : point[1];
          const energy = clamp(player?.fatigue ?? 0, 0, 100);
          const injured = !!card.injured;
          const label = vacant ? 'EXPULSO' : labelOf(player?.name || '—');
          const title = vacant ? 'Expulso' : `${player.name}${card.yellow ? ' · Advertido' : ''}${injured ? ' · Lesionado' : ''}`;
          return `<div class="board-player ${vacant ? 'vacant' : ''}" title="${title}" style="left:${point[0]}%;top:${top}%"><i style="--energy:${energy}%"><span>${vacant ? '×' : index + 1}</span></i>${badgesOf({ yellow: card.yellow, injured, atRisk: !!card.playThroughRisk })}<small>${label}</small></div>`;
        })
        .join('');
    }
  };

  const bindLiveActions = () => {
    const pauseButton = $('#pauseMatch'),
      statsButton = $('#liveStats'),
      opponentButton = $('#liveOpponent');
    if (pauseButton)
      pauseButton.onclick = () => {
        if (getPauses() >= 3) return;
        const pauses = incrementPauses();
        $('#pauseCounter').textContent = `${pauses}/3`;
        $('#matchStatus').textContent = 'Pausa técnica: ajuste o time antes de retomar.';
        openPreparation('PAUSA TÉCNICA');
      };
    if (statsButton)
      statsButton.onclick = () => {
        $('#stats').classList.toggle('hidden');
        renderStats();
      };
    if (opponentButton)
      opponentButton.onclick = () => {
        $('#liveOpponentModal').classList.remove('hidden');
        renderLiveOpponent();
      };
  };

  return {
    moduleVersion: MODULE_VERSIONS.matchLiveUi,
    injectOpponentModal,
    stopLiveSecondTimer,
    startLiveSecondTimer,
    updateClock,
    resetLiveClockSeconds,
    getLiveClockSeconds,
    setLiveClockSeconds,
    renderHeader,
    score,
    log,
    renderLiveOpponent,
    bindLiveActions,
    clockPhase,
  };
}
