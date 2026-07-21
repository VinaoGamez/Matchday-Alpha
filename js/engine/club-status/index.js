import { MODULE_VERSIONS } from '../../core/constants.js';
import {
  initialBudget,
  estimateRoundCostBill,
  bankLoanBalance,
  getBankLoan,
} from '../economy.js';
import { STATUS_MAX, STATUS_MIN } from './constants.js';
import * as environmentRules from './rules/environment.js';
import * as supportRules from './rules/support.js';
import * as boardRules from './rules/board.js';
import { resolveFinanceMood } from './rules/finance-mood.js';
import { syncFromBudget as syncFinancesRule } from './rules/finances.js';

/**
 * Orquestrador dos indicadores institucionais.
 * Regras puras por indicador em ./rules — aqui só agrega, clampeia e persiste.
 */
export function createClubStatusEngine(deps) {
  const { clamp, getClubs, getUserClub, getUserDivision, getBalance, persistCareerStatus, onStatusChanged } = deps;

  const clampStatus = value => clamp(Math.round(Number(value) || 0), STATUS_MIN, STATUS_MAX);

  const applyDeltas = (club, deltas = {}) => {
    if (!club) return null;
    if (deltas.environment != null) club.environment = clampStatus(club.environment + deltas.environment);
    if (deltas.support != null) club.support = clampStatus(club.support + deltas.support);
    if (deltas.board != null) club.board = clampStatus(club.board + deltas.board);
    if (deltas.finances != null) club.finances = clampStatus(club.finances + deltas.finances);
    return {
      environment: club.environment,
      support: club.support,
      board: club.board,
      finances: club.finances,
    };
  };

  const syncFinancesFromBudget = (club, division = club?.division) => {
    if (!club) return;
    const div = division || club.division || 'A';
    const baseline = initialBudget(div) || 1;
    const cash = typeof getBalance === 'function' ? getBalance(club) : Number(club.budget) || 0;
    // Dívida bancária pressiona a saúde financeira (caixa líquido; pode ficar negativo).
    const debt = bankLoanBalance(club);
    const balance = cash - Math.round(debt * 0.65);
    const wageBill = estimateRoundCostBill(club, div, {
      managerReputation: club.managerReputation,
    });
    syncFinancesRule(club, {
      balance,
      baseline,
      wageBill,
      shortfall:
        !!club.wageShortfall ||
        !!club.loanServiceShortfall ||
        !!club.overdraftActive ||
        cash < 0,
      clamp,
      clampStatus,
    });
  };

  const matchCtx = (ctx = {}) => ({
    result: ctx.result,
    isHome: !!ctx.isHome,
    goalDiff: ctx.goalDiff,
    fillRate: ctx.fillRate,
    positionGap: Number.isFinite(Number(ctx.positionGap)) ? Number(ctx.positionGap) : null,
    clamp,
  });

  const clubTablePosition = club => {
    const pos = Number(club?.position);
    return Number.isFinite(pos) && pos > 0 ? pos : null;
  };

  const applyMatchResultImpact = (club, ctx = {}) => {
    if (!club || !ctx.result) return;
    const args = {
      ...matchCtx(ctx),
      finances: Number.isFinite(Number(club.finances)) ? Number(club.finances) : null,
    };
    applyDeltas(club, {
      environment: environmentRules.matchDelta(args),
      support: supportRules.matchDelta(args),
      board: boardRules.matchDelta(args),
    });
  };

  const applyTablePressure = (club, standing = {}) => {
    if (!club || !standing.played || standing.played < 1 || !standing.position || !standing.clubsCount) return;
    const args = {
      ...standing,
      clamp,
      finances: Number.isFinite(Number(club.finances)) ? Number(club.finances) : null,
    };
    applyDeltas(club, {
      environment: environmentRules.tableDelta(args),
      support: supportRules.tableDelta(args),
      board: boardRules.tableDelta(args),
    });
  };

  const applyUserDrift = club => {
    if (!club) return;
    applyDeltas(club, {
      environment: environmentRules.driftDelta(club.environment),
      support: supportRules.driftDelta(club.support),
      board: boardRules.driftDelta(club.board),
    });
  };

  const snapshotUserStatus = () => {
    const club = getClubs()?.[getUserClub()];
    if (!club) return null;
    return {
      environment: club.environment,
      support: club.support,
      board: club.board,
      finances: club.finances,
      budget: typeof getBalance === 'function' ? getBalance(club) : club.budget,
    };
  };

  const persistAndNotify = () => {
    persistCareerStatus?.(snapshotUserStatus());
    onStatusChanged?.();
  };

  const applyRoundImpacts = (games = [], { userStanding, fillRateByUserMatch } = {}) => {
    const clubs = getClubs();
    const userClub = getUserClub();
    games.forEach(game => {
      if (!game || game.homeGoals == null || game.awayGoals == null) return;
      const home = clubs[game.home];
      const away = clubs[game.away];
      const homeResult = game.homeGoals > game.awayGoals ? 'W' : game.homeGoals < game.awayGoals ? 'L' : 'D';
      const awayResult = homeResult === 'W' ? 'L' : homeResult === 'L' ? 'W' : 'D';
      const gd = game.homeGoals - game.awayGoals;
      const userInvolved = game.home === userClub || game.away === userClub;
      const fill = userInvolved ? fillRateByUserMatch ?? game.fillRate ?? null : null;
      const homePos = clubTablePosition(home);
      const awayPos = clubTablePosition(away);
      const homeGap = homePos != null && awayPos != null ? awayPos - homePos : null;
      const awayGap = homePos != null && awayPos != null ? homePos - awayPos : null;
      if (home) {
        applyMatchResultImpact(home, {
          result: homeResult,
          isHome: true,
          goalDiff: gd,
          fillRate: game.home === userClub ? fill : null,
          positionGap: homeGap,
        });
      }
      if (away) {
        applyMatchResultImpact(away, {
          result: awayResult,
          isHome: false,
          goalDiff: -gd,
          fillRate: game.away === userClub ? fill : null,
          positionGap: awayGap,
        });
      }
    });

    const user = clubs[userClub];
    if (user) {
      if (userStanding) applyTablePressure(user, userStanding);
      applyUserDrift(user);
      const division = getUserDivision?.() || user.division;
      syncFinancesFromBudget(user, division);
      const balance = typeof getBalance === 'function' ? getBalance(user) : Number(user.budget) || 0;
      const wageBill = estimateRoundCostBill(user, division, {
        managerReputation: user.managerReputation,
      });
      const overdrawn = balance < 0;
      const runwayRounds = overdrawn ? -1 : wageBill > 0 ? balance / wageBill : 99;
      const overdraftStreak = Math.max(0, Math.round(Number(user.overdraftStreak) || 0));
      const loan = getBankLoan(user);
      const mood = resolveFinanceMood({
        delinquencyStreak: loan?.delinquencyStreak || 0,
        overdraftStreak,
        wageShortfall: !!user.wageShortfall,
        restricted: !!user.financialRestriction?.active,
        wasInCrisis: !!user.financeMoodInCrisis,
        reliefRoundsRemaining: user.financeMoodReliefRounds || 0,
      });
      user.financeMoodInCrisis = mood.inCrisis;
      user.financeMoodReliefRounds = mood.reliefRoundsRemaining;
      applyDeltas(user, {
        board:
          boardRules.financePressureDelta({
            finances: user.finances,
            runwayRounds,
            shortfall: !!user.wageShortfall || overdrawn || !!user.overdraftActive,
            overdraftStreak,
            clamp,
          }) +
          boardRules.financeGapCeilingDelta({
            board: user.board,
            finances: user.finances,
            clamp,
          }),
        support: mood.support,
        environment: mood.environment,
      });
      persistAndNotify();
    }
  };

  return {
    moduleVersion: MODULE_VERSIONS.clubStatus,
    applyDeltas,
    applyMatchResultImpact,
    applyTablePressure,
    syncFinancesFromBudget,
    applyRoundImpacts,
    snapshotUserStatus,
    STATUS_MIN,
    STATUS_MAX,
  };
}

export {
  STATUS_MIN,
  STATUS_MAX,
  NEUTRAL,
  DRIFT_RATE,
  ENVIRONMENT_DRIFT_RATE,
  SUPPORT_DRIFT_RATE,
  BOARD_DRIFT_RATE,
  DRAW_POSITION_GAP,
} from './constants.js';
