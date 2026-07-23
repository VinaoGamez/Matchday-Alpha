/**
 * Grupos oficiais — Copa do Mundo 2026 (sorteio FIFA, dez/2025).
 * Ordem = posição no grupo (1–4).
 *
 * A partir de 2030 o jogo sorteia grupos com base no ranking da edição anterior.
 */

import { nationalTeamByCode, nationalTeamPower } from './national-teams.js';

const GROUP_LETTERS = Object.freeze('ABCDEFGHIJKL'.split(''));

function potFromRank(rank) {
  const r = Number(rank) || 48;
  if (r <= 12) return 1;
  if (r <= 24) return 2;
  if (r <= 36) return 3;
  return 4;
}

function blockFromSeedRank(rank) {
  return potFromRank(rank);
}

function teamPowerFromSeedRank(rank) {
  return nationalTeamPower(blockFromSeedRank(rank));
}

/** @type {Record<string, readonly string[]>} */
export const WORLD_CUP_2026_FIXED_GROUPS = Object.freeze({
  A: Object.freeze(['MEX', 'KOR', 'RSA', 'CZE']),
  B: Object.freeze(['CAN', 'SUI', 'QAT', 'BIH']),
  C: Object.freeze(['BRA', 'MAR', 'SCO', 'HAI']),
  D: Object.freeze(['USA', 'PAR', 'AUS', 'TUR']),
  E: Object.freeze(['GER', 'ECU', 'CIV', 'CUW']),
  F: Object.freeze(['NED', 'JPN', 'TUN', 'SWE']),
  G: Object.freeze(['BEL', 'IRN', 'EGY', 'NZL']),
  H: Object.freeze(['ESP', 'URU', 'KSA', 'CPV']),
  I: Object.freeze(['FRA', 'SEN', 'NOR', 'IRQ']),
  J: Object.freeze(['ARG', 'AUT', 'ALG', 'JOR']),
  K: Object.freeze(['POR', 'COL', 'UZB', 'COD']),
  L: Object.freeze(['ENG', 'CRO', 'PAN', 'GHA']),
});

function teamEntry(code, ranking) {
  const key = String(code || '').trim().toUpperCase();
  const fromRank = ranking.find(row => row.code === key);
  const meta = nationalTeamByCode(key);
  if (!meta && !fromRank) return null;

  const rank = fromRank?.rank ?? meta?.fifaRank ?? 99;
  return {
    code: key,
    name: fromRank?.name ?? meta.name,
    rank,
    block: fromRank?.block ?? meta?.block ?? blockFromSeedRank(rank),
    teamPower: fromRank?.teamPower ?? teamPowerFromSeedRank(rank),
    pot: potFromRank(rank),
  };
}

/**
 * Monta draw congelado da Copa 2026 (sem embaralhar pots).
 * @param {Array} ranking — seedRanking da edição
 */
export function buildWorldCup2026FixedDraw(ranking) {
  const groups = Object.fromEntries(GROUP_LETTERS.map(letter => [letter, []]));
  const potBuckets = { 1: [], 2: [], 3: [], 4: [] };

  for (const letter of GROUP_LETTERS) {
    const codes = WORLD_CUP_2026_FIXED_GROUPS[letter] || [];
    for (const code of codes) {
      const team = teamEntry(code, ranking);
      if (!team) continue;
      groups[letter].push(team);
      potBuckets[team.pot].push({ ...team, group: letter });
    }
  }

  const pots = [1, 2, 3, 4].map(pot => ({
    pot,
    teams: potBuckets[pot],
  }));

  return {
    pots,
    groups,
    seedRanking: [...ranking].sort((a, b) => a.rank - b.rank),
    fixedDraw: true,
    source: 'fifa-2026-official',
  };
}
