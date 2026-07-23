import { resolveNationalTeam } from './national-teams.js';
import { ensurePlayerId } from './player-identity.js';
import { enrichNationalTeamPlayer } from './national-team-player.js';
import { getNationalTeamTactics } from './world-cup/national-team-tactics.js';

/** Elenco virtual de seleção — mesmo contrato mínimo de `clubs[name]`. */
export function buildNationalTeamClub(meta, teamData, { teamPower, random } = {}) {
  if (!meta?.name) return null;
  const tactics = getNationalTeamTactics(meta.code);
  const roster = (teamData?.players || []).map((player, index) =>
    ensurePlayerId(
      enrichNationalTeamPlayer(
        {
          ...player,
          overall: Number(player.ovr) || Number(player.overall) || 80,
          pos: player.pos,
          name: player.name,
          fatigue: 100,
          nationalTeamOnly: true,
        },
        meta,
        { random },
      ),
      { club: meta.name, index },
    ),
  );
  const power = Math.round(Number(teamPower) || Number(teamData?.teamPower) || 85);
  return {
    name: meta.name,
    code: meta.code,
    division: 'NT',
    formation: tactics.formation,
    style: tactics.style,
    mentality: tactics.mentality,
    roster,
    position: meta.fifaRank,
    power,
    managerName: 'Seleção',
    environment: 80,
    support: 72,
    board: 68,
    finances: 70,
    isNationalTeam: true,
  };
}

export function resolveWorldCupOpponentName(game, userNationalTeamName) {
  if (!game || !userNationalTeamName) return null;
  if (game.home === userNationalTeamName) return game.away;
  if (game.away === userNationalTeamName) return game.home;
  return null;
}

export function isUserNationalTeamSide(teamName, userNationalTeamName) {
  return !!(userNationalTeamName && teamName === userNationalTeamName);
}

export function findPlayerInNationalTeamClubs(playerId, clubsByName, resolveId) {
  if (!playerId || !clubsByName) return null;
  for (const [clubName, club] of Object.entries(clubsByName)) {
    const player = club?.roster?.find(row => resolveId(row) === playerId);
    if (player) return { player, clubName };
  }
  return null;
}

export function resolveNationalTeamClubName(name, clubsByName) {
  const meta = resolveNationalTeam(name);
  if (!meta) return null;
  return clubsByName?.[meta.name] ? meta.name : null;
}
