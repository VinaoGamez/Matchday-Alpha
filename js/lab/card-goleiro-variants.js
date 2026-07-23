/**

 * Banco de artes PNG — goleiro (693×1024).

 */



import art01 from '../../assets/cards/goleiro/card-goleiro-01-sean-murphy.png';

import art02 from '../../assets/cards/goleiro/card-goleiro-02-milan-petrovic.png';

import art02Clean from '../../assets/cards/goleiro/card-goleiro-02-milan-petrovic-clean.png';

import art03 from '../../assets/cards/goleiro/card-goleiro-03-yann-dubois.png';

import art04 from '../../assets/cards/goleiro/card-goleiro-04-connor-frost.png';

import art05 from '../../assets/cards/goleiro/card-goleiro-05-rafael-santos.png';
import art06 from '../../assets/cards/goleiro/card-goleiro-06-mergulho-teal.png';
import art07 from '../../assets/cards/goleiro/card-goleiro-07-min-jun-park.png';
import art08 from '../../assets/cards/goleiro/card-goleiro-08-mateo-vega.png';
import art09 from '../../assets/cards/goleiro/card-goleiro-09-daichi-mori.png';
import art10 from '../../assets/cards/goleiro/card-goleiro-10-pega-alta-azul.png';

export const GOLEIRO_CARD_VARIANTS = [
  { id: 'gol-01', label: '01 · Defesa esquerda', art: art01 },
  { id: 'gol-02', label: '02 · Defesa alta', art: art02 },
  { id: 'gol-02-clean', label: '02b · Milan (sem borda ext.)', art: art02Clean },
  { id: 'gol-03', label: '03 · Segurando bola', art: art03 },
  { id: 'gol-04', label: '04 · Mergulho', art: art04 },
  { id: 'gol-05', label: '05 · Reposicionamento', art: art05 },
  { id: 'gol-06', label: '06 · Mergulho teal', art: art06 },
  { id: 'gol-07', label: '07 · Mergulho direita', art: art07 },
  { id: 'gol-08', label: '08 · Defesa no poste', art: art08 },
  { id: 'gol-09', label: '09 · Prontidão', art: art09 },
  { id: 'gol-10', label: '10 · Pega alta azul', art: art10 },
];



const STORAGE_KEY = 'matchday-card-gol-variant';

const DELETED_STORAGE_KEY = 'matchday-card-gol-deleted';



function readDeletedIds() {

  try {

    const raw = localStorage.getItem(DELETED_STORAGE_KEY);

    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) return new Set();

    return new Set(parsed.filter(id => GOLEIRO_CARD_VARIANTS.some(v => v.id === id)));

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



export function loadDeletedGoleiroVariantIds() {

  return [...readDeletedIds()];

}



export function visibleGoleiroVariants() {

  const deleted = readDeletedIds();

  return GOLEIRO_CARD_VARIANTS.filter(v => !deleted.has(v.id));

}



export function defaultGoleiroVariantId() {

  return visibleGoleiroVariants()[0]?.id || GOLEIRO_CARD_VARIANTS[0]?.id || 'gol-01';

}



export function goleiroVariantById(id) {

  const visible = visibleGoleiroVariants();

  return visible.find(v => v.id === id) || visible[0] || GOLEIRO_CARD_VARIANTS[0];

}



export function loadGoleiroVariantId() {

  try {

    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved && visibleGoleiroVariants().some(v => v.id === saved)) return saved;

  } catch {

    /* ignore */

  }

  return defaultGoleiroVariantId();

}



export function saveGoleiroVariantId(id) {

  if (!visibleGoleiroVariants().some(v => v.id === id)) return;

  try {

    localStorage.setItem(STORAGE_KEY, id);

  } catch {

    /* ignore */

  }

}



export function goleiroArtForId(id) {

  return goleiroVariantById(id).art;

}



/**

 * Remove variante da galeria (persiste no navegador; não apaga o PNG do disco).

 * @returns {{ ok: true, nextId: string } | { ok: false, reason: string }}

 */

export function deleteGoleiroVariant(id) {

  const variant = GOLEIRO_CARD_VARIANTS.find(v => v.id === id);

  if (!variant) return { ok: false, reason: 'not-found' };



  const visible = visibleGoleiroVariants();

  if (visible.length <= 1) return { ok: false, reason: 'last-variant' };

  if (!visible.some(v => v.id === id)) return { ok: false, reason: 'already-deleted' };



  const deleted = readDeletedIds();

  deleted.add(id);

  writeDeletedIds(deleted);



  const next = visibleGoleiroVariants().find(v => v.id !== id) || defaultGoleiroVariantId();

  saveGoleiroVariantId(next.id);

  return { ok: true, nextId: next.id };

}



export function restoreAllGoleiroVariants() {

  try {

    localStorage.removeItem(DELETED_STORAGE_KEY);

  } catch {

    /* ignore */

  }

}


