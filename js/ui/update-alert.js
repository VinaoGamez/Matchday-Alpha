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

function ensureStyles() {
  if (document.getElementById('update-alert-styles')) return;
  const style = document.createElement('style');
  style.id = 'update-alert-styles';
  style.textContent = `
    .update-alert-modal-wrap{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:18px;background:#020b10cc;backdrop-filter:blur(3px)}
    .update-alert-modal-wrap.hidden{display:none!important}
    .update-alert-modal{width:min(560px,calc(100vw - 28px));text-align:left;border:1px solid #315b68;border-radius:8px;background:linear-gradient(180deg,#0b1f28 0%,#08161d 100%);color:#edf8f5;box-shadow:0 18px 48px #0009;padding:18px 18px 16px;position:relative}
    .update-alert-modal .close{position:absolute;top:10px;right:10px;width:28px;height:28px;border:0;border-radius:4px;background:#17313a;color:#dce9e8;font:700 18px/1 'DM Sans',sans-serif;cursor:pointer}
    .update-alert-modal .close:hover{background:#214552;color:#fff}
    .update-alert-modal>label{display:block;margin:0 0 8px;color:#63d9ff;font:700 11px 'DM Sans',sans-serif;letter-spacing:.7px}
    .update-alert-modal h2{margin:0 0 6px;font:700 30px 'Barlow Condensed',sans-serif;line-height:1.05}
    .update-alert-version{margin:0 0 14px;color:#9eb6b8;font:600 12px 'DM Sans',sans-serif}
    .update-alert-section{padding:12px;border:1px solid #315b68;border-radius:6px;margin-top:10px;background:#0a171d}
    .update-alert-section>label{display:block;margin:0 0 8px;color:#63d9ff;font:700 10px 'DM Sans',sans-serif;letter-spacing:.55px}
    .update-alert-section ul{margin:0;padding-left:18px;color:#d7ece8;font:500 12px/1.45 'DM Sans',sans-serif}
    .update-alert-section li+li{margin-top:6px}
    .update-alert-fallback{margin:0;color:#b8cfcc;font:500 12px/1.45 'DM Sans',sans-serif}
    .update-alert-actions{display:flex;justify-content:flex-end;margin-top:16px}
    .update-alert-actions button{border:1px solid #397487;border-radius:5px;background:#24667c;color:#fff;padding:10px 16px;font:700 10px 'DM Sans',sans-serif;letter-spacing:.2px;cursor:pointer}
    .update-alert-actions button:hover{background:#2f7890;border-color:#63d9ff}
  `;
  document.head.append(style);
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
  ensureStyles();
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
