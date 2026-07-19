import { MODULE_VERSIONS } from '../../core/constants.js';
import { formatKnockoutFixtureScore, isKnockoutShootoutCompetition as isKnockoutGame } from '../../engine/knockout-shootout.js';
import { applyCompetitionBadge, competitionBadgeMarkup, resolveCompetitionBadge } from '../../ui/competition-badge.js';

const DASHBOARD_TABLE_ROWS = 5;
const CLUB_UPCOMING_ROWS = 5;

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
    seasonFullyComplete,
    isUserSeasonIdle,
    nextPendingUserEntry,
    pendingUserSchedule,
    fixtureDetails,
    displayedClubPosition,
    sameCalendarDay,
    daysUntilNextFixtureFromToday,
    restDaysUntilNextFixture,
    leagueUserGameForRound,
    isKnockoutShootoutCompetition,
    leadersFor,
    clubSeasonLeaders,
    getSeasonRoundHistory,
    getCopaFixtures,
    getNationalCompetitions,
    getCareerMessages,
    getUserBudgetLedger,
    getUserSeasonCrowds,
    openCalendarMatchReport,
    calendarGameResult,
    isCompletedDashboardGame,
    isSponsorChoicePending,
    onRequestSponsorPicker,
    canReopenLivePostMatch,
    lastCompletedUserEntry,
  } = deps;

  let leaderMode = 'scorers';
  let persistSeason = () => {};
  const dashboardReportGames = new Map();

  const setPersist = fn => {
    persistSeason = typeof fn === 'function' ? fn : () => {};
  };

  const formatDashboardDate = date =>
    date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '').toUpperCase();

  const clubCrestInitials = name =>
    String(name || '')
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '—';

  const longestResultStreak = (results, letter) => {
    let best = 0;
    let current = 0;
    results.forEach(game => {
      if (game.result === letter) {
        current += 1;
        best = Math.max(best, current);
      } else {
        current = 0;
      }
    });
    return best;
  };

  const biggestGoalMargin = (results, userClub, wantWin) => {
    let best = null;
    results.forEach(game => {
      const atHome = game.home === userClub;
      const own = Number(atHome ? game.homeGoals : game.awayGoals);
      const opp = Number(atHome ? game.awayGoals : game.homeGoals);
      if (!Number.isFinite(own) || !Number.isFinite(opp)) return;
      const diff = own - opp;
      if (wantWin ? diff <= 0 : diff >= 0) return;
      const margin = Math.abs(diff);
      const opponent = atHome ? game.away : game.home;
      const score = `${Number(game.homeGoals)}×${Number(game.awayGoals)}`;
      if (!best || margin > best.margin || (margin === best.margin && (wantWin ? diff > best.diff : diff < best.diff))) {
        best = { margin, diff, score, opponent, label: game.label || 'Jogo' };
      }
    });
    return best;
  };

  const collectHomeCrowdRecords = userClub => {
    const byKey = new Map();
    const put = entry => {
      const attendance = Number(entry?.attendance);
      if (!Number.isFinite(attendance) || attendance <= 0) return;
      const opponent = entry.opponent || entry.away || '—';
      const key = `${entry.home || userClub}|${opponent}|${entry.round ?? ''}|${entry.leg ?? ''}|${entry.phase ?? ''}|${Math.round(attendance)}`;
      const prev = byKey.get(key);
      if (prev) {
        if ((!prev.label || prev.label === 'Jogo em casa') && entry.label) prev.label = entry.label;
        return;
      }
      byKey.set(key, {
        attendance: Math.round(attendance),
        opponent,
        label: entry.label || 'Jogo em casa',
      });
    };

    // Fonte principal: log da temporada (não depende do limite do ledger/mensagens).
    (typeof getUserSeasonCrowds === 'function' ? getUserSeasonCrowds() : []).forEach(entry => {
      if (entry?.home && entry.home !== userClub) return;
      put(entry);
    });

    (typeof getCareerMessages === 'function' ? getCareerMessages() : []).forEach(message => {
      if (message?.type !== 'match-result') return;
      const meta = message.meta || {};
      if (meta.home !== userClub) return;
      put({
        home: meta.home,
        attendance: meta.attendance,
        opponent: meta.away,
        away: meta.away,
        label: meta.competition || 'Jogo em casa',
        round: message.round ?? null,
      });
    });

    (typeof getUserBudgetLedger === 'function' ? getUserBudgetLedger() : []).forEach(entry => {
      if (entry?.reason !== 'gate_receipt') return;
      const meta = entry.meta || {};
      put({
        home: userClub,
        attendance: meta.attendance,
        opponent: meta.opponent,
        away: meta.opponent,
        label: entry.label || 'Bilheteria',
        phase: meta.phase || null,
      });
    });

    (typeof getCopaFixtures === 'function' ? getCopaFixtures() : []).forEach(game => {
      if (game?.home !== userClub || !game.completed) return;
      put({
        home: game.home,
        attendance: game.attendance,
        opponent: game.away,
        away: game.away,
        label: `Copa · ${game.phase || ''}${game.leg ? ` · ${game.leg}` : ''}`.trim(),
        phase: game.phase || null,
        leg: game.leg || null,
      });
    });

    (typeof getSeasonRoundHistory === 'function' ? getSeasonRoundHistory() : []).forEach(round => {
      (round.games || []).forEach(game => {
        if (game?.home !== userClub) return;
        put({
          home: game.home,
          attendance: game.attendance,
          opponent: game.away,
          away: game.away,
          label: `Rodada ${round.round}`,
          round: round.round,
        });
      });
    });

    return [...byKey.values()];
  };

  const buildSeasonReviewStats = () => {
    const userClub = getUserClub();
    const results = userCompletedMatchResults();
    const winStreak = longestResultStreak(results, 'V');
    const lossStreak = longestResultStreak(results, 'D');
    const biggestWin = biggestGoalMargin(results, userClub, true);
    const biggestDefeat = biggestGoalMargin(results, userClub, false);
    const crowds = collectHomeCrowdRecords(userClub);
    let maxCrowd = null;
    let minCrowd = null;
    crowds.forEach(row => {
      if (!maxCrowd || row.attendance > maxCrowd.attendance) maxCrowd = row;
      if (!minCrowd || row.attendance < minCrowd.attendance) minCrowd = row;
    });
    const leaders =
      typeof clubSeasonLeaders === 'function'
        ? clubSeasonLeaders(userClub)
        : { scorer: { name: '—' }, goals: 0, assistant: { name: '—' }, assists: 0 };
    return {
      gameCount: results.length,
      winStreak,
      lossStreak,
      biggestWin,
      biggestDefeat,
      maxCrowd,
      minCrowd,
      leaders,
    };
  };

  const seasonReviewIcon = kind => {
    const icons = {
      win: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4h10v3c0 3.2-1.8 5.7-4.2 7L13 16v2h3v2H8v-2h3v-2l-.8-2C7.8 12.7 6 10.2 6 7V4zm1.5 1.5v1.7c0 2.2 1.1 4 2.9 5.1l.6.4.6-.4c1.8-1.1 2.9-2.9 2.9-5.1V5.5h-7z"/></svg>',
      loss: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.3 13.3-1.4 1.4L12 13.8l-1.9 1.9-1.4-1.4 1.9-1.9-1.9-1.9 1.4-1.4 1.9 1.9 1.9-1.9 1.4 1.4-1.9 1.9 1.9 1.9z"/></svg>',
      smash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2c1.7 3.4 3.2 5.6 5.5 8.2C20.2 13.4 22 16 22 19a5 5 0 0 1-10 0c0-1.2.4-2.4 1-3.5C11.3 17.8 10 19.2 8.5 20.2 6.2 18 4.8 15.4 4 12.8c2.2.2 4.1-.2 5.8-1.2C8.2 9.8 7 7.6 6.2 5.2 8.4 5.8 10.3 4.6 12 2z"/></svg>',
      concede: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 11h6V5h4v6h6v2h-6v6h-4v-6H4v-2z" opacity=".35"/><path fill="currentColor" d="M3 12h18v2H3z"/></svg>',
      crowdUp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 18V8l8-4 8 4v10h-3v-6H7v6H4zm5 0v-4h6v4H9z"/></svg>',
      crowdDown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 20h18v-2H3v2zm2-4h14l-1.2-7H6.2L5 16zm4.5-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm5 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>',
      scorer: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="1.6" d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',
      assist: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 12h9M11 7l5 5-5 5"/><circle cx="5" cy="12" r="2.2" fill="currentColor"/></svg>',
    };
    return icons[kind] || icons.win;
  };

  const seasonReviewTile = ({ tone, icon, label, value, meta = '' }) => `
    <article class="season-review-tile tone-${tone}">
      <div class="season-review-tile-icon">${seasonReviewIcon(icon)}</div>
      <div class="season-review-tile-copy">
        <span>${label}</span>
        <strong>${value}</strong>
        ${meta ? `<small>${meta}</small>` : ''}
      </div>
    </article>`;

  const renderSeasonReviewBoard = () => {
    const board = $('#seasonReviewBoard');
    if (!board) return;
    const userClub = getUserClub();
    const careerSeason = typeof getCareerSeason === 'function' ? getCareerSeason() : '';
    const stats = buildSeasonReviewStats();
    const hasGames = stats.gameCount > 0;
    const streakValue = count => (hasGames ? String(count) : '—');
    const streakMeta = count => (hasGames ? `jogo${count === 1 ? '' : 's'} seguidos` : '');
    const winValue = stats.biggestWin?.score || '—';
    const winMeta = stats.biggestWin
      ? `vs ${stats.biggestWin.opponent} · ${stats.biggestWin.label}`
      : '';
    const defeatValue = stats.biggestDefeat?.score || '—';
    const defeatMeta = stats.biggestDefeat
      ? `vs ${stats.biggestDefeat.opponent} · ${stats.biggestDefeat.label}`
      : '';
    const maxCrowdValue = stats.maxCrowd
      ? stats.maxCrowd.attendance.toLocaleString('pt-BR')
      : '—';
    const maxCrowdMeta = stats.maxCrowd
      ? `vs ${stats.maxCrowd.opponent} · ${stats.maxCrowd.label}`
      : '';
    const minCrowdValue = stats.minCrowd
      ? stats.minCrowd.attendance.toLocaleString('pt-BR')
      : '—';
    const minCrowdMeta = stats.minCrowd
      ? `vs ${stats.minCrowd.opponent} · ${stats.minCrowd.label}`
      : '';
    const scorerName = stats.leaders?.scorer?.name || '—';
    const assistantName = stats.leaders?.assistant?.name || '—';
    const goals = Number(stats.leaders?.goals) || 0;
    const assists = Number(stats.leaders?.assists) || 0;
    board.innerHTML = `
      <div class="season-review-club">
        <div class="season-review-crest-wrap"><i aria-hidden="true">${clubCrestInitials(userClub)}</i></div>
        <b>${userClub}</b>
        <small>${careerSeason ? `Temporada ${careerSeason}` : 'Campanha encerrada'}${hasGames ? ` · ${stats.gameCount} jogos` : ''}</small>
      </div>
      <div class="season-review-stats">
        ${seasonReviewTile({ tone: 'lime', icon: 'win', label: 'Maior sequência de vitórias', value: streakValue(stats.winStreak), meta: streakMeta(stats.winStreak) })}
        ${seasonReviewTile({ tone: 'red', icon: 'loss', label: 'Maior sequência de derrotas', value: streakValue(stats.lossStreak), meta: streakMeta(stats.lossStreak) })}
        ${seasonReviewTile({ tone: 'cyan', icon: 'smash', label: 'Maior goleada realizada', value: winValue, meta: winMeta })}
        ${seasonReviewTile({ tone: 'amber', icon: 'concede', label: 'Maior goleada sofrida', value: defeatValue, meta: defeatMeta })}
        ${seasonReviewTile({ tone: 'cyan', icon: 'crowdUp', label: 'Maior público', value: maxCrowdValue, meta: maxCrowdMeta })}
        ${seasonReviewTile({ tone: 'muted', icon: 'crowdDown', label: 'Menor público', value: minCrowdValue, meta: minCrowdMeta })}
        ${seasonReviewTile({ tone: 'lime', icon: 'scorer', label: 'Artilheiro', value: scorerName === '—' ? '—' : scorerName, meta: scorerName === '—' ? '' : `${goals} gol${goals === 1 ? '' : 's'}` })}
        ${seasonReviewTile({ tone: 'cyan', icon: 'assist', label: 'Melhor assistente', value: assistantName === '—' ? '—' : assistantName, meta: assistantName === '—' ? '' : `${assists} assistência${assists === 1 ? '' : 's'}` })}
      </div>`;
    board.classList.remove('hidden');
  };

  const hideSeasonReviewBoard = () => {
    const board = $('#seasonReviewBoard');
    if (!board) return;
    board.classList.add('hidden');
    board.innerHTML = '';
  };

  const setNextMatchMeta = (lines = []) => {
    const el = $('#nextMatchMeta');
    if (!el) return;
    const classes = ['match-meta-today', 'match-meta-next', 'match-meta-extra'];
    el.innerHTML = lines
      .filter(Boolean)
      .map((line, index) => `<span class="match-meta-line ${classes[index] || 'match-meta-extra'}">${line}</span>`)
      .join('');
  };

  const setNextMatchCompetition = (game, userDivision, { hidden = false, kindOverride = null } = {}) => {
    const info = applyCompetitionBadge('#nextMatchCompetition', game, { userDivision, hidden });
    if (!hidden && kindOverride) {
      const badge = $('#nextMatchCompetition');
      if (badge) badge.dataset.kind = kindOverride;
    }
    return info || resolveCompetitionBadge(game, { userDivision });
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
        return `<div class="dashboard-fixture-row ${isUser ? 'user-game' : ''}"><span class="fixture-home"><b class="club-link" data-club="${game.home}" role="button" tabindex="0">${game.home}</b>${isUser ? '<small class="user-game-tag">SEU JOGO</small>' : ''}</span><span class="fixture-vs">×</span><span class="fixture-away club-link" data-club="${game.away}" role="button" tabindex="0">${game.away}</span></div>`;
      })
      .join('');
  };

  const refreshUserFixtures = () => {
    pendingUserSchedule().slice(0, CLUB_UPCOMING_ROWS).map(entry => entry.game);
  };

  const renderUserMatchPresentation = () => {
    refreshUserFixtures();
    const userClub = getUserClub();
    const userDivision = getUserDivision();
    const currentRound = getCurrentRound();
    const careerCalendarDate = getCareerCalendarDate();
    const clubs = getClubs();
    const display = nextPendingUserEntry();
    const idle = isUserSeasonIdle();
    const fullyComplete = typeof seasonFullyComplete === 'function' ? seasonFullyComplete() : seasonComplete();
    const playBtn = $('#playMatch');
    const postMatchBtn = $('#reopenPostMatch');
    const simBtn = $('#simulateRemainder');
    const inspectBtn = $('#inspectOpponent');
    const calendarBtn = $('#openDashboardCalendar');
    const matchCard = playBtn?.closest('.match') || document.querySelector('#dashboard .match');
    matchCard?.classList.toggle('season-ended', !!fullyComplete);
    const cardTitle = $('#nextMatchCardTitle');
    if (cardTitle) cardTitle.textContent = fullyComplete ? 'RESUMO DA TEMPORADA' : 'PRÓXIMA PARTIDA';

    const sponsorPending = typeof isSponsorChoicePending === 'function' && isSponsorChoicePending();
    const livePostMatch = typeof canReopenLivePostMatch === 'function' && canReopenLivePostMatch();
    const hasCompletedMatch = typeof lastCompletedUserEntry === 'function' && !!lastCompletedUserEntry();

    // Temporada fechada: o CTA precisa ficar visível para reabrir o balanço / avançar.
    if (playBtn) {
      playBtn.classList.toggle('hidden', idle && !sponsorPending);
      playBtn.disabled = false;
      if (sponsorPending) {
        playBtn.textContent = 'ESCOLHA OS PATROCÍNIOS →';
        playBtn.title = 'Feche os contratos Master e Secundários para liberar a temporada';
        playBtn.disabled = false;
      } else if (fullyComplete) {
        playBtn.textContent = 'BALANÇO / PRÓXIMA TEMPORADA →';
        playBtn.title = 'Abrir balanço da temporada e avançar quando estiver pronto';
      } else {
        playBtn.textContent = 'JOGAR PARTIDA →';
        playBtn.title = '';
      }
    }
    if (postMatchBtn) {
      postMatchBtn.classList.toggle('hidden', !livePostMatch && !hasCompletedMatch);
      postMatchBtn.title = livePostMatch
        ? 'Reabrir o resumo pós-jogo da partida atual'
        : 'Ver o relatório da última partida concluída';
    }
    if (simBtn) simBtn.classList.toggle('hidden', !idle);
    if (inspectBtn) inspectBtn.classList.toggle('hidden', idle || fullyComplete || !display);
    if (calendarBtn) calendarBtn.classList.toggle('hidden', idle || fullyComplete);

    const userUpcomingGames = pendingUserSchedule().slice(0, CLUB_UPCOMING_ROWS).map(entry => entry.game);

    if (idle) {
      $('#nextMatchRound').textContent = `SEM JOGOS · RODADA NACIONAL ${currentRound}`;
      setNextMatchCompetition(null, userDivision, { kindOverride: 'idle' });
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

      if (playBtn && !sponsorPending) {
        playBtn.disabled = !onMatchDay;
        playBtn.title = onMatchDay ? 'Disputar a partida agendada para hoje' : 'Avance até o dia do jogo para disputar a partida';
      }
      if (calendarBtn) {
        calendarBtn.disabled = onMatchDay;
        calendarBtn.title = onMatchDay ? 'Você já está no dia do jogo' : `Simular treinos e avançar até ${details.display}`;
      }

      setNextMatchCompetition(game, userDivision);
      $('#nextMatchRound').textContent = isCup
        ? `${game.phase || 'COPA'} · ${game.leg || ''}`.replace(/\s·\s$/, '')
        : isKnockoutShootoutCompetition(game)
          ? `${game.leg || 'Eliminatórias'}${game.phase ? ` · ${game.phase}` : ''}`
          : `RODADA ${game.round}${userDivision === 'D' && !isKnockoutShootoutCompetition(game) ? ` · GRUPO A${deps.getUserSerieDGroupIndex() + 1}` : ''}`;
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
    } else if (fullyComplete) {
      $('#nextMatchRound').textContent = '';
      setNextMatchCompetition(null, userDivision, { hidden: true });
      setNextMatchMeta([]);
      renderSeasonReviewBoard();
    }

    if (!fullyComplete) hideSeasonReviewBoard();

    $('#clubUpcomingMatches').innerHTML = userUpcomingGames.length
      ? userUpcomingGames
          .map(game => {
            const atHome = game.home === userClub;
            const details = fixtureDetails(game);
            const isCup = game.competition === 'COPA DO BRASIL';
            const isKo = isKnockoutShootoutCompetition(game);
            const badge = resolveCompetitionBadge(game, { userDivision });
            const badgeHtml = competitionBadgeMarkup({
              id: null,
              nameId: null,
              name: badge.name,
              kind: badge.kind,
              extraClass: 'club-upcoming-badge',
            });
            return `<div class="club-upcoming-row ${isCup || isKo ? 'cup-row' : ''}"><span class="club-upcoming-fixture"><span class="club-upcoming-matchup"><b class="club-link" data-club="${game.home}" role="button" tabindex="0">${game.home}</b> <i>×</i> <b class="club-link" data-club="${game.away}" role="button" tabindex="0">${game.away}</b></span>${badgeHtml}</span><span>${details.display} · ${details.time}</span><span class="${atHome ? 'home' : 'away'}">${atHome ? 'CASA' : 'FORA'}</span></div>`;
          })
          .join('')
      : `<div class="club-upcoming-row idle-row"><span class="club-upcoming-fixture"><b>${idle ? 'Nenhum jogo restante do clube' : fullyComplete ? 'Temporada encerrada' : 'Agenda em atualização'}</b></span><span>${idle ? `Nacional na rodada ${currentRound}` : '—'}</span><span class="away">—</span></div>`;
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
    const form = $('#matchRecentForm');
    const summary = $('#matchRecentSummary');
    if (form && summary) {
      if (!completed.length) {
        form.innerHTML = '<span class="form-empty">Nenhum jogo concluído.</span>';
        summary.textContent = 'A temporada ainda não possui resultados.';
      } else {
        form.innerHTML = completed
          .map(game => {
            const score = dashboardScoreLabel(game);
            const tone = game.result === 'V' ? 'win' : game.result === 'E' ? 'draw' : 'loss';
            return `<b class="${tone}" title="${game.label}: ${game.home} ${score} ${game.away}">${game.result}</b>`;
          })
          .join('');
        const points = completed.reduce((total, game) => total + game.points, 0);
        const games = completed.length;
        summary.textContent =
          games === 1
            ? `${points} ${points === 1 ? 'ponto' : 'pontos'} no último jogo`
            : `${points} pontos nos últimos ${games} jogos`;
      }
    }
    renderRecentGamesDashboard();
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
