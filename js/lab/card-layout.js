/**
 * Layout do card (693×1024). Valores salvos no browser substituem o default.
 */

export const ZONE_META = {
  foot: { label: 'Máscara rodapé', color: '#64748b', group: 'card' },
  number: { label: 'OVR', color: '#f59e0b', group: 'foot' },
  role: { label: 'Função', color: '#22c55e', group: 'foot' },
  first: { label: 'Primeiro nome', color: '#3b82f6', group: 'foot' },
  last: { label: 'Sobrenome', color: '#a855f7', group: 'foot' },
  nation: { label: 'País + bandeira', color: '#06b6d4', group: 'foot' },
  backHead: { label: 'Fundo cabeçalho', color: '#581c87', group: 'back' },
  backLast: { label: 'Sobrenome', color: '#a855f7', group: 'back' },
  backRole: { label: 'Função · idade', color: '#c084fc', group: 'back' },
  backClubTag: { label: 'Tag divisão', color: '#818cf8', group: 'back' },
  backClubName: { label: 'Nome do clube', color: '#6366f1', group: 'back' },
  backOvr: { label: 'OVR verso', color: '#f59e0b', group: 'back' },
  backGauges: { label: 'Destaques stats', color: '#22c55e', group: 'back' },
  backBars: { label: 'Stats secundários', color: '#f59e0b', group: 'back' },
  backFeet: { label: 'Pé forte', color: '#06b6d4', group: 'back' },
  backSpecHex: { label: 'Hex especialista', color: '#22d3ee', group: 'back' },
  backSpecStar: { label: 'Estrela (prata / dourada)', color: '#cbd5e1', group: 'back' },
  backCareer: { label: 'Carreira', color: '#ec4899', group: 'back' },
  actions: { label: 'Botões Vender/Emprestar', color: '#bbeb27', group: 'back' },
  backBrand: { label: 'Rodapé marca', color: '#64748b', group: 'back' },
};

export const FRONT_ZONE_KEYS = ['foot', 'number', 'role', 'first', 'last', 'nation'];
export const BACK_ZONE_KEYS = [
  'backHead',
  'backLast',
  'backRole',
  'backClubTag',
  'backClubName',
  'backOvr',
  'backGauges',
  'backBars',
  'backFeet',
  'backSpecStar',
  'backSpecHex',
  'backCareer',
  'actions',
  'backBrand',
];

export const DEFAULT_BACK_ZONES = {
  backHead: { x: 0, y: 0, w: 100, h: 13.5 },
  backLast: { x: 3.4, y: 1.7, w: 58, h: 6.5 },
  backRole: { x: 3.2, y: 8.4, w: 58, h: 4.2 },
  backClubTag: { x: 48, y: 8, w: 18, h: 2.2 },
  backClubName: { x: 48, y: 10.2, w: 38, h: 2.5 },
  backOvr: { x: 75.3, y: 2.7, w: 22, h: 9 },
  backGauges: { x: 3, y: 14.8, w: 94, h: 16.5 },
  backBars: { x: 2.8, y: 34.1, w: 94, h: 23 },
  actions: { x: 17.9, y: 59.5, w: 60, h: 8 },
  backFeet: { x: 32, y: 70, w: 36, h: 12 },
  /** Esquerda do pé — prata (esp.) ou dourada (craque), mesmo slot */
  backSpecStar: { x: 5.2, y: 69.5, w: 22, h: 13 },
  /** Direita do pé — um hex (falta, cobrança ou defesa de pênalti) */
  backSpecHex: { x: 72.6, y: 69.4, w: 22, h: 13 },
  backCareer: { x: 3, y: 83.7, w: 94, h: 11 },
  backBrand: { x: 0, y: 96.5, w: 100, h: 3.5 },
};

/** Rodapé da frente — calibrado no Card Lab (evita corte de nomes). */
export const DEFAULT_FRONT_ZONES = {
  number: { x: 4.7, y: 14, w: 21, h: 52 },
  role: { x: 9.3, y: 64.4, w: 11, h: 16 },
  first: { x: 44.2, y: 9.5, w: 50, h: 18 },
  last: { x: 24.6, y: 27.3, w: 72, h: 38 },
  nation: { x: 56.7, y: 63.2, w: 38, h: 20 },
};

export function cloneLayout(layout) {
  return JSON.parse(JSON.stringify(layout));
}

const DEFAULT_FOOT_BLOCK = {
  art: { x: 0, y: 0, w: 100, h: 100, fit: 'fill' },
  foot: { x: 1.2, y: 77.4, w: 98, h: 23.2, bg: '#01152d' },
  fonts: { number: 19, role: 4, first: 5.5, last: 10.8, nation: 4.6 },
  zones: DEFAULT_FRONT_ZONES,
  backZones: { ...DEFAULT_BACK_ZONES },
};

export const DEFAULT_LAYOUTS = {
  goleiro: cloneLayout(DEFAULT_FOOT_BLOCK),
  lateral: cloneLayout(DEFAULT_FOOT_BLOCK),
  mei: cloneLayout(DEFAULT_FOOT_BLOCK),
  zagueiro: cloneLayout(DEFAULT_FOOT_BLOCK),
  ponta: cloneLayout(DEFAULT_FOOT_BLOCK),
  volante: cloneLayout(DEFAULT_FOOT_BLOCK),
  atacante: cloneLayout(DEFAULT_FOOT_BLOCK),
  mc: cloneLayout(DEFAULT_FOOT_BLOCK),
};

const STORAGE_PREFIX = 'matchday-card-layout-v20-';

const BACK_HEADER_TEXT_KEYS = ['backLast', 'backRole', 'backClubTag', 'backClubName', 'backOvr'];

export function isBackZoneKey(key) {
  return BACK_ZONE_KEYS.includes(key);
}

export function layoutStorageKey(roleKey) {
  return `${STORAGE_PREFIX}${roleKey}`;
}

function defaultBackZones() {
  return cloneLayout(DEFAULT_BACK_ZONES);
}

function normalizeBackZones(layout) {
  const bz = layout?.backZones;
  if (!bz) return;
  if (bz.backSpecCraque && !bz.backSpecStar) {
    bz.backSpecStar = cloneLayout(bz.backSpecCraque);
  }
  delete bz.backSpecCraque;
  if (!bz.backSpecHex) {
    bz.backSpecHex = cloneLayout(bz.backSpecFk || bz.backSpecPen || DEFAULT_BACK_ZONES.backSpecHex);
  }
  delete bz.backSpecPen;
  delete bz.backSpecFk;
  if (!BACK_HEADER_TEXT_KEYS.some(k => bz[k])) {
    for (const k of BACK_HEADER_TEXT_KEYS) {
      bz[k] = cloneLayout(DEFAULT_BACK_ZONES[k]);
    }
  }
}

function mergeBackZones(out, patch) {
  if (!patch) return;
  out.backZones = out.backZones || defaultBackZones();
  for (const [k, v] of Object.entries(patch)) {
    out.backZones[k] = { ...(out.backZones[k] || {}), ...v };
  }
}

function mergeFootZones(base, patch) {
  const out = cloneLayout(base);
  if (patch.foot) Object.assign(out.foot, patch.foot);
  if (patch.fonts) Object.assign(out.fonts, patch.fonts);
  if (patch.zones) {
    out.zones = out.zones || {};
    for (const [k, v] of Object.entries(patch.zones)) {
      out.zones[k] = { ...(out.zones[k] || {}), ...v };
    }
  }
  if (patch.art) Object.assign(out.art, patch.art);
  if (patch.backZones) mergeBackZones(out, patch.backZones);
  if (patch.backActions) {
    out.backZones = out.backZones || defaultBackZones();
    out.backZones.actions = { ...(out.backZones.actions || {}), ...patch.backActions };
  }
  if (!out.backZones) out.backZones = defaultBackZones();
  normalizeBackZones(out);
  return out;
}

export function loadLayout(roleKey = 'goleiro') {
  const base = cloneLayout(DEFAULT_LAYOUTS[roleKey] || DEFAULT_LAYOUTS.goleiro);
  if (!base.backZones) base.backZones = defaultBackZones();
  normalizeBackZones(base);
  try {
    const raw = localStorage.getItem(layoutStorageKey(roleKey));
    if (raw) return mergeFootZones(base, JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return base;
}

export function saveLayout(roleKey, layout) {
  localStorage.setItem(layoutStorageKey(roleKey), JSON.stringify(cloneLayout(layout)));
}

export function resetLayout(roleKey) {
  localStorage.removeItem(layoutStorageKey(roleKey));
}

export function layoutToExport(roleKey, layout) {
  return {
    roleKey,
    cardSize: { w: 693, h: 1024 },
    footUnit: 'card',
    zonesUnit: 'foot',
    art: layout.art,
    foot: layout.foot,
    fonts: layout.fonts,
    zones: layout.zones,
    backZones: layout.backZones,
    backUnit: 'card',
  };
}

/** Encolhe sobrenome/primeiro nome quando ultrapassam a zona (ex.: PERNAMBUCANO). */
export function fitCardFootNames(cardEl) {
  if (!cardEl?.querySelector || cardEl.classList.contains('is-calibrating')) return;

  for (const { zoneSel, textSel } of [
    { zoneSel: '.md-card-zone--last', textSel: '.md-card-last' },
    { zoneSel: '.md-card-zone--first', textSel: '.md-card-first' },
  ]) {
    const zone = cardEl.querySelector(zoneSel);
    const text = zone?.querySelector(textSel);
    if (!zone || !text?.textContent?.trim()) continue;

    text.style.transform = '';
    text.style.transformOrigin = '100% 50%';

    const styles = getComputedStyle(zone);
    const maxW =
      zone.clientWidth -
      (parseFloat(styles.paddingLeft) || 0) -
      (parseFloat(styles.paddingRight) || 0);
    if (maxW <= 0) continue;

    const textW = text.scrollWidth;
    if (textW > maxW + 0.5) {
      const scale = Math.max(0.55, maxW / textW);
      text.style.transform = `scale(${scale})`;
    }
  }
}

/** Converte zona do rodapé (% da máscara) → retângulo no card (%). */
export function zoneRectOnCard(layout, key) {
  const foot = layout.foot;
  const z = layout.zones?.[key];
  if (!foot || !z) return null;
  return {
    x: foot.x + (z.x * foot.w) / 100,
    y: foot.y + (z.y * foot.h) / 100,
    w: (z.w * foot.w) / 100,
    h: (z.h * foot.h) / 100,
  };
}

export function applyLayoutToCard(cardEl, layout) {
  if (!cardEl || !layout) return;
  const root = cardEl;
  const { art, foot, fonts, zones, backZones } = layout;

  if (art) {
    root.style.setProperty('--art-x', `${art.x}%`);
    root.style.setProperty('--art-y', `${art.y}%`);
    root.style.setProperty('--art-w', `${art.w}%`);
    root.style.setProperty('--art-h', `${art.h}%`);
    root.style.setProperty('--art-fit', art.fit || 'cover');
  }

  if (foot) {
    root.style.setProperty('--foot-x', `${foot.x}%`);
    root.style.setProperty('--foot-y', `${foot.y}%`);
    root.style.setProperty('--foot-w', `${foot.w}%`);
    root.style.setProperty('--foot-h', `${foot.h}%`);
    const fillMask = Boolean(foot.fillMask && foot.bg);
    root.classList.toggle('has-foot-fill', fillMask);
    if (fillMask) root.style.setProperty('--foot-bg', foot.bg);
    else root.style.removeProperty('--foot-bg');
  }

  if (fonts) {
    for (const [key, val] of Object.entries(fonts)) {
      root.style.setProperty(`--font-${key}`, `${val}cqi`);
    }
  }

  if (zones) {
    for (const [key, z] of Object.entries(zones)) {
      const el =
        root.querySelector(`[data-zone="${key}"]`) ||
        root.querySelector(`.md-card-zone--${key}`);
      if (!el || key === 'art' || key === 'foot' || isBackZoneKey(key)) continue;
      el.style.left = `${z.x}%`;
      el.style.top = `${z.y}%`;
      el.style.width = `${z.w}%`;
      el.style.height = `${z.h}%`;
    }
  }

  if (backZones) {
    for (const [key, z] of Object.entries(backZones)) {
      const el = root.querySelector(`[data-zone="${key}"]`);
      if (!el || !z) continue;
      el.style.left = `${z.x}%`;
      el.style.top = `${z.y}%`;
      el.style.width = `${z.w}%`;
      el.style.height = `${z.h}%`;
    }
  }

  fitCardFootNames(root);
}
