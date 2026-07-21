/**
 * Adiantamento de direitos de TV (deságio + 1× temporada + crisis gate).
 * node scripts/tv-advance-tests.mjs
 */
import {
  assignTvRights,
  estimateTvRemaining,
  estimateTvInstallment,
  creditTvInstallment,
  tvAdvanceStatus,
  advanceTvRights,
  TV_ADVANCE_HAIRCUT_BASE,
  TV_ADVANCE_HAIRCUT_RED,
  TV_ADVANCE_HAIRCUT_DELINQUENT,
  TV_ADVANCE_MIN_REMAINING,
  getBalance,
  ensureBudget,
} from '../js/engine/economy.js';
import { takeBankLoan } from '../js/engine/bank-loan.js';

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

const clubOf = ({
  division = 'C',
  budget = 200_000,
  tvTotal = 1_200_000,
  paidAmount = 0,
  paidInstallments = 0,
  warnedInsolvent = false,
  overdraftStreak = 0,
} = {}) => {
  const club = {
    name: 'Teste TV',
    division,
    budget,
    finances: 55,
    warnedInsolvent,
    overdraftStreak,
    roster: [],
    sponsors: {
      season: 2027,
      division,
      total: 900_000,
      installments: 38,
      paidAmount: 0,
      paidInstallments: 0,
      master: { name: 'M', role: 'master', value: 500_000 },
      secondaries: [],
    },
  };
  ensureBudget(club, division);
  assignTvRights(club, {
    division,
    season: 2027,
    installments: division === 'D' ? 11 : 19,
    random: () => 0.5,
  });
  club.tvRights.total = tvTotal;
  club.tvRights.paidAmount = paidAmount;
  club.tvRights.paidInstallments = paidInstallments;
  club.tvRights.credited = paidAmount >= tvTotal;
  return club;
};

check('remaining = total − paid', () => {
  const club = clubOf({ tvTotal: 1_000_000, paidAmount: 250_000, paidInstallments: 5 });
  assert(estimateTvRemaining(club) === 750_000, `got ${estimateTvRemaining(club)}`);
});

check('bloqueado sem crise', () => {
  const club = clubOf({ budget: 500_000 });
  const status = tvAdvanceStatus(club);
  assert(!status.eligible, 'should not be eligible');
  assert(status.reason === 'not_in_crisis', status.reason);
  const result = advanceTvRights(club);
  assert(!result.ok && result.reason === 'not_in_crisis');
});

check('libera no aviso de insolvência com deságio base', () => {
  const club = clubOf({ budget: 400_000, warnedInsolvent: true, tvTotal: 1_000_000 });
  const status = tvAdvanceStatus(club);
  assert(status.eligible, status.reason);
  assert(status.haircut === TV_ADVANCE_HAIRCUT_BASE, String(status.haircut));
  const before = getBalance(club);
  const result = advanceTvRights(club, { round: 8 });
  assert(result.ok, result.reason);
  assert(result.payout === Math.round(1_000_000 * (1 - TV_ADVANCE_HAIRCUT_BASE)));
  assert(getBalance(club) === before + result.payout);
  assert(club.tvRights.credited && club.tvRights.advanced);
  assert(estimateTvRemaining(club) === 0);
  assert(estimateTvInstallment(club) === 0);
});

check('caixa vermelho eleva deságio', () => {
  const club = clubOf({ budget: -100_000, tvTotal: 800_000 });
  const status = tvAdvanceStatus(club);
  assert(status.eligible);
  assert(status.haircut === TV_ADVANCE_HAIRCUT_RED, String(status.haircut));
});

check('atraso de empréstimo eleva deságio', () => {
  const club = clubOf({
    budget: 2_000_000,
    warnedInsolvent: true,
    tvTotal: 900_000,
    division: 'C',
  });
  club.finances = 70;
  const loan = takeBankLoan(club, 200_000, { division: 'C', season: 2027, round: 1 });
  assert(loan.ok, loan.reason);
  club.bankLoan.delinquencyStreak = 1;
  club.bankLoan.minAmortDue = 20_000;
  const status = tvAdvanceStatus(club);
  assert(status.haircut === TV_ADVANCE_HAIRCUT_DELINQUENT, String(status.haircut));
});

check('1× por temporada', () => {
  const club = clubOf({ budget: -50_000, tvTotal: 600_000 });
  const first = advanceTvRights(club);
  assert(first.ok, `first: ${first.reason}`);
  const again = advanceTvRights(club);
  assert(!again.ok, `second should fail, got ok=${again.ok}`);
  assert(again.reason === 'already_advanced', again.reason);
});

check('após adiantar, parcela por mando zera', () => {
  const club = clubOf({ budget: -10_000, tvTotal: 570_000, paidAmount: 0, paidInstallments: 0 });
  advanceTvRights(club);
  const credit = creditTvInstallment(club, {
    round: 12,
    homeGameKey: 'LEAGUE|12|Teste|Rival|',
    opponent: 'Rival',
    division: 'C',
  });
  assert(credit.amount === 0, `amount ${credit.amount}`);
  assert(credit.skipped || credit.complete);
});

check('saldo abaixo do mínimo bloqueia', () => {
  const club = clubOf({
    budget: -1,
    tvTotal: TV_ADVANCE_MIN_REMAINING - 1,
    paidAmount: 0,
  });
  const status = tvAdvanceStatus(club);
  assert(!status.eligible && status.reason === 'no_remaining', status.reason);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
