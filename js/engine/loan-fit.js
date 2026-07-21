/**
 * Fit de empréstimo — nível/divisão.
 * Antes: qualquer loanListed ia para qualquer clube (só folha/slots).
 * Agora: queda de série + OVR vs poder do hospedeiro; A→D é raro.
 */

export const LOAN_DIV_RANK = { A: 4, B: 3, C: 2, D: 1 };

/** Acima disso o host quase não recebe (soft). */
export const LOAN_HOST_OVR_SOFT = { A: 78, B: 66, C: 50, D: 34 };

/** Acima disso o host recusa (hard), salvo rolagem rara de jovem. */
export const LOAN_HOST_OVR_HARD = { A: 90, B: 78, C: 60, D: 40 };

/** Chance base de aceitar por queda de divisão (origem → host). */
export const LOAN_DROP_ACCEPT = {
  0: 0.95,
  1: 0.55,
  2: 0.12,
  3: 0.03,
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function loanDivisionDrop(ownerDivision, hostDivision) {
  const from = LOAN_DIV_RANK[ownerDivision] || 2;
  const to = LOAN_DIV_RANK[hostDivision] || 2;
  return from - to;
}

export function hostPowerEstimate(hostClub) {
  const power = Number(hostClub?.power);
  if (Number.isFinite(power) && power > 0) return power;
  const roster = hostClub?.roster;
  if (Array.isArray(roster) && roster.length) {
    const sum = roster.reduce((acc, p) => acc + (Number(p.overall) || 0), 0);
    return sum / roster.length;
  }
  const fallback = { A: 58, B: 46, C: 34, D: 16 };
  return fallback[hostClub?.division] || 40;
}

/**
 * Chance 0–1 do clube de origem / mercado aceitar o destino.
 * drop&lt;0 (host mais forte): fácil. drop alto + OVR alto: raro.
 */
export function loanAcceptChance(player, ownerClub, hostClub) {
  const ownerDiv = ownerClub?.division || 'C';
  const hostDiv = hostClub?.division || 'C';
  const drop = loanDivisionDrop(ownerDiv, hostDiv);
  const ovr = Number(player?.overall) || 50;
  const age = Number(player?.age) || 26;
  const power = hostPowerEstimate(hostClub);
  const soft = LOAN_HOST_OVR_SOFT[hostDiv] ?? 50;
  const hard = LOAN_HOST_OVR_HARD[hostDiv] ?? 70;

  // Mesma série ou host mais forte: nível não bloqueia (só folha/slots no motor).
  if (drop <= 0) {
    return clamp(drop < 0 ? 0.9 : 0.95, 0.5, 0.98);
  }

  let chance = LOAN_DROP_ACCEPT[Math.min(3, drop)] ?? 0.03;

  const ovrGap = ovr - power;
  if (ovr > hard) chance *= age <= 21 ? 0.2 : 0.04;
  else if (ovr > soft) chance *= age <= 21 ? 0.55 : 0.22;
  else if (ovrGap > 14) chance *= 0.35;
  else if (ovrGap > 8) chance *= 0.6;

  if (age <= 21 && drop <= 2) chance = Math.min(0.98, chance + 0.12);
  if (age >= 30 && drop >= 2) chance *= 0.55;

  return clamp(chance, 0.01, 0.98);
}

/**
 * Gate determinístico + raridade por hash (estável por jogador/host).
 * @returns {{ ok: boolean, reason?: string, chance: number, drop: number }}
 */
export function evaluateLoanFit(player, ownerClub, hostClub, { unit = null } = {}) {
  if (!player || !hostClub) {
    return { ok: false, reason: 'not_found', chance: 0, drop: 0 };
  }
  const ownerDiv = ownerClub?.division || 'C';
  const hostDiv = hostClub.division || 'C';
  const drop = loanDivisionDrop(ownerDiv, hostDiv);
  const chance = loanAcceptChance(player, ownerClub || { division: ownerDiv }, hostClub);
  const ovr = Number(player.overall) || 50;
  const hard = LOAN_HOST_OVR_HARD[hostDiv] ?? 70;
  const age = Number(player.age) || 26;

  // Mesma série / subindo: sempre liberado no fit (payroll continua no motor).
  if (drop <= 0) return { ok: true, chance, drop };

  // Hard block absoluto: estrela clara em queda máxima (A→D).
  if (drop >= 3 && ovr > hard && age > 21) {
    return { ok: false, reason: 'loan_level', chance: 0, drop };
  }
  // Queda de 2+ com OVR absurdo para a série hospedeira.
  if (drop >= 2 && ovr > hard + 8) {
    return { ok: false, reason: 'loan_level', chance: 0, drop };
  }

  if (chance >= 0.85) return { ok: true, chance, drop };

  if (typeof unit === 'function') {
    const roll = unit();
    if (roll < chance) return { ok: true, chance, drop };
    return { ok: false, reason: 'loan_level', chance, drop };
  }

  // Sem RNG: exige chance mínima razoável (evita flip-flop no clique do usuário).
  if (chance < 0.18) return { ok: false, reason: 'loan_level', chance, drop };
  return { ok: true, chance, drop };
}

/** Host é candidato aceitável? (AI pick / listagem). */
export function clubCanReceiveLoan(player, ownerClub, hostClub, opts = {}) {
  return evaluateLoanFit(player, ownerClub, hostClub, opts).ok;
}
