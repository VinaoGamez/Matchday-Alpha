/**
 * Resolução de tier visual (1–8) — puro, testável sem Vite.
 */
import { getSectorLevel, getSectorStructureLevel, STADIUM_STRUCTURE_LABELS } from '../../engine/stadium-sectors.js';

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
    hint: 'Cadeiras numeradas · cobertura parcial',
    unlock: 'Estrutura 3 + cadeiras numeradas.',
  },
  {
    tier: 6,
    id: 'arena-avancada',
    label: 'Arena avançada',
    hint: 'Múltiplos setores · quase completo',
    unlock: 'Estrutura 4 ou cadeiras no máximo.',
  },
  {
    tier: 7,
    id: 'arena-premium',
    label: 'Arena premium',
    hint: 'Cobertura total · naming elegível',
    unlock: 'Estrutura 5 — arena premium.',
  },
  {
    tier: 8,
    id: 'arena-maxima',
    label: 'Arena máxima',
    hint: 'Camarotes + VIP · flagship',
    unlock: 'Estrutura 5 + camarotes ou VIP.',
  },
];

export function tierMeta(tier) {
  return STADIUM_VISUAL_TIERS.find(row => row.tier === tier) || STADIUM_VISUAL_TIERS[0];
}

/** Resolve tier visual (1–8) a partir do estado do clube. */
export function resolveStadiumVisualTier(club) {
  if (!club) return 1;

  const structure = getSectorStructureLevel(club);
  const popular = getSectorLevel(club, 'popular');
  const stands = getSectorLevel(club, 'stands');
  const seats = getSectorLevel(club, 'seats');
  const boxes = getSectorLevel(club, 'boxes');
  const vip = getSectorLevel(club, 'vip');

  if (structure >= 5 && (boxes >= 1 || vip >= 1)) return 8;
  if (structure >= 5) return 7;
  if (structure >= 4 || (structure >= 3 && seats >= 2)) return 6;
  if (structure >= 3 && seats >= 1) return 5;
  if (structure >= 2 && stands >= 1) return 4;
  if (structure >= 2 || popular >= 2) return 3;
  if (structure >= 1) return 2;
  return 1;
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
