/**
 * Calibração de prêmios de fim de temporada / Copa / Série D.
 * Meta: campanha boa (G8) ≈ 25–40% do orçamento inicial; título/Copa como pico sem inflar multi-ano.
 * Uso: node scripts/economy-prize-sim.mjs
 */
import {
  INITIAL_BUDGET_BY_DIVISION,
  computeSeasonPrize,
  PARTICIPATION_PRIZE,
  POSITION_POOL,
  TITLE_BONUS,
  PROMOTION_BONUS,
  CUP_PHASE_POOL,
  SERIE_D_PHASE_POOL,
} from '../js/engine/economy.js';

const fmt = n => `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
const pctOf = (amount, base) => (base > 0 ? `${((amount / base) * 100).toFixed(0)}%` : '—');

const scenarios = [
  {
    label: 'A · 8º (G8)',
    division: 'A',
    position: 8,
    totalTeams: 20,
    champion: null,
    cupPhase: 0,
    promoted: false,
    targetMin: 0.25,
    targetMax: 0.4,
  },
  {
    label: 'A · 12º (meio)',
    division: 'A',
    position: 12,
    totalTeams: 20,
    champion: null,
    cupPhase: 0,
    promoted: false,
    targetMin: 0.18,
    targetMax: 0.32,
  },
  {
    label: 'A · campeão (sem Copa)',
    division: 'A',
    position: 1,
    totalTeams: 20,
    champion: 'User',
    userClub: 'User',
    cupPhase: 0,
    promoted: false,
    targetMin: 0.65,
    targetMax: 0.95,
  },
  {
    label: 'A · 8º + Copa campeão',
    division: 'A',
    position: 8,
    totalTeams: 20,
    champion: null,
    cupPhase: 'champion',
    promoted: false,
    targetMin: 0.4,
    targetMax: 0.7,
  },
  {
    label: 'B · 4º',
    division: 'B',
    position: 4,
    totalTeams: 20,
    champion: null,
    cupPhase: 0,
    promoted: false,
    targetMin: 0.25,
    targetMax: 0.42,
  },
  {
    label: 'C · campeão + acesso',
    division: 'C',
    position: 1,
    totalTeams: 20,
    champion: 'User',
    userClub: 'User',
    cupPhase: 0,
    promoted: true,
    targetMin: 0.7,
    targetMax: 1.1,
  },
  {
    label: 'D · grupos',
    division: 'D',
    position: 10,
    totalTeams: 20,
    serieDPhase: 'group',
    champion: null,
    cupPhase: 0,
    promoted: false,
    targetMin: 0.1,
    targetMax: 0.22,
  },
  {
    label: 'D · campeão + acesso',
    division: 'D',
    position: 1,
    totalTeams: 20,
    serieDPhase: 'champion',
    champion: 'User',
    userClub: 'User',
    cupPhase: 0,
    promoted: true,
    targetMin: 0.75,
    targetMax: 1.2,
  },
  {
    label: 'D · campeão + Copa + acesso',
    division: 'D',
    position: 1,
    totalTeams: 20,
    serieDPhase: 'champion',
    champion: 'User',
    userClub: 'User',
    cupPhase: 'champion',
    promoted: true,
    // Tríplice rara: pico alto, mas abaixo do ~3.8× antigo.
    targetMin: 1.2,
    targetMax: 2.0,
  },
  {
    label: 'Copa só · oitavas (A)',
    division: 'A',
    position: 14,
    totalTeams: 20,
    champion: null,
    cupPhase: 6,
    promoted: false,
    targetMin: 0.2,
    targetMax: 0.38,
  },
];

console.log('=== Tabelas calibradas ===');
console.log('Participação', PARTICIPATION_PRIZE);
console.log('Pool classificação', POSITION_POOL);
console.log('Título', TITLE_BONUS);
console.log('Acesso', fmt(PROMOTION_BONUS));
console.log('Pool Copa', fmt(CUP_PHASE_POOL));
console.log('Pool Série D campanha', fmt(SERIE_D_PHASE_POOL));
console.log('');

let failed = 0;
console.log('=== Cenários ===');
for (const scenario of scenarios) {
  const budget = INITIAL_BUDGET_BY_DIVISION[scenario.division];
  const prize = computeSeasonPrize({
    division: scenario.division,
    position: scenario.position,
    totalTeams: scenario.totalTeams,
    champion: scenario.champion,
    cupChampion: scenario.cupPhase === 'champion' ? scenario.userClub || 'User' : null,
    promoted: scenario.promoted,
    userClub: scenario.userClub || 'User',
    serieDPhase: scenario.serieDPhase || null,
    cupPhase: scenario.cupPhase,
  });
  const ratio = prize.total / budget;
  const inBand = ratio >= scenario.targetMin && ratio <= scenario.targetMax;
  if (!inBand) failed += 1;
  const flag = inBand ? 'OK' : 'FORA';
  console.log(
    `[${flag}] ${scenario.label.padEnd(28)} ${fmt(prize.total).padStart(14)} · ${pctOf(prize.total, budget).padStart(4)} do inicial (${fmt(budget)}) · alvo ${Math.round(scenario.targetMin * 100)}–${Math.round(scenario.targetMax * 100)}%`
  );
  prize.lines.forEach(line => {
    console.log(`       · ${line.label}: ${fmt(line.amount)}`);
  });
}

console.log('');
if (failed) {
  console.error(`Falhou: ${failed} cenário(s) fora da faixa.`);
  process.exitCode = 1;
} else {
  console.log('Todos os cenários dentro da faixa alvo.');
}
