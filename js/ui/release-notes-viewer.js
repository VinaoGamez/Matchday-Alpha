import { BUILD_VERSION } from '../core/constants.js';
import { RELEASE_NOTES } from '../core/release-notes.js';

const MODAL_ID = 'releaseNotesModal';
let readerIndex = 0;
let wired = false;

function releaseTimestamp(note) {
  const raw = note?.publishedAt || `${note?.date || '1970-01-01'}T12:00:00`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date(`${note?.date}T12:00:00`) : date;
}

export function formatReleaseDateTime(note) {
  const date = releaseTimestamp(note);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

function renderTopicsHtml(topics = []) {
  if (!topics.length) {
    return '<p>Build atualizado. Explore as novidades e reporte qualquer comportamento estranho.</p>';
  }
  return topics
    .map(
      section => `
    <section class="release-notes-topic">
      <label>${section.label.toUpperCase()}</label>
      <ul>${section.items.map(item => `<li>${item}</li>`).join('')}</ul>
    </section>
  `,
    )
    .join('');
}

function ensureStyles() {
  if (document.getElementById('release-notes-viewer-styles')) return;
  const style = document.createElement('style');
  style.id = 'release-notes-viewer-styles';
  style.textContent = `
    .updates-info-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px;border:1px solid #28505b;border-radius:6px;background:#0b1d25}
    .updates-info-summary{display:grid;gap:4px;min-width:0}
    .updates-info-summary strong{color:#edf8f5;font:700 16px 'Barlow Condensed',sans-serif}
    .updates-info-summary span{color:#9eb6b8;font:600 12px 'DM Sans',sans-serif}
    .updates-info-row button{flex:none;background:#24667c!important;color:#fff!important;border:1px solid #63d9ff!important;padding:10px 16px;font:700 10px 'DM Sans',sans-serif;letter-spacing:.35px;cursor:pointer;border-radius:5px}
    .updates-info-row button:hover{background:#2f7890!important;border-color:#8ae6ff!important}
    .release-notes-topic{padding:12px;border:1px solid #28505b;border-radius:6px;background:#091820}
    .release-notes-topic+ .release-notes-topic{margin-top:10px}
    .release-notes-topic>label{display:block;margin:0 0 8px;color:#63d9ff;font:700 10px 'DM Sans',sans-serif;letter-spacing:.55px}
    .release-notes-topic ul{margin:0;padding-left:18px;color:#d7ece8;font:500 12px/1.45 'DM Sans',sans-serif}
    .release-notes-topic li+li{margin-top:6px}
    @media(max-width:560px){.updates-info-row{align-items:flex-start;flex-direction:column}}
  `;
  document.head.append(style);
}

function ensureModal() {
  if (document.getElementById(MODAL_ID)) return;
  document.body.insertAdjacentHTML(
    'beforeend',
    `
    <div id="${MODAL_ID}" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="releaseNotesTitle">
      <div class="modal-card message-reader-card">
        <button id="closeReleaseNotes" class="close" type="button" aria-label="Fechar">×</button>
        <header class="message-reader-head">
          <small id="releaseNotesMeta">ATUALIZAÇÃO</small>
          <h2 id="releaseNotesTitle">—</h2>
          <time id="releaseNotesTime">—</time>
        </header>
        <div id="releaseNotesBody" class="message-reader-body"></div>
        <footer class="message-reader-actions">
          <button id="releaseNotesPrev" type="button">← ANTERIOR</button>
          <button id="releaseNotesClose" type="button">FECHAR</button>
          <button id="releaseNotesNext" type="button">PRÓXIMA →</button>
        </footer>
      </div>
    </div>
  `,
  );
}

function updateReaderNav() {
  const prev = document.getElementById('releaseNotesPrev');
  const next = document.getElementById('releaseNotesNext');
  if (prev) prev.disabled = readerIndex <= 0;
  if (next) next.disabled = readerIndex >= RELEASE_NOTES.length - 1;
}

function renderReaderAt(index) {
  const note = RELEASE_NOTES[index];
  if (!note) return;
  readerIndex = index;

  const meta = document.getElementById('releaseNotesMeta');
  const title = document.getElementById('releaseNotesTitle');
  const time = document.getElementById('releaseNotesTime');
  const body = document.getElementById('releaseNotesBody');

  if (meta) meta.textContent = `ATUALIZAÇÃO · ${note.version}${note.version === BUILD_VERSION ? ' · ATUAL' : ''}`;
  if (title) title.textContent = note.title || 'Matchday Football foi atualizado';
  if (time) time.textContent = formatReleaseDateTime(note);
  if (body) body.innerHTML = renderTopicsHtml(note.topics);

  updateReaderNav();
  document.getElementById(MODAL_ID)?.classList.remove('hidden');
}

export function getLatestReleaseSummary() {
  const latest = RELEASE_NOTES[0];
  if (!latest) return { version: BUILD_VERSION, label: '—' };
  return {
    version: latest.version,
    label: formatReleaseDateTime(latest),
  };
}

export function renderOptionsUpdateSummary() {
  const el = document.getElementById('optionsLatestUpdate');
  if (!el) return;
  const { version, label } = getLatestReleaseSummary();
  el.textContent = `${label} · ${version}`;
}

export function openReleaseNotesReader(startIndex = 0) {
  ensureStyles();
  ensureModal();
  renderReaderAt(Math.max(0, Math.min(startIndex, RELEASE_NOTES.length - 1)));
}

export function initReleaseNotesViewer({ $, onClick }) {
  ensureStyles();
  ensureModal();
  if (wired) return;
  wired = true;

  const close = () => {
    $('#' + MODAL_ID)?.classList.add('hidden');
  };

  onClick('#openReleaseNotes', () => openReleaseNotesReader(0));
  onClick('#closeReleaseNotes', close);
  onClick('#releaseNotesClose', close);
  onClick('#releaseNotesPrev', () => {
    if (readerIndex > 0) renderReaderAt(readerIndex - 1);
  });
  onClick('#releaseNotesNext', () => {
    if (readerIndex < RELEASE_NOTES.length - 1) renderReaderAt(readerIndex + 1);
  });
}
