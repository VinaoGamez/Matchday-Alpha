import { MODULE_VERSIONS } from '../../core/constants.js';
import { on, onClick } from '../../ui/dom.js';
import { resolvePlayerId } from '../../engine/player-identity.js';
import {
  playerRenameBlocked,
  renamePlayerInRoster,
} from '../../engine/player-names.js';
import { flagImgMarkup } from '../../lab/card-nation-flags.js';

const escHtml = value =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');

/**
 * UI de renomeação do elenco (Elenco + Táticas) — 1 alteração por jogador/temporada.
 */
export function createPlayerRenameFeature(deps) {
  const {
    playerNameCell,
    getUserClub,
    getCareerSeason,
    getRoster,
    canRenamePlayer = () => true,
    onRenamed,
  } = deps;

  let activeRenameId = null;
  let renameError = '';

  const blocked = player => playerRenameBlocked(player, getCareerSeason());

  const canEdit = player => canRenamePlayer() && !blocked(player).blocked;

  const renderNationCell = player => {
    const nation = player?.nationality || 'Brasil';
    const flag = flagImgMarkup(nation, player?.nationalityIso);
    if (flag) {
      return `<span class="roster-nation-cell" title="${escHtml(nation)}">${flag}</span>`;
    }
    return `<span class="roster-nation-cell roster-nation-fallback" title="${escHtml(nation)}">${escHtml(nation.slice(0, 3).toUpperCase())}</span>`;
  };

  const renderNameCell = (player, cellOptions = {}) => {
    const playerId = resolvePlayerId(player) || '';
    const editing = activeRenameId && playerId && activeRenameId === playerId;
    const clubName = cellOptions.clubName ?? getUserClub?.() ?? '';

    if (editing) {
      const err = renameError
        ? `<small class="roster-rename-error">${escHtml(renameError)}</small>`
        : '';
      return `<span class="roster-name-wrap is-editing"><input type="text" class="roster-name-input" data-roster-rename-input="${escHtml(playerId)}" value="${escHtml(player.name)}" maxlength="40" aria-label="Nome do jogador"><button type="button" class="roster-rename-save" data-roster-rename-save="${escHtml(playerId)}" title="Salvar nome">✓</button><button type="button" class="roster-rename-cancel" data-roster-rename-cancel title="Cancelar">×</button>${err}</span>`;
    }

    const block = blocked(player);
    let pencil = '';
    if (canRenamePlayer() && playerId) {
      if (block.blocked) {
        pencil = `<button type="button" class="roster-rename-btn is-disabled" disabled title="${escHtml(block.reason)}">✎</button>`;
      } else {
        pencil = `<button type="button" class="roster-rename-btn" data-roster-rename="${escHtml(playerId)}" title="Renomear jogador (1× por temporada)" aria-label="Renomear ${escHtml(player.name)}">✎</button>`;
      }
    }

    return `<span class="roster-name-wrap">${playerNameCell(player.name, player, {
      allCompetitions: true,
      showLoan: cellOptions.showLoan !== false,
      openCard: cellOptions.openCard !== false,
      clubName,
      prefix: cellOptions.prefix || '',
      liveState: cellOptions.liveState || null,
    })}${pencil}</span>`;
  };

  const commitRename = playerId => {
    const input = document.querySelector(`[data-roster-rename-input="${playerId}"]`);
    const nextName = input?.value ?? '';
    const roster = getRoster?.() || [];
    const result = renamePlayerInRoster(roster, playerId, nextName, {
      currentSeason: getCareerSeason?.(),
    });
    if (!result.ok) {
      renameError = result.error || 'Não foi possível renomear.';
      onRenamed?.({ edited: true });
      return;
    }
    renameError = '';
    activeRenameId = null;
    onRenamed?.({ saved: true });
  };

  const cancelRename = () => {
    activeRenameId = null;
    renameError = '';
    onRenamed?.({ edited: true });
  };

  const focusActiveInput = () => {
    if (!activeRenameId) return;
    const input = document.querySelector(`[data-roster-rename-input="${activeRenameId}"]`);
    input?.focus();
    input?.select();
  };

  const bindHandlers = rootSelector => {
    onClick(rootSelector, event => {
      if (event.target.closest('[data-open-player-card]')) return;
      const renameBtn = event.target.closest('[data-roster-rename]');
      if (renameBtn) {
        event.preventDefault();
        event.stopPropagation();
        if (!canRenamePlayer()) return;
        activeRenameId = renameBtn.dataset.rosterRename || null;
        renameError = '';
        onRenamed?.({ edited: true });
        return;
      }
      const saveBtn = event.target.closest('[data-roster-rename-save]');
      if (saveBtn) {
        commitRename(saveBtn.dataset.rosterRenameSave || '');
        return;
      }
      if (event.target.closest('[data-roster-rename-cancel]')) {
        cancelRename();
      }
    });

    on(rootSelector, 'keydown', event => {
      const input = event.target.closest('[data-roster-rename-input]');
      if (!input) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        commitRename(input.dataset.rosterRenameInput || '');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelRename();
      }
    });
  };

  return {
    moduleVersion: MODULE_VERSIONS.playerRename ?? 1,
    renderNameCell,
    renderNationCell,
    bindHandlers,
    focusActiveInput,
    canEdit,
    getActiveRenameId: () => activeRenameId,
  };
}
