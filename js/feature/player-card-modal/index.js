/**
 * Modal de card do jogador — clique no nome abre card interativo.
 */

import { mountMatchdayCard } from '../../lab/player-card-system.js';
import { rosterPlayerToCardPlayer } from '../player-card/roster-card-player.js';
import { resolvePlayerId } from '../../engine/player-identity.js';

const MODAL_ID = 'playerCardModal';
let cardHandlersBound = false;

function ensureModal() {
  if (document.getElementById(MODAL_ID)) return;
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="${MODAL_ID}" class="modal hidden player-card-modal" role="dialog" aria-modal="true" aria-label="Card do jogador">
      <div class="player-card-modal-shell">
        <div id="playerCardMount" class="player-card-modal-mount"></div>
      </div>
    </div>`,
  );
}

export function createPlayerCardModal(deps = {}) {
  ensureModal();

  const modal = () => document.getElementById(MODAL_ID);
  const mountEl = () => document.getElementById('playerCardMount');
  let openCtx = null;

  const close = () => {
    modal()?.classList.add('hidden');
    const mount = mountEl();
    if (mount) mount.innerHTML = '';
    openCtx = null;
  };

  const resolvePlayer = (playerId, clubName) => {
    if (!playerId) return null;
    const finder = deps.findPlayerInWorld;
    if (typeof finder === 'function') {
      const found = finder(playerId);
      if (found?.player) return { player: found.player, clubName: found.clubName || clubName || null };
    }
    const squad = deps.getUserSquad?.() || [];
    const local = squad.find(p => resolvePlayerId(p) === playerId);
    if (local) return { player: local, clubName: deps.getUserClub?.() || null };
    return null;
  };

  const open = async ({ playerId, clubName = null } = {}) => {
    const resolved = resolvePlayer(playerId, clubName);
    if (!resolved?.player) return false;

    const { player, clubName: ownerClub } = resolved;
    const userClub = deps.getUserClub?.() || '';
    const isOwn = ownerClub === userClub;
    const transfers = deps.getTransfersUi?.();
    const engine = deps.getTransfersEngine?.();
    const marketOpen = engine?.marketOpen?.() ?? false;
    const actionsEnabled = marketOpen && !!transfers;
    const actionMode = isOwn ? 'sell' : 'buy';

    openCtx = { playerId: resolvePlayerId(player), isOwn, ownerClub };

    const cardPlayer = rosterPlayerToCardPlayer(player, {
      playerHistory: deps.getPlayerHistory?.(),
      careerSeason: deps.getCareerSeason?.(),
    });

    modal()?.classList.remove('hidden');

    mountMatchdayCard(mountEl(), cardPlayer, {
      interactive: true,
      showActions: true,
      actionMode,
      actionsEnabled,
      cardArt: cardPlayer._cardArt,
      onSell: () => {
        if (!actionsEnabled || !isOwn) return;
        close();
        transfers?.openSellFromCard?.(resolvePlayerId(player));
      },
      onBuy: () => {
        if (!actionsEnabled || isOwn) return;
        close();
        transfers?.openBuyFromCard?.(resolvePlayerId(player));
      },
      onLoan: () => {
        if (!actionsEnabled) return;
        close();
        if (isOwn) {
          transfers?.openLoanOutFromCard?.(resolvePlayerId(player));
        } else {
          transfers?.openLoanInFromCard?.(resolvePlayerId(player));
        }
      },
    });

    return true;
  };

  const bindHandlers = () => {
    if (cardHandlersBound) return;
    cardHandlersBound = true;
    const blockedCardRoot =
      '.match-report-modal, .match-report-ratings, .match-report-name, #matchReportContent';

    const handleCardTrigger = (event, trigger) => {
      if (!trigger || trigger.closest(blockedCardRoot)) return false;
      event.preventDefault();
      event.stopPropagation();
      const playerId = trigger.dataset.playerId;
      const clubName = trigger.dataset.playerClub || null;
      open({ playerId, clubName });
      return true;
    };

    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-open-player-card]');
      if (!trigger) return;
      handleCardTrigger(event, trigger);
    });

    document.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const trigger = event.target.closest('[data-open-player-card]');
      if (!trigger) return;
      if (handleCardTrigger(event, trigger)) event.preventDefault();
    });

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (modal()?.classList.contains('hidden')) return;
      close();
    });

    modal()?.addEventListener('click', event => {
      if (event.target === modal()) close();
    });
  };

  return { open, close, bindHandlers };
}
