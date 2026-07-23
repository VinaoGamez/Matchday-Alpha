/**
 * Dashboard — contexto Copa do Mundo vs clube.
 */

import { WORLD_CUP_COMPETITION } from '../world-cup-calendar.js';
import { nationalTeamByCode, resolveNationalTeam } from '../national-teams.js';
import { computeGroupStandings } from '../world-cup-standings.js';

const KNOCKOUT_STAGE_SCORE = Object.freeze({
  R32: 62,
  R16: 72,
  QF: 82,
  SF: 91,
  '3P': 88,
  F: 96,
  champion: 100,
});

const LIVE_GAUGE = Object.freeze({
  exceeded: { short: 'Acima', hint: 'Acima do pedido', color: '#b6ff38' },
  met: { short: 'No alvo', hint: 'Dentro da expectativa', color: '#63d9ff' },
  near: { short: 'Quase', hint: 'Perto da meta', color: '#ffc94f' },
  missed: { short: 'Abaixo', hint: 'Abaixo do pedido', color: '#ff8c94' },
});

/** Há jogos oficiais da CMU pendentes para a seleção do usuário. */
export function isWorldCupDashboardActive({ userNationalTeamName, pendingUserSchedule = [] } = {}) {
  if (!userNationalTeamName) return false;
  return pendingUserSchedule.some(entry => isWorldCupUserScheduleEntry(entry, userNationalTeamName));
}

export function isWorldCupUserScheduleEntry(entry, userNationalTeamName) {
  const game = entry?.game;
  return (
    game?.competition === WORLD_CUP_COMPETITION &&
    userNationalTeamName &&
    (game.home === userNationalTeamName || game.away === userNationalTeamName)
  );
}

/**
 * Foco da mini-tabela / cards laterais: Copa ou clube.
 * Prioriza o tipo de jogo do dia; entre jogos, segue o próximo compromisso do usuário.
 */
export function resolveDashboardStandingsFocus({
  pendingUserSchedule = [],
  nextPendingEntry = null,
  userNationalTeamName = null,
  userClub = null,
  careerCalendarDate = null,
  sameCalendarDay = null,
} = {}) {
  if (!pendingUserSchedule.length) return 'club';

  const isSameDay = (dateA, dateB) => {
    if (typeof sameCalendarDay === 'function') return sameCalendarDay(dateA, dateB);
    if (!dateA || !dateB) return false;
    const a = new Date(dateA);
    const b = new Date(dateB);
    a.setHours(12, 0, 0, 0);
    b.setHours(12, 0, 0, 0);
    return a.getTime() === b.getTime();
  };

  const entryDate = entry => entry?.details?.date || entry?.game?.date;

  if (careerCalendarDate) {
    const ntToday = pendingUserSchedule.find(
      entry =>
        isWorldCupUserScheduleEntry(entry, userNationalTeamName) &&
        isSameDay(entryDate(entry), careerCalendarDate),
    );
    if (ntToday) return 'worldcup';

    const clubToday = pendingUserSchedule.find(entry => {
      const game = entry?.game;
      if (!game || isWorldCupUserScheduleEntry(entry, userNationalTeamName)) return false;
      if (!userClub || (game.home !== userClub && game.away !== userClub)) return false;
      return isSameDay(entryDate(entry), careerCalendarDate);
    });
    if (clubToday) return 'club';
  }

  const next = nextPendingEntry || pendingUserSchedule[0];
  if (next && isWorldCupUserScheduleEntry(next, userNationalTeamName)) return 'worldcup';
  return 'club';
}

export function findUserWorldCupGroup(competition, userNationalTeamName) {
  if (!competition || !userNationalTeamName) return null;
  const hit = (competition.groupFixtures || []).find(
    game => game.home === userNationalTeamName || game.away === userNationalTeamName,
  );
  return hit?.group || null;
}

export function getUserWorldCupGroupTable(competition, userNationalTeamName, random = Math.random) {
  const letter = findUserWorldCupGroup(competition, userNationalTeamName);
  if (!letter || !competition?.groupFixtures?.length) return { letter: null, rows: [] };
  const cached = competition.groupStandings?.[letter];
  const rows = cached?.length
    ? cached
    : computeGroupStandings(letter, competition.groupFixtures, random);
  return { letter, rows };
}

export function getUserWorldCupGroupRow(competition, userNationalTeamName, random = Math.random) {
  const { letter, rows } = getUserWorldCupGroupTable(competition, userNationalTeamName, random);
  const meta = resolveNationalTeam(userNationalTeamName);
  const row =
    rows.find(r => r.name === userNationalTeamName || (meta?.code && r.code === meta.code)) || null;
  const position = row ? rows.indexOf(row) + 1 : null;
  return { letter, row, position, rows };
}

/** Meta da confederação conforme ranking FIFA. */
export function pickWorldCupDashboardGoal(meta) {
  const rank = Number(meta?.fifaRank) || 48;
  let tier = 'medium';
  if (rank <= 8) tier = 'stretch';
  else if (rank <= 20) tier = 'medium';
  else if (rank <= 32) tier = 'soft';
  else tier = 'soft';

  const catalog = {
    soft: {
      id: 'wc_group',
      label: 'Avançar da fase de grupos',
      tier: 'soft',
      evaluate: { type: 'wc_group', minPosition: 2 },
    },
    medium: {
      id: 'wc_round16',
      label: 'Chegar às oitavas de final',
      tier: 'medium',
      evaluate: { type: 'wc_knockout', minStage: 'R16' },
    },
    stretch: {
      id: 'wc_semis',
      label: 'Brigar pelo título',
      tier: 'stretch',
      evaluate: { type: 'wc_knockout', minStage: 'SF' },
    },
  };

  if (rank <= 4) {
    catalog.stretch = {
      id: 'wc_title',
      label: 'Conquistar a Copa do Mundo',
      tier: 'stretch',
      evaluate: { type: 'wc_knockout', minStage: 'champion' },
    };
  } else if (rank <= 12) {
    catalog.stretch = {
      id: 'wc_semis',
      label: 'Chegar à semifinal',
      tier: 'stretch',
      evaluate: { type: 'wc_knockout', minStage: 'SF' },
    };
  }

  const goal = catalog[tier] || catalog.medium;
  return {
    ...goal,
    division: 'CMU',
    competition: WORLD_CUP_COMPETITION,
    fifaRank: rank,
  };
}

function userKnockoutStage(competition, userNationalTeamName) {
  if (!competition?.knockoutFixtures?.length || !userNationalTeamName) return null;
  const meta = resolveNationalTeam(userNationalTeamName);
  const code = meta?.code;
  const active = [...competition.knockoutFixtures]
    .reverse()
    .find(game => {
      if (!game.completed && game.homeGoals == null) return false;
      return (
        game.home === userNationalTeamName ||
        game.away === userNationalTeamName ||
        game.homeCode === code ||
        game.awayCode === code
      );
    });
  if (!active) return null;
  if (competition.champion && competition.champion === code) return 'champion';
  const winner = active.winnerCode || active.winner;
  const userSide =
    active.home === userNationalTeamName ||
    active.homeCode === code ||
    active.away === userNationalTeamName ||
    active.awayCode === code;
  if (userSide && winner && winner !== code && winner !== userNationalTeamName) {
    return `out-${active.stage || 'KO'}`;
  }
  return active.stage || null;
}

function projectionStatus(score) {
  if (score >= 86) return 'exceeded';
  if (score >= 68) return 'met';
  if (score >= 40) return 'near';
  return 'missed';
}

/** Progresso ao vivo da meta na Copa. */
export function worldCupGoalLiveProgress(goal, ctx = {}) {
  const { groupRow, groupPosition, groupSize = 4, played = 0, knockoutStage, teamPower = 85 } = ctx;
  let score = 38 + Math.min(18, Math.max(0, (Number(teamPower) - 78) * 0.9));

  if (groupRow) {
    const ptsScore = (Number(groupRow.points) / 9) * 34;
    const posScore = groupPosition ? ((groupSize + 1 - groupPosition) / groupSize) * 28 : 12;
    const rhythm = (Number(groupRow.played) / 3) * 8;
    score = Math.max(score, ptsScore + posScore + rhythm);
  } else if (played === 0) {
    score = Math.max(score, 52);
  }

  if (knockoutStage && KNOCKOUT_STAGE_SCORE[knockoutStage]) {
    score = Math.max(score, KNOCKOUT_STAGE_SCORE[knockoutStage]);
  }
  if (knockoutStage === 'champion') score = 100;

  const status = projectionStatus(score);
  const meta = LIVE_GAUGE[status] || LIVE_GAUGE.missed;
  let hint = meta.hint;
  if (groupRow && !knockoutStage) {
    hint = `${groupRow.points} pts · ${groupPosition}º no grupo`;
  } else if (knockoutStage && knockoutStage !== 'champion') {
    hint = `Fase: ${knockoutStage}`;
  } else if (knockoutStage === 'champion') {
    hint = 'Campeão mundial';
  }

  return {
    status,
    score: Math.round(Math.min(100, Math.max(0, score))),
    short: meta.short,
    hint,
    color: meta.color,
    label: goal?.label || '—',
    goalId: goal?.id || null,
  };
}

export function buildWorldCupDashboardGoalContext({
  competition,
  userNationalTeamName,
  userNationalTeamCode,
  getNationalTeamClub,
  random = Math.random,
}) {
  const meta =
    nationalTeamByCode(userNationalTeamCode) ||
    resolveNationalTeam(userNationalTeamName) ||
    { name: userNationalTeamName, fifaRank: 32 };
  const goal = pickWorldCupDashboardGoal(meta);
  const { letter, row, position, rows } = getUserWorldCupGroupRow(
    competition,
    userNationalTeamName,
    random,
  );
  const ntClub = getNationalTeamClub?.(userNationalTeamName);
  const knockoutStage = userKnockoutStage(competition, userNationalTeamName);
  const progress = worldCupGoalLiveProgress(goal, {
    groupRow: row,
    groupPosition: position,
    groupSize: rows.length || 4,
    played: row?.played || 0,
    knockoutStage: knockoutStage?.startsWith?.('out-') ? null : knockoutStage,
    teamPower: ntClub?.power || meta?.teamPower || 85,
  });
  return {
    goal,
    progress,
    meta,
    groupLetter: letter,
    groupRow: row,
    groupPosition: position,
    groupRows: rows,
    knockoutStage,
  };
}

export function buildWorldCupDashboardEnvironment({
  userNationalTeamName,
  userNationalTeamCode,
  getNationalTeamClub,
  competition,
  random = Math.random,
}) {
  const meta =
    nationalTeamByCode(userNationalTeamCode) ||
    resolveNationalTeam(userNationalTeamName) ||
    {};
  const ntClub = getNationalTeamClub?.(userNationalTeamName);
  const roster = ntClub?.roster || [];
  const overall = roster.length
    ? Math.round(
        roster.slice(0, 11).reduce((sum, p) => sum + (Number(p.overall) || 0), 0) /
          Math.max(1, Math.min(11, roster.length)),
      )
    : Number(ntClub?.power) || 80;
  const teamPower = Number(ntClub?.power) || overall;
  const { row, position, letter } = getUserWorldCupGroupRow(competition, userNationalTeamName, random);

  let environment = clamp(Math.round(teamPower * 0.72 + (100 - (meta.fifaRank || 32)) * 0.28), 42, 96);
  if (row) {
    environment = clamp(
      environment + (row.points - row.played) * 3 + (position === 1 ? 8 : position === 2 ? 3 : position === 3 ? -4 : -10),
      35,
      98,
    );
  }

  const support = clamp(58 + Math.round((100 - (meta.fifaRank || 40)) * 0.35) + (row?.wins || 0) * 4, 40, 98);
  const board = clamp(52 + Math.round(teamPower * 0.22), 45, 94);
  const morale = clamp(environment - 4 + (row?.points || 0) * 2, 38, 96);

  const note =
    environment > 75
      ? ['Seleção confiante', 'O grupo responde bem à convocação.']
      : environment > 45
        ? ['Ambiente estável', 'A delegação trabalha com foco no próximo jogo.']
        : ['Pressão na seleção', 'Resultados abaixo do esperado na Copa.'];

  const factors = [
    {
      label: 'RANKING FIFA',
      value: meta.fifaRank ? `${meta.fifaRank}º` : '—',
      tone: Math.max(35, 100 - (meta.fifaRank || 40)),
    },
    {
      label: 'FORÇA DO ELENCO',
      value: String(teamPower),
      tone: teamPower,
    },
    {
      label: 'FASE NA COPA',
      value: letter ? (position ? `Grupo ${letter} · ${position}º` : `Grupo ${letter}`) : 'Grupos',
      tone: position ? (position <= 2 ? 78 : 48) : 55,
    },
    {
      label: 'PONTOS NO GRUPO',
      value: row ? String(row.points) : '0',
      tone: clamp(32 + (row?.points || 0) * 7, 32, 92),
    },
  ];

  return { overall, environment, support, board, morale, note, factors, teamPower };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
