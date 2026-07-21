/**
 * Empréstimo bancário do clube (não confundir com empréstimo de jogador).
 *
 * Híbrido (A+1):
 * - Juros automáticos na rodada nacional (simples sobre o saldo, debitados do caixa).
 * - Amortização mínima vira obrigação no Escritório (minAmortDue).
 * - Atraso: capitaliza juros + multa no saldo (compostos) e encarece a taxa;
 *   atraso: capitaliza + cobra no caixa; forçada desde a 1ª rodada vencida (v5).
 */

import {
  getBalance,
  credit,
  spend,
  canAfford,
  ensureBudget,
  estimateRoundRecurringRevenue,
  estimateRoundCostBill,
} from './economy.js';

/** Juros-base de mercado por divisão (risco/prestígio); o risco do clube ajusta em cima. Calibrado v5. */
export const BANK_LOAN_RATE_BY_DIVISION = {
  A: 0.013,
  B: 0.015,
  C: 0.017,
  D: 0.019,
};

/** Amortização mínima por rodada = % do principal original. */
export const BANK_LOAN_MIN_AMORT_RATIO = 0.055;

/** Multa sobre o mínimo em atraso (capitaliza na dívida). */
export const BANK_LOAN_LATE_FEE_RATIO = 0.28;

/**
 * Em atraso: a taxa efetiva é aplicada N vezes no saldo (juros sobre juros na mesma rodada).
 * Agressivo o bastante para o espiral (dívida → caixa) não se arrastar muitas rodadas.
 */
export function loanCompoundApplications(streak = 0) {
  const s = Math.max(0, Math.round(Number(streak) || 0));
  if (s <= 0) return 0;
  if (s === 1) return 3;
  if (s === 2) return 4;
  if (s === 3) return 5;
  return 6;
}

/**
 * Capitaliza juros compostos no saldo: aplica a taxa `apps` vezes em sequência.
 * Retorna { balance, compounded, rate, apps }.
 */
export function compoundDelinquencyOnBalance(balance, baseRate, streak) {
  const rate = effectiveLoanRate(baseRate, streak);
  const apps = loanCompoundApplications(streak);
  let bal = clampAmount(balance);
  let compounded = 0;
  for (let i = 0; i < apps; i += 1) {
    const slice = Math.max(1, Math.round(bal * rate));
    bal += slice;
    compounded += slice;
  }
  return { balance: bal, compounded, rate, apps };
}

/** Multiplicador da cobrança forçada no caixa (não abate principal — só sangra caixa). */
export function loanForceCollectMult(streak = 0) {
  const s = Math.max(0, Math.round(Number(streak) || 0));
  if (s >= 4) return 2.4;
  if (s >= 3) return 1.9;
  if (s >= 2) return 1.5;
  return 1.25;
}

/** Rodadas seguidas sem pagar o mínimo → cobrança forçada no caixa. */
export const BANK_LOAN_FORCE_COLLECT_STREAK = 1;

/** Abaixo disso o banco não libera crédito novo. */
export const BANK_LOAN_MIN_FINANCES = 22;

/** Oferta mínima útil (evita botões irrisórios). */
export const BANK_LOAN_MIN_OFFER = 50_000;

/** Frações do crédito disponível sugeridas no UI. */
export const BANK_LOAN_OFFER_RATIOS = [0.25, 0.5, 0.75, 1];

const clampAmount = n => Math.max(0, Math.round(Number(n) || 0));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const roundCredit = amount => {
  const n = clampAmount(amount);
  if (n < BANK_LOAN_MIN_OFFER) return 0;
  if (n < 250_000) return Math.round(n / 10_000) * 10_000;
  if (n < 1_000_000) return Math.round(n / 25_000) * 25_000;
  return Math.round(n / 50_000) * 50_000;
};

export function bankLoanRate(division = 'C') {
  return BANK_LOAN_RATE_BY_DIVISION[division] ?? BANK_LOAN_RATE_BY_DIVISION.C;
}

/** Multiplicador da taxa contratual conforme atraso (1 = em dia). */
export function loanDelinquencyRateMult(streak = 0) {
  const s = Math.max(0, Math.round(Number(streak) || 0));
  if (s <= 0) return 1;
  if (s === 1) return 1.35;
  if (s === 2) return 1.7;
  if (s === 3) return 2.1;
  return 2.5;
}

export function clubFinancesScore(club) {
  const n = Number(club?.finances);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 55;
}

export function bankCreditFactor(finances) {
  const f = Math.max(0, Math.min(100, Number(finances) || 0));
  if (f < BANK_LOAN_MIN_FINANCES) return 0;
  if (f < 35) return 0.18 + ((f - BANK_LOAN_MIN_FINANCES) / (35 - BANK_LOAN_MIN_FINANCES)) * 0.17;
  if (f < 50) return 0.35 + ((f - 35) / 15) * 0.25;
  if (f < 70) return 0.6 + ((f - 50) / 20) * 0.25;
  if (f < 85) return 0.85 + ((f - 70) / 15) * 0.15;
  return 1;
}

export function bankRateMultiplier(finances) {
  const f = Math.max(0, Math.min(100, Number(finances) || 0));
  if (f >= 80) return 0.85;
  if (f >= 65) return 0.95;
  if (f >= 50) return 1.05;
  if (f >= 35) return 1.25;
  return 1.55;
}

export function bankCreditTier(finances) {
  const f = Math.max(0, Math.min(100, Number(finances) || 0));
  if (f < BANK_LOAN_MIN_FINANCES) return 'blocked';
  if (f < 35) return 'restricted';
  if (f < 50) return 'cautious';
  if (f < 70) return 'fair';
  if (f < 85) return 'good';
  return 'prime';
}

export const BANK_CREDIT_TIER_LABEL = {
  blocked: 'Crédito bloqueado',
  restricted: 'Linha restrita',
  cautious: 'Análise cautelosa',
  fair: 'Crédito regular',
  good: 'Bom pagador',
  prime: 'Linha preferencial',
};

export function resolveBankCredit(club, { division = 'C' } = {}) {
  const div = division || club?.division || 'C';
  const baseRate = bankLoanRate(div);
  const finances = clubFinancesScore(club);
  const shortfall = !!(club?.wageShortfall || club?.loanServiceShortfall);
  const cash = getBalance(club);
  const overdrawn = cash < 0;
  const recurring = Math.max(0, estimateRoundRecurringRevenue(club, div) || 0);
  const roundCost = Math.max(
    0,
    estimateRoundCostBill(club, div, { managerReputation: club?.managerReputation }) || 0,
  );
  const coverage = roundCost > 0 ? recurring / roundCost : 1.2;
  const coverageMult = clamp(0.4 + coverage * 0.55, 0.35, 1.35);

  let factor = bankCreditFactor(finances);
  let rateMult = bankRateMultiplier(finances);

  const flowLine = recurring * (3.8 + finances / 25);
  const cashLine = Math.max(0, cash) * (0.08 + finances / 500);
  let raw = (flowLine + cashLine) * factor * coverageMult;

  if (coverage < 0.75) {
    raw *= 0.72;
    rateMult += 0.12;
  }
  if (coverage < 0.5) {
    raw *= 0.6;
    rateMult += 0.18;
  }
  if (shortfall || overdrawn) {
    raw *= overdrawn ? 0.35 : 0.5;
    rateMult += overdrawn ? 0.3 : 0.2;
  }

  const available = roundCredit(raw);
  const rate = Math.round(baseRate * rateMult * 10000) / 10000;
  const tier = available <= 0 ? 'blocked' : bankCreditTier(finances);
  const offers = available
    ? BANK_LOAN_OFFER_RATIOS.map(ratio => roundCredit(available * ratio))
        .filter((v, i, arr) => v >= BANK_LOAN_MIN_OFFER && arr.indexOf(v) === i)
        .sort((a, b) => a - b)
    : [];

  return {
    division: div,
    finances,
    factor: Math.round(factor * 1000) / 1000,
    recurring: clampAmount(recurring),
    roundCost: clampAmount(roundCost),
    coverage: Math.round(coverage * 100) / 100,
    cash: clampAmount(cash),
    available,
    rate,
    ratePct: Math.round(rate * 1000) / 10,
    baseRate,
    shortfall,
    tier,
    tierLabel: BANK_CREDIT_TIER_LABEL[tier] || BANK_CREDIT_TIER_LABEL.fair,
    eligible: available > 0,
    offers,
  };
}

export const OVERDRAFT_PREMIUM_BASE = 1.75;
export const OVERDRAFT_PREMIUM_WITH_LOAN = 2.4;

/** Fração do juro de OD que capitaliza na dívida bancária (streak ≥ 3 + loan ativo). */
export const OVERDRAFT_TO_LOAN_ABSORB_RATIO = 0.5;

export function overdraftStreakMultiplier(streak = 0) {
  const s = Math.max(0, Math.round(Number(streak) || 0));
  if (s <= 2) return 1;
  if (s <= 4) return 1.25;
  if (s <= 6) return 1.55;
  return 1.8;
}

export function resolveOverdraftRate(club, { division = 'C', streak = null } = {}) {
  const div = division || club?.division || 'C';
  const baseRate = bankLoanRate(div);
  const finances = clubFinancesScore(club);
  const cash = getBalance(club);
  const shortfall = !!(club?.wageShortfall || club?.loanServiceShortfall || cash < 0);
  const recurring = Math.max(0, estimateRoundRecurringRevenue(club, div) || 0);
  const roundCost = Math.max(
    0,
    estimateRoundCostBill(club, div, { managerReputation: club?.managerReputation }) || 0,
  );
  const coverage = roundCost > 0 ? recurring / roundCost : 1.2;

  let rateMult = bankRateMultiplier(finances);
  if (coverage < 0.75) rateMult += 0.12;
  if (coverage < 0.5) rateMult += 0.18;
  if (shortfall || cash < 0) rateMult += cash < 0 ? 0.3 : 0.2;

  if (cash < 0 && roundCost > 0) {
    const depth = Math.abs(cash) / roundCost;
    if (depth > 8) rateMult += 0.25;
    else if (depth > 4) rateMult += 0.15;
  }

  const hasLoan = !!getBankLoan(club);
  const premium = hasLoan ? OVERDRAFT_PREMIUM_WITH_LOAN : OVERDRAFT_PREMIUM_BASE;
  const odStreak =
    streak != null
      ? Math.max(0, Math.round(Number(streak) || 0))
      : Math.max(0, Math.round(Number(club?.overdraftStreak) || 0));
  const streakMult = overdraftStreakMultiplier(odStreak);
  const rate = Math.round(baseRate * rateMult * premium * streakMult * 10000) / 10000;

  let loanMult = bankRateMultiplier(finances);
  if (coverage < 0.75) loanMult += 0.12;
  if (coverage < 0.5) loanMult += 0.18;
  if (shortfall || cash < 0) loanMult += cash < 0 ? 0.3 : 0.2;
  const loanLikeRate = Math.round(baseRate * loanMult * 10000) / 10000;

  return {
    division: div,
    finances,
    coverage: Math.round(coverage * 100) / 100,
    recurring: clampAmount(recurring),
    roundCost: clampAmount(roundCost),
    cash,
    depth: roundCost > 0 && cash < 0 ? Math.round((Math.abs(cash) / roundCost) * 10) / 10 : 0,
    hasLoan,
    premium,
    streak: odStreak,
    streakMult,
    rateMult: Math.round(rateMult * 1000) / 1000,
    baseRate,
    rate,
    ratePct: Math.round(rate * 1000) / 10,
    loanLikeRate,
    loanLikePct: Math.round(loanLikeRate * 1000) / 10,
  };
}

function readLoanFields(loan) {
  if (!loan) return null;
  return {
    principal: clampAmount(loan.principal),
    balance: clampAmount(loan.balance),
    rate: Number(loan.rate) || 0,
    division: loan.division || 'C',
    openedSeason: loan.openedSeason ?? null,
    openedRound: loan.openedRound ?? null,
    lastServicedRound: loan.lastServicedRound ?? null,
    lastServicedKey: loan.lastServicedKey ?? null,
    financesAtOpen: loan.financesAtOpen ?? null,
    minAmortDue: clampAmount(loan.minAmortDue),
    accruedInterest: clampAmount(loan.accruedInterest),
    delinquencyStreak: Math.max(0, Math.round(Number(loan.delinquencyStreak) || 0)),
    penaltyDue: clampAmount(loan.penaltyDue),
    rehabRoundsRemaining: Math.max(0, Math.round(Number(loan.rehabRoundsRemaining) || 0)),
  };
}

export function getBankLoan(club) {
  const loan = club?.bankLoan;
  if (!loan || !(Number(loan.balance) > 0)) return null;
  return readLoanFields(loan);
}

export function bankLoanBalance(club) {
  return getBankLoan(club)?.balance || 0;
}

export function clearBankLoan(club) {
  if (club) delete club.bankLoan;
}

export function serializeBankLoan(club) {
  const loan = getBankLoan(club);
  if (!loan) return null;
  return { ...loan };
}

export function applyBankLoanSnapshot(club, snapshot) {
  if (!club) return null;
  if (!snapshot || !(Number(snapshot.balance) > 0)) {
    clearBankLoan(club);
    return null;
  }
  club.bankLoan = {
    principal: clampAmount(snapshot.principal) || clampAmount(snapshot.balance),
    balance: clampAmount(snapshot.balance),
    rate: Number(snapshot.rate) || 0,
    division: snapshot.division || club.division || 'C',
    openedSeason: snapshot.openedSeason ?? null,
    openedRound: snapshot.openedRound ?? null,
    lastServicedRound: Number.isFinite(Number(snapshot.lastServicedRound))
      ? Number(snapshot.lastServicedRound)
      : null,
    lastServicedKey: snapshot.lastServicedKey || null,
    financesAtOpen: snapshot.financesAtOpen ?? null,
    minAmortDue: clampAmount(snapshot.minAmortDue),
    accruedInterest: clampAmount(snapshot.accruedInterest),
    delinquencyStreak: Math.max(0, Math.round(Number(snapshot.delinquencyStreak) || 0)),
    penaltyDue: clampAmount(snapshot.penaltyDue),
    rehabRoundsRemaining: Math.max(0, Math.round(Number(snapshot.rehabRoundsRemaining) || 0)),
  };
  return club.bankLoan;
}

function loanServiceKey(season, round) {
  const roundKey = Number.isFinite(Number(round)) ? Number(round) : null;
  if (roundKey == null) return null;
  const seasonKey = Number.isFinite(Number(season)) ? Number(season) : null;
  return seasonKey != null ? `${seasonKey}:${roundKey}` : String(roundKey);
}

function computeMinAmort(principal, balance) {
  if (!(balance > 0)) return 0;
  // Mínimo do Escritório = % do principal contratado (parcela pagável em dia).
  // A dívida inchada pelos compostos NÃO infla essa parcela — senão “voltar ao azul e pagar
  // em dia” continua inviável. A pressão no atraso vem da forçada (swollenBleed) + compostos.
  return Math.min(
    clampAmount(balance),
    Math.max(1, Math.round(clampAmount(principal) * BANK_LOAN_MIN_AMORT_RATIO)),
  );
}

/**
 * Rodadas de reabilitação após regularizar: sem juro e sem parcela obrigatória.
 * O saldo fica congelado no principal renegociado — tempo para o caixa voltar a
 * gerar folga; depois as parcelas normais retomam de forma pagável.
 */
const LOAN_REHAB_ROUNDS = 14;
const LOAN_REHAB_MIN_FACTOR = 0;

/**
 * Ao voltar a pagar em dia: renegocia — compostos da inadimplência caem e o saldo
 * volta ao principal. Quem regulariza consegue sustentar as parcelas e evitar a quebra;
 * quem segue em atraso mantém o saldo inchado + forçada.
 */
function regularizeLoanPrincipal(loan) {
  if (!loan) return false;
  const principal = clampAmount(loan.principal);
  const balance = clampAmount(loan.balance);
  let changed = false;
  if (balance > principal && principal > 0) {
    loan.balance = principal;
    changed = true;
  }
  loan.rehabRoundsRemaining = LOAN_REHAB_ROUNDS;
  return changed;
}

function minAmortForLoan(loan) {
  if (!loan) return 0;
  let minAmort = computeMinAmort(loan.principal, loan.balance);
  const rehab = Math.max(0, Math.round(Number(loan.rehabRoundsRemaining) || 0));
  if (rehab > 0 && (loan.delinquencyStreak || 0) <= 0) {
    if (!(LOAN_REHAB_MIN_FACTOR > 0)) return 0;
    minAmort = Math.max(1, Math.round(minAmort * LOAN_REHAB_MIN_FACTOR));
  }
  return minAmort;
}

function effectiveLoanRate(baseRate, delinquencyStreak) {
  const mult = loanDelinquencyRateMult(delinquencyStreak);
  return Math.round(baseRate * mult * 10000) / 10000;
}

/**
 * Snapshot para UI / decisões.
 */
export function bankLoanStatus(club, { division = 'C' } = {}) {
  const creditLine = resolveBankCredit(club, { division });
  const loan = getBankLoan(club);
  const balance = loan?.balance || 0;
  const principal = loan?.principal || 0;
  const baseRate = loan ? loan.rate || creditLine.rate : creditLine.rate;
  const delinquencyStreak = loan?.delinquencyStreak || 0;
  const activeRate = loan ? effectiveLoanRate(baseRate, delinquencyStreak) : creditLine.rate;
  const interestBase =
    loan == null
      ? 0
      : delinquencyStreak > 0
        ? balance
        : Math.min(balance, principal);
  const interestDue =
    loan && interestBase > 0 ? Math.max(1, Math.round(interestBase * activeRate)) : 0;
  const minAmort = loan ? minAmortForLoan(loan) : 0;
  const minAmortDue = loan?.minAmortDue || 0;
  const penaltyDue = loan?.penaltyDue || 0;
  const lateFeeEstimate =
    minAmortDue > 0 ? Math.max(1, Math.round(minAmortDue * BANK_LOAN_LATE_FEE_RATIO)) : 0;
  const obligation = minAmortDue + penaltyDue;
  const roundDue = interestDue + Math.max(minAmort, minAmortDue) + penaltyDue;
  return {
    active: !!loan,
    division: creditLine.division,
    available: creditLine.available,
    finances: creditLine.finances,
    factor: creditLine.factor,
    recurring: creditLine.recurring,
    roundCost: creditLine.roundCost,
    coverage: creditLine.coverage,
    tier: creditLine.tier,
    tierLabel: creditLine.tierLabel,
    shortfall: creditLine.shortfall || !!(loan && delinquencyStreak > 0),
    eligible: creditLine.eligible,
    rate: activeRate,
    ratePct: Math.round(activeRate * 1000) / 10,
    baseRate,
    baseRatePct: Math.round(baseRate * 1000) / 10,
    offerRate: creditLine.rate,
    offerRatePct: creditLine.ratePct,
    principal,
    balance,
    interestDue,
    minAmort,
    minAmortDue,
    penaltyDue,
    lateFeeEstimate,
    obligation,
    delinquencyStreak,
    delinquent: !!(loan && (delinquencyStreak > 0 || minAmortDue > 0)),
    forceCollectStreak: BANK_LOAN_FORCE_COLLECT_STREAK,
    roundsToForce:
      loan && delinquencyStreak < BANK_LOAN_FORCE_COLLECT_STREAK
        ? BANK_LOAN_FORCE_COLLECT_STREAK - delinquencyStreak
        : 0,
    roundDue,
    availableToBorrow: loan ? 0 : creditLine.available,
    offers: loan ? [] : creditLine.offers,
  };
}

export function takeBankLoan(
  club,
  amount,
  { division = 'C', season = null, round = null } = {},
) {
  if (!club) return { ok: false, reason: 'no_club' };
  ensureBudget(club, division);
  if (getBankLoan(club)) return { ok: false, reason: 'loan_active' };
  const creditLine = resolveBankCredit(club, { division });
  if (!creditLine.eligible) {
    return {
      ok: false,
      reason: 'credit_denied',
      finances: creditLine.finances,
      tier: creditLine.tier,
    };
  }
  const fee = clampAmount(amount);
  if (!(fee > 0)) return { ok: false, reason: 'invalid_amount' };
  if (fee > creditLine.available) {
    return {
      ok: false,
      reason: 'over_limit',
      limit: creditLine.available,
      fee,
    };
  }
  const rate = creditLine.rate;
  const credited = credit(club, fee, {
    reason: 'bank_loan',
    label: 'Empréstimo bancário',
    meta: {
      fee,
      rate,
      division: creditLine.division,
      finances: creditLine.finances,
      available: creditLine.available,
      recurring: creditLine.recurring,
      coverage: creditLine.coverage,
    },
  });
  if (!credited?.ok) return { ok: false, reason: 'credit_failed' };
  club.bankLoan = {
    principal: fee,
    balance: fee,
    rate,
    division: creditLine.division,
    openedSeason: season,
    openedRound: round,
    lastServicedRound: null,
    lastServicedKey: null,
    financesAtOpen: creditLine.finances,
    minAmortDue: 0,
    accruedInterest: 0,
    delinquencyStreak: 0,
    penaltyDue: 0,
    rehabRoundsRemaining: 0,
  };
  club.loanServiceShortfall = false;
  return {
    ok: true,
    amount: fee,
    rate,
    balance: fee,
    clubBalance: getBalance(club),
    status: bankLoanStatus(club, { division: creditLine.division }),
  };
}

/**
 * Aplica pagamento ao mínimo devido / multa, depois ao principal.
 * Zera atraso quando a obrigação da rodada é quitada.
 */
function applyRepaymentToLoan(club, pay) {
  let remaining = clampAmount(pay);
  let towardDue = 0;
  let towardPrincipal = 0;
  const loan = club.bankLoan;
  if (!loan || !(remaining > 0)) return { towardDue: 0, towardPrincipal: 0 };

  const penalty = clampAmount(loan.penaltyDue);
  if (penalty > 0 && remaining > 0) {
    const slice = Math.min(remaining, penalty);
    loan.penaltyDue = penalty - slice;
    remaining -= slice;
    towardDue += slice;
  }

  const due = clampAmount(loan.minAmortDue);
  if (due > 0 && remaining > 0) {
    const slice = Math.min(remaining, due);
    loan.minAmortDue = due - slice;
    loan.balance = Math.max(0, clampAmount(loan.balance) - slice);
    remaining -= slice;
    towardDue += slice;
    towardPrincipal += slice;
  }

  if (remaining > 0 && clampAmount(loan.balance) > 0) {
    const slice = Math.min(remaining, clampAmount(loan.balance));
    loan.balance = Math.max(0, clampAmount(loan.balance) - slice);
    towardPrincipal += slice;
    remaining -= slice;
  }

  if (clampAmount(loan.minAmortDue) <= 0 && clampAmount(loan.penaltyDue) <= 0) {
    loan.minAmortDue = 0;
    loan.penaltyDue = 0;
    const wasLate = (loan.delinquencyStreak || 0) > 0;
    loan.delinquencyStreak = 0;
    club.loanServiceShortfall = false;
    if (wasLate) regularizeLoanPrincipal(loan);
  }

  if (clampAmount(loan.balance) <= 0) clearBankLoan(club);
  return { towardDue, towardPrincipal };
}

/**
 * Amortização voluntária (mínimo devido primeiro, depois principal).
 */
export function repayBankLoan(club, amount, { division = 'C' } = {}) {
  if (!club) return { ok: false, reason: 'no_club' };
  const loan = getBankLoan(club);
  if (!loan) return { ok: false, reason: 'no_loan' };
  const fee = clampAmount(amount);
  if (!(fee > 0)) return { ok: false, reason: 'invalid_amount' };
  const maxPay = loan.balance + clampAmount(club.bankLoan?.penaltyDue);
  const pay = Math.min(fee, maxPay);
  if (!canAfford(club, pay)) return { ok: false, reason: 'insufficient_funds', fee: pay };
  const paid = spend(club, pay, {
    reason: 'loan_repay',
    label: 'Amortização do empréstimo',
    meta: { pay },
  });
  if (!paid?.ok) return { ok: false, reason: 'insufficient_funds', fee: pay };
  const applied = applyRepaymentToLoan(club, pay);
  return {
    ok: true,
    paid: pay,
    towardDue: applied.towardDue,
    towardPrincipal: applied.towardPrincipal,
    remaining: bankLoanBalance(club),
    clubBalance: getBalance(club),
    cleared: !getBankLoan(club),
    status: bankLoanStatus(club, { division }),
  };
}

/** Paga só a obrigação vencida (mínimo + multa). */
export function payBankLoanMinimum(club, { division = 'C' } = {}) {
  if (!club) return { ok: false, reason: 'no_club' };
  const loan = getBankLoan(club);
  if (!loan) return { ok: false, reason: 'no_loan' };
  const due = clampAmount(loan.minAmortDue) + clampAmount(loan.penaltyDue);
  if (!(due > 0)) {
    // Sem obrigação vencida: paga o mínimo teórico da rodada (antecipa).
    const minAmort = minAmortForLoan(loan);
    return repayBankLoan(club, minAmort, { division });
  }
  return repayBankLoan(club, due, { division });
}

/**
 * Serviço da rodada (híbrido):
 * 1) Processa atraso do mínimo anterior (capitaliza + multa; força na 1ª).
 * 2) Cobra juros no caixa (taxa efetiva).
 * 3) Abre novo minAmortDue (não debita o principal sozinho).
 */
export function serviceBankLoan(club, { division = 'C', round = null, season = null } = {}) {
  if (!club) return { ok: false, reason: 'no_club', skipped: true };
  const loanSnap = getBankLoan(club);
  if (!loanSnap) return { ok: true, skipped: true, active: false };
  const roundKey = Number.isFinite(Number(round)) ? Number(round) : null;
  const serviceKey = loanServiceKey(season, round);
  if (
    serviceKey != null &&
    (loanSnap.lastServicedKey === serviceKey ||
      (loanSnap.lastServicedKey == null &&
        season == null &&
        roundKey != null &&
        loanSnap.lastServicedRound === roundKey))
  ) {
    return { ok: true, skipped: true, active: true, balance: loanSnap.balance };
  }

  const loan = club.bankLoan;
  const baseRate = loan.rate || bankLoanRate(division || loan.division);
  let capitalized = 0;
  let lateFee = 0;
  let forceCollected = 0;
  let delinquencyStreak = Math.max(0, Math.round(Number(loan.delinquencyStreak) || 0));
  const priorDue = clampAmount(loan.minAmortDue);

  // --- 1) Atraso do mínimo: compostos fluidos (taxa reaplicada N×) + sangria no caixa ---
  let compoundApps = 0;
  if (priorDue > 0) {
    delinquencyStreak += 1;
    loan.delinquencyStreak = delinquencyStreak;
    club.loanServiceShortfall = true;

    const grown = compoundDelinquencyOnBalance(loan.balance, baseRate, delinquencyStreak);
    lateFee = Math.max(1, Math.round(priorDue * BANK_LOAN_LATE_FEE_RATIO));
    loan.balance = grown.balance + lateFee;
    loan.accruedInterest = clampAmount(loan.accruedInterest) + grown.compounded;
    loan.penaltyDue = clampAmount(loan.penaltyDue) + lateFee;
    capitalized = grown.compounded + lateFee;
    compoundApps = grown.apps;

    if (delinquencyStreak >= BANK_LOAN_FORCE_COLLECT_STREAK) {
      const dueBase = clampAmount(loan.minAmortDue) + clampAmount(loan.penaltyDue);
      const forceMult = loanForceCollectMult(delinquencyStreak);
      // Sangria escala com a dívida inchada — senão o caixa sobrevive a temporada inteira.
      const swollenBleed = Math.round(clampAmount(loan.balance) * BANK_LOAN_MIN_AMORT_RATIO * forceMult);
      const forcePay = Math.max(1, Math.round(dueBase * forceMult), swollenBleed);
      if (forcePay > 0) {
        const paid = spend(club, forcePay, {
          reason: 'loan_repay',
          label: 'Cobrança emergencial (atraso — não quita a dívida)',
          meta: {
            force: true,
            forceMult,
            compoundApps,
            capitalized,
            minAmortDue: loan.minAmortDue,
            penaltyDue: loan.penaltyDue,
            round: roundKey,
            season,
          },
          allowNegative: true,
        });
        if (paid?.ok) {
          forceCollected = forcePay;
          // Caixa sangra; a dívida permanece (já inchada pelos compostos).
          // Só zera a obrigação da rodada — quitação real é no Escritório.
          loan.minAmortDue = 0;
          loan.penaltyDue = 0;
        }
      }
    }
  } else if (delinquencyStreak > 0 && clampAmount(loan.penaltyDue) <= 0) {
    // Em dia no mínimo: limpa streak residual e renegocia compostos.
    delinquencyStreak = 0;
    loan.delinquencyStreak = 0;
    regularizeLoanPrincipal(loan);
  }

  if (!getBankLoan(club)) {
    club.loanServiceShortfall = getBalance(club) < 0;
    return {
      ok: true,
      active: false,
      interest: 0,
      interestPaid: 0,
      minAmort: 0,
      amortPaid: forceCollected,
      capitalized,
      lateFee,
      forceCollected,
      delinquencyStreak,
      shortfall: getBalance(club) < 0 ? 1 : 0,
      balance: 0,
      clubBalance: getBalance(club),
      skipped: false,
    };
  }

  // --- 2) Juros da rodada no caixa (simples × taxa efetiva) ---
  // Em dia: juro só sobre o principal (compostos inchados não eternizam a sangria).
  // Em atraso: juro sobre o saldo cheio — pressão do espiral.
  // Em reabilitação: moratória de juro (fôlego após voltar a pagar).
  const effRate = effectiveLoanRate(baseRate, loan.delinquencyStreak || 0);
  const inRehab =
    (loan.rehabRoundsRemaining || 0) > 0 && (loan.delinquencyStreak || 0) <= 0;
  const interestBase = inRehab
    ? 0
    : (loan.delinquencyStreak || 0) > 0
      ? clampAmount(loan.balance)
      : Math.min(clampAmount(loan.balance), clampAmount(loan.principal));
  const interest = interestBase > 0 ? Math.max(1, Math.round(interestBase * effRate)) : 0;
  let interestPaid = 0;
  const cashBeforeInterest = getBalance(club);
  if (interest > 0) {
    const paid = spend(club, interest, {
      reason: 'loan_interest',
      label:
        (loan.delinquencyStreak || 0) > 0
          ? 'Juros do empréstimo (taxa de atraso)'
          : 'Juros do empréstimo bancário',
      meta: {
        interest,
        interestBase,
        rate: effRate,
        baseRate,
        delinquencyStreak: loan.delinquencyStreak || 0,
        round: roundKey,
        season,
      },
      allowNegative: true,
    });
    if (paid?.ok) interestPaid = interest;
  }

  // --- 3) Novo mínimo da rodada (obrigação no Escritório) ---
  const minAmort = minAmortForLoan(loan);
  // Acumula se ainda houver due não forçado (já tratado acima); senão abre o da rodada.
  if (clampAmount(loan.minAmortDue) <= 0) {
    loan.minAmortDue = minAmort;
  } else {
    loan.minAmortDue = clampAmount(loan.minAmortDue) + minAmort;
  }
  if (
    (loan.rehabRoundsRemaining || 0) > 0 &&
    (loan.delinquencyStreak || 0) <= 0 &&
    clampAmount(priorDue) <= 0
  ) {
    loan.rehabRoundsRemaining = Math.max(0, (loan.rehabRoundsRemaining || 0) - 1);
  }

  loan.lastServicedRound = roundKey;
  loan.lastServicedKey = serviceKey;

  const interestShort = Math.max(0, interest - Math.max(0, cashBeforeInterest));
  // Shortfall institucional = atraso (streak) ou juros que empurraram o caixa.
  // Ter minAmortDue da rodada atual NÃO é atraso — ainda dá para pagar no Escritório.
  club.loanServiceShortfall =
    interestShort > 0 || (loan.delinquencyStreak || 0) > 0 || getBalance(club) < 0;

  return {
    ok: true,
    active: !!getBankLoan(club),
    interest,
    interestPaid,
    minAmort,
    minAmortDue: clampAmount(loan.minAmortDue),
    amortPaid: forceCollected,
    capitalized,
    lateFee,
    forceCollected,
    compoundApps,
    delinquencyStreak: loan.delinquencyStreak || 0,
    effectiveRate: effRate,
    shortfall:
      interestShort +
      ((loan.delinquencyStreak || 0) > 0 ? clampAmount(loan.minAmortDue) + clampAmount(loan.penaltyDue) : 0),
    balance: bankLoanBalance(club),
    clubBalance: getBalance(club),
    skipped: false,
  };
}
