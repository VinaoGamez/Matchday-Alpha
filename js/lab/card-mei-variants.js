/**
 * Banco de artes PNG — meia (693×1024).
 */

import art01 from '../../assets/cards/mei/card-mei-01.png';
import art02 from '../../assets/cards/mei/card-mei-02.png';
import art03 from '../../assets/cards/mei/card-mei-03.png';
import art04 from '../../assets/cards/mei/card-mei-04.png';
import art05 from '../../assets/cards/mei/card-mei-05.png';
import art06 from '../../assets/cards/mei/card-mei-06.png';
import art07 from '../../assets/cards/mei/card-mei-07.png';
import art08 from '../../assets/cards/mei/card-mei-08.png';
import art09 from '../../assets/cards/mei/card-mei-09.png';
import art10 from '../../assets/cards/mei/card-mei-10.png';

export const MEI_CARD_VARIANTS = [
  { id: 'mei-01', label: '01 · Drible roxo', art: art01 },
  { id: 'mei-02', label: '02 · Condução listrada', art: art02 },
  { id: 'mei-03', label: '03 · Chute teal', art: art03 },
  { id: 'mei-04', label: '04 · Condução azul', art: art04 },
  { id: 'mei-05', label: '05 · Chute verde', art: art05 },
  { id: 'mei-06', label: '06 · Drible amarelo', art: art06 },
  { id: 'mei-07', label: '07 · Condução vinho', art: art07 },
  { id: 'mei-08', label: '08 · Drible preto', art: art08 },
  { id: 'mei-09', label: '09 · Chute magenta', art: art09 },
  { id: 'mei-10', label: '10 · Chute branco', art: art10 },
];

const STORAGE_KEY = 'matchday-card-mei-variant';
const DELETED_STORAGE_KEY = 'matchday-card-mei-deleted';

function readDeletedIds() {
  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(id => MEI_CARD_VARIANTS.some(v => v.id === id)));
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

export function loadDeletedMeiVariantIds() {
  return [...readDeletedIds()];
}

export function visibleMeiVariants() {
  const deleted = readDeletedIds();
  return MEI_CARD_VARIANTS.filter(v => !deleted.has(v.id));
}

export function defaultMeiVariantId() {
  return visibleMeiVariants()[0]?.id || MEI_CARD_VARIANTS[0]?.id || 'mei-01';
}

export function meiVariantById(id) {
  const visible = visibleMeiVariants();
  return visible.find(v => v.id === id) || visible[0] || MEI_CARD_VARIANTS[0];
}

export function loadMeiVariantId() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && visibleMeiVariants().some(v => v.id === saved)) return saved;
  } catch {
    /* ignore */
  }
  return defaultMeiVariantId();
}

export function saveMeiVariantId(id) {
  if (!visibleMeiVariants().some(v => v.id === id)) return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function meiArtForId(id) {
  return meiVariantById(id).art;
}

export function deleteMeiVariant(id) {
  const variant = MEI_CARD_VARIANTS.find(v => v.id === id);
  if (!variant) return { ok: false, reason: 'not-found' };

  const visible = visibleMeiVariants();
  if (visible.length <= 1) return { ok: false, reason: 'last-variant' };
  if (!visible.some(v => v.id === id)) return { ok: false, reason: 'already-deleted' };

  const deleted = readDeletedIds();
  deleted.add(id);
  writeDeletedIds(deleted);

  const next = visibleMeiVariants().find(v => v.id !== id) || defaultMeiVariantId();
  saveMeiVariantId(next.id);
  return { ok: true, nextId: next.id };
}

export function restoreAllMeiVariants() {
  try {
    localStorage.removeItem(DELETED_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
