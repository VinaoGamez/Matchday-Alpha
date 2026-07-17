import { MODULE_VERSIONS } from '../../core/constants.js';
import { formatKnockoutFixtureScore, isKnockoutShootoutCompetition as isKnockoutGame } from '../../engine/knockout-shootout.js';

const DASHBOARD_TABLE_ROWS = 5;

/**
 * Dashboard — próximo jogo, mini-tabela, líderes e resultados recentes.
 */
export function createDashboardFeature(deps) {
  const {
    $,
    $$,
    onClick,
    getUserClub,
    getUserDivision,
    getCurrentRound,
    getCareerSeason,
    getCareerCalendarDate,
    getClubs,
    getDisplayedLeagueRows,
    getFutureMatches,
    isUserFixture,
    isFixtureCompleted,
    seasonComplete,
    isUserSeasonIdle,
    nextPendingUserEntry,
    pendingUserSchedule,
    fixtureDetails,
    fixtureCompetitionLabel,
    displayedClubPosition,
    sameCalendarDay,
    daysUntilNextFixtureFromToday,
    restDaysUntilNextFixture,
    leagueUserGameForRound,
    isKnockoutShootoutCompetition,
    knockoutCompetitionLabel,
    leadersFor,
    getSeasonRoundHistory,
    getCopaFixtures,
    getNationalCompetitions,
    openCalendarMatchReport,
    calendarGameResult,
    isCompletedDashboardGame,
  } = deps;

  let leaderMode = 'scorers';
  let persistSeason = () => {};
  const dashboardReportGames = new Map();

  const setPersist = fn => {
    persistSeason = typeof fn === 'function' ? fn : () => {};
  };

  const formatDashboardDate = date =>
    date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '').toUpperCase();

  const setNextMatchMeta = (lines = []) => {
    const el = $('#nextMatchMeta');
    if (!el) return;
    const classes = ['match-meta-today', 'match-meta-next', 'match-meta-extra'];
    el.innerHTML = lines
      .filter(Boolean)
      .map((line, index) => `<span class="match-meta-line ${classes[index] || 'match-meta-extra'}">${line}</span>`)
      .join('');
  };

  const dashboardUpcomingGames = () => {
    const futureMatches = getFutureMatches();
    const roundGames = (futureMatches || []).filter(game => !isFixtureCompleted(game));
    const userClub = getUserClub();
    const userGame = roundGames.find(isUserFixture);
    const picked = roundGames.slice(0, DASHBOARD_TABLE_ROWS);
    if (userGame && !picked.some(game => game.home === userGame.home && game.away === userGame.away)) {
      return [...picked.slice(0, DASHBOARD_TABLE_ROWS - 1), userGame];
    }
    return picked;
  };

  const renderDashboardMiniTable = () => {
    const userClub = getUserClub();
    const userDivision = getUserDivision();
    const clubs = getClubs();
    $('#miniTable').innerHTML = getDisplayedLeagueRows()
      .slice(0, DASHBOARD_TABLE_ROWS)
      .map(
        (row, index) =>
          `<div class="standing-row ${row.club === userClub ? 'highlight' : ''}" data-club="${row.club}" role="button" tabindex="0"><span>${userDivision === 'D' ? index + 1 : clubs[row.club].position}</span><span class="club-link">${row.club}</span><span>${row.played}</span><span>${row.goalDiff >= 0 ? '+' : ''}${row.goalDiff}</span><span>${row.points}</span></div>`
      )
      .join('');
  };

  const renderDashboardUpcoming = () => {
    $('#upcomingMatches').innerHTML = dashboardUpcomingGames()
      .map(game => {
        const isUser = isUserFixture(game);
        return `<div class="dashboard-fixture-row ${isUser ? 'user-game' : ''}"><span><b class="club-link" data-club="${game.home}" role="button" tabindex="0">${game.home}</b>${isUser ? '<small class="user-game-tag">SEU JOGO</small>' : ''}</span><span>×</span><span class="club-link" data-club="${game.away}" role="button" tabindex="0">${game.away}</span></div>`;
      })
      .join('');
  };

  const refreshUserFixtures = () => {
    pendingUserSchedule().slice(0, 3).map(entry => entry.game);
  };

  const renderUserMatchPresentation = () => {
    refreshUserFixtures();
    const userClub = getUserClub();
    const userDivision = getUserDivision();
    const currentRound = getCurrentRound();
    const careerSeason = getCareerSeason();
    const careerCalendarDate = getCareerCalendarDate();
    const clubs = getClubs();
    const display = nextPendingUserEntry();
    const idle = isUserSeasonIdle();
    const playBtn = $('#playMatch');
    const simBtn = $('#simulateRemainder');
    const inspectBtn = $('#inspectOpponent');
    const calendarBtn = $('#openDashboardCalendar');

    if (playBtn) playBtn.classList.toggle('hidden', idle || seasonComplete());
    if (simBtn) simBtn.classList.toggle('hidden', !idle);
    if (inspectBtn) inspectBtn.classList.toggle('hidden', idle || seasonComplete() || !display);
    if (calendarBtn) calendarBtn.classList.toggle('hidden', idle || seasonComplete());
    if (playBtn && (idle || seasonComplete())) {
      playBtn.disabled = false;
      playBtn.title = '';
    }

    const userUpcomingGames = pendingUserSchedule().slice(0, 3).map(entry => entry.game);

    if (idle) {
      $('#nextMatchRound').textContent = `SEM JOGOS · SÉRIE ${userDivision} · RODADA NACIONAL ${currentRound}`;
      $('#nextMatchHome').textContent = userClub;
      $('#nextMatchAway').textContent = 'Calendário nacional';
      $('#nextMatchHomePosition').textContent = `${displayedClubPosition(userClub)}º na série`;
      $('#nextMatchAwayPosition').textContent = 'Aguardando fechamento';
      $('#nextMatchHome').previousElementSibling.textContent = userClub
        .split(' ')
        .map(part => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      $('#nextMatchAwayCrest').textContent = 'NF';
      setNextMatchMeta(['Sem partidas pendentes', 'Simule o restante da temporada']);
    } else if (seasonComplete()) {
      $('#nextMatchRound').textContent = `TEMPORADA ${careerSeason} ENCERRADA`;
      $('#nextMatchHome').textContent = userClub;
      $('#nextMatchAway').textContent = 'Próxima temporada';
      $('#nextMatchHomePosition').textContent = `Série ${userDivision}`;
      $('#nextMatchAwayPosition').textContent = 'Transição';
      $('#nextMatchHome').previousElementSibling.textContent = userClub
        .split(' ')
        .map(part => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      $('#nextMatchAwayCrest').textContent = '→';
      setNextMatchMeta(['Temporada encerrada', 'Confira acessos e rebaixamentos', 'Inicie a próxima temporada']);
    } else if (display) {
      const { game, details } = display;
      const atHome = game.home === userClub;
      const isCup = game.competition === 'COPA DO BRASIL';
      const homeClub = clubs[game.home];
      const awayClub = clubs[game.away];
      const daysUntil = daysUntilNextFixtureFromToday();
      const restDays = restDaysUntilNextFixture();
      const leagueNext = leagueUserGameForRound(currentRound);
      const onMatchDay = sameCalendarDay(details.date, careerCalendarDate);
      const todayLabel = `HOJE · ${formatDashboardDate(careerCalendarDate)}`;

      if (playBtn) {
        playBtn.disabled = !onMatchDay;
        playBtn.title = onMatchDay ? 'Disputar a partida agendada para hoje' : 'Avance até o dia do jogo para disputar a partida';
      }
      if (calendarBtn) {
        calendarBtn.disabled = onMatchDay;
        calendarBtn.title = onMatchDay ? 'Você já está no dia do jogo' : `Simular treinos e avançar até ${details.display}`;
      }

      $('#nextMatchRound').textContent = isCup
        ? `COPA DO BRASIL · ${game.phase} · ${game.leg}`
        : isKnockoutShootoutCompetition(game)
          ? `${knockoutCompetitionLabel(game)} · ${game.leg}`
          : `RODADA ${game.round} · SÉRIE ${userDivision}${userDivision === 'D' && !isKnockoutShootoutCompetition(game) ? ` · GRUPO A${deps.getUserSerieDGroupIndex() + 1}` : ''}`;
      $('#nextMatchHome').textContent = game.home;
      $('#nextMatchAway').textContent = game.away;
      $('#nextMatchHomePosition').textContent = `${displayedClubPosition(homeClub.name)}º colocado`;
      $('#nextMatchAwayPosition').textContent = `${displayedClubPosition(awayClub.name)}º colocado`;
      $('#nextMatchHome').previousElementSibling.textContent = game.home
        .split(' ')
        .map(part => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      $('#nextMatchAwayCrest').textContent = game.away
        .split(' ')
        .map(part => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      setNextMatchMeta(
        onMatchDay
          ? [
              todayLabel,
              `${atHome ? 'EM CASA' : 'FORA'} · ${details.display} · ${details.time}`,
              `${restDays > 1 ? `${restDays} dias de intervalo` : ''}${isCup && leagueNext ? `${restDays > 1 ? ' · ' : ''}Brasileirão: R${leagueNext.round}` : ''}`.trim() || 'Dispute a partida hoje',
            ]
          : [
              `Calendário · ${formatDashboardDate(careerCalendarDate)}`,
              `Próximo jogo · ${details.display} · ${details.time}`,
              daysUntil > 0 ? `Use Dia de Jogo para avançar (${daysUntil} ${daysUntil === 1 ? 'dia' : 'dias'})` : 'Use Dia de Jogo para avançar',
            ]
      );
    }

    $('#clubUpcomingMatches').innerHTML = userUpcomingGames.length
      ? userUpcomingGames
          .map(game => {
            const atHome = game.home === userClub;
            const details = fixtureDetails(game);
            const isCup = game.competition === 'COPA DO BRASIL';
            const isKo = isKnockoutShootoutCompetition(game);
            const label = fixtureCompetitionLabel(game);
            return `<div class="club-upcoming-row ${isCup || isKo ? 'cup-row' : ''}"><span>${label}</span><span><b class="club-link" data-club="${game.home}" role="button" tabindex="0">${game.home}</b> <i>×</i> <b class="club-link" data-club="${game.away}" role="button" tabindex="0">${game.away}</b></span><span>${details.display} · ${details.time}</span><span class="${atHome ? 'home' : 'away'}">${atHome ? 'CASA' : 'FORA'}</span></div>`;
          })
          .join('')
      : `<div class="club-upcoming-row idle-row"><span>—</span><span><b>${idle ? 'Nenhum jogo restante do clube' : seasonComplete() ? 'Temporada encerrada' : 'Agenda em atualização'}</b></span><span>${idle ? `Nacional na rodada ${currentRound}` : '—'}</span><span class="away">—</span></div>`;
  };

  const renderLeaders = () => {
    const userDivision = getUserDivision();
    const entries = leadersFor(userDivision, leaderMode);
    const metric = leaderMode === 'scorers' ? 'goals' : 'assists';
    $('#leaderColumnName').textContent = 'JOGADOR';
    $('#leaderValueName').textContent = leaderMode === 'scorers' ? 'GOLS' : 'AST';
    $('#leadersTable').innerHTML = entries
      .slice(0, 3)
      .map(
        (entry, index) =>
          `<div class="leader-row"><span>${index + 1}</span><span><b>${entry.name}</b><small class="club-link" data-club="${entry.club}" role="button" tabindex="0">${entry.club}</small></span><span>${entry[metric]}</span></div>`
      )
      .join('');
    $$('[data-leader-tab]').forEach(button => button.classList.toggle('active', button.dataset.leaderTab === leaderMode));
  };

  const userMatchResultLetter = game => {
    const userClub = getUserClub();
    if (game.shootoutWinner) return game.shootoutWinner === userClub ? 'V' : 'D';
    const atHome = game.home === userClub;
    const own = Number(atHome ? game.homeGoals : game.awayGoals);
    const opponent = Number(atHome ? game.awayGoals : game.homeGoals);
    return own > opponent ? 'V' : own < opponent ? 'D' : 'E';
  };

  const userCompletedMatchResults = () => {
    const userClub = getUserClub();
    const seasonRoundHistory = getSeasonRoundHistory();
    const copaDoBrasilFixtures = getCopaFixtures();
    const nationalCompetitions = getNationalCompetitions();
    const entries = [];
    const seen = new Set();
    const register = (game, meta) => {
      if (!game || !(game.home === userClub || game.away === userClub)) return;
      const scored = game.completed || game.homeGoals != null || game.awayGoals != null;
      if (!scored) return;
      const key = `${game.home}|${game.away}|${game.round || ''}|${game.leg || ''}|${game.phase || ''}|${meta.competition}`;
      if (seen.has(key)) return;
      seen.add(key);
      const result = userMatchResultLetter(game);
      entries.push({ ...game, result, points: result === 'V' ? 3 : result === 'E' ? 1 : 0, ...meta });
    };
    seasonRoundHistory.forEach(round =>
      (round.games || []).forEach(game => register(game, { competition: 'league', label: `Rodada ${round.round}`, sortDate: deps.fixtureDate(round.round) }))
    );
    copaDoBrasilFixtures.filter(game => game.completed).forEach(game =>
      register(game, { competition: 'cup', label: `Copa · ${game.phase}${game.leg ? ` · ${game.leg}` : ''}`, sortDate: new Date(game.date) })
    );
    nationalCompetitions.D.fixtures
      .filter(Array.isArray)
      .flat()
      .filter(game => game.completed && isKnockoutShootoutCompetition(game))
      .forEach(game =>
        register(game, { competition: 'knockout', label: `Série D · ${game.leg || 'Eliminatórias'}`, sortDate: deps.fixtureDate(game.round) })
      );
    return entries.sort((a, b) => a.sortDate - b.sortDate);
  };

  const dashboardCompletedGames = () => {
    const seasonRoundHistory = getSeasonRoundHistory();
    const copaDoBrasilFixtures = getCopaFixtures();
    const nationalCompetitions = getNationalCompetitions();
    const entries = [];
    const seen = new Set();
    const register = (game, meta) => {
      if (!isCompletedDashboardGame(game)) return;
      const key = `${game.home}|${game.away}|${game.round || ''}|${game.leg || ''}|${game.phase || ''}|${meta.competition}`;
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ ...game, ...meta });
    };
    seasonRoundHistory.forEach(round =>
      (round.games || []).forEach(game =>
        register(game, { competition: 'league', round: round.round, label: `Rodada ${round.round}`, sortDate: deps.fixtureDate(round.round) })
      )
    );
    copaDoBrasilFixtures.forEach(game =>
      register(game, { competition: 'cup', label: `Copa · ${game.phase}${game.leg ? ` · ${game.leg}` : ''}`, sortDate: fixtureDetails(game).date })
    );
    nationalCompetitions.D.fixtures
      .filter(Array.isArray)
      .flat()
      .filter(game => isKnockoutShootoutCompetition(game))
      .forEach(game =>
        register(game, { competition: 'knockout', label: `Série D · ${game.leg || 'Eliminatórias'}`, sortDate: deps.fixtureDate(game.round) })
      );
    return entries.sort((a, b) => a.sortDate - b.sortDate);
  };

  const dashboardRecentLabel = game => {
    if (!game) return '—';
    if (game.competition === 'cup') return `COPA · ${game.phase || 'DO BRASIL'}${game.leg ? ` · ${game.leg}` : ''}`;
    if (game.competition === 'knockout') return `SÉRIE D · ${game.leg || 'ELIMINATÓRIAS'}`;
    return `RODADA ${game.round || '—'}`;
  };

  const dashboardRecentGames = () => {
    const completed = dashboardCompletedGames();
    if (!completed.length) return { label: '—', games: [] };
    const userGame = completed.filter(isUserFixture).at(-1);
    const recent = completed.slice(-4);
    const picked =
      userGame && !recent.some(game => game.home === userGame.home && game.away === userGame.away && game.competition === userGame.competition)
        ? [...recent.slice(-3), userGame].sort((a, b) => a.sortDate - b.sortDate)
        : recent;
    return { label: dashboardRecentLabel(picked.at(-1)), games: picked };
  };

  const dashboardGameReport = game => {
    if (!isCompletedDashboardGame(game)) return null;
    if (game.competition === 'COPA DO BRASIL' || game.competition === 'cup') {
      return { game, result: game, data: game.data || null, goals: game.goals || null };
    }
    if (isKnockoutShootoutCompetition(game) || game.competition === 'knockout') {
      return { game, result: game, data: game.data || null, goals: game.goals || null };
    }
    if (game.data) return { game, result: game, data: game.data, goals: game.goals || null };
    const fromCalendar = calendarGameResult(game);
    if (fromCalendar) return fromCalendar;
    return { game, result: game, data: null, goals: game.goals || null };
  };

  const dashboardScoreLabel = game => {
    if (game.competition === 'cup' || game.competition === 'COPA DO BRASIL' || game.competition === 'knockout' || isKnockoutGame(game)) {
      return formatKnockoutFixtureScore(game);
    }
    return `${game.homeGoals} — ${game.awayGoals}`;
  };

  const renderRecentGamesDashboard = () => {
    const panel = $('#recentMatches');
    const roundLabel = $('#recentMatchesRound');
    if (!panel) return;
    dashboardReportGames.clear();
    const { label, games } = dashboardRecentGames();
    if (roundLabel) roundLabel.textContent = label;
    if (!games.length) {
      panel.innerHTML = '<div class="dashboard-results-empty">Nenhum jogo concluído.</div>';
      return;
    }
    panel.innerHTML = games
      .map((game, index) => {
        const isUser = isUserFixture(game);
        const score = dashboardScoreLabel(game);
        const report = dashboardGameReport(game);
        const reportKey = `recent-${index}`;
        if (report) dashboardReportGames.set(reportKey, report);
        return `<div class="round-game-row ${isUser ? 'user-game' : ''} ${report ? 'has-report' : ''}"><span><b class="club-link" data-club="${game.home}" role="button" tabindex="0">${game.home}</b>${isUser ? '<small class="user-game-tag">SEU JOGO</small>' : ''}</span><strong>${score}</strong><span><b class="club-link" data-club="${game.away}" role="button" tabindex="0">${game.away}</b></span><button type="button" class="dashboard-match-report" data-match-report="${reportKey}" title="Ver estatísticas finais" aria-label="Ver estatísticas de ${game.home} contra ${game.away}">▤</button></div>`;
      })
      .join('');
  };

  const renderRecentResults = () => {
    const completed = userCompletedMatchResults().slice(-5);
    const form = $('.results-card .form');
    const summary = $('.results-card>small');
    if (!completed.length) {
      form.innerHTML = '<span class="form-empty">Nenhum jogo concluído.</span>';
      summary.textContent = 'A temporada ainda não possui resultados.';
      renderRecentGamesDashboard();
      return;
    }
    form.innerHTML = completed
      .map(game => {
        const score = dashboardScoreLabel(game);
        return `<b class="${game.result === 'V' ? 'win' : game.result === 'E' ? 'draw' : 'loss'}" title="${game.label}: ${game.home} ${score} ${game.away}">${game.result}</b>`;
      })
      .join('');
    const points = completed.reduce((total, game) => total + game.points, 0);
    const games = completed.length;
    summary.textContent =
      games === 1 ? `${points} ${points === 1 ? 'ponto' : 'pontos'} no último jogo` : `${points} pontos nos últimos ${games} jogos`;
    renderRecentGamesDashboard();
  };

  const injectStyles = () => {
    const recentResultsCss = document.createElement('style');
    recentResultsCss.textContent =
      '.results-card .form b.win{background:#b6ff38!important;color:#07131a!important}.results-card .form b.draw{background:#63d9ff!important;color:#07131a!important}.results-card .form b.loss{background:#8d3440!important;color:#ffdce0!important}.results-card .form-empty{display:flex;align-items:center;min-height:28px;color:#9eb6b8;font-size:10px}.results-card .form b{cursor:help}';
    document.head.append(recentResultsCss);
  };

  const bindHandlers = () => {
    onClick('.leader-tabs', event => {
      const tab = event.target.closest('[data-leader-tab]');
      if (!tab) return;
      leaderMode = tab.dataset.leaderTab;
      renderLeaders();
    });
    onClick('#recentMatches', event => {
      const button = event.target.closest('[data-match-report]');
      if (!button) return;
      const report = dashboardReportGames.get(button.dataset.matchReport);
      if (report) openCalendarMatchReport(report);
    });
  };

  const init = () => {
    injectStyles();
    bindHandlers();
    renderDashboardMiniTable();
    renderDashboardUpcoming();
    renderLeaders();
    renderUserMatchPresentation();
    renderRecentResults();
  };

  return {
    moduleVersion: MODULE_VERSIONS.dashboard,
    init,
    setPersist,
    renderDashboardMiniTable,
    renderDashboardUpcoming,
    renderUserMatchPresentation,
    renderLeaders,
    renderRecentResults,
  };
}
