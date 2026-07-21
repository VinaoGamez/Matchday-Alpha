/**
 * Visual do estádio — ilustrações PNG por tier (1–8).
 */
import {
  resolveStadiumVisualTier,
  tierMeta,
  sectorCaption,
  STADIUM_STRUCTURE_LABELS,
} from './stadium-visual-tier.js';
import { getSectorStructureLevel } from '../../engine/stadium-sectors.js';

export { resolveStadiumVisualTier, STADIUM_VISUAL_TIERS } from './stadium-visual-tier.js';

const STADIUM_TIER_IMAGES = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../../assets/stadium/stadium-tier-*.webp', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  ).map(([path, url]) => {
    const match = path.match(/stadium-tier-(\d+)\.webp$/i);
    return [match ? Number(match[1]) : 0, url];
  }),
);

/** HTML da ilustração + legenda. */
export function buildStadiumVisualHtml(club, division, { getStructureLevel, getPitchLevel } = {}) {
  if (!club) return '';

  const tier = resolveStadiumVisualTier(club);
  const meta = tierMeta(tier);
  const structure = getStructureLevel?.(club) ?? getSectorStructureLevel(club);
  const structureLabel = STADIUM_STRUCTURE_LABELS[structure] || STADIUM_STRUCTURE_LABELS[0];
  const imageUrl = STADIUM_TIER_IMAGES[tier] || STADIUM_TIER_IMAGES[1];
  const sectors = sectorCaption(club);
  const pitch = getPitchLevel?.(club) ?? 1;

  return `<div class="stadium-visual stadium-visual--tier-${tier}" data-tier="${tier}" data-structure="${structure}" data-division="${division}" role="img" aria-label="${meta.label}">
    <div class="stadium-visual-frame">
      <img class="stadium-visual-img" src="${imageUrl}" alt="${meta.label}" width="640" height="360" loading="lazy" decoding="async"/>
      <div class="stadium-visual-badge"><span>TIER ${tier}</span><strong>${meta.label.toUpperCase()}</strong></div>
    </div>
    <p class="stadium-visual-caption">${meta.hint} · ${structureLabel} (${structure}/5) · gramado nível ${pitch}${sectors ? ` · ${sectors}` : ''}</p>
    <p class="stadium-visual-next">${tier < 8 ? `Próximo visual: ${tierMeta(tier + 1).label} — ${tierMeta(tier + 1).unlock}` : 'Arena no nível visual máximo.'}</p>
  </div>`;
}

export function mountStadiumVisual(container, club, division, helpers) {
  if (!container) return;
  const tier = resolveStadiumVisualTier(club);
  const prevTier = Number(container.dataset.lastTier || 0);
  container.dataset.lastTier = String(tier);
  container.innerHTML = buildStadiumVisualHtml(club, division, helpers);
  if (prevTier && prevTier !== tier) {
    const root = container.querySelector('.stadium-visual');
    root?.classList.add('stadium-visual--upgraded');
    window.setTimeout(() => root?.classList.remove('stadium-visual--upgraded'), 700);
  }
}
