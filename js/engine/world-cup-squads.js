/**
 * Carrega elencos CM26 (JSON estático).
 * Política: elenco congelado — mesmas 48 seleções em 2026, 2030, 2034…
 * Força e sorteio de grupos vêm de world-cup-history.js (ranking final anterior).
 */

import { WORLD_CUP_SQUADS_ASSET, WORLD_CUP_SQUADS_SOURCE_EDITION } from './world-cup-history.js';

export { WORLD_CUP_SQUADS_ASSET, WORLD_CUP_SQUADS_SOURCE_EDITION };

let cache = null;

export async function loadWorldCupSquads() {
  if (cache) return cache;
  const res = await fetch(WORLD_CUP_SQUADS_ASSET);
  if (!res.ok) throw new Error(`world-cup squads HTTP ${res.status}`);
  cache = await res.json();
  return cache;
}

export function getWorldCupTeam(data, code) {
  const key = String(code || '').trim().toUpperCase();
  return data?.teams?.[key] || null;
}

export function listWorldCupTeams(data) {
  return Object.values(data?.teams || {});
}

/**
 * Aplica força da edição (ranking anterior) sobre elenco congelado.
 * OVR dos jogadores no JSON permanece; teamPower guia simulação IA.
 */
export function applyEditionStrengthToSquads(squads, teamStrengthMap) {
  if (!squads?.teams || !teamStrengthMap) return squads;
  const teams = {};
  for (const [code, team] of Object.entries(squads.teams)) {
    const strength = teamStrengthMap[code];
    teams[code] = {
      ...team,
      seedRank: strength?.seedRank ?? team.fifaRank,
      block: strength?.block ?? team.block,
      teamPower: strength?.teamPower ?? team.teamPower,
    };
  }
  return { ...squads, teams, squadsFrozen: true, squadsSourceEdition: WORLD_CUP_SQUADS_SOURCE_EDITION };
}
