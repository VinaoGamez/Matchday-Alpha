import { isKnockoutShootoutCompetition, knockoutCompetitionLabel, KNOCKOUT_COMPETITIONS } from '../engine/knockout-shootout.js';

/** SVG do troféu reutilizado no selo de campeonato. */
export const COMPETITION_TROPHY_SVG = `<svg class="match-competition-trophy" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path class="trophy-cup" d="M8 4h16v3c0 4.5-2.2 7.8-5.5 9.5L18 20v2h4v3H10v-3h4v-2l-.5-3.5C10.2 14.8 8 11.5 8 7V4z"/><path class="trophy-shine" d="M11 6h10v1.5c0 3.2-1.5 5.6-3.8 7L16 17.5 14.8 14.5C12.5 12.6 11 10.2 11 7V6z"/><rect class="trophy-base" x="12" y="25" width="8" height="2" rx="1"/><path class="trophy-handles" fill="none" stroke-width="1.2" d="M8 6H5.5a2.5 2.5 0 0 0 0 5H8M24 6h2.5a2.5 2.5 0 0 1 0 5H24"/></svg>`;

/**
 * Resolve nome e variante visual do campeonato do confronto.
 * @param {object|null} game
 * @param {{ userDivision?: string }} [opts]
 * @returns {{ name: string, kind: string }}
 */
export function resolveCompetitionBadge(game, { userDivision = 'A' } = {}) {
  const serieKind = `serie-${String(userDivision || 'a').toLowerCase()}`;
  if (!game) {
    return { name: `Brasileirão Série ${userDivision}`, kind: serieKind };
  }
  if (game.competition === KNOCKOUT_COMPETITIONS.COPA || game.competition === 'COPA DO BRASIL') {
    return { name: 'Copa do Brasil', kind: 'cup' };
  }
  if (game.competition === 'COPA DO MUNDO') {
    return { name: 'Copa do Mundo', kind: 'world-cup' };
  }
  if (isKnockoutShootoutCompetition(game)) {
    if (
      game.competition === KNOCKOUT_COMPETITIONS.SERIE_D ||
      String(game.competition || '').includes('SÉRIE D')
    ) {
      return { name: 'Brasileirão Série D', kind: 'serie-d' };
    }
    const label = knockoutCompetitionLabel(game).split('·')[0].trim();
    return { name: label || 'Mata-mata', kind: 'cup' };
  }
  // Liga: usa divisão do clube do usuário (campeonato nacional da carreira).
  return { name: `Brasileirão Série ${userDivision}`, kind: serieKind };
}

/**
 * Atualiza um elemento `.match-competition` já presente no DOM.
 * @param {string|Element} target — seletor, id ou elemento
 * @param {object|null} game
 * @param {{ userDivision?: string, hidden?: boolean, nameSelector?: string }} [opts]
 */
export function applyCompetitionBadge(target, game, opts = {}) {
  const el =
    typeof target === 'string'
      ? document.querySelector(target.startsWith('#') || target.startsWith('.') ? target : `#${target}`)
      : target;
  if (!el) return null;
  const nameEl =
    (opts.nameSelector && el.querySelector(opts.nameSelector)) ||
    el.querySelector('[data-competition-name]') ||
    el.querySelector('b');
  if (opts.hidden) {
    el.classList.add('hidden');
    return null;
  }
  const info = resolveCompetitionBadge(game, { userDivision: opts.userDivision });
  el.classList.remove('hidden');
  el.dataset.kind = info.kind;
  el.setAttribute('aria-label', info.name);
  if (nameEl) nameEl.textContent = info.name;
  return info;
}

/**
 * Markup HTML do selo (para injeção estática ou dinâmica).
 * @param {{ id?: string|null, nameId?: string|null, name?: string, kind?: string, extraClass?: string }} [opts]
 */
export function competitionBadgeMarkup({
  id = 'matchCompetition',
  nameId = 'matchCompetitionName',
  name = 'Brasileirão Série A',
  kind = 'serie-a',
  extraClass = '',
} = {}) {
  const idAttr = id ? ` id="${id}"` : '';
  const nameIdAttr = nameId ? ` id="${nameId}"` : '';
  const className = ['match-competition', extraClass].filter(Boolean).join(' ');
  return `<span${idAttr} class="${className}" data-kind="${kind}" aria-label="${name}">${COMPETITION_TROPHY_SVG}<b${nameIdAttr} data-competition-name>${name}</b></span>`;
}
