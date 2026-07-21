import { MODULE_VERSIONS } from '../../core/constants.js';

const MODAL_HTML = `
<div id="clubInsolvencyWarnModal" class="modal hidden">
  <div class="modal-card manager-sack-modal">
    <label>AVISO FINANCEIRO</label>
    <h2 id="clubInsolvencyWarnTitle">Risco de falência</h2>
    <p id="clubInsolvencyWarnLead" class="manager-sack-lead"></p>
    <div id="clubInsolvencyWarnStats" class="manager-sack-stats"></div>
    <section class="manager-sack-section">
      <header>
        <h3>O que fazer</h3>
        <small>Este aviso não fica na caixa de mensagens</small>
      </header>
      <p class="manager-sack-empty" id="clubInsolvencyWarnDetail">
        No Escritório, pague o mínimo do empréstimo para estancar os compostos. O adiantamento de TV também está disponível agora — use o botão em Fluxo de caixa (TV / mando) para ganhar folga orçamentária imediata (com deságio; sem parcelas de TV no resto da temporada). Fechar descarta este alerta.
      </p>
    </section>
    <div class="manager-sack-actions">
      <button id="clubInsolvencyWarnDismiss" type="button" class="manager-sack-refuse">ENTENDI</button>
    </div>
  </div>
</div>`;

/**
 * Aviso one-shot de insolvência (2º atraso / compostos).
 * Modal em tela — após fechar, descartado (não vai para a inbox).
 */
export function createClubInsolvencyWarnFeature(deps) {
  const { $, formatBudget, onDismiss } = deps;
  let handlersBound = false;

  const bindHandlers = () => {
    if (handlersBound) return;
    handlersBound = true;
    document.addEventListener('click', event => {
      const btn = event.target.closest('#clubInsolvencyWarnDismiss');
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      close();
      onDismiss?.();
    });
  };

  const injectDom = () => {
    if (!$('#clubInsolvencyWarnModal')) {
      document.body.insertAdjacentHTML('beforeend', MODAL_HTML);
    }
    bindHandlers();
  };

  const close = () => {
    $('#clubInsolvencyWarnModal')?.classList.add('hidden');
  };

  const open = ({
    clubName = 'Seu clube',
    message = '',
    cash = 0,
    debt = 0,
    delinquencyStreak = 0,
  } = {}) => {
    injectDom();
    const title = $('#clubInsolvencyWarnTitle');
    const lead = $('#clubInsolvencyWarnLead');
    const stats = $('#clubInsolvencyWarnStats');
    if (title) title.textContent = `${clubName} — juros compostos`;
    if (lead) {
      lead.textContent =
        message ||
        'Atraso no mínimo: a taxa está sendo reaplicada sobre a dívida. Continue assim e o clube pode falir.';
    }
    if (stats) {
      const cashLabel = typeof formatBudget === 'function' ? formatBudget(cash) : String(cash);
      const debtLabel = typeof formatBudget === 'function' ? formatBudget(debt) : String(debt);
      const streakLabel = Math.max(0, Math.round(Number(delinquencyStreak) || 0));
      stats.innerHTML = `
        <div><small>CLUBE</small><b>${clubName}</b></div>
        <div><small>CAIXA</small><b>${cashLabel}</b></div>
        <div><small>DÍVIDA</small><b class="spend">${debtLabel}</b></div>
        <div><small>ATRASOS</small><b>${streakLabel}r</b></div>`;
    }
    $('#clubInsolvencyWarnModal')?.classList.remove('hidden');
  };

  return {
    moduleVersion: MODULE_VERSIONS.clubInsolvencyWarn ?? 1,
    init: injectDom,
    open,
    close,
  };
}
