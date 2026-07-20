/**
 * Pool de cobradores na disputa ao vivo.
 * Quando todos os elegíveis já cobraram, a lista reinicia (morte súbita longa).
 */

const sortByPenalty = (a, b) =>
  (Number(b.penaltyTaking) || 0) - (Number(a.penaltyTaking) || 0) ||
  (Number(b.overall) || 0) - (Number(a.overall) || 0);

/**
 * @param {Array} lineup
 * @param {Array|object} cardState — cards por índice (red)
 * @param {string[]} usedNames
 */
export function listEligibleShootoutTakers(lineup, cardState, usedNames = []) {
  const used = new Set(usedNames || []);
  const rows = Array.isArray(lineup) ? lineup : [];
  return rows
    .map((player, index) => ({ player, index }))
    .filter(({ player, index }) => {
      if (!player) return false;
      if (cardState?.[index]?.red) return false;
      if (used.has(player.name)) return false;
      return true;
    })
    .map(({ player }) => player)
    .sort(sortByPenalty);
}

/**
 * Devolve cobradores elegíveis (inclui goleiro); se a lista esgotou, zera usedNames e recomeça.
 * @returns {{ takers: Array, recycled: boolean, usedNames: string[] }}
 */
export function resolveShootoutTakerPool(lineup, cardState, usedNames = []) {
  let used = Array.isArray(usedNames) ? [...usedNames] : [];
  let takers = listEligibleShootoutTakers(lineup, cardState, used);
  let recycled = false;
  if (!takers.length) {
    used = [];
    recycled = true;
    takers = listEligibleShootoutTakers(lineup, cardState, used);
  }
  return { takers, recycled, usedNames: used };
}

/**
 * Opções na UI: top N por pênalti, garantindo o goleiro elegível na lista.
 */
export function shootoutChoiceOptions(takers, limit = 5) {
  const pool = Array.isArray(takers) ? [...takers] : [];
  if (pool.length <= limit) return pool;
  const keeper = pool.find(p => p?.pos === 'GOL');
  const outfield = pool.filter(p => p?.pos !== 'GOL');
  if (!keeper) return pool.slice(0, limit);
  const picks = outfield.slice(0, Math.max(0, limit - 1));
  picks.push(keeper);
  return picks.sort(sortByPenalty);
}

/**
 * Vencedor da disputa (regras FIFA: 5 iniciais + morte súbita).
 * @returns {string|null} nome do clube vencedor
 */
export function decideShootoutWinner({ clubs, results, suddenDeath = false } = {}) {
  if (!clubs || clubs.length < 2 || !results) return { winner: null, suddenDeath };
  const [c0, c1] = clubs;
  const g0 = (results[c0] || []).filter(Boolean).length;
  const g1 = (results[c1] || []).filter(Boolean).length;
  const a0 = (results[c0] || []).length;
  const a1 = (results[c1] || []).length;
  let sd = !!suddenDeath;

  if (a0 <= 5 && a1 <= 5) {
    const rem0 = 5 - a0;
    const rem1 = 5 - a1;
    if (g0 > g1 + rem1) return { winner: c0, suddenDeath: sd };
    if (g1 > g0 + rem0) return { winner: c1, suddenDeath: sd };
    if (a0 === 5 && a1 === 5) {
      if (g0 !== g1) return { winner: g0 > g1 ? c0 : c1, suddenDeath: sd };
      sd = true;
    }
    return { winner: null, suddenDeath: sd };
  }

  if (a0 >= 5 && a1 >= 5) sd = true;
  if (a0 === a1 && a0 > 5 && g0 !== g1) {
    return { winner: g0 > g1 ? c0 : c1, suddenDeath: sd };
  }
  return { winner: null, suddenDeath: sd };
}
