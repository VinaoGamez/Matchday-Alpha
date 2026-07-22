import { MODULE_VERSIONS } from '../core/constants.js';
import { STATUS_MAX, STATUS_MIN } from './club-status/constants.js';

/** Rodadas sem demissão (avisos ok). */
export const MANAGER_JOB_HONEYMOON_ROUNDS = 6;

/** Colapso duplo: ambos no piso → demissão (sem escudo). */
export const MANAGER_JOB_COLLAPSE_THRESHOLD = STATUS_MIN;

/** Crise padrão: avisos, streak e par quente. */
export const MANAGER_JOB_CRISIS_THRESHOLD = 40;

/** Crise severa: par crítico (1 severo + outro abaixo da crise). */
export const MANAGER_JOB_SEVERE_THRESHOLD = 32;

/** Zona quente: um abaixo da crise e outro abaixo deste valor. */
export const MANAGER_JOB_WARM_PAIR_THRESHOLD = 45;

/** Rodadas consecutivas na zona quente → demissão. */
export const MANAGER_JOB_WARM_STREAK_ROUNDS = 3;

/** @deprecated v1 — substituído por par crítico (<40) + zona quente. */
export const MANAGER_JOB_SOFT_PAIR_THRESHOLD = 50;

/** Rodadas consecutivas com diretoria em crise → demissão. */
export const MANAGER_JOB_BOARD_STREAK_SACK = 8;

/** Escudo Fortaleza: progresso mínimo da meta ao vivo. */
export const CAMPAIGN_SHIELD_FORTRESS_PROGRESS = 80;

/** Escudo Amortecedor: progresso mínimo da meta ao vivo. */
export const CAMPAIGN_SHIELD_BUFFER_PROGRESS = 55;

export const CAMPAIGN_PRESSURE_FACTORS = { fortress: 0.35, buffer: 0.65, none: 1.0 };

/** Faixas de Ambiente por divisão (alinhadas ao engine). */
export const HIRE_ENVIRONMENT_RANGES = {
  A: [58, 92],
  B: [55, 88],
  C: [52, 84],
  D: [50, 80],
};

const HIRE_BOARD_DIVISION_BIAS = { A: 2, B: 4, C: 5, D: 6 };
const DIVISION_RANK = { A: 4, B: 3, C: 2, D: 1 };

const clampNum = (value, min, max) => Math.min(max, Math.max(min, value));

const hireNoise = (seed, salt) => {
  const x = Math.sin((Number(seed) || 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const isAtOrBelow = (value, threshold) => Number.isFinite(Number(value)) && Number(value) <= threshold;
const isBelow = (value, threshold) => Number.isFinite(Number(value)) && Number(value) < threshold;

/**
 * Escudo de campanha — protege demissão por desequilíbrio quando a meta vai bem.
 * @returns {{ level: 'fortress'|'buffer'|'none', campaignFactor: number, label: string }}
 */
export function resolveCampaignShield({
  goalProgress = 0,
  goalStatus = 'missed',
  position = null,
  goalMax = null,
} = {}) {
  const progress = Number(goalProgress) || 0;
  const pos = Number(position);
  const max = Number(goalMax);
  const inGoalPosition = Number.isFinite(pos) && Number.isFinite(max) && pos > 0 && pos <= max;
  const statusOk = ['near', 'met', 'exceeded'].includes(String(goalStatus || ''));

  if (progress >= CAMPAIGN_SHIELD_FORTRESS_PROGRESS || inGoalPosition) {
    return {
      level: 'fortress',
      campaignFactor: CAMPAIGN_PRESSURE_FACTORS.fortress,
      label: 'Meta protegida',
    };
  }
  if (progress >= CAMPAIGN_SHIELD_BUFFER_PROGRESS || statusOk) {
    return {
      level: 'buffer',
      campaignFactor: CAMPAIGN_PRESSURE_FACTORS.buffer,
      label: 'Campanha no ritmo',
    };
  }
  return {
    level: 'none',
    campaignFactor: CAMPAIGN_PRESSURE_FACTORS.none,
    label: '',
  };
};

export function buildManagerHireStatus({
  club,
  division,
  seed = 1,
  environmentRanges = HIRE_ENVIRONMENT_RANGES,
  initialBudget,
  statusMin = STATUS_MIN,
  statusMax = STATUS_MAX,
} = {}) {
  const div = division || club?.division || 'D';
  const [eMin, eMax] = environmentRanges[div] || HIRE_ENVIRONMENT_RANGES.D;
  const envMid = Math.round((eMin + eMax) / 2);
  const supportAnchor = 62;
  const clubEnv = Number(club?.environment);
  const clubSupport = Number(club?.support);

  const environment = Math.round(
    clampNum(
      (Number.isFinite(clubEnv) ? clubEnv : envMid) * 0.55 +
        envMid * 0.45 +
        3 +
        (hireNoise(seed, 1) * 6 - 3),
      eMin,
      Math.min(eMax, statusMax),
    ),
  );

  const support = Math.round(
    clampNum(
      (Number.isFinite(clubSupport) ? clubSupport : supportAnchor) * 0.5 +
        supportAnchor * 0.5 +
        (hireNoise(seed, 2) * 8 - 4),
      48,
      82,
    ),
  );

  const boardBias = HIRE_BOARD_DIVISION_BIAS[div] ?? 4;
  const board = Math.round(
    clampNum(66 + boardBias + (hireNoise(seed, 3) * 6 - 2), 60, 78),
  );

  const budgetFn = typeof initialBudget === 'function' ? initialBudget : () => 5_000_000;
  const budget = Math.max(0, Math.round(Number(budgetFn(div)) || 0));

  return {
    environment: clampNum(environment, statusMin, statusMax),
    support: clampNum(support, statusMin, statusMax),
    board: clampNum(board, statusMin, statusMax),
    budget,
  };
}

const collapseDual = (board, finances, collapseThreshold) =>
  isAtOrBelow(board, collapseThreshold) && isAtOrBelow(finances, collapseThreshold);

const criticalPair = (board, finances, severeThreshold, crisisThreshold) =>
  (isAtOrBelow(board, severeThreshold) && isBelow(finances, crisisThreshold)) ||
  (isAtOrBelow(finances, severeThreshold) && isBelow(board, crisisThreshold));

const warmPair = (board, finances, crisisThreshold, warmThreshold) =>
  (isBelow(board, crisisThreshold) && isBelow(finances, warmThreshold)) ||
  (isBelow(finances, crisisThreshold) && isBelow(board, warmThreshold));

const imminentCritical = (board, finances, severeThreshold, crisisThreshold) => {
  const b = Number(board);
  const f = Number(finances);
  if (!Number.isFinite(b) || !Number.isFinite(f)) return false;
  if (criticalPair(b, f, severeThreshold, crisisThreshold)) return false;
  if (isAtOrBelow(f, severeThreshold) && b >= crisisThreshold && b <= crisisThreshold + 3) return true;
  if (isAtOrBelow(b, severeThreshold) && f >= crisisThreshold && f <= crisisThreshold + 3) return true;
  return false;
};

/**
 * Avalia risco de emprego (v2 — Projeto Protegido + Crise Real).
 *
 * Demissão:
 * 1) Colapso duplo (ambos ≤ piso)
 * 2) Par crítico (severo + outro < crise) — escudo pode bloquear/atrasar
 * 3) Zona quente sustentada (N rodadas)
 * 4) Diretoria < crise por streak — escudo Fortaleza congela
 */
export function resolveBoardJobRisk({
  board,
  finances,
  played = 0,
  honeymoonRounds = MANAGER_JOB_HONEYMOON_ROUNDS,
  collapseThreshold = MANAGER_JOB_COLLAPSE_THRESHOLD,
  threshold = MANAGER_JOB_CRISIS_THRESHOLD,
  severeThreshold = MANAGER_JOB_SEVERE_THRESHOLD,
  warmThreshold = MANAGER_JOB_WARM_PAIR_THRESHOLD,
  warmStreakLimit = MANAGER_JOB_WARM_STREAK_ROUNDS,
  boardCrisisStreak = 0,
  warmCrisisStreak = 0,
  boardStreakLimit = MANAGER_JOB_BOARD_STREAK_SACK,
  alreadySacked = false,
  campaignShield = { level: 'none' },
  bufferGraceActive = false,
} = {}) {
  const base = {
    board: Number(board),
    finances: Number(finances),
    boardCrisisStreak: Math.max(0, Number(boardCrisisStreak) || 0),
    warmCrisisStreak: Math.max(0, Number(warmCrisisStreak) || 0),
    campaignShield: campaignShield?.level || 'none',
    popupKind: null,
  };

  if (alreadySacked) {
    return { ...base, status: 'sacked', reason: 'pending', message: null };
  }

  const boardValue = Number(board);
  const financeValue = Number(finances);
  const gamesPlayed = Math.max(0, Number(played) || 0);
  const prevBoardStreak = Math.max(0, Number(boardCrisisStreak) || 0);
  const prevWarmStreak = Math.max(0, Number(warmCrisisStreak) || 0);
  const shield = campaignShield?.level || 'none';
  const inHoneymoon = gamesPlayed < honeymoonRounds;

  const boardCrisis = isBelow(boardValue, threshold);
  const financeCrisis = isBelow(financeValue, threshold);
  const dualCollapse = collapseDual(boardValue, financeValue, collapseThreshold);
  const critical = criticalPair(boardValue, financeValue, severeThreshold, threshold);
  const warm = warmPair(boardValue, financeValue, threshold, warmThreshold);

  const freezeBoardStreak = shield === 'fortress' && boardCrisis;
  const nextBoardStreak = boardCrisis
    ? inHoneymoon || freezeBoardStreak
      ? prevBoardStreak
      : prevBoardStreak + 1
    : 0;
  const nextWarmStreak = warm ? prevWarmStreak + 1 : 0;

  const warmLimit =
    shield === 'buffer' ? Math.max(2, warmStreakLimit - 1) : warmStreakLimit;

  const sackPayload = (reason, message, popupKind = 'sacked') => ({
    ...base,
    status: 'sacked',
    reason,
    message,
    boardCrisisStreak: nextBoardStreak,
    warmCrisisStreak: nextWarmStreak,
    popupKind,
  });

  if (dualCollapse) {
    if (inHoneymoon) {
      return {
        ...base,
        status: 'critical',
        reason: 'honeymoon',
        boardCrisisStreak: nextBoardStreak,
        warmCrisisStreak: 0,
        popupKind: 'critical',
        message:
          'Diretoria e finanças estão no vermelho, mas o projeto ainda tem paciência no início da temporada.',
      };
    }
    return sackPayload(
      'collapse_dual',
      'Colapso institucional: diretoria e finanças no limite. O ciclo foi encerrado.',
    );
  }

  if (critical) {
    if (inHoneymoon) {
      return {
        ...base,
        status: 'critical',
        reason: 'honeymoon',
        boardCrisisStreak: nextBoardStreak,
        warmCrisisStreak: 0,
        popupKind: 'critical',
        message:
          'Diretoria e finanças estão no vermelho, mas o projeto ainda tem paciência no início da temporada.',
      };
    }
    if (shield === 'fortress') {
      return {
        ...base,
        status: 'warn_shield',
        reason: 'shield_fortress',
        boardCrisisStreak: nextBoardStreak,
        warmCrisisStreak: 0,
        popupKind: 'shield_fortress',
        message:
          'Finanças e diretoria estão desalinhadas, mas a campanha acima da meta mantém o cargo por enquanto. Regularize o caixa no Escritório.',
      };
    }
    if (shield === 'buffer' && !bufferGraceActive) {
      return {
        ...base,
        status: 'critical_grace',
        reason: 'buffer_grace',
        boardCrisisStreak: nextBoardStreak,
        warmCrisisStreak: 0,
        popupKind: 'critical_grace',
        bufferGraceActive: true,
        message:
          'A meta da temporada deu uma rodada de trégua. Sem reação financeira e institucional, a demissão vem na próxima rodada.',
      };
    }
    return sackPayload(
      'critical_pair',
      'A diretoria encerrou o ciclo: a pressão no projeto e o desequilíbrio do clube tornaram a continuidade inviável.',
    );
  }

  if (!inHoneymoon && warm && nextWarmStreak >= warmLimit) {
    if (shield === 'fortress') {
      return {
        ...base,
        status: 'warn_shield',
        reason: 'shield_fortress_warm',
        boardCrisisStreak: nextBoardStreak,
        warmCrisisStreak: prevWarmStreak,
        popupKind: 'shield_fortress',
        message:
          'Instabilidade financeira se arrasta, mas a campanha protege o cargo. Ainda assim, normalize o caixa.',
      };
    }
    if (shield === 'buffer' && nextWarmStreak < warmLimit + 1) {
      return {
        ...base,
        status: 'warn_warm',
        reason: 'warm_buffer',
        boardCrisisStreak: nextBoardStreak,
        warmCrisisStreak: nextWarmStreak,
        popupKind: 'warn_warm',
        message: `Desequilíbrio institucional por ${nextWarmStreak} rodada(s). A campanha segura o cargo, mas a crise persiste.`,
      };
    }
    return sackPayload(
      'warm_sustained',
      'A diretoria encerrou o ciclo: resultados e saúde financeira abaixo do aceitável por tempo demais.',
    );
  }

  if (!inHoneymoon && boardCrisis && nextBoardStreak >= boardStreakLimit && shield !== 'fortress') {
    return sackPayload(
      'board_sustained',
      'A diretoria perdeu a paciência: a cobrança por resultados se arrastou por tempo demais sem reação.',
    );
  }

  if (imminentCritical(boardValue, financeValue, severeThreshold, threshold)) {
    return {
      ...base,
      status: 'warn_imminent',
      reason: 'imminent_critical',
      boardCrisisStreak: nextBoardStreak,
      warmCrisisStreak: nextWarmStreak,
      popupKind: 'warn_imminent',
      message:
        'Um passo a mais na crise e o cargo cai. Trate caixa e resultados antes da próxima rodada nacional.',
    };
  }

  if (warm && nextWarmStreak >= warmLimit - 1 && shield !== 'fortress') {
    return {
      ...base,
      status: 'warn_imminent',
      reason: 'imminent_warm',
      boardCrisisStreak: nextBoardStreak,
      warmCrisisStreak: nextWarmStreak,
      popupKind: 'warn_imminent',
      message: `Instabilidade por ${nextWarmStreak} rodada(s): mais ${warmLimit - nextWarmStreak} nesta faixa e a diretoria encerra o ciclo.`,
    };
  }

  if (warm) {
    return {
      ...base,
      status: 'warn_warm',
      reason: 'warm',
      boardCrisisStreak: nextBoardStreak,
      warmCrisisStreak: nextWarmStreak,
      popupKind: 'warn_warm',
      message: `Desequilíbrio entre diretoria e finanças (${nextWarmStreak}/${warmLimit} rodadas). Regularize caixa e resultados.`,
    };
  }

  if (boardCrisis) {
    const remaining = Math.max(0, boardStreakLimit - nextBoardStreak);
    const nearSack = remaining <= 3 && shield !== 'fortress';
    return {
      ...base,
      status: nearSack ? 'warn_board_final' : 'warn_board',
      reason: 'board',
      boardCrisisStreak: nextBoardStreak,
      warmCrisisStreak: 0,
      popupKind: nearSack ? 'warn_board_final' : 'warn_board',
      message: inHoneymoon
        ? 'A diretoria cobra resultados. Melhore a campanha antes que a paciência acabe.'
        : nearSack
          ? `A diretoria está no limite: sem reação em breve o cargo cai (${remaining} rodada${remaining === 1 ? '' : 's'} de paciência).`
          : shield === 'fortress'
            ? 'A diretoria cobra, mas a campanha acima da meta segura o projeto por enquanto.'
            : 'A diretoria cobra resultados. Melhore a campanha antes que a paciência acabe.',
    };
  }

  if (financeCrisis) {
    return {
      ...base,
      status: 'warn_finances',
      reason: 'finances',
      boardCrisisStreak: 0,
      warmCrisisStreak: 0,
      popupKind: 'warn_finances',
      message:
        shield === 'fortress'
          ? 'A diretoria cobra o caixa, mas a campanha protege o cargo. Regularize as finanças no Escritório.'
          : 'A diretoria cobra o caixa. A saúde financeira do clube está no vermelho.',
    };
  }

  return {
    ...base,
    status: 'ok',
    reason: null,
    message: null,
    boardCrisisStreak: 0,
    warmCrisisStreak: 0,
    popupKind: null,
  };
}

const divisionDistance = (a, b) =>
  Math.abs((DIVISION_RANK[a] || 0) - (DIVISION_RANK[b] || 0));

export function generateJobOffers({
  clubs = {},
  userClub,
  userDivision = 'A',
  managerRanking,
  seed = 1,
  count = 3,
} = {}) {
  const rngState = { value: (Number(seed) ^ 0x4a4f42) >>> 0 };
  const next = () => {
    rngState.value = (rngState.value + 0x6d2b79f5) >>> 0;
    let t = rngState.value;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const candidates = Object.values(clubs)
    .filter(club => club?.name && club.name !== userClub)
    .map(club => {
      const incumbent = managerRanking?.byClub?.(club.name);
      const board = Number(club.board) || 50;
      const finances = Number(club.finances) || 50;
      const division = club.division || 'D';
      const dist = divisionDistance(division, userDivision);
      const pressure = Math.max(0, 70 - board) + Math.max(0, 70 - finances);
      const score = pressure + (dist === 0 ? 18 : dist === 1 ? 10 : -8) + next() * 6;
      return {
        club: club.name,
        division,
        board,
        finances,
        overall: Math.round(
          (club.roster || []).slice(0, 11).reduce((sum, player) => sum + (player.overall || 0), 0) /
            Math.max(1, Math.min(11, (club.roster || []).length)),
        ),
        incumbentName: incumbent?.name || club.managerName || '—',
        score,
      };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked = [];
  const used = new Set();
  for (const item of candidates) {
    if (picked.length >= count) break;
    if (used.has(item.club)) continue;
    if (divisionDistance(item.division, userDivision) > 1 && picked.length) continue;
    used.add(item.club);
    picked.push({
      club: item.club,
      division: item.division,
      overall: item.overall,
      board: item.board,
      finances: item.finances,
      incumbentName: item.incumbentName,
      note:
        item.division === userDivision
          ? 'Mesma divisão'
          : DIVISION_RANK[item.division] < DIVISION_RANK[userDivision]
            ? 'Divisão inferior'
            : 'Divisão superior',
    });
  }

  if (picked.length < 2) {
    for (const item of candidates) {
      if (picked.length >= Math.max(2, count)) break;
      if (used.has(item.club)) continue;
      used.add(item.club);
      picked.push({
        club: item.club,
        division: item.division,
        overall: item.overall,
        board: item.board,
        finances: item.finances,
        incumbentName: item.incumbentName,
        note: 'Oportunidade de mercado',
      });
    }
  }

  return picked.slice(0, Math.max(2, Math.min(4, count)));
}

/**
 * Limpa flags de aviso quando diretoria e finanças saem da zona quente.
 */
export function shouldResetJobWarningState(
  board,
  finances,
  { recoveryThreshold = MANAGER_JOB_WARM_PAIR_THRESHOLD } = {},
) {
  const b = Number(board);
  const f = Number(finances);
  return Number.isFinite(b) && Number.isFinite(f) && b >= recoveryThreshold && f >= recoveryThreshold;
}

/**
 * Normaliza blob de crise persistido no save da temporada.
 */
export function hydrateManagerJobCrisis(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    ...raw,
    status: raw.status || null,
    reason: raw.reason || null,
    message: raw.message || null,
    board: Number.isFinite(Number(raw.board)) ? Number(raw.board) : null,
    finances: Number.isFinite(Number(raw.finances)) ? Number(raw.finances) : null,
    boardCrisisStreak: Math.max(0, Number(raw.boardCrisisStreak) || 0),
    warmCrisisStreak: Math.max(0, Number(raw.warmCrisisStreak) || 0),
    bufferGraceActive: !!raw.bufferGraceActive,
    campaignShield: raw.campaignShield || null,
    warnedBoard: !!raw.warnedBoard,
    warnedFinances: !!raw.warnedFinances,
    warnedBoardStreak: !!raw.warnedBoardStreak,
    warnedCritical: !!raw.warnedCritical,
    warnedGrace: !!raw.warnedGrace,
    warnedShield: !!raw.warnedShield,
    warnedInsolvent: !!raw.warnedInsolvent,
    warnedPopups:
      raw.warnedPopups && typeof raw.warnedPopups === 'object' ? { ...raw.warnedPopups } : {},
    lastWarnPopupKey: raw.lastWarnPopupKey || null,
    offers: Array.isArray(raw.offers) ? raw.offers.map(item => ({ ...item })) : [],
    cash: Number.isFinite(Number(raw.cash)) ? Number(raw.cash) : undefined,
    debt: Number.isFinite(Number(raw.debt)) ? Number(raw.debt) : undefined,
  };
}

export const managerJobModuleVersion = MODULE_VERSIONS.managerJob ?? 3;
