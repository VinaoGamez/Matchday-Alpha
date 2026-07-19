/**
 * Geometria do gramado (base 1672×940).
 * Calibração oficial: assets/match-view/layout.json (editor do usuário).
 */
(function (global) {
  "use strict";

  const BASE_W = 1672;
  const BASE_H = 940;
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  const AREA_CORNER_KEYS = ["farGoal", "farEdge", "nearEdge", "nearGoal"];

  const FIELD_CORNERS = {
    farLeft: { x: 432.98, y: 368.9 },
    farRight: { x: 1224.32, y: 368.9 },
    nearLeft: { x: 160, y: 756 },
    nearRight: { x: 1495.52, y: 758.35 },
  };

  const PENALTY_AREAS = {
    home: {
      farGoal: { x: 399.71, y: 416.23 },
      farEdge: { x: 542.22, y: 416.23 },
      nearEdge: { x: 451.19, y: 625.12 },
      nearGoal: { x: 251.38, y: 625.12 },
    },
    away: {
      farGoal: { x: 1112.42, y: 416.23 },
      farEdge: { x: 1258.23, y: 415.14 },
      nearEdge: { x: 1403.27, y: 626.22 },
      nearGoal: { x: 1202.37, y: 625.12 },
    },
  };

  const SIX_YARD_AREAS = {
    home: {
      farGoal: { x: 371.31, y: 452.69 },
      farEdge: { x: 424.39, y: 453.79 },
      nearEdge: { x: 365.77, y: 552.39 },
      nearGoal: { x: 300.67, y: 554.59 },
    },
    away: {
      farGoal: { x: 1227.78, y: 454.88 },
      farEdge: { x: 1284.15, y: 453.79 },
      nearEdge: { x: 1352.07, y: 552.39 },
      nearGoal: { x: 1290.26, y: 556.79 },
    },
  };

  const HALFWAY_LINE = {
    far: { x: 829.2, y: 368.9 },
    near: { x: 828.2, y: 756 },
  };

  const FIELD_SPOTS = {
    penaltyHome: { u: 0.1144, v: 0.3396 },
    penaltyAway: { u: 0.8856, v: 0.3396 },
    /** Cobranças de escanteio (cantos do gramado — calibração no editor) */
    cornerHomeFar: { u: 0, v: 0 },
    cornerHomeNear: { u: 0, v: 1 },
    cornerAwayFar: { u: 1, v: 0 },
    cornerAwayNear: { u: 1, v: 1 },
  };

  const CORNER_SPOT_KEYS = [
    "cornerHomeFar",
    "cornerHomeNear",
    "cornerAwayFar",
    "cornerAwayNear",
  ];

  /** Centro visual do gramado (círculo central do asset) — bola no kickoff. */
  const BALL_KICKOFF = { u: 0.5011, v: 0.3396 };

  /**
   * Placar: moldura + partes independentes (% relativo à moldura).
   * Partes: escudos, placar, timer, linha divisória, patrocínios.
   */
  const SCOREBOARD = {
    left: 38.779,
    top: 12.976,
    width: 22.708,
    height: 8.791,
    crestHome: { left: 3.47, top: 18.84, width: 13.99, height: 64.28 },
    crestAway: { left: 58.21, top: 18.84, width: 13.99, height: 64.28 },
    score: { left: 20.21, top: 26.52, width: 35.31, height: 35.16 },
    timer: { left: 28.15, top: 65.68, width: 20, height: 15 },
    divider: { left: 76.86, top: 23.42, width: 0.45, height: 56 },
    sponsor: { left: 80.99, top: 17.42, width: 15, height: 68.92, rotateMs: 4000 },
  };

  const SQUARE_SB_PARTS = ["crestHome", "crestAway", "sponsor"];

  /** Aspecto em px da moldura do placar na resolução base. */
  function scoreboardFrameAspect(sb) {
    const w = Math.max(0.001, sb.width);
    const h = Math.max(0.001, sb.height);
    return (w / h) * (BASE_W / BASE_H);
  }

  /** height% que torna o box um quadrado perfeito em pixels. */
  function squareHeightPct(sb, widthPct) {
    return widthPct * scoreboardFrameAspect(sb);
  }

  function setSquarePartSize(sb, part, widthPct) {
    const w = clamp(widthPct, 4, 100 - (part.left || 0));
    let h = squareHeightPct(sb, w);
    if (part.top + h > 100) {
      h = Math.max(4, 100 - part.top);
      // recalcula width para manter quadrado se altura limitou
      const aspect = scoreboardFrameAspect(sb);
      const w2 = clamp(h / aspect, 4, 100 - (part.left || 0));
      part.width = w2;
      part.height = squareHeightPct(sb, w2);
      return;
    }
    part.width = w;
    part.height = h;
  }

  /** Escudos A/B: mesmo tamanho + mesmo top (alinhados); patrocínio quadrado. */
  function enforceSquareScoreboardSlots(sb, masterCrest = "crestHome") {
    const home = sb.crestHome;
    const away = sb.crestAway;
    const master = sb[masterCrest] || home;
    const size = master.width ?? ((home.width + away.width) / 2);
    const top = clamp(master.top ?? home.top ?? 0, 0, 96);
    home.top = top;
    away.top = top;
    setSquarePartSize(sb, home, size);
    setSquarePartSize(sb, away, size);
    // garante sync mesmo se o clamp de um lado mudou
    const synced = Math.min(home.width, away.width);
    home.top = top;
    away.top = top;
    setSquarePartSize(sb, home, synced);
    setSquarePartSize(sb, away, synced);
    // se o clamp de altura empurrou, realinha tops
    home.top = away.top = Math.min(home.top, away.top);
    if (sb.sponsor) {
      const sp = sb.sponsor.width ?? 16;
      setSquarePartSize(sb, sb.sponsor, sp);
    }
    return sb;
  }

  function normalizeScoreboard(raw, fallback = SCOREBOARD) {
    const base = {
      ...fallback,
      crestHome: { ...fallback.crestHome },
      crestAway: { ...fallback.crestAway },
      score: { ...fallback.score },
      timer: { ...fallback.timer },
      divider: { ...fallback.divider },
      sponsor: { ...fallback.sponsor },
    };
    if (!raw) {
      enforceSquareScoreboardSlots(base);
      return base;
    }
    Object.assign(base, {
      left: raw.left ?? base.left,
      top: raw.top ?? base.top,
      width: raw.width ?? base.width,
      height: raw.height ?? base.height,
    });
    if (raw.crestHome) Object.assign(base.crestHome, raw.crestHome);
    if (raw.crestAway) Object.assign(base.crestAway, raw.crestAway);
    if (raw.score) Object.assign(base.score, raw.score);
    if (raw.timer) Object.assign(base.timer, raw.timer);
    if (raw.divider) Object.assign(base.divider, raw.divider);
    if (raw.sponsor) {
      Object.assign(base.sponsor, raw.sponsor);
      if (raw.sponsor.width == null && raw.sponsor.size != null) {
        base.sponsor.width = raw.sponsor.size;
      }
    }
    if (base.sponsor.width == null) base.sponsor.width = fallback.sponsor.width;
    if (base.sponsor.rotateMs == null) base.sponsor.rotateMs = fallback.sponsor.rotateMs;
    delete base.sponsor.size;
    // se linha veio horizontal (legado largo e baixo), converte para vertical
    if (base.divider && base.divider.width > base.divider.height * 2) {
      const len = base.divider.width;
      const thick = Math.max(0.8, base.divider.height);
      base.divider = {
        left: base.divider.left + len / 2 - thick / 2,
        top: Math.max(4, base.divider.top - len / 3),
        width: thick,
        height: Math.min(70, len * 0.7),
      };
    }
    // legado: contentY + crestInset
    if (!raw.crestHome && raw.crestInset != null) {
      const cy = raw.contentY ?? 48;
      const size = 16;
      base.crestHome = { left: raw.crestInset - size / 2, top: cy - 28, width: size, height: 50 };
      base.crestAway = { left: 100 - raw.crestInset - size / 2, top: cy - 28, width: size, height: 50 };
      base.score = { left: 28, top: cy - 30, width: 44, height: 32 };
      base.timer = { left: 36, top: cy - 2, width: 28, height: 16 };
    }
    enforceSquareScoreboardSlots(base);
    return base;
  }

  const HOME_FORMATION = [
    { role: "GK", u: 0.0309, v: 0.3822 },
    { role: "DF", u: 0.2323, v: 0.1351 },
    { role: "DF", u: 0.204, v: 0.2885 },
    { role: "DF", u: 0.2099, v: 0.4958 },
    { role: "DF", u: 0.2442, v: 0.723 },
    { role: "MF", u: 0.34, v: 0.25 },
    { role: "MF", u: 0.2982, v: 0.3992 },
    { role: "MF", u: 0.3451, v: 0.5895 },
    { role: "FW", u: 0.4701, v: 0.1323 },
    { role: "FW", u: 0.4601, v: 0.3651 },
    { role: "FW", u: 0.4734, v: 0.6917 },
  ];

  function mapToField(u, v, corners = FIELD_CORNERS) {
    const uu = clamp(u, 0, 1);
    const vv = clamp(v, 0, 1);
    const leftX =
      corners.farLeft.x + (corners.nearLeft.x - corners.farLeft.x) * vv;
    const rightX =
      corners.farRight.x + (corners.nearRight.x - corners.farRight.x) * vv;
    const topY =
      corners.farLeft.y + (corners.nearLeft.y - corners.farLeft.y) * vv;
    return {
      x: leftX + (rightX - leftX) * uu,
      y: topY,
    };
  }

  function screenToUV(x, y, corners = FIELD_CORNERS) {
    const farY = (corners.farLeft.y + corners.farRight.y) / 2;
    const nearY = (corners.nearLeft.y + corners.nearRight.y) / 2;
    const v = clamp((y - farY) / (nearY - farY || 1), 0, 1);
    const leftX =
      corners.farLeft.x + (corners.nearLeft.x - corners.farLeft.x) * v;
    const rightX =
      corners.farRight.x + (corners.nearRight.x - corners.farRight.x) * v;
    const u = clamp((x - leftX) / (rightX - leftX || 1), 0, 1);
    return { u, v };
  }

  function getPerspectiveScale(v) {
    return 0.72 + clamp(v, 0, 1) * 0.38;
  }

  function quadFromUV(uMin, uMax, vMin, vMax, corners = FIELD_CORNERS) {
    return {
      farGoal: mapToField(uMin, vMin, corners),
      farEdge: mapToField(uMax, vMin, corners),
      nearEdge: mapToField(uMax, vMax, corners),
      nearGoal: mapToField(uMin, vMax, corners),
    };
  }

  function clonePt(p) {
    return { x: p.x, y: p.y };
  }

  function cloneQuad(q) {
    return {
      farGoal: clonePt(q.farGoal),
      farEdge: clonePt(q.farEdge),
      nearEdge: clonePt(q.nearEdge),
      nearGoal: clonePt(q.nearGoal),
    };
  }

  function normalizeAreaQuad(raw, corners = FIELD_CORNERS) {
    if (!raw) return null;
    if (raw.farGoal && raw.farEdge && raw.nearEdge && raw.nearGoal) {
      return cloneQuad(raw);
    }
    if (raw.uMin != null) {
      return quadFromUV(raw.uMin, raw.uMax, raw.vMin, raw.vMax, corners);
    }
    return null;
  }

  function areaCorners(quad) {
    return cloneQuad(quad);
  }

  function areaPointsAttr(quad) {
    const c = quad;
    return [c.farGoal, c.farEdge, c.nearEdge, c.nearGoal]
      .map((p) => `${p.x},${p.y}`)
      .join(" ");
  }

  function pointInQuad(px, py, quad) {
    const pts = [quad.farGoal, quad.farEdge, quad.nearEdge, quad.nearGoal];
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x;
      const yi = pts[i].y;
      const xj = pts[j].x;
      const yj = pts[j].y;
      const intersect =
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-9) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function quadUVBounds(quad, corners = FIELD_CORNERS) {
    const uvs = AREA_CORNER_KEYS.map((k) =>
      screenToUV(quad[k].x, quad[k].y, corners)
    );
    return {
      uMin: Math.min(...uvs.map((p) => p.u)),
      uMax: Math.max(...uvs.map((p) => p.u)),
      vMin: Math.min(...uvs.map((p) => p.v)),
      vMax: Math.max(...uvs.map((p) => p.v)),
    };
  }

  function clampToAreaQuad(u, v, team, areas, fieldCorners = FIELD_CORNERS) {
    const quad = areas[team] || areas.home;
    const mapped = mapToField(u, v, fieldCorners);
    if (pointInQuad(mapped.x, mapped.y, quad)) {
      return { u, v };
    }
    const b = quadUVBounds(quad, fieldCorners);
    return {
      u: clamp(u, b.uMin, b.uMax),
      v: clamp(v, b.vMin, b.vMax),
    };
  }

  /** Grande área — uso legado / marcação. */
  function clampToPenaltyArea(u, v, team, areas, fieldCorners = FIELD_CORNERS) {
    return clampToAreaQuad(u, v, team, areas, fieldCorners);
  }

  /** Goleiro: limitado à pequena área. */
  function clampToSixYardArea(u, v, team, areas = SIX_YARD_AREAS, fieldCorners = FIELD_CORNERS) {
    return clampToAreaQuad(u, v, team, areas, fieldCorners);
  }

  function pointInPenaltyArea(u, v, team, areas, fieldCorners = FIELD_CORNERS) {
    const quad = areas[team] || areas.home;
    const mapped = mapToField(u, v, fieldCorners);
    return pointInQuad(mapped.x, mapped.y, quad);
  }

  /** Escanteio pelo lado que ataca: home ataca → cantos do visitante (away). */
  function cornerSpotForAttack(attackSide, nearSide, spots = FIELD_SPOTS) {
    const near = nearSide === "near" || nearSide === true;
    if (attackSide === "away") {
      return spots[near ? "cornerHomeNear" : "cornerHomeFar"] || FIELD_SPOTS.cornerHomeFar;
    }
    return spots[near ? "cornerAwayNear" : "cornerAwayFar"] || FIELD_SPOTS.cornerAwayFar;
  }

  global.MatchViewGeometry = {
    BASE_W,
    BASE_H,
    FIELD_CORNERS,
    AREA_CORNER_KEYS,
    PENALTY_AREAS,
    SIX_YARD_AREAS,
    FIELD_SPOTS,
    CORNER_SPOT_KEYS,
    BALL_KICKOFF,
    HALFWAY_LINE,
    SCOREBOARD,
    SQUARE_SB_PARTS,
    scoreboardFrameAspect,
    squareHeightPct,
    setSquarePartSize,
    enforceSquareScoreboardSlots,
    normalizeScoreboard,
    HOME_FORMATION,
    clamp,
    mapToField,
    screenToUV,
    getPerspectiveScale,
    quadFromUV,
    cloneQuad,
    normalizeAreaQuad,
    areaCorners,
    areaPointsAttr,
    pointInQuad,
    quadUVBounds,
    clampToAreaQuad,
    clampToPenaltyArea,
    clampToSixYardArea,
    pointInPenaltyArea,
    cornerSpotForAttack,
  };
})(typeof window !== "undefined" ? window : globalThis);
