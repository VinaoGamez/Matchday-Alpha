/**
 * Verifica se Ambiente / Apoio / Diretoria / Finanças reagem ao desempenho.
 * Uso: node scripts/club-status-performance-sim.mjs
 */
import {
  matchDelta as envMatch,
  tableDelta as envTable,
  driftDelta as envDrift,
} from '../js/engine/club-status/rules/environment.js';
import {
  matchDelta as supportMatch,
  tableDelta as supportTable,
  driftDelta as supportDrift,
} from '../js/engine/club-status/rules/support.js';
import {
  matchDelta as boardMatch,
  tableDelta as boardTable,
  driftDelta as boardDrift,
  financePressureDelta as boardFinancePressure,
  financeGapCeilingDelta as boardGapCeiling,
} from '../js/engine/club-status/rules/board.js';
import { syncFromBudget } from '../js/engine/club-status/rules/finances.js';
import { STATUS_MIN, STATUS_MAX } from '../js/engine/club-status/constants.js';
import {
  initialBudget,
  estimateRoundCostBill,
  chargeRoundCosts,
} from '../js/engine/economy.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const clampStatus = v => clamp(Math.round(Number(v) || 0), STATUS_MIN, STATUS_MAX);

let passed = 0;
let failed = 0;
const ok = name => {
  passed += 1;
  console.log(`  OK    ${name}`);
};
const fail = (name, detail) => {
  failed += 1;
  console.log(`  FAIL  ${name} — ${detail}`);
};

const makeRoster = (count, overall, age = 26) =>
  Array.from({ length: count }, (_, i) => ({
    name: `P${i + 1}`,
    overall,
    age: age + (i % 5) - 2,
    pos: 'MC',
  }));

const makeClub = ({
  division = 'A',
  overall = 75,
  budgetRatio = 1,
  environment = 62,
  support = 60,
  board = 62,
  finances = 70,
} = {}) => ({
  name: 'Sim FC',
  division,
  roster: makeRoster(22, overall),
  budget: Math.round(initialBudget(division) * budgetRatio),
  budgetLedger: [],
  environment,
  support,
  board,
  finances,
  wageShortfall: false,
  managerReputation: 70,
});

const positionFromForm = (points, played) => {
  const ppg = points / Math.max(1, played);
  // 20 clubes: ~2.0 PPG → topo; ~0.5 → Z4
  return clamp(Math.round(21 - ppg * 9), 1, 20);
};

/**
 * Simula N rodadas nacionais com resultados fixos.
 * Aplica as mesmas regras do motor (match + tabela + drift + sync finanças + custos).
 */
const simulate = ({ label, results, clubFactory, gateIncome = 0 }) => {
  const club = clubFactory();
  const start = {
    environment: club.environment,
    support: club.support,
    board: club.board,
    finances: Math.round(club.finances),
    budget: club.budget,
  };
  let points = 0;
  let played = 0;
  const trail = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    played += 1;
    if (result === 'W') points += 3;
    else if (result === 'D') points += 1;

    const isHome = i % 2 === 0;
    const goalDiff = result === 'W' ? 2 : result === 'L' ? -2 : 0;
    const fillRate = isHome ? 0.78 : null;
    const position = positionFromForm(points, played);
    const standing = {
      position,
      clubsCount: 20,
      points,
      played,
      clamp,
      finances: club.finances,
    };
    const ctx = {
      result,
      isHome,
      goalDiff,
      fillRate,
      positionGap: 0,
      clamp,
      finances: club.finances,
    };

    club.environment = clampStatus(
      club.environment + envMatch(ctx) + envTable(standing) + envDrift(club.environment),
    );
    club.support = clampStatus(
      club.support + supportMatch(ctx) + supportTable(standing) + supportDrift(club.support),
    );
    club.board = clampStatus(
      club.board + boardMatch(ctx) + boardTable(standing) + boardDrift(club.board),
    );

    if (gateIncome > 0 && isHome) club.budget += gateIncome;
    chargeRoundCosts(club, {
      division: club.division,
      round: played,
      managerReputation: 70,
      managerId: 'sim-mgr',
      preferredDivision: club.division,
      titlePoints: 0,
    });
    const wageBill = estimateRoundCostBill(club, club.division, { managerReputation: 70 });
    syncFromBudget(club, {
      balance: club.budget,
      baseline: initialBudget(club.division),
      wageBill,
      shortfall: !!club.wageShortfall,
      clamp,
      clampStatus,
    });
    const runwayRounds = wageBill > 0 ? club.budget / wageBill : 99;
    club.board = clampStatus(
      club.board +
        boardFinancePressure({
          finances: club.finances,
          runwayRounds,
          shortfall: !!club.wageShortfall,
          clamp,
        }) +
        boardGapCeiling({
          board: club.board,
          finances: club.finances,
          clamp,
        }),
    );

    if (played === 1 || played === 10 || played === results.length || played % 5 === 0) {
      trail.push({
        r: played,
        result,
        pos: position,
        env: club.environment,
        support: club.support,
        board: club.board,
        fin: Math.round(club.finances),
      });
    }
  }

  return {
    label,
    start,
    end: {
      environment: club.environment,
      support: club.support,
      board: club.board,
      finances: Math.round(club.finances),
      budget: club.budget,
      position: positionFromForm(points, played),
      points,
      played,
    },
    delta: {
      environment: club.environment - start.environment,
      support: club.support - start.support,
      board: club.board - start.board,
      finances: Math.round(club.finances) - start.finances,
    },
    trail,
  };
};

const printScenario = s => {
  console.log(`\n• ${s.label}`);
  console.log(
    `  início  env=${s.start.environment} apoio=${s.start.support} dir=${s.start.board} fin=${s.start.finances}`,
  );
  console.log(
    `  fim     env=${s.end.environment} apoio=${s.end.support} dir=${s.end.board} fin=${s.end.finances} | pos=${s.end.position} pts=${s.end.points}`,
  );
  console.log(
    `  Δ       env=${s.delta.environment >= 0 ? '+' : ''}${s.delta.environment} apoio=${s.delta.support >= 0 ? '+' : ''}${s.delta.support} dir=${s.delta.board >= 0 ? '+' : ''}${s.delta.board} fin=${s.delta.finances >= 0 ? '+' : ''}${s.delta.finances}`,
  );
  for (const t of s.trail) {
    console.log(
      `    r${String(t.r).padStart(2)} ${t.result} pos=${String(t.pos).padStart(2)} | env=${t.env} apoio=${t.support} dir=${t.board} fin=${t.fin}`,
    );
  }
};

console.log('\n=== Simulação: status institucional × desempenho ===\n');

const wins = Array(20).fill('W');
const losses = Array(20).fill('L');
const mixed = Array.from({ length: 20 }, (_, i) => (i % 3 === 0 ? 'L' : i % 3 === 1 ? 'D' : 'W'));

const factory = () =>
  makeClub({
    environment: 62,
    support: 60,
    board: 62,
    finances: 70,
    budgetRatio: 1,
    overall: 76,
  });

const good = simulate({
  label: 'Campanha boa (20 vitórias)',
  results: wins,
  clubFactory: factory,
  gateIncome: 160_000,
});
const bad = simulate({
  label: 'Campanha ruim (20 derrotas)',
  results: losses,
  clubFactory: factory,
  gateIncome: 40_000,
});
const mid = simulate({
  label: 'Campanha mista (W/D/L ciclico)',
  results: mixed,
  clubFactory: factory,
  gateIncome: 100_000,
});

[good, bad, mid].forEach(printScenario);

console.log('\n=== Asserções ===\n');

if (good.delta.environment > 0 && good.delta.support > 0 && good.delta.board > 0) {
  ok('vitórias sobem Ambiente, Apoio e Diretoria');
} else {
  fail(
    'vitórias sobem Ambiente, Apoio e Diretoria',
    `Δ env=${good.delta.environment} apoio=${good.delta.support} dir=${good.delta.board}`,
  );
}

if (bad.delta.environment < 0 && bad.delta.support < 0 && bad.delta.board < 0) {
  ok('derrotas baixam Ambiente, Apoio e Diretoria');
} else {
  fail(
    'derrotas baixam Ambiente, Apoio e Diretoria',
    `Δ env=${bad.delta.environment} apoio=${bad.delta.support} dir=${bad.delta.board}`,
  );
}

if (
  good.end.environment > bad.end.environment &&
  good.end.support > bad.end.support &&
  good.end.board > bad.end.board
) {
  ok('fim: campanha boa > campanha ruim nos 3 meters de campo');
} else {
  fail(
    'fim: campanha boa > campanha ruim nos 3 meters de campo',
    `good=${good.end.environment}/${good.end.support}/${good.end.board} bad=${bad.end.environment}/${bad.end.support}/${bad.end.board}`,
  );
}

if (good.end.environment - bad.end.environment >= 15) {
  ok(`spread Ambiente boa vs ruim ≥ 15 (${good.end.environment - bad.end.environment})`);
} else {
  fail('spread Ambiente boa vs ruim ≥ 15', String(good.end.environment - bad.end.environment));
}

if (good.end.board - bad.end.board >= 12) {
  ok(`spread Diretoria boa vs ruim ≥ 12 (${good.end.board - bad.end.board})`);
} else {
  fail('spread Diretoria boa vs ruim ≥ 12', String(good.end.board - bad.end.board));
}

// Finanças: bilheteria maior + menos shortfall na campanha boa deve ajudar
if (good.end.finances >= bad.end.finances) {
  ok(`Finanças: boa (≥) ruim (${good.end.finances} vs ${bad.end.finances})`);
} else {
  fail('Finanças: boa (≥) ruim', `${good.end.finances} vs ${bad.end.finances}`);
}

// Mista fica entre os extremos em pelo menos 2 meters de campo
const midBetween = ['environment', 'support', 'board'].filter(
  key => bad.end[key] <= mid.end[key] && mid.end[key] <= good.end[key],
).length;
if (midBetween >= 2) ok(`campanha mista fica entre extremos (${midBetween}/3 meters)`);
else fail('campanha mista fica entre extremos', String(midBetween));

console.log('\n=== Pressão financeira → Diretoria ===\n');

const brokeMedian = simulate({
  label: 'Desempenho mediano + caixa quase zerado',
  results: mixed,
  clubFactory: () =>
    makeClub({
      environment: 62,
      support: 60,
      board: 87,
      finances: 70,
      budgetRatio: 0.08,
      overall: 76,
    }),
  gateIncome: 20_000,
});
printScenario(brokeMedian);

if (brokeMedian.delta.board <= -12) {
  ok(`caixa baixo derruba Diretoria mesmo com campanha mista (Δ=${brokeMedian.delta.board})`);
} else {
  fail(
    'caixa baixo derruba Diretoria mesmo com campanha mista',
    `Δ board=${brokeMedian.delta.board} fim=${brokeMedian.end.board}`,
  );
}

const midFromHighBoard = simulate({
  label: 'Campanha mista + caixa saudável (board 87)',
  results: mixed,
  clubFactory: () =>
    makeClub({
      environment: 62,
      support: 60,
      board: 87,
      finances: 70,
      budgetRatio: 1,
      overall: 76,
    }),
  gateIncome: 100_000,
});
if (brokeMedian.end.board < midFromHighBoard.end.board - 8) {
  ok(
    `mesmo board inicial: caixa crítico acaba bem abaixo do saudável (${brokeMedian.end.board} vs ${midFromHighBoard.end.board})`,
  );
} else {
  fail(
    'mesmo board inicial: caixa crítico acaba bem abaixo do saudável',
    `${brokeMedian.end.board} vs ${midFromHighBoard.end.board}`,
  );
}

const healthyPressure = boardFinancePressure({ finances: 70, runwayRounds: 12, shortfall: false, clamp });
const crisisPressure = boardFinancePressure({ finances: 38, runwayRounds: 1.2, shortfall: true, clamp });
const midPressure = boardFinancePressure({ finances: 59, runwayRounds: 3.5, shortfall: false, clamp });
console.log(`pressão pontual: saudável=${healthyPressure} fin59=${midPressure} crise=${crisisPressure}`);
if (healthyPressure === 0 && midPressure < 0 && crisisPressure <= -0.8) ok('pressão ativa desde finanças < 55');
else fail('pressão ativa desde finanças < 55', `${healthyPressure}/${midPressure}/${crisisPressure}`);

const winHealthy = boardMatch({ result: 'W', isHome: true, goalDiff: 1, clamp, finances: 75 });
const winBroke = boardMatch({ result: 'W', isHome: true, goalDiff: 1, clamp, finances: 50 });
console.log(`vitória: fin75=${winHealthy.toFixed(2)} fin50=${winBroke.toFixed(2)}`);
if (winBroke < winHealthy * 0.6) ok('vitória rende menos com finanças < 60');
else fail('vitória rende menos com finanças < 60', `${winBroke} vs ${winHealthy}`);

const gapPull = boardGapCeiling({ board: 90, finances: 59, clamp });
console.log(`teto relativo 90 vs 59 → ${gapPull}`);
if (gapPull <= -0.4) ok('teto relativo puxa Diretoria alta com finanças medianas');
else fail('teto relativo puxa Diretoria alta com finanças medianas', String(gapPull));

const threeWinsBroke = simulate({
  label: '3 vitórias com finanças ~59 e board alto (caso do tester)',
  results: ['W', 'W', 'W'],
  clubFactory: () =>
    makeClub({
      environment: 61,
      support: 77,
      board: 84,
      finances: 59,
      budgetRatio: 0.12,
      overall: 80,
    }),
  gateIncome: 30_000,
});
printScenario(threeWinsBroke);
if (threeWinsBroke.delta.board <= 2) {
  ok(`3 vitórias com caixa apertado não disparam a Diretoria (Δ=${threeWinsBroke.delta.board})`);
} else {
  fail(
    '3 vitórias com caixa apertado não disparam a Diretoria',
    `Δ=${threeWinsBroke.delta.board} fim=${threeWinsBroke.end.board}`,
  );
}

console.log(`\n=== RESULTADO: ${passed} ok, ${failed} falhas ===\n`);
process.exit(failed ? 1 : 0);
