/**
 * Chaveamento FIFA 2026 — R32 com Annex C + árvore oficial (M73–M104).
 */

import { ANNEX_C_WINNERS, ANNEX_C_ROWS } from './world-cup-third-place-assignments.js';
import { pickBestThirdPlaces } from './world-cup-standings.js';
import { KNOCKOUT_SCHEDULE, WORLD_CUP_COMPETITION } from './world-cup-calendar.js';

const THIRD_PLACE_LOOKUP = new Map();
for (const letters of ANNEX_C_ROWS) {
  const byWinner = {};
  for (let j = 0; j < ANNEX_C_WINNERS.length; j += 1) {
    byWinner[ANNEX_C_WINNERS[j]] = letters[j];
  }
  THIRD_PLACE_LOOKUP.set(letters.split('').sort().join(''), byWinner);
}

/** Template oficial — refs resolvidos após fase de grupos. */
export const KNOCKOUT_TEMPLATE = Object.freeze([
  { id: 'R32-1', stage: 'R32', phase: '16 AVOS DE FINAL', round: 4, slotIndex: 0, home: { run: 'A' }, away: { run: 'B' } },
  { id: 'R32-2', stage: 'R32', phase: '16 AVOS DE FINAL', round: 4, slotIndex: 1, home: { win: 'C' }, away: { run: 'F' } },
  { id: 'R32-3', stage: 'R32', phase: '16 AVOS DE FINAL', round: 4, slotIndex: 2, home: { win: 'E' }, away: { t: ['A', 'B', 'C', 'D', 'F'] } },
  { id: 'R32-4', stage: 'R32', phase: '16 AVOS DE FINAL', round: 4, slotIndex: 3, home: { win: 'F' }, away: { run: 'C' } },
  { id: 'R32-5', stage: 'R32', phase: '16 AVOS DE FINAL', round: 4, slotIndex: 4, home: { run: 'E' }, away: { run: 'I' } },
  { id: 'R32-6', stage: 'R32', phase: '16 AVOS DE FINAL', round: 4, slotIndex: 5, home: { win: 'I' }, away: { t: ['C', 'D', 'F', 'G', 'H'] } },
  { id: 'R32-7', stage: 'R32', phase: '16 AVOS DE FINAL', round: 4, slotIndex: 6, home: { win: 'A' }, away: { t: ['C', 'E', 'F', 'H', 'I'] } },
  { id: 'R32-8', stage: 'R32', phase: '16 AVOS DE FINAL', round: 4, slotIndex: 7, home: { win: 'L' }, away: { t: ['E', 'H', 'I', 'J', 'K'] } },
  { id: 'R32-9', stage: 'R32', phase: '16 AVOS DE FINAL', round: 4, slotIndex: 8, home: { win: 'G' }, away: { t: ['A', 'E', 'H', 'I', 'J'] } },
  { id: 'R32-10', stage: 'R32', phase: '16 AVOS DE FINAL', round: 4, slotIndex: 9, home: { win: 'D' }, away: { t: ['B', 'E', 'F', 'I', 'J'] } },
  { id: 'R32-11', stage: 'R32', phase: '16 AVOS DE FINAL', round: 4, slotIndex: 10, home: { win: 'H' }, away: { run: 'J' } },
  { id: 'R32-12', stage: 'R32', phase: '16 AVOS DE FINAL', round: 4, slotIndex: 11, home: { run: 'K' }, away: { run: 'L' } },
  { id: 'R32-13', stage: 'R32', phase: '16 AVOS DE FINAL', round: 4, slotIndex: 12, home: { win: 'B' }, away: { t: ['E', 'F', 'G', 'I', 'J'] } },
  { id: 'R32-14', stage: 'R32', phase: '16 AVOS DE FINAL', round: 4, slotIndex: 13, home: { run: 'D' }, away: { run: 'G' } },
  { id: 'R32-15', stage: 'R32', phase: '16 AVOS DE FINAL', round: 4, slotIndex: 14, home: { win: 'J' }, away: { run: 'H' } },
  { id: 'R32-16', stage: 'R32', phase: '16 AVOS DE FINAL', round: 4, slotIndex: 15, home: { win: 'K' }, away: { t: ['D', 'E', 'I', 'J', 'L'] } },

  { id: 'R16-1', stage: 'R16', phase: 'OITAVAS DE FINAL', round: 5, slotIndex: 0, home: { w: 'R32-3' }, away: { w: 'R32-6' } },
  { id: 'R16-2', stage: 'R16', phase: 'OITAVAS DE FINAL', round: 5, slotIndex: 1, home: { w: 'R32-1' }, away: { w: 'R32-4' } },
  { id: 'R16-3', stage: 'R16', phase: 'OITAVAS DE FINAL', round: 5, slotIndex: 2, home: { w: 'R32-2' }, away: { w: 'R32-5' } },
  { id: 'R16-4', stage: 'R16', phase: 'OITAVAS DE FINAL', round: 5, slotIndex: 3, home: { w: 'R32-7' }, away: { w: 'R32-8' } },
  { id: 'R16-5', stage: 'R16', phase: 'OITAVAS DE FINAL', round: 5, slotIndex: 4, home: { w: 'R32-12' }, away: { w: 'R32-11' } },
  { id: 'R16-6', stage: 'R16', phase: 'OITAVAS DE FINAL', round: 5, slotIndex: 5, home: { w: 'R32-10' }, away: { w: 'R32-9' } },
  { id: 'R16-7', stage: 'R16', phase: 'OITAVAS DE FINAL', round: 5, slotIndex: 6, home: { w: 'R32-15' }, away: { w: 'R32-14' } },
  { id: 'R16-8', stage: 'R16', phase: 'OITAVAS DE FINAL', round: 5, slotIndex: 7, home: { w: 'R32-13' }, away: { w: 'R32-16' } },

  { id: 'QF-1', stage: 'QF', phase: 'QUARTAS DE FINAL', round: 6, slotIndex: 0, home: { w: 'R16-1' }, away: { w: 'R16-2' } },
  { id: 'QF-2', stage: 'QF', phase: 'QUARTAS DE FINAL', round: 6, slotIndex: 1, home: { w: 'R16-5' }, away: { w: 'R16-6' } },
  { id: 'QF-3', stage: 'QF', phase: 'QUARTAS DE FINAL', round: 6, slotIndex: 2, home: { w: 'R16-3' }, away: { w: 'R16-4' } },
  { id: 'QF-4', stage: 'QF', phase: 'QUARTAS DE FINAL', round: 6, slotIndex: 3, home: { w: 'R16-7' }, away: { w: 'R16-8' } },

  { id: 'SF-1', stage: 'SF', phase: 'SEMIFINAL', round: 7, slotIndex: 0, home: { w: 'QF-1' }, away: { w: 'QF-2' } },
  { id: 'SF-2', stage: 'SF', phase: 'SEMIFINAL', round: 7, slotIndex: 1, home: { w: 'QF-3' }, away: { w: 'QF-4' } },

  { id: '3P', stage: '3P', phase: '3º LUGAR', round: 8, slotIndex: 0, home: { l: 'SF-1' }, away: { l: 'SF-2' } },
  { id: 'F', stage: 'F', phase: 'FINAL', round: 9, slotIndex: 0, home: { w: 'SF-1' }, away: { w: 'SF-2' } },
]);

const SLOT_DEFS = [];
for (const m of KNOCKOUT_TEMPLATE) {
  for (const side of ['home', 'away']) {
    const ref = m[side];
    if (ref.t) {
      const other = m[side === 'home' ? 'away' : 'home'];
      SLOT_DEFS.push({ slotId: `${m.id}:${side}`, fixedWinner: other.win || null });
    }
  }
}

function assignThirdPlaces(qualThirds) {
  const byGroup = Object.fromEntries(qualThirds.map(q => [q.group, q]));
  const combo = qualThirds.map(q => q.group).sort().join('');
  const byWinner = THIRD_PLACE_LOOKUP.get(combo);
  if (!byWinner) return {};
  const out = {};
  for (const slot of SLOT_DEFS) {
    const thirdGroup = byWinner[slot.fixedWinner];
    if (thirdGroup && byGroup[thirdGroup]) {
      out[slot.slotId] = byGroup[thirdGroup];
    }
  }
  return out;
}

function teamFromRef(ref, ctx) {
  if (ref.win) {
    const row = ctx.standings[ref.win]?.[0];
    return row ? { code: row.code, name: row.name } : null;
  }
  if (ref.run) {
    const row = ctx.standings[ref.run]?.[1];
    return row ? { code: row.code, name: row.name } : null;
  }
  if (ref.w) return ctx.winners[ref.w] || null;
  if (ref.l) return ctx.losers[ref.l] || null;
  if (ref.t) {
    const slotId = ref._slotId;
    const assigned = ctx.thirdAssign?.[slotId];
    if (assigned?.row) return { code: assigned.row.code, name: assigned.row.name };
  }
  return null;
}

function flattenScheduleSlots() {
  const slots = [];
  for (const phaseDef of KNOCKOUT_SCHEDULE) {
    for (const slot of phaseDef.slots) {
      for (let i = 0; i < slot.count; i += 1) {
        slots.push({ month: slot.month, day: slot.day, phase: phaseDef.phase, round: phaseDef.round });
      }
    }
  }
  return slots;
}

const SCHEDULE_SLOTS = flattenScheduleSlots();

function dateInWindow(year, month, day) {
  return new Date(year, month, day, 12, 0, 0, 0);
}

const FIXTURE_TIMES = Object.freeze(['13:00', '16:00', '19:00', '22:00']);

/**
 * Monta contexto pós-grupos para resolver R32.
 */
export function buildKnockoutContext(allStandings, random = Math.random) {
  const bestThirds = pickBestThirdPlaces(allStandings, random);
  const thirdAssignRaw = assignThirdPlaces(bestThirds);
  const thirdAssign = {};
  for (const m of KNOCKOUT_TEMPLATE.filter(t => t.stage === 'R32')) {
    for (const side of ['home', 'away']) {
      const ref = m[side];
      if (ref.t) {
        ref._slotId = `${m.id}:${side}`;
        if (thirdAssignRaw[ref._slotId]) thirdAssign[ref._slotId] = thirdAssignRaw[ref._slotId];
      }
    }
  }
  return { standings: allStandings, thirdAssign, winners: {}, losers: {} };
}

function resolveTemplateMatch(template, ctx) {
  const homeRef = { ...template.home };
  const awayRef = { ...template.away };
  if (homeRef.t) homeRef._slotId = `${template.id}:home`;
  if (awayRef.t) awayRef._slotId = `${template.id}:away`;
  return {
    home: teamFromRef(homeRef, ctx),
    away: teamFromRef(awayRef, ctx),
  };
}

/**
 * Gera fixtures de uma fase do mata-mata (participantes já definidos).
 */
export function buildKnockoutPhaseFixtures(year, stage, ctx, startGameNumber) {
  const templates = KNOCKOUT_TEMPLATE.filter(t => t.stage === stage);
  const fixtures = [];
  let gameNumber = startGameNumber;

  templates.forEach((template, index) => {
    const { home, away } = resolveTemplateMatch(template, ctx);
    if (!home?.code || !away?.code) return;

    const schedule = SCHEDULE_SLOTS[template.slotIndex ?? index];
    if (!schedule) return;

    fixtures.push({
      id: template.id,
      home: home.name,
      away: away.name,
      homeCode: home.code,
      awayCode: away.code,
      competition: WORLD_CUP_COMPETITION,
      phase: template.phase,
      group: null,
      round: template.round,
      matchday: template.round,
      stage: template.stage,
      date: dateInWindow(year, schedule.month, schedule.day),
      time: FIXTURE_TIMES[gameNumber % FIXTURE_TIMES.length],
      gameNumber: gameNumber++,
      completed: false,
      isNationalTeamFixture: true,
      knockout: true,
    });
  });

  return fixtures;
}

export function recordKnockoutResult(ctx, matchId, winner, loser) {
  if (winner) ctx.winners[matchId] = winner;
  if (loser) ctx.losers[matchId] = loser;
}

export function isKnockoutStageComplete(fixtures, stage) {
  const stageGames = fixtures.filter(g => g.stage === stage);
  return stageGames.length > 0 && stageGames.every(g => g.completed || g.winnerCode);
}

export function winnerFromGame(game) {
  if (game.winnerCode) {
    return {
      code: game.winnerCode,
      name: game.winnerCode === game.homeCode ? game.home : game.away,
    };
  }
  if (!game.completed && game.homeGoals == null) return null;
  const hg = Number(game.homeGoals) || 0;
  const ag = Number(game.awayGoals) || 0;
  if (hg === ag) {
    const pen = game.shootoutWinner || game.winner;
    if (!pen) return null;
    const code = pen === game.home || pen === game.homeCode ? game.homeCode : game.awayCode;
    const name = code === game.homeCode ? game.home : game.away;
    return { code, name };
  }
  return hg > ag
    ? { code: game.homeCode, name: game.home }
    : { code: game.awayCode, name: game.away };
}

export function loserFromGame(game, winner) {
  if (!winner) return null;
  return winner.code === game.homeCode
    ? { code: game.awayCode, name: game.away }
    : { code: game.homeCode, name: game.home };
}
