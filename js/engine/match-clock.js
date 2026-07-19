import { clamp } from '../ui/dom.js';

/**
 * Relógio de partida — acréscimos e rótulos (45+2 / 90+3).
 * Gol contra: chance por tipo de finalização.
 */

/** Chance de gol contra em finalização no alvo (nunca em pênalti/shootout). */
export function ownGoalChance(options = {}) {
  if (options.penalty || options.shootout) return 0;
  if (options.freeKick) return 0.0025;
  if (options.corner) return 0.02;
  return 0.007;
}

/**
 * Minutos de acréscimo a partir de interrupções da etapa.
 * @param {{ fouls?: number, yellow?: number, red?: number, subs?: number, half?: 'first'|'second', random?: () => number }} ctx
 */
export function rollStoppageMinutes(ctx = {}) {
  const random = typeof ctx.random === 'function' ? ctx.random : Math.random;
  const half = ctx.half === 'second' ? 'second' : 'first';
  const fouls = Math.max(0, Number(ctx.fouls) || 0);
  const yellow = Math.max(0, Number(ctx.yellow) || 0);
  const red = Math.max(0, Number(ctx.red) || 0);
  const subs = Math.max(0, Number(ctx.subs) || 0);
  const base = half === 'first' ? 1 : 2;
  const fromEvents = Math.floor(fouls / 7) + Math.floor(yellow / 2) + red * 2 + Math.floor(subs / 2);
  const noise = Math.floor(random() * 3);
  const max = half === 'first' ? 5 : 7;
  return clamp(base + fromEvents + noise, 1, max);
}

/** Rótulo de minuto para timeline, gols e relatórios (`67` ou `45+2`). */
export function formatMatchMinuteLabel(minute, stoppage = 0) {
  const base = Math.max(0, Math.floor(Number(minute) || 0));
  const extra = Math.max(0, Math.floor(Number(stoppage) || 0));
  if (extra > 0) {
    const anchor = base <= 45 ? 45 : 90;
    return `${anchor}+${extra}`;
  }
  return String(base);
}

/**
 * Partes do relógio ao vivo — acréscimo somado no minuto (`45+5` → `50`)
 * e badge `(+5)` depois do tempo.
 * @returns {{ main: string, stoppage: string|null, seconds: string }}
 */
export function formatLiveClockParts(minute, stoppageElapsed = 0, seconds = 0) {
  const ss = String(Math.max(0, Math.floor(Number(seconds) || 0) % 60)).padStart(2, '0');
  const extra = Math.max(0, Math.floor(Number(stoppageElapsed) || 0));
  if (extra > 0) {
    const base = Math.max(0, Math.floor(Number(minute) || 0)) <= 45 ? 45 : 90;
    return { main: String(base + extra), stoppage: `+${extra}`, seconds: ss };
  }
  const mm = String(Math.min(90, Math.max(0, Math.floor(Number(minute) || 0)))).padStart(2, '0');
  return { main: mm, stoppage: null, seconds: ss };
}

/** Texto plano do relógio (`50:00(+5)` ou `67:05`). */
export function formatLiveClockTime(minute, stoppageElapsed = 0, seconds = 0) {
  const parts = formatLiveClockParts(minute, stoppageElapsed, seconds);
  if (parts.stoppage) return `${parts.main}:${parts.seconds}(${parts.stoppage})`;
  return `${parts.main}:${parts.seconds}`;
}

/**
 * Minuto contínuo do gráfico Volume (inclui acréscimos).
 * 0–45 → 1º tempo; 45–45+S1 → acréscimo 1º; 45+S1–90+S1 → 2º; depois +S2.
 */
export function toChartMinute({
  minute = 0,
  stoppage = 0,
  stoppageFirst = 0,
} = {}) {
  const m = Math.max(0, Math.floor(Number(minute) || 0));
  const s = Math.max(0, Math.floor(Number(stoppage) || 0));
  const s1 = Math.max(0, Math.floor(Number(stoppageFirst) || 0));
  if (m < 45) return m;
  // 45' + acréscimo 1º; no início do 2º (stoppage zerado) continua em 45+S1.
  if (m === 45) return 45 + (s > 0 ? s : s1);
  if (m < 90) return m + s1;
  return 90 + s1 + s;
}

/** Comprimento total do eixo Volume (90 + acréscimos anunciados). */
export function chartSpan(stoppageFirst = 0, stoppageSecond = 0) {
  return (
    90 +
    Math.max(0, Math.floor(Number(stoppageFirst) || 0)) +
    Math.max(0, Math.floor(Number(stoppageSecond) || 0))
  );
}
