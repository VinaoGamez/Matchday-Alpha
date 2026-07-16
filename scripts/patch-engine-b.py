from pathlib import Path

path = Path(__file__).resolve().parent.parent / 'js/legacy/engine.js'
lines = path.read_text(encoding='utf-8').splitlines(keepends=True)

# 1-indexed inclusive ranges to DELETE (multiple passes, adjust after each)
delete_ranges = [
    (213, 213),   # duplicate int
    (319, 370),   # match tuning + duplicate injuryAllowsTreatmentChoice
    (425, 446),   # duplicate medical helpers
    (527, 865),   # injury catalog .. injuryPostMatchReport
    (884, 920),   # finalize .. clearInjuryFully
    (945, 954),   # playerUnavailable .. availabilityLabel
]

for start, end in sorted(delete_ranges, reverse=True):
    del lines[start - 1:end]

text = ''.join(lines)
text = text.replace(
    '  let currentRound=validSavedSeason?savedSeason.currentRound:Math.max(...leagueData.map(row=>row.played))+1;',
    '  currentRound=validSavedSeason?savedSeason.currentRound:Math.max(...leagueData.map(row=>row.played))+1;',
)

sim_lineup_hook = """  ({ buildSimLineup, substitutionPriority } = createSimLineupBuilder({
    formationRoles,
    lineupForRoles,
    playerUnavailable,
    playerStarterBlocked,
    playerInRestrictedReturn,
    workloadLabel,
    workloadRisk,
    playerRehabMaxMinutes,
    matchDifficultyForClub,
  }));
"""

marker = '  const lineupForRoles=(players,roles,slotIndexes=roles.map((_,index)=>index))=>{'
if marker in text and 'createSimLineupBuilder' not in text.split(marker)[1][:800]:
    idx = text.index(marker)
    close = text.index('  };', idx + len(marker))
    close = text.index('\n', close) + 1
    text = text[:close] + sim_lineup_hook + text[close:]

foul_hook = """  engineProgressiveFoulRisk=(otherSide,attacker,defender)=>engineProgressiveFoulRiskBase(otherSide,attacker,defender,tacticalDiscipline);
"""
marker2 = '  const tacticalDiscipline = side => {'
if marker2 in text and 'engineProgressiveFoulRiskBase' not in text.split(marker2)[1][:1200]:
    idx = text.index(marker2)
    close = text.index('  };', idx + len(marker2))
    close = text.index('\n', close) + 1
    text = text[:close] + foul_hook + text[close:]

path.write_text(text, encoding='utf-8')
print('Patched engine.js')
