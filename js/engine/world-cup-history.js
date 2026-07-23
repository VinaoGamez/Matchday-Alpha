/**
 * Histórico de Copas — ranking final persiste entre edições (2026 → 2030 → …).
 * Elencos permanecem fixos (JSON 2026); força e pots vêm do ranking anterior.
 */

import { WORLD_CUP_ANCHOR_YEAR, isWorldCupYear } from './season-calendar-mold.js';
import {
  NATIONAL_TEAMS,
  NATIONAL_TEAM_CODES,
  nationalTeamByCode,
  nationalTeamPower,
} from './national-teams.js';
import { buildWorldCup2026FixedDraw } from './world-cup-2026-groups.js';

/** Mesmo JSON de elencos para todas as edições até nova curadoria manual. */
export const WORLD_CUP_SQUADS_ASSET = './data/world-cup-2026-squads.json';
export const WORLD_CUP_SQUADS_SOURCE_EDITION = 2026;

export const WORLD_CUP_GROUP_LETTERS = Object.freeze('ABCDEFGHIJKL'.split(''));

/** Blocos comprimidos 82–95 (12 seleções por bloco). */
export function blockFromSeedRank(rank) {
  const r = Number(rank) || 48;
  if (r <= 12) return 1;
  if (r <= 24) return 2;
  if (r <= 36) return 3;
  return 4;
}

export function teamPowerFromSeedRank(rank) {
  return nationalTeamPower(blockFromSeedRank(rank));
}

/** Ranking inicial (1ª Copa) — ordem FIFA de referência em national-teams.js. */
export function buildBaselineWorldCupRanking() {
  return NATIONAL_TEAM_CODES.map(code => {
    const meta = NATIONAL_TEAMS[code];
    return {
      code,
      name: meta.name,
      rank: meta.fifaRank,
      block: meta.block,
      teamPower: nationalTeamPower(meta.block),
    };
  }).sort((a, b) => a.rank - b.rank);
}

export function worldCupEditionForYear(year) {
  const y = Number(year);
  if (!isWorldCupYear(y)) return null;
  return Math.floor((y - WORLD_CUP_ANCHOR_YEAR) / 4) + 1;
}

export function previousWorldCupYear(year) {
  const y = Number(year);
  if (!isWorldCupYear(y)) return null;
  return y - 4;
}

/** Normaliza histórico gravado no save da carreira. */
export function normalizeWorldCupHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(entry => entry && Number.isFinite(Number(entry.year)) && Array.isArray(entry.finalRanking))
    .map(entry => ({
      year: Number(entry.year),
      edition: Number(entry.edition) || worldCupEditionForYear(entry.year) || null,
      champion: entry.champion ? String(entry.champion).toUpperCase() : null,
      runnerUp: entry.runnerUp ? String(entry.runnerUp).toUpperCase() : null,
      thirdPlace: entry.thirdPlace ? String(entry.thirdPlace).toUpperCase() : null,
      finalRanking: entry.finalRanking
        .map(row => normalizeRankingRow(row))
        .filter(Boolean)
        .sort((a, b) => a.rank - b.rank),
      recordedAt: entry.recordedAt || null,
    }))
    .sort((a, b) => a.year - b.year);
}

function normalizeRankingRow(row) {
  if (!row) return null;
  const code = String(row.code || '').trim().toUpperCase();
  if (!code || !NATIONAL_TEAMS[code]) return null;
  const rank = Number(row.rank);
  if (!Number.isFinite(rank) || rank < 1) return null;
  const meta = NATIONAL_TEAMS[code];
  const block = blockFromSeedRank(rank);
  return {
    code,
    name: row.name || meta.name,
    rank,
    block,
    teamPower: teamPowerFromSeedRank(rank),
    eliminatedPhase: row.eliminatedPhase || null,
  };
}

export function getWorldCupResult(history, year) {
  const y = Number(year);
  return normalizeWorldCupHistory(history).find(entry => entry.year === y) || null;
}

/** Ranking usado para pots/força na edição `year`. */
export function getSeedRankingForEdition(history, year) {
  const y = Number(year);
  if (!isWorldCupYear(y)) return buildBaselineWorldCupRanking();

  if (y <= WORLD_CUP_ANCHOR_YEAR) {
    return buildBaselineWorldCupRanking();
  }

  const prevYear = previousWorldCupYear(y);
  const prev = getWorldCupResult(history, prevYear);
  if (prev?.finalRanking?.length === NATIONAL_TEAM_CODES.length) {
    return prev.finalRanking.map(row => ({ ...row }));
  }

  return buildBaselineWorldCupRanking();
}

/**
 * Grava resultado de uma Copa concluída.
 * @param {Array} history
 * @param {{ year: number, finalRanking: Array, champion?: string, runnerUp?: string, thirdPlace?: string }} payload
 */
export function recordWorldCupResult(history, payload) {
  const year = Number(payload?.year);
  if (!isWorldCupYear(year)) {
    throw new Error(`Ano ${year} não é edição de Copa do Mundo.`);
  }

  const finalRanking = (payload.finalRanking || [])
    .map(row => normalizeRankingRow(row))
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank);

  if (finalRanking.length !== NATIONAL_TEAM_CODES.length) {
    throw new Error(
      `Ranking final incompleto (${finalRanking.length}/${NATIONAL_TEAM_CODES.length}).`,
    );
  }

  const champion = payload.champion
    ? String(payload.champion).toUpperCase()
    : finalRanking.find(r => r.rank === 1)?.code || null;
  const runnerUp = payload.runnerUp
    ? String(payload.runnerUp).toUpperCase()
    : finalRanking.find(r => r.rank === 2)?.code || null;

  const entry = {
    year,
    edition: worldCupEditionForYear(year),
    champion,
    runnerUp,
    thirdPlace: payload.thirdPlace ? String(payload.thirdPlace).toUpperCase() : null,
    finalRanking,
    recordedAt: new Date().toISOString(),
  };

  const next = normalizeWorldCupHistory(history).filter(item => item.year !== year);
  next.push(entry);
  return next.sort((a, b) => a.year - b.year);
}

/** Mapa code → meta de força para uma edição. */
export function buildEditionTeamStrengthMap(history, year) {
  const ranking = getSeedRankingForEdition(history, year);
  return Object.fromEntries(
    ranking.map(row => [
      row.code,
      {
        code: row.code,
        name: row.name,
        seedRank: row.rank,
        block: row.block,
        teamPower: row.teamPower,
      },
    ]),
  );
}

export function resolveEditionTeamStrength(code, history, year) {
  const map = buildEditionTeamStrengthMap(history, year);
  const key = String(code || '').trim().toUpperCase();
  if (map[key]) return map[key];
  const meta = nationalTeamByCode(key);
  if (!meta) return null;
  return {
    code: key,
    name: meta.name,
    seedRank: meta.fifaRank,
    block: meta.block,
    teamPower: nationalTeamPower(meta.block),
  };
}

/** 4 pots × 12 — baseados no ranking da edição anterior. */
export function buildWorldCupDrawPots(ranking) {
  const sorted = [...ranking].sort((a, b) => a.rank - b.rank);
  return [0, 1, 2, 3].map(potIndex => ({
    pot: potIndex + 1,
    teams: sorted.slice(potIndex * 12, potIndex * 12 + 12).map(row => ({
      code: row.code,
      name: row.name,
      rank: row.rank,
      block: row.block,
      teamPower: row.teamPower,
    })),
  }));
}

function shuffleInPlace(list, random) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * Sorteio de grupos A–L (1 por pot em cada grupo).
 * Usa ranking da edição anterior como semente dos pots.
 */
export function drawWorldCupGroups(ranking, random = Math.random) {
  const pots = buildWorldCupDrawPots(ranking).map(pot => {
    const teams = [...pot.teams];
    shuffleInPlace(teams, random);
    return { ...pot, teams };
  });

  const groups = Object.fromEntries(WORLD_CUP_GROUP_LETTERS.map(letter => [letter, []]));

  pots.forEach(pot => {
    pot.teams.forEach((team, index) => {
      const letter = WORLD_CUP_GROUP_LETTERS[index];
      groups[letter].push({
        ...team,
        pot: pot.pot,
      });
    });
  });

  return {
    pots,
    groups,
    seedRanking: [...ranking].sort((a, b) => a.rank - b.rank),
  };
}

/** Copa 2026 usa grupos oficiais FIFA; sorteio aleatório só a partir de 2030. */
export function usesWorldCupGroupDraw(year) {
  return Number(year) > WORLD_CUP_ANCHOR_YEAR;
}

/** Pacote completo para iniciar uma edição (2030+ reutiliza elenco 2026). */
export function prepareWorldCupEdition(history, year, random = Math.random) {
  const y = Number(year);
  const seedRanking = getSeedRankingForEdition(history, y);
  const draw = usesWorldCupGroupDraw(y)
    ? drawWorldCupGroups(seedRanking, random)
    : buildWorldCup2026FixedDraw(seedRanking);
  const teamStrength = buildEditionTeamStrengthMap(history, y);

  return {
    year: y,
    edition: worldCupEditionForYear(y),
    squadsAsset: WORLD_CUP_SQUADS_ASSET,
    squadsSourceEdition: WORLD_CUP_SQUADS_SOURCE_EDITION,
    squadsFrozen: true,
    seedRanking,
    teamStrength,
    draw,
    groupDrawMode: usesWorldCupGroupDraw(y) ? 'random' : 'fixed-2026',
  };
}
