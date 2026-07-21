/**
 * Resolução de tier visual (1–8) — compatível com setores permitidos por divisão.
 */
import {
  getSectorLevel,
  getSectorStructureLevel,
  divisionAllowsSector,
  STADIUM_STRUCTURE_LABELS,
} from '../../engine/stadium-sectors.js';

export { STADIUM_STRUCTURE_LABELS };

export const STADIUM_VISUAL_TIERS = [
  {
    tier: 1,
    id: 'campo-basico',
    label: 'Campo básico',
    hint: 'Estrutura básica · setor popular inicial',
    unlock: 'Início de carreira — apenas arquibancada popular.',
  },
  {
    tier: 2,
    id: 'estadio-regular',
    label: 'Estádio regular',
    hint: 'Estrutura regular · expandir popular',
    unlock: 'Invista na estrutura (nível 1).',
  },
  {
    tier: 3,
    id: 'expansao-popular',
    label: 'Expansão popular',
    hint: 'Estrutura intermediária · popular cresce',
    unlock: 'Estrutura nível 2 — destrava arquibancada.',
  },
  {
    tier: 4,
    id: 'arena-intermediaria',
    label: 'Arena intermediária',
    hint: 'Arquibancadas laterais ativas',
    unlock: 'Arquibancada nível 1+ com estrutura 2.',
  },
  {
    tier: 5,
    id: 'estadio-moderno',
    label: 'Estádio moderno',
    hint: 'Próximo patamar — cadeiras ou arquibancada ampliada',
    unlock: 'Estrutura 3 + cadeiras (A/B/C) ou arquibancada (D).',
  },
  {
    tier: 6,
    id: 'arena-avancada',
    label: 'Arena avançada',
    hint: 'Múltiplos setores · quase completo',
    unlock: 'Estrutura 4 ou setor principal no máximo.',
  },
  {
    tier: 7,
    id: 'arena-premium',
    label: 'Arena premium',
    hint: 'Cobertura total · naming elegível (A/B)',
    unlock: 'Estrutura 5 — arena premium.',
  },
  {
    tier: 8,
    id: 'arena-maxima',
    label: 'Arena máxima',
    hint: 'Camarotes + VIP · flagship',
    unlock: 'Estrutura 5 + camarotes ou VIP (A/B).',
  },
];

export function tierMeta(tier) {
  return STADIUM_VISUAL_TIERS.find(row => row.tier === tier) || STADIUM_VISUAL_TIERS[0];
}

/** Teto de tier visual por divisão (setores premium inexistentes em C/D). */
export function maxStadiumVisualTier(division = 'A') {
  if (divisionAllowsSector(division, 'boxes') || divisionAllowsSector(division, 'vip')) return 8;
  return 7;
}

/** Texto de desbloqueio do próximo tier — adaptado à série. */
export function nextTierUnlock(currentTier, division = 'A') {
  const max = maxStadiumVisualTier(division);
  const next = currentTier + 1;
  if (currentTier >= max) return null;

  const canSeats = divisionAllowsSector(division, 'seats');
  const canBoxes = divisionAllowsSector(division, 'boxes');
  const canVip = divisionAllowsSector(division, 'vip');

  const byTier = {
    2: 'Invista na estrutura (nível 1).',
    3: 'Estrutura nível 2 — destrava arquibancada.',
    4: 'Arquibancada nível 1+ com estrutura 2.',
    5: canSeats ? 'Estrutura 3 + cadeiras numeradas.' : 'Estrutura 3 + arquibancada ampliada.',
    6: canSeats ? 'Estrutura 4 ou cadeiras no máximo.' : 'Estrutura 4 ou arquibancada nível 2+.',
    7: 'Estrutura 5 — arena premium.',
    8: canVip ? 'Estrutura 5 + camarotes ou VIP.' : canBoxes ? 'Estrutura 5 + camarotes.' : null,
  };

  return byTier[next] || tierMeta(next).unlock;
}

/**
 * Resolve tier visual (1–8) a partir do estado do clube e da divisão.
 * Tiers 5–6 usam cadeiras (A/B/C) ou arquibancada (D); tier 8 só A/B.
 */
export function resolveStadiumVisualTier(club, division = club?.division || 'A') {
  if (!club) return 1;

  const div = division || club.division || 'A';
  const structure = getSectorStructureLevel(club);
  const popular = getSectorLevel(club, 'popular');
  const stands = getSectorLevel(club, 'stands');
  const seats = getSectorLevel(club, 'seats');
  const boxes = getSectorLevel(club, 'boxes');
  const vip = getSectorLevel(club, 'vip');

  const canSeats = divisionAllowsSector(div, 'seats');
  const canBoxes = divisionAllowsSector(div, 'boxes');
  const canVip = divisionAllowsSector(div, 'vip');

  let tier = 1;

  if (structure >= 5) {
    if ((canVip && vip >= 1) || (canBoxes && boxes >= 1)) tier = 8;
    else tier = 7;
  } else if (canSeats && (structure >= 4 || (structure >= 3 && seats >= 2))) {
    tier = 6;
  } else if (!canSeats && (structure >= 4 || (structure >= 3 && stands >= 2))) {
    tier = 6;
  } else if (canSeats && structure >= 3 && seats >= 1) {
    tier = 5;
  } else if (!canSeats && structure >= 3 && stands >= 1) {
    tier = 5;
  } else if (structure >= 2 && stands >= 1) {
    tier = 4;
  } else if (structure >= 2 || popular >= 2) {
    tier = 3;
  } else if (structure >= 1) {
    tier = 2;
  }

  return Math.min(tier, maxStadiumVisualTier(div));
}

export function sectorCaption(club) {
  const parts = [];
  const popular = getSectorLevel(club, 'popular');
  const stands = getSectorLevel(club, 'stands');
  const seats = getSectorLevel(club, 'seats');
  const boxes = getSectorLevel(club, 'boxes');
  const vip = getSectorLevel(club, 'vip');
  if (popular) parts.push(`popular ${popular}`);
  if (stands) parts.push(`arquib. ${stands}`);
  if (seats) parts.push(`cadeiras ${seats}`);
  if (boxes) parts.push(`camarotes ${boxes}`);
  if (vip) parts.push('VIP');
  return parts.join(' · ');
}
