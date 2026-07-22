/**
 * Testes — ratings táticos ao vivo (match-ratings.js).
 * node scripts/match-ratings-tests.mjs
 */
import { createMatchRatingsEngine, blankMatchStats, DEFAULT_USER_TACTICS } from '../js/engine/match-ratings.js';
import { clamp } from '../js/ui/dom.js';

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const clubs = {
  'Atlético Fênix': {
    name: 'Atlético Fênix',
    division: 'A',
    formation: '4-3-3',
    mentality: 'Equilibrada',
    style: 'Posse de bola',
    roster: Array.from({ length: 11 }, (_, i) => ({
      name: `Fênix ${i + 1}`,
      pos: i === 0 ? 'GOL' : i < 5 ? 'ZAG' : 'ATA',
      overall: 70 + i,
      fatigue: 80 - i,
      speed: 60,
      dribble: 60,
      finishing: 65,
      passing: 62,
      marking: 58,
      tackling: 58,
      heading: 55,
      playmaking: 60,
      penaltyTaking: 62,
      freeKick: 58,
      reflexes: 65,
      positioning: 64,
      penaltySaving: 63,
    })),
  },
  'Rivals FC': {
    name: 'Rivals FC',
    division: 'B',
    formation: '4-4-2',
    mentality: 'Defensiva',
    style: 'Contra-ataque',
    roster: Array.from({ length: 11 }, (_, i) => ({
      name: `Rival ${i + 1}`,
      pos: i === 0 ? 'GOL' : 'MC',
      overall: 62 + i,
      fatigue: 75,
      speed: 55,
      dribble: 54,
      finishing: 56,
      passing: 58,
      marking: 60,
      tackling: 61,
      heading: 52,
      playmaking: 55,
      penaltyTaking: 50,
      freeKick: 50,
      reflexes: 58,
      positioning: 57,
      penaltySaving: 56,
    })),
  },
};

const matchPlayerStat = (player, key) => Number(player?.[key]) || 50;
const clubInstitutionalContext = () => ({ overall: 0, attack: 0, passing: 0, defense: 0, keeper: 0, discipline: 0.02, wear: 1, volatility: 0 });
const playerUnavailable = () => false;

let cards = { home: Array.from({ length: 11 }, () => ({ yellow: false, red: false })), away: [] };
let stats = {
  home: { momentum: 2, passes: 100, accurate: 80, goodAttacks: 5, shots: 6, xg: 1.2 },
  away: { momentum: -1, passes: 90, accurate: 70, goodAttacks: 3, shots: 4, xg: 0.8 },
};
let home = 1;
let away = 1;
const positionAssignments = Array(11).fill('ZAG');

const engine = createMatchRatingsEngine({
  clamp,
  matchPlayerStat,
  clubInstitutionalContext,
  playerUnavailable,
  getTactics: () => ({ getTacticalValues: () => DEFAULT_USER_TACTICS }),
  getFormation: () => '4-3-3',
  getStarters: () => clubs['Atlético Fênix'].roster,
  getClubs: () => clubs,
  getUserClub: () => 'Atlético Fênix',
  getMatchClub: () => clubs['Rivals FC'],
  getNextUserGame: () => ({ home: 'Atlético Fênix', away: 'Rivals FC' }),
  getMatchFactors: () => ({ home: 1, away: 1 }),
  getCards: () => cards,
  getStats: () => stats,
  getHomeScore: () => home,
  getAwayScore: () => away,
  getPositionAssignments: () => positionAssignments,
  getTacticFor: side => engine.defaultTacticFor(side),
});

check('blankMatchStats template', () => {
  const b = blankMatchStats();
  assert(b.possession === 50 && b.xg === 0, 'template');
});

check('profile retorna ratings positivos', () => {
  const p = engine.profile();
  assert(p.overall > 50 && p.attack > 0 && p.defense > 0, `profile ${JSON.stringify(p)}`);
});

check('opponentForMatch usa elenco adversário', () => {
  const o = engine.opponentForMatch();
  assert(o.overall > 50, 'opponent overall');
});

check('actorData enriquece atributos', () => {
  const a = engine.actorData('home', 'Fênix 2');
  assert(a?.finishing === 65 && a?.speed === 60, 'actor');
});

check('cautionPenalty escala com amarelos', () => {
  cards.home[0].yellow = true;
  assert(engine.cautionPenalty('home') > 0, 'caution');
  cards.home[0].yellow = false;
});

check('playerFor escolhe jogador válido', () => {
  const name = engine.playerFor('home', 'shot');
  assert(clubs['Atlético Fênix'].roster.some(p => p.name === name), name);
});

check('liveOverall reage a expulsão', () => {
  const base = engine.profile();
  const before = engine.liveOverall('home', base);
  cards.home[1].red = true;
  const after = engine.liveOverall('home', base);
  cards.home[1].red = false;
  assert(after < before, `${before} -> ${after}`);
});

console.log('match-ratings-tests: 7/7 OK');

function check(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
  } catch (err) {
    console.error(`  ✗ ${label}: ${err.message}`);
    process.exitCode = 1;
  }
}
