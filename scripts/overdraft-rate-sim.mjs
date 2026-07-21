/**
 * Invariantes da taxa dinâmica de cheque especial (motor real).
 * node scripts/overdraft-rate-sim.mjs
 */
import {
  BANK_LOAN_RATE_BY_DIVISION,
  resolveBankCredit,
  takeBankLoan,
  OVERDRAFT_PREMIUM_BASE,
  OVERDRAFT_PREMIUM_WITH_LOAN,
  overdraftStreakMultiplier,
  resolveOverdraftRate,
} from '../js/engine/bank-loan.js';
import {
  getBalance,
  ensureBudget,
  chargeRoundCosts,
  OVERDRAFT_RATE_BY_DIVISION,
  estimateRoundCostBill,
  STADIUM_CAPACITY_BY_DIVISION,
} from '../js/engine/economy.js';

const DIVISIONS = ['A', 'B', 'C', 'D'];
const FINANCES_GRID = [85, 70, 55, 40, 28];

const DIV_PROFILE = {
  A: {
    installments: 38,
    wages: Array(20).fill(18_000),
    sponsorsTotal: 9_500_000,
    tvTotal: 7_000_000,
    overdraftCash: -2_000_000,
    snowballStart: -800_000,
    snowballWages: Array(20).fill(22_000),
    healthyBudget: 8_000_000,
    healthyWages: Array(16).fill(10_000),
    loanProbeBudget: 6_000_000,
    loanProbeWages: Array(16).fill(8_000),
    brokeCash: -3_500_000,
    brokeWages: Array(20).fill(24_000),
    ticketNational: 45,
  },
  B: {
    installments: 38,
    wages: Array(18).fill(12_000),
    sponsorsTotal: 4_800_000,
    tvTotal: 3_200_000,
    overdraftCash: -1_200_000,
    snowballStart: -500_000,
    snowballWages: Array(18).fill(15_000),
    healthyBudget: 4_500_000,
    healthyWages: Array(15).fill(7_000),
    loanProbeBudget: 3_500_000,
    loanProbeWages: Array(14).fill(5_500),
    brokeCash: -2_000_000,
    brokeWages: Array(18).fill(16_000),
    ticketNational: 35,
  },
  C: {
    installments: 38,
    wages: Array(17).fill(8_000),
    sponsorsTotal: 2_400_000,
    tvTotal: 1_600_000,
    overdraftCash: -700_000,
    snowballStart: -300_000,
    snowballWages: Array(17).fill(10_000),
    healthyBudget: 2_500_000,
    healthyWages: Array(14).fill(5_000),
    loanProbeBudget: 2_000_000,
    loanProbeWages: Array(14).fill(4_000),
    brokeCash: -1_200_000,
    brokeWages: Array(17).fill(12_000),
    ticketNational: 28,
  },
  D: {
    installments: 22,
    wages: Array(16).fill(5_500),
    sponsorsTotal: 1_200_000,
    tvTotal: 800_000,
    overdraftCash: -500_000,
    snowballStart: -200_000,
    snowballWages: Array(18).fill(20_000),
    healthyBudget: 1_500_000,
    healthyWages: Array(14).fill(6_000),
    loanProbeBudget: 2_000_000,
    loanProbeWages: Array(14).fill(5_000),
    brokeCash: -900_000,
    brokeWages: Array(18).fill(20_000),
    ticketNational: 25,
  },
};

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

const makeClub = ({
  budget,
  finances = 70,
  division = 'D',
  wages,
  sponsorsTotal,
  tvTotal,
  ticketNational,
} = {}) => {
  const p = DIV_PROFILE[division] || DIV_PROFILE.D;
  const installments = p.installments;
  const wageList = wages || p.wages;
  const sTotal = sponsorsTotal ?? p.sponsorsTotal;
  const tTotal = tvTotal ?? p.tvTotal;
  const cap = STADIUM_CAPACITY_BY_DIVISION[division] || STADIUM_CAPACITY_BY_DIVISION.D;
  const club = {
    name: `Sim ${division}`,
    division,
    budget: budget ?? p.overdraftCash,
    finances,
    managerReputation: 55,
    roster: wageList.map(w => player(w)),
    stadiumCapacity: cap.base,
    stadiumStructure: 1,
    pitchLevel: 1,
    ticketPrices: { national: ticketNational ?? p.ticketNational, cups: 40 },
    sponsors: {
      season: 2027,
      division,
      total: sTotal,
      installments,
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
      installments,
      paidAmount: 0,
      paidInstallments: 0,
    },
  };
  ensureBudget(club, division);
  club.budget = budget ?? p.overdraftCash;
  club.finances = finances;
  return club;
};

const odAt = (division, { finances = 55, budget, wages, streak = 1, ...rest } = {}) => {
  const p = DIV_PROFILE[division];
  const club = makeClub({
    division,
    finances,
    budget: budget ?? p.overdraftCash,
    wages: wages ?? p.wages,
    ...rest,
  });
  const od = resolveOverdraftRate(club, { division, streak });
  return {
    ...od,
    oldFlatRate: OVERDRAFT_RATE_BY_DIVISION[division] ?? OVERDRAFT_RATE_BY_DIVISION.C,
    oldFlatPct:
      Math.round((OVERDRAFT_RATE_BY_DIVISION[division] ?? OVERDRAFT_RATE_BY_DIVISION.C) * 1000) / 10,
    feeIfNow: od.cash < 0 ? Math.max(1, Math.round(Math.abs(od.cash) * od.rate)) : 0,
  };
};

check('cheque > emprestimo-like em A/B/C/D × grades de saude', () => {
  for (const div of DIVISIONS) {
    for (const fin of FINANCES_GRID) {
      const od = odAt(div, { finances: fin, streak: 1 });
      assert(od.rate > od.loanLikeRate, `${div} fin${fin}: ${od.rate} > ${od.loanLikeRate}`);
      assert(
        od.rate / od.loanLikeRate >= OVERDRAFT_PREMIUM_BASE - 0.01,
        `${div} fin${fin}: premio minimo`,
      );
    }
  }
});

check('saude pior → cheque mais caro em cada serie', () => {
  for (const div of DIVISIONS) {
    const good = odAt(div, { finances: 82 });
    const bad = odAt(div, { finances: 32 });
    assert(bad.rate > good.rate, `${div}: ${bad.ratePct}% > ${good.ratePct}%`);
  }
});

check('emprestimo ativo encarece cheque (premio 2.0) em A/B/C/D', () => {
  for (const div of DIVISIONS) {
    const p = DIV_PROFILE[div];
    const club = makeClub({
      division: div,
      budget: p.loanProbeBudget,
      finances: 75,
      wages: p.loanProbeWages,
    });
    const creditLine = resolveBankCredit(club, { division: div });
    assert(creditLine.available >= 100_000, `${div}: linha`);
    takeBankLoan(club, Math.min(Math.round(creditLine.available * 0.4), creditLine.available), {
      division: div,
    });
    club.budget = Math.round(p.overdraftCash * 0.6);
    const withLoan = resolveOverdraftRate(club, { division: div, streak: 1 });
    assert(withLoan.hasLoan && withLoan.premium === OVERDRAFT_PREMIUM_WITH_LOAN, `${div}: premio`);
    const noLoan = odAt(div, {
      finances: 75,
      budget: Math.round(p.overdraftCash * 0.6),
      wages: p.loanProbeWages,
    });
    assert(withLoan.rate > noLoan.rate, `${div}: ${withLoan.rate} > ${noLoan.rate}`);
  }
});

check('rombo fundo (depth>4) aumenta taxa vs raso em A/B/C/D', () => {
  for (const div of DIVISIONS) {
    const p = DIV_PROFILE[div];
    const bill = estimateRoundCostBill(
      makeClub({ division: div, budget: 0, finances: 50, wages: p.brokeWages }),
      div,
      { managerReputation: 55 },
    );
    const a = odAt(div, { finances: 50, budget: -Math.round(bill * 1.5), wages: p.brokeWages });
    const b = odAt(div, { finances: 50, budget: -Math.round(bill * 6), wages: p.brokeWages });
    assert(b.depth > 4 && a.depth <= 4, `${div}: depth`);
    assert(b.rate > a.rate, `${div}: rate`);
  }
});

check('ordem de serie: A < B < C < D', () => {
  for (const fin of [70, 50, 35]) {
    const rates = DIVISIONS.map(div => odAt(div, { finances: fin }).rate);
    for (let i = 0; i < rates.length - 1; i += 1) {
      assert(rates[i] < rates[i + 1], `fin${fin}: ${DIVISIONS[i]} < ${DIVISIONS[i + 1]}`);
    }
  }
});

check('bases flat e loan sobem A→D', () => {
  for (let i = 0; i < DIVISIONS.length - 1; i += 1) {
    const a = DIVISIONS[i];
    const b = DIVISIONS[i + 1];
    assert(BANK_LOAN_RATE_BY_DIVISION[a] < BANK_LOAN_RATE_BY_DIVISION[b], `loan ${a}<${b}`);
    assert(OVERDRAFT_RATE_BY_DIVISION[a] < OVERDRAFT_RATE_BY_DIVISION[b], `flat ${a}<${b}`);
  }
});

check('crise: taxa dinâmica ≥ flat antiga (streak≥1) em A/B/C/D', () => {
  for (const div of DIVISIONS) {
    const p = DIV_PROFILE[div];
    const od = odAt(div, { finances: 35, budget: p.brokeCash, wages: p.brokeWages, streak: 1 });
    assert(od.rate >= od.oldFlatRate * 0.95, `${div}: ${od.rate} vs ${od.oldFlatRate}`);
  }
});

check('streakMult: 5 > 1', () => {
  assert(overdraftStreakMultiplier(5) > overdraftStreakMultiplier(1), 'mult');
  const a = odAt('C', { finances: 50, streak: 1 });
  const b = odAt('C', { finances: 50, streak: 5 });
  assert(b.rate > a.rate, 'rate streak');
});

check('incentivo: emprestimo saudavel < cheque na crise (A/B/C/D)', () => {
  for (const div of DIVISIONS) {
    const p = DIV_PROFILE[div];
    const healthy = makeClub({
      division: div,
      budget: p.healthyBudget,
      finances: 78,
      wages: p.healthyWages,
    });
    const offer = resolveBankCredit(healthy, { division: div });
    const od = odAt(div, { finances: 38, budget: p.brokeCash, wages: p.brokeWages, streak: 3 });
    assert(od.rate > offer.rate, `${div}: ${od.ratePct} > ${Math.round(offer.rate * 1000) / 10}`);
  }
});

function simulateSnowball(division, { rounds = 12, finances = 55 } = {}) {
  const p = DIV_PROFILE[division];
  const club = makeClub({
    division,
    budget: p.snowballStart,
    finances,
    wages: p.snowballWages,
    sponsorsTotal: Math.round(p.sponsorsTotal * 0.55),
    tvTotal: Math.round(p.tvTotal * 0.55),
  });
  let interestTotal = 0;
  let streak = 0;
  const path = [];
  for (let r = 1; r <= rounds; r += 1) {
    chargeRoundCosts(club, { division, round: r, managerReputation: 55 });
    const bal = getBalance(club);
    if (bal < 0) streak += 1;
    else streak = 0;
    club.overdraftStreak = streak;
    const od = resolveOverdraftRate(club, { division, streak });
    const fee = bal < 0 ? Math.max(1, Math.round(Math.abs(bal) * od.rate)) : 0;
    if (fee > 0) {
      club.budget = bal - fee;
      interestTotal += fee;
    }
    path.push({ r, cash: getBalance(club), ratePct: od.ratePct, fee, streak });
  }
  return { division, interestTotal, endCash: getBalance(club), path };
}

console.log('\n=== Matriz (streak 1): cheque % | emprestimo-like % | flat % ===');
console.log('saude\\serie'.padEnd(12) + DIVISIONS.map(d => d.padStart(22)).join(''));
for (const fin of FINANCES_GRID) {
  const cells = DIVISIONS.map(div => {
    const od = odAt(div, { finances: fin, streak: 1 });
    return `${od.ratePct}/${od.loanLikePct}/${od.oldFlatPct}`.padStart(22);
  });
  console.log(String(fin).padEnd(12) + cells.join(''));
}

console.log('\n=== Snowball 12r (taxa dinâmica + streak) ===');
for (const div of DIVISIONS) {
  const s = simulateSnowball(div);
  const start = s.path[0]?.ratePct;
  const end = s.path[s.path.length - 1]?.ratePct;
  console.log(
    `Serie ${div}: juros ${Math.round(s.interestTotal).toLocaleString('pt-BR')} | caixa ${Math.round(s.endCash).toLocaleString('pt-BR')} | taxa ${start}→${end}%`,
  );
}

console.log('\nPremios:', { OVERDRAFT_PREMIUM_BASE, OVERDRAFT_PREMIUM_WITH_LOAN });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
