/**
 * Validação da projeção ao vivo da meta (pontos corridos + Série D acesso).
 * Uso: node scripts/season-goal-live-tests.mjs
 */
import assert from 'node:assert/strict';
import {
  SEASON_GOAL_CATALOG,
  positionGoalMath,
  seasonGoalLiveProgress,
} from '../js/engine/season-goals.js';

let passed = 0;
const results = [];

function caseName(name) {
  return name;
}

function check(name, fn) {
  try {
    fn();
    passed += 1;
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    throw error;
  }
}

const top8 = SEASON_GOAL_CATALOG.A_top8;
const mid = SEASON_GOAL_CATALOG.A_mid;
const access = SEASON_GOAL_CATALOG.D_access;

function table(rows, seasonRounds = 38) {
  return {
    seasonRounds,
    standings: rows.map(row => ({
      club: row.club,
      points: row.points,
      played: row.played ?? seasonRounds - (row.remaining ?? 0),
      wins: row.wins ?? 0,
      goalDiff: row.goalDiff ?? 0,
    })),
  };
}

// 1) Meta top 8: faltam 2 jogos, pontos já travam o G8 mesmo perdendo tudo.
check(caseName('top8 locked with 2 games left → 100% Cumpriu'), () => {
  const ctx = {
    club: 'User',
    position: 6,
    ...table([
      { club: 'A', points: 70, remaining: 2 },
      { club: 'B', points: 68, remaining: 2 },
      { club: 'C', points: 65, remaining: 2 },
      { club: 'D', points: 62, remaining: 2 },
      { club: 'E', points: 60, remaining: 2 },
      { club: 'User', points: 58, remaining: 2 }, // min 58
      { club: 'G', points: 50, remaining: 2 }, // max 56 < 58
      { club: 'H', points: 49, remaining: 2 },
      { club: 'I', points: 48, remaining: 2 },
      { club: 'J', points: 40, remaining: 2 },
    ]),
  };
  // No máximo 5 clubes à frente (A–E); G–J não alcançam 58 → guaranteed.
  const math = positionGoalMath(top8, ctx);
  assert.equal(math.guaranteed, true);
  assert.equal(math.impossible, false);
  const live = seasonGoalLiveProgress(top8, ctx);
  assert.equal(live.score, 100);
  assert.equal(live.short, 'Cumpriu');
  assert.match(live.hint, /garantida/i);
});

// 2) Ainda não garantido: 8º com 2 jogos, 9º pode alcançá-lo.
check(caseName('top8 still open — rival below can overtake → <100%'), () => {
  const ctx = {
    club: 'User',
    position: 8,
    ...table([
      { club: 'A', points: 70, remaining: 2 },
      { club: 'B', points: 68, remaining: 2 },
      { club: 'C', points: 66, remaining: 2 },
      { club: 'D', points: 64, remaining: 2 },
      { club: 'E', points: 62, remaining: 2 },
      { club: 'F', points: 60, remaining: 2 },
      { club: 'G', points: 58, remaining: 2 },
      { club: 'User', points: 55, remaining: 2 }, // min 55
      { club: 'I', points: 54, remaining: 2 }, // max 60 >= 55 → pode passar
      { club: 'J', points: 30, remaining: 2 },
    ]),
  };
  const math = positionGoalMath(top8, ctx);
  assert.equal(math.guaranteed, false);
  const live = seasonGoalLiveProgress(top8, ctx);
  assert.ok(live.score < 100);
});

// 3) Matematicamente eliminado do G8.
check(caseName('top8 impossible — 8 teams already unreachable → missed'), () => {
  const ctx = {
    club: 'User',
    position: 12,
    ...table([
      { club: 'A', points: 80, remaining: 2 },
      { club: 'B', points: 78, remaining: 2 },
      { club: 'C', points: 76, remaining: 2 },
      { club: 'D', points: 74, remaining: 2 },
      { club: 'E', points: 72, remaining: 2 },
      { club: 'F', points: 70, remaining: 2 },
      { club: 'G', points: 68, remaining: 2 },
      { club: 'H', points: 66, remaining: 2 }, // 8 clubes com min > user max
      { club: 'User', points: 50, remaining: 2 }, // max 56
      { club: 'J', points: 40, remaining: 2 },
    ]),
  };
  const math = positionGoalMath(top8, ctx);
  assert.equal(math.impossible, true);
  assert.equal(math.guaranteed, false);
  const live = seasonGoalLiveProgress(top8, ctx);
  assert.ok(live.score < 40);
  assert.equal(live.status, 'missed');
  assert.match(live.hint, /fora da meta/i);
});

// 4) Temporada encerrada na meta.
check(caseName('season finished inside target → 100%'), () => {
  const ctx = {
    club: 'User',
    position: 8,
    ...table(
      [
        { club: 'A', points: 70, played: 38 },
        { club: 'User', points: 55, played: 38 },
        { club: 'Z', points: 40, played: 38 },
      ],
      38,
    ),
  };
  // Completar tabela com posições fictícias: position já diz 8º.
  const live = seasonGoalLiveProgress(top8, { ...ctx, position: 8 });
  assert.equal(live.score, 100);
  assert.equal(positionGoalMath(top8, { ...ctx, position: 8 }).guaranteed, true);
});

// 5) Temporada encerrada fora da meta.
check(caseName('season finished outside target → not guaranteed'), () => {
  const ctx = {
    club: 'User',
    position: 11,
    ...table([{ club: 'User', points: 40, played: 38 }], 38),
  };
  const math = positionGoalMath(top8, ctx);
  assert.equal(math.guaranteed, false);
  assert.equal(math.impossible, true);
});

// 6) Meta meio de tabela (14º): garantia com folga.
check(caseName('A_mid (14º) locked near end → 100%'), () => {
  const rows = [];
  for (let i = 1; i <= 13; i += 1) rows.push({ club: `T${i}`, points: 40 + i, remaining: 1 });
  rows.push({ club: 'User', points: 38, remaining: 1 }); // min 38
  for (let i = 15; i <= 20; i += 1) rows.push({ club: `T${i}`, points: 30, remaining: 1 }); // max 33
  const ctx = { club: 'User', position: 14, ...table(rows) };
  const math = positionGoalMath(mid, ctx);
  assert.equal(math.guaranteed, true);
  assert.equal(seasonGoalLiveProgress(mid, ctx).score, 100);
});

// 7) Empate possível no piso: conservador — NÃO garante.
check(caseName('tie on points possible → not guaranteed (conservative)'), () => {
  const ctx = {
    club: 'User',
    position: 8,
    ...table([
      { club: 'A', points: 60, remaining: 0 },
      { club: 'B', points: 58, remaining: 0 },
      { club: 'C', points: 56, remaining: 0 },
      { club: 'D', points: 54, remaining: 0 },
      { club: 'E', points: 52, remaining: 0 },
      { club: 'F', points: 50, remaining: 0 },
      { club: 'G', points: 48, remaining: 0 },
      { club: 'User', points: 45, remaining: 1 }, // min 45
      { club: 'I', points: 42, remaining: 1 }, // max 45 → empate possível
      { club: 'J', points: 20, remaining: 1 },
    ]),
  };
  // 7 à frente travados + I pode empatar → canFinishAhead >= 8 → não garante.
  assert.equal(positionGoalMath(top8, ctx).guaranteed, false);
});

// 8) Série D: semi = acesso 100%.
check(caseName('D access in semi → 100% Cumpriu'), () => {
  const live = seasonGoalLiveProgress(access, {
    club: 'User',
    serieDPhase: 'semi',
    promoted: true,
  });
  assert.equal(live.score, 100);
  assert.equal(live.short, 'Cumpriu');
});

// 9) Série D: playoff sem promoted < 100%.
check(caseName('D access in playoff without promote → <100%'), () => {
  const live = seasonGoalLiveProgress(access, {
    club: 'User',
    serieDPhase: 'playoff',
    promoted: false,
  });
  assert.ok(live.score < 100);
  assert.notEqual(live.short, 'Cumpriu');
});

// 10) Série D: phase semi sem flag promoted ainda assim 100% (fase garante).
check(caseName('D access phase=semi even if promoted flag false → 100%'), () => {
  const live = seasonGoalLiveProgress(access, {
    club: 'User',
    serieDPhase: 'semi',
    promoted: false,
  });
  assert.equal(live.score, 100);
});

// 11) Excedeu banda (top 4 de meta top8) + garantido → Acima.
check(caseName('guaranteed and in exceeded band → Acima'), () => {
  const rows = [
    { club: 'User', points: 75, remaining: 1 },
    { club: 'B', points: 50, remaining: 1 },
    { club: 'C', points: 40, remaining: 1 },
  ];
  for (let i = 0; i < 10; i += 1) rows.push({ club: `X${i}`, points: 20, remaining: 1 });
  const ctx = { club: 'User', position: 1, ...table(rows) };
  const live = seasonGoalLiveProgress(top8, ctx);
  assert.equal(live.score, 100);
  assert.equal(live.status, 'exceeded');
  assert.equal(live.short, 'Acima');
});

console.log('\nseason-goal-live tests\n');
for (const row of results) {
  console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.name}${row.error ? ` — ${row.error}` : ''}`);
}
console.log(`\n${passed}/${results.length} passed`);
if (passed !== results.length) process.exit(1);
