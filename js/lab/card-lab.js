import { initCardLayoutEditor } from './card-layout-editor.js';
import { cardLabUrl, CARD_LAB_ROLES, cardLabRoleTitle, loadCardLabRole, saveCardLabRole } from './card-variants.js';

const roleKey = loadCardLabRole();
saveCardLabRole(roleKey);

const tabsEl = document.getElementById('clRoleTabs');
const titleEl = document.getElementById('clRoleTitle');

if (tabsEl) {
  tabsEl.innerHTML = CARD_LAB_ROLES.map(r => {
    const active = r.key === roleKey ? ' is-active' : '';
    return `<a class="cp-role-tab${active}" href="${cardLabUrl(r.key)}">${r.label}</a>`;
  }).join('');
}

if (titleEl) {
  titleEl.textContent = `Calibrador · ${cardLabRoleTitle(roleKey)}`;
}

const editor = initCardLayoutEditor(document.getElementById('cardLabEditor'), { roleKey });

document.getElementById('flipBtn')?.addEventListener('click', () => {
  const next = editor?.getFaceMode?.() === 'front' ? 'back' : 'front';
  editor?.setFaceMode?.(next);
});
