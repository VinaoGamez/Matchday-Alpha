import {
  FUTURE_COMPETITION_MOLD,
  futureCompetitionIds,
  listFutureCompetitionMold,
  isWorldCupYear,
  getSeasonBlackouts,
  describeCalendarMold,
  WORLD_CUP_ANCHOR_YEAR,
  resolveFixtureCompetitionCode,
  sortCalendarCompetitionCodes,
  calendarCompetitionLabel,
} from '../js/engine/season-calendar-mold.js';
import { getCompetitionSlotKey, COMPETITION_WEEK_SLOT_MAP } from '../js/engine/season-week-slots.js';

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

const REQUIRED_FUTURE = [
  'state_league',
  'libertadores',
  'sudamericana',
  'recopa_national',
  'recopa_sudamericana',
  'fifa_friendlies',
  'world_cup',
];

check('FUTURE_COMPETITION_MOLD inclui todas as competições pedidas', () => {
  const ids = futureCompetitionIds();
  REQUIRED_FUTURE.forEach(id => assert(ids.includes(id), `missing ${id}`));
});

check('slots semanais mapeados para competições de clube futuras', () => {
  assert(getCompetitionSlotKey('state_league') === 'weekend_b');
  assert(getCompetitionSlotKey('libertadores') === 'midweek_alt');
  assert(getCompetitionSlotKey('recopa_national') === 'knockout_ida');
  assert(getCompetitionSlotKey('fifa_friendlies') === null);
  assert(getCompetitionSlotKey('world_cup') === null);
});

check('Copa do Mundo: ciclo quadrienal a partir de 2026', () => {
  assert(isWorldCupYear(2026));
  assert(!isWorldCupYear(2027));
  assert(isWorldCupYear(2030));
  assert(WORLD_CUP_ANCHOR_YEAR === 2026);
});

check('getSeasonBlackouts inclui Mundial em ano de copa', () => {
  const wc = getSeasonBlackouts(2026).find(b => b.id === 'world_cup');
  assert(wc?.blocksClubs === true);
  assert(!getSeasonBlackouts(2027).some(b => b.id === 'world_cup'));
});

check('listFutureCompetitionMold filtra world_cup fora do ano', () => {
  const y2026 = listFutureCompetitionMold({ seasonYear: 2026 }).map(s => s.competitionId);
  const y2027 = listFutureCompetitionMold({ seasonYear: 2027 }).map(s => s.competitionId);
  assert(y2026.includes('world_cup'));
  assert(!y2027.includes('world_cup'));
});

check('describeCalendarMold resume futuras + flag worldCupYear', () => {
  const d = describeCalendarMold(2026);
  assert(d.worldCupYear === true);
  assert(d.future.length >= REQUIRED_FUTURE.length);
  assert(d.future.every(entry => entry.id && entry.label));
});

check('todas as futuras disabled até implementação', () => {
  Object.values(FUTURE_COMPETITION_MOLD).forEach(spec => {
    assert(spec.enabled === false, spec.competitionId);
  });
});

check('resolveFixtureCompetitionCode mapeia liga, copa e mata-mata', () => {
  assert(resolveFixtureCompetitionCode({ competition: 'COPA DO BRASIL' }) === 'CBR');
  assert(resolveFixtureCompetitionCode({ home: 'A', away: 'B' }, { division: 'A' }) === 'BSA');
  assert(resolveFixtureCompetitionCode({ competition: 'LEAGUE:B' }) === 'BSB');
  assert(resolveFixtureCompetitionCode({ tieId: 'T1', knockoutRound: 2 }) === 'BSD');
});

check('sortCalendarCompetitionCodes ordena BSA antes de CBR', () => {
  assert(JSON.stringify(sortCalendarCompetitionCodes(['CBR', 'BSA', 'BSB'])) === '["BSA","BSB","CBR"]');
});

check('calendarCompetitionLabel resolve nomes legíveis', () => {
  assert(calendarCompetitionLabel('BSA') === 'Brasileiro Série A');
  assert(calendarCompetitionLabel('CBR') === 'Copa do Brasil');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
