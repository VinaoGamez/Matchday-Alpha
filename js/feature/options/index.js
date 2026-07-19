import { MODULE_VERSIONS } from '../../core/constants.js';
import { initReleaseNotesViewer, renderOptionsUpdateSummary } from '../../ui/release-notes-viewer.js';
import { createTesterHubFeature } from '../tester-hub/index.js';

const GAME_PACE_CONFIG = {
  ultra: { name: 'ULTRA', detail: '8 s por tempo · 16 s de jogo contínuo', ms: 250 },
  fast: { name: 'RÁPIDO', detail: '15 s por tempo · 30 s de jogo contínuo', ms: 500 },
  standard: { name: 'PADRÃO', detail: '25 s por tempo · 50 s de jogo contínuo', ms: 750 },
  detailed: { name: 'DETALHADO', detail: '35 s por tempo · 70 s de jogo contínuo', ms: 1150 },
};

/**
 * Opções do jogo, ritmo da simulação e criação/edição de carreira.
 * @param {object} deps
 * @param {Function} deps.$
 * @param {Function} deps.$$
 * @param {Function} deps.onClick
 * @param {Function} deps.redirectGame
 * @param {Function} deps.cleanCareerText
 * @param {Function} deps.writeJson
 * @param {Function} deps.clearSeasonSave
 * @param {Function} [deps.clearCareerStorage]
 * @param {Function} [deps.markSkipPersistOnce]
 * @param {object} deps.SAVE_KEYS
 * @param {boolean} deps.hasCareer
 * @param {Function} deps.getSavedCareer
 * @param {Function} deps.initialBudget
 * @param {number} deps.defaultCareerSeason
 * @param {object} deps.initialEnvironmentRanges
 * @param {Function} [deps.onPaceChanged]
 * @param {Function} [deps.onPreviewSeasonGoal] Preview do medidor da meta (não altera save)
 */
export function createOptionsFeature(deps) {
  const {
    $,
    $$,
    onClick,
    redirectGame,
    cleanCareerText,
    writeJson,
    clearSeasonSave,
    clearCareerStorage,
    markSkipPersistOnce,
    SAVE_KEYS,
    hasCareer,
    getSavedCareer,
    initialBudget,
    defaultCareerSeason,
    initialEnvironmentRanges,
    onPaceChanged,
    onPreviewSeasonGoal,
  } = deps;

  let gamePace = localStorage.getItem(SAVE_KEYS.pace) || 'standard';
  if (!GAME_PACE_CONFIG[gamePace]) gamePace = 'standard';

  const injectModals = () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="optionsModal" class="modal hidden"><div class="modal-card options-modal"><button id="closeOptions" class="close">×</button><label>CONFIGURAÇÕES</label><h2>Opções do Jogo</h2><section class="option-section"><label>NOVA CARREIRA</label><div class="new-game-action"><div><strong>Criar clube e iniciar carreira</strong><small>Escolha seu clube, treinador e divisão. O universo nacional será gerado novamente.</small></div><button id="openNewGame" type="button">NOVO JOGO</button></div></section><section class="option-section"><label>RITMO DE JOGO</label><p>Define a duração da simulação contínua. Pausas técnicas e decisões do treinador continuam sob seu controle.</p><div id="paceChoices" class="option-choices">${Object.entries(GAME_PACE_CONFIG).map(([key, pace]) => `<button class="pace-choice" data-pace="${key}"><b>${pace.name}</b><small>${pace.detail}</small></button>`).join('')}</div></section><section class="option-section"><label>INFORMAÇÕES DE ATUALIZAÇÕES</label><div class="updates-info-row"><div class="updates-info-summary"><strong>Última Atualização</strong><span id="optionsLatestUpdate">—</span></div><button id="openReleaseNotes" type="button">CONSULTAR</button></div></section><section class="option-section"><label>TESTERS</label><div class="new-game-action"><div><strong>Guia e feedback</strong><small>Como testar a build e enviar relatório estruturado (GitHub ou copiar texto).</small></div><div class="option-choices" style="flex:none;display:flex;gap:8px;flex-wrap:wrap"><button id="openTesterGuide" type="button">GUIA</button><button id="openTesterFeedback" type="button">FEEDBACK</button><button id="previewSeasonGoalGauge" type="button" title="Abre o balanço com dados fictícios — não altera a carreira">PREVIEW META</button></div></div></section></div></div><div id="newGameModal" class="modal hidden"><div class="modal-card new-game-modal"><button id="closeNewGame" class="close">×</button><label>NOVA CARREIRA</label><h2>Crie sua história</h2><p>Defina a identidade do seu clube e a divisão em que a carreira começará.</p><div class="career-fields"><div class="career-field"><label for="careerClubName">NOME DO TIME</label><input id="careerClubName" maxlength="32" autocomplete="off" placeholder="Ex.: Atlético Fênix"></div><div class="career-field"><label for="careerManagerName">NOME DO TREINADOR</label><input id="careerManagerName" maxlength="40" autocomplete="off" placeholder="Ex.: Ricardo Almeida"></div><div class="career-field"><label for="careerStadiumName">NOME DO ESTÁDIO</label><input id="careerStadiumName" maxlength="40" autocomplete="off" placeholder="Ex.: Arena Fênix"></div></div><div class="division-choice"><label>DIVISÃO INICIAL</label><div class="division-choice-grid"><button class="division-card selected" data-career-division="A"><b>SÉRIE A</b><small>20 clubes · elite nacional</small></button><button class="division-card" data-career-division="B"><b>SÉRIE B</b><small>20 clubes · luta pelo acesso</small></button><button class="division-card" data-career-division="C"><b>SÉRIE C</b><small>20 clubes · primeira fase nacional</small></button><button class="division-card" data-career-division="D"><b>SÉRIE D</b><small>96 clubes · fase regional</small></button></div></div><p id="newGameError" class="new-game-error"></p><div class="new-game-buttons"><button id="cancelNewGame" type="button" class="secondary">CANCELAR</button><button id="confirmNewGame" type="button">CRIAR CARREIRA</button></div></div></div>`,
    );
  };

  const injectCareerWelcome = () => {
    if (hasCareer) return;
    document.body.classList.add('career-locked');
    const shell = $('.game-shell');
    if (shell) {
      shell.inert = true;
      shell.setAttribute('aria-hidden', 'true');
    }
    document.body.insertAdjacentHTML(
      'beforeend',
      '<section id="careerWelcome" class="career-welcome"><div class="career-welcome-content"><div class="career-welcome-brand"><img class="career-welcome-logo" src="./brand/lockup-lg.png" alt="Matchday Football" width="420" height="140"></div><button id="welcomeNewGame" type="button">NOVO JOGO</button></div></section>',
    );
  };

  injectModals();
  injectCareerWelcome();

  const testerHub = createTesterHubFeature({
    onOpenGuide: () => $('#optionsModal')?.classList.add('hidden'),
    onOpenFeedback: () => $('#optionsModal')?.classList.add('hidden'),
  });

  const renderOptions = () => {
    $$('#paceChoices button').forEach(button =>
      button.classList.toggle('selected', button.dataset.pace === gamePace),
    );
    renderOptionsUpdateSummary();
  };

  initReleaseNotesViewer({ $, onClick });
  onClick('#openOptions', () => {
    renderOptions();
    $('#optionsModal').classList.remove('hidden');
  });
  onClick('#closeOptions', () => $('#optionsModal').classList.add('hidden'));
  onClick('#openTesterGuide', () => testerHub.openGuide());
  onClick('#openTesterFeedback', () => testerHub.openFeedback());
  onClick('#previewSeasonGoalGauge', () => {
    $('#optionsModal')?.classList.add('hidden');
    onPreviewSeasonGoal?.();
  });

  let selectedCareerDivision = 'A';
  const selectCareerDivision = division => {
    selectedCareerDivision = division;
    $$('[data-career-division]').forEach(button =>
      button.classList.toggle('selected', button.dataset.careerDivision === division),
    );
  };

  const openCareerCreator = () => {
    const savedCareer = getSavedCareer();
    $('#careerClubName').value = savedCareer?.clubName || '';
    $('#careerManagerName').value = savedCareer?.managerName || '';
    $('#careerStadiumName').value = savedCareer?.stadiumName || '';
    $('#newGameError').textContent = '';
    selectCareerDivision(savedCareer?.division || 'A');
    $('#optionsModal').classList.add('hidden');
    $('#newGameModal').classList.remove('hidden');
    setTimeout(() => $('#careerClubName')?.focus(), 0);
  };

  const closeCareerCreator = () => {
    $('#newGameModal').classList.add('hidden');
    if (!localStorage.getItem(SAVE_KEYS.career) && new URLSearchParams(location.search).has('novo')) {
      location.replace('home.html');
    }
  };

  onClick('#openNewGame', openCareerCreator);
  onClick('#welcomeNewGame', openCareerCreator);

  if (new URLSearchParams(location.search).has('novo')) {
    $('#careerWelcome')?.remove();
    document.body.classList.remove('career-locked');
    const shell = $('.game-shell');
    if (shell) {
      shell.inert = false;
      shell.removeAttribute('aria-hidden');
    }
    setTimeout(openCareerCreator, 0);
  }

  onClick('#closeNewGame', closeCareerCreator);
  onClick('#cancelNewGame', closeCareerCreator);
  onClick('.division-choice-grid', event => {
    const button = event.target.closest('[data-career-division]');
    if (button) selectCareerDivision(button.dataset.careerDivision);
  });

  onClick('#confirmNewGame', () => {
    const clubName = cleanCareerText($('#careerClubName').value, '');
    const managerName = cleanCareerText($('#careerManagerName').value, '');
    const stadiumName = cleanCareerText($('#careerStadiumName').value, '');
    const error = $('#newGameError');
    if (clubName.length < 3) {
      error.textContent = 'Informe um nome de time com pelo menos 3 caracteres.';
      $('#careerClubName').focus();
      return;
    }
    if (managerName.length < 3) {
      error.textContent = 'Informe o nome do treinador com pelo menos 3 caracteres.';
      $('#careerManagerName').focus();
      return;
    }
    if (stadiumName.length < 3) {
      error.textContent = 'Informe o nome do estádio com pelo menos 3 caracteres.';
      $('#careerStadiumName').focus();
      return;
    }
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const status = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const environmentRange = initialEnvironmentRanges[selectedCareerDivision];
    const clubStatus = {
      environment: status(...environmentRange),
      support: status(55, 88),
      board: status(55, 88),
      finances: status(55, 88),
      budget: initialBudget(selectedCareerDivision),
    };
    // Impede o beforeunload da sessão atual de regravar o save antigo
    // (conflito de seed + estouro de cota do localStorage).
    markSkipPersistOnce?.();
    if (typeof clearCareerStorage === 'function') clearCareerStorage({ clearTraining: true });
    else clearSeasonSave();
    const careerPayload = {
      seed,
      clubName,
      managerName,
      stadiumName,
      foundingClubName: clubName,
      careerClubHistory: [clubName],
      pendingSponsorChoice: true,
      division: selectedCareerDivision,
      clubStatus,
      season: defaultCareerSeason,
      createdAt: new Date().toISOString(),
      version: 4,
    };
    const saved = writeJson(SAVE_KEYS.career, careerPayload);
    if (!saved) {
      error.textContent =
        'Não foi possível salvar a nova carreira (memória do navegador cheia). Limpe dados do site e tente novamente.';
      return;
    }
    $('#newGameModal').classList.add('hidden');
    $('#optionsModal').classList.add('hidden');
    redirectGame();
  });

  onClick('#paceChoices', event => {
    const button = event.target.closest('button');
    if (!button) return;
    gamePace = button.dataset.pace;
    localStorage.setItem(SAVE_KEYS.pace, gamePace);
    renderOptions();
    onPaceChanged?.();
  });

  return {
    moduleVersion: MODULE_VERSIONS.options,
    getPace: () => gamePace,
    getPaceMs: () => (GAME_PACE_CONFIG[gamePace] || GAME_PACE_CONFIG.standard).ms,
    getPaceConfig: () => GAME_PACE_CONFIG,
    renderOptions,
    openCareerCreator,
  };
}
