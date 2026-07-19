/**
 * Valuation e campos de mercado do jogador.
 */

import { estimatePlayerWage } from './economy.js';

const VALUE_BASE_BY_DIVISION = {
  A: 2_800_000,
  B: 1_350_000,
  C: 520_000,
  D: 140_000,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const valueAgeFactor = age => {
  const years = Number(age) || 28;
  if (years <= 21) return 1.28;
  if (years <= 25) return 1.15;
  if (years <= 29) return 1;
  if (years <= 32) return 0.72;
  return 0.42;
};

/**
 * Valor de mercado estimado (fee base em R$).
 * @param {object} player
 * @param {string} [division]
 */
export function estimatePlayerValue(player, division = 'A') {
  const base = VALUE_BASE_BY_DIVISION[division] ?? VALUE_BASE_BY_DIVISION.D;
  const overall = clamp(Number(player?.overall) || 60, 40, 99);
  const potential = clamp(Number(player?.potential) || overall, overall, 99);
  const ovrFactor = (overall / 70) ** 2.15;
  const potFactor = 1 + (potential - overall) * 0.018;
  const ageFactor = valueAgeFactor(player?.age);
  return Math.max(25_000, Math.round(base * ovrFactor * potFactor * ageFactor));
}

/**
 * Preenche campos de mercado se ausentes.
 * @param {object} player
 * @param {{ division?: string, season?: number }} [ctx]
 */
export function ensureMarketFields(player, ctx = {}) {
  if (!player || typeof player !== 'object') return player;
  const division = ctx.division || 'D';
  const season = Number(ctx.season) || 2026;
  if (player.marketValue == null || !Number.isFinite(Number(player.marketValue))) {
    player.marketValue = estimatePlayerValue(player, division);
  }
  if (player.wage == null || !Number.isFinite(Number(player.wage))) {
    player.wage = estimatePlayerWage(player, division);
  }
  if (player.contractUntil == null || !Number.isFinite(Number(player.contractUntil))) {
    const years = player.age <= 23 ? 3 : player.age <= 29 ? 2 : 1;
    player.contractUntil = season + years;
  }
  if (typeof player.listed !== 'boolean') player.listed = false;
  if (player.askingPrice == null) {
    player.askingPrice = player.listed ? player.marketValue : null;
  }
  return player;
}

/** Recalcula valor/salário (ex.: mudança de divisão). */
export function refreshMarketFields(player, ctx = {}) {
  if (!player || typeof player !== 'object') return player;
  const division = ctx.division || 'D';
  const season = Number(ctx.season) || 2026;
  player.marketValue = estimatePlayerValue(player, division);
  player.wage = estimatePlayerWage(player, division);
  if (player.contractUntil == null) {
    player.contractUntil = season + (player.age <= 23 ? 3 : 2);
  }
  if (player.listed && (player.askingPrice == null || player.askingPrice <= 0)) {
    player.askingPrice = player.marketValue;
  }
  return player;
}

export { VALUE_BASE_BY_DIVISION };
