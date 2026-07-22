import { FORMATION_PERFORMANCE, COMPATIBLE_ROLES, roundTactic } from './match-core.js';

/** Sliders padrão do usuário quando a feature de táticas ainda não carregou. */
export const DEFAULT_USER_TACTICS = { mentality: 50, possession: 50, press: 50, offsideLine: 50 };

const OPPONENT_FALLBACK = { overall: 75, attack: 76, passing: 74, defense: 75, keeper: 76 };

/** Template de estatísticas vazias — partida ao vivo e replays. */
export const blankMatchStats = () => ({
  possession: 50,
  momentum: 0,
  passes: 0,
  accurate: 0,
  shots: 0,
  off: 0,
  on: 0,
  saved: 0,
  penalties: 0,
  corners: 0,
  offsides: 0,
  keeperSaves: 0,
  tackles: 0,
  fouls: 0,
  yellow: 0,
  red: 0,
  xg: 0,
  attacks: 0,
  goodAttacks: 0,
});

/**
 * Ratings táticos ao vivo — profile, seleção de ator e média efetiva.
 * Sem DOM; estado mutável via getters do engine legado.
 */
export function createMatchRatingsEngine(deps) {
  const {
    clamp,
    matchPlayerStat,
    clubInstitutionalContext,
    playerUnavailable,
    formationPerformance = FORMATION_PERFORMANCE,
    compatibleRoles = COMPATIBLE_ROLES,
    getTactics,
    getFormation,
    getStarters,
    getClubs,
    getUserClub,
    getMatchClub,
    getNextUserGame,
    getMatchFactors,
    getCards,
    getStats,
    getHomeScore,
    getAwayScore,
    getPositionAssignments,
    getTacticFor,
  } = deps;

  const positionMismatch = (player, role) =>
    player.pos === role ? 0 : (compatibleRoles[role] || []).includes(player.pos) ? 0.45 : 1.35;

  const positionalPenalty = () =>
    getStarters().reduce(
      (total, player, index) =>
        total +
        (getCards()?.home?.[index]?.red
          ? 0
          : positionMismatch(player, getPositionAssignments()[index])),
      0,
    );

  const buildTacticalRatings = (
    tv,
    clubFormation,
    roster,
    institution,
    isHome,
    factor,
    { improvisation = 0, tacticalRatingExtra = 0 } = {},
  ) => {
    const avg = key => roster.reduce((sum, p) => sum + matchPlayerStat(p, key), 0) / roster.length;
    const mentalShift = (tv.mentality - 50) / 50;
    const possessionShift = (tv.possession - 50) / 50;
    const pressShift = tv.press / 100;
    const lineShift = (tv.offsideLine - 50) / 50;
    const shape = formationPerformance[clubFormation] || { attack: 0, passing: 0, defense: 0 };
    const formationBonus = [shape.attack, shape.passing, shape.defense];
    const mentalBonus = [mentalShift * 9, mentalShift * 2.5, mentalShift * -5.5];
    const styleBonus = [
      2.4 - possessionShift * 2.6 + pressShift * 1.75,
      possessionShift * 6.5 + pressShift * 0.75,
      (1 - possessionShift) * 0.9 + pressShift * 3.5,
    ];
    const lineDefenseBonus = -lineShift * 2.1;
    const tiredness = (100 - avg('fatigue')) / 5;
    const homeBoost = isHome
      ? { overall: 0.65, attack: 1.1, passing: 0.35, defense: 0.45 }
      : { overall: 0, attack: 0, passing: 0, defense: 0 };
    const overallTacticBonus = mentalShift * 1.4 + possessionShift * 1 + pressShift * 0.55 - lineShift * 0.35;
    const keeper = roster.find(player => player.pos === 'GOL') || roster[0];
    return {
      overall:
        (avg('overall') -
          (100 - avg('fatigue')) * 0.1 +
          tacticalRatingExtra +
          overallTacticBonus -
          improvisation * 0.7 +
          institution.overall +
          homeBoost.overall) *
        factor,
      attack:
        (avg('finishing') * 0.48 +
          avg('speed') * 0.17 +
          avg('dribble') * 0.12 +
          avg('playmaking') * 0.23 +
          formationBonus[0] +
          mentalBonus[0] +
          styleBonus[0] +
          institution.attack -
          tiredness -
          improvisation * 0.85 +
          homeBoost.attack) *
        factor,
      passing:
        (avg('passing') * 0.6 +
          avg('playmaking') * 0.4 +
          formationBonus[1] +
          mentalBonus[1] +
          styleBonus[1] +
          institution.passing -
          tiredness -
          improvisation * 1.05 +
          homeBoost.passing) *
        factor,
      defense:
        (avg('marking') * 0.52 +
          avg('tackling') * 0.48 +
          formationBonus[2] +
          mentalBonus[2] +
          styleBonus[2] +
          lineDefenseBonus +
          institution.defense -
          tiredness -
          improvisation * 0.9 +
          homeBoost.defense) *
        factor,
      keeper:
        (matchPlayerStat(keeper, 'reflexes') * 0.6 +
          matchPlayerStat(keeper, 'positioning') * 0.4 +
          institution.keeper -
          tiredness) *
        factor,
    };
  };

  const defaultTacticFor = side => {
    if (side === 'home') {
      return {
        formation: getFormation(),
        mentality: DEFAULT_USER_TACTICS.mentality,
        possession: DEFAULT_USER_TACTICS.possession,
        press: DEFAULT_USER_TACTICS.press,
        offsideLine: DEFAULT_USER_TACTICS.offsideLine,
      };
    }
    const club = getMatchClub();
    const base = roundTactic(club);
    return {
      ...base,
      mentality: club.mentality === 'Defensiva' ? 25 : club.mentality === 'Ofensiva' ? 75 : 50,
      possession: club.style === 'Posse de bola' ? 78 : club.style === 'Contra-ataque' ? 22 : 50,
      press:
        club.style === 'Pressão alta' ? 82 : club.mentality === 'Defensiva' ? 35 : 55,
    };
  };

  const tacticFor = side => getTacticFor?.(side) ?? defaultTacticFor(side);

  const profile = () => {
    const tv = getTactics()?.getTacticalValues?.() ?? DEFAULT_USER_TACTICS;
    const userClub = getUserClub();
    const nextUserGame = getNextUserGame();
    const institution = clubInstitutionalContext(getClubs()[userClub], nextUserGame?.home === userClub);
    const factor = getMatchFactors()?.home || 1;
    const formation = getFormation();
    const tacticalRating =
      (formation === '4-3-3' || formation === '4-4-2' || formation === '4-2-3-1' ? 1 : 0.35) +
      (1 - Math.abs((tv.mentality - 50) / 50) * 0.35) +
      (tv.possession > 60 ? 0.9 : tv.press > 65 ? 0.65 : 0.45);
    return buildTacticalRatings(
      tv,
      formation,
      getStarters(),
      institution,
      nextUserGame?.home === userClub,
      factor,
      { improvisation: positionalPenalty(), tacticalRatingExtra: tacticalRating },
    );
  };

  const opponentForMatch = () => {
    const club = getMatchClub();
    if (!club?.roster?.length) return { ...OPPONENT_FALLBACK };
    const roster = club.roster.slice(0, 11);
    const factor = getMatchFactors()?.away || 1;
    const nextUserGame = getNextUserGame();
    const institution = clubInstitutionalContext(club, nextUserGame?.home === club.name);
    const tv = roundTactic(club);
    const defenders = Number(club.formation[0]) || 4;
    const tacticalRating =
      (defenders === 4 ? 1 : 0.35) +
      (club.mentality === 'Equilibrada' ? 1 : 0) +
      (club.style === 'Posse de bola' ? 1 : club.style === 'Pressão alta' ? 0.55 : 0.35);
    return buildTacticalRatings(tv, club.formation, roster, institution, nextUserGame?.home === club.name, factor, {
      tacticalRatingExtra: tacticalRating,
    });
  };

  const actorData = (side, name) => {
    const roster = side === 'home' ? getStarters() : getMatchClub().roster;
    const player = roster.find(p => p.name === name);
    if (!player) return undefined;
    return {
      ...player,
      speed: matchPlayerStat(player, 'speed'),
      dribble: matchPlayerStat(player, 'dribble'),
      finishing: matchPlayerStat(player, 'finishing'),
      passing: matchPlayerStat(player, 'passing'),
      marking: matchPlayerStat(player, 'marking'),
      tackling: matchPlayerStat(player, 'tackling'),
      heading: matchPlayerStat(player, 'heading'),
      playmaking: matchPlayerStat(player, 'playmaking'),
      penaltyTaking: matchPlayerStat(player, 'penaltyTaking'),
      freeKick: matchPlayerStat(player, 'freeKick'),
      reflexes: matchPlayerStat(player, 'reflexes'),
      positioning: matchPlayerStat(player, 'positioning'),
      penaltySaving: matchPlayerStat(player, 'penaltySaving'),
    };
  };

  const actionWeight = (player, action) =>
    action === 'pass'
      ? matchPlayerStat(player, 'passing') + matchPlayerStat(player, 'playmaking')
      : action === 'shot'
        ? matchPlayerStat(player, 'finishing') +
          matchPlayerStat(player, 'dribble') * 0.25 +
          matchPlayerStat(player, 'speed') * 0.12
        : action === 'tackle' || action === 'foul'
          ? matchPlayerStat(player, 'marking') + matchPlayerStat(player, 'tackling')
          : matchPlayerStat(player, 'reflexes') + matchPlayerStat(player, 'positioning');

  const activeYellows = side => getCards()?.[side]?.filter(card => card.yellow && !card.red).length || 0;

  const cautionPenalty = side => activeYellows(side) * 0.72;

  const playerFor = (side, action, context = {}) => {
    const squadForSide = side === 'home' ? getStarters() : getMatchClub().roster.slice(0, 11);
    const cards = getCards();
    const positionAssignments = getPositionAssignments();
    const defensiveAction = action === 'tackle' || action === 'foul';
    const options = squadForSide.filter(
      (p, i) =>
        !playerUnavailable(p) &&
        !cards?.[side]?.[i]?.red &&
        !cards?.[side]?.[i]?.injured &&
        (action === 'save'
          ? p.pos === 'GOL'
          : defensiveAction
            ? ['ZAG', 'LAT', 'VOL', 'MC'].includes(p.pos)
            : action === 'shot'
              ? ['PE', 'PD', 'ATA', 'MC'].includes(p.pos)
              : p.pos !== 'GOL'),
    );
    const available = squadForSide.filter(
      (player, index) =>
        !playerUnavailable(player) && !cards?.[side]?.[index]?.red && !cards?.[side]?.[index]?.injured,
    );
    const list = options.length ? options : available.length ? available : squadForSide;
    const safeDefenders = list.filter(player => !cards?.[side]?.[squadForSide.indexOf(player)]?.yellow).length;
    const weightFor = player => {
      const slot = squadForSide.indexOf(player);
      const card = cards?.[side]?.[slot];
      const positionalFactor =
        side === 'home' ? clamp(1 - positionMismatch(player, positionAssignments[slot]) * 0.12, 0.75, 1) : 1;
      if (!defensiveAction || !card?.yellow) return actionWeight(player, action) * positionalFactor;
      const cautionFactor = context.lastLine
        ? 0.66
        : safeDefenders
          ? action === 'foul'
            ? 0.12
            : 0.32
          : 0.78;
      return actionWeight(player, action) * cautionFactor * positionalFactor;
    };
    const total = list.reduce((sum, p) => sum + weightFor(p), 0);
    let draw = Math.random() * total;
    return list.find(p => (draw -= weightFor(p)) <= 0)?.name || list[0].name;
  };

  const tacticalDiscipline = side => {
    const tactic = tacticFor(side);
    const defenders = Number(tactic.formation[0]) || 4;
    const club = side === 'home' ? getClubs()[getUserClub()] : getMatchClub();
    const nextUserGame = getNextUserGame();
    const institution = clubInstitutionalContext(club, nextUserGame?.home === club.name);
    const home = getHomeScore();
    const away = getAwayScore();
    const scoreDiff = side === 'home' ? home - away : away - home;
    const defensiveMind = clamp((50 - tactic.mentality) / 50, 0, 1);
    const counterBias = clamp((50 - tactic.possession) / 50, 0, 1);
    const pressure = tactic.press / 100;
    return (
      (defenders - 3) * 0.035 +
      defensiveMind * 0.09 +
      pressure * 0.14 +
      counterBias * 0.045 +
      (scoreDiff < 0 ? 0.055 : 0) -
      activeYellows(side) * 0.016 +
      institution.discipline
    );
  };

  const liveOverall = (side, power) => {
    const roster = side === 'home' ? getStarters() : getMatchClub().roster.slice(0, 11);
    const fatigue = roster.reduce((sum, p) => sum + p.fatigue, 0) / roster.length;
    const stats = getStats();
    const cards = getCards();
    const home = getHomeScore();
    const away = getAwayScore();
    const own = stats?.[side];
    const rival = stats?.[side === 'home' ? 'away' : 'home'];
    const reds = cards?.[side]?.filter(card => card.red).length || 0;
    const momentum = own ? clamp(own.momentum, -16, 16) * 0.11 : 0;
    const passForm = own?.passes ? (own.accurate / own.passes - 0.72) * 5 : 0;
    const attackForm = own && rival ? clamp((own.goodAttacks - rival.goodAttacks) * 0.1 + (own.xg - rival.xg) * 0.24, -1.8, 1.8) : 0;
    const drawDominance =
      home === away && own && rival
        ? clamp(
            (own.goodAttacks - rival.goodAttacks) * 0.24 +
              (own.shots - rival.shots) * 0.1 +
              (own.xg - rival.xg) * 0.5,
            -3.2,
            3.2,
          )
        : 0;
    return clamp(
      power.overall - (100 - fatigue) * 0.055 - reds * 6.5 + momentum + passForm + attackForm + drawDominance,
      50,
      95,
    );
  };

  return {
    blankMatchStats,
    defaultTacticFor,
    profile,
    opponentForMatch,
    actorData,
    playerFor,
    tacticalDiscipline,
    liveOverall,
    cautionPenalty,
  };
}
