/**
 * Banco de artes PNG — ponta (693×1024).
 * Pool único: qualquer arte serve PD, PE ou PONTA no jogo.
 */

import art01 from '../../assets/cards/ponta/card-ponta-01.png';
import art02 from '../../assets/cards/ponta/card-ponta-02.png';
import art03 from '../../assets/cards/ponta/card-ponta-03.png';
import art04 from '../../assets/cards/ponta/card-ponta-04.png';
import art05 from '../../assets/cards/ponta/card-ponta-05.png';
import art06 from '../../assets/cards/ponta/card-ponta-06.png';
import art07 from '../../assets/cards/ponta/card-ponta-07.png';
import art08 from '../../assets/cards/ponta/card-ponta-08.png';
import art09 from '../../assets/cards/ponta/card-ponta-09.png';
import art10 from '../../assets/cards/ponta/card-ponta-10.png';

export const PONTA_CARD_VARIANTS = [
  { id: 'pon-01', label: '01 · Chute teal', art: art01 },
  { id: 'pon-02', label: '02 · Drible branco', art: art02 },
  { id: 'pon-03', label: '03 · Cruzamento laranja', art: art03 },
  { id: 'pon-04', label: '04 · Condução azul', art: art04 },
  { id: 'pon-05', label: '05 · Drible vermelho', art: art05 },
  { id: 'pon-06', label: '06 · Sprint preto', art: art06 },
  { id: 'pon-07', label: '07 · Corrida navy', art: art07 },
  { id: 'pon-08', label: '08 · Sprint rosa', art: art08 },
  { id: 'pon-09', label: '09 · Drible roxo', art: art09 },
  { id: 'pon-10', label: '10 · Sprint amarelo', art: art10 },
];

const STORAGE_KEY = 'matchday-card-ponta-variant';
const DELETED_STORAGE_KEY = 'matchday-card-ponta-deleted';

function readDeletedIds() {
  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(id => PONTA_CARD_VARIANTS.some(v => v.id === id)));
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

export function loadDeletedPontaVariantIds() {
  return [...readDeletedIds()];
}

export function visiblePontaVariants() {
  const deleted = readDeletedIds();
  return PONTA_CARD_VARIANTS.filter(v => !deleted.has(v.id));
}

export function defaultPontaVariantId() {
  return visiblePontaVariants()[0]?.id || PONTA_CARD_VARIANTS[0]?.id || 'pon-01';
}

export function pontaVariantById(id) {
  const visible = visiblePontaVariants();
  return visible.find(v => v.id === id) || visible[0] || PONTA_CARD_VARIANTS[0];
}

export function loadPontaVariantId() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && visiblePontaVariants().some(v => v.id === saved)) return saved;
    for (const legacyKey of ['matchday-card-pd-variant', 'matchday-card-pe-variant']) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy && visiblePontaVariants().some(v => v.id === legacy)) return legacy;
    }
  } catch {
    /* ignore */
  }
  return defaultPontaVariantId();
}

export function savePontaVariantId(id) {
  if (!visiblePontaVariants().some(v => v.id === id)) return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function pontaArtForId(id) {
  return pontaVariantById(id).art;
}

export function deletePontaVariant(id) {
  const variant = PONTA_CARD_VARIANTS.find(v => v.id === id);
  if (!variant) return { ok: false, reason: 'not-found' };

  const visible = visiblePontaVariants();
  if (visible.length <= 1) return { ok: false, reason: 'last-variant' };
  if (!visible.some(v => v.id === id)) return { ok: false, reason: 'already-deleted' };

  const deleted = readDeletedIds();
  deleted.add(id);
  writeDeletedIds(deleted);

  const next = visiblePontaVariants().find(v => v.id !== id) || defaultPontaVariantId();
  savePontaVariantId(next.id);
  return { ok: true, nextId: next.id };
}

export function restoreAllPontaVariants() {
  try {
    localStorage.removeItem(DELETED_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
