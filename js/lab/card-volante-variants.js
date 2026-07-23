/**
 * Banco de artes PNG — volante (693×1024).
 */

import art01 from '../../assets/cards/volante/card-volante-01.png';
import art02 from '../../assets/cards/volante/card-volante-02.png';
import art04 from '../../assets/cards/volante/card-volante-04.png';
import art05 from '../../assets/cards/volante/card-volante-05.png';
import art06 from '../../assets/cards/volante/card-volante-06.png';
import art07 from '../../assets/cards/volante/card-volante-07.png';
import art09 from '../../assets/cards/volante/card-volante-09.png';
import art10 from '../../assets/cards/volante/card-volante-10.png';

export const VOLANTE_CARD_VARIANTS = [
  { id: 'vol-01', label: '01 · Carrinho amarelo', art: art01 },
  { id: 'vol-02', label: '02 · Condução navy', art: art02 },
  { id: 'vol-04', label: '04 · Condução verde', art: art04 },
  { id: 'vol-05', label: '05 · Chute vinho', art: art05 },
  { id: 'vol-06', label: '06 · Cabeceio azul', art: art06 },
  { id: 'vol-07', label: '07 · Condução laranja', art: art07 },
  { id: 'vol-09', label: '09 · Drible roxo', art: art09 },
  { id: 'vol-10', label: '10 · Condução listrada', art: art10 },
];

const STORAGE_KEY = 'matchday-card-vol-variant';
const DELETED_STORAGE_KEY = 'matchday-card-vol-deleted';

function readDeletedIds() {
  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(id => VOLANTE_CARD_VARIANTS.some(v => v.id === id)));
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

export function loadDeletedVolanteVariantIds() {
  return [...readDeletedIds()];
}

export function visibleVolanteVariants() {
  const deleted = readDeletedIds();
  return VOLANTE_CARD_VARIANTS.filter(v => !deleted.has(v.id));
}

export function defaultVolanteVariantId() {
  return visibleVolanteVariants()[0]?.id || VOLANTE_CARD_VARIANTS[0]?.id || 'vol-01';
}

export function volanteVariantById(id) {
  const visible = visibleVolanteVariants();
  return visible.find(v => v.id === id) || visible[0] || VOLANTE_CARD_VARIANTS[0];
}

export function loadVolanteVariantId() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && visibleVolanteVariants().some(v => v.id === saved)) return saved;
  } catch {
    /* ignore */
  }
  return defaultVolanteVariantId();
}

export function saveVolanteVariantId(id) {
  if (!visibleVolanteVariants().some(v => v.id === id)) return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function volanteArtForId(id) {
  return volanteVariantById(id).art;
}

export function deleteVolanteVariant(id) {
  const variant = VOLANTE_CARD_VARIANTS.find(v => v.id === id);
  if (!variant) return { ok: false, reason: 'not-found' };

  const visible = visibleVolanteVariants();
  if (visible.length <= 1) return { ok: false, reason: 'last-variant' };
  if (!visible.some(v => v.id === id)) return { ok: false, reason: 'already-deleted' };

  const deleted = readDeletedIds();
  deleted.add(id);
  writeDeletedIds(deleted);

  const next = visibleVolanteVariants().find(v => v.id !== id) || defaultVolanteVariantId();
  saveVolanteVariantId(next.id);
  return { ok: true, nextId: next.id };
}

export function restoreAllVolanteVariants() {
  try {
    localStorage.removeItem(DELETED_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
