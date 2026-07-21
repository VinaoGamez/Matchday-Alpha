/**
 * Diagnóstico: quão difícil é ir ao vermelho com o motor atual?
 * Uso: node scripts/economy-red-ink-diag.mjs
 */
import {
  initialBudget,
  ensureStadium,
  assignSponsors,
  assignTvRights,
  creditSponsorInstallment,
  creditHomeTv,
  chargeRoundCosts,
  estimateGateReceipt,
  estimateRoundCostBill,
  estimateWageBill,
  estimateStaffBill,
  estimateStadiumOpsBill,
  getBalance,
  spend,
  tvHomeSlots,
  TV_VALUE_BY_DIVISION,
  SPONSOR_VALUE_BY_DIVISION,
} from '../js/engine/economy.js';
import {
  takeBankLoan,
  serviceBankLoan,
  payBankLoanMinimum,
  resolveBankCredit,
  bankLoanBalance,
  getBankLoan,
} from '../js/engine/bank-loan.js';

const fmt = n => `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(0)}%` : '—');

const roster = (n, ovr) =>
  Array.from({ length: n }, (_, i) => ({
    name: `P${i + 1}`,
    overall: ovr,
    age: 24 + (i % 8),
    pos: 'MC',
    wage: null,
  }));

const makeClub = (division, { overall = 76, rosterSize = 22, budgetRatio = 1 } = {}) => {
  const club = {
    name: `Diag ${division}`,
    division,
    roster: roster(rosterSize, overall),
    budget: Math.round(initialBudget(division) * budgetRatio),
    environment: 72,
    support: 70,
    board: 70,
    finances: 75,
    managerReputation: 70,
  };
  ensureStadium(club, division);
  return club;
};

const seasonRounds = d => (d === 'D' ? 22 : 38);

const runSeason = (club, division, {
  spendUpfront = 0,
  takeMaxLoan = false,
  payMinimum = true,
  label = '',
} = {}) => {
  const rounds = seasonRounds(division);
  const homes = tvHomeSlots(division);
  assignSponsors(club, {
    division,
    season: 2026,
    installments: rounds,
    creditPackage: false,
    random: () => 0.45,
  });
  assignTvRights(club, {
    division,
    season: 2026,
    installments: homes,
    random: () => 0.45,
  });

  let loanTaken = 0;
  if (takeMaxLoan) {
    const line = resolveBankCredit(club, { division });
    const fee = line.available;
    if (fee > 0) {
      takeBankLoan(club, fee, { division, season: 2026, round: 0 });
      loanTaken = fee;
    }
  }

  if (spendUpfront > 0) {
    const burn = Math.min(spendUpfront, Math.max(0, getBalance(club)));
    if (burn > 0) {
      spend(club, burn, {
        reason: 'transfer',
        label: 'Queima diagnóstica (mercado)',
        allowNegative: false,
      });
    }
  }

  const start = getBalance(club);
  const gateEst = estimateGateReceipt(club, { channel: 'national', division });
  const gatePerHome = gateEst.revenue;
  const roundCost = estimateRoundCostBill(club, division, { managerReputation: 70 });

  let gateIn = 0;
  let sponsorIn = 0;
  let tvIn = 0;
  let costs = 0;
  let bankInterest = 0;
  let bankAmort = 0;
  let bankCapitalized = 0;
  let bankForced = 0;
  let maxDebt = bankLoanBalance(club);
  let minBal = start;
  let brokeRound = null;
  let redRounds = 0;

  for (let round = 1; round <= rounds; round++) {
    const isHome = round % 2 === 1;
    if (isHome) {
      club.budget += gatePerHome;
      gateIn += gatePerHome;
      const tv = creditHomeTv(
        club,
        { home: club.name, away: `Opp ${round}`, round, competition: 'LEAGUE' },
        { division, season: 2026 },
      );
      tvIn += tv.amount || 0;
    }
    const sp = creditSponsorInstallment(club, { round, installments: rounds });
    sponsorIn += sp.amount || 0;

    const charged = chargeRoundCosts(club, {
      division,
      round,
      managerReputation: 70,
      managerId: 'diag',
      preferredDivision: division,
    });
    costs += charged.paid || 0;

    const bank = serviceBankLoan(club, { division, round, season: 2026 });
    if (!bank.skipped) {
      bankInterest += bank.interestPaid || 0;
      bankAmort += bank.amortPaid || bank.forceCollected || 0;
      bankCapitalized += bank.capitalized || 0;
      bankForced += bank.forceCollected || 0;
    }
    if (payMinimum && getBankLoan(club)?.minAmortDue > 0) {
      const paid = payBankLoanMinimum(club, { division });
      if (paid.ok) bankAmort += paid.towardDue || paid.paid || 0;
    }
    maxDebt = Math.max(maxDebt, bankLoanBalance(club));

    const bal = getBalance(club);
    minBal = Math.min(minBal, bal);
    if (bal < 0) {
      redRounds += 1;
      if (brokeRound == null) brokeRound = round;
    }
  }

  const end = getBalance(club);
  const incomeOps = gateIn + sponsorIn + tvIn;
  return {
    label,
    division,
    loanTaken,
    start,
    end,
    minBal,
    brokeRound,
    redRounds,
    gateIn,
    sponsorIn,
    tvIn,
    incomeOps,
    costs,
    bankInterest,
    bankAmort,
    bankCapitalized,
    bankForced,
    maxDebt,
    debtEnd: bankLoanBalance(club),
    delinquencyEnd: getBankLoan(club)?.delinquencyStreak || 0,
    gatePerHome,
    roundCost,
    wage: estimateWageBill(club, division),
    staff: estimateStaffBill(club, division, { managerReputation: 70 }),
    stadium: estimateStadiumOpsBill(club, division),
    coverage: roundCost > 0 ? (incomeOps / rounds) / roundCost : 0,
  };
};

console.log('\n=== DIAGNÓSTICO: dificuldade de entrar no vermelho ===\n');
console.log('(motor atual · sem prêmio de fim · bilheteria = estimativa de mando)\n');

const scenarios = [];
for (const division of ['A', 'B', 'C', 'D']) {
  const mid = { A: 76, B: 72, C: 68, D: 64 }[division];
  const high = { A: 86, B: 80, C: 74, D: 70 }[division];

  scenarios.push(
    runSeason(makeClub(division, { overall: mid }), division, {
      label: `${division} baseline`,
    }),
  );
  scenarios.push(
    runSeason(makeClub(division, { overall: mid }), division, {
      label: `${division} máx. empréstimo + guarda + paga mínimo`,
      takeMaxLoan: true,
      payMinimum: true,
    }),
  );
  scenarios.push(
    runSeason(makeClub(division, { overall: mid }), division, {
      label: `${division} máx. + gasta + IGNORA mínimo`,
      takeMaxLoan: true,
      spendUpfront: 99_999_999,
      payMinimum: false,
    }),
  );
  scenarios.push(
    runSeason(makeClub(division, { overall: high, rosterSize: 26 }), division, {
      label: `${division} elenco caro + máx. + gasta + ignora`,
      takeMaxLoan: true,
      spendUpfront: 99_999_999,
      payMinimum: false,
    }),
  );
}

// Quanto precisa queimar no dia 0 (Série A) para minBal < 0?
console.log('--- Mix de receita vs custo (baseline) ---\n');
for (const s of scenarios.filter(x => x.label.endsWith('baseline'))) {
  const homeN = tvHomeSlots(s.division);
  console.log(
    `${s.division}: custo/rod ${fmt(s.roundCost)} | gate/mando ${fmt(s.gatePerHome)} (×${homeN}=${fmt(s.gateIn)})`,
  );
  console.log(
    `   patrocínio ${fmt(s.sponsorIn)} (${pct(s.sponsorIn, s.incomeOps)}) · TV ${fmt(s.tvIn)} (${pct(s.tvIn, s.incomeOps)}) · gate ${fmt(s.gateIn)} (${pct(s.gateIn, s.incomeOps)})`,
  );
  console.log(
    `   receita/rod ~${fmt(s.incomeOps / seasonRounds(s.division))} · cobertura ${s.coverage.toFixed(2)}× · end ${fmt(s.end)} · min ${fmt(s.minBal)} · vermelho=${s.brokeRound ?? 'nunca'}`,
  );
  console.log('');
}

console.log('--- Pressão: empréstimo híbrido (má gestão vs paga mínimo) ---\n');
for (const s of scenarios.filter(x => !x.label.endsWith('baseline'))) {
  const flag =
    s.brokeRound != null
      ? `VERMELHO r${s.brokeRound} (${s.redRounds}r)`
      : `nunca vermelho (min ${fmt(s.minBal)})`;
  console.log(`• ${s.label}`);
  console.log(
    `  loan ${fmt(s.loanTaken)} · end caixa ${fmt(s.end)} · dívida ${fmt(s.debtEnd)} (pico ${fmt(s.maxDebt)}) · atraso fim ${s.delinquencyEnd}`,
  );
  console.log(
    `  juros ${fmt(s.bankInterest)} · amort/forçado ${fmt(s.bankAmort)} · capitalizado ${fmt(s.bankCapitalized)} · forçado ${fmt(s.bankForced)}`,
  );
  console.log(`  → ${flag}\n`);
}

// Busca: burn no dia 0 (médio + max loan) para primeiro vermelho
const findBurnToRed = division => {
  const mid = { A: 76, B: 72, C: 68, D: 64 }[division];
  let lo = 0;
  let hi = initialBudget(division) * 4;
  let best = null;
  for (let i = 0; i < 20; i++) {
    const midBurn = Math.round((lo + hi) / 2);
    const club = makeClub(division, { overall: mid });
    const r = runSeason(club, division, {
      spendUpfront: midBurn,
      takeMaxLoan: true,
      payMinimum: true,
      label: 'search',
    });
    if (r.brokeRound != null) {
      best = { burn: midBurn, ...r };
      hi = midBurn;
    } else {
      lo = midBurn;
    }
  }
  return best;
};

console.log('--- Quanto precisa QUEIMAR no dia 0 (máx. loan) para ver vermelho? ---\n');
for (const division of ['A', 'B', 'C', 'D']) {
  const hit = findBurnToRed(division);
  if (!hit) {
    console.log(`${division}: impossível ir ao vermelho mesmo queimando o teto da busca`);
  } else {
    console.log(
      `${division}: queima ≥ ${fmt(hit.burn)} → 1º vermelho r${hit.brokeRound} (min ${fmt(hit.minBal)}, end ${fmt(hit.end)})`,
    );
  }
}

console.log('\n--- Faixas de contrato (referência) ---\n');
for (const d of ['A', 'B', 'C', 'D']) {
  const [tvLo, tvHi] = TV_VALUE_BY_DIVISION[d];
  const sp = SPONSOR_VALUE_BY_DIVISION[d];
  console.log(
    `${d}: TV ${fmt(tvLo)}–${fmt(tvHi)} · master ${fmt(sp.master[0])}–${fmt(sp.master[1])} · sec ${fmt(sp.secondary[0])}–${fmt(sp.secondary[1])}`,
  );
}

console.log('\n=== Veredito ===\n');
const baselineA = scenarios.find(s => s.label === 'A baseline');
const ignoreA = scenarios.find(s => s.label === 'A máx. + gasta + IGNORA mínimo');
const payA = scenarios.find(s => s.label === 'A máx. empréstimo + guarda + paga mínimo');
console.log(
  `Série A baseline: cobertura ${baselineA.coverage.toFixed(2)}× — bilheteria sozinha ${pct(baselineA.gateIn, baselineA.costs)} dos custos da temporada.`,
);
console.log(
  `Guarda + paga mínimo: min ${fmt(payA.minBal)} · vermelho=${payA.brokeRound ?? 'nunca'}.`,
);
console.log(
  `Má gestão (gasta + ignora mínimo): min ${fmt(ignoreA.minBal)} · vermelho r${ignoreA.brokeRound} · dívida pico ${fmt(ignoreA.maxDebt)} · capitalizado ${fmt(ignoreA.bankCapitalized)}.`,
);
const okCov = baselineA.coverage >= 0.95 && baselineA.coverage <= 1.1;
const badOk = ignoreA.brokeRound != null && ignoreA.brokeRound <= 6;
console.log(
  okCov && badOk
    ? 'Alvo v5: média jogável (cobertura ~1×); má gestão → vermelho em ≤6r (quebra via matriz/solvência).'
    : `Fora do alvo v5 — cov ${baselineA.coverage.toFixed(2)}× · ignore vermelho r${ignoreA.brokeRound ?? 'nunca'}.`,
);
console.log('');
