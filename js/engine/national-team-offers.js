import { isWorldCupSeasonActive } from './season-calendar-mold.js';
import { NATIONAL_TEAMS, nationalTeamByCode } from './national-teams.js';

/** Maio (0-indexed) — convites antes da fase de grupos. */
export const NATIONAL_TEAM_OFFER_MONTH = 4;

export const WORLD_CUP_2026_YEAR = 2026;

const hashPick = (seed, salt, size) => {
  const x = Math.sin((Number(seed) || 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return Math.floor((x - Math.floor(x)) * Math.max(1, size));
};

/** Pool de seleções elegíveis ao convite (CMU 2026). */
export function nationalTeamOfferPool({ year = WORLD_CUP_2026_YEAR, userDivision = 'D' } = {}) {
  const all = Object.values(NATIONAL_TEAMS);
  if (Number(year) !== WORLD_CUP_2026_YEAR) return all;

  const division = String(userDivision || 'D').trim().toUpperCase();
  if (division === 'A') return all.filter(team => team.block === 1);
  if (division === 'B') return all.filter(team => team.block === 2);
  return all;
}

export function shouldSendNationalTeamOffers({
  year,
  careerDate,
  userNationalTeamCode = null,
  offersSentYear = null,
} = {}) {
  if (!isWorldCupSeasonActive(year)) return false;
  if (userNationalTeamCode) return false;
  if (Number(offersSentYear) === Number(year)) return false;
  const d = careerDate instanceof Date ? careerDate : new Date(careerDate);
  if (Number.isNaN(d.getTime()) || d.getFullYear() !== Number(year)) return false;
  return d.getMonth() >= NATIONAL_TEAM_OFFER_MONTH;
}

export function generateNationalTeamOffers({
  year = WORLD_CUP_2026_YEAR,
  userDivision = 'D',
  seed = 1,
  count = 3,
} = {}) {
  const pool = nationalTeamOfferPool({ year, userDivision });
  const shuffled = [...pool].sort(
    (a, b) => hashPick(seed, a.fifaRank, 997) - hashPick(seed, b.fifaRank, 997),
  );
  const picked = [];
  const seen = new Set();
  for (const team of shuffled) {
    if (picked.length >= count) break;
    if (!team?.code || seen.has(team.code)) continue;
    seen.add(team.code);
    picked.push({
      id: `nt-${team.code}-${seed}`,
      code: team.code,
      name: team.name,
      fifaRank: team.fifaRank,
      contractLabel: `Copa do Mundo ${year}`,
    });
  }
  return picked;
}

export function formatNationalTeamOfferLetter(offer, year = WORLD_CUP_2026_YEAR) {
  if (!offer) return '';
  return `${offer.name} busca um técnico para a Copa do Mundo ${year}.\n\nRanking FIFA: ${offer.fifaRank}º\nCompromisso: fase de grupos e mata-mata (paralelo ao seu clube).\n\nAceite para comandar a seleção nos jogos oficiais da CMU.`;
}

export function resolveNationalTeamName(code) {
  return nationalTeamByCode(code)?.name || null;
}
