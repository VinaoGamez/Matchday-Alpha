/**
 * Impacto da saúde financeira / caixa negativo nos medidores e na demissão.
 * node scripts/finances-impact-tests.mjs
 */
import {
  STATUS_MIN,
  BOARD_FINANCE_PRESSURE_THRESHOLD,
  BOARD_CHEAP_RESULT_FINANCES,
} from '../js/engine/club-status/constants.js';
import * as environmentRules from '../js/engine/club-status/rules/environment.js';
import * as boardRules from '../js/engine/club-status/rules/board.js';
import { resolveBoardJobRisk, MANAGER_JOB_CRISIS_THRESHOLD } from '../js/engine/manager-job.js';
import {
  getBalance,
  ensureBudget,
  chargeRoundCosts,
  serviceOverdraft,
  estimateFillRate,
  financesPayrollFactor,
  credit,
} from '../js/engine/economy.js';
import { resolveBankCredit } from '../js/engine/bank-loan.js';
import { createClubStatusEngine } from '../js/engine/club-status/index.js';

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

const makeClub = ({ budget, finances = 70, environment = 65, board = 65, wages }) => {
  const club = {
    name: 'Lab FC',
    division: 'D',
    budget,
    finances,
    environment,
    support: 60,
    board,
    roster: (wages || Array(14).fill(12_000)).map(w => player(w)),
    stadiumCapacity: 12_000,
    stadiumStructure: 1,
    pitchLevel: 1,
    ticketPrices: { national: 25, cups: 30 },
    sponsors: {
      season: 2027,
      division: 'D',
      total: 400_000,
      installments: 22,
      paidAmount: 0,
      paidInstallments: 0,
      master: { name: 'M', role: 'master', value: 220_000 },
      secondaries: [
        { name: 'S1', role: 'secondary', value: 60_000 },
        { name: 'S2', role: 'secondary', value: 60_000 },
        { name: 'S3', role: 'secondary', value: 60_000 },
      ],
    },
    tvRights: {
      season: 2027,
      division: 'D',
      total: 300_000,
      installments: 22,
      paidAmount: 0,
      paidInstallments: 0,
    },
  };
  ensureBudget(club, 'D');
  club.budget = budget;
  club.finances = finances;
  club.environment = environment;
  club.board = board;
  return club;
};

const clubStatus = createClubStatusEngine({
  clamp,
  getClubs: () => ({}),
  getUserClub: () => 'Lab FC',
  getUserDivision: () => 'D',
  getBalance,
  persistCareerStatus: () => {},
  onStatusChanged: () => {},
});

check('Ambiente ignora finanças no delta de jogo', () => {
  const ctx = { result: 'W', isHome: true, goalDiff: 2, clamp };
  const a = environmentRules.matchDelta({ ...ctx, finances: 90 });
  const b = environmentRules.matchDelta({ ...ctx, finances: 28 });
  assert(a === b, `${a} vs ${b}`);
});

check('Diretoria: vitória vale menos com finanças ruins', () => {
  const ctx = { result: 'W', isHome: true, goalDiff: 1, clamp };
  const rich = boardRules.matchDelta({ ...ctx, finances: 90 });
  const broke = boardRules.matchDelta({ ...ctx, finances: 35 });
  assert(broke < rich, `${broke} < ${rich}`);
  assert(broke === rich * 0.5 || Math.abs(broke - rich * 0.5) < 1e-9, 'scale 0.5');
});

check('Pressão financeira na Diretoria cresce com crise', () => {
  const soft = boardRules.financePressureDelta({
    finances: 80,
    runwayRounds: 8,
    shortfall: false,
    clamp,
  });
  const hard = boardRules.financePressureDelta({
    finances: 30,
    runwayRounds: 0.5,
    shortfall: true,
    clamp,
  });
  assert(soft === 0, `soft ${soft}`);
  assert(hard < -0.5, `hard ${hard}`);
});

check('Caixa negativo derruba saúde (piso 28) e pressiona board; Ambiente só muda por jogo', () => {
  const club = makeClub({
    budget: 5_000,
    finances: 70,
    environment: 65,
    board: 65,
    wages: Array(16).fill(25_000),
  });
  const envStart = club.environment;
  for (let r = 1; r <= 6; r += 1) {
    chargeRoundCosts(club, { division: 'D', round: r });
    serviceOverdraft(club, { division: 'D', round: r });
    clubStatus.syncFinancesFromBudget(club, 'D');
    club.board = clampStatus(
      club.board +
        boardRules.financePressureDelta({
          finances: club.finances,
          runwayRounds: getBalance(club) < 0 ? -1 : 99,
          shortfall: true,
          overdraftStreak: club.overdraftStreak || 0,
          clamp,
        }),
    );
    // Sem partida: ambiente só drift — quase estável
    club.environment = clampStatus(
      club.environment + environmentRules.driftDelta(club.environment),
    );
  }
  assert(getBalance(club) < 0, 'caixa negativo');
  assert(club.finances < 70, `finanças caiu ${club.finances}`);
  assert(club.finances >= STATUS_MIN, `piso ${club.finances}`);
  assert(club.board < 65, `board caiu ${club.board}`);
  assert(Math.abs(club.environment - envStart) < 3, `ambiente quase estável ${club.environment}`);
});

check('Finanças ruins sozinhas NÃO demitem; com board em crise demitem', () => {
  const onlyFin = resolveBoardJobRisk({ board: 70, finances: 30, played: 12 });
  assert(onlyFin.status !== 'sacked', onlyFin.status);
  const both = resolveBoardJobRisk({ board: 35, finances: 30, played: 12 });
  assert(both.status === 'sacked', both.status);
  assert(both.reason === 'critical_pair' || both.reason === 'collapse_dual', both.reason);
});

check('Saúde baixa corta crédito e payroll factor; fillRate segue Ambiente', () => {
  const rich = makeClub({ budget: 2_000_000, finances: 85, environment: 70 });
  const poor = makeClub({ budget: -200_000, finances: 32, environment: 70 });
  clubStatus.syncFinancesFromBudget(poor, 'D');
  const cr = resolveBankCredit(rich, { division: 'D' }).available;
  const cp = resolveBankCredit(poor, { division: 'D' }).available;
  assert(cr > cp, `crédito ${cr} > ${cp}`);
  assert(financesPayrollFactor(85) > financesPayrollFactor(32), 'payroll factor');
  const fillR = estimateFillRate(rich, 'national');
  const fillP = estimateFillRate(poor, 'national');
  assert(Math.abs(fillR - fillP) < 0.02, 'fillRate ~igual com mesmo Ambiente');
});

check('Controle: clube saudável não entra em crise em 6 rodadas', () => {
  const club = makeClub({
    budget: 3_000_000,
    finances: 75,
    wages: Array(14).fill(4_000),
  });
  for (let r = 1; r <= 6; r += 1) {
    credit(club, 180_000, { reason: 'sim', label: 'rev' });
    chargeRoundCosts(club, { division: 'D', round: r });
    serviceOverdraft(club, { division: 'D', round: r });
    clubStatus.syncFinancesFromBudget(club, 'D');
  }
  assert(getBalance(club) > 0, 'caixa +');
  assert(club.finances > BOARD_FINANCE_PRESSURE_THRESHOLD, `fin ${club.finances}`);
  assert(
    resolveBoardJobRisk({ board: club.board, finances: club.finances, played: 12 }).status !==
      'sacked',
    'não demitido',
  );
});

// --- relatório narrativo ---
console.log('\n--- Série crítica (folha pesada, sem receita) ---');
const lab = makeClub({
  budget: 5_000,
  finances: 70,
  environment: 65,
  board: 65,
  wages: Array(16).fill(25_000),
});
const rows = [];
for (let r = 1; r <= 8; r += 1) {
  chargeRoundCosts(lab, { division: 'D', round: r });
  serviceOverdraft(lab, { division: 'D', round: r });
  clubStatus.syncFinancesFromBudget(lab, 'D');
  lab.board = clampStatus(
    lab.board +
      boardRules.financePressureDelta({
        finances: lab.finances,
        runwayRounds: getBalance(lab) < 0 ? -1 : 99,
        shortfall: true,
        overdraftStreak: lab.overdraftStreak || 0,
        clamp,
      }),
  );
  // Derrota em casa a cada rodada → Ambiente cai por JOGO, não por dinheiro
  lab.environment = clampStatus(
    lab.environment +
      environmentRules.matchDelta({ result: 'L', isHome: true, goalDiff: -1, clamp }) +
      environmentRules.driftDelta(lab.environment),
  );
  const job = resolveBoardJobRisk({
    board: lab.board,
    finances: lab.finances,
    played: 10 + r,
  });
  rows.push({
    r,
    cash: getBalance(lab),
    fin: Math.round(lab.finances),
    board: Math.round(lab.board),
    env: Math.round(lab.environment),
    job: job.status,
  });
}
console.table(rows);

console.log('\nLimiares:', {
  STATUS_MIN,
  BOARD_FINANCE_PRESSURE_THRESHOLD,
  BOARD_CHEAP_RESULT_FINANCES,
  CRISIS: MANAGER_JOB_CRISIS_THRESHOLD,
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
