import { MODULE_VERSIONS, BUILD_VERSION, SAVE_KEYS } from '../../core/constants.js';

const GITHUB_ISSUES_NEW =
  'https://github.com/vinaogamez/Matchday-Alpha/issues/new';

const GUIDE_SECTIONS = [
  {
    title: 'Como abrir o jogo',
    body: [
      'Use o link público de testers (GitHub Pages) ou o servidor local na porta 5081 / Vite 5080.',
      'Restrições de F12/cópia valem só no link público; no local você pode inspecionar erros no DevTools.',
      'A home é o ponto de entrada: Novo Jogo ou Continuar Carreira.',
      'Após uma atualização, faça hard refresh (Ctrl+Shift+R) para carregar o bundle novo.',
    ],
  },
  {
    title: 'Save e atualizações',
    body: [
      'A carreira fica salva só neste navegador (localStorage). Limpar dados do site apaga o progresso.',
      'O modal de atualização e Opções → Consultar mostram o histórico de builds (RELEASE_NOTES).',
      'Se o alerta de update não aparecer, limpe a chave matchday-last-seen-build e recarregue.',
    ],
  },
  {
    title: 'Fluxo sugerido de teste',
    body: [
      'Novo Jogo → Central → Táticas → Partida ao vivo → Mensagens.',
      'Calendário e rotina de treinos; Escritório (orçamento/investimentos); Estádio (bilheteria).',
      'Série D: fase de grupos + mata-mata. Copa do Brasil: fases e sorteios progressivos.',
      'Fim de temporada: confira acessos, premiação por fase (Série D / Copa) e transição.',
      'Medidor da meta: Opções → PREVIEW META (ou ?preview=season-goal). Dados fictícios; não altera o save.',
    ],
  },
  {
    title: 'O que reportar',
    body: [
      'Bugs que travam o fluxo, placares/economia incorretos, UI quebrada, save que não carrega.',
      'Use Enviar feedback — o relatório já inclui build, navegador e dados básicos da carreira.',
      'Ideias e balanceamento também são bem-vindos; marque a categoria certa no formulário.',
    ],
  },
];

const FEEDBACK_CATEGORIES = [
  { value: 'bug', label: 'Bug' },
  { value: 'balance', label: 'Balanceamento' },
  { value: 'ui', label: 'Interface' },
  { value: 'idea', label: 'Ideia' },
  { value: 'other', label: 'Outro' },
];

const FEEDBACK_SEVERITIES = [
  { value: 'blocker', label: 'Bloqueante' },
  { value: 'major', label: 'Importante' },
  { value: 'minor', label: 'Leve' },
];

const FEEDBACK_AREAS = [
  { value: 'match', label: 'Partida ao vivo' },
  { value: 'season', label: 'Temporada / competições' },
  { value: 'economy', label: 'Economia / Escritório' },
  { value: 'ui', label: 'Interface / navegação' },
  { value: 'save', label: 'Save / memória' },
  { value: 'other', label: 'Outro' },
];

function careerSnapshot() {
  try {
    const raw = localStorage.getItem(SAVE_KEYS.career);
    if (!raw) return { hasCareer: false };
    const save = JSON.parse(raw);
    return {
      hasCareer: true,
      clubName: save.clubName || '—',
      division: save.division || '—',
      season: save.season || '—',
    };
  } catch {
    return { hasCareer: false };
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildReport({ category, severity, area, title, description, steps }) {
  const career = careerSnapshot();
  const lines = [
    `## ${title.trim() || 'Feedback de tester'}`,
    '',
    `- **Build:** ${BUILD_VERSION}`,
    `- **Categoria:** ${category}`,
    `- **Severidade:** ${severity}`,
    `- **Área:** ${area}`,
    `- **URL:** ${location.href}`,
    `- **Navegador:** ${navigator.userAgent}`,
    `- **Carreira:** ${
      career.hasCareer
        ? `${career.clubName} · Série ${career.division} · temporada ${career.season}`
        : 'nenhuma neste navegador'
    }`,
    '',
    '### Descrição',
    description.trim() || '—',
    '',
    '### Passos para reproduzir',
    steps.trim() || '—',
  ];
  return lines.join('\n');
}

/**
 * Guia do tester + feedback estruturado (home e Opções).
 */
export function createTesterHubFeature(deps = {}) {
  const { root = document.body, onOpenGuide, onOpenFeedback } = deps;

  const inject = () => {
    if (document.getElementById('testerGuideModal')) return;
    const guideHtml = GUIDE_SECTIONS.map(
      section =>
        `<article class="tester-guide-section"><h3>${escapeHtml(section.title)}</h3><ul>${section.body
          .map(item => `<li>${escapeHtml(item)}</li>`)
          .join('')}</ul></article>`,
    ).join('');

    const categoryOpts = FEEDBACK_CATEGORIES.map(
      item => `<option value="${item.value}">${item.label}</option>`,
    ).join('');
    const severityOpts = FEEDBACK_SEVERITIES.map(
      item => `<option value="${item.value}">${item.label}</option>`,
    ).join('');
    const areaOpts = FEEDBACK_AREAS.map(
      item => `<option value="${item.value}">${item.label}</option>`,
    ).join('');

    root.insertAdjacentHTML(
      'beforeend',
      `<div id="testerGuideModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="testerGuideTitle">
        <div class="modal-card tester-hub-modal">
          <button id="closeTesterGuide" class="close" type="button" aria-label="Fechar">×</button>
          <label>ALPHA · TESTERS</label>
          <h2 id="testerGuideTitle">Guia do tester</h2>
          <p class="tester-hub-lead">Como jogar a build, o que validar e como reportar problemas com contexto útil.</p>
          <div class="tester-guide-body">${guideHtml}</div>
          <div class="tester-hub-actions">
            <button id="testerGuideToFeedback" type="button">ENVIAR FEEDBACK</button>
            <button id="closeTesterGuideBtn" type="button" class="secondary">FECHAR</button>
          </div>
        </div>
      </div>
      <div id="testerFeedbackModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="testerFeedbackTitle">
        <div class="modal-card tester-hub-modal">
          <button id="closeTesterFeedback" class="close" type="button" aria-label="Fechar">×</button>
          <label>ALPHA · TESTERS</label>
          <h2 id="testerFeedbackTitle">Enviar feedback</h2>
          <p class="tester-hub-lead">Preencha o formulário. Você pode copiar o relatório ou abrir uma issue no GitHub já preenchida.</p>
          <form id="testerFeedbackForm" class="tester-feedback-form">
            <div class="tester-feedback-grid">
              <label>Categoria<select id="feedbackCategory" required>${categoryOpts}</select></label>
              <label>Severidade<select id="feedbackSeverity" required>${severityOpts}</select></label>
              <label>Área<select id="feedbackArea" required>${areaOpts}</select></label>
            </div>
            <label class="tester-feedback-full">Título<input id="feedbackTitle" maxlength="120" required placeholder="Ex.: Premiação Série D usa posição do grupo"></label>
            <label class="tester-feedback-full">Descrição<textarea id="feedbackDescription" rows="4" required placeholder="O que aconteceu e o que você esperava?"></textarea></label>
            <label class="tester-feedback-full">Passos para reproduzir<textarea id="feedbackSteps" rows="3" placeholder="1. … 2. … 3. …"></textarea></label>
            <p id="feedbackStatus" class="tester-feedback-status" aria-live="polite"></p>
            <div class="tester-hub-actions">
              <button id="feedbackCopy" type="button">COPIAR RELATÓRIO</button>
              <button id="feedbackGithub" type="button">ABRIR ISSUE NO GITHUB</button>
              <button id="closeTesterFeedbackBtn" type="button" class="secondary">FECHAR</button>
            </div>
          </form>
        </div>
      </div>`,
    );

    const guideModal = document.getElementById('testerGuideModal');
    const feedbackModal = document.getElementById('testerFeedbackModal');
    const statusEl = () => document.getElementById('feedbackStatus');

    const closeGuide = () => guideModal?.classList.add('hidden');
    const closeFeedback = () => feedbackModal?.classList.add('hidden');

    const openGuide = () => {
      closeFeedback();
      guideModal?.classList.remove('hidden');
      onOpenGuide?.();
    };
    const openFeedback = () => {
      closeGuide();
      feedbackModal?.classList.remove('hidden');
      statusEl() && (statusEl().textContent = '');
      onOpenFeedback?.();
      setTimeout(() => document.getElementById('feedbackTitle')?.focus(), 0);
    };

    document.getElementById('closeTesterGuide')?.addEventListener('click', closeGuide);
    document.getElementById('closeTesterGuideBtn')?.addEventListener('click', closeGuide);
    document.getElementById('closeTesterFeedback')?.addEventListener('click', closeFeedback);
    document.getElementById('closeTesterFeedbackBtn')?.addEventListener('click', closeFeedback);
    document.getElementById('testerGuideToFeedback')?.addEventListener('click', openFeedback);

    guideModal?.addEventListener('click', event => {
      if (event.target === guideModal) closeGuide();
    });
    feedbackModal?.addEventListener('click', event => {
      if (event.target === feedbackModal) closeFeedback();
    });

    const readForm = () => ({
      category: document.getElementById('feedbackCategory')?.value || 'bug',
      severity: document.getElementById('feedbackSeverity')?.value || 'major',
      area: document.getElementById('feedbackArea')?.value || 'other',
      title: document.getElementById('feedbackTitle')?.value || '',
      description: document.getElementById('feedbackDescription')?.value || '',
      steps: document.getElementById('feedbackSteps')?.value || '',
    });

    document.getElementById('feedbackCopy')?.addEventListener('click', async () => {
      const data = readForm();
      if (!data.title.trim() || !data.description.trim()) {
        if (statusEl()) statusEl().textContent = 'Preencha título e descrição.';
        return;
      }
      const report = buildReport(data);
      try {
        await navigator.clipboard.writeText(report);
        if (statusEl()) statusEl().textContent = 'Relatório copiado. Cole no chat ou na issue.';
      } catch {
        if (statusEl()) statusEl().textContent = 'Não foi possível copiar. Selecione e copie manualmente.';
      }
    });

    document.getElementById('feedbackGithub')?.addEventListener('click', () => {
      const data = readForm();
      if (!data.title.trim() || !data.description.trim()) {
        if (statusEl()) statusEl().textContent = 'Preencha título e descrição.';
        return;
      }
      const report = buildReport(data);
      const url = new URL(GITHUB_ISSUES_NEW);
      url.searchParams.set('template', 'tester-feedback.yml');
      url.searchParams.set('title', `[tester] ${data.title.trim()}`);
      url.searchParams.set('body', report);
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
      if (statusEl()) statusEl().textContent = 'Issue aberta em nova aba. Revise e envie no GitHub.';
    });

    return { openGuide, openFeedback, closeGuide, closeFeedback };
  };

  const api = inject();

  // Deep links: home.html#guia | #feedback
  const hash = (location.hash || '').toLowerCase();
  if (hash === '#guia' || hash === '#guide') setTimeout(api.openGuide, 0);
  if (hash === '#feedback') setTimeout(api.openFeedback, 0);

  return {
    moduleVersion: MODULE_VERSIONS.testerHub,
    openGuide: api.openGuide,
    openFeedback: api.openFeedback,
    closeGuide: api.closeGuide,
    closeFeedback: api.closeFeedback,
  };
}
