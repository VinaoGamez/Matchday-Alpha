/**
 * Fit de divisão para compra/venda — três caminhos.
 *
 * Fase 1 · Oportunidade (`evaluateSellerDivisionFit`):
 *   Série menor quer jogador de série maior → na maioria das vezes NÃO há negócio.
 *   Rolagem estável (`unit`) decide se a janela de negociação abre.
 *
 * Fase 2 · Oferta (motor buyPlayer / evaluateSellerAccept / contra-proposta):
 *   Só se a Fase 1 liberar: piso, fee, contra-proposta, caixa, folha.
 *
 * Atalho caro (`estimateSellDownBuyout` / `resolveSellDownBuyout`):
 *   Fase 1 fechada → oferta ≥ N× valor abre chance rara (sobe com o preço, teto baixo).
 *   Sim/não — sem contra-proposta. Vale para todas as quedas (−1/−2/−3).
 *
 * gapBuyer = rank(comprador) − rank(vendedor): + = comprador de série maior.
 */

export const TRANSFER_DIV_RANK = { A: 4, B: 3, C: 2, D: 1 };

/**
 * Estrela do elenco vendedor (não qualquer OVR de Série A).
 * Normal/reserva: OVR perto da média ou abaixo do poder+6.
 */
export function isSellerStar(player, { power = 60, rosterAvgOvr = null } = {}) {
  const ovr = Number(player?.overall) || 0;
  const avg = Number.isFinite(Number(rosterAvgOvr)) ? Number(rosterAvgOvr) : power;
  return ovr >= power + 6 || ovr >= avg + 5;
}

/**
 * Chance base de ABRIR negociação (Fase 1) quando o comprador é mais fraco.
 * drop 3 = A→D / B→… : ~2,5% base antes de modificadores.
 */
export const SELL_DOWN_ACCEPT = {
  0: 0.96,
  1: 0.42,
  2: 0.1,
  3: 0.025,
};

/** Chance base de clube bem superior ofertar em quem está abaixo (sem listar). */
export const BUY_UP_OFFER = {
  0: 0.95,
  1: 0.7,
  2: 0.18,
  3: 0.05,
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function transferDivRank(division) {
  return TRANSFER_DIV_RANK[division] || 2;
}

/** rank(comprador) − rank(vendedor). */
export function buyerDivisionGap(buyerDivision, sellerDivision) {
  return transferDivRank(buyerDivision) - transferDivRank(sellerDivision);
}

/**
 * Fase 1: existe oportunidade de compra/venda nesta direção de séries?
 * Prefira sempre passar `unit` (rolagem estável) quando drop ≥ 1.
 */
export function evaluateSellerDivisionFit({
  player,
  buyerDivision = 'C',
  sellerDivision = 'C',
  listed = false,
  rosterAvgOvr = null,
  sellerPower = null,
  unit = null,
} = {}) {
  const gap = buyerDivisionGap(buyerDivision, sellerDivision);
  if (gap >= 0) {
    return { ok: true, chance: 0.95, gap, reason: null, star: false, phase: 'open' };
  }

  const drop = -gap;
  const power = Number(sellerPower) || 60;
  const avg = Number(rosterAvgOvr);
  const star = isSellerStar(player, {
    power,
    rosterAvgOvr: Number.isFinite(avg) ? avg : power,
  });
  const age = Number(player?.age) || 26;

  // Estrela em queda máxima: sem Fase 1 (nem listado).
  if (star && drop >= 3) {
    return { ok: false, chance: 0, gap, reason: 'division_gap', star: true, phase: 'blocked' };
  }
  // Estrela clara (−2 séries), adulto, não listado: sem Fase 1.
  if (star && drop >= 2 && age > 23 && !listed && (Number(player?.overall) || 0) >= power + 8) {
    return { ok: false, chance: 0, gap, reason: 'division_gap', star: true, phase: 'blocked' };
  }

  let chance = SELL_DOWN_ACCEPT[Math.min(3, drop)] ?? 0.02;
  if (star) chance *= 0.35;
  else chance *= 1.1; // normal: leve alívio, ainda raro em drop 3 (~2,8%)
  if (listed) chance = Math.min(0.35, chance + 0.04); // listar ajuda pouco
  if (age <= 21 && drop <= 2 && !star) chance = Math.min(0.45, chance + 0.06);
  if (age >= 30 && drop >= 2 && star) chance *= 0.6;
  chance = clamp(chance, 0.01, 0.55);

  // Auto-ok só em queda leve com chance alta (ex.: B←A com boa margem).
  if (drop === 1 && chance >= 0.5) {
    return { ok: true, chance, gap, reason: null, star, phase: 'open' };
  }

  if (typeof unit === 'function') {
    const roll = unit();
    if (roll < chance) {
      return { ok: true, chance, gap, reason: null, star, phase: 'open', roll };
    }
    return { ok: false, chance, gap, reason: 'division_gap', star, phase: 'no_window', roll };
  }

  // Sem rolagem: conservador — drop≥2 não abre; drop 1 só se chance forte.
  if (drop >= 2) {
    return { ok: false, chance, gap, reason: 'division_gap', star, phase: 'no_window' };
  }
  if (chance < 0.4) {
    return { ok: false, chance, gap, reason: 'division_gap', star, phase: 'no_window' };
  }
  return { ok: true, chance, gap, reason: null, star, phase: 'open' };
}

/**
 * Clube bem superior deve ofertar no elenco de série menor?
 * Usado na geração de propostas IA → usuário.
 */
export function evaluateBuyerOfferDivisionFit({
  player,
  buyerDivision = 'C',
  sellerDivision = 'C',
  listed = false,
  loanListed = false,
  rosterAvgOvr = null,
  unit = null,
} = {}) {
  const gap = buyerDivisionGap(buyerDivision, sellerDivision);
  if (gap <= 0) {
    return { ok: true, chance: 0.9, gap, reason: null };
  }

  let chance = BUY_UP_OFFER[Math.min(3, gap)] ?? 0.04;
  const ovr = Number(player?.overall) || 50;
  const avg = Number(rosterAvgOvr);
  if (listed || loanListed) chance = Math.min(0.95, chance + 0.35);
  if (Number.isFinite(avg) && ovr >= avg + 6) chance = Math.min(0.95, chance + 0.25);
  else if (Number.isFinite(avg) && ovr < avg + 2) chance *= 0.35;
  chance = clamp(chance, 0.02, 0.95);

  if (gap >= 3 && !listed && !(Number.isFinite(avg) && ovr >= avg + 8)) {
    return { ok: false, chance: 0, gap, reason: 'division_gap' };
  }

  if (chance >= 0.7) return { ok: true, chance, gap, reason: null };

  if (typeof unit === 'function') {
    if (unit() < chance) return { ok: true, chance, gap, reason: null };
    return { ok: false, chance, gap, reason: 'division_gap' };
  }

  if (chance < 0.2) return { ok: false, chance, gap, reason: 'division_gap' };
  return { ok: true, chance, gap, reason: null };
}

/** Ajuste no piso (Fase 2) quando o comprador é de série menor. */
export function sellerAcceptRatioDeltaForDivision(buyerDivision, sellerDivision) {
  const gap = buyerDivisionGap(buyerDivision, sellerDivision);
  if (gap >= 0) return 0;
  const drop = -gap;
  if (drop === 1) return 0.04;
  if (drop === 2) return 0.08;
  return 0.12;
}

/**
 * Atalho caro quando a Fase 1 fechou (comprador de série inferior).
 * Mesma regra por tamanho da queda — vale B←A, D←C (−1), C←A / D←B (−2), D←A (−3).
 *
 * | drop | mín. × valor | teto | teto estrela |
 * | 1    | 2,2×         | 28% | 6%           |
 * | 2    | 3,0×         | 11% | 2%           |
 * | 3    | 4,5×         | 5%  | 0,7%         |
 *
 * Estrela quase não desce de série — tetos bem abaixo do jogador comum.
 * Idade ≥ 32 ou contrato ≤ 1 ano: teto ×1,4 e mín. −0,3× (estrela drop 3 fica &lt; 1%).
 */
export const SELL_DOWN_BUYOUT = {
  1: { minMult: 2.2, cap: 0.28, starCap: 0.06 },
  2: { minMult: 3.0, cap: 0.11, starCap: 0.02 },
  3: { minMult: 4.5, cap: 0.05, starCap: 0.007 },
};

/** Quanto acima do mínimo (em ×) para chegar ao teto de chance. */
export const SELL_DOWN_BUYOUT_CURVE = 1;

/**
 * Estima chance / taxa mínima do atalho caro (sem rolagem).
 * @returns {{
 *   eligible: boolean,
 *   attemptable: boolean,
 *   drop: number,
 *   star: boolean,
 *   minMult: number,
 *   minFee: number,
 *   maxChance: number,
 *   chance: number,
 *   value: number,
 *   fee: number,
 * }}
 */
export function estimateSellDownBuyout({
  player,
  fee = 0,
  value = 0,
  buyerDivision = 'C',
  sellerDivision = 'C',
  rosterAvgOvr = null,
  sellerPower = null,
  season = 2030,
} = {}) {
  const gap = buyerDivisionGap(buyerDivision, sellerDivision);
  const marketValue = Math.max(1, Math.round(Number(value) || Number(player?.marketValue) || 1));
  const offer = Math.max(0, Math.round(Number(fee) || 0));
  if (gap >= 0) {
    return {
      eligible: false,
      attemptable: false,
      drop: 0,
      star: false,
      minMult: 1,
      minFee: marketValue,
      maxChance: 0,
      chance: 0,
      value: marketValue,
      fee: offer,
    };
  }

  const drop = Math.min(3, -gap);
  const power = Number(sellerPower) || 60;
  const avg = Number(rosterAvgOvr);
  const star = isSellerStar(player, {
    power,
    rosterAvgOvr: Number.isFinite(avg) ? avg : power,
  });
  const age = Number(player?.age) || 26;
  const yearsLeft = Math.max(0, (Number(player?.contractUntil) || season) - season);
  const table = SELL_DOWN_BUYOUT[drop] || SELL_DOWN_BUYOUT[3];
  let minMult = table.minMult;
  let maxChance = star ? table.starCap : table.cap;

  if (age >= 32 || yearsLeft <= 1) {
    // Estrela: alívio menor — ainda deve raramente descer de série.
    const ageBoost = star ? 1.2 : 1.4;
    const ageCeiling = star ? (drop >= 3 ? 0.009 : drop >= 2 ? 0.03 : 0.08) : 0.4;
    maxChance = Math.min(ageCeiling, maxChance * ageBoost);
    minMult = Math.max(1.5, minMult - (star ? 0.15 : 0.3));
  }

  const minFee = Math.round(marketValue * minMult);
  if (offer < minFee) {
    return {
      eligible: true,
      attemptable: false,
      drop,
      star,
      minMult,
      minFee,
      maxChance,
      chance: 0,
      value: marketValue,
      fee: offer,
    };
  }

  const ratio = offer / Math.max(1, minFee);
  const t = clamp((ratio - 1) / SELL_DOWN_BUYOUT_CURVE, 0, 1);
  const floorChance = maxChance * 0.12;
  const chance = floorChance + (maxChance - floorChance) * t;

  return {
    eligible: true,
    attemptable: true,
    drop,
    star,
    minMult,
    minFee,
    maxChance,
    chance: clamp(chance, 0, maxChance),
    value: marketValue,
    fee: offer,
  };
}

/**
 * Resolve o atalho caro com rolagem (sim/não — sem contra-proposta).
 * @param {{ unit?: () => number }} opts — unit em [0,1); se omitido, Math.random
 */
export function resolveSellDownBuyout(opts = {}) {
  const est = estimateSellDownBuyout(opts);
  if (!est.eligible || !est.attemptable) {
    return {
      ...est,
      accept: false,
      roll: null,
      reason: !est.eligible ? null : 'buyout_below_min',
    };
  }
  const unit = typeof opts.unit === 'function' ? opts.unit : Math.random;
  const roll = clamp(Number(unit()) || 0, 0, 0.999999);
  const accept = roll < est.chance;
  return {
    ...est,
    accept,
    roll,
    reason: accept ? null : 'buyout_rejected',
  };
}
