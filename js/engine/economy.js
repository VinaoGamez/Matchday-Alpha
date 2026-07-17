import { MODULE_VERSIONS } from '../core/constants.js';

/** Orçamento inicial por divisão (R$ fictícios). */
export const INITIAL_BUDGET_BY_DIVISION = {
  A: 18_000_000,
  B: 12_000_000,
  C: 8_000_000,
  D: 5_000_000,
};

/** Capacidade inicial e teto por divisão. */
export const STADIUM_CAPACITY_BY_DIVISION = {
  A: { base: 42_000, max: 75_000, step: 8_000 },
  B: { base: 28_000, max: 55_000, step: 6_000 },
  C: { base: 18_000, max: 40_000, step: 5_000 },
  D: { base: 12_000, max: 28_000, step: 4_000 },
};

/** Faixas de preço de ingresso (R$). */
export const TICKET_PRICE_RANGE = {
  national: { min: 20, max: 120, step: 5, default: 45 },
  cups: { min: 30, max: 180, step: 5, default: 65 },
};

const PARTICIPATION_PRIZE = { A: 2_500_000, B: 1_800_000, C: 1_200_000, D: 800_000 };
const POSITION_POOL = { A: 12_000_000, B: 8_000_000, C: 5_000_000, D: 3_000_000 };
const TITLE_BONUS = { A: 15_000_000, B: 10_000_000, C: 6_000_000, D: 4_000_000 };

/** Histórico curto no clube — evita crescimento infinito do save. */
const LEDGER_LIMIT = 40;

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
  const amount = Math.max(0, Math.round(Number(value) || 0));
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    const text = millions >= 10 ? Math.round(millions).toString() : millions.toFixed(1).replace('.', ',');
    return `R$ ${text} mi`;
  }
  if (amount >= 1_000) return `R$ ${Math.round(amount / 1_000)} mil`;
  return `R$ ${amount.toLocaleString('pt-BR')}`;
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
 */
export function computeSeasonPrize({
  division = 'A',
  position = 10,
  totalTeams = 20,
  champion = null,
  cupChampion = null,
  promoted = false,
  userClub = '',
}) {
  const lines = [];
  let total = 0;

  const participation = PARTICIPATION_PRIZE[division] ?? 1_000_000;
  total += participation;
  lines.push({ label: 'Premiação por participação', amount: participation });

  const pool = POSITION_POOL[division] ?? 4_000_000;
  const rankFactor = Math.max(0, (totalTeams - position + 1) / totalTeams);
  const positionPrize = Math.round(pool * rankFactor);
  if (positionPrize > 0) {
    total += positionPrize;
    lines.push({ label: `${position}º lugar · Brasileirão Série ${division}`, amount: positionPrize });
  }

  if (champion === userClub) {
    const bonus = TITLE_BONUS[division] ?? 5_000_000;
    total += bonus;
    lines.push({ label: 'Bônus de campeão', amount: bonus });
  }

  if (cupChampion === userClub) {
    total += 8_000_000;
    lines.push({ label: 'Copa do Brasil · campeão', amount: 8_000_000 });
  }

  if (promoted) {
    total += 3_000_000;
    lines.push({ label: 'Bônus de acesso', amount: 3_000_000 });
  }

  return { total, lines };
}

export function getBalance(club) {
  return Math.max(0, Math.round(Number(club?.budget) || 0));
}

/** Garante budget numérico; migra saves antigos sem o campo. */
export function ensureBudget(club, division = 'A') {
  if (!club || typeof club !== 'object') return 0;
  if (!Number.isFinite(Number(club.budget))) {
    club.budget = initialBudget(division);
  } else {
    club.budget = Math.max(0, Math.round(Number(club.budget)));
  }
  if (!Array.isArray(club.budgetLedger)) club.budgetLedger = [];
  return club.budget;
}

/** Garante campos do estádio (capacidade, estrutura, gramado, ingressos). */
export function ensureStadium(club, division = 'A') {
  if (!club || typeof club !== 'object') return null;
  const cfg = STADIUM_CAPACITY_BY_DIVISION[division] || STADIUM_CAPACITY_BY_DIVISION.A;
  if (!Number.isFinite(Number(club.stadiumCapacityLevel))) {
    club.stadiumCapacityLevel = 0;
  } else {
    club.stadiumCapacityLevel = Math.max(0, Math.min(5, Math.round(Number(club.stadiumCapacityLevel))));
  }
  if (!Number.isFinite(Number(club.stadiumCapacity))) {
    club.stadiumCapacity = cfg.base + club.stadiumCapacityLevel * cfg.step;
  } else {
    club.stadiumCapacity = Math.max(cfg.base, Math.min(cfg.max, Math.round(Number(club.stadiumCapacity))));
  }
  if (!Number.isFinite(Number(club.stadiumStructure))) {
    // Usuário legado com gramado médio (2) precisa de estrutura ≥ 1.
    const migratedPitch = getPitchLevel(club);
    club.stadiumStructure = Math.max(1, migratedPitch - 1);
  } else {
    club.stadiumStructure = getStructureLevel(club);
  }
  const pitchLevel = getPitchLevel(club);
  const pitchCeiling = maxPitchForStructure(club.stadiumStructure);
  if (pitchLevel > pitchCeiling) {
    club.stadiumStructure = Math.min(5, Math.max(club.stadiumStructure, pitchLevel - 1));
  }
  setPitchLevel(club, Math.min(getPitchLevel(club), maxPitchForStructure(club.stadiumStructure)));
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
  return {
    name: club.stadiumName,
    capacity: club.stadiumCapacity,
    capacityLevel: club.stadiumCapacityLevel,
    structure: club.stadiumStructure,
    pitchLevel: club.pitchLevel,
    pitchCondition: club.pitchCondition,
    ticketPrices: { ...club.ticketPrices },
  };
}

function clampTicket(channel, value) {
  const range = TICKET_PRICE_RANGE[channel] || TICKET_PRICE_RANGE.national;
  const amount = Math.round(Number(value) || range.default);
  return Math.max(range.min, Math.min(range.max, amount));
}

export function canAfford(club, amount) {
  const cost = Math.max(0, Math.round(Number(amount) || 0));
  return getBalance(club) >= cost;
}

function pushLedger(club, entry) {
  if (!club) return;
  if (!Array.isArray(club.budgetLedger)) club.budgetLedger = [];
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

export function spend(club, amount, { reason = 'spend', label = 'Despesa', meta = null } = {}) {
  ensureBudget(club);
  const value = Math.max(0, Math.round(Number(amount) || 0));
  if (!canAfford(club, value)) {
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
    meta,
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

/** Lista upgrades do Estádio (gramado / capacidade). */
export function listStadiumUpgrades(club) {
  return listCatalog(STADIUM_UPGRADES, club);
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

export function purchaseStadiumUpgrade(club, upgradeId) {
  if (!STADIUM_UPGRADES[upgradeId]) return { ok: false, error: 'unknown_upgrade' };
  return purchaseUpgrade(club, upgradeId);
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

/**
 * Taxa de ocupação estimada: preço alto reduz público; apoio da torcida ajuda.
 * Canal: 'national' | 'cups'
 */
export function estimateFillRate(club, channel = 'national') {
  ensureStadium(club, club?.division || 'A');
  const range = TICKET_PRICE_RANGE[channel] || TICKET_PRICE_RANGE.national;
  const price = club.ticketPrices[channel] ?? range.default;
  const priceFactor = 1 - ((price - range.min) / (range.max - range.min)) * 0.42;
  const support = Math.max(0, Math.min(100, Number(club.support) || 60));
  const supportBoost = (support - 50) / 220;
  const cupBoost = channel === 'cups' ? 0.06 : 0;
  return Math.max(0.38, Math.min(0.98, 0.72 * priceFactor + supportBoost + cupBoost));
}

/** Estimativa de bilheteria de um jogo em casa. */
export function estimateGateReceipt(club, { channel = 'national', division = 'A' } = {}) {
  ensureStadium(club, division);
  const fill = estimateFillRate(club, channel);
  const attendance = Math.round(club.stadiumCapacity * fill);
  const price = club.ticketPrices[channel] ?? TICKET_PRICE_RANGE[channel].default;
  const revenue = Math.round(attendance * price);
  return { channel, attendance, fillRate: fill, price, revenue, capacity: club.stadiumCapacity };
}

export function ticketChannelFromGame(game) {
  if (!game) return 'national';
  if (game.competition === 'COPA DO BRASIL' || game.competition === 'COPA') return 'cups';
  return 'national';
}

/** Credita bilheteria de jogo em casa do usuário. */
export function creditHomeGate(club, game, { division = 'A' } = {}) {
  if (!club || !game || game.home !== club.name) {
    return { ok: false, error: 'not_home' };
  }
  const channel = ticketChannelFromGame(game);
  const estimate = estimateGateReceipt(club, { channel, division });
  const label =
    channel === 'cups'
      ? `Bilheteria · Copa (${estimate.attendance.toLocaleString('pt-BR')} pág.)`
      : `Bilheteria · Nacional (${estimate.attendance.toLocaleString('pt-BR')} pág.)`;
  return credit(club, estimate.revenue, {
    reason: 'gate_receipt',
    label,
    meta: { ...estimate, opponent: game.away, competition: game.competition || 'LEAGUE' },
  });
}

/** Pool único — qualquer nome pode ser Master ou Secundário. */
export const SPONSOR_POOL = [
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

/** Valor do contrato por temporada (R$), conforme divisão. */
export const SPONSOR_VALUE_BY_DIVISION = {
  A: { master: [9_000_000, 12_000_000], secondary: [1_800_000, 2_500_000] },
  B: { master: [5_000_000, 7_000_000], secondary: [900_000, 1_300_000] },
  C: { master: [2_500_000, 3_500_000], secondary: [450_000, 700_000] },
  D: { master: [1_000_000, 1_600_000], secondary: [200_000, 350_000] },
};

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

/**
 * Sorteia 4 nomes únicos do pool: 1 Master + 3 Secundários.
 * Credita o pacote da temporada se ainda não foi creditado.
 */
export function assignSponsors(club, {
  division = 'A',
  season = 2026,
  random = Math.random,
  creditPackage = true,
} = {}) {
  if (!club) return null;
  ensureBudget(club, division);
  const ranges = SPONSOR_VALUE_BY_DIVISION[division] || SPONSOR_VALUE_BY_DIVISION.A;
  const picked = shuffleCopy(SPONSOR_POOL, random).slice(0, 4);
  const master = { name: picked[0], role: 'master', value: valueInRange(ranges.master, random) };
  const secondaries = picked.slice(1).map(name => ({
    name,
    role: 'secondary',
    value: valueInRange(ranges.secondary, random),
  }));
  const total = master.value + secondaries.reduce((sum, item) => sum + item.value, 0);
  club.sponsors = {
    season,
    division,
    master,
    secondaries,
    total,
    credited: false,
  };
  if (creditPackage) {
    credit(club, total, {
      reason: 'sponsorship',
      label: `Patrocínios temporada ${season}`,
      meta: {
        master: master.name,
        secondaries: secondaries.map(item => item.name),
        total,
      },
    });
    club.sponsors.credited = true;
  }
  return club.sponsors;
}

/** Garante patrocínios da temporada atual; re-sorteia se inválidos ou temporada mudou. */
export function ensureSponsors(club, options = {}) {
  if (!club) return null;
  const season = options.season ?? 2026;
  const division = options.division || club.division || 'A';
  if (options.savedSponsors && sponsorsAreValid(options.savedSponsors, season)) {
    club.sponsors = {
      ...options.savedSponsors,
      master: { ...options.savedSponsors.master },
      secondaries: options.savedSponsors.secondaries.map(item => ({ ...item })),
      division,
    };
    return club.sponsors;
  }
  if (sponsorsAreValid(club.sponsors, season)) {
    club.sponsors.division = division;
    return club.sponsors;
  }
  return assignSponsors(club, {
    division,
    season,
    random: options.random || Math.random,
    creditPackage: options.creditPackage !== false,
  });
}

export function getSponsors(club) {
  return club?.sponsors || null;
}

export function createEconomyEngine() {
  return {
    moduleVersion: MODULE_VERSIONS.economy,
    INITIAL_BUDGET_BY_DIVISION,
    STADIUM_CAPACITY_BY_DIVISION,
    TICKET_PRICE_RANGE,
    PITCH_TIERS,
    SPONSOR_POOL,
    SPONSOR_VALUE_BY_DIVISION,
    CLUB_UPGRADES,
    STADIUM_UPGRADES,
    initialBudget,
    formatBudget,
    formatCapacity,
    formatTicketPrice,
    computeSeasonPrize,
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
    canAfford,
    credit,
    spend,
    upgradeCost,
    getUpgrade,
    listUpgrades,
    listStadiumUpgrades,
    purchaseUpgrade,
    purchaseStadiumUpgrade,
    getTicketPrices,
    adjustTicketPrice,
    setTicketPrice,
    estimateFillRate,
    estimateGateReceipt,
    ticketChannelFromGame,
    creditHomeGate,
  };
}
