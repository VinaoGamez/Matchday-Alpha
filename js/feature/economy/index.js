import { MODULE_VERSIONS } from '../../core/constants.js';
import { sponsorExternalUrl, sponsorLogoSlug } from '../../engine/economy.js';

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
    estimateWageBill,
    estimateStaffBill,
    estimateStadiumOpsBill,
    estimateRoundCostBill,
    ensureStadium,
    getTicketPrices,
    adjustTicketPrice,
    estimateGateReceipt,
    getSponsors,
    estimateSponsorInstallment,
    estimateTvInstallment,
    getSeasonCashflowStatement,
    getStructureLevel,
    getPitchLevel,
    maxPitchForStructure,
    pitchTierLabel,
    purchaseStadiumNameRights,
    nameRightsCost,
    TICKET_PRICE_RANGE,
    getUserClub,
    getClubs,
    getUserDivision,
    getCareerSeason,
    getSeasonGoal,
    getBoardBriefContext,
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

  const setMeterBar = (barId, pct, meterSelector = null) => {
    const bar = $(barId);
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    if (!meterSelector) return;
    const meter = document.querySelector(meterSelector);
    if (!meter) return;
    let tone = '';
    if (pct < 35) tone = 'risk';
    else if (pct < 50) tone = 'warn';
    meter.setAttribute('data-tone', tone);
  };

  const renderOffice = () => {
    const club = userClubState();
    if (!club) return;
    const balance = getBalance(club);
    const balanceEl = $('#officeBudgetValue');
    const metaEl = $('#officeBudgetMeta');
    const medicalEl = $('#officeMedicalLevel');
    const preventionEl = $('#officePreventionLevel');
    if (balanceEl) balanceEl.textContent = formatBudget(balance);
    if (metaEl) {
      metaEl.textContent = `${getUserClub()} · Série ${getUserDivision?.() || club.division || 'A'} · caixa disponível para investimentos`;
    }
    const goalEl = $('#officeSeasonGoal');
    const goalMetaEl = $('#officeSeasonGoalMeta');
    const goal = getSeasonGoal?.() || null;
    if (goalEl) {
      if (!goal?.label) {
        goalEl.textContent = '—';
        if (goalMetaEl) goalMetaEl.textContent = 'A diretoria define a expectativa da campanha.';
      } else {
        goalEl.textContent = goal.label;
        if (goalMetaEl) {
          const tierLabel =
            goal.tier === 'soft'
              ? 'Expectativa conservadora'
              : goal.tier === 'stretch'
                ? 'Expectativa ambiciosa'
                : 'Expectativa equilibrada';
          goalMetaEl.textContent = `Série ${goal.division || getUserDivision?.() || club.division || 'A'} · ${tierLabel}`;
        }
      }
    }
    const medicalLevel = Number(club.medicalInvestment) || 0;
    const preventionLevel = Number(club.preventionProgram) || 0;
    const financesPct = Math.round(Number(club.finances) || 0);
    if (medicalEl) medicalEl.textContent = `${medicalLevel}/5`;
    if (preventionEl) preventionEl.textContent = `${preventionLevel}/3`;
    const financesEl = $('#officeFinancesStat');
    if (financesEl) financesEl.textContent = `${financesPct}%`;
    setMeterBar('#officeMedicalBar', (medicalLevel / 5) * 100);
    setMeterBar('#officePreventionBar', (preventionLevel / 3) * 100);
    setMeterBar('#officeFinancesBar', financesPct, '.office-meter[data-meter="finances"]');
    renderBoardBrief(club);
    renderInvestments();
    renderSponsors();
    renderCashflow();
  };

  const renderBoardBrief = club => {
    const wrap = $('#officeBoardBrief');
    const bodyEl = $('#officeBoardBriefBody');
    if (!wrap || !bodyEl) return;
    const brief = getBoardBriefContext?.(club) || {
      tone: 'neutral',
      eyebrow: 'DIRETORIA',
      body: 'A diretoria acompanha a temporada com atenção profissional.',
    };
    wrap.dataset.tone = brief.tone || 'neutral';
    const eyebrow = wrap.querySelector('small');
    if (eyebrow) eyebrow.textContent = brief.eyebrow || 'DIRETORIA';
    bodyEl.textContent = brief.body || '';
  };

  const sponsorCardHtml = (item, { master = false } = {}) => {
    const name = item?.name || '—';
    const slug = sponsorLogoSlug(name);
    const logoUrl = slug ? SPONSOR_LOGO_URLS[slug] : null;
    const href = sponsorExternalUrl(name);
    const img = logoUrl
      ? `<img src="${logoUrl}" alt="${name}" width="88" height="88" decoding="async">`
      : '';
    const logo = logoUrl
      ? href
        ? `<a class="office-sponsor-logo is-link" href="${href}" target="_blank" rel="noopener noreferrer" title="Abrir site de ${name}" aria-label="Abrir site de ${name}">${img}</a>`
        : `<span class="office-sponsor-logo">${img}</span>`
      : `<span class="office-sponsor-logo missing" aria-hidden="true">${String(name).slice(0, 1)}</span>`;
    const title = href
      ? `<a class="office-sponsor-name-link" href="${href}" target="_blank" rel="noopener noreferrer">${name}</a>`
      : name;
    return `<div class="office-sponsor-card${master ? ' master' : ''}"><div class="office-sponsor-brand">${logo}<div class="office-sponsor-copy"><b>${title}</b><i class="office-sponsor-divider" aria-hidden="true"></i><strong>${formatBudget(item?.value)}</strong></div></div></div>`;
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
    const division = sponsors.division || getUserDivision?.() || 'A';
    const installments = Math.max(1, Number(sponsors.installments) || (division === 'D' ? 22 : 38));
    const installment =
      estimateSponsorInstallment?.(club, { installments }) ||
      (sponsors.total > 0 ? Math.floor(Number(sponsors.total) / installments) : 0);
    const paid = Number(sponsors.paidInstallments) || 0;
    if (meta) {
      meta.textContent = `Temporada ${season} · Série ${division} · total ${formatBudget(sponsors.total || 0)} · ${formatBudget(installment)}/rodada · ${paid}/${installments} parcelas`;
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
    const rightsMeta = $('#stadiumNameRightsMeta');
    if (rightsMeta && nameRightsCost) {
      rightsMeta.textContent = `Name Rights: ${formatBudget(nameRightsCost(division))} · único jeito de renomear durante a campanha.`;
    }
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

  const INFLOW_CATEGORIES = [
    { key: 'gate', label: 'Bilheteria', match: reason => reason === 'gate_receipt' },
    { key: 'sponsorship', label: 'Patrocínios', match: reason => reason === 'sponsorship' },
    { key: 'tv', label: 'Direitos de TV', match: reason => reason === 'tv_rights' },
    { key: 'prize', label: 'Premiações', match: reason => reason === 'season_prize' },
    { key: 'other_in', label: 'Outras receitas', match: () => true },
  ];

  const OUTFLOW_CATEGORIES = [
    { key: 'wages', label: 'Folha salarial', match: reason => reason === 'wages' },
    { key: 'staff', label: 'Comissão técnica', match: reason => reason === 'staff_wages' },
    { key: 'stadium', label: 'Manutenção do estádio', match: reason => reason === 'stadium_ops' },
    { key: 'upgrades', label: 'Investimentos', match: reason => String(reason || '').startsWith('upgrade:') },
    { key: 'other_out', label: 'Outras despesas', match: () => true },
  ];

  const categorizeAmount = (categories, reason, amount, buckets) => {
    const hit = categories.find(cat => cat.match(reason));
    if (!hit) return;
    buckets[hit.key] = (buckets[hit.key] || 0) + amount;
  };

  const buildCashflowStatementFromLedger = ledger => {
    const inflows = Object.fromEntries(INFLOW_CATEGORIES.map(cat => [cat.key, 0]));
    const outflows = Object.fromEntries(OUTFLOW_CATEGORIES.map(cat => [cat.key, 0]));
    for (const entry of ledger) {
      const amount = Math.max(0, Number(entry?.amount) || 0);
      if (!(amount > 0)) continue;
      const reason = entry?.reason || '';
      if (entry?.type === 'credit') categorizeAmount(INFLOW_CATEGORIES, reason, amount, inflows);
      else categorizeAmount(OUTFLOW_CATEGORIES, reason, amount, outflows);
    }
    const totalIn = INFLOW_CATEGORIES.reduce((sum, cat) => sum + (inflows[cat.key] || 0), 0);
    const totalOut = OUTFLOW_CATEGORIES.reduce((sum, cat) => sum + (outflows[cat.key] || 0), 0);
    return {
      inflows,
      outflows,
      totalIn,
      totalOut,
      net: totalIn - totalOut,
      count: ledger.length,
      fullSeason: false,
    };
  };

  const statementRowsHtml = (categories, buckets, tone) =>
    categories
      .filter(cat => (buckets[cat.key] || 0) > 0)
      .map(
        cat =>
          `<div class="office-cashflow-row"><span>${cat.label}</span><b class="${tone}">${
            tone === 'credit' ? '+' : '−'
          } ${formatBudget(buckets[cat.key])}</b></div>`,
      )
      .join('');

  const renderCashflow = () => {
    const root = $('#officeCashflow');
    const meta = $('#officeCashflowMeta');
    if (!root) return;
    const club = userClubState();
    const division = getUserDivision?.() || club?.division || 'A';
    const season = getCareerSeason?.() || club?.sponsors?.season || '—';
    const ledger = Array.isArray(club?.budgetLedger) ? club.budgetLedger : [];
    const seasonStatement = getSeasonCashflowStatement?.(club, season);
    const statement =
      seasonStatement && (seasonStatement.count > 0 || seasonStatement.fullSeason)
        ? seasonStatement
        : buildCashflowStatementFromLedger(ledger);
    const staffOpts = { managerReputation: club?.managerReputation };
    const wageBill = estimateWageBill?.(club, division) || 0;
    const staffBill = estimateStaffBill?.(club, division, staffOpts) || 0;
    const stadiumBill = estimateStadiumOpsBill?.(club, division) || 0;
    const roundCost =
      estimateRoundCostBill?.(club, division, staffOpts) || wageBill + staffBill + stadiumBill;
    const installments = Math.max(
      1,
      Number(club?.sponsors?.installments) ||
        Number(club?.tvRights?.installments) ||
        (division === 'D' ? 22 : 38),
    );
    const sponsorInstallment = estimateSponsorInstallment?.(club, { installments }) || 0;
    const lastSponsor = club?.lastSponsorInstallment;
    const sponsorValue =
      sponsorInstallment > 0
        ? sponsorInstallment
        : lastSponsor?.amount > 0
          ? lastSponsor.amount
          : 0;
    const sponsorNote =
      sponsorInstallment > 0
        ? `Próxima parcela · ${(Number(club?.sponsors?.paidInstallments) || 0) + 1}/${installments}`
        : lastSponsor?.round != null
          ? `Última · Rodada ${lastSponsor.round}`
          : club?.sponsors?.credited
            ? 'Contrato quitado nesta temporada'
            : 'Sem parcela pendente';
    const tvInstallment = estimateTvInstallment?.(club, { installments }) || 0;
    const lastTv = club?.lastTvInstallment;
    const tvValue =
      tvInstallment > 0 ? tvInstallment : lastTv?.amount > 0 ? lastTv.amount : 0;
    const tvNote =
      tvInstallment > 0
        ? `Próxima parcela · ${(Number(club?.tvRights?.paidInstallments) || 0) + 1}/${installments}`
        : lastTv?.round != null
          ? `Última · Rodada ${lastTv.round}`
          : club?.tvRights?.credited
            ? 'Contrato quitado nesta temporada'
            : 'Sem parcela pendente';
    const balance = getBalance?.(club) ?? (Number(club?.budget) || 0);
    const netTone = statement.net > 0 ? 'credit' : statement.net < 0 ? 'spend' : '';
    const netSign = statement.net > 0 ? '+' : statement.net < 0 ? '−' : '';

    if (meta) {
      meta.textContent =
        statement.count > 0
          ? `Temporada ${season} · demonstrativo completo · ${statement.count} movimento${statement.count === 1 ? '' : 's'}`
          : `Temporada ${season} · ainda sem movimentos registrados`;
    }

    const projectionHtml = `
      <div class="office-cashflow-projection">
        <div>
          <small>CUSTO / RODADA</small>
          <b class="spend">${formatBudget(roundCost)}</b>
          <span>Jogadores ${formatBudget(wageBill)} + comissão ${formatBudget(staffBill)} + estádio ${formatBudget(stadiumBill)}</span>
        </div>
        <div>
          <small>PATROCÍNIO / RODADA</small>
          <b class="credit">${sponsorValue > 0 ? formatBudget(sponsorValue) : '—'}</b>
          <span>${sponsorNote}</span>
        </div>
        <div>
          <small>TV / RODADA</small>
          <b class="credit">${tvValue > 0 ? formatBudget(tvValue) : '—'}</b>
          <span>${tvNote}</span>
        </div>
      </div>`;

    const inRows = statementRowsHtml(INFLOW_CATEGORIES, statement.inflows, 'credit');
    const outRows = statementRowsHtml(OUTFLOW_CATEGORIES, statement.outflows, 'spend');

    const bodyHtml =
      statement.count === 0
        ? `<p class="office-cashflow-empty">Ainda sem movimentos nesta temporada. Folha, bilheteria, patrocínio, TV e investimentos entram aqui agregados.</p>`
        : `
      <section class="office-cashflow-section">
        <header>Entradas</header>
        ${inRows || '<div class="office-cashflow-row muted"><span>Nenhuma entrada registrada</span><b>—</b></div>'}
        <div class="office-cashflow-row total"><span>Total de entradas</span><b class="credit">+ ${formatBudget(statement.totalIn)}</b></div>
      </section>
      <section class="office-cashflow-section">
        <header>Saídas</header>
        ${outRows || '<div class="office-cashflow-row muted"><span>Nenhuma saída registrada</span><b>—</b></div>'}
        <div class="office-cashflow-row total"><span>Total de saídas</span><b class="spend">− ${formatBudget(statement.totalOut)}</b></div>
      </section>
      <div class="office-cashflow-result">
        <span>Resultado da temporada</span>
        <b class="${netTone}">${netSign}${netSign ? ' ' : ''}${formatBudget(Math.abs(statement.net))}</b>
      </div>`;

    root.innerHTML = `
      ${projectionHtml}
      ${bodyHtml}
      <div class="office-cashflow-balance">
        <span>Saldo atual</span>
        <b>${formatBudget(balance)}</b>
      </div>`;
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

    onClick('#openStadiumNameRights', () => {
      const club = userClubState();
      if (!club || !purchaseStadiumNameRights) return;
      const division = getUserDivision?.() || club.division || 'A';
      const cost = nameRightsCost?.(division) ?? 0;
      const next = window.prompt(
        `Novo nome do estádio (custa ${formatBudget(cost)}):`,
        club.stadiumName || '',
      );
      if (next == null) return;
      const result = purchaseStadiumNameRights(club, next, { division });
      if (!result.ok) {
        const body =
          result.error === 'insufficient_funds'
            ? `Saldo insuficiente. Name Rights custa ${formatBudget(result.cost ?? cost)}.`
            : result.error === 'same_name'
              ? 'Informe um nome diferente do atual.'
              : 'Use um nome com pelo menos 3 caracteres.';
        pushMessage?.({
          category: 'club',
          type: 'budget',
          title: 'Name Rights',
          body,
          round: getCurrentRound?.() ?? 1,
          meta: { competition: 'Estádio' },
        });
        renderStadium();
        onBudgetChanged?.();
        return;
      }
      pushMessage?.({
        category: 'club',
        type: 'budget',
        title: `Name Rights · ${result.name}`,
        body: `Estádio renomeado por ${formatBudget(result.cost)}. Orçamento atual: ${formatBudget(result.balance)}.`,
        round: getCurrentRound?.() ?? 1,
        meta: { competition: 'Estádio' },
      });
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
