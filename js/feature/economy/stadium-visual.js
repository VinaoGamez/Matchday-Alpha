/**
 * Visual do estádio — ilustrações WebP por tier (1–8).
 */
import {
  resolveStadiumVisualTier,
  tierMeta,
  sectorCaption,
  nextTierUnlock,
  maxStadiumVisualTier,
  STADIUM_STRUCTURE_LABELS,
} from './stadium-visual-tier.js';
import { getSectorStructureLevel } from '../../engine/stadium-sectors.js';

export {
  resolveStadiumVisualTier,
  STADIUM_VISUAL_TIERS,
  maxStadiumVisualTier,
  nextTierUnlock,
} from './stadium-visual-tier.js';

const STADIUM_TIER_IMAGES = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../../assets/stadium/stadium-*-tier-*.webp', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  ).map(([path, url]) => {
    const match = path.match(/stadium-([a-d])-tier-(\d+)\.webp$/i);
    if (!match) return null;
    return [`${match[1].toUpperCase()}:${Number(match[2])}`, url];
  }).filter(Boolean),
);

function stadiumImageUrl(division, tier) {
  const div = String(division || 'A').toUpperCase();
  return STADIUM_TIER_IMAGES[`${div}:${tier}`] || STADIUM_TIER_IMAGES[`${div}:1`];
}

/** HTML da ilustração + legenda. */
export function buildStadiumVisualHtml(club, division, { getStructureLevel, getPitchLevel } = {}) {
  if (!club) return '';

  const div = division || club.division || 'A';
  const tier = resolveStadiumVisualTier(club, div);
  const maxTier = maxStadiumVisualTier(div);
  const meta = tierMeta(tier);
  const structure = getStructureLevel?.(club) ?? getSectorStructureLevel(club);
  const structureLabel = STADIUM_STRUCTURE_LABELS[structure] || STADIUM_STRUCTURE_LABELS[0];
  const imageUrl = stadiumImageUrl(div, tier);
  const sectors = sectorCaption(club);
  const pitch = getPitchLevel?.(club) ?? 1;
  const unlock = nextTierUnlock(tier, div);
  const nextLine =
    tier >= maxTier
      ? `Arena no nível visual máximo para a Série ${div}.`
      : `Próximo visual: ${tierMeta(tier + 1).label} — ${unlock}`;

  return `<div class="stadium-visual stadium-visual--tier-${tier}" data-tier="${tier}" data-structure="${structure}" data-division="${div}" role="img" aria-label="${meta.label}">
    <div class="stadium-visual-frame">
      <img class="stadium-visual-img" src="${imageUrl}" alt="${meta.label}" width="640" height="360" loading="lazy" decoding="async"/>
      <div class="stadium-visual-badge"><span>TIER ${tier}/${maxTier} · Série ${div}</span><strong>${meta.label.toUpperCase()}</strong></div>
    </div>
    <p class="stadium-visual-caption">${meta.hint} · ${structureLabel} (${structure}/5) · gramado nível ${pitch}${sectors ? ` · ${sectors}` : ''}</p>
    <p class="stadium-visual-next">${nextLine}</p>
  </div>`;
}

export function mountStadiumVisual(container, club, division, helpers) {
  if (!container) return;
  const div = division || club?.division || 'A';
  const tier = resolveStadiumVisualTier(club, div);
  const prevTier = Number(container.dataset.lastTier || 0);
  container.dataset.lastTier = String(tier);
  container.innerHTML = buildStadiumVisualHtml(club, div, helpers);
  if (prevTier && prevTier !== tier) {
    const root = container.querySelector('.stadium-visual');
    root?.classList.add('stadium-visual--upgraded');
    window.setTimeout(() => root?.classList.remove('stadium-visual--upgraded'), 700);
  }
}
