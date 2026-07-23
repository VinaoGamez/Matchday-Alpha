/**
 * Banco de artes PNG — zagueiro (693×1024).
 */

import art01 from '../../assets/cards/zagueiro/card-zagueiro-01.png';
import art02 from '../../assets/cards/zagueiro/card-zagueiro-02.png';
import art05 from '../../assets/cards/zagueiro/card-zagueiro-05.png';
import art06 from '../../assets/cards/zagueiro/card-zagueiro-06.png';
import art07 from '../../assets/cards/zagueiro/card-zagueiro-07.png';
import art10 from '../../assets/cards/zagueiro/card-zagueiro-10.png';
import art11 from '../../assets/cards/zagueiro/card-zagueiro-11.png';
import art12 from '../../assets/cards/zagueiro/card-zagueiro-12.png';
import art13 from '../../assets/cards/zagueiro/card-zagueiro-13.png';
import art14 from '../../assets/cards/zagueiro/card-zagueiro-14.png';

export const ZAGUEIRO_CARD_VARIANTS = [
  { id: 'zag-01', label: '01 · Marcação azul', art: art01 },
  { id: 'zag-02', label: '02 · Cabeceio', art: art02 },
  { id: 'zag-05', label: '05 · Chute preto', art: art05 },
  { id: 'zag-06', label: '06 · Posse laranja', art: art06 },
  { id: 'zag-07', label: '07 · Domínio peito', art: art07 },
  { id: 'zag-10', label: '10 · Condução teal', art: art10 },
  { id: 'zag-11', label: '11 · Bloqueio branco', art: art11 },
  { id: 'zag-12', label: '12 · Cabeceio teal', art: art12 },
  { id: 'zag-13', label: '13 · Condução laranja', art: art13 },
  { id: 'zag-14', label: '14 · Condução roxa', art: art14 },
];

const STORAGE_KEY = 'matchday-card-zag-variant';
const DELETED_STORAGE_KEY = 'matchday-card-zag-deleted';

function readDeletedIds() {
  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(id => ZAGUEIRO_CARD_VARIANTS.some(v => v.id === id)));
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

export function loadDeletedZagueiroVariantIds() {
  return [...readDeletedIds()];
}

export function visibleZagueiroVariants() {
  const deleted = readDeletedIds();
  return ZAGUEIRO_CARD_VARIANTS.filter(v => !deleted.has(v.id));
}

export function defaultZagueiroVariantId() {
  return visibleZagueiroVariants()[0]?.id || ZAGUEIRO_CARD_VARIANTS[0]?.id || 'zag-01';
}

export function zagueiroVariantById(id) {
  const visible = visibleZagueiroVariants();
  return visible.find(v => v.id === id) || visible[0] || ZAGUEIRO_CARD_VARIANTS[0];
}

export function loadZagueiroVariantId() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && visibleZagueiroVariants().some(v => v.id === saved)) return saved;
  } catch {
    /* ignore */
  }
  return defaultZagueiroVariantId();
}

export function saveZagueiroVariantId(id) {
  if (!visibleZagueiroVariants().some(v => v.id === id)) return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function zagueiroArtForId(id) {
  return zagueiroVariantById(id).art;
}

export function deleteZagueiroVariant(id) {
  const variant = ZAGUEIRO_CARD_VARIANTS.find(v => v.id === id);
  if (!variant) return { ok: false, reason: 'not-found' };

  const visible = visibleZagueiroVariants();
  if (visible.length <= 1) return { ok: false, reason: 'last-variant' };
  if (!visible.some(v => v.id === id)) return { ok: false, reason: 'already-deleted' };

  const deleted = readDeletedIds();
  deleted.add(id);
  writeDeletedIds(deleted);

  const next = visibleZagueiroVariants().find(v => v.id !== id) || defaultZagueiroVariantId();
  saveZagueiroVariantId(next.id);
  return { ok: true, nextId: next.id };
}

export function restoreAllZagueiroVariants() {
  try {
    localStorage.removeItem(DELETED_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
