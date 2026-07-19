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
 * `sponsorPressure` (0–1): pacote de patrocínio alto amplifica a reação da diretoria.
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
  const pressure = Math.max(0, Math.min(1, Number(ctx.sponsorPressure) || 0));
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

  // Pacote alto: sucesso rende mais apoio; falha cobra mais da diretoria.
  const scale = 1 + pressure * 0.85;
  const baseDelta = BOARD_DELTA[status] ?? 0;
  const boardDelta = Math.round(baseDelta * scale);
  let feeling = FEELING[status] || FEELING.missed;
  if (pressure >= 0.55) {
    if (status === 'exceeded' || status === 'met') {
      feeling = `${feeling} O pacote de patrocínio elevado reforçou o crédito junto à diretoria.`;
    } else if (status === 'near' || status === 'missed') {
      feeling = `${feeling} Com um pacote comercial alto, a cobrança pela meta ficou mais dura.`;
    }
  }

  return {
    status,
    boardDelta,
    feeling,
    label: goal.label,
    goalId: goal.id,
    tier: goal.tier,
    sponsorPressure: pressure,
  };
}

/** Cores do Escritório: vermelho / amarelo / verde (projeção momentânea). */
const LIVE_GAUGE = {
  exceeded: { short: 'Acima', hint: 'Acima do ritmo da meta', color: '#b6ff38' },
  met: { short: 'No alvo', hint: 'Projeção de cumprir a meta', color: '#6dff8a' },
  near: { short: 'No ritmo', hint: 'No caminho da meta', color: '#ffc94f' },
  missed: { short: 'Abaixo', hint: 'Muito abaixo do esperado', color: '#ff6b7a' },
};

const clampScore = n => Math.max(0, Math.min(100, Math.round(n)));

/** Ajuste por retrospecto recente (W/D/L). */
function formAdjustment(form) {
  if (!Array.isArray(form) || !form.length) return 0;
  const recent = form.slice(-5);
  let pts = 0;
  for (const result of recent) {
    if (result === 'W') pts += 3;
    else if (result === 'D') pts += 1;
  }
  const ratio = pts / (recent.length * 3);
  // ~1,35 pts/jogo = neutro; boa sequência sobe, crise desce.
  return (ratio - 0.45) * 32;
}

/** PPG de referência grosseiro para terminar na faixa da meta. */
function targetPpgForPosition(maxPos, clubsCount = 20) {
  const n = Math.max(4, Number(clubsCount) || 20);
  const max = Math.max(1, Number(maxPos) || Math.ceil(n / 2));
  const t = (max - 1) / Math.max(1, n - 1);
  return 2.35 - t * 1.35;
}

function seasonProgressRatio(ctx) {
  const played = Number(ctx.played) || 0;
  const total = Math.max(1, Number(ctx.seasonRounds) || 38);
  return Math.max(0, Math.min(1, played / total));
}

/**
 * Projeção 0–100: fase/posição atual + ritmo de pontos + forma recente.
 * Não é o veredicto final da temporada — só o momento.
 */
function projectLiveScore(goal, ctx = {}) {
  const type = goal?.evaluate?.type;
  const formAdj = formAdjustment(ctx.form);
  const played = Number(ctx.played) || 0;
  const points = Number.isFinite(Number(ctx.points))
    ? Number(ctx.points)
    : (Number(ctx.wins) || 0) * 3 + (Number(ctx.draws) || 0);
  const ppg = played > 0 ? points / played : 0;
  const progress = seasonProgressRatio(ctx);
  const position = Number(ctx.position) || 99;
  const phase = ctx.serieDPhase || 'group';
  const promoted = !!ctx.promoted;

  if (type === 'position') {
    const max = Number(goal.evaluate.max) || 20;
    const nearMax = Number(goal.evaluate.nearMax) || max + 2;
    const clubsCount = Number(ctx.clubsCount) || 20;
    const topBand = Math.max(1, Math.ceil(max / 2));
    let structural;
    if (position <= topBand) {
      const t = topBand <= 1 ? 1 : (topBand - position) / (topBand - 1);
      structural = 88 + t * 12;
    } else if (position <= max) {
      structural = 70 + ((max - position) / Math.max(1, max - topBand)) * 16;
    } else if (position <= nearMax) {
      structural = 44 + ((nearMax - position) / Math.max(1, nearMax - max)) * 22;
    } else {
      structural = Math.max(8, 40 - (position - nearMax) * 5);
    }
    const needPpg = targetPpgForPosition(max, clubsCount);
    const paceScore = played >= 2 ? clampScore((ppg / Math.max(0.35, needPpg)) * 72) : 50;
    // Início: ritmo + forma pesam mais; fim: tabela manda.
    const score = structural * (0.3 + 0.55 * progress) + paceScore * (0.55 - 0.35 * progress) + formAdj * (0.85 - 0.35 * progress);
    // Já na meta com jogos: puxa para verde.
    if (position <= max && played >= 3) return clampScore(Math.max(score, 72 + formAdj * 0.25));
    return clampScore(score);
  }

  if (type === 'serieD_phase') {
    const got = phaseRank(phase);
    const need = phaseRank(goal.evaluate.min);
    const near = phaseRank(goal.evaluate.nearMin ?? goal.evaluate.min);
    let structural;
    if (got >= need + 2) structural = 90 + Math.min(10, (got - need - 2) * 4);
    else if (got >= need) structural = 76 + Math.min(12, (got - need) * 6);
    else if (near < need && got >= near) {
      structural = 48 + ((got - near) / Math.max(1, need - near)) * 24;
    } else if (got === 0) {
      // Ainda nos grupos: tabela do grupo como proxy do caminho.
      const groupSize = Number(ctx.clubsCount) || 8;
      const qualify = Math.min(4, Math.max(2, Math.floor(groupSize / 2)));
      if (position <= 2) structural = 58;
      else if (position <= qualify) structural = 50;
      else if (position === qualify + 1) structural = 36;
      else structural = Math.max(12, 30 - (position - qualify - 1) * 5);
      if (played < 3 && position > qualify) structural = Math.max(structural, 38);
    } else {
      structural = Math.max(10, 34 - (near - got) * 8);
    }
    return clampScore(structural + formAdj * (got >= need ? 0.35 : 0.9));
  }

  if (type === 'promoted') {
    if (promoted && phase === 'champion') return 100;
    if (promoted) return clampScore(86 + formAdj * 0.2);
    const got = phaseRank(phase);
    let structural;
    if (got >= phaseRank('final')) structural = 80;
    else if (got >= phaseRank('semi') || got >= phaseRank('playoff')) structural = 72;
    else if (got >= phaseRank('quarter')) structural = 64;
    else if (got >= phaseRank('round16')) structural = 56;
    else if (got >= phaseRank('third')) structural = 50;
    else if (got >= phaseRank('second')) structural = 46;
    else {
      const groupSize = Number(ctx.clubsCount) || 8;
      const qualify = 4;
      if (position <= 2) structural = 60;
      else if (position <= qualify) structural = 52;
      else if (position === qualify + 1) structural = 38;
      else structural = Math.max(14, 32 - (position - qualify - 1) * 5);
      // Poucos jogos: não pintar de vermelho só por tabela ainda solta.
      if (played > 0 && played < 4) structural = Math.max(structural, 42 + formAdj * 0.3);
      const needPpg = 1.55;
      if (played >= 3) {
        const pace = clampScore((ppg / needPpg) * 58);
        structural = structural * 0.55 + pace * 0.45;
      }
    }
    const nearNeed = phaseRank(goal.evaluate.nearPhase || 'semi');
    if (got >= nearNeed && !promoted) structural = Math.max(structural, 68);
    return clampScore(structural + formAdj * (got >= phaseRank('second') ? 0.45 : 0.95));
  }

  return clampScore(40 + formAdj);
}

function projectionStatus(score, goal, ctx) {
  const type = goal?.evaluate?.type;
  const promoted = !!ctx.promoted;
  const position = Number(ctx.position) || 99;
  if (type === 'promoted' && promoted) return ctx.serieDPhase === 'champion' ? 'exceeded' : 'met';
  if (type === 'position' && position <= (Number(goal.evaluate?.max) || 20) && (Number(ctx.played) || 0) >= 8 && score >= 70) {
    return position <= Math.ceil((Number(goal.evaluate.max) || 20) / 2) ? 'exceeded' : 'met';
  }
  if (type === 'serieD_phase') {
    const got = phaseRank(ctx.serieDPhase || 'group');
    const need = phaseRank(goal.evaluate?.min);
    if (got >= need + 2) return 'exceeded';
    if (got >= need) return 'met';
  }
  if (score >= 86) return 'exceeded';
  if (score >= 68) return 'met';
  if (score >= 40) return 'near';
  return 'missed';
}

/**
 * Progresso ao vivo da meta (Escritório).
 * Projeção momentânea: fase/posição + ritmo + retrospecto — cores vermelho/amarelo/verde.
 */
export function seasonGoalLiveProgress(goal, ctx = {}) {
  const score = projectLiveScore(goal, ctx);
  const status = projectionStatus(score, goal, ctx);
  const meta = LIVE_GAUGE[status] || LIVE_GAUGE.missed;
  return {
    status,
    score,
    short: meta.short,
    hint: meta.hint,
    color: meta.color,
    label: goal?.label || '—',
    goalId: goal?.id || null,
  };
}

export function createSeasonGoalsEngine() {
  return {
    moduleVersion: MODULE_VERSIONS.seasonGoals ?? 1,
    pickSeasonGoal,
    evaluateSeasonGoal,
    seasonGoalLiveProgress,
    SEASON_GOAL_CATALOG,
    BOARD_DELTA,
  };
}
