import { STATUS_MAX, STATUS_MIN } from '../constants.js';

/**
 * Saúde financeira — caixa + cobertura de folha + shortfall.
 * Blend lento para não oscilar a cada compra/reload pequeno.
 *
 * cashScore: estoque vs baseline da divisão
 * runwayScore: quantas rodadas de folha o caixa cobre (peso alto na crise)
 * shortfall: falta de pagamento na última folha empurra o alvo para baixo
 */
export function syncFromBudget(club, {
  balance,
  baseline,
  wageBill = 0,
  shortfall = false,
  clamp,
  clampStatus,
} = {}) {
  if (!club) return;

  const base = baseline || 1;
  const cash = Number(balance) || 0;
  const overdrawn = cash < 0;
  const ratio = overdrawn ? 0 : cash / base;
  // ratio 0 → 28 | ~0.12 → 34 | 1.0 → 83 | 1.5+ → 98
  const cashScore = overdrawn
    ? STATUS_MIN
    : clamp(STATUS_MIN + ratio * 55, STATUS_MIN, STATUS_MAX);

  const bill = Math.max(0, Number(wageBill) || 0);
  const runwayRounds = overdrawn ? -1 : bill > 0 ? cash / bill : 12;
  // Cobertura curta dói: 0→28 | 2→36 | 4→45 | 8→62 | 10+→70
  const runwayScore = overdrawn
    ? STATUS_MIN
    : clamp(STATUS_MIN + Math.min(runwayRounds, 10) * 4.2, STATUS_MIN, STATUS_MAX);

  let target = cashScore * 0.45 + runwayScore * 0.55;
  if (runwayRounds < 3) target -= 8;
  if (runwayRounds < 1.5) target -= 6;
  if (shortfall || club.wageShortfall || overdrawn || club.overdraftActive) target -= 12;
  if (overdrawn) target -= 6;
  target = clamp(target, STATUS_MIN, STATUS_MAX);

  const prev = Number.isFinite(Number(club.finances)) ? Number(club.finances) : target;
  // No vermelho o medidor reage mais rápido (alvo 5–6 rodadas de crise, não semestre).
  const prevW = overdrawn ? 0.65 : 0.85;
  const targetW = overdrawn ? 0.35 : 0.15;
  club.finances = clampStatus(prev * prevW + target * targetW);
}
