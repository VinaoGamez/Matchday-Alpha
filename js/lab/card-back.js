/**
 * Verso do card — top 3 stats (gauge), +10 barras, pé forte, carreira.
 */

import {
  isCraque,
  isPenaltySavingSpecialist,
  isSetPieceSpecialist,
} from '../engine/player-generation.js';
import { CARD_BADGE_ASSETS, resolveSpecialistHexBadge } from './card-badges.js';

const FULL_STAT_CATALOG = {
  GOL: [
    ['Reflexos', 'reflexes'],
    ['Pos.', 'positioning'],
    ['Def. pênalti', 'penaltySaving'],
    ['Passe', 'passing'],
    ['Velocidade', 'speed'],
    ['Saída', 'playmaking'],
    ['Drible', 'dribble'],
    ['Marcação', 'marking'],
    ['Desarme', 'tackling'],
    ['Finaliz.', 'finishing'],
    ['Cabeceio', 'heading'],
    ['Falta', 'freeKick'],
    ['Pênalti', 'penaltyTaking'],
  ],
  ZAG: [
    ['Marcação', 'marking'],
    ['Desarme', 'tackling'],
    ['Cabeceio', 'heading'],
    ['Passe', 'passing'],
    ['Velocidade', 'speed'],
    ['Drible', 'dribble'],
    ['Finaliz.', 'finishing'],
    ['Visão', 'playmaking'],
    ['Falta', 'freeKick'],
    ['Pênalti', 'penaltyTaking'],
    ['Pos. def.', 'positioning'],
    ['Força', 'speed'],
    ['Agilidade', 'dribble'],
  ],
  LAT: [
    ['Velocidade', 'speed'],
    ['Cruzamento', 'passing'],
    ['Passe', 'playmaking'],
    ['Desarme', 'tackling'],
    ['Marcação', 'marking'],
    ['Drible', 'dribble'],
    ['Finaliz.', 'finishing'],
    ['Cabeceio', 'heading'],
    ['Falta', 'freeKick'],
    ['Pênalti', 'penaltyTaking'],
    ['Pos.', 'positioning'],
    ['Força', 'tackling'],
    ['Resist.', 'speed'],
  ],
  VOL: [
    ['Desarme', 'tackling'],
    ['Marcação', 'marking'],
    ['Passe', 'passing'],
    ['Visão', 'playmaking'],
    ['Velocidade', 'speed'],
    ['Cabeceio', 'heading'],
    ['Drible', 'dribble'],
    ['Finaliz.', 'finishing'],
    ['Falta', 'freeKick'],
    ['Pênalti', 'penaltyTaking'],
    ['Pos.', 'positioning'],
    ['Força', 'tackling'],
    ['Intercep.', 'marking'],
  ],
  MC: [
    ['Passe', 'passing'],
    ['Visão', 'playmaking'],
    ['Desarme', 'tackling'],
    ['Velocidade', 'speed'],
    ['Drible', 'dribble'],
    ['Finaliz.', 'finishing'],
    ['Marcação', 'marking'],
    ['Cabeceio', 'heading'],
    ['Falta', 'freeKick'],
    ['Pênalti', 'penaltyTaking'],
    ['Pos.', 'positioning'],
    ['Força', 'tackling'],
    ['Resist.', 'speed'],
  ],
  MEI: [
    ['Passe', 'passing'],
    ['Drible', 'dribble'],
    ['Velocidade', 'speed'],
    ['Finaliz.', 'finishing'],
    ['Visão', 'playmaking'],
    ['Falta', 'freeKick'],
    ['Pênalti', 'penaltyTaking'],
    ['Marcação', 'marking'],
    ['Desarme', 'tackling'],
    ['Cabeceio', 'heading'],
    ['Pos.', 'positioning'],
    ['Agilidade', 'dribble'],
    ['Força', 'speed'],
  ],
  PE: [
    ['Velocidade', 'speed'],
    ['Drible', 'dribble'],
    ['Cruzamento', 'passing'],
    ['Finaliz.', 'finishing'],
    ['Passe', 'playmaking'],
    ['Falta', 'freeKick'],
    ['Pênalti', 'penaltyTaking'],
    ['Marcação', 'marking'],
    ['Desarme', 'tackling'],
    ['Cabeceio', 'heading'],
    ['Pos.', 'positioning'],
    ['Força', 'speed'],
    ['Agilidade', 'dribble'],
  ],
  PD: [
    ['Velocidade', 'speed'],
    ['Drible', 'dribble'],
    ['Cruzamento', 'passing'],
    ['Finaliz.', 'finishing'],
    ['Passe', 'playmaking'],
    ['Falta', 'freeKick'],
    ['Pênalti', 'penaltyTaking'],
    ['Marcação', 'marking'],
    ['Desarme', 'tackling'],
    ['Cabeceio', 'heading'],
    ['Pos.', 'positioning'],
    ['Força', 'speed'],
    ['Agilidade', 'dribble'],
  ],
  ATA: [
    ['Finaliz.', 'finishing'],
    ['Velocidade', 'speed'],
    ['Pos. ataque', 'positioning'],
    ['Drible', 'dribble'],
    ['Cabeceio', 'heading'],
    ['Passe', 'passing'],
    ['Visão', 'playmaking'],
    ['Falta', 'freeKick'],
    ['Pênalti', 'penaltyTaking'],
    ['Marcação', 'marking'],
    ['Desarme', 'tackling'],
    ['Força', 'speed'],
    ['Agilidade', 'dribble'],
  ],
};

const esc = v =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function statVal(player, key) {
  const n = num(player?.[key]);
  if (n == null || n <= 0) return null;
  return Math.round(n);
}

function catalogFor(pos) {
  if (pos === 'PON') return FULL_STAT_CATALOG.PD;
  return FULL_STAT_CATALOG[pos] || FULL_STAT_CATALOG.GOL;
}

function rankedStats(player, pos = 'GOL') {
  const seen = new Set();
  return catalogFor(pos)
    .map(([label, key]) => {
      if (seen.has(key)) return null;
      seen.add(key);
      const value = statVal(player, key);
      return value == null ? null : { label, key, value };
    })
    .filter(Boolean)
    .sort((a, b) => b.value - a.value);
}

export function topThreeStats(player, pos = 'GOL') {
  return rankedStats(player, pos).slice(0, 3);
}

export function barStats(player, pos = 'GOL') {
  const ranked = rankedStats(player, pos);
  const topKeys = new Set(ranked.slice(0, 3).map(s => s.key));
  const seen = new Set();
  return catalogFor(pos)
    .filter(([, key]) => !topKeys.has(key))
    .map(([label, key]) => {
      if (seen.has(key)) return null;
      seen.add(key);
      const value = statVal(player, key);
      return value == null ? null : { label, key, value };
    })
    .filter(Boolean)
    .slice(0, 10);
}

export function gaugeColor(value) {
  if (value >= 90) return '#22c55e';
  if (value >= 80) return '#84cc16';
  if (value >= 70) return '#eab308';
  if (value >= 60) return '#f97316';
  return '#ef4444';
}

function gaugeSvg(value, color) {
  const fill = Math.max(4, Math.min(100, value));
  return `<svg class="mdc-gauge-svg" viewBox="0 0 100 56" aria-hidden="true">
    <path class="mdc-gauge-track" pathLength="100" d="M 8 48 A 42 42 0 0 1 92 48" />
    <path class="mdc-gauge-fill" pathLength="100" stroke="${esc(color)}" stroke-dasharray="${fill} 100" d="M 8 48 A 42 42 0 0 1 92 48" />
  </svg>`;
}

function renderGauge({ label, value }) {
  const color = gaugeColor(value);
  return `<div class="mdc-gauge" style="--gauge-color:${color}">
    <span class="mdc-gauge-label">${esc(label)}</span>
    ${gaugeSvg(value, color)}
    <strong class="mdc-gauge-value">${value}</strong>
  </div>`;
}

function renderBarStat({ label, value }) {
  const color = gaugeColor(value);
  return `<div class="mdc-bar-stat">
    <div class="mdc-bar-head">
      <span>${esc(label)}</span>
      <strong>${value}</strong>
    </div>
    <div class="mdc-bar-track"><div class="mdc-bar-fill" style="width:${value}%;background:${esc(color)}"></div></div>
  </div>`;
}

function footSide(preferredFoot) {
  const foot = String(preferredFoot || 'Direito').toLowerCase();
  if (foot.includes('esq')) return 'left';
  if (foot.includes('ambi')) return 'both';
  return 'right';
}

function renderFeetCore(player) {
  const preferredFoot = player?.preferredFoot;
  const side = footSide(preferredFoot);
  const label = preferredFoot || 'Direito';
  const leftStrong = side === 'left' || side === 'both' ? ' is-strong' : '';
  const rightStrong = side === 'right' || side === 'both' ? ' is-strong' : '';
  return `<div class="mdc-feet-block">
    <span class="mdc-feet-title">Pé forte</span>
    <div class="mdc-feet" aria-label="Pé forte: ${esc(label)}">
      <svg class="mdc-foot-icon mdc-foot-icon--left${leftStrong}" viewBox="0 0 24 44" aria-hidden="true">
        <path d="M12 2C8 2 5 6 5 11c0 4 1 8 2 12 1 4 2 8 2 12 0 3 1 5 3 5s3-2 3-5c0-4 1-8 2-12 1-4 2-8 2-12 0-5-3-9-7-9z"/>
      </svg>
      <svg class="mdc-foot-icon mdc-foot-icon--right${rightStrong}" viewBox="0 0 24 44" aria-hidden="true">
        <path d="M12 2C8 2 5 6 5 11c0 4 1 8 2 12 1 4 2 8 2 12 0 3 1 5 3 5s3-2 3-5c0-4 1-8 2-12 1-4 2-8 2-12 0-5-3-9-7-9z"/>
      </svg>
    </div>
    <span class="mdc-feet-label">${esc(label)}</span>
  </div>`;
}

function renderHexBadge(player, { preview = false } = {}) {
  let asset = null;
  if (preview) {
    asset =
      player?.pos === 'GOL'
        ? CARD_BADGE_ASSETS.penaltySaving
        : CARD_BADGE_ASSETS.freeKick;
  } else {
    asset = resolveSpecialistHexBadge(player);
  }
  if (!asset) return '';
  return `<img class="mdc-foot-badge mdc-foot-badge--${asset.id}" src="${asset.url}" alt="${asset.label}" title="${asset.label}">`;
}

/** Craque (dourada) substitui especialista (prata) no mesmo slot. */
function renderStarBadge(player, { preview = false } = {}) {
  let asset = null;
  const isSpecialist =
    isSetPieceSpecialist(player) || isPenaltySavingSpecialist(player);
  if (preview) {
    asset = CARD_BADGE_ASSETS.specialistStar;
  } else if (isCraque(player)) {
    asset = CARD_BADGE_ASSETS.craque;
  } else if (isSpecialist) {
    asset = CARD_BADGE_ASSETS.specialistStar;
  }
  if (!asset) return '';
  const kind = asset.id === 'craque' ? 'craque' : 'star';
  return `<img class="mdc-foot-badge mdc-foot-badge--${kind}" src="${asset.url}" alt="${asset.label}" title="${asset.label}">`;
}

export function careerSnapshot(player) {
  const cs = player?.cardStats || {};
  const disc = player?.discipline || {};
  return {
    avgRating: num(cs.avgRating ?? player?.avgRating ?? player?.seasonAvg),
    apps: num(cs.clubApps ?? player?.clubApps ?? player?.apps) ?? 0,
    goals: num(cs.goals ?? player?.goals) ?? 0,
    assists: num(cs.assists ?? player?.assists) ?? 0,
    yellow: num(cs.yellowCards ?? player?.yellowCards ?? disc.yellowCards) ?? 0,
    red: num(cs.redCards ?? player?.redCards ?? disc.redCards) ?? 0,
  };
}

function fmtRating(v) {
  if (v == null) return '—';
  return v.toFixed(1).replace('.', ',');
}

function renderCareerRow(career) {
  return `<div class="mdc-career-grid">
    <div class="mdc-career-item"><span>Média</span><strong>${fmtRating(career.avgRating)}</strong></div>
    <div class="mdc-career-item"><span>Jogos</span><strong>${career.apps}</strong></div>
    <div class="mdc-career-item"><span>Gols</span><strong>${career.goals}</strong></div>
    <div class="mdc-career-item"><span>Assist.</span><strong>${career.assists}</strong></div>
    <div class="mdc-career-item mdc-career-item--cards">
      <span>Cartões</span>
      <strong class="mdc-cards">
        <i class="mdc-card-chip mdc-card-chip--y" title="Amarelos">${career.yellow}</i>
        <i class="mdc-card-chip mdc-card-chip--r" title="Vermelhos">${career.red}</i>
      </strong>
    </div>
  </div>`;
}

function renderCardActions({ enabled = true, mode = 'sell' } = {}) {
  const primaryLabel = mode === 'buy' ? 'Comprar' : 'Vender';
  const primaryAction = mode === 'buy' ? 'buy' : 'sell';
  const disabled = enabled ? '' : ' disabled aria-disabled="true"';
  const cls = enabled ? '' : ' is-disabled';
  return `<div class="mdc-card-actions${cls}">
    <button type="button" class="mdc-card-action mdc-card-action--sell" data-card-action="${primaryAction}"${disabled}>${primaryLabel}</button>
    <button type="button" class="mdc-card-action mdc-card-action--loan" data-card-action="loan"${disabled}>Emprestar</button>
  </div>`;
}

export function renderCardBack(player, meta, { showActions = true, actionMode = 'sell', actionsEnabled = true, previewSpecBadges = false } = {}) {
  const last = String(player?.name || '')
    .trim()
    .split(/\s+/)
    .pop()
    ?.toUpperCase() || '—';
  const age = num(player?.age);
  const ovr = statVal(player, 'overall') ?? '—';
  const pos = player?.pos || meta?.posLabel || 'GOL';
  const roleName = meta?.role || 'GOLEIRO';
  const topStats = topThreeStats(player, pos);
  const bars = barStats(player, pos);
  const career = careerSnapshot(player);

  const gauges =
    topStats.length > 0
      ? topStats.map(renderGauge).join('')
      : '<p class="mdc-back-empty">Sem atributos</p>';

  const barGrid =
    bars.length > 0
      ? bars.map(renderBarStat).join('')
      : '';

  return `<div class="md-card-face md-card-back">
    <div class="mdc-back-zone" data-zone="backHead">
      <div class="md-card-back-head">
        <div class="md-card-back-id">
          <strong class="md-card-back-last">${esc(last)}</strong>
          <span class="md-card-back-role">${esc(roleName)} · ${age ?? '—'} anos</span>
        </div>
        <div class="md-card-back-ovr-wrap">
          <small>OVR</small>
          <span class="md-card-back-ovr">${esc(String(ovr))}</span>
        </div>
      </div>
    </div>
    <div class="mdc-back-zone" data-zone="backGauges">
      <div class="mdc-gauge-row">${gauges}</div>
    </div>
    ${barGrid ? `<div class="mdc-back-zone" data-zone="backBars"><div class="mdc-bar-grid">${barGrid}</div></div>` : ''}
    <div class="mdc-back-zone" data-zone="backFeet">${renderFeetCore(player)}</div>
    <div class="mdc-back-zone" data-zone="backSpecHex">${renderHexBadge(player, { preview: previewSpecBadges })}</div>
    <div class="mdc-back-zone" data-zone="backSpecStar">${renderStarBadge(player, { preview: previewSpecBadges })}</div>
    <div class="mdc-back-zone" data-zone="backCareer">${renderCareerRow(career)}</div>
    ${showActions ? `<div class="mdc-back-zone" data-zone="actions">${renderCardActions({ enabled: actionsEnabled, mode: actionMode })}</div>` : ''}
    <div class="mdc-back-zone" data-zone="backBrand">
      <footer class="md-card-back-brand">Matchday · Alpha</footer>
    </div>
  </div>`;
}
