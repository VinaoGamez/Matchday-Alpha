import { MODULE_VERSIONS } from '../../core/constants.js';

const POSITIONS = ['GOL', 'ZAG', 'LAT', 'VOL', 'MC', 'MEI', 'PE', 'PD', 'ATA'];
const DIVISIONS = ['A', 'B', 'C', 'D'];

const escapeHtml = value =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatMoney = value => {
  const amount = Math.round(Number(value) || 0);
  if (amount >= 1_000_000) return `R$ ${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)} mi`;
  if (amount >= 1_000) return `R$ ${(amount / 1_000).toFixed(0)} mil`;
  return `R$ ${amount}`;
};

/**
 * UI do mercado de transferências.
 */
export function createTransfersFeature(deps) {
  const {
    $,
    onClick,
    getTransfersEngine,
    getBalance,
    getUserClub,
    getUserDivision,
    formatBudget,
    pushMessage,
    onDealComplete,
    getCurrentRound,
  } = deps;

  let tab = 'buy';
  let filters = { pos: '', division: '', query: '', minOvr: 0 };
  let persistSeason = typeof deps.onPersist === 'function' ? deps.onPersist : () => {};
  let statusText = '';

  const setPersist = fn => {
    persistSeason = typeof fn === 'function' ? fn : () => {};
  };

  const engine = () => getTransfersEngine?.();

  const setStatus = text => {
    statusText = text || '';
    const el = $('#transfersStatus');
    if (el) el.textContent = statusText;
  };

  const reasonLabel = reason =>
    ({
      market_closed: 'Mercado fechado no momento (partida ou transição em andamento).',
      cannot_afford: 'Caixa insuficiente para esta oferta.',
      rejected: 'O clube recusou a oferta (abaixo do valor mínimo).',
      roster_full: 'Seu elenco está no limite máximo.',
      min_roster: 'Elenco no mínimo — não é possível vender.',
      seller_min_roster: 'O clube vendedor não pode ficar abaixo do mínimo.',
      not_found: 'Jogador não encontrado.',
      no_buyer: 'Nenhum clube interessado no momento.',
      no_club: 'Clube inválido.',
    })[reason] || 'Não foi possível concluir a operação.';

  const renderFilters = () => {
    const pos = $('#transfersFilterPos');
    const div = $('#transfersFilterDivision');
    if (pos && !pos.dataset.ready) {
      pos.innerHTML =
        `<option value="">POSIÇÃO</option>` +
        POSITIONS.map(item => `<option value="${item}">${item}</option>`).join('');
      pos.dataset.ready = '1';
    }
    if (div && !div.dataset.ready) {
      div.innerHTML =
        `<option value="">DIVISÃO</option>` +
        DIVISIONS.map(item => `<option value="${item}">Série ${item}</option>`).join('');
      div.dataset.ready = '1';
    }
    if (pos) pos.value = filters.pos || '';
    if (div) div.value = filters.division || '';
    const query = $('#transfersFilterQuery');
    if (query) query.value = filters.query || '';
    const ovr = $('#transfersFilterOvr');
    if (ovr) ovr.value = filters.minOvr || '';
  };

  const renderBuyTable = () => {
    const body = $('#transfersBuyBody');
    if (!body) return;
    const api = engine();
    if (!api) {
      body.innerHTML = '<div class="transfers-empty">Motor de transferências indisponível.</div>';
      return;
    }
    const rows = api.listBuyCandidates({
      pos: filters.pos || null,
      division: filters.division || null,
      query: filters.query || '',
      minOvr: Number(filters.minOvr) || 0,
      listedOnly: false,
    });
    if (!rows.length) {
      body.innerHTML = '<div class="transfers-empty">Nenhum jogador encontrado com estes filtros.</div>';
      return;
    }
    body.innerHTML = rows
      .slice(0, 80)
      .map(row => {
        const p = row.player;
        return `<article class="transfers-row" data-buy-id="${escapeHtml(row.playerId)}">
          <div class="transfers-row-main">
            <strong>${escapeHtml(p.name)}</strong>
            <small>${escapeHtml(p.pos)} · ${p.age} anos · OVR ${p.overall} · ${escapeHtml(row.clubName)} · Série ${row.division}</small>
          </div>
          <div class="transfers-row-meta">
            <span>${formatMoney(row.price)}</span>
            <button type="button" class="transfers-action" data-buy-id="${escapeHtml(row.playerId)}">COMPRAR</button>
          </div>
        </article>`;
      })
      .join('');
  };

  const renderSellTable = () => {
    const body = $('#transfersSellBody');
    if (!body) return;
    const api = engine();
    if (!api) {
      body.innerHTML = '<div class="transfers-empty">Motor de transferências indisponível.</div>';
      return;
    }
    const rows = api.listSellCandidates();
    body.innerHTML = rows.length
      ? rows
          .map(row => {
            const p = row.player;
            return `<article class="transfers-row" data-sell-id="${escapeHtml(row.playerId)}">
              <div class="transfers-row-main">
                <strong>${escapeHtml(p.name)}</strong>
                <small>${escapeHtml(p.pos)} · ${p.age} anos · OVR ${p.overall}${row.listed ? ' · LISTADO' : ''}</small>
              </div>
              <div class="transfers-row-meta">
                <span>${formatMoney(row.value)}</span>
                <button type="button" class="transfers-action secondary" data-list-id="${escapeHtml(row.playerId)}" data-listed="${row.listed ? '1' : '0'}">${row.listed ? 'DESLISTAR' : 'LISTAR'}</button>
                <button type="button" class="transfers-action" data-sell-id="${escapeHtml(row.playerId)}">VENDER</button>
              </div>
            </article>`;
          })
          .join('')
      : '<div class="transfers-empty">Seu elenco está vazio.</div>';
  };

  const renderHeader = () => {
    const bal = $('#transfersBalance');
    const open = $('#transfersMarketState');
    const api = engine();
    if (bal && formatBudget && getBalance) {
      const clubName = getUserClub?.();
      // balance via getBalance needs club object — deps may pass getUserBalance number
      if (typeof getBalance === 'function') {
        try {
          bal.textContent = formatBudget(getBalance());
        } catch {
          bal.textContent = '—';
        }
      }
    }
    if (open && api) {
      const isOpen = api.marketOpen();
      open.textContent = isOpen ? 'MERCADO ABERTO' : 'MERCADO FECHADO';
      open.classList.toggle('is-closed', !isOpen);
    }
    const clubLine = $('#transfersClubLine');
    if (clubLine) {
      clubLine.textContent = `${getUserClub?.() || '—'} · Série ${getUserDivision?.() || '—'}`;
    }
  };

  const render = () => {
    const root = $('#transfers');
    if (!root) return;
    root.classList.remove('coming-soon-view');
    renderHeader();
    renderFilters();
    $$tabs();
    if (tab === 'sell') {
      $('#transfersBuyPanel')?.classList.add('hidden');
      $('#transfersSellPanel')?.classList.remove('hidden');
      renderSellTable();
    } else {
      $('#transfersSellPanel')?.classList.add('hidden');
      $('#transfersBuyPanel')?.classList.remove('hidden');
      renderBuyTable();
    }
    setStatus(statusText);
  };

  const $$tabs = () => {
    const buttons = document.querySelectorAll('[data-transfers-tab]');
    buttons.forEach(button => {
      button.classList.toggle('is-active', button.dataset.transfersTab === tab);
    });
  };

  const confirmBuy = playerId => {
    const api = engine();
    if (!api) return;
    const found = api.findPlayerInWorld(playerId);
    if (!found) {
      setStatus(reasonLabel('not_found'));
      return;
    }
    const price =
      found.player.listed && found.player.askingPrice > 0
        ? found.player.askingPrice
        : found.player.marketValue;
    const ok = window.confirm(
      `Contratar ${found.player.name} (${found.clubName}) por ${formatMoney(price)}?`,
    );
    if (!ok) return;
    const result = api.buyPlayer(playerId, price);
    if (!result.ok) {
      setStatus(reasonLabel(result.reason) + (result.fee ? ` (${formatMoney(result.fee)})` : ''));
      if (result.reason === 'rejected' && result.floor) {
        setStatus(`Oferta recusada. Mínimo aproximado: ${formatMoney(result.floor)}.`);
      }
      render();
      return;
    }
    pushMessage?.({
      category: 'transfer',
      type: 'deal',
      title: 'Contratação concluída',
      body: `${result.player.name} chegou ao ${result.to} por ${formatMoney(result.fee)} (vindo de ${result.from}).`,
      round: getCurrentRound?.() || 1,
      meta: { competition: 'Mercado', playerId: result.player.playerId, fee: result.fee },
    });
    setStatus(`Contratado: ${result.player.name} · ${formatMoney(result.fee)}`);
    onDealComplete?.(result);
    persistSeason();
    render();
  };

  const confirmSell = playerId => {
    const api = engine();
    if (!api) return;
    const row = api.listSellCandidates().find(item => item.playerId === playerId);
    if (!row) {
      setStatus(reasonLabel('not_found'));
      return;
    }
    const ok = window.confirm(`Vender ${row.player.name} por cerca de ${formatMoney(row.value)}?`);
    if (!ok) return;
    const result = api.sellPlayer(playerId, row.value);
    if (!result.ok) {
      setStatus(reasonLabel(result.reason));
      render();
      return;
    }
    pushMessage?.({
      category: 'transfer',
      type: 'deal',
      title: 'Venda concluída',
      body: `${result.player.name} foi negociado com ${result.to} por ${formatMoney(result.fee)}.`,
      round: getCurrentRound?.() || 1,
      meta: { competition: 'Mercado', playerId: result.player.playerId, fee: result.fee },
    });
    setStatus(`Vendido: ${result.player.name} → ${result.to} · ${formatMoney(result.fee)}`);
    onDealComplete?.(result);
    persistSeason();
    render();
  };

  const toggleList = (playerId, currentlyListed) => {
    const api = engine();
    if (!api) return;
    const result = api.setListed(playerId, !currentlyListed);
    if (!result.ok) {
      setStatus(reasonLabel(result.reason));
      return;
    }
    setStatus(
      result.player.listed
        ? `${result.player.name} listado por ${formatMoney(result.player.askingPrice)}`
        : `${result.player.name} removido da lista`,
    );
    persistSeason();
    render();
  };

  const bindHandlers = () => {
    onClick('#transfersTabs', event => {
      const button = event.target.closest('[data-transfers-tab]');
      if (!button) return;
      tab = button.dataset.transfersTab === 'sell' ? 'sell' : 'buy';
      render();
    });
    onClick('#transfersApplyFilters', () => {
      filters = {
        pos: $('#transfersFilterPos')?.value || '',
        division: $('#transfersFilterDivision')?.value || '',
        query: $('#transfersFilterQuery')?.value || '',
        minOvr: Number($('#transfersFilterOvr')?.value) || 0,
      };
      render();
    });
    onClick('#transfersBuyBody', event => {
      const button = event.target.closest('[data-buy-id]');
      if (!button) return;
      confirmBuy(button.dataset.buyId);
    });
    onClick('#transfersSellBody', event => {
      const sell = event.target.closest('[data-sell-id]');
      if (sell) {
        confirmSell(sell.dataset.sellId);
        return;
      }
      const list = event.target.closest('[data-list-id]');
      if (list) toggleList(list.dataset.listId, list.dataset.listed === '1');
    });
  };

  return {
    moduleVersion: MODULE_VERSIONS.transfers || 1,
    render,
    bindHandlers,
    setPersist,
  };
}
