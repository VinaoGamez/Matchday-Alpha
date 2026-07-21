/**
 * Estádio por setores — estrutura destrava setores; capacidade = soma dos setores.
 * Funções puras (sem import de economy.js — evita ciclo).
 */
export const STADIUM_SECTOR_MODEL = 2;

export const DIVISION_STADIUM_SCALE = { A: 1, B: 0.8, C: 0.65, D: 0.55 };
/** Custo de investimento no estádio — divisões menores pagam menos (payback alinhado). */
export const DIVISION_STADIUM_COST_SCALE = { A: 1, B: 0.9, C: 0.75, D: 0.42 };
export const DIVISION_CAPACITY_CAP = { A: 75_000, B: 45_000, C: 28_000, D: 18_000 };

export const DIVISION_SECTOR_ALLOW = {
  A: ['popular', 'stands', 'seats', 'boxes', 'vip'],
  B: ['popular', 'stands', 'seats', 'boxes'],
  C: ['popular', 'stands', 'seats'],
  D: ['popular', 'stands'],
};

export const STADIUM_STRUCTURE_LABELS = [
  'Básico',
  'Regular',
  'Intermediário',
  'Moderno',
  'Avançado',
  'Arena premium',
];

export const STRUCTURE_SECTOR_CAPS = [
  { popular: 1, stands: 0, seats: 0, boxes: 0, vip: 0 },
  { popular: 2, stands: 0, seats: 0, boxes: 0, vip: 0 },
  { popular: 3, stands: 3, seats: 0, boxes: 0, vip: 0 },
  { popular: 3, stands: 3, seats: 2, boxes: 0, vip: 0 },
  { popular: 3, stands: 3, seats: 2, boxes: 2, vip: 0 },
  { popular: 3, stands: 3, seats: 2, boxes: 2, vip: 1 },
];

export const STADIUM_SECTOR_DEFS = {
  popular: {
    id: 'popular',
    label: 'Popular',
    shortLabel: 'POPULAR',
    description: 'Geral — alta densidade, ticket mais baixo.',
    maxLevel: 3,
    unlockStructure: 0,
    baselineLevel: 1,
    seatsPerLevel: 4000,
    baselineSeats: { A: 8000, B: 6000, C: 4500, D: 3000 },
    priceMultiplier: 1,
    opsPerThousand: 180,
    fillBias: 1.05,
    baseCost: 800_000,
    costPerLevel: 400_000,
  },
  stands: {
    id: 'stands',
    label: 'Arquibancada',
    shortLabel: 'ARQUIB.',
    description: 'Norte/Sul sentados — exige estrutura intermediária.',
    maxLevel: 3,
    unlockStructure: 2,
    baselineLevel: 0,
    seatsPerLevel: 6000,
    priceMultiplier: 1.15,
    opsPerThousand: 220,
    fillBias: 1,
    baseCost: 1_500_000,
    costPerLevel: 700_000,
  },
  seats: {
    id: 'seats',
    label: 'Cadeiras numeradas',
    shortLabel: 'CADEIRAS',
    description: 'Laterais numeradas — exige estrutura moderna.',
    maxLevel: 2,
    unlockStructure: 3,
    baselineLevel: 0,
    seatsPerLevel: 5000,
    priceMultiplier: 1.4,
    opsPerThousand: 280,
    fillBias: 0.95,
    baseCost: 2_200_000,
    costPerLevel: 900_000,
  },
  boxes: {
    id: 'boxes',
    label: 'Camarotes',
    shortLabel: 'CAMAROTES',
    description: 'Suites e skybox — exige estrutura avançada.',
    maxLevel: 2,
    unlockStructure: 4,
    baselineLevel: 0,
    seatsPerLevel: 800,
    priceMultiplier: 2.8,
    opsPerThousand: 420,
    fillBias: 0.82,
    baseCost: 3_500_000,
    costPerLevel: 1_200_000,
  },
  vip: {
    id: 'vip',
    label: 'VIP / Hospitality',
    shortLabel: 'VIP',
    description: 'Hospitalidade premium — arena nível máximo.',
    maxLevel: 1,
    unlockStructure: 5,
    baselineLevel: 0,
    seatsPerLevel: 400,
    priceMultiplier: 4.5,
    opsPerThousand: 650,
    fillBias: 0.68,
    baseCost: 5_000_000,
    costPerLevel: 0,
  },
};

export const STRUCTURE_UPGRADE = {
  id: 'structure',
  label: 'Estrutura do estádio',
  shortLabel: 'ESTRUTURA',
  description: 'Certificação do arena — destrava setores e teto do gramado.',
  maxLevel: 5,
  baseCost: 1_800_000,
  costPerLevel: 700_000,
};

export const PITCH_SECTOR_UPGRADE = {
  id: 'pitch',
  label: 'Manutenção do gramado',
  shortLabel: 'GRAMADO',
  description: 'Qualidade do campo — teto depende da estrutura.',
  maxLevel: 5,
  baseCost: 900_000,
  costPerLevel: 450_000,
};

const OPS_BASE = { A: 18_000, B: 12_000, C: 8_000, D: 5_000 };
const OPS_STRUCTURE = 2_500;
const OPS_PITCH = 2_000;
const OPS_CAP = { A: 75_000, B: 50_000, C: 35_000, D: 22_000 };

export function structureLevelLabel(level) {
  const n = Math.max(0, Math.min(5, Math.round(Number(level) || 0)));
  return STADIUM_STRUCTURE_LABELS[n] || STADIUM_STRUCTURE_LABELS[0];
}

export function getSectorStructureLevel(club) {
  return Math.max(0, Math.min(5, Math.round(Number(club?.stadiumStructure) || 0)));
}

export function maxPitchForSectorStructure(structureLevel = 0) {
  const structure = Math.max(0, Math.min(5, Math.round(Number(structureLevel) || 0)));
  return Math.min(5, Math.max(1, structure + 1));
}

export function divisionAllowsSector(division = 'A', sectorId) {
  return (DIVISION_SECTOR_ALLOW[division] || DIVISION_SECTOR_ALLOW.A).includes(sectorId);
}

export function maxSectorLevelForStructure(sectorId, structureLevel) {
  const caps = STRUCTURE_SECTOR_CAPS[Math.max(0, Math.min(5, Math.round(Number(structureLevel) || 0)))];
  return caps?.[sectorId] ?? 0;
}

export function maxSectorLevelForDivision(division, sectorId) {
  const def = STADIUM_SECTOR_DEFS[sectorId];
  if (!def || !divisionAllowsSector(division, sectorId)) return 0;
  if (division === 'B' && sectorId === 'boxes') return Math.min(def.maxLevel, 1);
  return def.maxLevel;
}

export function effectiveSectorMax(club, division, sectorId) {
  const structure = getSectorStructureLevel(club);
  return Math.min(
    maxSectorLevelForStructure(sectorId, structure),
    maxSectorLevelForDivision(division, sectorId),
    STADIUM_SECTOR_DEFS[sectorId]?.maxLevel ?? 0,
  );
}

export function getSectorLevel(club, sectorId) {
  const def = STADIUM_SECTOR_DEFS[sectorId];
  if (!def) return 0;
  const raw = Math.round(Number(club?.stadiumSectors?.[sectorId]) || 0);
  return Math.max(0, Math.min(def.maxLevel, raw));
}

export function sectorSeats(sectorId, level, division = 'A') {
  const def = STADIUM_SECTOR_DEFS[sectorId];
  if (!def || level <= 0) return 0;
  const scale = DIVISION_STADIUM_SCALE[division] ?? DIVISION_STADIUM_SCALE.A;
  if (def.baselineSeats && level >= def.baselineLevel) {
    const base = def.baselineSeats[division] ?? def.baselineSeats.A;
    const extra = Math.max(0, level - def.baselineLevel);
    return Math.round(base + extra * def.seatsPerLevel * scale);
  }
  return Math.round(level * def.seatsPerLevel * scale);
}

export function computeSectorBreakdown(club, division = 'A') {
  const rows = [];
  let total = 0;
  for (const sectorId of Object.keys(STADIUM_SECTOR_DEFS)) {
    if (!divisionAllowsSector(division, sectorId)) continue;
    const level = getSectorLevel(club, sectorId);
    const seats = sectorSeats(sectorId, level, division);
    if (seats <= 0) continue;
    total += seats;
    rows.push({
      id: sectorId,
      label: STADIUM_SECTOR_DEFS[sectorId].label,
      level,
      seats,
      share: 0,
      priceMultiplier: STADIUM_SECTOR_DEFS[sectorId].priceMultiplier,
      fillBias: STADIUM_SECTOR_DEFS[sectorId].fillBias,
    });
  }
  const cap = DIVISION_CAPACITY_CAP[division] ?? DIVISION_CAPACITY_CAP.A;
  if (total > cap) {
    const ratio = cap / total;
    total = cap;
    rows.forEach(row => {
      row.seats = Math.round(row.seats * ratio);
    });
  }
  rows.forEach(row => {
    row.share = total > 0 ? row.seats / total : 0;
  });
  return { total, rows, cap };
}

export function syncStadiumCapacity(club, division = 'A') {
  if (!club) return 0;
  const { total } = computeSectorBreakdown(club, division);
  club.stadiumCapacity = total;
  return total;
}

export function getStadiumInvestments(club) {
  return Math.max(0, Math.round(Number(club?.stadiumInvestments) || 0));
}

export function canOfferStadiumNaming(club, division = 'A') {
  if (!club) return false;
  if (division !== 'A' && division !== 'B') return false;
  if (getSectorStructureLevel(club) < 2) return false;
  return getStadiumInvestments(club) >= 2;
}

function defaultSectorsForNewGame() {
  return { popular: 1, stands: 0, seats: 0, boxes: 0, vip: 0 };
}

export function migrateLegacyStadium(club, division = 'A') {
  if (Number(club.stadiumSectorModel) === STADIUM_SECTOR_MODEL) return;
  const oldCapLevel = Math.max(0, Math.min(5, Math.round(Number(club.stadiumCapacityLevel) || 0)));
  const oldStructure = Number.isFinite(Number(club.stadiumStructure))
    ? Math.max(0, Math.min(5, Math.round(Number(club.stadiumStructure))))
    : 1;

  club.stadiumStructure = oldStructure;
  club.stadiumSectors = club.stadiumSectors || {};
  club.stadiumSectors.popular = Math.max(1, Math.min(3, 1 + Math.floor(oldCapLevel / 2)));

  const standsCap = maxSectorLevelForStructure('stands', oldStructure);
  club.stadiumSectors.stands =
    oldCapLevel >= 2 && standsCap > 0 ? Math.min(standsCap, Math.max(0, oldCapLevel - 1)) : 0;

  const seatsCap = maxSectorLevelForStructure('seats', oldStructure);
  club.stadiumSectors.seats =
    oldCapLevel >= 3 && seatsCap > 0 ? Math.min(seatsCap, Math.max(0, oldCapLevel - 2)) : 0;

  const boxesCap = maxSectorLevelForStructure('boxes', oldStructure);
  club.stadiumSectors.boxes =
    oldCapLevel >= 4 && boxesCap > 0 ? Math.min(boxesCap, 1) : 0;

  club.stadiumSectors.vip =
    oldCapLevel >= 5 && maxSectorLevelForStructure('vip', oldStructure) > 0 ? 1 : 0;

  const pitchLevel = Math.max(0, Math.min(5, Math.round(Number(club.pitchLevel) || 2)));
  const pitchBase = division === 'A' || division === 'B' ? 2 : 1;
  let investments = Math.max(0, oldStructure) + Math.max(0, club.stadiumSectors.popular - 1);
  investments += club.stadiumSectors.stands || 0;
  investments += club.stadiumSectors.seats || 0;
  investments += club.stadiumSectors.boxes || 0;
  investments += club.stadiumSectors.vip || 0;
  investments += Math.max(0, pitchLevel - pitchBase);
  club.stadiumInvestments = Math.max(getStadiumInvestments(club), investments);

  delete club.stadiumCapacityLevel;
  club.stadiumSectorModel = STADIUM_SECTOR_MODEL;
  syncStadiumCapacity(club, division);
}

export function ensureStadiumSectors(club, division = 'A', { newGame = false } = {}) {
  if (!club || typeof club !== 'object') return null;

  if (newGame) {
    club.stadiumStructure = 0;
    club.stadiumSectors = defaultSectorsForNewGame();
    club.stadiumInvestments = 0;
    club.stadiumSectorModel = STADIUM_SECTOR_MODEL;
    club.pitchLevel = division === 'A' || division === 'B' ? 2 : 1;
    club.pitchCondition = division === 'A' || division === 'B' ? 'average' : 'rough';
  } else if (Number(club.stadiumSectorModel) !== STADIUM_SECTOR_MODEL) {
    migrateLegacyStadium(club, division);
  }

  if (!club.stadiumSectors || typeof club.stadiumSectors !== 'object') {
    club.stadiumSectors = defaultSectorsForNewGame();
  }

  club.stadiumStructure = Math.max(0, Math.min(5, Math.round(Number(club.stadiumStructure) || 0)));

  for (const sectorId of Object.keys(STADIUM_SECTOR_DEFS)) {
    const max = effectiveSectorMax(club, division, sectorId);
    const level = getSectorLevel(club, sectorId);
    const baseline = STADIUM_SECTOR_DEFS[sectorId].baselineLevel || 0;
    const floor = baseline > 0 && max >= baseline ? baseline : 0;
    club.stadiumSectors[sectorId] = Math.max(floor, Math.min(max, level));
    if (!divisionAllowsSector(division, sectorId)) club.stadiumSectors[sectorId] = 0;
  }

  const pitchMax = maxPitchForSectorStructure(getSectorStructureLevel(club));
  club.pitchLevel = Math.max(0, Math.min(pitchMax, Math.round(Number(club.pitchLevel) || 1)));

  syncStadiumCapacity(club, division);

  return {
    structure: getSectorStructureLevel(club),
    structureLabel: structureLevelLabel(getSectorStructureLevel(club)),
    sectors: { ...club.stadiumSectors },
    capacity: club.stadiumCapacity,
    investments: getStadiumInvestments(club),
  };
}

export function stadiumInvestmentCost(def, currentLevel, division = 'A') {
  const costScale = DIVISION_STADIUM_COST_SCALE[division] ?? DIVISION_STADIUM_COST_SCALE.A;
  return Math.round(((def.baseCost || 0) + currentLevel * (def.costPerLevel || 0)) * costScale);
}

export function estimateStadiumOpsFromSectors(club, division = 'A') {
  if (!club) return 0;
  const base = OPS_BASE[division] ?? OPS_BASE.D;
  const cap = OPS_CAP[division] ?? OPS_CAP.D;
  const structure = getSectorStructureLevel(club);
  const pitch = Math.max(0, Math.min(5, Math.round(Number(club.pitchLevel) || 0)));
  let seatOps = 0;
  for (const sectorId of Object.keys(STADIUM_SECTOR_DEFS)) {
    const level = getSectorLevel(club, sectorId);
    const seats = sectorSeats(sectorId, level, division);
    seatOps += (seats / 1000) * (STADIUM_SECTOR_DEFS[sectorId].opsPerThousand || 200);
  }
  const raw = Math.round(base + seatOps + structure * OPS_STRUCTURE + pitch * OPS_PITCH);
  return Math.min(raw, cap);
}

export function estimateGateReceiptSectors(
  club,
  {
    channel = 'national',
    division = 'A',
    game = null,
    gateScale = 0.28,
    ticketPrices = {},
    ticketRanges = {},
    environment = 60,
    support = 60,
  } = {},
) {
  const resolvedChannel = channel;
  const range = ticketRanges[resolvedChannel] || { min: 15, max: 90, default: 22 };
  const priceRaw = ticketPrices[resolvedChannel] ?? range.default;
  const price = Math.max(range.min, Math.min(range.max, Math.round(Number(priceRaw) || range.default)));
  const priceSpan = Math.max(1, range.max - range.min);
  const priceFactor = 1 - ((price - range.min) / priceSpan) * 0.46;
  const env = Math.max(0, Math.min(100, Number(environment ?? club?.environment) || 60));
  const sup = Math.max(0, Math.min(100, Number(support ?? club?.support) || 60));
  const envBoost = (env - 55) / 160;
  const supportBoost = (sup - 50) / 200;
  const baseFill = Math.max(0.28, Math.min(0.96, 0.48 * priceFactor + envBoost + supportBoost));

  const { total, rows } = computeSectorBreakdown(club, division);
  const cap = Math.max(1000, total || 1000);

  let knockoutBoost = 0;
  if (game) {
    const comp = String(game.competition || '');
    if (comp.includes('COPA') || comp.includes('Copa')) knockoutBoost = 0.12;
    if (String(game.phase || '').match(/FINAL|SEMI|QUARTAS|OITAVAS/i)) knockoutBoost = Math.max(knockoutBoost, 0.18);
  } else if (resolvedChannel === 'cups') knockoutBoost = 0.05;

  let attendance = 0;
  let revenue = 0;
  const sectorDetails = [];

  for (const row of rows) {
    const def = STADIUM_SECTOR_DEFS[row.id];
    let fill = baseFill * (def?.fillBias ?? 1);
    if (row.id === 'vip' || row.id === 'boxes') fill *= 1 + knockoutBoost;
    fill = Math.max(0.22, Math.min(0.98, fill));
    const sectorAttendance = Math.round(row.seats * fill);
    const sectorRevenue = Math.round(sectorAttendance * price * (def?.priceMultiplier ?? 1) * gateScale);
    attendance += sectorAttendance;
    revenue += sectorRevenue;
    sectorDetails.push({ ...row, fillRate: fill, attendance: sectorAttendance, revenue: sectorRevenue });
  }

  return {
    channel: resolvedChannel,
    attendance,
    fillRate: cap > 0 ? attendance / cap : baseFill,
    price,
    revenue,
    capacity: cap,
    environment: env,
    support: sup,
    sectors: sectorDetails,
  };
}
