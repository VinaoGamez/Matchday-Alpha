import { MODULE_VERSIONS } from '../../core/constants.js';
import { onClick } from '../../ui/dom.js';

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

const CSS = `
.season-summary-modal{
  width:min(980px,calc(100vw - 28px));
  max-height:calc(100vh - 40px);
  overflow:auto;
  text-align:left;
  padding:28px 30px 24px!important;
  scrollbar-width:thin;
  scrollbar-color:#397487 #091820;
}
.season-summary-modal>label{
  display:block;
  margin-bottom:4px;
  color:#63d9ff;
  font:700 10px DM Sans;
  letter-spacing:1px;
}
.season-summary-modal h2{
  margin:4px 0 6px;
  font:700 34px Barlow Condensed;
  line-height:1.05;
  color:#f4fcfc;
}
.season-summary-lead{
  margin:0 0 20px;
  color:#9eb6b8;
  font-size:12px;
  line-height:1.5;
}
.season-summary-user{
  display:grid;
  grid-template-columns:auto 1fr;
  gap:14px 16px;
  align-items:center;
  margin:0 0 22px;
  padding:14px 16px;
  border:1px solid #397487;
  border-radius:10px;
  background:linear-gradient(135deg,#0d2732,#0b1d25);
  box-shadow:inset 0 0 0 1px #63d9ff22;
}
.season-summary-user.promoted{
  border-color:#58e6a8;
  box-shadow:inset 0 0 0 1px #b6ff3844,0 0 24px #58e6a822;
}
.season-summary-user.relegated{
  border-color:#ff6370;
  box-shadow:inset 0 0 0 1px #ff637044,0 0 24px #ff637022;
}
.season-summary-user-crest{
  display:grid;
  place-items:center;
  width:52px;
  height:52px;
  border-radius:50%;
  background:linear-gradient(135deg,#b6ff38,#63d9ff);
  color:#06131b;
  font:800 16px Barlow Condensed;
  box-shadow:0 4px 16px #0006;
}
.season-summary-user-copy strong{
  display:block;
  margin-bottom:4px;
  color:#b6ff38;
  font:700 17px Barlow Condensed;
}
.season-summary-user-copy span{
  display:block;
  color:#cfe3e6;
  font-size:11px;
  line-height:1.45;
}
.season-summary-section{
  margin:0 0 22px;
}
.season-summary-section>header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom:12px;
}
.season-summary-section>header h3{
  margin:0;
  color:#edf8f5;
  font:700 20px Barlow Condensed;
  letter-spacing:.2px;
}
.season-summary-section>header small{
  color:#9eb6b8;
  font:700 9px DM Sans;
  letter-spacing:.45px;
}
.season-champions-grid{
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:10px;
}
.season-champion-card{
  position:relative;
  display:grid;
  gap:8px;
  justify-items:center;
  padding:18px 10px 14px;
  border:1px solid #28505b;
  border-radius:10px;
  background:linear-gradient(180deg,#0f222b,#0b1a22);
  text-align:center;
  transition:border-color .15s ease,transform .15s ease,box-shadow .15s ease;
  overflow:hidden;
}
.season-champion-card:before{
  content:'';
  position:absolute;
  inset:0 0 auto;
  height:3px;
  background:linear-gradient(90deg,transparent,var(--champion-accent,#63d9ff),transparent);
  opacity:.85;
}
.season-champion-card:hover{
  border-color:var(--champion-accent,#63d9ff);
  transform:translateY(-2px);
  box-shadow:0 10px 28px #0006,0 0 0 1px #63d9ff33;
}
.season-champion-card.cup{
  background:linear-gradient(180deg,#15280f,#0f1f12);
  border-color:#3d6620;
}
.season-champion-card.cup:before{background:linear-gradient(90deg,transparent,#b6ff38,transparent)}
.season-champion-card.cup:hover{border-color:#b6ff38;box-shadow:0 10px 28px #0006,0 0 24px #b6ff3822}
.season-champion-trophy{
  display:grid;
  place-items:center;
  width:100%;
  min-height:44px;
  margin-top:2px;
  filter:drop-shadow(0 4px 10px #0008);
}
.season-champion-trophy .season-trophy-icon{
  display:block;
  animation:seasonTrophyFloat 3s ease-in-out infinite;
}
.season-champion-card.cup .season-champion-trophy .season-trophy-icon{
  animation-duration:2.6s;
}
@keyframes seasonTrophyFloat{
  0%,100%{transform:translateY(0)}
  50%{transform:translateY(-3px)}
}
.season-champion-badge{
  display:inline-flex;
  align-items:center;
  gap:5px;
  padding:4px 8px;
  border-radius:99px;
  background:#102833;
  color:var(--champion-accent,#63d9ff);
  font:700 8px DM Sans;
  letter-spacing:.55px;
  text-transform:uppercase;
}
.season-champion-card.cup .season-champion-badge{
  background:#1a3010;
  color:#b6ff38;
}
.season-champion-hero{
  position:relative;
  display:grid;
  place-items:center;
  width:100%;
  padding:4px 0 2px;
}
.season-champion-hero:after{
  content:'';
  position:absolute;
  bottom:2px;
  width:68%;
  height:10px;
  border-radius:50%;
  background:radial-gradient(ellipse,#0008 0%,transparent 72%);
  pointer-events:none;
}
.season-champion-crest{
  position:relative;
  z-index:1;
  display:grid;
  place-items:center;
  width:56px;
  height:56px;
  border-radius:50%;
  border:2px solid #ffffff22;
  background:linear-gradient(145deg,#173544,#102833);
  color:#f4fcfc;
  font:800 18px Barlow Condensed;
  box-shadow:0 8px 20px #0005,inset 0 0 0 1px #63d9ff33;
}
.season-champion-card.cup .season-champion-crest{
  background:linear-gradient(145deg,#2a4518,#1a3010);
  box-shadow:0 8px 20px #0005,inset 0 0 0 1px #b6ff3844;
}
.season-champion-name{
  margin:0;
  color:#edf8f5;
  font:700 13px Barlow Condensed;
  line-height:1.25;
  word-break:break-word;
}
.season-champion-title{
  margin:0;
  color:#9eb6b8;
  font:700 8px DM Sans;
  letter-spacing:.45px;
  text-transform:uppercase;
}
.season-leaders-grid{
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:10px;
}
.season-leaders-card{
  display:grid;
  gap:0;
  border:1px solid #28505b;
  border-radius:10px;
  overflow:hidden;
  background:#0b1a22;
}
.season-leaders-card-head{
  padding:9px 10px;
  background:#123843;
  color:#63d9ff;
  font:700 12px Barlow Condensed;
  letter-spacing:.3px;
  text-align:center;
}
.season-leaders-card.cup .season-leaders-card-head{
  background:#1a3010;
  color:#b6ff38;
}
.season-leader-row{
  display:grid;
  grid-template-columns:34px minmax(0,1fr);
  gap:8px 10px;
  align-items:start;
  padding:10px 11px;
  border-top:1px solid #234b55;
}
.season-leader-row:first-of-type{border-top:0}
.season-leader-icon{
  display:grid;
  place-items:center;
  width:34px;
  height:34px;
  border-radius:50%;
  background:#0d2029;
  box-shadow:inset 0 0 0 1px #28505b;
}
.season-leader-icon .season-stat-icon{
  display:block;
}
.season-leader-row.scorer .season-leader-icon{
  background:linear-gradient(145deg,#2a220d,#1a1508);
  box-shadow:inset 0 0 0 1px #ffc94f55,0 0 12px #ffc94f18;
}
.season-leader-row.assist .season-leader-icon{
  background:linear-gradient(145deg,#0d2732,#0a1c24);
  box-shadow:inset 0 0 0 1px #63d9ff55,0 0 12px #63d9ff18;
}
.season-leader-copy{
  display:grid;
  gap:2px;
  min-width:0;
}
.season-leader-label{
  color:#9eb6b8;
  font:700 8px DM Sans;
  letter-spacing:.45px;
  text-transform:uppercase;
}
.season-leader-player{
  color:#edf8f5;
  font:700 12px Barlow Condensed;
  line-height:1.25;
}
.season-leader-meta{
  color:#9eb6b8;
  font-size:10px;
  line-height:1.35;
}
.season-leader-stat{
  display:inline-flex;
  align-items:center;
  gap:4px;
  margin-top:2px;
  padding:2px 7px;
  border-radius:99px;
  background:#102833;
  color:#b6ff38;
  font:700 10px DM Sans;
}
.season-leader-row.scorer .season-leader-stat{
  background:#2a220d;
  color:#ffc94f;
  border:1px solid #ffc94f44;
}
.season-leader-row.assist .season-leader-stat{
  background:#0d2732;
  color:#63d9ff;
  border:1px solid #63d9ff44;
}
.season-leader-meta em{
  color:inherit;
  font-style:normal;
  font-weight:700;
}
.season-movements-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:10px;
}
.season-movement-card{
  border:1px solid #28505b;
  border-radius:10px;
  overflow:hidden;
  background:#0b1a22;
}
.season-movement-card h4{
  display:flex;
  align-items:center;
  gap:8px;
  margin:0;
  padding:10px 12px;
  background:#123843;
  color:#b6ff38;
  font:700 15px Barlow Condensed;
}
.season-movement-card h4 i{
  display:grid;
  place-items:center;
  width:20px;
  height:20px;
  border-radius:50%;
  background:#0b1d25;
  color:#63d9ff;
  font:900 11px DM Sans;
  font-style:normal;
}
.season-movement-card.promote h4{color:#b6ff38}
.season-movement-card.relegate h4{color:#ff9f6b}
.season-movement-card.promote h4 i{color:#b6ff38}
.season-movement-card.relegate h4 i{color:#ff6370}
.season-movement-list{
  display:grid;
}
.season-movement-item{
  display:grid;
  grid-template-columns:24px minmax(0,1fr);
  gap:8px;
  align-items:center;
  padding:7px 11px;
  border-top:1px solid #234b55;
  font-size:10px;
}
.season-movement-item.user{
  background:#203b26;
  color:#dcffa9;
  box-shadow:inset 3px 0 #b6ff38;
}
.season-movement-item small{
  color:#63d9ff;
  font-weight:700;
}
.season-movement-item b{
  font-weight:700;
  line-height:1.25;
}
.season-summary-actions{
  display:flex;
  justify-content:flex-end;
  margin-top:8px;
  padding-top:18px;
  border-top:1px solid #28505b;
}
.season-summary-actions button{
  min-width:240px;
  background:linear-gradient(115deg,#b6ff38,#72e1ff)!important;
  color:#06131b!important;
  border:0!important;
  font-weight:800!important;
  letter-spacing:.35px!important;
}
.idle-sim-modal{
  width:min(420px,calc(100vw - 28px));
  text-align:center;
}
.idle-sim-modal h2{
  margin:8px 0 6px;
  font:700 28px Barlow Condensed;
}
.idle-sim-modal p{
  margin:0;
  color:#9eb6b8;
  font-size:12px;
  line-height:1.45;
}
.idle-sim-modal strong{
  display:block;
  margin-top:14px;
  color:#63d9ff;
  font:700 13px DM Sans;
}
@media(max-width:860px){
  .season-champions-grid,.season-leaders-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:560px){
  .season-summary-modal{padding:22px 18px 18px!important}
  .season-champions-grid,.season-leaders-grid,.season-movements-grid{grid-template-columns:1fr}
  .season-summary-user{grid-template-columns:1fr;text-align:center;justify-items:center}
  .season-summary-actions button{width:100%;min-width:0}
}
`;

const MODAL_HTML = `
<div id="seasonTransitionModal" class="modal hidden">
  <div class="modal-card season-summary-modal">
    <label>TEMPORADA CONCLUÍDA</label>
    <h2 id="seasonSummaryTitle">Balanço da temporada</h2>
    <p id="seasonTransitionLead" class="season-summary-lead">Resultados finais das competições nacionais.</p>
    <div id="seasonTransitionSummary" class="season-summary-user"></div>
    <section class="season-summary-section">
      <header><h3>Campeões</h3><small>Títulos conquistados em <span id="seasonSummaryYear"></span></small></header>
      <div id="seasonChampions" class="season-champions-grid"></div>
    </section>
    <section class="season-summary-section">
      <header><h3>Líderes de estatística</h3><small>Artilheiro e assistências por competição</small></header>
      <div id="seasonLeaders" class="season-leaders-grid"></div>
    </section>
    <section class="season-summary-section">
      <header><h3>Acessos e rebaixamentos</h3><small>Movimentos para a próxima temporada</small></header>
      <div id="seasonMovements" class="season-movements-grid"></div>
    </section>
    <div class="season-summary-actions">
      <button id="startNextSeason" type="button">INICIAR PRÓXIMA TEMPORADA →</button>
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
export function createSeasonSummaryFeature(deps) {
  const { $, clubCrestInitials, onStartNextSeason } = deps;

  const injectDom = () => {
    if ($('#seasonTransitionModal')) return;
    document.body.insertAdjacentHTML('beforeend', MODAL_HTML);
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    onClick('#startNextSeason', () => onStartNextSeason?.());
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
  }) => {
    injectDom();
    $('#seasonSummaryTitle').textContent = `Balanço da temporada ${careerSeason}`;
    $('#seasonSummaryYear').textContent = careerSeason;
    $('#seasonTransitionLead').textContent =
      leadText || 'Resultados finais das competições e movimentos de acesso/rebaixamento.';
    const summary = $('#seasonTransitionSummary');
    if (summary) {
      summary.className = `season-summary-user ${userStatus}`;
      summary.innerHTML = `<div class="season-summary-user-crest" aria-hidden="true">${clubCrestInitials(userClub)}</div><div class="season-summary-user-copy"><strong>Situação de ${userClub}</strong><span>${userLine}${idleNote}</span></div>`;
    }
    $('#seasonChampions').innerHTML = LEAGUE_ORDER.map(league =>
      championCard(league, champions[league.key])
    ).join('');
    $('#seasonLeaders').innerHTML = LEAGUE_ORDER.map(({ key, label }) => {
      const leaders = leadersByDivision[key] || { scorers: [], assistants: [] };
      return leadersCard(key, label, leaders.scorers, leaders.assistants);
    }).join('');
    $('#seasonMovements').innerHTML = movements
      .map(({ title, clubs, type }) => movementCard(title, clubs, userClub, type))
      .join('');
    $('#seasonTransitionModal').classList.remove('hidden');
  };

  const close = () => $('#seasonTransitionModal')?.classList.add('hidden');

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
    close,
    openIdleSim,
    closeIdleSim,
    setIdleSimStatus,
  };
}
