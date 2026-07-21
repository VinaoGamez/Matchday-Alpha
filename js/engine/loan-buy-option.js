/**
 * Opção de compra em empréstimo.
 *
 * Contrato:
 * - Toda cessão carrega `loanBuyOption` com taxa fixa no ato.
 * - Só o clube hospedeiro exerce; origem não recusa.
 * - Jogador já está no elenco/folha do host → exercício não “re-contrata” vaga/salário.
 * - Sem exercício: retorno no fim da temporada.
 */

export const LOAN_BUY_FEE_RATIO = { min: 1.0, max: 1.2 };

/** Ajuste leve por divisão do clube de origem (vendedor). */
export const LOAN_BUY_DIVISION_BIAS = {
  A: 1.05,
  B: 1.02,
  C: 1.0,
  D: 0.97,
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Taxa fixa da opção — 100–120% do market value × bias da divisão.
 * Determinística se `random` for seeded.
 */
export function rollLoanBuyFee(marketValue, { division = 'C', random = Math.random } = {}) {
  const value = Math.max(0, Math.round(Number(marketValue) || 0));
  const bias = LOAN_BUY_DIVISION_BIAS[division] ?? 1;
  const { min, max } = LOAN_BUY_FEE_RATIO;
  const ratio = min + random() * (max - min);
  const fee = Math.round(value * ratio * bias);
  return Math.max(value > 0 ? 1 : 0, fee);
}

/** Anexa opção ao jogador no momento do empréstimo. */
export function attachLoanBuyOption(
  player,
  { marketValue, division = 'C', season = null, random = Math.random } = {},
) {
  if (!player) return null;
  const base = Math.round(Number(marketValue ?? player.marketValue) || 0);
  const fee = rollLoanBuyFee(base, { division, random });
  player.loanBuyOption = {
    fee,
    marketValueAtLoan: base,
    division,
    season: season ?? null,
  };
  return player.loanBuyOption;
}

export function clearLoanBuyOption(player) {
  if (!player) return;
  delete player.loanBuyOption;
}

/**
 * Pode o hospedeiro exercer a opção?
 * @param {object} ctx
 * @param {object} ctx.player
 * @param {string} ctx.hostClubName
 * @param {boolean} ctx.marketOpen
 * @param {(fee:number)=>boolean} ctx.canAfford
 * @param {number} [ctx.hostRosterSize]
 * @param {number} [ctx.rosterHardMax=40]
 */
export function canExerciseLoanBuyOption({
  player,
  hostClubName,
  marketOpen = true,
  canAfford = () => true,
  hostRosterSize = 0,
  rosterHardMax = 40,
} = {}) {
  if (!player?.onLoan || !player.loanFrom) {
    return { ok: false, reason: 'not_on_loan' };
  }
  if (!player.loanBuyOption || !Number.isFinite(Number(player.loanBuyOption.fee))) {
    return { ok: false, reason: 'no_buy_option' };
  }
  if (!hostClubName) return { ok: false, reason: 'no_club' };
  // Hospedeiro = clube atual; origem é loanFrom.
  if (player.loanFrom === hostClubName) {
    return { ok: false, reason: 'same_club' };
  }
  if (!marketOpen) return { ok: false, reason: 'market_closed' };

  const fee = Math.round(Number(player.loanBuyOption.fee) || 0);
  if (fee <= 0) return { ok: false, reason: 'invalid_fee' };
  if (typeof canAfford === 'function' && !canAfford(fee)) {
    return { ok: false, reason: 'no_funds', fee };
  }

  // Já está no elenco: não exige vaga extra. Só antifail se elenco estiver ilegalmente acima do teto.
  if (hostRosterSize > rosterHardMax) {
    return { ok: false, reason: 'roster_hard_max', fee };
  }

  return { ok: true, fee, from: player.loanFrom, to: hostClubName };
}

/**
 * Aplica exercício: jogador fica no host como permanente.
 * Caller deve ter validado com `canExerciseLoanBuyOption`.
 * Não mexe em roster arrays — isso é responsabilidade do motor.
 */
export function applyLoanBuyExercise(player) {
  if (!player) return { ok: false, reason: 'not_found' };
  const fee = Math.round(Number(player.loanBuyOption?.fee) || 0);
  const from = player.loanFrom || null;
  player.onLoan = false;
  player.loanFrom = null;
  player.loanListed = false;
  player.listed = false;
  player.askingPrice = null;
  clearLoanBuyOption(player);
  return { ok: true, fee, from, type: 'loan_buy' };
}

/** Razão fee/valor no ato — para telemetria/tests. */
export function loanBuyFeeRatio(option) {
  if (!option) return null;
  const base = Number(option.marketValueAtLoan) || 0;
  const fee = Number(option.fee) || 0;
  if (base <= 0) return null;
  return fee / base;
}

export function assertFeeInBand(option, division = 'C') {
  const ratio = loanBuyFeeRatio(option);
  if (ratio == null) return false;
  const bias = LOAN_BUY_DIVISION_BIAS[division] ?? 1;
  const lo = LOAN_BUY_FEE_RATIO.min * bias * 0.99;
  const hi = LOAN_BUY_FEE_RATIO.max * bias * 1.01;
  return ratio >= lo && ratio <= hi;
}

export { clamp };
