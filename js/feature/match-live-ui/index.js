import { MEMORY_LIMITS } from '../../core/save.js';
import { MODULE_VERSIONS } from '../../core/constants.js';
import { applyCompetitionBadge } from '../../ui/competition-badge.js';
import { setHumanBadgeOnCrest } from '../../ui/human-badge.js';
import {
  formatLiveClockParts,
  formatMatchMinuteLabel,
  toChartMinute,
  chartSpan,
} from '../../engine/match-clock.js';
import goalBallUrl from '../../../assets/ui/goal-ball.png?url';
import ownGoalBallUrl from '../../../assets/ui/goal-ball-own.png?url';
import subArrowsUrl from '../../../assets/ui/sub-arrows.png?url';

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
 * @param {Function} [deps.getUserDivision]
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
    getStoppageElapsed,
    getStoppageActive,
    getStoppageFirst,
    getStoppageSecond,
    getMatchStarted,
    getMatchFinished,
    getPreMatchPreparation,
    getHalftimeShown,
    getShootoutState,
    getScores,
    getGoals,
    getVolumeSamples,
    getVolumeIncidents,
    getUserClub,
    getUserAtHome,
    getUserDivision,
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
    'penalty-miss',
    'injury',
    'injury-substitution',
    'substitution',
    'shootout-miss',
    'tactic',
    'engine-warning',
  ]);
  const TIMELINE_STRUCTURAL =
    /intervalo|fim de jogo|disputa de p[eê]naltis|bola est[aá] rolando|tempo regulamentar|encerrada|acr[eé]scimo|in[ií]cio do 2/i;

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
    const stoppage = getStoppageActive?.();
    if (stoppage === 'first') return '1º TEMPO · ACRÉSCIMOS';
    if (stoppage === 'second') return '2º TEMPO · ACRÉSCIMOS';
    if (getHalftimeShown() && minute <= 45) return 'INTERVALO';
    if (minute > 45) return '2º TEMPO';
    return '1º TEMPO';
  };

  /**
   * Acréscimo visível no relógio:
   * - ativo: progresso da etapa
   * - intervalo: congela 45(+1º tempo)
   * - fim: congela 90(+2º tempo)
   * - 2º tempo em andamento: 0 (recomeça limpo aos 45')
   */
  const displayStoppageMinutes = () => {
    const active = getStoppageActive?.();
    if (active === 'first' || active === 'second') {
      return Math.max(0, Number(getStoppageElapsed?.() || 0));
    }
    if (getMatchFinished()) {
      return Math.max(0, Number(getStoppageSecond?.() || getStoppageElapsed?.() || 0));
    }
    if (getHalftimeShown() && getMinute() <= 45) {
      return Math.max(0, Number(getStoppageFirst?.() || getStoppageElapsed?.() || 0));
    }
    return 0;
  };

  const updateClock = () => {
    const clock = $('#liveMatchClock');
    if (!clock) return;
    const show = getMatchStarted() && !getPreMatchPreparation();
    clock.classList.toggle('hidden', !show);
    if (!show) return;
    const timeEl = clock.querySelector('.live-match-clock-time'),
      phaseEl = clock.querySelector('.live-match-clock-phase');
    const stoppageElapsed = displayStoppageMinutes();
    const atInterval = getHalftimeShown() && !getMatchFinished() && getMinute() <= 45;
    const minute = getMatchFinished() ? 90 : atInterval ? 45 : getMinute();
    if (timeEl) {
      const parts = formatLiveClockParts(minute, stoppageElapsed, liveClockSeconds);
      const stopHtml = parts.stoppage
        ? `<span class="live-match-clock-stoppage">(${parts.stoppage})</span>`
        : '';
      // Timer normal + acréscimo depois, na mesma linha: 45:00(+5)
      timeEl.innerHTML = `${parts.main}:${parts.seconds}${stopHtml}`;
    }
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
    applyCompetitionBadge('#liveMatchCompetition', game, {
      userDivision: typeof getUserDivision === 'function' ? getUserDivision() : 'A',
    });
    const homeCrest = $('#liveHomeCrest'),
      awayCrest = $('#liveAwayCrest');
    if (homeCrest) {
      homeCrest.textContent = clubCrestInitials(homeClub);
      homeCrest.classList.remove('away');
      setHumanBadgeOnCrest(homeCrest, userHome);
    }
    if (awayCrest) {
      awayCrest.textContent = clubCrestInitials(awayClub);
      awayCrest.classList.add('away');
      setHumanBadgeOnCrest(awayCrest, !userHome);
    }
    const homeNameEl = $('#liveHomeName');
    const awayNameEl = $('#liveAwayName');
    if (homeNameEl) {
      homeNameEl.textContent = homeClub.toUpperCase();
      homeNameEl.classList.add('club-link');
      homeNameEl.dataset.club = homeClub;
      homeNameEl.setAttribute('role', 'button');
      homeNameEl.tabIndex = 0;
      homeNameEl.classList.toggle('user-club-live', userHome);
    }
    if (awayNameEl) {
      awayNameEl.textContent = awayClub.toUpperCase();
      awayNameEl.classList.add('club-link');
      awayNameEl.dataset.club = awayClub;
      awayNameEl.setAttribute('role', 'button');
      awayNameEl.tabIndex = 0;
      awayNameEl.classList.toggle('user-club-live', !userHome);
    }
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

  /** Agrupa gols do mesmo jogador: "Pereira 8', 79'" / "Silva (GC) 45+2'". */
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
        .map(stamp => `${formatMatchMinuteLabel(stamp.minute, stamp.stoppage)}'`)
        .join(', ');
      return {
        name: entry.own ? `${shortScorerName(entry.name)} (GC)` : shortScorerName(entry.name),
        minutes,
      };
    });
  };

  const renderScorers = () => {
    const homeEl = $('#liveHomeScorers');
    const awayEl = $('#liveAwayScorers');
    if (!homeEl || !awayEl) return;
    const sideGoals = (typeof getGoals === 'function' ? getGoals() : null) || { home: [], away: [] };
    const line = entry =>
      `<span>${entry.name} <em>${entry.minutes}</em></span>`;
    homeEl.innerHTML = groupGoalsByScorer(sideGoals.home).map(line).join('');
    awayEl.innerHTML = groupGoalsByScorer(sideGoals.away).map(line).join('');
  };

  /** Comprime amplitude p/ picos não colarem no teto; mantém hierarquia visual. */
  const volumeDisplayAmp = (v) => 0.12 + Math.pow(clamp(Number(v) || 0, 0, 1), 0.82) * 0.72;
  const volumePeakY = (midY, up, v, maxAmp) => {
    const dist = volumeDisplayAmp(v) * maxAmp;
    return up ? midY - dist : midY + dist;
  };

  /** Área espelhada com Catmull-Rom → curvas cúbicas (mais fluido que linhas retas). */
  const buildAreaPath = (points, midY, up, maxAmp, padY) => {
    if (!points.length) return '';
    const yOf = (v) => clamp(volumePeakY(midY, up, v, maxAmp), padY, midY * 2 - padY);
    const first = points[0];
    const last = points[points.length - 1];
    let d = `M ${first.x.toFixed(1)} ${midY.toFixed(1)} L ${first.x.toFixed(1)} ${yOf(first.v).toFixed(1)}`;
    if (points.length === 1) {
      d += ` L ${first.x.toFixed(1)} ${midY.toFixed(1)} Z`;
      return d;
    }
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const y0 = yOf(p0.v);
      const y1 = yOf(p1.v);
      const y2 = yOf(p2.v);
      const y3 = yOf(p3.v);
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = clamp(y1 + (y2 - y0) / 6, padY, midY * 2 - padY);
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = clamp(y2 - (y3 - y1) / 6, padY, midY * 2 - padY);
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${y2.toFixed(1)}`;
    }
    d += ` L ${last.x.toFixed(1)} ${midY.toFixed(1)} Z`;
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
    const H = 120;
    const midY = H / 2;
    const padY = 10;
    const maxAmp = midY - padY;
    const s1 = Math.max(0, Number(getStoppageFirst?.() || 0));
    const s2 = Math.max(0, Number(getStoppageSecond?.() || 0));
    const activeStoppage = getStoppageActive?.();
    const clockStoppage = activeStoppage
      ? Math.max(0, Number(getStoppageElapsed?.() || 0))
      : getMatchFinished()
        ? s2
        : getHalftimeShown() && getMinute() <= 45
          ? s1
          : 0;
    const span = Math.max(90, chartSpan(s1, s2));
    const chartOf = (minute, stoppage = 0) =>
      toChartMinute({ minute, stoppage, stoppageFirst: s1 });
    const playChart = chartOf(getMatchFinished() ? 90 : getMinute() || 0, clockStoppage);
    const toX = chartMin => clamp((Number(chartMin) || 0) / span, 0, 1) * W;
    const sampleChart = sample =>
      chartOf(sample?.minute, sample?.stoppage || 0);
    const pointsHome = [];
    const pointsAway = [];
    if (!samples.length) {
      pointsHome.push({ x: 0, v: 0.08 }, { x: toX(playChart), v: 0.08 });
      pointsAway.push({ x: 0, v: 0.08 }, { x: toX(playChart), v: 0.08 });
    } else {
      // Âncora em 0' para o fluxo começar na origem.
      if (sampleChart(samples[0]) > 0) {
        pointsHome.push({ x: 0, v: 0.06 });
        pointsAway.push({ x: 0, v: 0.06 });
      }
      samples.forEach(sample => {
        const c = sampleChart(sample);
        if (c > playChart + 0.01) return;
        const x = toX(c);
        pointsHome.push({ x, v: clamp(Number(sample.home) || 0.05, 0.04, 1) });
        pointsAway.push({ x, v: clamp(Number(sample.away) || 0.05, 0.04, 1) });
      });
      // Fecha no minuto atual (não estica flat até o fim).
      const lastHome = pointsHome[pointsHome.length - 1];
      const lastAway = pointsAway[pointsAway.length - 1];
      const playX = toX(playChart);
      if (lastHome && playX > lastHome.x + 0.5) {
        pointsHome.push({ x: playX, v: Math.max(0.05, lastHome.v * 0.55) });
        pointsAway.push({ x: playX, v: Math.max(0.05, lastAway.v * 0.55) });
      }
    }
    // Marcas fixas do 1º em 0–45; 2º deslocado por S1; INT/FT no fim de cada etapa.
    const gridMarks = [0, 15, 30, 45, chartOf(60), chartOf(75), chartOf(90)];
    const intChart = chartOf(45, s1);
    const ftChart = chartOf(90, s2);
    const grid = [...new Set([...gridMarks, intChart, ftChart])]
      .sort((a, b) => a - b)
      .map(m => {
        const x = toX(m).toFixed(1);
        const strong = m === intChart || m === ftChart;
        return `<line x1="${x}" y1="${padY}" x2="${x}" y2="${H - padY}" stroke="#1e4a5c" stroke-width="1" opacity="${strong ? 0.85 : 0.35}"/>`;
      })
      .join('');
    const axis = root.querySelector('.live-volume-axis');
    if (axis) {
      const endLabel = s2 > 0 ? `90+${s2}` : '90';
      axis.innerHTML = `<span>0'</span><span>15'</span><span>30'</span><span>INT</span><span>60'</span><span>75'</span><span>${endLabel}</span>`;
    }
    const sideGoals = (typeof getGoals === 'function' ? getGoals() : null) || { home: [], away: [] };
    const volumeAt = (chartMin, side) => {
      if (!samples.length) return 0.45;
      let best = samples[0];
      let bestDist = Math.abs(sampleChart(best) - chartMin);
      samples.forEach(sample => {
        const dist = Math.abs(sampleChart(sample) - chartMin);
        if (dist < bestDist) {
          best = sample;
          bestDist = dist;
        }
      });
      return clamp(Number(side === 'home' ? best.home : best.away) || 0.45, 0.2, 1);
    };
    // SVG usa preserveAspectRatio=none — ícones em px de tela via scale(1/sx,1/sy).
    const screenW = svg.clientWidth || W;
    const screenH = svg.clientHeight || 112;
    const scaleX = Math.max(0.001, screenW / W);
    const scaleY = Math.max(0.001, screenH / H);
    // Gol normal: lado de quem marcou. Gol contra: lado de quem sofreu (bola vermelha).
    const mapGoalEvent = (goal, scoredSide) => {
      const own = goal?.type === 'own';
      const sufferSide = scoredSide === 'home' ? 'away' : 'home';
      return {
        ...goal,
        side: own ? sufferSide : scoredSide,
        kind: own ? 'own-goal' : 'goal',
      };
    };
    const goalEvents = [
      ...(sideGoals.home || []).map(goal => mapGoalEvent(goal, 'home')),
      ...(sideGoals.away || []).map(goal => mapGoalEvent(goal, 'away')),
    ];
    const incidentEvents = (typeof getVolumeIncidents === 'function' ? getVolumeIncidents() || [] : [])
      .filter(item =>
        ['yellow', 'red', 'injury', 'penalty-miss', 'substitution'].includes(item?.type),
      )
      .map(item => ({
        minute: Number(item.minute) || 0,
        stoppage: Number(item.stoppage) || 0,
        side: item.side === 'away' ? 'away' : 'home',
        kind: item.type,
        name: item.name || '',
      }));
    const eventChart = event => chartOf(event.minute, event.stoppage || 0);
    const allMarkers = [...goalEvents, ...incidentEvents].sort(
      (a, b) => eventChart(a) - eventChart(b),
    );
    const stackKey = (side, chartMin) => `${side}:${Math.round(Number(chartMin) || 0)}`;
    const stackCount = new Map();
    const kindLabel = kind =>
      ({
        goal: 'Gol',
        'own-goal': 'Gol contra',
        yellow: 'Amarelo',
        red: 'Vermelho',
        injury: 'Lesão',
        'penalty-miss': 'Pênalti perdido',
        substitution: 'Substituição',
      })[kind] || kind;
    const markerIcon = (kind, x, y) => {
      const t = `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${(1 / scaleX).toFixed(4)} ${(1 / scaleY).toFixed(4)})`;
      if (kind === 'goal') {
        return `<g transform="${t}"><image href="${goalBallUrl}" xlink:href="${goalBallUrl}" x="-10" y="-10" width="20" height="20" preserveAspectRatio="xMidYMid meet"/></g>`;
      }
      if (kind === 'own-goal') {
        return `<g transform="${t}"><image href="${ownGoalBallUrl}" xlink:href="${ownGoalBallUrl}" x="-10" y="-10" width="20" height="20" preserveAspectRatio="xMidYMid meet"/></g>`;
      }
      if (kind === 'substitution') {
        return `<g transform="${t}"><image href="${subArrowsUrl}" xlink:href="${subArrowsUrl}" x="-11" y="-11" width="22" height="22" preserveAspectRatio="xMidYMid meet"/></g>`;
      }
      if (kind === 'penalty-miss') {
        return `<g transform="${t}">
          <image href="${goalBallUrl}" xlink:href="${goalBallUrl}" x="-10" y="-10" width="20" height="20" preserveAspectRatio="xMidYMid meet"/>
          <line x1="-7.2" y1="-7.2" x2="7.2" y2="7.2" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/>
          <line x1="7.2" y1="-7.2" x2="-7.2" y2="7.2" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/>
          <line x1="-7.2" y1="-7.2" x2="7.2" y2="7.2" stroke="#e31b1b" stroke-width="2.6" stroke-linecap="round"/>
          <line x1="7.2" y1="-7.2" x2="-7.2" y2="7.2" stroke="#e31b1b" stroke-width="2.6" stroke-linecap="round"/>
        </g>`;
      }
      if (kind === 'yellow' || kind === 'red') {
        const fill = kind === 'yellow' ? '#ffcc33' : '#e31b1b';
        const stroke = kind === 'yellow' ? '#a67c00' : '#8b1010';
        return `<g transform="${t}"><rect x="-4" y="-5.5" width="8" height="11" rx="1.2" fill="${fill}" stroke="${stroke}" stroke-width="0.9"/></g>`;
      }
      // Lesão: cruz branca em círculo vermelho (legível mesmo no gráfico esticado)
      return `<g transform="${t}">
        <circle r="9" fill="#d32f2f" stroke="#ffffff" stroke-width="1.8"/>
        <rect x="-5.5" y="-1.6" width="11" height="3.2" rx="0.7" fill="#ffffff"/>
        <rect x="-1.6" y="-5.5" width="3.2" height="11" rx="0.7" fill="#ffffff"/>
      </g>`;
    };
    const markerBand = kind => {
      if (kind === 'goal' || kind === 'own-goal' || kind === 'penalty-miss') return 0.88;
      if (kind === 'substitution') return 0.72;
      if (kind === 'injury') return 0.62;
      return 0.38;
    };
    // Conta ocorrências no mesmo minuto/lado para espalhar na horizontal.
    const stackTotals = new Map();
    allMarkers.forEach(event => {
      const key = stackKey(event.side, eventChart(event));
      stackTotals.set(key, (stackTotals.get(key) || 0) + 1);
    });
    const markers = allMarkers
      .map(event => {
        const cMin = eventChart(event);
        const baseX = toX(cMin);
        const amp = volumeAt(cMin, event.side);
        const key = stackKey(event.side, cMin);
        const stack = stackCount.get(key) || 0;
        stackCount.set(key, stack + 1);
        const total = stackTotals.get(key) || 1;
        // Espaço em px de tela (ícones grandes como sub precisam de mais folga).
        const gapPx =
          event.kind === 'substitution' || event.kind === 'goal' || event.kind === 'own-goal'
            ? 18
            : event.kind === 'injury' || event.kind === 'penalty-miss'
              ? 15
              : 11;
        const gapChart = gapPx / scaleX;
        const offsetIndex = stack - (total - 1) / 2;
        const x = clamp(baseX + offsetIndex * gapChart, 10, W - 10);
        const band = markerBand(event.kind);
        const baseY = volumePeakY(midY, event.side === 'home', Math.max(amp, band * 0.7), maxAmp * band);
        // Só empilha na vertical se ainda houver muitos no mesmo ponto.
        const row = Math.floor(stack / 4);
        const stackShiftY = row * (10 / scaleY) * (event.side === 'home' ? -1 : 1);
        const y = clamp(baseY + stackShiftY, padY + 6, H - padY - 6);
        const tipY = event.side === 'home' ? y + 3 : y - 3;
        const minLabel = formatMatchMinuteLabel(event.minute, event.stoppage || 0);
        const title = event.name
          ? `${minLabel}' · ${kindLabel(event.kind)} · ${event.name}`
          : `${minLabel}' · ${kindLabel(event.kind)}`;
        return `<g class="live-volume-marker live-volume-${event.kind}" data-side="${event.side}" data-kind="${event.kind}">
          <title>${title}</title>
          <line x1="${x.toFixed(1)}" y1="${midY}" x2="${x.toFixed(1)}" y2="${tipY.toFixed(1)}" stroke="#edf8f5" stroke-width="1" opacity="0.35"/>
          ${markerIcon(event.kind, x, y)}
        </g>`;
      })
      .join('');
    const playX = toX(playChart).toFixed(1);
    const homePath = buildAreaPath(pointsHome, midY, true, maxAmp, padY);
    const awayPath = buildAreaPath(pointsAway, midY, false, maxAmp, padY);
    svg.innerHTML = `
      <defs>
        <linearGradient id="volHomeFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#e8f2f4" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#b8cdd4" stop-opacity="0.55"/>
        </linearGradient>
        <linearGradient id="volAwayFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2a7ab0" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="#1a5a8a" stop-opacity="0.95"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${W}" height="${H}" fill="#07141c"/>
      ${grid}
      <path class="live-volume-area home" d="${homePath}" fill="url(#volHomeFill)" stroke="#d7e4e8" stroke-width="1.1" stroke-opacity="0.55"/>
      <path class="live-volume-area away" d="${awayPath}" fill="url(#volAwayFill)" stroke="#63a8d8" stroke-width="1.1" stroke-opacity="0.45"/>
      <line x1="0" y1="${midY}" x2="${W}" y2="${midY}" stroke="#edf8f5" stroke-width="1.4" opacity="0.9"/>
      <line x1="${playX}" y1="${padY - 2}" x2="${playX}" y2="${H - padY + 2}" stroke="#63d9ff" stroke-width="1.25" opacity="0.8"/>
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
    const minuteLabel = formatMatchMinuteLabel(
      getMinute(),
      getStoppageActive?.() ? Number(getStoppageElapsed?.() || 0) : 0,
    ); // timeline só marca +N enquanto o acréscimo está rolando
    timeline.insertAdjacentHTML(
      'beforeend',
      `<p class="tl-event${typeClass}${sideClass}">${badge}<span class="tl-min">${minuteLabel}'</span><span class="tl-body">${text}</span></p>`,
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
    const oppName = $('#liveOpponentName');
    if (oppName) {
      oppName.textContent = club.name;
      oppName.classList.add('club-link');
      oppName.dataset.club = club.name;
      oppName.setAttribute('role', 'button');
      oppName.tabIndex = 0;
    }
    $('#liveOpponentMeta').textContent = `${club.formation} · ${styleLabel} · Mentalidade ${mentalityLabel} · Atualizado aos ${getMinute() || 0}'`;
    const managerStrong = $('#liveOpponentManager strong');
    if (managerStrong) managerStrong.textContent = getClubManagerName?.(club.name) || club.managerName || '—';
    const headers = '<div class="live-opponent-head"><span>JOGADOR</span><span>POS.</span><span>OVR</span><span>CANSAÇO</span></div>';
    const cards = getCards();
    const playerRow = (player, index, isStarter) => {
      const card = isStarter ? cards.away[index] : null;
      const overlay = card
        ? {
            yellow: card.yellow ? 1 : 0,
            red: !!card.red,
            injured: !!card.injured,
            playThroughRisk: !!card.playThroughRisk,
          }
        : null;
      const liveState =
        overlay && (overlay.yellow || overlay.red || overlay.injured || overlay.playThroughRisk) ? overlay : null;
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
