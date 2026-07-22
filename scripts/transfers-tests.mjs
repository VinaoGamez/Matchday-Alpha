import { generatePlayerId, ensurePlayerId } from '../js/engine/player-identity.js';
import { estimatePlayerValue, ensureMarketFields } from '../js/engine/player-value.js';
import {
  createTransfersEngine,
  isDateInTransferWindow,
  nextTransferWindowOpen,
  getTransferWindowBounds,
  getTransferWindowPhase,
  formatTransferWindowDate,
  CBF_TRANSFER_WINDOWS,
} from '../js/engine/transfers.js';
import { collectWorldRosters, applyWorldRosters, stampWorldPlayers } from '../js/engine/world-rosters.js';
import { playerKey } from '../js/engine/player-match-stats.js';

const moneyEngineDeps = (clubs, extras = {}) => {
  const normalized = withPayrollRoom(clubs);
  return {
    getClubs: () => normalized,
    getUserClub: () => 'Meu Clube',
    getCareerSeason: () => 2030,
    /** Dentro da 1ª janela CBF por padrão. */
    getCareerDate: () => new Date(2030, 0, 20, 12),
    spend: (club, amount) => {
      club.budget -= amount;
      return { ok: true, balance: club.budget };
    },
    credit: (club, amount) => {
      club.budget = (club.budget || 0) + amount;
      return { ok: true, balance: club.budget };
    },
    canAfford: (club, amount) => (club.budget || 0) >= amount,
    isMarketOpen: () => true,
    ...extras,
  };
};

let passed = 0;
let failed = 0;

const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${label}`);
    console.error(`  ${error.message}`);
  }
};

const assert = (cond, message) => {
  if (!cond) throw new Error(message || 'assertion failed');
};

const makePlayer = (overrides = {}) =>
  ensureMarketFields(
    ensurePlayerId(
      {
        name: 'Teste Silva',
        pos: 'ATA',
        age: 24,
        overall: 72,
        potential: 80,
        fatigue: 100,
        wage: 4_000,
        ...overrides,
      },
      { seed: 1, club: 'Clube A', index: 1 },
    ),
    { division: 'C', season: 2030 },
  );

/** Clube com receita/folha realistas para testes de compra/empréstimo. */
const makeTransferClub = (name, { division = 'C', roster = [], budget = 20_000_000, power = 70, ...extra } = {}) => ({
  name,
  division,
  budget,
  budgetLedger: [],
  finances: 82,
  support: 72,
  board: 72,
  environment: 68,
  stadiumCapacity: 28_000,
  power,
  sponsors: {
    season: 2030,
    division,
    total: 12_000_000,
    credited: true,
    installments: 38,
    paidAmount: 0,
    paidInstallments: 0,
    master: { name: 'MasterCo', amount: 8_000_000 },
    secondaries: [],
  },
  tvRights: {
    season: 2030,
    division,
    total: 10_000_000,
    credited: true,
    installments: 38,
    paidAmount: 0,
    paidInstallments: 0,
    homeMode: true,
  },
  roster,
  ...extra,
});

const TRANSFER_TEST_SQUAD = 19;

const transferSquad = (count = TRANSFER_TEST_SQUAD, prefix, playerOpts = {}) =>
  Array.from({ length: count }, (_, i) =>
    makePlayer({
      name: `${prefix} ${i}`,
      playerId: `${prefix}-${i}`,
      overall: 66,
      wage: 4_000,
      ...playerOpts,
    }),
  );

const withPayrollRoom = clubs =>
  Object.fromEntries(
    Object.entries(clubs).map(([name, club]) => [
      name,
      club.sponsors?.total && club.tvRights?.total
        ? club
        : makeTransferClub(name, { ...club, roster: club.roster || [] }),
    ]),
  );

check('playerId stable', () => {
  const a = generatePlayerId({ seed: 42, club: 'X', index: 3 });
  const b = generatePlayerId({ seed: 42, club: 'X', index: 3 });
  assert(a === b, 'deterministic');
  assert(a.startsWith('p-'), 'prefix');
});

check('playerKey prefers playerId', () => {
  const p = makePlayer({ playerId: 'p-abc' });
  assert(playerKey(p) === 'p-abc', playerKey(p));
});

check('valuation scales with overall', () => {
  const low = estimatePlayerValue({ overall: 60, age: 28, potential: 60 }, 'C');
  const high = estimatePlayerValue({ overall: 80, age: 28, potential: 80 }, 'C');
  assert(high > low, `${high} > ${low}`);
});

check('buy transfer moves roster and spends', () => {
  const sellerPlayer = makePlayer({ name: 'Atacante Alvo', overall: 74, potential: 78 });
  const clubs = withPayrollRoom({
    'Meu Clube': makeTransferClub('Meu Clube', {
      roster: transferSquad(19, 'Meu'),
    }),
    'Rival FC': makeTransferClub('Rival FC', {
      budget: 1_000_000,
      roster: [sellerPlayer, ...transferSquad(19, 'Rival', { overall: 65 })],
    }),
  });
  const engine = createTransfersEngine(moneyEngineDeps(clubs));
  const beforeBuyer = clubs['Meu Clube'].roster.length;
  const beforeSeller = clubs['Rival FC'].roster.length;
  const result = engine.buyPlayer(sellerPlayer.playerId);
  assert(result.ok, result.reason || 'buy ok');
  assert(clubs['Meu Clube'].roster.length === beforeBuyer + 1, 'buyer +1');
  assert(clubs['Rival FC'].roster.length === beforeSeller - 1, 'seller -1');
  assert(clubs['Meu Clube'].roster.some(p => p.playerId === sellerPlayer.playerId), 'moved');
});

check('buy filters: age, ovr range, max price and sort', () => {
  const clubs = {
    'Meu Clube': {
      name: 'Meu Clube',
      division: 'C',
      roster: Array.from({ length: 18 }, (_, i) => makePlayer({ name: `Meu ${i}`, playerId: `flt-me-${i}` })),
    },
    'Rival FC': {
      name: 'Rival FC',
      division: 'C',
      roster: [
        makePlayer({ name: 'Jovem Forte', playerId: 'flt-yf', age: 20, overall: 72, marketValue: 800_000, wage: 12_000 }),
        makePlayer({ name: 'Veterano', playerId: 'flt-vet', age: 33, overall: 74, marketValue: 400_000, wage: 18_000 }),
        makePlayer({ name: 'Barato', playerId: 'flt-bar', age: 24, overall: 68, marketValue: 200_000, wage: 6_000 }),
        makePlayer({ name: 'Caro', playerId: 'flt-car', age: 25, overall: 70, marketValue: 2_000_000, wage: 40_000 }),
      ],
    },
  };
  clubs['Rival FC'].roster.forEach(p => {
    p.listed = true;
    p.askingPrice = p.marketValue;
  });
  const engine = createTransfersEngine({
    getClubs: () => clubs,
    getUserClub: () => 'Meu Clube',
    getCareerSeason: () => 2030,
    spend: () => ({ ok: true }),
    credit: () => ({ ok: true }),
    canAfford: () => true,
    isMarketOpen: () => true,
  });
  const young = engine.listBuyCandidates({ minAge: 16, maxAge: 25, listedOnly: true });
  assert(young.every(r => r.age >= 16 && r.age <= 25), 'age band');
  assert(young.some(r => r.player.name === 'Jovem Forte'), 'young included');
  assert(!young.some(r => r.player.name === 'Veterano'), 'veteran excluded');
  const midOvr = engine.listBuyCandidates({ minOvr: 70, maxOvr: 72, listedOnly: true });
  assert(midOvr.every(r => r.overall >= 70 && r.overall <= 72), 'ovr band');
  const cheap = engine.listBuyCandidates({ maxPrice: 500_000, listedOnly: true, sortBy: 'price' });
  assert(cheap.every(r => r.price <= 500_000), 'max price');
  assert(cheap[0].price <= cheap[cheap.length - 1].price, 'price asc');
  const byOvr = engine.listBuyCandidates({ listedOnly: true, sortBy: 'ovr' });
  assert(byOvr[0].overall >= byOvr[1].overall, 'ovr desc');
});

check('setListed stores asking price; seedAiListings fills market', () => {
  const clubs = {
    'Meu Clube': {
      name: 'Meu Clube',
      division: 'C',
      budget: 5_000_000,
      roster: Array.from({ length: 18 }, (_, i) => makePlayer({ name: `Meu ${i}`, playerId: `seed-me-${i}` })),
    },
    'Rival FC': {
      name: 'Rival FC',
      division: 'C',
      roster: Array.from({ length: 22 }, (_, i) =>
        makePlayer({ name: `Rival ${i}`, playerId: `seed-riv-${i}`, overall: 66 + (i % 8) }),
      ),
    },
    'Outro FC': {
      name: 'Outro FC',
      division: 'D',
      roster: Array.from({ length: 22 }, (_, i) =>
        makePlayer({ name: `Outro ${i}`, playerId: `seed-out-${i}`, overall: 60 }),
      ),
    },
  };
  const engine = createTransfersEngine({
    getClubs: () => clubs,
    getUserClub: () => 'Meu Clube',
    getCareerSeason: () => 2030,
    spend: () => ({ ok: true }),
    credit: () => ({ ok: true }),
    canAfford: () => true,
    isMarketOpen: () => true,
  });
  const mine = clubs['Meu Clube'].roster[0];
  const listed = engine.setListed(mine.playerId, true, 777_000);
  assert(listed.ok, 'list ok');
  assert(listed.player.listed === true, 'listed flag');
  assert(listed.player.askingPrice === 777_000, `ask=${listed.player.askingPrice}`);
  const seeded = engine.seedAiListings({ ratio: 0.5, minListed: 8 });
  assert(seeded > 0, `seeded=${seeded}`);
  const onlyListed = engine.listBuyCandidates({ listedOnly: true });
  assert(onlyListed.length > 0, 'listedOnly has rows');
  assert(onlyListed.every(row => row.player.listed), 'all listed');
});

check('world roster roundtrip', () => {
  const clubs = {
    Alpha: {
      division: 'B',
      roster: Array.from({ length: 18 }, (_, i) =>
        makePlayer({ name: `Alpha ${i}`, playerId: `p-a${i}` }),
      ),
    },
  };
  stampWorldPlayers(clubs, { seed: 9, season: 2030 });
  const snap = collectWorldRosters(clubs);
  assert(!snap.Alpha[0].workload, 'slim: no workload');
  assert(!snap.Alpha[0].injuryHistory, 'slim: no injuryHistory');
  const other = {
    Alpha: { division: 'B', roster: [] },
  };
  applyWorldRosters(other, snap, { seed: 9, season: 2030 });
  assert(other.Alpha.roster.length === 18, `restored=${other.Alpha.roster.length}`);
  assert(other.Alpha.roster[0].playerId === 'p-a0', 'id kept');
});

check('collectWorldRosters can skip user club', () => {
  const clubs = {
    User: { division: 'C', roster: Array.from({ length: 18 }, (_, i) => makePlayer({ playerId: `u${i}` })) },
    Rival: { division: 'C', roster: Array.from({ length: 18 }, (_, i) => makePlayer({ playerId: `r${i}` })) },
  };
  const snap = collectWorldRosters(clubs, { skipClub: 'User' });
  assert(!snap.User, 'user skipped');
  assert(snap.Rival?.length === 18, 'rival kept');
});

check('editable buy offer: reject below floor, accept custom fee', () => {
  const sellerPlayer = makePlayer({
    name: 'Negociavel',
    overall: 75,
    potential: 78,
    marketValue: 1_000_000,
    listed: true,
    askingPrice: 1_000_000,
  });
  const clubs = withPayrollRoom({
    'Meu Clube': makeTransferClub('Meu Clube', { roster: transferSquad(19, 'Meu') }),
    'Rival FC': makeTransferClub('Rival FC', {
      budget: 1_000_000,
      roster: [sellerPlayer, ...transferSquad(19, 'Rival', { overall: 65 })],
    }),
  });
  const engine = createTransfersEngine(moneyEngineDeps(clubs));
  const low = engine.buyPlayer(sellerPlayer.playerId, 500_000);
  assert(!low.ok && low.reason === 'rejected', `expected rejected got ${low.reason}`);
  assert(low.floor > 500_000, `floor=${low.floor}`);
  const okOffer = engine.buyPlayer(sellerPlayer.playerId, low.floor);
  assert(okOffer.ok, okOffer.reason || 'accept at floor');
  assert(okOffer.fee === low.floor, `fee=${okOffer.fee}`);
});

check('loan in/out respects max 3 per club and season return', () => {
  const clubs = withPayrollRoom({
    'Meu Clube': makeTransferClub('Meu Clube', {
      budget: 5_000_000,
      roster: transferSquad(19, 'Meu'),
    }),
    'Rival FC': makeTransferClub('Rival FC', {
      roster: transferSquad(22, 'Rival', { overall: 68, loanListed: true }),
    }),
    'Outro FC': makeTransferClub('Outro FC', { roster: transferSquad(19, 'Outro') }),
  });
  const engine = createTransfersEngine(moneyEngineDeps(clubs));

  const first = clubs['Rival FC'].roster.find(p => p.loanListed);
  const r1 = engine.loanPlayer(first.playerId);
  assert(r1.ok, r1.reason || 'loan 1');
  assert(r1.player.onLoan && r1.player.loanFrom === 'Rival FC', 'loan flags');
  assert(r1.loanBuyFee > 0 && r1.player.loanBuyOption?.fee === r1.loanBuyFee, 'loan buy option stamped');
  assert(engine.countIncomingLoans(clubs['Meu Clube']) === 1, 'incoming 1');
  assert(engine.countOutgoingLoans('Rival FC') === 1, 'outgoing 1');

  const more = clubs['Rival FC'].roster.filter(p => p.loanListed).slice(0, 3);
  more.forEach(p => engine.loanPlayer(p.playerId));
  assert(engine.countIncomingLoans(clubs['Meu Clube']) === 3, 'incoming capped at 3');
  const blocked = clubs['Rival FC'].roster.find(p => p.loanListed && !p.onLoan);
  if (blocked) {
    const fail = engine.loanPlayer(blocked.playerId);
    assert(!fail.ok && fail.reason === 'loan_in_limit', `expected loan_in_limit got ${fail.reason}`);
  }

  const mine = clubs['Meu Clube'].roster.find(p => !p.onLoan);
  const out1 = engine.loanOutPlayer(mine.playerId);
  assert(out1.ok, out1.reason || 'loan out');
  assert(engine.countOutgoingLoans('Meu Clube') === 1, 'user outgoing 1');

  const returned = engine.returnExpiredLoans();
  assert(returned >= 3, `season return ${returned}`);
  assert(engine.countIncomingLoans(clubs['Meu Clube']) === 0, 'incoming cleared');
  assert(
    clubs['Rival FC'].roster.some(p => p.playerId === first.playerId && !p.onLoan),
    'owner got player back',
  );
});

check('transfer window CBF: first/second open, mid-year closed', () => {
  const bounds = getTransferWindowBounds();
  assert(bounds.first.start.month === 1 && bounds.first.start.day === 1, 'first starts 1/1');
  assert(bounds.first.end.month === 3 && bounds.first.end.day === 3, 'first ends 3/3');
  assert(bounds.second.start.month === 7 && bounds.second.start.day === 20, 'second starts 20/7');
  assert(bounds.second.end.month === 9 && bounds.second.end.day === 11, 'second ends 11/9');
  assert(CBF_TRANSFER_WINDOWS.first.end.day === 3, 'template');

  assert(isDateInTransferWindow(new Date(2030, 0, 1)), '1 jan open');
  assert(isDateInTransferWindow(new Date(2030, 0, 20)), 'jan open');
  assert(isDateInTransferWindow(new Date(2030, 2, 3)), '3 mar open');
  assert(!isDateInTransferWindow(new Date(2030, 2, 4)), '4 mar closed');
  assert(isDateInTransferWindow(new Date(2030, 6, 20)), '20 jul open');
  assert(isDateInTransferWindow(new Date(2030, 8, 11)), '11 set open');
  assert(!isDateInTransferWindow(new Date(2030, 3, 15)), 'apr closed');

  const next = nextTransferWindowOpen(new Date(2030, 3, 15));
  assert(next && next.getMonth() === 6 && next.getDate() === 20, `next=${next}`);
  assert(formatTransferWindowDate(next) === '20/07', formatTransferWindowDate(next));
  const nextYear = nextTransferWindowOpen(new Date(2030, 9, 1));
  assert(nextYear && nextYear.getFullYear() === 2031 && nextYear.getMonth() === 0, 'next year jan');

  const mid = getTransferWindowPhase(new Date(2030, 0, 15));
  assert(mid.active && mid.mode === 'week', 'mid window week mode');
  const deadline = getTransferWindowPhase(new Date(2030, 2, 1));
  assert(deadline.active && deadline.mode === 'day', 'deadline week day mode');
  assert(deadline.isDeadlineWeek, 'deadline week flag');
  const last = getTransferWindowPhase(new Date(2030, 2, 3));
  assert(last.isDeadlineDay && last.daysLeft === 0, 'deadline day');
});

check('market day brief groups deals/interests and stubs free agents', () => {
  const day = new Date(2030, 0, 20, 12);
  const clubs = {
    'Meu Clube': {
      name: 'Meu Clube',
      division: 'C',
      budget: 20_000_000,
      roster: [
        makePlayer({ playerId: 'brief-star', name: 'Alvo', overall: 74, pos: 'ATA', marketValue: 1_200_000 }),
        ...Array.from({ length: 18 }, (_, i) => makePlayer({ playerId: `brief-me-${i}` })),
      ],
    },
    'Vende FC': {
      name: 'Vende FC',
      division: 'C',
      budget: 2_000_000,
      power: 60,
      roster: [
        makePlayer({
          playerId: 'brief-listed',
          name: 'Listado',
          overall: 72,
          listed: true,
          askingPrice: 900_000,
          marketValue: 900_000,
          pos: 'MC',
        }),
        ...Array.from({ length: 20 }, (_, i) => makePlayer({ playerId: `brief-v-${i}`, overall: 64, pos: 'MC' })),
      ],
    },
    'Compra FC': {
      name: 'Compra FC',
      division: 'C',
      budget: 40_000_000,
      power: 75,
      environment: 60,
      roster: Array.from({ length: 18 }, (_, i) =>
        makePlayer({ playerId: `brief-c-${i}`, pos: 'ZAG', overall: 66 }),
      ),
    },
  };
  const engine = createTransfersEngine(
    moneyEngineDeps(clubs, {
      getCareerDate: () => day,
      getNationalRank: () => ({ position: 20, total: 100 }),
      getClubForm: () => ['W', 'D', 'L'],
    }),
  );
  engine.runAiMarketTick({ maxBuys: 6, maxLoanDeals: 2, maxUserOffers: 2 });
  const brief = engine.getMarketDayBrief(day);
  assert(brief.phase?.active, 'window active on day');
  assert(brief.freeAgents?.comingSoon && !brief.freeAgents.enabled, 'free agents stubbed');
  assert(Array.isArray(brief.deals), 'deals array');
  assert(Array.isArray(brief.watches), 'watches array');
  assert(Array.isArray(brief.interests), 'interests array');
  const closed = engine.getMarketDayBrief(new Date(2030, 3, 15, 12));
  assert(!closed.phase?.active, 'april closed');
});

check('transfer window closed blocks buys outside dates', () => {
  const clubs = {
    'Meu Clube': {
      name: 'Meu Clube',
      division: 'C',
      budget: 10_000_000,
      roster: Array.from({ length: 18 }, (_, i) => makePlayer({ playerId: `win-me-${i}` })),
    },
    'Rival FC': {
      name: 'Rival FC',
      division: 'C',
      roster: [
        makePlayer({ playerId: 'win-target', marketValue: 500_000 }),
        ...Array.from({ length: 18 }, (_, i) => makePlayer({ playerId: `win-riv-${i}` })),
      ],
    },
  };
  const engine = createTransfersEngine(
    moneyEngineDeps(clubs, {
      getCareerDate: () => new Date(2030, 3, 15, 12),
    }),
  );
  assert(!engine.marketOpen(), 'market closed outside window');
  assert(engine.marketStatus().reason === 'window_closed', engine.marketStatus().reason);
  assert(engine.marketStatus().nextOpenLabel === '20/07', engine.marketStatus().nextOpenLabel);
  const blocked = engine.buyPlayer('win-target', 500_000);
  assert(!blocked.ok && blocked.reason === 'window_closed', blocked.reason);
});

check('window closing report picks biggest transfer', () => {
  const clubs = withPayrollRoom({
    'Meu Clube': makeTransferClub('Meu Clube', {
      budget: 50_000_000,
      roster: transferSquad(19, 'rep-me'),
    }),
    'Vende FC': makeTransferClub('Vende FC', {
      budget: 2_000_000,
      power: 60,
      roster: [
        makePlayer({
          playerId: 'rep-star',
          name: 'Estrela',
          overall: 78,
          listed: true,
          askingPrice: 2_500_000,
          marketValue: 2_500_000,
          pos: 'ATA',
        }),
        makePlayer({
          playerId: 'rep-low',
          name: 'Barato',
          overall: 68,
          listed: true,
          askingPrice: 400_000,
          marketValue: 400_000,
          pos: 'MC',
        }),
        ...transferSquad(19, 'rep-v', { overall: 64, pos: 'MC' }),
      ],
    }),
    'Compra FC': makeTransferClub('Compra FC', {
      budget: 40_000_000,
      power: 75,
      environment: 60,
      roster: transferSquad(19, 'rep-c', { pos: 'ZAG', overall: 66 }),
    }),
  });
  const engine = createTransfersEngine(
    moneyEngineDeps(clubs, {
      getCareerDate: () => new Date(2030, 0, 20, 12),
      getNationalRank: () => ({ position: 20, total: 100 }),
      getClubForm: () => ['W', 'W', 'D'],
    }),
  );
  engine.runAiMarketTick({ maxBuys: 8, maxLoanDeals: 0, maxUserOffers: 0 });
  const report = engine.buildWindowClosingReport({ label: 'Janela de verão' });
  assert(report.dealCount >= 1, `deals=${report.dealCount}`);
  assert(report.biggest && report.biggest.fee > 0, 'has biggest');
  assert(report.biggest.fee >= report.deals[report.deals.length - 1].fee, 'sorted');
});

check('seller floor: short contract lower than long; bad moment/rank ease sale', () => {
  const baseSeller = {
    name: 'Rival FC',
    division: 'C',
    power: 70,
    environment: 55,
    board: 55,
    finances: 55,
    position: 10,
    roster: Array.from({ length: 20 }, (_, i) =>
      makePlayer({ name: `R${i}`, playerId: `fl-r-${i}`, pos: i < 4 ? 'ATA' : 'MC', overall: 68 }),
    ),
  };
  const clubs = {
    'Meu Clube': {
      name: 'Meu Clube',
      division: 'C',
      budget: 20_000_000,
      roster: Array.from({ length: 18 }, (_, i) => makePlayer({ playerId: `fl-me-${i}` })),
    },
    'Rival FC': baseSeller,
  };
  const engine = createTransfersEngine(
    moneyEngineDeps(clubs, {
      getClubForm: () => ['D', 'D', 'W'],
      getNationalRank: () => ({ position: 40, total: 100 }),
      getUserManager: () => ({ reputation: 40, total: 40 }),
    }),
  );

  const shortP = makePlayer({
    playerId: 'fl-short',
    marketValue: 1_000_000,
    askingPrice: 1_000_000,
    listed: true,
    contractUntil: 2031,
    overall: 72,
    pos: 'ATA',
  });
  const longP = makePlayer({
    playerId: 'fl-long',
    marketValue: 1_000_000,
    askingPrice: 1_000_000,
    listed: true,
    contractUntil: 2034,
    overall: 72,
    pos: 'ATA',
  });
  const vShort = engine.evaluateSellerAccept(shortP, 0, baseSeller, {
    clubName: 'Rival FC',
    season: 2030,
    applyManagerPull: false,
  });
  const vLong = engine.evaluateSellerAccept(longP, 0, baseSeller, {
    clubName: 'Rival FC',
    season: 2030,
    applyManagerPull: false,
  });
  assert(vShort.reasons.includes('contract_short'), String(vShort.reasons));
  assert(vLong.reasons.includes('contract_long'), String(vLong.reasons));
  assert(vShort.floor < vLong.floor, `${vShort.floor} < ${vLong.floor}`);

  const softEngine = createTransfersEngine(
    moneyEngineDeps(clubs, {
      getClubForm: () => ['L', 'L', 'L', 'L', 'L'],
      getNationalRank: () => ({ position: 90, total: 100 }),
      getUserManager: () => ({ reputation: 40, total: 40 }),
    }),
  );
  const softSeller = {
    ...baseSeller,
    environment: 30,
    board: 28,
    finances: 32,
    position: 18,
  };
  const soft = softEngine.evaluateSellerAccept(longP, 0, softSeller, {
    clubName: 'Rival FC',
    season: 2030,
    applyManagerPull: false,
  });
  assert(soft.reasons.includes('bad_moment') || soft.reasons.includes('rank_weak'), String(soft.reasons));
  assert(soft.floor < vLong.floor, `soft ${soft.floor} < hard ${vLong.floor}`);
});

check('seller floor: star + strong national rank hardens', () => {
  const seller = {
    name: 'Rival FC',
    division: 'A',
    power: 70,
    environment: 70,
    board: 72,
    finances: 68,
    position: 3,
    roster: Array.from({ length: 20 }, (_, i) =>
      makePlayer({ playerId: `st-r-${i}`, pos: 'MC', overall: 70 }),
    ),
  };
  const clubs = {
    'Meu Clube': {
      name: 'Meu Clube',
      division: 'A',
      budget: 50_000_000,
      roster: Array.from({ length: 18 }, (_, i) => makePlayer({ playerId: `st-me-${i}` })),
    },
    'Rival FC': seller,
  };
  const engine = createTransfersEngine(
    moneyEngineDeps(clubs, {
      getClubForm: () => ['W', 'W', 'W', 'D', 'W'],
      getNationalRank: () => ({ position: 4, total: 100 }),
      getUserManager: () => ({ reputation: 40, total: 40 }),
    }),
  );
  const star = makePlayer({
    playerId: 'st-star',
    marketValue: 2_000_000,
    askingPrice: 2_000_000,
    listed: false,
    contractUntil: 2033,
    overall: 82,
    pos: 'ATA',
  });
  const verdict = engine.evaluateSellerAccept(star, 0, seller, {
    clubName: 'Rival FC',
    season: 2030,
    applyManagerPull: false,
  });
  assert(verdict.reasons.includes('star'), String(verdict.reasons));
  assert(verdict.reasons.includes('rank_strong'), String(verdict.reasons));
  assert(verdict.ratio >= 0.9, `ratio=${verdict.ratio}`);
});

check('manager pull: deterministic discount for admiring player', () => {
  const seller = {
    name: 'Rival FC',
    division: 'C',
    power: 70,
    roster: Array.from({ length: 20 }, (_, i) => makePlayer({ playerId: `mp-r-${i}` })),
  };
  const clubs = {
    'Meu Clube': {
      name: 'Meu Clube',
      division: 'C',
      budget: 20_000_000,
      roster: Array.from({ length: 18 }, (_, i) => makePlayer({ playerId: `mp-me-${i}` })),
    },
    'Rival FC': seller,
  };
  const engine = createTransfersEngine(
    moneyEngineDeps(clubs, {
      getUserManager: () => ({ reputation: 85, total: 90 }),
    }),
  );
  let pulled = null;
  let baseFloor = null;
  for (let i = 0; i < 3000; i += 1) {
    const player = makePlayer({
      playerId: `mp-pull-${i}`,
      marketValue: 1_000_000,
      askingPrice: 1_000_000,
      listed: true,
      contractUntil: 2032,
      overall: 72,
    });
    const withPull = engine.evaluateSellerAccept(player, 0, seller, {
      clubName: 'Rival FC',
      season: 2030,
      buyerManager: { reputation: 85, total: 90 },
    });
    if (!withPull.playerPull) continue;
    const without = engine.evaluateSellerAccept(player, 0, seller, {
      clubName: 'Rival FC',
      season: 2030,
      applyManagerPull: false,
    });
    pulled = withPull;
    baseFloor = without.floor;
    break;
  }
  assert(pulled, 'expected a deterministic manager_pull seed');
  assert(pulled.reasons.includes('manager_pull'), String(pulled.reasons));
  assert(pulled.floor < baseFloor, `${pulled.floor} < ${baseFloor}`);
});

check('sellPlayer: absurd fee rejected as offer_too_high', () => {
  const sellTarget = makePlayer({
    playerId: 'sell-hi',
    name: 'Caro Demais',
    overall: 74,
    marketValue: 800_000,
    pos: 'ATA',
  });
  const clubs = withPayrollRoom({
    'Meu Clube': makeTransferClub('Meu Clube', {
      budget: 5_000_000,
      roster: [sellTarget, ...transferSquad(19, 'sell-me')],
    }),
    'Comprador FC': makeTransferClub('Comprador FC', {
      budget: 15_000_000,
      environment: 60,
      power: 68,
      roster: transferSquad(19, 'sell-buy', { pos: 'ZAG', overall: 66 }),
    }),
    'Outro FC': makeTransferClub('Outro FC', {
      budget: 12_000_000,
      environment: 55,
      power: 64,
      roster: transferSquad(19, 'sell-o', { pos: 'MC', overall: 65 }),
    }),
  });
  const engine = createTransfersEngine(
    moneyEngineDeps(clubs, {
      getNationalRank: name =>
        name === 'Comprador FC'
          ? { position: 20, total: 100 }
          : { position: 50, total: 100 },
      getClubForm: () => ['W', 'D', 'W'],
    }),
  );
  const high = engine.sellPlayer('sell-hi', 50_000_000);
  assert(!high.ok, 'should reject absurd fee');
  assert(
    high.reason === 'offer_too_high' || high.reason === 'no_buyer',
    `reason=${high.reason}`,
  );
  if (high.reason === 'offer_too_high') {
    assert(high.askCap > 0 && high.askCap < 50_000_000, `askCap=${high.askCap}`);
  }
  const ok = engine.sellPlayer('sell-hi', 700_000);
  assert(ok.ok, ok.reason || 'sell at fair price');
});

check('AI tick: IA↔IA buy moves listed player between clubs', () => {
  const listed = makePlayer({
    playerId: 'ai-buy-target',
    name: 'Alvo IA',
    overall: 70,
    pos: 'ATA',
    listed: true,
    askingPrice: 900_000,
    marketValue: 900_000,
  });
  const clubs = withPayrollRoom({
    'Meu Clube': makeTransferClub('Meu Clube', { roster: transferSquad(19, 'ai-me') }),
    'Vendedor IA': makeTransferClub('Vendedor IA', {
      budget: 2_000_000,
      power: 65,
      roster: [listed, ...transferSquad(19, 'ai-v', { overall: 64, pos: 'MC' })],
    }),
    'Comprador IA': makeTransferClub('Comprador IA', {
      budget: 20_000_000,
      power: 72,
      environment: 60,
      roster: transferSquad(19, 'ai-c', { overall: 66, pos: 'MC' }),
    }),
  });
  let round = 2;
  const engine = createTransfersEngine(
    moneyEngineDeps(clubs, {
      getCurrentRound: () => round,
      getSeasonRoundCount: () => 38,
      getNationalRank: () => ({ position: 30, total: 100 }),
      getClubForm: () => ['W', 'D', 'W'],
    }),
  );
  const beforeSeller = clubs['Vendedor IA'].roster.length;
  const beforeBuyer = clubs['Comprador IA'].roster.length;
  const tick = engine.runAiMarketTick({ maxBuys: 6, maxLoanDeals: 0, maxUserOffers: 0 });
  assert(tick.ok, tick.reason || 'tick ok');
  const moved = tick.deals.some(d => d.type === 'ai_buy' && d.player?.playerId === 'ai-buy-target');
  assert(moved || !clubs['Vendedor IA'].roster.some(p => p.playerId === 'ai-buy-target'), 'listed left seller or deal recorded');
  if (moved) {
    assert(clubs['Vendedor IA'].roster.length === beforeSeller - 1, 'seller -1');
    assert(clubs['Comprador IA'].roster.length === beforeBuyer + 1, 'buyer +1');
  }
});

check('incoming offer: expiresRound = created + 2; accept credits user', () => {
  const target = makePlayer({
    playerId: 'uo-target',
    name: 'Meu Ata',
    overall: 74,
    pos: 'ATA',
    marketValue: 1_200_000,
  });
  const clubs = withPayrollRoom({
    'Meu Clube': makeTransferClub('Meu Clube', {
      budget: 3_000_000,
      roster: [target, ...transferSquad(19, 'uo-me')],
    }),
    'Interessado FC': makeTransferClub('Interessado FC', {
      budget: 25_000_000,
      roster: transferSquad(19, 'uo-int', { pos: 'MC' }),
    }),
  });
  let round = 2;
  const engine = createTransfersEngine(
    moneyEngineDeps(clubs, {
      getCurrentRound: () => round,
      getSeasonRoundCount: () => 38,
    }),
  );
  const created = engine.createIncomingOffer({
    type: 'buy',
    playerId: 'uo-target',
    fromClub: 'Interessado FC',
    fee: 1_000_000,
  });
  assert(created.ok, created.reason || 'create offer');
  assert(created.offer.expiresRound === 4, `expires=${created.offer.expiresRound}`);
  assert(created.offer.createdRound === 2, `created=${created.offer.createdRound}`);

  const budgetBefore = clubs['Meu Clube'].budget;
  const accepted = engine.acceptIncomingOffer(created.offer.id);
  assert(accepted.ok, accepted.reason || 'accept');
  assert(!clubs['Meu Clube'].roster.some(p => p.playerId === 'uo-target'), 'left user');
  assert(clubs['Interessado FC'].roster.some(p => p.playerId === 'uo-target'), 'joined AI');
  assert(clubs['Meu Clube'].budget === budgetBefore + 1_000_000, 'user credited');
});

check('incoming offer expires on deadline round without moving player', () => {
  const target = makePlayer({
    playerId: 'exp-target',
    name: 'Expira',
    overall: 71,
    pos: 'MC',
    marketValue: 800_000,
  });
  const clubs = {
    'Meu Clube': {
      name: 'Meu Clube',
      division: 'C',
      budget: 5_000_000,
      roster: [
        target,
        ...Array.from({ length: 20 }, (_, i) => makePlayer({ playerId: `exp-me-${i}` })),
      ],
    },
    'Alvo FC': {
      name: 'Alvo FC',
      division: 'C',
      budget: 15_000_000,
      roster: Array.from({ length: 18 }, (_, i) => makePlayer({ playerId: `exp-a-${i}` })),
    },
  };
  let round = 1;
  const engine = createTransfersEngine(
    moneyEngineDeps(clubs, {
      getCurrentRound: () => round,
      getSeasonRoundCount: () => 38,
    }),
  );
  const created = engine.createIncomingOffer({
    type: 'buy',
    playerId: 'exp-target',
    fromClub: 'Alvo FC',
    fee: 700_000,
  });
  assert(created.ok, created.reason);
  round = 2;
  let expired = engine.expirePendingOffers(round);
  assert(expired.length === 0, 'still valid on round 2');
  round = 3;
  expired = engine.expirePendingOffers(round);
  assert(expired.length === 1, 'expires on round 3');
  assert(expired[0].status === 'expired', 'status expired');
  assert(clubs['Meu Clube'].roster.some(p => p.playerId === 'exp-target'), 'player stays');
});

check('incoming loan offer respects outgoing loan limit', () => {
  const clubs = withPayrollRoom({
    'Meu Clube': makeTransferClub('Meu Clube', {
      budget: 5_000_000,
      roster: transferSquad(22, 'lo-me', { pos: 'MC' }),
    }),
    'Host A': makeTransferClub('Host A', { roster: transferSquad(19, 'lo-ha') }),
    'Host B': makeTransferClub('Host B', { roster: transferSquad(19, 'lo-hb') }),
    'Host C': makeTransferClub('Host C', { roster: transferSquad(19, 'lo-hc') }),
    'Host D': makeTransferClub('Host D', { roster: transferSquad(19, 'lo-hd') }),
  });
  const engine = createTransfersEngine(
    moneyEngineDeps(clubs, {
      getCurrentRound: () => 2,
      getSeasonRoundCount: () => 38,
    }),
  );
  const ids = clubs['Meu Clube'].roster.slice(0, 3).map(p => p.playerId);
  const hosts = ['Host A', 'Host B', 'Host C'];
  ids.forEach((playerId, i) => {
    const created = engine.createIncomingOffer({
      type: 'loan',
      playerId,
      fromClub: hosts[i],
      fee: 0,
    });
    assert(created.ok, created.reason || `loan offer ${i}`);
    const accepted = engine.acceptIncomingOffer(created.offer.id);
    assert(accepted.ok, accepted.reason || `accept loan ${i}`);
  });
  assert(engine.countOutgoingLoans('Meu Clube') === 3, '3 outgoing');
  const fourthId = clubs['Meu Clube'].roster.find(p => !p.onLoan).playerId;
  const fourth = engine.createIncomingOffer({
    type: 'loan',
    playerId: fourthId,
    fromClub: 'Host D',
    fee: 0,
  });
  assert(fourth.ok, fourth.reason || 'fourth offer created');
  const blocked = engine.acceptIncomingOffer(fourth.offer.id);
  assert(!blocked.ok && blocked.reason === 'loan_out_limit', `expected loan_out_limit got ${blocked.reason}`);
});

check('AI tick can create user offers with expiry', () => {
  const clubs = withPayrollRoom({
    'Meu Clube': makeTransferClub('Meu Clube', {
      budget: 4_000_000,
      roster: transferSquad(19, 'tick-uo', {
        pos: 'ATA',
        overall: 72,
        listed: true,
      }).map((player, i) => ({ ...player, listed: i < 2, pos: i < 5 ? 'ATA' : 'MC' })),
    }),
    'Buyer 1': makeTransferClub('Buyer 1', {
      budget: 30_000_000,
      roster: transferSquad(19, 'tick-b1', { pos: 'ZAG' }),
    }),
    'Buyer 2': makeTransferClub('Buyer 2', {
      budget: 28_000_000,
      roster: transferSquad(19, 'tick-b2', { pos: 'VOL' }),
    }),
  });
  const engine = createTransfersEngine(
    moneyEngineDeps(clubs, {
      getCurrentRound: () => 2,
      getSeasonRoundCount: () => 38,
      getNationalRank: () => ({ position: 25, total: 100 }),
      getClubForm: () => ['W', 'W', 'D'],
      userOfferChanceWeek: 1,
      maxPendingUserOffers: 2,
      userOffersPerTick: 1,
    }),
  );
  const tick = engine.runAiMarketTick({
    maxBuys: 0,
    maxLoanDeals: 0,
    maxUserOffers: 1,
    tickKind: 'week',
  });
  assert(tick.ok, tick.reason || 'tick');
  assert(tick.offers.length >= 1, `offers=${tick.offers.length}`);
  assert(tick.offers.length <= 1, `max one offer per tick=${tick.offers.length}`);
  assert(tick.offers[0].expiresRound === 4, `expires=${tick.offers[0].expiresRound}`);
  assert(tick.offers[0].expiresDayKey, 'expiresDayKey set');
  assert(engine.listPendingOffers().length >= 1, 'pending list');
});

check('user offer funnel respects pending cap and miss chance', () => {
  const clubs = {
    'Meu Clube': {
      name: 'Meu Clube',
      division: 'C',
      budget: 8_000_000,
      roster: Array.from({ length: 22 }, (_, i) =>
        makePlayer({
          playerId: `funnel-me-${i}`,
          pos: i % 3 === 0 ? 'ATA' : i % 3 === 1 ? 'MC' : 'ZAG',
          overall: 68 + (i % 4),
          listed: i < 2,
        }),
      ),
    },
    ...Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [
        `Buyer F${i}`,
        {
          name: `Buyer F${i}`,
          division: 'C',
          budget: 25_000_000,
          power: 72,
          environment: 55,
          roster: Array.from({ length: 18 }, (_, j) =>
            makePlayer({ playerId: `funnel-b${i}-${j}`, pos: 'VOL', overall: 64 }),
          ),
        },
      ]),
    ),
  };
  let day = new Date(2030, 0, 20, 12);
  const closed = createTransfersEngine(
    moneyEngineDeps(clubs, {
      getCareerDate: () => day,
      userOfferChanceWeek: 0,
      userOffersPerTick: 1,
    }),
  );
  const miss = closed.runAiMarketTick({ maxBuys: 0, maxLoanDeals: 0, maxUserOffers: 1, tickKind: 'week' });
  assert(miss.ok, 'tick ok');
  assert(miss.offers.length === 0, `miss chance blocks offers=${miss.offers.length}`);

  const open = createTransfersEngine(
    moneyEngineDeps(clubs, {
      getCareerDate: () => day,
      getCurrentRound: () => 3,
      userOfferChanceWeek: 1,
      maxPendingUserOffers: 2,
      userOffersPerTick: 1,
    }),
  );
  let created = 0;
  for (let i = 0; i < 8; i++) {
    day = new Date(2030, 0, 20 + i, 12);
    const tick = open.runAiMarketTick({ maxBuys: 0, maxLoanDeals: 0, maxUserOffers: 1, tickKind: 'week' });
    created += tick.offers?.length || 0;
  }
  assert(created <= 2, `pending cap caps created=${created}`);
  assert(open.listPendingOffers().length <= 2, `pending=${open.listPendingOffers().length}`);
});

check('player cannot move twice in the same transfer window', () => {
  const target = makePlayer({
    name: 'Uma Janela',
    playerId: 'once-p1',
    overall: 72,
    marketValue: 500_000,
  });
  const clubs = withPayrollRoom({
    'Meu Clube': makeTransferClub('Meu Clube', { roster: transferSquad(19, 'Host') }),
    'Rival FC': makeTransferClub('Rival FC', {
      budget: 5_000_000,
      roster: [target, ...transferSquad(19, 'Rival', { overall: 65 })],
    }),
    'Outro FC': makeTransferClub('Outro FC', {
      budget: 8_000_000,
      roster: transferSquad(19, 'Outro'),
    }),
  });
  const engine = createTransfersEngine({ ...moneyEngineDeps(clubs) });
  const bought = engine.buyPlayer(target.playerId);
  assert(bought.ok, bought.reason || 'first buy');
  const moved = clubs['Meu Clube'].roster.find(p => p.playerId === 'once-p1');
  assert(moved?.transferWindowLock === '2030:first', `lock=${moved?.transferWindowLock}`);

  const sellAgain = engine.sellPlayer('once-p1');
  assert(!sellAgain.ok && sellAgain.reason === 'already_moved', sellAgain.reason);

  const listAgain = engine.setListed('once-p1', true, 500_000);
  assert(!listAgain.ok && listAgain.reason === 'already_moved', listAgain.reason);

  const loanAgain = engine.loanOutPlayer('once-p1');
  assert(!loanAgain.ok && loanAgain.reason === 'already_moved', loanAgain.reason);

  // Ainda aparece no elenco, mas fora do mercado de compra.
  assert(
    !engine.listBuyCandidates().some(row => row.playerId === 'once-p1'),
    'hidden from buy market',
  );
  const sellRow = engine.listSellCandidates().find(row => row.playerId === 'once-p1');
  assert(sellRow?.windowLocked, 'sell list marks windowLocked');
});

check('loan buy option: exercise locks fee and clears loan flags', () => {
  const hostPlayer = makePlayer({
    name: 'Opção Compra',
    playerId: 'loan-buy-p1',
    overall: 70,
    loanListed: true,
    marketValue: 100_000,
  });
  const clubs = withPayrollRoom({
    'Meu Clube': makeTransferClub('Meu Clube', {
      budget: 5_000_000,
      roster: transferSquad(19, 'loan-buy-host'),
    }),
    'Dono FC': makeTransferClub('Dono FC', {
      budget: 100_000,
      roster: [hostPlayer, ...transferSquad(19, 'loan-buy-dono')],
    }),
  });
  const engine = createTransfersEngine({
    ...moneyEngineDeps(clubs),
  });
  const loaned = engine.loanPlayer(hostPlayer.playerId);
  assert(loaned.ok, loaned.reason || 'loan');
  const fee = loaned.loanBuyFee;
  const base = Number(loaned.player.loanBuyOption?.marketValueAtLoan) || 0;
  assert(fee > 0 && base > 0, `fee/base ${fee}/${base}`);
  assert(fee >= base * 0.97 && fee <= base * 1.25, `fee band ${fee} vs base ${base}`);
  const locked = clubs['Meu Clube'].roster.find(p => p.playerId === 'loan-buy-p1')?.loanBuyOption?.fee;
  assert(locked === fee, 'fee persists on roster');

  const beforeHost = clubs['Meu Clube'].budget;
  const beforeOwner = clubs['Dono FC'].budget;
  const bought = engine.exerciseLoanBuyOption('loan-buy-p1');
  assert(bought.ok, bought.reason || 'exercise');
  assert(bought.fee === fee, `paid ${bought.fee}`);
  assert(bought.type === 'loan_buy', bought.type);
  const kept = clubs['Meu Clube'].roster.find(p => p.playerId === 'loan-buy-p1');
  assert(kept && !kept.onLoan && !kept.loanFrom && !kept.loanBuyOption, 'permanent at host');
  assert(!clubs['Dono FC'].roster.some(p => p.playerId === 'loan-buy-p1'), 'left owner');
  assert(clubs['Meu Clube'].budget === beforeHost - fee, 'host paid');
  assert(clubs['Dono FC'].budget === beforeOwner + fee, 'owner credited');

  const again = engine.exerciseLoanBuyOption('loan-buy-p1');
  assert(!again.ok && again.reason === 'not_on_loan', again.reason);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
