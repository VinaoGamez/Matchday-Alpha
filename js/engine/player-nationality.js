/**
 * Nacionalidade dos jogadores — regras de elenco por divisão.
 */

import { isoForNationality } from '../lab/card-nation-flags.js';
import { ensureForeignPlayerNames } from './player-names.js';

export const BRAZIL_NATION = 'Brasil';

export const FOREIGN_NATIONS = [
  'Argentina',
  'Uruguai',
  'Paraguai',
  'Colombia',
  'Venezuela',
  'Equador',
  'Chile',
];

export const MAX_FOREIGNERS_PER_SQUAD = 5;

const FOREIGN_COUNT_WEIGHTS = {
  A: [
    { count: 0, w: 4 },
    { count: 1, w: 6 },
    { count: 2, w: 14 },
    { count: 3, w: 22 },
    { count: 4, w: 26 },
    { count: 5, w: 28 },
  ],
  B: [
    { count: 0, w: 8 },
    { count: 1, w: 12 },
    { count: 2, w: 22 },
    { count: 3, w: 26 },
    { count: 4, w: 20 },
    { count: 5, w: 12 },
  ],
  C: [
    { count: 0, w: 58 },
    { count: 1, w: 28 },
    { count: 2, w: 14 },
  ],
  D: [
    { count: 0, w: 72 },
    { count: 1, w: 22 },
    { count: 2, w: 6 },
  ],
};

function pickWeighted(items, random) {
  const total = items.reduce((sum, row) => sum + row.w, 0);
  let roll = random() * total;
  for (const row of items) {
    roll -= row.w;
    if (roll <= 0) return row.count;
  }
  return items[items.length - 1]?.count ?? 0;
}

function shuffleIndices(size, random) {
  const order = Array.from({ length: size }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function pickForeignNation(random) {
  const idx = Math.floor(random() * FOREIGN_NATIONS.length);
  return FOREIGN_NATIONS[idx];
}

/** Aplica nacionalidades a um elenco inteiro (máx. 5 estrangeiros). */
export function assignRosterNationalities(roster, division = 'A', random = Math.random) {
  if (!Array.isArray(roster) || !roster.length) return roster;

  const weights = FOREIGN_COUNT_WEIGHTS[division] || FOREIGN_COUNT_WEIGHTS.D;
  const cap = Math.min(MAX_FOREIGNERS_PER_SQUAD, roster.length - 1);
  let foreignCount = Math.min(pickWeighted(weights, random), cap);

  const foreignSlots = new Set(shuffleIndices(roster.length, random).slice(0, foreignCount));

  roster.forEach((player, index) => {
    if (!player || typeof player !== 'object') return;
    if (foreignSlots.has(index)) {
      player.nationality = pickForeignNation(random);
    } else {
      player.nationality = BRAZIL_NATION;
    }
    player.nationalityIso = isoForNationality(player.nationality) || undefined;
  });

  ensureForeignPlayerNames(roster, { random });

  return roster;
}

/** Preenche nacionalidade ausente — elenco novo ou migração. */
export function ensureRosterNationalities(roster, division = 'A', random = Math.random) {
  if (!Array.isArray(roster) || !roster.length) return;
  const missing = roster.filter(p => p && !p.nationality);
  if (!missing.length) return;

  const hasAny = roster.some(p => p?.nationality);
  if (!hasAny) {
    assignRosterNationalities(roster, division, random);
    return;
  }

  missing.forEach(player => {
    player.nationality = BRAZIL_NATION;
    player.nationalityIso = isoForNationality(BRAZIL_NATION) || undefined;
  });
}

export function ensurePlayerNationality(player, division = 'A', random = Math.random) {
  if (!player || typeof player !== 'object') return player;
  if (player.nationality) {
    if (!player.nationalityIso) {
      player.nationalityIso = isoForNationality(player.nationality) || undefined;
    }
    return player;
  }
  player.nationality = random() < 0.8 ? BRAZIL_NATION : pickForeignNation(random);
  player.nationalityIso = isoForNationality(player.nationality) || undefined;
  return player;
}
