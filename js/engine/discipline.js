import { MODULE_VERSIONS } from '../core/constants.js';

/** Amarelos acumulados na mesma competição → 1 jogo suspenso. */
export const YELLOW_SUSPENSION_LIMIT = 3;

const DISMISSAL_LABELS = {
  'second-yellow': 'segundo amarelo na mesma partida',
  secondYellow: 'segundo amarelo na mesma partida',
  direct: 'falta grave',
  'direct-serious': 'falta grave',
  'direct-severe': 'conducta violenta ou anti-esportiva',
};

export function emptyPlayerDiscipline() {
  return { yellowByCompetition: {}, suspensions: [], redCards: 0 };
}

export function normalizePlayerDiscipline(source, { defaultLeagueKey = 'LEAGUE:A' } = {}) {
  if (!source || typeof source !== 'object') return emptyPlayerDiscipline();
  const yellowByCompetition =
    source.yellowByCompetition && typeof source.yellowByCompetition === 'object'
      ? { ...source.yellowByCompetition }
      : {};
  if (Number(source.yellowAccumulation) > 0 && !Object.keys(yellowByCompetition).length) {
    yellowByCompetition[defaultLeagueKey] = Number(source.yellowAccumulation) || 0;
  }
  let suspensions = Array.isArray(source.suspensions) ? source.suspensions.map(entry => ({ ...entry })) : [];
  if (!suspensions.length && Number(source.suspensionMatches) > 0) {
    suspensions = [
      {
        competitionKey: source.suspensionCompetition || defaultLeagueKey,
        gamesRemaining: Number(source.suspensionMatches) || 0,
        issuedRound: source.issuedRound ?? null,
        reason: source.suspensionReason || 'legacy',
      },
    ];
  }
  return {
    yellowByCompetition,
    suspensions,
    redCards: Number(source.redCards) || 0,
  };
}

/** Chave estável por competição (acúmulo separado). */
export function competitionKeyFromFixture(fixture, { isKnockoutShootout = () => false, clubs = {} } = {}) {
  if (!fixture || typeof fixture !== 'object') return 'LEAGUE:A';
  if (fixture.competition === 'COPA DO BRASIL') return 'COPA';
  if (isKnockoutShootout(fixture)) return 'SERIE_D_KO';
  const homeDiv = clubs[fixture.home]?.division;
  const awayDiv = clubs[fixture.away]?.division;
  const division = fixture.division || homeDiv || awayDiv || 'A';
  return `LEAGUE:${division}`;
}

export function competitionLabel(competitionKey) {
  if (competitionKey === 'COPA') return 'Copa do Brasil';
  if (competitionKey === 'SERIE_D_KO') return 'Série D · mata-mata';
  if (String(competitionKey).startsWith('LEAGUE:')) {
    return `Brasileirão Série ${String(competitionKey).slice(7)}`;
  }
  return String(competitionKey);
}

export function getYellowAccumulation(discipline, competitionKey) {
  const normalized = normalizePlayerDiscipline(discipline);
  return Number(normalized.yellowByCompetition[competitionKey]) || 0;
}

export function activeSuspensions(discipline, competitionKey = null) {
  const normalized = normalizePlayerDiscipline(discipline);
  return (normalized.suspensions || []).filter(entry => {
    if (!entry || Number(entry.gamesRemaining) <= 0) return false;
    if (!competitionKey) return true;
    return entry.competitionKey === competitionKey;
  });
}

export function isSuspendedForCompetition(player, competitionKey) {
  return activeSuspensions(player?.discipline, competitionKey).length > 0;
}

export function isSuspendedAnywhere(player) {
  return activeSuspensions(player?.discipline).length > 0;
}

/** Gravidade do vermelho direto → jogos de suspensão (1 leve, 2 grave, 3 violenta). */
export function directRedSuspensionGames(context = {}) {
  const threat = Number(context.threat) || 0;
  const type = String(context.type || '');
  const zone = String(context.zone || '');
  const isCounter = type.includes('contra');
  const inBox = zone.includes('área') || zone.includes('final');
  if (threat > 0.95 && isCounter && inBox) return 3;
  if (threat > 0.92 && (isCounter || inBox)) return 2;
  return 1;
}

export function dismissalKind(dismissal) {
  if (!dismissal) return null;
  if (dismissal === 'secondYellow' || dismissal === 'second-yellow') return 'second-yellow';
  if (dismissal === 'direct-severe') return 'direct-severe';
  if (dismissal === 'direct-serious') return 'direct-serious';
  return 'direct';
}

export function suspensionGamesForCard(card) {
  const kind = dismissalKind(card?.dismissal);
  if (!kind) return 0;
  if (kind === 'second-yellow') return 1;
  return directRedSuspensionGames(card?.redContext || {});
}

export function directRedDismissalType(context = {}) {
  const games = directRedSuspensionGames(context);
  if (games >= 3) return 'direct-severe';
  if (games >= 2) return 'direct-serious';
  return 'direct';
}

function addSuspension(discipline, { competitionKey, games, round, reason }) {
  if (!games) return;
  discipline.suspensions = discipline.suspensions || [];
  discipline.suspensions.push({
    competitionKey,
    gamesRemaining: games,
    issuedRound: round,
    reason,
  });
}

function suspensionReasonLabel(reason, games) {
  if (reason === 'yellow-accumulation') return `acúmulo de ${YELLOW_SUSPENSION_LIMIT} cartões amarelos`;
  if (reason === 'second-yellow') return 'segundo amarelo na mesma partida';
  if (reason === 'direct-red') return games > 1 ? `expulsão por falta grave (${games} jogos)` : 'expulsão por falta grave';
  if (reason === 'direct-red-severe') return `expulsão por conducta violenta (${games} jogos)`;
  return 'punição disciplinar';
}

/**
 * Aplica cartão ao jogador. Retorna linhas de mensagem para o clube do usuário.
 */
export function applyDisciplineCard(player, card, { competitionKey, round, isUserClub = false, opponent = null } = {}) {
  if (!player || !card || !competitionKey) return [];
  const discipline = normalizePlayerDiscipline(player.discipline);
  player.discipline = discipline;
  const matchCtx = opponent ? ` na partida contra ${opponent}` : '';
  const compLabel = competitionLabel(competitionKey);
  const lines = [];

  if (card.dismissal) {
    const games = suspensionGamesForCard(card);
    const kind = dismissalKind(card.dismissal);
    discipline.redCards += 1;
    const reason =
      kind === 'second-yellow'
        ? 'second-yellow'
        : games >= 3
          ? 'direct-red-severe'
          : 'direct-red';
    addSuspension(discipline, { competitionKey, games, round, reason });
    if (isUserClub) {
      const label = DISMISSAL_LABELS[kind] || 'falta grave';
      lines.push(
        `${player.name} recebeu cartão vermelho${matchCtx} por ${label} e cumprirá ${games} jogo${games === 1 ? '' : 's'} suspenso${games === 1 ? '' : 's'} (${compLabel}).`,
      );
    }
    return lines;
  }

  if (card.yellow) {
    const previous = getYellowAccumulation(discipline, competitionKey);
    discipline.yellowByCompetition[competitionKey] = previous + Number(card.yellow);
    const current = discipline.yellowByCompetition[competitionKey];
    if (isUserClub) {
      lines.push(`${player.name} recebeu cartão amarelo${matchCtx} (${current}/${YELLOW_SUSPENSION_LIMIT} no ${compLabel}).`);
    }
    if (current >= YELLOW_SUSPENSION_LIMIT) {
      discipline.yellowByCompetition[competitionKey] = current - YELLOW_SUSPENSION_LIMIT;
      addSuspension(discipline, {
        competitionKey,
        games: 1,
        round,
        reason: 'yellow-accumulation',
      });
      if (isUserClub) {
        lines.push(
          `${player.name} está suspenso por 1 jogo no ${compLabel} (${suspensionReasonLabel('yellow-accumulation', 1)}).`,
        );
      }
    }
  }
  return lines;
}

/** Cumpre uma rodada de suspensões para clubes que entraram em campo na competição. */
export function serveCompetitionSuspensions(clubs, clubNames, competitionKey, round) {
  if (!competitionKey || !clubNames?.size) return;
  clubNames.forEach(clubName => {
    const club = clubs[clubName];
    if (!club) return;
    club.roster.forEach(player => {
      const discipline = normalizePlayerDiscipline(player.discipline);
      player.discipline = discipline;
      discipline.suspensions = (discipline.suspensions || []).map(entry => {
        if (entry.competitionKey !== competitionKey) return entry;
        if (Number(entry.gamesRemaining) <= 0) return entry;
        if (Number(entry.issuedRound ?? -1) >= Number(round)) return entry;
        return { ...entry, gamesRemaining: Math.max(0, Number(entry.gamesRemaining) - 1) };
      });
    });
  });
}

export function disciplineBadgeCompetitionKeys(discipline, { leagueKey, includeCup = true } = {}) {
  const normalized = normalizePlayerDiscipline(discipline);
  const keys = [];
  if (leagueKey && getYellowAccumulation(normalized, leagueKey) > 0) keys.push(leagueKey);
  if (includeCup && getYellowAccumulation(normalized, 'COPA') > 0) keys.push('COPA');
  if (getYellowAccumulation(normalized, 'SERIE_D_KO') > 0) keys.push('SERIE_D_KO');
  Object.keys(normalized.yellowByCompetition || {}).forEach(key => {
    if (!keys.includes(key) && getYellowAccumulation(normalized, key) > 0) keys.push(key);
  });
  return keys;
}

export function createDisciplineEngine() {
  return {
    moduleVersion: MODULE_VERSIONS.discipline,
    YELLOW_SUSPENSION_LIMIT,
    emptyPlayerDiscipline,
    normalizePlayerDiscipline,
    competitionKeyFromFixture,
    competitionLabel,
    getYellowAccumulation,
    activeSuspensions,
    isSuspendedForCompetition,
    isSuspendedAnywhere,
    directRedSuspensionGames,
    directRedDismissalType,
    dismissalKind,
    suspensionGamesForCard,
    applyDisciplineCard,
    serveCompetitionSuspensions,
    disciplineBadgeCompetitionKeys,
  };
}
