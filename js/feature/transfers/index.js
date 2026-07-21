import { MODULE_VERSIONS } from '../../core/constants.js';
import { traitCodes } from '../../engine/player-generation.js';
import {
  formatSellerRejectLetter,
  formatLoanLevelPlayerReply,
  transferRejectReasonLine,
} from '../../engine/transfer-offer-copy.js';

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

const sideLetter = player => {
  const foot = String(player?.preferredFoot || player?.foot || '').toLowerCase();
  if (foot.startsWith('l') || foot === 'e' || foot.includes('esquer')) return 'E';
  if (foot.startsWith('r') || foot === 'd' || foot.includes('direit')) return 'D';
  const pos = String(player?.pos || '').toUpperCase();
  if (pos === 'PE') return 'E';
  if (pos === 'PD') return 'D';
  return 'A';
};

const listedMark = listed =>
  listed
    ? '<span class="transfers-listed-yes" aria-label="À venda" title="À venda"></span>'
    : '<span class="transfers-listed-no" aria-label="Não listado" title="Não listado">✕</span>';

const COL_STORAGE = {
  buy: 'matchday-transfers-col-widths-buy',
  sell: 'matchday-transfers-col-widths-sell-v2',
};

/** Larguras padrão (%) — compra: 11 colunas */
const DEFAULT_BUY_WIDTHS = [20, 18, 6, 3, 5.5, 4, 6, 6, 5, 3.5, 16];
/** Venda: 10 colunas */
const DEFAULT_SELL_WIDTHS = [30, 5, 4, 5, 5, 8, 8, 6, 5, 14];

/**
 * Mínimos (%) para não ocultar cabeçalho/dados (botões, nomes, valores).
 * Compra: Jogador, Clube, Posição, Pé, Overall, Idade, Salário, Passe, Caract., Venda, Ações
 */
const MIN_BUY_WIDTHS = [12, 12, 5.5, 3, 5.5, 4, 6, 6, 5, 3.5, 14];
/** Venda: Jogador, Posição, Pé, Overall, Idade, Salário, Valor, Caract., Venda, Ações */
const MIN_SELL_WIDTHS = [18, 5, 3, 5, 4, 6, 6, 5, 3.5, 12];

const clampColWidths = (widths, mins, defaults) => {
  const next = widths.map((value, index) => {
    const n = Number(value);
    const base = Number.isFinite(n) && n > 0 ? n : defaults[index];
    return Math.max(mins[index], base);
  });
  const total = next.reduce((sum, value) => sum + value, 0);
  if (total <= 100.01) return next;
  // Normaliza mantendo mínimos — corta do maior acima do mínimo
  let overflow = total - 100;
  const order = next
    .map((value, index) => ({ index, spare: value - mins[index] }))
    .filter(item => item.spare > 0)
    .sort((a, b) => b.spare - a.spare);
  for (const item of order) {
    if (overflow <= 0) break;
    const cut = Math.min(item.spare, overflow);
    next[item.index] -= cut;
    overflow -= cut;
  }
  return next;
};

const loadColWidths = (key, fallback, mins) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback.slice();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== fallback.length) return fallback.slice();
    return clampColWidths(parsed, mins, fallback);
  } catch {
    return fallback.slice();
  }
};

const saveColWidths = (key, widths) => {
  try {
    localStorage.setItem(key, JSON.stringify(widths));
  } catch {
    /* quota / private mode */
  }
};

/**
 * UI do mercado — busca estilo Brasfoot, visual Matchday.
 */
export function createTransfersFeature(deps) {
  const {
    $,
    onClick,
    getTransfersEngine,
    getBalance,
    getUserClub,
    formatBudget,
    pushMessage,
    onDealComplete,
    getCurrentRound,
    openOfferMessage,
  } = deps;

  let tab = 'buy';
  let filters = {
    pos: '',
    division: '',
    query: '',
    minOvr: 0,
    maxOvr: 0,
    minAge: 0,
    maxAge: 0,
    maxPrice: 0,
    maxWage: 0,
    listedOnly: false,
    loanOnly: false,
    sortBy: 'ovr',
    sortDir: 'desc',
  };
  let sellFilters = {
    pos: '',
    query: '',
    minOvr: 0,
    maxOvr: 0,
    minAge: 0,
    maxAge: 0,
    maxPrice: 0,
    maxWage: 0,
    listedOnly: false,
    loanOnly: false,
    sortBy: 'ovr',
    sortDir: 'desc',
  };
  let persistSeason = typeof deps.onPersist === 'function' ? deps.onPersist : () => {};
  let statusText = '';
  let seededListings = false;
  /** Índice da página de propostas recebidas (cards por linha). */
  let incomingOfferIndex = 0;
  let incomingAutoTimer = null;
  let incomingHoverPaused = false;
  const INCOMING_ROTATE_MS = 4200;

  const incomingPageSize = () => {
    const box = $('#transfersIncomingOffers');
    const width = box?.clientWidth || 0;
    if (width < 80) return 4;
    const sideNav = 84;
    const minCard = 148;
    const gap = 8;
    return Math.max(1, Math.floor((width - sideNav) / (minCard + gap)));
  };

  const offerKindLabel = offer => {
    if (offer?.type === 'loan') return 'EMPRÉSTIMO';
    if (offer?.type === 'sell') return 'VENDA';
    return 'COMPRA';
  };

  const stopIncomingAutoRotate = () => {
    if (incomingAutoTimer) {
      clearInterval(incomingAutoTimer);
      incomingAutoTimer = null;
    }
  };

  const startIncomingAutoRotate = () => {
    stopIncomingAutoRotate();
    const root = $('#transfers');
    const api = engine();
    if (!root?.classList.contains('active') || !api?.listPendingOffers) return;
    const pending = api.listPendingOffers({ status: 'pending' });
    const pageSize = incomingPageSize();
    if (pending.length <= pageSize) return;
    incomingAutoTimer = setInterval(() => {
      if (incomingHoverPaused) return;
      if (!$('#transfers')?.classList.contains('active')) {
        stopIncomingAutoRotate();
        return;
      }
      const list = engine()?.listPendingOffers?.({ status: 'pending' }) || [];
      const size = incomingPageSize();
      if (list.length <= size) {
        stopIncomingAutoRotate();
        return;
      }
      const next = incomingOfferIndex + size;
      incomingOfferIndex = next >= list.length ? 0 : next;
      renderIncomingOffers();
    }, INCOMING_ROTATE_MS);
  };

  const setPersist = fn => {
    persistSeason = typeof fn === 'function' ? fn : () => {};
  };

  const engine = () => getTransfersEngine?.();

  const setStatus = text => {
    statusText = text || '';
    const el = $('#transfersStatus');
    if (el) el.textContent = statusText;
  };

  const rejectReasonHint = reason =>
    ({
      division_gap: 'diferença de série',
      contract_long: 'contrato longo',
      pos_thin: 'poucos na posição',
      roster_thin: 'elenco curto',
      good_moment: 'clube em bom momento',
      rank_strong: 'ranking nacional forte',
      star: 'peça importante do elenco',
      bad_moment: 'clube em momento difícil',
      rank_weak: 'clube precisa de caixa',
      contract_short: 'contrato curto',
      pos_depth: 'sobra na posição',
      listed: 'já listado',
      injured: 'jogador lesionado',
      manager_pull: 'interesse no seu técnico',
    })[reason] || null;

  const reasonLabel = (reason, extra = {}) => {
    if (reason === 'window_closed') {
      const next = extra.nextOpenLabel || extra.nextOpenDate;
      if (next instanceof Date) {
        const label = next.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        return `Janela de transferências fechada — reabre em ${label}.`;
      }
      return next
        ? `Janela de transferências fechada — reabre em ${next}.`
        : 'Janela de transferências fechada no momento.';
    }
    if (reason === 'offer_too_high') {
      return extra.askCap
        ? `Nenhum clube topa este preço. Tente perto de ${formatMoney(extra.askCap)} ou menos.`
        : 'Preço alto demais — nenhum clube aceitou. Tente baixar.';
    }
    if (
      (reason === 'rejected' || reason === 'division_gap') &&
      (Array.isArray(extra.reasons) || extra.playerName || extra.clubName)
    ) {
      return formatSellerRejectLetter({
        clubName: extra.clubName || extra.from || extra.sellerName,
        playerName: extra.playerName || extra.player?.name,
        reasons:
          reason === 'division_gap' && !(extra.reasons || []).includes('division_gap')
            ? ['division_gap', ...(extra.reasons || [])]
            : extra.reasons || (reason === 'division_gap' ? ['division_gap'] : ['rejected']),
      });
    }
    if (reason === 'rejected' && Array.isArray(extra.reasons) && extra.reasons.length) {
      const bits = extra.reasons
        .map(r => transferRejectReasonLine(r) || rejectReasonHint(r))
        .filter(Boolean)
        .slice(0, 2);
      if (bits.length) {
        return formatSellerRejectLetter({
          clubName: extra.clubName,
          playerName: extra.playerName,
          reasons: extra.reasons,
        });
      }
    }
    return (
      {
        market_closed: 'Mercado fechado no momento (partida ou transição em andamento).',
        window_closed: 'Janela de transferências fechada no momento.',
        cannot_afford: 'Caixa insuficiente para esta oferta.',
        rejected: formatSellerRejectLetter({
          clubName: extra.clubName,
          playerName: extra.playerName,
          reasons: ['rejected'],
        }),
        division_gap: formatSellerRejectLetter({
          clubName: extra.clubName,
          playerName: extra.playerName,
          reasons: ['division_gap'],
        }),
        roster_full: 'Elenco no limite antifail (40 jogadores).',
        roster_hard_full: 'Elenco no limite antifail (40 jogadores).',
        payroll_pressure:
          'Folha ficaria acima do confortável para sua saúde financeira. Venda, empreste ou escolha um salário menor.',
        min_roster: 'Elenco no mínimo — não é possível vender ou ceder.',
        seller_min_roster: 'O clube vendedor não pode ficar abaixo do mínimo.',
        not_found: 'Jogador não encontrado.',
        no_buyer: 'Nenhum clube interessado no momento.',
        offer_too_high:
          transferRejectReasonLine('offer_too_high') ||
          'Preço alto demais — nenhum clube aceitou. Tente baixar.',
        no_club: 'Clube inválido.',
        on_loan: 'Jogador está emprestado e não pode ser negociado assim.',
        not_on_loan: 'Este jogador não está emprestado.',
        not_loan_listed: 'Jogador não está disponível para empréstimo.',
        loan_in_limit: 'Limite de 3 empréstimos no elenco atingido.',
        loan_out_limit: 'Limite de 3 jogadores cedidos por empréstimo atingido.',
        no_loan_host: 'Nenhum clube disponível para receber o empréstimo.',
        loan_level: formatLoanLevelPlayerReply({
          playerName: extra.playerName || extra.player?.name,
        }),
        no_buy_option: 'Este empréstimo não tem opção de compra registrada.',
        invalid_fee: 'Taxa da opção de compra inválida.',
        no_funds: 'Caixa insuficiente para exercer a opção de compra.',
        same_club: 'Não é possível exercer a opção no próprio clube.',
        already_moved:
          transferRejectReasonLine('already_moved') ||
          'Este jogador já se movimentou nesta janela — só volta a negociar na próxima.',
      }[reason] || 'Não foi possível concluir a operação.'
    );
  };

  let alertState = null;

  const closeActionAlert = () => {
    alertState = null;
    const secondary = $('#transfersAlertSecondary');
    if (secondary) {
      secondary.classList.add('hidden');
      secondary.textContent = 'AGORA NÃO';
    }
    const ok = $('#transfersAlertOk');
    if (ok) ok.textContent = 'ENTENDI';
    $('#transfersAlertModal')?.classList.add('hidden');
  };

  const fillPayrollPanel = payroll => {
    const box = $('#transfersAlertPayroll');
    if (!box) return;
    if (!payroll) {
      box.classList.add('hidden');
      return;
    }
    box.classList.remove('hidden');
    const pctEl = $('#transfersAlertPayrollPct');
    const wageEl = $('#transfersAlertPayrollWage');
    const revEl = $('#transfersAlertPayrollRev');
    const finEl = $('#transfersAlertPayrollFin');
    if (pctEl) {
      const arrow =
        payroll.pctBefore != null && payroll.pctAfter != null && payroll.pctBefore !== payroll.pctAfter
          ? `${payroll.pctBefore}% → ${payroll.pctAfter}%`
          : `${payroll.pctAfter ?? payroll.pctBefore ?? '—'}%`;
      pctEl.textContent = arrow;
    }
    if (wageEl) wageEl.textContent = formatMoney(payroll.wageAfter ?? payroll.wageBefore ?? 0);
    if (revEl) revEl.textContent = formatMoney(payroll.revenue ?? 0);
    if (finEl) finEl.textContent = String(Math.round(Number(payroll.finances) || 0));
  };

  /** Texto curto do impacto — sem % no corpo (números ficam no box). */
  const payrollComfortBody = (tone, ok = true) => {
    if (!ok) {
      return 'Folha acima do seguro para suas Finanças. Venda, empreste ou escolha outro jogador.';
    }
    if (tone === 'warn') return 'Folha no limite — cuidado com novas contratações.';
    if (tone === 'relief') return 'Folha mais leve após esta operação.';
    if (tone === 'block') return 'Folha acima do seguro para suas Finanças.';
    return 'Folha confortável.';
  };

  /**
   * Modal estilo mensagem — efêmero, NÃO grava no inbox de Mensagens.
   */
  const showActionAlert = ({
    title = 'Mercado',
    lead = '',
    body = '',
    tone = 'ok',
    payroll = null,
    primaryLabel = 'ENTENDI',
    secondaryLabel = null,
    onPrimary = null,
    onSecondary = null,
  } = {}) => {
    const modal = $('#transfersAlertModal');
    const card = modal?.querySelector('.transfers-alert-card');
    if (!modal || !card) return;
    alertState = {
      onPrimary: typeof onPrimary === 'function' ? onPrimary : null,
      onSecondary: typeof onSecondary === 'function' ? onSecondary : null,
    };
    card.dataset.tone = tone || 'ok';
    const eyebrow = $('#transfersAlertEyebrow');
    if (eyebrow) {
      eyebrow.textContent =
        tone === 'block' ? 'MERCADO · BLOQUEADO' : tone === 'warn' ? 'MERCADO · ATENÇÃO' : 'MERCADO · ALERTA';
    }
    const titleEl = $('#transfersAlertTitle');
    const leadEl = $('#transfersAlertLead');
    const bodyEl = $('#transfersAlertBody');
    if (titleEl) titleEl.textContent = title;
    if (leadEl) leadEl.textContent = lead || '—';
    if (bodyEl) {
      bodyEl.textContent = body || '';
      bodyEl.classList.toggle('hidden', !body);
    }
    const ok = $('#transfersAlertOk');
    if (ok) ok.textContent = primaryLabel || 'ENTENDI';
    const secondary = $('#transfersAlertSecondary');
    if (secondary) {
      if (secondaryLabel) {
        secondary.textContent = secondaryLabel;
        secondary.classList.remove('hidden');
      } else {
        secondary.classList.add('hidden');
        secondary.textContent = 'AGORA NÃO';
      }
    }
    fillPayrollPanel(payroll);
    modal.classList.remove('hidden');
  };

  const alertTransferResult = (result, { titleOk, titleFail, leadOk, detailOk } = {}) => {
    const ok = !!result?.ok;
    const payroll = result?.payroll || null;
    const tone = !ok ? 'block' : payroll?.tone || 'ok';
    const failLead = reasonLabel(result?.reason, result || {});
    showActionAlert({
      title: ok ? titleOk || 'Operação concluída' : titleFail || 'Operação não concluída',
      lead: ok ? leadOk || 'Ação registrada no mercado.' : failLead,
      body: ok
        ? detailOk || (payroll ? payrollComfortBody(tone, true) : '')
        : payroll
          ? payrollComfortBody('block', false)
          : 'Revise caixa, elenco e condições da proposta.',
      tone,
      payroll,
    });
  };

  let confirmState = null;

  const closeConfirmModal = () => {
    confirmState = null;
    $('#transfersConfirmModal')?.classList.add('hidden');
  };

  const openConfirmModal = ({
    title,
    eyebrow = 'MERCADO · CONFIRMAÇÃO',
    playerName,
    meta,
    lead,
    slotsLabel,
    slotsCaption = 'EMPRÉSTIMOS NO ELENCO',
    wage,
    submitLabel = 'CONFIRMAR',
    onConfirm,
  }) => {
    confirmState = { onConfirm };
    const modal = $('#transfersConfirmModal');
    if (!modal) return;
    const setText = (sel, value) => {
      const el = $(sel);
      if (el) el.textContent = value;
    };
    setText('#transfersConfirmEyebrow', eyebrow);
    setText('#transfersConfirmTitle', title || 'Confirmar ação');
    setText('#transfersConfirmPlayer', playerName || '—');
    setText('#transfersConfirmMeta', meta || '—');
    setText('#transfersConfirmLead', lead || '—');
    setText('#transfersConfirmSlotsLabel', slotsCaption);
    setText('#transfersConfirmSlots', slotsLabel || '—');
    setText('#transfersConfirmWage', formatMoney(wage || 0));
    try {
      setText('#transfersConfirmBalance', formatBudget?.(getBalance?.()) || '—');
    } catch {
      setText('#transfersConfirmBalance', '—');
    }
    const submit = $('#transfersConfirmSubmit');
    if (submit) submit.textContent = submitLabel;
    modal.classList.remove('hidden');
  };

  const submitConfirmModal = () => {
    const action = confirmState?.onConfirm;
    closeConfirmModal();
    if (typeof action === 'function') action();
  };

  const readFiltersFromDom = () => ({
    pos: $('#transfersFilterPos')?.value || '',
    division: $('#transfersFilterDivision')?.value || '',
    query: String($('#transfersFilterQuery')?.value || '').trim(),
    minOvr: Number($('#transfersFilterOvr')?.value) || 0,
    maxOvr: Number($('#transfersFilterMaxOvr')?.value) || 0,
    minAge: Number($('#transfersFilterMinAge')?.value) || 0,
    maxAge: Number($('#transfersFilterMaxAge')?.value) || 0,
    maxPrice: Number($('#transfersFilterMaxPrice')?.value) || 0,
    maxWage: Number($('#transfersFilterMaxWage')?.value) || 0,
    listedOnly: Boolean($('#transfersFilterListed')?.checked),
    loanOnly: Boolean($('#transfersFilterLoan')?.checked),
    sortBy: filters.sortBy || 'ovr',
    sortDir: filters.sortDir || 'desc',
  });

  const renderFilters = () => {
    const pos = $('#transfersFilterPos');
    const div = $('#transfersFilterDivision');
    if (pos && !pos.dataset.ready) {
      pos.innerHTML =
        `<option value="">Qualquer</option>` +
        POSITIONS.map(item => `<option value="${item}">${item}</option>`).join('');
      pos.dataset.ready = '1';
    }
    if (div && !div.dataset.ready) {
      div.innerHTML =
        `<option value="">Qualquer</option>` +
        DIVISIONS.map(item => `<option value="${item}">Série ${item}</option>`).join('');
      div.dataset.ready = '1';
    }
    if (pos) pos.value = filters.pos || '';
    if (div) div.value = filters.division || '';
    const query = $('#transfersFilterQuery');
    if (query) query.value = filters.query || '';
    const ovr = $('#transfersFilterOvr');
    if (ovr) ovr.value = filters.minOvr || '';
    const maxOvr = $('#transfersFilterMaxOvr');
    if (maxOvr) maxOvr.value = filters.maxOvr || '';
    const minAge = $('#transfersFilterMinAge');
    if (minAge) minAge.value = filters.minAge || '';
    const maxAge = $('#transfersFilterMaxAge');
    if (maxAge) maxAge.value = filters.maxAge || '';
    const maxPrice = $('#transfersFilterMaxPrice');
    if (maxPrice) maxPrice.value = filters.maxPrice || '';
    const maxWage = $('#transfersFilterMaxWage');
    if (maxWage) maxWage.value = filters.maxWage || '';
    const listed = $('#transfersFilterListed');
    if (listed) listed.checked = !!filters.listedOnly;
    const loan = $('#transfersFilterLoan');
    if (loan) loan.checked = !!filters.loanOnly;
  };

  const renderLoanSlots = () => {
    const api = engine();
    const club = getUserClub?.();
    const slots = api?.loanSlots?.(club) || { incoming: 0, outgoing: 0, max: 3 };
    const text = `Empréstimos ${slots.incoming}/${slots.max} · Cedidos ${slots.outgoing}/${slots.max}`;
    const buyEl = $('#transfersLoanSlots');
    const sellEl = $('#transfersSellLoanSlots');
    if (buyEl) buyEl.textContent = text;
    if (sellEl) sellEl.textContent = text;
  };

  const setResultCount = n => {
    const el = $('#transfersResultCount');
    if (!el) return;
    const count = Number(n) || 0;
    el.textContent = count === 1 ? '1 jogador encontrado' : `${count} jogadores encontrados`;
  };

  const setSellResultCount = (shown, total) => {
    const el = $('#transfersSellResultCount');
    if (!el) return;
    const s = Number(shown) || 0;
    const t = Number(total) || 0;
    if (s === t) {
      el.textContent = s === 1 ? '1 jogador no elenco' : `${s} jogadores no elenco`;
      return;
    }
    el.textContent = `${s} de ${t} jogadores`;
  };

  const readSellFiltersFromDom = () => ({
    pos: $('#transfersSellFilterPos')?.value || '',
    query: String($('#transfersSellFilterQuery')?.value || '').trim(),
    minOvr: Number($('#transfersSellFilterOvr')?.value) || 0,
    maxOvr: Number($('#transfersSellFilterMaxOvr')?.value) || 0,
    minAge: Number($('#transfersSellFilterMinAge')?.value) || 0,
    maxAge: Number($('#transfersSellFilterMaxAge')?.value) || 0,
    maxPrice: Number($('#transfersSellFilterMaxPrice')?.value) || 0,
    maxWage: Number($('#transfersSellFilterMaxWage')?.value) || 0,
    listedOnly: Boolean($('#transfersSellFilterListed')?.checked),
    loanOnly: Boolean($('#transfersSellFilterLoan')?.checked),
    sortBy: sellFilters.sortBy || 'ovr',
    sortDir: sellFilters.sortDir || 'desc',
  });

  const renderSellFilters = () => {
    const pos = $('#transfersSellFilterPos');
    if (pos && !pos.dataset.ready) {
      pos.innerHTML =
        `<option value="">Qualquer</option>` +
        POSITIONS.map(item => `<option value="${item}">${item}</option>`).join('');
      pos.dataset.ready = '1';
    }
    if (pos) pos.value = sellFilters.pos || '';
    const query = $('#transfersSellFilterQuery');
    if (query) query.value = sellFilters.query || '';
    const ovr = $('#transfersSellFilterOvr');
    if (ovr) ovr.value = sellFilters.minOvr || '';
    const maxOvr = $('#transfersSellFilterMaxOvr');
    if (maxOvr) maxOvr.value = sellFilters.maxOvr || '';
    const minAge = $('#transfersSellFilterMinAge');
    if (minAge) minAge.value = sellFilters.minAge || '';
    const maxAge = $('#transfersSellFilterMaxAge');
    if (maxAge) maxAge.value = sellFilters.maxAge || '';
    const maxPrice = $('#transfersSellFilterMaxPrice');
    if (maxPrice) maxPrice.value = sellFilters.maxPrice || '';
    const maxWage = $('#transfersSellFilterMaxWage');
    if (maxWage) maxWage.value = sellFilters.maxWage || '';
    const listed = $('#transfersSellFilterListed');
    if (listed) listed.checked = !!sellFilters.listedOnly;
    const loan = $('#transfersSellFilterLoan');
    if (loan) loan.checked = !!sellFilters.loanOnly;
  };

  const filterSellRows = rows => {
    const f = sellFilters;
    const query = String(f.query || '')
      .trim()
      .toLocaleLowerCase('pt-BR');
    return rows.filter(row => {
      const p = row.player || {};
      if (f.pos && p.pos !== f.pos) return false;
      const ovr = Number(p.overall) || 0;
      const age = Number(p.age) || 0;
      const wage = Number(p.wage) || 0;
      const value = Number(row.value) || Number(p.marketValue) || 0;
      if (f.minOvr > 0 && ovr < f.minOvr) return false;
      if (f.maxOvr > 0 && ovr > f.maxOvr) return false;
      if (f.minAge > 0 && age < f.minAge) return false;
      if (f.maxAge > 0 && age > f.maxAge) return false;
      if (f.maxPrice > 0 && value > f.maxPrice) return false;
      if (f.maxWage > 0 && wage > f.maxWage) return false;
      if (f.listedOnly && !row.listed) return false;
      if (f.loanOnly && !(row.loanListed || row.onLoan || row.loanOut)) return false;
      if (
        query &&
        !String(p.name || '')
          .toLocaleLowerCase('pt-BR')
          .includes(query)
      ) {
        return false;
      }
      return true;
    });
  };

  const sellSortValue = (row, key) => {
    const p = row.player || {};
    if (key === 'name') return String(p.name || '').toLocaleLowerCase('pt-BR');
    if (key === 'pos') return String(p.pos || '');
    if (key === 'foot') return sideLetter(p);
    if (key === 'ovr') return Number(p.overall) || 0;
    if (key === 'age') return Number(p.age) || 0;
    if (key === 'wage') return Number(p.wage) || 0;
    if (key === 'price') {
      return row.listed && row.askingPrice > 0
        ? Number(row.askingPrice) || 0
        : Number(row.value) || Number(p.marketValue) || 0;
    }
    if (key === 'listed') return row.listed ? 1 : 0;
    return 0;
  };

  const sortSellRows = rows => {
    const key = sellFilters.sortBy || 'ovr';
    const dir = sellFilters.sortDir === 'asc' ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const va = sellSortValue(a, key);
      const vb = sellSortValue(b, key);
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb), 'pt-BR') * dir;
      }
      return (va - vb) * dir;
    });
  };

  const markSortedHeader = (panelSelector, sortBy, sortDir) => {
    document.querySelectorAll(`${panelSelector} th[data-sort]`).forEach(th => {
      const active = th.getAttribute('data-sort') === sortBy;
      th.classList.toggle('is-sorted', active);
      th.classList.toggle('is-asc', active && sortDir === 'asc');
      th.classList.toggle('is-desc', active && sortDir === 'desc');
      th.setAttribute(
        'title',
        active
          ? `Ordenado ${sortDir === 'asc' ? 'crescente' : 'decrescente'} — clique para inverter`
          : 'Clique para ordenar',
      );
    });
  };

  const defaultSortDir = key => (key === 'ovr' || key === 'listed' ? 'desc' : 'asc');

  const applyColumnSort = key => {
    if (!key) return;
    if (filters.sortBy === key) {
      filters.sortDir = filters.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      filters.sortBy = key;
      filters.sortDir = defaultSortDir(key);
    }
    renderBuyTable();
  };

  const applySellColumnSort = key => {
    if (!key) return;
    if (sellFilters.sortBy === key) {
      sellFilters.sortDir = sellFilters.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sellFilters.sortBy = key;
      sellFilters.sortDir = defaultSortDir(key);
    }
    renderSellTable();
  };

  const applyColgroup = (table, widths) => {
    if (!table) return null;
    let group = table.querySelector('colgroup');
    if (!group) {
      group = document.createElement('colgroup');
      table.insertBefore(group, table.firstChild);
    }
    group.innerHTML = widths
      .map((width, index) => `<col data-col-index="${index}" style="width:${width}%">`)
      .join('');
    table.classList.add('transfers-table--resizable');
    return group;
  };

  const setupColumnResize = (tableSelector, storageKey, defaults, mins) => {
    const table = document.querySelector(tableSelector);
    if (!table) return;
    const widths = loadColWidths(storageKey, defaults, mins);
    applyColgroup(table, widths);

    const headers = table.querySelectorAll('thead th');
    headers.forEach((th, index) => {
      if (index >= widths.length - 1) return; // última coluna: sem puxador (evita esconder ações)
      th.classList.add('transfers-th-resizable');
      let handle = th.querySelector('.transfers-col-resizer');
      if (!handle) {
        handle = document.createElement('span');
        handle.className = 'transfers-col-resizer';
        handle.title = 'Arraste para redimensionar (mínimo para manter os dados visíveis)';
        th.appendChild(handle);
      }
      if (handle.dataset.bound === '1') return;
      handle.dataset.bound = '1';
      handle.addEventListener('mousedown', event => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startWidths = loadColWidths(storageKey, defaults, mins);
        const tableWidth = table.getBoundingClientRect().width || 1;
        const neighbor = index + 1;
        document.body.classList.add('transfers-col-resizing');

        const onMove = moveEvent => {
          const dxPct = ((moveEvent.clientX - startX) / tableWidth) * 100;
          const next = startWidths.slice();
          let proposed = startWidths[index] + dxPct;
          proposed = Math.max(mins[index], proposed);
          let delta = proposed - startWidths[index];
          const neighborFloor = mins[neighbor];
          if (startWidths[neighbor] - delta < neighborFloor) {
            delta = startWidths[neighbor] - neighborFloor;
            proposed = startWidths[index] + delta;
          }
          next[index] = proposed;
          next[neighbor] = startWidths[neighbor] - delta;
          const clamped = clampColWidths(next, mins, defaults);
          applyColgroup(table, clamped);
        };

        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.body.classList.remove('transfers-col-resizing');
          const cols = [...table.querySelectorAll('colgroup col')].map(col =>
            Number.parseFloat(String(col.style.width).replace('%', '')),
          );
          saveColWidths(storageKey, clampColWidths(cols, mins, defaults));
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  };

  const ensureSeedListings = () => {
    if (seededListings) return;
    const api = engine();
    if (!api?.seedAiListings) return;
    const n = api.seedAiListings();
    const nLoan = api.seedAiLoanListings?.() || 0;
    seededListings = true;
    if (n > 0 || nLoan > 0) persistSeason();
  };

  const renderBuyTable = () => {
    const body = $('#transfersBuyBody');
    if (!body) return;
    const api = engine();
    if (!api) {
      body.innerHTML =
        '<tr><td class="transfers-empty" colspan="11">Motor de transferências indisponível.</td></tr>';
      setResultCount(0);
      return;
    }
    ensureSeedListings();
    const rows = api.listBuyCandidates({
      pos: filters.pos || null,
      division: filters.division || null,
      query: filters.query || '',
      minOvr: Number(filters.minOvr) || 0,
      maxOvr: Number(filters.maxOvr) || 0,
      minAge: Number(filters.minAge) || 0,
      maxAge: Number(filters.maxAge) || 0,
      maxPrice: Number(filters.maxPrice) || 0,
      maxWage: Number(filters.maxWage) || 0,
      listedOnly: !!filters.listedOnly,
      loanOnly: !!filters.loanOnly,
      sortBy: filters.sortBy || 'ovr',
      sortDir: filters.sortDir || 'desc',
    });
    setResultCount(rows.length);
    markSortedHeader('#transfersBuyPanel', filters.sortBy, filters.sortDir);
    renderLoanSlots();
    if (!rows.length) {
      body.innerHTML =
        '<tr><td class="transfers-empty" colspan="11">Nenhum jogador encontrado com estes filtros.</td></tr>';
    } else {
      body.innerHTML = rows
        .slice(0, 200)
        .map(row => {
          const p = row.player;
          const wage = Number(p.wage || row.wage) || 0;
          const canLoan = !!p.loanListed;
          return `<tr>
          <td class="col-name">${escapeHtml(p.name)}${p.setPieceSpecialist ? ' <span class="player-specialist-star" title="Especialista em bola parada" aria-label="Especialista">★</span>' : ''}${canLoan ? ' <small class="transfers-loan-tag transfers-loan-tag--offer" title="Disponível para empréstimo">EMPR.</small>' : ''}</td>
          <td class="col-club" title="${escapeHtml(row.clubName)}"><span class="club-link" data-club="${escapeHtml(row.clubName)}" role="button" tabindex="0">${escapeHtml(row.clubName)}</span></td>
          <td>${escapeHtml(p.pos)}</td>
          <td>${escapeHtml(sideLetter(p))}</td>
          <td class="col-force">${escapeHtml(p.overall)}</td>
          <td>${escapeHtml(p.age)}</td>
          <td>${escapeHtml(formatMoney(wage))}</td>
          <td class="col-passe">${escapeHtml(formatMoney(row.price))}</td>
          <td class="col-traits">${escapeHtml(traitCodes(p))}</td>
          <td>${listedMark(!!p.listed)}</td>
          <td class="transfers-actions-cell">
            ${canLoan ? `<button type="button" class="transfers-action secondary" data-loan-id="${escapeHtml(row.playerId)}">EMPRESTAR</button>` : ''}
            <button type="button" class="transfers-action" data-buy-id="${escapeHtml(row.playerId)}">COMPRAR</button>
          </td>
        </tr>`;
        })
        .join('');
    }
    setupColumnResize(
      '#transfersBuyPanel .transfers-table',
      COL_STORAGE.buy,
      DEFAULT_BUY_WIDTHS,
      MIN_BUY_WIDTHS,
    );
  };

  const renderSellTable = () => {
    const body = $('#transfersSellBody');
    if (!body) return;
    renderSellFilters();
    const api = engine();
    if (!api) {
      body.innerHTML =
        '<tr><td class="transfers-empty" colspan="10">Motor de transferências indisponível.</td></tr>';
      setSellResultCount(0, 0);
      return;
    }
    const allRows = api.listSellCandidates();
    const rows = sortSellRows(filterSellRows(allRows));
    setSellResultCount(rows.length, allRows.length);
    markSortedHeader('#transfersSellPanel', sellFilters.sortBy, sellFilters.sortDir);
    renderLoanSlots();
    if (!allRows.length) {
      body.innerHTML =
        '<tr><td class="transfers-empty" colspan="10">Nenhum jogador no elenco para negociar.</td></tr>';
    } else if (!rows.length) {
      body.innerHTML =
        '<tr><td class="transfers-empty" colspan="10">Nenhum jogador com esses filtros.</td></tr>';
    } else {
      body.innerHTML = rows
        .map(row => {
          const p = row.player;
          const wage = Number(p.wage) || 0;
          const price = row.listed && row.askingPrice > 0 ? row.askingPrice : row.value;
          const onLoan = !!row.onLoan;
          const loanOut = !!row.loanOut;
          const clubTag = (clubName, tone) =>
            clubName
              ? `<small class="transfers-loan-tag transfers-loan-tag--${tone}"><span class="club-link" data-club="${escapeHtml(clubName)}" role="button" tabindex="0">${escapeHtml(clubName)}</span></small>`
              : '';
          const loanBits = [];
          if (loanOut) {
            loanBits.push(
              `<small class="transfers-loan-tag transfers-loan-tag--out" title="Cedido por empréstimo">EMPR.</small>${clubTag(row.loanTo, 'out')}`,
            );
          } else if (onLoan) {
            loanBits.push(
              `<small class="transfers-loan-tag transfers-loan-tag--in" title="Emprestado no elenco">EMPR.</small>${clubTag(row.loanFrom, 'in')}`,
            );
          } else if (row.loanListed) {
            loanBits.push(
              '<small class="transfers-loan-tag transfers-loan-tag--offer" title="Disponível para empréstimo">EMPR.</small>',
            );
          }
          if (onLoan && row.loanBuyFee > 0) {
            loanBits.push(
              `<small class="transfers-loan-tag" title="Opção de compra">OPC ${escapeHtml(formatMoney(row.loanBuyFee))}</small>`,
            );
          }
          const loanLine = loanBits.length
            ? `<span class="transfers-name-loan">${loanBits.join('')}</span>`
            : '';
          const nameMain = `${escapeHtml(p.name)}${p.setPieceSpecialist ? ' <span class="player-specialist-star" title="Especialista em bola parada" aria-label="Especialista">★</span>' : ''}`;
          const nameCell = loanLine
            ? `<span class="transfers-name-stack"><span class="transfers-name-main">${nameMain}</span>${loanLine}</span>`
            : nameMain;
          const windowLocked = !!row.windowLocked;
          let actions = '';
          if (loanOut) {
            actions = '<span class="transfers-loan-away-note">CEDIDO</span>';
          } else if (onLoan) {
            actions = `<button type="button" class="transfers-action" data-loan-buy-id="${escapeHtml(row.playerId)}">COMPRAR</button>
            <button type="button" class="transfers-action secondary" data-return-loan-id="${escapeHtml(row.playerId)}">DEVOLVER</button>`;
          } else if (windowLocked) {
            const withdraw = [];
            if (row.listed) {
              withdraw.push(
                `<button type="button" class="transfers-action secondary" data-list-id="${escapeHtml(row.playerId)}" data-listed="1">RETIRAR</button>`,
              );
            }
            if (row.loanListed) {
              withdraw.push(
                `<button type="button" class="transfers-action secondary" data-loan-list-id="${escapeHtml(row.playerId)}" data-loan-listed="1">RET. EMPR.</button>`,
              );
            }
            actions = withdraw.length
              ? withdraw.join('')
              : '<span class="transfers-loan-away-note" title="Já se movimentou nesta janela">JÁ NEGOCIADO</span>';
          } else {
            actions = `<button type="button" class="transfers-action secondary" data-list-id="${escapeHtml(row.playerId)}" data-listed="${row.listed ? '1' : '0'}">${row.listed ? 'RETIRAR' : 'LISTAR'}</button>
            <button type="button" class="transfers-action secondary" data-loan-list-id="${escapeHtml(row.playerId)}" data-loan-listed="${row.loanListed ? '1' : '0'}">${row.loanListed ? 'RET. EMPR.' : 'EMPRESTAR'}</button>
            <button type="button" class="transfers-action" data-sell-id="${escapeHtml(row.playerId)}">VENDER</button>`;
          }
          return `<tr>
          <td class="col-name">${nameCell}</td>
          <td>${escapeHtml(p.pos)}</td>
          <td>${escapeHtml(sideLetter(p))}</td>
          <td class="col-force">${escapeHtml(p.overall)}</td>
          <td>${escapeHtml(p.age)}</td>
          <td>${escapeHtml(formatMoney(wage))}</td>
          <td class="col-passe">${escapeHtml(formatMoney(price))}</td>
          <td class="col-traits">${escapeHtml(traitCodes(p))}</td>
          <td>${listedMark(!!row.listed)}</td>
          <td class="transfers-actions-cell">${actions}</td>
        </tr>`;
        })
        .join('');
    }
    setupColumnResize(
      '#transfersSellPanel .transfers-table',
      COL_STORAGE.sell,
      DEFAULT_SELL_WIDTHS,
      MIN_SELL_WIDTHS,
    );
  };

  const closeWindowReport = () => {
    $('#transfersWindowReportModal')?.classList.add('hidden');
  };

  const showWindowReport = report => {
    const modal = $('#transfersWindowReportModal');
    if (!modal || !report) return;
    const title = $('#transfersWindowReportTitle');
    const summary = $('#transfersWindowReportSummary');
    const nameEl = $('#transfersWindowReportBiggestName');
    const metaEl = $('#transfersWindowReportBiggestMeta');
    const feeEl = $('#transfersWindowReportBiggestFee');
    const list = $('#transfersWindowReportList');
    if (title) title.textContent = `Relatório · ${report.label || 'Janela'}`;
    if (summary) {
      summary.textContent =
        report.dealCount > 0
          ? `${report.dealCount} transferência${report.dealCount === 1 ? '' : 's'} à vista · volume ${formatMoney(report.totalFees)}.`
          : 'Nenhuma transferência à vista registrada nesta janela.';
    }
    if (report.biggest) {
      if (nameEl) nameEl.textContent = report.biggest.playerName || '—';
      if (metaEl) {
        metaEl.textContent = `${report.biggest.from || '—'} → ${report.biggest.to || '—'}`;
      }
      if (feeEl) feeEl.textContent = formatMoney(report.biggest.fee);
      $('#transfersWindowReportBiggest')?.classList.remove('is-empty');
    } else {
      if (nameEl) nameEl.textContent = 'Sem negócios destacados';
      if (metaEl) metaEl.textContent = 'O mercado ficou quieto nesta janela.';
      if (feeEl) feeEl.textContent = '—';
      $('#transfersWindowReportBiggest')?.classList.add('is-empty');
    }
    if (list) {
      list.innerHTML = (report.deals || [])
        .map(
          deal =>
            `<li><strong>${escapeHtml(deal.playerName)}</strong><span>${escapeHtml(deal.from)} → ${escapeHtml(deal.to)}</span><em>${formatMoney(deal.fee)}</em></li>`,
        )
        .join('');
    }
    modal.classList.remove('hidden');
  };

  const renderHeader = () => {
    const bal = $('#transfersBalance');
    const open = $('#transfersMarketState');
    const api = engine();
    if (bal && formatBudget && typeof getBalance === 'function') {
      try {
        bal.textContent = formatBudget(getBalance());
      } catch {
        bal.textContent = '—';
      }
    }
    if (open && api) {
      const status = api.marketStatus?.() || { open: api.marketOpen(), label: null };
      const isOpen = !!status.open;
      const phase = status.phase;
      open.textContent = phase?.isDeadlineDay
        ? 'DEADLINE DAY'
        : status.label || (isOpen ? 'MERCADO ABERTO' : 'MERCADO FECHADO');
      open.classList.toggle('is-closed', !isOpen);
      open.classList.toggle('is-deadline', !!phase?.isDeadlineWeek && isOpen);
      if (!isOpen && status.reason === 'window_closed' && status.nextOpenLabel) {
        open.title = `Janela fechada — reabre em ${status.nextOpenLabel}`;
      } else if (isOpen && phase?.isDeadlineDay) {
        open.title = 'Último dia da janela — última chance de negociar';
      } else if (isOpen) {
        open.title = 'Mercado aberto (janela CBF)';
      } else {
        open.title = 'Mercado indisponível';
      }
    }
  };

  const $$tabs = () => {
    document.querySelectorAll('[data-transfers-tab]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.transfersTab === tab);
    });
  };

  const renderIncomingOffers = () => {
    const box = $('#transfersIncomingOffers');
    const api = engine();
    if (!box || !api?.listPendingOffers) return;
    const pending = api.listPendingOffers({ status: 'pending' });
    const pageSize = incomingPageSize();
    if (!pending.length) {
      stopIncomingAutoRotate();
      incomingHoverPaused = false;
      box.classList.add('hidden');
      box.innerHTML = '';
      incomingOfferIndex = 0;
      return;
    }
    if (incomingOfferIndex >= pending.length) {
      incomingOfferIndex = Math.max(0, pending.length - 1);
    }
    if (incomingOfferIndex < 0) incomingOfferIndex = 0;
    const pageStart = Math.floor(incomingOfferIndex / pageSize) * pageSize;
    incomingOfferIndex = pageStart;
    const visible = pending.slice(pageStart, pageStart + pageSize);
    const canPrev = pageStart > 0;
    const canNext = pageStart + pageSize < pending.length;
    const cards = visible
      .map(offer => {
        const kind = offerKindLabel(offer);
        return `<article class="transfers-incoming-card" data-offer-id="${escapeHtml(offer.id)}">
          <strong class="transfers-incoming-name">${escapeHtml(offer.playerName)}</strong>
          <div class="transfers-incoming-meta">
            <span class="transfers-incoming-kind">${kind}</span>
            <button type="button" class="transfers-incoming-view" data-incoming-view="${escapeHtml(offer.id)}" aria-label="Ver proposta de ${escapeHtml(offer.playerName)}">VER</button>
          </div>
        </article>`;
      })
      .join('');
    box.classList.remove('hidden');
    box.innerHTML = `
      <div class="transfers-incoming-carousel">
        <button type="button" class="transfers-incoming-nav" data-incoming-prev ${canPrev ? '' : 'disabled'} aria-label="Propostas anteriores">‹</button>
        <div class="transfers-incoming-row" style="--incoming-cols:${pageSize}">${cards}</div>
        <button type="button" class="transfers-incoming-nav" data-incoming-next ${canNext ? '' : 'disabled'} aria-label="Próximas propostas">›</button>
      </div>`;
    startIncomingAutoRotate();
  };

  const render = () => {
    const root = $('#transfers');
    if (!root) return;
    root.classList.remove('coming-soon-view');
    renderHeader();
    renderIncomingOffers();
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

  let offerState = null;

  const parseMoneyInput = raw => {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (!digits) return 0;
    return Math.round(Number(digits));
  };

  const formatOfferInput = value => {
    const amount = Math.max(0, Math.round(Number(value) || 0));
    return amount.toLocaleString('pt-BR');
  };

  const closeOfferModal = () => {
    offerState = null;
    $('#transfersOfferModal')?.classList.add('hidden');
  };

  const updateOfferHint = () => {
    const hint = $('#transfersOfferHint');
    const input = $('#transfersOfferInput');
    if (!hint || !input || !offerState) return;
    const offer = parseMoneyInput(input.value);
    const { ask, value, mode } = offerState;
    if (!offer) {
      hint.textContent = 'Digite um valor para negociar.';
      hint.className = 'transfers-offer-hint';
      return;
    }
    if (mode === 'buy') {
      const api = engine();
      const found = api?.findPlayerInWorld?.(offerState.playerId);
      if (found && api.evaluateSellerAccept) {
        const phase1 = api.getBuyDivisionFit?.(offerState.playerId);
        if (phase1 && !phase1.ok) {
          hint.textContent =
            'Aviso: diferença de série — a negociação é difícil e a oferta pode falhar.';
          hint.className = 'transfers-offer-hint is-warn';
          return;
        }
        const verdict = api.evaluateSellerAccept(found.player, offer, found.club, {
          clubName: found.clubName,
          divisionUnit: () => 0, // Fase 1 já validada acima com a mesma seed no motor
        });
        if (verdict.accept) {
          let text =
            offer >= ask
              ? 'Oferta no pedido ou acima — alta chance de aceite.'
              : 'Oferta abaixo do pedido, mas ainda pode ser aceita.';
          if (verdict.playerPull) {
            text += ' O jogador gostaria de trabalhar com seu técnico.';
          }
          hint.textContent = text;
          hint.className = 'transfers-offer-hint is-good';
          return;
        }
        if ((verdict.reasons || []).includes('division_gap')) {
          hint.textContent =
            'Aviso: diferença de série — a negociação é difícil e a oferta pode falhar.';
          hint.className = 'transfers-offer-hint is-warn';
          return;
        }
        const hard = (verdict.reasons || [])
          .map(rejectReasonHint)
          .filter(Boolean)
          .slice(0, 1);
        hint.textContent = hard.length
          ? `Oferta baixa — o clube tende a recusar (${hard[0]}).`
          : 'Oferta baixa demais — o clube tende a recusar.';
        hint.className = 'transfers-offer-hint is-bad';
        return;
      }
      if (offer >= ask) {
        hint.textContent = 'Oferta no pedido ou acima.';
        hint.className = 'transfers-offer-hint is-good';
      } else if (offer >= value * 0.85) {
        hint.textContent = 'Oferta próxima do mercado — negociação possível.';
        hint.className = 'transfers-offer-hint is-warn';
      } else {
        hint.textContent = 'Oferta bem abaixo do mercado.';
        hint.className = 'transfers-offer-hint is-bad';
      }
      return;
    }
    // sell / list — mesmo critério de atratividade do preço pedido
    if (offer >= value * 1.15) {
      hint.textContent = 'Preço alto — pode não haver comprador disposto.';
      hint.className = 'transfers-offer-hint is-warn';
    } else if (offer >= value) {
      hint.textContent = 'Preço no valor de mercado — boa chance de comprador.';
      hint.className = 'transfers-offer-hint is-good';
    } else if (offer >= value * 0.85) {
      hint.textContent = 'Preço um pouco abaixo do mercado — ainda negociável.';
      hint.className = 'transfers-offer-hint is-warn';
    } else {
      hint.textContent = 'Preço baixo — vende mais fácil, mas rende menos.';
      hint.className = 'transfers-offer-hint is-warn';
    }
  };

  const openOfferModal = ({ mode, playerId, name, clubName, pos, overall, age, ask, value, wage }) => {
    offerState = { mode, playerId, ask, value, wage, playerName: name, clubName };
    const modal = $('#transfersOfferModal');
    if (!modal) return;
    const copy =
      mode === 'buy'
        ? {
            eyebrow: 'NEGOCIAÇÃO · COMPRA',
            title: 'Oferta de contratação',
            inputLabel: 'Sua oferta (R$)',
            submit: 'ENVIAR OFERTA',
          }
        : mode === 'list'
          ? {
              eyebrow: 'NEGOCIAÇÃO · LISTA',
              title: 'Preço pedido na lista',
              inputLabel: 'Preço pedido na lista (R$)',
              submit: 'CONFIRMAR LISTAGEM',
            }
          : {
              eyebrow: 'NEGOCIAÇÃO · VENDA',
              title: 'Preço de venda',
              inputLabel: 'Preço pedido na venda (R$)',
              submit: 'CONFIRMAR VENDA',
            };
    $('#transfersOfferEyebrow').textContent = copy.eyebrow;
    $('#transfersOfferTitle').textContent = copy.title;
    $('#transfersOfferPlayer').textContent = name || '—';
    $('#transfersOfferMeta').textContent = [
      clubName,
      pos,
      overall != null ? `OVR ${overall}` : null,
      age != null ? `${age} anos` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    $('#transfersOfferAsk').textContent =
      mode === 'buy'
        ? `${formatMoney(ask)}${ask !== value ? ` · merc. ${formatMoney(value)}` : ''}`
        : formatMoney(value);
    $('#transfersOfferWage').textContent = formatMoney(wage || 0);
    try {
      $('#transfersOfferBalance').textContent = formatBudget?.(getBalance?.()) || '—';
    } catch {
      $('#transfersOfferBalance').textContent = '—';
    }
    $('#transfersOfferInputLabel').textContent = copy.inputLabel;
    $('#transfersOfferInput').value = formatOfferInput(ask || value);
    $('#transfersOfferError').textContent = '';
    $('#transfersOfferSubmit').textContent = copy.submit;
    modal.classList.remove('hidden');
    updateOfferHint();
    queueMicrotask(() => {
      const input = $('#transfersOfferInput');
      input?.focus();
      input?.select();
    });
  };

  const submitOffer = () => {
    if (!offerState) return;
    const api = engine();
    if (!api) return;
    const offer = parseMoneyInput($('#transfersOfferInput')?.value);
    const errorEl = $('#transfersOfferError');
    if (!offer || offer <= 0) {
      if (errorEl) errorEl.textContent = 'Informe um valor válido para a oferta.';
      return;
    }
    if (errorEl) errorEl.textContent = '';

    if (offerState.mode === 'buy') {
      const result = api.buyPlayer(offerState.playerId, offer);
      if (!result.ok) {
        const letterCtx = {
          reasons: result.reasons,
          clubName: result.from || offerState.clubName,
          playerName: offerState.playerName || result.player?.name,
        };
        if (result.reason === 'counter_offer' && result.counterFee > 0) {
          const counterFee = Math.round(Number(result.counterFee) || 0);
          const playerId = offerState.playerId;
          const clubName = result.clubName || offerState.clubName || 'O clube';
          const playerName = offerState.playerName || result.playerName || 'o jogador';
          setStatus(`Contra-proposta: ${formatMoney(counterFee)}`);
          closeOfferModal();
          showActionAlert({
            title: 'Contra-proposta',
            lead: `${clubName} não aceitou ${formatMoney(result.fee)}, mas contra-propôs ${formatMoney(counterFee)}.`,
            body: `Aceitar fecha a contratação de ${playerName} neste valor.`,
            tone: 'warn',
            primaryLabel: 'ACEITAR CONTRA-PROPOSTA',
            secondaryLabel: 'AGORA NÃO',
            onSecondary: () => setStatus('Contra-proposta deixada de lado por agora.'),
            onPrimary: () => {
              const buyApi = engine();
              if (!buyApi) return;
              const done = buyApi.buyPlayer(playerId, counterFee);
              if (!done.ok) {
                setStatus(reasonLabel(done.reason, done));
                alertTransferResult(done, { titleFail: 'Contratação bloqueada' });
                render();
                return;
              }
              setStatus(`Contratado: ${done.player.name} · ${formatMoney(done.fee)}`);
              alertTransferResult(done, {
                titleOk: 'Contratação concluída',
                leadOk: `${done.player.name} chegou ao ${done.to} por ${formatMoney(done.fee)} (vindo de ${done.from}).`,
              });
              onDealComplete?.(done);
              persistSeason();
              render();
            },
          });
          return;
        }
        if (
          (result.reason === 'rejected' || result.reason === 'division_gap') &&
          (result.floor || result.reason === 'division_gap')
        ) {
          const why = reasonLabel(result.reason, letterCtx);
          setStatus(
            result.reason === 'division_gap'
              ? 'Negociação encerrada — diferença de série.'
              : `Oferta recusada. Mínimo aproximado: ${formatMoney(result.floor)}.`,
          );
          closeOfferModal();
          showActionAlert({
            title: 'Oferta recusada',
            lead: why,
            body:
              result.reason === 'division_gap'
                ? 'Nenhuma mudança de elenco ou folha.'
                : `Nenhuma mudança de elenco ou folha. Tente perto de ${formatMoney(result.floor)} ou mais.`,
            tone: 'block',
          });
          return;
        }
        const msg = reasonLabel(result.reason, { ...result, ...letterCtx });
        setStatus(msg);
        closeOfferModal();
        alertTransferResult(result, { titleFail: 'Contratação bloqueada' });
        return;
      }
      setStatus(`Contratado: ${result.player.name} · ${formatMoney(result.fee)}`);
      closeOfferModal();
      alertTransferResult(result, {
        titleOk: 'Contratação concluída',
        leadOk: `${result.player.name} chegou ao ${result.to} por ${formatMoney(result.fee)} (vindo de ${result.from}).`,
      });
      onDealComplete?.(result);
      persistSeason();
      render();
      return;
    }

    if (offerState.mode === 'list') {
      const result = api.setListed(offerState.playerId, true, offer);
      if (!result.ok) {
        const msg = reasonLabel(result.reason, result);
        setStatus(msg);
        closeOfferModal();
        alertTransferResult(result, { titleFail: 'Lista de transferências' });
        return;
      }
      setStatus(`${result.player.name} listado por ${formatMoney(result.player.askingPrice)}`);
      closeOfferModal();
      const payroll = result.payroll || api.evaluateUserPayroll?.() || null;
      showActionAlert({
        title: 'Jogador listado',
        lead: `${result.player.name} à venda por ${formatMoney(result.player.askingPrice)}.`,
        body: 'Uma venda bem-sucedida reduz a folha e libera espaço financeiro.',
        tone: 'ok',
        payroll,
      });
      persistSeason();
      render();
      return;
    }

    const result = api.sellPlayer(offerState.playerId, offer);
    if (!result.ok) {
      const msg = reasonLabel(result.reason, result);
      setStatus(msg);
      closeOfferModal();
      alertTransferResult(result, { titleFail: 'Venda não concluída' });
      return;
    }
    setStatus(`Vendido: ${result.player.name} → ${result.to} · ${formatMoney(result.fee)}`);
    closeOfferModal();
    alertTransferResult(result, {
      titleOk: 'Venda concluída',
      leadOk: `${result.player.name} foi negociado com ${result.to} por ${formatMoney(result.fee)}.`,
    });
    onDealComplete?.(result);
    persistSeason();
    render();
  };

  const confirmBuy = playerId => {
    const api = engine();
    if (!api) return;
    const found = api.findPlayerInWorld(playerId);
    if (!found) {
      setStatus(reasonLabel('not_found'));
      return;
    }
    const value = Number(found.player.marketValue) || 0;
    const ask =
      found.player.listed && found.player.askingPrice > 0
        ? Number(found.player.askingPrice)
        : value;
    openOfferModal({
      mode: 'buy',
      playerId,
      name: found.player.name,
      clubName: found.clubName,
      pos: found.player.pos,
      overall: found.player.overall,
      age: found.player.age,
      ask,
      value,
      wage: found.player.wage,
    });
  };

  const confirmSell = playerId => {
    const api = engine();
    if (!api) return;
    const row = api.listSellCandidates().find(item => item.playerId === playerId);
    if (!row) {
      setStatus(reasonLabel('not_found'));
      return;
    }
    const value = Number(row.value) || 0;
    const ask = row.listed && row.askingPrice > 0 ? Number(row.askingPrice) : value;
    openOfferModal({
      mode: 'sell',
      playerId,
      name: row.player.name,
      clubName: getUserClub?.() || 'Seu clube',
      pos: row.player.pos,
      overall: row.player.overall,
      age: row.player.age,
      ask,
      value,
      wage: row.player.wage,
    });
  };

  const toggleList = (playerId, currentlyListed) => {
    const api = engine();
    if (!api) return;
    if (currentlyListed) {
      const result = api.setListed(playerId, false);
      if (!result.ok) {
        setStatus(reasonLabel(result.reason));
        alertTransferResult(result, { titleFail: 'Lista de transferências' });
        return;
      }
      setStatus(`${result.player.name} removido da lista`);
      const payroll = api.evaluateUserPayroll?.() || null;
      showActionAlert({
        title: 'Removido da lista',
        lead: `${result.player.name} não está mais à venda.`,
        body: 'Isso não altera a folha — só a disponibilidade no mercado.',
        tone: 'ok',
        payroll,
      });
      persistSeason();
      render();
      return;
    }
    const row = api.listSellCandidates().find(item => item.playerId === playerId);
    if (!row) {
      setStatus(reasonLabel('not_found'));
      return;
    }
    const value = Number(row.value) || 0;
    const ask = row.askingPrice > 0 ? Number(row.askingPrice) : value;
    openOfferModal({
      mode: 'list',
      playerId,
      name: row.player.name,
      clubName: getUserClub?.() || 'Seu clube',
      pos: row.player.pos,
      overall: row.player.overall,
      age: row.player.age,
      ask,
      value,
      wage: row.player.wage,
    });
  };

  const confirmLoanIn = playerId => {
    const api = engine();
    if (!api) return;
    const found = api.findPlayerInWorld(playerId);
    if (!found) {
      setStatus(reasonLabel('not_found'));
      return;
    }
    const slots = api.loanSlots?.(getUserClub?.()) || { incoming: 0, max: 3 };
    const p = found.player;
    openConfirmModal({
      title: 'Confirmar empréstimo',
      eyebrow: 'MERCADO · EMPRÉSTIMO',
      playerName: p.name,
      meta: [found.clubName, p.pos, p.overall != null ? `OVR ${p.overall}` : null, p.age != null ? `${p.age} anos` : null]
        .filter(Boolean)
        .join(' · '),
      lead: 'Trazer até o fim da temporada, com opção de compra fixa (100–120% do valor). O salário entra na folha enquanto ele estiver no elenco.',
      slotsLabel: `${slots.incoming}/${slots.max}`,
      wage: p.wage,
      submitLabel: 'CONFIRMAR EMPRÉSTIMO',
      onConfirm: () => {
        const result = api.loanPlayer(playerId);
        if (!result.ok) {
          if (result.reason === 'loan_level') {
            const lead = formatLoanLevelPlayerReply({ playerName: p.name });
            setStatus('Empréstimo negado pelo jogador.');
            showActionAlert({
              title: 'Empréstimo Negado',
              lead,
              body: 'A proposta foi recusada, mas a porta fica aberta para novas oportunidades.',
              tone: 'warn',
            });
            render();
            return;
          }
          const msg = reasonLabel(result.reason, { ...result, playerName: p.name });
          setStatus(msg);
          alertTransferResult(result, { titleFail: 'Empréstimo Negado' });
          render();
          return;
        }
        const feeBit =
          result.loanBuyFee > 0
            ? ` Opção de compra: ${formatMoney(result.loanBuyFee)} (exerce quando quiser, na janela).`
            : '';
        setStatus(`Emprestado: ${result.player.name} ← ${result.from}`);
        alertTransferResult(result, {
          titleOk: 'Empréstimo concluído',
          leadOk: `${result.player.name} chega por empréstimo de ${result.from} até o fim da temporada.${feeBit}`,
        });
        onDealComplete?.(result);
        persistSeason();
        render();
      },
    });
  };

  const toggleLoanList = (playerId, currentlyListed) => {
    const api = engine();
    if (!api) return;
    const result = api.setLoanListed(playerId, !currentlyListed);
    if (!result.ok) {
      setStatus(reasonLabel(result.reason));
      alertTransferResult(result, { titleFail: 'Lista de empréstimo' });
      render();
      return;
    }
    const listed = !!result.player.loanListed;
    setStatus(
      listed
        ? `${result.player.name} disponível para empréstimo`
        : `${result.player.name} retirado da lista de empréstimo`,
    );
    const payroll = api.evaluateUserPayroll?.() || null;
    showActionAlert({
      title: listed ? 'Disponível para empréstimo' : 'Empréstimo retirado',
      lead: listed
        ? `${result.player.name} pode ser cedido até o fim da temporada.`
        : `${result.player.name} saiu da lista de empréstimo.`,
      body: listed
        ? 'Ceder por empréstimo alivia a folha enquanto o jogador estiver fora.'
        : 'Sem impacto imediato na folha.',
      tone: 'ok',
      payroll,
    });
    persistSeason();
    render();
  };

  const confirmReturnLoan = playerId => {
    const api = engine();
    if (!api) return;
    const row = api.listSellCandidates().find(item => item.playerId === playerId);
    if (!row) {
      setStatus(reasonLabel('not_found'));
      return;
    }
    const p = row.player;
    openConfirmModal({
      title: 'Devolver empréstimo',
      eyebrow: 'MERCADO · DEVOLUÇÃO',
      playerName: p.name,
      meta: [p.pos, p.overall != null ? `OVR ${p.overall}` : null].filter(Boolean).join(' · '),
      lead: `Devolver ${p.name} ao ${row.loanFrom || 'clube de origem'} agora?`,
      slotsCaption: 'TIPO',
      slotsLabel: 'Devolução antecipada',
      wage: p.wage,
      submitLabel: 'CONFIRMAR DEVOLUÇÃO',
      onConfirm: () => {
        const result = api.returnLoanPlayer(playerId);
        if (!result.ok) {
          setStatus(reasonLabel(result.reason));
          alertTransferResult(result, { titleFail: 'Devolução bloqueada' });
          render();
          return;
        }
        setStatus(`Devolvido: ${result.player.name} → ${result.to}`);
        alertTransferResult(result, {
          titleOk: 'Empréstimo devolvido',
          leadOk: `${result.player.name} retornou ao ${result.to}.`,
        });
        onDealComplete?.(result);
        persistSeason();
        render();
      },
    });
  };

  const confirmLoanBuy = playerId => {
    const api = engine();
    if (!api) return;
    const row = api.listSellCandidates().find(item => item.playerId === playerId && item.onLoan);
    if (!row) {
      setStatus(reasonLabel('not_found'));
      return;
    }
    const p = row.player;
    const fee = Math.round(Number(row.loanBuyFee) || Number(p.loanBuyOption?.fee) || 0);
    openConfirmModal({
      title: 'Exercer opção de compra',
      eyebrow: 'MERCADO · OPÇÃO DE COMPRA',
      playerName: p.name,
      meta: [row.loanFrom, p.pos, p.overall != null ? `OVR ${p.overall}` : null]
        .filter(Boolean)
        .join(' · '),
      lead: `Comprar ${p.name} por ${formatMoney(fee)}? Taxa fixa do empréstimo — o ${row.loanFrom || 'clube de origem'} não pode recusar. O jogador já está no elenco.`,
      slotsCaption: 'TAXA DA OPÇÃO',
      slotsLabel: formatMoney(fee),
      wage: p.wage,
      submitLabel: 'CONFIRMAR COMPRA',
      onConfirm: () => {
        const result = api.exerciseLoanBuyOption(playerId);
        if (!result.ok) {
          setStatus(reasonLabel(result.reason, result));
          alertTransferResult(result, { titleFail: 'Opção de compra bloqueada' });
          render();
          return;
        }
        setStatus(`Comprado: ${result.player.name} · ${formatMoney(result.fee)}`);
        alertTransferResult(result, {
          titleOk: 'Opção de compra exercida',
          leadOk: `${result.player.name} é definitivo no elenco. Pago ${formatMoney(result.fee)} a ${result.from}.`,
        });
        onDealComplete?.(result);
        persistSeason();
        render();
      },
    });
  };

  const applySearch = () => {
    filters = readFiltersFromDom();
    render();
  };

  const applySellSearch = () => {
    sellFilters = readSellFiltersFromDom();
    render();
  };

  const bindHandlers = () => {
    onClick('#transfersWindowReportClose', () => closeWindowReport());
    onClick('#transfersWindowReportOk', () => closeWindowReport());
    onClick('#transfersWindowReportModal', event => {
      if (event.target?.id === 'transfersWindowReportModal') closeWindowReport();
    });
    onClick('#transfersAlertClose', () => closeActionAlert());
    onClick('#transfersAlertOk', () => {
      const fn = alertState?.onPrimary;
      closeActionAlert();
      if (typeof fn === 'function') fn();
    });
    onClick('#transfersAlertSecondary', () => {
      const fn = alertState?.onSecondary;
      closeActionAlert();
      if (typeof fn === 'function') fn();
    });
    onClick('#transfersAlertModal', event => {
      if (event.target?.id === 'transfersAlertModal') closeActionAlert();
    });
    onClick('#transfersConfirmClose', () => closeConfirmModal());
    onClick('#transfersConfirmCancel', () => closeConfirmModal());
    onClick('#transfersConfirmSubmit', () => submitConfirmModal());
    onClick('#transfersConfirmModal', event => {
      if (event.target?.id === 'transfersConfirmModal') closeConfirmModal();
    });
    const incomingBox = $('#transfersIncomingOffers');
    incomingBox?.addEventListener('pointerover', event => {
      if (event.target.closest?.('.transfers-incoming-card')) incomingHoverPaused = true;
    });
    incomingBox?.addEventListener('pointerout', event => {
      const nextCard = event.relatedTarget?.closest?.('.transfers-incoming-card');
      if (!nextCard) incomingHoverPaused = false;
    });
    onClick('#transfersIncomingOffers', event => {
      const pageSize = incomingPageSize();
      if (event.target.closest('[data-incoming-prev]')) {
        if (incomingOfferIndex > 0) {
          incomingOfferIndex = Math.max(0, incomingOfferIndex - pageSize);
          renderIncomingOffers();
        }
        return;
      }
      if (event.target.closest('[data-incoming-next]')) {
        const pending = engine()?.listPendingOffers?.({ status: 'pending' }) || [];
        const next = incomingOfferIndex + pageSize;
        incomingOfferIndex = next >= pending.length ? 0 : next;
        renderIncomingOffers();
        return;
      }
      const view = event.target.closest('[data-incoming-view]');
      if (view && typeof openOfferMessage === 'function') {
        const offerId = view.getAttribute('data-incoming-view');
        const offer = engine()?.findPendingOffer?.(offerId) || { id: offerId };
        openOfferMessage(offer);
      }
    });
    window.addEventListener('resize', () => {
      if ($('#transfers')?.classList.contains('active')) renderIncomingOffers();
    });
    onClick('#transfersTabs', event => {
      const button = event.target.closest('[data-transfers-tab]');
      if (!button) return;
      tab = button.dataset.transfersTab === 'sell' ? 'sell' : 'buy';
      render();
    });
    onClick('#transfersApplyFilters', () => applySearch());
    onClick('#transfersSellApplyFilters', () => applySellSearch());
    const queryInput = $('#transfersFilterQuery');
    queryInput?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applySearch();
      }
    });
    const sellQueryInput = $('#transfersSellFilterQuery');
    sellQueryInput?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applySellSearch();
      }
    });

    onClick('#transfersOfferClose', () => closeOfferModal());
    onClick('#transfersOfferCancel', () => closeOfferModal());
    onClick('#transfersOfferSubmit', () => submitOffer());
    onClick('#transfersOfferModal', event => {
      if (event.target?.id === 'transfersOfferModal') closeOfferModal();
      const quick = event.target.closest('[data-offer-quick]');
      if (!quick || !offerState) return;
      const kind = quick.getAttribute('data-offer-quick');
      const base = offerState.ask || offerState.value || 0;
      let next = base;
      if (kind === '-10') next = Math.round(base * 0.9);
      else if (kind === '+10') next = Math.round(base * 1.1);
      else if (kind === 'ask') next = offerState.ask || base;
      else if (kind === 'value') next = offerState.value || base;
      const input = $('#transfersOfferInput');
      if (input) input.value = formatOfferInput(next);
      $('#transfersOfferError').textContent = '';
      updateOfferHint();
    });
    $('#transfersOfferInput')?.addEventListener('input', () => {
      const input = $('#transfersOfferInput');
      if (!input) return;
      const amount = parseMoneyInput(input.value);
      const caretAtEnd = input.selectionStart === input.value.length;
      input.value = amount ? formatOfferInput(amount) : '';
      if (caretAtEnd) input.setSelectionRange(input.value.length, input.value.length);
      updateOfferHint();
    });
    $('#transfersOfferInput')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitOffer();
      }
      if (event.key === 'Escape') closeOfferModal();
    });

    onClick('#transfersBuyPanel', event => {
      if (event.target.closest('.transfers-col-resizer')) return;
      const sortTh = event.target.closest('th[data-sort]');
      if (sortTh) {
        applyColumnSort(sortTh.getAttribute('data-sort') || 'ovr');
        return;
      }
      const loanBtn = event.target.closest('button[data-loan-id]');
      if (loanBtn) {
        confirmLoanIn(loanBtn.dataset.loanId);
        return;
      }
      const button = event.target.closest('button[data-buy-id]');
      if (!button) return;
      confirmBuy(button.dataset.buyId);
    });
    onClick('#transfersSellPanel', event => {
      if (event.target.closest('.transfers-col-resizer')) return;
      const sortTh = event.target.closest('th[data-sort]');
      if (sortTh) {
        applySellColumnSort(sortTh.getAttribute('data-sort') || 'ovr');
        return;
      }
      const buy = event.target.closest('button[data-loan-buy-id]');
      if (buy) {
        confirmLoanBuy(buy.dataset.loanBuyId);
        return;
      }
      const ret = event.target.closest('button[data-return-loan-id]');
      if (ret) {
        confirmReturnLoan(ret.dataset.returnLoanId);
        return;
      }
      const loanList = event.target.closest('button[data-loan-list-id]');
      if (loanList) {
        toggleLoanList(loanList.dataset.loanListId, loanList.dataset.loanListed === '1');
        return;
      }
      const sell = event.target.closest('button[data-sell-id]');
      if (sell) {
        confirmSell(sell.dataset.sellId);
        return;
      }
      const list = event.target.closest('button[data-list-id]');
      if (list) toggleList(list.dataset.listId, list.dataset.listed === '1');
    });
  };

  return {
    moduleVersion: MODULE_VERSIONS.transfers || 1,
    render,
    bindHandlers,
    setPersist,
    showWindowReport,
    showActionAlert,
    closeActionAlert,
  };
}
