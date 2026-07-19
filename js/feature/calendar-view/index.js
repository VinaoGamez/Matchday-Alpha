import { MODULE_VERSIONS, SAVE_KEYS } from '../../core/constants.js';
import { clamp } from '../../ui/dom.js';
import { isKnockoutShootoutCompetition } from '../../engine/knockout-shootout.js';
import { competitionBadgeMarkup, resolveCompetitionBadge } from '../../ui/competition-badge.js';

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
  } = deps;

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

  const reportPercent = (accurate, passes) => (passes ? `${Math.round((accurate / passes) * 100)}%` : '0%');

  const openCalendarMatchReport = entry => {
    const userDivision = getUserDivision();
    const { game, result, data, goals } = entry;
    const isCup = game.competition === 'COPA DO BRASIL';
    const competition = resolveCompetitionBadge(game, { userDivision });
    $('#matchReportTitle').textContent = 'Estatísticas finais';
    $('#matchReportMeta').textContent = isCup
      ? `${game.phase || 'Copa'} · ${game.leg || ''}`.replace(/\s·\s$/, '')
      : isKnockoutShootoutCompetition(game)
        ? `${game.leg || 'Eliminatórias'}`
        : `Rodada ${game.round}`;
    const scorerList = (side, score) => {
      const entries = goals?.[side] || [];
      if (entries.length) {
        return entries
          .map(
            goal =>
              `<span>${goal.minute != null ? `${goal.stoppage ? `${goal.minute <= 45 ? 45 : 90}+${goal.stoppage}` : goal.minute}' · ` : ''}${goal.name}${goal.type === 'own' ? ' (gol contra)' : goal.type === 'penalty' ? ' (pênalti)' : goal.type === 'freeKick' ? ' (falta)' : goal.type === 'corner' ? ' (cabeça)' : ''}</span>`
          )
          .join('');
      }
      return Number(score) === 0 ? '<span>Nenhum gol</span>' : '<span>Autores não registrados</span>';
    };
    const score = `${result.homeGoals} — ${result.awayGoals}${result.penalties ? ` <small>(${result.penalties} pên.)</small>` : ''}`;
    const competitionHtml = `<div class="live-match-competition-wrap">${competitionBadgeMarkup({
      id: 'matchReportCompetition',
      nameId: 'matchReportCompetitionName',
      name: competition.name,
      kind: competition.kind,
    })}</div>`;
    const header = `${competitionHtml}<div class="match-report-score"><span>${game.home}</span><strong>${score}</strong><span>${game.away}</span></div><div class="match-report-goals"><article><b>${game.home.toUpperCase()}</b>${scorerList('home', result.homeGoals)}</article><article><b>${game.away.toUpperCase()}</b>${scorerList('away', result.awayGoals)}</article></div>`;
    if (!data) {
      $('#matchReportContent').innerHTML =
        header + '<div class="match-report-empty">O placar está preservado, mas esta partida foi simulada antes do armazenamento das estatísticas detalhadas.</div>';
      $('#calendarMatchReportModal').classList.remove('hidden');
      return;
    }
    const v = key => Number(data[key] ?? 0);
    const rows = [
      ['Posse de bola', `${v('homePossession')}%`, `${v('awayPossession')}%`],
      ['Total de Passes', v('homePasses'), v('awayPasses')],
      ['% passes certos', reportPercent(v('homeAccurate'), v('homePasses')), reportPercent(v('awayAccurate'), v('awayPasses'))],
      ['Passes errados', v('homePasses') - v('homeAccurate'), v('awayPasses') - v('awayAccurate')],
      ['Finalizações', v('homeShots'), v('awayShots')],
      ['Para Fora', v('homeOff') || Math.max(0, v('homeShots') - v('homeOnTarget')), v('awayOff') || Math.max(0, v('awayShots') - v('awayOnTarget'))],
      ['No Gol', v('homeOnTarget'), v('awayOnTarget')],
      ['Defendidas', v('homeSaved'), v('awaySaved')],
      ['Pênaltis', v('homePenalties'), v('awayPenalties')],
      ['Escanteios', v('homeCorners'), v('awayCorners')],
      ['Impedimentos', v('homeOffsides'), v('awayOffsides')],
      ['Defesas do Goleiro', v('homeKeeperSaves'), v('awayKeeperSaves')],
      ['Desarmes', v('homeTackles'), v('awayTackles')],
      ['Faltas Cometidas', v('homeFouls'), v('awayFouls')],
      ['Cartões Amarelos', v('homeYellow'), v('awayYellow')],
      ['Cartões Vermelhos', v('homeRed'), v('awayRed')],
    ];
    $('#matchReportContent').innerHTML =
      header +
      `<div class="match-report-stats"><h3>ESTATÍSTICAS DA PARTIDA</h3>${rows.map(row => `<div class="match-report-stat"><span>${row[1]}</span><span>${row[0]}</span><span>${row[2]}</span></div>`).join('')}</div>`;
    $('#calendarMatchReportModal').classList.remove('hidden');
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
      advanceBtn.disabled = blocked;
      advanceBtn.title = onMatchDay
        ? 'Dispute a partida antes de avançar a semana'
        : seasonDone
          ? 'Temporada encerrada'
          : isUserSeasonIdle()
            ? 'Sem jogos do clube nesta fase'
            : 'Simula até 7 dias de treino; para no dia de jogo do clube';
    }
  };

  const renderCalendarAgenda = () => {
    const userClub = getUserClub();
    const trainingRules = getTrainingRules();
    const calendarGames = getCalendarGames();
    const key = calendarKey(selectedCalendarDate);
    const games = [...(calendarGames.get(key) || [])].sort((a, b) => Number(isUserFixture(b)) - Number(isUserFixture(a)));
    const activities = calendarTrainingMap().get(key) || [];
    const dateLabel = selectedCalendarDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    calendarReportGames.clear();
    $('#calendarSelectedDay').textContent = dateLabel;
    const cupGames = games.filter(game => game.competition === 'COPA DO BRASIL');
    $('#calendarSelectedMeta').textContent = games.length
      ? `${games.length} ${games.length === 1 ? 'jogo programado' : 'jogos programados'}${cupGames.length ? ` · ${cupGames[0].phase}` : ''}`
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
    const freeRow =
      !games.length && !activities.length
        ? `<div class="agenda-item free"><i>—</i><div><small>DIA SEM PARTIDA</small><strong>${trainingRules.free}</strong></div></div>`
        : '';
    $('#calendarDayAgenda').innerHTML = gameRows + trainingRows + freeRow;
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
    const currentRoundKey = calendarKey(fixtureDate(Math.min(Math.max(currentRound, 1), Math.max(championshipFixtures.length, 1))));
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
      const cupGame = games.find(game => game.competition === 'COPA DO BRASIL');
      const activities = trainingMap.get(key) || [];
      const selected = key === calendarKey(selectedCalendarDate);
      const outside = date.getMonth() !== month || date.getFullYear() !== careerSeason;
      const userCompleted = userGame && isFixtureCompleted(userGame);
      const userScore = userCompleted ? fixtureResultLabel(userGame) : '';
      const inPlanningWeek = date >= planWeekStart && date <= planWeekEnd;
      const eventText = userGame
        ? (userGame.competition === 'COPA DO BRASIL' ? `COPA · ${userGame.phase}` : `${atHome ? 'CASA' : 'FORA'} · R${userGame.round}`) +
          (userScore ? ` · ${userScore}` : '')
        : cupGame
          ? `COPA · ${cupGame.phase}`
          : games.length
            ? `${games.length} JOGOS · R${games[0].round}`
            : '';
      return `<button type="button" class="calendar-day ${outside ? 'outside' : ''} ${selected ? 'selected' : ''} ${inPlanningWeek ? 'planning-week' : ''} ${key === careerDayKey ? 'career-today' : ''} ${pendingUserGame && key === careerDayKey ? 'matchday-stop' : ''} ${userGame ? (atHome ? 'user-home' : 'user-away') : ''} ${userCompleted ? 'completed-user' : ''} ${key === currentRoundKey ? 'current-round' : ''}" data-calendar-date="${key}" aria-pressed="${selected}"><time datetime="${key}">${date.getDate()}</time><span class="calendar-day-events">${eventText ? `<span class="${cupGame ? 'cup-match' : userGame ? 'user-match' : ''} ${userScore ? 'completed-score' : ''}">${eventText}</span>` : ''}${activities.map(activity => `<span class="training-event">◆ ${activity.label}</span>`).join('')}</span></button>`;
    }).join('');
    renderTrainingRules();
    renderCalendarRoutine();
    renderCalendarAgenda();
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
    $('.calendar-legend').insertAdjacentHTML('beforeend', '<span><i class="cup"></i>COPA DO BRASIL</span>');
    $('.calendar-sidebar').insertAdjacentHTML(
      'beforeend',
      `<article class="card calendar-routine-card"><label>ROTINA DA SEMANA</label><div id="calendarRoutineSummary" class="calendar-routine-summary"></div></article><article class="card cup-calendar-card"><label>COPA DO BRASIL ${careerSeason}</label><strong>126 CLUBES · 9 FASES</strong><p>1ª à 4ª fase em jogo único. Da 5ª fase à semifinal em ida e volta. Os 20 clubes da Série A entram na 5ª fase.</p><div><span>INÍCIO<b>18 FEV</b></span><span>FINAL ÚNICA<b>06 DEZ</b></span></div></article>`
    );

    document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="calendarMatchReportModal" class="modal hidden"><div class="modal-card match-report-modal"><button id="closeCalendarMatchReport" class="close">×</button><label>RELATÓRIO DA PARTIDA</label><h2 id="matchReportTitle">Estatísticas finais</h2><p id="matchReportMeta"></p><div id="matchReportContent"></div></div></div>`
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
