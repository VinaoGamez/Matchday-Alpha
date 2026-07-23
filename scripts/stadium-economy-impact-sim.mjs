/**
 * Impacto econômico do estádio v2 (setores + naming) vs modelo legado.
 * Uso: node scripts/stadium-economy-impact-sim.mjs
 */
import { writeFileSync } from 'node:fs';
import {
  ensureStadium,
  estimateGateReceipt,
  estimateStadiumOpsBill,
  estimateRoundCostBill,
  estimateWageBill,
  estimateStaffBill,
  assignSponsors,
  assignTvRights,
  creditSponsorInstallment,
  creditHomeTv,
  creditNamingInstallment,
  tvHomeSlots,
  listStadiumUpgrades,
  purchaseStadiumUpgrade,
  initialBudget,
  STADIUM_CAPACITY_BY_DIVISION,
  GATE_REVENUE_SCALE,
  TICKET_PRICE_RANGE,
} from '../js/engine/economy.js';
import {
  ensureStadiumSectors,
  computeSectorBreakdown,
  migrateLegacyStadium,
  canOfferStadiumNaming,
  effectiveSectorMax,
  STADIUM_SECTOR_MODEL,
  DIVISION_SECTOR_ALLOW,
  STADIUM_SECTOR_DEFS,
  normalizeTicketPrices,
  getSectorTicketPrice,
  defaultSectorPricesForChannel,
  estimateGateReceiptSectors,
  TICKET_SECTOR_PRICE_RANGE,
} from '../js/engine/stadium-sectors.js';
import {
  estimateNamingPerRound,
  assignNamingContract,
  estimateNamingRound,
  getNamingRights,
} from '../js/engine/stadium-naming.js';

const fmt = n => `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
const pct = (a, b) => (b > 0 ? `${((100 * a) / b).toFixed(1)}%` : '—');
const rnd = n => Math.round(n);

const ROUNDS = { A: 38, B: 38, C: 38, D: 22 };
const HOME_SHARE = 0.5;
const TICKET_STEP = 5;

/** Modelo antigo (pré por-setor): preço único × priceMultiplier por setor. */
function flatSectorGateReceipt(club, division, channel = 'national') {
  const resolvedChannel = channel === 'cups' ? 'cups' : 'national';
  const range = TICKET_PRICE_RANGE[resolvedChannel] || TICKET_PRICE_RANGE.national;
  const raw = club.ticketPrices?.[resolvedChannel];
  const basePrice =
    typeof raw === 'number'
      ? Math.max(range.min, Math.min(range.max, Math.round(raw)))
      : getSectorTicketPrice(club.ticketPrices, resolvedChannel, 'popular');
  const priceSpan = Math.max(1, range.max - range.min);
  const priceFactor = 1 - ((basePrice - range.min) / priceSpan) * 0.46;
  const env = Math.max(0, Math.min(100, Number(club.environment) || 60));
  const sup = Math.max(0, Math.min(100, Number(club.support) || 60));
  const envBoost = (env - 55) / 160;
  const supportBoost = (sup - 50) / 200;
  const baseFill = Math.max(0.28, Math.min(0.96, 0.55 * priceFactor + envBoost + supportBoost));

  const { total, rows } = computeSectorBreakdown(club, division);
  const cap = Math.max(1000, total || 1000);
  let attendance = 0;
  let revenue = 0;
  const sectorDetails = [];

  for (const row of rows) {
    const def = STADIUM_SECTOR_DEFS[row.id];
    let fill = baseFill * (def?.fillBias ?? 1);
    fill = Math.max(0.22, Math.min(0.98, fill));
    const sectorAttendance = Math.round(row.seats * fill);
    const sectorRevenue = Math.round(sectorAttendance * basePrice * (def?.priceMultiplier ?? 1) * GATE_REVENUE_SCALE);
    attendance += sectorAttendance;
    revenue += sectorRevenue;
    sectorDetails.push({ id: row.id, attendance: sectorAttendance, revenue: sectorRevenue, price: basePrice });
  }

  return {
    channel: resolvedChannel,
    attendance,
    fillRate: cap > 0 ? attendance / cap : baseFill,
    price: basePrice,
    revenue,
    capacity: cap,
    sectors: sectorDetails,
  };
}

function cloneClubProfile(buildFn, division = 'A', opts = {}) {
  const club = baseClub(division, opts);
  buildFn(club, division);
  ensureStadium(club, division);
  return club;
}

function comparePricingModels(club, division) {
  const nationalFlat = flatSectorGateReceipt(club, division, 'national');
  const nationalNew = estimateGateReceipt(club, { channel: 'national', division });
  const cupsFlat = flatSectorGateReceipt(club, division, 'cups');
  const cupsNew = estimateGateReceipt(club, { channel: 'cups', division });
  const ops = estimateStadiumOpsBill(club, division);
  const flatSeasonGate = seasonGateMixFlat(club, division);
  const newSeasonGate = seasonGateMix(club, division);
  const rounds = ROUNDS[division] || 38;

  return {
    capacity: club.stadiumCapacity,
    structure: club.stadiumStructure,
    investments: club.stadiumInvestments,
    national: {
      flatGate: nationalFlat.revenue,
      newGate: nationalNew.revenue,
      flatFill: nationalFlat.fillRate,
      newFill: nationalNew.fillRate,
      flatTicket: nationalFlat.price,
      newTicket: nationalNew.price,
      deltaGate: nationalNew.revenue - nationalFlat.revenue,
      deltaPct: nationalFlat.revenue > 0 ? ((nationalNew.revenue / nationalFlat.revenue - 1) * 100) : 0,
    },
    cups: {
      flatGate: cupsFlat.revenue,
      newGate: cupsNew.revenue,
      flatFill: cupsFlat.fillRate,
      newFill: cupsNew.fillRate,
      flatTicket: cupsFlat.price,
      newTicket: cupsNew.price,
      deltaGate: cupsNew.revenue - cupsFlat.revenue,
      deltaPct: cupsFlat.revenue > 0 ? ((cupsNew.revenue / cupsFlat.revenue - 1) * 100) : 0,
    },
    season: {
      flatGate: flatSeasonGate,
      newGate: newSeasonGate,
      deltaGate: newSeasonGate - flatSeasonGate,
      deltaPct: flatSeasonGate > 0 ? ((newSeasonGate / flatSeasonGate - 1) * 100) : 0,
      flatNet: flatSeasonGate - ops * rounds,
      newNet: newSeasonGate - ops * rounds,
      deltaNet: newSeasonGate - flatSeasonGate,
    },
    ticketPrices: normalizeTicketPrices(club.ticketPrices),
  };
}

function seasonGateMix(club, division) {
  const national = estimateGateReceipt(club, { channel: 'national', division });
  const cups = estimateGateReceipt(club, { channel: 'cups', division });
  const homeGames = Math.round((ROUNDS[division] || 38) * HOME_SHARE);
  const cupHomeShare = division === 'D' ? 0.35 : 0.12;
  const leagueHomes = Math.round(homeGames * (1 - cupHomeShare));
  const cupHomes = homeGames - leagueHomes;
  return national.revenue * leagueHomes + cups.revenue * cupHomes;
}

function seasonGateMixFlat(club, division) {
  const national = flatSectorGateReceipt(club, division, 'national');
  const cups = flatSectorGateReceipt(club, division, 'cups');
  const homeGames = Math.round((ROUNDS[division] || 38) * HOME_SHARE);
  const cupHomeShare = division === 'D' ? 0.35 : 0.12;
  const leagueHomes = Math.round(homeGames * (1 - cupHomeShare));
  const cupHomes = homeGames - leagueHomes;
  return national.revenue * leagueHomes + cups.revenue * cupHomes;
}

function setAllSectorPrices(club, channel, value) {
  ensureStadium(club, club.division || 'A');
  const ch = channel === 'cups' ? 'cups' : 'national';
  const normalized = normalizeTicketPrices(club.ticketPrices);
  for (const id of Object.keys(TICKET_SECTOR_PRICE_RANGE)) {
    normalized[ch][id] = value;
  }
  club.ticketPrices = normalized;
}

function setSectorPrice(club, channel, sectorId, value) {
  ensureStadium(club, club.division || 'A');
  const ch = channel === 'cups' ? 'cups' : 'national';
  club.ticketPrices[ch][sectorId] = value;
}

const baseClub = (division, { environment = 70, support = 70, ticketNational = 22, ticketCups = 36 } = {}) => ({
  name: 'Sim FC',
  division,
  environment,
  support,
  ticketPrices: { national: ticketNational, cups: ticketCups },
  managerReputation: 70,
  roster: Array.from({ length: 22 }, (_, i) => ({ name: `P${i + 1}`, overall: 76, age: 26, pos: 'MC' })),
});

/** Perfil v2 — setores explícitos. */
const PROFILES_V2 = [
  {
    id: 'start',
    label: 'Novo jogo (start limpo)',
    build: (club, div) => ensureStadiumSectors(club, div, { newGame: true }),
  },
  {
    id: 'naming_gate',
    label: 'Naming elegível (estr. 2, 2 invest.)',
    build: (club, div) => {
      ensureStadiumSectors(club, div, { newGame: true });
      club.stadiumStructure = 2;
      club.stadiumSectors = { popular: 1, stands: 1, seats: 0, boxes: 0, vip: 0 };
      club.stadiumInvestments = 2;
      ensureStadiumSectors(club, div);
    },
  },
  {
    id: 'mid',
    label: 'Médio (estr. 3 · pop 2 · arquib. 2 · cadeiras 1)',
    build: (club, div) => {
      ensureStadiumSectors(club, div, { newGame: true });
      club.stadiumStructure = 3;
      club.stadiumSectors = { popular: 2, stands: 2, seats: 1, boxes: 0, vip: 0 };
      club.stadiumInvestments = 6;
      ensureStadiumSectors(club, div);
    },
  },
  {
    id: 'large',
    label: 'Grande (estr. 4 · mix premium)',
    build: (club, div) => {
      ensureStadiumSectors(club, div, { newGame: true });
      club.stadiumStructure = 4;
      club.stadiumSectors = { popular: 3, stands: 3, seats: 2, boxes: 1, vip: 0 };
      club.stadiumInvestments = 12;
      ensureStadiumSectors(club, div);
    },
  },
  {
    id: 'arena',
    label: 'Arena máxima (estr. 5 · todos setores A)',
    build: (club, div) => {
      ensureStadiumSectors(club, div, { newGame: true });
      club.stadiumStructure = 5;
      club.stadiumSectors = { popular: 3, stands: 3, seats: 2, boxes: 2, vip: 1 };
      club.stadiumInvestments = 18;
      ensureStadiumSectors(club, div);
    },
  },
];

function legacyFillRate(club, channel = 'national') {
  const range = TICKET_PRICE_RANGE[channel] || TICKET_PRICE_RANGE.national;
  const price = club.ticketPrices[channel] ?? range.default;
  const priceSpan = Math.max(1, range.max - range.min);
  const priceFactor = 1 - ((price - range.min) / priceSpan) * 0.46;
  const environment = Math.max(0, Math.min(100, Number(club.environment) || 60));
  const support = Math.max(0, Math.min(100, Number(club.support) || 60));
  const envBoost = (environment - 55) / 160;
  const supportBoost = (support - 50) / 200;
  const fill = 0.48 * priceFactor + envBoost + supportBoost;
  return Math.max(0.28, Math.min(0.96, fill));
}

function legacyGateReceipt(club, division, channel = 'national') {
  const fill = legacyFillRate(club, channel);
  const cap = Math.max(1000, Number(club.stadiumCapacity) || 12_000);
  const price = club.ticketPrices[channel] ?? TICKET_PRICE_RANGE[channel].default;
  const attendance = Math.round(cap * fill);
  return {
    fillRate: fill,
    attendance,
    revenue: Math.round(attendance * price * GATE_REVENUE_SCALE),
    capacity: cap,
  };
}

function legacyOpsBill(club, division) {
  const base = { A: 18_000, B: 12_000, C: 8_000, D: 5_000 }[division] ?? 5_000;
  const perThousand = { A: 450, B: 350, C: 280, D: 220 }[division] ?? 220;
  const cap = { A: 75_000, B: 50_000, C: 35_000, D: 22_000 }[division] ?? 22_000;
  const seats = Math.max(0, Number(club.stadiumCapacity) || 0);
  const structure = Math.max(0, Math.min(5, Number(club.stadiumStructure) || 0));
  const pitch = Math.max(0, Math.min(5, Number(club.pitchLevel) || 2));
  return Math.min(Math.round(base + (seats / 1000) * perThousand + structure * 2_500 + pitch * 2_000), cap);
}

/** Perfil legado — barra única (sem migrar para setores). */
function buildLegacy(club, division, capLevel, structure) {
  club.stadiumCapacityLevel = capLevel;
  club.stadiumStructure = structure;
  club.stadiumCapacity = legacyCapacity(division, capLevel);
  club.pitchLevel = division === 'A' || division === 'B' ? 2 : 1;
  delete club.stadiumSectorModel;
  delete club.stadiumSectors;
  delete club.stadiumInvestments;
}

function snapshotLegacy(club, division) {
  const national = legacyGateReceipt(club, division, 'national');
  const cups = legacyGateReceipt(club, division, 'cups');
  const ops = legacyOpsBill(club, division);
  const wage = estimateWageBill(club, division);
  const staff = estimateStaffBill(club, division, { managerReputation: 70 });
  return {
    capacity: club.stadiumCapacity,
    sectors: 'legado (barra única)',
    structure: club.stadiumStructure,
    investments: '—',
    fillNational: national.fillRate,
    fillCups: cups.fillRate,
    gateNational: national.revenue,
    gateCups: cups.revenue,
    ticketMedioEff: club.ticketPrices.national,
    opsPerRound: ops,
    wage,
    staff,
    roundCost: wage + staff + ops,
    namingPerRound: 0,
    namingEligible: false,
  };
}

/** Capacidade legado por nível de upgrade. */
function legacyCapacity(division, capLevel) {
  const cfg = STADIUM_CAPACITY_BY_DIVISION[division] || STADIUM_CAPACITY_BY_DIVISION.A;
  return Math.min(cfg.max, cfg.base + capLevel * cfg.step);
}

const PROFILES_LEGACY = [
  { id: 'leg0', label: 'Legado cap 0 (42k A)', capLevel: 0, structure: 1 },
  { id: 'leg2', label: 'Legado cap 2 (~58k A)', capLevel: 2, structure: 2 },
  { id: 'leg4', label: 'Legado cap 4 (~74k A)', capLevel: 4, structure: 4 },
  { id: 'leg5', label: 'Legado cap 5 (teto A)', capLevel: 5, structure: 5 },
];

function buildMigrated(club, division, capLevel, structure) {
  club.stadiumCapacityLevel = capLevel;
  club.stadiumStructure = structure;
  club.pitchLevel = 3;
  club.stadiumCapacity = legacyCapacity(division, capLevel);
  migrateLegacyStadium(club, division);
  ensureStadiumSectors(club, division);
}

function snapshotEconomy(club, division, { withNaming = false, namingBase = null } = {}) {
  ensureStadium(club, division);
  const national = estimateGateReceipt(club, { channel: 'national', division });
  const cups = estimateGateReceipt(club, { channel: 'cups', division });
  const ops = estimateStadiumOpsBill(club, division);
  const wage = estimateWageBill(club, division);
  const staff = estimateStaffBill(club, division, { managerReputation: 70 });
  const roundCost = estimateRoundCostBill(club, division, { managerReputation: 70 });
  const { total, rows } = computeSectorBreakdown(club, division);

  let namingPerRound = 0;
  if (withNaming && canOfferStadiumNaming(club, division)) {
    if (namingBase != null) {
      assignNamingContract(club, { sponsor: 'SimPatroc', perRound: namingBase }, { season: 2026, division });
    } else {
      assignNamingContract(
        club,
        { sponsor: 'SimPatroc', perRound: estimateNamingPerRound(club, division, { random: () => 0.5 }) },
        { season: 2026, division },
      );
    }
    namingPerRound = estimateNamingRound(club, division);
  }

  const effectiveCap = Number(club.stadiumCapacity) || total || 0;
  const ticketMedio =
    national.attendance > 0 ? rnd((national.revenue / national.attendance / GATE_REVENUE_SCALE) * 100) / 100 : 0;

  return {
    capacity: effectiveCap,
    sectors: rows.map(r => `${r.label.split(' ')[0]} ${r.seats.toLocaleString('pt-BR')}`).join(' · ') || '—',
    structure: club.stadiumStructure ?? '—',
    investments: club.stadiumInvestments ?? '—',
    fillNational: national.fillRate,
    fillCups: cups.fillRate,
    gateNational: national.revenue,
    gateCups: cups.revenue,
    ticketMedioEff: ticketMedio,
    opsPerRound: ops,
    wage,
    staff,
    roundCost,
    namingPerRound,
    namingEligible: canOfferStadiumNaming(club, division),
  };
}

function simulateSeason(club, division, snap) {
  const rounds = ROUNDS[division] || 38;
  const homeGames = Math.round(rounds * HOME_SHARE);
  const homeTv = tvHomeSlots(division);

  const c = { ...club, budget: 0, budgetLedger: [] };
  assignSponsors(c, { division, season: 2026, installments: rounds, creditPackage: false, random: () => 0.45 });
  assignTvRights(c, { division, season: 2026, installments: homeTv, random: () => 0.45 });

  if (snap.namingPerRound > 0) {
    assignNamingContract(
      c,
      { sponsor: 'SimPatroc', perRound: snap.namingPerRound },
      { season: 2026, division },
    );
  }

  let gateTotal = 0;
  let namingTotal = 0;
  let sponsorTotal = 0;
  let tvTotal = 0;
  let opsTotal = 0;

  for (let round = 1; round <= rounds; round++) {
    if (round % 2 === 1) {
      gateTotal += snap.gateNational;
      const tv = creditHomeTv(
        c,
        { home: c.name, away: 'Opp', round, competition: 'LEAGUE' },
        { division, season: 2026 },
      );
      tvTotal += tv.amount || 0;
    }
    sponsorTotal += creditSponsorInstallment(c, { round, installments: rounds }).amount || 0;
    namingTotal += creditNamingInstallment(c, { round, division, season: 2026 }).amount || 0;
    opsTotal += snap.opsPerRound;
  }

  const costsFixed = snap.roundCost * rounds;
  const stadiumNet = gateTotal - opsTotal + namingTotal;
  const incomeTotal = gateTotal + sponsorTotal + tvTotal + namingTotal;

  return {
    homeGames,
    gateSeason: gateTotal,
    namingSeason: namingTotal,
    sponsorSeason: sponsorTotal,
    tvSeason: tvTotal,
    opsSeason: opsTotal,
    incomeTotal,
    costsFixed,
    stadiumNet,
    gateShareOfIncome: gateTotal / Math.max(1, incomeTotal),
    opsShareOfCosts: opsTotal / Math.max(1, costsFixed),
    stadiumNetShareOfIncome: stadiumNet / Math.max(1, incomeTotal),
    netPerRound: (incomeTotal - costsFixed) / rounds,
  };
}

function printTable(title, rows, cols) {
  console.log(`\n=== ${title} ===\n`);
  const widths = cols.map(c => Math.max(c.label.length, ...rows.map(r => String(r[c.key] ?? '').length)));
  console.log(cols.map((c, i) => c.label.padEnd(widths[i])).join('  '));
  console.log(cols.map((_, i) => '─'.repeat(widths[i])).join('  '));
  for (const r of rows) {
    console.log(cols.map((c, i) => String(r[c.key] ?? '').padEnd(widths[i])).join('  '));
  }
}

// ── 1) Perfis v2 Série A ──
const v2RowsA = [];
for (const p of PROFILES_V2) {
  const club = baseClub('A');
  p.build(club, 'A');
  const snap = snapshotEconomy(club, 'A', { withNaming: p.id === 'naming_gate' || p.id === 'mid' || p.id === 'large' || p.id === 'arena' });
  const season = simulateSeason(club, 'A', snap);
  v2RowsA.push({
    perfil: p.label,
    cap: snap.capacity.toLocaleString('pt-BR'),
    lot: `${Math.round(snap.fillNational * 100)}%`,
    gateJogo: fmt(snap.gateNational),
    ticketMed: `R$ ${snap.ticketMedioEff.toFixed(0)}`,
    opsRod: fmt(snap.opsPerRound),
    namingRod: snap.namingPerRound > 0 ? fmt(snap.namingPerRound) : '—',
    gateTemp: fmt(season.gateSeason),
    namingTemp: season.namingSeason > 0 ? fmt(season.namingSeason) : '—',
    liqEstadio: fmt(season.stadiumNet),
    pctRenda: pct(season.stadiumNet, season.incomeTotal),
  });
}

printTable('Série A — perfis v2 (env/torcida 70 · ingresso R$ 22)', v2RowsA, [
  { key: 'perfil', label: 'Perfil' },
  { key: 'cap', label: 'Cap.' },
  { key: 'lot', label: 'Lot.' },
  { key: 'gateJogo', label: 'Gate/jogo' },
  { key: 'ticketMed', label: 'Ticket méd.' },
  { key: 'opsRod', label: 'Ops/rod' },
  { key: 'namingRod', label: 'Naming/rod' },
  { key: 'gateTemp', label: 'Gate temp.' },
  { key: 'namingTemp', label: 'Naming temp.' },
  { key: 'liqEstadio', label: 'Líq. estádio' },
  { key: 'pctRenda', label: '% renda' },
]);

// ── 2) Legado vs v2 (Série A) ──
const compareRows = [];

const clubStart = baseClub('A');
ensureStadiumSectors(clubStart, 'A', { newGame: true });
const snapStart = snapshotEconomy(clubStart, 'A');
const seasonStart = simulateSeason(clubStart, 'A', snapStart);
compareRows.push({
  modelo: 'v2 start limpo',
  cap: snapStart.capacity.toLocaleString('pt-BR'),
  gateJogo: fmt(snapStart.gateNational),
  gateTemp: fmt(seasonStart.gateSeason),
  opsTemp: fmt(seasonStart.opsSeason),
  liqEstadio: fmt(seasonStart.stadiumNet),
  vsLeg0: '—',
});

for (const p of PROFILES_LEGACY) {
  const club = baseClub('A');
  buildLegacy(club, 'A', p.capLevel, p.structure);
  const snap = snapshotLegacy(club, 'A');
  const season = simulateSeason(club, 'A', snap);
  const ratioGate = seasonStart.gateSeason > 0 ? season.gateSeason / seasonStart.gateSeason : 0;
  compareRows.push({
    modelo: p.label,
    cap: snap.capacity.toLocaleString('pt-BR'),
    gateJogo: fmt(snap.gateNational),
    gateTemp: fmt(season.gateSeason),
    opsTemp: fmt(season.opsSeason),
    liqEstadio: fmt(season.stadiumNet),
    vsLeg0: `${ratioGate.toFixed(1)}× gate vs start`,
  });
}

const clubArena = baseClub('A');
PROFILES_V2.find(x => x.id === 'arena').build(clubArena, 'A');
const snapArena = snapshotEconomy(clubArena, 'A', { withNaming: true });
const seasonArena = simulateSeason(clubArena, 'A', snapArena);
compareRows.push({
  modelo: 'v2 arena máx + naming',
  cap: snapArena.capacity.toLocaleString('pt-BR'),
  gateJogo: fmt(snapArena.gateNational),
  gateTemp: fmt(seasonArena.gateSeason),
  opsTemp: fmt(seasonArena.opsSeason),
  liqEstadio: fmt(seasonArena.stadiumNet),
  vsLeg0: `${(seasonArena.stadiumNet / Math.max(1, Math.abs(seasonStart.stadiumNet))).toFixed(0)}× líq vs start`,
});

printTable('Comparativo legado vs v2 (Série A)', compareRows, [
  { key: 'modelo', label: 'Modelo' },
  { key: 'cap', label: 'Cap.' },
  { key: 'gateJogo', label: 'Gate/jogo' },
  { key: 'gateTemp', label: 'Gate temp.' },
  { key: 'opsTemp', label: 'Ops temp.' },
  { key: 'liqEstadio', label: 'Líq. estádio' },
  { key: 'vsLeg0', label: 'Referência' },
]);

// ── 3) Migração saves antigos ──
console.log('\n=== Migração legado → setores (Série A) ===\n');
for (const capLevel of [0, 2, 4, 5]) {
  const club = baseClub('A');
  buildMigrated(club, 'A', capLevel, Math.min(5, capLevel + 1));
  const snap = snapshotEconomy(club, 'A');
  const legGate = (() => {
    const c2 = baseClub('A');
    buildLegacy(c2, 'A', capLevel, Math.min(5, capLevel + 1));
    return legacyGateReceipt(c2, 'A').revenue;
  })();
  console.log(
    `• cap legado ${capLevel} → ${snap.capacity.toLocaleString('pt-BR')} lugares | gate ${fmt(snap.gateNational)} vs legado ${fmt(legGate)} (${pct(snap.gateNational, legGate)} do legado) | ops ${fmt(snap.opsPerRound)}`,
  );
}

// ── 4) Sensibilidade ingresso (start limpo A) ──
console.log('\n=== Sensibilidade preço — start limpo Série A (env 70) ===\n');
for (const price of [15, 22, 35, 55, 90]) {
  const club = baseClub('A', { ticketNational: price });
  ensureStadiumSectors(club, 'A', { newGame: true });
  const g = estimateGateReceipt(club, { channel: 'national', division: 'A' });
  console.log(
    `• R$ ${price} → lotação ${Math.round(g.fillRate * 100)}% · ${g.attendance.toLocaleString('pt-BR')} pessoas · gate ${fmt(g.revenue)}/jogo`,
  );
}

// ── 5) Crise vs saudável (start A) ──
console.log('\n=== Ambiente / torcida — start limpo Série A ===\n');
for (const [label, env, sup] of [
  ['Crise', 42, 45],
  ['Neutro', 60, 60],
  ['Saudável', 75, 80],
]) {
  const club = baseClub('A', { environment: env, support: sup });
  ensureStadiumSectors(club, 'A', { newGame: true });
  const g = estimateGateReceipt(club, { channel: 'national', division: 'A' });
  console.log(`• ${label} (${env}/${sup}) → lotação ${Math.round(g.fillRate * 100)}% · gate ${fmt(g.revenue)}/jogo`);
}

// ── 6) Divisões — start limpo ──
console.log('\n=== Start limpo por divisão ===\n');
for (const div of ['A', 'B', 'C', 'D']) {
  const club = baseClub(div);
  ensureStadiumSectors(club, div, { newGame: true });
  const snap = snapshotEconomy(club, div);
  const season = simulateSeason(club, div, snap);
  console.log(
    `• Série ${div}: ${snap.capacity.toLocaleString('pt-BR')} lug · gate ${fmt(snap.gateNational)}/jogo · ops ${fmt(snap.opsPerRound)}/rod · líq estádio/temp ${fmt(season.stadiumNet)} (${pct(season.stadiumNet, season.incomeTotal)} renda)`,
  );
}

// ── 7) Peso na economia (Série A médio) ──
console.log('\n=== Peso do estádio na economia sazonal (Série A · elenco 76 OVR) ===\n');
const refClub = baseClub('A');
PROFILES_V2.find(x => x.id === 'mid').build(refClub, 'A');
const refSnap = snapshotEconomy(refClub, 'A', { withNaming: true });
const refSeason = simulateSeason(refClub, 'A', refSnap);

const lines = [
  ['Bilheteria', refSeason.gateSeason],
  ['Naming', refSeason.namingSeason],
  ['Patrocínio', refSeason.sponsorSeason],
  ['TV (jogos casa)', refSeason.tvSeason],
  ['Ops estádio (custo)', -refSeason.opsSeason],
  ['Folha+staff+ops (custo total)', -refSeason.costsFixed],
];
for (const [name, val] of lines) {
  console.log(`• ${name.padEnd(28)} ${fmt(Math.abs(val)).padStart(14)}  (${pct(Math.abs(val), refSeason.incomeTotal)} da renda bruta)`);
}
console.log(`\n  Saldo líquido/rodada (sem prêmio fim): ${fmt(refSeason.netPerRound)}`);
console.log(`  Naming cobre ${pct(refSeason.namingSeason, refSeason.opsSeason)} das ops do estádio na temporada`);

// ── 8) Naming penalidades ──
console.log('\n=== Naming — penalidade na crise (base R$ 24k/rod · Série A) ===\n');
for (const [label, patch] of [
  ['Normal', {}],
  ['Vermelho 1 rodada', { overdraftStreak: 1 }],
  ['Vermelho 2+ rodadas', { overdraftStreak: 3 }],
  ['Atraso folha/empréstimo', { wageShortfall: true }],
  ['Restrição financeira', { financialRestriction: { active: true } }],
]) {
  const club = baseClub('A');
  PROFILES_V2.find(x => x.id === 'naming_gate').build(club, 'A');
  Object.assign(club, patch);
  assignNamingContract(club, { sponsor: 'X', perRound: 24_000 }, { season: 2026, division: 'A' });
  const est = estimateNamingRound(club, 'A');
  console.log(`• ${label}: ${fmt(est)}/rod (${pct(est, 24000)} da base)`);
}

// ── 9) ROI — caminho de upgrades (start → máximo por divisão) ──
const UPGRADE_ORDER = {
  structure: 0,
  sector_popular: 1,
  sector_stands: 2,
  sector_seats: 3,
  sector_boxes: 4,
  sector_vip: 5,
  pitch: 6,
};

function stadiumSnapshot(club, division, { withNaming = true } = {}) {
  ensureStadium(club, division);
  const gate = estimateGateReceipt(club, { channel: 'national', division }).revenue;
  const ops = estimateStadiumOpsBill(club, division);
  let naming = 0;
  if (withNaming && canOfferStadiumNaming(club, division)) {
    if (!getNamingRights(club)?.sponsor) {
      assignNamingContract(
        club,
        { sponsor: 'ROI-Sim', perRound: estimateNamingPerRound(club, division, { random: () => 0.5 }) },
        { season: 2026, division },
      );
    }
    naming = estimateNamingRound(club, division);
  } else if (getNamingRights(club)?.sponsor) {
    naming = estimateNamingRound(club, division);
  }
  const rounds = ROUNDS[division] || 38;
  const homes = Math.round(rounds * HOME_SHARE);
  const stadiumNetSeason = gate * homes - ops * rounds + naming * rounds;
  return { gate, ops, naming, capacity: club.stadiumCapacity, stadiumNetSeason };
}

function applyFullUpgradePath(club, division) {
  club.budget = 999_999_999;
  const steps = [];
  let totalCost = 0;
  for (let guard = 0; guard < 200; guard++) {
    const rows = listStadiumUpgrades(club, division).filter(
      u => !u.locked && !u.maxed && !u.structureCapped && !u.divisionLocked && u.cost > 0,
    );
    if (!rows.length) break;
    rows.sort((a, b) => (UPGRADE_ORDER[a.id] ?? 9) - (UPGRADE_ORDER[b.id] ?? 9));
    const pick = rows[0];
    const before = stadiumSnapshot(club, division, { withNaming: false });
    const result = purchaseStadiumUpgrade(club, pick.id, division);
    if (!result.ok) break;
    const after = stadiumSnapshot(club, division, { withNaming: false });
    const deltaNet =
      after.stadiumNetSeason - before.stadiumNetSeason;
    totalCost += pick.cost;
    steps.push({
      id: pick.id,
      label: pick.label,
      cost: pick.cost,
      cap: after.capacity,
      deltaNetSeason: deltaNet,
    });
  }
  return { totalCost, steps };
}

function buildMaxStadiumClub(division) {
  const club = baseClub(division);
  ensureStadiumSectors(club, division, { newGame: true });
  club.stadiumStructure = 5;
  club.stadiumSectors = { popular: 0, stands: 0, seats: 0, boxes: 0, vip: 0 };
  for (const sectorId of DIVISION_SECTOR_ALLOW[division] || DIVISION_SECTOR_ALLOW.A) {
    club.stadiumSectors[sectorId] = effectiveSectorMax(
      { ...club, stadiumStructure: 5 },
      division,
      sectorId,
    );
  }
  club.pitchLevel = division === 'A' || division === 'B' ? 5 : 3;
  club.stadiumInvestments = 20;
  ensureStadiumSectors(club, division);
  return club;
}

console.log('\n=== ROI — upgrades start → máximo (Série A) ===\n');
const roiClub = baseClub('A');
ensureStadiumSectors(roiClub, 'A', { newGame: true });
const beforeRoi = stadiumSnapshot(roiClub, 'A', { withNaming: false });
const { totalCost, steps } = applyFullUpgradePath(roiClub, 'A');
const afterRoi = stadiumSnapshot(roiClub, 'A', { withNaming: true });
const benefitSeason = afterRoi.stadiumNetSeason - beforeRoi.stadiumNetSeason;
const paybackSeasons = benefitSeason > 0 ? totalCost / benefitSeason : Infinity;

console.log(`Investimento total: ${fmt(totalCost)} (${steps.length} upgrades)`);
console.log(`Líq. estádio/temp: ${fmt(beforeRoi.stadiumNetSeason)} → ${fmt(afterRoi.stadiumNetSeason)} (+${fmt(benefitSeason)})`);
console.log(`Payback: ${paybackSeasons === Infinity ? '—' : `${paybackSeasons.toFixed(1)} temporadas`}`);
console.log(`Investimento vs caixa inicial A: ${pct(totalCost, initialBudget('A'))}`);
console.log('\nTop upgrades por ganho líquido/temp:');
const topSteps = [...steps].sort((a, b) => b.deltaNetSeason - a.deltaNetSeason).slice(0, 8);
for (const s of topSteps) {
  const roi = s.cost > 0 ? ((s.deltaNetSeason / s.cost) * 100).toFixed(0) : '—';
  console.log(
    `• ${s.label}: ${fmt(s.cost)} → +${fmt(s.deltaNetSeason)}/temp (${roi}% ROI anual)`,
  );
}

console.log('\n=== Estádio máximo por divisão vs economia do time ===\n');
for (const div of ['A', 'B', 'C', 'D']) {
  const startClub = baseClub(div);
  ensureStadiumSectors(startClub, div, { newGame: true });
  const startSnap = stadiumSnapshot(startClub, div, { withNaming: false });

  const maxClub = buildMaxStadiumClub(div);
  const maxSnap = stadiumSnapshot(maxClub, div, { withNaming: true });
  const { totalCost: maxInvest } = (() => {
    const c = baseClub(div);
    ensureStadiumSectors(c, div, { newGame: true });
    return applyFullUpgradePath(c, div);
  })();

  const startSeason = simulateSeason(startClub, div, {
    gateNational: startSnap.gate,
    opsPerRound: startSnap.ops,
    namingPerRound: 0,
    roundCost: estimateRoundCostBill(startClub, div, { managerReputation: 70 }),
  });

  const maxSeasonSnap = snapshotEconomy(maxClub, div, { withNaming: true });
  const maxSeason = simulateSeason(maxClub, div, maxSeasonSnap);

  const deltaIncome = maxSeason.incomeTotal - startSeason.incomeTotal;
  const deltaNet = maxSeason.netPerRound - startSeason.netPerRound;
  const boostPct = deltaIncome / Math.max(1, startSeason.incomeTotal);

  console.log(`• Série ${div}`);
  console.log(
    `  Cap: ${startSnap.capacity.toLocaleString('pt-BR')} → ${maxSnap.capacity.toLocaleString('pt-BR')} | Investimento: ${fmt(maxInvest)}`,
  );
  console.log(
    `  Renda/temp: ${fmt(startSeason.incomeTotal)} → ${fmt(maxSeason.incomeTotal)} (+${fmt(deltaIncome)}, +${pct(deltaIncome, startSeason.incomeTotal)})`,
  );
  console.log(
    `  Saldo/rod: ${fmt(startSeason.netPerRound)} → ${fmt(maxSeason.netPerRound)} (+${fmt(deltaNet)})`,
  );
  console.log(
    `  Estádio (gate+ naming − ops): ${fmt(startSnap.stadiumNetSeason)} → ${fmt(maxSnap.stadiumNetSeason)} | Payback invest: ${maxSnap.stadiumNetSeason > startSnap.stadiumNetSeason ? (maxInvest / (maxSnap.stadiumNetSeason - startSnap.stadiumNetSeason)).toFixed(1) : '—'} temp`,
  );
  console.log(
    `  Boost na renda total: ${pct(deltaIncome, maxSeason.incomeTotal)} da renda com estádio max`,
  );
}

console.log('\n=== Bilheteria interfere quanto no jogo? (start vs max, Série A) ===\n');
{
  const start = baseClub('A');
  ensureStadiumSectors(start, 'A', { newGame: true });
  const max = buildMaxStadiumClub('A');
  for (const [label, club, naming] of [
    ['Start limpo', start, false],
    ['Estádio máximo', max, true],
  ]) {
    const snap = stadiumSnapshot(club, 'A', { withNaming: naming });
    const season = simulateSeason(
      club,
      'A',
      naming ? snapshotEconomy(club, 'A', { withNaming: true }) : {
        gateNational: snap.gate,
        opsPerRound: snap.ops,
        namingPerRound: 0,
        roundCost: estimateRoundCostBill(club, 'A', { managerReputation: 70 }),
      },
    );
    const gateShare = season.gateSeason / season.incomeTotal;
    const stadiumNetShare = (season.gateSeason - season.opsSeason + season.namingSeason) / season.incomeTotal;
    console.log(`${label}:`);
    console.log(`  Bilheteria = ${pct(season.gateSeason, season.incomeTotal)} da renda | Líq. estádio = ${pct(stadiumNetShare * season.incomeTotal, season.incomeTotal)}`);
    console.log(`  Patrocínio+TV ainda = ${pct(season.sponsorSeason + season.tvSeason, season.incomeTotal)}`);
    console.log(`  Saldo/rod: ${fmt(season.netPerRound)}`);
  }
}

function cmpPct(a, b) {
  if (!b) return '—';
  const d = ((a / b - 1) * 100).toFixed(1);
  return `${d >= 0 ? '+' : ''}${d}%`;
}

console.log('\n— Fim das simulações base —\n');

// ── 10) NOVO: flat (preço único × multiplicador) vs por-setor ──
console.log('\n=== IMPACTO DA MUDANÇA: preço flat vs por-setor ===');
console.log('(Mesmo estádio · env/torcida 70 · save legado R$22/36 migrado para defaults por setor)\n');

const pricingCompareRows = [];
const pricingCompareData = [];

for (const p of PROFILES_V2) {
  for (const div of ['A', 'B']) {
    if (p.id === 'arena' && div === 'B') continue;
    const club = cloneClubProfile(p.build.bind(p), div);
    const cmp = comparePricingModels(club, div);
    pricingCompareData.push({ perfil: p.label, division: div, ...cmp });
    pricingCompareRows.push({
      perfil: `${p.label} (${div})`,
      cap: cmp.capacity.toLocaleString('pt-BR'),
      gateNatFlat: fmt(cmp.national.flatGate),
      gateNatNew: fmt(cmp.national.newGate),
      deltaNat: `${cmp.national.deltaPct >= 0 ? '+' : ''}${cmp.national.deltaPct.toFixed(1)}%`,
      gateTempFlat: fmt(cmp.season.flatGate),
      gateTempNew: fmt(cmp.season.newGate),
      deltaTemp: `${cmp.season.deltaPct >= 0 ? '+' : ''}${cmp.season.deltaPct.toFixed(1)}%`,
      liqDelta: fmt(cmp.season.deltaNet),
    });
  }
}

printTable('Flat vs por-setor — gate por jogo e temporada', pricingCompareRows, [
  { key: 'perfil', label: 'Perfil' },
  { key: 'cap', label: 'Cap.' },
  { key: 'gateNatFlat', label: 'Nat. flat' },
  { key: 'gateNatNew', label: 'Nat. novo' },
  { key: 'deltaNat', label: 'Δ nat.' },
  { key: 'gateTempFlat', label: 'Gate temp flat' },
  { key: 'gateTempNew', label: 'Gate temp novo' },
  { key: 'deltaTemp', label: 'Δ temp.' },
  { key: 'liqDelta', label: 'Δ líq. estádio' },
]);

// ── 11) Breakdown por setor (arena A) ──
console.log('\n=== Breakdown por setor — Arena máxima Série A ===\n');
{
  const club = cloneClubProfile(PROFILES_V2.find(x => x.id === 'arena').build, 'A');
  const flat = flatSectorGateReceipt(club, 'A', 'national');
  const neu = estimateGateReceipt(club, { channel: 'national', division: 'A' });
  const prices = normalizeTicketPrices(club.ticketPrices);
  console.log('Preços default migrados (Nacional):');
  for (const id of Object.keys(TICKET_SECTOR_PRICE_RANGE)) {
    console.log(`  • ${STADIUM_SECTOR_DEFS[id]?.shortLabel || id}: R$ ${prices.national[id]}`);
  }
  console.log('');
  console.log(
    `${'Setor'.padEnd(12)} ${'Lugares'.padStart(8)} ${'Preço'.padStart(8)} ${'Flat gate'.padStart(12)} ${'Novo gate'.padStart(12)} ${'Δ'.padStart(8)}`,
  );
  for (const row of neu.sectors || []) {
    const flatRow = flat.sectors?.find(s => s.id === row.id);
    const flatRev = flatRow?.revenue || 0;
    const delta = row.revenue - flatRev;
    const deltaPct = flatRev > 0 ? ((delta / flatRev) * 100).toFixed(0) : '—';
    console.log(
      `${(STADIUM_SECTOR_DEFS[row.id]?.shortLabel || row.id).padEnd(12)} ${String(row.seats).padStart(8)} ${String(row.price ?? prices.national[row.id]).padStart(8)} ${fmt(flatRev).padStart(12)} ${fmt(row.revenue).padStart(12)} ${((delta >= 0 ? '+' : '') + deltaPct + '%').padStart(8)}`,
    );
  }
  console.log(
    `\nTotal/jogo: flat ${fmt(flat.revenue)} → novo ${fmt(neu.revenue)} (${cmpPct(neu.revenue, flat.revenue)}) | Lotação: ${Math.round(flat.fillRate * 100)}% → ${Math.round(neu.fillRate * 100)}%`,
  );
}

// ── 12) Sensibilidade por setor (mid A) ──
console.log('\n=== Sensibilidade — ajuste de preço por setor (Médio · Série A · Nacional) ===\n');
{
  const baseMid = cloneClubProfile(PROFILES_V2.find(x => x.id === 'mid').build, 'A');
  const baseline = estimateGateReceipt(baseMid, { channel: 'national', division: 'A' }).revenue;
  console.log(`Baseline (defaults): ${fmt(baseline)}/jogo\n`);

  for (const sectorId of ['popular', 'stands', 'seats']) {
    const def = STADIUM_SECTOR_DEFS[sectorId];
    const range = TICKET_SECTOR_PRICE_RANGE[sectorId].national;
    const scenarios = [
      { label: 'mín', price: range.min },
      { label: 'méd', price: Math.round((range.min + range.max) / 2) },
      { label: 'máx', price: range.max },
    ];
    console.log(`${def.label}:`);
    for (const sc of scenarios) {
      const club = cloneClubProfile(PROFILES_V2.find(x => x.id === 'mid').build, 'A');
      setSectorPrice(club, 'national', sectorId, sc.price);
      const g = estimateGateReceipt(club, { channel: 'national', division: 'A' });
      const delta = g.revenue - baseline;
      console.log(
        `  • ${sc.label} R$ ${sc.price} → gate ${fmt(g.revenue)} (${delta >= 0 ? '+' : ''}${fmt(delta)} · lotação ${Math.round(g.fillRate * 100)}%)`,
      );
    }
  }

  console.log('\nPremium agressivo (VIP/Camarotes no máx · Popular no mín):');
  const premiumClub = cloneClubProfile(PROFILES_V2.find(x => x.id === 'large').build, 'A');
  setSectorPrice(premiumClub, 'national', 'popular', TICKET_SECTOR_PRICE_RANGE.popular.national.min);
  setSectorPrice(premiumClub, 'national', 'boxes', TICKET_SECTOR_PRICE_RANGE.boxes.national.max);
  setSectorPrice(premiumClub, 'national', 'vip', TICKET_SECTOR_PRICE_RANGE.vip.national.max);
  const premG = estimateGateReceipt(premiumClub, { channel: 'national', division: 'A' });
  const premFlat = flatSectorGateReceipt(premiumClub, 'A', 'national');
  console.log(
    `  Gate ${fmt(premG.revenue)}/jogo vs flat ${fmt(premFlat.revenue)} (${cmpPct(premG.revenue, premFlat.revenue)}) · ticket médio efetivo R$ ${premG.price}`,
  );
}

// ── 13) Peso econômico com novo modelo (start vs arena · Série A) ──
console.log('\n=== Peso na economia total — novo modelo por-setor (Série A) ===\n');
const economyWeight = [];
for (const p of ['start', 'mid', 'arena']) {
  const profile = PROFILES_V2.find(x => x.id === p);
  const club = cloneClubProfile(profile.build, 'A');
  const snap = snapshotEconomy(club, 'A', { withNaming: p !== 'start' });
  const season = simulateSeason(club, 'A', snap);
  const flatSeason = seasonGateMixFlat(club, 'A');
  economyWeight.push({
    perfil: profile.label,
    gateTemp: season.gateSeason,
    gateTempFlat: flatSeason,
    deltaPct: flatSeason > 0 ? ((season.gateSeason / flatSeason - 1) * 100).toFixed(1) : '0',
    pctRenda: pct(season.gateSeason, season.incomeTotal),
    pctLiqEstadio: pct(season.stadiumNet, season.incomeTotal),
    saldoRod: fmt(season.netPerRound),
  });
  console.log(`• ${profile.label}`);
  console.log(`  Bilheteria/temp: ${fmt(season.gateSeason)} (${pct(season.gateSeason, season.incomeTotal)} renda) · vs flat ${fmt(flatSeason)} (${economyWeight.at(-1).deltaPct}%)`);
  console.log(`  Líq. estádio/temp: ${fmt(season.stadiumNet)} (${pct(season.stadiumNet, season.incomeTotal)} renda) · saldo/rod ${fmt(season.netPerRound)}`);
}

function gateNationalAtScale(club, division, gateScale) {
  return estimateGateReceiptSectors(club, {
    channel: 'national',
    division,
    gateScale,
    ticketPrices: club.ticketPrices,
    environment: club.environment,
    support: club.support,
  }).revenue;
}

function seasonProfileAtScale(club, division, gateScale, { withNaming = false, profileId = 'start' } = {}) {
  const national = estimateGateReceiptSectors(club, {
    channel: 'national',
    division,
    gateScale,
    ticketPrices: club.ticketPrices,
    environment: club.environment,
    support: club.support,
  });
  const cups = estimateGateReceiptSectors(club, {
    channel: 'cups',
    division,
    gateScale,
    ticketPrices: club.ticketPrices,
    environment: club.environment,
    support: club.support,
  });
  const homeGames = Math.round((ROUNDS[division] || 38) * HOME_SHARE);
  const cupHomeShare = division === 'D' ? 0.35 : 0.12;
  const leagueHomes = Math.round(homeGames * (1 - cupHomeShare));
  const cupHomes = homeGames - leagueHomes;
  const gateSeason = national.revenue * leagueHomes + cups.revenue * cupHomes;
  const ops = estimateStadiumOpsBill(club, division);
  const rounds = ROUNDS[division] || 38;
  const snap = {
    gateNational: national.revenue,
    opsPerRound: ops,
    namingPerRound: 0,
    roundCost: estimateRoundCostBill(club, division, { managerReputation: 70 }),
  };
  if (withNaming && canOfferStadiumNaming(club, division)) {
    assignNamingContract(
      club,
      { sponsor: 'ScaleSim', perRound: estimateNamingPerRound(club, division, { random: () => 0.5 }) },
      { season: 2026, division },
    );
    snap.namingPerRound = estimateNamingRound(club, division);
  }
  snap.gateNational = national.revenue;
  const season = simulateSeason(club, division, snap);
  return {
    gatePerGame: national.revenue,
    fillRate: national.fillRate,
    gateSeason,
    incomeTotal: season.incomeTotal,
    stadiumNet: season.gateSeason - season.opsSeason + season.namingSeason,
    pctGateIncome: season.gateSeason / Math.max(1, season.incomeTotal),
    netPerRound: season.netPerRound,
    opsSeason: season.opsSeason,
  };
}

// ── 14) Crise (env 42 / torcida 45) ──
console.log('\n=== CRISE — env 42 · torcida 45 (flat vs por-setor) ===\n');
const crisisRows = [];
const crisisData = [];
for (const p of ['start', 'mid', 'arena']) {
  const profile = PROFILES_V2.find(x => x.id === p);
  const club = cloneClubProfile(profile.build, 'A', { environment: 42, support: 45 });
  const healthy = cloneClubProfile(profile.build, 'A', { environment: 70, support: 70 });
  const cmp = comparePricingModels(club, 'A');
  const healthyGate = estimateGateReceipt(healthy, { channel: 'national', division: 'A' }).revenue;
  const crisisGate = estimateGateReceipt(club, { channel: 'national', division: 'A' }).revenue;
  crisisData.push({
    perfil: profile.label,
    crisisGate,
    healthyGate,
    dropPct: healthyGate > 0 ? ((crisisGate / healthyGate - 1) * 100) : 0,
    flatGate: cmp.national.flatGate,
    newGate: cmp.national.newGate,
    deltaFlatNewPct: cmp.national.deltaPct,
    seasonDeltaNet: cmp.season.deltaNet,
  });
  crisisRows.push({
    perfil: profile.label,
    saudavel: fmt(healthyGate),
    crise: fmt(crisisGate),
    queda: pct(crisisGate, healthyGate),
    flat: fmt(cmp.national.flatGate),
    novo: fmt(cmp.national.newGate),
    deltaModelo: `${cmp.national.deltaPct >= 0 ? '+' : ''}${cmp.national.deltaPct.toFixed(1)}%`,
  });
  console.log(
    `• ${profile.label}: saudável ${fmt(healthyGate)} → crise ${fmt(crisisGate)} (${pct(crisisGate, healthyGate)} do saudável) · flat ${fmt(cmp.national.flatGate)} → novo ${fmt(cmp.national.newGate)} (${cmp.national.deltaPct >= 0 ? '+' : ''}${cmp.national.deltaPct.toFixed(1)}%)`,
  );
}

// ── 15) Divisões B / C / D (start vs arena máx) ──
console.log('\n=== DIVISÕES B · C · D — start vs máximo (novo modelo) ===\n');
const divisionRows = [];
const divisionData = [];
for (const div of ['B', 'C', 'D']) {
  const startClub = cloneClubProfile(PROFILES_V2.find(x => x.id === 'start').build, div);
  const maxClub = buildMaxStadiumClub(div);
  ensureStadium(maxClub, div);
  const startCmp = comparePricingModels(startClub, div);
  const maxCmp = comparePricingModels(maxClub, div);
  const startSeason = simulateSeason(startClub, div, snapshotEconomy(startClub, div));
  const maxSeason = simulateSeason(maxClub, div, snapshotEconomy(maxClub, div, { withNaming: div === 'A' || div === 'B' }));
  divisionData.push({
    division: div,
    start: {
      capacity: startCmp.capacity,
      gateGame: startCmp.national.newGate,
      deltaFlatNewPct: startCmp.national.deltaPct,
      gateSeason: startSeason.gateSeason,
      pctIncome: startSeason.gateSeason / Math.max(1, startSeason.incomeTotal),
      stadiumNet: startSeason.stadiumNet,
    },
    max: {
      capacity: maxCmp.capacity,
      gateGame: maxCmp.national.newGate,
      deltaFlatNewPct: maxCmp.national.deltaPct,
      gateSeason: maxSeason.gateSeason,
      pctIncome: maxSeason.gateSeason / Math.max(1, maxSeason.incomeTotal),
      stadiumNet: maxSeason.stadiumNet,
    },
  });
  divisionRows.push({
    div: `Série ${div}`,
    capStart: startCmp.capacity.toLocaleString('pt-BR'),
    capMax: maxCmp.capacity.toLocaleString('pt-BR'),
    gateStart: fmt(startCmp.national.newGate),
    gateMax: fmt(maxCmp.national.newGate),
    deltaStart: `${startCmp.national.deltaPct >= 0 ? '+' : ''}${startCmp.national.deltaPct.toFixed(1)}%`,
    deltaMax: `${maxCmp.national.deltaPct >= 0 ? '+' : ''}${maxCmp.national.deltaPct.toFixed(1)}%`,
    pctRendaMax: pct(maxSeason.gateSeason, maxSeason.incomeTotal),
  });
  console.log(`• Série ${div}`);
  console.log(
    `  Start: ${startCmp.capacity.toLocaleString('pt-BR')} lug · gate ${fmt(startCmp.national.newGate)}/jogo (Δ flat ${startCmp.national.deltaPct >= 0 ? '+' : ''}${startCmp.national.deltaPct.toFixed(1)}%) · ${pct(startSeason.gateSeason, startSeason.incomeTotal)} renda`,
  );
  console.log(
    `  Máx:   ${maxCmp.capacity.toLocaleString('pt-BR')} lug · gate ${fmt(maxCmp.national.newGate)}/jogo (Δ flat ${maxCmp.national.deltaPct >= 0 ? '+' : ''}${maxCmp.national.deltaPct.toFixed(1)}%) · ${pct(maxSeason.gateSeason, maxSeason.incomeTotal)} renda · líq ${fmt(maxSeason.stadiumNet)}`,
  );
}

printTable('Divisões B/C/D — flat→novo por perfil', divisionRows, [
  { key: 'div', label: 'Divisão' },
  { key: 'capStart', label: 'Cap start' },
  { key: 'gateStart', label: 'Gate start' },
  { key: 'deltaStart', label: 'Δ flat start' },
  { key: 'capMax', label: 'Cap máx' },
  { key: 'gateMax', label: 'Gate máx' },
  { key: 'deltaMax', label: 'Δ flat máx' },
  { key: 'pctRendaMax', label: '% renda máx' },
]);

// ── 16) Sensibilidade GATE_REVENUE_SCALE (0.25 / 0.28 / 0.30) ──
console.log('\n=== GATE_REVENUE_SCALE — 0.25 vs 0.28 vs 0.30 (Série A · novo modelo) ===\n');
const scaleRows = [];
const scaleData = [];
const SCALES = [0.25, 0.28, 0.3];
for (const p of ['start', 'mid', 'arena']) {
  const profile = PROFILES_V2.find(x => x.id === p);
  const row = { perfil: profile.label };
  for (const scale of SCALES) {
    const club = cloneClubProfile(profile.build, 'A');
    const stats = seasonProfileAtScale(club, 'A', scale, { withNaming: p !== 'start', profileId: p });
    const key = String(scale).replace('.', '');
    row[`gate${key}`] = fmt(stats.gatePerGame);
    row[`temp${key}`] = fmt(stats.gateSeason);
    row[`pct${key}`] = `${(stats.pctGateIncome * 100).toFixed(1)}%`;
    row[`liq${key}`] = fmt(stats.stadiumNet);
    row[`saldo${key}`] = fmt(stats.netPerRound);
  }
  scaleRows.push(row);
  scaleData.push({ perfil: profile.label, scales: SCALES.map(s => {
    const club = cloneClubProfile(profile.build, 'A');
    const st = seasonProfileAtScale(club, 'A', s, { withNaming: p !== 'start' });
    return { scale: s, gatePerGame: st.gatePerGame, gateSeason: st.gateSeason, pctIncome: st.pctGateIncome, stadiumNet: st.stadiumNet, netPerRound: st.netPerRound };
  })});
  console.log(`• ${profile.label}`);
  for (const scale of SCALES) {
    const st = scaleData.at(-1).scales.find(x => x.scale === scale);
    console.log(
      `  scale ${scale}: gate ${fmt(st.gatePerGame)}/jogo · temp ${fmt(st.gateSeason)} (${(st.pctIncome * 100).toFixed(1)}% renda) · líq estádio ${fmt(st.stadiumNet)} · saldo/rod ${fmt(st.netPerRound)}`,
    );
  }
}

printTable('GATE_REVENUE_SCALE por perfil', scaleRows.map(r => ({
  perfil: r.perfil,
  gate025: r.gate025,
  gate028: r.gate028,
  gate03: r.gate03,
  pct028: r.pct028,
  pct03: r.pct03,
  saldo028: r.saldo028,
  saldo03: r.saldo03,
})), [
  { key: 'perfil', label: 'Perfil' },
  { key: 'gate025', label: '0.25/jogo' },
  { key: 'gate028', label: '0.28/jogo' },
  { key: 'gate03', label: '0.30/jogo' },
  { key: 'pct028', label: '% renda 0.28' },
  { key: 'pct03', label: '% renda 0.30' },
  { key: 'saldo028', label: 'Saldo/rod 0.28' },
  { key: 'saldo03', label: 'Saldo/rod 0.30' },
]);

const arena028 = scaleData.find(x => x.perfil.includes('Arena'))?.scales.find(x => x.scale === 0.28);
const arena030 = scaleData.find(x => x.perfil.includes('Arena'))?.scales.find(x => x.scale === 0.3);
console.log('\nRecomendação scale:');
console.log(`  • 0.28 (atual): arena máx = ${(arena028?.pctIncome * 100).toFixed(1)}% da renda · saldo/rod ${fmt(arena028?.netPerRound)}`);
console.log(`  • 0.30:         arena máx = ${(arena030?.pctIncome * 100).toFixed(1)}% da renda · saldo/rod ${fmt(arena030?.netPerRound)} (+${cmpPct(arena030?.pctIncome, arena028?.pctIncome)} na fatia bilheteria)`);
console.log(`  • 0.25:         arena máx = ${((scaleData.find(x => x.perfil.includes('Arena'))?.scales.find(x => x.scale === 0.25)?.pctIncome ?? 0) * 100).toFixed(1)}% da renda — mais conservador`);
console.log('  → Manter 0.28 no start/médio; considerar 0.26–0.27 se quiser capar arena >50% renda sem nerfar divisões menores.');

// ── Export JSON resumo ──
const exportPayload = {
  generatedAt: new Date().toISOString(),
  model: 'per-sector-pricing-v1',
  gateRevenueScale: GATE_REVENUE_SCALE,
  flatVsNew: pricingCompareData.map(d => ({
    perfil: d.perfil,
    division: d.division,
    capacity: d.capacity,
    nationalDeltaPct: d.national?.deltaPct,
    seasonDeltaPct: d.season?.deltaPct,
    seasonDeltaNet: d.season?.deltaNet,
  })),
  economyWeight,
  crisis: crisisData,
  divisions: divisionData,
  gateScaleSensitivity: scaleData,
  defaultSectorPrices: {
    national: defaultSectorPricesForChannel('national'),
    cups: defaultSectorPricesForChannel('cups'),
  },
};
writeFileSync('tmp-bench-stadium-sector-pricing.json', JSON.stringify(exportPayload, null, 2));
console.log('\n→ Resumo JSON: tmp-bench-stadium-sector-pricing.json\n');
