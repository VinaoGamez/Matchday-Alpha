/**
 * Cards — arte PNG + rodapé dinâmico (OVR, nome, país, verso).
 */

import cardGoleiro from '../../assets/cards/card-goleiro.png';
import cardLateral from '../../assets/cards/card-lateral.png';
import cardMei from '../../assets/cards/card-mei.png';
import cardZagueiro from '../../assets/cards/card-zagueiro.png';
import cardPonta from '../../assets/cards/card-ponta.png';
import cardVolante from '../../assets/cards/card-volante.png';
import cardAtacante from '../../assets/cards/card-atacante.png';
import cardMc from '../../assets/cards/card-mc.png';
import { renderCardBack } from './card-back.js';
import { applyLayoutToCard, fitCardFootNames, loadLayout } from './card-layout.js';
import { flagImgMarkup } from './card-nation-flags.js';

export const CARD_CANVAS = { w: 693, h: 1024 };

export const CARD_DEFINITIONS = {
  goleiro: {
    card: cardGoleiro,
    role: 'GOLEIRO',
    posLabel: 'GOL',
    accent: '#9333ea',
    label: 'Goleiro',
  },
  lateral: {
    card: cardLateral,
    role: 'LATERAL',
    posLabel: 'LAT',
    accent: '#2563eb',
    label: 'Lateral',
  },
  mei: {
    card: cardMei,
    role: 'MEIA',
    posLabel: 'MEI',
    accent: '#ea580c',
    label: 'Meia',
  },
  zagueiro: {
    card: cardZagueiro,
    role: 'ZAGUEIRO',
    posLabel: 'ZAG',
    accent: '#ca8a04',
    label: 'Zagueiro',
  },
  ponta: {
    card: cardPonta,
    role: 'PONTA',
    posLabel: 'PON',
    accent: '#16a34a',
    label: 'Ponta',
  },
  volante: {
    card: cardVolante,
    role: 'VOLANTE',
    posLabel: 'VOL',
    accent: '#dc2626',
    label: 'Volante',
  },
  atacante: {
    card: cardAtacante,
    role: 'ATACANTE',
    posLabel: 'ATA',
    accent: '#db2777',
    label: 'Atacante',
  },
  mc: {
    card: cardMc,
    role: 'MC',
    posLabel: 'MC',
    accent: '#0891b2',
    label: 'Meio-campo',
  },
};

export const POS_TO_ROLE_KEY = {
  GOL: 'goleiro',
  LAT: 'lateral',
  MEI: 'mei',
  MC: 'mc',
  ZAG: 'zagueiro',
  PD: 'ponta',
  PE: 'ponta',
  PON: 'ponta',
  VOL: 'volante',
  ATA: 'atacante',
};


const esc = v =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

export function splitName(full = '') {
  const parts = String(full).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: '—', last: '—' };
  if (parts.length === 1) return { first: '', last: parts[0].toUpperCase() };
  const last = parts.pop();
  return { first: parts.join(' '), last: last.toUpperCase() };
}

function stat(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return String(Math.round(n));
}

export function cardMetaForPlayer(player) {
  const pos = player?.pos || 'GOL';
  const roleKey = player?.roleKey || POS_TO_ROLE_KEY[pos] || 'goleiro';
  const meta = CARD_DEFINITIONS[roleKey] || CARD_DEFINITIONS.goleiro;
  return { ...meta, roleKey, pos };
}

export function renderMatchdayCard(
  player,
  {
    flipped = false,
    interactive = true,
    layout = null,
    cardArt = null,
    calibrating = false,
    showActions = true,
    actionMode = 'sell',
    actionsEnabled = true,
    previewSpecBadges = false,
  } = {},
) {
  const meta = cardMetaForPlayer(player);
  const cardLayout = layout || loadLayout(meta.roleKey);
  const cardSrc = cardArt || meta.card;
  const { first, last } = splitName(player?.name);
  const nation = player?.nationality || 'Brasil';
  const flagImg = flagImgMarkup(nation, player?.nationalityIso);
  const ovr = stat(player?.overall);
  const posAbbr = player?.pos || meta.posLabel;

  const flipCls = flipped ? ' is-flipped' : '';
  const intCls = interactive ? ' is-interactive' : '';
  const calCls = calibrating ? ' is-calibrating' : '';

  return `<article class="md-card${calCls}" data-role="${esc(meta.roleKey)}" style="--md-accent:${meta.accent}">
    <div class="md-card-scene">
      <div class="md-card-flipper${flipCls}${intCls}" tabindex="${interactive ? '0' : '-1'}" role="button" aria-label="Card ${esc(player?.name || '')}">
        <div class="md-card-face md-card-front">
          <div class="md-card-art-frame">
            <div class="md-card-art-bounds">
              <img class="md-card-img" src="${esc(cardSrc)}" alt="">
            </div>
          </div>
          <div class="md-card-foot-mask" data-zone="foot" aria-hidden="true">
            <div class="md-card-zones">
              <div class="md-card-zone md-card-zone--number" data-zone="number">
                <span class="md-card-num">${esc(ovr)}</span>
              </div>
              <div class="md-card-zone md-card-zone--role" data-zone="role">
                <span class="md-card-role">${esc(posAbbr)}</span>
              </div>
              ${first ? `<div class="md-card-zone md-card-zone--first" data-zone="first">
                <span class="md-card-first">${esc(first)}</span>
              </div>` : ''}
              <div class="md-card-zone md-card-zone--last" data-zone="last">
                <strong class="md-card-last">${esc(last)}</strong>
              </div>
              <div class="md-card-zone md-card-zone--nation" data-zone="nation">
                <span class="md-card-nation-row">
                  ${flagImg}
                  <span class="md-card-nation">${esc(nation)}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        ${renderCardBack(player, meta, { showActions, actionMode, actionsEnabled, previewSpecBadges })}
      </div>
    </div>
  </article>`;
}

export function mountMatchdayCard(container, player, options = {}) {
  if (!container) return null;
  const meta = cardMetaForPlayer(player);
  const layout = options.layout || loadLayout(meta.roleKey);
  container.innerHTML = renderMatchdayCard(player, { ...options, flipped: false, layout });
  const card = container.querySelector('.md-card');
  applyLayoutToCard(card, layout);
  requestAnimationFrame(() => fitCardFootNames(card));

  const flipper = container.querySelector('.md-card-flipper');
  if (!flipper || options.interactive === false) return flipper;

  card?.querySelectorAll('[data-card-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (btn.disabled) return;
      const action = btn.dataset.cardAction;
      if (action === 'sell') options.onSell?.(player, btn);
      if (action === 'buy') options.onBuy?.(player, btn);
      if (action === 'loan') options.onLoan?.(player, btn);
    });
  });

  const toggle = () => flipper.classList.toggle('is-flipped');
  flipper.addEventListener('click', e => {
    if (e.target.closest('.mdc-card-actions, .mdc-card-action')) return;
    toggle();
  });
  flipper.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });
  return flipper;
}
