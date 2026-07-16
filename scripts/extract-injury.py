import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
lines = (root / 'js/legacy/engine.js').read_text(encoding='utf-8').splitlines(keepends=True)

parts = [
    lines[227:232],   # clubMedicalQuality .. effectiveWorkloadRisk
    lines[278:279],   # injuryAllowsTreatmentChoice
    lines[333:355],   # medicalDepartmentLabel .. treatmentLabel
    lines[435:774],   # injury catalog .. injuryPostMatchReport
    lines[792:829],   # finalizeInjuryRecovery .. clearInjuryFully
    lines[853:863],   # playerUnavailable .. availabilityLabel
]

body = ''.join(''.join(chunk) for chunk in parts)
body = body.replace('currentRound', 'getCurrentRound()')
body = body.replace('careerSeason', 'getCareerSeason()')
body = re.sub(r'Math\.random\(\)', 'gameRandom()', body)

header = """import { clamp } from '../ui/dom.js';
import { MODULE_VERSIONS } from '../core/constants.js';

/**
 * Motor de lesões — catálogo, risco, reabilitação e disponibilidade.
 * UI de tratamento permanece no engine legado.
 */
export function createInjuryEngine(deps) {
  const { rnd, int, gameRandom, getCurrentRound, getCareerSeason } = deps;

"""

footer = """
  return {
    moduleVersion: MODULE_VERSIONS.injury,
    injuryCatalog,
    clubMedicalQuality,
    pitchInjuryModifier,
    pitchLabel,
    preventionWorkloadEase,
    effectiveWorkloadRisk,
    medicalDepartmentLabel,
    medicalRecoveryModifier,
    medicalPreventionModifier,
    medicalDiagnosisModifier,
    medicalRehabSupport,
    resolveInjuryTreatment,
    treatmentLabel,
    injuryAllowsTreatmentChoice,
    normalizeInjury,
    injuryInAcutePhase,
    injuryInRestrictedPhase,
    playerInRestrictedReturn,
    playerRehabMaxMinutes,
    injuryStatModifier,
    matchPlayerStat,
    rehabMinuteOverload,
    recurrenceReturnModifier,
    fatigueExhaustionRisk,
    ageInjuryRisk,
    pronenessInjuryRisk,
    previousInjuryModifier,
    tacticalInjuryRisk,
    defaultWorkload,
    ensureWorkload,
    workloadRisk,
    recoveryRisk,
    tacticalMechanismRisk,
    matchIntensityFactor,
    decayPlayerWorkload,
    refreshWorkloadWindows,
    recordPlayerMatchWorkload,
    workloadLabel,
    injuryEventTypeFromPhase,
    injuryMechanismFromEvent,
    eventInjuryBaseRisk,
    calculateEventInjuryChance,
    pickInjuryVictim,
    selectInjuryMechanism,
    selectInjuryCategory,
    selectInjuryType,
    determineInjuryGrade,
    calculateRecoveryTime,
    buildInjuryRecord,
    classifyIncidentTier,
    discomfortMatchComment,
    resolvePhysicalIncident,
    createInjuryRecord,
    injuryAvailabilityLabel,
    injuryMatchComment,
    injuryDiagnosisComment,
    buildDeferredInjuryEntry,
    calculatePlayThroughSubChance,
    resolvePostMatchDiagnosis,
    injuryPostMatchReport,
    finalizeInjuryRecovery,
    beginRestrictedReturn,
    advanceRestrictedRehab,
    clearInjuryFully,
    playerUnavailable,
    playerStarterBlocked,
    availabilityLabel,
    injurySeverityLabel,
  };
}
"""

out_path = root / 'js/engine/injury.js'
out_path.write_text(header + body + footer, encoding='utf-8')
print(f'Written {out_path} ({len(body.splitlines())} body lines)')
