/**
 * Banco de artes PNG — atacante (693×1024).
 */

import art04 from '../../assets/cards/atacante/card-atacante-04.png';
import art05 from '../../assets/cards/atacante/card-atacante-05.png';
import art06 from '../../assets/cards/atacante/card-atacante-06.png';
import art07 from '../../assets/cards/atacante/card-atacante-07.png';
import art08 from '../../assets/cards/atacante/card-atacante-08.png';
import art09 from '../../assets/cards/atacante/card-atacante-09.png';
import art10 from '../../assets/cards/atacante/card-atacante-10.png';
import art11 from '../../assets/cards/atacante/card-atacante-11.png';
import art12 from '../../assets/cards/atacante/card-atacante-12.png';
import art13 from '../../assets/cards/atacante/card-atacante-13.png';
import art14 from '../../assets/cards/atacante/card-atacante-14.png';
import art15 from '../../assets/cards/atacante/card-atacante-15.png';

export const ATACANTE_CARD_VARIANTS = [
  { id: 'ata-04', label: '04 · Chute amarelo', art: art04 },
  { id: 'ata-05', label: '05 · Chute vinho', art: art05 },
  { id: 'ata-06', label: '06 · Cabeceio azul', art: art06 },
  { id: 'ata-07', label: '07 · Condução verde', art: art07 },
  { id: 'ata-08', label: '08 · Chute preto', art: art08 },
  { id: 'ata-09', label: '09 · Domínio roxo', art: art09 },
  { id: 'ata-10', label: '10 · Voleio vermelho', art: art10 },
  { id: 'ata-11', label: '11 · Bicicleta branco', art: art11 },
  { id: 'ata-12', label: '12 · Chute teal', art: art12 },
  { id: 'ata-13', label: '13 · Chute laranja', art: art13 },
  { id: 'ata-14', label: '14 · Cabeceio navy', art: art14 },
  { id: 'ata-15', label: '15 · Chute vermelho', art: art15 },
];

const STORAGE_KEY = 'matchday-card-ata-variant';
const DELETED_STORAGE_KEY = 'matchday-card-ata-deleted';

function readDeletedIds() {
  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(id => ATACANTE_CARD_VARIANTS.some(v => v.id === id)));
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

export function loadDeletedAtacanteVariantIds() {
  return [...readDeletedIds()];
}

export function visibleAtacanteVariants() {
  const deleted = readDeletedIds();
  return ATACANTE_CARD_VARIANTS.filter(v => !deleted.has(v.id));
}

export function defaultAtacanteVariantId() {
  return visibleAtacanteVariants()[0]?.id || ATACANTE_CARD_VARIANTS[0]?.id || 'ata-04';
}

export function atacanteVariantById(id) {
  const visible = visibleAtacanteVariants();
  return visible.find(v => v.id === id) || visible[0] || ATACANTE_CARD_VARIANTS[0];
}

export function loadAtacanteVariantId() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && visibleAtacanteVariants().some(v => v.id === saved)) return saved;
  } catch {
    /* ignore */
  }
  return defaultAtacanteVariantId();
}

export function saveAtacanteVariantId(id) {
  if (!visibleAtacanteVariants().some(v => v.id === id)) return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function atacanteArtForId(id) {
  return atacanteVariantById(id).art;
}

export function deleteAtacanteVariant(id) {
  const variant = ATACANTE_CARD_VARIANTS.find(v => v.id === id);
  if (!variant) return { ok: false, reason: 'not-found' };

  const visible = visibleAtacanteVariants();
  if (visible.length <= 1) return { ok: false, reason: 'last-variant' };
  if (!visible.some(v => v.id === id)) return { ok: false, reason: 'already-deleted' };

  const deleted = readDeletedIds();
  deleted.add(id);
  writeDeletedIds(deleted);

  const next = visibleAtacanteVariants().find(v => v.id !== id) || defaultAtacanteVariantId();
  saveAtacanteVariantId(next.id);
  return { ok: true, nextId: next.id };
}

export function restoreAllAtacanteVariants() {
  try {
    localStorage.removeItem(DELETED_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
