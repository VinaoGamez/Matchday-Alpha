import './security/tester-hardening.js';
import { BUILD_VERSION } from './core/constants.js';
import { showUpdateAlertIfNeeded } from './ui/update-alert.js';

const SPONSOR_LOGO_URLS = Object.fromEntries(
  Object.entries(
    import.meta.glob('../assets/sponsors/icons/*.png', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  ).map(([path, url]) => {
    const file = path.split('/').pop()?.replace(/\.png$/i, '') || '';
    return [file, url];
  }),
);

const SPONSOR_ORDER = [
  'nubanco',
  'petrobraz',
  'magazine-luizao',
  'ifome',
  'betregional',
  'picpaga',
  'sheinpee',
  'amazonia-com',
  'googol',
  'metagol',
  'starbox-coffee',
  'havaianinhas',
  'naike',
  'pumba-sport',
  'perdigol',
  'poweraid',
  'playstacao',
  'fedexpressao',
];

(() => {
  showUpdateAlertIfNeeded(BUILD_VERSION);
  const $ = selector => document.querySelector(selector);

  const formatUpdateTime = value => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  };

  const updateEl = $('#lastUpdate');
  if (updateEl) {
    const buildMeta = document.querySelector('meta[name="build-time"]');
    const stamp = buildMeta?.content || new Date().toISOString();
    updateEl.textContent = `Última atualização: ${formatUpdateTime(stamp)}`;
  }

  const buildEl = $('#homeBuildVersion');
  if (buildEl) buildEl.textContent = BUILD_VERSION;

  const hasCareer = () => {
    try {
      return !!localStorage.getItem('matchday-new-game');
    } catch {
      return false;
    }
  };

  const continueBtn = $('#continueBtn');
  const careerHint = $('#careerHint');
  if (hasCareer()) {
    continueBtn?.classList.remove('hidden');
    if (careerHint) {
      try {
        const save = JSON.parse(localStorage.getItem('matchday-new-game') || '{}');
        const club = save.clubName || 'seu clube';
        const division = save.division ? `Série ${save.division}` : 'carreira ativa';
        careerHint.textContent = `Carreira encontrada: ${club} · ${division}.`;
        careerHint.classList.remove('hidden');
      } catch {
        careerHint.textContent = 'Carreira salva encontrada neste navegador.';
        careerHint.classList.remove('hidden');
      }
    }
  }

  const initSponsorRail = () => {
    const track = $('#homeSponsorsTrack');
    const viewport = track?.parentElement;
    if (!track || !viewport) return;

    const logos = SPONSOR_ORDER.map(slug => ({
      slug,
      url: SPONSOR_LOGO_URLS[slug],
    })).filter(item => item.url);

    if (!logos.length) return;

    // Duplica a lista para loop contínuo sem salto.
    const sequence = [...logos, ...logos];
    track.innerHTML = sequence
      .map(
        item =>
          `<span class="home-sponsor-slot"><img src="${item.url}" alt="" width="72" height="72" decoding="async"></span>`,
      )
      .join('');

    const gap = 10;
    const visible = 4;
    let index = 0;
    let slotSize = 0;
    let timer = 0;

    const measure = () => {
      const width = viewport.clientWidth;
      slotSize = (width - gap * (visible - 1)) / visible;
      track.querySelectorAll('.home-sponsor-slot').forEach(slot => {
        slot.style.flex = `0 0 ${slotSize}px`;
      });
      track.style.transform = `translate3d(-${index * (slotSize + gap)}px,0,0)`;
    };

    const step = () => {
      index += 1;
      track.classList.remove('is-resetting');
      track.style.transform = `translate3d(-${index * (slotSize + gap)}px,0,0)`;

      if (index >= logos.length) {
        window.setTimeout(() => {
          track.classList.add('is-resetting');
          index = 0;
          track.style.transform = 'translate3d(0,0,0)';
        }, 560);
      }
    };

    measure();
    window.addEventListener('resize', measure);
    timer = window.setInterval(step, 2800);

    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          window.clearInterval(timer);
          timer = 0;
        } else if (!timer) {
          timer = window.setInterval(step, 2800);
        }
      },
      { passive: true },
    );
  };

  initSponsorRail();
})();
