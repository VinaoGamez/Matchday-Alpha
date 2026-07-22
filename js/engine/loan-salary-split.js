/**
 * Salário em empréstimo — hospedeiro paga 100%; cedente não arca com folha.
 */
/** Hospedeiro paga 100% (saves antigos com split parcial migram para este valor). */
export const LOAN_SALARY_SHARE_LEGACY = 1;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** % paga pelo hospedeiro — sempre 100%. */
export function computeLoanSalaryShare(_player, _ownerClub, _hostClub) {
  return 1;
}

export function resolveLoanSalaryShare(player) {
  if (!player?.onLoan) return LOAN_SALARY_SHARE_LEGACY;
  return 1;
}

export function stampLoanSalaryShare(player, ownerClub, hostClub) {
  if (!player) return null;
  player.loanSalaryShare = 1;
  return 1;
}

export function clearLoanSalaryShare(player) {
  if (!player) return;
  delete player.loanSalaryShare;
}

export function resolveHostRoundWage(player, hostDivision, resolveWage) {
  const full = resolveWage(player, hostDivision);
  if (!player?.onLoan) return full;
  return Math.round(full * resolveLoanSalaryShare(player));
}

export function resolveOwnerRoundWage(_player, _ownerDivision, _resolveWage) {
  return 0;
}

export function estimateLoanOutWageBill(_ownerName, _clubs, _resolveWage) {
  return 0;
}

export function estimateTotalRoundWageObligation(
  club,
  clubName,
  clubs,
  division,
  resolveWage,
  options = {},
) {
  const rosterWages = options.rosterWages ?? null;
  const rosterPart =
    rosterWages != null
      ? rosterWages
      : Array.isArray(club?.roster)
        ? club.roster.reduce((sum, player) => {
            if (player?.onLoan) {
              return sum + resolveHostRoundWage(player, division, resolveWage);
            }
            return sum + resolveWage(player, division);
          }, 0)
        : 0;
  const softCap = options.softCap !== false;
  let total = rosterPart;
  if (clubName && clubs) {
    total += estimateLoanOutWageBill(clubName, clubs, resolveWage);
  }
  if (!softCap) return total;
  const cap = options.wageCap ?? null;
  if (cap != null) return Math.min(total, cap);
  return total;
}

export function previewLoanHostWage(player, ownerClub, hostClub, resolveWage) {
  const hostDiv = hostClub?.division || 'A';
  const full = resolveWage(player, hostDiv);
  return {
    fullWage: full,
    hostWage: full,
    ownerWage: 0,
    hostShare: 1,
    hostSharePct: 100,
    ownerSharePct: 0,
  };
}

export function loanOutPayrollDelta(player, ownerClub, hostClub, resolveWage) {
  const ownerDiv = ownerClub?.division || 'A';
  const full = resolveWage(player, ownerDiv);
  return {
    fullWage: full,
    hostShare: 1,
    hostSharePct: 100,
    ownerSharePct: 0,
    /** Cedente deixa de pagar o salário inteiro ao emprestar. */
    netRemoveWage: full,
    ownerWage: 0,
  };
}

export function formatLoanSalaryShareLabel(_hostSharePct) {
  return 100;
}
