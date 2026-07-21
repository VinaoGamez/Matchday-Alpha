/**
 * Fit de divisão para compra/venda — duas fases.
 *
 * Fase 1 · Oportunidade (esta função):
 *   Série menor quer jogador de série maior → na maioria das vezes NÃO há negócio.
 *   Chance cai com a queda de série; estrela quase nunca; normal também é raro em A→D.
 *   Rolagem estável (`unit`) decide se a janela de negociação abre.
 *
 * Fase 2 · Oferta (motor buyPlayer / evaluateSellerAccept / contra-proposta):
 *   Só se a Fase 1 liberar: piso, fee, contra-proposta, caixa, folha.
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
