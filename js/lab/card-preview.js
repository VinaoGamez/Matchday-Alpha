import { mountMatchdayCard } from './player-card-system.js';
import {
  buildCardSample,
  cardLabRoleTitle,
  cardLabUrl,
  cardVariantApi,
  CARD_LAB_ROLES,
  loadCardLabRole,
  saveCardLabRole,
} from './card-variants.js';
import { mountCardVariantGallery } from './card-goleiro-gallery.js';

const mount = document.getElementById('cardPreviewMount');
const galleryRoot = document.getElementById('cardVariantGallery');
const titleEl = document.getElementById('cpRoleTitle');
const tabsEl = document.getElementById('cpRoleTabs');

let roleKey = loadCardLabRole();
let variantId = cardVariantApi(roleKey).loadVariantId();
let gallery = null;

function renderRoleTabs() {
  if (!tabsEl) return;
  tabsEl.innerHTML = CARD_LAB_ROLES.map(r => {
    const active = r.key === roleKey ? ' is-active' : '';
    return `<a class="cp-role-tab${active}" href="${cardLabUrl(r.key)}">${r.label}</a>`;
  }).join('');
}

function updateTitle() {
  if (titleEl) titleEl.textContent = `Card ${cardLabRoleTitle(roleKey)}`;
}

function renderCard() {
  if (!mount) return;
  const sample = buildCardSample(roleKey);
  mountMatchdayCard(mount, sample, {
    interactive: true,
    cardArt: cardVariantApi(roleKey).artForId(variantId),
  });
}

function initGallery() {
  gallery = mountCardVariantGallery(galleryRoot, roleKey, {
    selectedId: variantId,
    onSelect: variant => {
      variantId = variant.id;
      renderCard();
    },
  });
}

renderRoleTabs();
updateTitle();
initGallery();
renderCard();
saveCardLabRole(roleKey);

document.getElementById('flipBtn')?.addEventListener('click', () => {
  document.querySelector('.md-card-flipper')?.classList.toggle('is-flipped');
});
