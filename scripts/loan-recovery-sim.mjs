/**
 * Colapso + recuperação: começa a pagar após N atrasos / N rodadas no vermelho.
 * node scripts/loan-recovery-sim.mjs
 */
import {
  initialBudget,
  ensureStadium,
  assignSponsors,
  assignTvRights,
  creditSponsorInstallment,
  creditHomeTv,
  chargeRoundCosts,
  estimateGateReceipt,
  getBalance,
  spend,
  tvHomeSlots,
  serviceOverdraft,
  estimateRoundCostBill,
} from '../js/engine/economy.js';
import {
  takeBankLoan,
  serviceBankLoan,
  payBankLoanMinimum,
  resolveBankCredit,
  bankLoanBalance,
  getBankLoan,
} from '../js/engine/bank-loan.js';
import { resolveClubBankruptcyRisk } from '../js/engine/club-solvency.js';
import { MANAGER_JOB_HONEYMOON_ROUNDS } from '../js/engine/manager-job.js';

const roster = () =>
  Array.from({ length: 22 }, (_, i) => ({
    name: `P${i + 1}`,
    overall: 76,
    age: 24,
    pos: 'MC',
    wage: null,
  }));

function makeClub(division) {
  const club = {
    name: 'Sim FC',
    division,
    roster: roster(),
    budget: initialBudget(division),
    environment: 70,
    support: 70,
    board: 72,
    finances: 75,
    managerReputation: 70,
  };
  ensureStadium(club, division);
  assignSponsors(club, {
    division,
    season: 2026,
    installments: 38,
    creditPackage: false,
    random: () => 0.45,
  });
  assignTvRights(club, {
    division,
    season: 2026,
    installments: tvHomeSlots(division),
    random: () => 0.45,
  });
  return club;
}

/**
 * rescue:
 *  - null | 'pay_always'
 *  - 'pay_after_delinq:N'
 *  - 'pay_after_red:N' (tenta pagar; falha se caixa insuficiente)
 *  - 'bailout_after_red:N' (aporte de caixa + paga mínimo)
 */
function run({ division = 'A', spendMode = 'loan', rescue = null, rounds = 40 } = {}) {
  const club = makeClub(division);
  const line = resolveBankCredit(club, { division });
  takeBankLoan(club, line.available, { division, season: 2026, round: 0 });
  const loan0 = line.available;
  if (spendMode === 'loan') {
    spend(club, Math.min(loan0, getBalance(club)), {
      reason: 'transfer',
      label: 'Gasta',
      allowNegative: false,
    });
  } else if (spendMode === 'all') {
    const burn = Math.max(0, getBalance(club));
    if (burn > 0) {
      spend(club, burn, { reason: 'transfer', label: 'Queima', allowNegative: false });
    }
  }

  let paying = rescue === 'pay_always';
  let firstWarn = null;
  let firstRed = null;
  let bankrupt = null;
  let reason = null;
  let startedPaying = null;
  let exitedRed = null;
  let clearedLoan = null;
  let payOk = 0;
  let payFail = 0;
  let bailoutTotal = 0;
  let debtWhenStarted = null;

  const tryPay = r => {
    const loan = getBankLoan(club);
    if (!loan) return;
    const due =
      (loan.minAmortDue || 0) + (loan.penaltyDue || 0) ||
      Math.max(1, Math.round((loan.balance || 0) * 0.055));
    if (
      typeof rescue === 'string' &&
      rescue.startsWith('bailout_after_red:') &&
      getBalance(club) < due
    ) {
      const need = due - getBalance(club) + 50_000;
      club.budget = (club.budget || 0) + need;
      bailoutTotal += need;
    }
    const res = payBankLoanMinimum(club, { division });
    if (res?.ok) {
      payOk += 1;
      if (startedPaying == null) {
        startedPaying = r;
        debtWhenStarted = bankLoanBalance(club);
      }
    } else {
      payFail += 1;
    }
  };

  for (let r = 1; r <= rounds; r += 1) {
    if (r % 2 === 1) {
      club.budget += estimateGateReceipt(club, { channel: 'national', division }).revenue;
      creditHomeTv(
        club,
        { home: club.name, away: `Opp ${r}`, round: r, competition: 'LEAGUE' },
        { division, season: 2026 },
      );
    }
    creditSponsorInstallment(club, { round: r, installments: 38 });
    chargeRoundCosts(club, {
      division,
      round: r,
      managerReputation: 70,
      managerId: 'sim',
      preferredDivision: division,
    });
    serviceBankLoan(club, { division, round: r, season: 2026 });

    const streak = getBankLoan(club)?.delinquencyStreak || 0;
    if (!paying && typeof rescue === 'string' && rescue.startsWith('pay_after_delinq:')) {
      const n = Number(rescue.split(':')[1]);
      if (streak >= n) paying = true;
    }

    if (paying) tryPay(r);

    serviceOverdraft(club, { division, round: r, season: 2026 });

    const od = club.overdraftStreak || 0;
    if (!paying && typeof rescue === 'string' && rescue.startsWith('pay_after_red:')) {
      const n = Number(rescue.split(':')[1]);
      if (od >= n) {
        paying = true;
        tryPay(r);
      }
    }
    if (!paying && typeof rescue === 'string' && rescue.startsWith('bailout_after_red:')) {
      const n = Number(rescue.split(':')[1]);
      if (od >= n) {
        paying = true;
        tryPay(r);
      }
    }

    const cash = getBalance(club);
    const debt = bankLoanBalance(club);
    const del = getBankLoan(club)?.delinquencyStreak || 0;
    if (cash < 0 && firstRed == null) firstRed = r;
    if (cash >= 0 && firstRed != null && exitedRed == null) exitedRed = r;
    if (!getBankLoan(club) && clearedLoan == null) clearedLoan = r;

    const solvency = resolveClubBankruptcyRisk({
      cash,
      roundCost: estimateRoundCostBill(club, division, { managerReputation: 70 }),
      overdraftStreak: club.overdraftStreak || 0,
      finances: Math.max(28, 75 - del * 3 - (cash < 0 ? 20 : 0)),
      loanBalance: debt,
      delinquencyStreak: del,
      loanServiceShortfall: !!club.loanServiceShortfall,
      played: MANAGER_JOB_HONEYMOON_ROUNDS + r,
    });
    if (solvency.status === 'warn_insolvent' && firstWarn == null) firstWarn = r;
    if (solvency.status === 'bankrupt' && bankrupt == null) {
      bankrupt = r;
      reason = solvency.reason;
      break;
    }
  }

  const endDebt = bankLoanBalance(club);
  const endCash = getBalance(club);
  let outcome = 'APERTADO';
  if (bankrupt) outcome = 'QUEBRA';
  else if (clearedLoan) outcome = 'QUITOU';
  else if (exitedRed && endDebt < loan0) outcome = 'RECUPEROU';
  else if (exitedRed) outcome = 'SAIU_VERMELHO';
  else if (payOk > 0 && debtWhenStarted != null && endDebt < debtWhenStarted) {
    outcome = 'DIVIDA_CAINDO';
  } else if (payFail > 0 && payOk === 0) outcome = 'NAO_CONSEGUE_PAGAR';

  return {
    division,
    spendMode,
    rescue,
    loan0,
    firstWarn,
    firstRed,
    startedPaying,
    exitedRed,
    clearedLoan,
    bankrupt,
    reason,
    gap: firstRed != null && bankrupt != null ? bankrupt - firstRed : null,
    payOk,
    payFail,
    bailoutTotal,
    debtWhenStarted,
    endDebt,
    endCash,
    outcome,
  };
}

const collapse = [];
for (const div of ['A', 'B', 'C', 'D']) {
  for (const [label, rescue, spendMode] of [
    ['paga_sempre', 'pay_always', 'loan'],
    ['gasta_ignora', null, 'loan'],
    ['guarda_ignora', null, 'keep'],
    ['queima_ignora', null, 'all'],
  ]) {
    collapse.push({ div, label, ...run({ division: div, spendMode, rescue }) });
  }
}

console.log('=== COLAPSO (16 cenários) ===');
console.log(`quebras: ${collapse.filter(c => c.bankrupt).length} / ${collapse.length}`);
console.log('div | cenário | aviso | vermelho | quebra | gap | outcome');
for (const c of collapse) {
  console.log(
    [
      c.div,
      c.label.padEnd(13),
      c.firstWarn ?? '—',
      c.firstRed ?? '—',
      c.bankrupt ?? '—',
      c.gap ?? '—',
      c.outcome,
    ].join(' | '),
  );
}

console.log('\n=== PAGAR NO VERMELHO SEM APORTE (caixa negativo bloqueia Escritório) ===');
console.log('div | quando | payOk | payFail | quebra | outcome');
for (const div of ['A', 'B', 'C', 'D']) {
  for (const n of [2, 3]) {
    const r = run({ division: div, spendMode: 'loan', rescue: `pay_after_red:${n}` });
    console.log(
      [
        div,
        `od>=${n}`,
        r.payOk,
        r.payFail,
        r.bankrupt ?? '—',
        r.outcome,
      ].join(' | '),
    );
  }
}

console.log('\n=== PAGAR ANTES DO VERMELHO (após N atrasos, ainda com caixa) ===');
console.log('div | após | começou | vermelho | quebra | outcome | dívida_ao_pagar | dívida_fim');
for (const div of ['A', 'B', 'C', 'D']) {
  for (const n of [2, 3, 4, 5, 6]) {
    const r = run({ division: div, spendMode: 'loan', rescue: `pay_after_delinq:${n}` });
    console.log(
      [
        div,
        `del>=${n}`,
        r.startedPaying ?? '—',
        r.firstRed ?? '—',
        r.bankrupt ?? '—',
        r.outcome,
        r.debtWhenStarted ?? '—',
        r.endDebt,
      ].join(' | '),
    );
  }
}

console.log('\n=== APORTE + PAGAR após N rodadas no vermelho (simula venda/injeção) ===');
console.log('div | quando | aporte | saiu_verm | quitou | quebra | outcome | dívida_fim');
for (const div of ['A', 'B', 'C', 'D']) {
  for (const n of [1, 2, 3]) {
    const r = run({
      division: div,
      spendMode: 'loan',
      rescue: `bailout_after_red:${n}`,
      rounds: 50,
    });
    console.log(
      [
        div,
        `od>=${n}`,
        Math.round(r.bailoutTotal / 1e6) + 'mi',
        r.exitedRed ?? '—',
        r.clearedLoan ?? '—',
        r.bankrupt ?? '—',
        r.outcome,
        Math.round(r.endDebt / 1e6) + 'mi',
      ].join(' | '),
    );
  }
}
