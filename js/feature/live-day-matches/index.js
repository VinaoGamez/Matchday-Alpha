import { MODULE_VERSIONS } from '../../core/constants.js';

/**
 * Modal "Ao vivo · Rodada" — placar simultâneo dos demais jogos da data.
 * @param {object} deps
 * @param {Function} deps.$
 * @param {Function} deps.$$
 * @param {Function} deps.onClick
 * @param {Function} deps.clamp
 * @param {Function} deps.getLiveMatchGame
 * @param {Function} deps.getMinute
 * @param {Function} deps.getGoals
 * @param {Function} deps.getPreMatchPreparation
 * @param {Function} deps.getMatchFinished
 * @param {Function} deps.getHalftimeShown
 * @param {Function} deps.getUserClub
 * @param {Function} deps.getUserDivision
 * @param {Function} deps.getCurrentRound
 * @param {Function} deps.getClubs
 * @param {Function} deps.getNationalCompetitions
 * @param {Function} deps.getCopaDoBrasilFixtures
 * @param {Function} deps.getSerieDGroups
 * @param {Function} deps.getUserSerieDGroupIndex
 * @param {number} deps.SERIE_D_GROUP_ROUNDS
 * @param {Function} deps.isUserFixture
 * @param {Function} deps.isKnockoutShootoutCompetition
 * @param {Function} deps.fixtureDetails
 * @param {Function} deps.fixtureDateFor
 * @param {Function} deps.calendarKey
 * @param {Function} deps.simulateRoundMatch
 * @param {Function} deps.getCareerCalendarDate
 * @param {Function} deps.getSeasonRoundHistory
 * @param {Function} deps.getCompetitionRoundHistory
 * @param {Function} deps.getCareerSeed
 */
export function createLiveDayMatchesFeature(deps) {
  const {
    $,
    onClick,
    clamp,
    getLiveMatchGame,
    getMinute,
    getGoals,
    getPreMatchPreparation,
    getMatchFinished,
    getHalftimeShown,
    getUserClub,
    getUserDivision,
    getCurrentRound,
    getClubs,
    getNationalCompetitions,
    getCopaDoBrasilFixtures,
    getSerieDGroups,
    getUserSerieDGroupIndex,
    SERIE_D_GROUP_ROUNDS,
    isUserFixture,
    isKnockoutShootoutCompetition,
    fixtureDetails,
    fixtureDateFor,
    calendarKey,
    simulateRoundMatch,
    getCareerCalendarDate,
    getSeasonRoundHistory,
    getCompetitionRoundHistory,
    getCareerSeed,
  } = deps;

  let liveDayMatchSnapshots = null;
  let liveDayMatchFilter = 'ALL';
  let liveDaySerieDGroup = getUserSerieDGroupIndex();

  const liveMatchDayKey = () => {
    const liveMatchGame = getLiveMatchGame();
    if (!liveMatchGame) return null;
    if (liveMatchGame.competition === 'COPA DO BRASIL') return calendarKey(new Date(liveMatchGame.date));
    return calendarKey(fixtureDetails(liveMatchGame).date);
  };

  const liveDayGameKey = game =>
    `${game.competition || 'LEAGUE'}|${game.home}|${game.away}|${game.round || ''}|${game.leg || ''}|${game.phase || ''}|${game.tieId || ''}`;

  const liveDayGameDivision = game => {
    if (game.competition === 'COPA DO BRASIL') return 'CUP';
    if (game._liveDivision && game._liveDivision !== 'CUP') return game._liveDivision;
    const clubs = getClubs();
    return clubs[game.home]?.division || clubs[game.away]?.division || getUserDivision();
  };

  const serieDGroupIndexForGame = game =>
    getSerieDGroups().findIndex(group => group.includes(game.home) && group.includes(game.away));

  const divisionRoundPlayed = division =>
    Math.max(0, ...(getNationalCompetitions()[division]?.standings || []).map(row => row.played || 0));

  const isNationalFixturePending = (game, division) => {
    if (game.competition === 'COPA DO BRASIL' || isKnockoutShootoutCompetition(game)) return !game.completed;
    const history =
      division === getUserDivision() ? getSeasonRoundHistory() : getCompetitionRoundHistory()[division] || [];
    if (history.some(item => (item.games || []).some(entry => entry.home === game.home && entry.away === game.away)))
      return false;
    return (game.round || 0) > divisionRoundPlayed(division);
  };

  const leagueFixtureDate = (division, game) => fixtureDateFor(division, game.round || getCurrentRound());

  const allNationalFixturesOnDay = dayKey => {
    if (!dayKey) return [];
    const unique = new Map();
    Object.entries(getNationalCompetitions()).forEach(([division, competition]) => {
      (competition.fixtures || []).flat().forEach(game => {
        if (!game?.home || !game?.away || game.competition === 'COPA DO BRASIL') return;
        const date = leagueFixtureDate(division, game);
        if (calendarKey(date) !== dayKey || !isNationalFixturePending(game, division)) return;
        unique.set(liveDayGameKey(game), { ...game, _liveDivision: division });
      });
    });
    const liveMatchGame = getLiveMatchGame();
    getCopaDoBrasilFixtures().forEach(game => {
      if (game.completed) return;
      const sameDay = calendarKey(new Date(game.date)) === dayKey;
      const sameCupPhase =
        liveMatchGame?.competition === 'COPA DO BRASIL' && game.phaseIndex === liveMatchGame.phaseIndex;
      if (!sameDay && !sameCupPhase) return;
      unique.set(liveDayGameKey(game), { ...game, _liveDivision: 'CUP' });
    });
    return [...unique.values()].sort(
      (a, b) =>
        Number(isUserFixture(b)) - Number(isUserFixture(a)) ||
        liveDayGameDivision(a).localeCompare(liveDayGameDivision(b)) ||
        a.home.localeCompare(b.home, 'pt-BR'),
    );
  };

  const liveMatchDayGames = () => allNationalFixturesOnDay(liveMatchDayKey());

  const liveDayFilterOptions = games => {
    const available = new Set(['ALL']);
    games.forEach(game => {
      if (game.competition === 'COPA DO BRASIL') available.add('CUP');
      else available.add(liveDayGameDivision(game));
    });
    return ['ALL', 'CUP', 'A', 'B', 'C', 'D'].filter(filter => filter === 'ALL' || available.has(filter));
  };

  const groupGamesOnDay = games =>
    games.some(
      game =>
        liveDayGameDivision(game) === 'D' &&
        !isKnockoutShootoutCompetition(game) &&
        (game.round || 0) <= SERIE_D_GROUP_ROUNDS,
    );

  const defaultLiveDayFilter = games => {
    if (!games.length) return 'ALL';
    const divisions = new Set(games.map(game => liveDayGameDivision(game)));
    if (divisions.size > 1 || groupGamesOnDay(games)) return 'ALL';
    const userGame = games.find(isUserFixture);
    if (!userGame) return 'ALL';
    if (userGame.competition === 'COPA DO BRASIL') return 'CUP';
    const division = liveDayGameDivision(userGame);
    if (division === 'D' && !isKnockoutShootoutCompetition(userGame) && (userGame.round || 0) <= SERIE_D_GROUP_ROUNDS) {
      liveDaySerieDGroup = Math.max(0, serieDGroupIndexForGame(userGame));
    }
    return division;
  };

  const filterLiveDayGames = games => {
    if (liveDayMatchFilter === 'ALL') return games;
    if (liveDayMatchFilter === 'CUP') return games.filter(game => game.competition === 'COPA DO BRASIL');
    return games.filter(game => {
      if (game.competition === 'COPA DO BRASIL') return false;
      if (liveDayGameDivision(game) !== liveDayMatchFilter) return false;
      if (liveDayMatchFilter === 'D' && !isKnockoutShootoutCompetition(game) && (game.round || 0) <= SERIE_D_GROUP_ROUNDS) {
        return serieDGroupIndexForGame(game) === liveDaySerieDGroup;
      }
      return true;
    });
  };

  const seededGoalMinute = (homeClub, awayClub, side, index) => {
    let state =
      ((getCareerSeed() || 2166136261) ^
        getCurrentRound() ^
        homeClub.length ^
        awayClub.length ^
        side.charCodeAt(0) ^
        ((index + 1) * 997)) >>>
      0;
    state = Math.imul(state ^ (state >>> 15), state | 1);
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
    return clamp(1 + (((state ^ (state >>> 14)) >>> 0) % 89), 1, 89);
  };

  const buildPartialGoalTimeline = (homeClub, awayClub, homeGoals, awayGoals) => {
    const events = [];
    for (let i = 0; i < homeGoals; i++) events.push({ side: 'home', minute: seededGoalMinute(homeClub, awayClub, 'h', i) });
    for (let i = 0; i < awayGoals; i++) events.push({ side: 'away', minute: seededGoalMinute(homeClub, awayClub, 'a', i) });
    return events.sort((a, b) => a.minute - b.minute);
  };

  const ensureLiveDayMatches = () => {
    if (liveDayMatchSnapshots) return;
    liveDayMatchSnapshots = new Map();
    liveMatchDayGames().forEach(game => {
      const id = liveDayGameKey(game);
      if (isUserFixture(game)) {
        liveDayMatchSnapshots.set(id, { game, isUser: true });
        return;
      }
      const result = simulateRoundMatch(game.home, game.away, game);
      liveDayMatchSnapshots.set(id, {
        game,
        isUser: false,
        timeline: buildPartialGoalTimeline(game.home, game.away, result.homeGoals, result.awayGoals),
        final: { homeGoals: result.homeGoals, awayGoals: result.awayGoals },
      });
    });
  };

  const livePartialAtMinute = (entry, atMinute) => {
    if (entry.isUser) {
      const userAtHome = entry.game.home === getUserClub();
      const goals = getGoals();
      return {
        homeGoals: (userAtHome ? goals.home : goals.away).filter(g => (g.minute || 0) <= atMinute).length,
        awayGoals: (userAtHome ? goals.away : goals.home).filter(g => (g.minute || 0) <= atMinute).length,
      };
    }
    const timeline = entry.timeline || [];
    return {
      homeGoals: timeline.filter(e => e.side === 'home' && e.minute <= atMinute).length,
      awayGoals: timeline.filter(e => e.side === 'away' && e.minute <= atMinute).length,
    };
  };

  const liveDayMatchLabel = game => {
    if (game.competition === 'COPA DO BRASIL') return `Copa · ${game.phase}${game.leg ? ` · ${game.leg}` : ''}`;
    if (isKnockoutShootoutCompetition(game)) return `Série D · ${game.leg || 'Elim.'}`;
    const division = liveDayGameDivision(game);
    return `S${division} · Rod. ${game.round || getCurrentRound()}ª`;
  };

  const liveDayMatchShortLabel = game => {
    if (game.competition === 'COPA DO BRASIL') return `${game.phase}${game.leg ? ` · ${game.leg}` : ''}`;
    if (isKnockoutShootoutCompetition(game)) return game.leg || 'Elim.';
    return `Rod. ${game.round || getCurrentRound()}ª`;
  };

  const liveDaySectionKey = game => {
    if (game.competition === 'COPA DO BRASIL') return 'CUP';
    const division = liveDayGameDivision(game);
    if (division === 'D') {
      if (isKnockoutShootoutCompetition(game)) return 'D:KO';
      if ((game.round || 0) <= SERIE_D_GROUP_ROUNDS) {
        const groupIndex = serieDGroupIndexForGame(game);
        return groupIndex >= 0 ? `D:${groupIndex}` : 'D:UNK';
      }
      return 'D:KO';
    }
    return division;
  };

  const liveDaySectionLabel = key => {
    if (key === 'CUP') return 'Copa do Brasil';
    if (key === 'A') return 'Brasileirão Série A';
    if (key === 'B') return 'Brasileirão Série B';
    if (key === 'C') return 'Brasileirão Série C';
    if (key === 'D:KO') return 'Série D · Mata-mata';
    if (key === 'D:UNK') return 'Série D';
    if (key.startsWith('D:')) return `Série D · Grupo A${Number(key.slice(2)) + 1}`;
    return key;
  };

  const liveDaySectionSortKey = key => {
    if (key === 'CUP') return '0-CUP';
    if (key === 'A' || key === 'B' || key === 'C') return `1-${key}`;
    if (key === 'D:KO') return '2-KO';
    if (key.startsWith('D:')) return `2-${String(Number(key.slice(2))).padStart(2, '0')}`;
    return `9-${key}`;
  };

  const groupLiveDayGamesAllView = games => {
    const buckets = new Map();
    games.forEach(game => {
      const key = liveDaySectionKey(game);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(game);
    });
    return [...buckets.entries()]
      .sort(([a], [b]) => liveDaySectionSortKey(a).localeCompare(liveDaySectionSortKey(b)))
      .map(([key, sectionGames]) => ({
        key,
        label: liveDaySectionLabel(key),
        games: sectionGames.sort(
          (a, b) => Number(isUserFixture(b)) - Number(isUserFixture(a)) || a.home.localeCompare(b.home, 'pt-BR'),
        ),
      }));
  };

  const liveDayMatchStatus = (game, isUser, atMinute) => {
    if (getPreMatchPreparation()) return 'A iniciar';
    if (isUser && getMatchFinished()) return 'Encerrado';
    if (getHalftimeShown() && atMinute <= 45) return 'Intervalo';
    if (atMinute >= 90) return "90'";
    return `${String(atMinute).padStart(2, '0')}'`;
  };

  const render = () => {
    ensureLiveDayMatches();
    const preMatchPreparation = getPreMatchPreparation();
    const minute = getMinute();
    const liveMatchGame = getLiveMatchGame();
    const atMinute = preMatchPreparation ? 0 : Math.min(90, Math.max(0, minute));
    const dateSource = liveMatchGame
      ? liveMatchGame.competition === 'COPA DO BRASIL'
        ? new Date(liveMatchGame.date)
        : fixtureDetails(liveMatchGame).date
      : getCareerCalendarDate();
    const dateLabel = dateSource.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
    const metaEl = $('#liveDayMatchesMeta');
    const dayGames = liveMatchDayGames();
    const filteredGames = filterLiveDayGames(dayGames);
    const filters = liveDayFilterOptions(dayGames);
    const toolbar = $('#liveDayMatchesToolbar');
    const hasGroupGames = groupGamesOnDay(dayGames);
    if (toolbar) {
      toolbar.classList.toggle('hidden', filters.length <= 1 && !hasGroupGames);
      $('#liveDayDivisionTabs').innerHTML = filters
        .map(filter => {
          const label = filter === 'ALL' ? 'TODOS' : filter === 'CUP' ? 'COPA DO BRASIL' : `SÉRIE ${filter}`;
          return `<button type="button" class="${filter === liveDayMatchFilter ? 'active' : ''}" data-live-day-division="${filter}">${label}</button>`;
        })
        .join('');
      const groupGames = dayGames.filter(
        game =>
          liveDayGameDivision(game) === 'D' &&
          !isKnockoutShootoutCompetition(game) &&
          (game.round || 0) <= SERIE_D_GROUP_ROUNDS,
      );
      const groupNav = $('#liveDayGroupNav');
      if (groupNav) {
        if (liveDayMatchFilter === 'D' && groupGames.length) {
          groupNav.innerHTML = `<button type="button" data-live-day-group-step="-1" aria-label="Grupo anterior">‹</button><strong>GRUPO A${liveDaySerieDGroup + 1}</strong><button type="button" data-live-day-group-step="1" aria-label="Próximo grupo">›</button>`;
        } else groupNav.innerHTML = '';
      }
    }
    if (metaEl) {
      const scope =
        liveDayMatchFilter === 'ALL'
          ? 'todas as competições'
          : liveDayMatchFilter === 'CUP'
            ? 'Copa do Brasil'
            : liveDayMatchFilter === 'D'
              ? `Série D${groupGamesOnDay(dayGames) ? ` · Grupo A${liveDaySerieDGroup + 1}` : ''}`
              : `Série ${liveDayMatchFilter}`;
      metaEl.textContent = preMatchPreparation
        ? `${dateLabel} · Os jogos desta data iniciam com o apito do ${getUserClub()}.`
        : `${dateLabel} · ${liveDayMatchStatus(liveMatchGame, true, atMinute) === 'Intervalo' ? 'Intervalo' : `${atMinute}'`} · ${filteredGames.length} exibidos · ${dayGames.length} no total · ${scope}.`;
    }
    const listEl = $('#liveDayMatchesList');
    if (!listEl) return;
    if (!dayGames.length) {
      listEl.innerHTML = '<div class="live-day-matches-empty">Nenhuma partida programada para esta data.</div>';
      return;
    }
    if (!filteredGames.length) {
      listEl.innerHTML =
        '<div class="live-day-matches-empty">Nenhuma partida nesta competição para a data selecionada.</div>';
      return;
    }
    const renderLiveDayMatchRow = (game, compactLabel = false) => {
      const id = liveDayGameKey(game);
      const entry = liveDayMatchSnapshots?.get(id) || { game, isUser: isUserFixture(game) };
      const isUser = isUserFixture(game);
      const { homeGoals, awayGoals } =
        preMatchPreparation && !entry.isUser ? { homeGoals: 0, awayGoals: 0 } : livePartialAtMinute(entry, atMinute);
      const label = compactLabel ? liveDayMatchShortLabel(game) : liveDayMatchLabel(game);
      return `<div class="live-day-match-row ${isUser ? 'user-game' : ''}"><span class="live-day-match-label">${label}</span><span class="live-day-match-home"><b class="club-link" data-club="${game.home}" role="button" tabindex="0">${game.home}</b></span><strong class="live-day-match-score">${homeGoals} — ${awayGoals}</strong><span class="live-day-match-away"><b class="club-link" data-club="${game.away}" role="button" tabindex="0">${game.away}</b>${isUser ? '<small class="user-game-tag">SEU JOGO</small>' : ''}</span><span class="live-day-match-status">${liveDayMatchStatus(game, isUser, atMinute)}</span></div>`;
    };
    const tableHead = `<div class="live-day-matches-head"><span>Comp.</span><span>Mandante</span><span>Placar</span><span>Visitante</span><span>Min.</span></div>`;
    if (liveDayMatchFilter === 'ALL') {
      const sections = groupLiveDayGamesAllView(filteredGames);
      listEl.innerHTML = `${tableHead}${sections
        .map(
          section =>
            `<div class="live-day-division-block"><div class="live-day-division-head"><strong>${section.label}</strong><span>${section.games.length} jogos</span></div>${section.games.map(game => renderLiveDayMatchRow(game, true)).join('')}</div>`,
        )
        .join('')}`;
      return;
    }
    listEl.innerHTML = `${tableHead}${filteredGames.map(game => renderLiveDayMatchRow(game, false)).join('')}`;
  };

  const open = () => {
    const games = liveMatchDayGames();
    liveDayMatchFilter = defaultLiveDayFilter(games);
    render();
    $('#liveDayMatchesModal')?.classList.remove('hidden');
  };

    const injectModal = () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="liveDayMatchesModal" class="modal hidden"><div class="modal-card live-day-matches-modal"><button id="closeLiveDayMatches" class="close">×</button><label>AO VIVO · RODADA</label><h2>Partidas em Andamento</h2><p id="liveDayMatchesMeta"></p><div id="liveDayMatchesToolbar" class="live-day-matches-toolbar hidden"><div id="liveDayDivisionTabs" class="live-day-division-tabs"></div><div id="liveDayGroupNav" class="live-day-group-nav"></div></div><div id="liveDayMatchesList" class="live-day-matches-list"></div></div></div>`,
    );
  };

  const bindHandlers = () => {
    onClick('#liveDayMatches', open);
    onClick('#closeLiveDayMatches', () => {
      $('#liveDayMatchesModal').classList.add('hidden');
    });
    $('#liveDayMatchesModal')?.addEventListener('click', event => {
      const division = event.target.closest('[data-live-day-division]')?.dataset.liveDayDivision;
      if (division) {
        liveDayMatchFilter = division;
        if (division === 'D') {
          const groupGames = liveMatchDayGames().filter(
            game =>
              liveDayGameDivision(game) === 'D' &&
              !isKnockoutShootoutCompetition(game) &&
              (game.round || 0) <= SERIE_D_GROUP_ROUNDS,
          );
          if (groupGames.length && !groupGames.some(game => serieDGroupIndexForGame(game) === liveDaySerieDGroup)) {
            liveDaySerieDGroup = Math.max(0, serieDGroupIndexForGame(groupGames[0]));
          }
        }
        render();
        return;
      }
      const groupStep = Number(event.target.closest('[data-live-day-group-step]')?.dataset.liveDayGroupStep || 0);
      if (groupStep) {
        const serieDGroups = getSerieDGroups();
        liveDaySerieDGroup = (liveDaySerieDGroup + groupStep + serieDGroups.length) % serieDGroups.length;
        render();
      }
    });
  };
  injectModal();
  bindHandlers();

  return {
    moduleVersion: MODULE_VERSIONS.liveDayMatches,
    open,
    render,
    ensure: ensureLiveDayMatches,
    clearSnapshots: () => {
      liveDayMatchSnapshots = null;
    },
    getSnapshots: () => liveDayMatchSnapshots,
  };
}
