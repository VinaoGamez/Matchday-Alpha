import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
lines = (root / 'js/legacy/engine.js').read_text(encoding='utf-8').splitlines(keepends=True)

body = ''.join(lines[1610:1698])  # addPasses .. buildAttack

replacements = [
    (r'\bstats\b', 'getStats()'),
    (r'\bminute\b', 'getMinute()'),
    (r'\bgoals\b', 'getGoals()'),
    (r'\buserClub\b', 'getUserClub()'),
    (r'Math\.random\(\)', 'random()'),
    (r'matchClub\(\)', 'getMatchClub()'),
    (r'\bstarters\(\)', 'getStarters()'),
    (r'\bcards\b', 'getCards()'),
]
for pattern, repl in replacements:
    body = re.sub(pattern, repl, body)

# score() display — avoid replacing inside other identifiers
body = re.sub(r'(?<![.\w])score\(\)', 'updateScoreboard()', body)

# home++/away++ goal scoring
body = body.replace("side === 'home'?home++:away++;", 'incrementScore(side);')

header = """import { MODULE_VERSIONS } from '../core/constants.js';

/**
 * Ações de partida ao vivo — passes, finalização e construção de jogadas.
 * Orquestração (tick, advance, foul, lesões UI) permanece no engine legado.
 */
export function createLiveMatchActions(deps) {
  const {
    clamp,
    rnd,
    random,
    getStats,
    getMinute,
    getGoals,
    getUserClub,
    getMatchClub,
    getStarters,
    getCards,
    incrementScore,
    updateScoreboard,
    log,
    playerFor,
    actorData,
    influencePossession,
    engineTuning,
    engineBlowoutDamp,
    engineFoulRisk,
    engineProgressiveFoulRisk,
    tacticFor,
    tryLiveEventInjury,
    foul,
    pickInjuryVictim,
  } = deps;

"""

footer = """
  return {
    moduleVersion: MODULE_VERSIONS.matchLive,
    addPasses,
    shot,
    takeFreeKick,
    penaltyTaker,
    buildAttack,
  };
}
"""

out = root / 'js/engine/match-live.js'
out.write_text(header + body + footer, encoding='utf-8')
print(f'Written {out} ({len(body.splitlines())} body lines)')
