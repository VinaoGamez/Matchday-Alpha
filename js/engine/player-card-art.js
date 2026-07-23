/**
 * Arte do card por jogador — função + variante estável.
 */

import { POS_TO_ROLE_KEY } from '../lab/player-card-system.js';
import { cardVariantApi } from '../lab/card-variants.js';
import { resolvePlayerId } from './player-identity.js';

function hashString(text = '') {
  let hash = 2166136261;
  const str = String(text);
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seedText, salt = '') {
  return hashString(`${seedText}:${salt}`) / 4294967295;
}

/** Posição exibida no card — pontas usam PD/PE conforme o pé. */
export function cardDisplayPos(player) {
  const pos = String(player?.pos || '').toUpperCase();
  if (pos === 'PD' || pos === 'PE') return pos;
  if (pos !== 'PON') return pos || 'GOL';

  const foot = String(player?.preferredFoot || '').toLowerCase();
  if (foot.includes('esquer')) return 'PE';
  if (foot.includes('direit')) return 'PD';
  if (foot.includes('ambi')) return seededUnit(resolvePlayerId(player) || player?.name, 'pon-side') < 0.5 ? 'PE' : 'PD';
  return 'PD';
}

/** Bloco de arte PNG (GOL/LAT/ZAG/MC/MEI/VOL/ponta/ATA). */
export function resolveCardRoleKey(player) {
  const pos = cardDisplayPos(player);
  return POS_TO_ROLE_KEY[pos] || POS_TO_ROLE_KEY[player?.pos] || 'goleiro';
}

/** Variante estável por jogador dentro do pool da função. */
export function ensureCardVariantId(player, random = Math.random) {
  if (!player || typeof player !== 'object') return null;
  const roleKey = resolveCardRoleKey(player);
  const api = cardVariantApi(roleKey);
  const variants = api.visibleVariants();
  if (!variants.length) return null;

  if (player.cardVariantId && variants.some(v => v.id === player.cardVariantId)) {
    return player.cardVariantId;
  }

  const seed = resolvePlayerId(player) || `${player.name}:${player.pos}:${player.age}`;
  const idx = Math.floor(seededUnit(seed, roleKey) * variants.length);
  player.cardVariantId = variants[idx]?.id || variants[0].id;
  return player.cardVariantId;
}

export function cardArtForPlayer(player, random = Math.random) {
  const roleKey = resolveCardRoleKey(player);
  const api = cardVariantApi(roleKey);
  const variantId = ensureCardVariantId(player, random);
  return api.artForId(variantId);
}
