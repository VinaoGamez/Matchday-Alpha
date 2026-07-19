import {
  serieCClubsForSeason,
  serieCRelegationSlots,
  serieCRelegationCountForTransition,
  normalizeDivisionTeamsSerieC,
  SERIE_D_CLUBS,
  SERIE_D_PROMOTIONS,
} from '../js/engine/serie-c-calendar.js';

let passed = 0;
let failed = 0;

const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${label}`);
    console.error(`  ${error.message}`);
  }
};

const assert = (cond, message) => {
  if (!cond) throw new Error(message || 'assertion failed');
};

check('CBF sizes by season', () => {
  assert(serieCClubsForSeason(2026) === 20, '2026 → 20');
  assert(serieCClubsForSeason(2027) === 24, '2027 → 24');
  assert(serieCClubsForSeason(2028) === 28, '2028 → 28');
  assert(serieCClubsForSeason(2030) === 28, '2030 → 28');
});

check('relegation zones by season', () => {
  assert(serieCRelegationSlots(2026) === 2, '2026 Z2');
  assert(serieCRelegationSlots(2027) === 2, '2027 Z2');
  assert(serieCRelegationSlots(2028) === 6, '2028 Z6');
});

check('transition relegation hits next target', () => {
  assert(serieCRelegationCountForTransition(20, 2027) === 2, '20→24 needs 2 down');
  assert(serieCRelegationCountForTransition(24, 2028) === 2, '24→28 needs 2 down');
  assert(serieCRelegationCountForTransition(28, 2029) === 6, '28→28 needs 6 down');
  assert(serieCRelegationCountForTransition(36, 2031) === 14, '36→28 needs 14 down');
  const nextFrom20 = 20 + SERIE_D_PROMOTIONS - serieCRelegationCountForTransition(20, 2027);
  assert(nextFrom20 === 24, 'net size after 2026 transition');
  const nextStable = 28 + SERIE_D_PROMOTIONS - serieCRelegationCountForTransition(28, 2029);
  assert(nextStable === 28, 'net size stays 28');
});

check('normalize shrinks bloated C and keeps user club', () => {
  const c = Array.from({ length: 36 }, (_, i) => `Clube C${i + 1}`);
  c[10] = 'Atlético Maceió';
  const d = Array.from({ length: 80 }, (_, i) => `Clube D${i + 1}`);
  const { divisionTeams, changed, target } = normalizeDivisionTeamsSerieC(
    { A: [], B: [], C: c, D: d },
    {
      season: 2030,
      userClub: 'Atlético Maceió',
      fillPool: Array.from({ length: 40 }, (_, i) => `Pool ${i + 1}`),
      dTarget: SERIE_D_CLUBS,
    },
  );
  assert(changed, 'should change');
  assert(target === 28, 'target 28');
  assert(divisionTeams.C.length === 28, `C=${divisionTeams.C.length}`);
  assert(divisionTeams.C.includes('Atlético Maceió'), 'keeps user');
  assert(divisionTeams.D.length === SERIE_D_CLUBS, `D=${divisionTeams.D.length}`);
});

check('normalize fills short C from D', () => {
  const { divisionTeams } = normalizeDivisionTeamsSerieC(
    {
      A: [],
      B: [],
      C: Array.from({ length: 18 }, (_, i) => `C${i}`),
      D: Array.from({ length: 96 }, (_, i) => `D${i}`),
    },
    { season: 2026, userClub: 'Manager FC', fillPool: [] },
  );
  assert(divisionTeams.C.length === 20, 'C filled to 20');
  assert(divisionTeams.D.length === 94, 'D lost 2');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
