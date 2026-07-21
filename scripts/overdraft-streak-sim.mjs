/**
 * Calibração: overdraft dinâmico → crise institucional em 5–6 rodadas.
 * Usa o motor real (taxa + streak + finanças + board + job risk).
 *
 * node scripts/overdraft-streak-sim.mjs
 */
import {
  getBalance,
  ensureBudget,
  chargeRoundCosts,
  serviceOverdraft,
  credit,
  STADIUM_CAPACITY_BY_DIVISION,
  resolveOverdraftRate,
  overdraftStreakMultiplier,
} from '../js/engine/economy.js';
import { createClubStatusEngine } from '../js/engine/club-status/index.js';
import * as boardRules from '../js/engine/club-status/rules/board.js';
import * as environmentRules from '../js/engine/club-status/rules/environment.js';
import { STATUS_MIN } from '../js/engine/club-status/constants.js';
import {
  resolveBoardJobRisk,
  MANAGER_JOB_CRISIS_THRESHOLD,
  MANAGER_JOB_HONEYMOON_ROUNDS,
} from '../js/engine/manager-job.js';

const DIVISIONS = ['A', 'B', 'C', 'D'];
const TARGET_CRISIS_MIN = 5;
const TARGET_CRISIS_MAX = 6;

const DIV_PROFILE = {
  A: {
    installments: 38,
    wagesHeavy: Array(20).fill(22_000),
    wagesHealthy: Array(16).fill(10_000),
    sponsorsTotal: 9_500_000,
    tvTotal: 7_000_000,
    startCash: 80_000,
    healthyCash: 8_000_000,
    ticketNational: 45,
  },
  B: {
    installments: 38,
    wagesHeavy: Array(18).fill(15_000),
    wagesHealthy: Array(15).fill(7_000),
    sponsorsTotal: 4_800_000,
    tvTotal: 3_200_000,
    startCash: 50_000,
    healthyCash: 4_500_000,
    ticketNational: 35,
  },
  C: {
    installments: 38,
    wagesHeavy: Array(17).fill(10_000),
    wagesHealthy: Array(14).fill(5_000),
    sponsorsTotal: 2_400_000,
    tvTotal: 1_600_000,
    startCash: 30_000,
    healthyCash: 2_500_000,
    ticketNational: 28,
  },
  D: {
    installments: 22,
    wagesHeavy: Array(16).fill(25_000),
    wagesHealthy: Array(14).fill(4_000),
    sponsorsTotal: 400_000,
    tvTotal: 300_000,
    startCash: 5_000,
    healthyCash: 3_000_000,
    ticketNational: 25,
  },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clampStatus = v => clamp(Math.round(v), STATUS_MIN, 98);

let passed = 0;
let failed = 0;
const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${label}`);
  } catch (e) {
    failed += 1;
    console.error(`✗ ${label}`);
    console.error(`  ${e.message}`);
  }
};
const assert = (c, m) => {
  if (!c) throw new Error(m || 'fail');
};

const player = w => ({
  name: `P${Math.random().toString(36).slice(2, 5)}`,
  pos: 'MC',
  age: 24,
  overall: 14,
  potential: 28,
  wage: w,
  starter: true,
});

function makeClub(division, { budget, finances = 70, board = 65, environment = 65, wages, healthy = false } = {}) {
  const p = DIV_PROFILE[division];
  const wageList = wages || (healthy ? p.wagesHealthy : p.wagesHeavy);
  const sTotal = healthy ? p.sponsorsTotal : Math.round(p.sponsorsTotal * (division === 'D' ? 1 : 0.55));
  const tTotal = healthy ? p.tvTotal : Math.round(p.tvTotal * (division === 'D' ? 1 : 0.55));
  const cap = STADIUM_CAPACITY_BY_DIVISION[division] || STADIUM_CAPACITY_BY_DIVISION.D;
  const club = {
    name: `Sim ${division}`,
    division,
    budget: budget ?? (healthy ? p.healthyCash : p.startCash),
    finances,
    board,
    environment,
    support: 60,
    managerReputation: 55,
    roster: wageList.map(w => player(w)),
    stadiumCapacity: cap.base,
    stadiumStructure: 1,
    pitchLevel: 1,
    ticketPrices: { national: p.ticketNational, cups: 40 },
    sponsors: {
      season: 2027,
      division,
      total: sTotal,
      installments: p.installments,
      paidAmount: 0,
      paidInstallments: 0,
      master: { name: 'M', role: 'master', value: Math.round(sTotal * 0.55) },
      secondaries: [
        { name: 'S1', role: 'secondary', value: Math.round(sTotal * 0.15) },
        { name: 'S2', role: 'secondary', value: Math.round(sTotal * 0.15) },
        { name: 'S3', role: 'secondary', value: Math.round(sTotal * 0.15) },
      ],
    },
    tvRights: {
      season: 2027,
      division,
      total: tTotal,
      installments: p.installments,
      paidAmount: 0,
      paidInstallments: 0,
    },
  };
  ensureBudget(club, division);
  club.budget = budget ?? (healthy ? p.healthyCash : p.startCash);
  club.finances = finances;
  club.board = board;
  club.environment = environment;
  return club;
}

function makeStatus(club, division) {
  return createClubStatusEngine({
    clamp,
    getClubs: () => ({ [club.name]: club }),
    getUserClub: () => club.name,
    getUserDivision: () => division,
    getBalance,
    persistCareerStatus: () => {},
    onStatusChanged: () => {},
  });
}

function applyBoardPressure(club, division, clubStatus) {
  clubStatus.syncFinancesFromBudget(club, division);
  const balance = getBalance(club);
  const overdrawn = balance < 0;
  club.board = clampStatus(
    club.board +
      boardRules.financePressureDelta({
        finances: club.finances,
        runwayRounds: overdrawn ? -1 : 99,
        shortfall: !!club.wageShortfall || overdrawn || !!club.overdraftActive,
        overdraftStreak: club.overdraftStreak || 0,
        clamp,
      }) +
      boardRules.financeGapCeilingDelta({
        board: club.board,
        finances: club.finances,
        clamp,
      }),
  );
}

/**
 * @param {'cash_only'|'stressed'|'healthy'} mode
 */
function simulate(division, mode, { rounds = 12 } = {}) {
  const healthy = mode === 'healthy';
  const club = makeClub(division, {
    healthy,
    finances: healthy ? 75 : 70,
    board: healthy ? 70 : 65,
  });
  const clubStatus = makeStatus(club, division);
  let firstWarn = null;
  let firstCrisis = null;
  let sackRound = null;
  const path = [];

  for (let r = 1; r <= rounds; r += 1) {
    if (healthy) {
      credit(club, 220_000, { reason: 'sim', label: 'rev' });
    }
    chargeRoundCosts(club, { division, round: r, managerReputation: 55 });
    serviceOverdraft(club, { division, round: r });
    applyBoardPressure(club, division, clubStatus);

    if (mode === 'stressed') {
      club.environment = clampStatus(
        club.environment +
          environmentRules.matchDelta({ result: 'L', isHome: true, goalDiff: -1, clamp }) +
          environmentRules.driftDelta(club.environment),
      );
      club.board = clampStatus(
        club.board +
          boardRules.matchDelta({
            result: 'L',
            isHome: true,
            goalDiff: -1,
            finances: club.finances,
            clamp,
          }),
      );
    }

    const played = MANAGER_JOB_HONEYMOON_ROUNDS + r;
    const job = resolveBoardJobRisk({
      board: club.board,
      finances: club.finances,
      played,
    });
    if (!firstWarn && (job.status === 'warn_finances' || job.status === 'warn_board' || job.status === 'critical')) {
      firstWarn = r;
    }
    const finCrisis = club.finances < MANAGER_JOB_CRISIS_THRESHOLD;
    const boardCrisis = club.board < MANAGER_JOB_CRISIS_THRESHOLD;
    const softPair =
      (club.finances < 32 && club.board < 50) || (club.board < 32 && club.finances < 50);
    if (!firstCrisis && (finCrisis && boardCrisis || softPair || job.status === 'sacked')) {
      firstCrisis = r;
    }
    if (!sackRound && job.status === 'sacked') sackRound = r;

    path.push({
      r,
      cash: getBalance(club),
      streak: club.overdraftStreak || 0,
      fin: Math.round(club.finances),
      board: Math.round(club.board),
      job: job.status,
      ratePct: resolveOverdraftRate(club, { division, streak: club.overdraftStreak || 0 }).ratePct,
    });

    if (sackRound) break;
  }

  return {
    division,
    mode,
    firstWarn,
    firstCrisis,
    sackRound,
    end: path[path.length - 1],
    path,
  };
}

check('streakMult sobe nos degraus 1→3→5→7 (v5)', () => {
  assert(overdraftStreakMultiplier(1) === 1, 'r1');
  assert(overdraftStreakMultiplier(2) === 1, 'r2');
  assert(overdraftStreakMultiplier(3) === 1.25, 'r3');
  assert(overdraftStreakMultiplier(5) === 1.55, 'r5');
  assert(overdraftStreakMultiplier(7) === 1.8, 'r7');
});

check('taxa sobe com streak (mesma série)', () => {
  const club = makeClub('D', { budget: -500_000, finances: 50 });
  const a = resolveOverdraftRate(club, { division: 'D', streak: 1 });
  const b = resolveOverdraftRate(club, { division: 'D', streak: 5 });
  assert(b.rate > a.rate, `${b.rate} > ${a.rate}`);
});

const stressed = {};
const cashOnly = {};
const healthy = {};

for (const div of DIVISIONS) {
  stressed[div] = simulate(div, 'stressed');
  cashOnly[div] = simulate(div, 'cash_only');
  healthy[div] = simulate(div, 'healthy', { rounds: 8 });
}

check('estressado A–D: 1º aviso financeiro ≤ r4', () => {
  for (const div of DIVISIONS) {
    const s = stressed[div];
    assert(s.firstWarn != null && s.firstWarn <= 4, `${div}: warn r${s.firstWarn}`);
  }
});

check('estressado A–D: crise institucional (sack/soft) em r5–r6', () => {
  for (const div of DIVISIONS) {
    const s = stressed[div];
    const hit = s.firstCrisis ?? s.sackRound;
    assert(hit != null, `${div}: sem crise`);
    assert(
      hit >= TARGET_CRISIS_MIN && hit <= TARGET_CRISIS_MAX,
      `${div}: crise r${hit} (alvo ${TARGET_CRISIS_MIN}–${TARGET_CRISIS_MAX})`,
    );
  }
});

check('só caixa: pressão forte em 5–6r sem sack automático na r3', () => {
  for (const div of DIVISIONS) {
    const s = cashOnly[div];
    assert(s.sackRound == null || s.sackRound >= 4, `${div}: sack cedo r${s.sackRound}`);
    const at5 = s.path.find(p => p.r === 5) || s.end;
    assert(at5.board < 60 || at5.fin < 45, `${div}: pouca pressão r5 board=${at5.board} fin=${at5.fin}`);
    assert(at5.streak >= 4, `${div}: streak ${at5.streak}`);
  }
});

check('saudável: streak 0 e sem sack', () => {
  for (const div of DIVISIONS) {
    const s = healthy[div];
    assert(s.sackRound == null, `${div}: sack`);
    assert((s.end.streak || 0) === 0, `${div}: streak`);
    assert(getBalance(makeClub(div, { healthy: true })) > 0, 'sanity');
  }
});

console.log('\n=== Estressado (folha pesada + derrotas, sem receita) ===');
for (const div of DIVISIONS) {
  const s = stressed[div];
  console.log(
    `Serie ${div}: warn r${s.firstWarn} | crise r${s.firstCrisis} | sack r${s.sackRound ?? '—'} | fim fin=${s.end.fin} board=${s.end.board} streak=${s.end.streak}`,
  );
}

console.log('\n=== Só caixa (sem derrotas) ===');
for (const div of DIVISIONS) {
  const s = cashOnly[div];
  const r5 = s.path.find(p => p.r === 5) || s.end;
  console.log(
    `Serie ${div}: sack r${s.sackRound ?? '—'} | r5 fin=${r5.fin} board=${r5.board} streak=${r5.streak} | fim job=${s.end.job}`,
  );
}

console.log('\n=== Path Série D estressado ===');
console.table(stressed.D.path);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
