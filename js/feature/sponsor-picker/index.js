import { MODULE_VERSIONS } from '../../core/constants.js';
import { reshuffleSponsorOffers, sponsorLogoSlug } from '../../engine/economy.js';

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

const MAX_REROLLS = 3;

const MODAL_HTML = `
<div id="sponsorPickerModal" class="modal hidden">
  <div class="modal-card sponsor-picker-modal">
    <label>PATROCÍNIOS DA TEMPORADA</label>
    <h2 id="sponsorPickerTitle">Escolha seus patrocinadores</h2>
    <p id="sponsorPickerLead" class="sponsor-picker-lead">Selecione 1 Master e 3 Secundários para fechar o pacote da temporada.</p>
    <section class="sponsor-picker-section">
      <header><h3>Master</h3><small>Escolha 1 de 2 ofertas</small></header>
      <div id="sponsorPickerMaster" class="sponsor-picker-grid master"></div>
    </section>
    <section class="sponsor-picker-section">
      <header><h3>Secundários</h3><small>Escolha 3 de 5 ofertas · <span id="sponsorPickerSecondaryCount">0</span>/3</small></header>
      <div id="sponsorPickerSecondary" class="sponsor-picker-grid secondary"></div>
    </section>
    <p id="sponsorPickerError" class="sponsor-picker-error"></p>
    <div class="sponsor-picker-summary">
      <span>Total do pacote</span>
      <strong id="sponsorPickerTotal">R$ 0</strong>
    </div>
    <div class="sponsor-picker-actions">
      <button id="rerollSponsorPicker" type="button" class="sponsor-picker-reroll">NOVAS PROPOSTAS · 3</button>
      <button id="confirmSponsorPicker" type="button" disabled>CONFIRMAR PATROCÍNIOS →</button>
    </div>
  </div>
</div>
<div id="sponsorRerollWarnModal" class="modal hidden">
  <div class="modal-card sponsor-reroll-warn">
    <label>ATENÇÃO</label>
    <h2>Novas propostas</h2>
    <p>Ao escolher NOVO PATROCINADOR você corre o risco de receber propostas inferiores às apresentadas, escolha com sabedoria.</p>
    <div class="sponsor-reroll-warn-actions">
      <button type="button" id="sponsorRerollCancel" class="sponsor-reroll-exit">Sair</button>
      <button type="button" id="sponsorRerollConfirm">Novo Patrocinador</button>
    </div>
  </div>
</div>`;

/**
 * Modal de escolha de patrocínios (Novo Jogo / início de temporada).
 */
export function createSponsorPickerFeature(deps) {
  const {
    $,
    onClick,
    formatBudget,
    onConfirmSponsors,
    onOffersChanged,
  } = deps;

  let offers = null;
  let selectedMaster = null;
  let selectedSecondaries = new Set();
  let warningAccepted = false;
  let handlersBound = false;
  let sessionOpen = false;

  const logoHtml = name => {
    const slug = sponsorLogoSlug(name);
    const url = slug ? SPONSOR_LOGO_URLS[slug] : null;
    if (url) return `<img src="${url}" alt="" width="56" height="56" loading="lazy">`;
    return `<span class="sponsor-picker-fallback">${String(name || '?')
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()}</span>`;
  };

  const remainingRerolls = () =>
    Math.max(0, MAX_REROLLS - (Number(offers?.reshufflesUsed) || 0));

  const refreshRerollButton = () => {
    const btn = $('#rerollSponsorPicker');
    if (!btn) return;
    const left = remainingRerolls();
    btn.textContent = left > 0 ? `NOVAS PROPOSTAS · ${left}` : 'NOVAS PROPOSTAS · 0';
    btn.disabled = left <= 0;
  };

  const injectDom = () => {
    if (!$('#sponsorPickerModal')) {
      document.body.insertAdjacentHTML('beforeend', MODAL_HTML);
    } else {
      if (!$('#rerollSponsorPicker')) {
        const actions = document.querySelector('#sponsorPickerModal .sponsor-picker-actions');
        if (actions) {
          actions.insertAdjacentHTML(
            'afterbegin',
            '<button id="rerollSponsorPicker" type="button" class="sponsor-picker-reroll">NOVAS PROPOSTAS · 3</button>',
          );
        }
      }
      if (!$('#sponsorRerollWarnModal')) {
        document.body.insertAdjacentHTML(
          'beforeend',
          MODAL_HTML.slice(MODAL_HTML.indexOf('<div id="sponsorRerollWarnModal"')),
        );
      }
    }
    bindHandlers();
  };

  const refreshConfirmState = () => {
    const error = $('#sponsorPickerError');
    const confirm = $('#confirmSponsorPicker');
    const countEl = $('#sponsorPickerSecondaryCount');
    const totalEl = $('#sponsorPickerTotal');
    if (countEl) countEl.textContent = String(selectedSecondaries.size);
    let total = 0;
    if (selectedMaster) total += Number(selectedMaster.value) || 0;
    offers?.secondaries?.forEach(item => {
      if (selectedSecondaries.has(item.name)) total += Number(item.value) || 0;
    });
    if (totalEl) totalEl.textContent = formatBudget(total);
    const ready = !!selectedMaster && selectedSecondaries.size === 3;
    if (confirm) confirm.disabled = !ready;
    if (error && ready) error.textContent = '';
    refreshRerollButton();
  };

  /** Só troca classes — evita destruir o botão clicado (ghost-click / reset). */
  const paintSelection = () => {
    document.querySelectorAll('#sponsorPickerMaster .sponsor-offer-card').forEach(btn => {
      const selected = selectedMaster?.name === btn.dataset.sponsorMaster;
      btn.classList.toggle('selected', selected);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    document.querySelectorAll('#sponsorPickerSecondary .sponsor-offer-card').forEach(btn => {
      const selected = selectedSecondaries.has(btn.dataset.sponsorSecondary);
      btn.classList.toggle('selected', selected);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    refreshConfirmState();
  };

  const renderOffers = () => {
    const masterRoot = $('#sponsorPickerMaster');
    const secondaryRoot = $('#sponsorPickerSecondary');
    if (!masterRoot || !secondaryRoot || !offers) return;
    masterRoot.innerHTML = (offers.master || [])
      .map(item => {
        const selected = selectedMaster?.name === item.name;
        return `<button type="button" class="sponsor-offer-card master ${selected ? 'selected' : ''}" data-sponsor-master="${item.name}" aria-pressed="${selected ? 'true' : 'false'}">
          <div class="sponsor-offer-logo">${logoHtml(item.name)}</div>
          <div class="sponsor-offer-copy"><b>${item.name}</b><strong>${formatBudget(item.value)}</strong><small>Master da temporada</small></div>
        </button>`;
      })
      .join('');
    secondaryRoot.innerHTML = (offers.secondaries || [])
      .map(item => {
        const selected = selectedSecondaries.has(item.name);
        return `<button type="button" class="sponsor-offer-card secondary ${selected ? 'selected' : ''}" data-sponsor-secondary="${item.name}" aria-pressed="${selected ? 'true' : 'false'}">
          <div class="sponsor-offer-logo">${logoHtml(item.name)}</div>
          <div class="sponsor-offer-copy"><b>${item.name}</b><strong>${formatBudget(item.value)}</strong><small>Secundário</small></div>
        </button>`;
      })
      .join('');
    refreshConfirmState();
  };

  const syncSelectedAfterOffers = () => {
    if (selectedMaster?.name) {
      selectedMaster = offers?.master?.find(item => item.name === selectedMaster.name) || null;
    }
    const nextSecs = new Set();
    selectedSecondaries.forEach(name => {
      if (offers?.secondaries?.some(item => item.name === name)) nextSecs.add(name);
    });
    selectedSecondaries = nextSecs;
  };

  const applyReroll = () => {
    if (!offers || remainingRerolls() <= 0) return;
    const next = reshuffleSponsorOffers({
      offers,
      keepMaster: selectedMaster,
      keepSecondaryNames: [...selectedSecondaries],
      random: Math.random,
    });
    if (!next || next === offers) {
      const error = $('#sponsorPickerError');
      if (error) error.textContent = 'Não foi possível gerar novas propostas agora.';
      return;
    }
    offers = next;
    syncSelectedAfterOffers();
    onOffersChanged?.(offers);
    const error = $('#sponsorPickerError');
    if (error) {
      error.textContent =
        remainingRerolls() > 0
          ? `Novas propostas geradas. Restam ${remainingRerolls()} troca${remainingRerolls() === 1 ? '' : 's'}.`
          : 'Novas propostas geradas. Sem trocas restantes.';
    }
    renderOffers();
  };

  const openWarnModal = () => $('#sponsorRerollWarnModal')?.classList.remove('hidden');
  const closeWarnModal = () => $('#sponsorRerollWarnModal')?.classList.add('hidden');

  const requestReroll = () => {
    if (!offers || remainingRerolls() <= 0) return;
    if (!warningAccepted) {
      openWarnModal();
      return;
    }
    applyReroll();
  };

  const bindHandlers = () => {
    if (handlersBound) return;
    handlersBound = true;
    onClick('#sponsorPickerModal', event => {
      // Bloqueia clique no backdrop de “vazar” para o dashboard (ex.: JOGAR / ESCOLHA PATROCÍNIOS).
      if (event.target === $('#sponsorPickerModal')) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
    onClick('#sponsorPickerMaster', event => {
      event.preventDefault();
      event.stopPropagation();
      const button = event.target.closest('[data-sponsor-master]');
      if (!button || !offers) return;
      const name = button.dataset.sponsorMaster;
      selectedMaster = offers.master.find(item => item.name === name) || null;
      paintSelection();
    });
    onClick('#sponsorPickerSecondary', event => {
      event.preventDefault();
      event.stopPropagation();
      const button = event.target.closest('[data-sponsor-secondary]');
      if (!button || !offers) return;
      const name = button.dataset.sponsorSecondary;
      if (selectedSecondaries.has(name)) selectedSecondaries.delete(name);
      else if (selectedSecondaries.size < 3) selectedSecondaries.add(name);
      else {
        const error = $('#sponsorPickerError');
        if (error) error.textContent = 'Você já escolheu 3 secundários. Desmarque um para trocar.';
        return;
      }
      paintSelection();
    });
    onClick('#confirmSponsorPicker', event => {
      event.preventDefault();
      event.stopPropagation();
      if (!selectedMaster || selectedSecondaries.size !== 3 || !offers) return;
      const secondaries = offers.secondaries.filter(item => selectedSecondaries.has(item.name));
      if (secondaries.length !== 3) return;
      onConfirmSponsors?.({ master: selectedMaster, secondaries });
    });
    onClick('#rerollSponsorPicker', event => {
      event.preventDefault();
      event.stopPropagation();
      requestReroll();
    });
    onClick('#sponsorRerollCancel', event => {
      event.preventDefault();
      event.stopPropagation();
      closeWarnModal();
    });
    onClick('#sponsorRerollConfirm', event => {
      event.preventDefault();
      event.stopPropagation();
      warningAccepted = true;
      closeWarnModal();
      applyReroll();
    });
  };

  const open = ({ season, offers: nextOffers } = {}) => {
    injectDom();
    // Sessão já aberta: só garante visibilidade — não zera escolha do jogador.
    if (sessionOpen && isOpen()) {
      $('#sponsorPickerModal')?.classList.remove('hidden');
      return;
    }
    offers = nextOffers
      ? {
          ...nextOffers,
          reshufflesUsed: Number(nextOffers.reshufflesUsed) || 0,
        }
      : null;
    selectedMaster = null;
    selectedSecondaries = new Set();
    warningAccepted = false;
    closeWarnModal();
    const title = $('#sponsorPickerTitle');
    const lead = $('#sponsorPickerLead');
    if (title) title.textContent = season ? `Patrocínios ${season}` : 'Escolha seus patrocinadores';
    if (lead) {
      lead.textContent =
        'Selecione 1 Master e exatamente 3 Secundários. O valor total entra em parcelas ao longo da temporada.';
    }
    const error = $('#sponsorPickerError');
    if (error) error.textContent = '';
    renderOffers();
    sessionOpen = true;
    $('#sponsorPickerModal')?.classList.remove('hidden');
  };

  const close = () => {
    closeWarnModal();
    sessionOpen = false;
    $('#sponsorPickerModal')?.classList.add('hidden');
  };

  const isOpen = () => {
    const modal = $('#sponsorPickerModal');
    if (!modal) return false;
    return !modal.classList.contains('hidden');
  };

  const init = () => injectDom();

  return {
    moduleVersion: MODULE_VERSIONS.sponsorPicker || 1,
    init,
    open,
    close,
    isOpen,
  };
}
