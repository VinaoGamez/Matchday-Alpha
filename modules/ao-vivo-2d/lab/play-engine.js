/**
 * Motor de coreografia 2D — posicionamento tático (visão estilo FM).
 *
 * Modelo:
 * - Cada jogador tem âncora (formação / snapshot)
 * - IP: amplitude, half-spaces, suporte em triângulo, rest defense (CB atrás / FB sobe)
 * - OOP: bloco compacto, cover shadow, pressão só 1–2, GK no ângulo
 * - Alvos são espaçados ANTES de animar (tokens ~40px não podem empilhar)
 * - shapeBoth marca contra posições planejadas do ataque
 */
(function (global) {
  "use strict";

  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot((a.u ?? 0) - (b.u ?? 0), (a.v ?? 0) - (b.v ?? 0));

  /** Distância elíptica: lateral (v) pesa mais — sprites altos + perspectiva. */
  function ellipDist(a, b, vWeight = 1.35) {
    const du = (a.u ?? 0) - (b.u ?? 0);
    const dv = ((a.v ?? 0) - (b.v ?? 0)) * vWeight;
    return Math.hypot(du, dv);
  }

  const SPACE_SAME = 0.062;
  const SPACE_OPP = 0.044;
  /** Marcação DF×FW: pode ficar mais perto (mescla), não empurrar para blocos separados */
  const SPACE_MARK = 0.032;

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function rand() {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function sleep(ms, instant) {
    if (instant || ms <= 0) return Promise.resolve();
    return new Promise((r) => setTimeout(r, ms));
  }

  function playersOf(entities, team) {
    return (entities || []).filter((e) => e.kind === "player" && (!team || e.team === team));
  }

  function byRole(list, role) {
    return list.filter((p) => p.role === role);
  }

  function pickClosest(list, u, v) {
    let best = null;
    let bestD = Infinity;
    for (const p of list || []) {
      const d = Math.hypot(p.u - u, p.v - v);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  function attackDir(side) {
    return side === "home" ? 1 : -1;
  }

  function ownGoalU(side) {
    return side === "home" ? 0.04 : 0.96;
  }

  function ballTravelMs(from, to, pace = 1) {
    const d = dist(from, to);
    return clamp(Math.round((280 + d * 900) / pace), 180, 1100);
  }

  function ballElevation(from, to, kind = "pass") {
    const d = dist(from, to);
    if (kind === "cross" || kind === "corner") return clamp(14 + d * 28, 16, 34);
    if (kind === "shot") return clamp(8 + d * 12, 6, 22);
    if (d < 0.12) return 0;
    if (d < 0.22) return 4 + d * 10;
    return clamp(8 + d * 18, 8, 26);
  }

  /** Espalha jogadores em faixas v distintas (evita empilhar no mesmo corredor). */
  function assignLanes(players, vCenter, spread, minGap = 0.07) {
    const sorted = players.slice().sort((a, b) => a.v - b.v);
    const n = sorted.length;
    if (!n) return new Map();
    const lanes = new Map();
    const total = Math.max(spread, minGap * (n - 1));
    const start = vCenter - total / 2;
    sorted.forEach((p, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1);
      lanes.set(p.id, clamp(start + t * total, 0.08, 0.92));
    });
    return lanes;
  }

  /**
   * Empurra pontos até respeitar distância mínima (in-place).
   * @param {Array<{u,v,team,role,id,movable?:boolean}>} points
   */
  function spacePoints(points, iterations = 10) {
    if (!points?.length) return points;
    for (let n = 0; n < iterations; n++) {
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i];
          const b = points[j];
          const same = a.team === b.team;
          let minD = same ? SPACE_SAME : SPACE_OPP;
          // duelo marcador×atacante: mantém folga de marcação, não cola
          if (!same && ((a.role === "DF" && b.role === "FW") || (a.role === "FW" && b.role === "DF"))) {
            minD = SPACE_MARK;
          }
          if (a.role === "GK" || b.role === "GK") minD = Math.min(minD, 0.045);

          const d = ellipDist(a, b) || 0.0001;
          if (d >= minD) continue;

          const push = (minD - d) * 0.62;
          const du = a.u - b.u;
          const dv = (a.v - b.v) * 1.35;
          const len = Math.hypot(du, dv) || 0.0001;
          const nu = du / len;
          const nv = (dv / len) / 1.35; // volta ao espaço v real

          const aMove = a.movable !== false;
          const bMove = b.movable !== false;
          if (aMove && bMove) {
            a.u = clamp(a.u + nu * push * 0.45, 0.03, 0.97);
            a.v = clamp(a.v + nv * push * 0.85, 0.06, 0.94);
            b.u = clamp(b.u - nu * push * 0.45, 0.03, 0.97);
            b.v = clamp(b.v - nv * push * 0.85, 0.06, 0.94);
          } else if (aMove) {
            a.u = clamp(a.u + nu * push * 0.9, 0.03, 0.97);
            a.v = clamp(a.v + nv * push * 1.1, 0.06, 0.94);
          } else if (bMove) {
            b.u = clamp(b.u - nu * push * 0.9, 0.03, 0.97);
            b.v = clamp(b.v - nv * push * 1.1, 0.06, 0.94);
          }
        }
      }
    }
    return points;
  }

  /**
   * Classifica DF por faixa: 0=extremo baixo-v, n-1=extremo alto-v.
   * Extremos = laterais; miolo = zagueiros.
   */
  function dfChannelIndex(dfs) {
    const sorted = dfs.slice().sort((a, b) => a.v - b.v);
    const map = new Map();
    sorted.forEach((p, i) => map.set(p.id, { index: i, n: sorted.length, isWide: i === 0 || i === sorted.length - 1 }));
    return map;
  }

  function teamMetrics(players) {
    if (!players.length) {
      return { width: 0, depth: 0, minSep: 1, centroid: { u: 0.5, v: 0.5 } };
    }
    const vs = players.map((p) => p.v);
    const us = players.map((p) => p.u);
    const width = Math.max(...vs) - Math.min(...vs);
    const depth = Math.max(...us) - Math.min(...us);
    let minSep = Infinity;
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        minSep = Math.min(minSep, dist(players[i], players[j]));
      }
    }
    return {
      width,
      depth,
      minSep: minSep === Infinity ? 1 : minSep,
      centroid: {
        u: us.reduce((s, x) => s + x, 0) / us.length,
        v: vs.reduce((s, x) => s + x, 0) / vs.length,
      },
    };
  }

  /** Distância perpendicular do ponto P à reta A→B (em UV). */
  function lineDistance(p, a, b) {
    const dx = b.u - a.u;
    const dy = b.v - a.v;
    const len = Math.hypot(dx, dy) || 1e-6;
    return Math.abs(dy * p.u - dx * p.v + b.u * a.v - b.v * a.u) / len;
  }

  function createDirector(api, opts = {}) {
    const pace = opts.pace > 0 ? opts.pace : 1;
    const instant = !!opts.instant;
    const rand = mulberry32(opts.seed != null ? opts.seed : 0xc0ffee);
    let anchors = new Map();

    function entities() {
      return api.getMatchEntities() || [];
    }

    function ball() {
      return entities().find((e) => e.kind === "ball") || null;
    }

    function snapshot() {
      anchors = new Map();
      for (const e of entities()) {
        if (e.kind !== "player") continue;
        anchors.set(e.id, { u: e.u, v: e.v, role: e.role, team: e.team });
      }
      return anchors;
    }

    function anchorOf(p) {
      return anchors.get(p.id) || { u: p.u, v: p.v, role: p.role, team: p.team };
    }

    /** Limita quanto o jogador pode sair da âncora (forma preservada). */
    function blendFromAnchor(p, targetU, targetV, maxStep = 0.14) {
      const a = anchorOf(p);
      let u = targetU;
      let v = targetV;
      const du = u - a.u;
      const dv = v - a.v;
      const d = Math.hypot(du, dv);
      if (d > maxStep) {
        u = a.u + (du / d) * maxStep;
        v = a.v + (dv / d) * maxStep;
      }
      return { u: clamp(u, 0.03, 0.97), v: clamp(v, 0.06, 0.94) };
    }

    async function move(entity, u, v, duration) {
      if (!entity) return;
      let tu = u;
      let tv = v;
      const G = global.MatchViewGeometry;
      if (entity.role === "GK" && entity.team && G?.clampToSixYardArea) {
        const c = G.clampToSixYardArea(tu, tv, entity.team, G.SIX_YARD_AREAS, G.FIELD_CORNERS);
        tu = c.u;
        tv = c.v;
      }
      const dur = instant ? 0 : Math.max(0, Math.round((duration || 500) / pace));
      await api.moveEntity(entity, tu, tv, dur);
    }

    async function moveBallTo(u, v, duration, elevation = 0, opts = {}) {
      const dur = instant ? 0 : Math.max(0, Math.round((duration || 400) / pace));
      if (typeof api.moveBall === "function") {
        await api.moveBall(u, v, dur, elevation, opts);
      }
    }

    /**
     * Bola “nas botas” do jogador — sem voo sozinho pelo campo.
     * duration=0: teleporte (início de jogada / pós-forma).
     */
    async function giveBall(player, duration = 0) {
      if (!player) return;
      const feetU = clamp(player.u + 0.01, 0.02, 0.98);
      const feetV = clamp(player.v, 0.04, 0.96);
      await moveBallTo(feetU, feetV, duration, 0);
    }

    /**
     * Bola sai TOTALmente do gramado (linhas laterais ou fundo).
     * line: 'touch' | 'goal' · side: 'near' | 'far'
     */
    async function ballOut(attackSide, line = "touch", edge = "near") {
      const b = ball();
      const from = b ? { u: b.u, v: b.v } : { u: 0.5, v: 0.34 };
      let u;
      let v;
      if (line === "goal") {
        u = attackSide === "home" ? 1.07 : -0.07;
        v = edge === "near" ? 0.12 : 0.88;
      } else {
        u = clamp(from.u + (attackSide === "home" ? 0.08 : -0.08), 0.15, 0.85);
        v = edge === "near" ? 1.08 : -0.08;
      }
      const elev = line === "goal" ? 6 : 3;
      const ms = ballTravelMs(from, { u, v }, pace);
      await moveBallTo(u, v, ms, elev, { allowOut: true });
      return { u, v };
    }

    async function fadeField(toOpacity, duration = 240) {
      if (typeof api.fadeField !== "function") return;
      const dur = instant ? 0 : Math.max(0, Math.round(duration / pace));
      await api.fadeField(toOpacity, dur);
    }

    /**
     * Separa alvos no espaço da TELA (trapézio FIELD_CORNERS), não em UV linear.
     * Respeita a angulação do estádio.
     */
    function spaceStepsInStadium(playerSteps, staticPlayers) {
      const G = global.MatchViewGeometry;
      if (!G?.mapToField || !G?.screenToUV) return false;
      const corners = G.FIELD_CORNERS;
      const pts = playerSteps.map((s) => {
        const scr = G.mapToField(s.u, s.v, corners);
        const isGk = s.entity?.role === "GK" || s.isGk;
        return {
          _step: s,
          sx: scr.x,
          sy: scr.y,
          scale: G.getPerspectiveScale(s.v),
          movable: !isGk,
          isGk,
        };
      });
      for (const p of staticPlayers) {
        const scr = G.mapToField(p.u, p.v, corners);
        const isGk = p.role === "GK";
        pts.push({
          entity: p,
          sx: scr.x,
          sy: scr.y,
          scale: G.getPerspectiveScale(p.v),
          movable: false,
          isGk,
        });
      }
      for (let n = 0; n < 12; n++) {
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            const a = pts[i];
            const b = pts[j];
            let dx = a.sx - b.sx;
            let dy = a.sy - b.sy;
            let d = Math.hypot(dx, dy);
            const aEnt = a._step?.entity || a.entity;
            const bEnt = b._step?.entity || b.entity;
            const aRole = aEnt?.role;
            const bRole = bEnt?.role;
            const aTeam = aEnt?.team;
            const bTeam = bEnt?.team;
            const markPair =
              aTeam !== bTeam &&
              ((aRole === "DF" && bRole === "FW") || (aRole === "FW" && bRole === "DF"));
            const same = aTeam === bTeam;
            const minPx =
              (markPair ? 20 : same ? 34 : 24) * ((a.scale + b.scale) / 2);
            if (d < 1e-4) {
              dx = 1;
              dy = 0;
              d = 1;
            }
            if (d >= minPx) continue;
            const push = (minPx - d) * 0.55;
            const nx = dx / d;
            const ny = dy / d;
            if (a.movable && b.movable) {
              a.sx += nx * push * 0.8;
              a.sy += ny * push * 0.55;
              b.sx -= nx * push * 0.8;
              b.sy -= ny * push * 0.55;
            } else if (a.movable) {
              a.sx += nx * push;
              a.sy += ny * push * 0.55;
            } else if (b.movable) {
              b.sx -= nx * push;
              b.sy -= ny * push * 0.55;
            }
          }
        }
      }
      for (const pt of pts) {
        if (!pt._step) continue;
        const uv = G.screenToUV(pt.sx, pt.sy, corners);
        pt._step.u = uv.u;
        pt._step.v = uv.v;
      }
      return true;
    }

    /** Ajusta alvos dos steps contra obstáculo dos que ficam parados. */
    function spaceMoveSteps(steps) {
      const playerSteps = steps.filter((s) => s.entity && s.entity.kind === "player" && !s.ball);
      if (!playerSteps.length) return;

      // Moves do WorldPitch já passaram por spaceInStadiumScreen — não re-esmagar em UV
      if (playerSteps.every((s) => s.fromWorld)) return;

      const movingIds = new Set(playerSteps.map((s) => s.entity.id));
      const staticPlayers = playersOf(entities()).filter((p) => !movingIds.has(p.id));

      if (spaceStepsInStadium(playerSteps, staticPlayers)) return;

      const points = playerSteps.map((s) => ({
        id: s.entity.id,
        team: s.entity.team,
        role: s.entity.role,
        u: s.u,
        v: s.v,
        movable: true,
        _step: s,
      }));
      for (const p of staticPlayers) {
        points.push({
          id: p.id,
          team: p.team,
          role: p.role,
          u: p.u,
          v: p.v,
          movable: false,
        });
      }
      spacePoints(points, 12);
      for (const pt of points) {
        if (!pt._step) continue;
        pt._step.u = pt.u;
        pt._step.v = pt.v;
      }
    }

    /**
     * Move vários. Espaça alvos antes; stagger em ondas no modo animado.
     */
    async function moveMany(steps, staggerMs = 0) {
      const list = (steps || []).filter(Boolean);
      if (!list.length) return;
      spaceMoveSteps(list);
      if (instant || staggerMs <= 0) {
        await Promise.all(
          list.map((s) => {
            if (s.entity?.kind === "ball" || s.ball) {
              return moveBallTo(s.u, s.v, s.duration, s.elevation || 0);
            }
            return move(s.entity, s.u, s.v, s.duration);
          })
        );
        return;
      }
      await Promise.all(
        list.map(async (s, i) => {
          await sleep((s.delay || i * staggerMs) / pace, false);
          if (s.entity?.kind === "ball" || s.ball) {
            return moveBallTo(s.u, s.v, s.duration, s.elevation || 0);
          }
          return move(s.entity, s.u, s.v, s.duration);
        })
      );
    }

    /** Separa no estado atual — preferindo px do estádio (trapézio). */
    function separate(minDist = SPACE_SAME, iterations = 8) {
      void minDist;
      const pls = playersOf(entities());
      const G = global.MatchViewGeometry;
      if (G?.mapToField && G?.screenToUV) {
        const fakeSteps = pls.map((p) => ({ entity: p, u: p.u, v: p.v }));
        spaceStepsInStadium(fakeSteps, []);
        for (const s of fakeSteps) {
          s.entity.u = s.u;
          s.entity.v = s.v;
        }
      } else {
        const points = pls.map((p) => ({
          id: p.id,
          team: p.team,
          role: p.role,
          u: p.u,
          v: p.v,
          movable: true,
          _p: p,
        }));
        spacePoints(points, iterations);
        for (const pt of points) {
          pt._p.u = pt.u;
          pt._p.v = pt.v;
        }
      }
      if (typeof api.syncPositions === "function") {
        api.syncPositions();
      }
    }

    /**
     * GK no eixo bola → centro do gol, SEMPRE na pequena área (calibração do estádio).
     */
    function gkTarget(gk, ballU, ballV, side) {
      if (!gk) return null;
      const G = global.MatchViewGeometry;
      const goalU = ownGoalU(side);
      const goalV = G?.BALL_KICKOFF?.v ?? 0.5;
      // ameaça: bola longe → perto da linha; bola perto → corta ângulo (ainda na 6 jardas)
      const threat = Math.abs(ballU - goalU);
      const t = threat > 0.55 ? 0.08 : threat > 0.35 ? 0.12 : 0.18;
      let u = lerp(goalU, ballU, t);
      let v = lerp(goalV, ballV, 0.4);
      if (G?.clampToSixYardArea) {
        return G.clampToSixYardArea(u, v, side, G.SIX_YARD_AREAS, G.FIELD_CORNERS);
      }
      const uLo = side === "home" ? 0.02 : 0.86;
      const uHi = side === "home" ? 0.14 : 0.98;
      return { u: clamp(u, uLo, uHi), v: clamp(v, goalV - 0.12, goalV + 0.12) };
    }

    function clampKeepersOnPitch() {
      const G = global.MatchViewGeometry;
      const pls = playersOf(entities());
      if (G?.clampToSixYardArea) {
        for (const p of pls) {
          if (p.role !== "GK") continue;
          const c = G.clampToSixYardArea(p.u, p.v, p.team, G.SIX_YARD_AREAS, G.FIELD_CORNERS);
          p.u = c.u;
          p.v = c.v;
        }
      }
      // Bolha UV: de linha longe do próprio GK (anti-pilha na pequena área / telão)
      for (const gk of pls.filter((p) => p.role === "GK")) {
        for (const p of pls) {
          if (p.role === "GK" || p.team !== gk.team) continue;
          const d = Math.hypot(p.u - gk.u, (p.v - gk.v) * 1.15);
          const minD = 0.055;
          if (d >= minD) continue;
          const push = (minD - d) * 0.9;
          const nx = d < 1e-6 ? (gk.team === "home" ? 1 : -1) : (p.u - gk.u) / d;
          const ny = d < 1e-6 ? 0 : (p.v - gk.v) / d;
          p.u = clamp(p.u + nx * push, 0.02, 0.98);
          p.v = clamp(p.v + ny * push * 0.7, 0.04, 0.96);
          if (gk.team === "home") p.u = Math.max(p.u, gk.u + 0.045);
          else p.u = Math.min(p.u, gk.u - 0.045);
        }
      }
      if (typeof api.syncPositions === "function") api.syncPositions();
    }

    async function softResetShape(t = 0.55, duration = 420) {
      const W = worldPitch();
      if (W?.planSoftResetMoves) {
        const ball = entities().find((e) => e.kind === "ball");
        const moves = W.planSoftResetMoves(entities(), t, {
          seed: opts.seed,
          duration,
          ballU: ball?.u,
          ballV: ball?.v,
        });
        await moveMany(moves, 0);
        clampKeepersOnPitch();
        separate();
        clampKeepersOnPitch();
        return;
      }
      await restore(duration);
      clampKeepersOnPitch();
    }

    function collectIpMoves(attackSide, ballU, ballV, intensity, skip) {
      const atk = playersOf(entities(), attackSide);
      const dir = attackDir(attackSide);
      const dfs = byRole(atk, "DF");
      const mfs = byRole(atk, "MF");
      const fws = byRole(atk, "FW");
      const gk = byRole(atk, "GK")[0];
      const moves = [];
      const channels = dfChannelIndex(dfs);
      // overload leve para o lado da bola
      const ballBias = (ballV - 0.5) * 0.12 * intensity;

      const dfLanes = assignLanes(dfs, 0.5 + ballBias * 0.5, 0.68);
      dfs.forEach((p) => {
        if (skip.has(p.id)) return;
        const ch = channels.get(p.id) || { isWide: false, index: 0 };
        const lane = dfLanes.get(p.id) ?? p.v;
        // CB: rest defense mais fundo; FB: sobe e segura amplitude
        const depthBehind = ch.isWide ? 0.08 : 0.16;
        const lineU = clamp(ballU - dir * depthBehind, 0.06, 0.94);
        const vTarget = ch.isWide ? lerp(lane, ballV < 0.5 ? 0.12 : 0.88, 0.15) : lane;
        const tgt = blendFromAnchor(
          p,
          lerp(p.u, lineU, 0.58 * intensity),
          lerp(p.v, vTarget, 0.55 * intensity),
          ch.isWide ? 0.14 : 0.11
        );
        moves.push({
          entity: p,
          u: tgt.u,
          v: tgt.v,
          duration: 460 + (ch.isWide ? 40 : 0),
          delay: ch.isWide ? 40 : 0,
        });
      });

      // meios: pivô atrás + half-spaces fixos + avançado
      const mfSorted = mfs
        .slice()
        .sort((a, b) => dist(a, { u: ballU, v: ballV }) - dist(b, { u: ballU, v: ballV }));
      const halfL = clamp(0.24 + ballBias, 0.12, 0.38);
      const halfR = clamp(0.76 + ballBias, 0.62, 0.88);
      const supportSlots = [
        { du: -0.07 * dir, v: clamp(ballV + (ballV < 0.5 ? 0.04 : -0.04), 0.2, 0.8) }, // pivô
        { du: 0.01 * dir, v: halfL },
        { du: 0.01 * dir, v: halfR },
        { du: 0.08 * dir, v: lerp(ballV, 0.5, 0.25) },
      ];
      mfSorted.forEach((p, i) => {
        if (skip.has(p.id)) return;
        const slot = supportSlots[i % supportSlots.length];
        const tgt = blendFromAnchor(
          p,
          ballU + slot.du * intensity,
          lerp(p.v, slot.v, 0.75 * intensity),
          i === 0 ? 0.11 : 0.16
        );
        moves.push({ entity: p, u: tgt.u, v: tgt.v, duration: 400 + i * 28, delay: 30 + i * 20 });
      });

      // atacantes: um no canal da bola, extremos esticam
      const fwSorted = fws.slice().sort((a, b) => a.v - b.v);
      const fwLanes = assignLanes(fwSorted, ballV + ballBias, 0.62, 0.09);
      fwSorted.forEach((p, i) => {
        if (skip.has(p.id)) return;
        const lane = fwLanes.get(p.id) ?? p.v;
        const isCentral = Math.abs(lane - ballV) < 0.12 || i === Math.floor(fwSorted.length / 2);
        const push = isCentral ? 0.08 : 0.05;
        const tgt = blendFromAnchor(
          p,
          ballU + dir * push * intensity,
          lerp(p.v, lane, 0.7),
          0.17
        );
        moves.push({ entity: p, u: tgt.u, v: tgt.v, duration: 440 + i * 30, delay: 50 + i * 25 });
      });

      if (gk && !skip.has(gk.id)) {
        const tgt = blendFromAnchor(gk, gk.u + dir * 0.012, lerp(gk.v, 0.5, 0.25), 0.05);
        moves.push({ entity: gk, u: tgt.u, v: tgt.v, duration: 380, delay: 0 });
      }

      return moves;
    }

    function attPos(att, planned) {
      if (planned && planned.has(att.id)) return planned.get(att.id);
      return { u: att.u, v: att.v };
    }

    function collectOopMoves(defSide, ballU, ballV, intensity, skip, plannedAtk = null) {
      const def = playersOf(entities(), defSide);
      const atkSide = defSide === "home" ? "away" : "home";
      const attackers = playersOf(entities(), atkSide).filter((p) => p.role !== "GK");
      const towardOwn = defSide === "home" ? -1 : 1;
      const dfs = byRole(def, "DF");
      const mfs = byRole(def, "MF");
      const fws = byRole(def, "FW");
      const gk = byRole(def, "GK")[0];
      const moves = [];

      // altura do bloco: bola no terço alto → mid-block; no terço baixo → low
      const threat = defSide === "home" ? ballU : 1 - ballU;
      const blockDepth = threat > 0.62 ? 0.09 : threat > 0.4 ? 0.12 : 0.16;

      const pressPool = mfs
        .concat(fws)
        .sort((a, b) => dist(a, { u: ballU, v: ballV }) - dist(b, { u: ballU, v: ballV }));
      const pressers = pressPool.slice(0, Math.min(2, pressPool.length));
      const pressSet = new Set(pressers.map((p) => p.id));

      const marked = new Set();
      const markPairs = [];
      const dfsByDist = dfs
        .slice()
        .sort((a, b) => dist(a, { u: ballU, v: ballV }) - dist(b, { u: ballU, v: ballV }));
      for (const df of dfsByDist) {
        let best = null;
        let bestD = Infinity;
        for (const att of attackers) {
          if (marked.has(att.id)) continue;
          const ap = attPos(att, plannedAtk);
          const d = dist(df, ap) - (att.role === "FW" ? 0.04 : 0);
          if (d < bestD) {
            bestD = d;
            best = att;
          }
        }
        if (best) {
          marked.add(best.id);
          markPairs.push({ df, att: best });
        }
      }

      const goalU = ownGoalU(defSide);
      const lineU = clamp(ballU + towardOwn * (blockDepth + 0.03 * intensity), 0.05, 0.95);
      // compacto, mas com faixas largas o bastante para tokens
      const compactCenter = lerp(0.5, ballV, 0.28 * intensity);
      const dfLanes = assignLanes(dfs, compactCenter, 0.55, 0.078);

      dfs.forEach((p, i) => {
        if (skip.has(p.id)) return;
        const pair = markPairs.find((x) => x.df === p);
        let v = dfLanes.get(p.id) ?? p.v;
        let u = lineU;
        if (pair) {
          const ap = attPos(pair.att, plannedAtk);
          // cover shadow com folga — nunca no mesmo ponto do atacante
          u = lerp(ap.u, goalU, 0.34);
          u = lerp(u, lineU, 0.35);
          v = lerp(ap.v, dfLanes.get(p.id) ?? compactCenter, 0.4);
          // offset lateral estável por índice (evita empilhar dois DF no mesmo v)
          v = clamp(v + (i - (dfs.length - 1) / 2) * 0.022, 0.1, 0.9);
        }
        const tgt = blendFromAnchor(p, u, v, 0.14);
        moves.push({ entity: p, u: tgt.u, v: tgt.v, duration: 420 + i * 18, delay: i * 15 });
      });

      const midBlock = mfs.concat(fws).filter((x) => !pressSet.has(x.id));
      const blockLanes = assignLanes(midBlock, compactCenter, 0.52, 0.075);
      const midU = clamp(ballU + towardOwn * (0.05 + blockDepth * 0.3), 0.05, 0.95);

      mfs.concat(fws).forEach((p, i) => {
        if (skip.has(p.id)) return;
        if (pressSet.has(p.id)) {
          // pressão em ângulo — fica a ~SPACE_MARK da bola
          const ang = p.v < ballV ? -0.055 : 0.055;
          const u = lerp(p.u, ballU + towardOwn * 0.045, 0.38 * intensity);
          const v = lerp(p.v, ballV + ang, 0.42 * intensity);
          const tgt = blendFromAnchor(p, u, v, 0.14);
          moves.push({ entity: p, u: tgt.u, v: tgt.v, duration: 360, delay: 10 });
          return;
        }
        const v = clamp(blockLanes.get(p.id) ?? lerp(p.v, compactCenter, 0.4), 0.12, 0.88);
        const tgt = blendFromAnchor(p, lerp(p.u, midU, 0.55), v, 0.12);
        moves.push({ entity: p, u: tgt.u, v: tgt.v, duration: 440 + i * 12, delay: 25 + i * 12 });
      });

      if (gk && !skip.has(gk.id)) {
        const tgt = gkTarget(gk, ballU, ballV, defSide);
        if (tgt) moves.push({ entity: gk, u: tgt.u, v: tgt.v, duration: 340, delay: 0 });
      }

      return { moves, pressers, markPairs };
    }

    function worldPitch() {
      return global.MatchViewWorldPitch || null;
    }

    /** Preferência: WorldPitch (metros) → espelho UV. Fallback: shapes UV legados. */
    async function applyWorldShape(mode, side, ballU, ballV, intensity) {
      const W = worldPitch();
      if (!W?.planShapeMoves) return null;
      const planned = W.planShapeMoves(entities(), side, ballU, ballV, intensity, mode, {
        seed: opts.seed,
        settleCycles: instant ? 14 : 10,
        duration: instant ? 0 : 460,
      });
      await moveMany(planned.moves, instant ? 0 : 14);
      separate();
      clampKeepersOnPitch();
      separate();
      clampKeepersOnPitch();
      return planned;
    }

    async function shapeInPossession(attackSide, ballU, ballV, intensity = 1, exceptIds = null) {
      const fromWorld = await applyWorldShape("ip", attackSide, ballU, ballV, intensity);
      if (fromWorld) {
        return teamMetrics(playersOf(entities(), attackSide).filter((p) => p.role !== "GK"));
      }
      const skip = exceptIds instanceof Set ? exceptIds : new Set(exceptIds || []);
      const moves = collectIpMoves(attackSide, ballU, ballV, intensity, skip);
      await moveMany(moves, instant ? 0 : 18);
      separate();
      const atk = playersOf(entities(), attackSide);
      return teamMetrics(atk.filter((p) => p.role !== "GK"));
    }

    async function shapeOutOfPossession(defSide, ballU, ballV, intensity = 1, exceptIds = null) {
      const fromWorld = await applyWorldShape("oop", defSide, ballU, ballV, intensity);
      if (fromWorld) {
        return {
          pressers: [],
          markPairs: [],
          metrics: teamMetrics(playersOf(entities(), defSide).filter((p) => p.role !== "GK")),
        };
      }
      const skip = exceptIds instanceof Set ? exceptIds : new Set(exceptIds || []);
      const { moves, pressers, markPairs } = collectOopMoves(defSide, ballU, ballV, intensity, skip);
      await moveMany(moves, instant ? 0 : 16);
      separate();
      const outfield = playersOf(entities(), defSide).filter((p) => p.role !== "GK");
      return { pressers, markPairs, metrics: teamMetrics(outfield) };
    }

    /** Aplica IP + OOP via WorldPitch (ou fallback UV). */
    async function shapeBoth(attackSide, ballU, ballV, intensity = 1) {
      const defSide = attackSide === "home" ? "away" : "home";
      const fromWorld = await applyWorldShape("both", attackSide, ballU, ballV, intensity);
      if (fromWorld) {
        return {
          ip: teamMetrics(playersOf(entities(), attackSide).filter((p) => p.role !== "GK")),
          oop: {
            pressers: [],
            markPairs: [],
            metrics: teamMetrics(playersOf(entities(), defSide).filter((p) => p.role !== "GK")),
            world: fromWorld.world,
          },
        };
      }
      const skip = new Set();
      const ipMoves = collectIpMoves(attackSide, ballU, ballV, intensity, skip);
      const planned = new Map(ipMoves.map((m) => [m.entity.id, { u: m.u, v: m.v }]));
      const oop = collectOopMoves(defSide, ballU, ballV, intensity * 0.95, skip, planned);
      await moveMany(ipMoves.concat(oop.moves), instant ? 0 : 14);
      separate();
      return {
        ip: teamMetrics(playersOf(entities(), attackSide).filter((p) => p.role !== "GK")),
        oop: {
          pressers: oop.pressers,
          markPairs: oop.markPairs,
          metrics: teamMetrics(playersOf(entities(), defSide).filter((p) => p.role !== "GK")),
        },
      };
    }

    async function offerSupport(attackSide, ballU, ballV, intensity = 1) {
      return shapeInPossession(attackSide, ballU, ballV, intensity);
    }

    async function pressBlock(defSide, ballU, ballV, intensity = 1) {
      const r = await shapeOutOfPossession(defSide, ballU, ballV, intensity);
      return r.pressers;
    }

    async function pass(fromPlayer, toPlayer, kind = "pass") {
      if (!fromPlayer || !toPlayer) return { ok: false };
      // Garante que a bola parte dos pés do passador (nunca de um ponto órfão)
      const b = ball();
      if (!b || Math.hypot(b.u - fromPlayer.u, b.v - fromPlayer.v) > 0.04) {
        await giveBall(fromPlayer, 0);
      }
      const from = { u: fromPlayer.u, v: fromPlayer.v };
      const a = anchorOf(toPlayer);
      // ângulo de suporte (~30–45°): afasta em v e ligeiramente sobe/desce em u
      const sideSign = toPlayer.v < from.v ? -1 : toPlayer.v > from.v ? 1 : a.v < 0.5 ? -1 : 1;
      const meet = blendFromAnchor(
        toPlayer,
        fromPlayer.u + attackDir(toPlayer.team) * 0.04,
        fromPlayer.v + sideSign * 0.07,
        0.12
      );
      if (dist(from, meet) < 0.1) {
        meet.v = clamp(meet.v + sideSign * 0.08, 0.08, 0.92);
      }
      // afasta receptor de quem já está perto do ponto de encontro
      const meetPts = [
        {
          id: toPlayer.id,
          team: toPlayer.team,
          role: toPlayer.role,
          u: meet.u,
          v: meet.v,
          movable: true,
        },
      ];
      for (const p of playersOf(entities())) {
        if (p.id === toPlayer.id) continue;
        meetPts.push({
          id: p.id,
          team: p.team,
          role: p.role,
          u: p.u,
          v: p.v,
          movable: false,
        });
      }
      spacePoints(meetPts, 8);
      meet.u = meetPts[0].u;
      meet.v = meetPts[0].v;

      const elev = ballElevation(from, meet, kind);
      const ms = ballTravelMs(from, meet, pace);
      await Promise.all([
        moveBallTo(meet.u, meet.v, ms, elev),
        move(toPlayer, meet.u, meet.v, ms * 0.8),
      ]);
      separate();
      return { ok: true, from, to: meet, ms, elev };
    }

    async function carry(player, u, v, duration = 500) {
      if (!player) return;
      const tgt = blendFromAnchor(player, u, v, 0.18);
      await moveMany([
        { entity: player, u: tgt.u, v: tgt.v, duration },
        { ball: true, u: tgt.u, v: tgt.v, duration: duration * 0.92, elevation: 0 },
      ]);
      separate();
    }

    async function makeRun(player, attackSide, style = "behind") {
      if (!player) return null;
      const dir = attackDir(attackSide);
      const a = anchorOf(player);
      let u = a.u;
      let v = a.v;
      if (style === "behind") {
        u = a.u + dir * 0.11;
        v = a.v + (a.v < 0.5 ? -0.035 : 0.035);
      } else if (style === "wide") {
        u = a.u + dir * 0.07;
        v = a.v < 0.5 ? 0.12 : 0.88;
      } else if (style === "cutback") {
        u = a.u + dir * 0.035;
        v = lerp(a.v, 0.5, 0.55);
      } else if (style === "halfspace") {
        u = a.u + dir * 0.08;
        v = a.v < 0.5 ? 0.32 : 0.68;
      }
      const tgt = blendFromAnchor(player, u, v, 0.17);
      await move(player, tgt.u, tgt.v, 480);
      return tgt;
    }

    async function restore(duration = 700) {
      if (!anchors.size) return;
      const moves = [];
      for (const e of playersOf(entities())) {
        const r = anchors.get(e.id);
        if (!r) continue;
        moves.push({ entity: e, u: r.u, v: r.v, duration });
      }
      await moveMany(moves);
      separate();
    }

    async function wait(ms) {
      await sleep(ms / pace, instant);
    }

    function metrics(team) {
      return teamMetrics(playersOf(entities(), team).filter((p) => p.role !== "GK"));
    }

    return {
      api,
      pace,
      instant,
      rand,
      entities,
      ball,
      playersOf: (team) => playersOf(entities(), team),
      byRole,
      pickClosest,
      snapshot,
      anchorOf,
      blendFromAnchor,
      move,
      moveBallTo,
      giveBall,
      ballOut,
      fadeField,
      moveMany,
      separate,
      shapeInPossession,
      shapeOutOfPossession,
      shapeBoth,
      offerSupport,
      pressBlock,
      gkTarget,
      clampKeepersOnPitch,
      softResetShape,
      makeRun,
      pass,
      carry,
      restore,
      wait,
      metrics,
      ballTravelMs: (a, b) => ballTravelMs(a, b, pace),
      ballElevation,
      dist,
      clamp,
      lerp,
      assignLanes,
      teamMetrics,
      lineDistance,
      dfChannelIndex,
    };
  }

  global.MatchViewPlayEngine = {
    createDirector,
    ballTravelMs,
    ballElevation,
    dist,
    ellipDist,
    spacePoints,
    mulberry32,
    playersOf,
    byRole,
    pickClosest,
    assignLanes,
    teamMetrics,
    attackDir,
    ownGoalU,
    lineDistance,
    dfChannelIndex,
    SPACE_SAME,
    SPACE_OPP,
  };
})(typeof window !== "undefined" ? window : globalThis);
