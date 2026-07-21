/**
 * Tiers visuais do estádio.
 * node scripts/stadium-visual-tier-tests.mjs
 */
import { resolveStadiumVisualTier, STADIUM_VISUAL_TIERS } from '../js/feature/economy/stadium-visual-tier.js';
import { STADIUM_SECTOR_MODEL } from '../js/engine/stadium-sectors.js';

let passed = 0;
let failed = 0;
const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${label}`);
  } catch (e) {
    failed += 1;
    console.error(`✗ ${label}`);
    console.error(`  ${e.message}`);
  }
};
const assert = (c, m) => {
  if (!c) throw new Error(m || 'fail');
};

const club = (patch = {}) => ({
  stadiumSectorModel: STADIUM_SECTOR_MODEL,
  stadiumSectors: { popular: 1, stands: 0, seats: 0, boxes: 0, vip: 0 },
  stadiumStructure: 0,
  ...patch,
});

check('8 tiers definidos', () => assert(STADIUM_VISUAL_TIERS.length === 8));
check('start limpo = tier 1', () => assert(resolveStadiumVisualTier(club()) === 1));
check('estrutura 1 = tier 2', () => assert(resolveStadiumVisualTier(club({ stadiumStructure: 1 })) === 2));
check('estrutura 2 = tier 3', () => assert(resolveStadiumVisualTier(club({ stadiumStructure: 2 })) === 3));
check('estrutura 2 + arquib. = tier 4', () =>
  assert(resolveStadiumVisualTier(club({ stadiumStructure: 2, stadiumSectors: { popular: 1, stands: 1 } })) === 4));
check('estrutura 3 + cadeiras = tier 5', () =>
  assert(
    resolveStadiumVisualTier(club({ stadiumStructure: 3, stadiumSectors: { popular: 2, stands: 1, seats: 1 } })) ===
      5,
  ));
check('estrutura 4 = tier 6', () => assert(resolveStadiumVisualTier(club({ stadiumStructure: 4 })) === 6));
check('estrutura 5 = tier 7', () => assert(resolveStadiumVisualTier(club({ stadiumStructure: 5 })) === 7));
check('estrutura 5 + VIP = tier 8', () =>
  assert(
    resolveStadiumVisualTier(
      club({ stadiumStructure: 5, stadiumSectors: { popular: 3, stands: 3, seats: 2, boxes: 2, vip: 1 } }),
    ) === 8,
  ));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
