import { resolveNationalTeam } from '../../engine/national-teams.js';
import { WORLD_CUP_COMPETITION } from '../../engine/world-cup-calendar.js';
import { isKnockoutShootoutCompetition } from '../../engine/knockout-shootout.js';

export const divisionDisplayName = division => {
  const map = { A: 'Série A', B: 'Série B', C: 'Série C', D: 'Série D' };
  return map[division] || `Série ${division || '—'}`;
};

export const serieDGroupLabel = groupIndex => (groupIndex >= 0 ? `Grupo A${groupIndex + 1}` : '');

export const joinMatchMeta = (...parts) => parts.filter(Boolean).join(' · ');

export const matchCompetitionRoundLabel = (game, userDivision, currentRound = 1, serieDGroupRounds = 10) => {
  if (!game) {
    return userDivision === 'D' ? `Rodada ${currentRound}` : `Rodada ${currentRound} de 38`;
  }
  if (game.competition === 'COPA DO BRASIL') {
    const parts = [game.phase, game.leg].filter(Boolean);
    return parts.join(' · ') || 'Copa do Brasil';
  }
  if (isKnockoutShootoutCompetition(game)) {
    const parts = [game.phase, game.leg].filter(Boolean);
    if (parts.length) return parts.join(' · ');
    return String(game.competition || '').includes('SÉRIE D') ? 'Eliminatórias' : 'Mata-mata';
  }
  const round = game.round || currentRound || 1;
  if (userDivision === 'D' && round <= serieDGroupRounds) return `Rodada ${round}`;
  return `Rodada ${round} de 38`;
};

export const isWorldCupFixture = game => game?.competition === WORLD_CUP_COMPETITION;

export const clubStandingContext = (
  clubName,
  clubs,
  serieDGroups,
  game = null,
  userDivision = 'A',
  currentRound = 1,
  serieDGroupRounds = 10,
) => {
  const club = clubs?.[clubName];
  if (!club) {
    const nt = resolveNationalTeam(clubName);
    if (nt) return `Copa do Mundo · FIFA ${nt.fifaRank}º`;
    return '';
  }
  const division = club.division || 'A';
  const base = divisionDisplayName(division);
  let label = base;
  if (division === 'D') {
    const groupIndex = (serieDGroups || []).findIndex(group => group.includes(clubName));
    const group = serieDGroupLabel(groupIndex);
    label = group ? `${base} · ${group}` : base;
  }
  if (game?.competition === 'COPA DO BRASIL' || (game && isKnockoutShootoutCompetition(game))) return label;
  const roundLabel = matchCompetitionRoundLabel(game, userDivision, currentRound, serieDGroupRounds);
  return roundLabel ? joinMatchMeta(label, roundLabel) : label;
};

export const matchCompetitionPhaseLabel = (
  game,
  userDivision,
  serieDGroups,
  { currentRound = 1, userSerieDGroupIndex = 0, serieDGroupRounds = 10 } = {},
) => {
  if (isWorldCupFixture(game)) {
    return joinMatchMeta('Copa do Mundo', game.phase || game.leg) || 'Copa do Mundo';
  }
  if (game?.competition === 'COPA DO BRASIL') {
    return joinMatchMeta(game.phase, game.leg) || 'Copa do Brasil';
  }
  if (game && isKnockoutShootoutCompetition(game)) {
    const parts = [game.phase, game.leg].filter(Boolean);
    if (parts.length) return parts.join(' · ');
    return String(game.competition || '').includes('SÉRIE D') ? 'Eliminatórias' : 'Mata-mata';
  }
  let phase = '';
  if (!game) {
    if (userDivision === 'D') {
      const group = serieDGroupLabel(userSerieDGroupIndex);
      phase = group ? `Fase de grupos · ${group}` : 'Fase de grupos';
    } else {
      phase = currentRound <= 19 ? '1º turno' : '2º turno';
    }
  } else if (userDivision === 'D' && (game.round || 0) <= serieDGroupRounds) {
    const groupIndex = (serieDGroups || []).findIndex(group => group.includes(game.home) && group.includes(game.away));
    const group = serieDGroupLabel(groupIndex >= 0 ? groupIndex : userSerieDGroupIndex);
    phase = group ? `Fase de grupos · ${group}` : 'Fase de grupos';
  } else {
    const round = game.round || currentRound || 1;
    phase = round <= 19 ? '1º turno' : '2º turno';
  }
  return joinMatchMeta(phase, matchCompetitionRoundLabel(game, userDivision, currentRound, serieDGroupRounds));
};

/** Texto do `<em>` ao lado do título (rodada/fase) — espelha o card Próxima Partida. */
export const matchCompetitionRoundEmLabel = (game, userDivision, userSerieDGroupIndex = 0) => {
  if (!game) return '';
  if (isWorldCupFixture(game)) {
    return game.phase || game.leg || 'COPA DO MUNDO';
  }
  if (game.competition === 'COPA DO BRASIL') {
    return `${game.phase || 'COPA'} · ${game.leg || ''}`.replace(/\s·\s$/, '');
  }
  if (isKnockoutShootoutCompetition(game)) {
    return `${game.leg || 'Eliminatórias'}${game.phase ? ` · ${game.phase}` : ''}`;
  }
  const groupSuffix =
    userDivision === 'D' && !isKnockoutShootoutCompetition(game) ? ` · GRUPO A${userSerieDGroupIndex + 1}` : '';
  return `RODADA ${game.round || '—'}${groupSuffix}`;
};
