/**
 * Badge de divisão ao lado do nome do clube (Série A/B/C/D).
 * Uso: chaveamento da Copa e lista de confrontos na página Campeonatos.
 */

import { teamCrestHtml } from './team-crest.js';

const DIVISIONS = new Set(['A', 'B', 'C', 'D']);

const resolveCtx = ctx => {
  if (!ctx) return { clubs: null, userClub: null, userDivision: null };
  return {
    clubs: typeof ctx.getClubs === 'function' ? ctx.getClubs() : ctx.clubs,
    userClub: typeof ctx.getUserClub === 'function' ? ctx.getUserClub() : ctx.userClub,
    userDivision: typeof ctx.getUserDivision === 'function' ? ctx.getUserDivision() : ctx.userDivision,
  };
};

export const resolveClubDivision = (clubName, ctx) => {
  const { clubs, userClub, userDivision } = resolveCtx(ctx);
  const name = String(clubName || '');
  const division = clubs?.[name]?.division || (name && name === userClub ? userDivision : null);
  return DIVISIONS.has(division) ? division : null;
};

export const divisionBadgeFromCode = division => {
  if (!DIVISIONS.has(division)) return '';
  return `<i class="club-div club-div-${division.toLowerCase()}" title="Série ${division}">Série ${division}</i>`;
};

export const clubDivisionBadgeHtml = (clubName, ctx) =>
  divisionBadgeFromCode(resolveClubDivision(clubName, ctx));

/**
 * @param {string} clubName
 * @param {object} ctx clubs | getClubs + userClub/getUserClub + userDivision/getUserDivision
 * @param {{ tag?: string, linked?: boolean, className?: string, extraClass?: string }} [options]
 */
export const clubLabelHtml = (clubName, ctx, options = {}) => {
  const name = String(clubName || '');
  if (!name) return '';
  const tag = options.tag || 'span';
  const linked = options.linked !== false;
  const className = [options.className || 'club-link', options.extraClass].filter(Boolean).join(' ');
  const badge = clubDivisionBadgeHtml(name, ctx);
  const attrs = linked
    ? ` class="${className}" data-club="${name}" role="button" tabindex="0"`
    : ` class="${className}"`;
  return `<span class="club-label">${`<${tag}${attrs}>${name}</${tag}>`}${badge}</span>`;
};

/** Iniciais padrão do escudo (até 2 letras). */
export const defaultClubCrestInitials = name =>
  String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '—';

/**
 * Padrão visual: escudo + nome do clube ou bandeira da seleção.
 * @param {string} clubName
 * @param {{ initialsFn?: (name:string)=>string, className?: string }} [options]
 */
export const clubCrestTitleHtml = (clubName, options = {}) => {
  const name = String(clubName || '');
  if (!name) return '';
  const className = ['club-crest-title', options.className].filter(Boolean).join(' ');
  return `<span class="${className}">${teamCrestHtml(name)}<b>${name}</b></span>`;
};
