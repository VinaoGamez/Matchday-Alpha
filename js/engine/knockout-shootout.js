/**
 * Regras compartilhadas de disputa de pênaltis em mata-matas.
 * Novos campeonatos eliminatórios: registre em KNOCKOUT_SHOOTOUT_COMPETITIONS.
 *
 * Empate no AGREGADO (ida+volta) → pênaltis.
 * Confrontos com o usuário NUNCA resolvem shootout no automático silencioso:
 * a disputa precisa ser jogada ao vivo (AO VIVO).
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

/** Mesma fixture do confronto (manda/visitante + leg/tie quando existirem). */
export const sameKnockoutFixture = (a, b) =>
  !!a &&
  !!b &&
  a.home === b.home &&
  a.away === b.away &&
  (a.leg == null || b.leg == null || a.leg === b.leg) &&
  (a.tieId == null || b.tieId == null || a.tieId === b.tieId);

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
  decidingGame.winner = winner;
};

/** Só exibe shootout quando houve empate no tempo regulamentar/agregado ou disputa registrada. */
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
  // Disputa de agregado: se há shootoutWinner, preservar mesmo com placar do jogo ≠ empate
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
 * NÃO usar em confrontos do usuário.
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
 * Resolve confronto eliminatório.
 * @param {object} [opts]
 * @param {boolean} [opts.allowAutoShootout=true] — false bloqueia simulação silenciosa (confrontos do usuário)
 */
export const resolveKnockoutTieWinner = (games, { pickWinner, int, allowAutoShootout = true } = {}) => {
  if (!games?.length) return null;
  const clubsInTie = [games[0].home, games[0].away];
  const aggregate = knockoutTieAggregate(games);
  const firstGoals = aggregate.get(clubsInTie[0]) || 0;
  const secondGoals = aggregate.get(clubsInTie[1]) || 0;
  if (firstGoals > secondGoals) return clubsInTie[0];
  if (secondGoals > firstGoals) return clubsInTie[1];

  const deciding = games[games.length - 1];
  if (deciding?.shootoutWinner) return deciding.shootoutWinner;

  // Empate no agregado sem disputa jogada: só CPU pode resolver no automático
  if (!allowAutoShootout) return null;

  const shootout = simulateAutomaticShootout(clubsInTie[0], clubsInTie[1], { pickWinner, int });
  applyShootoutToDecidingGame(deciding, shootout.winner, shootout.scores);
  return shootout.winner;
};

/**
 * Verifica se, com o placar ao vivo aplicado, o confronto exige shootout
 * por EMPATE NO AGREGADO (não exige empate no jogo da volta).
 */
export const projectedKnockoutNeedsShootout = (games, liveGame, liveStats) => {
  if (!games?.length || !liveGame || !liveStats) return false;
  if (liveGame.shootoutWinner || liveStats.shootoutWinner) return false;

  const projected = games.map(game =>
    sameKnockoutFixture(game, liveGame)
      ? {
          ...game,
          homeGoals: liveStats.homeGoals,
          awayGoals: liveStats.awayGoals,
          completed: true,
        }
      : { ...game },
  );

  // Outras pernas do confronto ainda sem placar → não é hora de pênaltis
  const pendingOtherLeg = projected.some(
    game =>
      !sameKnockoutFixture(game, liveGame) &&
      !game.completed &&
      game.homeGoals == null,
  );
  if (pendingOtherLeg) return false;

  // Todos os jogos do confronto precisam ter placar (ou ser o live)
  if (projected.some(game => game.homeGoals == null && game.awayGoals == null)) return false;

  const aggregate = knockoutTieAggregate(projected);
  const [c0, c1] = [games[0].home, games[0].away];
  return (aggregate.get(c0) || 0) === (aggregate.get(c1) || 0);
};

/** Empate de agregado já gravado nas fixtures, ainda sem shootout. */
export const knockoutTieNeedsPlayedShootout = games => {
  if (!games?.length) return false;
  if (games.some(game => !game.completed && game.homeGoals == null)) return false;
  if (games.some(game => game.shootoutWinner)) return false;
  const aggregate = knockoutTieAggregate(games);
  const [c0, c1] = [games[0].home, games[0].away];
  return (aggregate.get(c0) || 0) === (aggregate.get(c1) || 0);
};
