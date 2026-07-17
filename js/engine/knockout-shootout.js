/**
 * Regras compartilhadas de disputa de pênaltis em mata-matas.
 * Novos campeonatos eliminatórios: registre em KNOCKOUT_SHOOTOUT_COMPETITIONS.
 */
export const KNOCKOUT_COMPETITIONS = {
  COPA: 'COPA DO BRASIL',
  SERIE_D: 'SÉRIE D ELIMINATÓRIAS',
};

/** Campeonatos que podem ir aos pênaltis quando o agregado/jogo único empata. */
export const KNOCKOUT_SHOOTOUT_COMPETITIONS = new Set([
  KNOCKOUT_COMPETITIONS.COPA,
  KNOCKOUT_COMPETITIONS.SERIE_D,
]);

export const registerKnockoutShootoutCompetition = key => {
  KNOCKOUT_SHOOTOUT_COMPETITIONS.add(key);
};

export const isKnockoutShootoutCompetition = game =>
  !!game && (KNOCKOUT_SHOOTOUT_COMPETITIONS.has(game.competition) || (!!game.tieId && game.knockoutRound != null));

export const knockoutTieAggregate = games => {
  const aggregate = new Map();
  games.forEach(game => {
    if (!game?.completed && game?.homeGoals == null) return;
    aggregate.set(game.home, (aggregate.get(game.home) || 0) + (game.homeGoals || 0));
    aggregate.set(game.away, (aggregate.get(game.away) || 0) + (game.awayGoals || 0));
  });
  return aggregate;
};

export const knockoutCompetitionLabel = game => {
  if (!game) return 'Eliminatórias';
  if (game.competition === KNOCKOUT_COMPETITIONS.COPA) return `Copa do Brasil${game.phase ? ` · ${game.phase}` : ''}`;
  if (game.competition === KNOCKOUT_COMPETITIONS.SERIE_D) return 'Brasileirão Série D · Eliminatórias';
  return game.competition || 'Eliminatórias';
};

export const applyShootoutToDecidingGame = (decidingGame, winner, scoresByClub) => {
  if (!decidingGame || !winner) return;
  const penHome = scoresByClub[decidingGame.home] ?? 0;
  const penAway = scoresByClub[decidingGame.away] ?? 0;
  decidingGame.shootoutWinner = winner;
  decidingGame.shootoutPenalties = `${penHome}–${penAway}`;
  decidingGame.penalties = decidingGame.shootoutPenalties;
};

/** Só exibe shootout quando houve empate no tempo regulamentar ou disputa registrada. */
export const knockoutShootoutLabel = game => {
  const label = game?.penalties || game?.shootoutPenalties;
  if (!label) return '';
  const homeGoals = Number(game.homeGoals ?? 0);
  const awayGoals = Number(game.awayGoals ?? 0);
  if (homeGoals !== awayGoals && !game.shootoutWinner) return '';
  return label;
};

export const formatKnockoutFixtureScore = (game, { separator = ' — ' } = {}) => {
  const homeGoals = game?.homeGoals ?? 0;
  const awayGoals = game?.awayGoals ?? 0;
  const shootout = knockoutShootoutLabel(game);
  return `${homeGoals}${separator}${awayGoals}${shootout ? ` (${shootout})` : ''}`;
};

/** Remove metadados de shootout quando o tempo regulamentar já tem vencedor. */
export const clearStaleKnockoutShootout = game => {
  if (!game) return false;
  const homeGoals = Number(game.homeGoals ?? 0);
  const awayGoals = Number(game.awayGoals ?? 0);
  if (homeGoals === awayGoals || game.shootoutWinner) return false;
  if (!game.penalties && !game.shootoutPenalties && !game.shootoutWinner) return false;
  delete game.penalties;
  delete game.shootoutPenalties;
  delete game.shootoutWinner;
  return true;
};

/**
 * Saneia saves antigos: remove sufixos de pênaltis em jogos já decididos no tempo regulamentar.
 * @returns {number} quantidade de jogos corrigidos
 */
export const sanitizeKnockoutShootoutSave = ({ cupCompetition, serieDFixtures = [] } = {}) => {
  let fixed = 0;
  const scan = game => {
    if (!game || !isKnockoutShootoutCompetition(game)) return;
    if (clearStaleKnockoutShootout(game)) fixed++;
  };
  (cupCompetition?.stages || []).flatMap(stage => stage.fixtures || []).forEach(scan);
  serieDFixtures.filter(Array.isArray).flat().forEach(scan);
  return fixed;
};

/**
 * Simula shootout automático (jogos só CPU) com placar plausível.
 */
export const simulateAutomaticShootout = (clubA, clubB, { pickWinner, int }) => {
  const winner = pickWinner(clubA, clubB);
  const firstWon = winner === clubA;
  const scoreA = firstWon ? int(4, 6) : int(3, 5);
  const scoreB = firstWon ? Math.max(2, scoreA - int(1, 2)) : scoreA + int(1, 2);
  return {
    winner,
    scores: { [clubA]: scoreA, [clubB]: scoreB },
    penalties: `${scoreA}–${scoreB}`,
  };
};

/**
 * Resolve confronto eliminatório com suporte a shootout já jogado ao vivo ou simulado.
 */
export const resolveKnockoutTieWinner = (games, { pickWinner, int }) => {
  if (!games?.length) return null;
  const clubsInTie = [games[0].home, games[0].away];
  const aggregate = knockoutTieAggregate(games);
  const firstGoals = aggregate.get(clubsInTie[0]) || 0;
  const secondGoals = aggregate.get(clubsInTie[1]) || 0;
  if (firstGoals > secondGoals) return clubsInTie[0];
  if (secondGoals > firstGoals) return clubsInTie[1];

  const deciding = games[games.length - 1];
  if (deciding?.shootoutWinner) return deciding.shootoutWinner;

  const shootout = simulateAutomaticShootout(clubsInTie[0], clubsInTie[1], { pickWinner, int });
  applyShootoutToDecidingGame(deciding, shootout.winner, shootout.scores);
  return shootout.winner;
};

/**
 * Verifica se, com o placar ao vivo aplicado, o confronto exige shootout.
 */
export const projectedKnockoutNeedsShootout = (games, liveGame, liveStats, { allLegsRequired = null } = {}) => {
  if (!games?.length || !liveGame || liveStats?.homeGoals !== liveStats?.awayGoals) return false;
  const projected = games.map(game =>
    game === liveGame ? { ...game, ...liveStats, completed: true } : game,
  );
  if (typeof allLegsRequired === 'function' ? allLegsRequired(liveGame, projected) : projected.some(game => !game.completed && game !== liveGame)) {
    return false;
  }
  if (projected.some(game => !game.completed && game.homeGoals == null)) return false;
  const aggregate = knockoutTieAggregate(projected);
  const [c0, c1] = [games[0].home, games[0].away];
  return (aggregate.get(c0) || 0) === (aggregate.get(c1) || 0);
};
