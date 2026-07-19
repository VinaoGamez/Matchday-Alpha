/**
 * Índice de dicas do relatório NOTAS (gols, GC, cartões, subs).
 * Chave sempre lado|nome — homônimos em times rivais não compartilham eventos.
 */

export function tipKey(side, name) {
  if (!name || (side !== 'home' && side !== 'away')) return null;
  return `${side}|${name}`;
}

function emptyTips() {
  return { goals: [], assists: [], ownGoals: [], yellow: [], red: [], subIn: [], subOut: [] };
}

/**
 * @param {{ home?: object[], away?: object[] }} goals
 * @param {object[]} [incidents]
 * @param {Set<string>|null} [playedNames] nomes ou chaves lado|nome de quem jogou
 * @returns {Map<string, ReturnType<typeof emptyTips>>}
 */
export function buildPlayerTipIndex(goals, incidents = [], playedNames = null) {
  const index = new Map();
  const bucket = (side, name) => {
    const key = tipKey(side, name);
    if (!key) return null;
    if (!index.has(key)) index.set(key, emptyTips());
    return index.get(key);
  };

  ['home', 'away'].forEach(side => {
    const concedingSide = side === 'home' ? 'away' : 'home';
    (goals?.[side] || []).forEach(goal => {
      const when = { minute: goal.minute, stoppage: goal.stoppage || 0 };
      // GC fica no array do time que marca; o autor é do lado que sofreu.
      if (goal?.type === 'own') {
        const own = bucket(concedingSide, goal.name);
        if (own) own.ownGoals.push(when);
        return;
      }
      const scorer = bucket(side, goal?.name);
      if (scorer) scorer.goals.push(when);
      const assist = bucket(side, goal?.assist);
      if (assist) assist.assists.push(when);
    });
  });

  (incidents || []).forEach(item => {
    const when = { minute: item.minute, stoppage: item.stoppage || 0 };
    const side = item.side === 'away' ? 'away' : item.side === 'home' ? 'home' : null;
    if (!side) return;
    if (item.type === 'yellow' && item.name) {
      bucket(side, item.name)?.yellow.push(when);
      return;
    }
    if (item.type === 'red' && item.name) {
      bucket(side, item.name)?.red.push(when);
      return;
    }
    if (item.type === 'substitution' && item.name) {
      const parts = String(item.name)
        .split(/\s*(?:→|->)\s*/)
        .map(part => part.trim())
        .filter(Boolean);
      if (parts.length < 2) return;
      const [outName, inName] = parts;
      if (playedNames instanceof Set && !playedNames.has(`${side}|${inName}`) && !playedNames.has(inName)) {
        return;
      }
      bucket(side, outName)?.subOut.push(when);
      bucket(side, inName)?.subIn.push(when);
    }
  });

  return index;
}

/** Contagem de GC atribuída à ficha (lado|nome), ignorando sheet.ownGoals legado. */
export function ownGoalTipCount(tipIndex, sheet) {
  const side = sheet?.side === 'away' ? 'away' : sheet?.side === 'home' ? 'home' : null;
  if (!side || !sheet?.name) return 0;
  return tipIndex?.get(tipKey(side, sheet.name))?.ownGoals?.length || 0;
}
