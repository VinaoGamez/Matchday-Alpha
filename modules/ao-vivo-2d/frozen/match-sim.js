/**
 * Simulação visual de partida inteira (90') no match-view.
 * Orquestra coreografias do playbook + placar/cronômetro.
 *
 * Não substitui o AO VIVO do engine — é demo/televisão 2D.
 */
(function (global) {
  "use strict";

  function mulberry32(seed) {
    let t = (seed >>> 0) || 1;
    return function rand() {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function weightedPick(catalog, rand) {
    const entries = Object.entries(catalog);
    const total = entries.reduce((s, [, v]) => s + (v.weight || 1), 0);
    let roll = rand() * total;
    for (const [key, v] of entries) {
      roll -= v.weight || 1;
      if (roll <= 0) return key;
    }
    return entries[0][0];
  }

  function clockLabel(minute, stoppage) {
    if (stoppage && minute >= 45 && minute < 46) return `45+${stoppage}'`;
    if (stoppage && minute >= 90) return `90+${stoppage}'`;
    return `${minute}'`;
  }

  /**
   * @param {object} api
   * @param {object} hooks - { onTick, onEvent, onScore, onEnd, setupKickoff, setPlaying }
   * @param {object} opts
   */
  async function runFullMatch(api, hooks = {}, opts = {}) {
    const Playbook = global.MatchViewPlaybook;
    if (!Playbook) throw new Error("MatchViewPlaybook ausente");

    const rand = mulberry32(opts.seed != null ? opts.seed : Date.now());
    const pace = opts.pace > 0 ? opts.pace : 1.35; // >1 = mais rápido
    const maxEvents = opts.maxEvents || 36;
    const skipRestore = opts.skipRestore !== false;

    let minute = 0;
    let homeGoals = Number(opts.homeGoals) || 0;
    let awayGoals = Number(opts.awayGoals) || 0;
    let events = 0;
    let stopped = false;
    let attackSide = rand() > 0.5 ? "home" : "away";

    const state = {
      get minute() {
        return minute;
      },
      get homeGoals() {
        return homeGoals;
      },
      get awayGoals() {
        return awayGoals;
      },
      get events() {
        return events;
      },
      get running() {
        return !stopped && api.isMatchRunning?.();
      },
      stop() {
        stopped = true;
      },
    };

    api.setMatchRunning?.(true);
    api.setPlaying?.(true);

    const paint = () => {
      hooks.onTick?.({
        minute,
        clock: clockLabel(minute),
        homeGoals,
        awayGoals,
        events,
        attackSide,
      });
    };

    paint();
    hooks.onStart?.({ homeGoals, awayGoals });

    const skipFade = !!opts.instant || !!opts.skipFade;
    /** Fade out → reset → fade in (entre jogadas / kickoff) */
    async function transitionReset(fn) {
      if (!skipFade && typeof api.fadeField === "function") {
        await api.fadeField(0, Math.round(180 / pace));
      }
      await fn();
      if (!skipFade && typeof api.fadeField === "function") {
        // setupKickoff recria tokens em opacity 1 — força 0 e sobe de leve
        await api.fadeField(0, 0);
        await api.fadeField(1, Math.round(260 / pace));
      }
    }

    // saída
    if (typeof hooks.setupKickoff === "function") {
      await transitionReset(async () => {
        hooks.setupKickoff();
        await sleep(200 / pace);
      });
    }

    try {
      while (!stopped && minute < 90 && events < maxEvents) {
        if (api.isMatchRunning && !api.isMatchRunning()) break;

        // avança 2–4 minutos (ritmo estilo highlights FM)
        const step = 2 + Math.floor(rand() * 3);
        minute = Math.min(90, minute + step);
        paint();

        if (minute === 45 || (minute > 45 && minute - step < 45)) {
          hooks.onEvent?.({ kind: "halftime", minute: 45 });
          if (typeof hooks.setupKickoff === "function") {
            await transitionReset(async () => {
              hooks.setupKickoff();
              await sleep(500 / pace);
            });
          } else {
            await sleep(900 / pace);
          }
          minute = Math.max(minute, 45);
          paint();
        }

        // ~25% dos minutos “mortos” (posse sem destaque) — só idle curto
        if (rand() < 0.22) {
          await sleep(280 / pace);
          continue;
        }

        attackSide = rand() < 0.52 ? attackSide : opp(attackSide);
        // leve viés de posse
        if (opts.homeBias != null && rand() < Math.abs(opts.homeBias)) {
          attackSide = opts.homeBias > 0 ? "home" : "away";
        }

        let kind = weightedPick(Playbook.CATALOG, rand);
        // após desarme, chance de contra
        const playOpts = { seed: (opts.seed || 1) + events * 997, pace, instant: !!opts.instant };

        if (kind === "shot" || kind === "counter" || kind === "cross" || kind === "corner") {
          // define desfecho ofensivo
          const roll = rand();
          playOpts.outcome =
            roll < 0.18 ? "goal" : roll < 0.48 ? "save" : roll < 0.7 ? "wide" : "miss";
          if (kind === "corner" && playOpts.outcome === "wide") playOpts.outcome = "clear";
          if (kind === "cross" && playOpts.outcome === "wide") playOpts.outcome = "miss";
        }

        hooks.onEvent?.({
          kind: "play",
          play: kind,
          attackSide,
          minute,
          label: Playbook.CATALOG[kind]?.label || kind,
        });

        let result;
        try {
          // skipSoftReset no play: o sim controla o reset (evita duplo)
          result = await Playbook.CATALOG[kind].run(api, attackSide, {
            ...playOpts,
            skipSoftReset: true,
          });
        } catch (err) {
          result = { ok: false, reason: String(err?.message || err), kind };
        }
        events += 1;

        if (result?.ok && result.outcome === "goal") {
          if (attackSide === "home") homeGoals += 1;
          else awayGoals += 1;
          hooks.onScore?.({
            homeGoals,
            awayGoals,
            scorerSide: attackSide,
            minute,
            play: kind,
          });
          paint();
          await sleep(500 / pace);
          if (typeof hooks.setupKickoff === "function") {
            await transitionReset(async () => {
              hooks.setupKickoff();
              await sleep(200 / pace);
            });
          }
        } else if (result?.ok && result.kind === "tackle") {
          attackSide = result.wonBy || opp(attackSide);
          if (rand() < 0.4) {
            const cOpts = {
              ...playOpts,
              skipSoftReset: true,
              outcome: rand() < 0.3 ? "goal" : rand() < 0.5 ? "save" : "wide",
            };
            hooks.onEvent?.({
              kind: "play",
              play: "counter",
              attackSide,
              minute,
              label: "Contra-ataque",
            });
            const counter = await Playbook.CATALOG.counter.run(api, attackSide, cOpts);
            events += 1;
            if (counter?.outcome === "goal") {
              if (attackSide === "home") homeGoals += 1;
              else awayGoals += 1;
              hooks.onScore?.({
                homeGoals,
                awayGoals,
                scorerSide: attackSide,
                minute,
                play: "counter",
              });
              paint();
              await sleep(500 / pace);
              if (typeof hooks.setupKickoff === "function") {
                await transitionReset(async () => {
                  hooks.setupKickoff();
                  await sleep(200 / pace);
                });
              }
            } else if (typeof hooks.softReset === "function") {
              await transitionReset(() => hooks.softReset(0.55));
            }
          } else if (typeof hooks.softReset === "function") {
            await transitionReset(() => hooks.softReset(0.5));
          }
        } else if (result?.ok) {
          // Bola parada / escanteio → kickoff limpo (evita bolo do soft-lerp)
          if (result.needsHardReset || result.kind === "corner") {
            if (typeof hooks.setupKickoff === "function") {
              await transitionReset(() => {
                hooks.setupKickoff();
              });
            } else if (typeof hooks.softReset === "function") {
              await transitionReset(() => hooks.softReset(1));
            }
          } else if (typeof hooks.softReset === "function") {
            // Mid-block com mescla (não kickoff — evita muro no meio-campo)
            await transitionReset(() => hooks.softReset(0.75));
          } else if (skipRestore && typeof hooks.setupKickoff === "function" && rand() < 0.3) {
            await transitionReset(() => {
              hooks.setupKickoff();
            });
          }
        }

        await sleep(220 / pace);
        paint();
      }

      // acréscimos curtos
      if (!stopped && minute >= 90) {
        for (let stoppage = 1; stoppage <= 2 && !stopped; stoppage++) {
          hooks.onTick?.({
            minute: 90,
            clock: clockLabel(90, stoppage),
            homeGoals,
            awayGoals,
            events,
            attackSide,
          });
          if (rand() < 0.45 && events < maxEvents + 2) {
            const kind = rand() < 0.5 ? "shot" : "corner";
            const side = rand() < 0.5 ? "home" : "away";
            const playOpts = {
              seed: events + stoppage,
              pace,
              outcome: rand() < 0.15 ? "goal" : "save",
            };
            const result = await Playbook.CATALOG[kind].run(api, side, playOpts);
            events += 1;
            if (result?.outcome === "goal") {
              if (side === "home") homeGoals += 1;
              else awayGoals += 1;
              hooks.onScore?.({ homeGoals, awayGoals, scorerSide: side, minute: 90, play: kind });
              if (typeof hooks.setupKickoff === "function") hooks.setupKickoff();
            }
          }
          await sleep(400 / pace);
        }
      }
    } finally {
      minute = 90;
      paint();
      api.setPlaying?.(false);
      api.setMatchRunning?.(false);
      hooks.onEnd?.({
        homeGoals,
        awayGoals,
        events,
        minute: 90,
      });
    }

    return { homeGoals, awayGoals, events, minute: 90 };
  }

  function opp(side) {
    return side === "home" ? "away" : "home";
  }

  function sleep(ms) {
    if (ms <= 0) return Promise.resolve();
    return new Promise((r) => setTimeout(r, ms));
  }

  global.MatchViewMatchSim = {
    runFullMatch,
    clockLabel,
    weightedPick,
  };
})(typeof window !== "undefined" ? window : globalThis);
