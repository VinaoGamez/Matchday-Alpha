/** Navegação entre views — desacopla sidebar do motor. */
export function createRouter({ $$, onClick }) {
  const viewHandlers = new Map();

  const activate = viewId => {
    $$('.nav').forEach(nav => nav.classList.toggle('active', nav.dataset.view === viewId));
    $$('.view').forEach(view => view.classList.toggle('active', view.id === viewId));
    viewHandlers.get(viewId)?.();
  };

  const onView = (viewId, handler) => {
    viewHandlers.set(viewId, handler);
  };

  const bindNav = () => {
    $$('.nav').forEach(button => {
      onClick(button, () => activate(button.dataset.view));
    });
  };

  const openView = viewId => {
    const button = $$('.nav').find(nav => nav.dataset.view === viewId);
    if (button) button.click();
    else activate(viewId);
  };

  return { activate, onView, bindNav, openView };
}
