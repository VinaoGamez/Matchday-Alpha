/**
 * Evolução de overall/atributos em pulsos na temporada + idade no fim do ano.
 * POT é teto fixo (não sobe na carreira).
 */
import { MODULE_VERSIONS } from '../core/constants.js';
import { resolvePlayerId } from './player-identity.js';
import { playerKey } from './player-match-stats.js';

export const DEVELOPMENT_MODULE_VERSION = MODULE_VERSIONS.playerDevelopment || 1;

export const PULSE_IDS = {
  postFirstWindow: 'postFirstWindow',
  mid: 'mid',
  postSecondWindow: 'postSecondWindow',
  seasonEnd: 'seasonEnd',
};

const HARD_YEAR_MAX = 5;
const HARD_YEAR_MIN = -2;
const MIN_PERIOD_MINUTES = 180;

const ATTR_BY_POS = {
  GOL: ['reflexes', 'positioning', 'penaltySaving', 'passing'],
  ZAG: ['marking', 'tackling', 'heading', 'passing'],
  LAT: ['speed', 'tackling', 'passing', 'dribble'],
  VOL: ['tackling', 'marking', 'passing', 'heading'],
  MC: ['passing', 'dribble', 'tackling', 'finishing'],
  MEI: ['passing', 'dribble', 'finishing', 'speed'],
  PE: ['speed', 'dribble', 'finishing', 'passing'],
  PD: ['speed', 'dribble', 'finishing', 'passing'],
  ATA: ['finishing', 'heading', 'speed', 'dribble'],
};

const POT_CAPS = { A: 97, B: 92, C: 87, D: 83 };

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function emptyDevelopmentState(season = null) {
  return {
    season: season ?? null,
    pulsesDone: [],
    yearDeltaByPlayer: {},
    snapByPlayer: {},
  };
}

export function normalizeDevelopmentState(raw, season) {
  const base = emptyDevelopmentState(season);
  if (!raw || typeof raw !== 'object') return base;
  const sameSeason = Number(raw.season) === Number(season);
  return {
    season: Number(season) || raw.season || null,
    pulsesDone: sameSeason && Array.isArray(raw.pulsesDone) ? [...raw.pulsesDone] : [],
    yearDeltaByPlayer:
      sameSeason && raw.yearDeltaByPlayer && typeof raw.yearDeltaByPlayer === 'object'
        ? { ...raw.yearDeltaByPlayer }
        : {},
    snapByPlayer:
      sameSeason && raw.snapByPlayer && typeof raw.snapByPlayer === 'object'
        ? { ...raw.snapByPlayer }
        : {},
  };
}

/**
 * Idade no elenco profissional (base vem depois).
 * <19 é raro: ~3% (17–18); 19 ~4%; pico em 24–29.
 */
export function rollSquadAge(random = Math.random) {
  const r = typeof random === 'function' ? random() : Math.random();
  const pick = (lo, hi) => lo + Math.floor((typeof random === 'function' ? random() : Math.random()) * (hi - lo + 1));
  if (r < 0.01) return 17;
  if (r < 0.03) return 18;
  if (r < 0.07) return 19;
  if (r < 0.18) return pick(20, 21);
  if (r < 0.36) return pick(22, 24);
  if (r < 0.62) return pick(25, 28);
  if (r < 0.82) return pick(29, 31);
  if (r < 0.94) return pick(32, 34);
  return pick(35, 36);
}

/**
 * POT na geração: jóias (<20) com gap alto; veterano quase zero.
 * POT é teto fixo na carreira.
 */
export function rollPotential(overall, age, division = 'A', random = Math.random) {
  const ovr = Math.round(Number(overall) || 50);
  const years = Math.round(Number(age) || 25);
  const cap = POT_CAPS[division] || 90;
  const r = typeof random === 'function' ? random() : Math.random();
  let gap = 0;
  if (years <= 18) {
    // Jóia no profissional: teto alto (base ficará para a categoria de base).
    gap = 16 + Math.floor(r * 12);
    if (r > 0.82) gap = Math.max(gap, cap - ovr);
  } else if (years <= 19) {
    gap = 13 + Math.floor(r * 10);
    if (r > 0.9) gap = Math.max(gap, Math.floor((cap - ovr) * 0.85));
  } else if (years <= 22) gap = 5 + Math.floor(r * 6);
  else if (years <= 25) gap = 2 + Math.floor(r * 5);
  else if (years <= 28) gap = Math.floor(r * 4);
  else if (years <= 32) gap = Math.floor(r * 2);
  else gap = 0;
  return clamp(ovr + gap, ovr, cap);
}

function ageBand(age) {
  const a = Number(age) || 25;
  if (a <= 20) return { yMin: 0, yMax: 5 };
  if (a <= 24) return { yMin: -0.5, yMax: 4 };
  if (a <= 28) return { yMin: -0.5, yMax: 2.5 };
  if (a <= 32) return { yMin: -0.5, yMax: 2 };
  if (a <= 35) return { yMin: -1, yMax: 2, needElite: true };
  if (a <= 38) return { yMin: -1.5, yMax: 0.5 };
  return { yMin: -2, yMax: 0.5 };
}

function readSeasonTotals(bucket) {
  return {
    minutes: Number(bucket?.minutes) || 0,
    starts: Number(bucket?.starts) || 0,
    ratingSum: Number(bucket?.ratingSum) || 0,
    ratingCount: Number(bucket?.ratingCount) || 0,
  };
}

function periodFromSnap(totals, snap) {
  const s = snap || { minutes: 0, starts: 0, ratingSum: 0, ratingCount: 0 };
  return {
    minutes: Math.max(0, totals.minutes - (Number(s.minutes) || 0)),
    starts: Math.max(0, totals.starts - (Number(s.starts) || 0)),
    ratingSum: Math.max(0, totals.ratingSum - (Number(s.ratingSum) || 0)),
    ratingCount: Math.max(0, totals.ratingCount - (Number(s.ratingCount) || 0)),
  };
}

function avgRating(period) {
  if (!period.ratingCount) return null;
  return period.ratingSum / period.ratingCount;
}

/**
 * Delta inteiro de overall no pulso, respeitando teto/piso anual.
 */
export function computePulseDelta(player, period, yearDeltaSoFar) {
  const age = Number(player?.age) || 25;
  const band = ageBand(age);
  const used = Number(yearDeltaSoFar) || 0;
  const roomUp = Math.min(band.yMax, HARD_YEAR_MAX) - used;
  const roomDown = Math.max(band.yMin, HARD_YEAR_MIN) - used;

  if (period.minutes < MIN_PERIOD_MINUTES) {
    if (age >= 36 && period.minutes < 90 && roomDown < 0) {
      return clamp(-1, roomDown, roomUp);
    }
    return 0;
  }

  const avg = avgRating(period);
  const rating = avg == null ? 6.5 : avg;
  let score = 0;
  if (rating >= 8) score += 2;
  else if (rating >= 7) score += 1;
  else if (rating < 5.5) score -= 1;
  else if (rating < 6.2) score -= 0;

  if (period.starts >= 6) score += 1;
  else if (period.starts <= 1 && period.minutes < 400) score -= 0;
  if (period.minutes >= 600) score += 1;

  let delta = 0;
  if (age <= 32) {
    if (score >= 3) delta = 2;
    else if (score >= 1) delta = 1;
    else if (score <= -1) delta = -1;
  } else if (age <= 35) {
    const elite = rating >= 7.5 && period.starts >= 4 && period.minutes >= 360;
    if (elite && score >= 4 && rating >= 8) delta = 2;
    else if (elite && score >= 2) delta = 1;
    else if (score <= -1 || (rating < 6.2 && period.minutes >= 300)) delta = -1;
  } else {
    // 36+: segura nível com boa forma; erode devagar se não
    if (rating >= 8.5 && period.minutes >= 500 && period.starts >= 4 && roomUp > 0) delta = 1;
    else if (rating >= 7 && period.minutes >= 300) delta = 0;
    else if (rating < 6.5 || period.minutes < 250) delta = -1;
  }

  if (delta > 0) delta = Math.min(delta, Math.max(0, Math.floor(roomUp)));
  if (delta < 0) delta = Math.max(delta, Math.min(0, Math.ceil(roomDown)));
  return delta;
}

export function applyOverallDelta(player, delta) {
  const change = Math.round(Number(delta) || 0);
  if (!change || !player) return false;
  const pot = Math.max(
    Number(player.overall) || 1,
    Number(player.potential) || Number(player.overall) || 99,
  );
  const before = Number(player.overall) || 50;
  player.overall = clamp(before + change, 1, pot);
  player.potential = Math.max(Number(player.potential) || player.overall, player.overall);

  const applied = player.overall - before;
  if (!applied) return false;

  const keys = ATTR_BY_POS[player.pos] || ['passing', 'speed', 'dribble', 'finishing'];
  let left = Math.abs(applied);
  const sign = Math.sign(applied);
  let guard = 0;
  while (left > 0 && guard < 24) {
    const key = keys[guard % keys.length];
    const cur = Number(player[key]);
    if (Number.isFinite(cur)) {
      const next = clamp(cur + sign, 1, 99);
      if (next !== cur) {
        player[key] = next;
        left -= 1;
      }
    }
    guard += 1;
  }
  return true;
}

export function syncClubPowers(clubs) {
  Object.values(clubs || {}).forEach(club => {
    const roster = Array.isArray(club?.roster) ? club.roster : [];
    if (!roster.length) return;
    const starters = roster.slice(0, 11);
    club.power = Math.round(
      starters.reduce((sum, p) => sum + (Number(p.overall) || 0), 0) / starters.length,
    );
  });
}

/**
 * Pulsos devidos ao cruzar datas da temporada (além do seasonEnd explícito).
 */
export function dueCalendarPulses(date, season, pulsesDone = []) {
  const done = new Set(pulsesDone || []);
  const y = Number(season);
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(y) || Number.isNaN(d.getTime())) return [];
  const due = [];
  const firstEnd = new Date(y, 2, 3, 23, 59, 59); // 3 mar
  const mid = new Date(y, 6, 1, 0, 0, 0); // 1 jul
  const secondEnd = new Date(y, 8, 11, 23, 59, 59); // 11 set
  if (!done.has(PULSE_IDS.postFirstWindow) && d > firstEnd) due.push(PULSE_IDS.postFirstWindow);
  if (!done.has(PULSE_IDS.mid) && d >= mid) due.push(PULSE_IDS.mid);
  if (!done.has(PULSE_IDS.postSecondWindow) && d > secondEnd) due.push(PULSE_IDS.postSecondWindow);
  return due;
}

/**
 * Roda um pulso em todos os elencos.
 * @returns {{ pulseId, changed, skipped }}
 */
export function runDevelopmentPulse({
  clubs,
  pulseId,
  season,
  state,
  getSeasonBucket,
} = {}) {
  const st = state || emptyDevelopmentState(season);
  if (st.pulsesDone.includes(pulseId)) {
    return { pulseId, changed: 0, skipped: true, state: st };
  }

  let changed = 0;
  Object.values(clubs || {}).forEach(club => {
    const roster = Array.isArray(club?.roster) ? club.roster : [];
    roster.forEach(player => {
      if (!player) return;
      const id = resolvePlayerId(player) || playerKey(player);
      if (!id) return;
      const bucket =
        typeof getSeasonBucket === 'function' ? getSeasonBucket(player, id) : null;
      const totals = readSeasonTotals(bucket);
      const period = periodFromSnap(totals, st.snapByPlayer[id]);
      const yearUsed = Number(st.yearDeltaByPlayer[id]) || 0;
      const delta = computePulseDelta(player, period, yearUsed);
      if (delta && applyOverallDelta(player, delta)) {
        st.yearDeltaByPlayer[id] = yearUsed + delta;
        changed += 1;
      }
      st.snapByPlayer[id] = { ...totals };
    });
  });

  st.pulsesDone.push(pulseId);
  st.season = season;
  syncClubPowers(clubs);
  return { pulseId, changed, skipped: false, state: st };
}

/** Idade +1 no plantel mundial (fim de temporada / nova temporada). */
export function advancePlayerAges(clubs) {
  let count = 0;
  Object.values(clubs || {}).forEach(club => {
    (club?.roster || []).forEach(player => {
      if (!player) return;
      player.age = Math.min(55, (Number(player.age) || 17) + 1);
      count += 1;
    });
  });
  return count;
}

/**
 * Garante pulsos atrasados após avanço de calendário.
 */
export function ensureCalendarDevelopmentPulses({
  clubs,
  date,
  season,
  state,
  getSeasonBucket,
} = {}) {
  const st = normalizeDevelopmentState(state, season);
  const due = dueCalendarPulses(date, season, st.pulsesDone);
  const results = [];
  let next = st;
  due.forEach(pulseId => {
    const result = runDevelopmentPulse({
      clubs,
      pulseId,
      season,
      state: next,
      getSeasonBucket,
    });
    next = result.state;
    results.push(result);
  });
  return { state: next, results };
}
