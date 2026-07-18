import { MODULE_VERSIONS } from '../../core/constants.js';
import { sponsorLogoSlug } from '../../engine/economy.js';

const SPONSOR_LOGO_URLS = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../../assets/sponsors/icons/*.png', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  ).map(([path, url]) => {
    const file = path.split('/').pop()?.replace(/\.png$/i, '') || '';
    return [file, url];
  }),
);

/**
 * Escritório + Estádio — orçamento/investimentos e gestão da arena.
 */
export function createEconomyFeature(deps) {
  const {
    $,
    onClick,
    listUpgrades,
    listStadiumUpgrades,
    purchaseUpgrade,
    purchaseStadiumUpgrade,
    formatBudget,
    formatCapacity,
    formatTicketPrice,
    getBalance,
    ensureStadium,
    getTicketPrices,
    adjustTicketPrice,
    estimateGateReceipt,
    getSponsors,
    getStructureLevel,
    getPitchLevel,
    maxPitchForStructure,
    pitchTierLabel,
    TICKET_PRICE_RANGE,
    getUserClub,
    getClubs,
    getUserDivision,
    getCareerSeason,
    onBudgetChanged,
    pushMessage,
    getCurrentRound,
    openView,
  } = deps;

  const userClubState = () => {
    const club = getClubs()[getUserClub()];
    if (!club) return null;
    ensureStadium?.(club, getUserDivision?.() || club.division || 'A');
    return club;
  };

  const renderUpgradeRows = (listEl, rows, buyAttr) => {
    if (!listEl) return;
    listEl.innerHTML = rows
      .map(row => {
        const locked = !!row.locked;
        const structureCapped = !!row.structureCapped;
        const levelText = locked
          ? '—'
          : structureCapped
            ? `${row.level}/${row.maxLevel}`
            : `${row.level}/${row.maxLevel}`;
        const disabled = locked || row.maxed || structureCapped || !row.affordable;
        const title = locked
          ? 'Disponível em atualização futura'
          : structureCapped
            ? 'Melhore a estrutura do estádio para liberar o próximo nível de gramado'
            : row.maxed
              ? 'Nível máximo'
              : row.affordable
                ? `Investir ${row.costLabel}`
                : `Saldo insuficiente (${row.costLabel})`;
        const actionLabel = locked
          ? 'EM BREVE'
          : row.maxed
            ? 'MÁX'
            : structureCapped
              ? 'ESTRUTURA'
              : row.costLabel;
        const buyAttrHtml = locked || structureCapped ? '' : `${buyAttr}="${row.id}"`;
        return `<div class="economy-invest-row${row.maxed ? ' maxed' : ''}${locked ? ' locked' : ''}${structureCapped ? ' structure-capped' : ''}" data-upgrade="${row.id}">
          <div>
            <b>${row.label}</b>
            <small>${row.description}</small>
          </div>
          <span class="economy-invest-level">${levelText}</span>
          <button type="button" ${buyAttrHtml} ${disabled ? 'disabled' : ''} title="${title}">
            ${actionLabel}
          </button>
        </div>`;
      })
      .join('');
  };

  const renderOffice = () => {
    const club = userClubState();
    if (!club) return;
    const balance = getBalance(club);
    const balanceEl = $('#officeBudgetValue');
    const metaEl = $('#officeBudgetMeta');
    const medicalEl = $('#officeMedicalLevel');
    const preventionEl = $('#officePreventionLevel');
    const capacityEl = $('#officeCapacityStat');
    if (balanceEl) balanceEl.textContent = formatBudget(balance);
    if (metaEl) {
      metaEl.textContent = `${getUserClub()} · Série ${getUserDivision?.() || club.division || 'A'} · caixa disponível para investimentos`;
    }
    if (medicalEl) medicalEl.textContent = `${Number(club.medicalInvestment) || 0}/5`;
    if (preventionEl) preventionEl.textContent = `${Number(club.preventionProgram) || 0}/3`;
    if (capacityEl) capacityEl.textContent = formatCapacity(club.stadiumCapacity);
    const financesEl = $('#officeFinancesStat');
    if (financesEl) financesEl.textContent = `${Math.round(Number(club.finances) || 0)}%`;
    renderInvestments();
    renderSponsors();
    renderLedger();
  };

  const sponsorCardHtml = (item, { master = false } = {}) => {
    const name = item?.name || '—';
    const slug = sponsorLogoSlug(name);
    const logoUrl = slug ? SPONSOR_LOGO_URLS[slug] : null;
    const size = master ? 96 : 88;
    const logo = logoUrl
      ? `<span class="office-sponsor-logo"><img src="${logoUrl}" alt="${name}" width="${size}" height="${size}" decoding="async"></span>`
      : `<span class="office-sponsor-logo missing" aria-hidden="true">${String(name).slice(0, 1)}</span>`;
    return `<div class="office-sponsor-card${master ? ' master' : ''}"><div class="office-sponsor-brand">${logo}<div class="office-sponsor-copy"><b>${name}</b><i class="office-sponsor-divider" aria-hidden="true"></i><strong>${formatBudget(item?.value)}</strong></div></div></div>`;
  };

  const renderSponsors = () => {
    const list = $('#officeSponsorsList');
    const meta = $('#officeSponsorsMeta');
    if (!list) return;
    const club = userClubState();
    const sponsors = getSponsors?.(club) || club?.sponsors;
    if (!sponsors?.master) {
      list.innerHTML = '<p class="office-sponsor-empty">Nenhum patrocínio ativo nesta temporada.</p>';
      return;
    }
    const season = sponsors.season || getCareerSeason?.() || '—';
    if (meta) {
      meta.textContent = `Temporada ${season} · Série ${sponsors.division || getUserDivision?.() || 'A'} · total ${formatBudget(sponsors.total || 0)}`;
    }
    const cards = [
      sponsorCardHtml(sponsors.master, { master: true }),
      ...(sponsors.secondaries || []).map(item => sponsorCardHtml(item)),
    ];
    list.innerHTML = cards.join('');
  };

  const renderInvestments = () => {
    const club = userClubState();
    renderUpgradeRows($('#economyInvestmentsList'), club ? listUpgrades(club) : [], 'data-buy-upgrade');
  };

  const renderStadium = () => {
    const club = userClubState();
    if (!club) return;
    const division = getUserDivision?.() || club.division || 'A';
    const nameEl = $('#stadiumNameLabel');
    const capacityEl = $('#stadiumCapacityValue');
    const structureEl = $('#stadiumStructureValue');
    const pitchEl = $('#stadiumPitchValue');
    const pitchCapEl = $('#stadiumPitchCapValue');
    const gateNatEl = $('#stadiumGateNational');
    const gateCupEl = $('#stadiumGateCups');
    const hintEl = $('#stadiumGateHint');
    const national = estimateGateReceipt(club, { channel: 'national', division });
    const cups = estimateGateReceipt(club, { channel: 'cups', division });
    const structureLevel = getStructureLevel?.(club) ?? (Number(club.stadiumStructure) || 0);
    const pitchLevel = getPitchLevel?.(club) ?? (Number(club.pitchLevel) || 0);
    const pitchCap = maxPitchForStructure?.(structureLevel) ?? Math.min(5, structureLevel + 1);
    if (nameEl) nameEl.textContent = club.stadiumName || 'Estádio Solar';
    if (capacityEl) capacityEl.textContent = formatCapacity(club.stadiumCapacity);
    if (structureEl) structureEl.textContent = `${structureLevel}/5`;
    if (pitchEl) pitchEl.textContent = pitchTierLabel?.(club) || 'Médio';
    if (pitchCapEl) pitchCapEl.textContent = `${pitchLevel}/${pitchCap}`;
    if (gateNatEl) gateNatEl.textContent = formatBudget(national.revenue);
    if (gateCupEl) gateCupEl.textContent = formatBudget(cups.revenue);
    if (hintEl) {
      const env = Math.round(Number(club.environment) || 0);
      hintEl.textContent = `Lotação no dia do jogo varia com Ambiente (${env}%), torcida, preço e fase (mata-mata agudo enche mais). Estimativa média: Nacional ${Math.round(national.fillRate * 100)}% · Copas ${Math.round(cups.fillRate * 100)}%. Gramado limitado pela estrutura (${structureLevel}/5).`;
    }
    renderUpgradeRows($('#stadiumUpgradesList'), listStadiumUpgrades(club), 'data-buy-stadium');
    renderTickets(club);
  };

  const renderTickets = club => {
    const list = $('#stadiumTicketsList');
    if (!list) return;
    const prices = getTicketPrices(club);
    const channels = [
      {
        id: 'national',
        label: 'Campeonato Nacional',
        description: 'Brasileirão e confrontos de liga em casa.',
        price: prices.national,
        range: TICKET_PRICE_RANGE.national,
      },
      {
        id: 'cups',
        label: 'Copas',
        description: 'Copa do Brasil e eliminatórias em casa.',
        price: prices.cups,
        range: TICKET_PRICE_RANGE.cups,
      },
    ];
    list.innerHTML = channels
      .map(channel => {
        const atMin = channel.price <= channel.range.min;
        const atMax = channel.price >= channel.range.max;
        return `<div class="stadium-ticket-row" data-ticket-channel="${channel.id}">
          <div>
            <b>${channel.label}</b>
            <small>${channel.description}</small>
          </div>
          <span class="stadium-ticket-price">${formatTicketPrice(channel.price)}</span>
          <div class="stadium-ticket-controls">
            <button type="button" class="stadium-ticket-step" data-ticket-adjust="${channel.id}" data-delta="-${channel.range.step}" ${atMin ? 'disabled' : ''} aria-label="Diminuir ingresso ${channel.label}">−</button>
            <button type="button" class="stadium-ticket-step" data-ticket-adjust="${channel.id}" data-delta="${channel.range.step}" ${atMax ? 'disabled' : ''} aria-label="Aumentar ingresso ${channel.label}">+</button>
          </div>
        </div>`;
      })
      .join('');
  };

  const renderLedger = () => {
    const list = $('#officeLedgerList');
    if (!list) return;
    const club = userClubState();
    const ledger = Array.isArray(club?.budgetLedger) ? club.budgetLedger : [];
    if (!ledger.length) {
      list.innerHTML =
        '<p class="office-ledger-empty">Nenhum movimento registrado ainda. Premiações, bilheteria e investimentos aparecem aqui.</p>';
      return;
    }
    list.innerHTML = ledger
      .slice(0, 20)
      .map(entry => {
        const sign = entry.type === 'credit' ? '+' : '−';
        const tone = entry.type === 'credit' ? 'credit' : 'spend';
        return `<div class="office-ledger-row"><span>${entry.label || entry.reason || 'Movimento'}</span><b class="${tone}">${sign} ${formatBudget(entry.amount)}</b></div>`;
      })
      .join('');
  };

  const upgradeTitle = upgradeId =>
    ({
      medical_dept: 'Departamento médico',
      prevention: 'Programa de prevenção',
      pitch: 'Manutenção do gramado',
      structure: 'Estrutura do estádio',
      capacity: 'Expansão de capacidade',
    })[upgradeId] || upgradeId;

  const handlePurchase = (upgradeId, buyFn) => {
    const club = userClubState();
    if (!club) return;
    const result = buyFn(club, upgradeId);
      if (!result.ok) {
      if (result.error === 'insufficient_funds') {
        pushMessage?.({
          category: 'club',
          type: 'budget',
          title: 'Orçamento insuficiente',
          body: 'Não há saldo para este investimento. Espere a premiação/bilheteria ou escolha um upgrade mais barato.',
          round: getCurrentRound?.() ?? 1,
          meta: { competition: 'Finanças' },
        });
      } else if (result.error === 'structure_cap') {
        pushMessage?.({
          category: 'club',
          type: 'budget',
          title: 'Estrutura insuficiente',
          body: 'O gramado já está no limite da estrutura atual. Invista em Estrutura do estádio para liberar novos níveis.',
          round: getCurrentRound?.() ?? 1,
          meta: { competition: 'Estádio' },
        });
      }
      renderOffice();
      renderStadium();
      onBudgetChanged?.();
      return;
    }
    pushMessage?.({
      category: 'club',
      type: 'budget',
      title: `Investimento · ${upgradeTitle(upgradeId)}`,
      body: `Gasto de ${formatBudget(result.cost)}. Nível ${result.level}. Orçamento atual: ${formatBudget(result.balance)}.`,
      round: getCurrentRound?.() ?? 1,
      meta: { competition: 'Finanças', upgradeId },
    });
    renderOffice();
    renderStadium();
    onBudgetChanged?.();
  };

  const bindHandlers = () => {
    onClick('#economyInvestmentsList', event => {
      const button = event.target.closest('[data-buy-upgrade]');
      if (!button || button.disabled) return;
      handlePurchase(button.dataset.buyUpgrade, purchaseUpgrade);
    });

    onClick('#stadiumUpgradesList', event => {
      const button = event.target.closest('[data-buy-stadium]');
      if (!button || button.disabled) return;
      handlePurchase(button.dataset.buyStadium, purchaseStadiumUpgrade || purchaseUpgrade);
    });

    onClick('#stadiumTicketsList', event => {
      const button = event.target.closest('[data-ticket-adjust]');
      if (!button || button.disabled) return;
      const club = userClubState();
      if (!club) return;
      adjustTicketPrice(club, button.dataset.ticketAdjust, Number(button.dataset.delta));
      renderStadium();
      onBudgetChanged?.();
    });

    onClick('#openOfficeFromDashboard', () => openView?.('office'));
    onClick('#openStadiumFromDashboard', () => openView?.('stadium'));
    document.addEventListener('keydown', event => {
      const targetId = event.target?.id;
      if (targetId !== 'openOfficeFromDashboard' && targetId !== 'openStadiumFromDashboard') return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openView?.(targetId === 'openStadiumFromDashboard' ? 'stadium' : 'office');
    });
  };

  return {
    moduleVersion: MODULE_VERSIONS.economy,
    renderOffice,
    renderInvestments,
    renderSponsors,
    renderStadium,
    bindHandlers,
    init: () => {
      bindHandlers();
      renderOffice();
      renderStadium();
    },
  };
}
