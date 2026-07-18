/**
 * Simulação / validação do Passo 3 (demissão gatilho 3).
 * Uso: node scripts/manager-job-sim.mjs
 */
import {
  resolveBoardJobRisk,
  generateJobOffers,
  MANAGER_JOB_HONEYMOON_ROUNDS,
  MANAGER_JOB_CRISIS_THRESHOLD,
} from '../js/engine/manager-job.js';
import { createManagerRankingEngine } from '../js/engine/manager-ranking.js';
import { matchDelta, tableDelta, driftDelta } from '../js/engine/club-status/rules/board.js';
import { syncFromBudget } from '../js/engine/club-status/rules/finances.js';
import { STATUS_MIN, STATUS_MAX } from '../js/engine/club-status/constants.js';
import { initialBudget } from '../js/engine/economy.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const clampStatus = v => clamp(Math.round(Number(v) || 0), STATUS_MIN, STATUS_MAX);

let passed = 0;
let failed = 0;
const fail = (name, detail) => {
  failed += 1;
  console.log(`  FAIL  ${name} — ${detail}`);
};
const ok = name => {
  passed += 1;
  console.log(`  OK    ${name}`);
};
const assertEq = (name, actual, expected) => {
  if (actual === expected) ok(`${name} → ${actual}`);
  else fail(name, `expected ${expected}, got ${actual}`);
};

console.log('\n=== 1) Matriz resolveBoardJobRisk ===\n');
console.log(`Limiar=${MANAGER_JOB_CRISIS_THRESHOLD}  Lua de mel=${MANAGER_JOB_HONEYMOON_ROUNDS}  STATUS_MIN=${STATUS_MIN}\n`);

const cases = [
  { name: 'saudável', board: 60, finances: 70, played: 10, expect: 'ok' },
  { name: 'só board baixo', board: 30, finances: 60, played: 10, expect: 'warn_board' },
  { name: 'só finanças baixas', board: 60, finances: 30, played: 10, expect: 'warn_finances' },
  { name: 'ambos baixos + mel', board: 30, finances: 30, played: 3, expect: 'critical' },
  { name: 'ambos baixos pós-mel', board: 30, finances: 30, played: 10, expect: 'sacked' },
  { name: 'limiar exato 35/35', board: 35, finances: 35, played: 10, expect: 'ok' },
  { name: '34/35 (só board)', board: 34, finances: 35, played: 10, expect: 'warn_board' },
  { name: '35/34 (só fin)', board: 35, finances: 34, played: 10, expect: 'warn_finances' },
  { name: '34/34 demissão', board: 34, finances: 34, played: 6, expect: 'sacked' },
  { name: 'piso 28/28 demissão', board: 28, finances: 28, played: 20, expect: 'sacked' },
  { name: 'alreadySacked', board: 80, finances: 80, played: 1, alreadySacked: true, expect: 'sacked' },
  { name: 'gatilho 1 isolado NÃO demite', board: 28, finances: 50, played: 20, expect: 'warn_board' },
  { name: 'gatilho 2 isolado NÃO demite', board: 50, finances: 28, played: 20, expect: 'warn_finances' },
];

for (const c of cases) {
  const r = resolveBoardJobRisk({
    board: c.board,
    finances: c.finances,
    played: c.played,
    alreadySacked: !!c.alreadySacked,
  });
  assertEq(c.name, r.status, c.expect);
}

console.log('\n=== 2) Temporada simulada: crise combinada ===\n');

const simulateSeason = ({
  label,
  startBoard = 62,
  startFinances = 70,
  startBudgetRatio = 1.0,
  results = [], // 'W'|'D'|'L' por rodada
  budgetBurnPerRound = 0,
  division = 'A',
} = {}) => {
  let board = startBoard;
  let finances = startFinances;
  let balance = initialBudget(division) * startBudgetRatio;
  const baseline = initialBudget(division);
  let points = 0;
  let wins = 0;
  let played = 0;
  let firstWarn = null;
  let sackRound = null;
  const trail = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    played += 1;
    if (result === 'W') {
      points += 3;
      wins += 1;
    } else if (result === 'D') points += 1;

    const position = Math.max(1, Math.min(20, 20 - Math.round((points / Math.max(1, played)) * 10)));
    board += matchDelta({ result, isHome: i % 2 === 0, goalDiff: result === 'W' ? 1 : result === 'L' ? -1 : 0, clamp });
    board += tableDelta({ position, clubsCount: 20, points, played, clamp });
    board += driftDelta(board);
    board = clampStatus(board);

    balance = Math.max(0, balance - budgetBurnPerRound);
    const club = { finances, wageShortfall: balance <= 0 && budgetBurnPerRound > 0 };
    // Folha típica Série A — runway passa a pressionar finances no motor v1.
    const wageBill = division === 'A' ? 300_000 : 180_000;
    syncFromBudget(club, { balance, baseline, wageBill, shortfall: club.wageShortfall, clamp, clampStatus });
    finances = club.finances;

    const risk = resolveBoardJobRisk({ board, finances, played });
    trail.push({
      round: played,
      result,
      board,
      finances: Math.round(finances),
      balance: Math.round(balance),
      status: risk.status,
    });
    if (!firstWarn && (risk.status === 'warn_board' || risk.status === 'warn_finances' || risk.status === 'critical')) {
      firstWarn = { round: played, status: risk.status };
    }
    if (risk.status === 'sacked' && sackRound == null) {
      sackRound = played;
      break;
    }
  }

  return { label, sackRound, firstWarn, finalBoard: board, finalFinances: Math.round(finances), trail, wins };
};

const badRun = Array(20).fill('L');
const mixedBad = ['L', 'L', 'D', 'L', 'L', 'L', 'D', 'L', 'L', 'L', 'L', 'D', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L'];
const goodRun = Array(20).fill('W');
const boardOnlyCrisis = Array(25).fill('L'); // finances stay high if no burn

const scenarios = [
  simulateSeason({
    label: 'Derrotas + queima de caixa (crise combinada)',
    results: badRun,
    startBudgetRatio: 0.45,
    budgetBurnPerRound: initialBudget('A') * 0.1,
  }),
  simulateSeason({
    label: 'Só derrotas, caixa intacto (NÃO deve demitir)',
    results: boardOnlyCrisis,
    startBudgetRatio: 1.2,
    budgetBurnPerRound: 0,
  }),
  simulateSeason({
    label: 'Resultados ok, queima brutal de caixa (NÃO deve demitir)',
    results: goodRun,
    startBudgetRatio: 0.35,
    budgetBurnPerRound: initialBudget('A') * 0.14,
  }),
  simulateSeason({
    label: 'Misto ruim + queima moderada',
    results: mixedBad,
    startBudgetRatio: 0.55,
    budgetBurnPerRound: initialBudget('A') * 0.08,
  }),
  simulateSeason({
    label: 'Campanha boa + caixa ok',
    results: goodRun,
    startBudgetRatio: 1.0,
    budgetBurnPerRound: 0,
  }),
];

for (const s of scenarios) {
  const sackTxt = s.sackRound ? `DEMITIDO na rodada ${s.sackRound}` : 'empregado até o fim';
  const warnTxt = s.firstWarn ? `1º aviso r${s.firstWarn.round} (${s.firstWarn.status})` : 'sem aviso';
  console.log(`• ${s.label}`);
  console.log(`  → ${sackTxt} | ${warnTxt} | fim board=${s.finalBoard} fin=${s.finalFinances}`);
  if (s.sackRound) {
    const row = s.trail[s.trail.length - 1];
    console.log(`  → no corte: board=${row.board} fin=${row.finances} saldo~${row.balance}`);
  }
}

// Expectativas de validação
const s0 = scenarios[0];
const s1 = scenarios[1];
const s2 = scenarios[2];
const s4 = scenarios[4];
console.log('\n--- Asserções de temporada ---\n');
if (s0.sackRound != null) ok(`crise combinada demite (r${s0.sackRound})`);
else fail('crise combinada demite', 'não demitiu em 20 rodadas');
if (s1.sackRound == null) ok('só board baixo NÃO demite');
else fail('só board baixo NÃO demite', `demitiu r${s1.sackRound}`);
if (s2.sackRound == null) ok('só finanças baixas NÃO demite');
else fail('só finanças baixas NÃO demite', `demitiu r${s2.sackRound}`);
if (s4.sackRound == null) ok('campanha boa permanece');
else fail('campanha boa permanece', `demitiu r${s4.sackRound}`);

console.log('\n=== 3) Monte Carlo ===\n');

const runMc = (label, n, build) => {
  const mc = { sacked: 0, rounds: [], warnOnly: 0, neverCrisis: 0 };
  for (let i = 0; i < n; i++) {
    const sim = simulateSeason(build(i));
    if (sim.sackRound != null) {
      mc.sacked += 1;
      mc.rounds.push(sim.sackRound);
    } else if (sim.firstWarn) mc.warnOnly += 1;
    else mc.neverCrisis += 1;
  }
  const avgRound = mc.rounds.length
    ? (mc.rounds.reduce((a, b) => a + b, 0) / mc.rounds.length).toFixed(1)
    : '—';
  const medRound = mc.rounds.length
    ? mc.rounds.slice().sort((a, b) => a - b)[Math.floor(mc.rounds.length / 2)]
    : '—';
  console.log(`${label}`);
  console.log(`  Demitidos: ${mc.sacked}/${n} (${((mc.sacked / n) * 100).toFixed(1)}%)`);
  console.log(`  Só aviso: ${mc.warnOnly}/${n} | Sem crise: ${mc.neverCrisis}/${n}`);
  console.log(`  Rodada demissão — média ${avgRound} | mediana ${medRound}`);
  return mc;
};

const mcPure = runMc('A) Crise pura (só L + queima forte) ×200', 200, i => ({
  results: Array(22).fill('L'),
  startBudgetRatio: 0.4,
  budgetBurnPerRound: initialBudget('A') * 0.1,
  startBoard: 60,
  startFinances: 65,
}));
const mcMixed = runMc('B) Campanha mista estressada ×300', 300, n => {
  const burn = initialBudget('A') * (0.06 + (n % 5) * 0.02);
  const ratio = 0.35 + (n % 7) * 0.04;
  const pattern = Array.from({ length: 24 }, (_, i) => {
    const r = (n * 17 + i * 13) % 10;
    if (r < 6) return 'L';
    if (r < 8) return 'D';
    return 'W';
  });
  return {
    results: pattern,
    startBudgetRatio: ratio,
    budgetBurnPerRound: burn,
    startBoard: 58 + (n % 5),
    startFinances: 65,
  };
});
const mcHealthy = runMc('C) Campanha saudável ×100', 100, () => ({
  results: Array(20).fill('W').map((r, i) => (i % 5 === 4 ? 'D' : 'W')),
  startBudgetRatio: 1.0,
  budgetBurnPerRound: 0,
  startBoard: 62,
  startFinances: 70,
}));

if (mcPure.sacked >= 180) ok(`crise pura demite bastante (${mcPure.sacked}/200)`);
else fail('crise pura demite bastante', `${mcPure.sacked}/200`);
if (mcMixed.sacked >= 40 && mcMixed.sacked <= 200) ok(`misto estressado taxa plausível (${mcMixed.sacked}/300)`);
else fail('misto estressado taxa plausível', `${mcMixed.sacked}/300`);
if (mcHealthy.sacked === 0) ok('saudável: zero demissões');
else fail('saudável: zero demissões', `${mcHealthy.sacked} demitidos`);
const allRounds = [...mcPure.rounds, ...mcMixed.rounds, ...mcHealthy.rounds];
if (allRounds.every(r => r >= MANAGER_JOB_HONEYMOON_ROUNDS)) ok('nenhuma demissão na lua de mel');
else fail('nenhuma demissão na lua de mel', 'houve sack antes da rodada 6');

console.log('\n=== 4) Propostas + sack/hire ===\n');

const eng = createManagerRankingEngine({ getSeed: () => 99 });
const clubNames = Array.from({ length: 40 }, (_, i) => `Clube ${i + 1}`);
const divisions = Object.fromEntries(clubNames.map((n, i) => [n, ['A', 'B', 'C', 'D'][i % 4]]));
eng.ensurePool({
  clubNames,
  clubDivisions: divisions,
  userClub: 'Clube 1',
  userManagerName: 'Técnico Humano',
  userDivision: 'A',
});
const clubs = Object.fromEntries(
  clubNames.map((name, i) => [
    name,
    {
      name,
      division: divisions[name],
      board: 30 + (i % 40),
      finances: 28 + ((i * 3) % 45),
      managerName: eng.byClub(name)?.name,
      roster: Array.from({ length: 11 }, () => ({ overall: 60 + (i % 20) })),
    },
  ]),
);
const offers = generateJobOffers({
  clubs,
  userClub: 'Clube 1',
  userDivision: 'A',
  managerRanking: eng,
  seed: 123,
  count: 3,
});
console.log(`Propostas (${offers.length}): ${offers.map(o => `${o.club} (Série ${o.division}, ${o.note})`).join(' | ')}`);
if (offers.length >= 2 && offers.length <= 4) ok(`qtd propostas ${offers.length}`);
else fail('qtd propostas', String(offers.length));
if (offers.every(o => o.club !== 'Clube 1')) ok('proposta nunca é o próprio clube');
else fail('proposta nunca é o próprio clube', 'incluiu userClub');
if (offers.every(o => o.division === 'A' || o.division === 'B')) ok('propostas A/B para técnico da A');
else fail('propostas A/B para técnico da A', offers.map(o => o.division).join(','));

const userMgr = eng.byClub('Clube 1');
eng.sack('Clube 1');
const freeOk = !eng.byClub('Clube 1') && userMgr.status === 'free';
if (freeOk) ok('sack libera técnico');
else fail('sack libera técnico', 'ainda empregado');
const target = offers[0].club;
eng.hireFreeAgentForClub('Clube 1', 'A');
eng.hire(target, userMgr.id);
if (eng.byClub(target)?.id === userMgr.id && eng.byClub('Clube 1')?.id !== userMgr.id) {
  ok(`hire move técnico → ${target}`);
} else fail('hire move técnico', 'estado inconsistente');

console.log('\n=== 5) Varredura limiar (board×finanças) pós-mel ===\n');
const grid = { ok: 0, warn_board: 0, warn_finances: 0, sacked: 0, critical: 0 };
for (let b = STATUS_MIN; b <= 50; b++) {
  for (let f = STATUS_MIN; f <= 50; f++) {
    const st = resolveBoardJobRisk({ board: b, finances: f, played: 10 }).status;
    grid[st] = (grid[st] || 0) + 1;
  }
}
console.log(grid);
const sackCells = (MANAGER_JOB_CRISIS_THRESHOLD - STATUS_MIN) ** 2;
if (grid.sacked === sackCells) ok(`células de demissão = ${sackCells} (28–34 × 28–34)`);
else fail('células de demissão', `esperado ${sackCells}, got ${grid.sacked}`);

console.log(`\n=== RESULTADO: ${passed} ok, ${failed} falhas ===\n`);
process.exit(failed ? 1 : 0);
