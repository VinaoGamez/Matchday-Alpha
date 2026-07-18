import { MODULE_VERSIONS } from '../../core/constants.js';
import { sponsorLogoSlug } from '../../engine/economy.js';

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
      <button id="confirmSponsorPicker" type="button" disabled>CONFIRMAR PATROCÍNIOS →</button>
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
  } = deps;

  let offers = null;
  let selectedMaster = null;
  let selectedSecondaries = new Set();
  let handlersBound = false;

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

  const injectDom = () => {
    if (!$('#sponsorPickerModal')) {
      document.body.insertAdjacentHTML('beforeend', MODAL_HTML);
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
  };

  const renderOffers = () => {
    const masterRoot = $('#sponsorPickerMaster');
    const secondaryRoot = $('#sponsorPickerSecondary');
    if (!masterRoot || !secondaryRoot || !offers) return;
    masterRoot.innerHTML = (offers.master || [])
      .map(
        item => `<button type="button" class="sponsor-offer-card master ${selectedMaster?.name === item.name ? 'selected' : ''}" data-sponsor-master="${item.name}">
          <div class="sponsor-offer-logo">${logoHtml(item.name)}</div>
          <div class="sponsor-offer-copy"><b>${item.name}</b><strong>${formatBudget(item.value)}</strong><small>Master da temporada</small></div>
        </button>`,
      )
      .join('');
    secondaryRoot.innerHTML = (offers.secondaries || [])
      .map(
        item => `<button type="button" class="sponsor-offer-card secondary ${selectedSecondaries.has(item.name) ? 'selected' : ''}" data-sponsor-secondary="${item.name}">
          <div class="sponsor-offer-logo">${logoHtml(item.name)}</div>
          <div class="sponsor-offer-copy"><b>${item.name}</b><strong>${formatBudget(item.value)}</strong><small>Secundário</small></div>
        </button>`,
      )
      .join('');
    refreshConfirmState();
  };

  const bindHandlers = () => {
    if (handlersBound) return;
    handlersBound = true;
    onClick('#sponsorPickerMaster', event => {
      const button = event.target.closest('[data-sponsor-master]');
      if (!button || !offers) return;
      const name = button.dataset.sponsorMaster;
      selectedMaster = offers.master.find(item => item.name === name) || null;
      renderOffers();
    });
    onClick('#sponsorPickerSecondary', event => {
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
      renderOffers();
    });
    onClick('#confirmSponsorPicker', event => {
      event.preventDefault();
      if (!selectedMaster || selectedSecondaries.size !== 3 || !offers) return;
      const secondaries = offers.secondaries.filter(item => selectedSecondaries.has(item.name));
      onConfirmSponsors?.({ master: selectedMaster, secondaries });
    });
  };

  const open = ({ season, offers: nextOffers } = {}) => {
    injectDom();
    offers = nextOffers || null;
    selectedMaster = null;
    selectedSecondaries = new Set();
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
    $('#sponsorPickerModal')?.classList.remove('hidden');
  };

  const close = () => $('#sponsorPickerModal')?.classList.add('hidden');

  const isOpen = () => !$('#sponsorPickerModal')?.classList.contains('hidden');

  const init = () => injectDom();

  return {
    moduleVersion: MODULE_VERSIONS.sponsorPicker || 1,
    init,
    open,
    close,
    isOpen,
  };
}
