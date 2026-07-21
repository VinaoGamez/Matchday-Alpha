import { MODULE_VERSIONS } from '../../core/constants.js';
import { sponsorExternalUrl, sponsorLogoSlug } from '../../engine/economy.js';
import { seasonGoalLiveProgress } from '../../engine/season-goals.js';
import { seasonGoalGauge } from '../season-summary/goal-gauge.js';
import { mountStadiumVisual } from './stadium-visual.js';

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

const NAMING_MODAL_HTML = `
<div id="namingPickerModal" class="modal hidden">
  <div class="modal-card sponsor-picker-modal naming-picker-modal">
    <label>NAMING DO ESTÁDIO</label>
    <h2 id="namingPickerTitle">Parceiro de naming</h2>
    <p id="namingPickerLead" class="sponsor-picker-lead">O nome do estádio continua o seu. Escolha um patrocinador — receita por rodada nacional.</p>
    <div id="namingPickerGrid" class="sponsor-picker-grid master"></div>
    <p id="namingPickerError" class="sponsor-picker-error"></p>
    <div class="sponsor-picker-actions">
      <button type="button" id="closeNamingPicker" class="sponsor-picker-reroll">FECHAR</button>
      <button type="button" id="confirmNamingPicker" disabled>FECHAR CONTRATO →</button>
    </div>
  </div>
</div>`;

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
    estimateWageRunway,
    resolveOverdraftRate,
    isOverdrawn,
    ensureStadium,
    getTicketPrices,
    adjustTicketPrice,
    estimateGateReceipt,
    getSponsors,
    estimateSponsorInstallment,
    estimateTvInstallment,
    tvAdvanceStatus,
    advanceTvRights,
    tvHomeSlots,
    getSeasonCashflowStatement,
    takeBankLoan,
    repayBankLoan,
    payBankLoanMinimum,
    bankLoanStatus,
    getStructureLevel,
    getPitchLevel,
    maxPitchForStructure,
    pitchTierLabel,
    structureLevelLabel,
    computeSectorBreakdown,
    canOfferStadiumNaming,
    getStadiumInvestments,
    generateNamingOffers,
    assignNamingContract,
    estimateNamingRound,
    getNamingRights,
    namingStatusLabel,
    SPONSOR_POOL,
    TICKET_PRICE_RANGE,
    getUserClub,
    getClubs,
    getUserDivision,
    getCareerSeason,
    getSeasonGoal,
    getSeasonGoalLiveContext,
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

  let namingOffers = [];
  let selectedNamingIndex = -1;
  let namingModalReady = false;

  const namingLogoHtml = name => {
    const slug = sponsorLogoSlug(name);
    const url = slug ? SPONSOR_LOGO_URLS[slug] : null;
    if (url) return `<img src="${url}" alt="" width="56" height="56" loading="lazy">`;
    return `<span class="sponsor-picker-fallback">${String(name || '?').slice(0, 2).toUpperCase()}</span>`;
  };

  const ensureNamingModal = () => {
    if ($('#namingPickerModal')) return;
    document.body.insertAdjacentHTML('beforeend', NAMING_MODAL_HTML);
  };

  const renderNamingOffers = () => {
    const grid = $('#namingPickerGrid');
    const confirm = $('#confirmNamingPicker');
    const err = $('#namingPickerError');
    if (!grid) return;
    if (err) err.textContent = '';
    grid.innerHTML = namingOffers
      .map(
        (offer, index) => `<button type="button" class="sponsor-picker-card${selectedNamingIndex === index ? ' selected' : ''}" data-naming-offer="${index}">
          ${namingLogoHtml(offer.sponsor)}
          <strong>${offer.sponsor}</strong>
          <small>${formatBudget(offer.perRound)}/rodada</small>
        </button>`,
      )
      .join('');
    if (confirm) confirm.disabled = selectedNamingIndex < 0;
  };

  const closeNamingModal = () => {
    $('#namingPickerModal')?.classList.add('hidden');
    selectedNamingIndex = -1;
  };

  const openNamingModal = () => {
    const club = userClubState();
    if (!club) return;
    const division = getUserDivision?.() || club.division || 'A';
    const season = getCareerSeason?.() ?? 1;
    const active = getNamingRights?.(club);
    if (active?.sponsor && Number(active.season) === Number(season)) {
      pushMessage?.({
        category: 'club',
        type: 'budget',
        title: 'Naming ativo',
        body: `${namingStatusLabel?.(club, division) || active.sponsor} Nome do estádio: ${club.stadiumName || '—'}.`,
        round: getCurrentRound?.() ?? 1,
        meta: { competition: 'Estádio' },
      });
      return;
    }
    if (!canOfferStadiumNaming?.(club, division)) return;
    ensureNamingModal();
    namingOffers =
      generateNamingOffers?.(club, division, { pool: SPONSOR_POOL || [], random: Math.random }) || [];
    if (!namingOffers.length) {
      pushMessage?.({
        category: 'club',
        type: 'budget',
        title: 'Naming indisponível',
        body: 'Não há patrocinadores disponíveis (evita conflito com Master/Secundários).',
        round: getCurrentRound?.() ?? 1,
        meta: { competition: 'Estádio' },
      });
      return;
    }
    selectedNamingIndex = -1;
    renderNamingOffers();
    $('#namingPickerModal')?.classList.remove('hidden');
  };

  const bindNamingModal = () => {
    if (namingModalReady) return;
    ensureNamingModal();
    onClick('#namingPickerGrid', event => {
      const card = event.target.closest('[data-naming-offer]');
      if (!card) return;
      selectedNamingIndex = Number(card.dataset.namingOffer);
      renderNamingOffers();
    });
    onClick('#closeNamingPicker', closeNamingModal);
    onClick('#confirmNamingPicker', () => {
      const club = userClubState();
      if (!club || selectedNamingIndex < 0) return;
      const offer = namingOffers[selectedNamingIndex];
      const division = getUserDivision?.() || club.division || 'A';
      const season = getCareerSeason?.() ?? 1;
      const result = assignNamingContract?.(club, offer, { season, division });
      if (!result?.ok) {
        const err = $('#namingPickerError');
        if (err) err.textContent = 'Não foi possível fechar o contrato.';
        return;
      }
      closeNamingModal();
      pushMessage?.({
        category: 'club',
        type: 'budget',
        title: `Naming · ${offer.sponsor}`,
        body: `${formatBudget(offer.perRound)}/rodada nacional. Estádio continua "${club.stadiumName || '—'}".`,
        round: getCurrentRound?.() ?? 1,
        meta: { competition: 'Estádio' },
      });
      renderStadium();
      renderOffice();
      onBudgetChanged?.();
    });
    namingModalReady = true;
  };

  const renderUpgradeRows = (listEl, rows, buyAttr) => {
    if (!listEl) return;
    listEl.innerHTML = rows
      .map(row => {
        const locked = !!row.locked;
        const structureCapped = !!row.structureCapped;
        const divisionLocked = !!row.divisionLocked;
        const levelText = locked ? '—' : `${row.level}/${row.maxLevel}`;
        const disabled = locked || row.maxed || structureCapped || divisionLocked || !row.affordable;
        const title = locked
          ? row.lockLabel || 'Disponível em atualização futura'
          : divisionLocked
            ? 'Setor indisponível nesta série'
            : structureCapped
              ? 'Melhore a estrutura do estádio para liberar o próximo nível'
              : row.maxed
                ? 'Nível máximo'
                : row.affordable
                  ? `Investir ${row.costLabel}`
                  : `Saldo insuficiente (${row.costLabel})`;
        const actionLabel = locked
          ? row.lockLabel?.slice(0, 12).toUpperCase() || 'EM BREVE'
          : row.maxed
            ? 'MÁX'
            : divisionLocked
              ? 'SÉRIE'
              : structureCapped
                ? 'ESTRUTURA'
                : row.costLabel;
        const buyAttrHtml = locked || structureCapped || divisionLocked ? '' : `${buyAttr}="${row.id}"`;
        return `<div class="economy-invest-row${row.maxed ? ' maxed' : ''}${locked ? ' locked' : ''}${structureCapped ? ' structure-capped' : ''}${divisionLocked ? ' division-locked' : ''}" data-upgrade="${row.id}">
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
    if (balanceEl) {
      balanceEl.textContent = formatBudget(balance);
      balanceEl.classList.toggle('is-negative', balance < 0);
    }
    if (metaEl) {
      const div = getUserDivision?.() || club.division || 'A';
      const runway =
        typeof estimateWageRunway === 'function'
          ? estimateWageRunway(club, div, { managerReputation: club.managerReputation })
          : null;
      const runwayTxt =
        balance < 0
          ? 'saldo negativo — cheque especial ativo'
          : runway != null && runway < 4
            ? `runway ${runway.toFixed(1).replace('.', ',')} rodadas`
            : 'caixa disponível para investimentos';
      metaEl.textContent = `${getUserClub()} · Série ${div} · ${runwayTxt}`;
    }
    const goalEl = $('#officeSeasonGoal');
    const goalMetaEl = $('#officeSeasonGoalMeta');
    const goalGaugeEl = $('#officeSeasonGoalGauge');
    const goal = getSeasonGoal?.() || null;
    if (goalEl) {
      if (!goal?.label) {
        goalEl.textContent = '—';
        if (goalMetaEl) goalMetaEl.textContent = 'A diretoria define a expectativa da campanha.';
        if (goalGaugeEl) {
          goalGaugeEl.innerHTML = '';
          goalGaugeEl.setAttribute('aria-hidden', 'true');
        }
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
        if (goalGaugeEl) {
          try {
            const ctx = getSeasonGoalLiveContext?.(club) || {};
            const progress = seasonGoalLiveProgress(goal, ctx);
            goalGaugeEl.innerHTML = seasonGoalGauge(progress, { compact: true });
            goalGaugeEl.removeAttribute('aria-hidden');
          } catch {
            goalGaugeEl.innerHTML = '';
            goalGaugeEl.setAttribute('aria-hidden', 'true');
          }
        }
      }
    }
    const medicalLevel = Number(club.medicalInvestment) || 0;
    const preventionLevel = Number(club.preventionProgram) || 0;
    const youthRow = listUpgrades?.(club)?.find?.(row => row.id === 'youth_academy');
    const youthMax = Number(youthRow?.maxLevel) || 5;
    const youthLevel = Math.max(0, Math.min(youthMax, Number(youthRow?.level) || 0));
    if (medicalEl) medicalEl.textContent = `${medicalLevel}/5`;
    if (preventionEl) preventionEl.textContent = `${preventionLevel}/3`;
    const youthEl = $('#officeYouthLevel');
    if (youthEl) youthEl.textContent = `${youthLevel}/${youthMax}`;
    setMeterBar('#officeMedicalBar', (medicalLevel / 5) * 100);
    setMeterBar('#officePreventionBar', (preventionLevel / 3) * 100);
    setMeterBar('#officeYouthBar', (youthLevel / youthMax) * 100);
    renderBoardBrief(club);
    renderRestrictionBanner(club);
    renderInvestments();
    renderSponsors();
    renderBankLoan();
    renderRadar();
    renderCashflow();
  };

  const renderRestrictionBanner = club => {
    const banner = $('#officeRestrictionBanner');
    if (!banner) return;
    const active = !!club?.financialRestriction?.active;
    banner.classList.toggle('hidden', !active);
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

  const bankLoanRejectCopy = reason =>
    ({
      loan_active: 'Já existe um empréstimo ativo. Amortize o saldo antes de pedir outro.',
      over_limit: 'Valor acima do crédito que o banco libera hoje para o seu clube.',
      credit_denied:
        'Banco recusou crédito. Melhore receitas, controle a folha e recupere a saúde financeira para voltar a negociar.',
      invalid_amount: 'Informe um valor válido.',
      insufficient_funds: 'Caixa insuficiente para essa amortização.',
      no_loan: 'Não há empréstimo ativo para amortizar.',
      no_club: 'Clube indisponível.',
    })[reason] || 'Não foi possível concluir a operação bancária.';

  /** Aceita 1800000, 1.800.000, 1,8 mi, R$ 500.000 */
  const parseLoanAmount = raw => {
    let s = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/r\$\s*/g, '')
      .replace(/\s+/g, '');
    if (!s) return 0;
    const mi = s.match(/^([\d.,]+)mi(lh(ão|ao|ões|oes)?)?$/);
    if (mi) {
      const token = mi[1];
      const n = token.includes(',')
        ? Number(token.replace(/\./g, '').replace(',', '.'))
        : Number(token.replace(/\./g, ''));
      return Number.isFinite(n) ? Math.round(n * 1_000_000) : 0;
    }
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Math.round(Number(s.replace(/\./g, '')));
    if (/^\d+$/.test(s)) return Math.round(Number(s));
    const normalized = s.replace(/\./g, '').replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? Math.round(n) : 0;
  };

  const bankLoanFinTone = finances => {
    const f = Number(finances) || 0;
    if (f < 40) return 'risk';
    if (f < 55) return 'warn';
    return 'ok';
  };

  const bankLoanMetricsHtml = (status, ratePct) => {
    const fin = Math.max(0, Math.min(100, Math.round(Number(status.finances) || 0)));
    const tone = bankLoanFinTone(fin);
    return `
      <div class="office-bank-loan-metrics" role="group" aria-label="Condições do banco">
        <div class="office-bank-loan-metric office-bank-loan-metric--health" data-meter="finances" data-tone="${tone}">
          <div class="office-meter-top"><small>SAÚDE</small><b>${fin}%</b></div>
          <div class="office-meter-track" aria-hidden="true"><i style="width:${fin}%"></i></div>
        </div>
        <div class="office-bank-loan-metrics-row">
          <div class="office-bank-loan-metric" data-meter="credit">
            <div class="office-meter-top"><small>CRÉDITO</small><b>${formatBudget(status.available || 0)}</b></div>
            <span class="office-bank-loan-metric-sub">Teto liberado agora</span>
          </div>
          <div class="office-bank-loan-metric" data-meter="rate">
            <div class="office-meter-top"><small>JUROS</small><b>${ratePct}%</b></div>
            <span class="office-bank-loan-metric-sub">por rodada nacional</span>
          </div>
        </div>
      </div>`;
  };

  const renderBankLoan = () => {
    const body = $('#officeBankLoanBody');
    const meta = $('#officeBankLoanMeta');
    if (!body || !bankLoanStatus) return;
    const club = userClubState();
    if (!club) return;
    const division = getUserDivision?.() || club.division || 'A';
    const status = bankLoanStatus(club, { division });
    const ratePct = status.active
      ? status.ratePct
      : status.offerRatePct ?? status.ratePct ?? Math.round((status.rate || 0) * 1000) / 10;

    if (meta) {
      meta.textContent = status.active
        ? status.delinquent
          ? `Série ${division} · ATRASO ${status.delinquencyStreak}r · taxa efetiva ${ratePct}% / rodada`
          : `Série ${division} · juros ${ratePct}% / rodada (auto) · mínimo 5,5% no Escritório`
        : `Um contrato por vez · juros automáticos · amortização no Escritório`;
    }

    if (!status.active) {
      const metrics = bankLoanMetricsHtml(status, ratePct);
      if (!status.eligible) {
        body.innerHTML = `
          ${metrics}
          <p class="office-bank-loan-warn">${
            status.shortfall
              ? 'Há atraso de folha ou de serviço do empréstimo — normalize os pagamentos antes de pedir crédito de novo.'
              : `Crédito indisponível agora (saúde ${status.finances}%). Melhore o caixa e a cobertura da folha.`
          }</p>`;
        return;
      }
      body.innerHTML = `
        ${metrics}
        <form class="office-bank-loan-form" id="officeBankLoanForm" autocomplete="off">
          <label class="office-bank-loan-form-label" for="officeBankLoanAmount">VALOR SOLICITADO</label>
          <div class="office-bank-loan-form-row">
            <input
              id="officeBankLoanAmount"
              class="office-bank-loan-input"
              type="text"
              inputmode="decimal"
              placeholder="Ex.: 1.800.000 ou 1,8 mi"
              maxlength="18"
              aria-label="Valor do empréstimo"
            />
            <button type="submit" class="office-bank-loan-submit" data-bank-borrow-submit title="Contratar empréstimo">OK</button>
          </div>
          <p class="office-bank-loan-hint">Máximo ${formatBudget(status.available)} · mínimo útil R$ 50 mil · amortização não é automática</p>
        </form>`;
      return;
    }

    const cash = getBalance?.(club) ?? 0;
    const minPay = Math.max(
      0,
      (Number(status.minAmortDue) || 0) + (Number(status.penaltyDue) || 0),
    );
    const repayAll = status.balance + (Number(status.penaltyDue) || 0);
    const repayHalf = Math.max(1, Math.round(status.balance / 2));
    const canMin = minPay > 0 ? cash >= minPay : cash >= (Number(status.minAmort) || 0);
    const canHalf = cash >= repayHalf;
    const canAll = cash >= repayAll;
    const warnHtml = status.delinquent
      ? `<p class="office-bank-loan-warn">Mínimo em atraso (${status.delinquencyStreak} rodada${
          status.delinquencyStreak === 1 ? '' : 's'
        }). Juros compostos (taxa reaplicada) + multa. Cobrança no caixa em ${
          status.roundsToForce > 0 ? `${status.roundsToForce} rodada(s)` : 'curso'
        }.</p>`
      : minPay > 0
        ? `<p class="office-bank-loan-hint-inline">Pague o mínimo no Escritório antes da próxima rodada nacional — atraso gera juros compostos.</p>`
        : '';
    body.innerHTML = `
      <div class="office-bank-loan-stats">
        <div><small>SALDO DEVEDOR</small><b class="spend">${formatBudget(status.balance)}</b></div>
        <div><small>MÍNIMO DEVIDO</small><b class="spend">${formatBudget(
          minPay > 0 ? minPay : status.minAmort,
        )}</b>
          <span>${
            status.penaltyDue > 0
              ? `Amort ${formatBudget(status.minAmortDue)} + multa ${formatBudget(status.penaltyDue)}`
              : `5,5% do principal · juros auto ${formatBudget(status.interestDue)}`
          }</span>
        </div>
        <div><small>TAXA EFETIVA</small><b class="spend">${ratePct}%</b>
          <span>${
            status.delinquent
              ? `Base ${status.baseRatePct}% · atraso ×${(status.rate / Math.max(status.baseRate || status.rate, 0.0001)).toFixed(2)}`
              : 'Juros simples no caixa / rodada'
          }</span>
        </div>
      </div>
      ${warnHtml}
      <div class="office-bank-loan-actions">
        <button type="button" data-bank-pay-min ${canMin ? '' : 'disabled'} title="${
          canMin ? 'Pagar mínimo / obrigação vencida' : 'Saldo insuficiente'
        }">PAGAR MÍNIMO ${formatBudget(minPay > 0 ? minPay : status.minAmort)}</button>
        <button type="button" data-bank-repay="${repayHalf}" ${canHalf ? '' : 'disabled'} title="${
          canHalf ? 'Amortizar metade do saldo' : 'Saldo insuficiente'
        }">AMORTIZAR ${formatBudget(repayHalf)}</button>
        <button type="button" data-bank-repay="${repayAll}" ${canAll ? '' : 'disabled'} title="${
          canAll ? 'Quitar o empréstimo' : 'Saldo insuficiente'
        }">QUITAR ${formatBudget(repayAll)}</button>
      </div>`;
  };

  const tvAdvanceRejectCopy = reason =>
    ({
      no_remaining: 'Não há saldo suficiente de direitos de TV para adiantar nesta temporada.',
      already_advanced: 'Os direitos de TV desta temporada já foram adiantados.',
      not_in_crisis:
        'Adiantamento só sob pressão financeira (atraso de empréstimo, aviso de risco ou caixa no vermelho).',
      no_club: 'Clube indisponível.',
      credit_failed: 'Não foi possível creditar o adiantamento.',
    })[reason] || 'Não foi possível adiantar os direitos de TV.';

  const TV_ADVANCE_MODAL_HTML = `
<div id="officeTvAdvanceModal" class="modal hidden">
  <div class="modal-card manager-sack-modal">
    <label>ADIANTAMENTO DE TV</label>
    <h2 id="officeTvAdvanceModalTitle">Direitos antecipados</h2>
    <p id="officeTvAdvanceModalLead" class="manager-sack-lead"></p>
    <div class="manager-sack-actions">
      <button id="officeTvAdvanceModalDismiss" type="button" class="manager-sack-refuse">ENTENDI</button>
    </div>
  </div>
</div>`;

  let tvAdvanceModalBound = false;
  const ensureTvAdvanceModal = () => {
    if (!$('#officeTvAdvanceModal')) {
      document.body.insertAdjacentHTML('beforeend', TV_ADVANCE_MODAL_HTML);
    }
    if (tvAdvanceModalBound) return;
    tvAdvanceModalBound = true;
    document.addEventListener('click', event => {
      const btn = event.target.closest('#officeTvAdvanceModalDismiss');
      if (!btn) return;
      event.preventDefault();
      $('#officeTvAdvanceModal')?.classList.add('hidden');
    });
  };

  /** Modal efêmero — não grava na inbox. */
  const openTvAdvanceModal = ({ title, lead }) => {
    ensureTvAdvanceModal();
    const titleEl = $('#officeTvAdvanceModalTitle');
    const leadEl = $('#officeTvAdvanceModalLead');
    if (titleEl) titleEl.textContent = title;
    if (leadEl) leadEl.textContent = lead;
    $('#officeTvAdvanceModal')?.classList.remove('hidden');
  };

  const submitTvAdvance = () => {
    const club = userClubState();
    if (!club || !advanceTvRights) return;
    const result = advanceTvRights(club, {
      division: getUserDivision?.() || club.division || 'A',
      season: getCareerSeason?.() ?? null,
      round: getCurrentRound?.() ?? null,
    });
    if (!result.ok) {
      openTvAdvanceModal({
        title: 'Adiantamento indisponível',
        lead: tvAdvanceRejectCopy(result.reason),
      });
      renderOffice();
      onBudgetChanged?.();
      return;
    }
    openTvAdvanceModal({
      title: `${formatBudget(result.payout)} creditados`,
      lead: `Você antecipou os direitos de TV com deságio de ${result.haircutPct}% (bruto ${formatBudget(result.remaining)}). No decorrer desta temporada não haverá mais ganhos com TV nos mandos de campo. Orçamento atual: ${formatBudget(result.clubBalance)}.`,
    });
    renderOffice();
    onBudgetChanged?.();
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
    const investmentsEl = $('#stadiumInvestmentsValue');
    const compositionEl = $('#stadiumCompositionMeta');
    const gateNatEl = $('#stadiumGateNational');
    const gateCupEl = $('#stadiumGateCups');
    const hintEl = $('#stadiumGateHint');
    const namingBtn = $('#openStadiumNameRights');
    const rightsMeta = $('#stadiumNameRightsMeta');
    const national = estimateGateReceipt(club, { channel: 'national', division });
    const cups = estimateGateReceipt(club, { channel: 'cups', division });
    const structureLevel = getStructureLevel?.(club) ?? 0;
    if (nameEl) nameEl.textContent = club.stadiumName || 'Estádio Solar';
    if (structureEl) {
      structureEl.textContent = `${structureLevelLabel?.(structureLevel) || structureLevel} (${structureLevel}/5)`;
    }
    if (investmentsEl) investmentsEl.textContent = String(getStadiumInvestments?.(club) ?? 0);
    if (capacityEl) capacityEl.textContent = formatCapacity(club.stadiumCapacity);
    if (pitchEl) pitchEl.textContent = pitchTierLabel?.(club) || 'Médio';
    if (compositionEl && computeSectorBreakdown) {
      const { rows, total } = computeSectorBreakdown(club, division);
      compositionEl.textContent =
        rows.length > 0
          ? rows
              .map(r => `${r.label} ${Math.round(r.share * 100)}% (${formatCapacity(r.seats)})`)
              .join(' · ')
          : 'Sem setores ativos.';
    }
    if (gateNatEl) gateNatEl.textContent = formatBudget(national.revenue);
    if (gateCupEl) gateCupEl.textContent = formatBudget(cups.revenue);
    if (hintEl) {
      const env = Math.round(Number(club.environment) || 0);
      hintEl.textContent = `Estimativa média · Ambiente ${env}% · Nacional ${Math.round(national.fillRate * 100)}% lotação · Copas ${Math.round(cups.fillRate * 100)}%. Setores premium elevam o ticket médio.`;
    }
    if (namingBtn && rightsMeta) {
      const season = getCareerSeason?.() ?? 1;
      const active = getNamingRights?.(club);
      const hasContract = active?.sponsor && Number(active.season) === Number(season);
      const eligible = canOfferStadiumNaming?.(club, division);
      if (hasContract) {
        namingBtn.disabled = false;
        namingBtn.textContent = 'NAMING ATIVO';
        rightsMeta.textContent = `${namingStatusLabel?.(club, division) || ''} Nome do estádio: ${club.stadiumName || '—'}.`;
      } else if (eligible) {
        namingBtn.disabled = false;
        namingBtn.textContent = 'NEGOCIAR NAMING';
        rightsMeta.textContent =
          'Parceiro paga por rodada. Seu estádio mantém o nome escolhido no Novo Jogo.';
      } else {
        namingBtn.disabled = true;
        namingBtn.textContent = 'NAMING';
        rightsMeta.textContent =
          namingStatusLabel?.(club, division) ||
          'Naming só na Série A ou B, com estrutura intermediária e 2 investimentos.';
      }
    }
    renderUpgradeRows($('#stadiumUpgradesList'), listStadiumUpgrades(club, division), 'data-buy-stadium');
    mountStadiumVisual($('#stadiumVisualMount'), club, division, {
      getStructureLevel,
      getPitchLevel,
    });
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
    { key: 'naming', label: 'Naming', match: reason => reason === 'naming_rights' },
    {
      key: 'tv',
      label: 'Direitos de TV',
      match: reason => reason === 'tv_rights' || reason === 'tv_advance',
    },
    { key: 'prize', label: 'Premiações', match: reason => reason === 'season_prize' },
    { key: 'bank_loan', label: 'Empréstimo bancário', match: reason => reason === 'bank_loan' },
    { key: 'transfers_in', label: 'Transferências (vendas)', match: reason => reason === 'transfer' },
    { key: 'other_in', label: 'Outras receitas', match: () => true },
  ];

  const OUTFLOW_CATEGORIES = [
    { key: 'wages', label: 'Folha salarial', match: reason => reason === 'wages' },
    { key: 'staff', label: 'Comissão técnica', match: reason => reason === 'staff_wages' },
    { key: 'stadium', label: 'Manutenção do estádio', match: reason => reason === 'stadium_ops' },
    { key: 'upgrades', label: 'Investimentos', match: reason => String(reason || '').startsWith('upgrade:') },
    {
      key: 'loan_service',
      label: 'Crédito / saldo negativo',
      match: reason =>
        reason === 'loan_interest' ||
        reason === 'loan_repay' ||
        reason === 'overdraft_interest',
    },
    { key: 'transfers_out', label: 'Transferências (compras)', match: reason => reason === 'transfer' },
    { key: 'other_out', label: 'Outras despesas', match: () => true },
  ];

  const categorizeAmount = (categories, reason, amount, buckets, type) => {
    const hit = categories.find(cat => {
      if (cat.key === 'transfers_in' && type !== 'credit') return false;
      if (cat.key === 'transfers_out' && type !== 'spend') return false;
      return cat.match(reason);
    });
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
      if (entry?.type === 'credit') categorizeAmount(INFLOW_CATEGORIES, reason, amount, inflows, 'credit');
      else categorizeAmount(OUTFLOW_CATEGORIES, reason, amount, outflows, 'spend');
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

  const averageHomeGate = (club, { limit = 5 } = {}) => {
    const ledger = Array.isArray(club?.budgetLedger) ? club.budgetLedger : [];
    const gates = ledger
      .filter(e => e?.type === 'credit' && e?.reason === 'gate_receipt' && Number(e.amount) > 0)
      .slice(0, limit);
    if (!gates.length) return { avg: 0, count: 0 };
    const sum = gates.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return { avg: Math.round(sum / gates.length), count: gates.length };
  };

  const renderRadar = () => {
    const body = $('#officeRadarBody');
    if (!body) return;
    const club = userClubState();
    if (!club) {
      body.innerHTML = '';
      return;
    }
    const division = getUserDivision?.() || club.division || 'A';
    const staffOpts = { managerReputation: club.managerReputation };
    const roundCost = estimateRoundCostBill?.(club, division, staffOpts) || 0;
    const balance = getBalance?.(club) ?? (Number(club.budget) || 0);
    const overdrawn = typeof isOverdrawn === 'function' ? isOverdrawn(club) : balance < 0;
    const runwayRaw =
      typeof estimateWageRunway === 'function'
        ? estimateWageRunway(club, division, staffOpts)
        : roundCost > 0
          ? balance / roundCost
          : 99;
    const runway = Number.isFinite(runwayRaw) ? runwayRaw : 99;

    const sponsorSlots = Math.max(
      1,
      Number(club?.sponsors?.installments) || (division === 'D' ? 22 : 38),
    );
    const tvSlots = Math.max(
      1,
      Number(club?.tvRights?.installments) ||
        (typeof tvHomeSlots === 'function' ? tvHomeSlots(division) : division === 'D' ? 11 : 19),
    );
    const sponsorNext = estimateSponsorInstallment?.(club, { installments: sponsorSlots }) || 0;
    const tvNext = estimateTvInstallment?.(club, { installments: tvSlots, division }) || 0;
    const loanStatus = bankLoanStatus?.(club, { division });
    const bankDue = loanStatus?.active ? Number(loanStatus.roundDue) || 0 : 0;
    let overdraftFee = 0;
    if (overdrawn && typeof resolveOverdraftRate === 'function') {
      const streak = Math.max(0, Math.round(Number(club.overdraftStreak) || 0)) + 1;
      const od = resolveOverdraftRate(club, { division, streak });
      overdraftFee = Math.max(1, Math.round(Math.abs(balance) * od.rate));
    }

    const gate = averageHomeGate(club, { limit: 5 });
    let gateEst = gate.avg;
    if (!(gateEst > 0) && typeof estimateGateReceipt === 'function') {
      try {
        gateEst = Math.round(estimateGateReceipt(club, { channel: 'national', division }).revenue || 0);
      } catch {
        gateEst = 0;
      }
    }

    const costPressure = Math.max(0, roundCost) + Math.max(0, bankDue) + Math.max(0, overdraftFee);
    const revenuePressure = Math.max(0, sponsorNext) + Math.max(0, tvNext) + Math.max(0, gateEst);
    const total = costPressure + revenuePressure;

    // 0 = só CUSTO (esquerda) · 1 = só ARRECADAÇÃO (direita)
    let balanceRatio = total > 0 ? revenuePressure / total : 0.5;
    if (overdrawn) balanceRatio = Math.min(balanceRatio, 0.12);
    else if (runway < 1.5) balanceRatio = Math.min(balanceRatio, 0.28);
    else if (runway < 4) balanceRatio = Math.min(balanceRatio, 0.42);
    balanceRatio = Math.max(0.04, Math.min(0.96, balanceRatio));

    const markerPct = Math.round(balanceRatio * 100);
    let tone = 'ok';
    let reading = 'Equilíbrio saudável';
    if (overdrawn || balanceRatio < 0.38) {
      tone = 'risk';
      reading = 'Pressão de custo — precisa arrecadar ou cortar';
    } else if (balanceRatio < 0.48) {
      tone = 'warn';
      reading = 'Custo pesando — fique de olho na cobertura';
    } else if (balanceRatio > 0.62) {
      tone = 'good';
      reading = 'Arrecadação cobrindo bem os custos';
    }

    const runwayLabel =
      overdrawn || runway < 0
        ? '0 rodadas'
        : runway >= 99
          ? '99+ rodadas'
          : `${runway.toFixed(1).replace('.', ',')} rodadas`;

    const tip = [
      `Custo/rodada ${formatBudget(costPressure)}`,
      `Arrecadação ~${formatBudget(revenuePressure)}`,
      `Runway ${runwayLabel}`,
      overdrawn ? 'Caixa negativo' : null,
    ]
      .filter(Boolean)
      .join(' · ');

    body.innerHTML = `
      <div class="office-balance-bar" data-tone="${tone}" title="${tip}" role="img" aria-label="${reading}. Marcador em ${markerPct}% rumo à arrecadação.">
        <span class="office-balance-end is-cost">CUSTO</span>
        <div class="office-balance-track">
          <i class="office-balance-fill" aria-hidden="true"></i>
          <b class="office-balance-marker" style="left:${markerPct}%" aria-hidden="true"></b>
        </div>
        <span class="office-balance-end is-rev">ARRECADAÇÃO</span>
      </div>`;
  };

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
    const sponsorSlots = Math.max(
      1,
      Number(club?.sponsors?.installments) || (division === 'D' ? 22 : 38),
    );
    const tvSlots = Math.max(
      1,
      Number(club?.tvRights?.installments) ||
        (typeof tvHomeSlots === 'function' ? tvHomeSlots(division) : division === 'D' ? 11 : 19),
    );
    const sponsorInstallment = estimateSponsorInstallment?.(club, { installments: sponsorSlots }) || 0;
    const lastSponsor = club?.lastSponsorInstallment;
    const sponsorValue =
      sponsorInstallment > 0
        ? sponsorInstallment
        : lastSponsor?.amount > 0
          ? lastSponsor.amount
          : 0;
    const sponsorNote =
      sponsorInstallment > 0
        ? `Próxima parcela · ${(Number(club?.sponsors?.paidInstallments) || 0) + 1}/${sponsorSlots}`
        : lastSponsor?.round != null
          ? `Última · Rodada ${lastSponsor.round}`
          : club?.sponsors?.credited
            ? 'Contrato quitado nesta temporada'
            : 'Sem parcela pendente';
    const tvInstallment = estimateTvInstallment?.(club, { installments: tvSlots, division }) || 0;
    const lastTv = club?.lastTvInstallment;
    const tvAdvance = tvAdvanceStatus?.(club, { division }) || null;
    const tvAlready = !!tvAdvance?.already;
    const tvEligible = !!tvAdvance?.eligible;
    const tvValue =
      tvAlready
        ? tvAdvance.advancedNet || 0
        : tvInstallment > 0
          ? tvInstallment
          : lastTv?.amount > 0
            ? lastTv.amount
            : 0;
    const tvNote = tvAlready
      ? `Adiantado (−${Math.round((tvAdvance.advancedHaircut || 0) * 100)}%) · sem parcelas futuras`
      : tvInstallment > 0
        ? `Próximo mando · ${(Number(club?.tvRights?.paidInstallments) || 0) + 1}/${tvSlots}`
        : lastTv?.opponent
          ? `Última · vs ${lastTv.opponent}`
          : lastTv?.round != null
            ? `Última · Rodada ${lastTv.round}`
            : club?.tvRights?.credited
              ? 'Contrato quitado nesta temporada'
              : 'Sem parcela pendente';
    const tvAdvanceTitle = tvAlready
      ? 'Direitos de TV já adiantados nesta temporada'
      : tvEligible
        ? `Adiantar saldo restante · recebe ${formatBudget(tvAdvance.payout)} (−${tvAdvance.haircutPct}%)`
        : tvAdvanceRejectCopy(tvAdvance?.reason);
    const tvAdvanceBtnLabel = tvAlready
      ? 'ADIANTADO'
      : tvEligible
        ? `ADIANTAR ${formatBudget(tvAdvance.payout)}`
        : 'ADIANTAR';
    const tvCardClass = [
      'office-cashflow-tv',
      tvEligible ? 'is-ready' : '',
      tvAlready ? 'is-done' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const loanStatus = bankLoanStatus?.(club, { division });
    const bankDue = loanStatus?.active ? Number(loanStatus.roundDue) || 0 : 0;
    const bankNote = loanStatus?.active
      ? loanStatus.delinquent
        ? `ATRASO ${loanStatus.delinquencyStreak}r · juros ${formatBudget(loanStatus.interestDue)} + devido ${formatBudget(
            (loanStatus.minAmortDue || 0) + (loanStatus.penaltyDue || 0),
          )}`
        : `Juros auto ${formatBudget(loanStatus.interestDue)} · mínimo Escritório ${formatBudget(
            loanStatus.minAmortDue || loanStatus.minAmort,
          )}`
      : 'Sem contrato ativo';
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
        <div class="${tvCardClass}">
          <div class="office-cashflow-tv-copy">
            <small>TV / MANDO</small>
            <b class="credit">${tvValue > 0 ? formatBudget(tvValue) : '—'}</b>
            <span>${tvNote}</span>
          </div>
          <button
            type="button"
            class="office-cashflow-tv-btn"
            data-tv-advance
            ${tvEligible ? '' : 'disabled'}
            title="${tvAdvanceTitle}"
          >${tvAdvanceBtnLabel}</button>
        </div>
        <div>
          <small>BANCO / RODADA</small>
          <b class="${bankDue > 0 ? 'spend' : ''}">${bankDue > 0 ? formatBudget(bankDue) : '—'}</b>
          <span>${bankNote}</span>
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
      pitch: 'Manutenção do gramado',
      sector_popular: 'Popular',
      sector_stands: 'Arquibancada',
      sector_seats: 'Cadeiras numeradas',
      sector_boxes: 'Camarotes',
      sector_vip: 'VIP / Hospitality',
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

  const submitBankLoanBorrow = amount => {
    const club = userClubState();
    if (!club || !takeBankLoan) return;
    const result = takeBankLoan(club, amount, {
      division: getUserDivision?.() || club.division || 'A',
      season: getCareerSeason?.() ?? null,
      round: getCurrentRound?.() ?? null,
    });
    if (!result.ok) {
      pushMessage?.({
        category: 'club',
        type: 'budget',
        title: 'Empréstimo bancário',
        body: bankLoanRejectCopy(result.reason),
        round: getCurrentRound?.() ?? 1,
        meta: { competition: 'Finanças' },
      });
      renderOffice();
      onBudgetChanged?.();
      const input = $('#officeBankLoanAmount');
      if (input) {
        input.focus();
        input.select?.();
      }
      return;
    }
    pushMessage?.({
      category: 'club',
      type: 'budget',
      title: 'Empréstimo contratado',
      body: `${formatBudget(result.amount)} creditados · juros ${(result.rate * 1000) / 10}% / rodada (auto). Amortização mínima no Escritório — atraso capitaliza. Orçamento: ${formatBudget(result.clubBalance)}.`,
      round: getCurrentRound?.() ?? 1,
      meta: { competition: 'Finanças' },
    });
    renderOffice();
    onBudgetChanged?.();
  };

  const bindHandlers = () => {
    const loanBody = $('#officeBankLoanBody');
    if (loanBody && !loanBody.dataset.bankLoanFormBound) {
      loanBody.dataset.bankLoanFormBound = '1';
      loanBody.addEventListener('submit', event => {
        const form = event.target.closest('#officeBankLoanForm');
        if (!form) return;
        event.preventDefault();
        const input = form.querySelector('#officeBankLoanAmount');
        submitBankLoanBorrow(parseLoanAmount(input?.value));
      });
    }

    onClick('#officeCashflow', event => {
      const btn = event.target.closest('[data-tv-advance]');
      if (!btn || btn.disabled) return;
      submitTvAdvance();
    });

    onClick('#officeBankLoanBody', event => {
      const minBtn = event.target.closest('[data-bank-pay-min]');
      if (minBtn && !minBtn.disabled) {
        const club = userClubState();
        if (!club || !payBankLoanMinimum) return;
        const result = payBankLoanMinimum(club, {
          division: getUserDivision?.() || club.division || 'A',
        });
        if (!result.ok) {
          pushMessage?.({
            category: 'club',
            type: 'budget',
            title: 'Pagamento mínimo',
            body: bankLoanRejectCopy(result.reason),
            round: getCurrentRound?.() ?? 1,
            meta: { competition: 'Finanças' },
          });
          renderOffice();
          onBudgetChanged?.();
          return;
        }
        pushMessage?.({
          category: 'club',
          type: 'budget',
          title: result.cleared ? 'Empréstimo quitado' : 'Mínimo pago',
          body: result.cleared
            ? `Pago ${formatBudget(result.paid)}. Dívida encerrada. Orçamento: ${formatBudget(result.clubBalance)}.`
            : `Pago ${formatBudget(result.paid)}. Saldo: ${formatBudget(result.remaining)}. Orçamento: ${formatBudget(result.clubBalance)}.`,
          round: getCurrentRound?.() ?? 1,
          meta: { competition: 'Finanças' },
        });
        renderOffice();
        onBudgetChanged?.();
        return;
      }

      const repayBtn = event.target.closest('[data-bank-repay]');
      if (!repayBtn || repayBtn.disabled) return;
      const club = userClubState();
      if (!club || !repayBankLoan) return;
      const amount = Number(repayBtn.dataset.bankRepay);
      const result = repayBankLoan(club, amount, {
        division: getUserDivision?.() || club.division || 'A',
      });
      if (!result.ok) {
        pushMessage?.({
          category: 'club',
          type: 'budget',
          title: 'Amortização',
          body: bankLoanRejectCopy(result.reason),
          round: getCurrentRound?.() ?? 1,
          meta: { competition: 'Finanças' },
        });
        renderOffice();
        onBudgetChanged?.();
        return;
      }
      pushMessage?.({
        category: 'club',
        type: 'budget',
        title: result.cleared ? 'Empréstimo quitado' : 'Amortização registrada',
        body: result.cleared
          ? `Pago ${formatBudget(result.paid)}. Dívida encerrada. Orçamento: ${formatBudget(result.clubBalance)}.`
          : `Pago ${formatBudget(result.paid)}. Saldo devedor: ${formatBudget(result.remaining)}. Orçamento: ${formatBudget(result.clubBalance)}.`,
        round: getCurrentRound?.() ?? 1,
        meta: { competition: 'Finanças' },
      });
      renderOffice();
      onBudgetChanged?.();
    });

    onClick('#economyInvestmentsList', event => {
      const button = event.target.closest('[data-buy-upgrade]');
      if (!button || button.disabled) return;
      handlePurchase(button.dataset.buyUpgrade, purchaseUpgrade);
    });

    onClick('#stadiumUpgradesList', event => {
      const button = event.target.closest('[data-buy-stadium]');
      if (!button || button.disabled) return;
      const club = userClubState();
      if (!club) return;
      const division = getUserDivision?.() || club.division || 'A';
      const upgradeId = button.dataset.buyStadium;
      const buyFn = purchaseStadiumUpgrade || purchaseUpgrade;
      const result = buyFn.length >= 3 ? buyFn(club, upgradeId, division) : buyFn(club, upgradeId);
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
            body: 'Invista na estrutura do estádio para liberar este setor ou nível de gramado.',
            round: getCurrentRound?.() ?? 1,
            meta: { competition: 'Estádio' },
          });
        } else if (result.error === 'division_locked') {
          pushMessage?.({
            category: 'club',
            type: 'budget',
            title: 'Série inferior',
            body: 'Este setor não está disponível na sua divisão atual.',
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
        meta: { competition: 'Estádio', upgradeId },
      });
      renderOffice();
      renderStadium();
      onBudgetChanged?.();
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
      bindNamingModal();
      openNamingModal();
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
      bindNamingModal();
      renderOffice();
      renderStadium();
    },
  };
}
