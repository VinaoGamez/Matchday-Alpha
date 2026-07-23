/**
 * Banco de artes PNG — lateral (693×1024).
 */

import art01 from '../../assets/cards/lateral/card-lateral-01.png';
import art02 from '../../assets/cards/lateral/card-lateral-02.png';
import art03 from '../../assets/cards/lateral/card-lateral-03.png';
import art05 from '../../assets/cards/lateral/card-lateral-05.png';
import art06 from '../../assets/cards/lateral/card-lateral-06.png';
import art07 from '../../assets/cards/lateral/card-lateral-07.png';
import art08 from '../../assets/cards/lateral/card-lateral-08.png';
import art10 from '../../assets/cards/lateral/card-lateral-10.png';

export const LATERAL_CARD_VARIANTS = [
  { id: 'lat-01', label: '01 · Sprint laranja', art: art01 },
  { id: 'lat-02', label: '02 · Cruzamento', art: art02 },
  { id: 'lat-03', label: '03 · Carrinho', art: art03 },
  { id: 'lat-05', label: '05 · Drible vermelho', art: art05 },
  { id: 'lat-06', label: '06 · Lateralização', art: art06 },
  { id: 'lat-07', label: '07 · Sprint amarelo', art: art07 },
  { id: 'lat-08', label: '08 · Sprint preto', art: art08 },
  { id: 'lat-10', label: '10 · Posse de bola', art: art10 },
];

const STORAGE_KEY = 'matchday-card-lat-variant';
const DELETED_STORAGE_KEY = 'matchday-card-lat-deleted';

function readDeletedIds() {
  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(id => LATERAL_CARD_VARIANTS.some(v => v.id === id)));
  } catch {
    return new Set();
  }
}

function writeDeletedIds(set) {
  try {
    localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

export function loadDeletedLateralVariantIds() {
  return [...readDeletedIds()];
}

export function visibleLateralVariants() {
  const deleted = readDeletedIds();
  return LATERAL_CARD_VARIANTS.filter(v => !deleted.has(v.id));
}

export function defaultLateralVariantId() {
  return visibleLateralVariants()[0]?.id || LATERAL_CARD_VARIANTS[0]?.id || 'lat-01';
}

export function lateralVariantById(id) {
  const visible = visibleLateralVariants();
  return visible.find(v => v.id === id) || visible[0] || LATERAL_CARD_VARIANTS[0];
}

export function loadLateralVariantId() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && visibleLateralVariants().some(v => v.id === saved)) return saved;
  } catch {
    /* ignore */
  }
  return defaultLateralVariantId();
}

export function saveLateralVariantId(id) {
  if (!visibleLateralVariants().some(v => v.id === id)) return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function lateralArtForId(id) {
  return lateralVariantById(id).art;
}

export function deleteLateralVariant(id) {
  const variant = LATERAL_CARD_VARIANTS.find(v => v.id === id);
  if (!variant) return { ok: false, reason: 'not-found' };

  const visible = visibleLateralVariants();
  if (visible.length <= 1) return { ok: false, reason: 'last-variant' };
  if (!visible.some(v => v.id === id)) return { ok: false, reason: 'already-deleted' };

  const deleted = readDeletedIds();
  deleted.add(id);
  writeDeletedIds(deleted);

  const next = visibleLateralVariants().find(v => v.id !== id) || defaultLateralVariantId();
  saveLateralVariantId(next.id);
  return { ok: true, nextId: next.id };
}

export function restoreAllLateralVariants() {
  try {
    localStorage.removeItem(DELETED_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
