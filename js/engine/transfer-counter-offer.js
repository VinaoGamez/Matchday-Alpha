/**
 * Contra-proposta em negociação entre divisões.
 * Série menor ofertar abaixo do piso de série maior → chance de contra em vez de “não”.
 */

import { buyerDivisionGap, isSellerStar } from './transfer-division-fit.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Chance base de contra por queda de série do comprador. */
export const COUNTER_CHANCE_BY_DROP = {
  1: 0.55,
  2: 0.4,
  3: 0.3,
};

export { isSellerStar };

/**
 * @returns {{ counter: boolean, fee?: number, chance: number, drop: number, reason?: string }}
 */
export function evaluateCounterOffer({
  offerFee,
  floor,
  ask,
  value,
  buyerDivision = 'C',
  sellerDivision = 'C',
  player = null,
  power = 60,
  rosterAvgOvr = null,
  random = Math.random,
} = {}) {
  const gap = buyerDivisionGap(buyerDivision, sellerDivision);
  const offer = Math.round(Number(offerFee) || 0);
  const minAccept = Math.round(Number(floor) || 0);
  const askPrice = Math.round(Number(ask) || Number(value) || 0);
  const market = Math.round(Number(value) || askPrice || 0);

  if (!(offer > 0) || !(minAccept > 0)) {
    return { counter: false, chance: 0, drop: 0, reason: 'invalid' };
  }
  // Comprador igual/superior: sem contra por divisão (aceita ou recusa no piso).
  if (gap >= 0) {
    return { counter: false, chance: 0, drop: 0, reason: 'same_or_stronger' };
  }
  // Já alcança o piso → seria aceite, não contra.
  if (offer >= minAccept) {
    return { counter: false, chance: 0, drop: -gap, reason: 'already_accept' };
  }

  const drop = -gap;
  const star = isSellerStar(player, { power, rosterAvgOvr });
  let chance = COUNTER_CHANCE_BY_DROP[Math.min(3, drop)] ?? 0.25;
  if (!star) chance += 0.18;
  else chance *= 0.65;

  const shortfallPct = (minAccept - offer) / Math.max(1, minAccept);
  if (shortfallPct > 0.4) chance *= 0.45;
  else if (shortfallPct > 0.25) chance *= 0.7;
  else if (shortfallPct < 0.1) chance += 0.15;

  // Oferta ridícula: não perde tempo.
  if (offer < minAccept * 0.45) {
    return { counter: false, chance: 0, drop, reason: 'too_low' };
  }

  chance = clamp(chance, 0.05, 0.85);
  if (random() >= chance) {
    return { counter: false, chance, drop, reason: 'rolled_out' };
  }

  const minCounter = Math.max(Math.round(offer * 1.08), minAccept);
  const ceiling = Math.round(Math.max(askPrice, market) * (star ? 1.02 : 0.98));
  const fee =
    minCounter >= ceiling
      ? minCounter
      : Math.round(minCounter + random() * (ceiling - minCounter));

  return {
    counter: true,
    fee: Math.max(minCounter, fee),
    chance,
    drop,
    star,
    shortfallPct,
  };
}
