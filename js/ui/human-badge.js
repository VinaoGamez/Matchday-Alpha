/**
 * Badge "treinador humano" — boneco MatchDay (lima #b6ff38) ao lado do clube do usuário.
 */

export const HUMAN_BADGE_SVG = `<svg class="human-badge-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="7.5" r="3.4"/><path d="M5.2 19.8c.7-4.4 3.5-6.6 6.8-6.6s6.1 2.2 6.8 6.6"/></svg>`;

/**
 * @param {{ className?: string, title?: string }} [options]
 */
export const humanBadgeHtml = ({ className = '', title = 'Treinador humano' } = {}) => {
  const classes = ['human-badge', className].filter(Boolean).join(' ');
  return `<span class="${classes}" title="${title}" aria-label="${title}">${HUMAN_BADGE_SVG}</span>`;
};

/** Nome do clube + badge (listas / placares em HTML). */
export const clubNameWithHumanHtml = (clubName, isHuman, options = {}) => {
  const name = String(clubName || '');
  if (!name) return '';
  const tag = options.tag || 'span';
  const linked = options.linked !== false;
  const className = [options.className || (linked ? 'club-link' : ''), options.extraClass]
    .filter(Boolean)
    .join(' ');
  const attrs = linked
    ? ` class="${className}" data-club="${name}" role="button" tabindex="0"`
    : className
      ? ` class="${className}"`
      : '';
  const label = options.uppercase ? name.toUpperCase() : name;
  const inner = `<${tag}${attrs}>${label}</${tag}>`;
  if (!isHuman) return inner;
  return `<span class="club-with-human">${inner}${humanBadgeHtml({ className: 'is-inline' })}</span>`;
};

/** Garante wrapper no escudo para o badge no canto. */
export const ensureHumanBadgeHost = crestEl => {
  if (!crestEl) return null;
  if (crestEl.parentElement?.classList?.contains('human-badge-host')) {
    return crestEl.parentElement;
  }
  const host = document.createElement('span');
  host.className = 'human-badge-host';
  crestEl.replaceWith(host);
  host.appendChild(crestEl);
  return host;
};

/**
 * Liga/desliga o badge num escudo (ou host).
 * @param {Element|null} crestOrHost
 * @param {boolean} isHuman
 */
export const setHumanBadgeOnCrest = (crestOrHost, isHuman) => {
  if (!crestOrHost) return;
  const host = crestOrHost.classList?.contains('human-badge-host')
    ? crestOrHost
    : ensureHumanBadgeHost(crestOrHost);
  if (!host) return;
  const existing = host.querySelector(':scope > .human-badge');
  if (!isHuman) {
    existing?.remove();
    host.classList.remove('has-human');
    return;
  }
  if (!existing) host.insertAdjacentHTML('beforeend', humanBadgeHtml({ className: 'is-crest' }));
  host.classList.add('has-human');
};

/** HTML de escudo + badge (templates string). @deprecated use teamCrestWithHumanHtml em team-crest.js */
export const crestWithHumanHtml = (initials, { isHuman = false, away = false, className = '' } = {}) => {
  const crestClass = ['crest', away ? 'away' : '', className].filter(Boolean).join(' ');
  const crest = `<i class="${crestClass}" aria-hidden="true">${initials}</i>`;
  if (!isHuman) return crest;
  return `<span class="human-badge-host has-human">${crest}${humanBadgeHtml({ className: 'is-crest' })}</span>`;
};
