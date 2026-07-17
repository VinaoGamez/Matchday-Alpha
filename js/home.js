import './security/tester-hardening.js';
import { BUILD_VERSION } from './core/constants.js';
import { showUpdateAlertIfNeeded } from './ui/update-alert.js';

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

  const hasCareer = () => {
    try { return !!localStorage.getItem('matchday-new-game'); }
    catch { return false; }
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

})();
