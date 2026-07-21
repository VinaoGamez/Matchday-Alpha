/**
 * Calibração do motor financeiro v1 (folha + finances + demissão gatilho 3).
 * Uso: node scripts/economy-cashflow-sim.mjs
 */
import {
  estimateWageBill,
  estimateStaffBill,
  estimateStadiumOpsBill,
  estimateRoundCostBill,
  estimateWageRunway,
  chargeRoundCosts,
  chargeWageBill,
  initialBudget,
  ensureStadium,
  ensureStaffContract,
  computeStaffWageScore,
  computeStaffBillFromScore,
  assignSponsors,
  normalizeSponsorContract,
  estimateSponsorInstallment,
  creditSponsorInstallment,
  assignTvRights,
  estimateTvInstallment,
  creditTvInstallment,
  creditHomeTv,
  tvHomeSlots,
  credit,
  getSeasonCashflowStatement,
  getBalance,
  WAGE_BILL_SOFT_CAP,
  STAFF_BASE_BY_DIVISION,
  STAFF_BILL_SOFT_CAP,
  STADIUM_OPS_BASE_BY_DIVISION,
  STADIUM_OPS_SOFT_CAP,
  TV_VALUE_BY_DIVISION,
} from '../js/engine/economy.js';
import { syncFromBudget } from '../js/engine/club-status/rules/finances.js';
import { STATUS_MIN, STATUS_MAX } from '../js/engine/club-status/constants.js';
import { matchDelta, tableDelta, driftDelta } from '../js/engine/club-status/rules/board.js';
import { resolveBoardJobRisk, MANAGER_JOB_HONEYMOON_ROUNDS } from '../js/engine/manager-job.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const clampStatus = v => clamp(Math.round(Number(v) || 0), STATUS_MIN, STATUS_MAX);

let passed = 0;
let failed = 0;
const ok = name => {
  passed += 1;
  console.log(`  OK    ${name}`);
};
const fail = (name, detail) => {
  failed += 1;
  console.log(`  FAIL  ${name} — ${detail}`);
};

const makeRoster = (count, overall, age = 26) =>
  Array.from({ length: count }, (_, i) => ({
    name: `P${i + 1}`,
    overall,
    age: age + (i % 5) - 2,
    pos: 'MC',
  }));

const makeClub = ({
  division = 'A',
  overall = 75,
  rosterSize = 22,
  budgetRatio = 1,
  board = 62,
  finances = 70,
} = {}) => {
  const club = {
    name: 'Sim FC',
    division,
    roster: makeRoster(rosterSize, overall),
    budget: Math.round(initialBudget(division) * budgetRatio),
    budgetLedger: [],
    board,
    finances,
    wageShortfall: false,
  };
  return club;
};

const syncFin = club => {
  syncFromBudget(club, {
    balance: club.budget,
    baseline: initialBudget(club.division),
    wageBill: estimateRoundCostBill(club, club.division, { managerReputation: 70 }),
    shortfall: !!club.wageShortfall,
    clamp,
    clampStatus,
  });
};

console.log('\n=== 1) Ordem de grandeza da folha ===\n');

for (const division of ['A', 'B', 'C', 'D']) {
  const mid = makeClub({ division, overall: 75, rosterSize: 22 });
  const high = makeClub({ division, overall: 86, rosterSize: 24 });
  const billMid = estimateWageBill(mid, division);
  const billHigh = estimateWageBill(high, division);
  const cap = WAGE_BILL_SOFT_CAP[division];
  console.log(
    `Série ${division}: médio ${billMid.toLocaleString('pt-BR')} | alto ${billHigh.toLocaleString('pt-BR')} | cap ${cap.toLocaleString('pt-BR')}`,
  );
  if (billMid > 0 && billMid <= cap) ok(`Série ${division} folha média sob o cap`);
  else fail(`Série ${division} folha média sob o cap`, String(billMid));
  if (billHigh <= cap) ok(`Série ${division} folha alta respeita cap`);
  else fail(`Série ${division} folha alta respeita cap`, String(billHigh));
}

const serieA = makeClub({ division: 'A', overall: 78, rosterSize: 22 });
const billA = estimateWageBill(serieA, 'A');
if (billA >= 180_000 && billA <= 350_000) ok(`Série A típica na faixa 180–350k (${billA})`);
else fail('Série A típica na faixa 180–350k', String(billA));

console.log('\n=== 2) Comissão técnica (contrato por técnico) ===\n');
const weak = {
  id: 'mgr-weak',
  reputation: 52,
  preferredDivision: 'D',
  titlePoints: 0,
};
const mid = {
  id: 'mgr-mid',
  reputation: 70,
  preferredDivision: 'B',
  titlePoints: 4,
};
const top = {
  id: 'mgr-top',
  reputation: 92,
  preferredDivision: 'A',
  titlePoints: 18,
};
const weakBill = computeStaffBillFromScore(computeStaffWageScore(weak), 'A');
const midBill = computeStaffBillFromScore(computeStaffWageScore(mid), 'A');
const topBill = computeStaffBillFromScore(computeStaffWageScore(top), 'A');
console.log(`Série A score→bill: fraco=${weakBill} médio=${midBill} top=${topBill}`);
if (weakBill < midBill && midBill < topBill) ok('variação fraco < médio < top');
else fail('variação fraco < médio < top', `${weakBill}/${midBill}/${topBill}`);
if (weakBill >= Math.round(STAFF_BASE_BY_DIVISION.A * 0.55) && topBill <= STAFF_BILL_SOFT_CAP.A) {
  ok('respeita piso e soft cap A');
} else fail('respeita piso e soft cap A', `${weakBill}/${topBill}`);
if (topBill - weakBill >= 15_000) ok('spread ≥ 15k entre fraco e top');
else fail('spread ≥ 15k entre fraco e top', String(topBill - weakBill));

const contractClub = makeClub({ division: 'A' });
const locked = ensureStaffContract(contractClub, {
  division: 'A',
  season: 2026,
  managerId: mid.id,
  managerReputation: mid.reputation,
  preferredDivision: mid.preferredDivision,
  titlePoints: mid.titlePoints,
});
const sameManager = ensureStaffContract(contractClub, {
  division: 'A',
  managerId: mid.id,
  managerReputation: 99,
  preferredDivision: 'A',
  titlePoints: 99,
});
if (sameManager.amountPerRound === locked.amountPerRound) ok('contrato fixo no mesmo técnico');
else fail('contrato fixo no mesmo técnico', `${sameManager.amountPerRound} vs ${locked.amountPerRound}`);
const swapped = ensureStaffContract(contractClub, {
  division: 'A',
  managerId: top.id,
  managerReputation: top.reputation,
  preferredDivision: top.preferredDivision,
  titlePoints: top.titlePoints,
  force: true,
});
if (swapped.amountPerRound !== locked.amountPerRound && swapped.amountPerRound === topBill) {
  ok('troca de técnico gera novo contrato');
} else fail('troca de técnico gera novo contrato', JSON.stringify(swapped));

const staffShare = midBill / estimateWageBill(makeClub({ overall: 75 }), 'A');
console.log(`comissao média/folha A ≈ ${(staffShare * 100).toFixed(1)}%`);
if (staffShare >= 0.08 && staffShare <= 0.22) ok('comissão média ~8–22% da folha típica A');
else fail('comissão média ~8–22% da folha típica A', String(staffShare));

console.log('\n=== 3) Manutenção do estádio ===\n');
for (const division of ['A', 'B', 'C', 'D']) {
  const club = makeClub({ division, overall: 75 });
  ensureStadium(club, division);
  const ops = estimateStadiumOpsBill(club, division);
  const cap = STADIUM_OPS_SOFT_CAP[division];
  const base = STADIUM_OPS_BASE_BY_DIVISION[division];
  console.log(
    `Série ${division}: ops=${ops.toLocaleString('pt-BR')} base=${base.toLocaleString('pt-BR')} cap=${cap.toLocaleString('pt-BR')} capSeats=${club.stadiumCapacity}`,
  );
  if (ops > base && ops <= cap) ok(`Série ${division} estádio entre base e cap`);
  else fail(`Série ${division} estádio entre base e cap`, String(ops));
}
const stadShare =
  estimateStadiumOpsBill(makeClub({ overall: 75 }), 'A') /
  estimateWageBill(makeClub({ overall: 75 }), 'A');
console.log(`estadio/folha média A ≈ ${(stadShare * 100).toFixed(1)}%`);
if (stadShare >= 0.08 && stadShare <= 0.35) ok('estádio ~8–35% da folha típica A');
else fail('estádio ~8–35% da folha típica A', String(stadShare));

console.log('\n=== 4) Shortfall proporcional (3 buckets) ===\n');
const broke = makeClub({ division: 'A', overall: 80, budgetRatio: 0.01 });
const charged = chargeRoundCosts(broke, { division: 'A', round: 1, managerReputation: 70 });
console.log(
  `due=${charged.due} paid=${charged.paid} wages=${charged.wages.paid}/${charged.wages.due} staff=${charged.staff.paid}/${charged.staff.due} stadium=${charged.stadium.paid}/${charged.stadium.due}`,
);
if (charged.shortfall > 0 && broke.budget === 0 && broke.wageShortfall) ok('shortfall zera caixa e marca flag');
else fail('shortfall zera caixa e marca flag', JSON.stringify(charged));
if (charged.wages.paid > 0 && charged.staff.paid > 0 && charged.stadium.paid > 0) {
  ok('rateio paga jogadores, comissão e estádio');
} else fail('rateio paga jogadores, comissão e estádio', JSON.stringify(charged));
const again = chargeWageBill(broke, { division: 'A', round: 1 });
if (again.skipped) ok('idempotência por rodada');
else fail('idempotência por rodada', 'cobrou de novo');

console.log('\n=== 5) Temporadas: crise via folha (sem queima artificial) ===\n');

const simulate = ({ label, clubFactory, results, gateIncome = 0 }) => {
  const club = clubFactory();
  syncFin(club);
  let points = 0;
  let played = 0;
  let sackRound = null;
  let firstWarn = null;
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    played += 1;
    if (result === 'W') points += 3;
    else if (result === 'D') points += 1;
    const position = Math.max(1, Math.min(20, 18 - Math.round((points / played) * 8)));
    club.board += matchDelta({
      result,
      isHome: i % 2 === 0,
      goalDiff: result === 'W' ? 1 : result === 'L' ? -1 : 0,
      clamp,
    });
    club.board += tableDelta({ position, clubsCount: 20, points, played, clamp });
    club.board += driftDelta(club.board);
    club.board = clampStatus(club.board);

    if (gateIncome > 0 && i % 2 === 0) club.budget += gateIncome;
    chargeRoundCosts(club, { division: club.division, round: played, managerReputation: 70 });
    syncFin(club);

    const risk = resolveBoardJobRisk({
      board: club.board,
      finances: club.finances,
      played,
    });
    if (!firstWarn && risk.status.startsWith('warn')) firstWarn = { round: played, status: risk.status };
    if (risk.status === 'critical' && !firstWarn) firstWarn = { round: played, status: risk.status };
    if (risk.status === 'sacked') {
      sackRound = played;
      break;
    }
  }
  return {
    label,
    sackRound,
    firstWarn,
    board: club.board,
    finances: Math.round(club.finances),
    budget: club.budget,
    bill: estimateRoundCostBill(club, club.division, { managerReputation: 70 }),
    runway: estimateWageRunway(club, club.division, { managerReputation: 70 }).toFixed(1),
  };
};

const scenarios = [
  simulate({
    label: 'Elenco caro + derrotas (deve demitir)',
    clubFactory: () => makeClub({ overall: 86, rosterSize: 24, budgetRatio: 0.38, board: 56, finances: 58 }),
    results: Array(24).fill('L'),
    gateIncome: 25_000,
  }),
  simulate({
    label: 'Elenco enxuto + campanha ok (estável)',
    clubFactory: () => makeClub({ overall: 72, rosterSize: 20, budgetRatio: 1.1, board: 62, finances: 72 }),
    results: Array(20)
      .fill('W')
      .map((r, i) => (i % 4 === 3 ? 'D' : 'W')),
    gateIncome: 180_000,
  }),
  simulate({
    label: 'Folha alta + vitórias (só pressão financeira, sem demissão)',
    clubFactory: () => makeClub({ overall: 88, rosterSize: 24, budgetRatio: 0.45, board: 70, finances: 55 }),
    results: Array(20).fill('W'),
    gateIncome: 90_000,
  }),
];

for (const s of scenarios) {
  const sackTxt = s.sackRound ? `DEMITIDO r${s.sackRound}` : 'empregado';
  const warnTxt = s.firstWarn ? `aviso r${s.firstWarn.round} (${s.firstWarn.status})` : 'sem aviso';
  console.log(`• ${s.label}`);
  console.log(
    `  → ${sackTxt} | ${warnTxt} | board=${s.board} fin=${s.finances} folha=${s.bill} cobertura=${s.runway} caixa=${s.budget}`,
  );
}

if (scenarios[0].sackRound != null && scenarios[0].sackRound >= MANAGER_JOB_HONEYMOON_ROUNDS) {
  ok(`crise folha+derrotas demite (r${scenarios[0].sackRound})`);
} else fail('crise folha+derrotas demite', String(scenarios[0].sackRound));

if (scenarios[1].sackRound == null && scenarios[1].finances >= 40) ok('elenco enxuto permanece saudável');
else fail('elenco enxuto permanece saudável', `sack=${scenarios[1].sackRound} fin=${scenarios[1].finances}`);

if (scenarios[2].sackRound == null) ok('folha alta com vitórias NÃO demite (gatilho 3)');
else fail('folha alta com vitórias NÃO demite', `demitiu r${scenarios[2].sackRound}`);

console.log('\n=== 6) Runway pressiona finances sem zerar caixa ===\n');
const runwayClub = makeClub({ overall: 84, rosterSize: 23, budgetRatio: 0.08, finances: 70 });
const bill = estimateRoundCostBill(runwayClub, 'A', { managerReputation: 70 });
const roundsCover = runwayClub.budget / bill;
syncFin(runwayClub);
for (let i = 0; i < 10; i++) syncFin(runwayClub);
console.log(`cobertura≈${roundsCover.toFixed(1)} finanças→${Math.round(runwayClub.finances)} caixa=${runwayClub.budget}`);
if (runwayClub.budget > 0 && runwayClub.finances <= 48) ok('runway baixa finanças com caixa ainda positivo');
else fail('runway baixa finanças com caixa ainda positivo', `fin=${runwayClub.finances}`);

console.log('\n=== 7) Patrocínio parcelado por rodada ===\n');
const sponsorClub = makeClub({ division: 'A', budgetRatio: 1 });
const startBudget = getBalance(sponsorClub);
assignSponsors(sponsorClub, {
  division: 'A',
  season: 2026,
  installments: 38,
  creditPackage: false,
  random: () => 0.42,
});
if (getBalance(sponsorClub) === startBudget) ok('assign sem crédito à vista');
else fail('assign sem crédito à vista', String(getBalance(sponsorClub) - startBudget));
const total = sponsorClub.sponsors.total;
let sum = 0;
for (let round = 1; round <= 38; round++) {
  const paid = creditSponsorInstallment(sponsorClub, { round, installments: 38 });
  sum += paid.amount;
  const again = creditSponsorInstallment(sponsorClub, { round, installments: 38 });
  if (!again.skipped || again.amount !== 0) {
    fail('idempotência parcela por rodada', `r${round}`);
    break;
  }
}
console.log(`total contrato=${total} soma parcelas=${sum}`);
if (sum === total) ok('soma das 38 parcelas = total do contrato');
else fail('soma das 38 parcelas = total do contrato', `${sum} vs ${total}`);
if (sponsorClub.sponsors.credited && sponsorClub.sponsors.paidInstallments === 38) {
  ok('contrato marcado quitado após 38 rodadas');
} else fail('contrato marcado quitado após 38 rodadas', JSON.stringify(sponsorClub.sponsors));

const legacy = {
  season: 2026,
  total: 10_000_000,
  credited: true,
  master: { name: 'Googol', value: 7_000_000 },
  secondaries: [
    { name: 'Naike', value: 1_000_000 },
    { name: 'Pumba Sport', value: 1_000_000 },
    { name: 'Ifome', value: 1_000_000 },
  ],
};
normalizeSponsorContract(legacy, { installments: 38 });
const legacyClub = { budget: 1_000_000, budgetLedger: [], sponsors: legacy };
const legacyPay = creditSponsorInstallment(legacyClub, { round: 5, installments: 38 });
if (legacy.paidAmount === 10_000_000 && legacyPay.amount === 0) {
  ok('save legado creditado à vista não recredita');
} else fail('save legado creditado à vista não recredita', JSON.stringify(legacyPay));

const early = makeClub({ division: 'A' });
assignSponsors(early, { division: 'A', installments: 38, creditPackage: false, random: () => 0.1 });
const first = estimateSponsorInstallment(early, { installments: 38 });
const expectedFirst = Math.floor(early.sponsors.total / 38);
if (first === expectedFirst) ok(`primeira parcela ≈ total/38 (${first})`);
else fail('primeira parcela ≈ total/38', `${first} vs ${expectedFirst}`);

console.log('\n=== 8) Direitos de TV por mando ===\n');
const tvClub = makeClub({ division: 'A', budgetRatio: 1 });
const tvStart = getBalance(tvClub);
const homeSlotsA = tvHomeSlots('A');
assignTvRights(tvClub, {
  division: 'A',
  season: 2026,
  installments: homeSlotsA,
  random: () => 0.5,
});
const [tvMin, tvMax] = TV_VALUE_BY_DIVISION.A;
console.log(`TV total A=${tvClub.tvRights.total} (faixa ${tvMin}–${tvMax}) · mandos=${homeSlotsA}`);
if (getBalance(tvClub) === tvStart) ok('assign TV sem crédito à vista');
else fail('assign TV sem crédito à vista', String(getBalance(tvClub) - tvStart));
if (tvClub.tvRights.total >= tvMin && tvClub.tvRights.total <= tvMax) ok('total TV na faixa da Série A');
else fail('total TV na faixa da Série A', String(tvClub.tvRights.total));
if (tvClub.tvRights.installments === homeSlotsA) ok(`slots de mando A=${homeSlotsA}`);
else fail('slots de mando A', String(tvClub.tvRights.installments));
let tvSum = 0;
for (let home = 1; home <= homeSlotsA; home++) {
  const game = {
    home: tvClub.name,
    away: `Visitante ${home}`,
    round: home * 2 - 1,
    competition: 'LEAGUE',
  };
  const paid = creditHomeTv(tvClub, game, { division: 'A', season: 2026 });
  tvSum += paid.amount || 0;
  const againTv = creditHomeTv(tvClub, game, { division: 'A', season: 2026 });
  if (!againTv.skipped || againTv.amount !== 0) {
    fail('idempotência TV mando', `h${home}`);
    break;
  }
}
console.log(`TV soma mandos=${tvSum} contrato=${tvClub.tvRights.total}`);
if (tvSum === tvClub.tvRights.total) ok(`soma dos ${homeSlotsA} mandos TV = total`);
else fail(`soma dos ${homeSlotsA} mandos TV = total`, `${tvSum} vs ${tvClub.tvRights.total}`);
const tvFirst = estimateTvInstallment(
  (() => {
    const c = makeClub({ division: 'A' });
    assignTvRights(c, { division: 'A', installments: homeSlotsA, random: () => 0.25 });
    return c;
  })(),
  { installments: homeSlotsA, division: 'A' },
);
// Pool A v3 ~4–5.44M / 19 mandos ≈ 210–286k
if (tvFirst >= 200_000 && tvFirst <= 310_000) ok(`primeira parcela TV A mando ~200–310k (${tvFirst})`);
else fail('primeira parcela TV A mando ~200–310k', String(tvFirst));
const cupSkip = (() => {
  const c = makeClub({ division: 'A' });
  assignTvRights(c, { division: 'A', installments: homeSlotsA, random: () => 0.5 });
  return creditHomeTv(
    c,
    { home: c.name, away: 'X', competition: 'COPA DO BRASIL', round: 1 },
    { division: 'A', season: 2026 },
  );
})();
if (cupSkip.skipped && cupSkip.reason === 'cup') ok('Copa não credita TV');
else fail('Copa não credita TV', JSON.stringify(cupSkip));

console.log('\n=== 9) DFC temporada (além do ledger) ===\n');
const dfcClub = makeClub({ division: 'A', budgetRatio: 1 });
dfcClub.sponsors = { season: 2026 };
for (let i = 0; i < 50; i++) {
  credit(dfcClub, 10_000, { reason: 'tv_rights', label: `TV ${i + 1}` });
  chargeRoundCosts(dfcClub, {
    division: 'A',
    round: i + 1,
    managerReputation: 70,
    managerId: 'dfc-mgr',
  });
}
const statement = getSeasonCashflowStatement(dfcClub, 2026);
console.log(
  `ledger=${dfcClub.budgetLedger.length} dfcMovs=${statement.count} tv=${statement.inflows.tv} wages=${statement.outflows.wages}`,
);
if (dfcClub.budgetLedger.length <= 40) ok('ledger continua limitado');
else fail('ledger continua limitado', String(dfcClub.budgetLedger.length));
if (statement.count >= 50 && statement.inflows.tv === 500_000) {
  ok('DFC acumula além do limite do ledger');
} else fail('DFC acumula além do limite do ledger', JSON.stringify(statement));

console.log(`\n=== RESULTADO: ${passed} ok, ${failed} falhas ===\n`);
process.exit(failed ? 1 : 0);
