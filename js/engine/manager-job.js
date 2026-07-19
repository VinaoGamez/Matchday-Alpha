import { MODULE_VERSIONS } from '../core/constants.js';
import { STATUS_MAX, STATUS_MIN } from './club-status/constants.js';

/** Rodadas sem demissão (avisos ok). */
export const MANAGER_JOB_HONEYMOON_ROUNDS = 6;

/** Faixas de Ambiente por divisão (alinhadas ao engine). */
export const HIRE_ENVIRONMENT_RANGES = {
  A: [58, 92],
  B: [55, 88],
  C: [52, 84],
  D: [50, 80],
};

/** Viés de diretoria na chegada (séries menores = mais paciência inicial). */
const HIRE_BOARD_DIVISION_BIAS = { A: 2, B: 4, C: 5, D: 6 };

/** Crise padrão: medidor abaixo deste limiar. */
export const MANAGER_JOB_CRISIS_THRESHOLD = 40;

/** Crise severa: abre caminho para demissão com o outro medidor só “fraco”. */
export const MANAGER_JOB_SEVERE_THRESHOLD = 32;

/** Par suave: um medidor severo + o outro abaixo deste valor → demissão. */
export const MANAGER_JOB_SOFT_PAIR_THRESHOLD = 50;

/**
 * Rodadas consecutivas com diretoria em crise (após a lua de mel) → demissão
 * mesmo com finanças ok. Evita emprego eterno com board no vermelho.
 */
export const MANAGER_JOB_BOARD_STREAK_SACK = 8;

const DIVISION_RANK = { A: 4, B: 3, C: 2, D: 1 };

const clampNum = (value, min, max) => Math.min(max, Math.max(min, value));

/** Ruído determinístico 0–1 a partir do seed. */
const hireNoise = (seed, salt) => {
  const x = Math.sin((Number(seed) || 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Status institucional ao assumir um novo clube (não herda o clube anterior).
 *
 * Fórmula:
 * - Ambiente  = 55% vestiário do novo elenco + 45% meio da faixa da divisão + lua de mel (+3) ± ruído
 * - Torcida   = 50% apoio do clube + 50% âncora 62 ± ruído (torcida ainda “conhece” o clube)
 * - Diretoria = 66 + viés da divisão + ruído → faixa ~60–78 (projeto novo)
 * - Orçamento = caixa inicial da divisão (initialBudget)
 * - Finanças  = calculada depois via syncFinancesFromBudget
 */
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

/**
 * Avalia risco de emprego.
 * Demissão por:
 * 1) Diretoria e Finanças em crise (< limiar)
 * 2) Um severo + o outro fraco (par suave)
 * 3) Diretoria em crise por N rodadas seguidas após a lua de mel
 */
export function resolveBoardJobRisk({
  board,
  finances,
  played = 0,
  honeymoonRounds = MANAGER_JOB_HONEYMOON_ROUNDS,
  threshold = MANAGER_JOB_CRISIS_THRESHOLD,
  severeThreshold = MANAGER_JOB_SEVERE_THRESHOLD,
  softPairThreshold = MANAGER_JOB_SOFT_PAIR_THRESHOLD,
  boardCrisisStreak = 0,
  boardStreakLimit = MANAGER_JOB_BOARD_STREAK_SACK,
  alreadySacked = false,
} = {}) {
  if (alreadySacked) {
    return {
      status: 'sacked',
      reason: 'pending',
      board: Number(board),
      finances: Number(finances),
      boardCrisisStreak: Number(boardCrisisStreak) || 0,
    };
  }

  const boardValue = Number(board);
  const financeValue = Number(finances);
  const gamesPlayed = Math.max(0, Number(played) || 0);
  const prevStreak = Math.max(0, Number(boardCrisisStreak) || 0);
  const boardCrisis = Number.isFinite(boardValue) && boardValue < threshold;
  const financeCrisis = Number.isFinite(financeValue) && financeValue < threshold;
  const boardSevere = Number.isFinite(boardValue) && boardValue < severeThreshold;
  const financeSevere = Number.isFinite(financeValue) && financeValue < severeThreshold;
  const softCombined =
    (boardSevere && Number.isFinite(financeValue) && financeValue < softPairThreshold) ||
    (financeSevere && Number.isFinite(boardValue) && boardValue < softPairThreshold);
  const inHoneymoon = gamesPlayed < honeymoonRounds;
  const nextBoardStreak = boardCrisis ? (inHoneymoon ? prevStreak : prevStreak + 1) : 0;

  if ((boardCrisis && financeCrisis) || softCombined) {
    if (inHoneymoon) {
      return {
        status: 'critical',
        reason: 'honeymoon',
        board: boardValue,
        finances: financeValue,
        boardCrisisStreak: nextBoardStreak,
        message:
          'Diretoria e finanças estão no vermelho, mas o projeto ainda tem paciência no início da temporada.',
      };
    }
    return {
      status: 'sacked',
      reason: softCombined && !(boardCrisis && financeCrisis) ? 'soft_combined' : 'combined',
      board: boardValue,
      finances: financeValue,
      boardCrisisStreak: nextBoardStreak,
      message: softCombined && !(boardCrisis && financeCrisis)
        ? 'A diretoria encerrou o ciclo: a pressão no projeto e o desequilíbrio do clube tornaram a continuidade inviável.'
        : 'A diretoria encerrou o ciclo: resultados e saúde financeira abaixo do aceitável.',
    };
  }

  if (!inHoneymoon && boardCrisis && nextBoardStreak >= boardStreakLimit) {
    return {
      status: 'sacked',
      reason: 'board_sustained',
      board: boardValue,
      finances: financeValue,
      boardCrisisStreak: nextBoardStreak,
      message:
        'A diretoria perdeu a paciência: a cobrança por resultados se arrastou por tempo demais sem reação.',
    };
  }

  if (boardCrisis) {
    const remaining = Math.max(0, boardStreakLimit - nextBoardStreak);
    return {
      status: 'warn_board',
      reason: 'board',
      board: boardValue,
      finances: financeValue,
      boardCrisisStreak: nextBoardStreak,
      message: inHoneymoon
        ? 'A diretoria cobra resultados. Melhore a campanha antes que a paciência acabe.'
        : remaining <= 3
          ? `A diretoria está no limite: sem reação em breve o cargo cai (${remaining} rodada${remaining === 1 ? '' : 's'} de paciência).`
          : 'A diretoria cobra resultados. Melhore a campanha antes que a paciência acabe.',
    };
  }

  if (financeCrisis) {
    return {
      status: 'warn_finances',
      reason: 'finances',
      board: boardValue,
      finances: financeValue,
      boardCrisisStreak: 0,
      message:
        'A diretoria cobra o caixa. A saúde financeira do clube está no vermelho.',
    };
  }

  return {
    status: 'ok',
    reason: null,
    board: boardValue,
    finances: financeValue,
    boardCrisisStreak: 0,
    message: null,
  };
}

const divisionDistance = (a, b) =>
  Math.abs((DIVISION_RANK[a] || 0) - (DIVISION_RANK[b] || 0));

/**
 * Gera 2–4 propostas de clubes para o técnico demitido.
 * Prefere mesma série ou uma abaixo; clubes com diretoria/finanças frágeis.
 */
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

export const managerJobModuleVersion = MODULE_VERSIONS.managerJob ?? 1;
