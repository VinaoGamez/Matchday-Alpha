import { MODULE_VERSIONS } from '../../core/constants.js';

const MODAL_HTML = `
<div id="managerSackModal" class="modal hidden">
  <div class="modal-card manager-sack-modal">
    <label>DEMISSÃO</label>
    <h2 id="managerSackTitle">Você foi demitido</h2>
    <p id="managerSackLead" class="manager-sack-lead">A diretoria encerrou o seu ciclo no clube.</p>
    <div id="managerSackStats" class="manager-sack-stats"></div>
    <section class="manager-sack-section">
      <header>
        <h3>Propostas de emprego</h3>
        <small>Escolha um novo clube para continuar a carreira</small>
      </header>
      <div id="managerSackOffers" class="manager-sack-offers"></div>
    </section>
    <div class="manager-sack-actions">
      <button id="managerSackRefuse" type="button" class="manager-sack-refuse">ENCERRAR CARREIRA</button>
    </div>
  </div>
</div>`;

/**
 * Modal de demissão + propostas (estilo Brasfoot).
 */
export function createManagerSackFeature(deps) {
  const { $, onAcceptOffer, onRefuseCareer, onViewRoster } = deps;
  let handlersBound = false;
  let currentOffers = [];

  const bindHandlers = () => {
    if (handlersBound) return;
    handlersBound = true;
    document.addEventListener('click', event => {
      const roster = event.target.closest('[data-sack-roster]');
      if (roster) {
        event.preventDefault();
        event.stopPropagation();
        const club = roster.getAttribute('data-sack-roster');
        if (club) onViewRoster?.(club);
        return;
      }
      const accept = event.target.closest('[data-sack-accept]');
      if (accept) {
        event.preventDefault();
        event.stopPropagation();
        const club = accept.getAttribute('data-sack-accept');
        const offer = currentOffers.find(item => item.club === club);
        if (offer) onAcceptOffer?.(offer);
        return;
      }
      const refuse = event.target.closest('#managerSackRefuse');
      if (refuse) {
        event.preventDefault();
        event.stopPropagation();
        const ok = window.confirm(
          'Sem clube, a carreira será encerrada e o save limpo. Confirmar?',
        );
        if (ok) onRefuseCareer?.();
      }
    });
  };

  const injectDom = () => {
    if (!$('#managerSackModal')) {
      document.body.insertAdjacentHTML('beforeend', MODAL_HTML);
    }
    bindHandlers();
  };

  const close = () => {
    $('#managerSackModal')?.classList.add('hidden');
  };

  const open = ({
    clubName = 'Seu clube',
    managerName = 'Técnico',
    message = '',
    board = 0,
    finances = 0,
    offers = [],
  } = {}) => {
    injectDom();
    currentOffers = Array.isArray(offers) ? offers : [];
    const title = $('#managerSackTitle');
    const lead = $('#managerSackLead');
    const stats = $('#managerSackStats');
    const list = $('#managerSackOffers');
    if (title) title.textContent = `${managerName}, você foi demitido`;
    if (lead) {
      lead.textContent =
        message ||
        `A diretoria do ${clubName} encerrou o ciclo: projeto e finanças no vermelho.`;
    }
    if (stats) {
      stats.innerHTML = `
        <div><small>CLUBE</small><b>${clubName}</b></div>
        <div><small>DIRETORIA</small><b>${Math.round(board)}%</b></div>
        <div><small>SAÚDE FINANCEIRA</small><b>${Math.round(finances)}%</b></div>`;
    }
    if (list) {
      if (!currentOffers.length) {
        list.innerHTML =
          '<p class="manager-sack-empty">Nenhuma proposta no momento. Encerrar a carreira ou aguardar não é opção — escolha encerrar.</p>';
      } else {
        list.innerHTML = currentOffers
          .map(
            offer => `<article class="manager-sack-offer">
              <div>
                <b>${offer.club}</b>
                <small>Série ${offer.division} · OVR ${offer.overall || '—'} · ${offer.note || ''}</small>
                <small class="manager-sack-incumbent">Atual: ${offer.incumbentName || '—'}</small>
              </div>
              <div class="manager-sack-offer-actions">
                <button type="button" data-sack-roster="${offer.club}">ELENCO</button>
                <button type="button" data-sack-accept="${offer.club}">ACEITAR</button>
              </div>
            </article>`,
          )
          .join('');
      }
    }
    $('#managerSackModal')?.classList.remove('hidden');
  };

  return {
    moduleVersion: MODULE_VERSIONS.managerSack ?? 1,
    init: injectDom,
    open,
    close,
  };
}
