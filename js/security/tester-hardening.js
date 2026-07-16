(() => {
  const host = location.hostname.toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || location.protocol === 'file:';
  const isTesterPort = location.port === '5081';
  const isPublicTunnel = /\.trycloudflare\.com$/i.test(host);
  const isFixedTesterHost = /\.pages\.dev$/i.test(host) || /\.github\.io$/i.test(host);
  if (isLocal && !isTesterPort) return;

  const block = event => {
    event.preventDefault();
    event.stopPropagation();
    return false;
  };

  const blockedKeys = new Set([
    'F12', 'F7',
  ]);

  document.addEventListener('contextmenu', block, true);
  document.addEventListener('dragstart', block, true);
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

  if (isPublicTunnel || isTesterPort || isFixedTesterHost) {
    console.log('%cMatchday Football — build de testers.', 'color:#63d9ff;font-weight:700;font-size:12px');
    console.log('%cInspeção e cópia do cliente estão restritas neste ambiente.', 'color:#9eb6b8;font-size:11px');
  }
})();
