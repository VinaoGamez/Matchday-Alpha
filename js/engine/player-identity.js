/**
 * Identidade estável de jogador para mercado e histórico.
 */

/** Gera id imutável determinístico (seed + clube + índice). */
export function generatePlayerId({ seed = 0, club = '', index = 0 } = {}) {
  let hash = (Number(seed) || 0) ^ Math.imul(Number(index) || 0, 2654435761);
  const text = String(club || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `p-${(hash >>> 0).toString(36)}-${Number(index).toString(36)}`;
}

/** Garante playerId no objeto jogador (mutável). */
export function ensurePlayerId(player, context = {}) {
  if (!player || typeof player !== 'object') return player;
  if (player.playerId) return player;
  player.playerId = generatePlayerId({
    seed: context.seed,
    club: context.club || player.club || '',
    index: context.index ?? 0,
  });
  return player;
}

/** Resolve id de um jogador (preferência: playerId). */
export function resolvePlayerId(player) {
  if (!player) return null;
  if (typeof player === 'string') return player;
  return player.playerId || null;
}
