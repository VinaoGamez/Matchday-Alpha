import { MODULE_VERSIONS } from '../core/constants.js';

/** Ordem de fase Série D (menor = mais cedo). */
export const SERIE_D_PHASE_RANK = {
  group: 0,
  second: 1,
  third: 2,
  round16: 3,
  quarter: 4,
  semi: 5,
  playoff: 5,
  final: 6,
  champion: 7,
};

const BOARD_DELTA = {
  exceeded: 10,
  met: 4,
  near: -3,
  missed: -10,
};

const FEELING = {
  exceeded: 'A diretoria celebra: a meta foi superada.',
  met: 'Meta da temporada cumprida. A diretoria está satisfeita.',
  near: 'Quase lá — a diretoria mantém o projeto, com ressalvas.',
  missed: 'Abaixo do combinado. A diretoria cobrará mudanças.',
};

/** Catálogo de metas por série. */
export const SEASON_GOAL_CATALOG = {
  A_mid: {
    id: 'A_mid',
    division: 'A',
    tier: 'soft',
    label: 'Terminar no meio da tabela (14º ou melhor)',
    evaluate: { type: 'position', max: 14, nearMax: 16 },
  },
  A_top8: {
    id: 'A_top8',
    division: 'A',
    tier: 'medium',
    label: 'Terminar no G8',
    evaluate: { type: 'position', max: 8, nearMax: 10 },
  },
  A_top4: {
    id: 'A_top4',
    division: 'A',
    tier: 'stretch',
    label: 'Brigar pelo G4',
    evaluate: { type: 'position', max: 4, nearMax: 6 },
  },
  B_safe: {
    id: 'B_safe',
    division: 'B',
    tier: 'soft',
    label: 'Escapar da zona de rebaixamento',
    evaluate: { type: 'position', max: 16, nearMax: 17 },
  },
  B_playoff: {
    id: 'B_playoff',
    division: 'B',
    tier: 'medium',
    label: 'Chegar ao G6 (disputa de acesso)',
    evaluate: { type: 'position', max: 6, nearMax: 8 },
  },
  B_access: {
    id: 'B_access',
    division: 'B',
    tier: 'stretch',
    label: 'Conquistar o acesso (G4)',
    evaluate: { type: 'position', max: 4, nearMax: 6 },
  },
  C_safe: {
    id: 'C_safe',
    division: 'C',
    tier: 'soft',
    label: 'Escapar da zona de rebaixamento',
    evaluate: { type: 'position', max: 18, nearMax: 19 },
  },
  C_playoff: {
    id: 'C_playoff',
    division: 'C',
    tier: 'medium',
    label: 'Brigar pelo G8',
    evaluate: { type: 'position', max: 8, nearMax: 10 },
  },
  C_access: {
    id: 'C_access',
    division: 'C',
    tier: 'stretch',
    label: 'Conquistar o acesso (G4)',
    evaluate: { type: 'position', max: 4, nearMax: 6 },
  },
  D_group: {
    id: 'D_group',
    division: 'D',
    tier: 'soft',
    label: 'Avançar da fase de grupos',
    evaluate: { type: 'serieD_phase', min: 'second', nearMin: 'second' },
  },
  D_deep: {
    id: 'D_deep',
    division: 'D',
    tier: 'medium',
    label: 'Chegar às oitavas do mata-mata',
    evaluate: { type: 'serieD_phase', min: 'round16', nearMin: 'third' },
  },
  D_access: {
    id: 'D_access',
    division: 'D',
    tier: 'stretch',
    label: 'Conquistar o acesso à Série C',
    evaluate: { type: 'promoted', nearPhase: 'semi' },
  },
};

const TIER_PICK = {
  A: { soft: 'A_mid', medium: 'A_top8', stretch: 'A_top4' },
  B: { soft: 'B_safe', medium: 'B_playoff', stretch: 'B_access' },
  C: { soft: 'C_safe', medium: 'C_playoff', stretch: 'C_access' },
  D: { soft: 'D_group', medium: 'D_deep', stretch: 'D_access' },
};

const DIVISION_BENCHMARKS = { A: 82, B: 76, C: 70, D: 65 };

const phaseRank = key => SERIE_D_PHASE_RANK[key] ?? 0;

/**
 * Escolhe meta pela força relativa do elenco vs benchmark da série.
 */
export function pickSeasonGoal({ division = 'A', overall = 70, seed = 1 } = {}) {
  const div = ['A', 'B', 'C', 'D'].includes(division) ? division : 'A';
  const bench = DIVISION_BENCHMARKS[div] || 70;
  const relative = Number(overall) - bench;
  // Pequeno jitter estável por seed para não ficar determinístico demais.
  const jitter = ((Number(seed) >>> 0) % 7) - 3;
  const score = relative + jitter * 0.35;
  let tier = 'medium';
  if (score < -2.5) tier = 'soft';
  else if (score > 2.5) tier = 'stretch';
  const id = TIER_PICK[div][tier];
  const goal = SEASON_GOAL_CATALOG[id];
  return {
    id: goal.id,
    label: goal.label,
    division: goal.division,
    tier: goal.tier,
    evaluate: { ...goal.evaluate },
  };
}

/**
 * Avalia meta no fim da temporada.
 * @returns {{ status, boardDelta, feeling, label, goalId }}
 */
export function evaluateSeasonGoal(goal, ctx = {}) {
  if (!goal?.evaluate) {
    return { status: 'met', boardDelta: 0, feeling: FEELING.met, label: goal?.label || '—', goalId: goal?.id || null };
  }
  const { type } = goal.evaluate;
  const position = Number(ctx.position) || 99;
  const promoted = !!ctx.promoted;
  const phase = ctx.serieDPhase || 'group';
  let status = 'missed';

  if (type === 'position') {
    const max = Number(goal.evaluate.max) || 20;
    const nearMax = Number(goal.evaluate.nearMax) || max + 2;
    if (position <= max) status = position <= Math.ceil(max / 2) ? 'exceeded' : 'met';
    else if (position <= nearMax) status = 'near';
    else status = 'missed';
  } else if (type === 'serieD_phase') {
    const got = phaseRank(phase);
    const need = phaseRank(goal.evaluate.min);
    const near = phaseRank(goal.evaluate.nearMin ?? goal.evaluate.min);
    if (got >= need + 2) status = 'exceeded';
    else if (got >= need) status = 'met';
    else if (near < need && got >= near) status = 'near';
    else status = 'missed';
  } else if (type === 'promoted') {
    if (promoted && phase === 'champion') status = 'exceeded';
    else if (promoted) status = 'met';
    else if (phaseRank(phase) >= phaseRank(goal.evaluate.nearPhase || 'semi')) status = 'near';
    else status = 'missed';
  }

  return {
    status,
    boardDelta: BOARD_DELTA[status] ?? 0,
    feeling: FEELING[status] || FEELING.missed,
    label: goal.label,
    goalId: goal.id,
    tier: goal.tier,
  };
}

export function createSeasonGoalsEngine() {
  return {
    moduleVersion: MODULE_VERSIONS.seasonGoals ?? 1,
    pickSeasonGoal,
    evaluateSeasonGoal,
    SEASON_GOAL_CATALOG,
    BOARD_DELTA,
  };
}
