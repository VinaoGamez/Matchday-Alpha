import { MODULE_VERSIONS, SAVE_KEYS } from '../../core/constants.js';
import { clamp } from '../../ui/dom.js';
import { competitionBadgeMarkup, resolveCompetitionBadge } from '../../ui/competition-badge.js';
import { crestWithHumanHtml } from '../../ui/human-badge.js';
import { teamCrestWithHumanHtml } from '../../ui/team-crest.js';
import { formatMatchRating as defaultFormatMatchRating } from '../../engine/player-match-stats.js';
import { formatMatchMinuteLabel } from '../../engine/match-clock.js';
import { isDateInTransferWindow, getTransferWindowPhase } from '../../engine/transfers.js';
import { sortCalendarCompetitionCodes, calendarCompetitionLabel } from '../../engine/season-calendar-mold.js';
import { tipKey, buildPlayerTipIndex, ownGoalTipCount } from './match-report-tips.js';
import goalBallUrl from '../../../assets/ui/goal-ball.png?url';
import ownGoalBallUrl from '../../../assets/ui/goal-ball-own.png?url';
import assistBootUrl from '../../../assets/ui/assist-boot.png?url';

/**
 * Calendário de carreira — grade mensal, agenda diária e relatório de partida.
 */
export function createCalendarViewFeature(deps) {
  const {
    $,
    $$,
    onClick,
    writeJson,
    getUserClub,
    getUserDivision,
    getCurrentRound,
    getCareerSeason,
    getCareerCalendarDate,
    getChampionshipFixtures,
    getCopaFixtures,
    getCalendarGames,
    getCalendarCompetitionTags,
    getSeasonCalendarFixtures,
    rebuildCalendarGames,
    getRestConflictCount,
    calendarIntervalLabel,
    isUserFixture,
    isFixtureCompleted,
    fixtureDetails,
    fixtureResultLabel,
    fixtureDate,
    seasonComplete,
    seasonFullyComplete,
    isUserSeasonIdle,
    nextPendingUserEntry,
    restDaysUntilNextFixture,
    trainingRecoveryMultiplier,
    getSeasonRoundHistory,
    getTrainingRules,
    setTrainingRule,
    getHasCareer,
    onPersist,
    openView,
    getChampionshipDivision,
    openChampionship,
    weekBounds,
    formatWeekDay,
    userMatchOnDate,
    isOnPendingMatchDay,
    calendarTrainingMap,
    trainingOptions,
    findMatchLog,
    formatMatchRating = defaultFormatMatchRating,
    formatVenueCrowdLine,
    getMarketDayBrief,
  } = deps;

  const formatMarketFee = value => {
    const amount = Math.round(Number(value) || 0);
    if (amount <= 0) return '—';
    if (amount >= 1_000_000) return `R$ ${(amount / 1_000_000).toFixed(1).replace('.0', '')} mi`;
    if (amount >= 1_000) return `R$ ${Math.round(amount / 1_000)} mil`;
    return `R$ ${amount}`;
  };

  const escapeAgenda = value =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  let calendarCursor;
  let selectedCalendarDate;
  const calendarReportGames = new Map();
  let persistSeason = typeof onPersist === 'function' ? onPersist : () => {};

  const setPersist = fn => {
    persistSeason = typeof fn === 'function' ? fn : () => {};
  };

  const calendarKey = date =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const calendarDate = key => {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
  };

  const getCalendarCursor = () => calendarCursor;
  const getSelectedCalendarDate = () => selectedCalendarDate;

  const setSelectedCalendarDate = date => {
    selectedCalendarDate = new Date(date);
    calendarCursor = new Date(getCareerSeason(), selectedCalendarDate.getMonth(), 1);
  };

  const syncCalendarSubtitle = () => {
    const championshipFixtures = getChampionshipFixtures();
    const copaDoBrasilFixtures = getCopaFixtures();
    const restConflictCount = getRestConflictCount();
    $('#calendar .title span').textContent = `Agenda nacional de janeiro a dezembro · ${championshipFixtures.flat().length} jogos do Brasileiro · ${copaDoBrasilFixtures.length} jogos confirmados da Copa do Brasil · ${calendarIntervalLabel(restConflictCount)}.`;
  };

  const calendarGameResult = game => {
    const userClub = getUserClub();
    const userDivision = getUserDivision();
    const seasonRoundHistory = getSeasonRoundHistory();
    if (game.competition === 'COPA DO BRASIL') {
      return game.completed ? { game, result: game, data: game.data || null, goals: game.goals || null } : null;
    }
    const roundRecord = seasonRoundHistory.find(item => item.round === game.round);
    const result = roundRecord?.games?.find(item => item.home === game.home && item.away === game.away);
    if (!result) return null;
    if (result.data) return { game, result, data: result.data, goals: result.goals || null };
    if (roundRecord.userStats && isUserFixture(game)) {
      const userHome = game.home === userClub;
      const h = userHome ? roundRecord.userStats.home : roundRecord.userStats.away;
      const a = userHome ? roundRecord.userStats.away : roundRecord.userStats.home;
      const userGoals = roundRecord.userStats.goals || { home: [], away: [] };
      const userPossession = clamp(Math.round(roundRecord.userStats.home.possession), 28, 72);
      const homePossession = userHome ? userPossession : 100 - userPossession;
      return {
        game,
        result,
        goals: userHome ? userGoals : { home: userGoals.away || [], away: userGoals.home || [] },
        data: {
          homePossession,
          awayPossession: 100 - homePossession,
          homePasses: h.passes,
          awayPasses: a.passes,
          homeAccurate: h.accurate,
          awayAccurate: a.accurate,
          homeShots: h.shots,
          awayShots: a.shots,
          homeOff: h.off,
          awayOff: a.off,
          homeOnTarget: h.on,
          awayOnTarget: a.on,
          homeSaved: h.saved,
          awaySaved: a.saved,
          homePenalties: h.penalties,
          awayPenalties: a.penalties,
          homeCorners: h.corners,
          awayCorners: a.corners,
          homeOffsides: h.offsides,
          awayOffsides: a.offsides,
          homeKeeperSaves: h.keeperSaves,
          awayKeeperSaves: a.keeperSaves,
          homeTackles: h.tackles,
          awayTackles: a.tackles,
          homeFouls: h.fouls,
          awayFouls: a.fouls,
          homeYellow: h.yellow,
          awayYellow: a.yellow,
          homeRed: h.red,
          awayRed: a.red,
        },
      };
    }
    return { game, result, data: null, goals: result.goals || null };
  };

  const resolveMatchHistoryLog = game => {
    if (typeof findMatchLog !== 'function' || !game?.home || !game?.away) return null;
    return (
      findMatchLog({
        home: game.home,
        away: game.away,
        season: getCareerSeason(),
        round: game.round ?? game.phaseIndex ?? null,
        leg: game.leg || null,
      }) ||
      findMatchLog({
        home: game.home,
        away: game.away,
        season: getCareerSeason(),
        round: game.round ?? game.phaseIndex ?? null,
      }) ||
      null
    );
  };

  const clubCrestInitials = name =>
    String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '—';

  const shortScorerName = name => {
    const parts = String(name || '—')
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length <= 1) return parts[0] || '—';
    return parts[parts.length - 1];
  };

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

  const sheetIdentity = sheet => sheet.key || `${sheet.club || ''}|${sheet.name || ''}`;

  const POSITION_ORDER = {
    GOL: 0,
    ZAG: 1,
    LAT: 2,
    LE: 2,
    LD: 2,
    VOL: 3,
    MC: 4,
    MEI: 4,
    ME: 4,
    MD: 4,
    PE: 5,
    PD: 5,
    ATA: 6,
    SA: 6,
    CA: 6,
  };

  const positionRank = sheet => {
    const pos = String(sheet.pos || sheet.role || '').toUpperCase();
    if (POSITION_ORDER[pos] != null) return POSITION_ORDER[pos];
    if (pos.startsWith('G')) return 0;
    if (pos.includes('ZAG') || pos === 'Z') return 1;
    if (pos.includes('LAT') || pos === 'L') return 2;
    if (pos.includes('VOL')) return 3;
    if (pos.includes('MEI') || pos === 'M') return 4;
    if (pos.includes('ATA') || pos === 'A') return 6;
    return 5;
  };

  const subStampKey = stamp =>
    (Number(stamp?.minute) || 0) * 100 + (Number(stamp?.stoppage) || 0);

  /**
   * Eventos de sub com cronologia (minuto/acréscimo).
   * Quem entrou e depois saiu recebe ↑ e ↓ na ordem real da partida.
   */
  const subMarkers = (sheet, tips) => {
    const events = [];
    const entered =
      !!tips?.subIn?.length || (!sheet.started && (Number(sheet.minutes) || 0) > 0);
    if (entered) {
      events.push({
        kind: 'in',
        stamp: tips?.subIn?.[0] || {
          minute: Math.max(0, 90 - (Number(sheet.minutes) || 0)),
          stoppage: 0,
        },
      });
    }
    if (tips?.subOut?.length) {
      events.push({
        kind: 'out',
        stamp: tips.subOut[0] || { minute: sheet.minutes, stoppage: 0 },
      });
    }
    return events.sort((a, b) => subStampKey(a.stamp) - subStampKey(b.stamp));
  };

  const tipMinuteLabel = (minute, stoppage = 0) => {
    if (minute == null || !Number.isFinite(Number(minute))) return null;
    return `${formatMatchMinuteLabel(minute, stoppage)}'`;
  };

  const tipText = (label, minute, stoppage = 0) => {
    const when = tipMinuteLabel(minute, stoppage);
    return when ? `${label} - ${when}` : label;
  };

  const escapeTip = value =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');

  const tipAttrs = text => {
    // Só data-tip (CSS). Evita title nativo — senão aparecem duas legendas.
    return `data-tip="${escapeTip(text)}"`;
  };

  const cardIconMarkup = (kind, tip) =>
    `<span class="match-report-card-icon ${kind}" aria-label="${
      kind === 'yellow' ? 'Cartão Amarelo' : 'Cartão Vermelho'
    }" ${tipAttrs(tip)}><i></i></span>`;

  /** Um único melhor em campo — desempate: nota → gols → assistências → minutos. */
  const pickManOfTheMatch = sheets => {
    const rated = (sheets || []).filter(sheet => (Number(sheet.minutes) || 0) > 0 && sheet.rating != null);
    if (!rated.length) return null;
    return [...rated].sort(
      (a, b) =>
        (Number(b.rating) || 0) - (Number(a.rating) || 0) ||
        (Number(b.goals) || 0) - (Number(a.goals) || 0) ||
        (Number(b.assists) || 0) - (Number(a.assists) || 0) ||
        (Number(b.minutes) || 0) - (Number(a.minutes) || 0) ||
        String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'),
    )[0];
  };

  const playerEventIcons = (sheet, tipIndex) => {
    const side = sheet.side === 'away' ? 'away' : sheet.side === 'home' ? 'home' : null;
    const tips =
      (side && tipIndex?.get(tipKey(side, sheet.name))) || {
        goals: [],
        assists: [],
        ownGoals: [],
        yellow: [],
        red: [],
        subIn: [],
        subOut: [],
      };
    const goals = Math.max(0, Number(sheet.goals) || 0);
    // Só o tipIndex (lado|nome): sheet.ownGoals antigo podia marcar homônimo no time adversário.
    const ownGoals = Math.max(0, ownGoalTipCount(tipIndex, sheet), tips.ownGoals.length);
    const assists = Math.max(0, Number(sheet.assists) || 0);
    const yellowCount = Math.max(sheet.yellow ? 1 : 0, tips.yellow.length);
    const redCount = Math.max(sheet.red ? 1 : 0, tips.red.length);
    const subs = subMarkers(sheet, tips);
    if (!goals && !ownGoals && !assists && !yellowCount && !redCount && !subs.length) return '';

    const balls = Array.from({ length: Math.min(goals, 5) }, (_, i) => {
      const stamp = tips.goals[i] || tips.goals[0];
      const text = tipText('Gol', stamp?.minute, stamp?.stoppage);
      return `<img class="match-report-icon match-report-goal-icon" src="${goalBallUrl}" alt="Gol" ${tipAttrs(text)} />`;
    }).join('');

    const ownBalls = Array.from({ length: Math.min(ownGoals, 3) }, (_, i) => {
      const stamp = tips.ownGoals[i] || tips.ownGoals[0];
      const text = tipText('Gol contra', stamp?.minute, stamp?.stoppage);
      return `<img class="match-report-icon match-report-own-goal-icon" src="${ownGoalBallUrl}" alt="Gol contra" ${tipAttrs(text)} />`;
    }).join('');

    const boots = Array.from({ length: Math.min(assists, 4) }, (_, i) => {
      const stamp = tips.assists[i] || tips.assists[0];
      const text = tipText('Assistência', stamp?.minute, stamp?.stoppage);
      return `<img class="match-report-icon match-report-assist-icon" src="${assistBootUrl}" alt="Assistência" ${tipAttrs(text)} />`;
    }).join('');

    const cards =
      Array.from({ length: Math.min(yellowCount, 2) }, (_, i) => {
        const stamp = tips.yellow[i] || tips.yellow[0];
        return cardIconMarkup('yellow', tipText('Cartão Amarelo', stamp?.minute, stamp?.stoppage));
      }).join('') +
      Array.from({ length: Math.min(redCount, 1) }, (_, i) => {
        const stamp = tips.red[i] || tips.red[0];
        return cardIconMarkup('red', tipText('Cartão Vermelho', stamp?.minute, stamp?.stoppage));
      }).join('');

    const subIcon = subs
      .map(({ kind, stamp }) => {
        if (kind === 'in') {
          return `<i class="match-report-sub in" aria-label="Entrou" ${tipAttrs(tipText('Entrou', stamp.minute, stamp.stoppage))}></i>`;
        }
        return `<i class="match-report-sub out" aria-label="Saiu" ${tipAttrs(tipText('Saiu', stamp.minute, stamp.stoppage))}></i>`;
      })
      .join('');

    return `<span class="match-report-events">${balls}${ownBalls}${boots}${cards}${subIcon}</span>`;
  };

  const sortRatingsList = players =>
    [...(players || [])]
      .filter(sheet => (Number(sheet.minutes) || 0) > 0 && sheet.rating != null)
      .sort((a, b) => {
        // Titulares (e quem saiu) primeiro; quem entrou depois.
        const aBench = a.started ? 0 : 1;
        const bBench = b.started ? 0 : 1;
        return (
          aBench - bBench ||
          positionRank(a) - positionRank(b) ||
          String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
        );
      });

  const ratingsBlock = (clubName, players, motmKey, tipIndex) => {
    const list = sortRatingsList(players);
    if (!list.length) return '';
    const rows = list
      .map(sheet => {
        const pos = String(sheet.pos || sheet.role || '—').toUpperCase().slice(0, 3);
        const isBest = motmKey != null && sheetIdentity(sheet) === motmKey;
        const ratingClass = [
          sheet.rating >= 8 ? 'rating-high' : sheet.rating <= 4.5 ? 'rating-low' : sheet.rating >= 6.5 ? 'rating-ok' : '',
          isBest ? 'rating-best' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return `<li class="${isBest ? 'match-report-best' : ''}"><span class="match-report-pos">${pos}</span><span class="match-report-player${isBest ? ' is-best' : ''}"><span class="match-report-name">${sheet.name}</span>${playerEventIcons(sheet, tipIndex)}</span><strong class="match-report-rating ${ratingClass}">${formatMatchRating(sheet.rating)}</strong></li>`;
      })
      .join('');
    return `<article class="match-report-ratings-side"><b>${clubName.toUpperCase()}</b><ul>${rows}</ul></article>`;
  };

  const ensureMatchReportModal = () => {
    let reportModal = $('#calendarMatchReportModal');
    if (reportModal && $('#matchReportContent')) return reportModal;
    if (!reportModal) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div id="calendarMatchReportModal" class="modal hidden"><div class="modal-card match-report-modal"><button id="closeCalendarMatchReport" class="close" type="button">×</button><div id="matchReportContent"></div></div></div>`,
      );
      reportModal = $('#calendarMatchReportModal');
      onClick('#closeCalendarMatchReport', () => {
        $('#calendarMatchReportModal')?.classList.add('hidden');
      });
    } else if (!$('#matchReportContent')) {
      reportModal.querySelector('.match-report-modal')?.insertAdjacentHTML(
        'beforeend',
        '<div id="matchReportContent"></div>',
      );
    }
    return reportModal;
  };

  const openCalendarMatchReport = entry => {
    const userClub = getUserClub();
    const userDivision = getUserDivision();
    const { game, result, goals, incidents = [] } = entry;
    if (!game?.home || !game?.away || !result) return;
    const competition = resolveCompetitionBadge(game, { userDivision });
    const historyLog = resolveMatchHistoryLog(game);
    const liveSheets = Array.isArray(entry.ratingPlayers) ? entry.ratingPlayers : null;
    const details = typeof fixtureDetails === 'function' ? fixtureDetails(game) : { display: '—', time: '' };
    const venueLine =
      typeof formatVenueCrowdLine === 'function'
        ? formatVenueCrowdLine(game)
        : game.home === userClub
          ? 'Mandante'
          : 'Visitante';
    const homeUser = game.home === userClub;
    const awayUser = game.away === userClub;
    const scoreLine = `${result.homeGoals} — ${result.awayGoals}${result.penalties ? ` <small>(${result.penalties})</small>` : ''}`;
    const scorerLines = side =>
      groupGoalsByScorer(goals?.[side] || [])
        .map(entry => `<span>${entry.name} <em>${entry.minutes}</em></span>`)
        .join('');
    const header = `
      <div class="match-report-live-head">
        <label class="match-report-live-label">AO VIVO</label>
        <p class="match-report-live-datetime">${details.display || '—'}${details.time ? ` · ${details.time}` : ''}</p>
        <p class="match-report-live-venue">${venueLine}</p>
        <div class="live-match-competition-wrap">${competitionBadgeMarkup({
          id: 'matchReportCompetition',
          nameId: 'matchReportCompetitionName',
          name: competition.name,
          kind: competition.kind,
        })}</div>
        <div class="score live-score match-report-live-score">
          <div class="live-team live-team-home">
            ${teamCrestWithHumanHtml(game.home, { isHuman: homeUser })}
            <b class="${homeUser ? 'user-club-live' : ''}">${game.home.toUpperCase()}</b>
            <div class="live-scorers">${scorerLines('home')}</div>
          </div>
          <div class="live-score-center">
            <strong>${scoreLine}</strong>
            <p class="live-match-clock"><strong class="live-match-clock-time">90:00</strong><small class="live-match-clock-phase">FIM DE JOGO</small></p>
          </div>
          <div class="live-team live-team-away">
            ${teamCrestWithHumanHtml(game.away, { isHuman: awayUser, away: true })}
            <b class="${awayUser ? 'user-club-live' : ''}">${game.away.toUpperCase()}</b>
            <div class="live-scorers">${scorerLines('away')}</div>
          </div>
        </div>
      </div>`;
    const sheetSource = liveSheets || historyLog?.players || [];
    let homeSheets = sheetSource.filter(p => p.club === game.home || p.side === 'home');
    let awaySheets = sheetSource.filter(p => p.club === game.away || p.side === 'away');
    // Fallback: se club/side não baterem, divide a lista ao meio (home primeiro).
    if (!homeSheets.length && !awaySheets.length && sheetSource.length) {
      const mid = Math.ceil(sheetSource.length / 2);
      homeSheets = sheetSource.slice(0, mid);
      awaySheets = sheetSource.slice(mid);
    }
    const motm = pickManOfTheMatch([...homeSheets, ...awaySheets]);
    const motmKey = motm ? sheetIdentity(motm) : null;
    const playedNames = new Set(
      [...homeSheets, ...awaySheets]
        .filter(sheet => (Number(sheet.minutes) || 0) > 0)
        .flatMap(sheet => {
          const name = sheet.name;
          if (!name) return [];
          const side = sheet.side === 'away' ? 'away' : sheet.side === 'home' ? 'home' : null;
          return side ? [`${side}|${name}`, name] : [name];
        }),
    );
    // Garante side nas fichas (necessário para tipKey / homônimos).
    homeSheets.forEach(sheet => {
      if (!sheet.side) sheet.side = 'home';
    });
    awaySheets.forEach(sheet => {
      if (!sheet.side) sheet.side = 'away';
    });
    const tipIndex = buildPlayerTipIndex(goals, incidents, playedNames);
    const ratingsHtml =
      homeSheets.length || awaySheets.length
        ? `<div class="match-report-ratings"><h3>NOTAS</h3><div class="match-report-ratings-grid">${ratingsBlock(game.home, homeSheets, motmKey, tipIndex)}${ratingsBlock(game.away, awaySheets, motmKey, tipIndex)}</div></div>`
        : `<div class="match-report-empty">Notas ainda não disponíveis para esta partida.</div>`;
    const reportModal = ensureMatchReportModal();
    const content = $('#matchReportContent');
    if (!reportModal || !content) return;
    reportModal.style.zIndex = '80';
    content.innerHTML = header + ratingsHtml;
    reportModal.classList.remove('hidden');
  };

  const renderTrainingRules = () => {
    const trainingRules = getTrainingRules();
    $$('#trainingRules [data-training-current]').forEach(el => {
      el.textContent = trainingRules[el.dataset.trainingCurrent] || '—';
    });
    $$('#trainingRules [data-training-option]').forEach(button => {
      const selected = trainingRules[button.dataset.trainingRule] === button.dataset.trainingOption;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  };

  const renderCalendarRoutine = () => {
    const currentRound = getCurrentRound();
    const careerCalendarDate = getCareerCalendarDate();
    const trainingRules = getTrainingRules();
    const next = nextPendingUserEntry();
    const rest = restDaysUntilNextFixture();
    const afterBoost = Math.round((trainingRecoveryMultiplier('after') - 1) * 100);
    const beforeLabel = trainingRules.before;
    const afterLabel = trainingRules.after;
    const careerDayLabel = careerCalendarDate
      .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
      .replace('.', '')
      .toUpperCase();
    const { start: weekStart, end: weekEnd } = weekBounds(careerCalendarDate);
    const weekLabel = `${formatWeekDay(weekStart)} — ${formatWeekDay(weekEnd)}`;
    const onMatchDay = isOnPendingMatchDay();
    const seasonDone = typeof seasonFullyComplete === 'function' ? seasonFullyComplete() : seasonComplete();
    const nextLabel = next
      ? `${next.details.display} · ${next.game.competition === 'COPA DO BRASIL' ? `Copa · ${next.game.phase}` : `Rodada ${next.game.round}`}`
      : seasonDone
        ? 'Temporada encerrada'
        : isUserSeasonIdle()
          ? `Sem jogos do clube · calendário nacional (R${currentRound})`
          : 'Aguardando definição';
    const el = $('#calendarRoutineSummary');
    if (el) {
      el.innerHTML = `${onMatchDay ? '<div class="routine-alert matchday">Dia de jogo · ajuste táticas e dispute a partida no dashboard antes de avançar a semana.</div>' : ''}<div class="routine-stat"><small>SEMANA EM PLANEJAMENTO</small><strong>${weekLabel}</strong></div><div class="routine-stat"><small>DATA ATUAL DA TEMPORADA</small><strong>${careerDayLabel}</strong></div><div class="routine-stat"><small>INTERVALO ATÉ O PRÓXIMO JOGO</small><strong>${next ? `${rest} ${rest === 1 ? 'dia' : 'dias'}` : '—'}</strong></div><div class="routine-stat"><small>PRÓXIMO COMPROMISSO</small><strong>${nextLabel}</strong></div><div class="routine-stat"><small>ROTINA PÓS-JOGO</small><strong>${afterLabel}${afterBoost > 0 ? ` (+${afterBoost}% recuperação)` : ''}</strong></div><div class="routine-stat"><small>ROTINA PRÉ-JOGO</small><strong>${beforeLabel}</strong></div>`;
    }
    const advanceBtn = $('#calendarAdvanceWeek');
    if (advanceBtn) {
      const blocked = onMatchDay || seasonDone || isUserSeasonIdle();
      const transferPhase = getTransferWindowPhase(careerCalendarDate);
      const windowOpen = !!transferPhase?.active;
      advanceBtn.disabled = blocked;
      advanceBtn.classList.toggle('is-deadline', !blocked && !!transferPhase?.isDeadlineWeek);
      if (!blocked && windowOpen) {
        advanceBtn.textContent =
          transferPhase.mode === 'day' ? 'AVANÇAR DIA ›' : 'AVANÇAR SEMANA ›';
        advanceBtn.title = transferPhase.isDeadlineDay
          ? 'Último dia da janela — avance para encerrar e ver o relatório'
          : transferPhase.isDeadlineWeek
            ? `Deadline Day · ${transferPhase.daysLeft} dia(s) restantes · mesma rotina do Dashboard`
            : `${transferPhase.label || 'Janela'} · avança o mercado (IA) como no Dashboard`;
      } else {
        advanceBtn.textContent = 'PRÓXIMA SEMANA ›';
        advanceBtn.title = onMatchDay
          ? 'Dispute a partida antes de avançar a semana'
          : seasonDone
            ? 'Temporada encerrada'
            : isUserSeasonIdle()
              ? 'Sem jogos do clube nesta fase'
              : 'Simula até 7 dias de treino; para no dia de jogo do clube';
      }
    }
  };

  const renderMarketDayAgenda = () => {
    if (typeof getMarketDayBrief !== 'function') return '';
    let brief;
    try {
      brief = getMarketDayBrief(selectedCalendarDate);
    } catch {
      return '';
    }
    if (!brief) return '';
    const phase = brief.phase || {};
    const parts = [];

    if (phase.active) {
      const windowLabel = phase.isDeadlineDay
        ? `${phase.label || 'Janela'} · DEADLINE DAY`
        : phase.isDeadlineWeek
          ? `${phase.label || 'Janela'} · última semana`
          : phase.label || 'Janela de transferências';
      parts.push(
        `<div class="agenda-item market-window ${phase.isDeadlineWeek ? 'is-deadline' : ''}"><i>TX</i><div><small>JANELA DE TRANSFERÊNCIAS</small><strong>${escapeAgenda(windowLabel)}</strong><span class="agenda-market-note">${phase.daysLeft === 0 ? 'Último dia para negociar.' : `${phase.daysLeft} dia(s) restantes na janela.`}</span></div></div>`,
      );
    }

    (brief.deals || []).forEach(deal => {
      parts.push(
        `<div class="agenda-item market-deal"><i>R$</i><div><small>TRANSFERÊNCIA</small><strong>${escapeAgenda(deal.playerName)}</strong><span class="agenda-market-note"><span class="club-link" data-club="${escapeAgenda(deal.from)}" role="button" tabindex="0">${escapeAgenda(deal.from)}</span> → <span class="club-link" data-club="${escapeAgenda(deal.to)}" role="button" tabindex="0">${escapeAgenda(deal.to)}</span> · ${formatMarketFee(deal.fee)}</span></div></div>`,
      );
    });

    (brief.loans || []).forEach(deal => {
      parts.push(
        `<div class="agenda-item market-loan"><i>EMP</i><div><small>EMPRÉSTIMO ENTRE CLUBES</small><strong>${escapeAgenda(deal.playerName)}</strong><span class="agenda-market-note"><span class="club-link" data-club="${escapeAgenda(deal.from)}" role="button" tabindex="0">${escapeAgenda(deal.from)}</span> → <span class="club-link" data-club="${escapeAgenda(deal.to)}" role="button" tabindex="0">${escapeAgenda(deal.to)}</span></span></div></div>`,
      );
    });

    (brief.interests || []).forEach(offer => {
      parts.push(
        `<div class="agenda-item market-interest"><i>INT</i><div><small>INTERESSE NO SEU ELENCO</small><strong>${escapeAgenda(offer.playerName)}</strong><span class="agenda-market-note"><span class="club-link" data-club="${escapeAgenda(offer.fromClub)}" role="button" tabindex="0">${escapeAgenda(offer.fromClub)}</span> · ${offer.type === 'loan' ? 'empréstimo' : formatMarketFee(offer.fee)}</span></div></div>`,
      );
    });

    (brief.watches || []).forEach(watch => {
      parts.push(
        `<div class="agenda-item market-watch"><i>OBS</i><div><small>POSSÍVEL MOVIMENTO</small><strong>${escapeAgenda(watch.playerName)}</strong><span class="agenda-market-note"><span class="club-link" data-club="${escapeAgenda(watch.to)}" role="button" tabindex="0">${escapeAgenda(watch.to)}</span> observa <span class="club-link" data-club="${escapeAgenda(watch.from)}" role="button" tabindex="0">${escapeAgenda(watch.from)}</span></span></div></div>`,
      );
    });

    if (phase.active && (brief.listedSample || []).length && !brief.deals?.length && !brief.watches?.length) {
      brief.listedSample.slice(0, 3).forEach(row => {
        parts.push(
          `<div class="agenda-item market-listed"><i>LIST</i><div><small>NO MERCADO</small><strong>${escapeAgenda(row.playerName)} · ${escapeAgenda(row.overall)}</strong><span class="agenda-market-note"><span class="club-link" data-club="${escapeAgenda(row.from)}" role="button" tabindex="0">${escapeAgenda(row.from)}</span> · ${formatMarketFee(row.price)}</span></div></div>`,
        );
      });
    }

    if (phase.active || brief.deals?.length || brief.loans?.length || brief.interests?.length) {
      const free = brief.freeAgents || {};
      parts.push(
        `<div class="agenda-item market-free coming-soon"><i>LIV</i><div><small>JOGADORES LIVRES</small><strong>Em breve no mercado</strong><span class="agenda-market-note">${escapeAgenda(free.note || 'Mecânica futura — após validar o mercado.')}</span></div></div>`,
      );
    }

    if (!parts.length && phase.active) {
      parts.push(
        `<div class="agenda-item market-idle"><i>TX</i><div><small>MERCADO</small><strong>Sem negócios registrados neste dia</strong><span class="agenda-market-note">Avance a janela no Dashboard para movimentar o mercado.</span></div></div>`,
      );
    }

    return parts.join('');
  };

  const renderCalendarAgenda = (trainingMap = null) => {
    const userClub = getUserClub();
    const trainingRules = getTrainingRules();
    const calendarGames = getCalendarGames();
    const key = calendarKey(selectedCalendarDate);
    const games = [...(calendarGames.get(key) || [])].sort((a, b) => Number(isUserFixture(b)) - Number(isUserFixture(a)));
    const activities = (trainingMap || calendarTrainingMap()).get(key) || [];
    const dateLabel = selectedCalendarDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    calendarReportGames.clear();
    $('#calendarSelectedDay').textContent = dateLabel;
    const cupGames = games.filter(game => game.competition === 'COPA DO BRASIL');
    const phase = getTransferWindowPhase(selectedCalendarDate);
    const marketBits = [];
    if (phase.active) marketBits.push(phase.isDeadlineDay ? 'Deadline Day' : phase.label || 'Janela aberta');
    if (games.length) {
      marketBits.unshift(
        `${games.length} ${games.length === 1 ? 'jogo programado' : 'jogos programados'}${cupGames.length ? ` · ${cupGames[0].phase}` : ''}`,
      );
    }
    $('#calendarSelectedMeta').textContent = marketBits.length
      ? marketBits.join(' · ')
      : 'Sem partidas programadas';
    const gameRows = games
      .map((game, index) => {
        const detail = fixtureDetails(game);
        const userGame = isUserFixture(game);
        const atHome = game.home === userClub;
        const isCup = game.competition === 'COPA DO BRASIL';
        const completed = isFixtureCompleted(game);
        const scoreLabel = fixtureResultLabel(game);
        const eventLabel = isCup ? `COPA DO BRASIL · ${game.phase} · ${game.leg}` : `BRASILEIRÃO · RODADA ${game.round}`;
        const report = calendarGameResult(game);
        const reportKey = `${key}-${index}`;
        if (report) calendarReportGames.set(reportKey, report);
        return `<div class="agenda-item ${report ? 'has-report' : ''} ${userGame ? 'user-game' : ''} ${isCup ? 'cup' : ''} ${completed ? 'completed' : ''}"><time>${detail.time}</time><div><small>${userGame ? `SEU JOGO · ${eventLabel} · ${atHome ? 'EM CASA' : 'FORA'}${completed ? ' · ENCERRADO' : ''}` : eventLabel}</small><strong><span class="club-link" data-club="${game.home}" role="button" tabindex="0">${game.home}</span> × <span class="club-link" data-club="${game.away}" role="button" tabindex="0">${game.away}</span>${scoreLabel ? ` <em>· ${scoreLabel}</em>` : ''}</strong></div>${report ? `<button type="button" class="agenda-match-report" data-match-report="${reportKey}" title="Ver estatísticas finais" aria-label="Ver estatísticas de ${game.home} contra ${game.away}">▤</button>` : ''}</div>`;
      })
      .join('');
    const trainingRows = activities
      .map(
        activity =>
          `<div class="agenda-item training"><i>MF</i><div><small>${activity.type === 'before' ? 'PRÉ-JOGO' : activity.type === 'after' ? 'PÓS-JOGO' : 'DIA LIVRE'}</small><strong>${activity.label}</strong></div></div>`
      )
      .join('');
    const marketRows = renderMarketDayAgenda();
    const freeRow =
      !games.length && !activities.length && !marketRows
        ? `<div class="agenda-item free"><i>—</i><div><small>DIA SEM PARTIDA</small><strong>${trainingRules.free}</strong></div></div>`
        : '';
    $('#calendarDayAgenda').innerHTML = gameRows + trainingRows + marketRows + freeRow;
  };

  const calendarCompetitionTagMarkup = key => {
    const tags = typeof getCalendarCompetitionTags === 'function' ? getCalendarCompetitionTags().get(key) : null;
    if (!tags?.size) return '';
    return `<span class="calendar-comp-tags">${sortCalendarCompetitionCodes([...tags])
      .map(code => {
        const label = calendarCompetitionLabel(code);
        return `<span class="calendar-comp-tag" data-code="${code}" data-tip="${escapeAgenda(label)}" aria-label="${escapeAgenda(label)}">${code}</span>`;
      })
      .join('')}</span>`;
  };

  const renderCalendar = () => {
    const userClub = getUserClub();
    const currentRound = getCurrentRound();
    const careerSeason = getCareerSeason();
    const careerCalendarDate = getCareerCalendarDate();
    const championshipFixtures = getChampionshipFixtures();
    const calendarGames = getCalendarGames();
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const gridStart = new Date(year, month, 1 - firstDay.getDay());
    const trainingMap = calendarTrainingMap();
    const transferMetaByKey = new Map();
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      date.setHours(12, 0, 0, 0);
      const key = calendarKey(date);
      const outside = date.getMonth() !== month || date.getFullYear() !== careerSeason;
      if (!outside && isDateInTransferWindow(date)) {
        transferMetaByKey.set(key, getTransferWindowPhase(date));
      }
    }
    const roundNumber = Math.min(Math.max(currentRound, 1), Math.max(championshipFixtures.length, 1));
    const roundGames = championshipFixtures[roundNumber - 1] || [];
    const anchorGame = roundGames.find(isUserFixture) || roundGames[0];
    const currentRoundKey = calendarKey(
      anchorGame ? fixtureDetails(anchorGame).date : fixtureDate(roundNumber),
    );
    const careerDayKey = calendarKey(careerCalendarDate);
    const { start: planWeekStart, end: planWeekEnd } = weekBounds(careerCalendarDate);
    $('#calendarMonthLabel').textContent = calendarCursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    $$('#calendarYearMonths button').forEach(button =>
      button.classList.toggle('active', Number(button.dataset.calendarMonth) === month && year === careerSeason)
    );
    $('#calendarDays').innerHTML = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      date.setHours(12, 0, 0, 0);
      const key = calendarKey(date);
      const games = calendarGames.get(key) || [];
      const userGame = games.find(isUserFixture);
      const pendingUserGame = userGame && !isFixtureCompleted(userGame);
      const atHome = userGame?.home === userClub;
      const activities = trainingMap.get(key) || [];
      const selected = key === calendarKey(selectedCalendarDate);
      const outside = date.getMonth() !== month || date.getFullYear() !== careerSeason;
      const userCompleted = userGame && isFixtureCompleted(userGame);
      const userScore = userCompleted ? fixtureResultLabel(userGame) : '';
      const inPlanningWeek = date >= planWeekStart && date <= planWeekEnd;
      const transferPhase = !outside ? transferMetaByKey.get(key) || null : null;
      const inTransferWindow = !!transferPhase;
      const isUserCup = userGame?.competition === 'COPA DO BRASIL';
      const eventText = userGame
        ? isUserCup
          ? userScore || ''
          : `${atHome ? 'CASA' : 'FORA'} · R${userGame.round}${userScore ? ` · ${userScore}` : ''}`
        : '';
      const transferChip = inTransferWindow
        ? `<span class="transfer-window-event ${transferPhase?.isDeadlineWeek ? 'is-deadline' : ''}">${transferPhase?.isDeadlineDay ? 'DEADLINE' : transferPhase?.isDeadlineWeek ? 'JANELA · DIA' : 'JANELA'}</span>`
        : '';
      const compTags = calendarCompetitionTagMarkup(key);
      const userEventClass = userGame && !isUserCup ? (atHome ? 'user-match' : 'user-match user-match-away') : userScore ? 'completed-score' : '';
      return `<button type="button" class="calendar-day ${outside ? 'outside' : ''} ${selected ? 'selected' : ''} ${inPlanningWeek ? 'planning-week' : ''} ${inTransferWindow ? 'transfer-window' : ''} ${transferPhase?.isDeadlineWeek ? 'transfer-deadline' : ''} ${transferPhase?.isDeadlineDay ? 'transfer-deadline-day' : ''} ${key === careerDayKey ? 'career-today' : ''} ${pendingUserGame && key === careerDayKey ? 'matchday-stop' : ''} ${userGame ? (atHome ? 'user-home' : 'user-away') : ''} ${userCompleted ? 'completed-user' : ''} ${key === currentRoundKey ? 'current-round' : ''}" data-calendar-date="${key}" aria-pressed="${selected}"><time datetime="${key}">${date.getDate()}</time><span class="calendar-day-events">${compTags}${eventText ? `<span class="${userEventClass}">${eventText}</span>` : ''}${transferChip}${activities.map(activity => `<span class="training-event">◆ ${activity.label}</span>`).join('')}</span></button>`;
    }).join('');
    renderTrainingRules();
    renderCalendarRoutine();
    renderCalendarAgenda(trainingMap);
  };

  const openDashboardCalendarView = () => {
    const careerCalendarDate = getCareerCalendarDate();
    const careerSeason = getCareerSeason();
    selectedCalendarDate = new Date(careerCalendarDate);
    calendarCursor = new Date(careerSeason, careerCalendarDate.getMonth(), 1);
    openView('calendar');
    renderCalendar();
  };

  const onCupScheduleChanged = () => {
    rebuildCalendarGames();
    syncCalendarSubtitle();
    renderCalendar();
    if (getChampionshipDivision() === 'CUP') openChampionship('CUP');
  };

  const moveCalendarMonth = direction => {
    const careerSeason = getCareerSeason();
    const nextMonth = calendarCursor.getMonth() + direction;
    calendarCursor = new Date(careerSeason, Math.max(0, Math.min(11, nextMonth)), 1);
    selectedCalendarDate = new Date(calendarCursor);
    renderCalendar();
  };

  const injectDom = () => {
    const careerSeason = getCareerSeason();
    const userDivision = getUserDivision();
    const championshipFixtures = getChampionshipFixtures();
    const copaDoBrasilFixtures = getCopaFixtures();
    const restConflictCount = getRestConflictCount();

    $('#calendar .title p').textContent = `TEMPORADA ${careerSeason} · BRASILEIRÃO SÉRIE ${userDivision} + COPA DO BRASIL`;
    syncCalendarSubtitle();
    $('.calendar-toolbar').insertAdjacentHTML(
      'afterend',
      `<div id="calendarYearMonths" class="calendar-year-months">${Array.from({ length: 12 }, (_, month) => `<button type="button" data-calendar-month="${month}">${new Date(careerSeason, month, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()}</button>`).join('')}</div>`
    );
    $('.calendar-legend').insertAdjacentHTML(
      'beforeend',
      '<span><i class="comp-bsa"></i>BSA · SÉRIE A</span><span><i class="comp-bsb"></i>BSB · SÉRIE B</span><span><i class="comp-bsc"></i>BSC · SÉRIE C</span><span><i class="comp-bsd"></i>BSD · SÉRIE D</span><span><i class="cup"></i>CBR · COPA</span><span><i class="transfer-window"></i>JANELA</span><span><i class="transfer-deadline"></i>DEADLINE</span>',
    );
    $('.calendar-sidebar').insertAdjacentHTML(
      'beforeend',
      `<article class="card calendar-routine-card"><label>ROTINA DA SEMANA</label><div id="calendarRoutineSummary" class="calendar-routine-summary"></div></article><article class="card cup-calendar-card"><label>COPA DO BRASIL ${careerSeason}</label><strong>126 CLUBES · 9 FASES</strong><p>1ª à 4ª fase em jogo único. Da 5ª fase à semifinal em ida e volta. Os 20 clubes da Série A entram na 5ª fase.</p><div><span>INÍCIO<b>18 FEV</b></span><span>FINAL ÚNICA<b>06 DEZ</b></span></div></article>`
    );

    document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="calendarMatchReportModal" class="modal hidden"><div class="modal-card match-report-modal"><button id="closeCalendarMatchReport" class="close">×</button><div id="matchReportContent"></div></div></div>`
    );
  };

  const bindHandlers = () => {
    onClick('#calendarDays', event => {
      const day = event.target.closest('[data-calendar-date]');
      if (!day) return;
      selectedCalendarDate = calendarDate(day.dataset.calendarDate);
      calendarCursor = new Date(selectedCalendarDate.getFullYear(), selectedCalendarDate.getMonth(), 1);
      renderCalendar();
    });
    onClick('#calendarDayAgenda', event => {
      const button = event.target.closest('[data-match-report]');
      if (!button) return;
      const report = calendarReportGames.get(button.dataset.matchReport);
      if (report) openCalendarMatchReport(report);
    });
    onClick('#closeCalendarMatchReport', () => $('#calendarMatchReportModal').classList.add('hidden'));
    onClick('#calendarYearMonths', event => {
      const button = event.target.closest('[data-calendar-month]');
      if (!button) return;
      const careerSeason = getCareerSeason();
      calendarCursor = new Date(careerSeason, Number(button.dataset.calendarMonth), 1);
      selectedCalendarDate = new Date(calendarCursor);
      renderCalendar();
    });
    onClick('#calendarPrevious', () => moveCalendarMonth(-1));
    onClick('#calendarNext', () => moveCalendarMonth(1));
    onClick('#calendarCurrent', () => {
      const entry = nextPendingUserEntry();
      const date = entry ? entry.details.date : getCareerCalendarDate();
      const careerSeason = getCareerSeason();
      selectedCalendarDate = new Date(date);
      calendarCursor = new Date(careerSeason, selectedCalendarDate.getMonth(), 1);
      renderCalendar();
    });
    onClick('#trainingRules', event => {
      const button = event.target.closest('[data-training-option]');
      if (!button) return;
      const type = button.dataset.trainingRule;
      const value = button.dataset.trainingOption;
      if (!type || !value || !trainingOptions[type]?.includes(value)) return;
      if (getTrainingRules()[type] === value) return;
      setTrainingRule(type, value);
      writeJson(SAVE_KEYS.training, getTrainingRules());
      if (getHasCareer()) persistSeason();
      renderCalendar();
    });
    onClick('#openTrainingFromCalendar', () => openView('training'));
    onClick('#openCalendarFromTraining', () => openView('calendar'));
  };

  const init = initialDate => {
    const careerSeason = getCareerSeason();
    calendarCursor = new Date(careerSeason, initialDate.getMonth(), 1);
    selectedCalendarDate = new Date(initialDate.getFullYear(), initialDate.getMonth(), initialDate.getDate());
    injectDom();
    bindHandlers();
    renderCalendar();
  };

  return {
    moduleVersion: MODULE_VERSIONS.calendar,
    init,
    setPersist,
    renderCalendar,
    renderTrainingRules,
    openCalendarMatchReport,
    calendarGameResult,
    openDashboardCalendarView,
    onCupScheduleChanged,
    syncCalendarSubtitle,
    getCalendarCursor,
    getSelectedCalendarDate,
    setSelectedCalendarDate,
    calendarKey,
    calendarDate,
  };
}
