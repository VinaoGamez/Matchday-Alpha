/**
 * Testes — histórico e sorteio de Copas.
 * Uso: node scripts/world-cup-history-tests.mjs
 */
import {
  buildBaselineWorldCupRanking,
  buildEditionTeamStrengthMap,
  drawWorldCupGroups,
  getSeedRankingForEdition,
  normalizeWorldCupHistory,
  prepareWorldCupEdition,
  recordWorldCupResult,
  teamPowerFromSeedRank,
  WORLD_CUP_GROUP_LETTERS,
} from '../js/engine/world-cup-history.js';
import { NATIONAL_TEAM_CODES } from '../js/engine/national-teams.js';

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK  ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${label}`, error.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

check('baseline ranking tem 48 seleções', () => {
  const base = buildBaselineWorldCupRanking();
  assert(base.length === 48);
  assert(base[0].rank === 1);
  assert(base[47].rank >= 48);
});

check('2030 usa baseline se não houver histórico', () => {
  const seed = getSeedRankingForEdition([], 2030);
  assert(seed.length === 48);
  assert(seed[0].code === 'FRA');
});

check('2030 usa ranking final de 2026', () => {
  const base = buildBaselineWorldCupRanking();
  const bra = base.find(r => r.code === 'BRA');
  const arg = base.find(r => r.code === 'ARG');
  const rest = base.filter(r => r.code !== 'BRA' && r.code !== 'ARG');
  const finalRanking = [bra, arg, ...rest].map((row, index) => ({
    code: row.code,
    name: row.name,
    rank: index + 1,
  }));

  const history = recordWorldCupResult([], {
    year: 2026,
    finalRanking,
    champion: 'BRA',
    runnerUp: 'ARG',
  });

  const seed2030 = getSeedRankingForEdition(history, 2030);
  assert(seed2030[0].code === 'BRA');
  assert(seed2030[0].teamPower === teamPowerFromSeedRank(1));
});

check('sorteio forma 12 grupos com 4 seleções', () => {
  const ranking = buildBaselineWorldCupRanking();
  const rng = () => 0.42;
  const { groups } = drawWorldCupGroups(ranking, rng);
  assert(Object.keys(groups).length === 12);
  WORLD_CUP_GROUP_LETTERS.forEach(letter => {
    assert(groups[letter].length === 4, `grupo ${letter}`);
    const pots = new Set(groups[letter].map(t => t.pot));
    assert(pots.size === 4, `grupo ${letter} pots`);
  });
});

check('força da edição segue ranking anterior', () => {
  const base = buildBaselineWorldCupRanking();
  const fra = base.find(r => r.code === 'FRA');
  const rest = base.filter(r => r.code !== 'FRA');
  const finalRanking = [...rest.slice(0, 39), fra, ...rest.slice(39)].map((row, index) => ({
    code: row.code,
    name: row.name,
    rank: index + 1,
  }));

  const history = recordWorldCupResult([], { year: 2026, finalRanking });
  const strength = buildEditionTeamStrengthMap(history, 2030);
  assert(strength.FRA.seedRank === 40);
  assert(strength.FRA.teamPower === 84);
});

check('prepareWorldCupEdition congela elenco 2026', () => {
  const edition = prepareWorldCupEdition([], 2030, () => 0.5);
  assert(edition.squadsFrozen === true);
  assert(edition.squadsSourceEdition === 2026);
  assert(edition.draw.groups.A.length === 4);
});

check('normalizeWorldCupHistory filtra inválidos', () => {
  const clean = normalizeWorldCupHistory([
    { year: 2026, finalRanking: [{ code: 'BRA', rank: 1 }] },
    null,
    { year: 'x' },
  ]);
  assert(clean.length === 1);
  assert(clean[0].finalRanking[0].code === 'BRA');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
