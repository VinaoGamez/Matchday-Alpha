import { fatigueMinuteWear } from './match-tuning.js';
import { MODULE_VERSIONS } from '../core/constants.js';

/**
 * Motor de fadiga — recuperação diária, treino e desgaste ao vivo.
 * Sem DOM: apenas regras e estado dos jogadores/clubes.
 * @param {object} deps
 * @param {Function} deps.clamp
 * @param {Function} deps.getClubs
 * @param {Function} deps.getUserClub
 * @param {Function} deps.clubInstitutionalContext
 * @param {Function} deps.getTrainingRules — () => trainingRules
 * @param {Function} [deps.getMatchClub] — adversário atual (pré-jogo)
 */
export function createFatigueEngine(deps) {
  const { clamp, getClubs, getUserClub, clubInstitutionalContext, getTrainingRules, getMatchClub } = deps;

  const trainingRecoveryModifiers = {
    before: { 'Preparação tática': 1, 'Treino leve': .94, Descanso: 1.06 },
    after: { Recuperação: 1.18, 'Descanso total': 1.3, 'Análise do jogo': 1.06 },
    free: { 'Treino equilibrado': 1, 'Treino técnico': .96, 'Descanso intermitente': 1.08 },
  };
  const trainingRecoveryMultiplier = type => trainingRecoveryModifiers[type]?.[getTrainingRules()[type]] ?? 1;
  const dailyRecovery = player =>
    player.age <= 22 ? 6.5 : player.age <= 26 ? 5.5 : player.age <= 29 ? 4.5 : player.age <= 32 ? 3.5 : 2.5;

  const recoverClubRoster = (club, days = 1, mod = 1) => {
    const institution = clubInstitutionalContext(club);
    club.roster.forEach(player => {
      player.fatigue = clamp(player.fatigue + dailyRecovery(player) * days * institution.recovery * mod, 0, 100);
    });
  };
  const recoverPlayers = (days = 3, mod = 1) => Object.values(getClubs()).forEach(club => recoverClubRoster(club, days, mod));
  const recoverOtherClubs = (days = 1, mod = 1) =>
    Object.values(getClubs()).forEach(club => {
      if (club.name !== getUserClub()) recoverClubRoster(club, days, mod);
    });

  const applyTrainingDay = type => {
    const clubs = getClubs();
    const user = clubs[getUserClub()];
    const institution = clubInstitutionalContext(user);
    const mod = trainingRecoveryMultiplier(type);
    user.roster.forEach(player => {
      if (type === 'before') player.fatigue = clamp(player.fatigue + (mod - 1) * 5 - (mod < 1 ? (1 - mod) * 4 : 0), 0, 100);
      else player.fatigue = clamp(player.fatigue + dailyRecovery(player) * institution.recovery * mod, 0, 100);
    });
    recoverOtherClubs(1, 1);
  };

  const applyPreMatchTraining = () => {
    const clubs = getClubs();
    const mod = trainingRecoveryMultiplier('before');
    clubs[getUserClub()].roster.forEach(player => {
      player.fatigue = clamp(player.fatigue + (mod - 1) * 5 - (mod < 1 ? (1 - mod) * 4 : 0), 0, 100);
    });
    const opponent = getMatchClub?.();
    if (opponent) recoverClubRoster(opponent, 1, .75);
  };

  /** Fadiga pós-jogo (Copa/mata-mata simulado por CPU); disponibilidade fica a cargo do callback. */
  const applyCupFatigue = (game, result, applyMatchAvailability) => {
    const clubs = getClubs();
    [['home', game.home], ['away', game.away]].forEach(([side, clubName]) =>
      Object.entries(result.fatigueAfter?.[side] || {}).forEach(([playerName, value]) => {
        const player = clubs[clubName].roster.find(candidate => candidate.name === playerName);
        if (player) player.fatigue = clamp(value, 0, 100);
      }),
    );
    applyMatchAvailability?.(result, game);
  };

  /** Desgaste por minuto ao vivo — decide substituição/rehab ficam em callbacks (engine mantém o estado dos cartões). */
  const applyMinuteWearToLineup = ({ lineup, side, cards, liveMinutesPlayed, wear, onPlayThrough, onRehab }) => {
    lineup.forEach((player, index) => {
      player.fatigue = clamp(player.fatigue - fatigueMinuteWear(player) * wear, 0, 100);
      if (cards?.[side]?.[index] && !cards[side][index].red) {
        liveMinutesPlayed[side].set(player.name, (liveMinutesPlayed[side].get(player.name) ?? 0) + 1);
        if (cards[side][index]?.playThroughRisk) onPlayThrough?.(side, index, player);
        onRehab?.(side, index, player);
      }
    });
  };

  return {
    moduleVersion: MODULE_VERSIONS.fatigue,
    trainingRecoveryModifiers,
    trainingRecoveryMultiplier,
    dailyRecovery,
    recoverClubRoster,
    recoverPlayers,
    recoverOtherClubs,
    applyTrainingDay,
    applyPreMatchTraining,
    applyCupFatigue,
    applyMinuteWearToLineup,
  };
}
