import { SHOOTOUT_TUNING } from './match-tuning.js';
import { resolveShootoutKickOutcome } from './player-generation.js';
import { decideShootoutWinner } from './shootout-takers.js';

/** Perfil de cobrador/goleiro a partir do elenco (simulação CPU / benchmark). */
export function rosterShootoutKickPair(club, attemptIndex = 0) {
  const lineup = (club?.roster || []).slice(0, 11);
  const outfield = lineup
    .filter(player => player?.pos !== 'GOL')
    .sort((a, b) => (Number(b.penaltyTaking) || 0) - (Number(a.penaltyTaking) || 0));
  const taker = outfield[attemptIndex % Math.max(1, outfield.length)] || outfield[0] || { penaltyTaking: 75 };
  const keeper = lineup.find(player => player?.pos === 'GOL') || { penaltySaving: 72 };
  return {
    taker,
    keeper,
    penaltySkill: Number(taker.penaltyTaking) || 75,
    keeperSaving: Number(keeper.penaltySaving) || 72,
  };
}

const goalsFromResults = results =>
  Object.fromEntries(
    Object.entries(results || {}).map(([club, kicks]) => [
      club,
      (kicks || []).filter(Boolean).length,
    ]),
  );

/**
 * Simula disputa completa (5 iniciais + morte súbita) com as mesmas regras do ao vivo.
 * @param {[string, string]} clubs — nomes dos clubes
 * @param {object} [opts]
 * @param {Function} [opts.random]
 * @param {Function} [opts.getKickPair] — (clubName, attemptIndex) => kick profile
 */
export function simulateProbabilisticShootout(clubs, { random = Math.random, getKickPair } = {}) {
  if (!clubs?.length || clubs.length < 2) {
    return { winner: null, scores: {}, penalties: '', results: {} };
  }
  const [c0, c1] = clubs;
  const results = { [c0]: [], [c1]: [] };
  let suddenDeath = false;
  let kickIndex = 0;
  const kickPair =
    getKickPair ||
    ((_club, attemptIndex) => ({
      penaltySkill: 75 + (attemptIndex % 3) * 2,
      keeperSaving: 72,
      taker: null,
      keeper: null,
    }));
  const maxPerClub = SHOOTOUT_TUNING.maxKicksPerClub || 24;

  while (kickIndex < maxPerClub * 2) {
    const club = clubs[kickIndex % 2];
    const attemptIndex = results[club].length;
    const pair = kickPair(club, attemptIndex);
    const { scored } = resolveShootoutKickOutcome({
      penaltySkill: pair.penaltySkill,
      keeperSaving: pair.keeperSaving,
      taker: pair.taker,
      keeper: pair.keeper,
      random,
    });
    results[club].push(scored);
    kickIndex += 1;
    const decided = decideShootoutWinner({ clubs, results, suddenDeath });
    suddenDeath = !!decided.suddenDeath;
    if (decided.winner) {
      const scores = goalsFromResults(results);
      const penHome = scores[c0] ?? 0;
      const penAway = scores[c1] ?? 0;
      return {
        winner: decided.winner,
        scores,
        penalties: `${penHome}–${penAway}`,
        results,
        suddenDeath,
        totalKicks: kickIndex,
      };
    }
    if (results[c0].length >= maxPerClub && results[c1].length >= maxPerClub) break;
  }

  const scores = goalsFromResults(results);
  const g0 = scores[c0] ?? 0;
  const g1 = scores[c1] ?? 0;
  const winner = g0 === g1 ? null : g0 > g1 ? c0 : c1;
  return {
    winner,
    scores,
    penalties: `${g0}–${g1}`,
    results,
    suddenDeath: true,
    totalKicks: kickIndex,
  };
}
