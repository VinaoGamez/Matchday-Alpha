/**
 * Classificação dos grupos — critérios FIFA (Art. 13 simplificado).
 */

import { WORLD_CUP_GROUP_LETTERS } from './world-cup-history.js';

function emptyRow(code, name) {
  return { code, name, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0 };
}

function applyResult(row, gf, ga) {
  row.played += 1;
  row.gf += gf;
  row.ga += ga;
  row.gd = row.gf - row.ga;
  if (gf > ga) {
    row.wins += 1;
    row.points += 3;
  } else if (gf < ga) {
    row.losses += 1;
  } else {
    row.draws += 1;
    row.points += 1;
  }
}

function miniLeagueTable(codes, played) {
  const set = new Set(codes);
  const table = Object.fromEntries(codes.map(code => [code, { points: 0, gf: 0, ga: 0, gd: 0 }]));
  for (const m of played) {
    if (!set.has(m.homeCode) || !set.has(m.awayCode)) continue;
    const H = table[m.homeCode];
    const A = table[m.awayCode];
    H.gf += m.homeGoals;
    H.ga += m.awayGoals;
    A.gf += m.awayGoals;
    A.ga += m.homeGoals;
    if (m.homeGoals > m.awayGoals) H.points += 3;
    else if (m.homeGoals < m.awayGoals) A.points += 3;
    else {
      H.points += 1;
      A.points += 1;
    }
  }
  for (const row of Object.values(table)) row.gd = row.gf - row.ga;
  return table;
}

function resolveTie(codes, rows, played, drawKey) {
  const mini = miniLeagueTable(codes, played);
  const ranked = [...codes].sort((a, b) => {
    const mx = mini[a];
    const my = mini[b];
    return my.points - mx.points || my.gd - mx.gd || my.gf - mx.gf;
  });

  const runs = [];
  for (const code of ranked) {
    const last = runs[runs.length - 1];
    const m = mini[code];
    if (last && mini[last[0]].points === m.points && mini[last[0]].gd === m.gd && mini[last[0]].gf === m.gf) {
      last.push(code);
    } else {
      runs.push([code]);
    }
  }

  if (runs.length === 1) {
    return [...codes].sort((a, b) => rows[b].gd - rows[a].gd || rows[b].gf - rows[a].gf || drawKey[a] - drawKey[b]);
  }

  const out = [];
  for (const run of runs) {
    if (run.length === 1) out.push(run[0]);
    else out.push(...resolveTie(run, rows, played, drawKey));
  }
  return out;
}

function rankRows(rows, played, random = Math.random) {
  const drawKey = Object.fromEntries(rows.map(r => [r.code, random()]));
  const tiers = new Map();
  for (const row of rows) {
    const key = row.points;
    if (!tiers.has(key)) tiers.set(key, []);
    tiers.get(key).push(row.code);
  }

  const sorted = [...tiers.entries()].sort((a, b) => b[0] - a[0]);
  const codes = rows.map(r => r.code);
  const byCode = Object.fromEntries(rows.map(r => [r.code, r]));
  const result = [];

  for (const [, tierCodes] of sorted) {
    if (tierCodes.length === 1) {
      result.push(byCode[tierCodes[0]]);
    } else {
      const ordered = resolveTie(tierCodes, byCode, played, drawKey);
      ordered.forEach(code => result.push(byCode[code]));
    }
  }
  return result;
}

/** @param {Array} fixtures — jogos do grupo (completed ou não) */
export function computeGroupStandings(groupLetter, fixtures, random = Math.random) {
  const letter = String(groupLetter || '').toUpperCase();
  const groupFixtures = fixtures.filter(g => g.group === letter);
  const codes = new Set();
  groupFixtures.forEach(g => {
    if (g.homeCode) codes.add(g.homeCode);
    if (g.awayCode) codes.add(g.awayCode);
  });

  const rows = Object.fromEntries(
    [...codes].map(code => {
      const sample = groupFixtures.find(g => g.homeCode === code || g.awayCode === code);
      const name = sample?.homeCode === code ? sample.home : sample?.away;
      return [code, emptyRow(code, name)];
    }),
  );

  const played = [];
  for (const game of groupFixtures) {
    if (!game.completed && game.homeGoals == null) continue;
    const hg = Number(game.homeGoals) || 0;
    const ag = Number(game.awayGoals) || 0;
    applyResult(rows[game.homeCode], hg, ag);
    applyResult(rows[game.awayCode], ag, hg);
    played.push({ homeCode: game.homeCode, awayCode: game.awayCode, homeGoals: hg, awayGoals: ag });
  }

  return rankRows(Object.values(rows), played, random);
}

export function computeAllGroupStandings(groupFixtures, random = Math.random) {
  return Object.fromEntries(
    WORLD_CUP_GROUP_LETTERS.map(letter => [
      letter,
      computeGroupStandings(letter, groupFixtures, random),
    ]),
  );
}

export function isGroupStageComplete(groupFixtures) {
  return groupFixtures.length > 0 && groupFixtures.every(g => g.completed || g.homeGoals != null);
}

/** Oito melhores terceiros colocados (Art. 13 — pts, SG, GP). */
export function pickBestThirdPlaces(allStandings, random = Math.random) {
  const thirds = WORLD_CUP_GROUP_LETTERS.map(letter => {
    const table = allStandings[letter] || [];
    const row = table[2];
    if (!row) return null;
    return { group: letter, row: { ...row } };
  }).filter(Boolean);

  const drawKey = new Map(thirds.map(t => [t.group, random()]));
  thirds.sort((a, b) =>
    b.row.points - a.row.points
    || b.row.gd - a.row.gd
    || b.row.gf - a.row.gf
    || drawKey.get(a.group) - drawKey.get(b.group),
  );
  return thirds.slice(0, 8);
}
