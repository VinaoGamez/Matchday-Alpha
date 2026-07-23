/**
 * Contexto de partida — Copa do Mundo vs clube.
 */

import { WORLD_CUP_COMPETITION } from '../world-cup-calendar.js';

export function isWorldCupUserFixture(game, userNationalTeamName) {
  return !!(
    game?.competition === WORLD_CUP_COMPETITION &&
    userNationalTeamName &&
    (game.home === userNationalTeamName || game.away === userNationalTeamName)
  );
}

/** Nome do lado humano nesta partida (seleção ou clube). */
export function resolveUserSideName(game, { userClub, userNationalTeamName }) {
  if (isWorldCupUserFixture(game, userNationalTeamName)) return userNationalTeamName;
  return userClub;
}

/** Objeto “clube” do lado humano — `clubs[]` ou elenco virtual NT. */
export function resolveUserSideClub(game, { userClub, userNationalTeamName, clubs, getNationalTeamClub }) {
  if (isWorldCupUserFixture(game, userNationalTeamName)) {
    return getNationalTeamClub?.(userNationalTeamName) || null;
  }
  return clubs?.[userClub] || null;
}

/** Resolve roster ativo para o lado humano (cópia mutável em CMU). */
export function cloneNationalTeamRoster(roster) {
  if (!Array.isArray(roster)) return [];
  return roster.map(player => ({ ...player, fatigue: player.fatigue ?? 100 }));
}
