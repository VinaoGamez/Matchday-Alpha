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
 * Acréscimo longo (8–10') no 2º tempo: mata-mata, ou últimas 2 rodadas da liga.
 * @param {{ knockout?: boolean, round?: number, totalRounds?: number }} ctx
 */
export function allowsExtendedSecondHalfStoppage({
  knockout = false,
  round = 0,
  totalRounds = 0,
} = {}) {
  if (knockout) return true;
  const r = Math.floor(Number(round) || 0);
  const total = Math.floor(Number(totalRounds) || 0);
  if (total < 2 || r < 1) return false;
  return r >= total - 1;
}

/**
 * Minutos de acréscimo a partir de interrupções da etapa.
 * Contagens devem ser só da etapa (1º ou 2º), não acumulado da partida.
 * Guiado por eventos: sem cartão/sub o 2º tempo não passa de 2–3' (4' só com muitas faltas/gols).
 * Com `extendedStoppage` (só 2º elegível): raro 8–10' e só com etapa muito parada.
 * @param {{ fouls?: number, yellow?: number, red?: number, subs?: number, goals?: number, half?: 'first'|'second', extendedStoppage?: boolean, random?: () => number }} ctx
 */
export function rollStoppageMinutes(ctx = {}) {
  const random = typeof ctx.random === 'function' ? ctx.random : Math.random;
  const half = ctx.half === 'second' ? 'second' : 'first';
  const fouls = Math.max(0, Number(ctx.fouls) || 0);
  const yellow = Math.max(0, Number(ctx.yellow) || 0);
  const red = Math.max(0, Number(ctx.red) || 0);
  const subs = Math.max(0, Number(ctx.subs) || 0);
  const goals = Math.max(0, Number(ctx.goals) || 0);
  const extended = half === 'second' && !!ctx.extendedStoppage;

  // Tempo perdido estimado — cartões e subs pesam; faltas sozinhas quase não sobem o quadro.
  const lost =
    Math.min(1.0, fouls / 14) +
    yellow * 0.35 +
    red * 1.25 +
    (half === 'second' ? Math.min(1.8, subs * 0.28) : Math.min(0.5, subs * 0.25)) +
    Math.min(0.9, goals * 0.28);

  const base = half === 'first' ? 1 : 2;
  let minutes = Math.round(base + lost * 0.75);
  // Ruído mínimo e só se já houver interrupção relevante.
  if (lost >= 1.4 && random() < 0.22) minutes += 1;

  // Teto duro: sem cartão/sub, não existe 5–7' "por sorte".
  const majorStops = yellow + red * 2 + Math.floor(subs / 3);
  let max;
  if (half === 'first') {
    max = majorStops === 0 && fouls < 10 ? 2 : majorStops <= 1 ? 3 : 4;
  } else if (majorStops === 0) {
    max = fouls >= 14 || goals >= 3 ? 4 : fouls >= 9 || goals >= 2 ? 3 : 2;
  } else if (majorStops <= 2) {
    max = 5;
  } else if (majorStops <= 4) {
    max = 6;
  } else {
    max = 7;
  }

  const min = half === 'first' ? 1 : 2;
  minutes = clamp(minutes, Math.min(min, max), max);

  // 8–10' só com etapa realmente parada + contexto elegível.
  if (extended && minutes >= 6 && lost >= 4.2 && majorStops >= 4 && random() < 0.035) {
    const tier = random();
    minutes = tier < 0.55 ? 8 : tier < 0.85 ? 9 : 10;
  }

  return minutes;
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
