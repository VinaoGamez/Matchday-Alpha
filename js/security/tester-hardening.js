(() => {
  const host = location.hostname.toLowerCase();
  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    location.protocol === 'file:';
  // Bloqueio de F12/cópia só em links externos públicos — local (5080/5081) fica livre para debug.
  const isPublicHost =
    /\.github\.io$/i.test(host) ||
    /\.pages\.dev$/i.test(host) ||
    /\.trycloudflare\.com$/i.test(host);
  if (isLocal || !isPublicHost) return;

  const block = event => {
    event.preventDefault();
    event.stopPropagation();
    return false;
  };

  const blockedKeys = new Set([
    'F12', 'F7',
  ]);

  document.addEventListener('contextmenu', block, true);
  // Permite HTML5 drag da prancheta/elenco tático; bloqueia arrasto genérico (imagens, links, etc.).
  document.addEventListener('dragstart', event => {
    const allowed = event.target?.closest?.('[draggable="true"], .repositionable');
    if (allowed) return;
    return block(event);
  }, true);
  document.addEventListener('copy', block, true);
  document.addEventListener('cut', block, true);

  document.addEventListener('keydown', event => {
    const key = event.key;
    const ctrl = event.ctrlKey || event.metaKey;
    const shift = event.shiftKey;
    const alt = event.altKey;
    if (blockedKeys.has(key)) return block(event);
    if (key === 'F12' || (ctrl && shift && (key === 'I' || key === 'J' || key === 'C' || key === 'K'))) return block(event);
    if (ctrl && (key === 'u' || key === 'U' || key === 's' || key === 'S' || key === 'p' || key === 'P')) return block(event);
    if (alt && (key === 'F4' || key === 'f4')) return block(event);
  }, true);

  document.documentElement.classList.add('tester-hardened');
  const style = document.createElement('style');
  style.textContent = `
    html.tester-hardened, html.tester-hardened body {
      -webkit-user-select: none;
      user-select: none;
    }
    html.tester-hardened input, html.tester-hardened textarea, html.tester-hardened [contenteditable="true"] {
      -webkit-user-select: text;
      user-select: text;
    }
  `;
  document.documentElement.appendChild(style);

  console.log('%cMatchday Football — build pública de testers.', 'color:#63d9ff;font-weight:700;font-size:12px');
  console.log('%cInspeção e cópia do cliente estão restritas neste ambiente.', 'color:#9eb6b8;font-size:11px');
})();
