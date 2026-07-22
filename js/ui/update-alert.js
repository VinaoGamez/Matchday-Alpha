import '../../css/update-alert.css';
import { BUILD_VERSION, SAVE_KEYS } from '../core/constants.js';
import { RELEASE_NOTES } from '../core/release-notes.js';

const MODAL_ID = 'updateAlertModal';

export function isTesterUpdateChannel() {
  const host = location.hostname.toLowerCase();
  if (location.port === '5081') return true;
  if (/\.github\.io$/i.test(host)) return true;
  if (/\.pages\.dev$/i.test(host)) return true;
  if (/\.trycloudflare\.com$/i.test(host)) return true;
  return false;
}

function isDebugSession() {
  const params = new URLSearchParams(location.search);
  return params.has('benchmark') || params.has('cupAudit') || params.has('autoBenchmark') || params.has('engineTest');
}

function getLastSeenBuild() {
  try { return localStorage.getItem(SAVE_KEYS.lastSeenBuild); }
  catch { return null; }
}

function markBuildSeen(version) {
  try { localStorage.setItem(SAVE_KEYS.lastSeenBuild, version); }
  catch { /* ignore quota / privacy mode */ }
}

function getReleaseNotes(version) {
  return RELEASE_NOTES.find(note => note.version === version) || null;
}

function formatReleaseDate(isoDate) {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });
}

function renderTopics(topics = []) {
  if (!topics.length) {
    return '<p class="update-alert-fallback">Build atualizado. Explore as novidades e reporte qualquer comportamento estranho.</p>';
  }
  return topics.map(section => `
    <section class="update-alert-section">
      <label>${section.label.toUpperCase()}</label>
      <ul>${section.items.map(item => `<li>${item}</li>`).join('')}</ul>
    </section>
  `).join('');
}

function ensureModal() {
  if (document.getElementById(MODAL_ID)) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="${MODAL_ID}" class="update-alert-modal-wrap hidden" role="dialog" aria-modal="true" aria-labelledby="updateAlertTitle">
      <div class="update-alert-modal">
        <button id="closeUpdateAlert" class="close" type="button" aria-label="Fechar">×</button>
        <label>NOVA ATUALIZAÇÃO</label>
        <h2 id="updateAlertTitle"></h2>
        <p id="updateAlertVersion" class="update-alert-version"></p>
        <div id="updateAlertTopics"></div>
        <div class="update-alert-actions">
          <button id="confirmUpdateAlert" type="button">ENTENDI — CONTINUAR</button>
        </div>
      </div>
    </div>
  `);
}

function dismissUpdateAlert(version) {
  markBuildSeen(version);
  document.getElementById(MODAL_ID)?.classList.add('hidden');
}

export function showUpdateAlertIfNeeded(buildVersion = BUILD_VERSION) {
  if (!isTesterUpdateChannel() || isDebugSession()) return;
  if (getLastSeenBuild() === buildVersion) return;

  const notes = getReleaseNotes(buildVersion);
  ensureModal();

  const modal = document.getElementById(MODAL_ID);
  const title = document.getElementById('updateAlertTitle');
  const versionLine = document.getElementById('updateAlertVersion');
  const topics = document.getElementById('updateAlertTopics');
  if (!modal || !title || !versionLine || !topics) return;

  title.textContent = notes?.title || 'Matchday Football foi atualizado';
  versionLine.textContent = `${buildVersion} · ${formatReleaseDate(notes?.date || new Date().toISOString().slice(0, 10))}`;
  topics.innerHTML = renderTopics(notes?.topics);

  const close = () => dismissUpdateAlert(buildVersion);
  document.getElementById('closeUpdateAlert')?.addEventListener('click', close, { once: true });
  document.getElementById('confirmUpdateAlert')?.addEventListener('click', close, { once: true });

  modal.classList.remove('hidden');
}
