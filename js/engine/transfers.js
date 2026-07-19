/**
 * Motor de transferências (MVP): compra/venda à vista, IA aceita por % do valor.
 */

import { resolvePlayerId } from './player-identity.js';
import { ensureMarketFields, estimatePlayerValue, refreshMarketFields } from './player-value.js';

export const TRANSFER_LIMITS = {
  minRoster: 18,
  maxRoster: 28,
  acceptRatio: 0.85,
};

const findPlayerInWorld = (clubs, playerId) => {
  if (!playerId || !clubs) return null;
  for (const [clubName, club] of Object.entries(clubs)) {
    const roster = club?.roster;
    if (!Array.isArray(roster)) continue;
    const index = roster.findIndex(player => resolvePlayerId(player) === playerId);
    if (index >= 0) return { clubName, club, player: roster[index], index };
  }
  return null;
};

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
  } = deps;

  const userClubState = () => {
    const name = getUserClub();
    return { name, club: getClubs()?.[name] || null };
  };

  const marketOpen = () =>
    typeof deps.isMarketOpen === 'function' ? !!deps.isMarketOpen() : true;

  const listBuyCandidates = (filters = {}) => {
    const { name: userName } = userClubState();
    const clubs = getClubs() || {};
    const pos = filters.pos || null;
    const division = filters.division || null;
    const minOvr = Number(filters.minOvr) || 0;
    const query = String(filters.query || '')
      .trim()
      .toLocaleLowerCase('pt-BR');
    const listedOnly = filters.listedOnly === true;

    const rows = [];
    Object.entries(clubs).forEach(([clubName, club]) => {
      if (clubName === userName || !Array.isArray(club?.roster)) return;
      if (division && club.division !== division) return;
      club.roster.forEach(player => {
        ensureMarketFields(player, {
          division: club.division,
          season: getCareerSeason(),
        });
        if (listedOnly && !player.listed) return;
        if (pos && player.pos !== pos) return;
        if ((player.overall || 0) < minOvr) return;
        if (query && !String(player.name || '').toLocaleLowerCase('pt-BR').includes(query)) {
          return;
        }
        const value = Number(player.marketValue) || estimatePlayerValue(player, club.division);
        const price = player.listed && player.askingPrice > 0 ? Number(player.askingPrice) : value;
        rows.push({
          playerId: resolvePlayerId(player),
          player,
          clubName,
          division: club.division,
          value,
          price,
        });
      });
    });

    rows.sort((a, b) => b.player.overall - a.player.overall || a.price - b.price);
    return rows;
  };

  const listSellCandidates = () => {
    const { club } = userClubState();
    if (!club?.roster) return [];
    return club.roster.map(player => {
      ensureMarketFields(player, {
        division: club.division,
        season: getCareerSeason(),
      });
      return {
        playerId: resolvePlayerId(player),
        player,
        value: Number(player.marketValue) || estimatePlayerValue(player, club.division),
        listed: !!player.listed,
        askingPrice: player.askingPrice,
      };
    });
  };

  const setListed = (playerId, listed, askingPrice = null) => {
    const { club } = userClubState();
    if (!club) return { ok: false, reason: 'no_club' };
    const player = club.roster.find(item => resolvePlayerId(item) === playerId);
    if (!player) return { ok: false, reason: 'not_found' };
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

  const evaluateSellerAccept = (player, fee, sellerDivision) => {
    const value = Number(player.marketValue) || estimatePlayerValue(player, sellerDivision);
    const ask = player.listed && player.askingPrice > 0 ? Number(player.askingPrice) : value;
    const floor = Math.round(Math.min(ask, value) * acceptRatio);
    return { value, ask, floor, accept: fee >= floor };
  };

  /**
   * Compra jogador de outro clube (fee à vista).
   */
  const buyPlayer = (playerId, feeInput = null) => {
    if (!marketOpen()) return { ok: false, reason: 'market_closed' };
    const { name: buyerName, club: buyer } = userClubState();
    if (!buyer) return { ok: false, reason: 'no_club' };
    if (buyer.roster.length >= maxRoster) return { ok: false, reason: 'roster_full' };

    const found = findPlayerInWorld(getClubs(), playerId);
    if (!found || found.clubName === buyerName) return { ok: false, reason: 'not_found' };
    const { club: seller, player, index, clubName: sellerName } = found;
    if (seller.roster.length <= minRoster) return { ok: false, reason: 'seller_min_roster' };

    ensureMarketFields(player, { division: seller.division, season: getCareerSeason() });
    const value = Number(player.marketValue) || estimatePlayerValue(player, seller.division);
    const fee =
      feeInput != null && Number(feeInput) > 0
        ? Math.round(Number(feeInput))
        : player.listed && player.askingPrice > 0
          ? Math.round(Number(player.askingPrice))
          : value;

    const verdict = evaluateSellerAccept(player, fee, seller.division);
    if (!verdict.accept) {
      return { ok: false, reason: 'rejected', fee, floor: verdict.floor, value: verdict.value };
    }
    if (!canAfford(buyer, fee)) return { ok: false, reason: 'cannot_afford', fee };

    const paid = spend(buyer, fee, {
      reason: 'transfer',
      label: `Contratação · ${player.name}`,
      meta: { playerId, from: sellerName, to: buyerName, fee },
    });
    if (!paid?.ok) return { ok: false, reason: 'cannot_afford', fee };

    seller.roster.splice(index, 1);
    const moved = { ...player, listed: false, askingPrice: null };
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
      player: moved,
      fee,
      from: sellerName,
      to: buyerName,
      value: verdict.value,
    };
    onAfterTransfer?.(result);
    return result;
  };

  /**
   * Vende jogador do usuário para um clube IA (melhor oferta automática).
   */
  const sellPlayer = (playerId, feeInput = null) => {
    if (!marketOpen()) return { ok: false, reason: 'market_closed' };
    const { name: sellerName, club: seller } = userClubState();
    if (!seller) return { ok: false, reason: 'no_club' };
    if (seller.roster.length <= minRoster) return { ok: false, reason: 'min_roster' };

    const index = seller.roster.findIndex(item => resolvePlayerId(item) === playerId);
    if (index < 0) return { ok: false, reason: 'not_found' };
    const player = seller.roster[index];
    ensureMarketFields(player, { division: seller.division, season: getCareerSeason() });
    const value = Number(player.marketValue) || estimatePlayerValue(player, seller.division);
    const fee =
      feeInput != null && Number(feeInput) > 0
        ? Math.round(Number(feeInput))
        : player.askingPrice > 0
          ? Math.round(Number(player.askingPrice))
          : value;

    // MVP: IA sempre encontra comprador (não exige caixa real nos clubes gerados).
    const clubs = getClubs() || {};
    const buyers = Object.entries(clubs)
      .filter(([name, club]) => name !== sellerName && Array.isArray(club?.roster))
      .filter(([, club]) => club.roster.length < maxRoster)
      .map(([name, club]) => {
        const needPos = club.roster.filter(item => item.pos === player.pos).length < 3;
        const score =
          (needPos ? 30 : 0) +
          (club.division === seller.division ? 20 : 0) +
          (Number(club.power) || 60);
        return { name, club, score };
      })
      .sort((a, b) => b.score - a.score);

    const buyerEntry = buyers[0];
    if (!buyerEntry) return { ok: false, reason: 'no_buyer', fee, value };

    seller.roster.splice(index, 1);
    const moved = { ...player, listed: false, askingPrice: null };
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
      player: moved,
      fee,
      from: sellerName,
      to: buyerEntry.name,
      value,
    };
    onAfterTransfer?.(result);
    return result;
  };

  return {
    TRANSFER_LIMITS: { minRoster, maxRoster, acceptRatio },
    marketOpen,
    listBuyCandidates,
    listSellCandidates,
    setListed,
    buyPlayer,
    sellPlayer,
    evaluateSellerAccept,
    findPlayerInWorld: playerId => findPlayerInWorld(getClubs(), playerId),
    estimatePlayerValue,
  };
}
