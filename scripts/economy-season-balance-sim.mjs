/**
 * Calibração de fluxo sazonal: ninguém deve falir o ano todo nem explodir de rico.
 * Uso: node scripts/economy-season-balance-sim.mjs
 */
import {
  initialBudget,
  estimateRoundCostBill,
  estimateWageBill,
  estimateStaffBill,
  estimateStadiumOpsBill,
  estimateGateReceipt,
  chargeRoundCosts,
  assignSponsors,
  assignTvRights,
  creditSponsorInstallment,
  creditTvInstallment,
  ensureStadium,
  getBalance,
  TV_VALUE_BY_DIVISION,
  SPONSOR_VALUE_BY_DIVISION,
} from '../js/engine/economy.js';

const fmt = n =>
  `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(0)}%` : '—');

const makeRoster = (count, overall) =>
  Array.from({ length: count }, (_, i) => ({
    name: `P${i + 1}`,
    overall,
    age: 24 + (i % 8),
    pos: 'MC',
  }));

const makeClub = ({ division, overall, rosterSize = 22, budgetRatio = 1 }) => {
  const club = {
    name: `Sim ${division}`,
    division,
    roster: makeRoster(rosterSize, overall),
    budget: Math.round(initialBudget(division) * budgetRatio),
    budgetLedger: [],
    managerReputation: 70,
    environment: 62,
  };
  ensureStadium(club, division);
  return club;
};

const seasonRounds = division => (division === 'D' ? 22 : 38);

/**
 * Temporada nacional: custos + patrocínio + TV + bilheteria em casa (~metade das rodadas).
 * Sem prêmio de fim de temporada (avaliado à parte).
 */
const simulateSeason = ({
  label,
  division,
  overall,
  rosterSize = 22,
  budgetRatio = 1,
  gateFill = 0.72,
  random = () => 0.45,
}) => {
  const rounds = seasonRounds(division);
  const club = makeClub({ division, overall, rosterSize, budgetRatio });
  const start = getBalance(club);
  assignSponsors(club, { division, season: 2026, installments: rounds, creditPackage: false, random });
  assignTvRights(club, { division, season: 2026, installments: rounds, random });

  const wage = estimateWageBill(club, division);
  const staff = estimateStaffBill(club, division, { managerReputation: 70 });
  const stadium = estimateStadiumOpsBill(club, division);
  const roundCost = estimateRoundCostBill(club, division, { managerReputation: 70 });
  const gateEst = estimateGateReceipt(club, { channel: 'national', division });
  // Usa a estimativa do motor (já inclui lotação); gateFill só escala cenários de torcida fraca/forte.
  const gatePerHome = Math.round(gateEst.revenue * (gateFill / 0.72));

  let minBal = start;
  let maxBal = start;
  let brokeRound = null;
  let income = 0;
  let costs = 0;

  for (let round = 1; round <= rounds; round++) {
    const before = getBalance(club);
    const isHome = round % 2 === 1;
    if (isHome) {
      club.budget += gatePerHome;
      income += gatePerHome;
    }
    const sp = creditSponsorInstallment(club, { round, installments: rounds });
    const tv = creditTvInstallment(club, { round, installments: rounds });
    income += (sp.amount || 0) + (tv.amount || 0);
    const charged = chargeRoundCosts(club, {
      division,
      round,
      managerReputation: 70,
      managerId: `mgr-${division}`,
      preferredDivision: division,
    });
    costs += charged.paid || 0;
    const bal = getBalance(club);
    minBal = Math.min(minBal, bal);
    maxBal = Math.max(maxBal, bal);
    if (bal <= 0 && brokeRound == null) brokeRound = round;
    if (before === bal && round === 1) {
      /* noop */
    }
  }

  const end = getBalance(club);
  const net = end - start;
  return {
    label,
    division,
    rounds,
    start,
    end,
    net,
    minBal,
    maxBal,
    brokeRound,
    income,
    costs,
    roundCost,
    wage,
    staff,
    stadium,
    gatePerHome,
    sponsorTotal: club.sponsors?.total || 0,
    tvTotal: club.tvRights?.total || 0,
    endOverStart: end / Math.max(1, start),
  };
};

const profiles = [];
for (const division of ['A', 'B', 'C', 'D']) {
  const midOvr = { A: 76, B: 72, C: 68, D: 64 }[division];
  const highOvr = { A: 86, B: 80, C: 74, D: 70 }[division];
  profiles.push(
    simulateSeason({
      label: `${division} médio`,
      division,
      overall: midOvr,
      budgetRatio: 1,
      gateFill: 0.72,
    }),
  );
  profiles.push(
    simulateSeason({
      label: `${division} elenco caro`,
      division,
      overall: highOvr,
      rosterSize: 24,
      budgetRatio: 1,
      gateFill: 0.65,
    }),
  );
  profiles.push(
    simulateSeason({
      label: `${division} caixa baixo`,
      division,
      overall: midOvr,
      budgetRatio: 0.35,
      gateFill: 0.7,
    }),
  );
}

console.log('\n=== Calibração de fluxo sazonal (sem prêmio de fim) ===\n');
console.log(
  'Meta: minBal > 0 na maioria; end/start entre ~0.6 e ~2.2; elenco caro pode apertar sem falir cedo.\n',
);

for (const p of profiles) {
  const lowStart = p.label.includes('caixa baixo');
  const flag =
    p.brokeRound != null
      ? `FALIU r${p.brokeRound}`
      : !lowStart && p.endOverStart > 2.2
        ? 'RICO demais'
        : !lowStart && p.endOverStart < 0.55
          ? 'POBRE demais'
          : lowStart && p.brokeRound == null
            ? 'recupera (ok)'
            : 'ok';
  console.log(`• ${p.label}`);
  console.log(
    `  start=${fmt(p.start)} end=${fmt(p.end)} (${pct(p.end, p.start)}) net=${fmt(p.net)} | min=${fmt(p.minBal)} max=${fmt(p.maxBal)} → ${flag}`,
  );
  console.log(
    `  custo/rod=${fmt(p.roundCost)} (folha ${fmt(p.wage)} + staff ${fmt(p.staff)} + est ${fmt(p.stadium)}) | gate casa≈${fmt(p.gatePerHome)}`,
  );
  console.log(
    `  patrocínio=${fmt(p.sponsorTotal)} TV=${fmt(p.tvTotal)} | entradas=${fmt(p.income)} saídas=${fmt(p.costs)}`,
  );
}

const midA = profiles.find(p => p.label === 'A médio');
const richA = profiles.find(p => p.label === 'A elenco caro');
const brokeA = profiles.find(p => p.label === 'A caixa baixo');

console.log('\n=== Diagnóstico Série A ===\n');
console.log(`Médio: end/start=${midA.endOverStart.toFixed(2)} min=${fmt(midA.minBal)}`);
console.log(`Caro:  end/start=${richA.endOverStart.toFixed(2)} min=${fmt(richA.minBal)} broke=${richA.brokeRound}`);
console.log(`Caixa baixo: end/start=${brokeA.endOverStart.toFixed(2)} min=${fmt(brokeA.minBal)} broke=${brokeA.brokeRound}`);

const tooRich = profiles.filter(p => p.endOverStart > 2.4 && !p.label.includes('caixa'));
const tooPoor = profiles.filter(p => p.brokeRound != null || (p.endOverStart < 0.45 && p.budgetRatio !== 0.35));
// fix: budgetRatio not on result - use label
const failedBroke = profiles.filter(p => p.brokeRound != null && !p.label.includes('caixa'));
const failedRich = profiles.filter(p => p.endOverStart > 2.4 && !p.label.includes('caixa'));
const failedPoorEnd = profiles.filter(
  p => p.label.includes('médio') && p.endOverStart < 0.55,
);

console.log('\n=== Resumo ===\n');
console.log(`Perfis ricos demais (end>2.4×): ${failedRich.length ? failedRich.map(p => p.label).join(', ') : 'nenhum'}`);
console.log(`Médios pobres demais (end<0.55×): ${failedPoorEnd.length ? failedPoorEnd.map(p => p.label).join(', ') : 'nenhum'}`);
console.log(`Faliu mid-season (não era caixa baixo): ${failedBroke.length ? failedBroke.map(p => p.label).join(', ') : 'nenhum'}`);

// Export hints for tuning
const netPerRoundA = (midA.income - midA.costs) / midA.rounds;
console.log(`\nSérie A médio: saldo líquido/rodada ≈ ${fmt(netPerRoundA)}`);
console.log(
  `Receitas/rodada ≈ ${fmt(midA.income / midA.rounds)} | Custos/rodada ≈ ${fmt(midA.costs / midA.rounds)}`,
);
console.log(
  `TV faixa A: ${TV_VALUE_BY_DIVISION.A.map(fmt).join(' – ')} | Patrocínio master A: ${SPONSOR_VALUE_BY_DIVISION.A.master.map(fmt).join(' – ')}`,
);
