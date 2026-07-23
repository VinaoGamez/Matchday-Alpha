import assert from 'node:assert/strict';
import { NATIONAL_TEAMS } from '../js/engine/national-teams.js';
import {
  shouldSendNationalTeamOffers,
  generateNationalTeamOffers,
  nationalTeamOfferPool,
  NATIONAL_TEAM_OFFER_MONTH,
  WORLD_CUP_2026_YEAR,
} from '../js/engine/national-team-offers.js';

const may2026 = new Date(2026, NATIONAL_TEAM_OFFER_MONTH, 1, 12);
const apr2026 = new Date(2026, NATIONAL_TEAM_OFFER_MONTH - 1, 30, 12);
const jun2026 = new Date(2026, 5, 13, 12);

assert.equal(
  shouldSendNationalTeamOffers({ year: 2026, careerDate: apr2026, offersSentYear: null }),
  false,
  'abril não dispara convites',
);

assert.equal(
  shouldSendNationalTeamOffers({ year: 2026, careerDate: may2026, offersSentYear: null }),
  true,
  'maio dispara convites em ano de CMU',
);

assert.equal(
  shouldSendNationalTeamOffers({ year: 2026, careerDate: jun2026, userNationalTeamCode: 'BRA' }),
  false,
  'com seleção já escolhida não reenvia',
);

const block1Codes = new Set(
  nationalTeamOfferPool({ year: WORLD_CUP_2026_YEAR, userDivision: 'A' }).map(team => team.code),
);
const block2Codes = new Set(
  nationalTeamOfferPool({ year: WORLD_CUP_2026_YEAR, userDivision: 'B' }).map(team => team.code),
);

assert.ok(block1Codes.has('BRA'), 'Série A — pool bloco 1 inclui Brasil');
assert.ok(!block1Codes.has('COL'), 'Série A — pool bloco 1 exclui bloco 2');
assert.ok(block2Codes.has('COL'), 'Série B — pool bloco 2 inclui Colômbia');
assert.ok(!block2Codes.has('BRA'), 'Série B — pool bloco 2 exclui bloco 1');

const serieDPool = nationalTeamOfferPool({ year: 2026, userDivision: 'D' });
assert.equal(serieDPool.length, Object.keys(NATIONAL_TEAMS).length, 'Série D — pool com todas as seleções');

const serieDOffers = generateNationalTeamOffers({
  year: 2026,
  userDivision: 'D',
  seed: 42,
  count: 3,
});
assert.equal(serieDOffers.length, 3, 'Série D gera três convites');
assert.ok(
  serieDOffers.every(offer => serieDPool.some(team => team.code === offer.code)),
  'Série D — convites vêm do pool completo',
);

const serieAOffers = generateNationalTeamOffers({
  year: 2026,
  userDivision: 'A',
  seed: 99,
  count: 3,
});
assert.ok(
  serieAOffers.every(offer => block1Codes.has(offer.code)),
  'Série A só recebe convites do bloco 1',
);

const serieBOffers = generateNationalTeamOffers({
  year: 2026,
  userDivision: 'B',
  seed: 77,
  count: 3,
});
assert.ok(
  serieBOffers.every(offer => block2Codes.has(offer.code)),
  'Série B só recebe convites do bloco 2',
);

console.log('national-team-offers-tests: ok');
