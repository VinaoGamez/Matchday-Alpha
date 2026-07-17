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

  const injectStyles = () => {
    const existing = $('#economyOfficeCss');
    if (existing?.dataset.v === '9') return;
    existing?.remove();
    const style = document.createElement('style');
    style.id = 'economyOfficeCss';
    style.dataset.v = '9';
    style.textContent = `
.office-view .office-layout{display:grid;grid-template-columns:minmax(280px,.9fr) minmax(0,1.25fr);gap:16px;align-items:stretch}
.office-view .office-ledger,.office-view .office-sponsors{grid-column:1 / -1}
.office-budget-card,.economy-investments,.office-ledger,.office-sponsors,.stadium-summary-card,.stadium-upgrades,.stadium-tickets{display:flex;flex-direction:column;min-height:0;padding:18px 20px}
.office-budget-card>label,.economy-investments>label,.office-ledger>label,.office-sponsors>label,.stadium-summary-card>label,.stadium-upgrades>label,.stadium-tickets>label{display:block;margin:0 0 14px;color:#2abee9;font:700 11px DM Sans,sans-serif;letter-spacing:.6px}
.office-sponsors-meta{margin:0 0 12px;color:#7fa8b0;font-size:10px;line-height:1.4}
.office-sponsors-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.office-sponsor-card{display:grid;align-content:center;min-height:0;padding:12px 14px;border:1px solid #1e4a5c;border-radius:8px;background:linear-gradient(165deg,#122b36 0%,#0c1c26 100%)}
.office-sponsor-card.master{border-color:#2abee9;background:linear-gradient(165deg,#143848 0%,#0d2029 100%);box-shadow:0 0 0 1px #2abee928,0 8px 20px #0005}
.office-sponsor-brand{display:grid;grid-template-columns:88px minmax(0,1fr);gap:12px;align-items:center;min-width:0}
.office-sponsor-card.master .office-sponsor-brand{grid-template-columns:96px minmax(0,1fr)}
.office-sponsor-logo{display:grid;place-items:center;width:88px;height:88px;padding:0;border-radius:10px;box-sizing:border-box;background:#050c14;border:1px solid #3a6d7e;box-shadow:inset 0 1px 0 #ffffff12;overflow:hidden}
.office-sponsor-card.master .office-sponsor-logo{width:96px;height:96px;border-color:#2abee9aa;box-shadow:inset 0 1px 0 #ffffff18,0 0 14px #2abee914}
.office-sponsor-logo img{display:block;width:100%;height:100%;object-fit:contain;object-position:center;image-rendering:auto;-webkit-backface-visibility:hidden}
.office-sponsor-logo.missing{color:#7fa8b0;font:700 28px Barlow Condensed,sans-serif}
.office-sponsor-copy{display:flex;align-items:center;gap:0;min-width:0;width:100%}
.office-sponsor-copy b{color:#edf8f5;font:700 15px Barlow Condensed,sans-serif;letter-spacing:.2px;line-height:1.1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.office-sponsor-card.master .office-sponsor-copy b{font-size:16px;color:#bbeb27}
.office-sponsor-divider{display:block;width:1px;height:36px;margin:0 12px;flex-shrink:0;background:#5fb9d4;opacity:.85;box-shadow:0 0 0 1px #2abee922}
.office-sponsor-copy strong{margin-left:auto;color:#7fd9f2;font:700 28px Barlow Condensed,sans-serif;letter-spacing:.15px;line-height:1;white-space:nowrap;flex-shrink:0}
.office-sponsor-card.master .office-sponsor-copy strong{font-size:32px;color:#b6ff38}
.office-sponsor-empty{grid-column:1 / -1;color:#7fa8b0;font-size:11px;padding:8px 0}
.office-budget-body{flex:1;display:flex;flex-direction:column;justify-content:center;min-height:88px;margin-bottom:14px}
.office-budget-card .office-budget-value{margin:0 0 6px;font:700 42px Barlow Condensed,sans-serif;color:#b6ff38;line-height:1}
.office-budget-card .office-budget-meta{margin:0;color:#9eb6b8;font-size:11px;line-height:1.4}
.office-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:auto}
.stadium-summary-stats{grid-template-columns:1fr 1fr 1fr}
.office-stats>div{display:grid;align-content:center;gap:4px;min-height:52px;padding:10px 8px;border:1px solid #28505b;border-radius:5px;background:#102b35;text-align:center}
.office-stats small{display:block;color:#9eb6b8;font:700 8px DM Sans,sans-serif;letter-spacing:.3px;line-height:1.15}
.office-stats b{display:block;color:#b6ff38;font:700 18px Barlow Condensed,sans-serif;line-height:1;white-space:nowrap}
.economy-investments .economy-invest-head,.economy-investments .economy-invest-row,.stadium-upgrades .economy-invest-head,.stadium-upgrades .economy-invest-row{display:grid;grid-template-columns:minmax(0,1fr) 58px 108px;gap:14px;align-items:center}
.office-ledger-head,.office-ledger-row,.stadium-ticket-head,.stadium-ticket-row{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:12px;align-items:center}
.stadium-ticket-head,.stadium-ticket-row{grid-template-columns:minmax(0,1.2fr) 80px 120px}
.economy-invest-head,.office-ledger-head,.stadium-ticket-head{padding:0 2px 10px;border-bottom:1px solid #234650;margin-bottom:4px}
.economy-invest-head span,.office-ledger-head span,.stadium-ticket-head span{color:#7fa8b0;font:700 10px DM Sans,sans-serif;letter-spacing:.4px}
.economy-invest-head span:nth-child(2),.economy-invest-head span:nth-child(3),.office-ledger-head span:last-child,.stadium-ticket-head span:nth-child(2),.stadium-ticket-head span:nth-child(3){text-align:right}
.economy-investments-list,.office-ledger-list,.stadium-tickets-list{display:grid;gap:0;flex:1}
.economy-invest-row,.office-ledger-row,.stadium-ticket-row{min-height:72px;padding:14px 2px;border-bottom:1px solid #1e3a44;background:transparent}
.economy-invest-row:last-child,.office-ledger-row:last-child,.stadium-ticket-row:last-child{border-bottom:none}
.economy-invest-row>div,.stadium-ticket-row>div{min-width:0}
.economy-invest-row b,.stadium-ticket-row b{display:block;color:#edf8f5;font:700 17px Barlow Condensed,sans-serif;letter-spacing:.2px;line-height:1.15}
.economy-invest-row small,.stadium-ticket-row small{display:block;margin-top:5px;color:#9eb6b8;font-size:12px;line-height:1.4;max-width:42ch}
.economy-invest-row .economy-invest-level{justify-self:end;color:#dff4f5;font:700 16px Barlow Condensed,sans-serif;white-space:nowrap}
.economy-invest-row button{justify-self:end;min-width:96px;padding:11px 12px!important;font-size:11px!important;letter-spacing:.3px;white-space:nowrap}
.economy-invest-row button:disabled,.stadium-ticket-step:disabled{opacity:.45;cursor:not-allowed}
.economy-invest-row.maxed b,.economy-invest-row.locked b,.economy-invest-row.structure-capped b{color:#9eb6b8}
.economy-invest-row.locked,.economy-invest-row.structure-capped{opacity:.8}
.economy-invest-row.locked small,.economy-invest-row.structure-capped small{color:#7fa8b0}
.economy-invest-row.locked .economy-invest-level,.economy-invest-row.structure-capped .economy-invest-level{color:#7fa8b0}
.economy-invest-row.locked button,.economy-invest-row.structure-capped button{opacity:.55}
.office-ledger-list{max-height:280px;overflow:auto}
.office-ledger-row{min-height:44px;padding:10px 4px;font-size:10px}
.office-ledger-row span{color:#9eb6b8;min-width:0}
.office-ledger-row b{justify-self:end;text-align:right;color:#edf8f5;font:700 13px Barlow Condensed,sans-serif;white-space:nowrap}
.office-ledger-row b.credit{color:#63d9ff}
.office-ledger-row b.spend{color:#ffc94f}
.office-ledger-empty{color:#7fa8b0;font-size:11px;padding:12px 4px}
.stadium-view .office-stadium-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:14px;align-items:stretch}
.stadium-view .office-stadium-layout .stadium-tickets{grid-column:1 / -1}
.stadium-summary-body>strong{display:block;margin:0 0 14px;color:#edf8f5;font:700 22px Barlow Condensed,sans-serif}
.stadium-gate-hint{margin:12px 0 0;color:#7fa8b0;font-size:10px;line-height:1.4}
.stadium-ticket-row{grid-template-columns:minmax(0,1.2fr) 72px 120px}
.stadium-ticket-price{justify-self:end;color:#b6ff38;font:700 16px Barlow Condensed,sans-serif;white-space:nowrap}
.stadium-ticket-controls{justify-self:end;display:flex;gap:6px}
.stadium-ticket-step{min-width:36px!important;padding:8px 0!important;font-size:14px!important;line-height:1}
.office-entry-card{cursor:pointer;transition:border-color .16s ease,background .16s ease}
.office-entry-card:hover{border-color:#63d9ff!important;background:#122b35!important}
.office-entry-card strong{font:700 17px Barlow Condensed,sans-serif;color:#f4fbf5}
.office-entry-card small{font-size:10px;color:#9fcfd8}
.office-entry-card .office-icon{color:#63d9ff}
@media(max-width:900px){.office-view .office-layout,.stadium-view .office-stadium-layout{grid-template-columns:1fr}.office-stats{grid-template-columns:1fr 1fr}.stadium-summary-stats{grid-template-columns:1fr 1fr}.office-sponsors-list{grid-template-columns:1fr 1fr}.office-sponsor-card.master{grid-column:1 / -1}}
@media(max-width:560px){.office-sponsors-list{grid-template-columns:1fr}}
`;
    document.head.append(style);
  };

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
    injectStyles();
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
    injectStyles();
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
      injectStyles();
      bindHandlers();
      renderOffice();
      renderStadium();
    },
  };
}
