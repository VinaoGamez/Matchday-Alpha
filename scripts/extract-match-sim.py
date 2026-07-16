import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
lines = (root / 'js/legacy/engine.js').read_text(encoding='utf-8').splitlines(keepends=True)

parts = [lines[1273:1275], lines[1281:1303], lines[1305:1348]]
body = ''.join(''.join(chunk) for chunk in parts)

body = body.replace('leagueData', 'getLeagueData()')
body = re.sub(r'\bclubs\[', 'getClubs()[', body)
body = re.sub(r'Math\.random\(\)', 'random()', body)

header = """import { MODULE_VERSIONS } from '../core/constants.js';
import { roundTactic } from './match-core.js';

/**
 * Simulador de partida da rodada (90 min) — estatísticas, gols, cartões e lesões.
 */
export function createRoundMatchSimulator(deps) {
  const {
    clamp,
    rnd,
    random,
    getClubs,
    getLeagueData,
    clubInstitutionalContext,
    buildSimLineup,
    substitutionPriority,
    engineTuning,
    engineFoulRisk,
    engineBlowoutDamp,
    formationPerformance,
    compatibleRoles,
    matchPlayerStat,
    playerRehabMaxMinutes,
    injurySeverityLabel,
    resolvePhysicalIncident,
    buildDeferredInjuryEntry,
    calculatePlayThroughSubChance,
    pickInjuryVictim,
  } = deps;

"""

footer = """
  };

  return {
    moduleVersion: MODULE_VERSIONS.matchSim,
    simulateRoundMatch,
    roundAverage,
    roundPlayerView,
  };
}
"""

out = root / 'js/engine/match-sim.js'
out.write_text(header + body + footer, encoding='utf-8')
print(f'Written {out} ({len(body.splitlines())} body lines)')
