/**
 * Naming do estádio — receita por rodada (patrocinador), nome do estádio do jogador.
 */
import { getBankLoan } from './bank-loan.js';
import {
  canOfferStadiumNaming,
  computeSectorBreakdown,
  getSectorStructureLevel,
  getStadiumInvestments,
} from './stadium-sectors.js';

/** Faixa base R$/rodada (estádio médio, Série A/B). */
export const NAMING_PER_ROUND_RANGE = {
  A: [15_000, 35_000],
  B: [8_000, 18_000],
};

export const NAMING_OFFER_COUNT = 3;

export function namingRightsAreValid(naming, season) {
  if (!naming || typeof naming !== 'object') return false;
  if (Number(naming.season) !== Number(season)) return false;
  return !!(naming.sponsor && Number(naming.basePerRound) > 0);
}

export function getNamingRights(club) {
  return club?.namingRights || null;
}

/** Multiplicador por crise financeira (parcial — receita/rodada). */
export function namingPenaltyMultiplier(club) {
  if (!club) return 0;
  if (club.financialRestriction?.active) return 0;
  const loan = getBankLoan(club);
  const delinq = Math.max(0, Number(loan?.delinquencyStreak) || 0);
  const od = Math.max(0, Math.round(Number(club.overdraftStreak) || 0));
  if (club.wageShortfall || delinq >= 1) return 0.25;
  if (od >= 2) return 0.4;
  if (od >= 1) return 0.7;
  return 1;
}

export function namingDivisionAllowed(division = 'A') {
  return division === 'A' || division === 'B';
}

export function estimateNamingPerRound(club, division = 'A', { random = Math.random } = {}) {
  if (!namingDivisionAllowed(division)) return 0;
  const [min, max] = NAMING_PER_ROUND_RANGE[division] || NAMING_PER_ROUND_RANGE.B;
  const { total: capacity } = computeSectorBreakdown(club, division);
  const capRef = division === 'A' ? 40_000 : 28_000;
  const capFactor = Math.max(0.55, Math.min(1.3, capacity / capRef));
  const structFactor = 0.82 + getSectorStructureLevel(club) * 0.06;
  const support = Math.max(0, Math.min(100, Number(club.support) || 60));
  const supportFactor = 0.85 + (support / 100) * 0.22;
  const roll = 0.92 + random() * 0.16;
  return Math.round((min + (max - min) * 0.45 * roll) * capFactor * structFactor * supportFactor);
}

export function excludedNamingSponsors(club) {
  const names = new Set();
  const master = club?.sponsors?.master?.name;
  if (master) names.add(master);
  for (const sec of club?.sponsors?.secondaries || []) {
    if (sec?.name) names.add(sec.name);
  }
  if (club?.namingRights?.sponsor) names.add(club.namingRights.sponsor);
  return names;
}

/** Gera ofertas de naming (nomes do pool de patrocínios). */
export function generateNamingOffers(club, division = 'A', { pool = [], random = Math.random } = {}) {
  if (!canOfferStadiumNaming(club, division) || !namingDivisionAllowed(division)) return [];
  const blocked = excludedNamingSponsors(club);
  const candidates = pool.filter(name => name && !blocked.has(name));
  const picks = [];
  const bag = [...candidates];
  while (picks.length < NAMING_OFFER_COUNT && bag.length > 0) {
    const idx = Math.floor(random() * bag.length);
    const sponsor = bag.splice(idx, 1)[0];
    const perRound = estimateNamingPerRound(club, division, { random });
    picks.push({ sponsor, perRound, division });
  }
  return picks;
}

export function assignNamingContract(club, offer, { season, division = 'A' } = {}) {
  if (!club || !offer?.sponsor) return { ok: false, error: 'invalid_offer' };
  if (!canOfferStadiumNaming(club, division)) return { ok: false, error: 'not_eligible' };
  if (!namingDivisionAllowed(division)) return { ok: false, error: 'division_locked' };
  if (excludedNamingSponsors(club).has(offer.sponsor) && offer.sponsor !== club.namingRights?.sponsor) {
    return { ok: false, error: 'sponsor_conflict' };
  }
  const base = Math.max(0, Math.round(Number(offer.perRound) || 0));
  if (!(base > 0)) return { ok: false, error: 'invalid_amount' };
  club.namingRights = {
    season: Number(season),
    division,
    sponsor: offer.sponsor,
    basePerRound: base,
    perRound: base,
    lastRound: null,
    signedAt: new Date().toISOString(),
  };
  return { ok: true, naming: club.namingRights };
}

/** Valor estimado da próxima parcela (com penalidade atual). */
export function estimateNamingRound(club, division = 'A') {
  const naming = getNamingRights(club);
  if (!naming?.sponsor || !(Number(naming.basePerRound) > 0)) return 0;
  if (!namingDivisionAllowed(division)) return 0;
  const mult = namingPenaltyMultiplier(club);
  return Math.round(Number(naming.basePerRound) * mult);
}

/**
 * Credita naming na rodada nacional. Idempotente por `round`.
 * @returns {{ ok: boolean, amount: number, skipped?: boolean, multiplier?: number }}
 */
export function creditNamingRound(club, { round = null, division = 'A', season = null } = {}) {
  const naming = getNamingRights(club);
  if (!naming?.sponsor || !(Number(naming.basePerRound) > 0)) {
    return { ok: false, amount: 0, skipped: true };
  }
  const seasonKey = season != null ? Number(season) : Number(naming.season);
  if (Number(naming.season) !== seasonKey) {
    return { ok: false, amount: 0, skipped: true, reason: 'season_mismatch' };
  }
  if (!namingDivisionAllowed(division)) {
    return { ok: true, amount: 0, skipped: true, suspended: true };
  }
  const roundKey = Number.isFinite(Number(round)) ? Number(round) : null;
  if (roundKey != null && naming.lastRound === roundKey) {
    return { ok: true, amount: 0, skipped: true };
  }
  const mult = namingPenaltyMultiplier(club);
  const amount = Math.round(Number(naming.basePerRound) * mult);
  naming.lastMultiplier = mult;
  naming.perRound = amount;
  if (roundKey != null) naming.lastRound = roundKey;
  if (!(amount > 0)) {
    return { ok: true, amount: 0, skipped: false, multiplier: mult, suspended: mult === 0 };
  }
  return {
    ok: true,
    amount,
    multiplier: mult,
    sponsor: naming.sponsor,
    round: roundKey,
    needsCredit: true,
  };
}

export function namingStatusLabel(club, division = 'A') {
  const naming = getNamingRights(club);
  if (!naming?.sponsor) {
    const inv = getStadiumInvestments(club);
    if (!namingDivisionAllowed(division)) {
      return 'Naming disponível só na Série A ou B.';
    }
    if (!canOfferStadiumNaming(club, division)) {
      return `Requisitos: estrutura Intermediária+ e 2 investimentos (atual: ${inv}).`;
    }
    return 'Elegível para contrato de naming.';
  }
  const mult = namingPenaltyMultiplier(club);
  const est = estimateNamingRound(club, division);
  if (!namingDivisionAllowed(division)) return `Naming suspenso (${naming.sponsor}) — série inferior.`;
  if (mult === 0) return `Naming suspenso (${naming.sponsor}) — crise financeira.`;
  if (mult < 1) return `Naming · ${naming.sponsor} · ~${Math.round(mult * 100)}% (${est}/rod).`;
  return `Naming · ${naming.sponsor} · ${est}/rodada.`;
}
