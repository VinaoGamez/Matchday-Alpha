/**
 * Solvência / falência formal do clube (modelo fluido).
 * Quebra vem do espiral (dívida composta → vermelho → profundidade/OD),
 * não de “N atrasos = falência automática”.
 */
import { MODULE_VERSIONS } from '../core/constants.js';
import { STATUS_MIN } from './club-status/constants.js';
import { MANAGER_JOB_HONEYMOON_ROUNDS } from './manager-job.js';

/**
 * Rodadas consecutivas no vermelho antes da falência por dívida insustentável.
 * A 1ª rodada no vermelho NÃO liquida — credores só decretam após ~4–5r no cheque especial.
 */
export const BANKRUPTCY_RED_STREAK = 5;

/** Rodadas no vermelho + finanças no piso → liquidação (sem loan). */
export const BANKRUPTCY_OVERDRAFT_STREAK = BANKRUPTCY_RED_STREAK;

/** Profundidade de caixa (× custo/rodada) + streak mínimo no vermelho. */
export const BANKRUPTCY_DEPTH_ROUNDS = 4;
export const BANKRUPTCY_DEPTH_STREAK = BANKRUPTCY_RED_STREAK;

/**
 * Inadimplência + vermelho sustentado (dívida impagável).
 * Sozinho, atraso com caixa positivo NÃO quebra — só avisa e inchando a dívida.
 * Caixa negativo na mesma rodada também NÃO quebra — precisa de BANKRUPTCY_RED_STREAK.
 */
export const BANKRUPTCY_DELINQUENCY_WITH_RED = 3;

/** Aviso na 2ª rodada de atraso: juros compostos altos. */
export const INSOLVENCY_WARN_DELINQUENCY = 2;
export const INSOLVENCY_WARN_STREAK = 2;
export const INSOLVENCY_WARN_DEPTH = 2;

/** @deprecated use INSOLVENCY_WARN_DELINQUENCY — mantido para sims antigos */
export const BANKRUPTCY_DELINQUENCY_STREAK = BANKRUPTCY_DELINQUENCY_WITH_RED;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * @returns {{
 *   status: 'ok'|'warn_insolvent'|'bankrupt',
 *   reason: string|null,
 *   message: string,
 *   cash: number,
 *   overdraftStreak: number,
 *   delinquencyStreak: number,
 *   depthRounds: number,
 *   finances: number,
 * }}
 */
export function resolveClubBankruptcyRisk({
  cash = 0,
  roundCost = 0,
  overdraftStreak = 0,
  finances = 70,
  loanBalance = 0,
  delinquencyStreak = 0,
  loanServiceShortfall = false,
  played = 0,
  honeymoonRounds = MANAGER_JOB_HONEYMOON_ROUNDS,
  alreadyBankrupt = false,
} = {}) {
  const bal = Number(cash) || 0;
  const cost = Math.max(0, Number(roundCost) || 0);
  const odStreak = Math.max(0, Math.round(Number(overdraftStreak) || 0));
  const delinq = Math.max(0, Math.round(Number(delinquencyStreak) || 0));
  const fin = clamp(Math.round(Number(finances) || 0), 0, 100);
  const debt = Math.max(0, Math.round(Number(loanBalance) || 0));
  const depthRounds = cost > 0 && bal < 0 ? Math.abs(bal) / cost : 0;
  const playedN = Math.max(0, Math.round(Number(played) || 0));
  const honey = Math.max(0, Math.round(Number(honeymoonRounds) || 0));

  if (alreadyBankrupt) {
    return {
      status: 'bankrupt',
      reason: 'already',
      message: 'O clube já está em liquidação.',
      cash: bal,
      overdraftStreak: odStreak,
      delinquencyStreak: delinq,
      depthRounds,
      finances: fin,
    };
  }

  const afterHoneymoon = playedN > honey;

  const bankruptDepth =
    afterHoneymoon &&
    bal <= -(BANKRUPTCY_DEPTH_ROUNDS * cost) &&
    cost > 0 &&
    odStreak >= BANKRUPTCY_DEPTH_STREAK;
  const bankruptOverdraft =
    afterHoneymoon && odStreak >= BANKRUPTCY_OVERDRAFT_STREAK && fin <= STATUS_MIN;
  // Dívida composta + vermelho sustentado: nunca na 1ª rodada no vermelho.
  const bankruptLoanSpiral =
    afterHoneymoon &&
    delinq >= BANKRUPTCY_DELINQUENCY_WITH_RED &&
    bal < 0 &&
    debt > 0 &&
    odStreak >= BANKRUPTCY_RED_STREAK;

  if (bankruptDepth || bankruptOverdraft || bankruptLoanSpiral) {
    let reason = 'cash_depth';
    let message = `O rombo de caixa ultrapassou ${BANKRUPTCY_DEPTH_ROUNDS} rodadas de custo — liquidação decretada.`;
    if (bankruptLoanSpiral) {
      reason = 'loan_default';
      message =
        `A dívida tornou-se insustentável: ${BANKRUPTCY_RED_STREAK} rodadas no vermelho com empréstimo em atraso — falência decretada.`;
    } else if (bankruptOverdraft) {
      reason = 'overdraft_sustained';
      message =
        'Cheque especial prolongado e saúde financeira no piso: o clube entrou em falência.';
    }
    return {
      status: 'bankrupt',
      reason,
      message,
      cash: bal,
      overdraftStreak: odStreak,
      delinquencyStreak: delinq,
      depthRounds,
      finances: fin,
    };
  }

  const warnLoan = delinq >= INSOLVENCY_WARN_DELINQUENCY && debt > 0;
  const warnStreak =
    odStreak >= INSOLVENCY_WARN_STREAK && odStreak < BANKRUPTCY_OVERDRAFT_STREAK;
  const warnDepth =
    cost > 0 &&
    bal < 0 &&
    depthRounds >= INSOLVENCY_WARN_DEPTH &&
    depthRounds < BANKRUPTCY_DEPTH_ROUNDS;

  if (warnLoan || warnStreak || warnDepth) {
    let reason = 'warn_loan';
    let message =
      'Juros do empréstimo em atraso estão compostos (taxa reaplicada). A dívida sobe rápido e pode levar à falência.';
    if (warnLoan) {
      reason = 'warn_loan';
      message =
        delinq === 2
          ? '2º atraso no mínimo: a taxa de juros está sendo reaplicada sobre a dívida (compostos). Continue assim e o clube pode falir.'
          : `Atraso ${delinq}r: juros compostos inchando a dívida. Pague o mínimo no Escritório para estancar.`;
    } else if (warnDepth) {
      reason = 'warn_depth';
      message =
        'O rombo de caixa está profundo demais. Sem recuperação rápida, a falência é iminente.';
    } else if (warnStreak) {
      reason = 'warn_overdraft';
      message =
        'Várias rodadas no cheque especial. Normalize o caixa ou o clube pode ser liquidado.';
    }
    return {
      status: 'warn_insolvent',
      reason,
      message,
      cash: bal,
      overdraftStreak: odStreak,
      delinquencyStreak: delinq,
      depthRounds,
      finances: fin,
    };
  }

  // Silencia unused (shortfall só reforça avisos indiretos via delinq/cash).
  void loanServiceShortfall;

  return {
    status: 'ok',
    reason: null,
    message: '',
    cash: bal,
    overdraftStreak: odStreak,
    delinquencyStreak: delinq,
    depthRounds,
    finances: fin,
  };
}

export const clubSolvencyModuleVersion = MODULE_VERSIONS.clubSolvency ?? 1;
