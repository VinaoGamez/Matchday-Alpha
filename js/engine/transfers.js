/**
 * Motor de transferências: compra/venda, empréstimos, janela CBF por data e aceite dinâmico.
 */

import { resolvePlayerId } from './player-identity.js';
import { ensureMarketFields, estimatePlayerValue, refreshMarketFields } from './player-value.js';
import {
  evaluateRosterPayroll,
  resolvePlayerRoundWage,
  ROSTER_HARD_MAX,
} from './economy.js';
import { evaluateLoanFit, loanAcceptChance } from './loan-fit.js';
import {
  computeLoanSalaryShare,
  previewLoanHostWage,
  loanOutPayrollDelta,
  resolveHostRoundWage,
  stampLoanSalaryShare,
  clearLoanSalaryShare,
} from './loan-salary-split.js';
import {
  evaluateSellerDivisionFit,
  evaluateBuyerOfferDivisionFit,
  sellerAcceptRatioDeltaForDivision,
  estimateSellDownBuyout,
  resolveSellDownBuyout,
} from './transfer-division-fit.js';
import { evaluateCounterOffer } from './transfer-counter-offer.js';
import {
  attachLoanBuyOption,
  clearLoanBuyOption,
  canExerciseLoanBuyOption,
  applyLoanBuyExercise,
} from './loan-buy-option.js';
import { isMarketBuyRestricted } from './club-solvency.js';
import { isPlayerSpecialist } from './player-generation.js';

export const TRANSFER_LIMITS = {
  minRoster: 18,
  /** Antifail — o gate real é folha vs receita (`evaluateRosterPayroll`). */
  maxRoster: ROSTER_HARD_MAX,
  acceptRatio: 0.85,
  /** Empréstimos ativos (entrada ou saída) por clube. */
  maxLoans: 3,
  minAcceptRatio: 0.7,
  maxAcceptRatio: 0.98,
  managerPullChance: 0.1,
  managerPullReputation: 70,
  managerPullDelta: -0.04,
  /** Rodadas até a proposta da IA expirar sem resposta (backup do expiry por dias). */
  offerExpiryRounds: 2,
  /** Dias de calendário até a proposta expirar. */
  offerExpiryDays: 4,
  /** Dias sem nova proposta no mesmo jogador após recusa. */
  offerRejectCooldownDays: 10,
  aiBuyDealsPerTick: 5,
  aiLoanDealsPerTick: 2,
  /** Máx. ofertas novas por tick quando a rolagem passa (alvo-meio). */
  userOffersPerTick: 1,
  /** Teto de propostas pendentes no inbox do usuário. */
  maxPendingUserOffers: 2,
  /**
   * Funil interesse→proposta (perfil alvo-meio).
   * week: 1 tick/semana · deadline: 1/dia · postRound: após rodada.
   */
  userOfferChanceWeek: 0.3,
  userOfferChanceDeadline: 0.14,
  userOfferChancePostRound: 0.16,
  /** Fração das ofertas geradas que tentam empréstimo. */
  loanOfferShare: 0.2,
};

const DIV_BUDGET_FALLBACK = { A: 40_000_000, B: 20_000_000, C: 10_000_000, D: 4_000_000 };

/**
 * Template estável inspirado na CBF/FIFA (mês 1–12).
 * 1ª janela: 1 jan – 3 mar (abre com a carreira) · 2ª: 20 jul – 11 set.
 * Última semana da janela = avanço diário (deadline), como no Career Mode.
 */
export const CBF_TRANSFER_WINDOWS = {
  first: { start: { month: 1, day: 1 }, end: { month: 3, day: 3 } },
  second: { start: { month: 7, day: 20 }, end: { month: 9, day: 11 } },
};

/** Dias restantes (0 = último dia) que disparam avanço diário estilo Deadline Day. */
export const TRANSFER_DEADLINE_WEEK_DAYS = 6;

const mdKey = (month, day) => month * 100 + day;

const toCareerDate = value => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

/** Faixas de janela CBF (aliases summer/winter para compat). */
export function getTransferWindowBounds() {
  return {
    first: CBF_TRANSFER_WINDOWS.first,
    second: CBF_TRANSFER_WINDOWS.second,
    summer: CBF_TRANSFER_WINDOWS.first,
    winter: CBF_TRANSFER_WINDOWS.second,
  };
}

export function isDateInTransferWindow(dateInput) {
  const date = toCareerDate(dateInput);
  if (!date) return false;
  const key = mdKey(date.getMonth() + 1, date.getDate());
  const { first, second } = CBF_TRANSFER_WINDOWS;
  const inRange = (start, end) =>
    key >= mdKey(start.month, start.day) && key <= mdKey(end.month, end.day);
  return inRange(first.start, first.end) || inRange(second.start, second.end);
}

/** Próxima abertura da janela (Date ao meio-dia local) ou null se já aberta. */
export function nextTransferWindowOpen(dateInput) {
  const date = toCareerDate(dateInput);
  if (!date) return null;
  if (isDateInTransferWindow(date)) return null;
  const year = date.getFullYear();
  const key = mdKey(date.getMonth() + 1, date.getDate());
  const firstStart = mdKey(CBF_TRANSFER_WINDOWS.first.start.month, CBF_TRANSFER_WINDOWS.first.start.day);
  const secondStart = mdKey(
    CBF_TRANSFER_WINDOWS.second.start.month,
    CBF_TRANSFER_WINDOWS.second.start.day,
  );
  const atNoon = (y, monthIndex, day) => {
    const next = new Date(y, monthIndex, day, 12, 0, 0, 0);
    return next;
  };
  if (key < firstStart) return atNoon(year, 0, CBF_TRANSFER_WINDOWS.first.start.day);
  if (key < secondStart) {
    return atNoon(
      year,
      CBF_TRANSFER_WINDOWS.second.start.month - 1,
      CBF_TRANSFER_WINDOWS.second.start.day,
    );
  }
  return atNoon(year + 1, 0, CBF_TRANSFER_WINDOWS.first.start.day);
}

export function formatTransferWindowDate(dateInput) {
  const date = toCareerDate(dateInput);
  if (!date) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const windowEndDateFor = (date, windowDef) =>
  new Date(date.getFullYear(), windowDef.end.month - 1, windowDef.end.day, 12, 0, 0, 0);

const activeWindowDef = date => {
  if (!isDateInTransferWindow(date)) return null;
  const key = mdKey(date.getMonth() + 1, date.getDate());
  const { first, second } = CBF_TRANSFER_WINDOWS;
  if (key >= mdKey(first.start.month, first.start.day) && key <= mdKey(first.end.month, first.end.day)) {
    return { key: 'first', def: first, label: 'Janela de verão' };
  }
  if (
    key >= mdKey(second.start.month, second.start.day) &&
    key <= mdKey(second.end.month, second.end.day)
  ) {
    return { key: 'second', def: second, label: 'Janela de inverno' };
  }
  return null;
};

/**
 * Fase da janela na data (para UX FIFA: semana vs Deadline Day).
 * @returns {{ active, mode: 'week'|'day'|null, daysLeft, endDate, windowKey, label, isDeadlineWeek, isDeadlineDay }}
 */
export function getTransferWindowPhase(dateInput) {
  const date = toCareerDate(dateInput);
  if (!date) {
    return {
      active: false,
      mode: null,
      daysLeft: null,
      endDate: null,
      windowKey: null,
      label: null,
      isDeadlineWeek: false,
      isDeadlineDay: false,
    };
  }
  const active = activeWindowDef(date);
  if (!active) {
    return {
      active: false,
      mode: null,
      daysLeft: null,
      endDate: null,
      windowKey: null,
      label: null,
      isDeadlineWeek: false,
      isDeadlineDay: false,
    };
  }
  const endDate = windowEndDateFor(date, active.def);
  const dayOnly = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysLeft = Math.max(0, Math.round((dayOnly(endDate) - dayOnly(date)) / 86400000));
  const isDeadlineWeek = daysLeft <= TRANSFER_DEADLINE_WEEK_DAYS;
  return {
    active: true,
    mode: isDeadlineWeek ? 'day' : 'week',
    daysLeft,
    endDate,
    windowKey: active.key,
    label: active.label,
    isDeadlineWeek,
    isDeadlineDay: daysLeft === 0,
  };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const formScore = form => {
  if (!Array.isArray(form) || !form.length) return 0.5;
  const slice = form.slice(-5);
  const pts = slice.reduce((sum, item) => sum + (item === 'W' ? 1 : item === 'D' ? 0.5 : 0), 0);
  return pts / slice.length;
};

const clubCash = club => {
  const budget = Number(club?.budget);
  if (Number.isFinite(budget) && budget > 0) return budget;
  return DIV_BUDGET_FALLBACK[club?.division] || 8_000_000;
};

const clearLoanOffer = player => {
  if (!player) return;
  player.loanListed = false;
};

const clearLoanState = player => {
  if (!player) return;
  player.onLoan = false;
  player.loanFrom = null;
  clearLoanSalaryShare(player);
  clearLoanOffer(player);
  clearLoanBuyOption(player);
};

const findPlayerInWorldLinear = (clubs, playerId) => {
  if (!playerId || !clubs) return null;
  for (const [clubName, club] of Object.entries(clubs)) {
    const roster = club?.roster;
    if (!Array.isArray(roster)) continue;
    const index = roster.findIndex(player => resolvePlayerId(player) === playerId);
    if (index >= 0) return { clubName, club, player: roster[index], index };
  }
  return null;
};

function buildPlayerWorldIndex(clubs) {
  const index = new Map();
  if (!clubs) return index;
  Object.entries(clubs).forEach(([clubName, club]) => {
    const roster = club?.roster;
    if (!Array.isArray(roster)) return;
    roster.forEach((player, rosterIndex) => {
      const id = resolvePlayerId(player);
      if (id) index.set(id, { clubName, club, player, index: rosterIndex });
    });
  });
  return index;
}

/**
 * @param {object} deps
 */
export function createTransfersEngine(deps) {
  const {
    getClubs,
    getUserClub,
    getCareerSeason,
    spend,
    credit,
    canAfford,
    onAfterTransfer,
    acceptRatio = TRANSFER_LIMITS.acceptRatio,
    minRoster = TRANSFER_LIMITS.minRoster,
    maxRoster = TRANSFER_LIMITS.maxRoster,
    maxLoans = TRANSFER_LIMITS.maxLoans,
    minAcceptRatio = TRANSFER_LIMITS.minAcceptRatio,
    maxAcceptRatio = TRANSFER_LIMITS.maxAcceptRatio,
    offerExpiryRounds = TRANSFER_LIMITS.offerExpiryRounds,
    offerExpiryDays = TRANSFER_LIMITS.offerExpiryDays,
    offerRejectCooldownDays = TRANSFER_LIMITS.offerRejectCooldownDays,
    aiBuyDealsPerTick = TRANSFER_LIMITS.aiBuyDealsPerTick,
    aiLoanDealsPerTick = TRANSFER_LIMITS.aiLoanDealsPerTick,
    userOffersPerTick = TRANSFER_LIMITS.userOffersPerTick,
    maxPendingUserOffers = TRANSFER_LIMITS.maxPendingUserOffers,
    userOfferChanceWeek = TRANSFER_LIMITS.userOfferChanceWeek,
    userOfferChanceDeadline = TRANSFER_LIMITS.userOfferChanceDeadline,
    userOfferChancePostRound = TRANSFER_LIMITS.userOfferChancePostRound,
    loanOfferShare = TRANSFER_LIMITS.loanOfferShare,
  } = deps;

  let pendingOffers = Array.isArray(deps.initialPendingOffers)
    ? deps.initialPendingOffers.map(item => ({ ...item }))
    : [];
  let offerSeq = pendingOffers.length;
  let seasonDealLog = Array.isArray(deps.initialSeasonDeals)
    ? deps.initialSeasonDeals.map(item => ({ ...item }))
    : [];
  let playerWorldIndex = null;
  const invalidatePlayerWorldIndex = () => {
    playerWorldIndex = null;
  };
  const findPlayerInWorld = playerId => {
    if (!playerId) return null;
    const clubs = getClubs();
    if (!clubs) return null;
    if (!playerWorldIndex) playerWorldIndex = buildPlayerWorldIndex(clubs);
    const hit = playerWorldIndex.get(playerId);
    if (hit?.player) return hit;
    const found = findPlayerInWorldLinear(clubs, playerId);
    if (found && playerWorldIndex) playerWorldIndex.set(playerId, found);
    return found;
  };
  /** @type {Map<string, string>} playerId → dayKey até quando está em cooldown */
  const rejectCooldownUntil = new Map(
    Array.isArray(deps.initialOfferCooldowns)
      ? deps.initialOfferCooldowns.map(([id, key]) => [id, key])
      : [],
  );

  const DIV_RANK = { A: 4, B: 3, C: 2, D: 1 };
  const addCareerDays = (date, days) => {
    const d = toCareerDate(date) || careerDate();
    if (!d) return null;
    const next = new Date(d);
    next.setDate(next.getDate() + days);
    next.setHours(12, 0, 0, 0);
    return next;
  };
  const offerChanceForTick = tickKind => {
    if (tickKind === 'deadline') return userOfferChanceDeadline;
    if (tickKind === 'postRound') return userOfferChancePostRound;
    return userOfferChanceWeek;
  };
  const playerOnOfferCooldown = playerId => {
    if (!playerId) return false;
    const until = rejectCooldownUntil.get(playerId);
    if (!until) return false;
    const today = careerDayKey(careerDate());
    if (!today) return false;
    if (today <= until) return true;
    rejectCooldownUntil.delete(playerId);
    return false;
  };

  const payrollContext = () => ({
    clubName: getUserClub?.() || null,
    clubs: getClubs?.() || null,
  });

  const payrollExpand = (club, player, ownerClub = null) => {
    const division = club?.division || 'A';
    const fullWage = resolvePlayerRoundWage(player, division);
    let extraWage = fullWage;
    if (ownerClub) {
      extraWage = Math.round(fullWage * computeLoanSalaryShare(player, ownerClub, club));
    } else if (player?.onLoan) {
      extraWage = resolveHostRoundWage(player, division, resolvePlayerRoundWage);
    }
    return evaluateRosterPayroll(club, {
      division,
      extraWage,
      rosterDelta: 1,
      ...payrollContext(),
    });
  };
  const payrollShrink = (club, player, { loanOut = false, ownerClub = null, hostClub = null } = {}) => {
    const division = club?.division || 'A';
    const fullWage = resolvePlayerRoundWage(player, division);
    let removeWage = fullWage;
    if (loanOut && ownerClub && hostClub) {
      removeWage = loanOutPayrollDelta(player, ownerClub, hostClub, resolvePlayerRoundWage).netRemoveWage;
    } else if (player?.onLoan) {
      removeWage = resolveHostRoundWage(player, division, resolvePlayerRoundWage);
    }
    return evaluateRosterPayroll(club, {
      division,
      removeWage,
      rosterDelta: -1,
      ...payrollContext(),
    });
  };
  const clubCanHostPlayer = (club, player) =>
    !!club && Array.isArray(club.roster) && payrollExpand(club, player).ok;

  /** Taxa fixa da opção de compra — anexada no ato do empréstimo. */
  const stampLoanBuyOption = (moved, ownerClub, playerId) => {
    if (!moved) return null;
    const division = ownerClub?.division || 'C';
    const value =
      Number(moved.marketValue) || estimatePlayerValue(moved, division);
    return attachLoanBuyOption(moved, {
      marketValue: value,
      division,
      season: getCareerSeason(),
      random: () => unitRoll(`loan-buy-fee:${playerId}:${getCareerSeason()}`),
    });
  };

  /** Saves antigos: empréstimo sem opção → anexa na leitura. */
  const ensureLoanBuyOption = (player, ownerDivision = 'C') => {
    if (!player?.onLoan) return null;
    if (player.loanBuyOption && Number(player.loanBuyOption.fee) > 0) {
      return player.loanBuyOption;
    }
    const id = resolvePlayerId(player);
    return stampLoanBuyOption(player, { division: ownerDivision }, id || player.name);
  };

  const careerDayKey = date => {
    const d = toCareerDate(date);
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const recordSeasonDeal = deal => {
    if (!deal?.player) return;
    const fee = Math.round(Number(deal?.fee) || 0);
    const type = deal.type || 'buy';
    // Compras (fee>0) e movimentos sem taxa (empréstimo / observação) alimentam a agenda do calendário.
    if (!(fee > 0) && type !== 'ai_loan' && type !== 'loan' && type !== 'watch') return;
    seasonDealLog.push({
      playerName: deal.player?.name || deal.playerName || '—',
      playerId: deal.player ? resolvePlayerId(deal.player) : deal.playerId || null,
      from: deal.from || null,
      to: deal.to || null,
      fee,
      type,
      at: careerDate()?.toISOString?.() || new Date().toISOString(),
      round: currentRound(),
    });
  };

  const snapshotSeasonDeals = () => seasonDealLog.map(item => ({ ...item }));
  const hydrateSeasonDeals = list => {
    seasonDealLog = Array.isArray(list) ? list.map(item => ({ ...item })) : [];
  };
  const clearSeasonDeals = () => {
    seasonDealLog = [];
  };

  /**
   * Resumo do mercado na data do calendário (janela, negócios, interesses, observações).
   * Jogadores livres: stub — mecânica futura após validar o mercado.
   */
  const getMarketDayBrief = dateInput => {
    const date = toCareerDate(dateInput);
    const phase = getTransferWindowPhase(date);
    const key = careerDayKey(date);
    const dayEvents = seasonDealLog.filter(item => careerDayKey(item.at) === key);
    const deals = dayEvents.filter(item => Number(item.fee) > 0);
    const loans = dayEvents.filter(item => item.type === 'ai_loan' || item.type === 'loan');
    const watches = dayEvents.filter(item => item.type === 'watch');
    const interests = pendingOffers
      .filter(offer => offer.status === 'pending' && careerDayKey(offer.createdAt) === key)
      .map(offer => ({ ...offer }));
    let listedSample = [];
    if (phase.active) {
      try {
        listedSample = listBuyCandidates({ listedOnly: true, sortBy: 'ovr', sortDir: 'desc' })
          .slice(0, 4)
          .map(row => ({
            playerName: row.player?.name || '—',
            playerId: row.playerId,
            from: row.clubName,
            overall: Number(row.player?.overall) || 0,
            price: row.price,
          }));
      } catch {
        listedSample = [];
      }
    }
    return {
      phase,
      dateKey: key,
      deals,
      loans,
      watches,
      interests,
      listedSample,
      freeAgents: {
        /** Flag para a futura mecânica de jogadores livres no mercado. */
        enabled: false,
        comingSoon: true,
        players: [],
        note: 'Jogadores livres no mercado — mecânica futura, após validar compra/venda/empréstimo.',
      },
    };
  };

  const buildWindowClosingReport = ({ windowKey = null, label = null } = {}) => {
    const buys = seasonDealLog.filter(item => Number(item.fee) > 0);
    const biggest = buys.reduce(
      (best, item) => (!best || item.fee > best.fee ? item : best),
      null,
    );
    const totalFees = buys.reduce((sum, item) => sum + item.fee, 0);
    return {
      windowKey,
      label: label || 'Janela de transferências',
      dealCount: buys.length,
      totalFees,
      biggest,
      deals: buys.slice().sort((a, b) => b.fee - a.fee).slice(0, 8),
    };
  };

  const userClubState = () => {
    const name = getUserClub();
    return { name, club: getClubs()?.[name] || null };
  };

  const ensureAiCash = club => {
    if (!club) return 0;
    const bal = Number(club.budget);
    if (!Number.isFinite(bal) || bal <= 0) {
      club.budget = DIV_BUDGET_FALLBACK[club.division] || 8_000_000;
    }
    if (!Array.isArray(club.budgetLedger)) club.budgetLedger = [];
    return club.budget;
  };

  const hydratePendingOffers = list => {
    pendingOffers = Array.isArray(list) ? list.map(item => ({ ...item })) : [];
    offerSeq = pendingOffers.reduce((max, item) => {
      const n = Number(String(item.id || '').replace(/\D/g, '')) || 0;
      return Math.max(max, n);
    }, pendingOffers.length);
  };

  const snapshotPendingOffers = () => pendingOffers.map(item => ({ ...item }));

  const listPendingOffers = ({ status = 'pending' } = {}) =>
    pendingOffers.filter(item => (status ? item.status === status : true));

  const findPendingOffer = offerId => pendingOffers.find(item => item.id === offerId) || null;

  const nextOfferId = () => {
    offerSeq += 1;
    return `toff-${getCareerSeason()}-${offerSeq}`;
  };

  const seasonRounds = () =>
    typeof deps.getSeasonRoundCount === 'function'
      ? Math.max(6, Number(deps.getSeasonRoundCount()) || 38)
      : 38;

  const currentRound = () =>
    typeof deps.getCurrentRound === 'function' ? Math.max(1, Number(deps.getCurrentRound()) || 1) : 1;

  const careerDate = () => {
    if (typeof deps.getCareerDate !== 'function') return null;
    return toCareerDate(deps.getCareerDate());
  };

  const runtimeGateOpen = () =>
    typeof deps.isMarketOpen === 'function' ? !!deps.isMarketOpen() : true;

  const windowOpen = () => {
    if (typeof deps.getCareerDate !== 'function') return true;
    const date = careerDate();
    if (!date) return true;
    return isDateInTransferWindow(date);
  };

  const marketStatus = () => {
    const round = currentRound();
    const total = seasonRounds();
    const date = careerDate();
    const inWindow =
      typeof deps.getCareerDate !== 'function' || !date || isDateInTransferWindow(date);
    const runtimeOk = runtimeGateOpen();
    const open = runtimeOk && inWindow;
    let reason = null;
    if (!runtimeOk) reason = 'market_closed';
    else if (!inWindow) reason = 'window_closed';
    const nextOpen = inWindow || !date ? null : nextTransferWindowOpen(date);
    const bounds = getTransferWindowBounds();
    const phase = date ? getTransferWindowPhase(date) : null;
    return {
      open,
      reason,
      round,
      seasonRounds: total,
      careerDate: date,
      nextOpenDate: nextOpen,
      nextOpenLabel: nextOpen ? formatTransferWindowDate(nextOpen) : null,
      bounds,
      phase,
      label: open ? 'MERCADO ABERTO' : reason === 'window_closed' ? 'JANELA FECHADA' : 'MERCADO FECHADO',
    };
  };

  const marketOpen = () => marketStatus().open;

  const assertMarket = () => {
    const status = marketStatus();
    if (status.open) return { ok: true, status };
    return {
      ok: false,
      reason: status.reason || 'market_closed',
      nextOpenDate: status.nextOpenDate,
      nextOpenLabel: status.nextOpenLabel,
      status,
    };
  };

  /**
   * Carimbo da janela atual (`temporada:first|second`).
   * Fora da janela → null (assertMarket já bloqueia negócios).
   */
  const currentMoveStamp = () => {
    const phase = getTransferWindowPhase(careerDate());
    if (!phase?.active || !phase.windowKey) return null;
    return `${getCareerSeason()}:${phase.windowKey}`;
  };

  /** Já se movimentou (compra/venda/empréstimo) nesta janela? */
  const playerMovedThisWindow = player => {
    const stamp = currentMoveStamp();
    if (!stamp || !player) return false;
    return player.transferWindowLock === stamp;
  };

  const assertPlayerCanMove = player => {
    if (playerMovedThisWindow(player)) {
      return { ok: false, reason: 'already_moved' };
    }
    return { ok: true };
  };

  /** Marca envolvimento na janela atual (compra, venda ou início de empréstimo). */
  const markPlayerMoved = player => {
    const stamp = currentMoveStamp();
    if (stamp && player) player.transferWindowLock = stamp;
  };

  /** Jogadores no elenco que estão emprestados (entrada). */
  const countIncomingLoans = club => {
    if (!Array.isArray(club?.roster)) return 0;
    return club.roster.filter(player => player?.onLoan).length;
  };

  /** Jogadores do clube atualmente cedidos a rivais (saída). */
  const countOutgoingLoans = clubName => {
    if (!clubName) return 0;
    const clubs = getClubs() || {};
    let count = 0;
    Object.entries(clubs).forEach(([name, club]) => {
      if (name === clubName || !Array.isArray(club?.roster)) return;
      club.roster.forEach(player => {
        if (player?.onLoan && player.loanFrom === clubName) count += 1;
      });
    });
    return count;
  };

  const loanSlots = clubName => {
    const club = getClubs()?.[clubName];
    return {
      incoming: countIncomingLoans(club),
      outgoing: countOutgoingLoans(clubName),
      max: maxLoans,
    };
  };

  const hashRatio = id => {
    const text = String(id || '');
    let h = 0;
    for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return (h % 1000) / 1000;
  };

  /** Rolagem ~uniforme em [0,1) (FNV-1a). Usar no funil de ofertas — hashRatio %1000 enviesa strings parecidas. */
  const unitRoll = seed => {
    let h = 2166136261 >>> 0;
    const text = String(seed || '');
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
  };

  /**
   * Lista automaticamente parte dos elencos rivais (determinístico).
   * @returns {number} quantos jogadores passaram a listados
   */
  const seedAiListings = ({ ratio = 0.12, minListed = 24 } = {}) => {
    const clubs = getClubs() || {};
    const userName = getUserClub();
    let listedCount = 0;
    Object.entries(clubs).forEach(([clubName, club]) => {
      if (clubName === userName || !Array.isArray(club?.roster)) return;
      club.roster.forEach(player => {
        if (player.listed) listedCount += 1;
      });
    });
    if (listedCount >= minListed) return 0;

    let seeded = 0;
    Object.entries(clubs).forEach(([clubName, club]) => {
      if (clubName === userName || !Array.isArray(club?.roster)) return;
      // Clubes grandes listam um pouco menos; pequenos, um pouco mais.
      const divBoost = club.division === 'D' || club.division === 'C' ? 0.04 : 0;
      club.roster.forEach(player => {
        if (player.listed) return;
        ensureMarketFields(player, { division: club.division, season: getCareerSeason() });
        const id = resolvePlayerId(player);
        if (hashRatio(id) > ratio + divBoost) return;
        const value = Number(player.marketValue) || estimatePlayerValue(player, club.division);
        player.listed = true;
        player.askingPrice = Math.max(
          Math.round(value * 0.7),
          Math.round(value * (0.92 + hashRatio(`${id}:ask`) * 0.28)),
        );
        // Parte dos listados também fica disponível para empréstimo.
        if (hashRatio(`${id}:loan`) < 0.45) player.loanListed = true;
        seeded += 1;
        listedCount += 1;
      });
    });
    return seeded;
  };

  /**
   * Disponibiliza jogadores só para empréstimo (quando ainda faltam ofertas).
   */
  const seedAiLoanListings = ({ ratio = 0.06, minLoanListed = 16 } = {}) => {
    const clubs = getClubs() || {};
    const userName = getUserClub();
    let loanCount = 0;
    Object.entries(clubs).forEach(([clubName, club]) => {
      if (clubName === userName || !Array.isArray(club?.roster)) return;
      club.roster.forEach(player => {
        if (player.loanListed && !player.onLoan) loanCount += 1;
      });
    });
    if (loanCount >= minLoanListed) return 0;

    let seeded = 0;
    Object.entries(clubs).forEach(([clubName, club]) => {
      if (clubName === userName || !Array.isArray(club?.roster)) return;
      if (countOutgoingLoans(clubName) >= maxLoans) return;
      club.roster.forEach(player => {
        if (player.onLoan || player.loanListed) return;
        ensureMarketFields(player, { division: club.division, season: getCareerSeason() });
        const id = resolvePlayerId(player);
        if (hashRatio(`${id}:loanOnly`) > ratio) return;
        player.loanListed = true;
        seeded += 1;
        loanCount += 1;
      });
    });
    return seeded;
  };

  const listBuyCandidates = (filters = {}) => {
    const { name: userName, club: userClub } = userClubState();
    const clubs = getClubs() || {};
    const pos = filters.pos || null;
    const division = filters.division || null;
    const minOvr = Number(filters.minOvr);
    const maxOvr = Number(filters.maxOvr);
    const minAge = Number(filters.minAge);
    const maxAge = Number(filters.maxAge);
    const maxPrice = Number(filters.maxPrice);
    const maxWage = Number(filters.maxWage);
    const query = String(filters.query || '')
      .trim()
      .toLocaleLowerCase('pt-BR');
    const listedOnly = filters.listedOnly === true;
    const loanOnly = filters.loanOnly === true;
    const specialistOnly = filters.specialistOnly === true;
    let sortBy = String(filters.sortBy || 'ovr').toLowerCase();
    // Compat: chaves antigas com direção embutida
    let sortDir = String(filters.sortDir || '').toLowerCase();
    if (sortBy === 'price-desc' || sortBy === 'age-desc') {
      sortDir = 'desc';
      sortBy = sortBy.replace(/-desc$/, '');
    } else if (sortBy === 'price' || sortBy === 'passe' || sortBy === 'age' || sortBy === 'wage') {
      if (!sortDir) sortDir = 'asc';
    }
    if (sortDir !== 'asc' && sortDir !== 'desc') {
      sortDir = sortBy === 'ovr' || sortBy === 'listed' ? 'desc' : 'asc';
    }
    const dir = sortDir === 'asc' ? 1 : -1;

    const rows = [];
    Object.entries(clubs).forEach(([clubName, club]) => {
      if (clubName === userName || !Array.isArray(club?.roster)) return;
      if (division && club.division !== division) return;
      club.roster.forEach(player => {
        ensureMarketFields(player, {
          division: club.division,
          season: getCareerSeason(),
        });
        if (player.onLoan) return;
        if (player.nationalTeamOnly) return;
        if (playerMovedThisWindow(player)) return;
        if (listedOnly && !player.listed) return;
        if (loanOnly && !player.loanListed) return;
        if (specialistOnly && !isPlayerSpecialist(player)) return;
        if (pos && player.pos !== pos) return;
        const ovr = Number(player.overall) || 0;
        const age = Number(player.age) || 0;
        if (Number.isFinite(minOvr) && minOvr > 0 && ovr < minOvr) return;
        if (Number.isFinite(maxOvr) && maxOvr > 0 && ovr > maxOvr) return;
        if (Number.isFinite(minAge) && minAge > 0 && age < minAge) return;
        if (Number.isFinite(maxAge) && maxAge > 0 && age > maxAge) return;
        if (
          query &&
          !String(player.name || '').toLocaleLowerCase('pt-BR').includes(query) &&
          !String(clubName).toLocaleLowerCase('pt-BR').includes(query)
        ) {
          return;
        }
        const value = Number(player.marketValue) || estimatePlayerValue(player, club.division);
        const price = player.listed && player.askingPrice > 0 ? Number(player.askingPrice) : value;
        const wage = Number(player.wage) || resolvePlayerRoundWage(player, club.division);
        let loanHostWage = null;
        let loanHostSharePct = null;
        if (player.loanListed && userClub) {
          const split = previewLoanHostWage(player, club, userClub, resolvePlayerRoundWage);
          loanHostWage = split.hostWage;
          loanHostSharePct = split.hostSharePct;
        }
        const wageForFilter = loanHostWage != null ? loanHostWage : wage;
        if (Number.isFinite(maxPrice) && maxPrice > 0 && price > maxPrice) return;
        if (Number.isFinite(maxWage) && maxWage > 0 && wageForFilter > maxWage) return;
        rows.push({
          playerId: resolvePlayerId(player),
          player,
          clubName,
          division: club.division,
          value,
          price,
          wage,
          loanHostWage,
          loanHostSharePct,
          age,
          overall: ovr,
          loanListed: !!player.loanListed,
          listed: !!player.listed,
        });
      });
    });

    const byName = (a, b) =>
      String(a.player.name || '').localeCompare(String(b.player.name || ''), 'pt-BR');
    const footRank = player => {
      const posKey = String(player?.pos || '').toUpperCase();
      if (posKey === 'PE') return 0;
      if (posKey === 'PD') return 2;
      return 1;
    };
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'price' || sortBy === 'passe') cmp = a.price - b.price;
      else if (sortBy === 'age') cmp = a.age - b.age;
      else if (sortBy === 'name') cmp = byName(a, b);
      else if (sortBy === 'wage') cmp = a.wage - b.wage;
      else if (sortBy === 'club') {
        cmp = String(a.clubName || '').localeCompare(String(b.clubName || ''), 'pt-BR');
      } else if (sortBy === 'pos') {
        cmp = String(a.player.pos || '').localeCompare(String(b.player.pos || ''), 'pt-BR');
      } else if (sortBy === 'listed') {
        cmp = Number(!!a.player.listed) - Number(!!b.player.listed);
      } else if (sortBy === 'foot') {
        cmp = footRank(a.player) - footRank(b.player);
      } else {
        // ovr (default)
        cmp = a.overall - b.overall;
      }
      if (cmp) return cmp * dir;
      if (sortBy !== 'ovr') {
        const ovrCmp = b.overall - a.overall;
        if (ovrCmp) return ovrCmp;
      }
      return byName(a, b);
    });
    return rows;
  };

  const listSellCandidates = () => {
    const { name, club } = userClubState();
    if (!club?.roster) return [];
    const season = getCareerSeason();
    const slots = loanSlots(name);
    const rows = club.roster.map(player => {
      ensureMarketFields(player, {
        division: club.division,
        season,
      });
      if (player.onLoan) {
        const ownerDiv = getClubs()?.[player.loanFrom]?.division || club.division;
        ensureLoanBuyOption(player, ownerDiv);
      }
      return {
        playerId: resolvePlayerId(player),
        player,
        isStarter: club.roster.indexOf(player) < 11,
        value: Number(player.marketValue) || estimatePlayerValue(player, club.division),
        listed: !!player.listed,
        loanListed: !!player.loanListed,
        onLoan: !!player.onLoan,
        loanOut: false,
        loanFrom: player.loanFrom || null,
        loanTo: null,
        loanBuyFee: player.loanBuyOption?.fee || null,
        loanHostSharePct: player.onLoan
          ? Math.round((Number(player.loanSalaryShare) || 1) * 100)
          : null,
        loanOwnerSharePct: player.onLoan
          ? Math.round((1 - (Number(player.loanSalaryShare) || 1)) * 100)
          : null,
        askingPrice: player.askingPrice,
        outgoingSlots: slots,
        windowLocked: playerMovedThisWindow(player),
      };
    });
    // Cedidos: ainda aparecem na lista do dono, com clube hospedeiro.
    Object.entries(getClubs() || {}).forEach(([hostName, hostClub]) => {
      if (hostName === name || !Array.isArray(hostClub?.roster)) return;
      hostClub.roster.forEach(player => {
        if (!(player?.onLoan && player.loanFrom === name)) return;
        ensureMarketFields(player, {
          division: hostClub.division,
          season,
        });
        ensureLoanBuyOption(player, club.division);
        rows.push({
          playerId: resolvePlayerId(player),
          player,
          isStarter: false,
          value: Number(player.marketValue) || estimatePlayerValue(player, club.division),
          listed: false,
          loanListed: false,
          onLoan: false,
          loanOut: true,
          loanFrom: name,
          loanTo: hostName,
          loanBuyFee: player.loanBuyOption?.fee || null,
          loanOwnerSharePct: Math.round((1 - (Number(player.loanSalaryShare) || 1)) * 100),
          askingPrice: null,
          outgoingSlots: slots,
          windowLocked: playerMovedThisWindow(player),
        });
      });
    });
    return rows;
  };

  const setListed = (playerId, listed, askingPrice = null) => {
    const { club } = userClubState();
    if (!club) return { ok: false, reason: 'no_club' };
    const player = club.roster.find(item => resolvePlayerId(item) === playerId);
    if (!player) return { ok: false, reason: 'not_found' };
    if (player.onLoan) return { ok: false, reason: 'on_loan' };
    if (listed) {
      const moveGate = assertPlayerCanMove(player);
      if (!moveGate.ok) return moveGate;
    }
    ensureMarketFields(player, { division: club.division, season: getCareerSeason() });
    player.listed = !!listed;
    if (listed) {
      const value = Number(player.marketValue) || estimatePlayerValue(player, club.division);
      player.askingPrice = Math.max(
        Math.round(value * 0.7),
        Number(askingPrice) > 0 ? Math.round(Number(askingPrice)) : value,
      );
    } else {
      player.askingPrice = null;
    }
    onAfterTransfer?.({ type: 'list', playerId, listed: player.listed });
    return { ok: true, player };
  };

  const setLoanListed = (playerId, loanListed) => {
    const { name, club } = userClubState();
    if (!club) return { ok: false, reason: 'no_club' };
    const player = club.roster.find(item => resolvePlayerId(item) === playerId);
    if (!player) return { ok: false, reason: 'not_found' };
    if (player.onLoan) return { ok: false, reason: 'on_loan' };
    if (loanListed) {
      const moveGate = assertPlayerCanMove(player);
      if (!moveGate.ok) return moveGate;
      if (countOutgoingLoans(name) >= maxLoans) {
        return { ok: false, reason: 'loan_out_limit', slots: loanSlots(name) };
      }
    }
    player.loanListed = !!loanListed;
    onAfterTransfer?.({ type: 'loan_list', playerId, loanListed: player.loanListed });
    return { ok: true, player, slots: loanSlots(name) };
  };

  /**
   * Avalia se o vendedor aceita a taxa. sellerClub pode ser o clube ou só a divisão (legado).
   * @returns {{ value, ask, floor, accept, ratio, reasons, playerPull }}
   */
  const evaluateSellerAccept = (player, fee, sellerClub = null, options = {}) => {
    const seller =
      sellerClub && typeof sellerClub === 'object' && !Array.isArray(sellerClub)
        ? sellerClub
        : null;
    const sellerDivision =
      seller?.division || (typeof sellerClub === 'string' ? sellerClub : null) || 'C';
    const season = Number(options.season ?? getCareerSeason()) || 2030;
    const clubName = options.clubName || seller?.name || null;
    const buyerDivision =
      options.buyerDivision ||
      options.buyerClub?.division ||
      userClubState()?.club?.division ||
      'C';

    const value = Number(player.marketValue) || estimatePlayerValue(player, sellerDivision);
    const ask = player.listed && player.askingPrice > 0 ? Number(player.askingPrice) : value;
    let ratio = Number(acceptRatio) || TRANSFER_LIMITS.acceptRatio;
    const reasons = [];

    const roster = Array.isArray(seller?.roster) ? seller.roster : null;
    const rosterAvgOvr = roster?.length
      ? roster.reduce((sum, p) => sum + (Number(p.overall) || 0), 0) / roster.length
      : null;
    const divFit = evaluateSellerDivisionFit({
      player,
      buyerDivision,
      sellerDivision,
      listed: !!player.listed,
      rosterAvgOvr,
      sellerPower: Number(seller?.power) || null,
      unit: options.divisionUnit || null,
    });
    if (!divFit.ok) {
      reasons.push('division_gap');
      const floorBlocked = Math.round(Math.min(ask, value) * maxAcceptRatio);
      return {
        value,
        ask,
        floor: floorBlocked,
        accept: false,
        ratio: maxAcceptRatio,
        reasons,
        playerPull: false,
        divisionFit: divFit,
      };
    }
    const divDelta = sellerAcceptRatioDeltaForDivision(buyerDivision, sellerDivision);
    if (divDelta > 0) ratio += divDelta;

    const yearsLeft = Math.max(0, (Number(player.contractUntil) || season) - season);
    if (yearsLeft <= 1) {
      ratio -= 0.06;
      reasons.push('contract_short');
    } else if (yearsLeft >= 3) {
      ratio += 0.04;
      reasons.push('contract_long');
    }

    if (roster) {
      const posCount = roster.filter(item => item?.pos === player.pos).length;
      if (posCount >= 4) {
        ratio -= 0.05;
        reasons.push('pos_depth');
      } else if (posCount <= 1) {
        ratio += 0.06;
        reasons.push('pos_thin');
      }
      if (roster.length <= minRoster + 1) {
        ratio += 0.06;
        reasons.push('roster_thin');
      }
    }

    const env = Number(seller?.environment);
    const board = Number(seller?.board);
    const finances = Number(seller?.finances);
    const form = typeof deps.getClubForm === 'function' && clubName
      ? deps.getClubForm(clubName)
      : options.form;
    const fScore = formScore(form);
    const moodAvg =
      [env, board, finances].filter(Number.isFinite).reduce((a, b) => a + b, 0) /
        Math.max(1, [env, board, finances].filter(Number.isFinite).length) || 50;
    const tablePos = Number(seller?.position);
    const badMoment =
      (Number.isFinite(moodAvg) && moodAvg < 42) ||
      fScore < 0.35 ||
      (Number.isFinite(tablePos) && tablePos >= 16);
    const goodMoment =
      (Number.isFinite(moodAvg) && moodAvg >= 62) &&
      fScore >= 0.55 &&
      (!Number.isFinite(tablePos) || tablePos <= 8);
    if (badMoment) {
      const delta = moodAvg < 35 || fScore < 0.25 ? -0.08 : -0.05;
      ratio += delta;
      reasons.push('bad_moment');
    } else if (goodMoment) {
      ratio += moodAvg >= 70 ? 0.05 : 0.03;
      reasons.push('good_moment');
    }

    const rank =
      (typeof deps.getNationalRank === 'function' && clubName
        ? deps.getNationalRank(clubName)
        : null) ||
      options.nationalRank ||
      null;
    if (rank && Number(rank.total) > 0 && Number(rank.position) > 0) {
      const pct = Number(rank.position) / Number(rank.total);
      if (pct >= 0.7) {
        ratio -= 0.03;
        reasons.push('rank_weak');
      } else if (pct <= 0.15) {
        ratio += 0.04;
        reasons.push('rank_strong');
      }
    }

    const power = Number(seller?.power) || 60;
    const ovr = Number(player.overall) || 0;
    if (ovr >= power + 8) {
      ratio += 0.05;
      reasons.push('star');
    }

    const injuryDays = Number(player?.injury?.daysRemaining) || 0;
    if (injuryDays > 0) {
      ratio -= 0.03;
      reasons.push('injured');
    }
    if (player.listed) {
      ratio -= 0.02;
      reasons.push('listed');
    }

    let playerPull = false;
    const manager =
      options.buyerManager ||
      (typeof deps.getUserManager === 'function' ? deps.getUserManager() : null);
    if (manager && options.applyManagerPull !== false) {
      const pid = resolvePlayerId(player);
      const pullRoll = hashRatio(`${pid}:${season}:mgr`);
      const reputation = Number(manager.reputation ?? manager.total) || 0;
      if (
        pullRoll < TRANSFER_LIMITS.managerPullChance &&
        reputation >= TRANSFER_LIMITS.managerPullReputation
      ) {
        ratio += TRANSFER_LIMITS.managerPullDelta;
        playerPull = true;
        reasons.push('manager_pull');
      }
    }

    ratio = clamp(ratio, minAcceptRatio, maxAcceptRatio);
    const floor = Math.round(Math.min(ask, value) * ratio);
    return {
      value,
      ask,
      floor,
      accept: Number(fee) >= floor,
      ratio,
      reasons,
      playerPull,
    };
  };

  const assertBuyNotRestricted = () => {
    const { club } = userClubState();
    if (isMarketBuyRestricted(club)) {
      return { ok: false, reason: 'financial_restriction' };
    }
    return { ok: true };
  };

  /**
   * Compra jogador de outro clube (fee à vista).
   */
  const buyPlayer = (playerId, feeInput = null) => {
    const gate = assertMarket();
    if (!gate.ok) {
      return {
        ok: false,
        reason: gate.reason,
        nextOpenRound: gate.nextOpenRound,
      };
    }
    const restriction = assertBuyNotRestricted();
    if (!restriction.ok) return restriction;
    const { name: buyerName, club: buyer } = userClubState();
    if (!buyer) return { ok: false, reason: 'no_club' };

    const found = findPlayerInWorld( playerId);
    if (!found || found.clubName === buyerName) return { ok: false, reason: 'not_found' };
    const { club: seller, player, index, clubName: sellerName } = found;
    if (player.onLoan) return { ok: false, reason: 'on_loan' };
    const moveGate = assertPlayerCanMove(player);
    if (!moveGate.ok) return moveGate;
    if (seller.roster.length <= minRoster) return { ok: false, reason: 'seller_min_roster' };

    ensureMarketFields(player, { division: seller.division, season: getCareerSeason() });
    const payroll = payrollExpand(buyer, player);
    if (!payroll.ok) {
      return { ok: false, reason: payroll.reason || 'payroll_pressure', payroll, fee: null };
    }
    const value = Number(player.marketValue) || estimatePlayerValue(player, seller.division);
    const fee =
      feeInput != null && Number(feeInput) > 0
        ? Math.round(Number(feeInput))
        : player.listed && player.askingPrice > 0
          ? Math.round(Number(player.askingPrice))
          : value;

    const season = getCareerSeason();
    const sellerAvg =
      Array.isArray(seller.roster) && seller.roster.length
        ? seller.roster.reduce((sum, p) => sum + (Number(p.overall) || 0), 0) / seller.roster.length
        : null;
    const verdict = evaluateSellerAccept(player, fee, seller, {
      clubName: sellerName,
      season,
      buyerDivision: buyer.division,
      buyerClub: buyer,
      buyerManager: typeof deps.getUserManager === 'function' ? deps.getUserManager() : null,
      // Fase 1 estável por jogador/clube/temporada — na maioria D→A não abre janela.
      divisionUnit: () => unitRoll(`sell-div-fit:${playerId}:${buyerName}:${sellerName}:${season}`),
    });
    let buyoutDeal = null;
    if (!verdict.accept) {
      const hardDiv = (verdict.reasons || []).includes('division_gap');
      if (hardDiv) {
        // Atalho caro: oferta extrema pode abrir chance rara (sem contra-proposta).
        const buyout = resolveSellDownBuyout({
          player,
          fee,
          value,
          buyerDivision: buyer.division,
          sellerDivision: seller.division,
          rosterAvgOvr: sellerAvg,
          sellerPower: Number(seller.power) || null,
          season,
          unit: () =>
            unitRoll(`sell-down-buyout:${playerId}:${buyerName}:${sellerName}:${season}:${fee}`),
        });
        if (buyout.accept) {
          buyoutDeal = buyout;
        } else {
          return {
            ok: false,
            reason: buyout.attemptable ? 'buyout_rejected' : 'division_gap',
            fee,
            floor: buyout.minFee || verdict.floor,
            value: verdict.value,
            reasons: ['division_gap', buyout.reason].filter(Boolean),
            ratio: verdict.ratio,
            playerPull: false,
            payroll,
            from: sellerName,
            playerName: player.name,
            clubName: sellerName,
            buyout,
          };
        }
      } else {
        const counter = evaluateCounterOffer({
          offerFee: fee,
          floor: verdict.floor,
          ask: verdict.ask,
          value: verdict.value,
          buyerDivision: buyer.division,
          sellerDivision: seller.division,
          player,
          power: Number(seller.power) || 60,
          rosterAvgOvr: sellerAvg,
          random: () => unitRoll(`counter:${playerId}:${fee}:${season}`),
        });
        if (counter.counter) {
          return {
            ok: false,
            reason: 'counter_offer',
            fee,
            counterFee: counter.fee,
            floor: verdict.floor,
            value: verdict.value,
            ask: verdict.ask,
            reasons: verdict.reasons,
            ratio: verdict.ratio,
            playerPull: verdict.playerPull,
            payroll,
            from: sellerName,
            playerName: player.name,
            clubName: sellerName,
            drop: counter.drop,
          };
        }
        return {
          ok: false,
          reason: 'rejected',
          fee,
          floor: verdict.floor,
          value: verdict.value,
          reasons: verdict.reasons,
          ratio: verdict.ratio,
          playerPull: verdict.playerPull,
          payroll,
          from: sellerName,
          playerName: player.name,
          clubName: sellerName,
        };
      }
    }
    if (!canAfford(buyer, fee)) return { ok: false, reason: 'cannot_afford', fee, payroll };

    const paid = spend(buyer, fee, {
      reason: 'transfer',
      label: `Contratação · ${player.name}`,
      meta: { playerId, from: sellerName, to: buyerName, fee },
    });
    if (!paid?.ok) return { ok: false, reason: 'cannot_afford', fee };

    seller.roster.splice(index, 1);
    const moved = { ...player, listed: false, askingPrice: null };
    clearLoanState(moved);
    markPlayerMoved(moved);
    refreshMarketFields(moved, { division: buyer.division, season: getCareerSeason() });
    buyer.roster.push(moved);

    if (sellerName !== buyerName) {
      credit(seller, fee, {
        reason: 'transfer',
        label: `Venda · ${player.name}`,
        meta: { playerId, from: sellerName, to: buyerName, fee },
      });
    }

    const result = {
      ok: true,
      type: 'buy',
      player: moved,
      fee,
      from: sellerName,
      to: buyerName,
      value: verdict.value,
      reasons: buyoutDeal ? ['sell_down_buyout'] : verdict.reasons,
      playerPull: buyoutDeal ? false : verdict.playerPull,
      buyout: buyoutDeal,
      payroll: evaluateRosterPayroll(buyer, { division: buyer.division || 'A' }),
    };
    recordSeasonDeal(result);
    onAfterTransfer?.(result);
    return result;
  };

  /**
   * Vende jogador do usuário para um clube IA seletivo (caixa, necessidade, ranking).
   */
  const sellPlayer = (playerId, feeInput = null) => {
    const gate = assertMarket();
    if (!gate.ok) {
      return {
        ok: false,
        reason: gate.reason,
        nextOpenRound: gate.nextOpenRound,
      };
    }
    const { name: sellerName, club: seller } = userClubState();
    if (!seller) return { ok: false, reason: 'no_club' };
    if (seller.roster.length <= minRoster) return { ok: false, reason: 'min_roster' };

    const index = seller.roster.findIndex(item => resolvePlayerId(item) === playerId);
    if (index < 0) return { ok: false, reason: 'not_found' };
    const player = seller.roster[index];
    if (player.onLoan) return { ok: false, reason: 'on_loan' };
    const moveGate = assertPlayerCanMove(player);
    if (!moveGate.ok) return moveGate;
    ensureMarketFields(player, { division: seller.division, season: getCareerSeason() });
    const value = Number(player.marketValue) || estimatePlayerValue(player, seller.division);
    const fee =
      feeInput != null && Number(feeInput) > 0
        ? Math.round(Number(feeInput))
        : player.askingPrice > 0
          ? Math.round(Number(player.askingPrice))
          : value;

    const clubs = getClubs() || {};
    const sellerAvg =
      seller.roster.reduce((sum, p) => sum + (Number(p.overall) || 0), 0) /
      Math.max(1, seller.roster.length);
    const candidates = Object.entries(clubs)
      .filter(([name, club]) => name !== sellerName && Array.isArray(club?.roster))
      .filter(([, club]) => clubCanHostPlayer(club, player))
      .filter(([name, club]) =>
        evaluateSellerDivisionFit({
          player,
          buyerDivision: club.division,
          sellerDivision: seller.division,
          listed: !!player.listed,
          rosterAvgOvr: sellerAvg,
          unit: () => unitRoll(`sell-div:${playerId}:${name}`),
        }).ok,
      )
      .map(([name, club]) => {
        const cash = clubCash(club);
        const needPos = club.roster.filter(item => item.pos === player.pos).length < 3;
        const rank =
          typeof deps.getNationalRank === 'function' ? deps.getNationalRank(name) : null;
        const rankPct =
          rank && Number(rank.total) > 0 ? Number(rank.position) / Number(rank.total) : 0.5;
        const form = typeof deps.getClubForm === 'function' ? deps.getClubForm(name) : null;
        const fScore = formScore(form);
        const env = Number(club.environment);
        const momentOk = !Number.isFinite(env) || env >= 45 || fScore >= 0.4;
        let askCap = value * (needPos ? 1.15 : 0.95);
        if (cash < fee * 1.2) askCap *= 0.9;
        if (rankPct <= 0.25) askCap *= 1.05;
        if (!momentOk) askCap *= 0.92;
        askCap = Math.round(askCap);

        const score =
          (needPos ? 35 : 0) +
          (club.division === seller.division ? 20 : 0) +
          (Number(club.power) || 60) +
          (rankPct <= 0.3 ? 15 : rankPct >= 0.7 ? 5 : 10) +
          (momentOk ? 8 : 0) +
          Math.min(25, cash / 2_000_000);

        return { name, club, score, cash, needPos, askCap };
      })
      .filter(entry => entry.cash >= fee * 0.5)
      .sort((a, b) => b.score - a.score);

    if (!candidates.length) return { ok: false, reason: 'no_buyer', fee, value };

    const buyerEntry = candidates.find(entry => fee <= entry.askCap);
    if (!buyerEntry) {
      const bestCap = Math.max(...candidates.map(entry => entry.askCap));
      return {
        ok: false,
        reason: 'offer_too_high',
        fee,
        value,
        askCap: bestCap,
      };
    }

    seller.roster.splice(index, 1);
    const moved = { ...player, listed: false, askingPrice: null };
    clearLoanState(moved);
    markPlayerMoved(moved);
    refreshMarketFields(moved, {
      division: buyerEntry.club.division,
      season: getCareerSeason(),
    });
    buyerEntry.club.roster.push(moved);

    credit(seller, fee, {
      reason: 'transfer',
      label: `Venda · ${player.name}`,
      meta: { playerId, from: sellerName, to: buyerEntry.name, fee },
    });

    const result = {
      ok: true,
      type: 'sell',
      player: moved,
      fee,
      from: sellerName,
      to: buyerEntry.name,
      value,
      payroll: evaluateRosterPayroll(seller, { division: seller.division || 'A' }),
    };
    recordSeasonDeal(result);
    onAfterTransfer?.(result);
    return result;
  };

  const pickLoanHost = (ownerName, player) => {
    const clubs = getClubs() || {};
    const owner = clubs[ownerName];
    return Object.entries(clubs)
      .filter(([name, club]) => name !== ownerName && Array.isArray(club?.roster))
      .filter(([, club]) => clubCanHostPlayer(club, player))
      .filter(([, club]) => countIncomingLoans(club) < maxLoans)
      .filter(([name, club]) =>
        evaluateLoanFit(player, owner, club, {
          unit: () => unitRoll(`loan-host:${resolvePlayerId(player)}:${name}`),
        }).ok,
      )
      .map(([name, club]) => {
        const needPos = club.roster.filter(item => item.pos === player.pos).length < 3;
        const chance = loanAcceptChance(player, owner, club);
        const score =
          (needPos ? 25 : 0) +
          (club.division === owner?.division ? 20 : 0) +
          chance * 40 +
          (Number(club.power) || 50) * 0.35;
        return { name, club, score };
      })
      .sort((a, b) => b.score - a.score)[0] || null;
  };

  /**
   * Usuário toma jogador emprestado (até fim da temporada).
   */
  const loanPlayer = playerId => {
    const gate = assertMarket();
    if (!gate.ok) {
      return { ok: false, reason: gate.reason, nextOpenRound: gate.nextOpenRound };
    }
    const restriction = assertBuyNotRestricted();
    if (!restriction.ok) return restriction;
    const { name: borrowerName, club: borrower } = userClubState();
    if (!borrower) return { ok: false, reason: 'no_club' };
    if (countIncomingLoans(borrower) >= maxLoans) {
      return { ok: false, reason: 'loan_in_limit', slots: loanSlots(borrowerName) };
    }

    const found = findPlayerInWorld( playerId);
    if (!found || found.clubName === borrowerName) return { ok: false, reason: 'not_found' };
    const { club: owner, player, index, clubName: ownerName } = found;
    if (player.onLoan) return { ok: false, reason: 'on_loan' };
    const moveGate = assertPlayerCanMove(player);
    if (!moveGate.ok) return moveGate;
    if (!player.loanListed) return { ok: false, reason: 'not_loan_listed' };
    if (owner.roster.length <= minRoster) return { ok: false, reason: 'seller_min_roster' };
    if (countOutgoingLoans(ownerName) >= maxLoans) {
      return { ok: false, reason: 'loan_out_limit', slots: loanSlots(ownerName) };
    }
    const payroll = payrollExpand(borrower, player, owner);
    if (!payroll.ok) {
      return { ok: false, reason: payroll.reason || 'payroll_pressure', payroll };
    }
    const fit = evaluateLoanFit(player, owner, borrower);
    if (!fit.ok) {
      return { ok: false, reason: fit.reason || 'loan_level', fit };
    }

    owner.roster.splice(index, 1);
    const moved = {
      ...player,
      listed: false,
      askingPrice: null,
      loanListed: false,
      onLoan: true,
      loanFrom: ownerName,
    };
    stampLoanSalaryShare(moved, owner, borrower);
    markPlayerMoved(moved);
    refreshMarketFields(moved, { division: borrower.division, season: getCareerSeason() });
    const buyOpt = stampLoanBuyOption(moved, owner, playerId);
    borrower.roster.push(moved);

    const salarySplit = previewLoanHostWage(moved, owner, borrower, resolvePlayerRoundWage);
    const result = {
      ok: true,
      type: 'loan_in',
      player: moved,
      from: ownerName,
      to: borrowerName,
      fee: 0,
      loanBuyFee: buyOpt?.fee || null,
      loanHostWage: salarySplit.hostWage,
      loanHostSharePct: salarySplit.hostSharePct,
      loanOwnerSharePct: salarySplit.ownerSharePct,
      slots: loanSlots(borrowerName),
      payroll: evaluateRosterPayroll(borrower, {
        division: borrower.division || 'A',
        ...payrollContext(),
      }),
      fit,
    };
    onAfterTransfer?.(result);
    return result;
  };

  /**
   * Usuário cede jogador por empréstimo a um clube IA.
   */
  const loanOutPlayer = playerId => {
    const gate = assertMarket();
    if (!gate.ok) {
      return { ok: false, reason: gate.reason, nextOpenRound: gate.nextOpenRound };
    }
    const { name: ownerName, club: owner } = userClubState();
    if (!owner) return { ok: false, reason: 'no_club' };
    if (owner.roster.length <= minRoster) return { ok: false, reason: 'min_roster' };
    if (countOutgoingLoans(ownerName) >= maxLoans) {
      return { ok: false, reason: 'loan_out_limit', slots: loanSlots(ownerName) };
    }

    const index = owner.roster.findIndex(item => resolvePlayerId(item) === playerId);
    if (index < 0) return { ok: false, reason: 'not_found' };
    const player = owner.roster[index];
    if (player.onLoan) return { ok: false, reason: 'on_loan' };
    const moveGate = assertPlayerCanMove(player);
    if (!moveGate.ok) return moveGate;

    const host = pickLoanHost(ownerName, player);
    if (!host) return { ok: false, reason: 'no_loan_host' };

    owner.roster.splice(index, 1);
    const moved = {
      ...player,
      listed: false,
      askingPrice: null,
      loanListed: false,
      onLoan: true,
      loanFrom: ownerName,
    };
    stampLoanSalaryShare(moved, owner, host.club);
    markPlayerMoved(moved);
    refreshMarketFields(moved, {
      division: host.club.division,
      season: getCareerSeason(),
    });
    const buyOpt = stampLoanBuyOption(moved, owner, playerId);
    host.club.roster.push(moved);

    const result = {
      ok: true,
      type: 'loan_out',
      player: moved,
      from: ownerName,
      to: host.name,
      fee: 0,
      loanBuyFee: buyOpt?.fee || null,
      slots: loanSlots(ownerName),
      payroll: evaluateRosterPayroll(owner, {
        division: owner.division || 'A',
        ...payrollContext(),
      }),
    };
    onAfterTransfer?.(result);
    return result;
  };

  /**
   * Devolve antecipadamente um jogador emprestado no elenco do usuário.
   */
  const returnLoanPlayer = playerId => {
    const { name: borrowerName, club: borrower } = userClubState();
    if (!borrower) return { ok: false, reason: 'no_club' };
    const index = borrower.roster.findIndex(item => resolvePlayerId(item) === playerId);
    if (index < 0) return { ok: false, reason: 'not_found' };
    const player = borrower.roster[index];
    if (!player.onLoan || !player.loanFrom) return { ok: false, reason: 'not_on_loan' };

    const ownerName = player.loanFrom;
    const owner = getClubs()?.[ownerName];
    if (!owner || !Array.isArray(owner.roster)) return { ok: false, reason: 'no_club' };
    const ownerDiv = owner.division || 'A';
    const hostPayroll = evaluateRosterPayroll(owner, {
      division: ownerDiv,
      extraWage: resolvePlayerRoundWage(player, ownerDiv),
      rosterDelta: 1,
      ...payrollContext(),
    });
    if (!hostPayroll.ok) {
      return { ok: false, reason: hostPayroll.reason || 'payroll_pressure', payroll: hostPayroll };
    }

    borrower.roster.splice(index, 1);
    const moved = { ...player };
    clearLoanState(moved);
    moved.listed = false;
    moved.askingPrice = null;
    refreshMarketFields(moved, { division: owner.division, season: getCareerSeason() });
    owner.roster.push(moved);

    const result = {
      ok: true,
      type: 'loan_return',
      player: moved,
      from: borrowerName,
      to: ownerName,
      slots: loanSlots(borrowerName),
      payroll: evaluateRosterPayroll(borrower, {
        division: borrower.division || 'A',
        ...payrollContext(),
      }),
    };
    onAfterTransfer?.(result);
    return result;
  };

  const buyerAskCap = (buyerName, buyer, player, value) => {
    const cash = clubCash(buyer);
    const needPos = buyer.roster.filter(item => item.pos === player.pos).length < 3;
    const rank =
      typeof deps.getNationalRank === 'function' ? deps.getNationalRank(buyerName) : null;
    const rankPct =
      rank && Number(rank.total) > 0 ? Number(rank.position) / Number(rank.total) : 0.5;
    const form = typeof deps.getClubForm === 'function' ? deps.getClubForm(buyerName) : null;
    const fScore = formScore(form);
    const env = Number(buyer.environment);
    const momentOk = !Number.isFinite(env) || env >= 45 || fScore >= 0.4;
    let askCap = value * (needPos ? 1.15 : 0.95);
    if (cash < value * 1.2) askCap *= 0.9;
    if (rankPct <= 0.25) askCap *= 1.05;
    if (!momentOk) askCap *= 0.92;
    return {
      askCap: Math.round(askCap),
      cash,
      needPos,
      score:
        (needPos ? 35 : 0) +
        (Number(buyer.power) || 60) +
        (rankPct <= 0.3 ? 15 : 10) +
        (momentOk ? 8 : 0) +
        Math.min(25, cash / 2_000_000),
    };
  };

  const transferBetweenClubs = ({
    sellerName,
    seller,
    buyerName,
    buyer,
    index,
    player,
    fee,
  }) => {
    const moveGate = assertPlayerCanMove(player);
    if (!moveGate.ok) return moveGate;
    ensureAiCash(buyer);
    ensureAiCash(seller);
    const payroll = payrollExpand(buyer, player);
    if (!payroll.ok) {
      return { ok: false, reason: payroll.reason || 'payroll_pressure', payroll, fee };
    }
    if (!canAfford(buyer, fee)) return { ok: false, reason: 'cannot_afford', fee, payroll };
    const paid = spend(buyer, fee, {
      reason: 'transfer',
      label: `Contratação · ${player.name}`,
      meta: { playerId: resolvePlayerId(player), from: sellerName, to: buyerName, fee },
    });
    if (!paid?.ok) return { ok: false, reason: 'cannot_afford', fee };
    seller.roster.splice(index, 1);
    const moved = { ...player, listed: false, askingPrice: null, loanListed: false };
    clearLoanState(moved);
    markPlayerMoved(moved);
    refreshMarketFields(moved, { division: buyer.division, season: getCareerSeason() });
    buyer.roster.push(moved);
    credit(seller, fee, {
      reason: 'transfer',
      label: `Venda · ${player.name}`,
      meta: { playerId: resolvePlayerId(player), from: sellerName, to: buyerName, fee },
    });
    const result = {
      ok: true,
      type: 'ai_buy',
      player: moved,
      fee,
      from: sellerName,
      to: buyerName,
      value: Number(player.marketValue) || estimatePlayerValue(player, seller.division),
    };
    recordSeasonDeal(result);
    onAfterTransfer?.(result);
    return result;
  };

  const loanBetweenClubs = ({ ownerName, owner, hostName, host, index, player }) => {
    const moveGate = assertPlayerCanMove(player);
    if (!moveGate.ok) return moveGate;
    if (owner.roster.length <= minRoster) return { ok: false, reason: 'seller_min_roster' };
    const hostPayroll = payrollExpand(host, player, owner);
    if (!hostPayroll.ok) {
      return { ok: false, reason: hostPayroll.reason || 'payroll_pressure', payroll: hostPayroll };
    }
    if (countOutgoingLoans(ownerName) >= maxLoans) return { ok: false, reason: 'loan_out_limit' };
    if (countIncomingLoans(host) >= maxLoans) return { ok: false, reason: 'loan_in_limit' };
    const fit = evaluateLoanFit(player, owner, host, {
      unit: () => unitRoll(`loan-btw:${resolvePlayerId(player)}:${hostName}`),
    });
    if (!fit.ok) return { ok: false, reason: fit.reason || 'loan_level', fit };
    owner.roster.splice(index, 1);
    const moved = {
      ...player,
      listed: false,
      askingPrice: null,
      loanListed: false,
      onLoan: true,
      loanFrom: ownerName,
    };
    stampLoanSalaryShare(moved, owner, host);
    markPlayerMoved(moved);
    refreshMarketFields(moved, { division: host.division, season: getCareerSeason() });
    const buyOpt = stampLoanBuyOption(moved, owner, resolvePlayerId(player));
    host.roster.push(moved);
    const result = {
      ok: true,
      type: 'ai_loan',
      player: moved,
      fee: 0,
      loanBuyFee: buyOpt?.fee || null,
      from: ownerName,
      to: hostName,
    };
    recordSeasonDeal(result);
    onAfterTransfer?.(result);
    return result;
  };

  /**
   * Hospedeiro (usuário) exerce opção de compra do emprestado.
   */
  const exerciseLoanBuyOption = playerId => {
    const gate = assertMarket();
    if (!gate.ok) {
      return { ok: false, reason: gate.reason, nextOpenRound: gate.nextOpenRound };
    }
    const restriction = assertBuyNotRestricted();
    if (!restriction.ok) return restriction;
    const { name: hostName, club: host } = userClubState();
    if (!host) return { ok: false, reason: 'no_club' };
    const index = host.roster.findIndex(item => resolvePlayerId(item) === playerId);
    if (index < 0) return { ok: false, reason: 'not_found' };
    const player = host.roster[index];
    if (player.onLoan && player.loanFrom) {
      ensureLoanBuyOption(player, getClubs()?.[player.loanFrom]?.division || 'C');
    }
    const check = canExerciseLoanBuyOption({
      player,
      hostClubName: hostName,
      marketOpen: true,
      canAfford: fee => canAfford(host, fee),
      hostRosterSize: host.roster.length,
      rosterHardMax: maxRoster,
    });
    if (!check.ok) return { ...check, payroll: evaluateRosterPayroll(host, { division: host.division || 'A' }) };

    const ownerName = player.loanFrom;
    const owner = getClubs()?.[ownerName];
    if (!owner) return { ok: false, reason: 'no_club' };
    const fee = check.fee;
    ensureAiCash(owner);
    const paid = spend(host, fee, {
      reason: 'transfer',
      label: `Opção de compra · ${player.name}`,
      meta: { playerId, from: ownerName, to: hostName, fee, loanBuy: true },
    });
    if (!paid?.ok) return { ok: false, reason: 'cannot_afford', fee };

    credit(owner, fee, {
      reason: 'transfer',
      label: `Opção de compra · ${player.name}`,
      meta: { playerId, from: ownerName, to: hostName, fee, loanBuy: true },
    });
    const applied = applyLoanBuyExercise(player);
    refreshMarketFields(player, { division: host.division, season: getCareerSeason() });
    const result = {
      ok: true,
      type: 'loan_buy',
      player,
      fee: applied.fee,
      from: ownerName,
      to: hostName,
      slots: loanSlots(hostName),
      payroll: evaluateRosterPayroll(host, { division: host.division || 'A' }),
    };
    recordSeasonDeal(result);
    onAfterTransfer?.(result);
    return result;
  };

  /** IA (ou host) exerce opção — usado no tick. */
  const exerciseLoanBuyAtHost = (hostName, host, player) => {
    if (!host || !player?.onLoan) return { ok: false, reason: 'not_on_loan' };
    ensureLoanBuyOption(player, getClubs()?.[player.loanFrom]?.division || 'C');
    ensureAiCash(host);
    const check = canExerciseLoanBuyOption({
      player,
      hostClubName: hostName,
      marketOpen: true,
      canAfford: fee => clubCash(host) >= fee,
      hostRosterSize: host.roster.length,
      rosterHardMax: maxRoster,
    });
    if (!check.ok) return check;
    const ownerName = player.loanFrom;
    const owner = getClubs()?.[ownerName];
    if (!owner) return { ok: false, reason: 'no_club' };
    const fee = check.fee;
    host.budget = clubCash(host) - fee;
    ensureAiCash(owner);
    owner.budget = clubCash(owner) + fee;
    applyLoanBuyExercise(player);
    refreshMarketFields(player, { division: host.division, season: getCareerSeason() });
    const result = {
      ok: true,
      type: 'loan_buy',
      player,
      fee,
      from: ownerName,
      to: hostName,
    };
    recordSeasonDeal(result);
    onAfterTransfer?.(result);
    return result;
  };

  const resolveOfferMessage = offer => {
    if (offer?.messageId && typeof deps.resolveOfferMessage === 'function') {
      deps.resolveOfferMessage(offer.messageId);
    }
  };

  /**
   * Expira propostas pendentes por rodada OU por dias de calendário.
   */
  const expirePendingOffers = (round = currentRound()) => {
    const r = Math.max(1, Number(round) || 1);
    const todayKey = careerDayKey(careerDate());
    const expired = [];
    pendingOffers.forEach(offer => {
      if (offer.status !== 'pending') return;
      const roundExpired = Number(offer.expiresRound) > 0 && r >= Number(offer.expiresRound);
      const dayExpired =
        offer.expiresDayKey && todayKey ? todayKey >= offer.expiresDayKey : false;
      if (!roundExpired && !dayExpired) return;
      offer.status = 'expired';
      resolveOfferMessage(offer);
      expired.push({ ...offer });
    });
    return expired;
  };

  const createIncomingOffer = ({ type, playerId, fromClub, fee = 0 }) => {
    const { name: userName, club: user } = userClubState();
    if (!user) return { ok: false, reason: 'no_club' };
    const buyer = getClubs()?.[fromClub];
    if (!buyer || fromClub === userName) return { ok: false, reason: 'no_buyer' };
    const index = user.roster.findIndex(item => resolvePlayerId(item) === playerId);
    if (index < 0) return { ok: false, reason: 'not_found' };
    const player = user.roster[index];
    if (player.onLoan) return { ok: false, reason: 'on_loan' };
    if (playerMovedThisWindow(player)) return { ok: false, reason: 'already_moved' };
    if (listPendingOffers().some(item => item.playerId === playerId)) {
      return { ok: false, reason: 'already_offered' };
    }
    if (listPendingOffers().length >= maxPendingUserOffers) {
      return { ok: false, reason: 'pending_cap' };
    }
    if (playerOnOfferCooldown(playerId)) {
      return { ok: false, reason: 'cooldown' };
    }
    const round = currentRound();
    const expiresAt = addCareerDays(careerDate(), offerExpiryDays);
    const offer = {
      id: nextOfferId(),
      type: type === 'loan' ? 'loan' : 'buy',
      playerId,
      playerName: player.name,
      playerPos: player.pos,
      playerOverall: Number(player.overall) || 0,
      fromClub,
      fee: type === 'loan' ? 0 : Math.max(0, Math.round(Number(fee) || 0)),
      createdRound: round,
      createdAt: careerDate()?.toISOString?.() || new Date().toISOString(),
      expiresRound: round + offerExpiryRounds,
      expiresDayKey: careerDayKey(expiresAt),
      messageId: null,
      status: 'pending',
    };
    pendingOffers.unshift(offer);
    return { ok: true, offer };
  };

  const attachOfferMessageId = (offerId, messageId) => {
    const offer = findPendingOffer(offerId);
    if (!offer) return false;
    offer.messageId = messageId || null;
    return true;
  };

  const rejectIncomingOffer = (offerId, { reason = 'rejected' } = {}) => {
    const offer = findPendingOffer(offerId);
    if (!offer) return { ok: false, reason: 'not_found' };
    if (offer.status !== 'pending') return { ok: false, reason: 'not_pending', offer };
    offer.status = reason === 'expired' ? 'expired' : 'rejected';
    if (offer.status === 'rejected' && offer.playerId) {
      const until = addCareerDays(careerDate(), offerRejectCooldownDays);
      const key = careerDayKey(until);
      if (key) rejectCooldownUntil.set(offer.playerId, key);
    }
    resolveOfferMessage(offer);
    return { ok: true, offer: { ...offer } };
  };

  const acceptIncomingOffer = offerId => {
    const gate = assertMarket();
    if (!gate.ok) {
      return { ok: false, reason: gate.reason, nextOpenRound: gate.nextOpenRound };
    }
    const offer = findPendingOffer(offerId);
    if (!offer) return { ok: false, reason: 'not_found' };
    if (offer.status !== 'pending') return { ok: false, reason: 'not_pending', offer };

    const { name: userName, club: user } = userClubState();
    if (!user) return { ok: false, reason: 'no_club' };
    const buyer = getClubs()?.[offer.fromClub];
    if (!buyer) return { ok: false, reason: 'no_buyer' };

    const index = user.roster.findIndex(item => resolvePlayerId(item) === offer.playerId);
    if (index < 0) return { ok: false, reason: 'not_found' };
    const player = user.roster[index];
    if (player.onLoan) return { ok: false, reason: 'on_loan' };
    const moveGate = assertPlayerCanMove(player);
    if (!moveGate.ok) return moveGate;
    if (user.roster.length <= minRoster) return { ok: false, reason: 'min_roster' };

    if (offer.type === 'loan') {
      const loaned = loanBetweenClubs({
        ownerName: userName,
        owner: user,
        hostName: offer.fromClub,
        host: buyer,
        index,
        player,
      });
      if (!loaned.ok) return loaned;
      offer.status = 'accepted';
      resolveOfferMessage(offer);
      loaned.payroll = evaluateRosterPayroll(user, { division: user.division || 'A' });
      return { ok: true, offer: { ...offer }, deal: loaned };
    }

    const fee = Math.round(Number(offer.fee) || 0);
    const deal = transferBetweenClubs({
      sellerName: userName,
      seller: user,
      buyerName: offer.fromClub,
      buyer,
      index,
      player,
      fee,
    });
    if (!deal.ok) return deal;
    offer.status = 'accepted';
    resolveOfferMessage(offer);
    deal.payroll = evaluateRosterPayroll(user, { division: user.division || 'A' });
    return { ok: true, offer: { ...offer }, deal };
  };

  /**
   * Tick de mercado da IA (janela aberta): negócios IA↔IA + propostas ao usuário.
   * @param {'week'|'deadline'|'postRound'} [opts.tickKind]
   */
  const runAiMarketTick = ({
    maxBuys = aiBuyDealsPerTick,
    maxLoanDeals = aiLoanDealsPerTick,
    maxUserOffers = userOffersPerTick,
    tickKind = 'week',
    skipUserOffers = false,
    skipSeed = false,
  } = {}) => {
    const status = marketStatus();
    if (!status.open) {
      return {
        ok: false,
        reason: status.reason || 'market_closed',
        deals: [],
        offers: [],
        digest: null,
      };
    }

    const clubs = getClubs() || {};
    const userName = getUserClub();
    const round = currentRound();
    const season = getCareerSeason();
    const deals = [];
    const offers = [];

    // Re-seed listings levemente para manter mercado vivo.
    if (!skipSeed) {
      seedAiListings({ ratio: 0.04, minListed: 20 });
      seedAiLoanListings({ ratio: 0.03, minLoanListed: 12 });
    }

    const aiEntries = Object.entries(clubs).filter(
      ([name, club]) => name !== userName && Array.isArray(club?.roster),
    );

    // --- Compra/venda IA↔IA ---
    const listedPool = [];
    aiEntries.forEach(([clubName, club]) => {
      if (club.roster.length <= minRoster) return;
      club.roster.forEach((player, index) => {
        if (player.onLoan || !player.listed) return;
        if (playerMovedThisWindow(player)) return;
        ensureMarketFields(player, { division: club.division, season });
        listedPool.push({ clubName, club, player, index });
      });
    });
    listedPool.sort(
      (a, b) =>
        hashRatio(`${a.player.playerId || a.player.name}:${round}:buy`) -
        hashRatio(`${b.player.playerId || b.player.name}:${round}:buy`),
    );

    let buys = 0;
    for (const candidate of listedPool) {
      if (buys >= maxBuys) break;
      const { clubName: sellerName, club: seller, player } = candidate;
      if (!seller.roster.includes(player)) continue;
      if (seller.roster.length <= minRoster) continue;
      const index = seller.roster.indexOf(player);
      if (index < 0) continue;

      const value = Number(player.marketValue) || estimatePlayerValue(player, seller.division);
      const sellerAvg =
        seller.roster.reduce((sum, p) => sum + (Number(p.overall) || 0), 0) /
        Math.max(1, seller.roster.length);
      const buyers = aiEntries
        .filter(
          ([name, club]) =>
            name !== sellerName &&
            clubCanHostPlayer(club, player) &&
            evaluateSellerDivisionFit({
              player,
              buyerDivision: club.division,
              sellerDivision: seller.division,
              listed: true,
              rosterAvgOvr: sellerAvg,
              unit: () => unitRoll(`ai-buy-div:${resolvePlayerId(player)}:${name}:${round}`),
            }).ok,
        )
        .map(([name, club]) => {
          const meta = buyerAskCap(name, club, player, value);
          const verdict = evaluateSellerAccept(player, value, seller, {
            clubName: sellerName,
            season,
            buyerDivision: club.division,
            buyerClub: club,
            applyManagerPull: false,
          });
          return { name, club, ...meta, verdict };
        })
        .filter(
          entry =>
            entry.verdict.accept &&
            entry.cash >= entry.verdict.floor * 0.5 &&
            entry.askCap >= entry.verdict.floor,
        )
        .sort((a, b) => b.score - a.score);
      const buyerEntry = buyers[0];
      if (!buyerEntry) continue;
      const fee = Math.round(
        clamp(
          buyerEntry.verdict.floor +
            (Math.min(buyerEntry.askCap, value) - buyerEntry.verdict.floor) * 0.55,
          buyerEntry.verdict.floor,
          buyerEntry.askCap,
        ),
      );
      const deal = transferBetweenClubs({
        sellerName,
        seller,
        buyerName: buyerEntry.name,
        buyer: buyerEntry.club,
        index,
        player,
        fee,
      });
      if (deal.ok) {
        deals.push(deal);
        buys += 1;
      }
    }

    // --- Empréstimos IA↔IA ---
    const loanPool = [];
    aiEntries.forEach(([clubName, club]) => {
      if (club.roster.length <= minRoster) return;
      if (countOutgoingLoans(clubName) >= maxLoans) return;
      club.roster.forEach((player, index) => {
        if (player.onLoan || !player.loanListed) return;
        if (playerMovedThisWindow(player)) return;
        loanPool.push({ clubName, club, player, index });
      });
    });
    loanPool.sort(
      (a, b) =>
        hashRatio(`${resolvePlayerId(a.player)}:${round}:loan`) -
        hashRatio(`${resolvePlayerId(b.player)}:${round}:loan`),
    );

    let loansDone = 0;
    for (const candidate of loanPool) {
      if (loansDone >= maxLoanDeals) break;
      const { clubName: ownerName, club: owner, player } = candidate;
      if (!owner.roster.includes(player)) continue;
      const index = owner.roster.indexOf(player);
      if (index < 0) continue;
      const hosts = aiEntries
        .filter(
          ([name, club]) =>
            name !== ownerName &&
            clubCanHostPlayer(club, player) &&
            countIncomingLoans(club) < maxLoans &&
            evaluateLoanFit(player, owner, club, {
              unit: () => unitRoll(`ai-loan-host:${resolvePlayerId(player)}:${name}:${round}`),
            }).ok,
        )
        .map(([name, club]) => {
          const needPos = club.roster.filter(item => item.pos === player.pos).length < 3;
          const chance = loanAcceptChance(player, owner, club);
          return {
            name,
            club,
            score: (needPos ? 30 : 0) + chance * 45 + (Number(club.power) || 50) * 0.4,
          };
        })
        .sort((a, b) => b.score - a.score);
      const host = hosts[0];
      if (!host) continue;
      const deal = loanBetweenClubs({
        ownerName,
        owner,
        hostName: host.name,
        host: host.club,
        index,
        player,
      });
      if (deal.ok) {
        deals.push(deal);
        loansDone += 1;
      }
    }

    // --- Propostas ao usuário (funil interesse → rolagem → no máx. 1) ---
    const { club: userClub } = userClubState();
    const pendingCount = listPendingOffers().length;
    const offerChance = offerChanceForTick(tickKind);
    const allowUserOffers =
      !skipUserOffers &&
      maxUserOffers > 0 &&
      userClub?.roster?.length > minRoster &&
      pendingCount < maxPendingUserOffers &&
      unitRoll(
        `user-offer:${season}:${round}:${careerDayKey(careerDate())}:${tickKind}`,
      ) < offerChance;

    if (allowUserOffers) {
      const rosterOvr =
        userClub.roster.reduce((sum, p) => sum + (Number(p.overall) || 70), 0) /
        Math.max(1, userClub.roster.length);
      const userDivRank = DIV_RANK[userClub.division] || 2;
      const targets = userClub.roster
        .filter(player => !player.onLoan && !playerMovedThisWindow(player))
        .filter(player => {
          const id = resolvePlayerId(player);
          if (!id) return false;
          if (playerOnOfferCooldown(id)) return false;
          if (listPendingOffers().some(item => item.playerId === id)) return false;
          return true;
        })
        .map(player => {
          const posCount = userClub.roster.filter(item => item.pos === player.pos).length;
          const id = resolvePlayerId(player);
          const age = Number(player.age) || 26;
          const ovr = Number(player.overall) || 70;
          let score = (player.listed ? 28 : 0) + (player.loanListed ? 12 : 0);
          score += posCount >= 4 ? 22 : posCount >= 3 ? 10 : 0;
          score += age <= 23 ? 6 : 0;
          score += hashRatio(`${id}:${round}:uo`) * 30;
          score -= ovr * 0.18;
          if (!player.listed && !player.loanListed && posCount <= 2 && ovr >= rosterOvr + 3) {
            score -= 35;
          }
          return { player, id, score, posCount, age, ovr };
        })
        .filter(item => item.score > -5)
        .sort((a, b) => b.score - a.score);

      let userOfferCount = 0;
      for (const target of targets) {
        if (userOfferCount >= maxUserOffers) break;
        ensureMarketFields(target.player, {
          division: userClub.division,
          season,
        });
        const value =
          Number(target.player.marketValue) ||
          estimatePlayerValue(target.player, userClub.division);
        const wantLoan =
          hashRatio(`${target.id}:${round}:kind`) < loanOfferShare &&
          (target.player.loanListed ||
            (target.posCount >= 4 && (target.age <= 24 || target.ovr <= rosterOvr)));

        const buyers = aiEntries
          .filter(([, club]) => clubCanHostPlayer(club, target.player))
          .map(([name, club]) => {
            const meta = buyerAskCap(name, club, target.player, value);
            const buyerRank = DIV_RANK[club.division] || 2;
            const gap = buyerRank - userDivRank;
            if (!wantLoan) {
              const offerFit = evaluateBuyerOfferDivisionFit({
                player: target.player,
                buyerDivision: club.division,
                sellerDivision: userClub.division,
                listed: !!target.player.listed,
                loanListed: !!target.player.loanListed,
                rosterAvgOvr: rosterOvr,
                unit: () => unitRoll(`buy-offer-div:${target.id}:${name}:${round}`),
              });
              if (!offerFit.ok) return null;
            }
            if (wantLoan) {
              const fit = evaluateLoanFit(target.player, userClub, club, {
                unit: () => unitRoll(`loan-offer:${target.id}:${name}:${round}`),
              });
              if (!fit.ok) return null;
            }
            return { name, club, ...meta, gap };
          })
          .filter(Boolean)
          .filter(entry => (wantLoan ? true : entry.cash >= value * 0.5))
          .sort((a, b) => b.score - a.score);

        const buyerEntry = buyers[0];
        if (!buyerEntry) continue;
        if (wantLoan) {
          if (countOutgoingLoans(userClub) >= maxLoans) continue;
          if (countIncomingLoans(buyerEntry.club) >= maxLoans) continue;
          const created = createIncomingOffer({
            type: 'loan',
            playerId: target.id,
            fromClub: buyerEntry.name,
            fee: 0,
          });
          if (created.ok) {
            offers.push(created.offer);
            userOfferCount += 1;
          }
          continue;
        }

        const fee = Math.round(
          clamp(value * 0.9, value * 0.85, Math.min(buyerEntry.askCap, value * 1.05)),
        );
        if (fee > buyerEntry.askCap || buyerEntry.cash < fee * 0.5) continue;
        const created = createIncomingOffer({
          type: 'buy',
          playerId: target.id,
          fromClub: buyerEntry.name,
          fee,
        });
        if (created.ok) {
          offers.push(created.offer);
          userOfferCount += 1;
        }
      }
    }

    // Observações / possíveis movimentos (não são negócios fechados).
    const watchPool = listedPool
      .filter(entry => entry.club.roster.includes(entry.player) && entry.player.listed)
      .slice(0, 8);
    let watches = 0;
    for (const entry of watchPool) {
      if (watches >= 3) break;
      const buyers = aiEntries
        .filter(([name, club]) => name !== entry.clubName && clubCanHostPlayer(club, entry.player))
        .sort(
          (a, b) =>
            hashRatio(`${resolvePlayerId(entry.player)}:${a[0]}:${round}:watch`) -
            hashRatio(`${resolvePlayerId(entry.player)}:${b[0]}:${round}:watch`),
        );
      const interested = buyers[0];
      if (!interested) continue;
      if (hashRatio(`${resolvePlayerId(entry.player)}:${interested[0]}:${round}:w`) < 0.45) continue;
      recordSeasonDeal({
        type: 'watch',
        player: entry.player,
        from: entry.clubName,
        to: interested[0],
        fee: 0,
      });
      watches += 1;
    }

    // Opção de compra: IA hospedeira exerce (mais chance se o dono for o usuário).
    let loanBuys = 0;
    const maxLoanBuys = Math.max(1, Math.min(3, Math.round(aiEntries.length / 10)));
    for (const [hostName, host] of aiEntries) {
      if (loanBuys >= maxLoanBuys) break;
      if (!Array.isArray(host.roster)) continue;
      ensureAiCash(host);
      for (const player of [...host.roster]) {
        if (loanBuys >= maxLoanBuys) break;
        if (!player?.onLoan || !player.loanFrom) continue;
        ensureLoanBuyOption(player, getClubs()?.[player.loanFrom]?.division || 'C');
        const fee = Math.round(Number(player.loanBuyOption?.fee) || 0);
        if (fee <= 0) continue;
        if (clubCash(host) < fee * 1.15) continue;
        const fromUser = player.loanFrom === userName;
        const chance = fromUser ? 0.22 : 0.08;
        const roll = unitRoll(`loan-buy:${resolvePlayerId(player)}:${hostName}:${round}`);
        if (roll > chance) continue;
        const done = exerciseLoanBuyAtHost(hostName, host, player);
        if (done.ok) {
          deals.push(done);
          loanBuys += 1;
        }
      }
    }

    const digest =
      deals.length > 0
        ? {
            buyCount: deals.filter(d => d.type === 'ai_buy').length,
            loanCount: deals.filter(d => d.type === 'ai_loan').length,
            loanBuyCount: deals.filter(d => d.type === 'loan_buy').length,
            total: deals.length,
          }
        : null;

    return { ok: true, deals, offers, digest, round, season };
  };

  /**
   * Fim de temporada: todos os emprestados voltam ao clube de origem.
   * @returns {number} quantos retornos
   */
  const returnExpiredLoans = () => {
    const clubs = getClubs() || {};
    const pending = [];
    Object.entries(clubs).forEach(([clubName, club]) => {
      if (!Array.isArray(club?.roster)) return;
      club.roster.forEach((player, index) => {
        if (player?.onLoan && player.loanFrom) {
          pending.push({ clubName, club, player, index, ownerName: player.loanFrom });
        }
      });
    });
    // Remover do fim para o início por clube
    pending.sort((a, b) => {
      if (a.clubName === b.clubName) return b.index - a.index;
      return String(a.clubName).localeCompare(String(b.clubName));
    });

    let returned = 0;
    pending.forEach(item => {
      const owner = clubs[item.ownerName];
      if (!owner || !Array.isArray(owner.roster)) return;
      // Fim de temporada: devolve mesmo sob pressão de folha; só bloqueia antifail.
      if (owner.roster.length >= ROSTER_HARD_MAX) return;
      const idx = item.club.roster.findIndex(p => resolvePlayerId(p) === resolvePlayerId(item.player));
      if (idx < 0) return;
      const [raw] = item.club.roster.splice(idx, 1);
      const moved = { ...raw };
      clearLoanState(moved);
      moved.listed = false;
      moved.askingPrice = null;
      refreshMarketFields(moved, { division: owner.division, season: getCareerSeason() });
      owner.roster.push(moved);
      returned += 1;
    });
    if (returned > 0) onAfterTransfer?.({ type: 'loan_season_return', count: returned });
    return returned;
  };

  /** Fase 1 pública: há janela de negociação comprador(usuário) ← vendedor? */
  const getBuyDivisionFit = playerId => {
    const { name: buyerName, club: buyer } = userClubState();
    if (!buyer) return { ok: false, reason: 'no_club' };
    const found = findPlayerInWorld( playerId);
    if (!found || found.clubName === buyerName) return { ok: false, reason: 'not_found' };
    const roster = found.club.roster;
    const rosterAvgOvr = roster?.length
      ? roster.reduce((sum, p) => sum + (Number(p.overall) || 0), 0) / roster.length
      : null;
    return evaluateSellerDivisionFit({
      player: found.player,
      buyerDivision: buyer.division,
      sellerDivision: found.club.division,
      listed: !!found.player.listed,
      rosterAvgOvr,
      sellerPower: Number(found.club.power) || null,
      unit: () =>
        unitRoll(
          `sell-div-fit:${playerId}:${buyerName}:${found.clubName}:${getCareerSeason()}`,
        ),
    });
  };

  /** Preview do atalho caro (Fase 1 fechada) — chance sobe com a oferta. */
  const previewSellDownBuyout = (playerId, feeInput = 0) => {
    const { name: buyerName, club: buyer } = userClubState();
    if (!buyer) return null;
    const found = findPlayerInWorld( playerId);
    if (!found || found.clubName === buyerName) return null;
    const roster = found.club.roster;
    const rosterAvgOvr = roster?.length
      ? roster.reduce((sum, p) => sum + (Number(p.overall) || 0), 0) / roster.length
      : null;
    const value =
      Number(found.player.marketValue) ||
      estimatePlayerValue(found.player, found.club.division);
    return estimateSellDownBuyout({
      player: found.player,
      fee: feeInput,
      value,
      buyerDivision: buyer.division,
      sellerDivision: found.club.division,
      rosterAvgOvr,
      sellerPower: Number(found.club.power) || null,
      season: getCareerSeason(),
    });
  };

  return {
    TRANSFER_LIMITS: {
      minRoster,
      maxRoster,
      acceptRatio,
      maxLoans,
      minAcceptRatio,
      maxAcceptRatio,
      offerExpiryRounds,
      offerExpiryDays,
      offerRejectCooldownDays,
      aiBuyDealsPerTick,
      aiLoanDealsPerTick,
      userOffersPerTick,
      maxPendingUserOffers,
      userOfferChanceWeek,
      userOfferChanceDeadline,
      userOfferChancePostRound,
      loanOfferShare,
    },
    marketOpen,
    marketStatus,
    isBuyRestricted: () => {
      const { club } = userClubState();
      return isMarketBuyRestricted(club);
    },
    seedAiListings,
    seedAiLoanListings,
    listBuyCandidates,
    listSellCandidates,
    setListed,
    setLoanListed,
    buyPlayer,
    sellPlayer,
    loanPlayer,
    loanOutPlayer,
    returnLoanPlayer,
    exerciseLoanBuyOption,
    returnExpiredLoans,
    countIncomingLoans,
    countOutgoingLoans,
    loanSlots,
    evaluateSellerAccept,
    getBuyDivisionFit,
    previewSellDownBuyout,
    findPlayerInWorld,
    invalidatePlayerWorldIndex,
    estimatePlayerValue,
    hydratePendingOffers,
    snapshotPendingOffers,
    listPendingOffers,
    findPendingOffer,
    createIncomingOffer,
    attachOfferMessageId,
    acceptIncomingOffer,
    rejectIncomingOffer,
    evaluateUserPayroll: (opts = {}) => {
      const { club } = userClubState();
      if (!club) return null;
      return evaluateRosterPayroll(club, {
        division: club.division || 'A',
        ...payrollContext(),
        ...opts,
      });
    },
    previewLoanInPayroll: playerId => {
      const found = findPlayerInWorld( playerId);
      const { club: borrower } = userClubState();
      if (!found || !borrower) return null;
      const split = previewLoanHostWage(found.player, found.club, borrower, resolvePlayerRoundWage);
      const payroll = evaluateRosterPayroll(borrower, {
        division: borrower.division || 'A',
        extraWage: split.hostWage,
        rosterDelta: 1,
        ...payrollContext(),
      });
      return { ...split, payroll };
    },
    resolvePlayerWage: (player, division) =>
      resolvePlayerRoundWage(player, division || userClubState().club?.division || 'A'),
    resolveLoanHostWage: (player, ownerClub, hostClub) =>
      previewLoanHostWage(
        player,
        ownerClub,
        hostClub || userClubState().club,
        resolvePlayerRoundWage,
      ),
    expirePendingOffers,
    runAiMarketTick,
    snapshotSeasonDeals,
    hydrateSeasonDeals,
    clearSeasonDeals,
    buildWindowClosingReport,
    getMarketDayBrief,
    getWindowPhase: () => {
      const date = careerDate();
      return date ? getTransferWindowPhase(date) : getTransferWindowPhase(null);
    },
  };
}
