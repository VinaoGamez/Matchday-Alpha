import { getStructureLevel, getPitchLevel } from './economy.js';

export const OBJECTIVE_CATEGORY_LABELS = {
  tournament: 'TORNEIOS',
  economy: 'ECONOMIA',
  structure: 'ESTRUTURA',
};

const TOURNAMENT_EXTRA = [
  {
    id: 't_points_pace',
    label: 'Pontuar em 70% dos jogos disputados',
    evaluate: { type: 'points_rate', min: 0.7, minPlayed: 8 },
  },
  {
    id: 't_positive_gd',
    label: 'Fechar o turno com saldo de gols positivo',
    evaluate: { type: 'goal_diff_min', min: 1 },
  },
  {
    id: 't_unbeaten_four',
    label: 'Encadear 4 jogos invictos',
    evaluate: { type: 'unbeaten_streak', min: 4 },
  },
  {
    id: 't_top_half',
    label: 'Permanecer entre os 10 primeiros',
    evaluate: { type: 'position_max', max: 10, minPlayed: 10 },
    divisions: ['A', 'B', 'C'],
  },
  {
    id: 't_win_streak',
    label: 'Conquistar 3 vitórias seguidas',
    evaluate: { type: 'win_streak', min: 3 },
  },
  {
    id: 't_cup_advance',
    label: 'Avançar além da 2ª fase da Copa',
    evaluate: { type: 'cup_min_phase', min: 3 },
  },
  {
    id: 't_serie_d_points',
    label: 'Somar 12 pontos na fase de grupos',
    evaluate: { type: 'points_min', min: 12, minPlayed: 6 },
    divisions: ['D'],
  },
];

const ECONOMY_OBJECTIVES = [
  {
    id: 'e_positive_cash',
    label: 'Manter caixa positivo até o fim do turno',
    evaluate: { type: 'balance_min', min: 0 },
  },
  {
    id: 'e_finance_55',
    label: 'Saúde financeira acima de 55%',
    evaluate: { type: 'finances_min', min: 55 },
  },
  {
    id: 'e_finance_60',
    label: 'Saúde financeira acima de 60%',
    evaluate: { type: 'finances_min', min: 60 },
  },
  {
    id: 'e_runway_3',
    label: 'Reserva de caixa para 3 rodadas de folha',
    evaluate: { type: 'runway_min', min: 3 },
  },
  {
    id: 'e_no_overdraft',
    label: 'Evitar saldo negativo durante a temporada',
    evaluate: { type: 'balance_min', min: 0 },
  },
  {
    id: 'e_cash_buffer',
    label: 'Acumular reserva de R$ 500 mil',
    evaluate: { type: 'balance_min', min: 500_000 },
  },
];

const STRUCTURE_TEMPLATES = [
  {
    id: 's_medical',
    label: 'Elevar Dep. Médico ao nível {target}',
    evaluateType: 'medical_level',
    readLevel: club => Math.max(0, Math.min(5, Number(club?.medicalInvestment) || 0)),
    maxLevel: 5,
  },
  {
    id: 's_prevention',
    label: 'Programa de Prevenção nível {target}',
    evaluateType: 'prevention_level',
    readLevel: club => Math.max(0, Math.min(3, Number(club?.preventionProgram) || 0)),
    maxLevel: 3,
  },
  {
    id: 's_structure',
    label: 'Estrutura do estádio nível {target}',
    evaluateType: 'structure_level',
    readLevel: club => getStructureLevel(club),
    maxLevel: 5,
  },
  {
    id: 's_pitch',
    label: 'Gramado nível {target} ou superior',
    evaluateType: 'pitch_level',
    readLevel: club => getPitchLevel(club),
    maxLevel: 5,
  },
  {
    id: 's_capacity',
    label: 'Expandir capacidade do estádio (nível {target})',
    evaluateType: 'capacity_level',
    readLevel: club => Math.max(0, Math.min(5, Number(club?.stadiumCapacityLevel) || 0)),
    maxLevel: 5,
  },
];

const pickIndex = (length, seed, salt = 0) => {
  if (length <= 0) return 0;
  return ((Number(seed) >>> 0) + salt * 997) % length;
};

const statusFromScore = (score, thresholds = { met: 100, near: 72 }) => {
  if (score >= thresholds.met) return 'met';
  if (score >= thresholds.near) return 'near';
  if (score >= 40) return 'near';
  return 'missed';
};

const streakFromForm = (form, predicate) => {
  let streak = 0;
  for (let index = form.length - 1; index >= 0; index -= 1) {
    if (!predicate(form[index])) break;
    streak += 1;
  }
  return streak;
};

/**
 * Metas complementares da temporada (torneio extra, economia, estrutura).
 * A meta principal de campanha continua em `seasonGoal`.
 */
export function pickSeasonObjectives({ division = 'A', seed = 1, club = null, inCup = true } = {}) {
  const div = ['A', 'B', 'C', 'D'].includes(division) ? division : 'A';
  const tournamentPool = TOURNAMENT_EXTRA.filter(entry => {
    if (entry.divisions && !entry.divisions.includes(div)) return false;
    if (entry.id === 't_cup_advance' && !inCup) return false;
    return true;
  });
  const tournamentPick = tournamentPool[pickIndex(tournamentPool.length, seed, 11)] || tournamentPool[0];
  const economyPick = ECONOMY_OBJECTIVES[pickIndex(ECONOMY_OBJECTIVES.length, seed, 23)] || ECONOMY_OBJECTIVES[0];
  const structureTemplate =
    STRUCTURE_TEMPLATES[pickIndex(STRUCTURE_TEMPLATES.length, seed, 37)] || STRUCTURE_TEMPLATES[0];
  const currentLevel = structureTemplate.readLevel(club);
  const target = Math.min(structureTemplate.maxLevel, Math.max(currentLevel + 1, currentLevel === 0 ? 1 : currentLevel + 1));

  const objectives = [];
  if (tournamentPick) {
    objectives.push({
      id: tournamentPick.id,
      category: 'tournament',
      label: tournamentPick.label,
      evaluate: { ...tournamentPick.evaluate },
    });
  }
  objectives.push({
    id: economyPick.id,
    category: 'economy',
    label: economyPick.label,
    evaluate: { ...economyPick.evaluate },
  });
  objectives.push({
    id: structureTemplate.id,
    category: 'structure',
    label: structureTemplate.label.replace('{target}', String(target)),
    evaluate: { type: structureTemplate.evaluateType, min: target, start: currentLevel },
  });
  return objectives;
}

export function seasonObjectiveLiveProgress(objective, ctx = {}, club = null) {
  if (!objective?.evaluate) {
    return { score: 0, hint: '—', status: 'missed' };
  }
  const ev = objective.evaluate;

  if (ev.type === 'points_rate') {
    const played = Number(ctx.played) || 0;
    const minPlayed = ev.minPlayed || 6;
    if (played < minPlayed) {
      const score = Math.round((played / minPlayed) * 35);
      return { score, hint: `${played}/${minPlayed} jogos`, status: 'missed' };
    }
    const rate = (Number(ctx.points) || 0) / Math.max(1, played * 3);
    const score = Math.min(100, Math.round((rate / ev.min) * 100));
    return {
      score,
      hint: `${Math.round(rate * 100)}% de aproveitamento`,
      status: statusFromScore(score, { met: 100, near: 85 }),
    };
  }

  if (ev.type === 'points_min') {
    const played = Number(ctx.played) || 0;
    const points = Number(ctx.points) || 0;
    const minPlayed = ev.minPlayed || 4;
    if (played < minPlayed) {
      return { score: Math.round((points / ev.min) * 60), hint: `${points} pts`, status: 'missed' };
    }
    const score = Math.min(100, Math.round((points / ev.min) * 100));
    return { score, hint: `${points} pts`, status: statusFromScore(score) };
  }

  if (ev.type === 'goal_diff_min') {
    const gd = Number(ctx.goalDiff) || 0;
    const score =
      gd >= ev.min ? 100 : gd >= 0 ? 55 + gd * 15 : Math.max(8, 45 + gd * 8);
    return {
      score: Math.min(100, Math.round(score)),
      hint: `SG ${gd >= 0 ? '+' : ''}${gd}`,
      status: gd >= ev.min ? 'met' : gd >= 0 ? 'near' : 'missed',
    };
  }

  if (ev.type === 'unbeaten_streak') {
    const streak = streakFromForm(ctx.form || [], result => result !== 'L');
    const score = Math.min(100, Math.round((streak / ev.min) * 100));
    return {
      score,
      hint: `${streak} invicto`,
      status: statusFromScore(score, { met: 100, near: 75 }),
    };
  }

  if (ev.type === 'win_streak') {
    const streak = streakFromForm(ctx.form || [], result => result === 'W');
    const score = Math.min(100, Math.round((streak / ev.min) * 100));
    return {
      score,
      hint: `${streak} vitória(s) seguidas`,
      status: statusFromScore(score, { met: 100, near: 66 }),
    };
  }

  if (ev.type === 'position_max') {
    const played = Number(ctx.played) || 0;
    const position = Number(ctx.position);
    const minPlayed = ev.minPlayed || 8;
    if (!Number.isFinite(position) || played < minPlayed) {
      return {
        score: Math.round((played / minPlayed) * 30),
        hint: played ? `${position || '—'}º` : 'Aguardando jogos',
        status: 'missed',
      };
    }
    const score =
      position <= ev.max ? 100 : position <= ev.max + 2 ? 72 : Math.max(12, 100 - (position - ev.max) * 12);
    return {
      score: Math.min(100, Math.round(score)),
      hint: `${position}º lugar`,
      status: position <= ev.max ? 'met' : position <= ev.max + 2 ? 'near' : 'missed',
    };
  }

  if (ev.type === 'cup_min_phase') {
    const phase = Number(ctx.cupPhaseIndex) || 0;
    const score = phase >= ev.min ? 100 : Math.round((phase / ev.min) * 100);
    return {
      score: Math.min(100, score),
      hint: ctx.cupPhaseLabel || (phase ? `Fase ${phase}` : 'Copa do Brasil'),
      status: statusFromScore(score, { met: 100, near: 70 }),
    };
  }

  if (ev.type === 'balance_min') {
    const balance = Number(ctx.balance);
    const min = Number(ev.min) || 0;
    if (min <= 0) {
      const score = balance >= 0 ? 100 : Math.max(0, 100 + Math.round(balance / 50_000));
      return {
        score,
        hint: balance >= 0 ? 'Caixa positivo' : 'Saldo negativo',
        status: balance >= 0 ? 'met' : balance > -200_000 ? 'near' : 'missed',
      };
    }
    const score = Math.min(100, Math.round((balance / min) * 100));
    return {
      score,
      hint: balance >= min ? 'Meta atingida' : 'Acumulando reserva',
      status: statusFromScore(score),
    };
  }

  if (ev.type === 'finances_min') {
    const finances = Number(club?.finances ?? ctx.finances) || 50;
    const score = Math.min(100, Math.round((finances / ev.min) * 100));
    return {
      score,
      hint: `${Math.round(finances)}% saúde`,
      status: finances >= ev.min ? 'met' : finances >= ev.min - 8 ? 'near' : 'missed',
    };
  }

  if (ev.type === 'runway_min') {
    const runway = Number(ctx.runway);
    if (!Number.isFinite(runway)) {
      return { score: 20, hint: 'Calculando reserva', status: 'missed' };
    }
    const score = Math.min(100, Math.round((runway / ev.min) * 100));
    return {
      score,
      hint: `${runway.toFixed(1).replace('.', ',')} rodadas`,
      status: runway >= ev.min ? 'met' : runway >= ev.min - 1 ? 'near' : 'missed',
    };
  }

  const levelReaders = {
    medical_level: () => Math.max(0, Math.min(5, Number(club?.medicalInvestment) || 0)),
    prevention_level: () => Math.max(0, Math.min(3, Number(club?.preventionProgram) || 0)),
    structure_level: () => getStructureLevel(club),
    pitch_level: () => getPitchLevel(club),
    capacity_level: () => Math.max(0, Math.min(5, Number(club?.stadiumCapacityLevel) || 0)),
  };
  const readLevel = levelReaders[ev.type];
  if (readLevel) {
    const current = readLevel();
    const start = Number(ev.start) || 0;
    const target = Number(ev.min) || current + 1;
    const span = Math.max(1, target - start);
    const score = Math.min(100, Math.round(((current - start) / span) * 100));
    return {
      score: Math.max(0, score),
      hint: `Nível ${current}/${target}`,
      status: current >= target ? 'met' : current > start ? 'near' : 'missed',
    };
  }

  return { score: 0, hint: '—', status: 'missed' };
}

const OBJECTIVE_BOARD_DELTA = { met: 1, near: 0, missed: -1 };

const OBJECTIVE_STATUS_MARK = { met: '✓', near: '◐', missed: '✗' };

const OBJECTIVES_FEELING = {
  excellent: 'Diretoria elogia o cumprimento das metas complementares.',
  good: 'Metas complementares em linha com o plano da diretoria.',
  mixed: 'Resultado misto nas metas complementares — alguns pontos ficaram pendentes.',
  poor: 'A diretoria aponta falhas nas metas complementares da temporada.',
  bad: 'Frustração da diretoria: metas complementares não foram cumpridas.',
};

/** Avaliação final de uma meta complementar (fim de temporada). */
export function evaluateSeasonObjective(objective, ctx = {}, club = null) {
  const progress = seasonObjectiveLiveProgress(objective, ctx, club);
  const status = progress.status || 'missed';
  return {
    id: objective.id,
    category: objective.category,
    label: objective.label,
    status,
    hint: progress.hint,
    score: progress.score,
    boardDelta: OBJECTIVE_BOARD_DELTA[status] ?? 0,
  };
}

/** Pacote de metas complementares: +1 cumprida · 0 perto · −1 falha · teto ±3 na diretoria. */
export function evaluateSeasonObjectives(objectives = [], ctx = {}, club = null) {
  if (!Array.isArray(objectives) || !objectives.length) return null;
  const items = objectives.map(objective => evaluateSeasonObjective(objective, ctx, club));
  const rawBoardDelta = items.reduce((sum, item) => sum + (item.boardDelta || 0), 0);
  const boardDelta = Math.max(-3, Math.min(3, rawBoardDelta));
  const metCount = items.filter(item => item.status === 'met').length;
  const nearCount = items.filter(item => item.status === 'near').length;
  const missedCount = items.filter(item => item.status === 'missed').length;
  let feelingKey = 'mixed';
  if (metCount === items.length) feelingKey = 'excellent';
  else if (metCount >= items.length - 1 && missedCount === 0) feelingKey = 'good';
  else if (missedCount === items.length) feelingKey = 'bad';
  else if (missedCount >= 2) feelingKey = 'poor';
  const feeling = OBJECTIVES_FEELING[feelingKey];
  const lines = items.map(
    item => `${OBJECTIVE_STATUS_MARK[item.status] || '•'} ${item.label}`,
  );
  const body = `${feeling}\n\n${lines.join('\n')}`;
  return {
    items,
    metCount,
    nearCount,
    missedCount,
    boardDelta,
    rawBoardDelta,
    feeling,
    body,
    season: ctx.season ?? null,
  };
}

export function createSeasonObjectivesEngine() {
  return {
    pickSeasonObjectives,
    seasonObjectiveLiveProgress,
    evaluateSeasonObjective,
    evaluateSeasonObjectives,
    OBJECTIVE_CATEGORY_LABELS,
  };
}
