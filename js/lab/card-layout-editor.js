import { mountMatchdayCard } from './player-card-system.js';
import { buildCardSample, cardVariantApi, loadCardLabRole } from './card-variants.js';
import { mountCardVariantGallery } from './card-goleiro-gallery.js';
import {
  ZONE_META,
  FRONT_ZONE_KEYS,
  BACK_ZONE_KEYS,
  DEFAULT_BACK_ZONES,
  isBackZoneKey,
  applyLayoutToCard,
  cloneLayout,
  layoutToExport,
  loadLayout,
  resetLayout,
  saveLayout,
  zoneRectOnCard,
} from './card-layout.js';

const FONT_KEYS = ['number', 'role', 'first', 'last', 'nation'];
const RECT_KEYS = ['x', 'y', 'w', 'h'];

export function initCardLayoutEditor(root, options = {}) {
  if (!root) return;

  const roleKey = options.roleKey || loadCardLabRole();
  const sample = buildCardSample(roleKey);
  const variantApi = cardVariantApi(roleKey);

  let layout = loadLayout(roleKey);
  let faceMode = 'front';
  let selected = FRONT_ZONE_KEYS[0];
  let showGuides = true;
  let variantId = variantApi.loadVariantId();

  root.innerHTML = `
    <div class="cle-grid">
      <section class="cle-panel">
        <h2 class="cle-title">Ajuste do layout</h2>
        <p class="cle-hint">Escolha <strong>Frente</strong> ou <strong>Verso</strong>, selecione a zona e arraste no card. À <strong>esquerda do pé</strong>: estrela (prata ou dourada, mesmo slot). À <strong>direita</strong>: um hex de especialista (falta, cobrança ou defesa — conforme stats do jogador).</p>
        <div id="cleVariantGallery"></div>
        <div class="cle-face-tabs" role="tablist" aria-label="Lado do card">
          <button type="button" class="cle-face-tab is-active" data-face="front" role="tab" aria-selected="true">Frente</button>
          <button type="button" class="cle-face-tab" data-face="back" role="tab" aria-selected="false">Verso</button>
        </div>
        <div class="cle-toolbar">
          <button type="button" class="cl-btn" id="cleSaveBtn">Salvar</button>
          <button type="button" class="cl-btn" id="cleResetBtn">Reset</button>
          <button type="button" class="cl-btn" id="cleCopyBtn">Copiar JSON</button>
          <label class="cle-toggle"><input type="checkbox" id="cleGuidesToggle" checked> Guias</label>
        </div>
        <ul class="cle-zone-list" id="cleZoneList"></ul>
        <form class="cle-form" id="cleForm"></form>
        <textarea class="cle-json" id="cleJsonOut" readonly rows="10" aria-label="JSON exportado"></textarea>
      </section>
      <section class="cle-stage-wrap">
        <div class="cle-stage-label" id="cleStageLabel">Preview · arraste a zona selecionada</div>
        <div id="cleStage" class="cle-stage"></div>
      </section>
    </div>
  `;

  const stage = root.querySelector('#cleStage');
  const stageLabel = root.querySelector('#cleStageLabel');
  const zoneList = root.querySelector('#cleZoneList');
  const form = root.querySelector('#cleForm');
  const jsonOut = root.querySelector('#cleJsonOut');

  function zoneKeysForFace() {
    return faceMode === 'back' ? BACK_ZONE_KEYS : FRONT_ZONE_KEYS;
  }

  function targetRect(key) {
    if (key === 'foot') return layout.foot;
    if (isBackZoneKey(key)) return layout.backZones?.[key];
    return layout.zones[key];
  }

  function setRect(key, patch) {
    if (key === 'foot') Object.assign(layout.foot, patch);
    else if (isBackZoneKey(key)) {
      if (!layout.backZones) layout.backZones = cloneLayout(DEFAULT_BACK_ZONES);
      if (!layout.backZones[key]) layout.backZones[key] = { x: 0, y: 0, w: 100, h: 10 };
      Object.assign(layout.backZones[key], patch);
    } else Object.assign(layout.zones[key], patch);
  }

  function guideRect(key) {
    if (key === 'foot' || isBackZoneKey(key)) return targetRect(key);
    return zoneRectOnCard(layout, key);
  }

  function syncJson() {
    jsonOut.value = JSON.stringify(layoutToExport(roleKey, layout), null, 2);
  }

  function setFaceMode(mode) {
    faceMode = mode;
    const keys = zoneKeysForFace();
    if (!keys.includes(selected)) selected = keys[0];

    root.querySelectorAll('.cle-face-tab').forEach(btn => {
      const active = btn.dataset.face === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    stageLabel.textContent =
      mode === 'back'
        ? 'Verso · arraste a zona selecionada'
        : 'Frente · arraste a zona selecionada';

    const card = stage.querySelector('.md-card');
    card?.classList.toggle('is-show-back', mode === 'back');

    renderZoneList();
    renderForm();
    renderGuides();
  }

  function renderZoneList() {
    zoneList.innerHTML = zoneKeysForFace()
      .map(key => {
        const meta = ZONE_META[key];
        const active = key === selected ? ' is-active' : '';
        return `<li><button type="button" class="cle-zone-btn${active}" data-zone="${key}" style="--zcolor:${meta.color}">${meta.label}</button></li>`;
      })
      .join('');

    zoneList.querySelectorAll('[data-zone]').forEach(btn => {
      btn.addEventListener('click', () => {
        selected = btn.dataset.zone;
        renderZoneList();
        renderForm();
        renderGuides();
      });
    });
  }

  function renderForm() {
    const key = selected;
    const meta = ZONE_META[key];
    const rect = targetRect(key);
    const isFoot = key === 'foot';
    const isBackZone = isBackZoneKey(key);

    let html = `<h3 class="cle-form-title" style="color:${meta.color}">${meta.label}</h3>`;
    html += RECT_KEYS.map(
      f => `
      <label class="cle-field">
        <span>${f.toUpperCase()} (%)</span>
        <input type="number" step="0.1" data-rect="${f}" value="${num(rect[f])}">
      </label>`,
    ).join('');

    if (isFoot) {
      const fillOn = Boolean(layout.foot.fillMask);
      html += `<label class="cle-toggle cle-toggle--block"><input type="checkbox" id="cleFootFill" ${fillOn ? 'checked' : ''}> Preencher cor no rodapé</label>`;
      html += `<label class="cle-field${fillOn ? '' : ' is-disabled'}"><span>Cor rodapé</span><input type="color" id="cleFootBg" value="${toColorInput(layout.foot.bg)}" ${fillOn ? '' : 'disabled'}></label>`;
    } else if (!isBackZone && layout.zones[key]) {
      const fk = fontKeyForZone(key);
      if (fk) {
        html += `<label class="cle-field"><span>Fonte (cqi)</span><input type="number" step="0.1" data-font="${fk}" value="${num(layout.fonts[fk])}"></label>`;
      }
    }

    form.innerHTML = html;

    form.querySelectorAll('[data-rect]').forEach(input => {
      input.addEventListener('input', () => {
        setRect(key, { [input.dataset.rect]: parseFloat(input.value) || 0 });
        refresh();
      });
    });

    form.querySelector('#cleFootFill')?.addEventListener('change', e => {
      layout.foot.fillMask = e.target.checked;
      if (layout.foot.fillMask && !layout.foot.bg) layout.foot.bg = '#01152d';
      refresh();
    });

    form.querySelector('#cleFootBg')?.addEventListener('input', e => {
      layout.foot.bg = e.target.value;
      layout.foot.fillMask = true;
      refresh();
    });

    form.querySelectorAll('[data-font]').forEach(input => {
      input.addEventListener('input', () => {
        layout.fonts[input.dataset.font] = parseFloat(input.value) || 0;
        refresh();
      });
    });
  }

  function activeFaceEl(card) {
    return faceMode === 'back'
      ? card?.querySelector('.md-card-back')
      : card?.querySelector('.md-card-front');
  }

  function renderGuides() {
    const card = stage.querySelector('.md-card');
    if (!card) return;

    card.querySelectorAll('.cle-guide-layer').forEach(layer => layer.remove());
    if (!showGuides) return;

    const face = activeFaceEl(card);
    if (!face) return;

    const layer = document.createElement('div');
    layer.className = 'cle-guide-layer';
    face.appendChild(layer);

    layer.innerHTML = zoneKeysForFace()
      .map(key => {
        const meta = ZONE_META[key];
        const r = guideRect(key);
        if (!r) return '';
        const sel = key === selected ? ' is-selected' : '';
        return `<div class="cle-guide${sel}" data-guide="${key}" style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;--gcolor:${meta.color}"><span>${meta.label}</span></div>`;
      })
      .join('');

    layer.querySelectorAll('.cle-guide').forEach(el => {
      el.addEventListener('pointerdown', e => {
        e.stopPropagation();
        startDrag(e, el.dataset.guide);
      });
    });
  }

  function mountCard() {
    stage.innerHTML = '<div class="cle-card-slot" id="cleCardSlot"></div>';
    const slot = stage.querySelector('#cleCardSlot');
    mountMatchdayCard(slot, sample, {
      interactive: false,
      layout,
      calibrating: true,
      previewSpecBadges: true,
      cardArt: variantApi.artForId(variantId),
    });
    stage.querySelector('.md-card')?.classList.add('cle-editing');
    setFaceMode(faceMode);
    refresh();
  }

  function refresh() {
    const card = stage.querySelector('.md-card');
    applyLayoutToCard(card, layout);
    renderForm();
    renderGuides();
    syncJson();
  }

  function startDrag(e, key) {
    e.preventDefault();
    selected = key;
    renderZoneList();
    renderForm();

    const card = stage.querySelector('.md-card');
    const face = activeFaceEl(card);
    if (!face) return;

    const isFoot = key === 'foot';
    const isCardRelative = isFoot || isBackZoneKey(key);
    const startX = e.clientX;
    const startY = e.clientY;
    const start = { ...targetRect(key) };

    const onMove = ev => {
      const box = face.getBoundingClientRect();
      const dx = ((ev.clientX - startX) / box.width) * 100;
      const dy = ((ev.clientY - startY) / box.height) * 100;

      if (isCardRelative) {
        setRect(key, { x: round1(start.x + dx), y: round1(start.y + dy) });
      } else {
        const foot = layout.foot;
        const zx = round1(start.x + (dx * 100) / foot.w);
        const zy = round1(start.y + (dy * 100) / foot.h);
        setRect(key, { x: zx, y: zy });
      }
      refresh();
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  root.querySelectorAll('.cle-face-tab').forEach(btn => {
    btn.addEventListener('click', () => setFaceMode(btn.dataset.face));
  });

  root.querySelector('#cleSaveBtn')?.addEventListener('click', () => {
    saveLayout(roleKey, layout);
    flash(root.querySelector('#cleSaveBtn'), 'Salvo!');
  });

  root.querySelector('#cleResetBtn')?.addEventListener('click', () => {
    if (!confirm('Voltar ao layout padrão do código?')) return;
    resetLayout(roleKey);
    layout = loadLayout(roleKey);
    mountCard();
  });

  root.querySelector('#cleCopyBtn')?.addEventListener('click', async () => {
    syncJson();
    try {
      await navigator.clipboard.writeText(jsonOut.value);
      flash(root.querySelector('#cleCopyBtn'), 'Copiado!');
    } catch {
      jsonOut.select();
      document.execCommand('copy');
    }
  });

  root.querySelector('#cleGuidesToggle')?.addEventListener('change', e => {
    showGuides = e.target.checked;
    renderGuides();
  });

  mountCardVariantGallery(root.querySelector('#cleVariantGallery'), roleKey, {
    selectedId: variantId,
    onSelect: variant => {
      variantId = variant.id;
      mountCard();
    },
  });

  renderZoneList();
  renderForm();
  syncJson();
  mountCard();

  return {
    setFaceMode,
    getFaceMode: () => faceMode,
  };
}

function fontKeyForZone(key) {
  if (key === 'number' || key === 'role' || key === 'first' || key === 'last' || key === 'nation') return key;
  return null;
}

function num(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function toColorInput(hex) {
  const raw = String(hex || '#01152d').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  return '#01152d';
}

function flash(btn, msg) {
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => {
    btn.textContent = prev;
  }, 1200);
}
