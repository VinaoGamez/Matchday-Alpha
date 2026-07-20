/**
 * Telemetria pós-modelo alvo-meio: propostas IA → usuário na 1ª janela.
 * Cadência espelha o calendário: semana = 1 tick user; deadline = 1/dia; pós-rodada.
 * Uso: node scripts/transfers-offer-telemetry.mjs [out.json]
 */
import fs from 'node:fs';
import { ensurePlayerId } from '../js/engine/player-identity.js';
import { ensureMarketFields } from '../js/engine/player-value.js';
import {
  createTransfersEngine,
  getTransferWindowPhase,
  TRANSFER_LIMITS,
} from '../js/engine/transfers.js';

const SEASON = 2030;
const SAMPLES = Number(process.env.TELEMETRY_SAMPLES || 12);
const OUT = process.argv[2] || 'tmp-transfers-offer-telemetry.json';
const POS = ['GOL', 'LAT', 'ZAG', 'ZAG', 'LAT', 'VOL', 'MC', 'MC', 'PE', 'PD', 'ATA', 'ATA', 'MC', 'ZAG', 'VOL', 'LAT', 'PE', 'ATA', 'MC', 'ZAG', 'VOL', 'PD'];

const makePlayer = (club, index, overall, extras = {}) =>
  ensureMarketFields(
    ensurePlayerId(
      {
        name: `${club} P${index}`,
        pos: POS[index % POS.length],
        age: 20 + (index % 12),
        overall,
        potential: overall + 4,
        fatigue: 90,
        ...extras,
      },
      { seed: index + 1, club, index },
    ),
    { division: extras.division || 'C', season: SEASON },
  );

const makeClub = (name, division, { budget, power, rosterSize = 22, overall = 68 } = {}) => ({
  name,
  division,
  budget,
  power,
  environment: 55,
  roster: Array.from({ length: rosterSize }, (_, i) =>
    makePlayer(name, i, overall + (i % 5) - 2, { division }),
  ),
});

const buildWorld = seed => {
  const user = makeClub('Meu Clube', 'C', {
    budget: 12_000_000,
    power: 70,
    rosterSize: 22,
    overall: 70,
  });
  user.roster[10].pos = 'ATA';
  user.roster[11].pos = 'ATA';
  user.roster[17].pos = 'ATA';
  user.roster[7].pos = 'MC';
  user.roster[8].pos = 'MC';
  user.roster[12].pos = 'MC';
  user.roster[18].pos = 'MC';
  const clubs = { 'Meu Clube': user };
  const divBudget = { A: 45e6, B: 22e6, C: 12e6, D: 5e6 };
  const divOvr = { A: 78, B: 72, C: 66, D: 60 };
  let n = 0;
  for (const division of ['A', 'B', 'C', 'D']) {
    for (let i = 0; i < 10; i++) {
      n += 1;
      const name = `IA ${division}${i + 1}`;
      clubs[name] = makeClub(name, division, {
        budget: divBudget[division] * (0.7 + ((seed + n) % 5) * 0.1),
        power: divOvr[division],
        rosterSize: 18 + ((seed + n) % 6),
        overall: divOvr[division],
      });
    }
  }
  return clubs;
};

/** Espelha a cadência do calendário: semana = 1 tick user; deadline = 1/dia; pós-rodada. */
const simulateWindow = seed => {
  const clubs = buildWorld(seed);
  let day = new Date(SEASON, 0, 1, 12);
  let round = 1;
  const phase0 = getTransferWindowPhase(day);
  const end = phase0.endDate || new Date(SEASON, 2, 3, 12);

  const engine = createTransfersEngine({
    getClubs: () => clubs,
    getUserClub: () => 'Meu Clube',
    getCareerSeason: () => SEASON,
    getCareerDate: () => day,
    getCurrentRound: () => round,
    getSeasonRoundCount: () => 38,
    getNationalRank: () => ({ position: 40, total: 120 }),
    getClubForm: () => ['W', 'D', 'L', 'W'],
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
  });

  let totalBuy = 0;
  let totalLoan = 0;
  let peakPending = 0;
  let userTicks = 0;
  const weekly = [];
  let weekBuy = 0;
  let weekLoan = 0;
  let weekIndex = 0;
  let daysInWeek = 0;

  const countOffers = offers => {
    const buy = offers.filter(o => o.type === 'buy').length;
    const loan = offers.filter(o => o.type === 'loan').length;
    totalBuy += buy;
    totalLoan += loan;
    weekBuy += buy;
    weekLoan += loan;
    peakPending = Math.max(peakPending, engine.listPendingOffers().length);
  };

  while (day <= end) {
    engine.expirePendingOffers(round);
    const phase = getTransferWindowPhase(day);
    const inDeadline = phase.mode === 'day';
    if (inDeadline) {
      userTicks += 1;
      const tick = engine.runAiMarketTick({
        maxBuys: 2,
        maxLoanDeals: 1,
        tickKind: 'deadline',
      });
      countOffers(tick.ok ? tick.offers || [] : []);
    } else {
      engine.runAiMarketTick({
        maxBuys: 2,
        maxLoanDeals: 1,
        tickKind: 'week',
        skipUserOffers: true,
      });
    }

    daysInWeek += 1;
    if (daysInWeek >= 7) {
      if (!inDeadline) {
        userTicks += 1;
        const tick = engine.runAiMarketTick({
          maxBuys: 2,
          maxLoanDeals: 1,
          tickKind: 'week',
        });
        countOffers(tick.ok ? tick.offers || [] : []);
      }
      weekly.push({
        week: ++weekIndex,
        buy: weekBuy,
        loan: weekLoan,
        total: weekBuy + weekLoan,
      });
      weekBuy = 0;
      weekLoan = 0;
      daysInWeek = 0;
      round += 1;
      engine.expirePendingOffers(round);
      userTicks += 1;
      const post = engine.runAiMarketTick({
        maxBuys: 0,
        maxLoanDeals: 0,
        tickKind: 'postRound',
      });
      countOffers(post.ok ? post.offers || [] : []);
    }

    day = new Date(day);
    day.setDate(day.getDate() + 1);
  }
  if (weekBuy + weekLoan > 0) {
    weekly.push({ week: ++weekIndex, buy: weekBuy, loan: weekLoan, total: weekBuy + weekLoan });
  }

  return {
    totalOffers: totalBuy + totalLoan,
    totalBuy,
    totalLoan,
    peakPending,
    userTicks,
    weekly,
  };
};

const avg = arr => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
const pct = (n, d) => Number(((n / Math.max(1, d)) * 100).toFixed(1));

const runs = Array.from({ length: SAMPLES }, (_, i) => simulateWindow(i));
const totals = runs.map(r => r.totalOffers);
const weekTotals = runs.flatMap(r => r.weekly.map(w => w.total));
const report = {
  generatedAt: new Date().toISOString(),
  profile: 'alvo-meio',
  samples: SAMPLES,
  limits: {
    userOffersPerTick: TRANSFER_LIMITS.userOffersPerTick,
    maxPendingUserOffers: TRANSFER_LIMITS.maxPendingUserOffers,
    userOfferChanceWeek: TRANSFER_LIMITS.userOfferChanceWeek,
    userOfferChanceDeadline: TRANSFER_LIMITS.userOfferChanceDeadline,
    userOfferChancePostRound: TRANSFER_LIMITS.userOfferChancePostRound,
    loanOfferShare: TRANSFER_LIMITS.loanOfferShare,
    offerExpiryDays: TRANSFER_LIMITS.offerExpiryDays,
  },
  results: {
    avgOffersPerWindow: Number(avg(totals).toFixed(2)),
    avgBuyPerWindow: Number(avg(runs.map(r => r.totalBuy)).toFixed(2)),
    avgLoanPerWindow: Number(avg(runs.map(r => r.totalLoan)).toFixed(2)),
    loanSharePct: pct(avg(runs.map(r => r.totalLoan)), avg(totals)),
    avgPeakPending: Number(avg(runs.map(r => r.peakPending)).toFixed(2)),
    avgOffersPerWeek: Number(avg(weekTotals).toFixed(2)),
    p90OffersPerWeek: [...weekTotals].sort((a, b) => a - b)[Math.floor(weekTotals.length * 0.9)] || 0,
    minOffersInSample: Math.min(...totals),
    maxOffersInSample: Math.max(...totals),
    avgUserTicks: Number(avg(runs.map(r => r.userTicks)).toFixed(1)),
  },
  baselineBefore: {
    avgOffersPerWindow: 92.67,
    avgOffersPerWeek: 8.52,
    avgPeakPending: 22,
  },
  target: { offersPerWindow: '3–7', offersPerWeek: '0–2', peakPending: '≤2' },
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
console.log(`Wrote ${OUT}`);
console.log(JSON.stringify({ results: report.results, baselineBefore: report.baselineBefore, target: report.target }, null, 2));
