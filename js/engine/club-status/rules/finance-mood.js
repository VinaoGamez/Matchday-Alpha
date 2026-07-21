/**
 * Pressão financeira sobre Torcida / Ambiente (por rodada nacional).
 * Diretoria já tem financePressureDelta — aqui é o clima do estádio e do vestiário.
 */

/** Converte delta fracionário em tick inteiro visível no status (0–100 inteiro). */
export function snapMoodDelta(value) {
  const n = Number(value) || 0;
  if (n === 0) return 0;
  if (n < 0) return Math.min(-1, Math.floor(n));
  return Math.max(1, Math.ceil(n));
}

/**
 * @param {{
 *   delinquencyStreak?: number,
 *   overdraftStreak?: number,
 *   wageShortfall?: boolean,
 *   restricted?: boolean,
 *   wasInCrisis?: boolean,
 *   reliefRoundsRemaining?: number,
 * }} opts
 * @returns {{
 *   support: number,
 *   environment: number,
 *   inCrisis: boolean,
 *   level: number,
 *   reliefRoundsRemaining: number,
 * }}
 */
export function resolveFinanceMood({
  delinquencyStreak = 0,
  overdraftStreak = 0,
  wageShortfall = false,
  restricted = false,
  wasInCrisis = false,
  reliefRoundsRemaining = 0,
} = {}) {
  const delinq = Math.max(0, Math.round(Number(delinquencyStreak) || 0));
  const od = Math.max(0, Math.round(Number(overdraftStreak) || 0));
  const shortfall = !!wageShortfall;
  const inCrisis = delinq >= 1 || od >= 1 || shortfall;

  if (inCrisis) {
    let level = 0;
    if (delinq >= 3 || od >= 3) level = 3;
    else if (delinq >= 2 || od >= 2) level = 2;
    else level = 1;

    let support = level === 1 ? -0.4 : level === 2 ? -0.7 : -1.0;
    let environment = level === 1 ? -0.25 : level === 2 ? -0.45 : -0.7;

    if (delinq >= 1 && od >= 1) {
      support *= 1.3;
      environment *= 1.3;
    }

    support = Math.max(-1.4, support);
    environment = Math.max(-1.0, environment);

    let supportTick = snapMoodDelta(support);
    const environmentTick = snapMoodDelta(environment);
    // Restrição de mercado: tick extra na Torcida (sempre visível no inteiro 0–100).
    if (restricted) supportTick = Math.max(-2, supportTick - 1);

    return {
      support: supportTick,
      environment: environmentTick,
      inCrisis: true,
      level,
      reliefRoundsRemaining: 0,
    };
  }

  let relief = Math.max(0, Math.round(Number(reliefRoundsRemaining) || 0));
  if (wasInCrisis) relief = 2;

  if (relief > 0) {
    return {
      support: snapMoodDelta(0.25),
      environment: snapMoodDelta(0.15),
      inCrisis: false,
      level: 0,
      reliefRoundsRemaining: relief - 1,
    };
  }

  return {
    support: 0,
    environment: 0,
    inCrisis: false,
    level: 0,
    reliefRoundsRemaining: 0,
  };
}
