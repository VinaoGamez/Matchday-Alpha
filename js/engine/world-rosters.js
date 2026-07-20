/**
 * Persistência de elencos do universo (todos os clubes).
 * Snapshot enxuto — evita estourar cota do localStorage.
 */

import { ensurePlayerId } from './player-identity.js';
import { ensureMarketFields } from './player-value.js';

const WORKLOAD_DEFAULT = {
  minutesLast7Days: 0,
  minutesLast14Days: 0,
  matchesLast14Days: 0,
  consecutiveStarts: 0,
  highIntensityLoad: 0,
  lastMatchRound: 0,
};

/** Campos necessários para regenerar o jogador no boot (sem lixo de runtime). */
const PLAYER_WORLD_KEYS = [
  'playerId',
  'name',
  'pos',
  'age',
  'overall',
  'potential',
  'height',
  'preferredFoot',
  'personality',
  'number',
  'injuryProneness',
  'fatigue',
  'dribble',
  'speed',
  'marking',
  'tackling',
  'finishing',
  'passing',
  'heading',
  'positioning',
  'penaltySaving',
  'reflexes',
  'freeKick',
  'penaltyTaking',
  'playmaking',
  'marketValue',
  'wage',
  'contractUntil',
  'listed',
  'askingPrice',
  'loanListed',
  'onLoan',
  'loanFrom',
];

/** Serializa jogador para career.worldRosters (sem workload/histórico pesado). */
export function serializePlayerForWorld(player) {
  if (!player || typeof player !== 'object') return null;
  const out = {};
  PLAYER_WORLD_KEYS.forEach(key => {
    if (player[key] !== undefined && player[key] !== null) out[key] = player[key];
  });
  // Lesão ativa (compacta) — histórico longo fica só no userRoster.
  if (player.injury && Number(player.injury.daysRemaining) > 0) {
    out.injury = {
      name: player.injury.name,
      type: player.injury.type,
      bodyPart: player.injury.bodyPart,
      daysRemaining: player.injury.daysRemaining,
      totalDays: player.injury.totalDays,
      treatment: player.injury.treatment,
      surgery: !!player.injury.surgery,
    };
  }
  return out;
}

/** Normaliza jogador hidratado do save. */
export function hydratePlayer(raw, context = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const player = {
    injuryHistory: [],
    workload: { ...WORKLOAD_DEFAULT },
    ...raw,
    fatigue: Number.isFinite(Number(raw.fatigue)) ? Number(raw.fatigue) : 100,
  };
  ensurePlayerId(player, context);
  ensureMarketFields(player, {
    division: context.division,
    season: context.season,
  });
  return player;
}

/**
 * Snapshot enxuto de elencos para o career save.
 * @param {Record<string, { roster?: object[], division?: string }>} clubs
 * @param {{ skipClub?: string|null }} [options] — omitir clube do usuário (já vai em userRoster)
 */
export function collectWorldRosters(clubs, options = {}) {
  const skip = options.skipClub || null;
  const out = {};
  Object.entries(clubs || {}).forEach(([clubName, club]) => {
    if (skip && clubName === skip) return;
    if (!Array.isArray(club?.roster) || !club.roster.length) return;
    out[clubName] = club.roster.map(serializePlayerForWorld).filter(Boolean);
  });
  return out;
}

/**
 * Aplica worldRosters salvos sobre clubs já criados.
 * @returns {number} clubes restaurados
 */
export function applyWorldRosters(clubs, worldRosters, context = {}) {
  if (!clubs || !worldRosters || typeof worldRosters !== 'object') return 0;
  let restored = 0;
  Object.entries(worldRosters).forEach(([clubName, roster]) => {
    const club = clubs[clubName];
    if (!club || !Array.isArray(roster) || roster.length < 11) return;
    club.roster = roster
      .map((raw, index) =>
        hydratePlayer(raw, {
          seed: context.seed,
          club: clubName,
          index,
          division: club.division || context.division,
          season: context.season,
        }),
      )
      .filter(Boolean);
    restored += 1;
  });
  return restored;
}

/**
 * Garante playerId + campos de mercado em todos os elencos vivos.
 */
export function stampWorldPlayers(clubs, context = {}) {
  let seq = 0;
  Object.entries(clubs || {}).forEach(([clubName, club]) => {
    if (!Array.isArray(club?.roster)) return;
    club.roster.forEach((player, index) => {
      ensurePlayerId(player, {
        seed: context.seed,
        club: clubName,
        index: index + seq,
      });
      ensureMarketFields(player, {
        division: club.division || 'D',
        season: context.season,
      });
    });
    seq += club.roster.length;
  });
}
