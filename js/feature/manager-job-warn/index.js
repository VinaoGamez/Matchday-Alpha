import { MODULE_VERSIONS } from '../../core/constants.js';

const MODAL_HTML = `
<div id="managerJobWarnModal" class="modal hidden">
  <div class="modal-card manager-sack-modal">
    <label id="managerJobWarnEyebrow">RISCO DE EMPREGO</label>
    <h2 id="managerJobWarnTitle">Atenção da diretoria</h2>
    <p id="managerJobWarnLead" class="manager-sack-lead"></p>
    <div id="managerJobWarnStats" class="manager-sack-stats"></div>
    <section class="manager-sack-section">
      <header>
        <h3 id="managerJobWarnSectionTitle">O que fazer</h3>
        <small id="managerJobWarnSectionHint">Este aviso aparece em tela — confira também a caixa de mensagens</small>
      </header>
      <p class="manager-sack-empty" id="managerJobWarnDetail"></p>
    </section>
    <div class="manager-sack-actions">
      <button id="managerJobWarnDismiss" type="button" class="manager-sack-refuse">ENTENDI</button>
    </div>
  </div>
</div>`;

const DETAIL_BY_KIND = {
  warn_finances:
    'Regularize o caixa no Escritório: amortize empréstimo, evite folha no vermelho e use adiantamento de TV se necessário. Saúde financeira baixa corrói a confiança da diretoria.',
  warn_board:
    'Melhore resultados e cumpra a meta da temporada. A diretoria cobra reação em campo — empates em casa e derrotas pesam no projeto.',
  warn_board_final:
    'Últimas rodadas de paciência. Sem reação clara, a demissão é iminente independentemente do caixa.',
  critical:
    'Diretoria e finanças no vermelho. No início da temporada ainda há tolerância, mas o clima institucional precisa de resposta imediata.',
  critical_grace:
    'Campanha acima da meta deu uma rodada de trégua, mas finanças e projeto seguem no limite. Corrija o caixa agora ou a demissão vem na próxima rodada.',
  warn_warm:
    'Instabilidade sustentada entre diretoria e finanças. Três rodadas consecutivas nesta faixa encerram o ciclo — a menos que a campanha proteja o cargo.',
  warn_imminent:
    'Um passo a mais na crise e o cargo cai. Trate caixa e resultados antes da próxima rodada nacional.',
  shield_fortress:
    'A meta da temporada protege o cargo por enquanto, mas colapso total (diretoria e finanças no piso) ou falência formal ainda encerram o ciclo.',
};

const EYEBROW_BY_KIND = {
  warn_finances: 'COBRANÇA FINANCEIRA',
  warn_board: 'DIRETORIA INQUIETA',
  warn_board_final: 'DIRETORIA NO LIMITE',
  critical: 'PROJETO SOB AMEAÇA',
  critical_grace: 'ÚLTIMA CHANCE',
  warn_warm: 'DESEQUILÍBRIO INSTITUCIONAL',
  warn_imminent: 'DEMISSÃO IMINENTE',
  shield_fortress: 'PROJETO PROTEGIDO',
};

/**
 * Pop-up one-shot para avisos de risco de demissão (complementa a inbox).
 */
export function createManagerJobWarnFeature(deps) {
  const { $, onDismiss } = deps;
  let handlersBound = false;

  const bindHandlers = () => {
    if (handlersBound) return;
    handlersBound = true;
    document.addEventListener('click', event => {
      const btn = event.target.closest('#managerJobWarnDismiss');
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      close();
      onDismiss?.();
    });
  };

  const injectDom = () => {
    if (!$('#managerJobWarnModal')) {
      document.body.insertAdjacentHTML('beforeend', MODAL_HTML);
    }
    bindHandlers();
  };

  const close = () => {
    $('#managerJobWarnModal')?.classList.add('hidden');
  };

  const open = ({
    kind = 'warn_finances',
    title = 'Atenção da diretoria',
    message = '',
    clubName = 'Seu clube',
    board = 0,
    finances = 0,
    detail = '',
    shieldLabel = '',
  } = {}) => {
    injectDom();
    const eyebrow = $('#managerJobWarnEyebrow');
    const titleEl = $('#managerJobWarnTitle');
    const lead = $('#managerJobWarnLead');
    const stats = $('#managerJobWarnStats');
    const detailEl = $('#managerJobWarnDetail');
    const sectionHint = $('#managerJobWarnSectionHint');
    if (eyebrow) eyebrow.textContent = EYEBROW_BY_KIND[kind] || 'RISCO DE EMPREGO';
    if (titleEl) titleEl.textContent = title;
    if (lead) lead.textContent = message || 'A diretoria monitora de perto o projeto e as finanças.';
    if (stats) {
      stats.innerHTML = `
        <div><small>CLUBE</small><b>${clubName}</b></div>
        <div><small>DIRETORIA</small><b>${Math.round(board)}%</b></div>
        <div><small>SAÚDE FINANCEIRA</small><b>${Math.round(finances)}%</b></div>
        ${shieldLabel ? `<div><small>CAMPANHA</small><b>${shieldLabel}</b></div>` : ''}`;
    }
    if (detailEl) {
      detailEl.textContent = detail || DETAIL_BY_KIND[kind] || DETAIL_BY_KIND.warn_finances;
    }
    if (sectionHint) {
      sectionHint.textContent =
        kind === 'shield_fortress'
          ? 'Proteção ativa pela meta — colapso duplo ou falência ainda encerram a carreira'
          : 'Este aviso aparece em tela — confira também a caixa de mensagens';
    }
    $('#managerJobWarnModal')?.classList.remove('hidden');
  };

  return {
    moduleVersion: MODULE_VERSIONS.managerJobWarn ?? 1,
    init: injectDom,
    open,
    close,
  };
}
