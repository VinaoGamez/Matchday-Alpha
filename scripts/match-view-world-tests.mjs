/**
 * Testes do WorldPitch (visão superior / contrato estilo Soccer Simulation 2D).
 *
 * Estes testes definem a barra de qualidade NOVA:
 * - verdade em metros (não em UV de perspectiva)
 * - separação física obrigatória
 * - forma IP ≠ OOP
 * - espelho UV é só projeção
 *
 * Uso: npm run test:world-pitch
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const mv = path.join(root, "assets", "match-view");

function loadSandbox() {
  const sandbox = { window: {}, globalThis: {}, console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(mv, "field-geometry.js"), "utf8"), sandbox, {
    filename: "field-geometry.js",
  });
  vm.runInNewContext(fs.readFileSync(path.join(mv, "world-pitch.js"), "utf8"), sandbox, {
    filename: "world-pitch.js",
  });
  return sandbox;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function main() {
  const sandbox = loadSandbox();
  const W = sandbox.MatchViewWorldPitch;
  const G = sandbox.MatchViewGeometry;
  assert(W && G, "módulos não carregaram");
  let passed = 0;

  // --- projeção linear (sem depender do estádio) ---
  {
    const c = W.worldToUVLinear(0, 0);
    assert(Math.abs(c.u - 0.5) < 1e-9 && Math.abs(c.v - 0.5) < 1e-9, "linear centro ≠ 0.5");
    passed += 1;
    console.log("ok  projection-linear");
  }

  // --- projeção do ESTÁDIO: centro óptico = BALL_KICKOFF (não 0.5,0.5) ---
  {
    const kick = G.BALL_KICKOFF;
    const c = W.worldToUV(0, 0);
    assert(Math.abs(c.u - kick.u) < 1e-6, `centro u=${c.u} ≠ kickoff ${kick.u}`);
    assert(Math.abs(c.v - kick.v) < 1e-6, `centro v=${c.v} ≠ kickoff ${kick.v}`);
    const back = W.uvToWorld(kick.u, kick.v);
    assert(Math.abs(back.x) < 0.05 && Math.abs(back.y) < 0.05, "inverso kickoff falhou");
    // laterais: Y+ deve ir para o lado near (v alto) — mais faixa UV que o far
    const near = W.worldToUV(0, W.FIELD.halfW);
    const far = W.worldToUV(0, -W.FIELD.halfW);
    assert(near.v > 0.95 && far.v < 0.05, "touchlines Y→v invertidas/erradas");
    assert(kick.v < 0.45, "calibração esperada: centro óptico no terço far-ish");
    passed += 1;
    console.log(`ok  stadium-calib center=(${c.u.toFixed(3)},${c.v.toFixed(3)})`);
  }

  // --- separação em px do trapézio (mapToField) ---
  {
    const world = W.createWorld({ seed: 1 });
    world.ball = { x: 12, y: 10, vx: 0, vy: 0 };
    W.setShapeBoth(world, "home", 1);
    W.settle(world, 12, 3.2, { stadiumScreen: true });
    let minPx = Infinity;
    for (let i = 0; i < world.players.length; i++) {
      for (let j = i + 1; j < world.players.length; j++) {
        const a = W.worldToUV(world.players[i].x, world.players[i].y);
        const b = W.worldToUV(world.players[j].x, world.players[j].y);
        const sa = G.mapToField(a.u, a.v);
        const sb = G.mapToField(b.u, b.v);
        minPx = Math.min(minPx, Math.hypot(sa.x - sb.x, sa.y - sb.y));
      }
    }
    assert(minPx > 18, `separação em tela fraca (${minPx.toFixed(1)}px)`);
    passed += 1;
    console.log(`ok  stadium-screen-sep minPx=${minPx.toFixed(1)}`);
  }

  // --- kickoff: 22 jogadores, formação espelhada, sem colisão ---
  {
    const world = W.createWorld({ seed: 1 });
    assert(world.players.length === 22, "precisa 22 jogadores");
    W.resolveCollisions(world);
    const sep = W.minSeparation(world);
    assert(sep >= W.MIN_CENTER_DIST - 0.05, `kickoff empilhado sep=${sep.toFixed(2)}m`);
    const hx = W.avgRoleX(world, "home", "FW");
    const ax = W.avgRoleX(world, "away", "FW");
    assert(hx < 5 && ax > -5, "FWs deveriam estar perto do meio no kickoff");
    assert(Math.abs(hx + ax) < 0.5, "formações não espelhadas em X");
    passed += 1;
    console.log(`ok  kickoff-formation sep=${sep.toFixed(2)}m`);
  }

  // --- IP: FW à frente de DF; laterais mais altos que CBs ---
  {
    const world = W.createWorld({ seed: 2 });
    world.ball = { x: 10, y: 5, vx: 0, vy: 0 };
    W.setShapeIP(world, "home", 1);
    W.settle(world, 14);
    const dfX = W.avgRoleX(world, "home", "DF");
    const fwX = W.avgRoleX(world, "home", "FW");
    assert(fwX > dfX + 4, `IP: FW não à frente (fw=${fwX.toFixed(1)} df=${dfX.toFixed(1)})`);
    const dfs = W.byRole(W.playersOf(world, "home"), "DF").sort((a, b) => a.y - b.y);
    const fb = [dfs[0], dfs[dfs.length - 1]];
    const cb = dfs.slice(1, -1);
    const fbX = fb.reduce((s, p) => s + p.x, 0) / fb.length;
    const cbX = cb.reduce((s, p) => s + p.x, 0) / cb.length;
    assert(fbX > cbX - 0.5, `IP: laterais deveriam subir (fb=${fbX.toFixed(1)} cb=${cbX.toFixed(1)})`);
    const sep = W.minSeparation(world);
    assert(sep >= W.MIN_OPP_DIST - 0.15, `IP colisão sep=${sep.toFixed(2)}`);
    passed += 1;
    console.log(`ok  shape-ip fw>df sep=${sep.toFixed(2)}m width=${W.teamWidth(world, "home").toFixed(1)}`);
  }

  // --- OOP mais estreito que IP ---
  {
    const wIp = W.createWorld({ seed: 3 });
    const wOop = W.createWorld({ seed: 3 });
    wIp.ball = wOop.ball = { x: 8, y: -6, vx: 0, vy: 0 };
    W.setShapeIP(wIp, "home", 1);
    W.settle(wIp, 14);
    W.setShapeOOP(wOop, "home", 1);
    W.settle(wOop, 14);
    const widthIp = W.teamWidth(wIp, "home");
    const widthOop = W.teamWidth(wOop, "home");
    assert(widthIp > widthOop + 4, `IP deveria ser mais largo (${widthIp.toFixed(1)} vs ${widthOop.toFixed(1)}m)`);
    passed += 1;
    console.log(`ok  ip-wider-oop ${widthIp.toFixed(1)}>${widthOop.toFixed(1)}m`);
  }

  // --- rest defense: CBs no próprio campo; ≥3 DF atrás da bola ---
  {
    const world = W.createWorld({ seed: 4 });
    world.ball = { x: 15, y: 0, vx: 0, vy: 0 };
    W.setShapeIP(world, "home", 1);
    W.settle(world, 14);
    const dfs = W.byRole(W.playersOf(world, "home"), "DF").sort((a, b) => a.y - b.y);
    const cbs = dfs.slice(1, -1);
    const behind = dfs.filter((p) => p.x < world.ball.x - 2).length;
    const cbsOwnHalf = cbs.filter((p) => p.x < 0).length;
    assert(behind >= 3, `rest defense atrás da bola ${behind}/4`);
    assert(cbsOwnHalf >= 2, `CBs deveriam ficar no próprio campo (${cbsOwnHalf})`);
    passed += 1;
    console.log(`ok  rest-defense behind=${behind} cbsOwn=${cbsOwnHalf}`);
  }

  // --- mescla: FW home perto de DF away (marcação), não dois blocos separados ---
  {
    const world = W.createWorld({ seed: 19 });
    world.ball = { x: 12, y: 4, vx: 0, vy: 0 };
    W.setShapeBoth(world, "home", 1);
    W.settle(world, 14);
    const fws = W.byRole(W.playersOf(world, "home"), "FW");
    const dfs = W.byRole(W.playersOf(world, "away"), "DF");
    let close = 0;
    let best = Infinity;
    for (const fw of fws) {
      for (const df of dfs) {
        const d = W.dist(fw, df);
        best = Math.min(best, d);
        if (d < 9) close += 1;
      }
    }
    assert(close >= 2, `sem mescla FW×DF (pares<9m: ${close}, best=${best.toFixed(1)})`);
    // FW home deve ter cruzado o meio
    const fwPastHalf = fws.filter((p) => p.x > 4).length;
    assert(fwPastHalf >= 2, `FW não entrou no campo adversário (${fwPastHalf})`);
    passed += 1;
    console.log(`ok  mescla-marking pairs=${close} best=${best.toFixed(1)}m fwAhead=${fwPastHalf}`);
  }

  // --- cover: DF away entre atacante e gol (+X) ---
  {
    const world = W.createWorld({ seed: 5 });
    world.ball = { x: 20, y: 8, vx: 0, vy: 0 };
    W.setShapeBoth(world, "home", 1);
    W.settle(world, 16);
    const homeFw = W.byRole(W.playersOf(world, "home"), "FW");
    const awayDf = W.byRole(W.playersOf(world, "away"), "DF");
    let cover = 0;
    for (const fw of homeFw) {
      const marker = awayDf.slice().sort((a, b) => W.dist(a, fw) - W.dist(b, fw))[0];
      // gol away em +52.5; marker.x >= fw.x - margem
      if (marker && marker.x >= fw.x - 3) cover += 1;
    }
    assert(cover >= 2, `cover shadow fraco ${cover}/${homeFw.length}`);
    const sep = W.minSeparation(world);
    assert(sep >= W.MIN_OPP_DIST - 0.2, `shapeBoth colisão sep=${sep.toFixed(2)}`);
    passed += 1;
    console.log(`ok  cover-and-sep cover=${cover} sep=${sep.toFixed(2)}m`);
  }

  // --- GK no ângulo (perto do eixo bola→gol) ---
  {
    const world = W.createWorld({ seed: 6 });
    world.ball = { x: 25, y: 18, vx: 0, vy: 0 };
    W.setShapeOOP(world, "away", 1);
    W.settle(world, 12);
    const gk = W.byRole(W.playersOf(world, "away"), "GK")[0];
    assert(Math.abs(gk.y) < Math.abs(world.ball.y), "GK deveria puxar ao centro vs bola");
    assert(Math.abs(gk.y - world.ball.y * 0.55) < 6, "GK longe do ângulo");
    passed += 1;
    console.log(`ok  gk-angle y=${gk.y.toFixed(1)} ballY=${world.ball.y}`);
  }

  // --- suporte: algum MF a < 12m da bola em IP ---
  {
    const world = W.createWorld({ seed: 7 });
    world.ball = { x: 5, y: 0, vx: 0, vy: 0 };
    W.setShapeIP(world, "home", 1);
    W.settle(world, 14);
    const mfs = W.byRole(W.playersOf(world, "home"), "MF");
    const nearest = Math.min(...mfs.map((p) => W.dist(p, world.ball)));
    assert(nearest < 12, `suporte longe (${nearest.toFixed(1)}m)`);
    passed += 1;
    console.log(`ok  support-distance ${nearest.toFixed(1)}m`);
  }

  // --- stress: bola em 12 pontos × 2 lados, min sep após settle ---
  {
    let worst = Infinity;
    let fails = 0;
    const points = [
      [0, 0],
      [20, 15],
      [20, -15],
      [-10, 10],
      [35, 5],
      [-30, -8],
      [10, 25],
      [-15, -22],
      [40, -12],
      [5, -28],
      [-40, 0],
      [28, 20],
    ];
    for (const [bx, by] of points) {
      for (const side of ["home", "away"]) {
        const world = W.createWorld({ seed: Math.round(bx * 3 + by) });
        world.ball = { x: bx, y: by, vx: 0, vy: 0 };
        W.setShapeBoth(world, side, 1);
        W.settle(world, 16);
        const sep = W.minSeparation(world);
        worst = Math.min(worst, sep);
        if (sep < W.MIN_OPP_DIST - 0.25) fails += 1;
      }
    }
    assert(fails === 0, `stress falhou ${fails}x worst=${worst.toFixed(2)}m`);
    passed += 1;
    console.log(`ok  stress-ball-points n=${points.length * 2} worst=${worst.toFixed(2)}m`);
  }

  // --- espelho UV: projeção preserva ordem lateral (y↑ ⇒ v↑) ---
  {
    const world = W.createWorld({ seed: 8 });
    world.ball = { x: 12, y: 0, vx: 0, vy: 0 };
    W.setShapeBoth(world, "home", 1);
    W.settle(world, 14);
    const snap = W.toUVSnapshot(world);
    const home = snap.players.filter((p) => p.team === "home" && p.role === "DF");
    const byY = home.slice().sort((a, b) => a.y - b.y);
    for (let i = 1; i < byY.length; i++) {
      assert(byY[i].v >= byY[i - 1].v - 1e-9, "projeção inverteu ordem Y→v");
    }
    // UV também não pode colapsar demais
    let uvMin = Infinity;
    for (let i = 0; i < snap.players.length; i++) {
      for (let j = i + 1; j < snap.players.length; j++) {
        const a = snap.players[i];
        const b = snap.players[j];
        uvMin = Math.min(uvMin, Math.hypot(a.u - b.u, a.v - b.v));
      }
    }
    // Marcação DF×FW + perfil Footure pode ficar ~0.018 em UV
    assert(uvMin > 0.015, `espelho UV ainda colapsa (${uvMin.toFixed(3)})`);
    passed += 1;
    console.log(`ok  mirror-uv order+sep uvMin=${uvMin.toFixed(3)}`);
  }

  // --- ciclos: após setShape, step não explode energia / fica no campo ---
  {
    const world = W.createWorld({ seed: 9 });
    world.ball = { x: -5, y: 12, vx: 0, vy: 0 };
    W.setShapeBoth(world, "away", 1);
    for (let i = 0; i < 30; i++) W.step(world, 2.5);
    for (const p of world.players) {
      assert(Math.abs(p.x) <= W.FIELD.halfL, `fora do campo x=${p.x}`);
      assert(Math.abs(p.y) <= W.FIELD.halfW, `fora do campo y=${p.y}`);
    }
    assert(W.minSeparation(world) >= W.MIN_OPP_DIST - 0.25, "sep degradou após 30 ciclos");
    passed += 1;
    console.log(`ok  cycle-stability c=${world.cycle} sep=${W.minSeparation(world).toFixed(2)}m`);
  }

  // --- GK sempre na pequena área (metros) após formas ---
  {
    for (const side of ["home", "away"]) {
      const world = W.createWorld({ seed: 42 });
      world.ball = { x: side === "home" ? 30 : -30, y: 20, vx: 0, vy: 0 };
      W.setShapeBoth(world, side === "home" ? "away" : "home", 1);
      W.settle(world, 14, 3.2, { stadiumScreen: true });
      const gk = W.byRole(W.playersOf(world, side), "GK")[0];
      const box = W.clampToSixYardWorld(gk.x, gk.y, side);
      assert(
        Math.abs(gk.x - box.x) < 0.05 && Math.abs(gk.y - box.y) < 0.05,
        `GK ${side} fora da pequena área (${gk.x.toFixed(1)},${gk.y.toFixed(1)})`
      );
    }
    passed += 1;
    console.log("ok  gk-six-yard-clamp");
  }

  // --- soft reset: mid-block com mescla (não kickoff separado) ---
  {
    const world = W.createWorld({ seed: 3 });
    world.ball = { x: 40, y: -20, vx: 0, vy: 0 };
    W.setShapeBoth(world, "home", 1);
    W.settle(world, 10);
    W.softResetFormation(world, 1);
    const after = W.minSeparation(world);
    assert(after >= W.MIN_OPP_DIST - 0.3, `softReset empilhou (${after.toFixed(2)})`);
    const gk = W.byRole(W.playersOf(world, "home"), "GK")[0];
    assert(gk.x < -45, "softReset deveria devolver GK ao gol");
    const fws = W.byRole(W.playersOf(world, "home"), "FW");
    const dfs = W.byRole(W.playersOf(world, "away"), "DF");
    let close = 0;
    for (const fw of fws) {
      for (const df of dfs) {
        if (W.dist(fw, df) < 10) close += 1;
      }
    }
    assert(close >= 2, `softReset sem mescla (pares FW×DF <10m: ${close})`);
    const homeCbs = W.byRole(W.playersOf(world, "home"), "DF")
      .slice()
      .sort((a, b) => a.y - b.y)
      .slice(1, -1);
    assert(homeCbs.every((p) => p.x < 2), "softReset: CBs deveriam ficar atrás no mid-block");
    passed += 1;
    console.log(`ok  soft-reset midblock sep=${after.toFixed(2)}m mescla=${close} gk.x=${gk.x.toFixed(1)}`);
  }

  // --- escanteio: cobrador no corner, GK def na área, sem bolo ---
  {
    const world = W.createWorld({ seed: 11 });
    W.setCornerShape(world, "home", "near");
    const sep = W.minSeparation(world);
    assert(sep >= W.MIN_OPP_DIST - 0.35, `corner empilhou (${sep.toFixed(2)})`);
    const defGk = W.byRole(W.playersOf(world, "away"), "GK")[0];
    assert(defGk.x > 45, `GK def longe do gol (${defGk.x.toFixed(1)})`);
    assert(Math.abs(world.ball.x - W.FIELD.halfL) < 2, "bola não está no corner");
    // atacantes perto da área adversária
    const fws = W.byRole(W.playersOf(world, "home"), "FW");
    const avgFw = fws.reduce((s, p) => s + p.tx, 0) / fws.length;
    assert(avgFw > 30, `FW longe da área no corner (${avgFw.toFixed(1)})`);
    passed += 1;
    console.log(`ok  corner-shape sep=${sep.toFixed(2)}m gk.x=${defGk.x.toFixed(1)}`);
  }

  // --- planShapeMoves: entidades mock → moves UV sem colapso ---
  {
    const slots = W.kickoffUVSlots();
    const entities = slots.home
      .concat(slots.away)
      .map((s, i) => ({
        id: `e-${i}`,
        kind: "player",
        team: i < 11 ? "home" : "away",
        role: s.role,
        u: s.u,
        v: s.v,
      }));
    const planned = W.planShapeMoves(entities, "home", 0.62, 0.45, 1, "both", {
      seed: 11,
      settleCycles: 14,
    });
    assert(planned.moves.length === 22, "planShapeMoves deveria mover 22");
    let uvMin = Infinity;
    for (let i = 0; i < planned.moves.length; i++) {
      for (let j = i + 1; j < planned.moves.length; j++) {
        const a = planned.moves[i];
        const b = planned.moves[j];
        uvMin = Math.min(uvMin, Math.hypot(a.u - b.u, a.v - b.v));
      }
    }
    assert(uvMin > 0.018, `planShapeMoves UV colapsou (${uvMin.toFixed(3)})`);
    assert(W.minSeparation(planned.world) >= W.MIN_OPP_DIST - 0.25, "world pós-plan colidiu");
    passed += 1;
    console.log(`ok  plan-shape-moves uvMin=${uvMin.toFixed(3)} worldSep=${W.minSeparation(planned.world).toFixed(2)}m`);
  }

  // --- FIFA shape contract (estudo TSG): report + stress de pontos ---
  {
    assert(W.FIFA && W.fifaShapeReport, "FIFA helpers não exportados");
    const points = [
      [0, 0],
      [12, 6],
      [-10, -8],
      [20, -4],
      [8, 14],
      [-15, 10],
    ];
    let fails = 0;
    const failMsgs = [];
    for (const [bx, by] of points) {
      for (const side of ["home", "away"]) {
        const world = W.createWorld({ seed: Math.round(bx * 5 + by + 3) });
        world.ball = { x: bx, y: by, vx: 0, vy: 0 };
        W.setShapeBoth(world, side, 1);
        W.settle(world, 14);
        const rep = W.fifaShapeReport(world, side);
        if (!rep.ok) {
          fails += 1;
          const bad = Object.entries(rep.checks)
            .filter(([, v]) => !v)
            .map(([k]) => k)
            .join(",");
          failMsgs.push(`${side}@(${bx},${by}): ${bad} m=${JSON.stringify(rep.metrics)}`);
        }
      }
    }
    assert(fails === 0, `FIFA shape falhou ${fails}x\n  ${failMsgs.slice(0, 4).join("\n  ")}`);
    passed += 1;
    console.log(`ok  fifa-shape-contract n=${points.length * 2}`);
  }

  // --- FIFA: construção no meio = mid-block defesa + rest defence ataque ---
  {
    const world = W.createWorld({ seed: 77 });
    world.ball = { x: 10, y: -3, vx: 0, vy: 0 };
    W.setShapeBoth(world, "home", 1);
    W.settle(world, 16);
    const rep = W.fifaShapeReport(world, "home");
    assert(rep.checks.restBehind, `restBehind ${rep.metrics.atkBehind}`);
    assert(rep.checks.mescla, `mescla pairs=${rep.metrics.mesclaPairs}`);
    assert(rep.checks.nearBall, `nearBall ${rep.metrics.near}`);
    assert(rep.checks.midBlockDepth, `defDepth ${rep.metrics.defDepth.toFixed(1)}`);
    assert(rep.checks.gkSixYard, "GK fora da pequena área");
    passed += 1;
    console.log(
      `ok  fifa-midblock behind=${rep.metrics.atkBehind} near=${rep.metrics.near} depth=${rep.metrics.defDepth.toFixed(1)} mescla=${rep.metrics.mesclaPairs}`
    );
  }

  // --- FIFA: entrada na área — mescla + GK + rest defence ainda existe ---
  {
    const world = W.createWorld({ seed: 88 });
    world.ball = { x: 32, y: 8, vx: 0, vy: 0 };
    W.setShapeBoth(world, "home", 1);
    W.settle(world, 16);
    const rep = W.fifaShapeReport(world, "home");
    assert(rep.checks.mescla, `área sem mescla (${rep.metrics.mesclaPairs})`);
    assert(rep.checks.gkSixYard, "GK fora na entrada na área");
    assert(rep.metrics.atkBehind >= 3, `rest defence fraca na área (${rep.metrics.atkBehind})`);
    assert(rep.metrics.near <= W.FIFA.NEAR_BALL_MAX + 2, `cluster área ${rep.metrics.near}`);
    passed += 1;
    console.log(
      `ok  fifa-box-entry behind=${rep.metrics.atkBehind} near=${rep.metrics.near} mescla=${rep.metrics.mesclaPairs}`
    );
  }

  // --- Funções (Wikipedia/PFSA/Footure): duty slots no 4-3-3 ---
  {
    assert(W.DUTY && W.byDuty, "DUTY helpers ausentes");
    const world = W.createWorld({ seed: 1 });
    const home = W.playersOf(world, "home");
    W.ensureDuties(home);
    const duties = new Set(home.map((p) => p.duty));
    for (const d of ["GK", "FB_L", "CB_L", "CB_R", "FB_R", "CM_L", "CDM", "CM_R", "W_L", "ST", "W_R"]) {
      assert(duties.has(d), `duty ${d} faltando no 4-3-3`);
    }
    world.ball = { x: 14, y: -6, vx: 0, vy: 0 };
    W.setShapeIP(world, "home", 1);
    W.settle(world, 12);
    const fbL = W.byDuty(home, W.DUTY.FB_L)[0];
    const cbL = W.byDuty(home, W.DUTY.CB_L)[0];
    const cdm = W.byDuty(home, W.DUTY.CDM)[0];
    const wL = W.byDuty(home, W.DUTY.W_L)[0];
    const st = W.byDuty(home, W.DUTY.ST)[0];
    assert(Math.abs(fbL.y) > Math.abs(cbL.y) + 6, `FB deveria ser mais largo que CB (${fbL.y} vs ${cbL.y})`);
    assert(Math.abs(wL.y) > Math.abs(st.y) + 6, `W deveria ser mais largo que ST (${wL.y} vs ${st.y})`);
    assert(cdm.x < world.ball.x - 2, `CDM/volante deveria estar atrás da bola (${cdm.x})`);
    assert(st.x > cbL.x + 8, `ST à frente dos CBs (${st.x} vs ${cbL.x})`);
    passed += 1;
    console.log(`ok  duty-roles FB.y=${fbL.y.toFixed(0)} W.y=${wL.y.toFixed(0)} CDM.x=${cdm.x.toFixed(1)}`);
  }

  // --- Marcação por função: FB↔W, CB↔ST ---
  {
    const world = W.createWorld({ seed: 21 });
    world.ball = { x: 16, y: 5, vx: 0, vy: 0 };
    W.setShapeBoth(world, "home", 1);
    W.settle(world, 14);
    const home = W.playersOf(world, "home");
    const away = W.playersOf(world, "away");
    const wL = W.byDuty(home, W.DUTY.W_L)[0];
    const st = W.byDuty(home, W.DUTY.ST)[0];
    const fbL = W.byDuty(away, W.DUTY.FB_L)[0];
    const cbL = W.byDuty(away, W.DUTY.CB_L)[0];
    assert(W.dist(fbL, wL) < 10, `FB_L deveria marcar W_L (d=${W.dist(fbL, wL).toFixed(1)})`);
    assert(W.dist(cbL, st) < 10, `CB deveria marcar ST (d=${W.dist(cbL, st).toFixed(1)})`);
    passed += 1;
    console.log(`ok  duty-marking FB-W=${W.dist(fbL, wL).toFixed(1)}m CB-ST=${W.dist(cbL, st).toFixed(1)}m`);
  }

  // --- Footure 26 funções: catálogo + comportamento distinto ---
  {
    assert(W.FUNCAO && W.FUNCAO_BEHAVIOR, "Footure FUNCAO ausente");
    const ids = Object.values(W.FUNCAO);
    assert(ids.length === 26, `esperava 26 funções Footure, veio ${ids.length}`);
    for (const id of ids) {
      assert(W.FUNCAO_BEHAVIOR[id], `behavior faltando: ${id}`);
    }
    // Ultrapassador sobe mais que lateral defensivo
    const wUp = W.createWorld({ seed: 3 });
    wUp.ball = { x: 18, y: 0, vx: 0, vy: 0 };
    const fb = W.byDuty(W.playersOf(wUp, "home"), W.DUTY.FB_R)[0];
    fb.funcao = W.FUNCAO.FB_ULTRAPASSADOR;
    W.setShapeIP(wUp, "home", 1);
    const xUp = fb.tx;
    const wDef = W.createWorld({ seed: 3 });
    wDef.ball = { x: 18, y: 0, vx: 0, vy: 0 };
    const fb2 = W.byDuty(W.playersOf(wDef, "home"), W.DUTY.FB_R)[0];
    fb2.funcao = W.FUNCAO.FB_DEFENSIVO;
    W.setShapeIP(wDef, "home", 1);
    assert(xUp > fb2.tx + 2, `ultrapassador deveria subir mais (${xUp.toFixed(1)} vs ${fb2.tx.toFixed(1)})`);
    // Extremo ruptura mais aberto que construtor
    const wR = W.createWorld({ seed: 4 });
    wR.ball = { x: 12, y: 0, vx: 0, vy: 0 };
    const wing = W.byDuty(W.playersOf(wR, "home"), W.DUTY.W_L)[0];
    wing.funcao = W.FUNCAO.W_RUPTURA;
    W.setShapeIP(wR, "home", 1);
    const yRup = Math.abs(wing.ty);
    wing.funcao = W.FUNCAO.W_CONSTRUTOR;
    W.setShapeIP(wR, "home", 1);
    const yCon = Math.abs(wing.ty);
    assert(yRup > yCon + 2, `ruptura deveria ser mais aberta (${yRup.toFixed(1)} vs ${yCon.toFixed(1)})`);
    // Destruidor mais atrás que box-to-box no mesmo slot CM
    const wM = W.createWorld({ seed: 5 });
    wM.ball = { x: 10, y: 0, vx: 0, vy: 0 };
    const cdm = W.byDuty(W.playersOf(wM, "home"), W.DUTY.CDM)[0];
    cdm.funcao = W.FUNCAO.MF_DESTRUIDOR;
    W.setShapeIP(wM, "home", 1);
    const xDes = cdm.tx;
    cdm.funcao = W.FUNCAO.MF_BOXTOBOX;
    W.setShapeIP(wM, "home", 1);
    assert(xDes < cdm.tx - 1.5, `destruidor atrás de box-to-box (${xDes.toFixed(1)} vs ${cdm.tx.toFixed(1)})`);
    passed += 1;
    console.log(`ok  footure-26 up=${xUp.toFixed(1)}>def=${fb2.tx.toFixed(1)} rup=${yRup.toFixed(0)}>con=${yCon.toFixed(0)}`);
  }

  console.log(`\n${passed} testes WorldPitch OK`);
  console.log("Contrato: metros → duty + função Footure → settle → espelho UV + FIFA.");
}

main();
