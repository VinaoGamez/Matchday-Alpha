/**
 * Escudo unificado — clubes (iniciais) ou seleções (bandeira).
 */

import {
  isNationalTeam,
  nationalTeamFlagUrlForTeam,
  resolveNationalTeam,
} from '../engine/national-teams.js';
import { humanBadgeHtml } from './human-badge.js';

export function clubStyleInitials(name) {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function teamCrestLabel(teamKey) {
  const nt = resolveNationalTeam(teamKey);
  return nt?.name || String(teamKey || '');
}

export function teamUsesFlagCrest(teamKey) {
  return isNationalTeam(teamKey);
}

/** Atualiza elemento `.crest` existente (placar ao vivo). */
export function applyTeamCrestToElement(el, teamKey, { away = false } = {}) {
  if (!el) return;
  const nt = resolveNationalTeam(teamKey);
  el.classList.toggle('away', !!away);
  if (nt) {
    const src = nationalTeamFlagUrlForTeam(nt.code);
    el.classList.add('crest--flag');
    el.textContent = '';
    el.title = nt.name;
    el.setAttribute('aria-label', nt.name);
    let img = el.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      el.appendChild(img);
    }
    if (src) img.src = src;
    return;
  }
  el.classList.remove('crest--flag');
  const img = el.querySelector('img');
  img?.remove();
  const label = String(teamKey || '');
  el.textContent = clubStyleInitials(label);
  el.title = label;
  el.setAttribute('aria-label', label);
}

/**
 * HTML do escudo — bandeira para seleção, iniciais para clube.
 */
export function teamCrestHtml(teamKey, { away = false, className = '', title = '' } = {}) {
  const nt = resolveNationalTeam(teamKey);
  const crestClass = ['crest', away ? 'away' : '', className, nt ? 'crest--flag' : '']
    .filter(Boolean)
    .join(' ');
  const label = title || teamCrestLabel(teamKey);

  if (nt) {
    const src = nationalTeamFlagUrlForTeam(nt.code);
    if (src) {
      return `<i class="${crestClass}" title="${label}" aria-label="${label}"><img src="${src}" alt="" loading="lazy" decoding="async"></i>`;
    }
  }

  const initials = clubStyleInitials(teamKey);
  return `<i class="${crestClass}" title="${label}" aria-label="${label}">${initials}</i>`;
}

/** Escudo + badge treinador humano. */
export function teamCrestWithHumanHtml(teamKey, { isHuman = false, away = false, className = '' } = {}) {
  const crest = teamCrestHtml(teamKey, { away, className });
  if (!isHuman) return crest;
  return `<span class="human-badge-host has-human">${crest}${humanBadgeHtml({ className: 'is-crest' })}</span>`;
}

/** Compat — alias usado pelo motor legado. */
export const clubCrestInitials = clubStyleInitials;
