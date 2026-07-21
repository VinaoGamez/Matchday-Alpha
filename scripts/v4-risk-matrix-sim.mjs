/**
 * Matriz v5: vermelho de caixa × demissão × quebra formal.
 * node scripts/v4-risk-matrix-sim.mjs
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
  getBalance,
  spend,
  tvHomeSlots,
  serviceOverdraft,
  estimateRoundCostBill,
} from '../js/engine/economy.js';
import {
  takeBankLoan,
  serviceBankLoan,
  payBankLoanMinimum,
  resolveBankCredit,
  bankLoanBalance,
  getBankLoan,
} from '../js/engine/bank-loan.js';
import { createClubStatusEngine } from '../js/engine/club-status/index.js';
import * as boardRules from '../js/engine/club-status/rules/board.js';
import * as environmentRules from '../js/engine/club-status/rules/environment.js';
import { STATUS_MIN } from '../js/engine/club-status/constants.js';
import {
  resolveBoardJobRisk,
  MANAGER_JOB_HONEYMOON_ROUNDS,
  MANAGER_JOB_CRISIS_THRESHOLD,
} from '../js/engine/manager-job.js';
import { resolveClubBankruptcyRisk } from '../js/engine/club-solvency.js';

const fmt = n =>
  `R$ ${Math.round(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
const seasonRounds = d => (d === 'D' ? 22 : 38);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clampStatus = v => clamp(Math.round(v), STATUS_MIN, 98);

const mid = { A: 76, B: 72, C: 68, D: 64 };
const high = { A: 86, B: 80, C: 74, D: 70 };

const roster = (n, ovr) =>
  Array.from({ length: n }, (_, i) => ({
    name: `P${i + 1}`,
    overall: ovr,
    age: 24 + (i % 8),
    pos: 'MC',
    wage: null,
  }));

function makeClub(division, { overall, rosterSize = 22 } = {}) {
  const club = {
    name: `Sim ${division}`,
    division,
    roster: roster(rosterSize, overall),
    budget: initialBudget(division),
    environment: 70,
    support: 70,
    board: 72,
    finances: 75,
    managerReputation: 70,
  };
  ensureStadium(club, division);
  return club;
}

function applyBoardPressure(club, division, clubStatus, { heavyLosses = false } = {}) {
  clubStatus.syncFinancesFromBudget(club, division);
  const balance = getBalance(club);
  const overdrawn = balance < 0;
  club.board = clampStatus(
    club.board +
      boardRules.financePressureDelta({
        finances: club.finances,
        runwayRounds: overdrawn ? -1 : 99,
        shortfall: !!club.wageShortfall || overdrawn || !!club.loanServiceShortfall || !!club.overdraftActive,
        overdraftStreak: club.overdraftStreak || 0,
        clamp,
      }) +
      boardRules.financeGapCeilingDelta({
        board: club.board,
        finances: club.finances,
        clamp,
      }),
  );
  if (heavyLosses) {
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
}

function runScenario({
  division,
  label,
  takeMaxLoan = false,
  burnAllCash = false,
  burnLoanOnly = false,
  payMinimum = true,
  heavyLosses = false,
  noRevenue = false,
}) {
  const expensive = label.includes('elenco caro');
  const club = makeClub(division, {
    overall: expensive ? high[division] : mid[division],
    rosterSize: expensive ? 26 : 22,
  });
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
    if (line.available > 0) {
      takeBankLoan(club, line.available, { division, season: 2026, round: 0 });
      loanTaken = line.available;
    }
  }
  if (burnLoanOnly && loanTaken > 0) {
    spend(club, Math.min(loanTaken, getBalance(club)), {
      reason: 'transfer',
      label: 'Queima loan',
      allowNegative: false,
    });
  }
  if (burnAllCash) {
    const burn = Math.max(0, getBalance(club));
    if (burn > 0) {
      spend(club, burn, { reason: 'transfer', label: 'Queima total', allowNegative: false });
    }
  }

  const gatePerHome = estimateGateReceipt(club, { channel: 'national', division }).revenue;
  const clubStatus = createClubStatusEngine({
    clamp,
    getClubs: () => ({ [club.name]: club }),
    getUserClub: () => club.name,
    getUserDivision: () => division,
    getBalance,
    persistCareerStatus: () => {},
    onStatusChanged: () => {},
  });

  let firstRed = null;
  let redRounds = 0;
  let sackRound = null;
  let bankruptRound = null;
  let warnRound = null;
  let crisisRound = null;
  let maxDebt = bankLoanBalance(club);

  for (let round = 1; round <= rounds; round++) {
    if (bankruptRound != null) break;
    if (!noRevenue) {
      if (round % 2 === 1) {
        club.budget += gatePerHome;
        creditHomeTv(
          club,
          { home: club.name, away: `Opp ${round}`, round, competition: 'LEAGUE' },
          { division, season: 2026 },
        );
      }
      creditSponsorInstallment(club, { round, installments: rounds });
    }

    chargeRoundCosts(club, {
      division,
      round,
      managerReputation: 70,
      managerId: 'sim',
      preferredDivision: division,
    });

    serviceBankLoan(club, { division, round, season: 2026 });
    if (payMinimum && getBankLoan(club)?.minAmortDue > 0) {
      payBankLoanMinimum(club, { division });
    }
    serviceOverdraft(club, { division, round, season: 2026 });
    applyBoardPressure(club, division, clubStatus, { heavyLosses });

    const cash = getBalance(club);
    maxDebt = Math.max(maxDebt, bankLoanBalance(club));
    if (cash < 0) {
      redRounds += 1;
      if (firstRed == null) firstRed = round;
    }

    const played = MANAGER_JOB_HONEYMOON_ROUNDS + round;
    const loan = getBankLoan(club);
    const solvency = resolveClubBankruptcyRisk({
      cash,
      roundCost: estimateRoundCostBill(club, division, { managerReputation: 70 }),
      overdraftStreak: club.overdraftStreak || 0,
      finances: club.finances,
      loanBalance: bankLoanBalance(club),
      delinquencyStreak: loan?.delinquencyStreak || 0,
      loanServiceShortfall: !!club.loanServiceShortfall,
      played,
      honeymoonRounds: MANAGER_JOB_HONEYMOON_ROUNDS,
    });
    if (solvency.status === 'bankrupt' && bankruptRound == null) {
      bankruptRound = round;
      if (crisisRound == null) crisisRound = round;
    }

    const job = resolveBoardJobRisk({
      board: club.board,
      finances: club.finances,
      played,
    });
    if (
      warnRound == null &&
      (job.status === 'warn_finances' ||
        job.status === 'warn_board' ||
        job.status === 'critical' ||
        solvency.status === 'warn_insolvent')
    ) {
      warnRound = round;
    }
    const finCrisis = club.finances < MANAGER_JOB_CRISIS_THRESHOLD;
    const boardCrisis = club.board < MANAGER_JOB_CRISIS_THRESHOLD;
    const softPair =
      (club.finances < 32 && club.board < 50) || (club.board < 32 && club.finances < 50);
    if (
      crisisRound == null &&
      ((finCrisis && boardCrisis) || softPair || job.status === 'sacked' || solvency.status === 'bankrupt')
    ) {
      crisisRound = round;
    }
    // Quebra tem prioridade: não conta demissão se já faliu.
    if (bankruptRound == null && sackRound == null && job.status === 'sacked') sackRound = round;
  }

  return {
    division,
    label,
    loanTaken,
    firstRed,
    redRounds,
    warnRound,
    crisisRound,
    sackRound,
    bankruptRound,
    endCash: getBalance(club),
    endDebt: bankLoanBalance(club),
    maxDebt,
    endFin: Math.round(club.finances),
    endBoard: Math.round(club.board),
    formalBankruptcy: bankruptRound != null,
  };
}

const scenarios = [];
for (const division of ['A', 'B', 'C', 'D']) {
  scenarios.push(
    runScenario({ division, label: 'baseline (sem loan)' }),
    runScenario({
      division,
      label: 'máx + guarda + paga mínimo',
      takeMaxLoan: true,
      payMinimum: true,
    }),
    runScenario({
      division,
      label: 'máx + gasta loan + paga mínimo',
      takeMaxLoan: true,
      burnLoanOnly: true,
      payMinimum: true,
    }),
    runScenario({
      division,
      label: 'máx + gasta loan + IGNORA mínimo',
      takeMaxLoan: true,
      burnLoanOnly: true,
      payMinimum: false,
    }),
    runScenario({
      division,
      label: 'máx + QUEIMA TUDO + IGNORA mínimo',
      takeMaxLoan: true,
      burnAllCash: true,
      payMinimum: false,
    }),
    runScenario({
      division,
      label: 'elenco caro + máx + QUEIMA + ignora',
      takeMaxLoan: true,
      burnAllCash: true,
      payMinimum: false,
    }),
    runScenario({
      division,
      label: 'overdraft estressado (sem receita + derrotas)',
      noRevenue: true,
      heavyLosses: true,
    }),
  );
}

console.log('\n=== MATRIZ DE RISCO v5 (caixa × demissão × quebra) ===\n');
console.log(
  'div | cenário                                              | vermelho | crise | demissão | quebra | fim caixa     | fin/board',
);
console.log('-'.repeat(125));

let n = 0;
let nRed = 0;
let nSack = 0;
let nCrisis = 0;
let nBankrupt = 0;

for (const s of scenarios) {
  n += 1;
  const red = s.firstRed != null;
  const sack = s.sackRound != null;
  const crisis = s.crisisRound != null;
  const broke = s.formalBankruptcy;
  if (red) nRed += 1;
  if (sack) nSack += 1;
  if (crisis) nCrisis += 1;
  if (broke) nBankrupt += 1;
  console.log(
    [
      s.division.padEnd(3),
      s.label.padEnd(52),
      (red ? `r${s.firstRed} (${s.redRounds}r)` : 'não').padEnd(10),
      (crisis ? `r${s.crisisRound}` : 'não').padEnd(5),
      (sack ? `r${s.sackRound}` : 'não').padEnd(8),
      (broke ? `r${s.bankruptRound}` : 'não').padEnd(6),
      fmt(s.endCash).padStart(12),
      `${s.endFin}/${s.endBoard}`,
    ].join(' | '),
  );
}

console.log('-'.repeat(125));
console.log(`\nTOTAL cenários: ${n}`);
console.log(`  Caixa no vermelho:     ${nRed}/${n} (${((nRed / n) * 100).toFixed(0)}%)`);
console.log(`  Crise institucional:   ${nCrisis}/${n} (${((nCrisis / n) * 100).toFixed(0)}%)`);
console.log(`  Demissão:              ${nSack}/${n} (${((nSack / n) * 100).toFixed(0)}%)`);
console.log(`  Quebra formal clube:   ${nBankrupt}/${n} (${((nBankrupt / n) * 100).toFixed(0)}%)`);

const families = [
  [
    'Gestão ok (baseline / guarda / gasta+paga)',
    s =>
      s.label.startsWith('baseline') ||
      s.label.includes('guarda') ||
      s.label.includes('gasta loan + paga'),
  ],
  ['Ignora mínimo (só loan queimado)', s => s.label.includes('gasta loan + IGNORA')],
  [
    'Má gestão (queima tudo + ignora)',
    s => s.label.includes('QUEIMA') || s.label.includes('elenco caro'),
  ],
  ['Overdraft estressado', s => s.label.includes('overdraft')],
];

console.log('\nPor família de comportamento:');
for (const [name, pred] of families) {
  const rows = scenarios.filter(pred);
  const red = rows.filter(r => r.firstRed != null).length;
  const sack = rows.filter(r => r.sackRound != null).length;
  const crisis = rows.filter(r => r.crisisRound != null).length;
  const broke = rows.filter(r => r.formalBankruptcy).length;
  console.log(
    `  ${name}: n=${rows.length} · vermelho ${red}/${rows.length} · crise ${crisis}/${rows.length} · demissão ${sack}/${rows.length} · quebra ${broke}/${rows.length}`,
  );
}

console.log(
  '\nNota: quebra = falência formal (fim de save, sem propostas). Demissão = ofertas de emprego.\n',
);
