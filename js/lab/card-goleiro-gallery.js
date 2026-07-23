/**
 * Seletor de variantes PNG por função.
 */

import { cardVariantApi } from './card-variants.js';

/**
 * @param {HTMLElement} container
 * @param {string} roleKey
 * @param {{ selectedId?: string, onSelect?: (variant: { id: string, label: string, art: string }) => void, onDelete?: (nextId: string) => void }} opts
 */
export function mountCardVariantGallery(container, roleKey = 'goleiro', opts = {}) {
  if (!container) return null;

  const api = cardVariantApi(roleKey);
  let selectedId = opts.selectedId || api.loadVariantId();

  container.classList.add('cpg-root');
  container.dataset.role = roleKey;

  function renderShell() {
    container.innerHTML = `
      <div class="cpg-head">
        <p class="cpg-kicker">Arte PNG · ${api.roleLabel}</p>
        <div class="cpg-actions">
          <button type="button" class="cpg-btn cpg-btn--danger" id="cpgDeleteBtn" disabled title="Excluir imagem selecionada">Excluir selecionada</button>
          <button type="button" class="cpg-btn cpg-btn--ghost" id="cpgRestoreBtn" hidden title="Restaurar imagens excluídas">Restaurar todas</button>
        </div>
      </div>
      <div class="cpg-strip" role="listbox" aria-label="Variantes de arte"></div>
    `;
  }

  renderShell();

  const strip = container.querySelector('.cpg-strip');
  const deleteBtn = container.querySelector('#cpgDeleteBtn');
  const restoreBtn = container.querySelector('#cpgRestoreBtn');

  function variants() {
    return api.visibleVariants();
  }

  function syncSelection() {
    if (!variants().some(v => v.id === selectedId)) {
      selectedId = api.loadVariantId();
    }
  }

  function updateActions() {
    const list = variants();
    const canDelete = list.length > 1 && list.some(v => v.id === selectedId);
    deleteBtn.disabled = !canDelete;
    restoreBtn.hidden = api.loadDeletedIds().length === 0;
  }

  function renderThumbs() {
    syncSelection();
    const list = variants();
    strip.innerHTML = list
      .map(v => {
        const active = v.id === selectedId ? ' is-active' : '';
        return `<button type="button" class="cpg-thumb${active}" role="option" aria-selected="${v.id === selectedId}" data-id="${v.id}" title="${v.label}">
        <img src="${v.art}" alt="" loading="lazy" draggable="false">
        <span class="cpg-label">${v.label}</span>
      </button>`;
      })
      .join('');

    strip.querySelectorAll('[data-id]').forEach(btn => {
      btn.addEventListener('click', () => select(btn.dataset.id));
    });

    updateActions();
  }

  function select(id) {
    const variant = variants().find(v => v.id === id);
    if (!variant) return;
    const changed = id !== selectedId;
    selectedId = id;
    api.saveVariantId(id);
    renderThumbs();
    if (changed) opts.onSelect?.(variant);
  }

  function removeSelected() {
    const variant = variants().find(v => v.id === selectedId);
    if (!variant) return;

    const msg = `Excluir "${variant.label}" da galeria?\n\nA imagem some da lista neste navegador (o arquivo PNG no projeto não é apagado).`;
    if (!confirm(msg)) return;

    const result = api.deleteVariant(selectedId);
    if (!result.ok) {
      if (result.reason === 'last-variant') {
        alert('Não dá para excluir a última imagem da galeria.');
      }
      return;
    }

    selectedId = result.nextId;
    renderThumbs();
    const next = variants().find(v => v.id === result.nextId);
    if (next) opts.onSelect?.(next);
    opts.onDelete?.(result.nextId);
  }

  deleteBtn.addEventListener('click', removeSelected);

  restoreBtn.addEventListener('click', () => {
    if (!confirm('Restaurar todas as imagens excluídas da galeria?')) return;
    api.restoreAll();
    selectedId = api.loadVariantId();
    renderThumbs();
    const variant = variants().find(v => v.id === selectedId);
    if (variant) opts.onSelect?.(variant);
  });

  renderThumbs();
  return {
    getSelectedId: () => selectedId,
    select,
    removeSelected,
    setRole(nextRoleKey) {
      const nextApi = cardVariantApi(nextRoleKey);
      container.dataset.role = nextRoleKey;
      container.querySelector('.cpg-kicker').textContent = `Arte PNG · ${nextApi.roleLabel}`;
      selectedId = nextApi.loadVariantId();
      renderThumbs();
    },
  };
}

/** @deprecated use mountCardVariantGallery */
export function mountGoleiroVariantGallery(container, opts = {}) {
  return mountCardVariantGallery(container, 'goleiro', opts);
}
