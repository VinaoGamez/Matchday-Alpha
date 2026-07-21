import { MODULE_VERSIONS } from '../../core/constants.js';

const MODAL_HTML = `
<div id="clubBankruptcyModal" class="modal hidden">
  <div class="modal-card manager-sack-modal">
    <label>FALÊNCIA</label>
    <h2 id="clubBankruptcyTitle">Clube em liquidação</h2>
    <p id="clubBankruptcyLead" class="manager-sack-lead">Credores decretaram a falência do clube.</p>
    <div id="clubBankruptcyStats" class="manager-sack-stats"></div>
    <section class="manager-sack-section">
      <header>
        <h3>Fim de carreira</h3>
        <small>Não há propostas — a quebra encerra o save neste clube</small>
      </header>
      <p class="manager-sack-empty" id="clubBankruptcyDetail"></p>
    </section>
    <div class="manager-sack-actions">
      <button id="clubBankruptcyEnd" type="button" class="manager-sack-refuse">ENCERRAR CARREIRA</button>
    </div>
  </div>
</div>`;

/**
 * Modal de falência formal — sem propostas de emprego.
 */
export function createClubBankruptcyFeature(deps) {
  const { $, onEndCareer, formatBudget } = deps;
  let handlersBound = false;

  const bindHandlers = () => {
    if (handlersBound) return;
    handlersBound = true;
    document.addEventListener('click', event => {
      const end = event.target.closest('#clubBankruptcyEnd');
      if (!end) return;
      event.preventDefault();
      event.stopPropagation();
      const ok = window.confirm(
        'A falência encerra a carreira e limpa o save. Confirmar?',
      );
      if (ok) onEndCareer?.();
    });
  };

  const injectDom = () => {
    if (!$('#clubBankruptcyModal')) {
      document.body.insertAdjacentHTML('beforeend', MODAL_HTML);
    }
    bindHandlers();
  };

  const close = () => {
    $('#clubBankruptcyModal')?.classList.add('hidden');
  };

  const open = ({
    clubName = 'Seu clube',
    managerName = 'Técnico',
    message = '',
    board = 0,
    finances = 0,
    cash = 0,
    debt = 0,
    reason = '',
  } = {}) => {
    injectDom();
    const title = $('#clubBankruptcyTitle');
    const lead = $('#clubBankruptcyLead');
    const stats = $('#clubBankruptcyStats');
    const detail = $('#clubBankruptcyDetail');
    if (title) title.textContent = `${clubName} — falência decretada`;
    if (lead) {
      lead.textContent =
        message ||
        `${managerName}, o ${clubName} não consegue honrar as obrigações e entra em liquidação.`;
    }
    if (stats) {
      const cashLabel = typeof formatBudget === 'function' ? formatBudget(cash) : String(cash);
      const debtLabel = typeof formatBudget === 'function' ? formatBudget(debt) : String(debt);
      stats.innerHTML = `
        <div><small>CLUBE</small><b>${clubName}</b></div>
        <div><small>CAIXA</small><b class="spend">${cashLabel}</b></div>
        <div><small>DÍVIDA</small><b class="spend">${debtLabel}</b></div>
        <div><small>SAÚDE / DIRETORIA</small><b>${Math.round(finances)}% / ${Math.round(board)}%</b></div>`;
    }
    if (detail) {
      detail.textContent =
        reason === 'loan_default'
          ? 'Motivo: inadimplência bancária com caixa negativo.'
          : reason === 'cash_depth'
            ? 'Motivo: rombo de caixa insustentável.'
            : 'Motivo: cheque especial prolongado com finanças no piso.';
    }
    $('#clubBankruptcyModal')?.classList.remove('hidden');
  };

  return {
    moduleVersion: MODULE_VERSIONS.clubBankruptcy ?? 1,
    init: injectDom,
    open,
    close,
  };
}
