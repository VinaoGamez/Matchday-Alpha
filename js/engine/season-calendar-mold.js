/**
 * Molde anual inspirado no [Calendário CBF 2026 — Masculino Profissional](https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/Calendario_do_Futebol_do_Brasil_2026_Masculino_Profissional_51fb742efc.pdf).
 *
 * Não replica 100% as datas — define códigos, janelas, slots semanais e bloqueios
 * para encaixar competições em paralelo (grade Seg–Dom × Jan–Dez).
 *
 * Novas competições: registrar em FUTURE_COMPETITION_MOLD + COMPETITION_WEEK_SLOT_MAP.
 */

import { FEATURES } from '../core/constants.js';

/** Ano-âncora da Copa do Mundo (ciclo FIFA quadrienal). */
export const WORLD_CUP_ANCHOR_YEAR = 2026;

export function isWorldCupYear(seasonYear) {
  const y = Number(seasonYear) || WORLD_CUP_ANCHOR_YEAR;
  return y >= WORLD_CUP_ANCHOR_YEAR && (y - WORLD_CUP_ANCHOR_YEAR) % 4 === 0;
}

/** Ano de copa com CMU ligada no build (FEATURES.worldCup). */
export function isWorldCupSeasonActive(seasonYear) {
  return FEATURES.worldCup === true && isWorldCupYear(seasonYear);
}

/** Janelas padrão de Data FIFA (amistosos) — bloqueiam calendário de clubes quando ativas. */
export const FIFA_FRIENDLY_WINDOWS = Object.freeze([
  Object.freeze({ id: 'fifa_march', start: [2, 20], end: [2, 28] }),
  Object.freeze({ id: 'fifa_june', start: [5, 1], end: [5, 15] }),
  Object.freeze({ id: 'fifa_september', start: [8, 1], end: [8, 10] }),
  Object.freeze({ id: 'fifa_november', start: [10, 10], end: [10, 18] }),
]);

/** Janela da Copa do Mundo (clubes parados — a cada 4 anos). */
export const WORLD_CUP_WINDOW = Object.freeze({
  id: 'world_cup',
  start: [5, 1],
  end: [6, 22],
});

/** Bloqueios globais base (FIFA, recesso, janelas). Use `getSeasonBlackouts(year)` para WC. */
export const SEASON_BLACKOUTS = Object.freeze([
  {
    id: 'fifa_march',
    code: 'FIF',
    label: 'Amistosos FIFA (mar)',
    start: [2, 20],
    end: [2, 28],
    blocksClubs: true,
    soft: true,
  },
  {
    id: 'fifa_june',
    code: 'FIF',
    label: 'Amistosos FIFA (jun)',
    start: [5, 1],
    end: [5, 15],
    blocksClubs: true,
    soft: true,
  },
  {
    id: 'fifa_september',
    code: 'FIF',
    label: 'Amistosos FIFA (set)',
    start: [8, 1],
    end: [8, 10],
    blocksClubs: true,
    soft: true,
  },
  {
    id: 'fifa_november',
    code: 'FIF',
    label: 'Amistosos FIFA (nov)',
    start: [10, 10],
    end: [10, 18],
    blocksClubs: true,
    soft: true,
  },
  {
    id: 'serie_a_inter',
    code: 'INF',
    label: 'Intertemporada Série A (20 dias)',
    start: [5, 23],
    end: [6, 11],
    divisions: ['A'],
    soft: true,
  },
  {
    id: 'serie_a_recess',
    code: 'INF',
    label: 'Recesso Série A (30 dias)',
    start: [6, 12],
    end: [7, 10],
    divisions: ['A'],
    soft: true,
  },
  {
    id: 'transfer_window_1',
    code: 'ESC',
    label: 'Janela de registros (1)',
    start: [0, 5],
    end: [2, 3],
    soft: true,
  },
  {
    id: 'transfer_window_2',
    code: 'ESC',
    label: 'Janela de registros (2)',
    start: [6, 20],
    end: [8, 11],
    soft: true,
  },
]);

/** Blackouts efetivos do ano (inclui Mundial quando aplicável). */
export function getSeasonBlackouts(seasonYear) {
  const year = Number(seasonYear) || WORLD_CUP_ANCHOR_YEAR;
  const list = [...SEASON_BLACKOUTS];
  if (isWorldCupSeasonActive(year)) {
    list.push({
      id: 'world_cup',
      code: 'CMU',
      label: 'Copa do Mundo de Seleções',
      start: [...WORLD_CUP_WINDOW.start],
      end: [...WORLD_CUP_WINDOW.end],
      blocksClubs: true,
      cadence: 'quadrennial',
      soft: true,
    });
  }
  return list;
}

/**
 * Divisões nacionais — códigos CBF (BSA/BSB/BSC/BSD) + janela + slot semanal.
 */
export const LEAGUE_DIVISION_MOLD = Object.freeze({
  A: Object.freeze({
    code: 'BSA',
    competitionId: 'league_a',
    label: 'Brasileiro Série A',
    start: [0, 28],
    end: [11, 6],
    matchCount: 38,
    weekSlot: 'weekend',
    priority: 2,
    enabled: true,
  }),
  B: Object.freeze({
    code: 'BSB',
    competitionId: 'league_b',
    label: 'Brasileiro Série B',
    start: [1, 14],
    end: [9, 28],
    matchCount: 38,
    weekSlot: 'weekend_b',
    priority: 2,
    enabled: true,
  }),
  C: Object.freeze({
    code: 'BSC',
    competitionId: 'league_c',
    label: 'Brasileiro Série C',
    start: [3, 5],
    end: [9, 25],
    matchCount: null,
    weekSlot: 'weekend_b',
    priority: 2,
    enabled: true,
  }),
  D: Object.freeze({
    code: 'BSD',
    competitionId: 'league_d',
    label: 'Brasileiro Série D',
    start: [3, 5],
    end: [8, 13],
    matchCount: 10,
    weekSlot: 'weekend_b',
    priority: 2,
    enabled: true,
  }),
});

/**
 * Slots futuros — programados, sem materialização in-game ainda (`enabled: false`).
 * Ordem sugerida na temporada: estadual → recopas → nacional/copa → CONMEBOL → FIFA.
 */
export const FUTURE_COMPETITION_MOLD = Object.freeze({
  /** Campeonatos Estaduais (CBF: 11/jan – 8/mar, ~11 datas). */
  state_league: Object.freeze({
    code: 'EST',
    competitionId: 'state_league',
    label: 'Campeonatos Estaduais',
    category: 'domestic',
    start: [0, 11],
    end: [2, 8],
    matchCount: 11,
    weekSlot: 'weekend_b',
    priority: 1,
    enabled: false,
  }),
  /** Recopa Nacional — campeão Brasileiro × campeão Copa do Brasil (jogo único). */
  recopa_national: Object.freeze({
    code: 'SCB',
    competitionId: 'recopa_national',
    label: 'Recopa Nacional (Brasileiro × Copa do Brasil)',
    category: 'domestic_supercup',
    start: [0, 25],
    end: [1, 15],
    matchCount: 1,
    weekSlot: 'knockout_ida',
    idaSlot: 'knockout_ida',
    twoLegged: false,
    priority: 2,
    enabled: false,
  }),
  /** CONMEBOL Libertadores (CBF: fev – nov). */
  libertadores: Object.freeze({
    code: 'LIB',
    competitionId: 'libertadores',
    label: 'Copa Libertadores',
    category: 'continental',
    start: [1, 1],
    end: [10, 30],
    matchCount: 14,
    weekSlot: 'midweek_alt',
    idaSlot: 'midweek_alt',
    voltaSlot: 'midweek_alt',
    twoLegged: true,
    priority: 3,
    enabled: false,
    skipsWhen: ['world_cup'], // clubes liberados em anos de copa — ajustável
  }),
  /** CONMEBOL Sudamericana (CBF: fev – out). */
  sudamericana: Object.freeze({
    code: 'CSU',
    competitionId: 'sudamericana',
    label: 'Copa Sul-Americana',
    category: 'continental',
    start: [1, 1],
    end: [10, 15],
    matchCount: 14,
    weekSlot: 'midweek_alt',
    idaSlot: 'midweek_alt',
    voltaSlot: 'midweek_alt',
    twoLegged: true,
    priority: 3,
    enabled: false,
  }),
  /** Recopa Sul-Americana — campeão Libertadores × campeão Sul-Americana. */
  recopa_sudamericana: Object.freeze({
    code: 'REC',
    competitionId: 'recopa_sudamericana',
    label: 'Recopa Sul-Americana (Libertadores × Sul-Americana)',
    category: 'continental_supercup',
    start: [1, 1],
    end: [2, 28],
    matchCount: 2,
    weekSlot: 'midweek_alt',
    idaSlot: 'midweek_alt',
    voltaSlot: 'midweek_alt',
    twoLegged: true,
    priority: 3,
    enabled: false,
  }),
  /** Copas regionais (Nordeste, Verde, etc.) — reserva de slot. */
  regional_cup: Object.freeze({
    code: 'REG',
    competitionId: 'regional_cup',
    label: 'Copas Regionais',
    category: 'domestic',
    start: [2, 1],
    end: [4, 31],
    matchCount: 10,
    weekSlot: 'midweek',
    priority: 1,
    enabled: false,
  }),
  /** Amistosos de seleção — reserva calendário (não gera jogos de clube). */
  fifa_friendlies: Object.freeze({
    code: 'FIF',
    competitionId: 'fifa_friendlies',
    label: 'Amistosos de Seleção (Datas FIFA)',
    category: 'international_break',
    windows: FIFA_FRIENDLY_WINDOWS,
    matchCount: 0,
    weekSlot: null,
    blocksClubCalendar: true,
    priority: 0,
    enabled: false,
  }),
  /** Copa do Mundo — a cada 4 anos; bloqueia clubes em jun/jul. */
  world_cup: Object.freeze({
    code: 'CMU',
    competitionId: 'world_cup',
    label: 'Copa do Mundo de Seleções',
    category: 'international_tournament',
    cadence: 'quadrennial',
    anchorYear: WORLD_CUP_ANCHOR_YEAR,
    start: [...WORLD_CUP_WINDOW.start],
    end: [...WORLD_CUP_WINDOW.end],
    matchCount: 0,
    weekSlot: null,
    blocksClubCalendar: true,
    priority: 0,
    enabled: false,
  }),
});

/** Faixas da Copa do Brasil — calibradas vs CBF 2026. */
export const CUP_CALENDAR_BANDS = Object.freeze({
  early: Object.freeze({ start: [1, 17], end: [2, 18] }),
  mid: Object.freeze({ start: [3, 21], end: [4, 14] }),
  knockout_16: Object.freeze({ start: [7, 1], end: [7, 31] }),
  knockout_8: Object.freeze({ start: [7, 20], end: [8, 15] }),
  semi: Object.freeze({ start: [10, 1], end: [10, 8] }),
  final: Object.freeze({ start: [11, 6], end: [11, 6] }),
});

export const CUP_PHASE_MOLD = Object.freeze([
  Object.freeze({ index: 1, slots: 1, twoLegged: false, band: 'early', idaSlot: 'midweek' }),
  Object.freeze({ index: 2, slots: 1, twoLegged: false, band: 'early', idaSlot: 'midweek' }),
  Object.freeze({ index: 3, slots: 1, twoLegged: false, band: 'early', idaSlot: 'midweek' }),
  Object.freeze({ index: 4, slots: 1, twoLegged: false, band: 'early', idaSlot: 'midweek' }),
  Object.freeze({ index: 5, slots: 2, twoLegged: true, band: 'mid', idaSlot: 'midweek', voltaSlot: 'midweek' }),
  Object.freeze({ index: 6, slots: 2, twoLegged: true, band: 'knockout_16', idaSlot: 'knockout_ida', voltaSlot: 'midweek' }),
  Object.freeze({ index: 7, slots: 2, twoLegged: true, band: 'knockout_8', idaSlot: 'midweek', voltaSlot: 'midweek' }),
  Object.freeze({ index: 8, slots: 2, twoLegged: true, band: 'semi', idaSlot: 'knockout_ida', voltaSlot: 'knockout_ida' }),
  Object.freeze({ index: 9, slots: 1, twoLegged: false, band: 'final', idaSlot: 'knockout_ida' }),
]);

export const COMPETITION_CALENDAR_MOLD = Object.freeze({
  league: LEAGUE_DIVISION_MOLD,
  cup: Object.freeze({
    code: 'CBR',
    competitionId: 'cup',
    label: 'Copa do Brasil',
    start: [1, 17],
    end: [11, 6],
    phases: CUP_PHASE_MOLD,
    bands: CUP_CALENDAR_BANDS,
    weekSlot: 'midweek',
    enabled: true,
  }),
  serie_d_knockout: Object.freeze({
    code: 'BSD',
    competitionId: 'serie_d_knockout',
    label: 'Série D · mata-mata',
    start: [7, 15],
    end: [10, 31],
    matchCount: 12,
    weekSlot: 'midweek',
    enabled: true,
  }),
  future: FUTURE_COMPETITION_MOLD,
});

/** Lista planificada de competições futuras (para UI/engine). */
export function listFutureCompetitionMold({ seasonYear = null } = {}) {
  return Object.values(FUTURE_COMPETITION_MOLD).filter(spec => {
    if (spec.competitionId === 'world_cup' && seasonYear != null) {
      return isWorldCupSeasonActive(seasonYear);
    }
    return true;
  });
}

/** IDs de competição futura com slot semanal definido. */
export function futureCompetitionIds() {
  return Object.values(FUTURE_COMPETITION_MOLD).map(spec => spec.competitionId);
}

export function leagueWindowsFromMold(mold = LEAGUE_DIVISION_MOLD) {
  return Object.fromEntries(
    Object.entries(mold).map(([division, spec]) => [
      division,
      {
        start: [...spec.start],
        end: [...spec.end],
        priority: spec.priority ?? 2,
        matchCount: spec.matchCount ?? null,
        competitionId: spec.competitionId,
        weekSlot: spec.weekSlot,
        code: spec.code,
      },
    ]),
  );
}

export function leagueCompetitionId(division) {
  return LEAGUE_DIVISION_MOLD[division]?.competitionId || 'league';
}

export function cupPhaseLegSlot(phaseIndex, leg = 'IDA', phases = CUP_PHASE_MOLD) {
  const phase = phases.find(item => item.index === Number(phaseIndex));
  if (!phase) return 'midweek';
  if (leg === 'VOLTA' && phase.twoLegged) return phase.voltaSlot || phase.idaSlot || 'midweek';
  return phase.idaSlot || 'midweek';
}

/** Slot semanal de competição futura (ou ativa). */
export function competitionWeekSlot(competitionId) {
  const future = FUTURE_COMPETITION_MOLD[Object.keys(FUTURE_COMPETITION_MOLD)
    .find(key => FUTURE_COMPETITION_MOLD[key].competitionId === competitionId)];
  if (future?.weekSlot) return future.weekSlot;
  if (future?.idaSlot) return future.idaSlot;
  for (const spec of Object.values(LEAGUE_DIVISION_MOLD)) {
    if (spec.competitionId === competitionId) return spec.weekSlot;
  }
  if (competitionId === 'cup') return 'midweek';
  if (competitionId === 'serie_d_knockout') return 'midweek';
  return 'weekend';
}

export function describeCalendarMold(seasonYear = 2026) {
  const leagues = Object.entries(LEAGUE_DIVISION_MOLD).map(([div, spec]) => ({
    division: div,
    code: spec.code,
    slot: spec.weekSlot,
    start: spec.start,
    end: spec.end,
    enabled: spec.enabled,
  }));
  const cupPhases = CUP_PHASE_MOLD.map(phase => ({
    phase: phase.index,
    band: phase.band,
    ida: phase.idaSlot,
    volta: phase.voltaSlot || null,
  }));
  const future = listFutureCompetitionMold({ seasonYear }).map(spec => ({
    id: spec.competitionId,
    code: spec.code,
    label: spec.label,
    slot: spec.weekSlot || spec.idaSlot || null,
    enabled: spec.enabled,
    category: spec.category,
  }));
  return {
    seasonYear,
    worldCupYear: isWorldCupYear(seasonYear),
    leagues,
    cupPhases,
    future,
    blackouts: getSeasonBlackouts(seasonYear).length,
  };
}

/** Ordem de leitura das tags na grade mensal. */
export const CALENDAR_COMPETITION_TAG_ORDER = Object.freeze([
  'EST',
  'BSA',
  'BSB',
  'BSC',
  'BSD',
  'CBR',
  'SCB',
  'LIB',
  'CSU',
  'REC',
  'REG',
  'CMU',
  'FIF',
]);

const LEAGUE_CODE_BY_DIVISION = Object.freeze(
  Object.fromEntries(Object.entries(LEAGUE_DIVISION_MOLD).map(([division, spec]) => [division, spec.code])),
);

/**
 * Código CBF (BSA, CBR, …) para tag no calendário.
 * @param {object|null} game
 * @param {{ division?: string|null }} [opts]
 */
export function resolveFixtureCompetitionCode(game, { division = null } = {}) {
  if (!game) return null;
  const comp = String(game.competition || '');
  if (comp === 'COPA DO BRASIL' || comp === 'COPA') return COMPETITION_CALENDAR_MOLD.cup.code;
  if (comp === 'COPA DO MUNDO') return 'CMU';
  if (comp === 'SÉRIE D ELIMINATÓRIAS' || (game.tieId && game.knockoutRound != null)) {
    return LEAGUE_CODE_BY_DIVISION.D || 'BSD';
  }
  if (comp.startsWith('LEAGUE:')) {
    const div = comp.split(':')[1];
    return LEAGUE_CODE_BY_DIVISION[div] || null;
  }
  const div = division || game.division || null;
  if (div && LEAGUE_CODE_BY_DIVISION[div]) return LEAGUE_CODE_BY_DIVISION[div];
  return null;
}

export function sortCalendarCompetitionCodes(codes) {
  const order = CALENDAR_COMPETITION_TAG_ORDER;
  return [...codes].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
  });
}

const CALENDAR_COMPETITION_LABEL_BY_CODE = (() => {
  const map = new Map();
  Object.values(LEAGUE_DIVISION_MOLD).forEach(spec => map.set(spec.code, spec.label));
  map.set(COMPETITION_CALENDAR_MOLD.cup.code, COMPETITION_CALENDAR_MOLD.cup.label);
  Object.values(FUTURE_COMPETITION_MOLD).forEach(spec => map.set(spec.code, spec.label));
  map.set('CMU', 'Copa do Mundo');
  map.set('FIF', 'Datas FIFA');
  return map;
})();

/** Nome legível do campeonato a partir do código da tag (BSA, CBR, …). */
export function calendarCompetitionLabel(code) {
  return CALENDAR_COMPETITION_LABEL_BY_CODE.get(code) || code || '';
}
