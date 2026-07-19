/**
 * Coreografias de jogadas — usa WorldPitch (metros) + espelho no estádio.
 */
(function (global) {
  "use strict";

  const Engine = () => global.MatchViewPlayEngine;
  const World = () => global.MatchViewWorldPitch;

  function clamp01(n) {
    return Math.min(1, Math.max(0, n));
  }

  function dirOf(side) {
    return side === "home" ? 1 : -1;
  }

  function opp(side) {
    return side === "home" ? "away" : "home";
  }

  function goalMouthU(attackSide) {
    return attackSide === "home" ? 0.97 : 0.03;
  }

  function pick(list, pred) {
    if (!list?.length) return null;
    if (typeof pred === "function") {
      const f = list.filter(pred);
      return f[0] || list[0];
    }
    return list[0];
  }

  function director(api, opts) {
    return Engine().createDirector(api, opts || {});
  }

  async function syncShapes(d, attackSide, ballU, ballV, intensity = 1) {
    if (typeof d.shapeBoth === "function") {
      return d.shapeBoth(attackSide, ballU, ballV, intensity);
    }
    await d.shapeInPossession(attackSide, ballU, ballV, intensity);
    await d.shapeOutOfPossession(opp(attackSide), ballU, ballV, intensity * 0.95);
  }

  /**
   * Monta a jogada com a bola SEMPRE no portador:
   * cola nas botas → forma → recola (nunca voa sozinha até o jogador).
   */
  async function stagePossession(d, attackSide, carrier, intensity = 0.9) {
    if (!carrier) return;
    if (typeof d.giveBall === "function") await d.giveBall(carrier, 0);
    else await d.moveBallTo(carrier.u, carrier.v, 0);
    await syncShapes(d, attackSide, carrier.u, carrier.v, intensity);
    if (typeof d.giveBall === "function") await d.giveBall(carrier, 0);
    else await d.moveBallTo(carrier.u, carrier.v, 0);
  }

  async function playBuildUp(api, attackSide = "home", opts = {}) {
    const d = director(api, opts);
    d.snapshot();
    const atk = d.playersOf(attackSide);
    const dir = dirOf(attackSide);
    const mfs = d.byRole(atk, "MF");
    const fws = d.byRole(atk, "FW");
    const pivot = pick(mfs) || atk[5];
    const eight = mfs[1] || mfs[0] || pivot;
    const winger = pick(fws, (p) => p.v < 0.3 || p.v > 0.7) || fws[0];
    const nine = pick(fws, (p) => Math.abs(p.v - 0.5) < 0.25) || fws[0];
    if (!pivot || !nine) return { ok: false, reason: "sem elenco", kind: "buildup" };

    await stagePossession(d, attackSide, pivot, 0.9);
    await d.carry(pivot, clamp01(pivot.u + dir * 0.05), pivot.v, 480);
    await syncShapes(d, attackSide, pivot.u, pivot.v, 0.85);

    if (eight && eight !== pivot) {
      await d.makeRun(eight, attackSide, "cutback");
      await d.pass(pivot, eight, "pass");
      await syncShapes(d, attackSide, eight.u, eight.v, 0.9);
      if (winger && winger !== nine) {
        await Promise.all([
          d.makeRun(winger, attackSide, "wide"),
          d.makeRun(nine, attackSide, "halfspace"),
        ]);
        await d.pass(eight, winger, "pass");
        await syncShapes(d, attackSide, winger.u, winger.v, 0.85);
        await d.makeRun(nine, attackSide, "behind");
        await d.pass(winger, nine, "pass");
      } else {
        await d.makeRun(nine, attackSide, "behind");
        await d.pass(eight, nine, "pass");
      }
    } else {
      await d.makeRun(nine, attackSide, "behind");
      await d.pass(pivot, nine, "pass");
    }
    await d.wait(100);
    d.clampKeepersOnPitch?.();
    return { ok: true, kind: "buildup", attackSide, phase: "construction" };
  }

  async function playShot(api, attackSide = "home", opts = {}) {
    const d = director(api, opts);
    d.snapshot();
    const outcome = opts.outcome || (d.rand() < 0.28 ? "goal" : d.rand() < 0.55 ? "save" : "wide");
    const atk = d.playersOf(attackSide);
    const defSide = opp(attackSide);
    const dir = dirOf(attackSide);
    const mf = pick(d.byRole(atk, "MF")) || atk[6];
    const fw = pick(d.byRole(atk, "FW"), (p) => Math.abs(p.v - 0.5) < 0.35) || pick(d.byRole(atk, "FW"));
    const gk = pick(d.byRole(d.playersOf(defSide), "GK"));
    if (!fw) return { ok: false, reason: "sem atacante", kind: "shot" };

    if (mf) {
      await stagePossession(d, attackSide, mf, 0.75);
      await d.makeRun(fw, attackSide, "behind");
      await d.pass(mf, fw, "pass");
    } else {
      await stagePossession(d, attackSide, fw, 0.85);
    }

    await syncShapes(d, attackSide, fw.u, fw.v, 1);
    if (typeof d.giveBall === "function") await d.giveBall(fw, 0);
    const shotU = clamp01(fw.u + dir * 0.07);
    const shotV = clamp01(fw.v + (d.rand() - 0.5) * 0.04);
    await d.carry(fw, shotU, shotV, 360);

    if (gk && outcome !== "wide" && outcome !== "miss") {
      const gkt = d.gkTarget(gk, shotU, shotV, defSide);
      if (gkt) await d.move(gk, gkt.u, gkt.v, 260);
    }

    if (outcome === "wide" || outcome === "miss") {
      // Bola sai totalmente (lateral ou ao lado do gol)
      if (typeof d.ballOut === "function") {
        await d.ballOut(attackSide, d.rand() < 0.45 ? "touch" : "goal", d.rand() < 0.5 ? "near" : "far");
      } else {
        const targetV = d.rand() < 0.5 ? -0.08 : 1.08;
        const targetU = clamp01(shotU + dir * 0.12);
        await d.moveBallTo(targetU, targetV, 520, 4, { allowOut: true });
      }
    } else {
      const targetV = 0.4 + d.rand() * 0.2;
      const targetU = goalMouthU(attackSide);
      await d.moveBallTo(
        targetU,
        targetV,
        d.ballTravelMs({ u: shotU, v: shotV }, { u: targetU, v: targetV }),
        d.ballElevation({ u: shotU, v: shotV }, { u: targetU, v: targetV }, "shot")
      );
      if (outcome === "save" && gk) {
        const gkt = d.gkTarget(gk, targetU, targetV, defSide);
        if (gkt) await d.move(gk, gkt.u, clamp01(targetV), 200);
        await d.moveBallTo(clamp01(gk.u - dir * 0.04), clamp01(targetV + (d.rand() - 0.5) * 0.06), 300, 5);
      } else if (outcome === "goal") {
        await d.wait(160);
      }
    }

    d.clampKeepersOnPitch?.();
    return { ok: true, kind: "shot", attackSide, outcome, phase: "outcome" };
  }

  /**
   * Escanteio — posições absolutas via WorldPitch (sem blendFromAnchor).
   */
  async function playCorner(api, attackSide = "home", opts = {}) {
    const d = director(api, opts);
    d.snapshot();
    const nearSide = opts.nearSide || (d.rand() > 0.5 ? "near" : "far");
    const W = World();
    const defSide = opp(attackSide);
    const atk = d.playersOf(attackSide);
    const def = d.playersOf(defSide);
    const gk = pick(d.byRole(def, "GK"));
    const fws = d.byRole(atk, "FW");
    if (!fws.length) return { ok: false, reason: "sem atacante", kind: "corner" };

    let ballUv;
    let boxU = attackSide === "home" ? 0.88 : 0.12;
    const centerV = global.MatchViewGeometry?.BALL_KICKOFF?.v ?? 0.34;
    let boxV = nearSide === "near" ? centerV + 0.12 : centerV - 0.12;

    if (W?.planCornerMoves) {
      const planned = W.planCornerMoves(d.entities(), attackSide, nearSide, {
        seed: opts.seed,
        duration: opts.instant ? 0 : 520,
      });
      ballUv = planned.ballUv;
      await Promise.all([
        d.moveMany(planned.moves),
        d.moveBallTo(ballUv.u, ballUv.v, opts.instant ? 0 : 500),
      ]);
      d.clampKeepersOnPitch?.();
      // alvo do cabeceio = média dos FW no box
      const fwNow = d.byRole(atk, "FW");
      boxU = fwNow.reduce((s, p) => s + p.u, 0) / fwNow.length;
      boxV = fwNow.reduce((s, p) => s + p.v, 0) / fwNow.length;
    } else {
      // fallback UV absoluto (sem blend)
      const corner =
        (typeof api.cornerSpotForAttack === "function"
          ? api.cornerSpotForAttack(attackSide, nearSide)
          : null) || { u: attackSide === "home" ? 1 : 0, v: nearSide === "near" ? 1 : 0 };
      ballUv = corner;
      const taker = pick(d.byRole(atk, "MF")) || atk[6];
      const targets = fws.slice(0, 3);
      const lanes = d.assignLanes(targets, boxV, 0.28, 0.08);
      const moves = targets.map((p) => ({
        entity: p,
        u: boxU,
        v: lanes.get(p.id) ?? boxV,
        duration: 520,
      }));
      const dfs = d.byRole(def, "DF");
      dfs.forEach((p, i) => {
        moves.push({
          entity: p,
          u: lerp(boxU, ownGoalish(defSide), 0.4),
          v: (lanes.get(targets[i % targets.length]?.id) ?? boxV) + (i - 1.5) * 0.04,
          duration: 520,
        });
      });
      if (taker) {
        moves.push({
          entity: taker,
          u: corner.u + (attackSide === "home" ? -0.03 : 0.03),
          v: corner.v + (nearSide === "near" ? -0.03 : 0.03),
          duration: 520,
        });
      }
      const gkt = gk ? d.gkTarget(gk, boxU, boxV, defSide) : null;
      if (gkt) moves.push({ entity: gk, u: gkt.u, v: gkt.v, duration: 480 });
      await Promise.all([d.moveMany(moves), d.moveBallTo(corner.u, corner.v, 500)]);
    }

    // Bola nasce no cobrador (canto), não no ar
    const takerNow =
      pick(d.byRole(atk, "MF")) ||
      atk.find((p) => Math.hypot(p.u - (ballUv?.u ?? 0.5), p.v - (ballUv?.v ?? 0.5)) < 0.2) ||
      atk[6];
    if (takerNow && typeof d.giveBall === "function") await d.giveBall(takerNow, 0);
    else if (ballUv) await d.moveBallTo(ballUv.u, ballUv.v, 0);

    await d.wait(140);
    const target = fws[0];
    await d.moveBallTo(boxU, boxV, 700, 24);
    if (target) await d.move(target, boxU, boxV, 220);

    const outcome = opts.outcome || (d.rand() < 0.22 ? "goal" : d.rand() < 0.5 ? "save" : "clear");
    if (outcome === "goal") {
      await d.moveBallTo(goalMouthU(attackSide), centerV + (d.rand() - 0.5) * 0.08, 340, 9);
    } else if (outcome === "save" && gk) {
      const gkt = d.gkTarget(gk, boxU, boxV, defSide);
      if (gkt) await d.move(gk, gkt.u, gkt.v, 180);
      await d.moveBallTo(gk.u, gk.v, 240, 4);
    } else {
      const clearer = pick(d.byRole(def, "DF")) || def[2];
      if (clearer) {
        await d.moveBallTo(clearer.u, clearer.v, 260, 7);
        await d.carry(clearer, clamp01(clearer.u + dirOf(defSide) * 0.06), clearer.v, 320);
      }
    }

    d.clampKeepersOnPitch?.();
    return {
      ok: true,
      kind: "corner",
      attackSide,
      nearSide,
      outcome,
      corner: ballUv,
      phase: "setpiece",
      needsHardReset: true,
    };
  }

  function ownGoalish(side) {
    return side === "home" ? 0.08 : 0.92;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  async function playTackle(api, attackSide = "home", opts = {}) {
    const d = director(api, opts);
    d.snapshot();
    const atk = d.playersOf(attackSide);
    const defSide = opp(attackSide);
    const dir = dirOf(attackSide);
    const carrier = pick(d.byRole(atk, "MF")) || atk[6];
    if (!carrier) return { ok: false, reason: "sem portador", kind: "tackle" };

    await stagePossession(d, attackSide, carrier, 0.7);
    await d.carry(carrier, clamp01(carrier.u + dir * 0.055), carrier.v, 400);

    const tackler = d.pickClosest(
      d.byRole(d.playersOf(defSide), "DF").concat(d.byRole(d.playersOf(defSide), "MF")),
      carrier.u,
      carrier.v
    );
    if (!tackler) return { ok: false, reason: "sem duelo", kind: "tackle" };

    const meetU = (carrier.u + tackler.u) / 2;
    const meetV = (carrier.v + tackler.v) / 2;
    await d.moveMany([
      { entity: carrier, u: meetU, v: meetV, duration: 340 },
      { entity: tackler, u: meetU - dir * 0.02, v: meetV, duration: 340 },
      { ball: true, u: meetU, v: meetV, duration: 320 },
    ]);
    await d.carry(tackler, clamp01(tackler.u - dir * 0.07), clamp01(tackler.v), 400);
    await d.shapeInPossession(defSide, tackler.u, tackler.v, 0.7);
    await d.shapeOutOfPossession(attackSide, tackler.u, tackler.v, 0.6);
    d.clampKeepersOnPitch?.();
    return { ok: true, kind: "tackle", attackSide, wonBy: defSide, phase: "duel" };
  }

  async function playCounter(api, attackSide = "home", opts = {}) {
    const d = director(api, opts);
    d.snapshot();
    const atk = d.playersOf(attackSide);
    const defSide = opp(attackSide);
    const dir = dirOf(attackSide);
    const starter = pick(d.byRole(atk, "MF")) || atk[5];
    const runner = pick(d.byRole(atk, "FW")) || atk[9];
    const wing = d.byRole(atk, "FW").find((p) => p !== runner);
    const gk = pick(d.byRole(d.playersOf(defSide), "GK"));
    if (!starter || !runner) return { ok: false, reason: "sem elenco", kind: "counter" };

    await stagePossession(d, attackSide, starter, 0.65);
    await Promise.all([
      d.makeRun(runner, attackSide, "behind"),
      wing ? d.makeRun(wing, attackSide, "wide") : Promise.resolve(),
      d.shapeOutOfPossession(defSide, starter.u + dir * 0.1, starter.v, 0.45),
    ]);
    if (typeof d.giveBall === "function") await d.giveBall(starter, 0);
    await d.pass(starter, runner, "pass");
    await d.carry(runner, clamp01(runner.u + dir * 0.08), runner.v, 340);

    const finish = opts.outcome || (d.rand() < 0.35 ? "goal" : d.rand() < 0.5 ? "save" : "wide");
    if (finish === "wide") {
      if (typeof d.ballOut === "function") {
        await d.ballOut(attackSide, "goal", d.rand() < 0.5 ? "near" : "far");
      } else {
        await d.moveBallTo(goalMouthU(attackSide), d.rand() < 0.5 ? -0.08 : 1.08, 480, 5, {
          allowOut: true,
        });
      }
    } else {
      const targetV = 0.42 + d.rand() * 0.16;
      const targetU = goalMouthU(attackSide);
      if (gk) {
        const gkt = d.gkTarget(gk, runner.u, runner.v, defSide);
        if (gkt) await d.move(gk, gkt.u, gkt.v, 220);
      }
      await d.moveBallTo(
        targetU,
        targetV,
        d.ballTravelMs(runner, { u: targetU, v: targetV }),
        d.ballElevation(runner, { u: targetU, v: targetV }, "shot")
      );
      if (finish === "save" && gk) {
        await d.moveBallTo(clamp01(gk.u - dir * 0.03), gk.v, 260, 4);
      }
    }
    d.clampKeepersOnPitch?.();
    return { ok: true, kind: "counter", attackSide, outcome: finish, phase: "transition" };
  }

  async function playCross(api, attackSide = "home", opts = {}) {
    const d = director(api, opts);
    d.snapshot();
    const atk = d.playersOf(attackSide);
    const defSide = opp(attackSide);
    const dir = dirOf(attackSide);
    const wingV = d.rand() > 0.5 ? 0.16 : 0.84;
    const winger =
      pick(d.byRole(atk, "FW"), (p) => Math.abs(p.v - wingV) < 0.28) ||
      pick(d.byRole(atk, "MF"), (p) => Math.abs(p.v - wingV) < 0.35) ||
      pick(d.byRole(atk, "FW"));
    const target = pick(d.byRole(atk, "FW"), (p) => p !== winger) || pick(d.byRole(atk, "MF"));
    const trailer = pick(d.byRole(atk, "MF"), (p) => p !== winger && p !== target);
    if (!winger || !target) return { ok: false, reason: "sem ponta", kind: "cross" };

    const wingU = clamp01(0.58 + dir * 0.2);
    await stagePossession(d, attackSide, winger, 0.7);
    await d.carry(winger, wingU, wingV, 500);
    await syncShapes(d, attackSide, wingU, wingV, 0.85);

    const boxU = attackSide === "home" ? 0.86 : 0.14;
    await Promise.all([
      d.move(target, boxU, 0.48, 420),
      trailer ? d.makeRun(trailer, attackSide, "cutback") : Promise.resolve(),
    ]);
    await d.pass(winger, target, "cross");

    const outcome = opts.outcome || (d.rand() < 0.2 ? "goal" : d.rand() < 0.45 ? "save" : "miss");
    if (outcome === "goal") {
      await d.moveBallTo(goalMouthU(attackSide), 0.48, 340, 8);
    } else if (outcome === "save") {
      const gk = pick(d.byRole(d.playersOf(defSide), "GK"));
      if (gk) {
        const centerV = global.MatchViewGeometry?.BALL_KICKOFF?.v ?? 0.5;
        const gkt = d.gkTarget(gk, boxU, centerV, defSide);
        if (gkt) await d.move(gk, gkt.u, gkt.v, 200);
        await d.moveBallTo(gk.u, gk.v, 280, 4);
      }
    } else if (outcome === "miss") {
      // Cruzamento/cabeceio para fora — bola sai do campo
      if (typeof d.ballOut === "function") {
        await d.ballOut(attackSide, "goal", wingV < 0.5 ? "far" : "near");
      } else {
        await d.moveBallTo(goalMouthU(attackSide), wingV < 0.5 ? -0.08 : 1.08, 420, 6, {
          allowOut: true,
        });
      }
    }
    d.clampKeepersOnPitch?.();
    return { ok: true, kind: "cross", attackSide, outcome, phase: "outcome" };
  }

  const CATALOG = {
    buildup: { label: "Construção", run: playBuildUp, weight: 28 },
    shot: { label: "Chute", run: playShot, weight: 18 },
    corner: { label: "Escanteio", run: playCorner, weight: 10 },
    tackle: { label: "Desarme", run: playTackle, weight: 16 },
    counter: { label: "Contra-ataque", run: playCounter, weight: 12 },
    cross: { label: "Cruzamento", run: playCross, weight: 16 },
  };

  async function finishPlay(api, opts, result) {
    const d = director(api, opts);
    d.clampKeepersOnPitch?.();
    const doFade = !opts.skipFade && !opts.instant && typeof d.fadeField === "function";
    if (opts.skipSoftReset) {
      // match-sim controla fade + reset entre jogadas
      return result;
    }
    if (doFade) await d.fadeField(0, 200);
    // Bola parada / gol → reform forte (formação limpa)
    if (result?.needsHardReset || result?.kind === "corner") {
      if (typeof api.softReset === "function") await api.softReset(1);
      else if (typeof d.softResetShape === "function") await d.softResetShape(1, 360);
      d.clampKeepersOnPitch?.();
      if (doFade) await d.fadeField(1, 280);
      return result;
    }
    if (typeof d.softResetShape === "function") {
      await d.softResetShape(1, 340);
    }
    d.clampKeepersOnPitch?.();
    if (doFade) await d.fadeField(1, 280);
    return result;
  }

  async function playDemo(api, kind, attackSide = "home", opts = {}) {
    const entry = CATALOG[kind];
    if (!entry) return { ok: false, reason: "jogada desconhecida" };
    if (api.isPlaying?.()) return { ok: false, reason: "já animando" };
    api.setPlaying?.(true);
    try {
      const d0 = director(api, opts);
      const doFade = !opts.skipFade && !opts.instant && typeof d0.fadeField === "function";
      if (doFade) {
        // Início de jogada: fade leve → revela ação
        await d0.fadeField(0, 160);
        await d0.fadeField(1, 220);
      }
      const result = await entry.run(api, attackSide, opts);
      if (result?.ok) await finishPlay(api, opts, result);
      return result;
    } finally {
      api.setPlaying?.(false);
    }
  }

  global.MatchViewPlaybook = {
    CATALOG,
    playDemo,
    playBuildUp,
    playShot,
    playCorner,
    playTackle,
    playCounter,
    playCross,
  };
})(typeof window !== "undefined" ? window : globalThis);
