/**
 * Destaque lista ↔ prancheta (mesmo padrão da tela Táticas).
 * Hover/foco na linha do elenco marca o slot correspondente no campo.
 */

const HIGHLIGHT_CLASS = 'sub-highlight';

/** @param {ParentNode|ParentNode[]|null|undefined} pitchRoot */
function pitchRootsOf(pitchRoot) {
  if (!pitchRoot) return [];
  return (Array.isArray(pitchRoot) ? pitchRoot : [pitchRoot]).filter(Boolean);
}

/** @param {ParentNode|ParentNode[]|null|undefined} pitchRoot */
export function clearBoardSlotHighlight(pitchRoot) {
  pitchRootsOf(pitchRoot).forEach(root => {
    root
      .querySelectorAll(`.board-player.${HIGHLIGHT_CLASS}, .pitch-player.${HIGHLIGHT_CLASS}`)
      .forEach(el => el.classList.remove(HIGHLIGHT_CLASS));
  });
}

/**
 * @param {ParentNode|ParentNode[]|null|undefined} pitchRoot
 * @param {number|null|undefined} slot — 0–10 no campo; fora disso limpa
 */
export function setBoardSlotHighlight(pitchRoot, slot) {
  const roots = pitchRootsOf(pitchRoot);
  if (!roots.length) return;
  const n = Number(slot);
  const active = Number.isFinite(n) && n >= 0 && n < 11 ? n : null;
  roots.forEach(root => {
    root.querySelectorAll('.board-player[data-slot], .pitch-player[data-slot]').forEach(el => {
      el.classList.toggle(HIGHLIGHT_CLASS, active != null && Number(el.dataset.slot) === active);
    });
  });
}

/**
 * Liga hover/foco em um container de lista para destacar a prancheta.
 * @param {object} opts
 * @param {Element|null} opts.rosterRoot
 * @param {Element|Element[]|null|(() => Element|Element[]|null)} opts.pitchRoot
 * @param {string} [opts.rowSelector='[data-slot]']
 * @returns {() => void} unbind
 */
export function bindBoardRosterHover({ rosterRoot, pitchRoot, rowSelector = '[data-slot]' } = {}) {
  if (!rosterRoot) return () => {};
  const resolvePitch = () => (typeof pitchRoot === 'function' ? pitchRoot() : pitchRoot);

  const highlightFromRow = row => {
    if (!row) {
      clearBoardSlotHighlight(resolvePitch());
      return;
    }
    const slot = Number(row.dataset.slot);
    setBoardSlotHighlight(resolvePitch(), Number.isFinite(slot) ? slot : null);
  };

  const onOver = event => {
    const row = event.target.closest?.(rowSelector);
    if (!row || !rosterRoot.contains(row)) return;
    highlightFromRow(row);
  };
  const onOut = event => {
    const row = event.target.closest?.(rowSelector);
    if (!row || !rosterRoot.contains(row)) return;
    if (row.contains(event.relatedTarget)) return;
    clearBoardSlotHighlight(resolvePitch());
  };
  const onFocusIn = event => {
    const row = event.target.closest?.(rowSelector);
    if (!row || !rosterRoot.contains(row)) return;
    highlightFromRow(row);
  };
  const onFocusOut = event => {
    const row = event.target.closest?.(rowSelector);
    if (!row || !rosterRoot.contains(row)) return;
    if (row.contains(event.relatedTarget)) return;
    clearBoardSlotHighlight(resolvePitch());
  };

  rosterRoot.addEventListener('mouseover', onOver);
  rosterRoot.addEventListener('mouseout', onOut);
  rosterRoot.addEventListener('focusin', onFocusIn);
  rosterRoot.addEventListener('focusout', onFocusOut);

  return () => {
    rosterRoot.removeEventListener('mouseover', onOver);
    rosterRoot.removeEventListener('mouseout', onOut);
    rosterRoot.removeEventListener('focusin', onFocusIn);
    rosterRoot.removeEventListener('focusout', onFocusOut);
    clearBoardSlotHighlight(resolvePitch());
  };
}
