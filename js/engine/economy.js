import { MODULE_VERSIONS } from '../core/constants.js';

/** Orçamento inicial por divisão (R$ fictícios). */
export const INITIAL_BUDGET_BY_DIVISION = {
  A: 18_000_000,
  B: 12_000_000,
  C: 8_000_000,
  D: 5_000_000,
};

const PARTICIPATION_PRIZE = { A: 2_500_000, B: 1_800_000, C: 1_200_000, D: 800_000 };
const POSITION_POOL = { A: 12_000_000, B: 8_000_000, C: 5_000_000, D: 3_000_000 };
const TITLE_BONUS = { A: 15_000_000, B: 10_000_000, C: 6_000_000, D: 4_000_000 };

export function initialBudget(division = 'A') {
  return INITIAL_BUDGET_BY_DIVISION[division] ?? 8_000_000;
}

/** Formata valores em reais fictícios para UI. */
export function formatBudget(value) {
  const amount = Math.max(0, Math.round(Number(value) || 0));
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    const text = millions >= 10 ? Math.round(millions).toString() : millions.toFixed(1).replace('.', ',');
    return `R$ ${text} mi`;
  }
  if (amount >= 1_000) return `R$ ${Math.round(amount / 1_000)} mil`;
  return `R$ ${amount.toLocaleString('pt-BR')}`;
}

/**
 * Premiação de fim de temporada para o clube do usuário.
 */
export function computeSeasonPrize({
  division = 'A',
  position = 10,
  totalTeams = 20,
  champion = null,
  cupChampion = null,
  promoted = false,
  userClub = '',
}) {
  const lines = [];
  let total = 0;

  const participation = PARTICIPATION_PRIZE[division] ?? 1_000_000;
  total += participation;
  lines.push({ label: 'Premiação por participação', amount: participation });

  const pool = POSITION_POOL[division] ?? 4_000_000;
  const rankFactor = Math.max(0, (totalTeams - position + 1) / totalTeams);
  const positionPrize = Math.round(pool * rankFactor);
  if (positionPrize > 0) {
    total += positionPrize;
    lines.push({ label: `${position}º lugar · Brasileirão Série ${division}`, amount: positionPrize });
  }

  if (champion === userClub) {
    const bonus = TITLE_BONUS[division] ?? 5_000_000;
    total += bonus;
    lines.push({ label: 'Bônus de campeão', amount: bonus });
  }

  if (cupChampion === userClub) {
    total += 8_000_000;
    lines.push({ label: 'Copa do Brasil · campeão', amount: 8_000_000 });
  }

  if (promoted) {
    total += 3_000_000;
    lines.push({ label: 'Bônus de acesso', amount: 3_000_000 });
  }

  return { total, lines };
}

export function createEconomyEngine() {
  return {
    moduleVersion: MODULE_VERSIONS.economy,
    INITIAL_BUDGET_BY_DIVISION,
    initialBudget,
    formatBudget,
    computeSeasonPrize,
  };
}
