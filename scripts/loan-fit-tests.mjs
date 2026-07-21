/**
 * Fit de empréstimo por divisão/OVR.
 * node scripts/loan-fit-tests.mjs
 */
import {
  loanDivisionDrop,
  loanAcceptChance,
  evaluateLoanFit,
  LOAN_HOST_OVR_HARD,
} from '../js/engine/loan-fit.js';
import { createTransfersEngine } from '../js/engine/transfers.js';
import { ensurePlayerId } from '../js/engine/player-identity.js';
import { ensureMarketFields } from '../js/engine/player-value.js';

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

const club = (name, division, power, extras = {}) => ({
  name,
  division,
  power,
  budget: extras.budget ?? 20_000_000,
  finances: extras.finances ?? 80,
  roster: extras.roster || [],
});

const player = (ovr, age = 24, overrides = {}) =>
  ensureMarketFields(
    ensurePlayerId(
      {
        name: `P${ovr}`,
        pos: 'ATA',
        age,
        overall: ovr,
        potential: ovr + 5,
        wage: Math.max(2000, ovr * 400),
        loanListed: true,
        ...overrides,
      },
      { seed: ovr, club: 'X', index: ovr },
    ),
    { division: 'A', season: 2030 },
  );

check('drop A→D = 3, mesma série = 0, D→A = -3', () => {
  assert(loanDivisionDrop('A', 'D') === 3, 'A→D');
  assert(loanDivisionDrop('B', 'B') === 0, 'B→B');
  assert(loanDivisionDrop('D', 'A') === -3, 'D→A');
});

check('estrela A → Série D: bloqueio duro (sem RNG)', () => {
  const star = player(62, 27);
  const owner = club('Palmeiras', 'A', 60);
  const host = club('Vinaz FC', 'D', 15, { budget: 5_000_000 });
  const fit = evaluateLoanFit(star, owner, host);
  assert(!fit.ok && fit.reason === 'loan_level', `got ${fit.reason} chance=${fit.chance}`);
  assert(fit.drop === 3, `drop ${fit.drop}`);
});

check('jovem reserva A → B: chance bem maior que A→D', () => {
  const youth = player(48, 19);
  const owner = club('Flamengo', 'A', 58);
  const toB = loanAcceptChance(youth, owner, club('Sport', 'B', 44));
  const toD = loanAcceptChance(youth, owner, club('Serra', 'D', 16));
  assert(toB > toD * 3, `B ${toB} vs D ${toD}`);
  assert(toD < 0.2, `D ainda raro ${toD}`);
});

check('mesma série: quase sempre ok', () => {
  const p = player(30, 24);
  const owner = club('C1', 'C', 34);
  const host = club('C2', 'C', 32);
  const fit = evaluateLoanFit(p, owner, host);
  assert(fit.ok, fit.reason || 'same div');
  assert(loanAcceptChance(p, owner, host) >= 0.8, 'chance alta');
});

check('Monte Carlo: A OVR≥55 → D hard-block ≥95%', () => {
  const owner = club('A', 'A', 58);
  const host = club('D', 'D', 16);
  let blocked = 0;
  const n = 500;
  for (let i = 0; i < n; i += 1) {
    const ovr = 55 + (i % 16);
    const fit = evaluateLoanFit(player(ovr, 25 + (i % 8)), owner, host);
    if (!fit.ok) blocked += 1;
  }
  const pct = (blocked / n) * 100;
  console.log(`  · A→D (OVR 55–70): ${pct.toFixed(1)}% bloqueados`);
  assert(pct >= 95, `esperado ≥95%, got ${pct}`);
});

check('motor: usuário D não toma estrela A listada', () => {
  const star = player(64, 26, { playerId: 'star-a', name: 'Estrela A', loanListed: true });
  const filler = (n, div, baseOvr) =>
    Array.from({ length: n }, (_, i) =>
      player(baseOvr, 24, {
        playerId: `${div}-${i}`,
        name: `${div}${i}`,
        loanListed: false,
        wage: 3000,
      }),
    );
  const clubs = {
    'Meu D': club('Meu D', 'D', 15, {
      budget: 8_000_000,
      finances: 70,
      roster: filler(20, 'D', 14),
    }),
    'Clube A': club('Clube A', 'A', 60, {
      budget: 40_000_000,
      finances: 85,
      roster: [star, ...filler(21, 'A', 55)],
    }),
  };
  // receita mínima para folha não ser o primeiro gate
  clubs['Meu D'].roster.forEach(p => {
    p.wage = 500;
  });
  // Salário baixo de propósito — o gate testado é nível, não folha.
  star.wage = 800;

  const engine = createTransfersEngine({
    getClubs: () => clubs,
    getUserClub: () => 'Meu D',
    getCareerSeason: () => 2030,
    getCareerDate: () => new Date(2030, 0, 20, 12),
    spend: () => ({ ok: true }),
    credit: () => ({ ok: true }),
    canAfford: () => true,
    isMarketOpen: () => true,
  });

  const result = engine.loanPlayer(star.playerId);
  assert(!result.ok && result.reason === 'loan_level', `got ${result.reason}`);
});

check('motor: usuário C toma jogador C (mesma série)', () => {
  const target = player(34, 23, { playerId: 'c-loan', name: 'C Loan', loanListed: true, wage: 4000 });
  const mk = (id, n, ovr) =>
    Array.from({ length: n }, (_, i) =>
      player(ovr, 24, { playerId: `${id}-${i}`, name: `${id}${i}`, wage: 3000 }),
    );
  const clubs = {
    'Meu C': club('Meu C', 'C', 34, {
      budget: 10_000_000,
      finances: 75,
      roster: mk('me', 20, 32),
    }),
    Rival: club('Rival', 'C', 33, {
      budget: 10_000_000,
      finances: 75,
      roster: [target, ...mk('riv', 21, 32)],
    }),
  };
  const engine = createTransfersEngine({
    getClubs: () => clubs,
    getUserClub: () => 'Meu C',
    getCareerSeason: () => 2030,
    getCareerDate: () => new Date(2030, 0, 20, 12),
    spend: () => ({ ok: true }),
    credit: () => ({ ok: true }),
    canAfford: () => true,
    isMarketOpen: () => true,
  });
  const result = engine.loanPlayer(target.playerId);
  assert(result.ok, result.reason || 'same-series loan');
});

check('hard cap D coerente com LOAN_HOST_OVR_HARD', () => {
  assert(LOAN_HOST_OVR_HARD.D === 40, String(LOAN_HOST_OVR_HARD.D));
  assert(LOAN_HOST_OVR_HARD.A >= 85, 'A teto alto');
});

console.log(`\nloan-fit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
