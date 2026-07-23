/**
 * Banco de artes PNG — meio-campo central (693×1024).
 */

import art01 from '../../assets/cards/mc/card-mc-01.png';
import art02 from '../../assets/cards/mc/card-mc-02.png';
import art03 from '../../assets/cards/mc/card-mc-03.png';
import art04 from '../../assets/cards/mc/card-mc-04.png';
import art05 from '../../assets/cards/mc/card-mc-05.png';
import art06 from '../../assets/cards/mc/card-mc-06.png';
import art07 from '../../assets/cards/mc/card-mc-07.png';
import art08 from '../../assets/cards/mc/card-mc-08.png';
import art09 from '../../assets/cards/mc/card-mc-09.png';
import art10 from '../../assets/cards/mc/card-mc-10.png';

export const MC_CARD_VARIANTS = [
  { id: 'mc-01', label: '01 · Condução azul', art: art01 },
  { id: 'mc-02', label: '02 · Condução branca', art: art02 },
  { id: 'mc-03', label: '03 · Condução verde', art: art03 },
  { id: 'mc-04', label: '04 · Condução vinho', art: art04 },
  { id: 'mc-05', label: '05 · Condução preta', art: art05 },
  { id: 'mc-06', label: '06 · Condução amarela', art: art06 },
  { id: 'mc-07', label: '07 · Condução laranja', art: art07 },
  { id: 'mc-08', label: '08 · Condução roxa', art: art08 },
  { id: 'mc-09', label: '09 · Condução vermelha', art: art09 },
  { id: 'mc-10', label: '10 · Chute teal', art: art10 },
];

const STORAGE_KEY = 'matchday-card-mc-variant';
const DELETED_STORAGE_KEY = 'matchday-card-mc-deleted';

function readDeletedIds() {
  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(id => MC_CARD_VARIANTS.some(v => v.id === id)));
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

export function loadDeletedMcVariantIds() {
  return [...readDeletedIds()];
}

export function visibleMcVariants() {
  const deleted = readDeletedIds();
  return MC_CARD_VARIANTS.filter(v => !deleted.has(v.id));
}

export function defaultMcVariantId() {
  return visibleMcVariants()[0]?.id || MC_CARD_VARIANTS[0]?.id || 'mc-01';
}

export function mcVariantById(id) {
  const visible = visibleMcVariants();
  return visible.find(v => v.id === id) || visible[0] || MC_CARD_VARIANTS[0];
}

export function loadMcVariantId() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && visibleMcVariants().some(v => v.id === saved)) return saved;
  } catch {
    /* ignore */
  }
  return defaultMcVariantId();
}

export function saveMcVariantId(id) {
  if (!visibleMcVariants().some(v => v.id === id)) return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function mcArtForId(id) {
  return mcVariantById(id).art;
}

export function deleteMcVariant(id) {
  const variant = MC_CARD_VARIANTS.find(v => v.id === id);
  if (!variant) return { ok: false, reason: 'not-found' };

  const visible = visibleMcVariants();
  if (visible.length <= 1) return { ok: false, reason: 'last-variant' };
  if (!visible.some(v => v.id === id)) return { ok: false, reason: 'already-deleted' };

  const deleted = readDeletedIds();
  deleted.add(id);
  writeDeletedIds(deleted);

  const next = visibleMcVariants().find(v => v.id !== id) || defaultMcVariantId();
  saveMcVariantId(next.id);
  return { ok: true, nextId: next.id };
}

export function restoreAllMcVariants() {
  try {
    localStorage.removeItem(DELETED_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
