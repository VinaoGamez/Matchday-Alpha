/**
 * WorldPitch — motor top-down inspirado na RoboCup Soccer Simulation 2D.
 *
 * Princípio:
 * 1) Verdade tática em metros (visão superior).
 * 2) Ciclos + colisão em metros.
 * 3) Espelho no estádio NÃO é UV linear 0.5/0.5 — usa calibração do gramado
 *    (BALL_KICKOFF, FIELD_CORNERS): centro óptico, trapézio e escala de perspectiva.
 *
 * Pipeline do telão:
 *   metros → UV calibrado (centro óptico) → mapToField (ângulos do estádio)
 *   + separação em px de tela → screenToUV → de volta ao world se precisar.
 */
(function (global) {
  "use strict";

  /** Campo FIFA padrão (m) — origem no centro, home ataca +X. */
  const FIELD = {
    length: 105,
    width: 68,
    halfL: 52.5,
    halfW: 34,
  };

  /** Raio de corpo (m) — tokens precisam de folga visual > física SS2D (~0.3). */
  const PLAYER_RADIUS = 1.1;
  const BALL_RADIUS = 0.35;
  const MIN_CENTER_DIST = PLAYER_RADIUS * 2; // 2.2 m
  const MIN_OPP_DIST = PLAYER_RADIUS * 1.7;

  /**
   * Pequena área FIFA ≈ 5.5m × 18.32m.
   * Referência Copa 2026 / ângulo de goleiro: fica SEMPRE aqui (nunca “vaga” no meio).
   */
  const SIX_YARD = { depth: 5.5, halfWidth: 9.16 };

  /**
   * Contratos geométricos (FIFA Training Centre TSG):
   * - mid-block Copa 2022: ~27×40 m, ≥4 atrás da bola
   * - rest defence Copa 2026: guarda-chuva atrás do ataque (3-2 / CBs + pivôs)
   * - duelo: poucos no raio da bola; marcação goal-side
   */
  const FIFA = {
    REST_BEHIND_MIN: 4,
    MIDBLOCK_DEPTH_MIN: 22,
    MIDBLOCK_DEPTH_MAX: 36,
    MIDBLOCK_WIDTH_MIN: 32,
    MIDBLOCK_WIDTH_MAX: 50,
    NEAR_BALL_R: 9,
    NEAR_BALL_MAX: 4,
    MARK_GAP_MIN: 2.0,
    MARK_GAP_MAX: 6.0,
    MESCLA_R: 9,
    MESCLA_PAIRS_MIN: 2,
    /** Folga mínima entre companheiros no eixo Y (m) — anti-aglomeração. */
    TEAMMATE_Y_GAP: 3.8,
  };

  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function mulberry32(seed) {
    let t = (seed >>> 0) || 1;
    return function rand() {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Centro óptico do gramado no estádio (não é 0.5,0.5).
   * Vem de MatchViewGeometry.BALL_KICKOFF — círculo central calibrado.
   */
  function getStadiumCalib() {
    const G = global.MatchViewGeometry;
    const kick = G?.BALL_KICKOFF;
    return {
      centerU: kick?.u != null ? kick.u : 0.5,
      centerV: kick?.v != null ? kick.v : 0.5,
    };
  }

  /** UV linear puro (só debug top-down / testes sem estádio). */
  function worldToUVLinear(x, y) {
    return {
      u: clamp((x + FIELD.halfL) / FIELD.length, 0, 1),
      v: clamp((y + FIELD.halfW) / FIELD.width, 0, 1),
    };
  }

  function uvToWorldLinear(u, v) {
    return {
      x: u * FIELD.length - FIELD.halfL,
      y: v * FIELD.width - FIELD.halfW,
    };
  }

  /**
   * Metros → UV do estádio.
   * Eixo u/v passam pelo centro óptico (BALL_KICKOFF): a metade "near" (câmera)
   * ganha mais faixa de V — alinhado ao trapézio FIELD_CORNERS.
   */
  function worldToUV(x, y) {
    const { centerU, centerV } = getStadiumCalib();
    const u =
      x >= 0
        ? centerU + (x / FIELD.halfL) * (1 - centerU)
        : centerU + (x / FIELD.halfL) * centerU;
    const v =
      y >= 0
        ? centerV + (y / FIELD.halfW) * (1 - centerV)
        : centerV + (y / FIELD.halfW) * centerV;
    return { u: clamp(u, 0, 1), v: clamp(v, 0, 1) };
  }

  function uvToWorld(u, v) {
    const { centerU, centerV } = getStadiumCalib();
    const x =
      u >= centerU
        ? ((u - centerU) / (1 - centerU || 1e-6)) * FIELD.halfL
        : ((u - centerU) / (centerU || 1e-6)) * FIELD.halfL;
    const y =
      v >= centerV
        ? ((v - centerV) / (1 - centerV || 1e-6)) * FIELD.halfW
        : ((v - centerV) / (centerV || 1e-6)) * FIELD.halfW;
    return { x, y };
  }

  /**
   * Separação no espaço da TELA (px do layout 1672×940), depois volta a metros.
   * É aqui que a angulação do estádio entra de verdade.
   */
  function spaceInStadiumScreen(world, iterations = 14) {
    const G = global.MatchViewGeometry;
    if (!G?.mapToField || !G?.screenToUV) return false;

    const pts = world.players.map((p) => {
      const uv = worldToUV(p.x, p.y);
      const s = G.mapToField(uv.u, uv.v, G.FIELD_CORNERS);
      const scale = G.getPerspectiveScale(uv.v);
      return { p, sx: s.x, sy: s.y, scale, isGk: p.role === "GK" };
    });

    for (let n = 0; n < iterations; n++) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i];
          const b = pts[j];
          const dx = a.sx - b.sx;
          const dy = a.sy - b.sy;
          let d = Math.hypot(dx, dy);
          // Marcação DF×FW pode ficar mais perto (mescla); mesmo time precisa de folga
          const markPair =
            a.p.team !== b.p.team &&
            ((a.p.role === "DF" && b.p.role === "FW") ||
              (a.p.role === "FW" && b.p.role === "DF") ||
              (a.p.role === "MF" && b.p.role === "MF"));
          const same = a.p.team === b.p.team;
          const minPx =
            (markPair ? 20 : same ? 34 : 24) * ((a.scale + b.scale) / 2);
          if (d < 1e-4) {
            a.sx += a.isGk ? 0 : 8;
            b.sx -= b.isGk ? 0 : 8;
            d = 16;
          }
          if (d >= minPx) continue;
          const push = (minPx - d) * 0.55;
          const nx = dx / d;
          const ny = dy / d;
          // GK não é empurrado para fora do gol — só o outro se afasta
          // Y mais forte: trapézio do estádio escondia pilhas verticais
          if (a.isGk && !b.isGk) {
            b.sx -= nx * push * 1.2;
            b.sy -= ny * push * 0.55;
          } else if (b.isGk && !a.isGk) {
            a.sx += nx * push * 1.2;
            a.sy += ny * push * 0.55;
          } else if (!a.isGk && !b.isGk) {
            a.sx += nx * push * 0.8;
            a.sy += ny * push * 0.55;
            b.sx -= nx * push * 0.8;
            b.sy -= ny * push * 0.55;
          }
        }
      }
    }

    for (const pt of pts) {
      if (pt.isGk) continue; // GK permanece no clamp de metros
      const uv = G.screenToUV(pt.sx, pt.sy, G.FIELD_CORNERS);
      const w = uvToWorld(uv.u, uv.v);
      const c = clampInField(w.x, w.y, 1.2);
      pt.p.x = c.x;
      pt.p.y = c.y;
      pt.p.tx = c.x;
      pt.p.ty = c.y;
    }
    clampKeepers(world);
    return true;
  }

  function clampInField(x, y, margin = 1) {
    return {
      x: clamp(x, -FIELD.halfL + margin, FIELD.halfL - margin),
      y: clamp(y, -FIELD.halfW + margin, FIELD.halfW - margin),
    };
  }

  /**
   * duty = slot tático 4-3-3 · funcao = perfil Footure (como se comporta).
   * @see https://footure.com.br/as-funcoes-dentro-de-um-campo-de-futebol-analise-do-futebol-brasileiro/
   */
  const DUTY = {
    GK: "GK",
    FB_L: "FB_L",
    CB_L: "CB_L",
    CB_R: "CB_R",
    FB_R: "FB_R",
    CM_L: "CM_L",
    CDM: "CDM",
    CM_R: "CM_R",
    W_L: "W_L",
    ST: "ST",
    W_R: "W_R",
  };

  /**
   * Faixas laterais por duty (Y em metros). Reposição leve após o shape
   * evita que suporte/invert Footure esmague todo mundo no corredor da bola.
   */
  const DUTY_LANE_Y = {
    [DUTY.GK]: 0,
    [DUTY.FB_L]: -28,
    [DUTY.FB_R]: 28,
    [DUTY.CB_L]: -9,
    [DUTY.CB_R]: 9,
    [DUTY.CDM]: 0,
    [DUTY.CM_L]: -12,
    [DUTY.CM_R]: 12,
    [DUTY.W_L]: -26,
    [DUTY.W_R]: 26,
    [DUTY.ST]: 2,
  };

  /** 26 funções Footure (ids estáveis para o motor). */
  const FUNCAO = {
    // Atacantes
    ST_FINALIZADOR: "st_finalizador",
    ST_ALVO: "st_alvo",
    ST_MOBILIDADE: "st_mobilidade",
    ST_SEGUNDO: "st_segundo",
    // Extremas
    W_RUPTURA: "w_ruptura",
    W_CONSTRUTOR: "w_construtor",
    W_DRIBLADOR: "w_driblador",
    // Meias ofensivos
    MO_FINALIZADOR: "mo_finalizador",
    MO_CRIADOR: "mo_criador",
    MO_MAESTRO: "mo_maestro",
    MO_TOTAL: "mo_total",
    // Médios
    MF_TODOCAMPISTA: "mf_todocampista",
    MF_BOXTOBOX: "mf_boxtobox",
    MF_DISTRIBUIDOR: "mf_distribuidor",
    MF_CONSTRUTOR: "mf_construtor",
    MF_DESTRUIDOR: "mf_destruidor",
    // Laterais
    FB_ULTRAPASSADOR: "fb_ultrapassador",
    FB_CRIADOR: "fb_criador",
    FB_DEFENSIVO: "fb_defensivo",
    // Zagueiros
    CB_AGRESSIVO: "cb_agressivo",
    CB_ANCORA: "cb_ancora",
    CB_VELOCISTA: "cb_velocista",
    CB_REBATEDOR: "cb_rebatedor",
    CB_CONSTRUTOR: "cb_construtor",
    // Goleiros
    GK_ATIVO: "gk_ativo",
    GK_REATIVO: "gk_reativo",
  };

  /**
   * Comportamento geométrico por função Footure.
   * push: +X no sentido do ataque (m) · width: escala |Y| · drop: recuo defensivo
   * invert: puxa para dentro (extremo construtor) · press: agressividade OOP
   * support: cola na bola IP · box: entra na área IP
   */
  const FUNCAO_BEHAVIOR = {
    st_finalizador: { push: 3.5, width: 0.35, drop: 0, invert: 0, press: 1.15, support: 0, box: 1 },
    st_alvo: { push: 2.5, width: 0.25, drop: 0, invert: 0, press: 0.9, support: 0.35, box: 0.85 },
    st_mobilidade: { push: 1.2, width: 0.85, drop: 0.2, invert: 0.15, press: 1.05, support: 0.5, box: 0.4 },
    st_segundo: { push: 1.8, width: 0.55, drop: 0.15, invert: 0.25, press: 1.0, support: 0.45, box: 0.55 },
    w_ruptura: { push: 3.2, width: 1.15, drop: 0.15, invert: 0, press: 0.75, support: 0, box: 0.7 },
    w_construtor: { push: 1.0, width: 0.7, drop: 0.25, invert: 0.28, press: 0.85, support: 0.35, box: 0.25 },
    w_driblador: { push: 2.2, width: 0.95, drop: 0.2, invert: 0.15, press: 0.8, support: 0.25, box: 0.45 },
    mo_finalizador: { push: 2.8, width: 0.45, drop: 0.1, invert: 0.08, press: 1.05, support: 0.15, box: 0.85 },
    mo_criador: { push: 1.5, width: 0.55, drop: 0.15, invert: 0.22, press: 0.95, support: 0.4, box: 0.35 },
    mo_maestro: { push: 0.4, width: 0.45, drop: 0.25, invert: 0.12, press: 0.7, support: 0.5, box: 0.1 },
    mo_total: { push: 2.0, width: 0.55, drop: 0.15, invert: 0.18, press: 1.0, support: 0.35, box: 0.55 },
    mf_todocampista: { push: 2.2, width: 0.55, drop: 0.2, invert: 0.08, press: 1.0, support: 0.35, box: 0.45 },
    mf_boxtobox: { push: 2.5, width: 0.5, drop: 0.35, invert: 0, press: 1.1, support: 0.25, box: 0.55 },
    mf_distribuidor: { push: 0.8, width: 0.65, drop: 0.15, invert: 0.08, press: 0.65, support: 0.3, box: 0.15 },
    mf_construtor: { push: 0.5, width: 0.5, drop: 0.3, invert: 0.04, press: 0.75, support: 0.5, box: 0.05 },
    mf_destruidor: { push: -1.5, width: 0.4, drop: 0.55, invert: 0, press: 1.15, support: 0.15, box: 0, shield: 1 },
    fb_ultrapassador: { push: 3.0, width: 1.1, drop: 0.2, invert: 0, press: 0.7, support: 0.15, box: 0.35 },
    fb_criador: { push: 1.5, width: 0.7, drop: 0.25, invert: 0.35, press: 0.75, support: 0.55, box: 0.15 },
    fb_defensivo: { push: -1.0, width: 0.85, drop: 0.65, invert: 0, press: 0.95, support: 0.1, box: 0 },
    cb_agressivo: { push: 1.5, width: 0.55, drop: 0.25, invert: 0, press: 1.25, support: 0.1, box: 0 },
    cb_ancora: { push: -2.0, width: 0.4, drop: 0.7, invert: 0, press: 0.85, support: 0, box: 0, shield: 1 },
    cb_velocista: { push: 0.5, width: 0.65, drop: 0.35, invert: 0, press: 1.05, support: 0.1, box: 0 },
    cb_rebatedor: { push: -3.0, width: 0.35, drop: 0.85, invert: 0, press: 0.7, support: 0, box: 0, shield: 1 },
    cb_construtor: { push: 0.8, width: 0.45, drop: 0.4, invert: 0.1, press: 0.75, support: 0.35, box: 0 },
    gk_ativo: { push: 0, width: 0, drop: 0, invert: 0, press: 0, support: 0, box: 0, gkSweep: 1.2 },
    gk_reativo: { push: 0, width: 0, drop: 0, invert: 0, press: 0, support: 0, box: 0, gkSweep: 0.35 },
  };

  /** Default Footure por slot 4-3-3 (perfil BR típico). */
  const DUTY_DEFAULT_FUNCAO = {
    [DUTY.GK]: FUNCAO.GK_REATIVO,
    [DUTY.FB_L]: FUNCAO.FB_ULTRAPASSADOR,
    [DUTY.FB_R]: FUNCAO.FB_ULTRAPASSADOR,
    [DUTY.CB_L]: FUNCAO.CB_ANCORA,
    [DUTY.CB_R]: FUNCAO.CB_VELOCISTA,
    [DUTY.CDM]: FUNCAO.MF_DESTRUIDOR,
    [DUTY.CM_L]: FUNCAO.MF_CONSTRUTOR,
    [DUTY.CM_R]: FUNCAO.MF_BOXTOBOX,
    [DUTY.W_L]: FUNCAO.W_RUPTURA,
    [DUTY.W_R]: FUNCAO.W_RUPTURA,
    [DUTY.ST]: FUNCAO.ST_FINALIZADOR,
  };

  /**
   * Formação 4-3-3 de saída (kickoff) em metros.
   * Home vive em X negativo; away = espelho. Ninguém no (0,0) — bola fica livre.
   */
  function formation433(side) {
    const sign = side === "home" ? 1 : -1;
    const slots = [
      { role: "GK", duty: DUTY.GK, x: -48, y: 0 },
      { role: "DF", duty: DUTY.FB_L, x: -34, y: -22 },
      { role: "DF", duty: DUTY.CB_L, x: -36, y: -8 },
      { role: "DF", duty: DUTY.CB_R, x: -36, y: 8 },
      { role: "DF", duty: DUTY.FB_R, x: -34, y: 22 },
      { role: "MF", duty: DUTY.CM_L, x: -18, y: -12 },
      { role: "MF", duty: DUTY.CDM, x: -24, y: 0 },
      { role: "MF", duty: DUTY.CM_R, x: -18, y: 12 },
      { role: "FW", duty: DUTY.W_L, x: -8, y: -20 },
      { role: "FW", duty: DUTY.ST, x: -5, y: 3 },
      { role: "FW", duty: DUTY.W_R, x: -8, y: 20 },
    ];
    return slots.map((s, i) => {
      const x = s.x * sign;
      const y = side === "away" && s.duty === DUTY.ST ? -s.y : s.y;
      const funcao = DUTY_DEFAULT_FUNCAO[s.duty];
      return {
        id: `${side}-${i}`,
        team: side,
        role: s.role,
        duty: s.duty,
        funcao,
        x,
        y,
        tx: x,
        ty: y,
        vx: 0,
        vy: 0,
      };
    });
  }

  /** Atribui duty + funcao Footure se o preview só trouxe role genérico. */
  function ensureDuties(team) {
    const dfs = sortedByY(byRole(team, "DF"));
    const dfDuties = [DUTY.FB_L, DUTY.CB_L, DUTY.CB_R, DUTY.FB_R];
    dfs.forEach((p, i) => {
      if (!p.duty) p.duty = dfDuties[Math.min(i, dfDuties.length - 1)];
    });
    const mfs = sortedByY(byRole(team, "MF"));
    const mfDuties = [DUTY.CM_L, DUTY.CDM, DUTY.CM_R];
    if (mfs.length >= 3 && mfs.every((p) => !p.duty)) {
      const byAbsY = mfs.slice().sort((a, b) => Math.abs(a.y) - Math.abs(b.y));
      byAbsY[0].duty = DUTY.CDM;
      const wings = byAbsY.slice(1).sort((a, b) => a.y - b.y);
      if (wings[0]) wings[0].duty = DUTY.CM_L;
      if (wings[1]) wings[1].duty = DUTY.CM_R;
    } else {
      mfs.forEach((p, i) => {
        if (!p.duty) p.duty = mfDuties[Math.min(i, mfDuties.length - 1)];
      });
    }
    const fws = sortedByY(byRole(team, "FW"));
    const fwDuties = [DUTY.W_L, DUTY.ST, DUTY.W_R];
    if (fws.length >= 3 && fws.every((p) => !p.duty)) {
      const byAbsY = fws.slice().sort((a, b) => Math.abs(a.y) - Math.abs(b.y));
      byAbsY[0].duty = DUTY.ST;
      const wings = byAbsY.slice(1).sort((a, b) => a.y - b.y);
      if (wings[0]) wings[0].duty = DUTY.W_L;
      if (wings[1]) wings[1].duty = DUTY.W_R;
    } else {
      fws.forEach((p, i) => {
        if (!p.duty) p.duty = fwDuties[Math.min(i, fwDuties.length - 1)];
      });
    }
    for (const p of byRole(team, "GK")) {
      if (!p.duty) p.duty = DUTY.GK;
    }
    for (const p of team) {
      if (!p.funcao && p.duty) p.funcao = DUTY_DEFAULT_FUNCAO[p.duty];
    }
  }

  function byDuty(team, duty) {
    return team.filter((p) => p.duty === duty);
  }

  function funcaoBehavior(p) {
    return FUNCAO_BEHAVIOR[p.funcao] || FUNCAO_BEHAVIOR[DUTY_DEFAULT_FUNCAO[p.duty]] || {};
  }

  /**
   * Aplica perfil Footure sobre o alvo já colocado pelo duty.
   * phase: 'ip' | 'oop'
   */
  function applyFuncaoToTarget(p, phase, ctx) {
    const b = funcaoBehavior(p);
    if (!b || p.role === "GK") return;
    const { dir, ball, intensity } = ctx;
    const signY = p.ty >= 0 ? 1 : -1;

    if (phase === "ip") {
      p.tx += dir * (b.push || 0) * intensity;
      if (b.width != null && b.width !== 1) {
        // width < 1 aproxima do eixo; manter âncora do duty (não esmagar no ball.y)
        const lane = DUTY_LANE_Y[p.duty];
        const axis = lane != null ? lane * 0.35 : ball.y * 0.15;
        p.ty = lerp(axis, p.ty, Math.max(0.55, b.width));
      }
      if (b.invert) {
        p.ty = lerp(p.ty, (DUTY_LANE_Y[p.duty] ?? 0) * 0.5, b.invert * 0.55);
      }
      if (b.support) {
        p.tx = lerp(p.tx, ball.x - dir * 3, b.support * 0.45);
        // Suporte lateral à bola — não cola no mesmo Y
        p.ty = lerp(p.ty, ball.y + signY * 6.5, b.support * 0.22);
      }
      if (b.box) {
        const boxX = dir > 0 ? FIELD.halfL - 14 : -FIELD.halfL + 14;
        p.tx = lerp(p.tx, boxX, b.box * 0.25 * intensity);
      }
      if (b.drop) {
        p.tx -= dir * b.drop * 4;
      }
      if (b.shield) {
        p.tx = dir > 0 ? Math.min(p.tx, ball.x - 8) : Math.max(p.tx, ball.x + 8);
      }
    } else {
      // OOP: DF em marcação (FB/CB) não é empurrado — mescla goal-side fica intacta
      if (isFb(p) || isCb(p)) {
        if (b.invert) p.ty = lerp(p.ty, 0, b.invert * 0.12);
        return;
      }
      // MF/FW/W: press sobe; drop/rebatedor afunda; destruidor fecha centro
      if (b.press) {
        p.tx = lerp(p.tx, ball.x + (dir > 0 ? -1 : 1) * 2, (b.press - 0.7) * 0.45);
      }
      if (b.drop) {
        p.tx += (dir > 0 ? -1 : 1) * b.drop * 5;
      }
      if (b.invert) {
        const lane = DUTY_LANE_Y[p.duty] ?? 0;
        p.ty = lerp(p.ty, lane * 0.55, b.invert * 0.28);
      }
      if (b.shield) {
        const lane = DUTY_LANE_Y[p.duty] ?? 0;
        p.ty = lerp(p.ty, lane * 0.4 + ball.y * 0.15, 0.3);
      }
    }
  }

  /**
   * Reposição leve por duty: puxa para a faixa lateral do slot e garante
   * gap mínimo entre companheiros no eixo Y (anti-pilha no corredor).
   */
  function enforceDutyLanes(team, strength = 0.4, ballY = 0) {
    ensureDuties(team);
    const bias = clamp(ballY * 0.12, -3, 3);
    for (const p of team) {
      if (p.role === "GK" || !p.duty) continue;
      const lane = DUTY_LANE_Y[p.duty];
      if (lane == null) continue;
      p.ty = lerp(p.ty, lane + bias, strength);
      p.ty = clamp(p.ty, -FIELD.halfW + 3, FIELD.halfW - 3);
    }
    const mates = team.filter((p) => p.role !== "GK").sort((a, b) => a.ty - b.ty);
    const minGap = FIFA.TEAMMATE_Y_GAP;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < mates.length; i++) {
        const gap = mates[i].ty - mates[i - 1].ty;
        if (gap >= minGap) continue;
        const push = (minGap - gap) * 0.55;
        mates[i - 1].ty -= push;
        mates[i].ty += push;
      }
    }
    for (const p of mates) {
      p.ty = clamp(p.ty, -FIELD.halfW + 3, FIELD.halfW - 3);
    }
  }

  function applyFuncaoTeam(team, phase, ctx) {
    for (const p of team) {
      if (p.role === "GK") continue;
      applyFuncaoToTarget(p, phase, ctx);
    }
  }

  function isFb(p) {
    return p.duty === DUTY.FB_L || p.duty === DUTY.FB_R;
  }
  function isCb(p) {
    return p.duty === DUTY.CB_L || p.duty === DUTY.CB_R;
  }
  function isWing(p) {
    return p.duty === DUTY.W_L || p.duty === DUTY.W_R;
  }

  function createWorld(opts = {}) {
    const home = formation433("home");
    const away = formation433("away");
    return {
      seed: opts.seed != null ? opts.seed : 1,
      rand: mulberry32(opts.seed != null ? opts.seed : 1),
      cycle: 0,
      ball: { x: 0, y: 0, vx: 0, vy: 0 },
      players: home.concat(away),
    };
  }

  function playersOf(world, team) {
    return world.players.filter((p) => !team || p.team === team);
  }

  function byRole(list, role) {
    return list.filter((p) => p.role === role);
  }

  function sortedByY(list) {
    return list.slice().sort((a, b) => a.y - b.y);
  }

  /**
   * Faixas Y igualmente espaçadas, sempre cabendo no campo.
   * (Corrige colapso na linha lateral — bug clássico de clamp.)
   */
  function laneYs(n, centerY, halfSpan, minGap) {
    if (n <= 0) return [];
    const lo = -FIELD.halfW + 3;
    const hi = FIELD.halfW - 3;
    if (n === 1) return [clamp(centerY, lo, hi)];
    const span = Math.min(Math.max(halfSpan * 2, minGap * (n - 1)), hi - lo);
    let start = centerY - span / 2;
    start = clamp(start, lo, hi - span);
    const out = [];
    for (let i = 0; i < n; i++) out.push(start + (span * i) / (n - 1));
    return out;
  }

  /**
   * Forma IP por função (posse):
   * CB âncora + CDM destruidor = rest defence; FB ultrapassa no lado da bola;
   * CM suporte; W amplitude; ST profundidade central.
   */
  function setShapeIP(world, attackSide, intensity = 1) {
    const dir = attackSide === "home" ? 1 : -1;
    const ball = world.ball;
    const team = playersOf(world, attackSide);
    ensureDuties(team);
    const gk = byRole(team, "GK")[0];
    const biasY = ball.y * 0.1 * intensity;
    const inFinalThird = attackSide === "home" ? ball.x > 22 : ball.x < -22;
    const behind = (dx) => ball.x - dir * dx;
    const capHome = (x, cap) => (attackSide === "home" ? Math.min(x, cap) : Math.max(x, cap));
    const neverAhead = (x, margin) =>
      attackSide === "home" ? Math.min(x, ball.x - margin) : Math.max(x, ball.x + margin);

    // --- Zagueiros âncora (rest defence) ---
    const cbs = [byDuty(team, DUTY.CB_L)[0], byDuty(team, DUTY.CB_R)[0]].filter(Boolean);
    cbs.forEach((p, i) => {
      const deep = i === 0;
      let x = behind(deep ? 18 : 15);
      const cap = deep ? (attackSide === "home" ? -8 : 8) : inFinalThird ? (attackSide === "home" ? 4 : -4) : attackSide === "home" ? -6 : 6;
      x = capHome(x, cap);
      x = neverAhead(x, 12);
      p.tx = x;
      p.ty = (p.duty === DUTY.CB_L ? -9 : 9) + biasY * 0.25;
    });

    // --- Laterais ultrapassadores: amplitude + apoio no lado da bola ---
    for (const duty of [DUTY.FB_L, DUTY.FB_R]) {
      const p = byDuty(team, duty)[0];
      if (!p) continue;
      const left = duty === DUTY.FB_L;
      const ballSide = left ? ball.y < 2 : ball.y > -2;
      let x = behind(ballSide && inFinalThird ? 5 : ballSide ? 7 : 10);
      x = neverAhead(x, 4);
      if (!inFinalThird) x = capHome(x, attackSide === "home" ? 0 : 0);
      p.tx = x;
      p.ty = (left ? -28 : 28) + biasY * 0.35;
    }

    // --- Volante destruidor: escudo à frente dos CBs ---
    const cdm = byDuty(team, DUTY.CDM)[0];
    if (cdm) {
      cdm.tx = neverAhead(behind(10), 6);
      cdm.ty = clamp(ball.y * 0.15, -6, 6);
    }

    // --- CMs box-to-box / construtores: um suporte, um half-space ---
    const cmL = byDuty(team, DUTY.CM_L)[0];
    const cmR = byDuty(team, DUTY.CM_R)[0];
    if (cmL) {
      // suporte perto da bola (Footure construtor / PFSA CM) — half-space, não eixo
      cmL.tx = neverAhead(behind(2.8), 1.2);
      cmL.ty = clamp(-10 + biasY * 0.5 + ball.y * 0.2, -16, -5);
    }
    if (cmR) {
      cmR.tx = ball.x + dir * (2 + 2 * intensity);
      cmR.ty = clamp(12 + biasY * 0.5 + ball.y * 0.2, 5, 18);
    }

    // --- Extremos ruptura: abertos + profundidade ---
    for (const duty of [DUTY.W_L, DUTY.W_R]) {
      const p = byDuty(team, duty)[0];
      if (!p) continue;
      const left = duty === DUTY.W_L;
      let x = ball.x + dir * (9 + 2 * intensity);
      if (attackSide === "home" && ball.x > -5) x = Math.max(x, 12);
      if (attackSide === "away" && ball.x < 5) x = Math.min(x, -12);
      p.tx = clamp(x, -FIELD.halfL + 8, FIELD.halfL - 8);
      p.ty = (left ? -26 : 26) + biasY * 0.4;
    }

    // --- Centroavante finalizador: eixo leve, terço final ---
    const st = byDuty(team, DUTY.ST)[0];
    if (st) {
      let x = ball.x + dir * (12 + 3 * intensity);
      if (attackSide === "home" && ball.x > -5) x = Math.max(x, 14);
      if (attackSide === "away" && ball.x < 5) x = Math.min(x, -14);
      st.tx = clamp(x, -FIELD.halfL + 10, FIELD.halfL - 10);
      st.ty = clamp(2 + ball.y * 0.18, -8, 8);
    }

    applyFuncaoTeam(team, "ip", { dir, ball, intensity });
    enforceDutyLanes(team, 0.38, ball.y);
    if (gk) {
      const gb = funcaoBehavior(gk);
      pGoalKeep(gk, attackSide, ball, 0.15 + (gb.gkSweep || 0.35) * 0.25);
    }
    clampTeamTargets(team);
  }

  /**
   * Forma OOP por função:
   * FB marca W do mesmo lado; CB marca ST; CDM cobre entrelinhas;
   * CM/W pressionam (1–2); mid-block compacto FIFA.
   * Depois: perfil Footure (press/drop/shield).
   */
  function setShapeOOP(world, defSide, intensity = 1, plannedAtk = null) {
    const towardOwn = defSide === "home" ? -1 : 1;
    const ball = world.ball;
    const team = playersOf(world, defSide);
    ensureDuties(team);
    const atkSide = defSide === "home" ? "away" : "home";
    const attackers = playersOf(world, atkSide);
    ensureDuties(attackers);
    const gk = byRole(team, "GK")[0];

    const attXY = (att) => {
      if (plannedAtk && plannedAtk.has(att.id)) return plannedAtk.get(att.id);
      return {
        x: att.tx != null ? att.tx : att.x,
        y: att.ty != null ? att.ty : att.y,
        role: att.role,
        duty: att.duty,
        id: att.id,
      };
    };

    const ballInFinal =
      (defSide === "away" && ball.x > 22) || (defSide === "home" && ball.x < -22);
    const blockDepth = ballInFinal ? 22 : 28;
    // Bloco mais largo: mid-block FIFA ~40–48m — evita pilha no corredor
    const blockWidth = ballInFinal ? 42 : 48;
    const blockFront = ball.x + towardOwn * (ballInFinal ? 4 : 6);
    const blockBack = blockFront + towardOwn * blockDepth;
    const lo = Math.min(blockFront, blockBack);
    const hi = Math.max(blockFront, blockBack);

    const markGoalSide = (p, target, gap = 2.8, yOff = 0) => {
      const pos = attXY(target);
      let x = pos.x + towardOwn * gap;
      let y = pos.y + yOff;
      x = clamp(x, lo, hi);
      y = clamp(y, -blockWidth / 2 + ball.y * 0.08, blockWidth / 2 + ball.y * 0.08);
      y = clamp(y, -FIELD.halfW + 3, FIELD.halfW - 3);
      p.tx = x;
      p.ty = y;
    };

    const atkW_L = byDuty(attackers, DUTY.W_L)[0];
    const atkW_R = byDuty(attackers, DUTY.W_R)[0];
    const atkST = byDuty(attackers, DUTY.ST)[0];
    const atkCM_L = byDuty(attackers, DUTY.CM_L)[0];
    const atkCM_R = byDuty(attackers, DUTY.CM_R)[0];

    // FB ↔ extremo (mesmo lado); CB_L ↔ ST; CB_R ↔ CM (nunca os dois no ST)
    const fbL = byDuty(team, DUTY.FB_L)[0];
    const fbR = byDuty(team, DUTY.FB_R)[0];
    const cbL = byDuty(team, DUTY.CB_L)[0];
    const cbR = byDuty(team, DUTY.CB_R)[0];
    if (fbL && atkW_L) markGoalSide(fbL, atkW_L, 2.8, -1.5);
    else if (fbL) {
      fbL.tx = lerp(blockFront, blockBack, 0.7);
      fbL.ty = -blockWidth / 2 + 3;
    }
    if (fbR && atkW_R) markGoalSide(fbR, atkW_R, 2.8, 1.5);
    else if (fbR) {
      fbR.tx = lerp(blockFront, blockBack, 0.7);
      fbR.ty = blockWidth / 2 - 3;
    }
    if (cbL && atkST) markGoalSide(cbL, atkST, 3.0, -2.0);
    else if (cbL) {
      cbL.tx = lerp(blockFront, blockBack, 0.8);
      cbL.ty = -8;
    }
    if (cbR) {
      const tgt = atkCM_R || atkCM_L || atkST;
      // Se caiu no ST (fallback), cobre com offset oposto ao CB_L
      const yOff = tgt === atkST ? 4.5 : tgt === atkCM_L ? -2 : 2;
      if (tgt) markGoalSide(cbR, tgt, 3.2, yOff);
      else {
        cbR.tx = lerp(blockFront, blockBack, 0.82);
        cbR.ty = 8;
      }
    }

    // CDM destruidor: à frente dos CBs, corredor — sem colar na bola
    const cdm = byDuty(team, DUTY.CDM)[0];
    if (cdm) {
      cdm.tx = lerp(blockFront, blockBack, 0.55);
      cdm.ty = clamp(ball.y * 0.18, -6, 6);
    }

    // Pressão: ST + CM do lado da bola (espaçados)
    const cmL = byDuty(team, DUTY.CM_L)[0];
    const cmR = byDuty(team, DUTY.CM_R)[0];
    const st = byDuty(team, DUTY.ST)[0];
    const wL = byDuty(team, DUTY.W_L)[0];
    const wR = byDuty(team, DUTY.W_R)[0];
    const pressers = [st, ball.y < 0 ? cmL : cmR].filter(Boolean);
    pressers.forEach((p, i) => {
      const side = i === 0 ? (ball.y >= 0 ? -1 : 1) : ball.y < 0 ? -1 : 1;
      p.tx = lerp(ball.x, blockFront, 0.5);
      p.ty = ball.y + side * 7;
    });
    // Extremos: recuam no bloco com amplitude
    if (wL && !pressers.includes(wL)) {
      wL.tx = lerp(blockFront, blockBack, 0.35);
      wL.ty = -blockWidth / 2 + 4;
    }
    if (wR && !pressers.includes(wR)) {
      wR.tx = lerp(blockFront, blockBack, 0.35);
      wR.ty = blockWidth / 2 - 4;
    }
    // CM que sobrou ancora profundidade no half-space
    const freeCm = [cmL, cmR].filter((p) => p && !pressers.includes(p));
    freeCm.forEach((p) => {
      p.tx = lerp(blockFront, blockBack, 0.45);
      p.ty = clamp((p.duty === DUTY.CM_L ? -15 : 15) + ball.y * 0.1, -20, 20);
    });

    stretchBlockDepth(team, blockFront, blockBack, towardOwn);
    // dir do ataque adversário (para modifiers Footure em OOP)
    const atkDir = defSide === "home" ? -1 : 1;
    applyFuncaoTeam(team, "oop", { dir: atkDir, ball, intensity });
    // Leve: preserva mescla goal-side, só abre companheiros empilhados
    enforceDutyLanes(team, 0.22, ball.y);
    if (gk) {
      const gb = funcaoBehavior(gk);
      pGoalKeep(gk, defSide, ball, 0.35 + (gb.gkSweep || 0.35) * 0.35);
    }
    clampTeamTargets(team);
  }

  /**
   * Profundidade do mid-block sem destruir mescla DF×FW:
   * CDM/CM ancoram fundo; ST/W a frente do bloco. CBs/FBs de marcação intactos.
   */
  function stretchBlockDepth(team, frontX, backX, towardOwn) {
    const cdm = byDuty(team, DUTY.CDM)[0];
    if (cdm) cdm.tx = lerp(cdm.tx, backX, 0.55);
    const mfs = team.filter((p) => p.role === "MF" && p.duty !== DUTY.CDM);
    const fws = team.filter((p) => p.role === "FW");
    if (!mfs.length && !fws.length) return;
    const backFirst = (a, b) => (towardOwn > 0 ? b.tx - a.tx : a.tx - b.tx);
    const frontFirst = (a, b) => (towardOwn > 0 ? a.tx - b.tx : b.tx - a.tx);
    if (mfs.length) {
      const deep = mfs.slice().sort(backFirst);
      deep[0].tx = lerp(deep[0].tx, lerp(frontX, backX, 0.75), 0.8);
    }
    const high = (fws.length ? fws : mfs).slice().sort(frontFirst);
    if (high[0]) high[0].tx = lerp(high[0].tx, frontX, 0.85);
    if (high[1]) high[1].tx = lerp(high[1].tx, lerp(frontX, backX, 0.25), 0.6);
  }

  /**
   * Limita aglomeração no raio da bola (duelo FIFA: 1–2 + cobertura, não kindergarten).
   * Empurra o excesso para fora mantendo papel/lado.
   */
  function limitNearBall(world, maxNear = FIFA.NEAR_BALL_MAX, radius = FIFA.NEAR_BALL_R) {
    const ball = world.ball;
    const bodies = world.players
      .filter((p) => p.role !== "GK")
      .map((p) => ({
        p,
        x: p.tx,
        y: p.ty,
        d: Math.hypot(p.tx - ball.x, p.ty - ball.y),
      }))
      .sort((a, b) => a.d - b.d);

    for (let i = maxNear; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.d >= radius) continue;
      const lane = DUTY_LANE_Y[b.p.duty];
      // Prefere empurrar na faixa do duty (abre o corredor da bola)
      let ang =
        b.d < 1e-4
          ? (lane != null ? Math.atan2(lane, 6) : i * 0.9)
          : Math.atan2(b.y - ball.y, b.x - ball.x);
      if (lane != null && Math.abs(lane) > 4) {
        ang = lerp(ang, Math.atan2(Math.sign(lane) * 12, 4), 0.55);
      }
      const targetR = radius + 4 + (i - maxNear) * 1.5;
      b.x = ball.x + Math.cos(ang) * targetR;
      b.y = ball.y + Math.sin(ang) * targetR;
      if (lane != null) b.y = lerp(b.y, lane, 0.35);
      // DF atrás da bola; FW pode ficar à frente
      if (b.p.role === "DF") {
        if (b.p.team === "home") b.x = Math.min(b.x, ball.x - 3);
        else b.x = Math.max(b.x, ball.x + 3);
      }
      const c = clampInField(b.x, b.y, 1.5);
      b.p.tx = c.x;
      b.p.ty = c.y;
    }
  }

  /** Limita ponto à pequena área do time (metros). */
  function clampToSixYardWorld(x, y, side) {
    const dir = side === "home" ? 1 : -1;
    const goalLine = side === "home" ? -FIELD.halfL : FIELD.halfL;
    const xMin = side === "home" ? goalLine + 0.4 : goalLine - SIX_YARD.depth;
    const xMax = side === "home" ? goalLine + SIX_YARD.depth : goalLine - 0.4;
    return {
      x: clamp(x, xMin, xMax),
      y: clamp(y, -SIX_YARD.halfWidth, SIX_YARD.halfWidth),
    };
  }

  /**
   * Posição de GK (ângulo bola→centro do gol).
   * Princípio real: bissetriz + profundidade conforme ameaça; sempre na pequena área.
   * Copa 2026: GK “quarterback” no build-up, mas ainda dentro da caixa.
   */
  function pGoalKeep(gk, side, ball, follow = 0.45) {
    const goalX = side === "home" ? -FIELD.halfL : FIELD.halfL;
    const goalY = 0;
    const inward = side === "home" ? 1 : -1;
    // Distância da bola ao gol → quanto sai da linha (ameaça perto = corta ângulo)
    const ballToGoal = Math.hypot(ball.x - goalX, ball.y - goalY);
    const depth =
      ballToGoal > 45 ? 1.2 : ballToGoal > 28 ? 2.2 : ballToGoal > 16 ? 3.4 : 4.4;
    // Ponto na reta gol→bola
    const t = clamp(depth / (ballToGoal || 1), 0.02, 0.22);
    let x = lerp(goalX, ball.x, t);
    let y = lerp(goalY, ball.y, follow * 0.85);
    // leve offset para não colar na linha
    x += inward * 0.35;
    const c = clampToSixYardWorld(x, y, side);
    gk.tx = c.x;
    gk.ty = c.y;
  }

  function clampTeamTargets(team) {
    for (const p of team) {
      if (p.role === "GK") {
        const c = clampToSixYardWorld(p.tx, p.ty, p.team);
        p.tx = c.x;
        p.ty = c.y;
        continue;
      }
      const c = clampInField(p.tx, p.ty, 1.5);
      p.tx = c.x;
      p.ty = c.y;
    }
  }

  /** Garante corpos/alvos de GK dentro da pequena área. */
  function clampKeepers(world) {
    for (const p of world.players) {
      if (p.role !== "GK") continue;
      const c = clampToSixYardWorld(p.x, p.y, p.team);
      p.x = c.x;
      p.y = c.y;
      const t = clampToSixYardWorld(p.tx, p.ty, p.team);
      p.tx = t.x;
      p.ty = t.y;
    }
  }

  /**
   * Recompõe mid-block com mescla (anti-drift entre jogadas).
   * Não volta ao kickoff — isso era o “muro” que separava os times.
   */
  function softResetFormation(world, t = 0.55) {
    world.ball.x = lerp(world.ball.x, 0, t * 0.7);
    world.ball.y = lerp(world.ball.y, 0, t * 0.55);
    const attackSide = world.ball.x >= 0 ? "home" : "away";
    const before = world.players.map((p) => ({ id: p.id, x: p.x, y: p.y }));
    setShapeBoth(world, attackSide, 0.85);
    for (const p of world.players) {
      if (p.role === "GK") {
        p.x = p.tx;
        p.y = p.ty;
        continue;
      }
      const prev = before.find((b) => b.id === p.id);
      if (!prev) {
        p.x = p.tx;
        p.y = p.ty;
        continue;
      }
      p.x = lerp(prev.x, p.tx, t);
      p.y = lerp(prev.y, p.ty, t);
      p.tx = p.x;
      p.ty = p.y;
    }
    resolveCollisions(world, 14);
    clampKeepers(world);
  }

  /** Mantém de linha longe do próprio GK (evita pilha na pequena área). */
  function clearKeeperBubble(world, useTargets = true) {
    const gks = world.players.filter((p) => p.role === "GK");
    for (const gk of gks) {
      const gx = useTargets ? gk.tx : gk.x;
      const gy = useTargets ? gk.ty : gk.y;
      for (const p of world.players) {
        if (p.role === "GK" || p.team !== gk.team) continue;
        let x = useTargets ? p.tx : p.x;
        let y = useTargets ? p.ty : p.y;
        const d = Math.hypot(x - gx, y - gy) || 0.0001;
        const minD = 6.2;
        if (d >= minD) continue;
        const push = (minD - d) * 0.9;
        const nx = (x - gx) / d;
        const ny = (y - gy) / d;
        x += nx * push;
        y += ny * push;
        // Empurra para o campo (longe da linha de fundo)
        if (p.team === "home") x = Math.max(x, gx + 3.5);
        else x = Math.min(x, gx - 3.5);
        const c = clampInField(x, y, 1.5);
        if (useTargets) {
          p.tx = c.x;
          p.ty = c.y;
        } else {
          p.x = c.x;
          p.y = c.y;
          p.tx = c.x;
          p.ty = c.y;
        }
      }
    }
  }

  /** Espaça alvos (tx,ty) de todos os jogadores — evita settle em bolinho. */
  function spaceTargets(world, iterations = 18) {
    clearKeeperBubble(world, true);
    const bodies = world.players.map((p, idx) => ({
      p,
      x: p.tx,
      y: p.ty,
      team: p.team,
      idx,
    }));
    for (let n = 0; n < iterations; n++) {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i];
          const b = bodies[j];
          const markPair =
            a.team !== b.team &&
            ((a.p.role === "DF" && b.p.role === "FW") ||
              (a.p.role === "FW" && b.p.role === "DF"));
          const gkPair = a.p.role === "GK" || b.p.role === "GK";
          const minD = gkPair
            ? a.team === b.team
              ? 6.2
              : MIN_OPP_DIST + 0.4
            : a.team === b.team
              ? MIN_CENTER_DIST + 0.15
              : markPair
                ? 2.55
                : MIN_OPP_DIST;
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d = Math.hypot(dx, dy);
          // coincidência exata: separa por índice (determinístico)
          if (d < 1e-6) {
            dx = (i % 2 === 0 ? 1 : -1) * 0.8;
            dy = (j % 2 === 0 ? 1 : -1) * 0.8;
            d = Math.hypot(dx, dy);
          }
          if (d >= minD) continue;
          const push = (minD - d) * 0.65;
          const nx = dx / d;
          const ny = dy / d;
          // Prioriza abrir no eixo Y (anti-pilha no corredor); perto da lateral, em X
          const nearTouch = Math.abs(a.y) > FIELD.halfW - 8 || Math.abs(b.y) > FIELD.halfW - 8;
          const sameTeam = a.team === b.team;
          const xScale = nearTouch ? 1.15 : sameTeam ? 0.55 : 0.7;
          const yScale = nearTouch ? 0.4 : sameTeam ? 1.15 : 1.0;
          a.x += nx * push * xScale;
          a.y += ny * push * yScale;
          b.x -= nx * push * xScale;
          b.y -= ny * push * yScale;
          const ca = clampInField(a.x, a.y, 1.5);
          const cb = clampInField(b.x, b.y, 1.5);
          a.x = ca.x;
          a.y = ca.y;
          b.x = cb.x;
          b.y = cb.y;
        }
      }
    }
    for (const b of bodies) {
      if (b.p.role === "GK") {
        const c = clampToSixYardWorld(b.x, b.y, b.p.team);
        b.p.tx = c.x;
        b.p.ty = c.y;
        continue;
      }
      b.p.tx = b.x;
      b.p.ty = b.y;
    }
    clearKeeperBubble(world, true);
  }

  /**
   * Aplica IP + OOP. Defesa marca alvos planejados do ataque (não posições antigas).
   * Depois: limpa cluster da bola (contrato FIFA de duelo).
   */
  function setShapeBoth(world, attackSide, intensity = 1) {
    setShapeIP(world, attackSide, intensity);
    const planned = new Map(
      playersOf(world, attackSide).map((p) => [p.id, { x: p.tx, y: p.ty, role: p.role, id: p.id }])
    );
    setShapeOOP(world, attackSide === "home" ? "away" : "home", intensity * 0.95, planned);
    limitNearBall(world);
    spaceTargets(world);
  }

  /** Conta outfield de um time atrás da linha da bola (rest defence / mid-block). */
  function countBehindBall(world, team, margin = 2) {
    const ball = world.ball;
    const dir = team === "home" ? 1 : -1; // home ataca +X → atrás = x menor
    return playersOf(world, team)
      .filter((p) => p.role !== "GK")
      .filter((p) => (dir > 0 ? p.x < ball.x - margin : p.x > ball.x + margin)).length;
  }

  function countNearBall(world, radius = FIFA.NEAR_BALL_R) {
    const ball = world.ball;
    return world.players.filter(
      (p) => p.role !== "GK" && Math.hypot(p.x - ball.x, p.y - ball.y) < radius
    ).length;
  }

  function countMesclaPairs(world, attackSide, maxDist = FIFA.MESCLA_R) {
    const defSide = attackSide === "home" ? "away" : "home";
    const fws = byRole(playersOf(world, attackSide), "FW");
    const dfs = byRole(playersOf(world, defSide), "DF");
    let n = 0;
    let best = Infinity;
    for (const fw of fws) {
      for (const df of dfs) {
        const d = dist(fw, df);
        best = Math.min(best, d);
        if (d < maxDist) n += 1;
      }
    }
    return { pairs: n, best };
  }

  /**
   * Relatório de validação FIFA para shapeBoth settled.
   * Usado por testes / calibração — não altera o world.
   */
  function fifaShapeReport(world, attackSide) {
    const defSide = attackSide === "home" ? "away" : "home";
    const atkBehind = countBehindBall(world, attackSide, 2);
    const defBehind = countBehindBall(world, defSide, 1);
    const near = countNearBall(world);
    const mescla = countMesclaPairs(world, attackSide);
    const defDepth = teamDepth(world, defSide);
    const defWidth = teamWidth(world, defSide);
    const ball = world.ball;
    const midBlockPhase = Math.abs(ball.x) < 28;
    const cbs = sortedByY(byRole(playersOf(world, attackSide), "DF"));
    const cbCore = cbs.slice(1, -1);
    const cbsOwn =
      attackSide === "home"
        ? cbCore.filter((p) => p.x < 2).length
        : cbCore.filter((p) => p.x > -2).length;
    const gksOk = ["home", "away"].every((side) => {
      const gk = byRole(playersOf(world, side), "GK")[0];
      if (!gk) return false;
      const c = clampToSixYardWorld(gk.x, gk.y, side);
      return Math.abs(gk.x - c.x) < 0.1 && Math.abs(gk.y - c.y) < 0.1;
    });

    const checks = {
      restBehind: atkBehind >= FIFA.REST_BEHIND_MIN,
      cbsRest: cbsOwn >= Math.min(2, cbCore.length),
      mescla: mescla.pairs >= FIFA.MESCLA_PAIRS_MIN,
      nearBall: near <= FIFA.NEAR_BALL_MAX + 1,
      defBehindBall: defBehind >= 4,
      midBlockDepth:
        !midBlockPhase ||
        (defDepth >= FIFA.MIDBLOCK_DEPTH_MIN - 8 && defDepth <= FIFA.MIDBLOCK_DEPTH_MAX + 10),
      midBlockWidth:
        !midBlockPhase ||
        (defWidth >= FIFA.MIDBLOCK_WIDTH_MIN - 6 && defWidth <= FIFA.MIDBLOCK_WIDTH_MAX + 8),
      gkSixYard: gksOk,
      separation: minSeparation(world) >= MIN_OPP_DIST - 0.3,
    };
    const ok = Object.values(checks).every(Boolean);
    return {
      ok,
      checks,
      metrics: {
        atkBehind,
        defBehind,
        near,
        mesclaPairs: mescla.pairs,
        mesclaBest: mescla.best,
        defDepth,
        defWidth,
        cbsOwn,
        midBlockPhase,
      },
    };
  }

  /**
   * Resolve sobreposição (fim de ciclo SS2D): empurra centros até min dist.
   */
  function resolveCollisions(world, iterations = 16) {
    const bodies = world.players;
    for (let n = 0; n < iterations; n++) {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i];
          const b = bodies[j];
          const minD = a.team === b.team ? MIN_CENTER_DIST : MIN_OPP_DIST;
          const d = dist(a, b) || 0.0001;
          if (d >= minD) continue;
          const push = (minD - d) * 0.55;
          const nx = (a.x - b.x) / d;
          const ny = (a.y - b.y) / d;
          a.x += nx * push;
          a.y += ny * push;
          b.x -= nx * push;
          b.y -= ny * push;
          const ca = clampInField(a.x, a.y, 1);
          const cb = clampInField(b.x, b.y, 1);
          a.x = ca.x;
          a.y = ca.y;
          b.x = cb.x;
          b.y = cb.y;
        }
      }
    }
  }

  /**
   * Um ciclo: move em direção ao alvo (estilo go-to-point HELIOS) + colisão.
   * maxStep metros por ciclo (~dash limitado).
   */
  function step(world, maxStep = 2.4) {
    for (const p of world.players) {
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.05) {
        p.x = p.tx;
        p.y = p.ty;
        continue;
      }
      const stepLen = Math.min(maxStep, d);
      p.x += (dx / d) * stepLen;
      p.y += (dy / d) * stepLen;
    }
    resolveCollisions(world);
    world.cycle += 1;
  }

  function settle(world, cycles = 12, maxStep = 3.2, opts = {}) {
    spaceTargets(world);
    clampKeepers(world);
    for (let i = 0; i < cycles; i++) {
      step(world, maxStep);
      clampKeepers(world);
    }
    resolveCollisions(world, 20);
    clearKeeperBubble(world, false);
    clampKeepers(world);
    // Passo de apresentação: só quando pedimos espelho no estádio (opt-in)
    if (opts.stadiumScreen) {
      spaceInStadiumScreen(world);
      resolveCollisions(world, 8);
      clearKeeperBubble(world, false);
      clampKeepers(world);
    }
  }

  function minSeparation(world) {
    let m = Infinity;
    const ps = world.players;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        m = Math.min(m, dist(ps[i], ps[j]));
      }
    }
    return m === Infinity ? 0 : m;
  }

  function teamWidth(world, team) {
    const ys = playersOf(world, team)
      .filter((p) => p.role !== "GK")
      .map((p) => p.y);
    if (!ys.length) return 0;
    return Math.max(...ys) - Math.min(...ys);
  }

  function teamDepth(world, team) {
    const xs = playersOf(world, team)
      .filter((p) => p.role !== "GK")
      .map((p) => p.x);
    if (!xs.length) return 0;
    return Math.max(...xs) - Math.min(...xs);
  }

  function avgRoleX(world, team, role) {
    const list = byRole(playersOf(world, team), role);
    if (!list.length) return 0;
    return list.reduce((s, p) => s + p.x, 0) / list.length;
  }

  /** Snapshot espelhável pelo preview (UV). */
  function toUVSnapshot(world) {
    return {
      cycle: world.cycle,
      ball: worldToUV(world.ball.x, world.ball.y),
      players: world.players.map((p) => {
        const uv = worldToUV(p.x, p.y);
        return {
          id: p.id,
          team: p.team,
          role: p.role,
          u: uv.u,
          v: uv.v,
          x: p.x,
          y: p.y,
        };
      }),
    };
  }

  /** Slots UV para kickoff do match-view (home / away). */
  function kickoffUVSlots() {
    const world = createWorld({ seed: 1 });
    const home = [];
    const away = [];
    for (const p of world.players) {
      const uv = worldToUV(p.x, p.y);
      const slot = { u: uv.u, v: uv.v, role: p.role, worldId: p.id };
      if (p.team === "home") home.push(slot);
      else away.push(slot);
    }
    return { home, away, ball: worldToUV(0, 0) };
  }

  const ROLE_ORDER = { GK: 0, DF: 1, MF: 2, FW: 3 };

  /** Emparelha entidades do preview com corpos do world (por time + papel + faixa). */
  function pairEntities(world, entities) {
    const pairs = []; // { entity, body }
    for (const side of ["home", "away"]) {
      const bodies = playersOf(world, side)
        .slice()
        .sort((a, b) => {
          const ia = Number(String(a.id).split("-")[1]) || 0;
          const ib = Number(String(b.id).split("-")[1]) || 0;
          return ia - ib;
        });
      const ents = (entities || [])
        .filter((e) => e.kind === "player" && e.team === side)
        .slice()
        .sort((a, b) => {
          const ra = ROLE_ORDER[a.role] ?? 9;
          const rb = ROLE_ORDER[b.role] ?? 9;
          if (ra !== rb) return ra - rb;
          return (a.v ?? 0) - (b.v ?? 0) || (a.u ?? 0) - (b.u ?? 0);
        });
      const n = Math.min(bodies.length, ents.length);
      for (let i = 0; i < n; i++) {
        pairs.push({ entity: ents[i], body: bodies[i] });
        bodies[i]._entityId = ents[i].id;
      }
    }
    return pairs;
  }

  function syncEntitiesIntoWorld(world, entities, ballU, ballV) {
    const pairs = pairEntities(world, entities);
    for (const { entity, body } of pairs) {
      const w = uvToWorld(entity.u, entity.v);
      body.x = w.x;
      body.y = w.y;
      body.tx = w.x;
      body.ty = w.y;
      body.role = entity.role || body.role;
      if (entity.duty) body.duty = entity.duty;
    }
    ensureDuties(playersOf(world, "home"));
    ensureDuties(playersOf(world, "away"));
    if (ballU != null && ballV != null) {
      const b = uvToWorld(ballU, ballV);
      world.ball.x = b.x;
      world.ball.y = b.y;
    }
    return pairs;
  }

  /**
   * Planeja forma no world e devolve moves UV para o play-engine animar.
   * mode: 'ip' | 'oop' | 'both'
   */
  function planShapeMoves(entities, attackSide, ballU, ballV, intensity = 1, mode = "both", opts = {}) {
    const world = opts.world || createWorld({ seed: opts.seed || 1 });
    const pairs = syncEntitiesIntoWorld(world, entities, ballU, ballV);
    if (mode === "ip") setShapeIP(world, attackSide, intensity);
    else if (mode === "oop") setShapeOOP(world, attackSide, intensity);
    else setShapeBoth(world, attackSide, intensity);
    settle(world, opts.settleCycles != null ? opts.settleCycles : 12, opts.maxStep || 3.2, {
      stadiumScreen: opts.stadiumScreen !== false, // default ON no espelho do telão
    });

    clampKeepers(world);

    const duration = opts.duration || 480;
    const G = global.MatchViewGeometry;
    const moves = pairs.map(({ entity, body }, i) => {
      let uv = worldToUV(body.x, body.y);
      // GK: força pequena área do estádio (calibração do editor)
      if (body.role === "GK" && G?.clampToSixYardArea) {
        uv = G.clampToSixYardArea(uv.u, uv.v, body.team, G.SIX_YARD_AREAS, G.FIELD_CORNERS);
      }
      return {
        entity,
        u: uv.u,
        v: uv.v,
        duration: duration + (i % 5) * 20,
        delay: (i % 4) * 12,
        worldX: body.x,
        worldY: body.y,
        fromWorld: true,
        isGk: body.role === "GK",
      };
    });
    return { moves, world, snapshot: toUVSnapshot(world), pairs, calib: getStadiumCalib() };
  }

  /**
   * Escanteio realista (bola parada):
   * - cobrador no corner
   * - atacantes espalhados na área (lanes)
   * - zaga marca zona com folga
   * - GK na linha do gol
   * - resto fora da área, sem bolo no meio
   */
  function setCornerShape(world, attackSide, nearSide = "near") {
    const defSide = attackSide === "home" ? "away" : "home";
    const cornerX = attackSide === "home" ? FIELD.halfL - 0.8 : -FIELD.halfL + 0.8;
    const cornerY = nearSide === "near" ? FIELD.halfW - 0.8 : -FIELD.halfW + 0.8;
    world.ball.x = cornerX;
    world.ball.y = cornerY;

    const boxX = attackSide === "home" ? FIELD.halfL - 11 : -FIELD.halfL + 11;
    const goalX = defSide === "home" ? -FIELD.halfL + 1.5 : FIELD.halfL - 1.5;
    const boxCenterY = nearSide === "near" ? 5 : -5;

    const atk = playersOf(world, attackSide);
    const def = playersOf(world, defSide);
    const atkMf = sortedByY(byRole(atk, "MF"));
    const atkFw = sortedByY(byRole(atk, "FW"));
    const atkDf = sortedByY(byRole(atk, "DF"));
    const defDf = sortedByY(byRole(def, "DF"));
    const defMf = sortedByY(byRole(def, "MF"));
    const defFw = sortedByY(byRole(def, "FW"));
    const atkGk = byRole(atk, "GK")[0];
    const defGk = byRole(def, "GK")[0];

    // cobrador = MF mais extremo no lado do corner
    const taker =
      atkMf.slice().sort((a, b) => Math.abs(a.y - cornerY) - Math.abs(b.y - cornerY))[0] ||
      atkMf[0];
    if (taker) {
      taker.tx = cornerX + (attackSide === "home" ? -2 : 2);
      taker.ty = cornerY + (nearSide === "near" ? -2 : 2);
    }

    // alvos na área — 3 FW + 1 MF (exceto cobrador)
    const boxPack = atkFw.concat(atkMf.filter((p) => p !== taker)).slice(0, 4);
    const boxYs = laneYs(boxPack.length, boxCenterY, 16, 6.5);
    boxPack.forEach((p, i) => {
      // espalha também em profundidade (1º poste / 2º poste / penalti)
      const depthSlot = (i % 3) - 1;
      p.tx = boxX + depthSlot * 3.2 * (attackSide === "home" ? 1 : -1);
      p.ty = boxYs[i];
    });

    // rest defense do ataque: DF + MF restantes atrás
    const restAtk = atkDf.concat(atkMf.filter((p) => p !== taker && !boxPack.includes(p)));
    const restYs = laneYs(restAtk.length, 0, 18, 6);
    restAtk.forEach((p, i) => {
      p.tx = attackSide === "home" ? 8 : -8;
      p.ty = restYs[i];
    });
    if (atkGk) pGoalKeep(atkGk, attackSide, { x: 0, y: 0 }, 0.15);

    // defesa: DF na área marcando lanes; MF na entrada; FW no meio
    const defBoxYs = laneYs(defDf.length, boxCenterY, 15, 6.2);
    defDf.forEach((p, i) => {
      p.tx = lerp(boxX, goalX, 0.28 + (i % 2) * 0.08);
      p.ty = defBoxYs[i];
    });
    const edgeYs = laneYs(defMf.length, boxCenterY * 0.5, 16, 6);
    defMf.forEach((p, i) => {
      p.tx = lerp(boxX, 0, 0.55);
      p.ty = edgeYs[i];
    });
    const fwYs = laneYs(defFw.length, 0, 12, 7);
    defFw.forEach((p, i) => {
      p.tx = defSide === "home" ? -5 : 5;
      p.ty = fwYs[i];
    });
    if (defGk) {
      // GK na linha, levemente ao lado do corner
      defGk.tx = goalX;
      defGk.ty = clamp(boxCenterY * 0.35, -SIX_YARD.halfWidth + 0.5, SIX_YARD.halfWidth - 0.5);
      const c = clampToSixYardWorld(defGk.tx, defGk.ty, defSide);
      defGk.tx = c.x;
      defGk.ty = c.y;
    }

    clampTeamTargets(atk);
    clampTeamTargets(def);
    spaceTargets(world);
    resolveCollisions(world, 20);
    clampKeepers(world);
  }

  function planCornerMoves(entities, attackSide, nearSide, opts = {}) {
    const world = opts.world || createWorld({ seed: opts.seed || 1 });
    syncEntitiesIntoWorld(world, entities, null, null);
    setCornerShape(world, attackSide, nearSide === "far" ? "far" : "near");
    // settle curto só para colisão — posições já são absolutas
    for (let i = 0; i < 6; i++) step(world, 5);
    resolveCollisions(world, 20);
    clampKeepers(world);
    spaceInStadiumScreen(world);
    resolveCollisions(world, 10);
    clampKeepers(world);

    const pairs = pairEntities(world, entities);
    const G = global.MatchViewGeometry;
    const duration = opts.duration || 520;
    const moves = pairs.map(({ entity, body }, i) => {
      let uv = worldToUV(body.x, body.y);
      if (body.role === "GK" && G?.clampToSixYardArea) {
        uv = G.clampToSixYardArea(uv.u, uv.v, body.team, G.SIX_YARD_AREAS, G.FIELD_CORNERS);
      }
      return {
        entity,
        u: uv.u,
        v: uv.v,
        duration: duration + (i % 4) * 25,
        fromWorld: true,
        isGk: body.role === "GK",
      };
    });
    const ballUv = worldToUV(world.ball.x, world.ball.y);
    return { moves, world, ballUv, snapshot: toUVSnapshot(world) };
  }

  /**
   * Reform pós-lance: mid-block com mescla (NÃO kickoff).
   * Kickoff puro só via createWorld / setupKickoff (gols, escanteio, início).
   * t≈1 = bloco compacto no meio; t menor = mistura com posições atuais.
   */
  function planSoftResetMoves(entities, t = 1, opts = {}) {
    const world = createWorld({ seed: opts.seed || 1 });
    const pairs = syncEntitiesIntoWorld(world, entities, opts.ballU, opts.ballV);
    // Bola no setor central (evita puxar todo mundo para um canto)
    const bx = clamp(world.ball.x * (1 - t * 0.7), -18, 18);
    const by = clamp(world.ball.y * (1 - t * 0.55), -12, 12);
    world.ball.x = bx;
    world.ball.y = by;
    const attackSide = opts.attackSide || (bx >= 0 ? "home" : "away");
    setShapeBoth(world, attackSide, 0.85);
    settle(world, opts.settleCycles != null ? opts.settleCycles : 14, 3.2, {
      stadiumScreen: opts.stadiumScreen !== false,
    });
    clampKeepers(world);

    // Opcional: mistura leve com posição atual (t<1) sem voltar ao huddle
    if (t < 0.95) {
      for (const { entity, body } of pairs) {
        const cur = uvToWorld(entity.u, entity.v);
        body.x = lerp(cur.x, body.x, t);
        body.y = lerp(cur.y, body.y, t);
      }
      resolveCollisions(world, 12);
      clampKeepers(world);
      if (opts.stadiumScreen !== false) {
        spaceInStadiumScreen(world);
        clampKeepers(world);
      }
    }

    const G = global.MatchViewGeometry;
    return pairs.map(({ entity, body }, i) => {
      let uv = worldToUV(body.x, body.y);
      if (body.role === "GK" && G?.clampToSixYardArea) {
        uv = G.clampToSixYardArea(uv.u, uv.v, body.team, G.SIX_YARD_AREAS, G.FIELD_CORNERS);
      }
      return {
        entity,
        u: uv.u,
        v: uv.v,
        duration: (opts.duration || 380) + (i % 4) * 15,
        fromWorld: true,
        isGk: body.role === "GK",
      };
    });
  }

  global.MatchViewWorldPitch = {
    FIELD,
    PLAYER_RADIUS,
    MIN_CENTER_DIST,
    MIN_OPP_DIST,
    SIX_YARD,
    FIFA,
    DUTY,
    FUNCAO,
    FUNCAO_BEHAVIOR,
    DUTY_DEFAULT_FUNCAO,
    ensureDuties,
    byDuty,
    funcaoBehavior,
    applyFuncaoToTarget,
    worldToUV,
    uvToWorld,
    worldToUVLinear,
    uvToWorldLinear,
    getStadiumCalib,
    spaceInStadiumScreen,
    clampToSixYardWorld,
    clampKeepers,
    softResetFormation,
    setCornerShape,
    planCornerMoves,
    planSoftResetMoves,
    createWorld,
    formation433,
    playersOf,
    byRole,
    setShapeIP,
    setShapeOOP,
    setShapeBoth,
    limitNearBall,
    countBehindBall,
    countNearBall,
    countMesclaPairs,
    fifaShapeReport,
    spaceTargets,
    resolveCollisions,
    step,
    settle,
    minSeparation,
    teamWidth,
    teamDepth,
    avgRoleX,
    toUVSnapshot,
    kickoffUVSlots,
    pairEntities,
    syncEntitiesIntoWorld,
    planShapeMoves,
    clampInField,
    dist,
  };
})(typeof window !== "undefined" ? window : globalThis);
