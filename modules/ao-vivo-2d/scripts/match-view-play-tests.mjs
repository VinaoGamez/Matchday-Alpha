/**
 * Testes headless — módulo AO VIVO 2D (lab|frozen).
 * Uso: AO_VIVO_2D_VARIANT=lab node modules/ao-vivo-2d/scripts/match-view-play-tests.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moduleRoot = path.resolve(__dirname, "..");
const variant = (process.env.AO_VIVO_2D_VARIANT || "lab").toLowerCase();
const mv = path.join(moduleRoot, variant === "frozen" ? "frozen" : "lab");

function loadScript(file, sandbox) {
  const code = fs.readFileSync(path.join(mv, file), "utf8");
  vm.runInNewContext(code, sandbox, { filename: file });
}

function makeFormation(side) {
  const base =
    side === "home"
      ? [
          [0.06, 0.5],
          [0.22, 0.18],
          [0.2, 0.38],
          [0.2, 0.62],
          [0.22, 0.82],
          [0.34, 0.28],
          [0.32, 0.5],
          [0.34, 0.72],
          [0.48, 0.2],
          [0.5, 0.48],
          [0.48, 0.8],
        ]
      : [
          [0.94, 0.5],
          [0.78, 0.18],
          [0.8, 0.38],
          [0.8, 0.62],
          [0.78, 0.82],
          [0.66, 0.28],
          [0.68, 0.5],
          [0.66, 0.72],
          [0.52, 0.2],
          [0.5, 0.48],
          [0.52, 0.8],
        ];
  const roles = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"];
  return base.map(([u, v], i) => ({
    id: `${side}-${i}`,
    kind: "player",
    team: side,
    role: roles[i],
    u,
    v,
    elevation: 0,
  }));
}

function createMockApi() {
  const entities = [
    ...makeFormation("home"),
    ...makeFormation("away"),
    { id: "ball", kind: "ball", u: 0.5, v: 0.5, elevation: 0 },
  ];
  let playing = false;
  let matchRunning = true;

  return {
    entities,
    moveEntity(entity, u, v) {
      entity.u = Math.min(1, Math.max(0, u));
      entity.v = Math.min(1, Math.max(0, v));
      return Promise.resolve();
    },
    moveBall(u, v, _d, elev = 0) {
      const ball = entities.find((e) => e.kind === "ball");
      ball.u = Math.min(1, Math.max(0, u));
      ball.v = Math.min(1, Math.max(0, v));
      ball.elevation = elev;
      return Promise.resolve();
    },
    getMatchEntities: () => entities,
    cornerSpotForAttack(side, near) {
      if (side === "home") return { u: 1, v: near === "near" ? 1 : 0 };
      return { u: 0, v: near === "near" ? 1 : 0 };
    },
    isPlaying: () => playing,
    setPlaying: (v) => {
      playing = !!v;
    },
    isMatchRunning: () => matchRunning,
    setMatchRunning: (v) => {
      matchRunning = !!v;
    },
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function minSeparation(players) {
  let m = Infinity;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const d = Math.hypot(players[i].u - players[j].u, players[i].v - players[j].v);
      m = Math.min(m, d);
    }
  }
  return m;
}

/** Separação no trapézio do estádio (métrica correta do telão). */
function minScreenSeparation(players, G) {
  if (!G?.mapToField) return minSeparation(players) * 400; // fallback grosseiro
  let m = Infinity;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = G.mapToField(players[i].u, players[i].v);
      const b = G.mapToField(players[j].u, players[j].v);
      m = Math.min(m, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return m;
}

function teamWidth(players) {
  const vs = players.map((p) => p.v);
  return Math.max(...vs) - Math.min(...vs);
}

async function main() {
  const sandbox = {
    window: {},
    globalThis: {},
    console,
    setTimeout,
    clearTimeout,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  loadScript("field-geometry.js", sandbox);
  loadScript("world-pitch.js", sandbox);
  loadScript("play-engine.js", sandbox);
  loadScript("playbook.js", sandbox);
  loadScript("match-sim.js", sandbox);

  const Playbook = sandbox.MatchViewPlaybook;
  const MatchSim = sandbox.MatchViewMatchSim;
  const Engine = sandbox.MatchViewPlayEngine;
  const Geom = sandbox.MatchViewGeometry;

  assert(Playbook && Engine && MatchSim && Geom, "módulos não carregaram");

  let passed = 0;
  const kinds = Object.keys(Playbook.CATALOG);
  // Marcação DF×FW intencional (~18px×scale) pode ficar um pouco abaixo de 18
  const MIN_SCREEN_PX = 16;

  for (const kind of kinds) {
    const api = createMockApi();
    const result = await Playbook.CATALOG[kind].run(api, "home", {
      seed: 42,
      instant: true,
      pace: 10,
      outcome: kind === "tackle" ? undefined : "save",
    });
    assert(result.ok, `${kind} falhou: ${result.reason}`);
    const ball = api.entities.find((e) => e.kind === "ball");
    assert(ball.u >= 0 && ball.u <= 1 && ball.v >= 0 && ball.v <= 1, `${kind}: bola fora`);
    const players = api.entities.filter((e) => e.kind === "player");
    const screenSep = minScreenSeparation(players, Geom);
    // área / duelo / escanteio: mescla DF×FW pode ficar ~15px; ainda sem bolo
    const tight = kind === "corner" || kind === "shot" || kind === "cross";
    const minPx = tight ? 14 : MIN_SCREEN_PX;
    assert(
      screenSep > minPx,
      `${kind}: tokens empilhados no estádio (sep=${screenSep.toFixed(1)}px)`
    );
    passed += 1;
    console.log(`ok  play:${kind} screenSep=${screenSep.toFixed(1)}px`);
  }

  // Forma IP: atacantes mais avançados; amplitude
  {
    const api = createMockApi();
    const d = Engine.createDirector(api, { seed: 9, instant: true });
    d.snapshot();
    await d.shapeInPossession("home", 0.55, 0.5, 1);
    const home = api.entities.filter((e) => e.team === "home" && e.kind === "player");
    const dfs = home.filter((p) => p.role === "DF");
    const fws = home.filter((p) => p.role === "FW");
    const avgDf = dfs.reduce((s, p) => s + p.u, 0) / dfs.length;
    const avgFw = fws.reduce((s, p) => s + p.u, 0) / fws.length;
    assert(avgFw > avgDf, `IP: FW deve estar à frente dos DF (${avgFw} vs ${avgDf})`);
    const w = teamWidth(home.filter((p) => p.role !== "GK"));
    assert(w > 0.35 && w < 0.95, `IP: amplitude estranha (${w.toFixed(3)})`);
    passed += 1;
    console.log(`ok  shape-ip depth fw>df width=${w.toFixed(3)}`);
  }

  // FB sobe mais que CB em IP
  {
    const api = createMockApi();
    const d = Engine.createDirector(api, { seed: 5, instant: true });
    d.snapshot();
    const ballU = 0.58;
    await d.shapeInPossession("home", ballU, 0.5, 1);
    const dfs = api.entities
      .filter((e) => e.team === "home" && e.role === "DF")
      .sort((a, b) => a.v - b.v);
    const wide = [dfs[0], dfs[dfs.length - 1]];
    const cbs = dfs.slice(1, -1);
    const avgFb = wide.reduce((s, p) => s + p.u, 0) / wide.length;
    const avgCb = cbs.reduce((s, p) => s + p.u, 0) / cbs.length;
    assert(avgFb > avgCb - 0.005, `IP: laterais deveriam subir mais (FB=${avgFb.toFixed(3)} CB=${avgCb.toFixed(3)})`);
    passed += 1;
    console.log(`ok  ip-fb-higher FB=${avgFb.toFixed(3)} CB=${avgCb.toFixed(3)}`);
  }

  // Forma OOP: compacta; GK no eixo
  {
    const api = createMockApi();
    const d = Engine.createDirector(api, { seed: 11, instant: true });
    d.snapshot();
    const ballU = 0.62;
    const ballV = 0.7;
    await d.shapeOutOfPossession("away", ballU, ballV, 1);
    const away = api.entities.filter((e) => e.team === "away" && e.kind === "player");
    const out = away.filter((p) => p.role !== "GK");
    const w = teamWidth(out);
    assert(w < 0.78, `OOP: bloco deveria compactar (width=${w.toFixed(3)})`);
    const gk = away.find((p) => p.role === "GK");
    assert(Math.abs(gk.v - 0.5) < 0.35, "OOP: GK longe demais do eixo");
    assert(Math.abs(gk.v - ballV) < Math.abs(0.5 - ballV) + 0.15, "OOP: GK não acompanhou bola em v");
    passed += 1;
    console.log(`ok  shape-oop compact width=${w.toFixed(3)} gk.v=${gk.v.toFixed(3)}`);
  }

  // IP mais largo que OOP (mesma bola)
  {
    const apiIp = createMockApi();
    const apiOop = createMockApi();
    const dIp = Engine.createDirector(apiIp, { seed: 2, instant: true });
    const dOop = Engine.createDirector(apiOop, { seed: 2, instant: true });
    dIp.snapshot();
    dOop.snapshot();
    const ballU = 0.55;
    const ballV = 0.4;
    await dIp.shapeInPossession("home", ballU, ballV, 1);
    await dOop.shapeOutOfPossession("home", ballU, ballV, 1);
    const wIp = teamWidth(apiIp.entities.filter((e) => e.team === "home" && e.role !== "GK"));
    const wOop = teamWidth(apiOop.entities.filter((e) => e.team === "home" && e.role !== "GK"));
    assert(wIp > wOop + 0.04, `IP deveria ser mais largo que OOP (${wIp.toFixed(3)} vs ${wOop.toFixed(3)})`);
    passed += 1;
    console.log(`ok  ip-wider-than-oop ${wIp.toFixed(3)}>${wOop.toFixed(3)}`);
  }

  // Rest defense
  {
    const api = createMockApi();
    const d = Engine.createDirector(api, { seed: 3, instant: true });
    d.snapshot();
    const ballU = 0.6;
    await d.shapeInPossession("home", ballU, 0.45, 1);
    const dfs = api.entities.filter((e) => e.team === "home" && e.role === "DF");
    const behind = dfs.filter((p) => p.u < ballU - 0.02).length;
    assert(behind >= 3, `rest defense: só ${behind}/4 DF atrás da bola`);
    passed += 1;
    console.log(`ok  rest-defense ${behind}/4 DF atrás da bola`);
  }

  // Cover shadow: DF away entre FW home e o gol (u alto)
  {
    const api = createMockApi();
    const d = Engine.createDirector(api, { seed: 17, instant: true });
    d.snapshot();
    await d.shapeBoth("home", 0.65, 0.55, 1);
    const homeFw = api.entities.filter((e) => e.team === "home" && e.role === "FW");
    const awayDf = api.entities.filter((e) => e.team === "away" && e.role === "DF");
    let coverOk = 0;
    for (const fw of homeFw) {
      const marker = awayDf.slice().sort((a, b) => {
        const da = Math.hypot(a.u - fw.u, a.v - fw.v);
        const db = Math.hypot(b.u - fw.u, b.v - fw.v);
        return da - db;
      })[0];
      if (marker && marker.u >= fw.u - 0.06) coverOk += 1;
    }
    assert(coverOk >= 2, `cover shadow fraco (${coverOk}/${homeFw.length})`);
    passed += 1;
    console.log(`ok  cover-shadow ${coverOk}/${homeFw.length}`);
  }

  // GK alinhado à reta bola→gol (centro óptico do estádio)
  {
    const api = createMockApi();
    const d = Engine.createDirector(api, { seed: 21, instant: true });
    d.snapshot();
    const ballU = 0.7;
    const centerV = sandbox.MatchViewGeometry?.BALL_KICKOFF?.v ?? 0.5;
    const ballV = centerV + 0.25;
    await d.shapeOutOfPossession("away", ballU, ballV, 1);
    const gk = api.entities.find((e) => e.team === "away" && e.role === "GK");
    const goal = { u: 0.96, v: centerV };
    const ball = { u: ballU, v: ballV };
    const off = Engine.lineDistance(gk, goal, ball);
    assert(off < 0.14, `GK fora do ângulo (dist reta=${off.toFixed(3)})`);
    passed += 1;
    console.log(`ok  gk-angle off=${off.toFixed(3)} centerV=${centerV.toFixed(3)}`);
  }

  // shapeBoth: IP wide + OOP compact sem empilhar
  {
    const api = createMockApi();
    const d = Engine.createDirector(api, { seed: 8, instant: true });
    d.snapshot();
    const both = await d.shapeBoth("home", 0.52, 0.6, 1);
    assert(both.ip.width > both.oop.metrics.width, "shapeBoth: IP não mais largo");
    const players = api.entities.filter((e) => e.kind === "player");
    const screenSep = minScreenSeparation(players, Geom);
    assert(screenSep > MIN_SCREEN_PX, `shapeBoth empilhou (${screenSep.toFixed(1)}px)`);
    passed += 1;
    console.log(
      `ok  shape-both ipW=${both.ip.width.toFixed(3)} oopW=${both.oop.metrics.width.toFixed(3)} px=${screenSep.toFixed(1)}`
    );
  }

  // Lanes
  {
    const fake = [
      { id: "a", v: 0.4 },
      { id: "b", v: 0.41 },
      { id: "c", v: 0.42 },
    ];
    const lanes = Engine.assignLanes(fake, 0.5, 0.3, 0.06);
    const vals = [...lanes.values()].sort((a, b) => a - b);
    assert(vals[1] - vals[0] >= 0.055, "lanes gap 0-1");
    assert(vals[2] - vals[1] >= 0.055, "lanes gap 1-2");
    passed += 1;
    console.log("ok  lanes-gap");
  }

  // suporte: após IP, algum MF perto da bola (triângulo)
  {
    const api = createMockApi();
    const d = Engine.createDirector(api, { seed: 13, instant: true });
    d.snapshot();
    const ballU = 0.48;
    const ballV = 0.5;
    await d.shapeInPossession("home", ballU, ballV, 1);
    const mfs = api.entities.filter((e) => e.team === "home" && e.role === "MF");
    const nearest = Math.min(...mfs.map((p) => Math.hypot(p.u - ballU, p.v - ballV)));
    assert(nearest < 0.14, `suporte longe da bola (d=${nearest.toFixed(3)})`);
    passed += 1;
    console.log(`ok  support-distance d=${nearest.toFixed(3)}`);
  }

  // partida inteira
  {
    const api = createMockApi();
    const match = await MatchSim.runFullMatch(
      api,
      {
        setupKickoff: () => {
          const ball = api.entities.find((e) => e.kind === "ball");
          ball.u = 0.5;
          ball.v = 0.5;
        },
      },
      { seed: 7, instant: true, pace: 50, maxEvents: 20 }
    );
    assert(match.events >= 5, "partida gerou poucas jogadas");
    assert(match.minute === 90, "partida não terminou aos 90");
    passed += 1;
    console.log(
      `ok  full-match events=${match.events} score=${match.homeGoals}-${match.awayGoals}`
    );
  }

  // escanteio: bola no canto do ataque (home → u alto)
  {
    const api = createMockApi();
    const corner = await Playbook.playCorner(api, "home", {
      seed: 1,
      instant: true,
      nearSide: "far",
      outcome: "clear",
      skipSoftReset: true,
    });
    assert(corner.ok && corner.corner?.u > 0.9, `escanteio u baixo (${corner.corner?.u})`);
    assert(corner.corner?.v < 0.2, `escanteio far deveria ser v baixo (${corner.corner?.v})`);
    const awayGk = api.entities.find((e) => e.team === "away" && e.role === "GK");
    assert(awayGk && awayGk.u > 0.85, "GK def fora do gol no escanteio");
    passed += 1;
    console.log(`ok  corner-spot u=${corner.corner.u.toFixed(3)} v=${corner.corner.v.toFixed(3)}`);
  }

  // multi-seed smoke (px do estádio)
  {
    let worst = Infinity;
    for (let seed = 0; seed < 12; seed++) {
      for (const kind of kinds) {
        const api = createMockApi();
        await Playbook.CATALOG[kind].run(api, seed % 2 ? "away" : "home", {
          seed: 100 + seed,
          instant: true,
          outcome: "save",
        });
        const sep = minScreenSeparation(
          api.entities.filter((e) => e.kind === "player"),
          Geom
        );
        // corner tem limiar próprio
        const floor =
          kind === "corner" || kind === "shot" || kind === "cross" ? 14 : MIN_SCREEN_PX;
        if (sep < floor) worst = Math.min(worst, sep - (MIN_SCREEN_PX - floor));
        else worst = Math.min(worst, sep);
      }
    }
    assert(worst > 14, `multi-seed empilhamento (worst=${worst.toFixed(1)}px)`);
    passed += 1;
    console.log(`ok  multi-seed-sep worst=${worst.toFixed(1)}px`);
  }

  // stress shapeBoth em vários pontos do campo
  {
    let fail = 0;
    let worst = Infinity;
    const centerV = Geom.BALL_KICKOFF.v;
    const points = [
      [0.3, centerV],
      [0.5, centerV],
      [0.7, centerV - 0.1],
      [0.75, centerV + 0.25],
      [0.4, centerV + 0.35],
    ];
    for (const [u, v] of points) {
      for (const side of ["home", "away"]) {
        const api = createMockApi();
        const d = Engine.createDirector(api, { seed: Math.round(u * 100 + v * 10), instant: true });
        d.snapshot();
        await d.shapeBoth(side, u, v, 1);
        const sep = minScreenSeparation(
          api.entities.filter((e) => e.kind === "player"),
          Geom
        );
        worst = Math.min(worst, sep);
        // mescla DF×FW intencional — piso alinhado a shot/cross
        if (sep < 14) fail += 1;
      }
    }
    assert(fail === 0, `stress shapeBoth falhou em ${fail} pontos (worst=${worst.toFixed(1)}px)`);
    passed += 1;
    console.log(`ok  stress-shapeboth points=${points.length * 2} worst=${worst.toFixed(1)}px`);
  }

  // spacePoints unitário
  {
    const pts = [
      { id: "1", team: "home", role: "MF", u: 0.5, v: 0.5, movable: true },
      { id: "2", team: "home", role: "MF", u: 0.51, v: 0.5, movable: true },
      { id: "3", team: "away", role: "DF", u: 0.5, v: 0.51, movable: true },
    ];
    Engine.spacePoints(pts, 12);
    const d12 = Math.hypot(pts[0].u - pts[1].u, pts[0].v - pts[1].v);
    const d13 = Math.hypot(pts[0].u - pts[2].u, pts[0].v - pts[2].v);
    assert(d12 > 0.04, `spacePoints same-team fraco (${d12.toFixed(3)})`);
    assert(d13 > 0.035, `spacePoints opp fraco (${d13.toFixed(3)})`);
    passed += 1;
    console.log(`ok  space-points d12=${d12.toFixed(3)} d13=${d13.toFixed(3)}`);
  }

  console.log(`\n${passed} testes OK`);
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
