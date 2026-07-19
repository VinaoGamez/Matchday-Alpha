import { MODULE_VERSIONS } from '../../core/constants.js';

const LEAGUE_ORDER = [
  { key: 'A', label: 'Série A', accent: '#63d9ff', trophy: '#ffd24a' },
  { key: 'B', label: 'Série B', accent: '#7ee787', trophy: '#c9e265' },
  { key: 'C', label: 'Série C', accent: '#ffc94f', trophy: '#ffb347' },
  { key: 'D', label: 'Série D', accent: '#ff9f6b', trophy: '#ff8c5a' },
  { key: 'CUP', label: 'Copa do Brasil', accent: '#b6ff38', trophy: '#b6ff38' },
];

let svgIconSeq = 0;

const trophyIcon = (fill = '#ffd24a', glow = '#ffc94f66', size = 40) => {
  const uid = ++svgIconSeq;
  return `<svg class="season-trophy-icon" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true" focusable="false" style="filter:drop-shadow(0 3px 6px ${glow})">
    <defs>
      <linearGradient id="trophyGrad-${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${fill}" stop-opacity="1"/>
        <stop offset="100%" stop-color="${fill}" stop-opacity=".72"/>
      </linearGradient>
    </defs>
    <path fill="url(#trophyGrad-${uid})" d="M8 4h16v3c0 4.5-2.2 7.8-5.5 9.5L18 20v2h4v3H10v-3h4v-2l-.5-3.5C10.2 14.8 8 11.5 8 7V4z"/>
    <path fill="${fill}" opacity=".35" d="M11 6h10v1.5c0 3.2-1.5 5.6-3.8 7L16 17.5 14.8 14.5C12.5 12.6 11 10.2 11 7V6z"/>
    <rect x="12" y="25" width="8" height="2" rx="1" fill="${fill}" opacity=".85"/>
    <path fill="none" stroke="${fill}" stroke-width="1.2" d="M8 6H5.5a2.5 2.5 0 0 0 0 5H8M24 6h2.5a2.5 2.5 0 0 1 0 5H24"/>
  </svg>`;
};

const cupTrophyIcon = (size = 46) => {
  const svg = trophyIcon('#b6ff38', '#b6ff3866', size);
  return svg.replace('class="season-trophy-icon"', 'class="season-trophy-icon cup"');
};

const scorerMedalIcon = () =>
  `<svg class="season-stat-icon scorer" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
    <circle cx="14" cy="14" r="13" fill="#2a220d" stroke="#ffc94f" stroke-width="1.5"/>
    <circle cx="14" cy="14" r="9" fill="#3a2d0b" stroke="#ffe36a" stroke-width="1"/>
    <path fill="#ffc94f" d="M10 17l2.2-6.5h3.6L18 17h-2.4l-.6-2h-3.8l-.6 2H10zm3.2-4.2h2.4l-1.2-3.6-1.2 3.6z"/>
    <text x="14" y="22" text-anchor="middle" fill="#ffe36a" font-size="5" font-weight="800" font-family="DM Sans,sans-serif">GOL</text>
  </svg>`;

const assistMedalIcon = () =>
  `<svg class="season-stat-icon assist" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
    <circle cx="14" cy="14" r="13" fill="#0d2732" stroke="#63d9ff" stroke-width="1.5"/>
    <circle cx="14" cy="14" r="9" fill="#123843" stroke="#9ae8ff" stroke-width="1"/>
    <path fill="none" stroke="#63d9ff" stroke-width="1.6" stroke-linecap="round" d="M9 14h7M14 11l3 3-3 3"/>
    <circle cx="9" cy="14" r="1.5" fill="#b6ff38"/>
    <text x="14" y="22" text-anchor="middle" fill="#9ae8ff" font-size="4.5" font-weight="800" font-family="DM Sans,sans-serif">AST</text>
  </svg>`;

/** Medidor visual: desempenho entregue vs meta pedida pela diretoria. */
const GOAL_GAUGE = {
  exceeded: { score: 100, short: 'Superou', hint: 'Acima do pedido', color: '#b6ff38' },
  met: { score: 78, short: 'Cumpriu', hint: 'No combinado', color: '#63d9ff' },
  near: { score: 48, short: 'Quase', hint: 'Perto da meta', color: '#ffc94f' },
  missed: { score: 22, short: 'Abaixo', hint: 'Abaixo do pedido', color: '#ff8c94' },
};

const seasonGoalGauge = (status = 'met') => {
  const key = GOAL_GAUGE[status] ? status : 'met';
  const { score, short, hint, color } = GOAL_GAUGE[key];
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const dash = (circumference * progress).toFixed(2);
  const gap = (circumference - circumference * progress).toFixed(2);
  // Meta da diretoria = 100% do pedido (marcador no topo do anel).
  return `<aside class="season-goal-gauge goal-${key}" style="--gauge-color:${color};--gauge-score:${score}" aria-label="Desempenho frente à meta: ${hint}">
    <div class="season-goal-gauge-ring">
      <svg viewBox="0 0 88 88" aria-hidden="true" focusable="false">
        <circle class="season-goal-gauge-track" cx="44" cy="44" r="${radius}"/>
        <circle class="season-goal-gauge-progress" cx="44" cy="44" r="${radius}" stroke-dasharray="${dash} ${gap}"/>
        <circle class="season-goal-gauge-target" cx="${44 + radius}" cy="44" r="3.2"/>
      </svg>
      <div class="season-goal-gauge-score">
        <strong>${score}%</strong>
        <span>${short}</span>
      </div>
    </div>
    <div class="season-goal-gauge-legend">
      <span><i class="delivered" aria-hidden="true"></i>Entregue</span>
      <span><i class="requested" aria-hidden="true"></i>Pedido</span>
    </div>
  </aside>`;
};

const MODAL_HTML = `
<div id="seasonTransitionModal" class="modal hidden">
  <div class="modal-card season-summary-modal">
    <label>TEMPORADA CONCLUÍDA</label>
    <h2 id="seasonSummaryTitle">Balanço da temporada</h2>
    <p id="seasonTransitionLead" class="season-summary-lead">Resultados finais das competições nacionais.</p>
    <div id="seasonTransitionSummary" class="season-summary-user"></div>
    <section class="season-summary-section" id="seasonGoalSection">
      <header><h3>Meta da temporada</h3><small>Avaliação da diretoria sobre o combinado</small></header>
      <div id="seasonGoalPreviewSwitcher" class="season-goal-preview-switcher hidden" role="tablist" aria-label="Status da meta (preview)">
        <button type="button" data-goal-preview-status="missed">Abaixo</button>
        <button type="button" data-goal-preview-status="near">Quase</button>
        <button type="button" data-goal-preview-status="met">Cumpriu</button>
        <button type="button" data-goal-preview-status="exceeded">Superou</button>
      </div>
      <div id="seasonGoalResult" class="season-goal-result"></div>
    </section>
    <section class="season-summary-section">
      <header><h3>Campeões</h3><small>Títulos conquistados em <span id="seasonSummaryYear"></span></small></header>
      <div id="seasonChampions" class="season-champions-grid"></div>
    </section>
    <section class="season-summary-section">
      <header><h3>Líderes de estatística</h3><small>Artilheiro e assistências por competição</small></header>
      <div id="seasonLeaders" class="season-leaders-grid"></div>
    </section>
    <section class="season-summary-section" id="seasonRewardsSection">
      <header><h3>Premiação da temporada</h3><small>Orçamento do clube atualizado para a próxima temporada</small></header>
      <div id="seasonRewards" class="season-rewards"></div>
    </section>
    <section class="season-summary-section">
      <header><h3>Acessos e rebaixamentos</h3><small>Movimentos para a próxima temporada</small></header>
      <div id="seasonMovements" class="season-movements-grid"></div>
    </section>
    <div class="season-summary-actions">
      <button id="closeSeasonSummary" type="button" class="season-summary-dismiss">VOLTAR À TEMPORADA</button>
      <button id="startNextSeason" type="button">AVANÇAR TEMPORADA →</button>
    </div>
  </div>
</div>
<div id="idleSeasonSimModal" class="modal hidden">
  <div class="modal-card idle-sim-modal">
    <label>CALENDÁRIO NACIONAL</label>
    <h2>Simulando não humanos</h2>
    <p>Seu clube não tem mais partidas. O restante da temporada está sendo resolvido automaticamente.</p>
    <strong id="idleSeasonSimStatus">Preparando…</strong>
  </div>
</div>`;

/**
 * Resumo de fim de temporada — campeões, líderes e movimentos de divisão.
 */
const PREVIEW_GOAL_SAMPLES = {
  missed: {
    status: 'missed',
    label: 'Conquistar o acesso à Série C',
    feeling: 'Abaixo do combinado. A diretoria cobrará mudanças. Com um pacote comercial alto, a cobrança pela meta ficou mais dura.',
    boardDelta: -17,
  },
  near: {
    status: 'near',
    label: 'Chegar às oitavas do mata-mata',
    feeling: 'Quase lá — a diretoria mantém o projeto, com ressalvas.',
    boardDelta: -3,
  },
  met: {
    status: 'met',
    label: 'Avançar da fase de grupos',
    feeling: 'Meta da temporada cumprida. A diretoria está satisfeita.',
    boardDelta: 4,
  },
  exceeded: {
    status: 'exceeded',
    label: 'Conquistar o acesso à Série C',
    feeling: 'A diretoria celebra: a meta foi superada. O pacote de patrocínio elevado reforçou o crédito junto à diretoria.',
    boardDelta: 18,
  },
};

export function createSeasonSummaryFeature(deps) {
  const { $, clubCrestInitials, onStartNextSeason, onCloseSeasonSummary } = deps;
  let handlersBound = false;
  let previewMode = false;
  let previewStatus = 'missed';

  const syncPreviewChrome = () => {
    const modal = $('#seasonTransitionModal');
    const switcher = $('#seasonGoalPreviewSwitcher');
    const closeBtn = $('#closeSeasonSummary');
    const startBtn = $('#startNextSeason');
    const label = modal?.querySelector('label');
    modal?.classList.toggle('is-preview', previewMode);
    switcher?.classList.toggle('hidden', !previewMode);
    if (switcher && previewMode) {
      switcher.querySelectorAll('[data-goal-preview-status]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.goalPreviewStatus === previewStatus);
      });
    }
    if (closeBtn) closeBtn.textContent = previewMode ? 'FECHAR PREVIEW' : 'VOLTAR À TEMPORADA';
    if (startBtn) {
      startBtn.classList.toggle('hidden', previewMode);
      startBtn.disabled = previewMode;
    }
    if (label) label.textContent = previewMode ? 'PREVIEW · NÃO ALTERA A CARREIRA' : 'TEMPORADA CONCLUÍDA';
  };

  const exitPreview = () => {
    previewMode = false;
    syncPreviewChrome();
    $('#seasonTransitionModal')?.classList.add('hidden');
  };

  const bindHandlers = () => {
    if (handlersBound) return;
    handlersBound = true;
    document.addEventListener('click', event => {
      const previewStatusBtn = event.target.closest('[data-goal-preview-status]');
      if (previewStatusBtn && previewMode) {
        event.preventDefault();
        event.stopPropagation();
        const next = previewStatusBtn.dataset.goalPreviewStatus;
        if (!PREVIEW_GOAL_SAMPLES[next] || next === previewStatus) return;
        previewStatus = next;
        openPreview(previewStatus);
        return;
      }
      const closeBtn = event.target.closest('#closeSeasonSummary');
      if (closeBtn) {
        event.preventDefault();
        event.stopPropagation();
        if (previewMode) {
          exitPreview();
          return;
        }
        if (onCloseSeasonSummary) onCloseSeasonSummary();
        else $('#seasonTransitionModal')?.classList.add('hidden');
        return;
      }
      const button = event.target.closest('#startNextSeason');
      if (!button) return;
      if (previewMode) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onStartNextSeason?.();
    });
  };

  const injectDom = () => {
    if (!$('#seasonTransitionModal')) {
      document.body.insertAdjacentHTML('beforeend', MODAL_HTML);
    }
    bindHandlers();
  };

  const championCard = ({ key, label, accent, trophy }, clubName) => {
    const isCup = key === 'CUP';
    const crest = clubName ? clubCrestInitials(clubName) : '—';
    const trophyMarkup = isCup ? cupTrophyIcon(46) : trophyIcon(trophy, `${trophy}88`, 42);
    return `<article class="season-champion-card ${isCup ? 'cup' : ''}" style="--champion-accent:${accent}">
      <span class="season-champion-badge">${label}</span>
      <div class="season-champion-trophy">${trophyMarkup}</div>
      <div class="season-champion-hero">
        <div class="season-champion-crest" aria-hidden="true">${crest}</div>
      </div>
      <p class="season-champion-title">${isCup ? 'Campeão da Copa' : 'Campeão do Brasileirão'}</p>
      <p class="season-champion-name">${clubName || '—'}</p>
    </article>`;
  };

  const leaderRow = (kind, label, entry, metric, metricLabel, iconMarkup) => {
    if (!entry?.name || entry.name === '—') {
      return `<div class="season-leader-row ${kind}">
        <div class="season-leader-icon">${iconMarkup}</div>
        <div class="season-leader-copy">
          <span class="season-leader-label">${label}</span>
          <span class="season-leader-player">—</span>
          <span class="season-leader-meta">Sem dados registrados</span>
        </div>
      </div>`;
    }
    return `<div class="season-leader-row ${kind}">
      <div class="season-leader-icon">${iconMarkup}</div>
      <div class="season-leader-copy">
        <span class="season-leader-label">${label}</span>
        <span class="season-leader-player">${entry.name}</span>
        <span class="season-leader-meta">${entry.club}</span>
        <span class="season-leader-stat"><em>${entry[metric]}</em> ${metricLabel}</span>
      </div>
    </div>`;
  };

  const leadersCard = (key, label, scorers, assistants) => {
    const isCup = key === 'CUP';
    const scorer = scorers[0];
    const assistant = assistants[0];
    return `<article class="season-leaders-card ${isCup ? 'cup' : ''}">
      <div class="season-leaders-card-head">${label}</div>
      ${leaderRow('scorer', 'Artilheiro', scorer, 'goals', scorer?.goals === 1 ? 'gol' : 'gols', scorerMedalIcon())}
      ${leaderRow('assist', 'Assistências', assistant, 'assists', assistant?.assists === 1 ? 'assistência' : 'assistências', assistMedalIcon())}
    </article>`;
  };

  const movementCard = (title, clubs, userClub, type) => {
    const icon = type === 'promote' ? '↑' : '↓';
    const items = clubs.length
      ? clubs.map((name, index) => `<div class="season-movement-item ${name === userClub ? 'user' : ''}"><small>${index + 1}</small><b>${name}</b></div>`).join('')
      : '<div class="season-movement-item"><small>—</small><b>Nenhum clube</b></div>';
    return `<article class="season-movement-card ${type}"><h4><i>${icon}</i>${title}</h4><div class="season-movement-list">${items}</div></article>`;
  };

  const rewardsCard = ({ total, lines, budgetAfter, formatBudget }) => {
    if (!total) {
      return '<div class="season-rewards"><div class="season-rewards-total"><span>Premiação</span><strong>—</strong></div><p style="margin:0;color:#9eb6b8;font-size:11px">Nenhuma premiação registrada nesta temporada.</p></div>';
    }
    return `<div class="season-rewards">
      <div class="season-rewards-total"><span>Total creditado</span><strong>+ ${formatBudget(total)}</strong></div>
      ${lines.map(line => `<div class="season-reward-line"><span>${line.label}</span><b>+ ${formatBudget(line.amount)}</b></div>`).join('')}
      <div class="season-reward-line" style="margin-top:6px;padding-top:8px;border-top:1px solid #234b55"><span>Orçamento do clube</span><b>${formatBudget(budgetAfter)}</b></div>
    </div>`;
  };

  const open = ({
    userClub,
    careerSeason,
    userLine,
    idleNote = '',
    userStatus = 'neutral',
    champions,
    leadersByDivision,
    movements,
    leadText,
    seasonRewards = null,
    formatBudget = value => `R$ ${value}`,
    seasonGoalResult = null,
    preview = false,
  }) => {
    injectDom();
    previewMode = !!preview;
    if (preview && seasonGoalResult?.status && PREVIEW_GOAL_SAMPLES[seasonGoalResult.status]) {
      previewStatus = seasonGoalResult.status;
    }
    $('#seasonSummaryTitle').textContent = `Balanço da temporada ${careerSeason}`;
    $('#seasonSummaryYear').textContent = careerSeason;
    $('#seasonTransitionLead').textContent =
      leadText || 'Resultados finais das competições e movimentos de acesso/rebaixamento.';
    const summary = $('#seasonTransitionSummary');
    if (summary) {
      summary.className = `season-summary-user ${userStatus}`;
      summary.innerHTML = `<div class="season-summary-user-crest" aria-hidden="true">${clubCrestInitials(userClub)}</div><div class="season-summary-user-copy"><strong>Situação de ${userClub}</strong><span>${userLine}${idleNote}</span></div>`;
    }
    const goalSection = $('#seasonGoalSection');
    const goalEl = $('#seasonGoalResult');
    if (goalSection && goalEl) {
      if (seasonGoalResult?.label) {
        goalSection.classList.remove('hidden');
        const statusLabel = {
          exceeded: 'Superou a meta',
          met: 'Meta cumprida',
          near: 'Quase alcançou',
          missed: 'Meta não cumprida',
        }[seasonGoalResult.status] || 'Avaliação';
        const delta = Number(seasonGoalResult.boardDelta) || 0;
        const deltaText = delta > 0 ? `Diretoria +${delta}` : delta < 0 ? `Diretoria ${delta}` : 'Diretoria sem alteração';
        const status = seasonGoalResult.status || 'met';
        goalEl.className = `season-goal-result goal-${status}`;
        goalEl.innerHTML = `<div class="season-goal-result-copy"><strong>${seasonGoalResult.label}</strong><span>${statusLabel}</span><small>${seasonGoalResult.feeling || ''}</small><em>${deltaText}</em></div>${seasonGoalGauge(status)}`;
      } else {
        goalSection.classList.add('hidden');
        goalEl.innerHTML = '';
      }
    }
    $('#seasonChampions').innerHTML = LEAGUE_ORDER.map(league =>
      championCard(league, champions[league.key])
    ).join('');
    $('#seasonLeaders').innerHTML = LEAGUE_ORDER.map(({ key, label }) => {
      const leaders = leadersByDivision[key] || { scorers: [], assistants: [] };
      return leadersCard(key, label, leaders.scorers, leaders.assistants);
    }).join('');
    const rewardsEl = $('#seasonRewards');
    const rewardsSection = $('#seasonRewardsSection');
    if (rewardsEl && rewardsSection) {
      if (seasonRewards?.total) {
        rewardsSection.classList.remove('hidden');
        rewardsEl.innerHTML = rewardsCard({ ...seasonRewards, formatBudget });
      } else {
        rewardsSection.classList.add('hidden');
        rewardsEl.innerHTML = '';
      }
    }
    $('#seasonMovements').innerHTML = movements
      .map(({ title, clubs, type }) => movementCard(title, clubs, userClub, type))
      .join('');
    syncPreviewChrome();
    $('#seasonTransitionModal').classList.remove('hidden');
  };

  /**
   * Abre o balanço com dados fictícios só para validar o medidor da meta.
   * Não chama callbacks de temporada e não altera save/carreira.
   */
  const openPreview = (status = 'missed') => {
    previewStatus = PREVIEW_GOAL_SAMPLES[status] ? status : 'missed';
    const sample = PREVIEW_GOAL_SAMPLES[previewStatus];
    const emptyLeaders = { scorers: [], assistants: [] };
    open({
      userClub: 'Atlético Preview',
      careerSeason: 2027,
      userLine: 'Permanecerá na Série D em 2028. (dados fictícios do preview)',
      userStatus: 'neutral',
      leadText: 'Preview seguro: use os botões da meta para trocar o status do medidor. Fechar não altera a carreira.',
      champions: { A: 'Clube Alfa', B: 'Clube Beta', C: 'Clube Gama', D: 'Atlético Preview', CUP: 'Clube Copa' },
      leadersByDivision: {
        A: emptyLeaders,
        B: emptyLeaders,
        C: emptyLeaders,
        D: emptyLeaders,
        CUP: emptyLeaders,
      },
      movements: [
        { title: 'Acesso à Série C', clubs: ['Clube Norte', 'Clube Sul'], type: 'promote' },
        { title: 'Permanece na Série D', clubs: ['Atlético Preview'], type: 'relegate' },
      ],
      seasonRewards: null,
      seasonGoalResult: { ...sample },
      preview: true,
    });
  };

  const close = () => {
    if (previewMode) {
      exitPreview();
      return;
    }
    $('#seasonTransitionModal')?.classList.add('hidden');
  };

  const setIdleSimStatus = text => {
    injectDom();
    const el = $('#idleSeasonSimStatus');
    if (el) el.textContent = text;
  };

  const openIdleSim = () => {
    injectDom();
    $('#idleSeasonSimModal')?.classList.remove('hidden');
  };

  const closeIdleSim = () => $('#idleSeasonSimModal')?.classList.add('hidden');

  const init = () => injectDom();

  return {
    moduleVersion: MODULE_VERSIONS.seasonSummary,
    init,
    open,
    openPreview,
    close,
    openIdleSim,
    closeIdleSim,
    setIdleSimStatus,
  };
}
