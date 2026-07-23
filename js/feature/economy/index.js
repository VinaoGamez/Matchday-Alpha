import { MODULE_VERSIONS } from '../../core/constants.js';
import { sponsorExternalUrl, sponsorLogoSlug, formatBudgetExact } from '../../engine/economy.js';
import {
  BANK_LOAN_TERM_OPTIONS,
  DEFAULT_BANK_LOAN_TERM,
  previewLoanPlan,
  buildLoanRateBreakdown,
  loanTermRateMultiplier,
} from '../../engine/bank-loan.js';
import { seasonGoalLiveProgress } from '../../engine/season-goals.js';
import { seasonObjectiveLiveProgress } from '../../engine/season-objectives.js';
import { maxAchievableStadiumCapacity, STADIUM_SECTOR_DEFS, TICKET_SECTOR_PRICE_RANGE } from '../../engine/stadium-sectors.js';
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
    estimateRoundRecurringRevenue,
    evaluateRosterPayroll,
    estimateStaffBill,
    estimateStadiumOpsBill,
    estimateRoundCostBill,
    estimateWageRunway,
    resolveOverdraftRate,
    isOverdrawn,
    ensureStadium,
    getTicketPrices,
    adjustTicketPrice,
    adjustSectorTicketPrice,
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
    getSeasonGoalResult,
    getSeasonObjectives,
    getSeasonObjectivesResult,
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

  const objectiveIsDone = progress => {
    const score = Math.max(0, Math.min(100, Math.round(Number(progress?.score) || 0)));
    const status = progress?.status;
    return status === 'met' || status === 'exceeded' || score >= 100;
  };

  const officeObjectiveCardHtml = (label, progress, finalStatus = null) => {
    const status = finalStatus || progress?.status;
    const done = objectiveIsDone(progress) || status === 'met' || status === 'exceeded';
    const failed = status === 'missed';
    const near = status === 'near';
    let marker;
    if (done) {
      marker =
        '<span class="office-objective-marker office-objective-marker--done" aria-label="Meta concluída">✓</span>';
    } else if (failed) {
      marker =
        '<span class="office-objective-marker office-objective-marker--missed" aria-label="Meta não cumprida">✗</span>';
    } else if (near) {
      marker =
        '<span class="office-objective-marker office-objective-marker--near" aria-label="Meta parcialmente cumprida">◐</span>';
    } else {
      marker =
        '<span class="office-objective-marker office-objective-marker--pending" aria-label="Meta em andamento"></span>';
    }
    const state = done ? 'done' : failed ? 'missed' : near ? 'near' : 'pending';
    const hint = progress?.hint || '—';
    return `
      <article class="office-objective${done ? ' is-done' : failed ? ' is-missed' : near ? ' is-near' : ''}" data-state="${state}">
        ${marker}
        <div class="office-objective-body">
          <span class="office-objective-label">${label}</span>
          <small class="office-objective-hint">${hint}</small>
        </div>
      </article>`;
  };

  const renderOfficeObjectives = club => {
    const wrap = $('#officeObjectives');
    if (!wrap) return;
    const goal = getSeasonGoal?.() || null;
    const objectives = getSeasonObjectives?.() || [];
    const results = getSeasonObjectivesResult?.();
    const resultById =
      results?.items?.length > 0
        ? Object.fromEntries(results.items.map(item => [item.id, item]))
        : null;
    const ctx = getSeasonGoalLiveContext?.(club) || getSeasonGoalLiveContext?.() || {};
    const cards = [];
    if (goal?.label) {
      const goalResult = getSeasonGoalResult?.();
      if (goalResult?.label) {
        const finalStatus =
          goalResult.status === 'exceeded' ? 'met' : goalResult.status || 'missed';
        cards.push(
          officeObjectiveCardHtml(
            goalResult.label,
            { hint: goalResult.feeling || '—', status: finalStatus },
            finalStatus,
          ),
        );
      } else {
        let mainProgress = { score: 0, hint: '—', status: 'missed' };
        try {
          mainProgress = seasonGoalLiveProgress(goal, ctx);
        } catch {
          /* noop */
        }
        cards.push(officeObjectiveCardHtml(goal.label, mainProgress));
      }
    }
    objectives.forEach(item => {
      const final = resultById?.[item.id];
      if (final) {
        cards.push(
          officeObjectiveCardHtml(item.label, { hint: final.hint, score: final.score, status: final.status }, final.status),
        );
      } else {
        cards.push(officeObjectiveCardHtml(item.label, seasonObjectiveLiveProgress(item, ctx, club)));
      }
    });
    wrap.innerHTML = cards.join('');
  };

  const renderOffice = () => {
    const club = userClubState();
    if (!club) return;
    const balance = getBalance(club);
    const balanceEl = $('#officeBudgetValue');
    const metaEl = $('#officeBudgetMeta');
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
    const goalGaugeEl = $('#officeSeasonGoalGauge');
    const goal = getSeasonGoal?.() || null;
    if (goalGaugeEl) {
      if (!goal?.label) {
        goalGaugeEl.innerHTML = '';
        goalGaugeEl.setAttribute('aria-hidden', 'true');
      } else {
        try {
          const ctx = getSeasonGoalLiveContext?.(club) || {};
          const progress = seasonGoalLiveProgress(goal, ctx);
          goalGaugeEl.innerHTML = seasonGoalGauge(progress, { office: true });
          goalGaugeEl.removeAttribute('aria-hidden');
        } catch {
          goalGaugeEl.innerHTML = '';
          goalGaugeEl.setAttribute('aria-hidden', 'true');
        }
      }
    }
    renderBoardBrief(club);
    renderOfficeObjectives(club);
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
      loan_active: 'Já existe um empréstimo ativo. Quite ou amortize o saldo antes de pedir outro.',
      over_limit: 'Valor acima do crédito que o banco libera hoje para o seu clube. Use o teto exato exibido no card.',
      credit_denied:
        'Banco recusou crédito. Melhore receitas, controle a folha e recupere a saúde financeira para voltar a negociar.',
      invalid_amount: 'Informe um valor válido.',
      insufficient_funds: 'Caixa insuficiente para essa parcela.',
      no_loan: 'Não há empréstimo ativo.',
      no_club: 'Clube indisponível.',
    })[reason] || 'Não foi possível concluir a operação bancária.';

  /** Máscara R$ X.XXX,XX — armazena centavos em dataset.loanCents */
  const formatLoanCurrencyInput = cents => {
    const n = Math.max(0, Math.round(Number(cents) || 0));
    if (!n) return '';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n / 100);
  };

  const applyLoanCurrencyMask = input => {
    if (!input) return;
    const digits = String(input.value || '').replace(/\D/g, '');
    const cents = digits ? parseInt(digits, 10) : 0;
    input.dataset.loanCents = String(cents);
    input.value = formatLoanCurrencyInput(cents);
  };

  const readLoanInputReais = input => {
    if (!input) return 0;
    const cents = Math.max(0, parseInt(input.dataset.loanCents || '0', 10) || 0);
    if (cents > 0) return Math.round(cents / 100);
    return parseLoanAmount(input.value);
  };

  /** Aceita máscara R$, 1800000, 1.800.000, 1,8 mi */
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
            <div class="office-meter-top"><small>CRÉDITO</small><b>${formatBudgetExact(status.available || 0)}</b></div>
            <span class="office-bank-loan-metric-sub">Teto liberado agora</span>
          </div>
          <div class="office-bank-loan-metric" data-meter="rate">
            <div class="office-meter-top"><small>JUROS</small><b>${ratePct}%</b></div>
            <span class="office-bank-loan-metric-sub">por rodada · antes do prazo</span>
          </div>
        </div>
      </div>`;
  };

  const buildBorrowRateBreakdown = (status, term) => {
    const t = BANK_LOAN_TERM_OPTIONS.includes(Number(term)) ? Number(term) : DEFAULT_BANK_LOAN_TERM;
    const termMult = loanTermRateMultiplier(t);
    const offerRate = status.offerRate ?? status.rate ?? 0;
    const contractRate = Math.round(offerRate * termMult * 10000) / 10000;
    return buildLoanRateBreakdown(
      {
        division: status.division,
        baseRate: status.seriesBaseRate ?? offerRate,
        rate: offerRate,
        finances: status.finances,
        coverage: status.coverage,
        tier: status.tier,
        tierLabel: status.tierLabel,
      },
      t,
      contractRate,
    );
  };

  const bankLoanInfoButtonHtml = () =>
    `<button type="button" class="office-bank-loan-info-btn" data-bank-loan-info>INFORMAÇÕES EMPRÉSTIMO</button>`;

  const bankLoanBreakdownRowsHtml = (bd, { delinquent = false, effectiveRatePct = null } = {}) => {
    if (!bd) return '';
    const coverageLine =
      bd.coverage != null
        ? `<div class="office-bank-loan-preview-row"><span>Cobertura receita ÷ folha</span><b>${Math.round(Number(bd.coverage) * 100)}%</b></div>`
        : '';
    const tierLine = bd.tierLabel
      ? `<div class="office-bank-loan-preview-row"><span>Perfil no banco</span><b>${bd.tierLabel}</b></div>`
      : '';
    const delinquentLine =
      delinquent && effectiveRatePct != null && effectiveRatePct !== bd.contractRatePct
        ? `<div class="office-bank-loan-preview-row office-bank-loan-preview-row--warn"><span>Taxa por atraso (esta rodada)</span><b class="spend">${effectiveRatePct}%</b></div>`
        : '';
    return `
        <div class="office-bank-loan-preview-row"><span>Taxa base · Série ${bd.division}</span><b>${bd.baseRatePct}%</b></div>
        <div class="office-bank-loan-preview-row"><span>Análise do clube</span><b>×${Number(bd.profileMult).toFixed(2)} → ${bd.profileRatePct}%</b></div>
        ${coverageLine}
        ${tierLine}
        <div class="office-bank-loan-preview-row"><span>Financiamento ${bd.term}x</span><b>×${Number(bd.termMult).toFixed(2)}</b></div>
        <div class="office-bank-loan-preview-row office-bank-loan-preview-row--total"><span>Taxa contratada</span><b>${bd.contractRatePct}% / rodada</b></div>
        ${delinquentLine}`;
  };

  const bankLoanBreakdownHtml = (bd, { delinquent = false, effectiveRatePct = null } = {}) => {
    if (!bd) return '';
    const lockedNote = bd.locked
      ? '<span class="office-bank-loan-breakdown-note">Valores congelados na assinatura do contrato.</span>'
      : '';
    return `
      <div class="office-bank-loan-breakdown">
        <small>COMO A TAXA FOI CALCULADA</small>
        ${lockedNote}
        ${bankLoanBreakdownRowsHtml(bd, { delinquent, effectiveRatePct })}
      </div>`;
  };

  const bankLoanBreakdownWindowHtml = (bd, { delinquent = false, effectiveRatePct = null } = {}) => {
    if (!bd) return '';
    const lockedNote = bd.locked
      ? '<p class="office-bank-loan-info-modal-note">Valores congelados na assinatura do contrato.</p>'
      : '';
    return `
      ${lockedNote}
      <div class="office-bank-loan-breakdown office-bank-loan-breakdown--window">
        <small>COMO A TAXA FOI CALCULADA</small>
        ${bankLoanBreakdownRowsHtml(bd, { delinquent, effectiveRatePct })}
      </div>`;
  };

  const bankLoanParcelDetailHtml = (quote, status) => {
    if (!quote?.adjusted) {
      return `<span>Parcela fixa do contrato · juros automáticos ${formatBudget(status.interestDue)} · ${status.installmentLabel || '—'}</span>`;
    }
    const stacked =
      quote.stackedParcels > 1
        ? `<div class="office-bank-loan-preview-row office-bank-loan-preview-row--warn"><span>Parcelas acumuladas</span><b>${quote.stackedParcels}x</b></div>`
        : '';
    return `
      <div class="office-bank-loan-parcel-detail">
        <div class="office-bank-loan-preview-row"><span>Parcela do contrato</span><b>${formatBudget(quote.baseInstallment)}</b></div>
        <div class="office-bank-loan-preview-row"><span>Principal em aberto</span><b>${formatBudget(quote.principalDue)}</b></div>
        <div class="office-bank-loan-preview-row"><span>Juros sobre a parcela</span><b class="spend">${formatBudget(quote.interestOnParcel)}</b></div>
        <div class="office-bank-loan-preview-row"><span>Multa por atraso</span><b class="spend">${formatBudget(quote.penaltyDue)}</b></div>
        ${stacked}
        <div class="office-bank-loan-preview-row office-bank-loan-preview-row--total"><span>Valor atual da parcela</span><b>${formatBudget(quote.currentInstallment)}</b></div>
        <span class="office-bank-loan-parcel-note">Botão PAGAR PARCELA cobra ${formatBudget(quote.payAmount)} (principal + multa). Juros automáticos: ${formatBudget(status.interestDue)}.</span>
      </div>`;
  };

  const bankLoanBorrowPreviewHtml = (status, amount, term, { includeHint = true } = {}) => {
    const fee = Math.max(0, Math.round(Number(amount) || 0));
    const t = BANK_LOAN_TERM_OPTIONS.includes(Number(term)) ? Number(term) : DEFAULT_BANK_LOAN_TERM;
    const termMult = loanTermRateMultiplier(t);
    const offerRate = status.offerRate ?? status.rate ?? 0;
    const contractRate = Math.round(offerRate * termMult * 10000) / 10000;
    if (!(fee >= 50_000)) {
      return `<p class="office-bank-loan-hint">Informe pelo menos R$ 50 mil e toque em OK para simular o empréstimo.</p>`;
    }
    const plan = previewLoanPlan(Math.min(fee, status.available || fee), contractRate, t);
    const hint = includeHint
      ? `<p class="office-bank-loan-hint">A cada rodada nacional: juros saem do caixa sozinhos; a parcela do principal você paga aqui no Escritório.</p>`
      : '';
    return `
      <div class="office-bank-loan-preview" aria-live="polite">
        <small>SIMULAÇÃO · ${t}x PARCELAS · ${formatBudget(Math.min(fee, status.available || fee))}</small>
        <div class="office-bank-loan-preview-row">
          <span>Parcela do principal</span><b>${formatBudget(plan.installmentPrincipal)}</b>
        </div>
        <div class="office-bank-loan-preview-row">
          <span>Juros da 1ª rodada (automático)</span><b>${formatBudget(plan.firstInterest)}</b>
        </div>
        <div class="office-bank-loan-preview-row">
          <span>Custo estimado / rodada</span><b>${formatBudget(plan.roundCostEstimate)}</b>
        </div>
        <div class="office-bank-loan-preview-row office-bank-loan-preview-row--total">
          <span>Juros totais do financiamento</span><b>${formatBudget(plan.totalInterest)}</b>
        </div>
        ${hint}
      </div>`;
  };

  const buildBankLoanBorrowModalBody = (status, amount, term) => {
    const simulation = bankLoanBorrowPreviewHtml(status, amount, term, { includeHint: true });
    const breakdown = bankLoanBreakdownWindowHtml(buildBorrowRateBreakdown(status, term));
    return `${simulation}${breakdown}`;
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
          ? `Contrato ${status.installmentLabel || '—'} · atraso ${status.delinquencyStreak} rodada(s) · taxa ${status.contractRatePct ?? ratePct}%`
          : `Contrato ${status.installmentLabel || '—'} · taxa ${status.contractRatePct ?? ratePct}% (travada)`
        : `Simule valor e parcelas · taxa depende da saúde financeira do clube`;
    }

    if (!status.active) {
      const metrics = bankLoanMetricsHtml(status, ratePct);
      if (!status.eligible) {
        body.innerHTML = `
          ${metrics}
          <p class="office-bank-loan-warn">${
            status.shortfall
              ? 'Há atraso de folha ou de parcela do empréstimo — normalize os pagamentos antes de pedir crédito de novo.'
              : `Crédito indisponível agora (saúde ${status.finances}%). Melhore o caixa e a cobertura da folha.`
          }</p>`;
        return;
      }
      const termButtons = BANK_LOAN_TERM_OPTIONS.map(
        t =>
          `<button type="button" class="office-bank-loan-term${t === DEFAULT_BANK_LOAN_TERM ? ' is-active' : ''}" data-bank-term="${t}" aria-pressed="${t === DEFAULT_BANK_LOAN_TERM}">${t}x</button>`,
      ).join('');
      body.innerHTML = `
        ${metrics}
        <form class="office-bank-loan-form" id="officeBankLoanForm" autocomplete="off">
          <label class="office-bank-loan-form-label" for="officeBankLoanAmount">VALOR SOLICITADO</label>
          <div class="office-bank-loan-form-row">
            <input
              id="officeBankLoanAmount"
              class="office-bank-loan-input"
              type="text"
              inputmode="numeric"
              placeholder="R$ 0,00"
              maxlength="22"
              aria-label="Valor do empréstimo"
              autocomplete="off"
            />
            <button type="button" class="office-bank-loan-submit" data-bank-simulate title="Simular empréstimo">OK</button>
          </div>
          <div class="office-bank-loan-term-row" role="group" aria-label="Quantidade de parcelas">
            <span class="office-bank-loan-form-label">QUANTIDADE DE PARCELAS</span>
            <p class="office-bank-loan-term-hint">Mais parcelas = taxa maior · menos parcelas = taxa menor</p>
            <div class="office-bank-loan-term-buttons">${termButtons}</div>
          </div>
          ${bankLoanInfoButtonHtml()}
          <p class="office-bank-loan-hint">Crédito disponível até ${formatBudgetExact(status.available)} · mínimo R$ 50 mil · toque OK para simular</p>
        </form>`;
      return;
    }

    const cash = getBalance?.(club) ?? 0;
    const quote = status.installmentQuote || {};
    const parcelPay = quote.payAmount > 0 ? quote.payAmount : quote.baseInstallment || 0;
    const parcelDisplay = quote.adjusted ? quote.currentInstallment : quote.baseInstallment || parcelPay;
    const extraPay = Math.min(
      status.balance + (Number(status.penaltyDue) || 0),
      (quote.baseInstallment || parcelPay) * 2 + (Number(status.penaltyDue) || 0),
    );
    const repayAll = status.balance + (Number(status.penaltyDue) || 0);
    const canParcel = cash >= parcelPay;
    const canExtra = cash >= extraPay && extraPay > parcelPay;
    const canAll = cash >= repayAll;
    const parcelDetail = bankLoanParcelDetailHtml(quote, status);
    const warnHtml = status.delinquent
      ? `<p class="office-bank-loan-warn"><strong>Parcela em atraso.</strong> ${status.delinquencyStreak} rodada(s) sem pagamento — encargos aplicados. Regularize antes da próxima rodada nacional.</p>`
      : status.minAmortDue > 0
        ? `<p class="office-bank-loan-hint-inline">Parcela aberta nesta rodada — pague no Escritório antes da próxima rodada nacional.</p>`
        : '';
    body.innerHTML = `
      ${bankLoanInfoButtonHtml()}
      <div class="office-bank-loan-stats">
        <div><small>SALDO DEVEDOR</small><b class="spend">${formatBudget(status.balance)}</b>
          <span>De ${formatBudget(status.principal)} original · faltam ${status.installmentsRemaining || 0} parcela(s)</span>
        </div>
        <div class="office-bank-loan-stat-parcel"><small>PARCELA ${status.installmentLabel || ''}</small><b class="spend">${formatBudget(parcelDisplay)}</b>
          ${parcelDetail}
        </div>
        <div><small>ESTA RODADA</small><b>${formatBudget(status.interestDue + parcelPay)}</b>
          <span>Juros automáticos ${formatBudget(status.interestDue)} + pagar no Escritório ${formatBudget(parcelPay)}</span>
        </div>
      </div>
      ${warnHtml}
      <div class="office-bank-loan-actions">
        <button type="button" class="office-bank-loan-btn office-bank-loan-btn--primary" data-bank-pay-installment ${canParcel ? '' : 'disabled'} title="${
          canParcel ? 'Quita principal em aberto + multa' : 'Saldo insuficiente'
        }"><span>PAGAR PARCELA</span><strong>${formatBudget(parcelPay)}</strong></button>
        <button type="button" class="office-bank-loan-btn office-bank-loan-btn--secondary" data-bank-repay-extra="${extraPay}" ${canExtra ? '' : 'disabled'} title="${
          canExtra ? 'Antecipa 2 parcelas do principal' : 'Saldo insuficiente'
        }"><span>AMORTIZAR +1 PARCELA</span><strong>${formatBudget(extraPay)}</strong></button>
        <button type="button" class="office-bank-loan-btn office-bank-loan-btn--quit" data-bank-repay="${repayAll}" ${canAll ? '' : 'disabled'} title="${
          canAll ? 'Encerra o contrato' : 'Saldo insuficiente'
        }"><span>QUITAR DÍVIDA</span><strong>${formatBudget(repayAll)}</strong></button>
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

  const BANK_LOAN_ALERT_MODAL_HTML = `
<div id="officeBankLoanAlertModal" class="modal hidden">
  <div class="modal-card manager-sack-modal">
    <label>EMPRÉSTIMO BANCÁRIO</label>
    <h2 id="officeBankLoanAlertTitle">Empréstimo bancário</h2>
    <p id="officeBankLoanAlertLead" class="manager-sack-lead"></p>
    <div class="manager-sack-actions">
      <button id="officeBankLoanAlertDismiss" type="button" class="manager-sack-refuse">FECHAR</button>
    </div>
  </div>
</div>`;

  const BANK_LOAN_BORROW_MODAL_HTML = `
<div id="officeBankLoanBorrowModal" class="modal hidden">
  <div class="modal-card office-bank-loan-info-modal" role="dialog" aria-modal="true" aria-labelledby="officeBankLoanBorrowTitle">
    <header class="office-bank-loan-info-modal-header">
      <div class="office-bank-loan-info-modal-heading">
        <h2 id="officeBankLoanBorrowTitle">Simulador do empréstimo</h2>
      </div>
    </header>
    <div class="office-bank-loan-info-modal-body" id="officeBankLoanBorrowContent"></div>
    <footer class="office-bank-loan-info-modal-actions office-bank-loan-borrow-modal-actions">
      <button id="officeBankLoanBorrowDeny" type="button" class="office-bank-loan-info-dismiss">NEGAR</button>
      <button id="officeBankLoanBorrowConfirm" type="button" class="office-bank-loan-borrow-confirm">CONFIRMAR</button>
    </footer>
  </div>
</div>`;

  const BANK_LOAN_INFO_MODAL_HTML = `
<div id="officeBankLoanInfoModal" class="modal hidden">
  <div class="modal-card office-bank-loan-info-modal" role="dialog" aria-modal="true" aria-labelledby="officeBankLoanInfoTitle">
    <header class="office-bank-loan-info-modal-header">
      <div class="office-bank-loan-info-modal-heading">
        <h2 id="officeBankLoanInfoTitle">Simulador do empréstimo</h2>
      </div>
    </header>
    <div class="office-bank-loan-info-modal-body" id="officeBankLoanInfoContent"></div>
    <footer class="office-bank-loan-info-modal-actions">
      <button id="officeBankLoanInfoDismiss" type="button" class="office-bank-loan-info-dismiss">FECHAR</button>
    </footer>
  </div>
</div>`;

  const closeBankLoanInfoModal = () => {
    $('#officeBankLoanInfoModal')?.classList.add('hidden');
  };

  let bankLoanAlertModalBound = false;
  const ensureBankLoanAlertModal = () => {
    if (!$('#officeBankLoanAlertModal')) {
      document.body.insertAdjacentHTML('beforeend', BANK_LOAN_ALERT_MODAL_HTML);
    }
    if (bankLoanAlertModalBound) return;
    bankLoanAlertModalBound = true;
    document.addEventListener('click', event => {
      const dismissBtn = event.target.closest('#officeBankLoanAlertDismiss');
      const modal = $('#officeBankLoanAlertModal');
      if (dismissBtn) {
        event.preventDefault();
        modal?.classList.add('hidden');
        return;
      }
      if (event.target === modal) {
        modal?.classList.add('hidden');
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      $('#officeBankLoanAlertModal')?.classList.add('hidden');
    });
  };

  /** Aviso efêmero do empréstimo — não grava na inbox. */
  const showBankLoanAlert = ({ title = 'Empréstimo bancário', lead = '' } = {}) => {
    ensureBankLoanAlertModal();
    const titleEl = $('#officeBankLoanAlertTitle');
    const leadEl = $('#officeBankLoanAlertLead');
    if (titleEl) titleEl.textContent = title;
    if (leadEl) leadEl.textContent = lead;
    $('#officeBankLoanAlertModal')?.classList.remove('hidden');
  };

  let bankLoanBorrowState = null;

  const closeBankLoanBorrowModal = () => {
    bankLoanBorrowState = null;
    $('#officeBankLoanBorrowModal')?.classList.add('hidden');
  };

  let bankLoanBorrowModalBound = false;
  const ensureBankLoanBorrowModal = () => {
    if (!$('#officeBankLoanBorrowModal')) {
      document.body.insertAdjacentHTML('beforeend', BANK_LOAN_BORROW_MODAL_HTML);
    }
    if (bankLoanBorrowModalBound) return;
    bankLoanBorrowModalBound = true;
    document.addEventListener('click', event => {
      const denyBtn = event.target.closest('#officeBankLoanBorrowDeny');
      const confirmBtn = event.target.closest('#officeBankLoanBorrowConfirm');
      const modal = $('#officeBankLoanBorrowModal');
      if (denyBtn) {
        event.preventDefault();
        closeBankLoanBorrowModal();
        return;
      }
      if (confirmBtn) {
        event.preventDefault();
        const pending = bankLoanBorrowState;
        closeBankLoanBorrowModal();
        if (pending) submitBankLoanBorrow(pending.amount, pending.term);
        return;
      }
      if (event.target === modal) {
        closeBankLoanBorrowModal();
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if ($('#officeBankLoanBorrowModal')?.classList.contains('hidden')) return;
      closeBankLoanBorrowModal();
    });
  };

  const openBankLoanBorrowModal = (amount, term) => {
    const club = userClubState();
    if (!club || !bankLoanStatus) return;
    const division = getUserDivision?.() || club.division || 'A';
    const status = bankLoanStatus(club, { division });
    const limit = Math.max(0, Math.round(Number(status.available) || 0));
    let fee = Math.max(0, Math.round(Number(amount) || 0));
    const t = BANK_LOAN_TERM_OPTIONS.includes(Number(term)) ? Number(term) : DEFAULT_BANK_LOAN_TERM;
    if (!(fee >= 50_000)) {
      showBankLoanAlert({
        title: 'Valor insuficiente',
        lead: 'Informe pelo menos R$ 50 mil para simular o empréstimo.',
      });
      const input = $('#officeBankLoanAmount');
      input?.focus();
      input?.select?.();
      return;
    }
    if (fee > limit) {
      if (limit < 50_000) {
        showBankLoanAlert({
          title: 'Crédito indisponível',
          lead: bankLoanRejectCopy('over_limit'),
        });
        return;
      }
      fee = limit;
      const input = $('#officeBankLoanAmount');
      if (input) {
        input.dataset.loanCents = String(limit * 100);
        input.value = formatLoanCurrencyInput(limit * 100);
      }
    }
    ensureBankLoanBorrowModal();
    bankLoanBorrowState = { amount: fee, term: t };
    const content = $('#officeBankLoanBorrowContent');
    if (content) content.innerHTML = buildBankLoanBorrowModalBody(status, fee, t);
    $('#officeBankLoanBorrowModal')?.classList.remove('hidden');
  };

  let bankLoanInfoModalBound = false;
  const ensureBankLoanInfoModal = () => {
    if (!$('#officeBankLoanInfoModal')) {
      document.body.insertAdjacentHTML('beforeend', BANK_LOAN_INFO_MODAL_HTML);
    }
    if (bankLoanInfoModalBound) return;
    bankLoanInfoModalBound = true;
    document.addEventListener('click', event => {
      const dismissBtn = event.target.closest('#officeBankLoanInfoDismiss');
      const modal = $('#officeBankLoanInfoModal');
      if (dismissBtn) {
        event.preventDefault();
        closeBankLoanInfoModal();
        return;
      }
      if (event.target === modal) {
        closeBankLoanInfoModal();
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if ($('#officeBankLoanInfoModal')?.classList.contains('hidden')) return;
      closeBankLoanInfoModal();
    });
  };

  const openBankLoanInfoModal = () => {
    const club = userClubState();
    if (!club || !bankLoanStatus) return;
    const division = getUserDivision?.() || club.division || 'A';
    const status = bankLoanStatus(club, { division });
    let breakdownHtml = '';
    if (status.active) {
      breakdownHtml = bankLoanBreakdownWindowHtml(status.rateBreakdown, {
        delinquent: status.delinquent,
        effectiveRatePct: status.effectiveRatePct,
      });
    } else {
      const termBtn = document.querySelector('[data-bank-term].is-active');
      const term = Number(termBtn?.dataset.bankTerm) || DEFAULT_BANK_LOAN_TERM;
      breakdownHtml = bankLoanBreakdownWindowHtml(buildBorrowRateBreakdown(status, term));
    }
    ensureBankLoanInfoModal();
    const content = $('#officeBankLoanInfoContent');
    if (content) content.innerHTML = breakdownHtml;
    $('#officeBankLoanInfoModal')?.classList.remove('hidden');
  };

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

  const renderInvestmentLevels = club => {
    if (!club) return;
    const medicalLevel = Number(club.medicalInvestment) || 0;
    const preventionLevel = Number(club.preventionProgram) || 0;
    const youthRow = listUpgrades?.(club)?.find?.(row => row.id === 'youth_academy');
    const youthMax = Number(youthRow?.maxLevel) || 5;
    const youthLevel = Math.max(0, Math.min(youthMax, Number(youthRow?.level) || 0));
    const medicalEl = $('#officeMedicalLevel');
    const preventionEl = $('#officePreventionLevel');
    const youthEl = $('#officeYouthLevel');
    if (medicalEl) medicalEl.textContent = `${medicalLevel}/5`;
    if (preventionEl) preventionEl.textContent = `${preventionLevel}/3`;
    if (youthEl) youthEl.textContent = `${youthLevel}/${youthMax}`;
    document.querySelectorAll('.office-investment-levels .office-meter').forEach(meter => {
      meter.removeAttribute('data-tone');
    });
    setMeterBar('#officeMedicalBar', (medicalLevel / 5) * 100);
    setMeterBar('#officePreventionBar', (preventionLevel / 3) * 100);
    setMeterBar('#officeYouthBar', (youthLevel / youthMax) * 100);
  };

  const renderInvestments = () => {
    const club = userClubState();
    renderUpgradeRows($('#economyInvestmentsList'), club ? listUpgrades(club) : [], 'data-buy-upgrade');
    renderInvestmentLevels(club);
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
    if (capacityEl) {
      const maxCap = maxAchievableStadiumCapacity(division);
      const cap = Number(club.stadiumCapacity) || 0;
      capacityEl.textContent =
        maxCap > 0 && cap >= maxCap * 0.98
          ? `${formatCapacity(cap)} · teto`
          : `${formatCapacity(cap)} / ${formatCapacity(maxCap)}`;
    }
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
      hintEl.textContent = `Estimativa média · Ambiente ${env}% · Nacional ${Math.round(national.fillRate * 100)}% lotação · Copas ${Math.round(cups.fillRate * 100)}%. Preço por setor — premium eleva o ticket médio.`;
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
    const division = getUserDivision?.() || club.division || 'A';
    const { rows } = computeSectorBreakdown(club, division);
    const activeSectors = rows.filter(row => row.seats > 0).map(row => row.id);
    const ticketStep = 5;
    const channels = [
      {
        id: 'national',
        label: 'Campeonato Nacional',
        description: 'Brasileirão e confrontos de liga em casa.',
      },
      {
        id: 'cups',
        label: 'Copas',
        description: 'Copa do Brasil e eliminatórias em casa.',
      },
    ];
    list.innerHTML = channels
      .map(channel => {
        const sectorRows = activeSectors
          .map(sectorId => {
            const def = STADIUM_SECTOR_DEFS[sectorId];
            const range = TICKET_SECTOR_PRICE_RANGE[sectorId]?.[channel.id];
            const price = prices[channel.id]?.[sectorId] ?? range?.min ?? 0;
            const atMin = !range || price <= range.min;
            const atMax = !range || price >= range.max;
            const label = def?.shortLabel || def?.label || sectorId;
            return `<div class="stadium-ticket-row" data-ticket-channel="${channel.id}" data-ticket-sector="${sectorId}">
          <div>
            <b>${label}</b>
          </div>
          <span class="stadium-ticket-price">${formatTicketPrice(price)}</span>
          <div class="stadium-ticket-controls">
            <button type="button" class="stadium-ticket-step" data-ticket-adjust="${channel.id}" data-ticket-sector="${sectorId}" data-delta="-${ticketStep}" ${atMin ? 'disabled' : ''} aria-label="Diminuir ingresso ${label} ${channel.label}">−</button>
            <button type="button" class="stadium-ticket-step" data-ticket-adjust="${channel.id}" data-ticket-sector="${sectorId}" data-delta="${ticketStep}" ${atMax ? 'disabled' : ''} aria-label="Aumentar ingresso ${label} ${channel.label}">+</button>
          </div>
        </div>`;
          })
          .join('');
        return `<div class="stadium-ticket-group">
        <div class="stadium-ticket-group-head">
          <b>${channel.label}</b>
          <small>${channel.description}</small>
        </div>
        ${sectorRows}
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
    {
      key: 'loan_out_wages',
      label: 'Salários emprestados',
      match: reason => reason === 'loan_out_wages',
    },
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
    const payrollPreview = evaluateRosterPayroll?.(club, { division }) || null;
    const recurringRevenue =
      payrollPreview?.revenue || estimateRoundRecurringRevenue?.(club, division) || 0;
    const payrollPct = payrollPreview?.pctBefore ?? (recurringRevenue > 0 ? Math.round((wageBill / recurringRevenue) * 100) : 0);
    const payrollTone =
      payrollPct > 100 ? 'risk' : payrollPct >= 85 ? 'warn' : 'ok';
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
        ? `ATRASO ${loanStatus.delinquencyStreak}r · juros ${formatBudget(loanStatus.interestDue)} + parcela ${formatBudget(
            (loanStatus.minAmortDue || 0) + (loanStatus.penaltyDue || 0),
          )}`
        : `Juros automáticos ${formatBudget(loanStatus.interestDue)} · parcela no Escritório ${formatBudget(
            loanStatus.minAmortDue || loanStatus.installmentPrincipal || loanStatus.minAmort,
          )}${loanStatus.installmentLabel ? ` · ${loanStatus.installmentLabel}` : ''}`
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
      <div class="office-cashflow-payroll" data-tone="${payrollTone}">
        <div class="office-cashflow-payroll-main">
          <small>FOLHA SALARIAL</small>
          <b>${formatBudget(wageBill)}<span>/rodada</span></b>
          <span>${payrollPct}% da receita recorrente${
            payrollPreview?.limit ? ` · limite ${formatBudget(payrollPreview.limit)}` : ''
          }</span>
        </div>
        <div class="office-cashflow-payroll-side">
          <span>Comissão ${formatBudget(staffBill)}</span>
          <span>Estádio ${formatBudget(stadiumBill)}</span>
        </div>
      </div>
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

  const submitBankLoanBorrow = (amount, term = DEFAULT_BANK_LOAN_TERM) => {
    const club = userClubState();
    if (!club || !takeBankLoan) return;
    const result = takeBankLoan(club, amount, {
      division: getUserDivision?.() || club.division || 'A',
      season: getCareerSeason?.() ?? null,
      round: getCurrentRound?.() ?? null,
      term,
    });
    if (!result.ok) {
      showBankLoanAlert({
        title: 'Empréstimo negado',
        lead: bankLoanRejectCopy(result.reason),
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
    const plan = result.plan;
    pushMessage?.({
      category: 'club',
      type: 'budget',
      title: 'Empréstimo contratado',
      body: `${formatBudget(result.amount)} em ${result.term}x · ${formatBudget(result.installmentPrincipal)}/parcela · taxa ${(result.rate * 1000) / 10}% (contrato) · juros totais est. ${formatBudget(plan?.totalInterest || 0)}. Orçamento: ${formatBudget(result.clubBalance)}.`,
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
        const termBtn = form.querySelector('[data-bank-term].is-active');
        const term = Number(termBtn?.dataset.bankTerm) || DEFAULT_BANK_LOAN_TERM;
        openBankLoanBorrowModal(readLoanInputReais(input), term);
      });
      loanBody.addEventListener('input', event => {
        if (event.target.matches('#officeBankLoanAmount')) {
          applyLoanCurrencyMask(event.target);
        }
      });
      loanBody.addEventListener('click', event => {
        const simulateBtn = event.target.closest('[data-bank-simulate]');
        if (simulateBtn) {
          event.preventDefault();
          const form = simulateBtn.closest('#officeBankLoanForm');
          const input = form?.querySelector('#officeBankLoanAmount');
          const termBtn = form?.querySelector('[data-bank-term].is-active');
          const term = Number(termBtn?.dataset.bankTerm) || DEFAULT_BANK_LOAN_TERM;
          openBankLoanBorrowModal(readLoanInputReais(input), term);
          return;
        }
        const termBtn = event.target.closest('[data-bank-term]');
        if (!termBtn) return;
        event.preventDefault();
        loanBody.querySelectorAll('[data-bank-term]').forEach(btn => {
          btn.classList.toggle('is-active', btn === termBtn);
          btn.setAttribute('aria-pressed', btn === termBtn ? 'true' : 'false');
        });
      });
    }

    onClick('#officeCashflow', event => {
      const btn = event.target.closest('[data-tv-advance]');
      if (!btn || btn.disabled) return;
      submitTvAdvance();
    });

    onClick('#officeBankLoanBody', event => {
      const infoBtn = event.target.closest('[data-bank-loan-info]');
      if (infoBtn) {
        event.preventDefault();
        openBankLoanInfoModal();
        return;
      }

      const parcelBtn = event.target.closest('[data-bank-pay-installment]');
      if (parcelBtn && !parcelBtn.disabled) {
        const club = userClubState();
        if (!club || !payBankLoanMinimum) return;
        const result = payBankLoanMinimum(club, {
          division: getUserDivision?.() || club.division || 'A',
        });
        if (!result.ok) {
          pushMessage?.({
            category: 'club',
            type: 'budget',
            title: 'Pagamento de parcela',
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
          title: result.cleared ? 'Empréstimo quitado' : 'Parcela paga',
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

      const extraBtn = event.target.closest('[data-bank-repay-extra]');
      if (extraBtn && !extraBtn.disabled) {
        const club = userClubState();
        if (!club || !repayBankLoan) return;
        const amount = Number(extraBtn.dataset.bankRepayExtra);
        const result = repayBankLoan(club, amount, {
          division: getUserDivision?.() || club.division || 'A',
        });
        if (!result.ok) {
          pushMessage?.({
            category: 'club',
            type: 'budget',
            title: 'Amortização extra',
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
          title: result.cleared ? 'Empréstimo quitado' : 'Parcelas extras pagas',
          body: result.cleared
            ? `Pago ${formatBudget(result.paid)}. Dívida encerrada. Orçamento: ${formatBudget(result.clubBalance)}.`
            : `Pago ${formatBudget(result.paid)}. Saldo devedor: ${formatBudget(result.remaining)}. Orçamento: ${formatBudget(result.clubBalance)}.`,
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
      adjustSectorTicketPrice(
        club,
        button.dataset.ticketAdjust,
        button.dataset.ticketSector,
        Number(button.dataset.delta),
      );
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
