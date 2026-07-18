import { MODULE_VERSIONS } from '../core/constants.js';

/** Rodadas sem demissão (avisos ok). */
export const MANAGER_JOB_HONEYMOON_ROUNDS = 6;

/** Gatilho 3: os dois abaixo deste limiar → demissão. */
export const MANAGER_JOB_CRISIS_THRESHOLD = 35;

const DIVISION_RANK = { A: 4, B: 3, C: 2, D: 1 };

/**
 * Avalia risco de emprego (estilo Brasfoot).
 * Demissão só com Diretoria e Finanças abaixo do limiar (gatilho 3).
 */
export function resolveBoardJobRisk({
  board,
  finances,
  played = 0,
  honeymoonRounds = MANAGER_JOB_HONEYMOON_ROUNDS,
  threshold = MANAGER_JOB_CRISIS_THRESHOLD,
  alreadySacked = false,
} = {}) {
  if (alreadySacked) {
    return { status: 'sacked', reason: 'pending', board: Number(board), finances: Number(finances) };
  }

  const boardValue = Number(board);
  const financeValue = Number(finances);
  const gamesPlayed = Math.max(0, Number(played) || 0);
  const boardCrisis = Number.isFinite(boardValue) && boardValue < threshold;
  const financeCrisis = Number.isFinite(financeValue) && financeValue < threshold;
  const inHoneymoon = gamesPlayed < honeymoonRounds;

  if (boardCrisis && financeCrisis) {
    if (inHoneymoon) {
      return {
        status: 'critical',
        reason: 'honeymoon',
        board: boardValue,
        finances: financeValue,
        message:
          'Diretoria e finanças estão no vermelho, mas o projeto ainda tem paciência no início da temporada.',
      };
    }
    return {
      status: 'sacked',
      reason: 'combined',
      board: boardValue,
      finances: financeValue,
      message:
        'A diretoria encerrou o ciclo: resultados e saúde financeira abaixo do aceitável.',
    };
  }

  if (boardCrisis) {
    return {
      status: 'warn_board',
      reason: 'board',
      board: boardValue,
      finances: financeValue,
      message:
        'A diretoria cobra resultados. Melhore a campanha antes que a paciência acabe.',
    };
  }

  if (financeCrisis) {
    return {
      status: 'warn_finances',
      reason: 'finances',
      board: boardValue,
      finances: financeValue,
      message:
        'A diretoria cobra o caixa. A saúde financeira do clube está no vermelho.',
    };
  }

  return {
    status: 'ok',
    reason: null,
    board: boardValue,
    finances: financeValue,
    message: null,
  };
}

const divisionDistance = (a, b) =>
  Math.abs((DIVISION_RANK[a] || 0) - (DIVISION_RANK[b] || 0));

/**
 * Gera 2–4 propostas de clubes para o técnico demitido.
 * Prefere mesma série ou uma abaixo; clubes com diretoria/finanças fráciles.
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
    // Evita só Série A quando o técnico veio da D (e vice-versa extremo).
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

  // Fallback: qualquer clube restante.
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
