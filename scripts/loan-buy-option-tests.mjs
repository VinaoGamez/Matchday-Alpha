/**
 * Validação da regra de opção de compra em empréstimo (antes de plugar no jogo).
 * node scripts/loan-buy-option-tests.mjs
 */
import { estimatePlayerValue } from '../js/engine/player-value.js';
import {
  LOAN_BUY_FEE_RATIO,
  LOAN_BUY_DIVISION_BIAS,
  rollLoanBuyFee,
  attachLoanBuyOption,
  clearLoanBuyOption,
  canExerciseLoanBuyOption,
  applyLoanBuyExercise,
  loanBuyFeeRatio,
  assertFeeInBand,
} from '../js/engine/loan-buy-option.js';

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

const seeded = seed => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

const onLoanPlayer = (overrides = {}) => ({
  name: 'Emprestado',
  pos: 'MC',
  age: 22,
  overall: 16,
  potential: 40,
  marketValue: 80_000,
  wage: 5_000,
  onLoan: true,
  loanFrom: 'Origem FC',
  loanListed: false,
  ...overrides,
});

check('fee band 100–120% (sem bias) fica na faixa', () => {
  const random = seeded(7);
  for (let i = 0; i < 200; i += 1) {
    const fee = rollLoanBuyFee(100_000, { division: 'C', random });
    const ratio = fee / 100_000;
    assert(ratio >= LOAN_BUY_FEE_RATIO.min - 1e-9, `ratio baixo ${ratio}`);
    assert(ratio <= LOAN_BUY_FEE_RATIO.max + 1e-9, `ratio alto ${ratio}`);
  }
});

check('bias por divisão desloca a faixa sem sair do esperado', () => {
  const samples = { A: [], B: [], C: [], D: [] };
  Object.keys(samples).forEach(div => {
    const random = seeded(99 + div.charCodeAt(0));
    for (let i = 0; i < 300; i += 1) {
      samples[div].push(rollLoanBuyFee(200_000, { division: div, random }) / 200_000);
    }
  });
  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  assert(avg(samples.A) > avg(samples.C), `A ${avg(samples.A)} vs C ${avg(samples.C)}`);
  assert(avg(samples.D) < avg(samples.C), `D ${avg(samples.D)} vs C ${avg(samples.C)}`);
  assert(avg(samples.A) <= LOAN_BUY_FEE_RATIO.max * LOAN_BUY_DIVISION_BIAS.A + 0.02, 'A teto');
  assert(avg(samples.D) >= LOAN_BUY_FEE_RATIO.min * LOAN_BUY_DIVISION_BIAS.D - 0.02, 'D piso');
});

check('taxa fixa no ato — mudança de marketValue depois não altera fee', () => {
  const p = onLoanPlayer({ marketValue: 100_000 });
  const opt = attachLoanBuyOption(p, {
    marketValue: 100_000,
    division: 'D',
    season: 2026,
    random: () => 0.5,
  });
  const locked = opt.fee;
  p.marketValue = 500_000;
  assert(p.loanBuyOption.fee === locked, 'fee imutável');
  assert(p.loanBuyOption.marketValueAtLoan === 100_000, 'base travada');
});

check('attach + assertFeeInBand por divisão', () => {
  ['A', 'B', 'C', 'D'].forEach(division => {
    const p = onLoanPlayer();
    const opt = attachLoanBuyOption(p, {
      marketValue: 150_000,
      division,
      random: seeded(12),
    });
    assert(assertFeeInBand(opt, division), `band ${division} ratio=${loanBuyFeeRatio(opt)}`);
  });
});

check('bloqueia: não está emprestado / sem opção / mercado fechado / sem caixa', () => {
  const base = onLoanPlayer();
  attachLoanBuyOption(base, { marketValue: 80_000, division: 'D', random: () => 0 });

  assert(
    canExerciseLoanBuyOption({
      player: { ...base, onLoan: false },
      hostClubName: 'Host FC',
    }).reason === 'not_on_loan',
    'not_on_loan',
  );

  const noOpt = onLoanPlayer();
  assert(
    canExerciseLoanBuyOption({ player: noOpt, hostClubName: 'Host FC' }).reason === 'no_buy_option',
    'no_buy_option',
  );

  assert(
    canExerciseLoanBuyOption({
      player: base,
      hostClubName: 'Host FC',
      marketOpen: false,
    }).reason === 'market_closed',
    'market_closed',
  );

  assert(
    canExerciseLoanBuyOption({
      player: base,
      hostClubName: 'Host FC',
      canAfford: () => false,
    }).reason === 'no_funds',
    'no_funds',
  );
});

check('bloqueia same_club e libera hospedeiro legítimo', () => {
  const p = onLoanPlayer({ loanFrom: 'Origem FC' });
  attachLoanBuyOption(p, { marketValue: 80_000, division: 'C', random: () => 0.25 });

  assert(
    canExerciseLoanBuyOption({ player: p, hostClubName: 'Origem FC' }).reason === 'same_club',
    'same_club',
  );

  const ok = canExerciseLoanBuyOption({
    player: p,
    hostClubName: 'Host FC',
    marketOpen: true,
    canAfford: fee => fee <= 200_000,
    hostRosterSize: 25,
  });
  assert(ok.ok, ok.reason || 'exercise ok');
  assert(ok.fee === p.loanBuyOption.fee, 'fee echo');
  assert(ok.from === 'Origem FC' && ok.to === 'Host FC', 'clubs');
});

check('já no elenco: vaga extra não é exigida (só hard max ilegal)', () => {
  const p = onLoanPlayer();
  attachLoanBuyOption(p, { marketValue: 50_000, division: 'D', random: () => 0 });
  const atCap = canExerciseLoanBuyOption({
    player: p,
    hostClubName: 'Host',
    hostRosterSize: 40,
    rosterHardMax: 40,
  });
  assert(atCap.ok, '40/40 ainda ok — já está dentro');
  const over = canExerciseLoanBuyOption({
    player: p,
    hostClubName: 'Host',
    hostRosterSize: 41,
    rosterHardMax: 40,
  });
  assert(over.reason === 'roster_hard_max', over.reason);
});

check('apply limpa flags e preserva fee/from no recibo', () => {
  const p = onLoanPlayer({ loanFrom: 'Rival', marketValue: 90_000 });
  attachLoanBuyOption(p, { marketValue: 90_000, division: 'B', random: () => 0.8 });
  const fee = p.loanBuyOption.fee;
  const result = applyLoanBuyExercise(p);
  assert(result.ok && result.type === 'loan_buy', 'type');
  assert(result.fee === fee && result.from === 'Rival', 'recibo');
  assert(!p.onLoan && !p.loanFrom && !p.loanBuyOption, 'flags limpos');
  assert(!p.loanListed && !p.listed, 'mercado limpo');
});

check('simetria caixa: host paga, origem recebe o mesmo fee', () => {
  const fee = rollLoanBuyFee(120_000, { division: 'C', random: () => 0.5 });
  let hostBudget = 1_000_000;
  let ownerBudget = 200_000;
  assert(hostBudget >= fee, 'host afford');
  hostBudget -= fee;
  ownerBudget += fee;
  assert(hostBudget === 1_000_000 - fee, `host ${hostBudget}`);
  assert(ownerBudget === 200_000 + fee, `owner ${ownerBudget}`);
});

check('Monte Carlo Série D: affordabilidade típica vs caixa 4 mi', () => {
  const cash = 4_000_000;
  let affordable = 0;
  const n = 2000;
  const random = seeded(2026);
  for (let i = 0; i < n; i += 1) {
    const ovr = 10 + Math.floor(random() * 10); // 10–19
    const age = 18 + Math.floor(random() * 14);
    const value = estimatePlayerValue(
      { overall: ovr, age, potential: ovr + 20, pos: 'ATA' },
      'D',
    );
    const fee = rollLoanBuyFee(value, { division: 'D', random });
    if (fee <= cash) affordable += 1;
  }
  const pct = (affordable / n) * 100;
  console.log(`  · Série D: ${pct.toFixed(1)}% das opções ≤ R$ 4 mi (n=${n})`);
  assert(pct >= 95, `esperado ≥95% affordáveis, got ${pct}`);
});

check('Monte Carlo Série A: fee fica material vs caixa 40 mi', () => {
  const cash = 40_000_000;
  let affordable = 0;
  let sumFee = 0;
  const n = 1500;
  const random = seeded(42);
  for (let i = 0; i < n; i += 1) {
    const ovr = 50 + Math.floor(random() * 21);
    const value = estimatePlayerValue(
      { overall: ovr, age: 24, potential: ovr + 8, pos: 'MEI' },
      'A',
    );
    const fee = rollLoanBuyFee(value, { division: 'A', random });
    sumFee += fee;
    if (fee <= cash) affordable += 1;
  }
  const avgFee = sumFee / n;
  const pct = (affordable / n) * 100;
  console.log(
    `  · Série A: média fee ${Math.round(avgFee).toLocaleString('pt-BR')} · ${pct.toFixed(1)}% ≤ R$ 40 mi`,
  );
  assert(pct >= 80, `A afford ${pct}`);
  assert(avgFee > 500_000, `fee médio A baixo demais: ${avgFee}`);
});

check('sem exercício: clearLoanBuyOption no retorno deixa jogador limpo', () => {
  const p = onLoanPlayer();
  attachLoanBuyOption(p, { marketValue: 70_000, division: 'C', random: () => 0.1 });
  // simula fim de temporada: volta sem comprar
  p.onLoan = false;
  p.loanFrom = null;
  clearLoanBuyOption(p);
  assert(!p.loanBuyOption, 'opção removida no retorno');
  assert(
    canExerciseLoanBuyOption({ player: p, hostClubName: 'X' }).reason === 'not_on_loan',
    'não exerce após retorno',
  );
});

check('cenário integrado: empresta → tenta sem caixa → credita → exerce', () => {
  const owner = { name: 'Origem FC', budget: 100_000 };
  const host = { name: 'Host FC', budget: 50_000, rosterSize: 22 };
  const player = onLoanPlayer({
    loanFrom: owner.name,
    marketValue: 100_000,
  });
  attachLoanBuyOption(player, {
    marketValue: 100_000,
    division: 'C',
    random: () => 0, // fee = 100% * bias C = 100_000
  });
  const fee = player.loanBuyOption.fee;
  assert(fee === 100_000, `fee=${fee}`);

  const broke = canExerciseLoanBuyOption({
    player,
    hostClubName: host.name,
    canAfford: amount => host.budget >= amount,
  });
  assert(broke.reason === 'no_funds', 'sem caixa');

  host.budget = 250_000;
  const gate = canExerciseLoanBuyOption({
    player,
    hostClubName: host.name,
    marketOpen: true,
    canAfford: amount => host.budget >= amount,
    hostRosterSize: host.rosterSize,
  });
  assert(gate.ok, gate.reason);
  host.budget -= gate.fee;
  owner.budget += gate.fee;
  const done = applyLoanBuyExercise(player);
  assert(done.ok && !player.onLoan, 'exercido');
  assert(host.budget === 150_000, `host budget ${host.budget}`);
  assert(owner.budget === 200_000, `owner budget ${owner.budget}`);
});

console.log(`\nloan-buy-option: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
