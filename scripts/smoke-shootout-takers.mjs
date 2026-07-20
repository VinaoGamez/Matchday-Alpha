/**
 * Smoke: recycle de cobradores + regras de vencedor na disputa.
 * Uso: node scripts/smoke-shootout-takers.mjs
 */
import assert from 'node:assert/strict';
import {
  listEligibleShootoutTakers,
  resolveShootoutTakerPool,
  decideShootoutWinner,
  shootoutChoiceOptions,
} from '../js/engine/shootout-takers.js';

const lineup = [
  { name: 'GK', pos: 'GOL', penaltyTaking: 40, overall: 70 },
  { name: 'A', pos: 'ATA', penaltyTaking: 80, overall: 75 },
  { name: 'B', pos: 'MEI', penaltyTaking: 78, overall: 74 },
  { name: 'C', pos: 'ZAG', penaltyTaking: 60, overall: 72 },
];
const cards = [{}, {}, {}, {}];

{
  const open = listEligibleShootoutTakers(lineup, cards, []);
  assert.equal(open.length, 4, 'goleiro entra no pool');
  assert.equal(open[0].name, 'A');
  assert.ok(open.some(p => p.pos === 'GOL'));
}

{
  const used = ['A', 'B', 'C', 'GK'];
  const empty = listEligibleShootoutTakers(lineup, cards, used);
  assert.equal(empty.length, 0);
  const { takers, recycled, usedNames } = resolveShootoutTakerPool(lineup, cards, used);
  assert.equal(recycled, true);
  assert.deepEqual(usedNames, []);
  assert.equal(takers.length, 4);
  assert.equal(takers[0].name, 'A');
}

{
  const many = [
    ...lineup,
    { name: 'D', pos: 'LAT', penaltyTaking: 70, overall: 71 },
    { name: 'E', pos: 'VOL', penaltyTaking: 68, overall: 70 },
    { name: 'F', pos: 'PD', penaltyTaking: 66, overall: 69 },
  ];
  const choices = shootoutChoiceOptions(listEligibleShootoutTakers(many, [{}, {}, {}, {}, {}, {}, {}], []), 5);
  assert.equal(choices.length, 5);
  assert.ok(choices.some(p => p.pos === 'GOL'), 'UI sempre mostra o goleiro');
}

// Early win before 5
{
  const d = decideShootoutWinner({
    clubs: ['X', 'Y'],
    results: {
      X: [true, true, true],
      Y: [false, false, false],
    },
  });
  assert.equal(d.winner, 'X');
}

// 5-5 → sudden death
{
  const d = decideShootoutWinner({
    clubs: ['X', 'Y'],
    results: {
      X: [true, true, true, true, false],
      Y: [true, true, true, true, false],
    },
  });
  assert.equal(d.winner, null);
  assert.equal(d.suddenDeath, true);
}

// Morte súbita longa ainda empatada
{
  const kicks = Array(12).fill(true);
  const d = decideShootoutWinner({
    clubs: ['X', 'Y'],
    results: { X: kicks, Y: kicks },
    suddenDeath: true,
  });
  assert.equal(d.winner, null);
  assert.equal(d.suddenDeath, true);
}

// Morte súbita decide
{
  const d = decideShootoutWinner({
    clubs: ['X', 'Y'],
    results: {
      X: [true, true, true, true, false, true],
      Y: [true, true, true, true, false, false],
    },
    suddenDeath: true,
  });
  assert.equal(d.winner, 'X');
}

console.log('smoke-shootout-takers: ok');
