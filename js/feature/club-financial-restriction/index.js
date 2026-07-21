import { MODULE_VERSIONS } from '../../core/constants.js';

const MODAL_HTML = `
<div id="clubFinancialRestrictionModal" class="modal hidden">
  <div class="modal-card manager-sack-modal">
    <label>RESTRIÇÃO FINANCEIRA</label>
    <h2 id="clubFinancialRestrictionTitle">Bloqueio de contratações</h2>
    <p id="clubFinancialRestrictionLead" class="manager-sack-lead"></p>
    <div id="clubFinancialRestrictionStats" class="manager-sack-stats"></div>
    <section class="manager-sack-section">
      <header>
        <h3>O que ainda pode</h3>
        <small>Caminho de resgate</small>
      </header>
      <p class="manager-sack-empty" id="clubFinancialRestrictionDetail">
        Vendas, listagens, adiantamento de TV e amortização do empréstimo no Escritório continuam liberados. Compras e novos empréstimos de jogadores ficam suspensos até o clube sair do vermelho e regularizar o banco.
      </p>
    </section>
    <div class="manager-sack-actions">
      <button id="clubFinancialRestrictionDismiss" type="button" class="manager-sack-refuse">ENTENDI</button>
    </div>
  </div>
</div>`;

/**
 * One-shot ao entrar em restrição de mercado (compras/empréstimos bloqueados).
 */
export function createClubFinancialRestrictionFeature(deps) {
  const { $, formatBudget, onDismiss } = deps;
  let handlersBound = false;

  const bindHandlers = () => {
    if (handlersBound) return;
    handlersBound = true;
    document.addEventListener('click', event => {
      const btn = event.target.closest('#clubFinancialRestrictionDismiss');
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      close();
      onDismiss?.();
    });
  };

  const injectDom = () => {
    if (!$('#clubFinancialRestrictionModal')) {
      document.body.insertAdjacentHTML('beforeend', MODAL_HTML);
    }
    bindHandlers();
  };

  const close = () => {
    $('#clubFinancialRestrictionModal')?.classList.add('hidden');
  };

  const open = ({
    clubName = 'Seu clube',
    message = '',
    cash = 0,
    debt = 0,
  } = {}) => {
    injectDom();
    const title = $('#clubFinancialRestrictionTitle');
    const lead = $('#clubFinancialRestrictionLead');
    const stats = $('#clubFinancialRestrictionStats');
    if (title) title.textContent = `${clubName} — bloqueio de contratações`;
    if (lead) {
      lead.textContent =
        message ||
        'Restrição financeira: compras e empréstimos de jogadores suspensos até o clube sair da crise.';
    }
    if (stats) {
      const cashLabel = typeof formatBudget === 'function' ? formatBudget(cash) : String(cash);
      const debtLabel = typeof formatBudget === 'function' ? formatBudget(debt) : String(debt);
      stats.innerHTML = `
        <div><small>CLUBE</small><b>${clubName}</b></div>
        <div><small>CAIXA</small><b>${cashLabel}</b></div>
        <div><small>DÍVIDA</small><b class="spend">${debtLabel}</b></div>
        <div><small>MERCADO</small><b class="spend">COMPRAS OFF</b></div>`;
    }
    $('#clubFinancialRestrictionModal')?.classList.remove('hidden');
  };

  return {
    moduleVersion: MODULE_VERSIONS.clubFinancialRestriction ?? 1,
    init: injectDom,
    open,
    close,
  };
}
