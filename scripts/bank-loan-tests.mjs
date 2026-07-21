/**
 * Empréstimo bancário híbrido — juros auto, mínimo no Escritório, atraso composto.
 * node scripts/bank-loan-tests.mjs
 */
import {
  BANK_LOAN_MIN_AMORT_RATIO,
  BANK_LOAN_MIN_FINANCES,
  BANK_LOAN_FORCE_COLLECT_STREAK,
  BANK_LOAN_LATE_FEE_RATIO,
  bankLoanStatus,
  bankCreditFactor,
  bankRateMultiplier,
  resolveBankCredit,
  takeBankLoan,
  repayBankLoan,
  payBankLoanMinimum,
  serviceBankLoan,
  getBankLoan,
  clearBankLoan,
  serializeBankLoan,
  applyBankLoanSnapshot,
  loanDelinquencyRateMult,
} from '../js/engine/bank-loan.js';
import { getBalance, ensureBudget } from '../js/engine/economy.js';

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

const player = (wage, overall = 14) => ({
  name: `J${Math.random().toString(36).slice(2, 6)}`,
  pos: 'MC',
  age: 24,
  overall,
  potential: 30,
  wage,
  starter: true,
});

const clubOf = ({
  division = 'C',
  budget = 500_000,
  finances = 80,
  wages = [8_000, 7_000, 6_000],
  sponsorsTotal = 1_200_000,
  tvTotal = 800_000,
  installments = 38,
  wageShortfall = false,
} = {}) => {
  const club = {
    name: 'Teste FC',
    division,
    budget,
    finances,
    wageShortfall,
    roster: wages.map(w => player(w)),
    sponsors: {
      season: 2027,
      division,
      master: { name: 'Master', role: 'master', value: Math.round(sponsorsTotal * 0.55) },
      secondaries: [
        { name: 'S1', role: 'secondary', value: Math.round(sponsorsTotal * 0.15) },
        { name: 'S2', role: 'secondary', value: Math.round(sponsorsTotal * 0.15) },
        { name: 'S3', role: 'secondary', value: Math.round(sponsorsTotal * 0.15) },
      ],
      total: sponsorsTotal,
      installments,
      paidAmount: 0,
      paidInstallments: 0,
    },
    tvRights: {
      season: 2027,
      division,
      total: tvTotal,
      installments,
      paidAmount: 0,
      paidInstallments: 0,
    },
  };
  ensureBudget(club, division);
  club.budget = budget;
  club.finances = finances;
  return club;
};

check('fator de crédito sobe com saúde financeira', () => {
  assert(bankCreditFactor(10) === 0, 'bloqueado');
  assert(bankCreditFactor(BANK_LOAN_MIN_FINANCES - 1) === 0, 'abaixo do mínimo');
  assert(bankCreditFactor(40) < bankCreditFactor(70), '40 < 70');
  assert(bankCreditFactor(90) === 1, 'prime');
  assert(bankRateMultiplier(90) < bankRateMultiplier(40), 'juros menores se saudável');
});

check('crédito cresce com receita e saúde — sem teto fixo de série', () => {
  const poor = resolveBankCredit(
    clubOf({
      division: 'D',
      budget: 80_000,
      finances: 40,
      sponsorsTotal: 400_000,
      tvTotal: 200_000,
      installments: 22,
      wages: [12_000, 11_000, 10_000, 9_000],
    }),
    { division: 'D' },
  );
  const rich = resolveBankCredit(
    clubOf({
      division: 'D',
      budget: 2_000_000,
      finances: 88,
      sponsorsTotal: 2_500_000,
      tvTotal: 1_800_000,
      installments: 22,
      wages: [4_000, 3_500, 3_000],
    }),
    { division: 'D' },
  );
  assert(poor.available > 0, `pobre tem linha ${poor.available}`);
  assert(rich.available > poor.available, `rico ${rich.available} > pobre ${poor.available}`);
});

check('folha pesada comprime crédito frente a receita igual', () => {
  const light = resolveBankCredit(
    clubOf({
      division: 'C',
      finances: 70,
      budget: 400_000,
      sponsorsTotal: 1_500_000,
      tvTotal: 900_000,
      wages: [3_000, 3_000, 3_000],
    }),
    { division: 'C' },
  );
  const heavy = resolveBankCredit(
    clubOf({
      division: 'C',
      finances: 70,
      budget: 400_000,
      sponsorsTotal: 1_500_000,
      tvTotal: 900_000,
      wages: [40_000, 38_000, 35_000, 30_000, 28_000],
    }),
    { division: 'C' },
  );
  assert(light.available > heavy.available, `leve ${light.available} > pesado ${heavy.available}`);
});

check('saúde crítica bloqueia crédito', () => {
  const club = clubOf({ finances: 15, budget: 1_000_000 });
  assert(takeBankLoan(club, 100_000, { division: 'C' }).reason === 'credit_denied', 'denied');
});

check('atraso de folha corta linha e encarece juros da oferta', () => {
  const ok = resolveBankCredit(clubOf({ finances: 70 }), { division: 'B' });
  const late = resolveBankCredit(clubOf({ finances: 70, wageShortfall: true }), { division: 'B' });
  assert(late.available < ok.available, 'linha menor');
  assert(late.rate > ok.rate, 'juros maiores');
});

check('contratar respeita o crédito calculado', () => {
  const club = clubOf({ division: 'D', finances: 55, budget: 200_000, installments: 22 });
  const credit = resolveBankCredit(club, { division: 'D' });
  assert(credit.available > 0, 'tem linha');
  assert(takeBankLoan(club, credit.available + 80_000, { division: 'D' }).reason === 'over_limit');
  const ok = takeBankLoan(club, credit.offers[0] || credit.available, { division: 'D' });
  assert(ok.ok, `ok ${ok.reason}`);
});

check('híbrido: juros auto sem amortizar o principal', () => {
  const club = clubOf({ division: 'B', budget: 3_000_000, finances: 85 });
  const principal = Math.min(1_000_000, resolveBankCredit(club, { division: 'B' }).available);
  assert(takeBankLoan(club, principal, { division: 'B', round: 1 }).ok, 'take');
  const cashBefore = getBalance(club);
  const result = serviceBankLoan(club, { division: 'B', round: 5, season: 2026 });
  assert(result.ok && !result.skipped, 'serviced');
  assert(result.interestPaid > 0, 'juros cobrados');
  assert(result.amortPaid === 0, 'sem amort automática');
  assert(getBankLoan(club).balance === principal, 'principal intacto');
  assert(getBankLoan(club).minAmortDue === Math.round(principal * BANK_LOAN_MIN_AMORT_RATIO), 'due');
  assert(getBalance(club) === cashBefore - result.interestPaid, 'só juros no caixa');
  assert(serviceBankLoan(club, { division: 'B', round: 5, season: 2026 }).skipped, 'idempotente');
});

check('pagar mínimo zera obrigação e evita atraso', () => {
  const club = clubOf({ division: 'B', budget: 3_000_000, finances: 85 });
  const principal = Math.min(800_000, resolveBankCredit(club, { division: 'B' }).available);
  takeBankLoan(club, principal, { division: 'B' });
  serviceBankLoan(club, { division: 'B', round: 1, season: 2026 });
  const due = getBankLoan(club).minAmortDue;
  assert(due > 0, 'due aberto');
  const paid = payBankLoanMinimum(club, { division: 'B' });
  assert(paid.ok, 'pay min');
  assert(getBankLoan(club).minAmortDue === 0, 'due zerado');
  assert(getBankLoan(club).delinquencyStreak === 0, 'sem atraso');
  const next = serviceBankLoan(club, { division: 'B', round: 2, season: 2026 });
  assert(next.capitalized === 0, 'sem capitalização');
  assert(getBankLoan(club).delinquencyStreak === 0, 'continua em dia');
});

check('atraso capitaliza juros + multa (compostos)', () => {
  assert(BANK_LOAN_LATE_FEE_RATIO === 0.28, 'late fee');
  assert(loanDelinquencyRateMult(1) === 1.35, 'mult 1');
  assert(loanDelinquencyRateMult(3) === 2.1, 'mult 3');
  const club = clubOf({ division: 'C', budget: 5_000_000, finances: 90 });
  const fee = Math.min(1_000_000, resolveBankCredit(club, { division: 'C' }).available);
  assert(fee >= 200_000, `linha ${fee}`);
  takeBankLoan(club, fee, { division: 'C' });
  serviceBankLoan(club, { division: 'C', round: 1, season: 2026 });
  const bal1 = getBankLoan(club).balance;
  // Ignora o mínimo → compostos (taxa 3×) + sangria no caixa; dívida SOBE
  const late = serviceBankLoan(club, { division: 'C', round: 2, season: 2026 });
  assert(late.capitalized > 0, `capitalized ${late.capitalized}`);
  assert(late.compoundApps === 3, `apps ${late.compoundApps}`);
  assert(late.lateFee > 0, 'multa');
  assert(late.forceCollected > 0, 'forçada no caixa');
  assert(getBankLoan(club).delinquencyStreak === 1, 'streak 1');
  assert(getBankLoan(club).balance > bal1, 'dívida subiu com compostos');
  assert(club.loanServiceShortfall === true, 'shortfall');
});

check('1ª rodada em atraso força cobrança no caixa', () => {
  assert(BANK_LOAN_FORCE_COLLECT_STREAK === 1, 'force at 1');
  const club = clubOf({ division: 'C', budget: 8_000_000, finances: 90 });
  const fee = Math.min(1_000_000, resolveBankCredit(club, { division: 'C' }).available);
  takeBankLoan(club, fee, { division: 'C' });
  serviceBankLoan(club, { division: 'C', round: 1, season: 2026 }); // abre minDue
  const cashBefore = getBalance(club);
  const forced = serviceBankLoan(club, { division: 'C', round: 2, season: 2026 }); // streak 1, força
  assert(forced.forceCollected > 0, `force ${forced.forceCollected}`);
  assert(getBalance(club) < cashBefore, 'caixa caiu na cobrança forçada');
  assert(getBankLoan(club).delinquencyStreak >= 1, 'streak alto');
});

check('amortização voluntária e quitação', () => {
  const club = clubOf({ division: 'A', budget: 12_000_000, finances: 90 });
  const fee = Math.min(2_000_000, resolveBankCredit(club, { division: 'A' }).available);
  assert(takeBankLoan(club, fee, { division: 'A' }).ok, 'take');
  const half = Math.round(fee / 2);
  const mid = repayBankLoan(club, half, { division: 'A' });
  assert(mid.ok && mid.remaining === fee - half, 'metade');
  const clear = repayBankLoan(club, fee, { division: 'A' });
  assert(clear.ok && clear.cleared, 'quitado');
  assert(!getBankLoan(club), 'sem contrato');
  clearBankLoan(club);
});

check('min amort ratio 5.5%', () => {
  assert(BANK_LOAN_MIN_AMORT_RATIO === 0.055, 'ratio');
  const club = clubOf({ budget: 8_000_000, finances: 90 });
  const fee = Math.min(1_000_000, resolveBankCredit(club, { division: 'C' }).available);
  takeBankLoan(club, fee, { division: 'C' });
  assert(
    bankLoanStatus(club, { division: 'C' }).minAmort === Math.round(fee * 0.055),
    'minAmort',
  );
});

check('juros sem caixa positivo aprofunda saldo negativo', () => {
  const club = clubOf({ budget: 0, finances: 90 });
  const fee = Math.min(500_000, resolveBankCredit(club, { division: 'C' }).available);
  takeBankLoan(club, fee, { division: 'C' });
  club.budget = 100;
  const result = serviceBankLoan(club, { division: 'C', round: 2, season: 2026 });
  assert(result.interestPaid > 100, 'juros debitados');
  assert(getBalance(club) < 0, `caixa negativo ${getBalance(club)}`);
  assert(club.loanServiceShortfall === true, 'flag');
});

check('regularizar atraso renegocia compostos para o principal', () => {
  const club = clubOf({ division: 'A', budget: 20_000_000, finances: 90 });
  const fee = Math.min(2_000_000, resolveBankCredit(club, { division: 'A' }).available);
  takeBankLoan(club, fee, { division: 'A' });
  serviceBankLoan(club, { division: 'A', round: 1, season: 2026 });
  serviceBankLoan(club, { division: 'A', round: 2, season: 2026 }); // atraso + compostos
  const swollen = getBankLoan(club).balance;
  assert(swollen > fee, `inchou ${swollen} > ${fee}`);
  assert(getBankLoan(club).delinquencyStreak >= 1, 'atraso');
  const paid = payBankLoanMinimum(club, { division: 'A' });
  assert(paid.ok, 'paga mínimo');
  const loan = getBankLoan(club);
  assert(loan.delinquencyStreak === 0, 'em dia');
  assert(loan.balance <= fee, `renegociou ${loan.balance} <= ${fee}`);
  assert((loan.rehabRoundsRemaining || 0) > 0, 'reabilitação');
});

check('snapshot persiste dívida e campos de atraso', () => {
  const club = clubOf({ division: 'B', budget: 4_000_000, finances: 85 });
  const fee = Math.min(800_000, resolveBankCredit(club, { division: 'B' }).available);
  takeBankLoan(club, fee, { division: 'B', season: 2026, round: 30 });
  serviceBankLoan(club, { division: 'B', round: 30, season: 2026 });
  const snap = serializeBankLoan(club);
  assert(snap.minAmortDue > 0, 'serialize due');
  const clone = clubOf({ division: 'B', budget: getBalance(club), finances: 85 });
  applyBankLoanSnapshot(clone, snap);
  assert(getBankLoan(clone)?.minAmortDue === snap.minAmortDue, 'restore due');
  assert(serviceBankLoan(clone, { division: 'B', round: 30, season: 2026 }).skipped, 'idempotente');
  // Nova temporada sem pagar → atraso
  const late = serviceBankLoan(clone, { division: 'B', round: 1, season: 2027 });
  assert(late.capitalized > 0, 'capitaliza na nova temporada se due pendente');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
