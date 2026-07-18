import { MEMORY_LIMITS } from '../../core/save.js';
import { MODULE_VERSIONS } from '../../core/constants.js';
import goalBallUrl from '../../../assets/ui/goal-ball.png?url';

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
 * @param {Function} [deps.getUserAtHome] — () => boolean (mando do calendário)
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
 * @param {Function} [deps.getClubManagerName]
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
    getGoals,
    getVolumeSamples,
    getUserClub,
    getUserAtHome,
    getClubManagerName,
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

  /** Tipos que merecem linha na timeline (o resto é ruído de narração). */
  const TIMELINE_IMPORTANT = new Set([
    'goal',
    'yellow',
    'red',
    'penalty',
    'injury',
    'injury-substitution',
    'substitution',
    'shootout-miss',
    'tactic',
    'engine-warning',
  ]);
  const TIMELINE_STRUCTURAL =
    /intervalo|fim de jogo|disputa de p[eê]naltis|bola est[aá] rolando|tempo regulamentar|encerrada/i;

  const isImportantTimelineType = (type) => {
    if (!type) return false;
    return String(type)
      .split(/\s+/)
      .some(
        (token) =>
          TIMELINE_IMPORTANT.has(token) ||
          token.startsWith('goal') ||
          token.startsWith('free-kick') ||
          token.startsWith('shootout'),
      );
  };

  const shouldShowTimeline = (text, type) =>
    isImportantTimelineType(type) || TIMELINE_STRUCTURAL.test(String(text || ''));

  /** Converte lado do motor (user=home) para lado do placar/calendário. */
  const toCalendarSide = (engineSide) => {
    if (engineSide !== 'home' && engineSide !== 'away') return null;
    const atHome = typeof getUserAtHome === 'function' ? getUserAtHome() : true;
    if (atHome) return engineSide;
    return engineSide === 'home' ? 'away' : 'home';
  };

  const inferEngineSide = (text) => {
    const raw = String(text || '');
    const user = getUserClub?.();
    const opp = getMatchClub?.()?.name;
    if (opp && raw.includes(opp)) return 'away';
    if (user && raw.includes(user)) return 'home';
    return null;
  };

  const teamBadgeHtml = (calendarSide) => {
    if (!calendarSide) return '';
    const atHome = typeof getUserAtHome === 'function' ? getUserAtHome() : true;
    const user = getUserClub?.() || '—';
    const opp = getMatchClub?.()?.name || '—';
    const name = calendarSide === 'home' ? (atHome ? user : opp) : atHome ? opp : user;
    const initials = clubCrestInitials?.(name) || String(name).slice(0, 2).toUpperCase();
    return `<span class="tl-crest tl-${calendarSide}" title="${name}" aria-label="${name}">${initials}</span>`;
  };

  const timeline = $('#timeline');
  let liveClockSeconds = 0;
  let liveClockSecondTimer = null;

  const injectOpponentModal = () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="liveOpponentModal" class="modal hidden"><div class="modal-card live-opponent-modal"><button id="closeLiveOpponent" class="close">×</button><label>ANÁLISE DO ADVERSÁRIO · AO VIVO</label><h2 id="liveOpponentName"></h2><p id="liveOpponentMeta" class="live-opponent-meta"></p><div class="live-opponent-layout"><section><div id="liveOpponentRoster" class="live-opponent-roster"></div></section><aside class="live-opponent-side"><div class="pause-pitch tactical-board live-opponent-pitch">${fieldMarkup}<div id="liveOpponentPitch"></div></div><p class="scout-manager" id="liveOpponentManager"><small>TÉCNICO</small><strong>—</strong></p></aside></div></div></div>`,
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
    const volHome = $('#liveVolumeHomeCrest');
    const volAway = $('#liveVolumeAwayCrest');
    if (volHome) volHome.textContent = clubCrestInitials(homeClub);
    if (volAway) {
      volAway.textContent = clubCrestInitials(awayClub);
      volAway.classList.add('away');
    }
    renderScorers();
    renderVolume();
  };

  const shortScorerName = name => {
    const parts = String(name || '—')
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length <= 1) return parts[0] || '—';
    return parts[parts.length - 1];
  };

  const renderScorers = () => {
    const homeEl = $('#liveHomeScorers');
    const awayEl = $('#liveAwayScorers');
    if (!homeEl || !awayEl) return;
    const sideGoals = (typeof getGoals === 'function' ? getGoals() : null) || { home: [], away: [] };
    const line = goal =>
      `<span><em>${goal.minute}'</em> ${shortScorerName(goal.name)}</span>`;
    homeEl.innerHTML = (sideGoals.home || []).map(line).join('');
    awayEl.innerHTML = (sideGoals.away || []).map(line).join('');
  };

  const buildAreaPath = (points, midY, up) => {
    if (!points.length) return '';
    const first = points[0];
    const last = points[points.length - 1];
    const peak = (p) => (up ? midY - p.v * 42 : midY + p.v * 42);
    let d = `M ${first.x.toFixed(1)} ${midY}`;
    points.forEach(p => {
      d += ` L ${p.x.toFixed(1)} ${peak(p).toFixed(1)}`;
    });
    d += ` L ${last.x.toFixed(1)} ${midY} Z`;
    return d;
  };

  const renderVolume = () => {
    const root = $('#liveVolume');
    const svg = $('#liveVolumeChart');
    if (!root || !svg) return;
    const rolling = getMatchStarted() && !getPreMatchPreparation();
    root.classList.toggle('hidden', !rolling && !getMatchFinished());
    if (!rolling && !getMatchFinished()) {
      svg.innerHTML = '';
      return;
    }
    const samples = typeof getVolumeSamples === 'function' ? getVolumeSamples() || [] : [];
    const W = 360;
    const H = 110;
    const midY = H / 2;
    const playMin = clamp(getMatchFinished() ? 90 : getMinute() || 0, 0, 90);
    const toX = minute => clamp((Number(minute) || 0) / 90, 0, 1) * W;
    const pointsHome = [];
    const pointsAway = [];
    if (!samples.length) {
      pointsHome.push({ x: 0, v: 0.08 }, { x: toX(playMin), v: 0.08 });
      pointsAway.push({ x: 0, v: 0.08 }, { x: toX(playMin), v: 0.08 });
    } else {
      // Âncora em 0' para o fluxo começar na origem.
      if (samples[0].minute > 0) {
        pointsHome.push({ x: 0, v: 0.06 });
        pointsAway.push({ x: 0, v: 0.06 });
      }
      samples.forEach(sample => {
        if (Number(sample.minute) > playMin + 0.01) return;
        const x = toX(sample.minute);
        pointsHome.push({ x, v: clamp(Number(sample.home) || 0.05, 0.04, 1) });
        pointsAway.push({ x, v: clamp(Number(sample.away) || 0.05, 0.04, 1) });
      });
      // Fecha no minuto atual (não estica flat até 90').
      const lastHome = pointsHome[pointsHome.length - 1];
      const lastAway = pointsAway[pointsAway.length - 1];
      const playX = toX(playMin);
      if (lastHome && playX > lastHome.x + 0.5) {
        pointsHome.push({ x: playX, v: Math.max(0.05, lastHome.v * 0.55) });
        pointsAway.push({ x: playX, v: Math.max(0.05, lastAway.v * 0.55) });
      }
    }
    const gridMarks = [0, 15, 30, 45, 60, 75, 90];
    const grid = gridMarks
      .map(m => {
        const x = toX(m).toFixed(1);
        return `<line x1="${x}" y1="8" x2="${x}" y2="${H - 8}" stroke="#1e4a5c" stroke-width="1" opacity="${m === 45 ? 0.9 : 0.45}"/>`;
      })
      .join('');
    const sideGoals = (typeof getGoals === 'function' ? getGoals() : null) || { home: [], away: [] };
    const volumeAt = (minute, side) => {
      if (!samples.length) return 0.45;
      let best = samples[0];
      let bestDist = Math.abs((best.minute || 0) - minute);
      samples.forEach(sample => {
        const dist = Math.abs((sample.minute || 0) - minute);
        if (dist < bestDist) {
          best = sample;
          bestDist = dist;
        }
      });
      return clamp(Number(side === 'home' ? best.home : best.away) || 0.45, 0.2, 1);
    };
    // SVG usa preserveAspectRatio=none — compensar escala p/ a bola ficar redonda na tela.
    const screenW = svg.clientWidth || W;
    const screenH = svg.clientHeight || 100;
    const scaleX = screenW / W;
    const scaleY = screenH / H;
    const ballPx = 20;
    const ballW = ballPx / Math.max(0.001, scaleX);
    const ballH = ballPx / Math.max(0.001, scaleY);
    const goalEvents = [
      ...(sideGoals.home || []).map(goal => ({ ...goal, side: 'home' })),
      ...(sideGoals.away || []).map(goal => ({ ...goal, side: 'away' })),
    ];
    const markers = goalEvents
      .map(goal => {
        const x = toX(goal.minute);
        const amp = volumeAt(Number(goal.minute) || 0, goal.side);
        // Bola na fatia do marcador (acima = mandante, abaixo = visitante).
        const y =
          goal.side === 'home' ? midY - Math.max(12, amp * 30) : midY + Math.max(12, amp * 30);
        const tipY = goal.side === 'home' ? y + ballH * 0.28 : y - ballH * 0.28;
        return `<g class="live-volume-goal" data-side="${goal.side}">
          <line x1="${x.toFixed(1)}" y1="${midY}" x2="${x.toFixed(1)}" y2="${tipY.toFixed(1)}" stroke="#edf8f5" stroke-width="1" opacity="0.45"/>
          <image href="${goalBallUrl}" xlink:href="${goalBallUrl}" x="${(x - ballW / 2).toFixed(2)}" y="${(y - ballH / 2).toFixed(2)}" width="${ballW.toFixed(2)}" height="${ballH.toFixed(2)}" preserveAspectRatio="none"/>
        </g>`;
      })
      .join('');
    const playX = toX(playMin).toFixed(1);
    svg.innerHTML = `
      <rect x="0" y="0" width="${W}" height="${H}" fill="#07141c"/>
      ${grid}
      <path d="${buildAreaPath(pointsHome, midY, true)}" fill="#d7e4e8" fill-opacity="0.92"/>
      <path d="${buildAreaPath(pointsAway, midY, false)}" fill="#1f5f9a" fill-opacity="0.95"/>
      <line x1="0" y1="${midY}" x2="${W}" y2="${midY}" stroke="#edf8f5" stroke-width="1.5"/>
      <line x1="${playX}" y1="6" x2="${playX}" y2="${H - 6}" stroke="#63d9ff" stroke-width="1.2" opacity="0.75"/>
      ${markers}
    `;
  };

  const score = () => {
    const { home: homeGoals, away: awayGoals } = getScores();
    $('#score').textContent = `${homeGoals} — ${awayGoals}`;
    updateClock();
    renderScorers();
    renderVolume();
  };

  const refreshMatchFeed = () => {
    renderScorers();
    renderVolume();
  };

  const log = (text, type = '', side = null) => {
    if (!shouldShowTimeline(text, type)) return;
    const calendarSide = toCalendarSide(side) || toCalendarSide(inferEngineSide(text));
    const badge = teamBadgeHtml(calendarSide);
    const sideClass = calendarSide ? ` tl-side-${calendarSide}` : '';
    const typeClass = type ? ` ${type}` : '';
    timeline.insertAdjacentHTML(
      'beforeend',
      `<p class="tl-event${typeClass}${sideClass}">${badge}<span class="tl-min">${getMinute()}'</span><span class="tl-body">${text}</span></p>`,
    );
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
    const managerStrong = $('#liveOpponentManager strong');
    if (managerStrong) managerStrong.textContent = getClubManagerName?.(club.name) || club.managerName || '—';
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
    const labelOf = (name) => (tactics?.boardPlayerLabel ? tactics.boardPlayerLabel(name, 8) : (() => {
      const parts = (name || '—').split(' ').filter(Boolean);
      const short = parts.length > 1 ? parts[parts.length - 1] : parts[0] || name;
      return short.length > 8 ? `${short.slice(0, 7)}…` : short;
    })());
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
    refreshMatchFeed,
    renderScorers,
    renderVolume,
    log,
    renderLiveOpponent,
    bindLiveActions,
    clockPhase,
  };
}
