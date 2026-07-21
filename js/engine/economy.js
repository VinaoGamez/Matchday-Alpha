import { MODULE_VERSIONS } from '../core/constants.js';
import { SPONSOR_EXTERNAL_LINKS, sponsorExternalUrlBySlug } from '../core/sponsor-links.js';
import {
  OVERDRAFT_PREMIUM_BASE,
  OVERDRAFT_PREMIUM_WITH_LOAN,
  OVERDRAFT_TO_LOAN_ABSORB_RATIO,
  overdraftStreakMultiplier,
  resolveOverdraftRate,
  getBankLoan,
} from './bank-loan.js';
import {
  STADIUM_SECTOR_MODEL,
  STADIUM_SECTOR_DEFS,
  STRUCTURE_UPGRADE,
  PITCH_SECTOR_UPGRADE,
  ensureStadiumSectors,
  getSectorLevel,
  effectiveSectorMax,
  divisionAllowsSector,
  structureLevelLabel,
  computeSectorBreakdown,
  stadiumInvestmentCost,
  estimateStadiumOpsFromSectors,
  estimateGateReceiptSectors,
  getStadiumInvestments,
  canOfferStadiumNaming,
  sectorSeats,
} from './stadium-sectors.js';
import {
  generateNamingOffers,
  assignNamingContract,
  creditNamingRound,
  estimateNamingRound,
  getNamingRights,
  namingStatusLabel,
  namingPenaltyMultiplier,
  NAMING_OFFER_COUNT,
} from './stadium-naming.js';

/** Orçamento inicial por divisão (R$ fictícios). Calibrado v5. */
export const INITIAL_BUDGET_BY_DIVISION = {
  A: 9_500_000,
  B: 6_200_000,
  C: 4_200_000,
  D: 2_700_000,
};

/** Capacidade inicial e teto por divisão. */
export const STADIUM_CAPACITY_BY_DIVISION = {
  A: { base: 42_000, max: 75_000, step: 8_000 },
  B: { base: 28_000, max: 55_000, step: 6_000 },
  C: { base: 18_000, max: 40_000, step: 5_000 },
  D: { base: 12_000, max: 28_000, step: 4_000 },
};

/** Faixas de preço de ingresso (R$). Calibrado v3 — bilheteria não pode dominar o caixa. */
export const TICKET_PRICE_RANGE = {
  national: { min: 15, max: 90, step: 5, default: 22 },
  cups: { min: 22, max: 140, step: 5, default: 36 },
};

/**
 * Escala final da bilheteria (após público × preço).
 * v4: aperta ops para cobertura baseline ~0,95–1,10× (A ~1,00–1,05×).
 */
export const GATE_REVENUE_SCALE = 0.28;

/**
 * Premiação de fim de temporada — calibrada vs INITIAL_BUDGET:
 * campanha boa (G8) ≈ 25–40% do caixa inicial; título/Copa como pico sem inflar o multi-ano.
 * (Ops de rodada já geram superávit — prêmio de meio de tabela não pode empilhar demais.)
 */
export const PARTICIPATION_PRIZE = { A: 1_500_000, B: 1_100_000, C: 700_000, D: 500_000 };
/** Pool de classificação para A/B/C (liga corrida). Série D usa SERIE_D_PHASE_*. */
export const POSITION_POOL = { A: 5_500_000, B: 3_700_000, C: 2_300_000, D: 1_600_000 };
export const TITLE_BONUS = { A: 7_000_000, B: 5_000_000, C: 3_000_000, D: 2_000_000 };
export const PROMOTION_BONUS = 1_200_000;

/** Premiação Série D por fase mais avançada (% do POSITION_POOL.D). */
export const SERIE_D_PHASE_POOL = POSITION_POOL.D;
export const SERIE_D_PHASE_SHARE = {
  group: { pct: 0.15, label: 'Série D · Fase de grupos' },
  second: { pct: 0.28, label: 'Série D · 2ª fase eliminatória' },
  third: { pct: 0.4, label: 'Série D · 3ª fase eliminatória' },
  round16: { pct: 0.52, label: 'Série D · Oitavas de final' },
  quarter: { pct: 0.65, label: 'Série D · Quartas de final' },
  semi: { pct: 0.8, label: 'Série D · Semifinal' },
  playoff: { pct: 0.8, label: 'Série D · Playoff de acesso' },
  final: { pct: 0.92, label: 'Série D · Finalista' },
  champion: { pct: 1, label: 'Série D · Campeão (campanha)' },
};

/** Premiação Copa do Brasil por fase mais avançada (% do pool). */
export const CUP_PHASE_POOL = 3_600_000;
export const CUP_PHASE_SHARE = {
  1: { pct: 0.06, label: 'Copa do Brasil · 1ª fase' },
  2: { pct: 0.12, label: 'Copa do Brasil · 2ª fase' },
  3: { pct: 0.18, label: 'Copa do Brasil · 3ª fase' },
  4: { pct: 0.26, label: 'Copa do Brasil · 4ª fase' },
  5: { pct: 0.36, label: 'Copa do Brasil · 5ª fase' },
  6: { pct: 0.48, label: 'Copa do Brasil · Oitavas de final' },
  7: { pct: 0.6, label: 'Copa do Brasil · Quartas de final' },
  8: { pct: 0.75, label: 'Copa do Brasil · Semifinal' },
  9: { pct: 0.9, label: 'Copa do Brasil · Finalista' },
  champion: { pct: 1, label: 'Copa do Brasil · Campeão' },
};

export function clubAppearsInTies(ties, club) {
  return (ties || []).some(tie => tie?.home === club || tie?.away === club);
}

/**
 * Fase mais avançada da Série D para premiação.
 * @returns {'group'|'second'|'third'|'round16'|'quarter'|'semi'|'playoff'|'final'|'champion'}
 */
export function resolveSerieDPrizePhase(club, dKnockout = {}) {
  if (!club) return 'group';
  if (dKnockout.champion === club) return 'champion';
  const stages = dKnockout.stages || {};
  if (clubAppearsInTies(stages.final, club)) return 'final';
  if (clubAppearsInTies(stages.semi, club)) return 'semi';
  if (clubAppearsInTies(stages.playoff, club)) return 'playoff';
  if (clubAppearsInTies(stages.quarter, club)) return 'quarter';
  if (clubAppearsInTies(stages.round16, club)) return 'round16';
  if (clubAppearsInTies(stages.third, club)) return 'third';
  if (clubAppearsInTies(stages.second, club)) return 'second';
  return 'group';
}

/**
 * Fase mais avançada da Copa do Brasil (índice 1–9, 'champion', ou 0 se não jogou).
 */
export function resolveCupPrizePhase(club, cupCompetition = {}) {
  if (!club) return 0;
  if (cupCompetition.champion === club) return 'champion';
  let furthest = 0;
  for (const stage of cupCompetition.stages || []) {
    const played = (stage.fixtures || []).some(game => game?.home === club || game?.away === club);
    if (played) furthest = Math.max(furthest, Number(stage.index) || 0);
  }
  return furthest;
}

function phasePrizeLine(shareMap, key, pool) {
  const entry = shareMap[key];
  if (!entry || !(entry.pct > 0)) return null;
  const amount = Math.round(pool * entry.pct);
  if (amount <= 0) return null;
  return { label: entry.label, amount };
}

/** Histórico curto no clube — evita crescimento infinito do save. */
const LEDGER_LIMIT = 40;

/**
 * Base salarial por jogador/rodada em OVR 75 (R$).
 * Folha típica Série A ~180–350k com elenco médio/alto.
 */
export const WAGE_BASE_BY_DIVISION = {
  A: 13_000,
  B: 8_500,
  C: 5_600,
  D: 3_600,
};

/** Teto suave da folha por rodada (evita outliers em elencos gerados). */
export const WAGE_BILL_SOFT_CAP = {
  A: 420_000,
  B: 290_000,
  C: 200_000,
  D: 135_000,
};

/**
 * Base da comissão técnica por rodada (score de referência 70).
 * Ordem ~10–15% da folha típica; valor final depende do score do técnico
 * (mesmos insumos estáveis do ranking) e fica fixo no vínculo (staffContract).
 */
export const STAFF_BASE_BY_DIVISION = {
  A: 35_000,
  B: 22_000,
  C: 14_000,
  D: 9_000,
};

export const STAFF_BILL_SOFT_CAP = {
  A: 70_000,
  B: 45_000,
  C: 28_000,
  D: 18_000,
};

/** Espelha prestígio do ranking de técnicos (manager-ranking.js). */
export const STAFF_DIVISION_PRESTIGE = {
  A: 12,
  B: 8,
  C: 5,
  D: 2,
  FREE: 3,
};

export const STAFF_SCORE_REF = 70;
export const STAFF_FLOOR_RATIO = 0.55;

/**
 * Manutenção do estádio por rodada.
 * base + (capacidade/1000)×porMil + estrutura×k + gramado×k, com teto.
 */
export const STADIUM_OPS_BASE_BY_DIVISION = {
  A: 18_000,
  B: 12_000,
  C: 8_000,
  D: 5_000,
};

export const STADIUM_OPS_PER_THOUSAND_SEATS = {
  A: 450,
  B: 350,
  C: 280,
  D: 220,
};

export const STADIUM_OPS_STRUCTURE_COST = 2_500;
export const STADIUM_OPS_PITCH_COST = 2_000;

export const STADIUM_OPS_SOFT_CAP = {
  A: 75_000,
  B: 50_000,
  C: 35_000,
  D: 22_000,
};

const DEFAULT_MANAGER_REPUTATION = 60;

const wageAgeFactor = age => {
  const years = Number(age) || 26;
  if (years <= 22) return 0.9;
  if (years <= 30) return 1;
  if (years <= 33) return 1.06;
  return 1.12;
};

/** Salário de um jogador na rodada. */
export function estimatePlayerWage(player, division = 'A') {
  const base = WAGE_BASE_BY_DIVISION[division] ?? WAGE_BASE_BY_DIVISION.D;
  const overall = Math.max(40, Math.min(99, Number(player?.overall) || 60));
  const scale = (overall / 75) ** 1.35;
  return Math.round(base * scale * wageAgeFactor(player?.age));
}

/** Prefere `player.wage` persistido; senão estima. */
export function resolvePlayerRoundWage(player, division = 'A') {
  const wage = Number(player?.wage);
  if (Number.isFinite(wage) && wage > 0) return Math.round(wage);
  return estimatePlayerWage(player, division);
}

/**
 * Folha salarial da rodada (soma do elenco).
 * @param {{ softCap?: boolean }} [options] softCap=false para gate de elenco (impacto real).
 */
export function estimateWageBill(club, division = club?.division || 'A', options = {}) {
  const roster = Array.isArray(club?.roster) ? club.roster : [];
  if (!roster.length) return 0;
  const softCap = options.softCap !== false;
  const raw = roster.reduce((sum, player) => sum + resolvePlayerRoundWage(player, division), 0);
  if (!softCap) return raw;
  const cap = WAGE_BILL_SOFT_CAP[division] ?? WAGE_BILL_SOFT_CAP.D;
  return Math.min(raw, cap);
}

/** Teto antifail de elenco (quase nunca atinge se a folha estiver ok). */
export const ROSTER_HARD_MAX = 40;

/** Fator folha/receita conforme saúde financeira. */
export function financesPayrollFactor(finances) {
  const value = Number(finances);
  if (!Number.isFinite(value)) return 1;
  if (value >= 70) return 1.15;
  if (value >= 50) return 1;
  if (value >= 35) return 0.85;
  return 0.7;
}

/**
 * Receita recorrente estimada por rodada (patrocínio + TV em mando + ~½ bilheteria casa).
 * TV só cai em jogos como mandante (~metade das rodadas) — usa 50% da próxima parcela.
 */
export function estimateRoundRecurringRevenue(club, division = club?.division || 'A') {
  const sponsor = estimateSponsorInstallment(club) || 0;
  const tv = Math.round((estimateTvInstallment(club) || 0) * 0.5);
  let gateShare = 0;
  try {
    gateShare = Math.round((estimateGateReceipt(club, { division }).revenue || 0) * 0.45);
  } catch {
    gateShare = 0;
  }
  const fallback = { A: 180_000, B: 110_000, C: 70_000, D: 40_000 }[division] || 40_000;
  return Math.max(sponsor + tv + gateShare, fallback);
}

/**
 * Gate de expansão/redução de elenco por folha vs receita (modelo livre).
 * @param {object} club
 * @param {{ division?: string, extraWage?: number, removeWage?: number, rosterDelta?: number }} [opts]
 */
export function evaluateRosterPayroll(club, opts = {}) {
  const division = opts.division || club?.division || 'A';
  const extraWage = Math.max(0, Math.round(Number(opts.extraWage) || 0));
  const removeWage = Math.max(0, Math.round(Number(opts.removeWage) || 0));
  const rosterDelta = Math.round(Number(opts.rosterDelta) || 0);
  const sizeNow = Array.isArray(club?.roster) ? club.roster.length : 0;
  const sizeNext = sizeNow + rosterDelta;
  const wageBefore = estimateWageBill(club, division, { softCap: false });
  const wageAfter = Math.max(0, wageBefore + extraWage - removeWage);
  const revenue = estimateRoundRecurringRevenue(club, division);
  const factor = financesPayrollFactor(club?.finances);
  const limit = Math.round(revenue * factor);
  const pctBefore = revenue > 0 ? (wageBefore / revenue) * 100 : 0;
  const pctAfter = revenue > 0 ? (wageAfter / revenue) * 100 : 0;
  const hardFull = rosterDelta > 0 && sizeNext > ROSTER_HARD_MAX;
  const overPayroll = rosterDelta > 0 && wageAfter > limit;
  const ok = !hardFull && !overPayroll;
  let tone = 'ok';
  if (!ok) tone = 'block';
  else if (rosterDelta > 0 && wageAfter > limit * 0.85) tone = 'warn';
  else if (rosterDelta < 0 && pctAfter < pctBefore - 0.5) tone = 'relief';
  return {
    ok,
    tone,
    reason: hardFull ? 'roster_hard_full' : overPayroll ? 'payroll_pressure' : null,
    sizeNow,
    sizeNext,
    hardMax: ROSTER_HARD_MAX,
    wageBefore,
    wageAfter,
    revenue,
    factor,
    limit,
    pctBefore: Math.round(pctBefore),
    pctAfter: Math.round(pctAfter),
    finances: Number(club?.finances) || 50,
  };
}

/**
 * Phase B — envelope soft a partir do preview de folha.
 * `warn` não trava; `block` só espelha o gate duro já existente (`payroll_pressure`).
 * @param {ReturnType<typeof evaluateRosterPayroll>|null|undefined} payroll
 * @returns {{ level: 'none'|'ok'|'warn'|'block'|'relief', message: string, allow: boolean }}
 */
export function softEnvelopeFromPayroll(payroll) {
  if (!payroll) {
    return { level: 'none', message: '', allow: true };
  }
  if (!payroll.ok) {
    return {
      level: 'block',
      allow: false,
      message:
        payroll.reason === 'roster_hard_full'
          ? 'Elenco no limite antifail (40). Libere vaga antes de contratar.'
          : 'Folha ficaria acima do seguro para suas Finanças. Venda, empreste ou escolha outro jogador.',
    };
  }
  if (payroll.tone === 'warn') {
    return {
      level: 'warn',
      allow: true,
      message: 'Folha no limite — operação ainda permitida. Cuidado com novas contratações.',
    };
  }
  if (payroll.tone === 'relief') {
    return {
      level: 'relief',
      allow: true,
      message: 'Folha mais leve após esta operação.',
    };
  }
  return {
    level: 'ok',
    allow: true,
    message: 'Folha confortável com esta operação.',
  };
}

/**
 * Aviso soft de caixa após taxa (compra) — não bloqueia; só pressiona.
 * @param {{ balance?: number, fee?: number, roundCost?: number }} opts
 */
export function softCashEnvelope({ balance = 0, fee = 0, roundCost = 0 } = {}) {
  const bal = Number(balance) || 0;
  const cost = Math.max(0, Number(fee) || 0);
  const round = Math.max(0, Number(roundCost) || 0);
  if (!(cost > 0)) return { level: 'none', message: '', allow: true };
  const after = bal - cost;
  if (after < 0) {
    return {
      level: 'warn',
      allow: true,
      message: 'A taxa deixa o caixa no vermelho (cheque especial).',
    };
  }
  if (round > 0) {
    const runway = after / round;
    if (runway < 1.5) {
      return {
        level: 'warn',
        allow: true,
        message: `Após a taxa, o caixa cobre ~${runway.toFixed(1).replace('.', ',')} rodadas.`,
      };
    }
  }
  return { level: 'none', message: '', allow: true };
}

const hashManagerKey = key => {
  const text = String(key || 'manager');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 4294967295;
};

/**
 * Score estável do técnico para salário (sem seasonPoints — não sobe a cada rodada).
 * Espelha o DNA do ranking: rep, prestígio de divisão, títulos + jitter por id.
 */
export function computeStaffWageScore(manager = {}) {
  const reputation = Math.max(
    40,
    Math.min(99, Number(manager.reputation) || DEFAULT_MANAGER_REPUTATION),
  );
  const prestige =
    STAFF_DIVISION_PRESTIGE[manager.preferredDivision] ?? STAFF_DIVISION_PRESTIGE.FREE;
  const titlePoints = Math.max(0, Number(manager.titlePoints) || 0);
  const jitter = hashManagerKey(manager.id || manager.name) * 12 - 6;
  return reputation * 0.82 + prestige + titlePoints * 0.5 + jitter;
}

export function computeStaffBillFromScore(score, division = 'A') {
  const base = STAFF_BASE_BY_DIVISION[division] ?? STAFF_BASE_BY_DIVISION.D;
  const cap = STAFF_BILL_SOFT_CAP[division] ?? STAFF_BILL_SOFT_CAP.D;
  const floor = Math.round(base * STAFF_FLOOR_RATIO);
  const safeScore = Math.max(1, Number(score) || STAFF_SCORE_REF);
  const raw = Math.round(base * (safeScore / STAFF_SCORE_REF) ** 1.45);
  return Math.min(cap, Math.max(floor, raw));
}

const resolveManagerKey = (club, options = {}) =>
  options.managerId ||
  options.managerName ||
  club?.staffContract?.managerId ||
  club?.managerName ||
  null;

/**
 * Comissão técnica por rodada.
 * Preferência: contrato travado no clube (mesmo managerId).
 * Senão: calcula pelo score do técnico.
 */
export function estimateStaffBill(club, division = club?.division || 'A', options = {}) {
  const cap = STAFF_BILL_SOFT_CAP[division] ?? STAFF_BILL_SOFT_CAP.D;
  const managerKey = resolveManagerKey(club, options);
  const contract = club?.staffContract;
  if (
    contract &&
    Number(contract.amountPerRound) > 0 &&
    (!managerKey || !contract.managerId || contract.managerId === managerKey)
  ) {
    return Math.min(cap, Math.round(Number(contract.amountPerRound)));
  }
  const score = computeStaffWageScore({
    id: managerKey,
    name: options.managerName || club?.managerName,
    reputation: options.managerReputation ?? club?.managerReputation,
    preferredDivision: options.preferredDivision || division,
    titlePoints: options.titlePoints,
  });
  return computeStaffBillFromScore(score, division);
}

/**
 * Trava a comissão enquanto o mesmo técnico permanecer no clube.
 * Recalcula só se o managerId mudar ou `force`.
 */
export function ensureStaffContract(club, {
  division = 'A',
  season = null,
  managerId = null,
  managerName = null,
  managerReputation = null,
  preferredDivision = null,
  titlePoints = 0,
  force = false,
} = {}) {
  if (!club) return null;
  const managerKey = managerId || managerName || club.managerName || 'default';
  const existing = club.staffContract;
  if (
    !force &&
    existing &&
    existing.managerId === managerKey &&
    Number(existing.amountPerRound) > 0
  ) {
    return existing;
  }
  const score = computeStaffWageScore({
    id: managerKey,
    name: managerName || club.managerName,
    reputation: managerReputation ?? club.managerReputation,
    preferredDivision: preferredDivision || division,
    titlePoints,
  });
  const amountPerRound = computeStaffBillFromScore(score, division);
  club.staffContract = {
    managerId: managerKey,
    amountPerRound,
    season: season ?? existing?.season ?? null,
    score: Math.round(score * 10) / 10,
    at: new Date().toISOString(),
  };
  return club.staffContract;
}

/**
 * Manutenção operacional do estádio por rodada.
 * base + (capacidade/1000)×porMil + estrutura×k + gramado×k.
 */
export function estimateStadiumOpsBill(club, division = club?.division || 'A') {
  if (!club) return 0;
  ensureStadium(club, division);
  if (Number(club.stadiumSectorModel) === STADIUM_SECTOR_MODEL) {
    return estimateStadiumOpsFromSectors(club, division);
  }
  const base = STADIUM_OPS_BASE_BY_DIVISION[division] ?? STADIUM_OPS_BASE_BY_DIVISION.D;
  const perThousand = STADIUM_OPS_PER_THOUSAND_SEATS[division] ?? STADIUM_OPS_PER_THOUSAND_SEATS.D;
  const cap = STADIUM_OPS_SOFT_CAP[division] ?? STADIUM_OPS_SOFT_CAP.D;
  const seats = Math.max(0, Number(club.stadiumCapacity) || 0);
  const structure = getStructureLevel(club);
  const pitch = getPitchLevel(club);
  const raw = Math.round(
    base +
      (seats / 1000) * perThousand +
      structure * STADIUM_OPS_STRUCTURE_COST +
      pitch * STADIUM_OPS_PITCH_COST,
  );
  return Math.min(raw, cap);
}

/** Custo total da rodada (jogadores + comissão + estádio). */
export function estimateRoundCostBill(club, division = club?.division || 'A', options = {}) {
  return (
    estimateWageBill(club, division) +
    estimateStaffBill(club, division, options) +
    estimateStadiumOpsBill(club, division)
  );
}

/** Rodadas de custo que o caixa atual cobre (custos fixos da rodada). */
export function estimateWageRunway(club, division = club?.division || 'A', options = {}) {
  const bill = estimateRoundCostBill(club, division, options);
  if (!(bill > 0)) return 99;
  return getBalance(club) / bill;
}

const pushCostLedger = (club, { reason, label, paid, due, shortfall }) => {
  if (!(due > 0)) return;
  pushLedger(club, {
    type: 'spend',
    reason,
    label,
    amount: paid,
    balance: club.budget,
    at: new Date().toISOString(),
    meta: shortfall > 0 ? { shortfall, due } : { due },
  });
};

const allocateProportional = (balance, parts) => {
  const due = parts.reduce((sum, part) => sum + part.due, 0);
  if (!(due > 0) || !(balance > 0)) {
    return parts.map(part => ({ ...part, paid: 0, shortfall: part.due }));
  }
  if (balance >= due) {
    return parts.map(part => ({ ...part, paid: part.due, shortfall: 0 }));
  }
  const paidList = parts.map((part, index) => {
    if (index === parts.length - 1) return null;
    return Math.round((balance * part.due) / due);
  });
  const allocated = paidList.reduce((sum, value) => sum + (value || 0), 0);
  paidList[parts.length - 1] = Math.max(0, balance - allocated);
  return parts.map((part, index) => {
    const paid = Math.min(part.due, Math.max(0, paidList[index] || 0));
    return { ...part, paid, shortfall: Math.max(0, part.due - paid) };
  });
};

/**
 * Cobra folha + comissão + manutenção do estádio na rodada.
 * Débito integral — o caixa pode ficar negativo (overdraft).
 * Idempotente por `round`.
 */
export function chargeRoundCosts(club, {
  division = 'A',
  round = null,
  managerReputation = null,
  managerId = null,
  managerName = null,
  preferredDivision = null,
  titlePoints = 0,
  season = null,
} = {}) {
  if (!club) {
    return {
      ok: false,
      wages: { due: 0, paid: 0, shortfall: 0 },
      staff: { due: 0, paid: 0, shortfall: 0 },
      stadium: { due: 0, paid: 0, shortfall: 0 },
      due: 0,
      paid: 0,
      shortfall: 0,
      skipped: true,
    };
  }
  ensureBudget(club, division);
  ensureStadium(club, division);
  const roundKey = Number.isFinite(Number(round)) ? Number(round) : null;
  if (roundKey != null && club.lastWageRoundCharged === roundKey) {
    return {
      ok: true,
      wages: club.lastWageBill || { due: 0, paid: 0, shortfall: 0 },
      staff: club.lastStaffBill || { due: 0, paid: 0, shortfall: 0 },
      stadium: club.lastStadiumOpsBill || { due: 0, paid: 0, shortfall: 0 },
      due: Number(club.lastRoundCostBill?.due) || 0,
      paid: Number(club.lastRoundCostBill?.paid) || 0,
      shortfall: Number(club.lastRoundCostBill?.shortfall) || 0,
      balance: getBalance(club),
      skipped: true,
    };
  }

  const contract = ensureStaffContract(club, {
    division,
    season,
    managerId,
    managerName,
    managerReputation,
    preferredDivision: preferredDivision || division,
    titlePoints,
  });
  const staffOpts = {
    managerReputation,
    managerId: contract?.managerId || managerId || managerName,
    managerName,
    preferredDivision: preferredDivision || division,
    titlePoints,
  };
  const wagesDue = estimateWageBill(club, division);
  const staffDue = estimateStaffBill(club, division, staffOpts);
  const stadiumDue = estimateStadiumOpsBill(club, division);
  const due = wagesDue + staffDue + stadiumDue;
  const balanceBefore = getBalance(club);
  // Débito integral: obrigações entram no caixa mesmo sem cobertura.
  club.budget = balanceBefore - due;
  const coveredFromCash = Math.max(0, Math.min(due, Math.max(0, balanceBefore)));
  const overdraft = Math.max(0, due - coveredFromCash);
  const shortfall = overdraft;
  club.wageShortfall = shortfall > 0 || getBalance(club) < 0;

  const splitOverdraft = (partDue) => {
    if (!(due > 0) || !(overdraft > 0)) return 0;
    return Math.round((overdraft * partDue) / due);
  };
  const wagesOd = splitOverdraft(wagesDue);
  const staffOd = splitOverdraft(staffDue);
  const stadiumOd = Math.max(0, overdraft - wagesOd - staffOd);

  club.lastWageBill = {
    due: wagesDue,
    paid: wagesDue,
    shortfall: wagesOd,
    overdraft: wagesOd,
    round: roundKey,
    at: new Date().toISOString(),
  };
  club.lastStaffBill = {
    due: staffDue,
    paid: staffDue,
    shortfall: staffOd,
    overdraft: staffOd,
    reputation: Math.max(40, Math.min(99, Number(managerReputation) || DEFAULT_MANAGER_REPUTATION)),
    managerId: contract?.managerId || null,
    score: contract?.score ?? null,
    round: roundKey,
    at: new Date().toISOString(),
  };
  club.lastStadiumOpsBill = {
    due: stadiumDue,
    paid: stadiumDue,
    shortfall: stadiumOd,
    overdraft: stadiumOd,
    round: roundKey,
    at: new Date().toISOString(),
  };
  club.lastRoundCostBill = {
    due,
    paid: due,
    shortfall,
    overdraft,
    balanceBefore,
    round: roundKey,
    at: new Date().toISOString(),
  };
  if (roundKey != null) club.lastWageRoundCharged = roundKey;

  const roundLabel = roundKey != null ? ` · Rodada ${roundKey}` : '';
  pushCostLedger(club, {
    reason: 'wages',
    label: `Folha salarial${roundLabel}`,
    paid: wagesDue,
    due: wagesDue,
    shortfall: wagesOd,
  });
  pushCostLedger(club, {
    reason: 'staff_wages',
    label: `Comissão técnica${roundLabel}`,
    paid: staffDue,
    due: staffDue,
    shortfall: staffOd,
  });
  pushCostLedger(club, {
    reason: 'stadium_ops',
    label: `Manutenção do estádio${roundLabel}`,
    paid: stadiumDue,
    due: stadiumDue,
    shortfall: stadiumOd,
  });

  return {
    ok: true,
    wages: club.lastWageBill,
    staff: club.lastStaffBill,
    stadium: club.lastStadiumOpsBill,
    due,
    paid: due,
    shortfall,
    overdraft,
    balance: club.budget,
    skipped: false,
  };
}

/**
 * @deprecated Prefer chargeRoundCosts — mantido para compatibilidade.
 * Cobra só a folha de jogadores (sem comissão).
 */
export function chargeWageBill(club, options = {}) {
  return chargeRoundCosts(club, options);
}

/**
 * Investimentos estruturais (Escritório) — médico / prevenção.
 */
export const CLUB_UPGRADES = {
  medical_dept: {
    id: 'medical_dept',
    label: 'Departamento médico',
    shortLabel: 'MÉDICO',
    description: 'Melhora diagnóstico, recuperação e prevenção de lesões.',
    maxLevel: 5,
    baseCost: 1_500_000,
    costPerLevel: 400_000,
    getLevel: club => Math.max(0, Math.min(5, Number(club?.medicalInvestment) || 0)),
    applyEffect: club => {
      club.medicalInvestment = Math.min(5, (Number(club.medicalInvestment) || 0) + 1);
    },
  },
  prevention: {
    id: 'prevention',
    label: 'Programa de prevenção',
    shortLabel: 'PREVENÇÃO',
    description: 'Reduz o risco de lesão ligado à carga de jogos.',
    maxLevel: 3,
    baseCost: 1_200_000,
    costPerLevel: 350_000,
    getLevel: club => Math.max(0, Math.min(3, Number(club?.preventionProgram) || 0)),
    applyEffect: club => {
      club.preventionProgram = Math.min(3, (Number(club.preventionProgram) || 0) + 1);
    },
  },
  youth_academy: {
    id: 'youth_academy',
    label: 'Categoria de Base',
    shortLabel: 'BASE',
    description: 'Desenvolve a base e revela talentos para o elenco principal.',
    maxLevel: 5,
    baseCost: 2_000_000,
    costPerLevel: 500_000,
    locked: true,
    lockLabel: 'Em breve',
    getLevel: () => 0,
    applyEffect: () => {},
  },
};

/**
 * Níveis de gramado (0–5). O teto efetivo depende da Estrutura do estádio.
 * Estrutura N libera gramado até min(5, N+1).
 */
export const PITCH_TIERS = [
  { level: 0, key: 'poor', label: 'Ruim', shortLabel: 'RUIM', injuryModifier: 1.1 },
  { level: 1, key: 'rough', label: 'Regular', shortLabel: 'REGULAR', injuryModifier: 1.06 },
  { level: 2, key: 'average', label: 'Médio', shortLabel: 'MÉDIO', injuryModifier: 1.03 },
  { level: 3, key: 'good', label: 'Bom', shortLabel: 'BOM', injuryModifier: 1 },
  { level: 4, key: 'excellent', label: 'Excelente', shortLabel: 'EXCELENTE', injuryModifier: 0.97 },
  { level: 5, key: 'elite', label: 'Elite', shortLabel: 'ELITE', injuryModifier: 0.94 },
];

const PITCH_KEY_TO_LEVEL = Object.fromEntries(PITCH_TIERS.map(tier => [tier.key, tier.level]));

export function maxPitchForStructure(structureLevel = 0) {
  const structure = Math.max(0, Math.min(5, Math.round(Number(structureLevel) || 0)));
  return Math.min(5, Math.max(1, structure + 1));
}

export function getStructureLevel(club) {
  return Math.max(0, Math.min(5, Math.round(Number(club?.stadiumStructure) || 0)));
}

export function getPitchLevel(club) {
  if (Number.isFinite(Number(club?.pitchLevel))) {
    return Math.max(0, Math.min(5, Math.round(Number(club.pitchLevel))));
  }
  const fromKey = PITCH_KEY_TO_LEVEL[club?.pitchCondition];
  if (fromKey != null) return fromKey;
  return 2;
}

export function setPitchLevel(club, level) {
  if (!club) return 0;
  const next = Math.max(0, Math.min(5, Math.round(Number(level) || 0)));
  const tier = PITCH_TIERS[next] || PITCH_TIERS[2];
  club.pitchLevel = next;
  club.pitchCondition = tier.key;
  return next;
}

export function pitchTierLabel(clubOrLevel) {
  const level = typeof clubOrLevel === 'number' ? clubOrLevel : getPitchLevel(clubOrLevel);
  return (PITCH_TIERS[level] || PITCH_TIERS[2]).label;
}

/**
 * Melhorias do estádio (seção Estádio).
 */
export const STADIUM_UPGRADES = {
  structure: {
    id: 'structure',
    label: 'Estrutura do estádio',
    shortLabel: 'ESTRUTURA',
    description: 'Drenagem, irrigação e base do campo — libera níveis mais altos de gramado.',
    maxLevel: 5,
    baseCost: 1_800_000,
    costPerLevel: 700_000,
    getLevel: club => getStructureLevel(club),
    applyEffect: club => {
      club.stadiumStructure = Math.min(5, getStructureLevel(club) + 1);
    },
  },
  pitch: {
    id: 'pitch',
    label: 'Manutenção do gramado',
    shortLabel: 'GRAMADO',
    description: 'Eleva a qualidade do campo. O nível máximo depende da estrutura do estádio.',
    maxLevel: 5,
    baseCost: 900_000,
    costPerLevel: 450_000,
    getLevel: club => getPitchLevel(club),
    getMaxLevel: club => maxPitchForStructure(getStructureLevel(club)),
    applyEffect: club => {
      const ceiling = maxPitchForStructure(getStructureLevel(club));
      setPitchLevel(club, Math.min(ceiling, getPitchLevel(club) + 1));
    },
  },
  capacity: {
    id: 'capacity',
    label: 'Expansão de capacidade',
    shortLabel: 'CAPACIDADE',
    description: 'Amplia o estádio e aumenta o potencial de bilheteria nos jogos em casa.',
    maxLevel: 5,
    baseCost: 2_500_000,
    costPerLevel: 1_200_000,
    getLevel: club => Math.max(0, Math.min(5, Number(club?.stadiumCapacityLevel) || 0)),
    applyEffect: club => {
      const division = club.division || 'A';
      const cfg = STADIUM_CAPACITY_BY_DIVISION[division] || STADIUM_CAPACITY_BY_DIVISION.A;
      const nextLevel = Math.min(5, (Number(club.stadiumCapacityLevel) || 0) + 1);
      club.stadiumCapacityLevel = nextLevel;
      club.stadiumCapacity = Math.min(cfg.max, cfg.base + nextLevel * cfg.step);
    },
  },
};

export function initialBudget(division = 'A') {
  return INITIAL_BUDGET_BY_DIVISION[division] ?? 8_000_000;
}

export function formatBudget(value) {
  const raw = Math.round(Number(value) || 0);
  const negative = raw < 0;
  const amount = Math.abs(raw);
  let text;
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    text =
      millions >= 10
        ? `${Math.round(millions)} mi`
        : `${millions.toFixed(1).replace('.', ',')} mi`;
  } else if (amount >= 1_000) {
    text = `${Math.round(amount / 1_000)} mil`;
  } else {
    text = amount.toLocaleString('pt-BR');
  }
  return negative ? `− R$ ${text}` : `R$ ${text}`;
}

export function formatCapacity(value) {
  const seats = Math.max(0, Math.round(Number(value) || 0));
  if (seats >= 1_000) return `${Math.round(seats / 1_000)} mil`;
  return seats.toLocaleString('pt-BR');
}

export function formatTicketPrice(value) {
  return `R$ ${Math.max(0, Math.round(Number(value) || 0))}`;
}

/**
 * Premiação de fim de temporada para o clube do usuário.
 * Série D e Copa do Brasil usam % da campanha por fase avançada
 * (não a posição na tabela do grupo).
 */
export function computeSeasonPrize({
  division = 'A',
  position = 10,
  totalTeams = 20,
  champion = null,
  cupChampion = null,
  promoted = false,
  userClub = '',
  serieDPhase = null,
  cupPhase = null,
}) {
  const lines = [];
  let total = 0;

  const participation = PARTICIPATION_PRIZE[division] ?? 1_000_000;
  total += participation;
  lines.push({ label: 'Premiação por participação', amount: participation });

  if (division === 'D') {
    const phaseKey = serieDPhase || (champion === userClub ? 'champion' : 'group');
    const phaseLine = phasePrizeLine(SERIE_D_PHASE_SHARE, phaseKey, SERIE_D_PHASE_POOL);
    if (phaseLine) {
      total += phaseLine.amount;
      lines.push(phaseLine);
    }
  } else {
    const pool = POSITION_POOL[division] ?? 4_000_000;
    const rankFactor = Math.max(0, (totalTeams - position + 1) / totalTeams);
    const positionPrize = Math.round(pool * rankFactor);
    if (positionPrize > 0) {
      total += positionPrize;
      lines.push({ label: `${position}º lugar · Brasileirão Série ${division}`, amount: positionPrize });
    }
  }

  if (champion === userClub) {
    const bonus = TITLE_BONUS[division] ?? 5_000_000;
    total += bonus;
    lines.push({ label: 'Bônus de campeão', amount: bonus });
  }

  const resolvedCupPhase =
    cupPhase != null && cupPhase !== 0
      ? cupPhase
      : cupChampion === userClub
        ? 'champion'
        : 0;
  if (resolvedCupPhase && resolvedCupPhase !== 0) {
    const cupLine = phasePrizeLine(CUP_PHASE_SHARE, resolvedCupPhase, CUP_PHASE_POOL);
    if (cupLine) {
      total += cupLine.amount;
      lines.push(cupLine);
    }
  }

  if (promoted) {
    total += PROMOTION_BONUS;
    lines.push({ label: 'Bônus de acesso', amount: PROMOTION_BONUS });
  }

  return { total, lines };
}

/** Saldo assinado — pode ser negativo (cheque especial / atraso contabilizado). */
export function getBalance(club) {
  return Math.round(Number(club?.budget) || 0);
}

export function isOverdrawn(club) {
  return getBalance(club) < 0;
}

/** Garante budget numérico; migra saves antigos sem o campo. */
export function ensureBudget(club, division = 'A') {
  if (!club || typeof club !== 'object') return 0;
  if (!Number.isFinite(Number(club.budget))) {
    club.budget = initialBudget(division);
  } else {
    club.budget = Math.round(Number(club.budget));
  }
  if (!Array.isArray(club.budgetLedger)) club.budgetLedger = [];
  return club.budget;
}

/** Garante campos do estádio (setores, estrutura, gramado, ingressos). */
export function ensureStadium(club, division = 'A', options = {}) {
  if (!club || typeof club !== 'object') return null;
  ensureStadiumSectors(club, division, options);
  if (!club.stadiumName || typeof club.stadiumName !== 'string') {
    club.stadiumName = 'Estádio Solar';
  }
  if (!club.ticketPrices || typeof club.ticketPrices !== 'object') {
    club.ticketPrices = {
      national: TICKET_PRICE_RANGE.national.default,
      cups: TICKET_PRICE_RANGE.cups.default,
    };
  } else {
    club.ticketPrices = {
      national: clampTicket('national', club.ticketPrices.national),
      cups: clampTicket('cups', club.ticketPrices.cups),
    };
  }
  setPitchLevel(club, Math.min(getPitchLevel(club), maxPitchForStructure(getStructureLevel(club))));
  return {
    name: club.stadiumName,
    capacity: club.stadiumCapacity,
    sectors: { ...(club.stadiumSectors || {}) },
    structure: club.stadiumStructure,
    structureLabel: structureLevelLabel(getStructureLevel(club)),
    pitchLevel: club.pitchLevel,
    pitchCondition: club.pitchCondition,
    investments: getStadiumInvestments(club),
    ticketPrices: { ...club.ticketPrices },
  };
}

function clampTicket(channel, value) {
  const range = TICKET_PRICE_RANGE[channel] || TICKET_PRICE_RANGE.national;
  const amount = Math.round(Number(value) || range.default);
  return Math.max(range.min, Math.min(range.max, amount));
}

/** Gastos voluntários exigem saldo ≥ custo (não aprofunda o vermelho por escolha). */
export function canAfford(club, amount) {
  const cost = Math.max(0, Math.round(Number(amount) || 0));
  return getBalance(club) >= cost;
}

/**
 * Fallback legado (flat por divisão). A cobrança usa `resolveOverdraftRate`
 * (família do empréstimo × prêmio × streak).
 */
export const OVERDRAFT_RATE_BY_DIVISION = {
  A: 0.015,
  B: 0.018,
  C: 0.02,
  D: 0.022,
};

/**
 * Cobra juros de saldo negativo (após folha / banco).
 * Mantém `overdraftStreak` (rodadas consecutivas no vermelho).
 * Idempotente por `round`.
 */
export function serviceOverdraft(club, { division = 'C', round = null } = {}) {
  if (!club) return { ok: false, skipped: true, reason: 'no_club' };
  ensureBudget(club, division);
  const roundKey = Number.isFinite(Number(round)) ? Number(round) : null;
  if (roundKey != null && club.lastOverdraftRound === roundKey) {
    return {
      ok: true,
      skipped: true,
      balance: getBalance(club),
      fee: 0,
      streak: Math.max(0, Math.round(Number(club.overdraftStreak) || 0)),
    };
  }
  const bal = getBalance(club);
  if (!(bal < 0)) {
    club.overdraftActive = false;
    club.overdraftStreak = 0;
    if (roundKey != null) club.lastOverdraftRound = roundKey;
    return { ok: true, skipped: true, balance: bal, fee: 0, active: false, streak: 0 };
  }
  const streak = Math.max(0, Math.round(Number(club.overdraftStreak) || 0)) + 1;
  club.overdraftStreak = streak;
  const resolved = resolveOverdraftRate(club, { division, streak });
  const rate =
    Number.isFinite(resolved?.rate) && resolved.rate > 0
      ? resolved.rate
      : OVERDRAFT_RATE_BY_DIVISION[division] ?? OVERDRAFT_RATE_BY_DIVISION.C;
  const fee = Math.max(1, Math.round(Math.abs(bal) * rate));
  const paid = spend(club, fee, {
    reason: 'overdraft_interest',
    label: 'Juros de saldo negativo (compostos)',
    meta: {
      balanceBefore: bal,
      rate,
      streak,
      streakMult: resolved?.streakMult,
      premium: resolved?.premium,
      round: roundKey,
    },
    allowNegative: true,
  });
  // v5: OD prolongado + empréstimo ativo → parte do juro engorda a dívida bancária.
  let absorbedToLoan = 0;
  if (streak >= 3 && getBankLoan(club) && club.bankLoan) {
    absorbedToLoan = Math.max(1, Math.round(fee * OVERDRAFT_TO_LOAN_ABSORB_RATIO));
    club.bankLoan.balance = Math.max(
      0,
      Math.round(Number(club.bankLoan.balance) || 0) + absorbedToLoan,
    );
  }
  club.overdraftActive = true;
  club.wageShortfall = true;
  if (roundKey != null) club.lastOverdraftRound = roundKey;
  return {
    ok: !!paid?.ok,
    skipped: false,
    active: true,
    fee,
    rate,
    streak,
    streakMult: resolved?.streakMult ?? 1,
    absorbedToLoan,
    balance: getBalance(club),
  };
}

const EMPTY_SEASON_INFLOWS = () => ({
  gate: 0,
  sponsorship: 0,
  naming: 0,
  tv: 0,
  prize: 0,
  bank_loan: 0,
  transfers_in: 0,
  other_in: 0,
});

const EMPTY_SEASON_OUTFLOWS = () => ({
  wages: 0,
  staff: 0,
  stadium: 0,
  upgrades: 0,
  loan_service: 0,
  transfers_out: 0,
  other_out: 0,
});

const seasonCashflowCategory = (type, reason) => {
  if (reason === 'transfer') {
    return type === 'credit' ? ['inflows', 'transfers_in'] : ['outflows', 'transfers_out'];
  }
  if (type === 'credit') {
    if (reason === 'gate_receipt') return ['inflows', 'gate'];
    if (reason === 'sponsorship') return ['inflows', 'sponsorship'];
    if (reason === 'naming_rights') return ['inflows', 'naming'];
    if (reason === 'tv_rights' || reason === 'tv_advance') return ['inflows', 'tv'];
    if (reason === 'season_prize') return ['inflows', 'prize'];
    if (reason === 'bank_loan') return ['inflows', 'bank_loan'];
    return ['inflows', 'other_in'];
  }
  if (reason === 'wages') return ['outflows', 'wages'];
  if (reason === 'staff_wages') return ['outflows', 'staff'];
  if (reason === 'stadium_ops' || reason === 'name_rights') return ['outflows', 'stadium'];
  if (String(reason || '').startsWith('upgrade:')) return ['outflows', 'upgrades'];
  if (reason === 'loan_interest' || reason === 'loan_repay' || reason === 'overdraft_interest') {
    return ['outflows', 'loan_service'];
  }
  return ['outflows', 'other_out'];
};

const createEmptySeasonCashflow = season => ({
  season: season == null ? null : Number(season),
  inflows: EMPTY_SEASON_INFLOWS(),
  outflows: EMPTY_SEASON_OUTFLOWS(),
  movementCount: 0,
});

const applySeasonCashflowEntry = (cashflow, entry) => {
  const amount = Math.max(0, Number(entry?.amount) || 0);
  if (!(amount > 0) || !cashflow) return;
  const [bucket, key] = seasonCashflowCategory(entry.type, entry.reason);
  cashflow[bucket][key] = (Number(cashflow[bucket][key]) || 0) + amount;
  cashflow.movementCount = (Number(cashflow.movementCount) || 0) + 1;
};

/** Garante acumulador do DFC da temporada (sobrevive ao limite do ledger). */
export function ensureSeasonCashflow(club, season = null) {
  if (!club) return null;
  const seasonKey = Number(
    season ?? club.sponsors?.season ?? club.tvRights?.season ?? club.seasonCashflow?.season,
  );
  const hasSeason = Number.isFinite(seasonKey);
  if (
    !club.seasonCashflow ||
    (hasSeason && Number(club.seasonCashflow.season) !== seasonKey)
  ) {
    club.seasonCashflow = createEmptySeasonCashflow(hasSeason ? seasonKey : null);
    // Migração: seed a partir do ledger atual (janela curta) se ainda vazio.
    const ledger = Array.isArray(club.budgetLedger) ? club.budgetLedger : [];
    for (let index = ledger.length - 1; index >= 0; index -= 1) {
      applySeasonCashflowEntry(club.seasonCashflow, ledger[index]);
    }
  } else {
    if (!club.seasonCashflow.inflows) club.seasonCashflow.inflows = EMPTY_SEASON_INFLOWS();
    if (!club.seasonCashflow.outflows) club.seasonCashflow.outflows = EMPTY_SEASON_OUTFLOWS();
    club.seasonCashflow.movementCount = Number(club.seasonCashflow.movementCount) || 0;
    // Save antigo sem acumulador: reconstrói uma vez a partir do ledger.
    if (
      club.seasonCashflow.movementCount === 0 &&
      Array.isArray(club.budgetLedger) &&
      club.budgetLedger.length
    ) {
      for (let index = club.budgetLedger.length - 1; index >= 0; index -= 1) {
        applySeasonCashflowEntry(club.seasonCashflow, club.budgetLedger[index]);
      }
    }
  }
  return club.seasonCashflow;
}

/** Demonstrativo agregado da temporada (não depende do LEDGER_LIMIT). */
export function getSeasonCashflowStatement(club, season = null) {
  const cashflow = ensureSeasonCashflow(club, season);
  if (!cashflow) {
    return {
      inflows: EMPTY_SEASON_INFLOWS(),
      outflows: EMPTY_SEASON_OUTFLOWS(),
      totalIn: 0,
      totalOut: 0,
      net: 0,
      count: 0,
      season: null,
      fullSeason: true,
    };
  }
  const inflows = { ...EMPTY_SEASON_INFLOWS(), ...cashflow.inflows };
  const outflows = { ...EMPTY_SEASON_OUTFLOWS(), ...cashflow.outflows };
  const totalIn = Object.values(inflows).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const totalOut = Object.values(outflows).reduce((sum, value) => sum + (Number(value) || 0), 0);
  return {
    inflows,
    outflows,
    totalIn,
    totalOut,
    net: totalIn - totalOut,
    count: Number(cashflow.movementCount) || 0,
    season: cashflow.season,
    fullSeason: true,
  };
}

function pushLedger(club, entry) {
  if (!club) return;
  if (!Array.isArray(club.budgetLedger)) club.budgetLedger = [];
  // Acumula no DFC da temporada antes do unshift — o seed de migração
  // lê só o ledger antigo e não conta este lançamento duas vezes.
  ensureSeasonCashflow(club);
  applySeasonCashflowEntry(club.seasonCashflow, entry);
  club.budgetLedger.unshift(entry);
  if (club.budgetLedger.length > LEDGER_LIMIT) {
    club.budgetLedger.length = LEDGER_LIMIT;
  }
}

export function credit(club, amount, { reason = 'credit', label = 'Crédito', meta = null } = {}) {
  ensureBudget(club);
  const value = Math.max(0, Math.round(Number(amount) || 0));
  club.budget = getBalance(club) + value;
  const entry = {
    type: 'credit',
    reason,
    label,
    amount: value,
    balance: club.budget,
    at: new Date().toISOString(),
    meta,
  };
  pushLedger(club, entry);
  return { ok: true, balance: club.budget, entry };
}

/**
 * @param {{ allowNegative?: boolean }} [opts]
 * `allowNegative: true` — obrigações (folha, banco, cheque especial) podem aprofundar o vermelho.
 */
export function spend(
  club,
  amount,
  { reason = 'spend', label = 'Despesa', meta = null, allowNegative = false } = {},
) {
  ensureBudget(club);
  const value = Math.max(0, Math.round(Number(amount) || 0));
  if (!allowNegative && !canAfford(club, value)) {
    return { ok: false, balance: getBalance(club), error: 'insufficient_funds' };
  }
  club.budget = getBalance(club) - value;
  const entry = {
    type: 'spend',
    reason,
    label,
    amount: value,
    balance: club.budget,
    at: new Date().toISOString(),
    meta: {
      ...(meta && typeof meta === 'object' ? meta : {}),
      ...(allowNegative && getBalance(club) < 0 ? { overdraft: true } : {}),
    },
  };
  pushLedger(club, entry);
  return { ok: true, balance: club.budget, entry };
}

export function upgradeCost(upgrade, currentLevel = 0) {
  if (!upgrade) return Infinity;
  const level = Math.max(0, Number(currentLevel) || 0);
  return Math.round((upgrade.baseCost || 0) + level * (upgrade.costPerLevel || 0));
}

export function getUpgrade(upgradeId) {
  return CLUB_UPGRADES[upgradeId] || STADIUM_UPGRADES[upgradeId] || null;
}

function listCatalog(catalog, club) {
  return Object.values(catalog).map(upgrade => {
    const locked = !!upgrade.locked;
    const level = upgrade.getLevel(club);
    const absoluteMax = upgrade.maxLevel;
    const effectiveMax =
      typeof upgrade.getMaxLevel === 'function' ? upgrade.getMaxLevel(club) : absoluteMax;
    const structureCapped = !locked && level >= effectiveMax && level < absoluteMax;
    const maxed = !locked && level >= absoluteMax;
    const blocked = locked || maxed || structureCapped;
    const cost = blocked ? 0 : upgradeCost(upgrade, level);
    return {
      id: upgrade.id,
      label: upgrade.label,
      shortLabel: upgrade.shortLabel,
      description: upgrade.description,
      level,
      maxLevel: absoluteMax,
      effectiveMax,
      maxed,
      structureCapped,
      locked,
      lockLabel: upgrade.lockLabel || 'Em breve',
      cost,
      affordable: !blocked && canAfford(club, cost),
      costLabel: locked
        ? upgrade.lockLabel || 'Em breve'
        : maxed
          ? 'Máximo'
          : structureCapped
            ? 'Estrutura'
            : formatBudget(cost),
    };
  });
}

/** Lista upgrades do Escritório (médico / prevenção). */
export function listUpgrades(club) {
  return listCatalog(CLUB_UPGRADES, club);
}

/** Lista investimentos do Estádio (estrutura + setores + gramado). */
export function listStadiumUpgrades(club, division = club?.division || 'A') {
  if (!club) return [];
  ensureStadium(club, division);
  const rows = [];
  const structure = getStructureLevel(club);

  const pushRow = ({
    id,
    label,
    description,
    level,
    maxLevel,
    effectiveMax,
    cost,
    locked = false,
    lockLabel = 'Em breve',
    structureCapped = false,
    divisionLocked = false,
    maxed = false,
  }) => {
    const blocked = locked || maxed || structureCapped || divisionLocked;
    rows.push({
      id,
      label,
      shortLabel: label.split(' ')[0].toUpperCase(),
      description,
      level,
      maxLevel,
      effectiveMax,
      maxed,
      structureCapped,
      divisionLocked,
      locked,
      lockLabel,
      cost: blocked ? 0 : cost,
      affordable: !blocked && canAfford(club, cost),
      costLabel: locked
        ? lockLabel
        : divisionLocked
          ? 'Série'
          : maxed
            ? 'Máximo'
            : structureCapped
              ? 'Estrutura'
              : formatBudget(cost),
    });
  };

  const sLevel = structure;
  pushRow({
    id: 'structure',
    label: STRUCTURE_UPGRADE.label,
    description: `${STRUCTURE_UPGRADE.description} Atual: ${structureLevelLabel(sLevel)}.`,
    level: sLevel,
    maxLevel: STRUCTURE_UPGRADE.maxLevel,
    effectiveMax: STRUCTURE_UPGRADE.maxLevel,
    cost: stadiumInvestmentCost(STRUCTURE_UPGRADE, sLevel, division),
    maxed: sLevel >= STRUCTURE_UPGRADE.maxLevel,
  });

  for (const sectorId of Object.keys(STADIUM_SECTOR_DEFS)) {
    const def = STADIUM_SECTOR_DEFS[sectorId];
    const allowed = divisionAllowsSector(division, sectorId);
    const level = getSectorLevel(club, sectorId);
    const effectiveMax = effectiveSectorMax(club, division, sectorId);
    const unlock = def.unlockStructure;
    const structureCapped = allowed && level >= effectiveMax && level < def.maxLevel;
    const divisionLocked = !allowed;
    const locked = divisionLocked || structure < unlock;
    const lockLabel = divisionLocked
      ? 'Indisponível nesta série'
      : `Exige ${structureLevelLabel(unlock)}`;
    const maxed = allowed && level >= effectiveMax && effectiveMax >= def.maxLevel;
    const previewSeats = sectorSeats(sectorId, Math.max(level, 1), division);
    pushRow({
      id: `sector_${sectorId}`,
      label: def.label,
      description: `${def.description} · ~${previewSeats.toLocaleString('pt-BR')} lug. (nível ${level}).`,
      level,
      maxLevel: def.maxLevel,
      effectiveMax,
      cost: !locked && !maxed && level < effectiveMax ? stadiumInvestmentCost(def, Math.max(0, level), division) : 0,
      locked: locked && !maxed,
      lockLabel,
      structureCapped: structureCapped && !divisionLocked,
      divisionLocked,
      maxed,
    });
  }

  const pitchLevel = getPitchLevel(club);
  const pitchEffective = maxPitchForStructure(structure);
  pushRow({
    id: 'pitch',
    label: PITCH_SECTOR_UPGRADE.label,
    description: `${PITCH_SECTOR_UPGRADE.description} Atual: ${pitchTierLabel(club)}.`,
    level: pitchLevel,
    maxLevel: PITCH_SECTOR_UPGRADE.maxLevel,
    effectiveMax: pitchEffective,
    cost: stadiumInvestmentCost(PITCH_SECTOR_UPGRADE, pitchLevel, division),
    maxed: pitchLevel >= PITCH_SECTOR_UPGRADE.maxLevel,
    structureCapped: pitchLevel >= pitchEffective && pitchLevel < PITCH_SECTOR_UPGRADE.maxLevel,
  });

  return rows;
}

function bumpStadiumInvestments(club) {
  club.stadiumInvestments = getStadiumInvestments(club) + 1;
}

export function purchaseStadiumUpgrade(club, upgradeId, division = club?.division || 'A') {
  if (!club) return { ok: false, error: 'no_club' };
  ensureStadium(club, division);

  // Compat legado: capacidade → popular
  const resolvedId = upgradeId === 'capacity' ? 'sector_popular' : upgradeId;

  if (resolvedId === 'structure') {
    const level = getStructureLevel(club);
    if (level >= STRUCTURE_UPGRADE.maxLevel) return { ok: false, error: 'max_level', balance: getBalance(club) };
    const cost = stadiumInvestmentCost(STRUCTURE_UPGRADE, level, division);
    const payment = spend(club, cost, {
      reason: 'upgrade:structure',
      label: STRUCTURE_UPGRADE.label,
      meta: { fromLevel: level, toLevel: level + 1 },
    });
    if (!payment.ok) return payment;
    club.stadiumStructure = level + 1;
    bumpStadiumInvestments(club);
    ensureStadium(club, division);
    return { ok: true, balance: payment.balance, cost, level: club.stadiumStructure, upgradeId: 'structure' };
  }

  if (resolvedId === 'pitch') {
    const level = getPitchLevel(club);
    const ceiling = maxPitchForStructure(getStructureLevel(club));
    if (level >= PITCH_SECTOR_UPGRADE.maxLevel) return { ok: false, error: 'max_level', balance: getBalance(club) };
    if (level >= ceiling) return { ok: false, error: 'structure_cap', balance: getBalance(club) };
    const cost = stadiumInvestmentCost(PITCH_SECTOR_UPGRADE, level, division);
    const payment = spend(club, cost, {
      reason: 'upgrade:pitch',
      label: PITCH_SECTOR_UPGRADE.label,
      meta: { fromLevel: level, toLevel: level + 1 },
    });
    if (!payment.ok) return payment;
    setPitchLevel(club, level + 1);
    bumpStadiumInvestments(club);
    return { ok: true, balance: payment.balance, cost, level: getPitchLevel(club), upgradeId: 'pitch' };
  }

  if (resolvedId.startsWith('sector_')) {
    const sectorId = resolvedId.slice('sector_'.length);
    const def = STADIUM_SECTOR_DEFS[sectorId];
    if (!def) return { ok: false, error: 'unknown_upgrade' };
    if (!divisionAllowsSector(division, sectorId)) {
      return { ok: false, error: 'division_locked', balance: getBalance(club) };
    }
    if (getStructureLevel(club) < def.unlockStructure) {
      return { ok: false, error: 'structure_cap', balance: getBalance(club) };
    }
    const level = getSectorLevel(club, sectorId);
    const effectiveMax = effectiveSectorMax(club, division, sectorId);
    if (level >= effectiveMax) return { ok: false, error: 'max_level', balance: getBalance(club) };
    const cost = stadiumInvestmentCost(def, Math.max(0, level), division);
    const payment = spend(club, cost, {
      reason: `upgrade:sector:${sectorId}`,
      label: def.label,
      meta: { sectorId, fromLevel: level, toLevel: level + 1 },
    });
    if (!payment.ok) return payment;
    if (!club.stadiumSectors) club.stadiumSectors = {};
    club.stadiumSectors[sectorId] = level + 1;
    bumpStadiumInvestments(club);
    ensureStadium(club, division);
    return {
      ok: true,
      balance: payment.balance,
      cost,
      level: club.stadiumSectors[sectorId],
      upgradeId: resolvedId,
    };
  }

  if (STADIUM_UPGRADES[resolvedId]) {
    return purchaseUpgrade(club, resolvedId);
  }
  return { ok: false, error: 'unknown_upgrade' };
}

/**
 * Compra um nível do upgrade: gasta orçamento e aplica o efeito no clube.
 */
export function purchaseUpgrade(club, upgradeId) {
  const upgrade = getUpgrade(upgradeId);
  if (!upgrade || !club) return { ok: false, error: 'unknown_upgrade' };
  if (upgrade.locked) return { ok: false, error: 'locked', balance: getBalance(club) };
  const level = upgrade.getLevel(club);
  const effectiveMax =
    typeof upgrade.getMaxLevel === 'function' ? upgrade.getMaxLevel(club) : upgrade.maxLevel;
  if (level >= upgrade.maxLevel) return { ok: false, error: 'max_level', balance: getBalance(club) };
  if (level >= effectiveMax) return { ok: false, error: 'structure_cap', balance: getBalance(club) };
  const cost = upgradeCost(upgrade, level);
  const payment = spend(club, cost, {
    reason: `upgrade:${upgrade.id}`,
    label: upgrade.label,
    meta: { upgradeId: upgrade.id, fromLevel: level, toLevel: level + 1 },
  });
  if (!payment.ok) return payment;
  upgrade.applyEffect(club);
  return {
    ok: true,
    balance: payment.balance,
    entry: payment.entry,
    upgradeId: upgrade.id,
    level: upgrade.getLevel(club),
    cost,
  };
}

export function getTicketPrices(club) {
  ensureStadium(club, club?.division || 'A');
  return { ...club.ticketPrices };
}

/** Ajusta preço de ingresso (nacional ou copas). Sem custo de caixa. */
export function adjustTicketPrice(club, channel, delta) {
  ensureStadium(club, club?.division || 'A');
  const range = TICKET_PRICE_RANGE[channel];
  if (!range) return { ok: false, error: 'unknown_channel' };
  const next = clampTicket(channel, (Number(club.ticketPrices[channel]) || range.default) + Number(delta || 0));
  club.ticketPrices[channel] = next;
  return { ok: true, channel, price: next, ticketPrices: { ...club.ticketPrices } };
}

export function setTicketPrice(club, channel, value) {
  ensureStadium(club, club?.division || 'A');
  const range = TICKET_PRICE_RANGE[channel];
  if (!range) return { ok: false, error: 'unknown_channel' };
  club.ticketPrices[channel] = clampTicket(channel, value);
  return { ok: true, channel, price: club.ticketPrices[channel], ticketPrices: { ...club.ticketPrices } };
}

const isSerieDKnockoutGame = game => {
  if (!game) return false;
  const comp = String(game.competition || '');
  if (comp === 'SERIE_D' || comp.includes('SÉRIE D') || comp.includes('SERIE D')) return true;
  return Boolean(game.twoLegged && game.leg && Number(game.round) > 10);
};

export function ticketChannelFromGame(game) {
  if (!game) return 'national';
  if (game.competition === 'COPA DO BRASIL' || game.competition === 'COPA') return 'cups';
  if (isSerieDKnockoutGame(game)) return 'cups';
  return 'national';
}

const hashFixtureKey = game => {
  const key = `${game?.home || ''}|${game?.away || ''}|${game?.round || ''}|${game?.phase || ''}|${game?.phaseIndex || ''}|${game?.leg || ''}|${game?.date || ''}|${game?.tieId || ''}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** Ruído determinístico por jogo (±3.5 pp) — mesma partida = mesma lotação. */
const fixtureAttendanceNoise = game => {
  if (!game) return 0;
  const unit = (hashFixtureKey(game) % 10001) / 10000;
  return (unit - 0.5) * 0.07;
};

/**
 * Atração extra por fase (mata-mata agudo enche mais).
 * Retorna boost aditivo na taxa de ocupação (0–0.28).
 */
export function competitionAttraction(game) {
  if (!game) return { boost: 0, label: 'Campeonato' };
  const comp = game.competition;
  const phaseName = String(game.phase || game.leg || '').toUpperCase();

  if (comp === 'COPA DO BRASIL' || comp === 'COPA') {
    const phase = Number(game.phaseIndex) || 0;
    const byIndex = {
      1: 0.03,
      2: 0.04,
      3: 0.055,
      4: 0.07,
      5: 0.09,
      6: 0.13,
      7: 0.17,
      8: 0.22,
      9: 0.28,
    };
    let boost = byIndex[phase] ?? 0.06;
    if (/FINAL/.test(phaseName) && !/SEMI|QUARTAS|OITAVAS/.test(phaseName)) boost = Math.max(boost, 0.28);
    else if (/SEMI/.test(phaseName)) boost = Math.max(boost, 0.22);
    else if (/QUARTAS/.test(phaseName)) boost = Math.max(boost, 0.17);
    else if (/OITAVAS/.test(phaseName)) boost = Math.max(boost, 0.13);
    return { boost, label: game.phase || 'Copa do Brasil' };
  }

  if (isSerieDKnockoutGame(game)) {
    const round = Number(game.round || game.knockoutRound) || 0;
    if (round <= 12) return { boost: 0.06, label: 'Série D · 2ª fase' };
    if (round <= 14) return { boost: 0.08, label: 'Série D · 3ª fase' };
    if (round <= 16) return { boost: 0.12, label: 'Série D · Oitavas' };
    if (round <= 18) return { boost: 0.16, label: 'Série D · Quartas' };
    if (round <= 20) return { boost: 0.21, label: 'Série D · Semifinal' };
    return { boost: 0.27, label: 'Série D · Final' };
  }

  return { boost: 0, label: 'Nacional' };
}

/**
 * Taxa de ocupação: preço, Ambiente do elenco, torcida, fase do campeonato e ruído do jogo.
 * Canal: 'national' | 'cups'. Passe `game` no dia do jogo para fase + variação.
 */
export function estimateFillRate(club, channel = 'national', options = {}) {
  ensureStadium(club, club?.division || 'A');
  const range = TICKET_PRICE_RANGE[channel] || TICKET_PRICE_RANGE.national;
  const price = club.ticketPrices[channel] ?? range.default;
  const priceSpan = Math.max(1, range.max - range.min);
  const priceFactor = 1 - ((price - range.min) / priceSpan) * 0.46;
  const environment = Math.max(0, Math.min(100, Number(options.environment ?? club.environment) || 60));
  const support = Math.max(0, Math.min(100, Number(options.support ?? club.support) || 60));
  // Ambiente alto enche; crise no vestiário afasta o público.
  const envBoost = (environment - 55) / 160;
  const supportBoost = (support - 50) / 200;
  const attraction = competitionAttraction(options.game);
  const noise = options.deterministic === false ? (Math.random() - 0.5) * 0.07 : fixtureAttendanceNoise(options.game);
  // Sem jogo específico (painel do Estádio), Copas têm leve atrativo médio.
  const channelBias = !options.game && channel === 'cups' ? 0.05 : 0;
  // Base 0.48 (era 0.60): lotação média mais realista vs folha.
  const fill = 0.48 * priceFactor + envBoost + supportBoost + attraction.boost + noise + channelBias;
  return Math.max(0.28, Math.min(0.96, fill));
}

/** Estimativa de bilheteria — com ou sem jogo concreto. */
export function estimateGateReceipt(club, { channel = 'national', division = 'A', game = null, capacity = null } = {}) {
  ensureStadium(club, division);
  const resolvedChannel = game ? ticketChannelFromGame(game) : channel;
  const attraction = competitionAttraction(game);

  if (Number(club.stadiumSectorModel) === STADIUM_SECTOR_MODEL) {
    const noise = game ? fixtureAttendanceNoise(game) : resolvedChannel === 'cups' ? 0.02 : 0;
    const base = estimateGateReceiptSectors(club, {
      channel: resolvedChannel,
      division,
      game,
      gateScale: GATE_REVENUE_SCALE,
      ticketPrices: club.ticketPrices,
      ticketRanges: TICKET_PRICE_RANGE,
      environment: club.environment,
      support: club.support,
    });
    const boost = attraction.boost + noise;
    const attendance = Math.round(base.attendance * (1 + boost * 0.45));
    const cap = base.capacity || Math.max(1000, Number(capacity) || Number(club.stadiumCapacity) || 1000);
    const clampedAttendance = Math.min(cap, Math.max(0, attendance));
    const revenue =
      base.attendance > 0
        ? Math.round(base.revenue * (clampedAttendance / base.attendance))
        : base.revenue;
    return {
      ...base,
      channel: resolvedChannel,
      attendance: clampedAttendance,
      fillRate: cap > 0 ? clampedAttendance / cap : base.fillRate,
      revenue,
      capacity: cap,
      attraction,
    };
  }

  const fill = estimateFillRate(club, resolvedChannel, { game });
  const cap = Math.max(1000, Number(capacity) || Number(club.stadiumCapacity) || 12_000);
  const attendance = Math.round(cap * fill);
  const price = club.ticketPrices[resolvedChannel] ?? TICKET_PRICE_RANGE[resolvedChannel].default;
  const revenue = Math.round(attendance * price * GATE_REVENUE_SCALE);
  return {
    channel: resolvedChannel,
    attendance,
    fillRate: fill,
    price,
    revenue,
    capacity: cap,
    attraction,
    environment: Number(club.environment) || 60,
    support: Number(club.support) || 60,
  };
}

/**
 * Lotação do dia do jogo (AO VIVO ou simulado).
 * Se o jogo já tem attendance gravada, reutiliza — mesma partida, mesmo público.
 */
export function computeMatchAttendance(club, game, { division = 'A', capacity = null } = {}) {
  if (!club || !game) return null;
  ensureStadium(club, division || club.division || 'A');
  const channel = ticketChannelFromGame(game);
  const cap = Math.max(1000, Number(capacity) || Number(club.stadiumCapacity) || 12_000);
  const price = club.ticketPrices[channel] ?? TICKET_PRICE_RANGE[channel].default;
  if (Number.isFinite(Number(game.attendance)) && Number.isFinite(Number(game.fillRate))) {
    const attendance = Math.round(Number(game.attendance));
    const fillRate = Math.max(0.28, Math.min(0.96, Number(game.fillRate)));
    return {
      channel,
      attendance,
      fillRate,
      price,
      revenue: Math.round(attendance * price * GATE_REVENUE_SCALE),
      capacity: cap,
      attraction: competitionAttraction(game),
      environment: Number(club.environment) || 60,
      support: Number(club.support) || 60,
      cached: true,
    };
  }
  return { ...estimateGateReceipt(club, { channel, division, game, capacity: cap }), cached: false };
}

/** Grava lotação no fixture para UI ao vivo e bilheteria usarem o mesmo valor. */
export function attachMatchAttendance(club, game, options = {}) {
  const estimate = computeMatchAttendance(club, game, options);
  if (!estimate || !game) return estimate;
  if (!estimate.cached) {
    game.attendance = estimate.attendance;
    game.fillRate = Number(estimate.fillRate.toFixed(4));
  }
  return estimate;
}

/**
 * Credita bilheteria no caixa do clube mandante (fluxo de caixa + ledger).
 * Só jogos em casa; visitante nunca recebe; evita crédito duplicado no mesmo fixture.
 */
export function creditHomeGate(club, game, { division = 'A', capacity = null } = {}) {
  const clubName = club?.name;
  if (!club || !game || !clubName || game.home !== clubName || game.away === clubName) {
    return { ok: false, error: 'not_home' };
  }
  if (game.gateCredited) {
    return { ok: false, error: 'already_credited', balance: getBalance(club) };
  }
  const estimate = attachMatchAttendance(club, game, { division, capacity });
  const phaseNote = estimate.attraction?.boost > 0.1 ? ` · ${estimate.attraction.label}` : '';
  const label =
    estimate.channel === 'cups'
      ? `Bilheteria · Copa (${estimate.attendance.toLocaleString('pt-BR')} pág.${phaseNote})`
      : `Bilheteria · Nacional (${estimate.attendance.toLocaleString('pt-BR')} pág.)`;
  const result = credit(club, estimate.revenue, {
    reason: 'gate_receipt',
    label,
    meta: {
      ...estimate,
      opponent: game.away,
      competition: game.competition || 'LEAGUE',
      phase: game.phase || null,
      fillPercent: Math.round(estimate.fillRate * 100),
    },
  });
  if (result?.ok) {
    game.gateCredited = true;
    game.gateRevenue = result.entry.amount;
  }
  return result;
}

/** Pool único — qualquer nome pode ser Master ou Secundário. */
export const SPONSOR_POOL = [
  'Tekno Cursos',
  'Nubanco',
  'Petrobraz',
  'Magazine Luizão',
  'iFome',
  'BetRegional',
  'PicPaga',
  'Sheinpee',
  'Amazônia.com',
  'Googol',
  'Metagol',
  'Starbox Coffee',
  'Havaianinhas',
  'Naike',
  'Pumba Sport',
  'Perdigol',
  'Poweraid',
  'Playstação',
  'FedExpressão',
];

/**
 * Parceiros reais (monetização) — lista interna.
 * Sempre entram nas 7 ofertas (Master ou Secundário), sem repetir e sem label ao jogador.
 */
export const SPONSOR_REAL_PARTNERS = [
  'Tekno Cursos',
];

/** Compat: pesos derivados da lista interna de parceiros reais. */
export const SPONSOR_PARTNER_WEIGHTS = Object.fromEntries(
  SPONSOR_REAL_PARTNERS.map(name => [name, 3]),
);

/** Histórico recente de ofertas (localStorage) para forçar rotação entre partidas. */
const SPONSOR_OFFER_HISTORY_KEY = 'matchday-sponsor-offer-history';
const SPONSOR_OFFER_HISTORY_LIMIT = 28;

/** Slug do arquivo em assets/sponsors/icons/{slug}.png */
export const SPONSOR_LOGO_SLUG = {
  'Tekno Cursos': 'tekno-cursos',
  Nubanco: 'nubanco',
  Petrobraz: 'petrobraz',
  'Magazine Luizão': 'magazine-luizao',
  iFome: 'ifome',
  BetRegional: 'betregional',
  PicPaga: 'picpaga',
  Sheinpee: 'sheinpee',
  'Amazônia.com': 'amazonia-com',
  Googol: 'googol',
  Metagol: 'metagol',
  'Starbox Coffee': 'starbox-coffee',
  Havaianinhas: 'havaianinhas',
  Naike: 'naike',
  'Pumba Sport': 'pumba-sport',
  Perdigol: 'perdigol',
  Poweraid: 'poweraid',
  Playstação: 'playstacao',
  FedExpressão: 'fedexpressao',
};

export function sponsorLogoSlug(name) {
  return SPONSOR_LOGO_SLUG[name] || null;
}

export { SPONSOR_EXTERNAL_LINKS };

/** URL externa do patrocinador (ou null se não houver link). */
export function sponsorExternalUrl(name) {
  return sponsorExternalUrlBySlug(sponsorLogoSlug(name));
}

/** Valor do contrato por temporada (R$), conforme divisão. Calibrado v4 (ops ~0,95–1,10×). */
export const SPONSOR_VALUE_BY_DIVISION = {
  A: { master: [3_750_000, 5_300_000], secondary: [735_000, 1_065_000] },
  B: { master: [1_985_000, 3_015_000], secondary: [345_000, 530_000] },
  C: { master: [1_100_000, 1_640_000], secondary: [200_000, 310_000] },
  D: { master: [440_000, 760_000], secondary: [80_000, 152_000] },
};

function isRealSponsor(name) {
  return SPONSOR_REAL_PARTNERS.includes(name);
}

function sponsorPickWeight(name) {
  return isRealSponsor(name) ? 3 : 1;
}

function realSponsorsInPool() {
  return SPONSOR_REAL_PARTNERS.filter(name => SPONSOR_POOL.includes(name));
}

/**
 * Monta 7 nomes únicos: garante todos os parceiros reais, completa com o pool
 * e embaralha posições (real pode cair em Master ou Secundário).
 */
function pickOfferSponsorNames({
  count = 7,
  locked = [],
  random = Math.random,
  history = [],
} = {}) {
  const rng = typeof random === 'function' ? random : Math.random;
  const picked = [];
  const seen = new Set();
  const pushUnique = name => {
    if (!name || seen.has(name) || !SPONSOR_POOL.includes(name)) return;
    if (picked.length >= count) return;
    seen.add(name);
    picked.push(name);
  };

  // 1) Mantém seleções do jogador
  (Array.isArray(locked) ? locked : []).forEach(pushUnique);

  // 2) Garante parceiros reais (sempre na lista)
  shuffleCopy(realSponsorsInPool(), rng).forEach(pushUnique);

  // 3) Completa com o restante do pool (histórico só afeta fillers fictícios)
  const available = SPONSOR_POOL.filter(name => !seen.has(name));
  const weightOf = name => {
    if (isRealSponsor(name)) return 1;
    return recentOfferPenalty(name, history);
  };
  const need = Math.max(0, count - picked.length);
  weightedSampleUnique(shuffleCopy(available, rng), need, rng, weightOf).forEach(pushUnique);

  // Embaralha só os slots livres — locked permanece no prefixo para o caller montar roles.
  // Aqui retornamos lista completa; quem gera ofertas decide Master/Secundário.
  return picked.slice(0, count);
}

function loadSponsorOfferHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(SPONSOR_OFFER_HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(item => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function pushSponsorOfferHistory(names = []) {
  const prev = loadSponsorOfferHistory();
  const next = [...names, ...prev].slice(0, SPONSOR_OFFER_HISTORY_LIMIT);
  try {
    localStorage.setItem(SPONSOR_OFFER_HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

/** Penaliza marcas que já saíram recentemente nas ofertas. */
function recentOfferPenalty(name, history) {
  // Último pacote (7 ofertas): quase bloqueia repetição em Novo Jogo seguido.
  if (history.slice(0, 7).includes(name)) return 0.015;
  const count = history.filter(item => item === name).length;
  if (count <= 0) return 1;
  if (count === 1) return 0.22;
  if (count === 2) return 0.08;
  return 0.03;
}

function shuffleCopy(list, random = Math.random) {
  const pool = [...list];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const temp = pool[index];
    pool[index] = pool[swap];
    pool[swap] = temp;
  }
  return pool;
}

/** Amostra sem reposição com pesos (parceiros aparecem com mais frequência). */
function weightedSampleUnique(list, count, random = Math.random, weightOf = () => 1) {
  const pool = list.map(item => ({ item, weight: Math.max(0, Number(weightOf(item)) || 0) }));
  const picked = [];
  while (picked.length < count && pool.length) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    if (!(total > 0)) break;
    let ticket = random() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i += 1) {
      ticket -= pool[i].weight;
      if (ticket <= 0) {
        index = i;
        break;
      }
    }
    picked.push(pool[index].item);
    pool.splice(index, 1);
  }
  return picked;
}

/**
 * Pressão do pacote escolhido (0–1) vs teto da divisão.
 * Pacotes altos cobram mais da diretoria na meta da temporada.
 */
export function sponsorPackagePressure(total, division = 'A') {
  const ranges = SPONSOR_VALUE_BY_DIVISION[division] || SPONSOR_VALUE_BY_DIVISION.A;
  const minPack = ranges.master[0] + ranges.secondary[0] * 3;
  const maxPack = ranges.master[1] + ranges.secondary[1] * 3;
  const span = Math.max(1, maxPack - minPack);
  return Math.max(0, Math.min(1, (Number(total) - minPack) / span));
}

function valueInRange(range, random = Math.random) {
  const [min, max] = range;
  return Math.round(min + random() * (Math.max(min, max) - min));
}

function sponsorsAreValid(sponsors, season) {
  if (!sponsors || typeof sponsors !== 'object') return false;
  if (Number(sponsors.season) !== Number(season)) return false;
  if (!sponsors.master?.name || !Number.isFinite(Number(sponsors.master.value))) return false;
  if (!Array.isArray(sponsors.secondaries) || sponsors.secondaries.length !== 3) return false;
  const names = [sponsors.master.name, ...sponsors.secondaries.map(item => item?.name)];
  if (names.some(name => !SPONSOR_POOL.includes(name))) return false;
  if (new Set(names).size !== 4) return false;
  return sponsors.secondaries.every(item => item?.name && Number.isFinite(Number(item.value)));
}

/** Normaliza contrato de patrocínio para parcelas por rodada nacional. */
export function normalizeSponsorContract(sponsors, { installments } = {}) {
  if (!sponsors || typeof sponsors !== 'object') return null;
  const total = Math.max(0, Number(sponsors.total) || 0);
  const slots = Math.max(1, Number(installments) || Number(sponsors.installments) || 38);
  sponsors.installments = slots;
  const hasPaidAmount = Number.isFinite(Number(sponsors.paidAmount));
  // Save antigo: pacote creditado à vista — não recreditar.
  if (sponsors.credited && !hasPaidAmount) {
    sponsors.paidAmount = total;
    sponsors.paidInstallments = slots;
    sponsors.lastInstallmentRound = null;
    return sponsors;
  }
  sponsors.paidAmount = Math.max(0, Number(sponsors.paidAmount) || 0);
  sponsors.paidInstallments = Math.max(0, Number(sponsors.paidInstallments) || 0);
  if (total > 0 && sponsors.paidAmount >= total) sponsors.credited = true;
  return sponsors;
}

/** Valor da próxima parcela (0 se já quitado). */
export function estimateSponsorInstallment(club, options = {}) {
  const sponsors = club?.sponsors;
  if (!sponsors) return 0;
  normalizeSponsorContract(sponsors, { installments: options.installments });
  const total = Math.max(0, Number(sponsors.total) || 0);
  const slots = Math.max(1, Number(sponsors.installments) || 38);
  const paidInstallments = Number(sponsors.paidInstallments) || 0;
  const paidAmount = Number(sponsors.paidAmount) || 0;
  if (!(total > 0) || paidInstallments >= slots || paidAmount >= total) return 0;
  const nextIndex = paidInstallments + 1;
  const dueSoFar = nextIndex >= slots ? total : Math.floor((total * nextIndex) / slots);
  return Math.max(0, dueSoFar - paidAmount);
}

/**
 * Credita uma parcela de patrocínio (rodada nacional).
 * Idempotente por `round`. Soma das parcelas = total do contrato.
 */
export function creditSponsorInstallment(club, { round = null, installments = null } = {}) {
  if (!club?.sponsors) {
    return { ok: false, amount: 0, skipped: true };
  }
  normalizeSponsorContract(club.sponsors, {
    installments: installments ?? club.sponsors.installments,
  });
  const roundKey = Number.isFinite(Number(round)) ? Number(round) : null;
  if (roundKey != null && club.sponsors.lastInstallmentRound === roundKey) {
    return {
      ok: true,
      amount: 0,
      skipped: true,
      paidInstallments: club.sponsors.paidInstallments,
      paidAmount: club.sponsors.paidAmount,
    };
  }
  const amount = estimateSponsorInstallment(club);
  if (!(amount > 0)) {
    if ((Number(club.sponsors.total) || 0) > 0) club.sponsors.credited = true;
    return {
      ok: true,
      amount: 0,
      skipped: true,
      complete: true,
      paidInstallments: club.sponsors.paidInstallments,
      paidAmount: club.sponsors.paidAmount,
    };
  }
  const installmentIndex = (Number(club.sponsors.paidInstallments) || 0) + 1;
  const slots = club.sponsors.installments;
  credit(club, amount, {
    reason: 'sponsorship',
    label:
      roundKey != null
        ? `Patrocínio · Rodada ${roundKey}`
        : `Patrocínio · parcela ${installmentIndex}/${slots}`,
    meta: {
      installment: installmentIndex,
      installments: slots,
      total: club.sponsors.total,
      amount,
    },
  });
  club.sponsors.paidAmount = (Number(club.sponsors.paidAmount) || 0) + amount;
  club.sponsors.paidInstallments = installmentIndex;
  if (roundKey != null) club.sponsors.lastInstallmentRound = roundKey;
  if (club.sponsors.paidAmount >= (Number(club.sponsors.total) || 0)) {
    club.sponsors.credited = true;
  }
  club.lastSponsorInstallment = {
    amount,
    round: roundKey,
    installment: installmentIndex,
    installments: slots,
    at: new Date().toISOString(),
  };
  return {
    ok: true,
    amount,
    skipped: false,
    complete: !!club.sponsors.credited,
    paidInstallments: club.sponsors.paidInstallments,
    paidAmount: club.sponsors.paidAmount,
  };
}

/**
 * Credita naming do estádio (rodada nacional). Idempotente por `round`.
 */
export function creditNamingInstallment(club, { round = null, division = 'A', season = null } = {}) {
  const result = creditNamingRound(club, { round, division, season });
  if (!result.ok || result.skipped || !(result.amount > 0)) return result;
  const naming = getNamingRights(club);
  const mult = result.multiplier ?? 1;
  const pct = mult < 1 ? ` · ${Math.round(mult * 100)}%` : '';
  credit(club, result.amount, {
    reason: 'naming_rights',
    label:
      round != null
        ? `Naming · ${naming?.sponsor || 'Patrocinador'}${pct} · Rod. ${round}`
        : `Naming · ${naming?.sponsor || 'Patrocinador'}${pct}`,
    meta: {
      sponsor: naming?.sponsor,
      basePerRound: naming?.basePerRound,
      multiplier: mult,
      round,
      amount: result.amount,
    },
  });
  return result;
}

/**
 * Gera ofertas para o jogador escolher: 2 Master + 5 Secundários (nomes únicos).
 */
export function generateSponsorOffers({
  division = 'A',
  random = Math.random,
} = {}) {
  const ranges = SPONSOR_VALUE_BY_DIVISION[division] || SPONSOR_VALUE_BY_DIVISION.A;
  const rng = typeof random === 'function' ? random : Math.random;
  const history = loadSponsorOfferHistory();
  // Reais garantidos + fillers; shuffle total = Master/Secundário aleatório.
  const picked = shuffleCopy(
    pickOfferSponsorNames({ count: 7, locked: [], random: rng, history }),
    rng,
  );
  pushSponsorOfferHistory(picked);
  const master = picked.slice(0, 2).map(name => ({
    name,
    role: 'master',
    value: valueInRange(ranges.master, rng),
  }));
  master.sort((a, b) => b.value - a.value);
  if (master.length === 2 && master[0].value === master[1].value) {
    const bump = Math.max(50_000, Math.round((ranges.master[1] - ranges.master[0]) * 0.12));
    master[0].value = Math.min(ranges.master[1], master[0].value + bump);
  }
  const secondaries = picked.slice(2, 7).map(name => ({
    name,
    role: 'secondary',
    value: valueInRange(ranges.secondary, rng),
  }));
  secondaries.sort((a, b) => b.value - a.value);
  return { master, secondaries, division, reshufflesUsed: 0 };
}

/**
 * Resorteia só as ofertas não selecionadas (mantém Master/secundários já escolhidos).
 * Valores novos saem aleatórios na faixa da divisão (podem subir ou cair).
 */
export function reshuffleSponsorOffers({
  offers,
  keepMaster = null,
  keepSecondaryNames = [],
  random = Math.random,
} = {}) {
  if (!offers?.master?.length || !Array.isArray(offers.secondaries)) return offers;
  const division = offers.division || 'A';
  const ranges = SPONSOR_VALUE_BY_DIVISION[division] || SPONSOR_VALUE_BY_DIVISION.A;
  const rng = typeof random === 'function' ? random : Math.random;
  const keepSecs = new Set(
    (Array.isArray(keepSecondaryNames) ? keepSecondaryNames : []).filter(Boolean),
  );
  const keptMaster =
    keepMaster?.name
      ? (offers.master.find(item => item.name === keepMaster.name) || {
          name: keepMaster.name,
          role: 'master',
          value: Math.round(Number(keepMaster.value) || 0),
        })
      : null;
  const keptSecondaries = offers.secondaries.filter(item => keepSecs.has(item.name));
  const locked = new Set([
    ...(keptMaster?.name ? [keptMaster.name] : []),
    ...keptSecondaries.map(item => item.name),
  ]);
  const needMaster = Math.max(0, 2 - (keptMaster ? 1 : 0));
  const needSecondary = Math.max(0, 5 - keptSecondaries.length);
  const need = needMaster + needSecondary;
  const history = loadSponsorOfferHistory();
  // Reais que ainda não estão selecionados entram de novo nas ofertas livres.
  const allNames = pickOfferSponsorNames({
    count: 7,
    locked: [...locked],
    random: rng,
    history,
  });
  const freshNames = shuffleCopy(
    allNames.filter(name => !locked.has(name)),
    rng,
  ).slice(0, need);

  const freshMaster = freshNames.slice(0, needMaster).map(name => ({
    name,
    role: 'master',
    value: valueInRange(ranges.master, rng),
  }));
  const freshSecondaries = freshNames.slice(needMaster, needMaster + needSecondary).map(name => ({
    name,
    role: 'secondary',
    value: valueInRange(ranges.secondary, rng),
  }));

  const master = (keptMaster ? [keptMaster, ...freshMaster] : freshMaster)
    .filter(item => item?.name)
    .slice(0, 2)
    .sort((a, b) => b.value - a.value);
  if (master.length === 2 && master[0].value === master[1].value) {
    const bump = Math.max(50_000, Math.round((ranges.master[1] - ranges.master[0]) * 0.12));
    master[0].value = Math.min(ranges.master[1], master[0].value + bump);
  }
  const secondaries = [...keptSecondaries, ...freshSecondaries]
    .filter(item => item?.name)
    .slice(0, 5)
    .sort((a, b) => b.value - a.value);

  if (master.length !== 2 || secondaries.length !== 5) return offers;

  const used = Number(offers.reshufflesUsed) || 0;
  pushSponsorOfferHistory([
    ...master.map(item => item.name),
    ...secondaries.map(item => item.name),
  ]);
  return {
    division,
    master,
    secondaries,
    reshufflesUsed: used + 1,
  };
}

/**
 * Aplica a escolha do jogador (1 Master + exatamente 3 Secundários).
 */
export function applySponsorChoice(club, {
  master,
  secondaries,
  division = 'A',
  season = 2026,
  installments = 38,
} = {}) {
  if (!club || !master?.name || !Number.isFinite(Number(master.value))) return null;
  if (!Array.isArray(secondaries) || secondaries.length !== 3) return null;
  const names = [master.name, ...secondaries.map(item => item?.name)];
  if (names.some(name => !SPONSOR_POOL.includes(name))) return null;
  if (new Set(names).size !== 4) return null;
  if (!secondaries.every(item => item?.name && Number.isFinite(Number(item.value)))) return null;
  ensureBudget(club, division);
  const masterContract = { name: master.name, role: 'master', value: Math.round(Number(master.value)) };
  const secondaryContracts = secondaries.map(item => ({
    name: item.name,
    role: 'secondary',
    value: Math.round(Number(item.value)),
  }));
  const total = masterContract.value + secondaryContracts.reduce((sum, item) => sum + item.value, 0);
  const slots = Math.max(1, Number(installments) || 38);
  const pressure = sponsorPackagePressure(total, division);
  club.sponsors = {
    season,
    division,
    master: masterContract,
    secondaries: secondaryContracts,
    total,
    pressure,
    credited: false,
    installments: slots,
    paidAmount: 0,
    paidInstallments: 0,
    lastInstallmentRound: null,
  };
  return normalizeSponsorContract(club.sponsors, { installments: slots });
}

/**
 * Sorteia 4 nomes únicos do pool: 1 Master + 3 Secundários (legado / fallback).
 * Por padrão só monta o contrato (parcelas por rodada); `creditPackage` mantém o crédito à vista legado.
 */
export function assignSponsors(club, {
  division = 'A',
  season = 2026,
  random = Math.random,
  creditPackage = false,
  installments = 38,
} = {}) {
  if (!club) return null;
  const offers = generateSponsorOffers({ division, random });
  applySponsorChoice(club, {
    master: offers.master[0],
    secondaries: offers.secondaries.slice(0, 3),
    division,
    season,
    installments,
  });
  if (creditPackage && club.sponsors) {
    const total = club.sponsors.total;
    const slots = club.sponsors.installments;
    credit(club, total, {
      reason: 'sponsorship',
      label: `Patrocínios temporada ${season}`,
      meta: {
        master: club.sponsors.master.name,
        secondaries: club.sponsors.secondaries.map(item => item.name),
        total,
      },
    });
    club.sponsors.credited = true;
    club.sponsors.paidAmount = total;
    club.sponsors.paidInstallments = slots;
  }
  return club.sponsors;
}

/** Garante patrocínios da temporada atual; re-sorteia se inválidos ou temporada mudou. */
export function ensureSponsors(club, options = {}) {
  if (!club) return null;
  // Escolha pendente do jogador — não auto-atribuir.
  if (options.pendingChoice) return null;
  const season = options.season ?? 2026;
  const division = options.division || club.division || 'A';
  const installments = Math.max(1, Number(options.installments) || 38);
  if (options.savedSponsors && sponsorsAreValid(options.savedSponsors, season)) {
    club.sponsors = {
      ...options.savedSponsors,
      master: { ...options.savedSponsors.master },
      secondaries: options.savedSponsors.secondaries.map(item => ({ ...item })),
      division,
    };
    return normalizeSponsorContract(club.sponsors, { installments });
  }
  if (sponsorsAreValid(club.sponsors, season)) {
    club.sponsors.division = division;
    return normalizeSponsorContract(club.sponsors, { installments });
  }
  return assignSponsors(club, {
    division,
    season,
    random: options.random || Math.random,
    creditPackage: options.creditPackage === true,
    installments,
  });
}

/** Custo de Name Rights (renomear estádio) por divisão. */
export const NAME_RIGHTS_COST_BY_DIVISION = {
  A: 2_500_000,
  B: 1_500_000,
  C: 900_000,
  D: 450_000,
};

export function nameRightsCost(division = 'A') {
  return NAME_RIGHTS_COST_BY_DIVISION[division] ?? NAME_RIGHTS_COST_BY_DIVISION.C;
}

/**
 * Renomeia o estádio cobrando Name Rights.
 * @returns {{ ok: boolean, error?: string, balance?: number, name?: string, cost?: number }}
 */
export function purchaseStadiumNameRights(club, newName, { division = 'A' } = {}) {
  if (!club) return { ok: false, error: 'no_club' };
  const cleaned = String(newName || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  if (cleaned.length < 3) return { ok: false, error: 'invalid_name' };
  ensureStadium(club, division);
  if (cleaned === (club.stadiumName || '')) return { ok: false, error: 'same_name' };
  const cost = nameRightsCost(division);
  const result = spend(club, cost, {
    reason: 'name_rights',
    label: `Name Rights · ${cleaned}`,
    meta: { previousName: club.stadiumName || null, newName: cleaned, cost },
  });
  if (!result?.ok) return { ok: false, error: 'insufficient_funds', balance: getBalance(club), cost };
  club.stadiumName = cleaned;
  return { ok: true, balance: result.balance, name: cleaned, cost };
}

export function getSponsors(club) {
  return club?.sponsors || null;
}

/**
 * Pool de direitos de TV por temporada (R$).
 * Calibrado para cobrir parte da folha sem deixar o clube rico demais.
 */
/** Pool de TV por temporada. Calibrado v4 (ops ~0,95–1,10×). */
export const TV_VALUE_BY_DIVISION = {
  A: [3_680_000, 5_005_000],
  B: [1_840_000, 2_795_000],
  C: [1_020_000, 1_600_000],
  D: [400_000, 680_000],
};

/** Parcelas de TV = mandos de campo esperados na temporada nacional. */
export const TV_HOME_SLOTS_BY_DIVISION = {
  A: 19,
  B: 19,
  C: 19,
  D: 11,
};

export function tvHomeSlots(division = 'C') {
  return TV_HOME_SLOTS_BY_DIVISION[division] ?? TV_HOME_SLOTS_BY_DIVISION.C;
}

function tvRightsAreValid(tvRights, season) {
  if (!tvRights || typeof tvRights !== 'object') return false;
  if (Number(tvRights.season) !== Number(season)) return false;
  return Number.isFinite(Number(tvRights.total)) && Number(tvRights.total) > 0;
}

/** Normaliza contrato de TV para parcelas por mando de campo. */
export function normalizeTvRights(tvRights, { installments, division } = {}) {
  if (!tvRights || typeof tvRights !== 'object') return null;
  const total = Math.max(0, Number(tvRights.total) || 0);
  const homeSlots = tvHomeSlots(division || tvRights.division || 'C');
  let slots = Math.max(1, Number(installments) || Number(tvRights.installments) || homeSlots);
  // 22/38 = calendário nacional (legado); TV paga por mando (A/B/C: 19, D: 11).
  if (slots === 38 || slots === 22) {
    const migrating = !tvRights.homeMode;
    slots = homeSlots;
    if (migrating && total > 0) {
      const paidAmount = Math.max(0, Number(tvRights.paidAmount) || 0);
      tvRights.paidInstallments = Math.min(
        slots,
        Math.max(0, Math.round((paidAmount / total) * slots)),
      );
    }
  }
  tvRights.installments = slots;
  tvRights.homeMode = true;
  const hasPaidAmount = Number.isFinite(Number(tvRights.paidAmount));
  if (tvRights.credited && !hasPaidAmount) {
    tvRights.paidAmount = total;
    tvRights.paidInstallments = slots;
    tvRights.lastInstallmentRound = null;
    return tvRights;
  }
  tvRights.paidAmount = Math.max(0, Number(tvRights.paidAmount) || 0);
  tvRights.paidInstallments = Math.max(0, Number(tvRights.paidInstallments) || 0);
  if (total > 0 && tvRights.paidAmount >= total) tvRights.credited = true;
  return tvRights;
}

/** Valor da próxima parcela de TV (0 se já quitado). */
export function estimateTvInstallment(club, options = {}) {
  const tvRights = club?.tvRights;
  if (!tvRights) return 0;
  const division = options.division || club?.division || tvRights.division || 'C';
  normalizeTvRights(tvRights, {
    installments: options.installments ?? tvHomeSlots(division),
    division,
  });
  const total = Math.max(0, Number(tvRights.total) || 0);
  const slots = Math.max(1, Number(tvRights.installments) || tvHomeSlots(division));
  const paidInstallments = Number(tvRights.paidInstallments) || 0;
  const paidAmount = Number(tvRights.paidAmount) || 0;
  if (!(total > 0) || paidInstallments >= slots || paidAmount >= total) return 0;
  const nextIndex = paidInstallments + 1;
  const dueSoFar = nextIndex >= slots ? total : Math.floor((total * nextIndex) / slots);
  return Math.max(0, dueSoFar - paidAmount);
}

/**
 * Credita uma parcela de direitos de TV (por mando).
 * Preferir `creditHomeTv`. Idempotente por `homeGameKey` ou `round`.
 */
export function creditTvInstallment(
  club,
  { round = null, installments = null, homeGameKey = null, opponent = null, division = null } = {},
) {
  if (!club?.tvRights) {
    return { ok: false, amount: 0, skipped: true };
  }
  const div = division || club.division || club.tvRights.division || 'C';
  normalizeTvRights(club.tvRights, {
    installments: installments ?? tvHomeSlots(div),
    division: div,
  });
  const roundKey = Number.isFinite(Number(round)) ? Number(round) : null;
  if (homeGameKey && club.tvRights.lastHomeGameKey === homeGameKey) {
    return {
      ok: true,
      amount: 0,
      skipped: true,
      paidInstallments: club.tvRights.paidInstallments,
      paidAmount: club.tvRights.paidAmount,
    };
  }
  if (!homeGameKey && roundKey != null && club.tvRights.lastInstallmentRound === roundKey) {
    return {
      ok: true,
      amount: 0,
      skipped: true,
      paidInstallments: club.tvRights.paidInstallments,
      paidAmount: club.tvRights.paidAmount,
    };
  }
  const amount = estimateTvInstallment(club, { division: div, installments: club.tvRights.installments });
  if (!(amount > 0)) {
    if ((Number(club.tvRights.total) || 0) > 0) club.tvRights.credited = true;
    return {
      ok: true,
      amount: 0,
      skipped: true,
      complete: true,
      paidInstallments: club.tvRights.paidInstallments,
      paidAmount: club.tvRights.paidAmount,
    };
  }
  const installmentIndex = (Number(club.tvRights.paidInstallments) || 0) + 1;
  const slots = club.tvRights.installments;
  credit(club, amount, {
    reason: 'tv_rights',
    label: opponent
      ? `Direitos de TV · mando vs ${opponent}`
      : roundKey != null
        ? `Direitos de TV · Rodada ${roundKey}`
        : `Direitos de TV · mando ${installmentIndex}/${slots}`,
    meta: {
      installment: installmentIndex,
      installments: slots,
      total: club.tvRights.total,
      amount,
      opponent: opponent || null,
      home: true,
    },
  });
  club.tvRights.paidAmount = (Number(club.tvRights.paidAmount) || 0) + amount;
  club.tvRights.paidInstallments = installmentIndex;
  if (homeGameKey) club.tvRights.lastHomeGameKey = homeGameKey;
  if (roundKey != null) club.tvRights.lastInstallmentRound = roundKey;
  if (club.tvRights.paidAmount >= (Number(club.tvRights.total) || 0)) {
    club.tvRights.credited = true;
  }
  club.lastTvInstallment = {
    amount,
    round: roundKey,
    installment: installmentIndex,
    installments: slots,
    opponent: opponent || null,
    at: new Date().toISOString(),
  };
  return {
    ok: true,
    amount,
    skipped: false,
    complete: !!club.tvRights.credited,
    paidInstallments: club.tvRights.paidInstallments,
    paidAmount: club.tvRights.paidAmount,
  };
}

/**
 * Credita parcela de TV no mando de campo (jogador ou IA).
 * Só competição nacional — Copa não gera parcela de TV do pool da série.
 */
export function creditHomeTv(club, game, { division = null, season = null } = {}) {
  if (!club || !game) return { ok: false, amount: 0, skipped: true, reason: 'no_club' };
  if (game.home !== club.name) return { ok: false, amount: 0, skipped: true, reason: 'not_home' };
  if (game.competition === 'COPA DO BRASIL') {
    return { ok: false, amount: 0, skipped: true, reason: 'cup' };
  }
  if (game.tvCredited) return { ok: true, amount: 0, skipped: true, reason: 'already_credited' };

  const div = division || club.division || 'C';
  ensureBudget(club, div);
  ensureTvRights(club, {
    division: div,
    season: season ?? club.tvRights?.season ?? null,
    installments: tvHomeSlots(div),
  });

  const homeGameKey = [
    game.competition || 'LEAGUE',
    game.round ?? '',
    game.home,
    game.away,
    game.leg || '',
    game.phase || '',
  ].join('|');

  const result = creditTvInstallment(club, {
    round: game.round ?? null,
    installments: tvHomeSlots(div),
    division: div,
    homeGameKey,
    opponent: game.away,
  });

  if (result?.ok && (result.amount > 0 || result.complete)) {
    game.tvCredited = true;
    if (result.amount > 0) game.tvRevenue = result.amount;
  }
  return { ...result, homeGameKey };
}

/** Define o contrato de TV da temporada (sem crédito à vista). */
export function assignTvRights(club, {
  division = 'A',
  season = 2026,
  random = Math.random,
  installments = null,
} = {}) {
  if (!club) return null;
  ensureBudget(club, division);
  const range = TV_VALUE_BY_DIVISION[division] || TV_VALUE_BY_DIVISION.A;
  const total = valueInRange(range, random);
  const slots = Math.max(1, Number(installments) || tvHomeSlots(division));
  club.tvRights = {
    season,
    division,
    total,
    credited: false,
    homeMode: true,
    installments: slots,
    paidAmount: 0,
    paidInstallments: 0,
    lastInstallmentRound: null,
    lastHomeGameKey: null,
  };
  return club.tvRights;
}

/** Garante direitos de TV da temporada; re-sorteia se inválidos ou temporada mudou. */
export function ensureTvRights(club, options = {}) {
  if (!club) return null;
  const season = options.season ?? 2026;
  const division = options.division || club.division || 'A';
  const installments = Math.max(1, Number(options.installments) || tvHomeSlots(division));
  if (options.savedTvRights && tvRightsAreValid(options.savedTvRights, season)) {
    club.tvRights = { ...options.savedTvRights, division };
    return normalizeTvRights(club.tvRights, { installments, division });
  }
  if (tvRightsAreValid(club.tvRights, season)) {
    club.tvRights.division = division;
    return normalizeTvRights(club.tvRights, { installments, division });
  }
  return assignTvRights(club, {
    division,
    season,
    random: options.random || Math.random,
    installments,
  });
}

export function getTvRights(club) {
  return club?.tvRights || null;
}

/** Saldo de direitos de TV ainda não creditado (R$). */
export function estimateTvRemaining(club, options = {}) {
  const tvRights = club?.tvRights;
  if (!tvRights) return 0;
  const division = options.division || club?.division || tvRights.division || 'C';
  normalizeTvRights(tvRights, {
    installments: options.installments ?? tvHomeSlots(division),
    division,
  });
  const total = Math.max(0, Number(tvRights.total) || 0);
  const paidAmount = Math.max(0, Number(tvRights.paidAmount) || 0);
  return Math.max(0, total - paidAmount);
}

/** Deságio mínimo do adiantamento de TV (crise, ainda no azul). */
export const TV_ADVANCE_HAIRCUT_BASE = 0.2;
/** Deságio com caixa negativo. */
export const TV_ADVANCE_HAIRCUT_RED = 0.25;
/** Deságio com empréstimo em atraso. */
export const TV_ADVANCE_HAIRCUT_DELINQUENT = 0.28;
/** Saldo mínimo restante para liberar adiantamento. */
export const TV_ADVANCE_MIN_REMAINING = 50_000;

/**
 * Crisis gate: adiantamento só sob pressão (não farm no dia 1).
 * 1× por temporada — mandos futuros de TV deixam de pagar.
 */
export function resolveTvAdvanceHaircut(club) {
  const cash = getBalance(club);
  const loan = getBankLoan(club);
  const delinquent = Math.max(0, Math.round(Number(loan?.delinquencyStreak) || 0)) >= 1;
  let haircut = TV_ADVANCE_HAIRCUT_BASE;
  if (cash < 0) haircut = Math.max(haircut, TV_ADVANCE_HAIRCUT_RED);
  if (delinquent) haircut = Math.max(haircut, TV_ADVANCE_HAIRCUT_DELINQUENT);
  return Math.round(haircut * 1000) / 1000;
}

export function isTvAdvanceCrisis(club) {
  if (!club) return false;
  if (getBalance(club) < 0) return true;
  if (club.warnedInsolvent) return true;
  const loan = getBankLoan(club);
  if (Math.max(0, Math.round(Number(loan?.delinquencyStreak) || 0)) >= 1) return true;
  if (Math.max(0, Math.round(Number(club.overdraftStreak) || 0)) >= 2) return true;
  return false;
}

/** Cotação / elegibilidade do adiantamento de direitos de TV. */
export function tvAdvanceStatus(club, options = {}) {
  const remaining = estimateTvRemaining(club, options);
  const haircut = resolveTvAdvanceHaircut(club);
  const payout = Math.max(0, Math.round(remaining * (1 - haircut)));
  const discount = Math.max(0, remaining - payout);
  const already = !!(club?.tvRights?.advancedAt || club?.tvRights?.advanced);
  const crisis = isTvAdvanceCrisis(club);
  let reason = null;
  if (already) reason = 'already_advanced';
  else if (!(remaining >= TV_ADVANCE_MIN_REMAINING)) reason = 'no_remaining';
  else if (!crisis) reason = 'not_in_crisis';
  return {
    remaining,
    haircut,
    haircutPct: Math.round(haircut * 1000) / 10,
    payout,
    discount,
    already,
    crisis,
    eligible: !reason,
    reason,
    advancedAt: club?.tvRights?.advancedAt || null,
    advancedGross: Number(club?.tvRights?.advancedGross) || 0,
    advancedNet: Number(club?.tvRights?.advancedNet) || 0,
    advancedHaircut: Number(club?.tvRights?.advancedHaircut) || 0,
  };
}

/**
 * Adianta o saldo restante de direitos de TV com deságio.
 * Credita o líquido e marca o contrato como quitado (sem parcelas futuras).
 */
export function advanceTvRights(club, options = {}) {
  if (!club) return { ok: false, reason: 'no_club' };
  const division = options.division || club.division || club.tvRights?.division || 'C';
  ensureBudget(club, division);
  ensureTvRights(club, {
    division,
    season: options.season ?? club.tvRights?.season ?? null,
    installments: options.installments ?? tvHomeSlots(division),
  });
  const status = tvAdvanceStatus(club, { division, installments: club.tvRights?.installments });
  if (!status.eligible) {
    return { ok: false, reason: status.reason, ...status };
  }
  const { remaining, haircut, payout, discount } = status;
  const credited = credit(club, payout, {
    reason: 'tv_advance',
    label: `Adiantamento de TV (−${Math.round(haircut * 100)}%)`,
    meta: {
      gross: remaining,
      net: payout,
      discount,
      haircut,
      season: club.tvRights.season,
      division,
      round: options.round ?? null,
    },
  });
  if (!credited?.ok) {
    return { ok: false, reason: 'credit_failed', remaining, haircut, payout };
  }
  const slots = Math.max(1, Number(club.tvRights.installments) || tvHomeSlots(division));
  club.tvRights.paidAmount = Math.max(0, Number(club.tvRights.total) || 0);
  club.tvRights.paidInstallments = slots;
  club.tvRights.credited = true;
  club.tvRights.advanced = true;
  club.tvRights.advancedAt = new Date().toISOString();
  club.tvRights.advancedRound =
    Number.isFinite(Number(options.round)) ? Number(options.round) : null;
  club.tvRights.advancedGross = remaining;
  club.tvRights.advancedNet = payout;
  club.tvRights.advancedHaircut = haircut;
  club.lastTvAdvance = {
    gross: remaining,
    net: payout,
    discount,
    haircut,
    round: club.tvRights.advancedRound,
    at: club.tvRights.advancedAt,
  };
  return {
    ok: true,
    remaining,
    haircut,
    haircutPct: Math.round(haircut * 1000) / 10,
    payout,
    discount,
    clubBalance: getBalance(club),
    advancedAt: club.tvRights.advancedAt,
  };
}

export {
  BANK_LOAN_RATE_BY_DIVISION,
  BANK_LOAN_MIN_AMORT_RATIO,
  BANK_LOAN_MIN_FINANCES,
  bankLoanRate,
  clubFinancesScore,
  bankCreditFactor,
  bankRateMultiplier,
  resolveBankCredit,
  bankLoanStatus,
  bankLoanBalance,
  getBankLoan,
  serializeBankLoan,
  applyBankLoanSnapshot,
  takeBankLoan,
  repayBankLoan,
  payBankLoanMinimum,
  serviceBankLoan,
  clearBankLoan,
  BANK_LOAN_LATE_FEE_RATIO,
  BANK_LOAN_FORCE_COLLECT_STREAK,
  loanDelinquencyRateMult,
  OVERDRAFT_PREMIUM_BASE,
  OVERDRAFT_PREMIUM_WITH_LOAN,
  overdraftStreakMultiplier,
  resolveOverdraftRate,
} from './bank-loan.js';

export function createEconomyEngine() {
  return {
    moduleVersion: MODULE_VERSIONS.economy,
    INITIAL_BUDGET_BY_DIVISION,
    STADIUM_CAPACITY_BY_DIVISION,
    TICKET_PRICE_RANGE,
    GATE_REVENUE_SCALE,
    PITCH_TIERS,
    SPONSOR_POOL,
    SPONSOR_REAL_PARTNERS,
    SPONSOR_PARTNER_WEIGHTS,
    SPONSOR_LOGO_SLUG,
    sponsorLogoSlug,
    SPONSOR_EXTERNAL_LINKS,
    sponsorExternalUrl,
    sponsorPackagePressure,
    SPONSOR_VALUE_BY_DIVISION,
    TV_VALUE_BY_DIVISION,
    CLUB_UPGRADES,
    STADIUM_UPGRADES,
    initialBudget,
    formatBudget,
    formatCapacity,
    formatTicketPrice,
    computeSeasonPrize,
    resolveSerieDPrizePhase,
    resolveCupPrizePhase,
    generateSponsorOffers,
    reshuffleSponsorOffers,
    applySponsorChoice,
    nameRightsCost,
    purchaseStadiumNameRights,
    PARTICIPATION_PRIZE,
    POSITION_POOL,
    TITLE_BONUS,
    PROMOTION_BONUS,
    SERIE_D_PHASE_POOL,
    SERIE_D_PHASE_SHARE,
    CUP_PHASE_POOL,
    CUP_PHASE_SHARE,
    NAME_RIGHTS_COST_BY_DIVISION,
    getBalance,
    ensureBudget,
    ensureStadium,
    getStructureLevel,
    getPitchLevel,
    setPitchLevel,
    maxPitchForStructure,
    pitchTierLabel,
    ensureSponsors,
    assignSponsors,
    getSponsors,
    normalizeSponsorContract,
    estimateSponsorInstallment,
    creditSponsorInstallment,
    creditNamingInstallment,
    generateNamingOffers,
    assignNamingContract,
    estimateNamingRound,
    getNamingRights,
    namingStatusLabel,
    namingPenaltyMultiplier,
    SPONSOR_POOL,
    ensureSeasonCashflow,
    getSeasonCashflowStatement,
    ensureTvRights,
    assignTvRights,
    getTvRights,
    normalizeTvRights,
    estimateTvInstallment,
    estimateTvRemaining,
    tvAdvanceStatus,
    advanceTvRights,
    resolveTvAdvanceHaircut,
    isTvAdvanceCrisis,
    TV_ADVANCE_HAIRCUT_BASE,
    TV_ADVANCE_HAIRCUT_RED,
    TV_ADVANCE_HAIRCUT_DELINQUENT,
    TV_ADVANCE_MIN_REMAINING,
    creditTvInstallment,
    creditHomeTv,
    tvHomeSlots,
    TV_HOME_SLOTS_BY_DIVISION,
    canAfford,
    credit,
    spend,
    WAGE_BASE_BY_DIVISION,
    WAGE_BILL_SOFT_CAP,
    STAFF_BASE_BY_DIVISION,
    STAFF_BILL_SOFT_CAP,
    STAFF_DIVISION_PRESTIGE,
    computeStaffWageScore,
    computeStaffBillFromScore,
    ensureStaffContract,
    STADIUM_OPS_BASE_BY_DIVISION,
    STADIUM_OPS_SOFT_CAP,
    estimatePlayerWage,
    resolvePlayerRoundWage,
    estimateWageBill,
    estimateRoundRecurringRevenue,
    financesPayrollFactor,
    evaluateRosterPayroll,
    softEnvelopeFromPayroll,
    softCashEnvelope,
    ROSTER_HARD_MAX,
    estimateStaffBill,
    estimateStadiumOpsBill,
    estimateRoundCostBill,
    estimateWageRunway,
    chargeRoundCosts,
    serviceOverdraft,
    isOverdrawn,
    OVERDRAFT_RATE_BY_DIVISION,
    OVERDRAFT_PREMIUM_BASE,
    OVERDRAFT_PREMIUM_WITH_LOAN,
    overdraftStreakMultiplier,
    resolveOverdraftRate,
    chargeWageBill,
    upgradeCost,
    getUpgrade,
    listUpgrades,
    listStadiumUpgrades,
    purchaseUpgrade,
    purchaseStadiumUpgrade,
    computeSectorBreakdown,
    canOfferStadiumNaming,
    getStadiumInvestments,
    structureLevelLabel,
    getTicketPrices,
    adjustTicketPrice,
    setTicketPrice,
    estimateFillRate,
    estimateGateReceipt,
    competitionAttraction,
    computeMatchAttendance,
    attachMatchAttendance,
    ticketChannelFromGame,
    creditHomeGate,
  };
}
