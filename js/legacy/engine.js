import { $, $$, on, onClick, redirectGame, clamp, cleanCareerText } from '../ui/dom.js';
import { createRouter } from '../ui/router.js';
import { createMessagesFeature } from '../feature/messages/index.js';
import { SAVE_KEYS } from '../core/constants.js';
import {
  loadCareerSave,
  loadSeasonSave,
  isSeasonValidForCareer,
  hydrateMessages,
  clearSeasonSave,
  writeJson,
} from '../core/save.js';
import { createInjuryEngine } from '../engine/injury.js';
import {
  ENGINE_TUNING,
  engineFoulRisk,
  engineProgressiveFoulRisk as engineProgressiveFoulRiskBase,
  engineBlowoutDamp,
  matchDifficultyForClub,
  createSimLineupBuilder,
} from '../engine/match-tuning.js';
import { FORMATION_PERFORMANCE, COMPATIBLE_ROLES, roundTactic } from '../engine/match-core.js';
import { createRoundMatchSimulator } from '../engine/match-sim.js';
import { createLiveMatchActions } from '../engine/match-live.js';
import {
  KNOCKOUT_COMPETITIONS,
  isKnockoutShootoutCompetition,
  knockoutCompetitionLabel,
  resolveKnockoutTieWinner,
  projectedKnockoutNeedsShootout,
} from '../engine/knockout-shootout.js';

/** Motor legado — migração incremental para módulos (Alpha 02). */
export async function bootEngine({ bus } = {}) {
  try {
  const savedNewGame = loadCareerSave();
  const savedSeason = loadSeasonSave();
  const validSavedSeason = isSeasonValidForCareer(savedNewGame, savedSeason);
  const careerProfile={
    clubName:cleanCareerText(savedNewGame?.clubName,'Atlético Fênix'),
    managerName:cleanCareerText(savedNewGame?.managerName,'Mister'),
    division:['A','B','C','D'].includes(savedNewGame?.division)?savedNewGame.division:'A'
  };
  const userClub=careerProfile.clubName;
  const userDivision=careerProfile.division;
  const DEFAULT_CAREER_SEASON=2026;
  const careerSeason=Number(savedNewGame?.season)||DEFAULT_CAREER_SEASON;
  let seededState=(savedNewGame?.seed||0)>>>0;
  const gameRandom=()=>{if(!savedNewGame)return Math.random();seededState+=0x6D2B79F5;let value=seededState;value=Math.imul(value^value>>>15,value|1);value^=value+Math.imul(value^value>>>7,value|61);return((value^value>>>14)>>>0)/4294967296;};
  const rnd = (min, max) => min + gameRandom() * (max - min);
  const int = (min, max) => Math.floor(rnd(min, max + 1));
  let currentRound;
  const injuryEngine = createInjuryEngine({
    rnd,
    int,
    gameRandom,
    getCurrentRound: () => currentRound,
    getCareerSeason: () => careerSeason,
  });
  const {
    injuryCatalog,
    clubMedicalQuality,
    pitchInjuryModifier,
    pitchLabel,
    preventionWorkloadEase,
    effectiveWorkloadRisk,
    medicalDepartmentLabel,
    medicalRecoveryModifier,
    medicalPreventionModifier,
    medicalDiagnosisModifier,
    medicalRehabSupport,
    resolveInjuryTreatment,
    treatmentLabel,
    injuryAllowsTreatmentChoice,
    normalizeInjury,
    injuryInAcutePhase,
    injuryInRestrictedPhase,
    playerInRestrictedReturn,
    playerRehabMaxMinutes,
    injuryStatModifier,
    matchPlayerStat,
    rehabMinuteOverload,
    recurrenceReturnModifier,
    fatigueExhaustionRisk,
    ageInjuryRisk,
    pronenessInjuryRisk,
    previousInjuryModifier,
    tacticalInjuryRisk,
    defaultWorkload,
    ensureWorkload,
    workloadRisk,
    recoveryRisk,
    tacticalMechanismRisk,
    matchIntensityFactor,
    decayPlayerWorkload,
    refreshWorkloadWindows,
    recordPlayerMatchWorkload,
    workloadLabel,
    injuryEventTypeFromPhase,
    injuryMechanismFromEvent,
    eventInjuryBaseRisk,
    calculateEventInjuryChance,
    pickInjuryVictim,
    selectInjuryMechanism,
    selectInjuryCategory,
    selectInjuryType,
    determineInjuryGrade,
    calculateRecoveryTime,
    buildInjuryRecord,
    classifyIncidentTier,
    discomfortMatchComment,
    resolvePhysicalIncident,
    createInjuryRecord,
    injuryAvailabilityLabel,
    injuryMatchComment,
    injuryDiagnosisComment,
    buildDeferredInjuryEntry,
    calculatePlayThroughSubChance,
    resolvePostMatchDiagnosis,
    injuryPostMatchReport,
    finalizeInjuryRecovery,
    beginRestrictedReturn,
    advanceRestrictedRehab,
    clearInjuryFully,
    YELLOW_SUSPENSION_LIMIT,
    playerUnavailable,
    playerStarterBlocked,
    injurySeverityLabel,
  } = injuryEngine;
  const engineTuning = ENGINE_TUNING;
  let buildSimLineup;
  let substitutionPriority;
  let engineProgressiveFoulRisk;
  let simulateRoundMatch;
  let addPasses;
  let shot;
  let takeFreeKick;
  let penaltyTaker;
  let buildAttack;
  // O ambiente continua representando o momento interno do clube, mas uma
  // carreira nova respeita faixas compatíveis com a estrutura de cada divisão.
  // Durante a carreira esses valores poderão ultrapassar os limites iniciais.
  const initialEnvironmentRanges={A:[58,92],B:[55,88],C:[52,84],D:[50,80]};
  const indicatorTone = value => value > 75 ? 'positive' : value > 40 ? 'medium' : 'negative';
  const setIndicatorTone = (element,value) => { if(!element) return; element.classList.remove('positive','medium','negative'); element.classList.add(indicatorTone(value)); };
  // Indicadores administrativos do dashboard: nesta etapa são apenas informativos.
  $$('[data-dashboard-factor]').forEach(item => { const value=Math.round(rnd(Number(item.dataset.min),Number(item.dataset.max))); item.textContent=`${value}%`; setIndicatorTone(item.parentElement,value); });
  const dashboardEnvironment=$('.dashboard-environment'); if(dashboardEnvironment) setIndicatorTone(dashboardEnvironment,86);

  $('.pause-heading h2').id='pauseHeading';
  document.body.classList.add('dark-mode');
  const gamePaceConfig={fast:{name:'RÁPIDO',detail:'15 s por tempo · 30 s de jogo contínuo',ms:500},standard:{name:'PADRÃO',detail:'25 s por tempo · 50 s de jogo contínuo',ms:750},detailed:{name:'DETALHADO',detail:'35 s por tempo · 70 s de jogo contínuo',ms:1150}};
  let gamePace=localStorage.getItem('futmanager-pace')||'standard';
  let startMatchClock=()=>{};
  const optionsCss=document.createElement('style');optionsCss.textContent='.options-card{display:grid;gap:8px;align-content:start}.options-card strong{font:700 21px Barlow Condensed}.options-card small{line-height:1.35;color:#b6c8ad}.options-card button{justify-self:start;margin-top:4px}.options-modal{width:min(680px,calc(100vw - 28px));text-align:left}.options-modal h2{margin:5px 0 18px;font:700 32px Barlow Condensed}.option-section{padding:14px;border:1px solid #315b68;border-radius:7px;margin-top:12px}.option-section>label{display:block;margin-bottom:10px;color:#63d9ff;font:700 11px DM Sans;letter-spacing:.7px}.option-section p{margin:0 0 10px;color:#9eb6b8;font-size:12px}.option-choices{display:flex;flex-wrap:wrap;gap:8px}.option-choices button{background:#122b35!important;color:#edf8f5!important;border:1px solid #397487!important}.option-choices button.selected{background:#24667c!important;color:#fff!important;border-color:#63d9ff!important}.pace-choice{width:100%;display:grid;grid-template-columns:100px 1fr;text-align:left;gap:5px}.pace-choice small{grid-column:2;color:#9eb6b8;font-size:10px}.new-game-action{display:flex;align-items:center;justify-content:space-between;gap:14px}.new-game-action div{min-width:0}.new-game-action strong{display:block;color:#edf8f5;font:700 19px Barlow Condensed}.new-game-action small{display:block;margin-top:3px;color:#9eb6b8}.new-game-action button{flex:none;background:#b6ff38!important;color:#06131b!important;border:0!important}.new-game-modal{width:min(660px,calc(100vw - 28px));text-align:left}.new-game-modal h2{margin:5px 0 5px;font:700 32px Barlow Condensed}.new-game-modal>p{color:#9eb6b8;font-size:12px}.division-preview{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:16px 0}.division-preview article{padding:12px;background:#102b35;border:1px solid #315b68;border-radius:6px}.division-preview b{display:block;color:#b6ff38}.division-preview small{color:#9eb6b8}.new-game-buttons{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}.new-game-buttons button{padding:11px 16px;font:700 10px DM Sans;letter-spacing:.5px;cursor:pointer;border-radius:6px}.new-game-buttons .secondary{background:#122b35!important;color:#edf8f5!important;border:1px solid #397487!important}.new-game-buttons #confirmNewGame{background:#24667c!important;color:#fff!important;border:1px solid #63d9ff!important;box-shadow:inset 3px 0 #63d9ff!important}.new-game-buttons #confirmNewGame:hover{background:#2d7890!important;border-color:#8ae6ff!important}@media(max-width:560px){.new-game-action{align-items:flex-start;flex-direction:column}.division-preview{grid-template-columns:1fr}}';document.head.append(optionsCss);
  optionsCss.textContent+='.generated-world-summary{display:grid;gap:5px;margin-top:12px;padding-top:11px;border-top:1px solid #28505b}.generated-world-summary>small{color:#63d9ff;font:700 8px DM Sans;letter-spacing:.65px}.generated-world-summary span{display:grid;grid-template-columns:62px 1fr;color:#9eb6b8;font-size:10px}.generated-world-summary b{color:#edf8f5}.career-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.career-field{display:grid;gap:6px}.career-field label,.division-choice>label{color:#63d9ff;font:700 10px DM Sans;letter-spacing:.7px}.career-field input{width:100%;box-sizing:border-box;padding:12px;background:#0b2029;color:#edf8f5;border:1px solid #315b68;border-radius:5px;outline:0}.career-field input:focus{border-color:#63d9ff;box-shadow:0 0 0 2px #63d9ff22}.division-choice{margin-bottom:16px}.division-choice-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}.division-card{display:grid;gap:3px;padding:11px!important;background:#102b35!important;color:#edf8f5!important;border:1px solid #315b68!important;text-align:left}.division-card b{color:#b6ff38;font:700 18px Barlow Condensed}.division-card small{color:#9eb6b8;font-size:9px}.division-card.selected{border-color:#63d9ff!important;background:#173b48!important;box-shadow:0 0 0 1px #63d9ff}.new-game-error{min-height:16px;margin:0 0 8px!important;color:#ff6b6b!important;font-weight:700}.career-current{color:#b6ff38!important}.treatment-modal{width:min(520px,calc(100vw - 28px));text-align:left}.treatment-injury-name{color:#63d9ff;font-weight:700}.treatment-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}.treatment-actions button{padding:10px 14px;border-radius:5px;font:700 10px DM Sans;letter-spacing:.5px}.treatment-actions #treatmentConservative{background:#122b35!important;color:#edf8f5!important;border:1px solid #397487!important}.treatment-actions #treatmentSurgery{background:#24667c!important;color:#fff!important;border:1px solid #63d9ff!important}@media(max-width:560px){.career-fields{grid-template-columns:1fr}.division-choice-grid{grid-template-columns:repeat(2,1fr)}}';
  document.body.insertAdjacentHTML('beforeend',`<div id="optionsModal" class="modal hidden"><div class="modal-card options-modal"><button id="closeOptions" class="close">×</button><label>CONFIGURAÇÕES</label><h2>Opções do Jogo</h2><section class="option-section"><label>NOVA CARREIRA</label><div class="new-game-action"><div><strong>Criar clube e iniciar carreira</strong><small>Escolha seu clube, treinador e divisão. O universo nacional será gerado novamente.</small></div><button id="openNewGame" type="button">NOVO JOGO</button></div></section><section class="option-section"><label>RITMO DE JOGO</label><p>Define a duração da simulação contínua. Pausas técnicas e decisões do treinador continuam sob seu controle.</p><div id="paceChoices" class="option-choices">${Object.entries(gamePaceConfig).map(([key,pace])=>`<button class="pace-choice" data-pace="${key}"><b>${pace.name}</b><small>${pace.detail}</small></button>`).join('')}</div></section></div></div><div id="newGameModal" class="modal hidden"><div class="modal-card new-game-modal"><button id="closeNewGame" class="close">×</button><label>NOVA CARREIRA</label><h2>Crie sua história</h2><p>Defina a identidade do seu clube e a divisão em que a carreira começará.</p><div class="career-fields"><div class="career-field"><label for="careerClubName">NOME DO TIME</label><input id="careerClubName" maxlength="32" autocomplete="off" placeholder="Ex.: Atlético Fênix"></div><div class="career-field"><label for="careerManagerName">NOME DO TREINADOR</label><input id="careerManagerName" maxlength="40" autocomplete="off" placeholder="Ex.: Ricardo Almeida"></div></div><div class="division-choice"><label>DIVISÃO INICIAL</label><div class="division-choice-grid"><button class="division-card selected" data-career-division="A"><b>SÉRIE A</b><small>20 clubes · elite nacional</small></button><button class="division-card" data-career-division="B"><b>SÉRIE B</b><small>20 clubes · luta pelo acesso</small></button><button class="division-card" data-career-division="C"><b>SÉRIE C</b><small>20 clubes · primeira fase nacional</small></button><button class="division-card" data-career-division="D"><b>SÉRIE D</b><small>96 clubes · fase regional</small></button></div></div><p id="newGameError" class="new-game-error"></p><div class="new-game-buttons"><button id="cancelNewGame" type="button" class="secondary">CANCELAR</button><button id="confirmNewGame" type="button">CRIAR CARREIRA</button></div></div></div>`);
  const initialAccessCss=document.createElement('style');initialAccessCss.textContent='.career-welcome{position:fixed;inset:0;z-index:30;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 50% 42%,#113744 0,#071820 34%,#030a0f 72%);color:#edf8f5}.career-welcome:before,.career-welcome:after{content:"";position:absolute;pointer-events:none}.career-welcome:before{inset:0;background:repeating-linear-gradient(135deg,transparent 0 58px,#63d9ff08 59px 60px)}.career-welcome:after{width:min(620px,82vw);aspect-ratio:1;border:1px solid #63d9ff13;border-radius:50%;box-shadow:0 0 0 90px #63d9ff08,0 0 0 180px #63d9ff05}.career-welcome-content{position:relative;z-index:1;display:grid;justify-items:center;gap:34px}.career-welcome-brand{display:flex;align-items:center;gap:13px}.career-welcome-mark{display:grid;place-items:center;width:54px;height:54px;clip-path:polygon(50% 0,95% 22%,95% 76%,50% 100%,5% 76%,5% 22%);background:linear-gradient(135deg,#b6ff38,#63d9ff);color:#06131b;font:900 22px Barlow Condensed;box-shadow:0 0 25px #63d9ff42}.career-welcome-title{display:grid;line-height:.82}.career-welcome-title b{color:#f5fffc;font:900 34px Barlow Condensed;letter-spacing:.7px}.career-welcome-title small{color:#63d9ff;font:800 11px DM Sans;letter-spacing:4px}.career-welcome button{min-width:190px;padding:14px 24px;border:1px solid #63d9ff;border-radius:6px;background:#12313d;color:#f4fffc;font:800 11px DM Sans;letter-spacing:.9px;cursor:pointer;box-shadow:0 10px 28px #0007;transition:transform .18s,background .18s,border-color .18s}.career-welcome button:hover{transform:translateY(-2px);background:#1b4858;border-color:#b6ff38}.career-locked #newGameModal{z-index:40}.career-locked{overflow:hidden!important}@media(max-width:520px){.career-welcome-content{gap:28px}.career-welcome-mark{width:46px;height:46px}.career-welcome-title b{font-size:29px}.career-welcome button{min-width:170px}}';document.head.append(initialAccessCss);
  if(!savedNewGame){
    document.body.classList.add('career-locked');
    $('.game-shell').inert=true;$('.game-shell').setAttribute('aria-hidden','true');
    document.body.insertAdjacentHTML('beforeend','<section id="careerWelcome" class="career-welcome"><div class="career-welcome-content"><div class="career-welcome-brand"><span class="career-welcome-mark">MF</span><span class="career-welcome-title"><b>MATCHDAY</b><small>FOOTBALL</small></span></div><button id="welcomeNewGame" type="button">NOVO JOGO</button></div></section>');
  }
  const renderOptions=()=>$$('#paceChoices button').forEach(button=>button.classList.toggle('selected',button.dataset.pace===gamePace));
  onClick('#openOptions',()=>{renderOptions();$('#optionsModal').classList.remove('hidden');});
  onClick('#closeOptions',()=>$('#optionsModal').classList.add('hidden'));
  let selectedCareerDivision='A';
  const selectCareerDivision=division=>{selectedCareerDivision=division;$$('[data-career-division]').forEach(button=>button.classList.toggle('selected',button.dataset.careerDivision===division));};
  const openCareerCreator=()=>{$('#careerClubName').value=savedNewGame?.clubName||'';$('#careerManagerName').value=savedNewGame?.managerName||'';$('#newGameError').textContent='';selectCareerDivision(savedNewGame?.division||'A');$('#optionsModal').classList.add('hidden');$('#newGameModal').classList.remove('hidden');setTimeout(()=>$('#careerClubName')?.focus(),0);};
  const closeCareerCreator=()=>{$('#newGameModal').classList.add('hidden');if(!localStorage.getItem('matchday-new-game')&&new URLSearchParams(location.search).has('novo'))location.replace('home.html');};
  onClick('#openNewGame',openCareerCreator);
  onClick('#welcomeNewGame',openCareerCreator);
  if(new URLSearchParams(location.search).has('novo')){
    $('#careerWelcome')?.remove();
    document.body.classList.remove('career-locked');
    const shell=$('.game-shell');
    if(shell){shell.inert=false;shell.removeAttribute('aria-hidden');}
    setTimeout(openCareerCreator,0);
  }
  onClick('#closeNewGame',closeCareerCreator);
  onClick('#cancelNewGame',closeCareerCreator);
  onClick('.division-choice-grid',event=>{const button=event.target.closest('[data-career-division]');if(button)selectCareerDivision(button.dataset.careerDivision);});
  onClick('#confirmNewGame',()=>{
    const clubName=cleanCareerText($('#careerClubName').value,''),managerName=cleanCareerText($('#careerManagerName').value,''),error=$('#newGameError');
    if(clubName.length<3){error.textContent='Informe um nome de time com pelo menos 3 caracteres.';$('#careerClubName').focus();return;}
    if(managerName.length<3){error.textContent='Informe o nome do treinador com pelo menos 3 caracteres.';$('#careerManagerName').focus();return;}
    const seed=(Date.now()^Math.floor(Math.random()*0xffffffff))>>>0,status=(min,max)=>Math.floor(Math.random()*(max-min+1))+min,environmentRange=initialEnvironmentRanges[selectedCareerDivision];
    const clubStatus={environment:status(...environmentRange),support:status(55,88),board:status(55,88),finances:status(55,88)};
    writeJson(SAVE_KEYS.career,{seed,clubName,managerName,division:selectedCareerDivision,clubStatus,season:DEFAULT_CAREER_SEASON,createdAt:new Date().toISOString(),version:4});
    clearSeasonSave();
    $('#newGameModal').classList.add('hidden');$('#optionsModal').classList.add('hidden');
    redirectGame();
  });
  onClick('#paceChoices',event=>{const button=event.target.closest('button');if(!button)return;gamePace=button.dataset.pace;localStorage.setItem('futmanager-pace',gamePace);renderOptions();if(matchStarted&&!matchFinished&&$('#pausePanel').classList.contains('hidden')&&$('#penaltyChoice').classList.contains('hidden')&&!shootoutState)startMatchClock();});
  const clubInitials=userClub.split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase();
  const managerFirstName=careerProfile.managerName.split(/\s+/)[0].toUpperCase();
  $('.season').textContent=`TEMPORADA ${careerSeason}`;$('.club>b').textContent=clubInitials;$('.club strong').textContent=userClub;$('.club small').textContent=`Série ${userDivision} · ${careerSeason}`;
  $('.hero p').textContent=`BOA TARDE, ${managerFirstName}`;$('.hero>div>span').textContent=`Prepare o ${userClub} para mais uma rodada.`;$('.hero .crest').textContent=clubInitials;
  $('#championshipPageKicker').textContent=`CAMPEONATO BRASILEIRO · SÉRIE ${userDivision}`;
  $('#calendar .title p').textContent=`BRASILEIRÃO SÉRIE ${userDivision} · TEMPORADA ${careerSeason}`;
  $('#penaltyChoice>label').textContent=`PÊNALTI PARA O ${userClub.toUpperCase()}`;
  $('#openChampionship').firstChild.nodeValue=`BRASILEIRÃO SÉRIE ${userDivision} `;

  // Atributos completos: os 11 primeiros compõem o time titular.
  const squad = [
    {name:'R. Almeida',pos:'GOL',age:31,overall:78,dribble:24,speed:54,marking:18,tackling:16,finishing:15,passing:65,heading:42,positioning:86,penaltySaving:79,reflexes:84,freeKick:8,penaltyTaking:14,playmaking:18,fatigue:13},
    {name:'Caio Mendes',pos:'ZAG',age:27,overall:76,dribble:46,speed:70,marking:82,tackling:83,finishing:42,passing:64,heading:82,positioning:0,penaltySaving:0,reflexes:0,freeKick:12,penaltyTaking:34,playmaking:30,fatigue:11},
    {name:'L. Valente',pos:'ZAG',age:29,overall:75,dribble:41,speed:67,marking:80,tackling:80,finishing:39,passing:61,heading:80,positioning:0,penaltySaving:0,reflexes:0,freeKick:9,penaltyTaking:30,playmaking:29,fatigue:14},
    {name:'Pedro Lima',pos:'LAT',age:24,overall:77,dribble:71,speed:82,marking:73,tackling:75,finishing:61,passing:72,heading:58,positioning:0,penaltySaving:0,reflexes:0,freeKick:28,penaltyTaking:48,playmaking:58,fatigue:8},
    {name:'Matheus Reis',pos:'LAT',age:26,overall:74,dribble:66,speed:77,marking:71,tackling:73,finishing:57,passing:68,heading:61,positioning:0,penaltySaving:0,reflexes:0,freeKick:24,penaltyTaking:45,playmaking:55,fatigue:10},
    {name:'Bruno Serra',pos:'VOL',age:28,overall:80,dribble:65,speed:70,marking:82,tackling:84,finishing:64,passing:79,heading:71,positioning:0,penaltySaving:0,reflexes:0,freeKick:35,penaltyTaking:57,playmaking:72,fatigue:12},
    {name:'Thiago Nunes',pos:'MC',age:25,overall:79,dribble:77,speed:75,marking:61,tackling:58,finishing:72,passing:84,heading:55,positioning:0,penaltySaving:0,reflexes:0,freeKick:89,penaltyTaking:74,playmaking:89,fatigue:9},
    {name:'Davi Castro',pos:'MC',age:23,overall:76,dribble:76,speed:78,marking:60,tackling:57,finishing:70,passing:78,heading:52,positioning:0,penaltySaving:0,reflexes:0,freeKick:31,penaltyTaking:68,playmaking:77,fatigue:7},
    {name:'Enzo Rocha',pos:'PE',age:22,overall:81,dribble:88,speed:87,marking:42,tackling:37,finishing:84,passing:75,heading:60,positioning:0,penaltySaving:0,reflexes:0,freeKick:40,penaltyTaking:71,playmaking:82,fatigue:7},
    {name:'G. Azevedo',pos:'ATA',age:27,overall:82,dribble:80,speed:84,marking:35,tackling:32,finishing:90,passing:70,heading:78,positioning:0,penaltySaving:0,reflexes:0,freeKick:26,penaltyTaking:89,playmaking:57,fatigue:11},
    {name:'Rafael Silva',pos:'PD',age:24,overall:78,dribble:82,speed:85,marking:41,tackling:39,finishing:79,passing:73,heading:57,positioning:0,penaltySaving:0,reflexes:0,freeKick:37,penaltyTaking:69,playmaking:74,fatigue:8},
    {name:'Hugo Pires',pos:'GOL',age:21,overall:70,dribble:19,speed:49,marking:16,tackling:14,finishing:12,passing:56,heading:39,positioning:77,penaltySaving:70,reflexes:75,freeKick:6,penaltyTaking:10,playmaking:15,fatigue:6},
    {name:'Igor Ramos',pos:'ZAG',age:20,overall:69,dribble:43,speed:72,marking:73,tackling:71,finishing:36,passing:60,heading:76,positioning:0,penaltySaving:0,reflexes:0,freeKick:11,penaltyTaking:28,playmaking:26,fatigue:6},
    {name:'Samuel Costa',pos:'LAT',age:19,overall:68,dribble:67,speed:80,marking:65,tackling:67,finishing:54,passing:66,heading:52,positioning:0,penaltySaving:0,reflexes:0,freeKick:22,penaltyTaking:43,playmaking:53,fatigue:5},
    {name:'Vitor Maia',pos:'VOL',age:30,overall:73,dribble:58,speed:63,marking:78,tackling:80,finishing:58,passing:73,heading:70,positioning:0,penaltySaving:0,reflexes:0,freeKick:18,penaltyTaking:51,playmaking:66,fatigue:16},
    {name:'Lucas Freitas',pos:'MC',age:26,overall:74,dribble:72,speed:74,marking:54,tackling:53,finishing:68,passing:77,heading:48,positioning:0,penaltySaving:0,reflexes:0,freeKick:29,penaltyTaking:64,playmaking:75,fatigue:10},
    {name:'Natan Alves',pos:'ATA',age:21,overall:72,dribble:73,speed:82,marking:28,tackling:25,finishing:78,passing:63,heading:69,positioning:0,penaltySaving:0,reflexes:0,freeKick:17,penaltyTaking:72,playmaking:51,fatigue:6}
  ];
  squad.forEach((player,index)=>player.number=index+1);
  const teams = ['Palmeiras','Flamengo','Grêmio',userClub,'Cruzeiro','Bahia','São Paulo','Internacional','Estrela do Cerrado','Botafogo','Corinthians','Vasco','Santos','Fluminense','Athletico PR','Bragantino','Fortaleza','Ceará','Goiás','Juventude'];
  const starterRoles=['GOL','LAT','ZAG','ZAG','LAT','VOL','MC','MC','PE','ATA','PD'];
  const benchRoles=['GOL','ZAG','LAT','VOL','MC','MEI','ATA'];
  const firstNames=['Adriano','André','Arthur','Breno','Bruno','Caio','Carlos','Cristian','Daniel','Davi','Diego','Douglas','Eduardo','Enzo','Erick','Fábio','Felipe','Fernando','Gabriel','Guilherme','Gustavo','Heitor','Henrique','Hugo','Igor','Ítalo','João','Kaique','Leandro','Leonardo','Lucas','Luiz','Marcelo','Marcos','Matheus','Miguel','Murilo','Nathan','Nicolas','Otávio','Paulo','Pedro','Rafael','Renan','Rodrigo','Samuel','Thiago','Vitor','Victor','Wesley'];
  const lastNames=['Almeida','Alves','Amaral','Andrade','Araújo','Barbosa','Batista','Cardoso','Carvalho','Castro','Correia','Costa','Cunha','Dias','Duarte','Esteves','Ferreira','Freitas','Garcia','Gomes','Henrique','Leite','Lima','Lopes','Machado','Marques','Martins','Mendes','Monteiro','Moreira','Moura','Nascimento','Neves','Nunes','Oliveira','Pereira','Pires','Ramos','Reis','Ribeiro','Rocha','Rodrigues','Santos','Silva','Soares','Souza','Teixeira','Vieira'];
  const formationsForClubs=['4-3-3','4-4-2','3-5-2','4-2-3-1','4-1-4-1','5-3-2','4-3-1-2','3-4-3'];
  const divisionRules={
    A:{name:'Série A',clubs:20,power:[76,84],format:'38 rodadas em turno e returno',promotion:0,relegation:4},
    B:{name:'Série B',clubs:20,power:[70,78],format:'38 rodadas; 1º e 2º sobem, 3º–6º disputam playoffs',promotion:4,relegation:4},
    C:{name:'Série C',clubs:20,power:[64,73],format:'38 rodadas em turno e returno',promotion:4,relegation:2},
    D:{name:'Série D',clubs:96,power:[56,68],format:'16 grupos de 6; 10 rodadas; 4 avançam por grupo; mata-mata e playoffs em ida e volta',promotion:6,relegation:0}
  };
  const specialistChance={A:{freeKick:.024,penalty:.030},B:{freeKick:.017,penalty:.022},C:{freeKick:.0085,penalty:.0115},D:{freeKick:.003,penalty:.005}};
  const generationFormationRoles={
    '4-3-3':['GOL','LAT','ZAG','ZAG','LAT','VOL','MC','MC','PE','ATA','PD'],'4-4-2':['GOL','LAT','ZAG','ZAG','LAT','PE','MC','MC','PD','ATA','ATA'],
    '3-5-2':['GOL','ZAG','ZAG','ZAG','LAT','VOL','MC','MEI','LAT','ATA','ATA'],'4-2-3-1':['GOL','LAT','ZAG','ZAG','LAT','VOL','VOL','PE','MEI','PD','ATA'],
    '4-1-4-1':['GOL','LAT','ZAG','ZAG','LAT','VOL','PE','MC','MC','PD','ATA'],'5-3-2':['GOL','LAT','ZAG','ZAG','ZAG','LAT','MC','VOL','MC','ATA','ATA'],
    '4-3-1-2':['GOL','LAT','ZAG','ZAG','LAT','VOL','MC','MC','MEI','ATA','ATA'],'3-4-3':['GOL','ZAG','ZAG','ZAG','LAT','MC','MC','LAT','PE','ATA','PD']
  };
  const formationBenchExtras={'4-3-3':['ZAG','LAT','MC','PE','PD'],'4-4-2':['ZAG','LAT','VOL','PE','ATA'],'3-5-2':['ZAG','ZAG','LAT','MC','ATA'],'4-2-3-1':['ZAG','LAT','VOL','MEI','PD'],'4-1-4-1':['ZAG','LAT','MC','PE','ATA'],'5-3-2':['ZAG','LAT','VOL','MC','ATA'],'4-3-1-2':['ZAG','LAT','MC','MEI','ATA'],'3-4-3':['ZAG','LAT','MC','PE','PD']};
  const generatedSquadRoles=formation=>[...(generationFormationRoles[formation]||generationFormationRoles['4-3-3']),'GOL','ZAG','LAT','VOL','MC','MEI','ATA',...(formationBenchExtras[formation]||formationBenchExtras['4-3-3'])];
  const generatedOverall=(role,a)=>{
    const weighted={
      GOL:a.positioning*.29+a.reflexes*.34+a.penaltySaving*.16+a.passing*.08+a.speed*.05+a.heading*.04+a.overallBase*.04,
      ZAG:a.marking*.25+a.tackling*.25+a.heading*.18+a.speed*.10+a.passing*.09+a.dribble*.04+a.overallBase*.09,
      LAT:a.speed*.22+a.marking*.17+a.tackling*.17+a.passing*.14+a.dribble*.13+a.heading*.05+a.finishing*.04+a.overallBase*.08,
      VOL:a.tackling*.20+a.marking*.18+a.passing*.18+a.heading*.11+a.speed*.08+a.dribble*.07+a.finishing*.05+a.overallBase*.13,
      MC:a.passing*.24+a.dribble*.15+a.tackling*.12+a.finishing*.11+a.speed*.10+a.marking*.08+a.heading*.05+a.overallBase*.15,
      MEI:a.passing*.23+a.dribble*.22+a.finishing*.16+a.speed*.12+a.heading*.05+a.marking*.03+a.tackling*.03+a.overallBase*.16,
      PE:a.dribble*.23+a.speed*.22+a.finishing*.20+a.passing*.13+a.heading*.05+a.marking*.03+a.tackling*.02+a.overallBase*.12,
      PD:a.dribble*.23+a.speed*.22+a.finishing*.20+a.passing*.13+a.heading*.05+a.marking*.03+a.tackling*.02+a.overallBase*.12,
      ATA:a.finishing*.29+a.heading*.18+a.speed*.16+a.dribble*.14+a.passing*.07+a.marking*.02+a.tackling*.02+a.overallBase*.12
    };
    return Math.round(weighted[role]??a.overallBase);
  };
  function generatedPlayer(role,index,clubPower,division='A'){
    const limits={A:[64,92],B:[58,86],C:[52,80],D:[45,75]}[division],potentialCaps={A:97,B:92,C:87,D:83},age=int(17,36),ageModifier=age<=19?-4:age<=21?-2:age<=26?1:age<=29?2:age<=32?0:age<=34?-2:-5,overallBase=clamp(int(clubPower-6,clubPower+6)+ageModifier,...limits),attacking=['PE','PD','ATA','MEI','MC'].includes(role),defensive=['ZAG','LAT','VOL'].includes(role),keeper=role==='GOL',value=(base,spread=8)=>clamp(int(base-spread,base+spread),5,99);
    const first=firstNames[(index+int(0,firstNames.length-1))%firstNames.length],last=lastNames[(index*3+int(0,lastNames.length-1))%lastNames.length],secondLast=gameRandom()<.16?` ${lastNames[(index*7+int(0,lastNames.length-1))%lastNames.length]}`:'';
    const attributes={overallBase,dribble:value(attacking?overallBase+3:overallBase-15),speed:value(['LAT','PE','PD','ATA'].includes(role)?overallBase+7:overallBase-2),marking:value(defensive?overallBase+5:overallBase-18),tackling:value(defensive?overallBase+5:overallBase-19),finishing:value(attacking?overallBase+5:overallBase-21),passing:value(['MC','MEI','VOL','LAT'].includes(role)?overallBase+3:overallBase-8),heading:value(['ZAG','ATA','VOL'].includes(role)?overallBase+3:overallBase-9),positioning:keeper?value(overallBase+4):0,penaltySaving:keeper?value(overallBase):0,reflexes:keeper?value(overallBase+5):0};
    const signatureOptions={GOL:['reflexes','positioning','penaltySaving'],ZAG:['marking','tackling','heading'],LAT:['speed','tackling','passing','dribble'],VOL:['tackling','marking','passing'],MC:['passing','dribble','tackling','finishing'],MEI:['passing','dribble','finishing'],PE:['speed','dribble','finishing'],PD:['speed','dribble','finishing'],ATA:['finishing','heading','speed']}[role],signature=signatureOptions[int(0,signatureOptions.length-1)];attributes[signature]=clamp(attributes[signature]+int(4,9),5,99);
    const overall=clamp(generatedOverall(role,attributes),...limits),growth=age<=19?int(9,18):age<=22?int(6,14):age<=25?int(3,9):age<=28?int(1,5):int(0,2),potential=clamp(overall+growth,overall,potentialCaps[division]),attackAverage=(attributes.dribble+attributes.speed+attributes.finishing+attributes.passing+attributes.heading)/5,rolePlaymaking=role==='GOL'||role==='ZAG'?Math.min(40,overall-28):role==='VOL'?overall-4:role==='LAT'||role==='ATA'?overall-10:overall+5,creationMultiplier=1+rnd(.005,.015)*(attackAverage>=75?1:-1),heightRanges={GOL:[184,199],ZAG:[180,196],LAT:[168,187],VOL:[174,191],MC:[168,188],MEI:[165,185],PE:[164,184],PD:[164,184],ATA:[174,194]},height=int(...heightRanges[role]),footDraw=gameRandom(),preferredFoot=footDraw<.055?'Ambidestro':role==='PE'?(footDraw<.62?'Esquerdo':'Direito'):role==='PD'?(footDraw<.18?'Esquerdo':'Direito'):(footDraw<.18?'Esquerdo':'Direito'),personalities=['Disciplinado','Determinado','Equilibrado','Líder','Competitivo','Tranquilo'];
    const p={name:`${first} ${last}${secondLast}`,pos:role,age,overall,potential,height,preferredFoot,personality:personalities[int(0,personalities.length-1)],injuryProneness:clamp(int(5,25)+(age>=31?int(3,10):0),5,38),injuryHistory:[],workload:{minutesLast7Days:0,minutesLast14Days:0,matchesLast14Days:0,consecutiveStarts:0,highIntensityLoad:0,lastMatchRound:0},dribble:attributes.dribble,speed:attributes.speed,marking:attributes.marking,tackling:attributes.tackling,finishing:attributes.finishing,passing:attributes.passing,heading:attributes.heading,positioning:attributes.positioning,penaltySaving:attributes.penaltySaving,reflexes:attributes.reflexes,freeKick:Math.min(85,value(['MC','MEI','PE','PD'].includes(role)?overall-24:overall-38,10)),penaltyTaking:Math.min(85,value(['MC','MEI','PE','PD','ATA'].includes(role)?overall-7:overall-25,10)),playmaking:clamp(Math.round(rolePlaymaking*creationMultiplier),5,role==='GOL'||role==='ZAG'?40:role==='VOL'||role==='LAT'||role==='ATA'?90:100),fatigue:100,number:index+1};
    const chance=specialistChance[division];
    if(['MC','MEI','PE','PD','ATA'].includes(role)&&gameRandom()<chance.freeKick)p.freeKick=int(86,97);
    if(['MC','MEI','PE','PD','ATA'].includes(role)&&gameRandom()<chance.penalty)p.penaltyTaking=int(86,97);
    return p;
  }
  const brazilianCities=['Amazônia','Manaus','Belém','Macapá','Boa Vista','Porto Velho','Rio Branco','Palmas','São Luís','Teresina','Fortaleza','Natal','João Pessoa','Recife','Maceió','Aracaju','Salvador','Cerrado','Goiânia','Anápolis','Cuiabá','Pantanal','Campo Grande','Brasília','Uberaba','Belo Horizonte','Juiz de Fora','Vitória','Serra','Niterói','Petrópolis','Campinas','Santos','Sorocaba','Londrina','Maringá','Curitiba','Joinville','Florianópolis','Chapecó','Caxias','Pelotas','Santa Maria','Porto Alegre','Vale Verde','Nova Esperança','Rio Dourado','Monte Azul'];
  const clubSuffixes=['Atlético','Esporte Clube','União','Futebol Clube'];
  const generatedClubPool=[];brazilianCities.forEach(city=>clubSuffixes.forEach(suffix=>generatedClubPool.push(`${suffix} ${city}`)));
  for(let index=generatedClubPool.length-1;index>0;index--){const swap=int(0,index),value=generatedClubPool[index];generatedClubPool[index]=generatedClubPool[swap];generatedClubPool[swap]=value;}
  const divisionTeams={A:[...teams],B:[],C:[],D:[]};
  if(savedNewGame){
    const restoredDivisions=savedNewGame.divisionTeams&&Object.keys(divisionRules).every(division=>Array.isArray(savedNewGame.divisionTeams[division]));
    if(restoredDivisions)Object.keys(divisionRules).forEach(division=>divisionTeams[division]=[...savedNewGame.divisionTeams[division]]);
    else{const normalizedUser=userClub.toLocaleLowerCase('pt-BR'),available=generatedClubPool.filter(name=>name.toLocaleLowerCase('pt-BR')!==normalizedUser);Object.keys(divisionRules).forEach(division=>{const generatedCount=divisionRules[division].clubs-(division===userDivision?1:0),generated=available.splice(0,generatedCount);divisionTeams[division]=division===userDivision?[userClub,...generated]:generated;});}
    Object.keys(divisionRules).forEach(division=>divisionRules[division].clubs=divisionTeams[division].length);
    teams.splice(0,teams.length,...divisionTeams[userDivision]);
  }
  const clubs={};
  const fullBenchRoles=['GOL','ZAG','ZAG','LAT','LAT','VOL','MC','MC','MEI','PE','PD','ATA'];
  const createClub=(club,division,index)=>{const rule=divisionRules[division],basePower=int(rule.power[0],rule.power[1]),formation=club===userClub?'4-3-3':formationsForClubs[int(0,formationsForClubs.length-1)],roles=savedNewGame?generatedSquadRoles(formation):[...starterRoles,...benchRoles],roster=roles.map((role,playerIndex)=>generatedPlayer(role,playerIndex+index*29,basePower+(playerIndex<11?2:-1),division)),names=new Map(),environmentRange=initialEnvironmentRanges[division];roster.forEach(player=>{const count=names.get(player.name)||0;names.set(player.name,count+1);if(count)player.name=`${player.name} ${count+1}`;});const power=Math.round(roster.slice(0,11).reduce((sum,player)=>sum+player.overall,0)/11);return{name:club,division,power,roster,formation,style:['Posse de bola','Contra-ataque','Pressão alta'][int(0,2)],mentality:['Defensiva','Equilibrada','Ofensiva'][int(0,2)],position:index+1,environment:int(...environmentRange),support:int(38,94),board:int(38,94),finances:int(35,96)};};
  if(savedNewGame){
    Object.entries(divisionTeams).forEach(([division,names])=>names.forEach((club,index)=>{clubs[club]=createClub(club,division,index);}));
    const user=clubs[userClub];
    if(Array.isArray(savedNewGame.userRoster)&&savedNewGame.userRoster.length>=18)user.roster=savedNewGame.userRoster.map(player=>({injuryHistory:[],workload:{minutesLast7Days:0,minutesLast14Days:0,matchesLast14Days:0,consecutiveStarts:0,highIntensityLoad:0,lastMatchRound:0},...player,fatigue:100}));
    squad.splice(0,squad.length,...user.roster);
    user.formation='4-3-3';user.style='Posse de bola';user.mentality='Equilibrada';
    // Uma carreira nova começa com estabilidade mínima. Os valores ainda são
    // independentes e aleatórios, mas nenhum indicador institucional nasce em
    // faixa negativa antes de o treinador disputar sua primeira partida.
    const userEnvironmentRange=initialEnvironmentRanges[userDivision],initialStatus=savedNewGame.clubStatus||{environment:int(...userEnvironmentRange),support:int(55,88),board:int(55,88),finances:int(55,88)};
    user.environment=clamp(initialStatus.environment,...userEnvironmentRange);
    user.support=clamp(initialStatus.support,55,88);
    user.board=clamp(initialStatus.board,55,88);
    user.finances=clamp(initialStatus.finances,55,88);
  }
  else teams.forEach((club,index)=>{if(club===userClub){clubs[club]={name:club,division:'A',roster:squad,formation:'4-3-3',style:'Posse de bola',mentality:'Equilibrada',position:4};return;}const power=clamp(78-index*.45+int(-3,3),68,82),roster=[...starterRoles,...benchRoles].map((role,i)=>generatedPlayer(role,i+index*5,power));clubs[club]={name:club,division:'A',roster,formation:formationsForClubs[int(0,formationsForClubs.length-1)],style:['Posse de bola','Contra-ataque','Pressão alta'][int(0,2)],mentality:['Defensiva','Equilibrada','Ofensiva'][int(0,2)],position:index+1};});
  Object.values(clubs).forEach(club=>{
    const attackers=club.roster.filter(p=>['ATA','PE','PD','MEI','MC'].includes(p.pos)).sort((a,b)=>(b.finishing+b.heading*.2)-(a.finishing+a.heading*.2));
    const creators=club.roster.filter(p=>p.pos!=='GOL').sort((a,b)=>(b.passing+b.playmaking)-(a.passing+a.playmaking));
    club.environment=club.environment??(club.name===userClub?86:int(...initialEnvironmentRanges[club.division||'A']));
    club.support=club.support??int(42,92);
    club.board=club.board??int(42,92);
    club.finances=club.finances??int(40,94);
    club.medicalInvestment=club.medicalInvestment??0;
    club.preventionProgram=club.preventionProgram??0;
    club.pitchCondition=club.pitchCondition||'good';
    club.seasonLeaders={scorer:attackers[0]||club.roster[0],goals:savedNewGame?0:int(4,18),assistant:creators[0]||club.roster[1],assists:savedNewGame?0:int(3,14)};
  });
  // Os quatro indicadores institucionais atuam em áreas distintas e em escala
  // moderada. Eles inclinam probabilidades, mas nunca substituem elenco, tática,
  // atributos individuais ou a aleatoriedade natural de uma partida.
  const clubInstitutionalContext=(club,isHome=false)=>{
    const morale=(club.environment-60)/40;
    const supporters=(club.support-60)/40;
    const board=(club.board-60)/40;
    const finances=(club.finances-60)/40;
    const crowd=supporters*(isHome?1:.16);
    return {
      overall:clamp(morale*.88+board*.42+finances*.24+crowd*.32,-2.25,2.25),
      attack:clamp(morale*.82+crowd*.92+board*.14,-2.6,2.6),
      passing:clamp(morale*.86+board*.52+finances*.18,-2.35,2.35),
      defense:clamp(morale*.42+board*.68+crowd*.24,-2.25,2.25),
      keeper:clamp(morale*.34+board*.28,-1.25,1.25),
      discipline:clamp((52-club.board)/420+(50-club.environment)/540,-.065,.13),
      wear:clamp(1-(club.finances-50)/520-(club.environment-50)/1050,.88,1.12),
      recovery:clamp(1+(club.finances-50)/310+(club.environment-50)/650,.84,1.20),
      volatility:clamp(1+(55-club.environment)/125+(55-club.board)/180,.82,1.28)
    };
  };
  const applyTreatmentChoice=(player,injury,choice,club)=>{
    const adjusted={...injury};
    if(choice==='surgery'){adjusted.treatment='surgery';adjusted.surgery=true;adjusted.daysRemaining=Math.max(1,Math.round((adjusted.daysRemaining||adjusted.totalDays||14)*.9));adjusted.totalDays=adjusted.daysRemaining;adjusted.estimatedReturn={minimumDays:Math.max(1,Math.round(adjusted.daysRemaining*.82)),maximumDays:Math.max(adjusted.daysRemaining,Math.round(adjusted.daysRemaining*1.15))};}
    else{adjusted.treatment='conservative';adjusted.surgery=false;adjusted.daysRemaining=Math.max(1,Math.round((adjusted.daysRemaining||adjusted.totalDays||14)*1.1));adjusted.totalDays=adjusted.daysRemaining;adjusted.estimatedReturn={minimumDays:Math.max(1,Math.round(adjusted.daysRemaining*.85)),maximumDays:Math.max(adjusted.daysRemaining,Math.round(adjusted.daysRemaining*1.2))};}
    return assignPlayerInjury(player,adjusted,currentRound,{skipTreatmentPrompt:true,club});
  };
  let pendingTreatmentDecision=null,postMatchMedicalQueue=[];
  const processPostMatchMedicalQueue=()=>{
    if(pendingTreatmentDecision||!postMatchMedicalQueue.length)return;
    const next=postMatchMedicalQueue.shift();
    pendingTreatmentDecision={player:next.player,injury:next.injury,club:next.club,liveContext:null};
    $('#treatmentPlayerName').textContent=next.player.name;
    $('#treatmentInjuryName').textContent=next.injury.name;
    $('#treatmentModalText').textContent=`Departamento médico (${medicalDepartmentLabel(clubMedicalQuality(next.club))}) aguarda sua decisão pós-jogo. Cirurgia tende a encurtar o afastamento; o conservador preserva o atleta por mais tempo em observação.`;
    $('#treatmentModal').classList.remove('hidden');
  };
  const offerTreatmentChoice=(player,injury,club,liveContext=null)=>{
    if(!injuryAllowsTreatmentChoice(injury)||club?.name!==userClub)return assignPlayerInjury(player,injury,currentRound,{skipTreatmentPrompt:true,club});
    if(liveContext){
      postMatchMedicalQueue.push({player,injury:{...injury},club});
      return assignPlayerInjury(player,injury,currentRound,{skipTreatmentPrompt:true,club});
    }
    if(pendingTreatmentDecision)return assignPlayerInjury(player,injury,currentRound,{skipTreatmentPrompt:true,club});
    pendingTreatmentDecision={player,injury,club,liveContext:null};
    $('#treatmentPlayerName').textContent=player.name;
    $('#treatmentInjuryName').textContent=injury.name;
    $('#treatmentModalText').textContent=`Departamento médico (${medicalDepartmentLabel(clubMedicalQuality(club))}) recomenda avaliar o tratamento. Cirurgia tende a encurtar o afastamento; o conservador preserva o atleta por mais tempo em observação.`;
    $('#treatmentModal').classList.remove('hidden');
    return null;
  };
  const finishTreatmentChoice=choice=>{
    if(!pendingTreatmentDecision)return;
    const {player,injury,club,liveContext}=pendingTreatmentDecision,record=applyTreatmentChoice(player,injury,choice,club);
    pendingTreatmentDecision=null;
    $('#treatmentModal').classList.add('hidden');
    if(club?.name===userClub&&record)pushMessage?.({category:'medical',type:'treatment',title:'Tratamento definido',body:`${player.name}: ${treatmentLabel(record.treatment)} para ${record.name}. Retorno estimado em ${record.daysRemaining} dias.`,round:currentRound,meta:{competition:'Departamento médico'}});
    if(liveContext&&record){
      const {side,index}=liveContext;
      cards[side][index].injured=true;liveInjuries[side].push({name:player.name,injury:{...record}});
      log(injuryDiagnosisComment(player,record,club),'injury');
      if(side==='home'){
        $('#matchStatus').textContent='Partida pausada: jogador lesionado. Faça a substituição ou reorganize a equipe.';
        openPreparation('LESÃO');
      }else{
        const bench=club.roster.slice(11).filter(candidate=>!playerUnavailable(candidate)&&!liveInjuries.away.some(item=>item.name===candidate.name));
        if(bench.length&&liveInjuries.away.length<=5){const expected=player.pos,compatible=bench.filter(candidate=>candidate.pos===expected||(compatibleRoles[expected]||[]).includes(candidate.pos)),incoming=[...(compatible.length?compatible:bench)].sort((a,b)=>b.overall-a.overall)[0],incomingIndex=club.roster.indexOf(incoming);[club.roster[index],club.roster[incomingIndex]]=[incoming,player];cards.away[index]={yellow:0,red:false,dismissal:null,injured:false,playThroughRisk:false};liveMinutesPlayed.away.set(incoming.name,liveMinutesPlayed.away.get(incoming.name)??0);log(`${club.name} substitui o lesionado ${player.name} por ${incoming.name}.`,'injury-substitution');}
      }
      renderRoster();drawBoard();renderSubstitutionControls();renderStats();
    }
    if(!liveContext&&postMatchMedicalQueue.length)processPostMatchMedicalQueue();
    return record;
  };
  const summarizeMatchInjuries=result=>{
    const summary={confirmedInMatch:0,deferred:0,cleared:0,monitoring:0,confirmedPostMatch:0,totalDaysOut:0,incidents:0};
    ['home','away'].forEach(side=>{
      const clubName=result[side],club=clubs[clubName];
      summary.confirmedInMatch+=(result.injuries?.[side]?.length||0);
      (result.deferredInjuries?.[side]||[]).forEach(entry=>{
        summary.deferred++;summary.incidents++;
        const player=club?.roster?.find(candidate=>candidate.name===entry.name);
        if(!player)return;
        const diagnosis=resolvePostMatchDiagnosis(player,entry.injury,{...entry,club});
        if(diagnosis.outcome==='cleared')summary.cleared++;
        else if(diagnosis.outcome==='monitoring'){summary.monitoring++;summary.totalDaysOut+=diagnosis.injury?.daysRemaining||0;}
        else{summary.confirmedPostMatch++;summary.totalDaysOut+=diagnosis.injury?.daysRemaining||0;}
      });
      (result.injuries?.[side]||[]).forEach(entry=>{summary.incidents++;summary.totalDaysOut+=entry.injury?.daysRemaining||0;});
    });
    return summary;
  };
  if(savedNewGame){
    const user=clubs[userClub],overall=Math.round(user.roster.slice(0,11).reduce((sum,player)=>sum+player.overall,0)/11),environment=user.environment;
    $('.dashboard-overall strong').textContent=overall;
    if(dashboardEnvironment){
      dashboardEnvironment.style.setProperty('--environment',environment);
      const envStrong=dashboardEnvironment.querySelector('strong');
      if(envStrong) envStrong.textContent=`${environment}%`;
      setIndicatorTone(dashboardEnvironment,environment);
    }
    const environmentLabel=environment>75?['Vestiário em alta','O elenco está motivado.']:environment>40?['Ambiente estável','O grupo trabalha sem grande pressão.']:['Vestiário pressionado','O elenco precisa reagir.'];$('.dashboard-environment-note strong').textContent=environmentLabel[0];$('.dashboard-environment-note small').textContent=environmentLabel[1];
    [user.support,user.board,user.finances].forEach((value,index)=>{const element=$$('[data-dashboard-factor]')[index];if(!element)return;element.textContent=`${value}%`;setIndicatorTone(element.parentElement,value);});
    const specialistRows=Object.keys(divisionRules).map(division=>{const divisionClubs=divisionTeams[division],freeClubs=divisionClubs.filter(name=>clubs[name].roster.some(player=>player.freeKick>85)).length,penaltyClubs=divisionClubs.filter(name=>clubs[name].roster.some(player=>player.penaltyTaking>85)).length;return `<span><b>Série ${division}</b>${divisionClubs.length} clubes · ${freeClubs} com especialista em faltas · ${penaltyClubs} em pênaltis</span>`;}).join('');
    $('.new-game-action').insertAdjacentHTML('afterend',`<div class="generated-world-summary"><small>CARREIRA ATUAL</small><span class="career-current"><b>${userClub}</b>${careerProfile.managerName} · Série ${userDivision}</span><small>UNIVERSO NACIONAL</small>${specialistRows}</div>`);
  }
  const matchClub=()=>clubs[(typeof nextUserGame!=='undefined'&&nextUserGame?(nextUserGame.home===userClub?nextUserGame.away:nextUserGame.home):'Estrela do Cerrado')];
  // Série A: 20 clubes em pontos corridos, com turno e returno. Em cada uma
  // das 38 rodadas, os 20 clubes entram em campo uma única vez (10 jogos).
  const buildBrazilianLeagueFixtures=clubList=>{
    let rotation=[...clubList]; const firstLeg=[];
    for(let round=0;round<clubList.length-1;round++){
      const games=[];
      for(let pair=0;pair<clubList.length/2;pair++){
        let home=rotation[pair],away=rotation[clubList.length-1-pair];
        if((round+pair)%2){const swap=home;home=away;away=swap;}
        games.push({home,away,round:round+1});
      }
      firstLeg.push(games);
      rotation=[rotation[0],rotation[rotation.length-1],...rotation.slice(1,-1)];
    }
    const secondLeg=firstLeg.map((games,index)=>games.map(game=>({home:game.away,away:game.home,round:index+20})));
    return [...firstLeg,...secondLeg];
  };
  const serieAFixtures=buildBrazilianLeagueFixtures(divisionTeams.A);
  const serieBFixtures=savedNewGame?buildBrazilianLeagueFixtures(divisionTeams.B):[];
  const serieCFixtures=savedNewGame?buildBrazilianLeagueFixtures(divisionTeams.C):[];
  const restoredSerieDGroups=!!(savedNewGame&&savedSeason&&savedSeason.seed===savedNewGame.seed&&Array.isArray(savedSeason.serieDGroups)&&savedSeason.serieDGroups.length===16)?savedSeason.serieDGroups:null;
  const buildSerieDGroups=()=>{
    // A CBF regionaliza as chaves. No universo fictício, a cidade do nome do
    // clube funciona como referência geográfica; dentro de cada faixa regional,
    // a composição e a numeração A1-A16 são sorteadas de forma determinística.
    let state=((savedNewGame?.seed||0)^careerSeason^0x53E21D)>>>0;
    const draw=()=>{state+=0x6D2B79F5;let value=state;value=Math.imul(value^value>>>15,value|1);value^=value+Math.imul(value^value>>>7,value|61);return((value^value>>>14)>>>0)/4294967296;};
    const shuffle=values=>{const result=[...values];for(let index=result.length-1;index>0;index--){const swap=Math.floor(draw()*(index+1)),item=result[index];result[index]=result[swap];result[swap]=item;}return result;};
    const citiesByLength=[...brazilianCities].sort((a,b)=>b.length-a.length),geographic=divisionTeams.D.map(club=>{const city=citiesByLength.find(name=>club.endsWith(name)),index=city?brazilianCities.indexOf(city):Math.floor(draw()*brazilianCities.length);return{club,index,jitter:draw()*.85};}).sort((a,b)=>a.index+a.jitter-(b.index+b.jitter));
    const regionalPairs=Array.from({length:8},(_,pairIndex)=>{const pool=shuffle(geographic.slice(pairIndex*12,pairIndex*12+12).map(item=>item.club)),left=[],right=[];pool.forEach((club,index)=>(index%2?right:left).push(club));return draw()<.5?[left,right]:[right,left];});
    return shuffle(regionalPairs).flat();
  };
  const serieDGroups=restoredSerieDGroups?restoredSerieDGroups.map(group=>[...group]):savedNewGame?buildSerieDGroups():[];
  const userSerieDGroupIndex=Math.max(0,serieDGroups.findIndex(group=>group.includes(userClub)));
  const userSerieDGroup=serieDGroups[userSerieDGroupIndex]||[];
  const SERIE_D_GROUP_ROUNDS=10;
  const normalizeSerieDGroupFixtures=fixtures=>{
    if(!Array.isArray(fixtures))return fixtures;
    fixtures.slice(0,SERIE_D_GROUP_ROUNDS).forEach((roundGames,roundIndex)=>{
      if(!Array.isArray(roundGames))return;
      const targetRound=roundIndex+1;
      roundGames.forEach(game=>{if(game&&typeof game==='object'&&!isKnockoutShootoutCompetition(game))game.round=targetRound;});
    });
    return fixtures;
  };
  const buildSerieDGroupFixtures=groups=>normalizeSerieDGroupFixtures(Array.from({length:SERIE_D_GROUP_ROUNDS},(_,roundIndex)=>groups.flatMap(group=>(buildBrazilianLeagueFixtures(group)[roundIndex]||[]).map(game=>({...game,round:roundIndex+1})))));
  const serieDGroupFixtures=savedNewGame?buildSerieDGroupFixtures(serieDGroups):[];
  const championshipFixtures=savedNewGame?{A:serieAFixtures,B:serieBFixtures,C:serieCFixtures,D:serieDGroupFixtures}[userDivision]:serieAFixtures;
  const scheduledMatchCount=championshipFixtures.reduce((total,round)=>total+round.length,0);
  $('#calendar .title span').textContent=`${scheduledMatchCount} jogos da fase atual foram definidos no início da temporada.`;
  const nationalCompetitions={
    A:{...divisionRules.A,teams:divisionTeams.A,fixtures:serieAFixtures,standings:[]},
    B:{...divisionRules.B,teams:divisionTeams.B,fixtures:serieBFixtures,standings:[]},
    C:{...divisionRules.C,teams:divisionTeams.C,fixtures:serieCFixtures,standings:[],secondStage:{groups:2,clubsPerGroup:4}},
    D:{...divisionRules.D,teams:divisionTeams.D,groups:serieDGroups,fixtures:serieDGroupFixtures,standings:[],knockout:{qualifiedPerGroup:4,promoted:6,twoLegged:true}}
  };
  const seasonRoundHistory=validSavedSeason&&Array.isArray(savedSeason.seasonRoundHistory)?savedSeason.seasonRoundHistory:[];
  const initialCareerMessages=hydrateMessages(savedSeason,validSavedSeason);
  const competitionRoundHistory=validSavedSeason&&savedSeason.competitionRoundHistory?{A:[],B:[],C:[],D:[],...savedSeason.competitionRoundHistory}:{A:[],B:[],C:[],D:[]};
  Object.values(nationalCompetitions).forEach(competition=>{competition.standings=competition.teams.map(club=>({club,played:0,wins:0,draws:0,losses:0,goalDiff:0,points:0}));});
  const leagueData=teams.map((club,index)=>{if(savedNewGame)return{club,played:0,wins:0,draws:0,losses:0,goalDiff:0,points:0};const played=13,wins=int(2,9),draws=int(1,5),losses=played-wins-draws,goalDiff=int(-8,14);return{club,played,wins,draws,losses,goalDiff,points:wins*3+draws};}).sort((a,b)=>b.points-a.points||b.goalDiff-a.goalDiff);
  nationalCompetitions[userDivision].standings=leagueData;
  if(validSavedSeason){
    Object.entries(savedSeason.standings||{}).forEach(([division,rows])=>{const competition=nationalCompetitions[division];if(!competition)return;rows.forEach(saved=>{const row=competition.standings.find(item=>item.club===saved.club);if(row)Object.assign(row,saved);});competition.standings.sort((a,b)=>b.points-a.points||b.goalDiff-a.goalDiff||b.wins-a.wins);competition.standings.forEach((row,index)=>clubs[row.club].position=index+1);});
    Object.entries(savedSeason.fatigue||{}).forEach(([clubName,players])=>Object.entries(players).forEach(([playerName,value])=>{const player=clubs[clubName]?.roster.find(item=>item.name===playerName);if(player)player.fatigue=clamp(value,0,100);}));
    (savedSeason.dFixtures||[]).forEach((round,index)=>{if(index>=10&&Array.isArray(round))nationalCompetitions.D.fixtures[index]=round;});
    if(savedSeason.dKnockout)Object.assign(nationalCompetitions.D.knockout,savedSeason.dKnockout);
  }
  const applyDeferredInjuryDiagnosis=(player,entry,club=null)=>{
    const ownerClub=club||entry.club;
    const diagnosis=resolvePostMatchDiagnosis(player,entry.injury,{...entry,club:ownerClub});
    if(diagnosis.outcome==='cleared')return {outcome:'cleared',report:injuryPostMatchReport(player,{outcome:'cleared',category:entry.injury.category,club:ownerClub})};
    const record=assignPlayerInjury(player,diagnosis.injury,currentRound,{skipTreatmentPrompt:ownerClub?.name!==userClub,club:ownerClub});
    return {outcome:diagnosis.outcome,injury:record,report:injuryPostMatchReport(player,{...diagnosis,injury:record||diagnosis.injury,club:ownerClub}),pending:!record};
  };
  const assignPlayerInjury=(player,injury,round=currentRound,options={})=>{
    if(!options.skipTreatmentPrompt&&injuryAllowsTreatmentChoice(injury)&&options.club?.name===userClub){
      const offered=offerTreatmentChoice(player,injury,options.club,options.liveContext||null);
      if(offered===null)return null;
    }
    const record=normalizeInjury({...injury,startedRound:injury.startedRound??round,rehabilitationStage:injury.rehabilitationStage||'acute',returnToPlay:null,medicallyCleared:false});
    player.injury=record;
    player.injuryHistory=player.injuryHistory||[];
    player.injuryHistory.push({type:record.type,bodyPart:record.bodyPart,side:record.side,severity:record.severity,season:careerSeason,daysOut:record.totalDays,recoveredAt:null});
    return record;
  };
  // Disponibilidade do atleta persiste entre rodadas. Suspensões seguem o
  // regulamento brasileiro (três amarelos ou expulsão) e o segundo amarelo
  // sempre é convertido em vermelho, conforme a regra disciplinar do jogo.
  const restoredAvailability=validSavedSeason?savedSeason.availability||{}:{};
  const restoredClubMedical=validSavedSeason?savedSeason.clubMedical||{}:{};
  Object.entries(clubs).forEach(([clubName,club])=>{
    const medical=restoredClubMedical[clubName];
    if(medical){
      club.medicalInvestment=medical.medicalInvestment??club.medicalInvestment??0;
      club.preventionProgram=medical.preventionProgram??club.preventionProgram??0;
      club.pitchCondition=medical.pitchCondition||club.pitchCondition||'good';
    }
    club.roster.forEach(player=>{
    const restored=restoredAvailability[clubName]?.[player.name]||{};
    player.injuryHistory=Array.isArray(restored.injuryHistory)?restored.injuryHistory.map(entry=>({...entry})):Array.isArray(player.injuryHistory)?player.injuryHistory:[];
    player.workload={minutesLast7Days:0,minutesLast14Days:0,matchesLast14Days:0,consecutiveStarts:0,highIntensityLoad:0,lastMatchRound:0,...player.workload,...restored.workload};
    player.injury=restored.injury?normalizeInjury({...restored.injury}):player.injury?normalizeInjury({...player.injury}):null;
    player.discipline={yellowAccumulation:0,suspensionMatches:0,redCards:0,...restored.discipline};
    if(player.injury&&!injuryInAcutePhase(player.injury)&&!injuryInRestrictedPhase(player.injury)){
      if(player.injury.legacy||player.injury.rehabilitationStage==='fit')player.injury=null;
      else beginRestrictedReturn(player,club);
    }
    });
  });
  leagueData.forEach((row,index)=>clubs[row.club].position=index+1);
  const seriesDGroupRows=groupIndex=>{
    const group=serieDGroups[groupIndex]||[];
    return group.map(club=>nationalCompetitions.D.standings.find(row=>row.club===club)).filter(Boolean).sort((a,b)=>b.points-a.points||b.wins-a.wins||b.goalDiff-a.goalDiff);
  };
  const displayedLeagueRows=()=>userDivision==='D'?seriesDGroupRows(userSerieDGroupIndex):[...leagueData].sort((a,b)=>b.points-a.points||b.wins-a.wins||b.goalDiff-a.goalDiff);
  const DASHBOARD_TABLE_ROWS=5;
  const dashboardUpcomingGames=()=>{
    const roundGames=(futureMatches||[]).filter(game=>!isFixtureCompleted(game)),userGame=roundGames.find(isUserFixture),picked=roundGames.slice(0,DASHBOARD_TABLE_ROWS);
    if(userGame&&!picked.some(game=>game.home===userGame.home&&game.away===userGame.away))return [...picked.slice(0,DASHBOARD_TABLE_ROWS-1),userGame];
    return picked;
  };
  const renderDashboardMiniTable=()=>{$('#miniTable').innerHTML=displayedLeagueRows().slice(0,DASHBOARD_TABLE_ROWS).map((row,index)=>`<div class="standing-row ${row.club===userClub?'highlight':''}" data-club="${row.club}" role="button" tabindex="0"><span>${userDivision==='D'?index+1:clubs[row.club].position}</span><span class="club-link">${row.club}</span><span>${row.played}</span><span>${row.goalDiff>=0?'+':''}${row.goalDiff}</span><span>${row.points}</span></div>`).join('');};
  const renderDashboardUpcoming=()=>{$('#upcomingMatches').innerHTML=dashboardUpcomingGames().map(game=>{const isUser=isUserFixture(game);return `<div class="dashboard-fixture-row ${isUser?'user-game':''}"><span><b class="club-link" data-club="${game.home}" role="button" tabindex="0">${game.home}</b>${isUser?'<small class="user-game-tag">SEU JOGO</small>':''}</span><span>×</span><span class="club-link" data-club="${game.away}" role="button" tabindex="0">${game.away}</span></div>`;}).join('');};
  const displayedClubPosition=clubName=>{if(clubs[clubName]?.division!=='D')return clubs[clubName]?.position||'—';const groupIndex=serieDGroups.findIndex(group=>group.includes(clubName));return seriesDGroupRows(groupIndex).findIndex(row=>row.club===clubName)+1;};
  const championshipPageName=userDivision==='D'?`BRASILEIRÃO SÉRIE D · GRUPO A${userSerieDGroupIndex+1}`:`BRASILEIRÃO SÉRIE ${userDivision}`;
  $('#championshipPageKicker').textContent=`CAMPEONATO BRASILEIRO · SÉRIE ${userDivision}${userDivision==='D'?` · GRUPO A${userSerieDGroupIndex+1}`:''}`;
  $('.championship-page-table-title strong').textContent=championshipPageName;
  $('.championship-page-table-title small').textContent=userDivision==='D'?'PRIMEIRA FASE · GRUPO DO SEU CLUBE':'COMPETIÇÃO NACIONAL';
  const nationalTitleBonuses={A:40,B:28,C:20,D:12,CUP:35};
  // As faixas se sobrepõem: a divisão ainda importa, mas clubes excepcionais
  // podem furar o bloco imediatamente superior. Uma reputação pequena e estável
  // por clube evita que o ranking seja uma simples sequência A, B, C e D.
  const nationalDivisionPrestige={A:14,B:10,C:6,D:2};
  const nationalDivisionBenchmarks={A:82,B:76,C:70,D:65};
  const nationalLeaguePointWeights={A:1,B:.75,C:.55,D:.35};
  const nationalRankingFormulaVersion=2;
  const clubSquadOverall=club=>Math.round(club.roster.slice(0,11).reduce((total,player)=>total+player.overall,0)/Math.max(1,club.roster.slice(0,11).length));
  const roundRankingScore=value=>Math.round(Number(value||0)*10)/10;
  const computeNationalRankingBase=club=>{
    const overall=clubSquadOverall(club);
    let identityHash=((savedNewGame?.seed||2166136261)^club.name.length)>>>0;
    for(let index=0;index<club.name.length;index++)identityHash=Math.imul(identityHash^club.name.charCodeAt(index),16777619)>>>0;
    const clubReputation=(identityHash/4294967295)*6-3,divisionalExcellence=Math.max(0,overall-nationalDivisionBenchmarks[club.division])*.8;
    return roundRankingScore(overall*.68+club.environment*.15+nationalDivisionPrestige[club.division]+divisionalExcellence+clubReputation);
  };
  const storedNationalRanking=(validSavedSeason?savedSeason.nationalRanking:null)||savedNewGame?.nationalRanking||{entries:{}};
  const nationalRankingFinalizedSeasons=new Set(storedNationalRanking.finalizedSeasons||[]);
  const nationalRankingEntries=Object.fromEntries(Object.values(clubs).map(club=>{
    const stored=storedNationalRanking.entries?.[club.name],base=computeNationalRankingBase(club),storedChampionshipPoints=Number(stored?.championshipPoints||0),legacyFormula=Number(storedNationalRanking.formulaVersion||1)<nationalRankingFormulaVersion;
    // Bases antigas eram uma média simples e os pontos não tinham peso por
    // divisão. A migração recalcula a base e ajusta aproximadamente o histórico.
    const championshipPoints=legacyFormula?roundRankingScore(storedChampionshipPoints*nationalLeaguePointWeights[club.division]):roundRankingScore(storedChampionshipPoints);
    return [club.name,{club:club.name,base,championshipPoints,titlePoints:roundRankingScore(stored?.titlePoints||0),titles:Array.isArray(stored?.titles)?[...stored.titles]:[]}];
  }));
  const allScorers=Object.values(clubs).flatMap(club=>club.roster.map(player=>({name:player.name,club:club.name,division:club.division,games:savedNewGame?0:int(9,13),goals:savedNewGame?0:int(0,8),tieValue:player.finishing+player.heading*.2}))).sort((a,b)=>b.goals-a.goals||b.tieValue-a.tieValue);
  const allAssistants=Object.values(clubs).flatMap(club=>club.roster.filter(player=>player.pos!=='GOL').map(player=>({name:player.name,club:club.name,division:club.division,games:savedNewGame?0:int(9,13),assists:savedNewGame?0:int(0,7),tieValue:player.passing+player.playmaking}))).sort((a,b)=>b.assists-a.assists||b.tieValue-a.tieValue);
  if(validSavedSeason){(savedSeason.scorers||[]).forEach(saved=>{const row=allScorers.find(item=>item.club===saved.club&&item.name===saved.name);if(row)Object.assign(row,saved);});(savedSeason.assistants||[]).forEach(saved=>{const row=allAssistants.find(item=>item.club===saved.club&&item.name===saved.name);if(row)Object.assign(row,saved);});allScorers.sort((a,b)=>b.goals-a.goals);allAssistants.sort((a,b)=>b.assists-a.assists);}
  const leadersFor=(division,mode)=>{const metric=mode==='scorers'?'goals':'assists',source=mode==='scorers'?allScorers:allAssistants;return source.filter(player=>player.division===division).sort((a,b)=>b[metric]-a[metric]||b.tieValue-a.tieValue||a.games-b.games);};
  const clubSeasonLeaders=clubName=>{const scorers=allScorers.filter(player=>player.club===clubName).sort((a,b)=>b.goals-a.goals||b.tieValue-a.tieValue||a.games-b.games),assistants=allAssistants.filter(player=>player.club===clubName).sort((a,b)=>b.assists-a.assists||b.tieValue-a.tieValue||a.games-b.games),scorer=scorers[0],assistant=assistants[0];return {scorer:scorer||{name:'—'},goals:scorer?.goals||0,assistant:assistant||{name:'—'},assists:assistant?.assists||0};};
  const championshipLeadersFor=(division,mode)=>{const metric=mode==='scorers'?'goals':'assists',source=mode==='scorers'?allScorers:allAssistants;if(division==='CUP'){const cupClubs=new Set(copaDoBrasilFixtures.flatMap(game=>[game.home,game.away]));return source.filter(player=>cupClubs.has(player.club)).sort((a,b)=>b[metric]-a[metric]||b.tieValue-a.tieValue||a.games-b.games);}return leadersFor(division,mode);};
  currentRound=validSavedSeason?savedSeason.currentRound:Math.max(...leagueData.map(row=>row.played))+1;
  const userLeaguePlayed=()=>nationalCompetitions[userDivision]?.standings?.find(row=>row.club===userClub)?.played||0;
  const userGroupStageComplete=()=>userDivision!=='D'||userLeaguePlayed()>=SERIE_D_GROUP_ROUNDS;
  const reconcileCurrentRound=()=>{
    if(!savedNewGame)return;
    const played=userLeaguePlayed(),groupLimit=userDivision==='D'?SERIE_D_GROUP_ROUNDS:38;
    if(played>=groupLimit)return;
    const expected=played+1;
    if(currentRound!==expected)currentRound=expected;
  };
  reconcileCurrentRound();
  let persistSeason=()=>{};
  const messages=createMessagesFeature({
    $,$$,onClick,
    initialMessages:initialCareerMessages,
    getHasCareer:()=>!!savedNewGame,
    getCurrentRound:()=>currentRound,
    getCareerDateIso:()=>careerCalendarDate.toISOString(),
    onPush:message=>bus?.emit('message:push',message),
  });
  const pushMessage=messages.pushMessage.bind(messages);
  const renderMessages=messages.renderMessages.bind(messages);
  const renderDashboardMessagesFeed=messages.renderDashboardMessagesFeed.bind(messages);
  const updateMessageBadge=messages.updateMessageBadge.bind(messages);
  const applyDisciplineToPlayer=(player,card,round=currentRound,clubName=null)=>{
    if(!player||!card)return [];
    const discipline=player.discipline||(player.discipline={yellowAccumulation:0,suspensionMatches:0,redCards:0});
    const owner=clubName||Object.entries(clubs).find(([,club])=>club.roster.includes(player))?.[0];
    const opponent=owner===userClub&&liveMatchGame?(liveMatchGame.home===userClub?liveMatchGame.away:liveMatchGame.home):null;
    const matchCtx=opponent?` na partida contra ${opponent}`:'';
    const lines=[];
    if(card.dismissal){discipline.suspensionMatches+=1;discipline.redCards+=1;discipline.issuedRound=round;
      if(owner===userClub)lines.push(`${player.name} recebeu cartão vermelho${matchCtx} por ${card.dismissal==='second-yellow'?'segundo amarelo na mesma partida':'falta grave'} e ficará fora da próxima partida.`);
      return lines;}
    if(card.yellow){discipline.yellowAccumulation+=card.yellow;
      if(owner===userClub&&card.yellow)lines.push(`${player.name} foi advertido${matchCtx} (${discipline.yellowAccumulation}/${YELLOW_SUSPENSION_LIMIT} acumulados na temporada).`);
      if(discipline.yellowAccumulation>=YELLOW_SUSPENSION_LIMIT){discipline.yellowAccumulation-=YELLOW_SUSPENSION_LIMIT;discipline.suspensionMatches+=1;discipline.issuedRound=round;
      if(owner===userClub)lines.push(`${player.name} completou ${YELLOW_SUSPENSION_LIMIT} cartões amarelos${matchCtx} e está suspenso na próxima partida.`);}
    }
    return lines;
  };
  const pushDisciplineDigest=(lines,round,contextLabel)=>{
    if(!lines.length)return;
    pushMessage({category:'discipline',type:'digest',title:`Disciplina · ${contextLabel}`,body:lines.map(line=>`• ${line}`).join('\n'),round,meta:{competition:'Disciplina'}});
  };
  const applyMatchWorkload=(clubName,entries,tactic)=>{
    if(!clubName||!entries?.length)return;
    const club=clubs[clubName];if(!club)return;
    entries.forEach(entry=>{const player=club.roster.find(candidate=>candidate.name===entry.name);if(player)recordPlayerMatchWorkload(player,entry.minutes,!!entry.started,tactic||roundTactic(club),currentRound);});
  };
  const applyMatchAvailability=game=>{
    if(!game)return;
    const userDisciplineLines=[];
    const userOpponent=game.home===userClub?game.away:game.away===userClub?game.home:null;
    [['home',game.home],['away',game.away]].forEach(([side,clubName])=>{
      const club=clubs[clubName];if(!club)return;
      applyMatchWorkload(clubName,game.workload?.[side],game.tactics?.[side]||roundTactic(club));
      (game.discipline?.[side]||[]).forEach(entry=>{
        const lines=applyDisciplineToPlayer(club.roster.find(player=>player.name===entry.name),entry,currentRound,clubName);
        if(clubName===userClub)userDisciplineLines.push(...lines);
      });
      (game.injuries?.[side]||[]).forEach(entry=>{const player=club.roster.find(candidate=>candidate.name===entry.name);if(player&&!player.injury)assignPlayerInjury(player,entry.injury,currentRound,{club});});
      (game.deferredInjuries?.[side]||[]).forEach(entry=>{const player=club.roster.find(candidate=>candidate.name===entry.name);if(player&&!player.injury)applyDeferredInjuryDiagnosis(player,entry,club);});
    });
    if(userDisciplineLines.length)pushDisciplineDigest(userDisciplineLines,currentRound,userOpponent?`vs ${userOpponent}`:`Rodada ${currentRound}`);
  };
  const serveAvailability=(days,participants=new Set(Object.keys(clubs)))=>Object.values(clubs).forEach(club=>club.roster.forEach(player=>{
    decayPlayerWorkload(player,days);
    refreshWorkloadWindows(player,currentRound);
    if(player.injury){
      if(injuryInAcutePhase(player.injury)&&Number(player.injury.startedRound??-1)<currentRound){
        player.injury.daysRemaining=Math.max(0,player.injury.daysRemaining-days);
        if(!player.injury.daysRemaining)beginRestrictedReturn(player,club);
      }else if(injuryInRestrictedPhase(player.injury))advanceRestrictedRehab(player,days,club);
    }
    const discipline=player.discipline;if(participants.has(club.name)&&discipline?.suspensionMatches>0&&Number(discipline.issuedRound??-1)<currentRound)discipline.suspensionMatches=Math.max(0,discipline.suspensionMatches-1);
  }));
  let futureMatches=championshipFixtures[currentRound-1] || championshipFixtures[0];
  const currentRoundFixtures=()=>{
    if(userDivision==='D'&&currentRound>10){
      const knockoutRound=nationalCompetitions.D.fixtures[currentRound-1];
      if(Array.isArray(knockoutRound)&&knockoutRound.length)return knockoutRound;
    }
    return championshipFixtures[currentRound-1]||[];
  };
  const fixtureTimes=['19:00','21:30','16:00','20:00'];
  const seasonStartDate=()=>new Date(careerSeason,0,1,12);
  // Janelas inspiradas no calendário nacional da CBF (início oficial por divisão).
  const leagueCalendarRange={A:[[3,11],[11,6]],B:[[2,14],[10,28]],C:[[3,18],[10,24]],D:[[3,5],[8,13]]};
  const fixtureDateFor=(division,round)=>{const range=leagueCalendarRange[division],fixtures=nationalCompetitions[division]?.fixtures||[],start=new Date(careerSeason,...range[0]),end=new Date(careerSeason,...range[1]),rounds=Math.max(2,fixtures.length),progress=clamp((round-1)/(rounds-1),0,1),date=new Date(start.getTime()+(end.getTime()-start.getTime())*progress);date.setHours(12,0,0,0);return date;};
  const fixtureDate=round=>fixtureDateFor(userDivision,round);
  let careerCalendarDate=seasonStartDate();
  if(validSavedSeason&&savedSeason.careerCalendarDate){
    const [year,month,day]=savedSeason.careerCalendarDate.split('-').map(Number);
    if(year&&month&&day)careerCalendarDate=new Date(year,month-1,day,12);
  }
  const advanceCareerCalendarTo=date=>{if(!date)return;careerCalendarDate=new Date(date);careerCalendarDate.setHours(12,0,0,0);};
  const sameCalendarDay=(left,right)=>left.getFullYear()===right.getFullYear()&&left.getMonth()===right.getMonth()&&left.getDate()===right.getDate();
  const cupDate=(month,day)=>new Date(careerSeason,month-1,day,12);
  const cupPhaseDefinitions=[
    {index:1,name:'1ª FASE',teams:28,twoLegged:false,dates:[cupDate(2,18)]},
    {index:2,name:'2ª FASE',teams:88,twoLegged:false,dates:[cupDate(2,26)]},
    {index:3,name:'3ª FASE',teams:48,twoLegged:false,dates:[cupDate(3,11)]},
    {index:4,name:'4ª FASE',teams:24,twoLegged:false,dates:[cupDate(3,18)]},
    {index:5,name:'5ª FASE',teams:32,twoLegged:true,dates:[cupDate(4,22),cupDate(5,13)]},
    {index:6,name:'OITAVAS DE FINAL',teams:16,twoLegged:true,dates:[cupDate(8,2),cupDate(8,9)]},
    {index:7,name:'QUARTAS DE FINAL',teams:8,twoLegged:true,dates:[cupDate(8,26),cupDate(9,4)]},
    {index:8,name:'SEMIFINAL',teams:4,twoLegged:true,dates:[cupDate(11,4),cupDate(11,11)]},
    {index:9,name:'FINAL',teams:2,twoLegged:false,dates:[cupDate(12,6)]}
  ];
  // Critérios técnicos de 2026: 102 vagas estaduais, quatro entradas especiais
  // na 3ª fase e os 20 clubes da Série A apenas na 5ª fase.
  const cupNonSerieA=Object.values(clubs).filter(club=>club.division!=='A').sort((a,b)=>b.power-a.power||a.name.localeCompare(b.name,'pt-BR'));
  let cupSpecialEntrants=cupNonSerieA.slice(0,4).map(club=>club.name),cupStateEntrants=cupNonSerieA.slice(4,106),cupSerieAEntrants=divisionTeams.A.slice();
  let cupSecondDirect=cupStateEntrants.slice(0,74).map(club=>club.name),cupFirstRanked=cupStateEntrants.slice(-28).sort((a,b)=>b.power-a.power).map(club=>club.name);
  if(savedNewGame&&userDivision!=='A'){
    const inCupPool=name=>cupSpecialEntrants.includes(name)||cupSecondDirect.includes(name)||cupFirstRanked.includes(name);
    if(!inCupPool(userClub)){
      cupFirstRanked=[...cupFirstRanked.slice(0,Math.max(0,cupFirstRanked.length-1)),userClub];
    }
  }
  const shuffleCup=entries=>{const values=[...entries];for(let index=values.length-1;index>0;index--){const swap=int(0,index),item=values[index];values[index]=values[swap];values[swap]=item;}return values;};
  const copaDoBrasilFixtures=[];
  let onCupScheduleChanged=()=>{};
  const restoredCup=validSavedSeason&&savedSeason.cupCompetition?.stages?.length?savedSeason.cupCompetition:null;
  const cupCompetition=restoredCup?{currentPhase:restoredCup.currentPhase||1,champion:restoredCup.champion||null,stages:restoredCup.stages.map(stage=>({...stage,fixtures:(stage.fixtures||[]).map(game=>({...game,date:new Date(game.date)}))}))}:{currentPhase:1,champion:null,stages:[]};
  let cupGameNumber=Math.max(0,...cupCompetition.stages.flatMap(stage=>stage.fixtures.map(game=>game.gameNumber||0)))+1;
  // O calendário é resolvido como uma agenda nacional única. Antes de confirmar
  // uma data da Copa, são considerados todos os jogos de liga do clube e as fases
  // anteriores da própria Copa. Intervalo mínimo de quatro datas = três dias
  // completos de descanso entre um compromisso e outro.
  const MIN_REST_DAYS=3;
  const minimumMatchGap=(MIN_REST_DAYS+1)*24*60*60*1000;
  const minimumTwoLegGap=7*24*60*60*1000;
  const clubMatchDates=new Map();
  const reserveClubDate=(club,date)=>{if(!clubMatchDates.has(club))clubMatchDates.set(club,[]);clubMatchDates.get(club).push(date.getTime());};
  const unreserveClubDate=(club,timestamp)=>{const list=clubMatchDates.get(club);if(!list)return;const index=list.indexOf(timestamp);if(index>=0)list.splice(index,1);};
  const rebuildLeagueClubDates=()=>{clubMatchDates.clear();Object.entries(nationalCompetitions).forEach(([division,competition])=>competition.fixtures.forEach((round,index)=>{const date=fixtureDateFor(division,index+1);(round||[]).forEach(game=>{reserveClubDate(game.home,date);reserveClubDate(game.away,date);});}));};
  rebuildLeagueClubDates();
  const dateAvailable=(club,date)=>!(clubMatchDates.get(club)||[]).some(existing=>Math.abs(existing-date.getTime())<minimumMatchGap);
  const cupDateAvailable=(club,date)=>dateAvailable(club,date);
  const unreserveCupGame=game=>{if(!game._reservedTs)return;unreserveClubDate(game.home,game._reservedTs);unreserveClubDate(game.away,game._reservedTs);game._reservedTs=null;};
  const scheduleCupFixture=(game,{minDate=null}={})=>{
    unreserveCupGame(game);
    const nominal=new Date(game.date);
    nominal.setHours(12,0,0,0);
    const base=minDate&&minDate.getTime()>nominal.getTime()?new Date(minDate):nominal;
    base.setHours(12,0,0,0);
    let scheduled=null;
    for(let offset=0;offset<=35&&!scheduled;offset++){
      for(const sign of(offset===0?[0]:[-1,1])){
        const date=new Date(base);
        date.setDate(date.getDate()+offset*sign);
        date.setHours(12,0,0,0);
        if(minDate&&date.getTime()<minDate.getTime())continue;
        if(cupDateAvailable(game.home,date)&&cupDateAvailable(game.away,date)){scheduled=date;break;}
      }
    }
    if(!scheduled){scheduled=new Date(base);do{scheduled.setDate(scheduled.getDate()+1);scheduled.setHours(12,0,0,0);}while((minDate&&scheduled.getTime()<minDate.getTime())||!cupDateAvailable(game.home,scheduled)||!cupDateAvailable(game.away,scheduled));}
    game.date=scheduled;game._reservedTs=scheduled.getTime();reserveClubDate(game.home,scheduled);reserveClubDate(game.away,scheduled);
    return game;
  };
  const allCupFixtures=()=>cupCompetition.stages.flatMap(stage=>stage.fixtures);
  const refreshCopaDoBrasilFixtures=()=>{copaDoBrasilFixtures.length=0;copaDoBrasilFixtures.push(...allCupFixtures());};
  const rescheduleAllCupFixtures=()=>{
    rebuildLeagueClubDates();
    const tieIdaDates=new Map();
    [...allCupFixtures()].sort((a,b)=>new Date(a.date)-new Date(b.date)||(a.gameNumber||0)-(b.gameNumber||0)||(a.leg==='VOLTA'?1:0)-(b.leg==='VOLTA'?1:0)).forEach(game=>{
      const minDate=game.leg==='VOLTA'&&tieIdaDates.has(game.tieId)?new Date(tieIdaDates.get(game.tieId)+minimumTwoLegGap):null;
      scheduleCupFixture(game,{minDate});
      if(game.leg!=='VOLTA')tieIdaDates.set(game.tieId,game.date.getTime());
    });
  };
  const calendarIntervalLabel=conflicts=>conflicts===0?'intervalo mínimo de 3 dias validado':`${conflicts} conflito(s) aguardando ajuste`;
  const cupPairsForStage=(definition,entrants)=>{
    if(definition.index===1){const ranked=[...entrants];return Array.from({length:14},(_,index)=>{const pair=[ranked[index],ranked[ranked.length-1-index]];return Math.random()<.5?pair:pair.reverse();});}
    if(definition.index===5){const ranked=[...entrants].sort((a,b)=>clubs[b].power-clubs[a].power),potA=shuffleCup(ranked.slice(0,16)),potB=shuffleCup(ranked.slice(16));return potA.map((club,index)=>Math.random()<.5?[club,potB[index]]:[potB[index],club]);}
    const draw=shuffleCup(entrants);return Array.from({length:draw.length/2},(_,index)=>Math.random()<.5?[draw[index*2],draw[index*2+1]]:[draw[index*2+1],draw[index*2]]);
  };
  const createCupStage=(phaseIndex,entrants)=>{
    const definition=cupPhaseDefinitions[phaseIndex-1],pairs=cupPairsForStage(definition,entrants),fixtures=[];
    pairs.forEach(([home,away],tieIndex)=>{
      const tieId=`F${phaseIndex}-G${tieIndex+1}`;
      fixtures.push({home,away,competition:'COPA DO BRASIL',phase:definition.name,phaseIndex,leg:definition.twoLegged?'IDA':'JOGO ÚNICO',date:new Date(definition.dates[0]),time:fixtureTimes[tieIndex%fixtureTimes.length],gameNumber:cupGameNumber++,tieId,completed:false});
      if(definition.twoLegged)fixtures.push({home:away,away:home,competition:'COPA DO BRASIL',phase:definition.name,phaseIndex,leg:'VOLTA',date:new Date(definition.dates[1]),time:fixtureTimes[(tieIndex+1)%fixtureTimes.length],gameNumber:cupGameNumber++,tieId,completed:false});
    });
    const stage={index:phaseIndex,name:definition.name,twoLegged:definition.twoLegged,entrants:[...entrants],fixtures,completed:false,winners:[]};cupCompetition.stages.push(stage);refreshCopaDoBrasilFixtures();rescheduleAllCupFixtures();syncUserCalendarSpacing();cupCompetition.currentPhase=phaseIndex;onCupScheduleChanged();return stage;
  };
  cupCompetition.stages.forEach(stage=>stage.fixtures.sort((a,b)=>a.date-b.date||a.gameNumber-b.gameNumber));
  refreshCopaDoBrasilFixtures();
  let syncUserCalendarSpacing=()=>{rescheduleAllCupFixtures();};
  const calculateRestConflicts=()=>[...clubMatchDates.values()].reduce((total,dates)=>{const ordered=[...dates].sort((a,b)=>a-b);return total+ordered.slice(1).filter((date,index)=>date-ordered[index]<minimumMatchGap).length;},0);
  let restConflictCount=0;
  const fixtureDetails=game=>{if(game.competition==='COPA DO BRASIL'){const date=new Date(game.date),day=String(date.getDate()).padStart(2,'0'),month=date.toLocaleDateString('pt-BR',{month:'short'}).replace('.','').toUpperCase();return{date,display:`${day} ${month}`,time:game.time};}const gameIndex=(championshipFixtures[game.round-1]||[]).findIndex(candidate=>candidate.home===game.home&&candidate.away===game.away);const date=fixtureDate(game.round),day=String(date.getDate()).padStart(2,'0'),month=date.toLocaleDateString('pt-BR',{month:'short'}).replace('.','').toUpperCase();return {date,display:`${day} ${month}`,time:fixtureTimes[Math.max(0,gameIndex)%fixtureTimes.length]};};
  const clubCrestInitials=name=>name.split(' ').filter(Boolean).map(part=>part[0]).join('').slice(0,2).toUpperCase();
  const matchVenueFor=homeClubName=>{if(homeClubName===userClub)return {name:'Estádio Solar',capacity:42000};const club=clubs[homeClubName],seed=[...homeClubName].reduce((sum,char)=>sum+char.charCodeAt(0),0)+(club?.power||70)*17,capacity=Math.round((18000+(seed%52000))/1000)*1000,lastWord=homeClubName.split(' ').filter(Boolean).pop()||homeClubName;return {name:`Estádio ${lastWord}`,capacity};};
  const fixtureCompetitionLabel=game=>{if(game.competition==='COPA DO BRASIL')return `Copa ${game.leg}`;if(isKnockoutShootoutCompetition(game))return `Série D · ${game.leg||'Eliminatórias'}`;return `${game.round}ª`;};
  const isUserFixture=game=>game.home===userClub||game.away===userClub;
  const leagueFixtureRecorded=game=>{
    if(!game?.home||!game?.away)return false;
    const byRound=game.round&&seasonRoundHistory.find(item=>item.round===game.round);
    if(byRound?.games?.some(entry=>entry.home===game.home&&entry.away===game.away))return true;
    return seasonRoundHistory.some(item=>item.games?.some(entry=>entry.home===game.home&&entry.away===game.away));
  };
  const isSerieDGroupStageGame=game=>userDivision!=='D'||(!isKnockoutShootoutCompetition(game)&&(game.round||0)<=SERIE_D_GROUP_ROUNDS);
  const isFixtureCompleted=game=>{
    if(game.competition==='COPA DO BRASIL'||isKnockoutShootoutCompetition(game))return !!game.completed;
    if(leagueFixtureRecorded(game))return true;
    return (game.round||99)<=userLeaguePlayed();
  };
  const userSchedule=()=>{
    const league=championshipFixtures.flat().filter(isUserFixture).filter(isSerieDGroupStageGame);
    const knockout=userGroupStageComplete()?userKnockoutFixtures().filter(isUserFixture):[];
    const cup=copaDoBrasilFixtures.filter(isUserFixture);
    return [...league,...knockout,...cup].map(game=>({game,details:fixtureDetails(game)})).sort((a,b)=>a.details.date-b.details.date||((a.game.round||0)-(b.game.round||0))||String(a.game.leg||'').localeCompare(String(b.game.leg||'')));
  };
  const userKnockoutFixtures=()=>userDivision==='D'?nationalCompetitions.D.fixtures.filter(Array.isArray).flat().filter(isKnockoutShootoutCompetition):[];
  const pendingUserSchedule=()=>userSchedule().filter(entry=>!isFixtureCompleted(entry.game));
  syncUserCalendarSpacing=()=>{
    for(let pass=0;pass<30;pass++){
      const pending=pendingUserSchedule();
      let adjusted=false;
      for(let index=0;index<pending.length-1;index++){
        const gap=pending[index+1].details.date.getTime()-pending[index].details.date.getTime();
        if(gap>=minimumMatchGap)continue;
        const cupEntry=[pending[index],pending[index+1]].find(entry=>entry.game.competition==='COPA DO BRASIL');
        const leagueEntry=[pending[index],pending[index+1]].find(entry=>entry.game.competition!=='COPA DO BRASIL');
        if(!cupEntry||!leagueEntry)continue;
        const target=new Date(leagueEntry.details.date);
        target.setHours(12,0,0,0);
        target.setDate(target.getDate()+(cupEntry.details.date>=leagueEntry.details.date?MIN_REST_DAYS+1:-(MIN_REST_DAYS+1)));
        if(cupEntry.game.date.getTime()===target.getTime())continue;
        cupEntry.game.date=target;
        adjusted=true;
        break;
      }
      if(!adjusted)break;
      rescheduleAllCupFixtures();
    }
  };
  if(!cupCompetition.stages.length&&cupFirstRanked.length===28)createCupStage(1,cupFirstRanked);
  else syncUserCalendarSpacing();
  restConflictCount=calculateRestConflicts();
  if(restConflictCount)console.warn(`Calendário gerado com ${restConflictCount} conflito(s) de descanso.`);
  const seasonMaxRound=()=>userDivision==='D'?22:38;
  const seasonComplete=()=>currentRound>seasonMaxRound();
  const isUserSeasonIdle=()=>!!savedNewGame&&!pendingUserSchedule().length&&!seasonComplete();
  const leagueUserGameForRound=round=>(championshipFixtures[round-1]||[]).find(isUserFixture)||null;
  const daysBetweenDates=(from,to)=>Math.max(1,Math.round(Math.abs(to.getTime()-from.getTime())/86400000));
  const daysUntilNextFixtureFromToday=()=>{const next=nextPendingUserEntry();if(!next)return 0;return Math.max(0,Math.round((next.details.date.getTime()-careerCalendarDate.getTime())/86400000));};
  const formatDashboardDate=date=>date.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.','').toUpperCase();
  const setNextMatchMeta=(lines=[])=>{const el=$('#nextMatchMeta');if(!el)return;const classes=['match-meta-today','match-meta-next','match-meta-extra'];el.innerHTML=lines.filter(Boolean).map((line,index)=>`<span class="match-meta-line ${classes[index]||'match-meta-extra'}">${line}</span>`).join('');};
  const lastCompletedUserEntry=()=>userSchedule().filter(entry=>isFixtureCompleted(entry.game)).pop();
  const firstPendingLeagueRound=()=>Math.max(1,userLeaguePlayed()+1);
  const nextLeagueUserEntry=()=>{
    const maxRound=userDivision==='D'&&!userGroupStageComplete()?SERIE_D_GROUP_ROUNDS:championshipFixtures.length;
    for(let round=firstPendingLeagueRound();round<=maxRound;round++){
      const game=leagueUserGameForRound(round);
      if(game&&!isFixtureCompleted(game))return {game,details:fixtureDetails(game)};
    }
    return null;
  };
  const nextPendingUserEntry=()=>pendingUserSchedule()[0]||nextLeagueUserEntry();
  const normalizeCalendarBeforeNextMatch=()=>{
    const next=nextPendingUserEntry();
    if(!next||isFixtureCompleted(next.game))return;
    const target=new Date(next.details.date);
    target.setHours(12,0,0,0);
    if(careerCalendarDate.getTime()>target.getTime()){
      const resume=new Date(target);
      resume.setDate(resume.getDate()-1);
      resume.setHours(12,0,0,0);
      advanceCareerCalendarTo(resume);
    }
  };
  if(validSavedSeason){
    if(!savedSeason.careerCalendarDate){
      const lastCompleted=userSchedule().filter(entry=>isFixtureCompleted(entry.game)).pop(),nextPending=nextPendingUserEntry();
      advanceCareerCalendarTo(lastCompleted?.details.date??nextPending?.details.date??(currentRound>1?fixtureDate(Math.max(1,currentRound-1)):null)??seasonStartDate());
    }else if(currentRound>1&&sameCalendarDay(careerCalendarDate,seasonStartDate())){
      const lastCompleted=userSchedule().filter(entry=>isFixtureCompleted(entry.game)).pop();
      if(lastCompleted)advanceCareerCalendarTo(lastCompleted.details.date);
    }
    normalizeCalendarBeforeNextMatch();
  }
  const restDaysUntilNextFixture=()=>{const last=lastCompletedUserEntry(),next=nextPendingUserEntry();if(!next)return 3;if(!last)return daysBetweenDates(careerCalendarDate,next.details.date);return daysBetweenDates(last.details.date,next.details.date);};
  const intervalDaysForRoundAdvance=()=>clamp(restDaysUntilNextFixture(),2,12);
  const trainingRecoveryModifiers={before:{'Preparação tática':1,'Treino leve':.94,'Descanso':1.06},after:{'Recuperação':1.18,'Descanso total':1.3,'Análise do jogo':1.06},free:{'Treino equilibrado':1,'Treino técnico':.96,'Descanso intermitente':1.08}};
  const trainingRecoveryMultiplier=type=>trainingRecoveryModifiers[type]?.[trainingRules[type]]??1;
  const dailyRecovery=player=>player.age<=22?6.5:player.age<=26?5.5:player.age<=29?4.5:player.age<=32?3.5:2.5;
  const applyTrainingDay=type=>{const user=clubs[userClub],institution=clubInstitutionalContext(user),mod=trainingRecoveryMultiplier(type);user.roster.forEach(player=>{if(type==='before')player.fatigue=clamp(player.fatigue+(mod-1)*5-(mod<1?(1-mod)*4:0),0,100);else player.fatigue=clamp(player.fatigue+dailyRecovery(player)*institution.recovery*mod,0,100);});};
  const applyPreMatchTraining=()=>{const mod=trainingRecoveryMultiplier('before');clubs[userClub].roster.forEach(player=>{player.fatigue=clamp(player.fatigue+(mod-1)*5-(mod<1?(1-mod)*4:0),0,100);});};
  const fixtureResultLabel=game=>{
    if(game.competition==='COPA DO BRASIL'||isKnockoutShootoutCompetition(game)){
      if(!game.completed&&!game.homeGoals&&game.homeGoals!==0){
        const roundRecord=seasonRoundHistory.find(item=>item.round===game.round),result=roundRecord?.games?.find(item=>item.home===game.home&&item.away===game.away);
        if(result)return `${result.homeGoals}—${result.awayGoals}${result.penalties?` (${result.penalties})`:''}`;
        return null;
      }
      return `${game.homeGoals}—${game.awayGoals}${game.penalties?` (${game.penalties})`:''}`;
    }
    const roundRecord=seasonRoundHistory.find(item=>item.round===game.round),result=roundRecord?.games?.find(item=>item.home===game.home&&item.away===game.away);
    if(!result)return null;
    return `${result.homeGoals}—${result.awayGoals}`;
  };
  let userUpcomingGames=[],nextUserGame=null;
  const refreshUserFixtures=()=>{
    userUpcomingGames=pendingUserSchedule().slice(0,3).map(entry=>entry.game);
    nextUserGame=nextPendingUserEntry()?.game||null;
  };
  const renderUserMatchPresentation=()=>{
    refreshUserFixtures();
    const display=nextPendingUserEntry(),idle=isUserSeasonIdle(),playBtn=$('#playMatch'),simBtn=$('#simulateRemainder'),inspectBtn=$('#inspectOpponent'),calendarBtn=$('#openDashboardCalendar');
    if(playBtn)playBtn.classList.toggle('hidden',idle||seasonComplete());
    if(simBtn)simBtn.classList.toggle('hidden',!idle);
    if(inspectBtn)inspectBtn.classList.toggle('hidden',idle||seasonComplete()||!display);
    if(calendarBtn)calendarBtn.classList.toggle('hidden',idle||seasonComplete());
    if(playBtn&&(idle||seasonComplete())){playBtn.disabled=false;playBtn.title='';}
    if(idle){
      $('#nextMatchRound').textContent=`SEM JOGOS · SÉRIE ${userDivision} · RODADA NACIONAL ${currentRound}`;
      $('#nextMatchHome').textContent=userClub;
      $('#nextMatchAway').textContent='Calendário nacional';
      $('#nextMatchHomePosition').textContent=`${displayedClubPosition(userClub)}º na série`;
      $('#nextMatchAwayPosition').textContent='Aguardando fechamento';
      $('#nextMatchHome').previousElementSibling.textContent=userClub.split(' ').map(part=>part[0]).join('').slice(0,2).toUpperCase();
      $('#nextMatchAwayCrest').textContent='NF';
      setNextMatchMeta(['Sem partidas pendentes','Simule o restante da temporada']);
    }else if(seasonComplete()){
      $('#nextMatchRound').textContent=`TEMPORADA ${careerSeason} ENCERRADA`;
      $('#nextMatchHome').textContent=userClub;
      $('#nextMatchAway').textContent='Próxima temporada';
      $('#nextMatchHomePosition').textContent=`Série ${userDivision}`;
      $('#nextMatchAwayPosition').textContent='Transição';
      $('#nextMatchHome').previousElementSibling.textContent=userClub.split(' ').map(part=>part[0]).join('').slice(0,2).toUpperCase();
      $('#nextMatchAwayCrest').textContent='→';
      setNextMatchMeta(['Temporada encerrada','Confira acessos e rebaixamentos','Inicie a próxima temporada']);
    }else if(display){
      const {game,details}=display,atHome=game.home===userClub,isCup=game.competition==='COPA DO BRASIL',homeClub=clubs[game.home],awayClub=clubs[game.away],daysUntil=daysUntilNextFixtureFromToday(),restDays=restDaysUntilNextFixture(),leagueNext=leagueUserGameForRound(currentRound),onMatchDay=sameCalendarDay(details.date,careerCalendarDate),todayLabel=`HOJE · ${formatDashboardDate(careerCalendarDate)}`;
      if(playBtn){playBtn.disabled=!onMatchDay;playBtn.title=onMatchDay?'Disputar a partida agendada para hoje':'Avance até o dia do jogo para disputar a partida';}
      if(calendarBtn){calendarBtn.disabled=onMatchDay;calendarBtn.title=onMatchDay?'Você já está no dia do jogo':`Simular treinos e avançar até ${details.display}`;}
      $('#nextMatchRound').textContent=isCup?`COPA DO BRASIL · ${game.phase} · ${game.leg}`:isKnockoutShootoutCompetition(game)?`${knockoutCompetitionLabel(game)} · ${game.leg}`:`RODADA ${game.round} · SÉRIE ${userDivision}${userDivision==='D'&&!isKnockoutShootoutCompetition(game)?` · GRUPO A${userSerieDGroupIndex+1}`:''}`;
      $('#nextMatchHome').textContent=game.home;$('#nextMatchAway').textContent=game.away;
      $('#nextMatchHomePosition').textContent=`${displayedClubPosition(homeClub.name)}º colocado`;
      $('#nextMatchAwayPosition').textContent=`${displayedClubPosition(awayClub.name)}º colocado`;
      $('#nextMatchHome').previousElementSibling.textContent=game.home.split(' ').map(part=>part[0]).join('').slice(0,2).toUpperCase();
      $('#nextMatchAwayCrest').textContent=game.away.split(' ').map(part=>part[0]).join('').slice(0,2).toUpperCase();
      setNextMatchMeta(onMatchDay?[
        todayLabel,
        `${atHome?'EM CASA':'FORA'} · ${details.display} · ${details.time}`,
        `${restDays>1?`${restDays} dias de intervalo`:''}${isCup&&leagueNext?`${restDays>1?' · ':''}Brasileirão: R${leagueNext.round}`:''}`.trim()||'Dispute a partida hoje'
      ]:[
        `Calendário · ${formatDashboardDate(careerCalendarDate)}`,
        `Próximo jogo · ${details.display} · ${details.time}`,
        daysUntil>0?`Use Dia de Jogo para avançar (${daysUntil} ${daysUntil===1?'dia':'dias'})`:'Use Dia de Jogo para avançar'
      ]);
    }
    $('#clubUpcomingMatches').innerHTML=userUpcomingGames.length?userUpcomingGames.map(game=>{const atHome=game.home===userClub,details=fixtureDetails(game),isCup=game.competition==='COPA DO BRASIL',isKo=isKnockoutShootoutCompetition(game),label=fixtureCompetitionLabel(game);return `<div class="club-upcoming-row ${isCup||isKo?'cup-row':''}"><span>${label}</span><span><b class="club-link" data-club="${game.home}" role="button" tabindex="0">${game.home}</b> <i>×</i> <b class="club-link" data-club="${game.away}" role="button" tabindex="0">${game.away}</b></span><span>${details.display} · ${details.time}</span><span class="${atHome?'home':'away'}">${atHome?'CASA':'FORA'}</span></div>`;}).join(''):`<div class="club-upcoming-row idle-row"><span>—</span><span><b>${idle?'Nenhum jogo restante do clube':seasonComplete()?'Temporada encerrada':'Agenda em atualização'}</b></span><span>${idle?`Nacional na rodada ${currentRound}`:'—'}</span><span class="away">—</span></div>`;
  };
  const outfield = value => value || '—';
  const playerStatusBadges=(player,liveState=null)=>{
    const badges=[],limit=YELLOW_SUSPENSION_LIMIT,pushYellow=count=>{for(let index=0;index<count;index++)badges.push('<i class="player-badge player-badge-yellow" aria-hidden="true" title="Cartão amarelo"></i>');};
    if(liveState){
      if(liveState.red)badges.push('<i class="player-badge player-badge-red" aria-hidden="true" title="Cartão vermelho"></i>');
      else if(liveState.yellow)pushYellow(clamp(Number(liveState.yellow)||1,1,limit));
      if(liveState.injured)badges.push('<i class="player-badge player-badge-injury severe" aria-hidden="true" title="Lesionado"></i>');
      else if(liveState.playThroughRisk)badges.push('<i class="player-badge player-badge-injury mild" aria-hidden="true" title="Incômodo físico"></i>');
    }else{
      const discipline=player.discipline||{};
      pushYellow(clamp(Number(discipline.yellowAccumulation)||0,0,limit));
      if(Number(discipline.redCards)>0)badges.push('<i class="player-badge player-badge-red" aria-hidden="true" title="Cartão vermelho"></i>');
      else if(Number(discipline.suspensionMatches)>0)badges.push('<i class="player-badge player-badge-suspended" aria-hidden="true" title="Suspenso"></i>');
      const injury=player.injury;
      if(injury&&(injuryInAcutePhase(injury)||injuryInRestrictedPhase(injury))){
        const grade=injury.grade??(injury.severity==='Grave'?3:injury.severity==='Mediana'?2:1);
        const severity=injury.severity||injurySeverityLabel(grade),tone=grade>=3?'severe':grade===2?'moderate':'mild';
        badges.push(`<i class="player-badge player-badge-injury ${tone}" aria-hidden="true" title="Lesão ${severity}"></i>`);
      }
    }
    return badges.length?`<span class="player-status-badges">${badges.join('')}</span>`:'';
  };
  const playerNameCell=(name,player,{prefix='',liveState=null}={})=>`<b class="player-name-cell">${prefix?`<span class="player-name-prefix">${prefix}</span>`:''}<span class="player-name-text">${name}</span>${playerStatusBadges(player,liveState)}</b>`;
  const playerStatusCss=document.createElement('style');playerStatusCss.textContent='.player-name-cell{display:flex;align-items:center;gap:6px;min-width:0;font-weight:700}.player-name-prefix,.starter-number{color:#63d9ff;font-weight:700;flex-shrink:0}.player-name-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}.player-status-badges{display:inline-flex;align-items:center;gap:3px;flex-shrink:0}.player-badge{display:inline-block;flex:none}.player-badge-yellow{width:7px;height:10px;border-radius:1px;background:linear-gradient(180deg,#ffe866,#ffc933);border:1px solid #a67c00;box-shadow:0 1px 2px #0006}.player-badge-red{width:7px;height:10px;border-radius:1px;background:linear-gradient(180deg,#ff7a7a,#e31b1b);border:1px solid #8b1010;box-shadow:0 1px 2px #0006}.player-badge-suspended{width:10px;height:10px;border-radius:50%;border:1px solid #ff8993;background:#3a1519;box-shadow:inset 0 0 0 1px #ff637044}.player-badge-suspended:after{content:"";display:block;width:8px;height:1.5px;margin:3px auto;background:#ff8993;transform:rotate(-35deg)}.player-badge-injury{width:12px;height:12px;border-radius:50%;position:relative;color:#ffd06b;border:1px solid currentColor;background:#2a2418}.player-badge-injury.moderate{color:#ff9b3d;background:#2a1f14}.player-badge-injury.severe{color:#ff6370;background:#3a1519}.player-badge-injury:before,.player-badge-injury:after{content:"";position:absolute;background:currentColor;border-radius:1px}.player-badge-injury:before{width:6px;height:1.5px;top:50%;left:50%;transform:translate(-50%,-50%)}.player-badge-injury:after{width:1.5px;height:6px;top:50%;left:50%;transform:translate(-50%,-50%)}#squad .player-row>span:first-child .player-name-cell{width:100%}.substitution-player-row .sub-name .player-name-cell{display:inline-flex;max-width:100%;font-size:9px;font-weight:400}.analysis-player .player-name-cell,.live-opponent-player .player-name-cell{display:flex;width:100%}#tactics .tactic-player-row .player-name-cell{width:100%}';document.head.append(playerStatusCss);
  const renderRoster = () => $('#playerList').innerHTML = squad.map(p => `<div class="player-row roster-expanded"><span>${playerNameCell(p.name,p)}</span><span class="badge">${p.pos}</span><span>${p.age}</span><span>${p.potential ?? p.overall}</span><span>${p.height ? `${p.height} cm` : '—'}</span><span>${p.preferredFoot || '—'}</span><span>${p.personality || '—'}</span><span>${p.injuryProneness ?? '—'}</span><span>${p.overall}</span><span>${p.dribble}</span><span>${p.speed}</span><span>${p.marking}</span><span>${p.tackling}</span><span>${p.finishing}</span><span>${p.passing}</span><span>${p.heading}</span><span>${outfield(p.positioning)}</span><span>${outfield(p.penaltySaving)}</span><span>${outfield(p.reflexes)}</span><span>${p.freeKick}</span><span>${p.penaltyTaking}</span><span>${p.playmaking}</span><span class="roster-fatigue"><i><b style="width:${clamp(p.fatigue,0,100)}%"></b></i><em>${Math.round(p.fatigue)}%</em></span></div>`).join('');
  renderRoster();
  const leagueRow=(row,index)=>`<div class="league-row ${row.club === userClub ? 'highlight' : ''}" data-club="${row.club}" role="button" tabindex="0"><span>${userDivision==='D'?index+1:clubs[row.club].position}</span><span class="club-link">${row.club}</span><span>${row.played}</span><span>${row.wins}</span><span>${row.draws}</span><span>${row.losses}</span><span>${row.goalDiff>=0?'+':''}${row.goalDiff}</span><span>${row.points}</span></div>`;
  $('#leagueTable').innerHTML = displayedLeagueRows().map(leagueRow).join('');
  renderDashboardMiniTable();
  renderDashboardUpcoming();
  $('.upcoming-dashboard label em').textContent=`RODADA ${currentRound}`;
  let leaderMode='scorers';
  const renderLeaders=()=>{const entries=leadersFor(userDivision,leaderMode),metric=leaderMode==='scorers'?'goals':'assists';$('#leaderColumnName').textContent='JOGADOR';$('#leaderValueName').textContent=leaderMode==='scorers'?'GOLS':'AST';$('#leadersTable').innerHTML=entries.slice(0,3).map((entry,index)=>`<div class="leader-row"><span>${index+1}</span><span><b>${entry.name}</b><small class="club-link" data-club="${entry.club}" role="button" tabindex="0">${entry.club}</small></span><span>${entry[metric]}</span></div>`).join('');$$('[data-leader-tab]').forEach(button=>button.classList.toggle('active',button.dataset.leaderTab===leaderMode));};
  renderLeaders();
  onClick('.leader-tabs',event=>{const tab=event.target.closest('[data-leader-tab]');if(!tab)return;leaderMode=tab.dataset.leaderTab;renderLeaders();});
  renderUserMatchPresentation();
  const resolveNationalRankingEntry=entry=>{
    const club=clubs[entry.club];if(!club)return null;
    const base=computeNationalRankingBase(club),competition=nationalCompetitions[club.division],seasonFinalized=nationalRankingFinalizedSeasons.has(careerSeason);
    const rawLeaguePoints=seasonFinalized?0:(competition?.standings.find(row=>row.club===entry.club)?.points||0);
    const seasonLeaguePoints=roundRankingScore(rawLeaguePoints*nationalLeaguePointWeights[club.division]);
    const storedChampionshipPoints=roundRankingScore(entry.championshipPoints);
    const championshipPoints=roundRankingScore(storedChampionshipPoints+seasonLeaguePoints);
    const cupTitleProvisional=(!seasonFinalized&&cupCompetition.champion===entry.club&&!entry.titles.some(title=>title.season===careerSeason&&title.competition==='COPA DO BRASIL'))?nationalTitleBonuses.CUP:0;
    const storedTitlePoints=roundRankingScore(entry.titlePoints);
    const titlePoints=roundRankingScore(storedTitlePoints+cupTitleProvisional);
    const total=roundRankingScore(base+championshipPoints+titlePoints);
    return {...entry,base,seasonLeaguePoints,storedChampionshipPoints,storedTitlePoints,cupTitleProvisional,championshipPoints,titlePoints,total,division:club.division,overall:clubSquadOverall(club),environment:club.environment};
  };
  const currentNationalRanking=()=>Object.values(nationalRankingEntries).map(resolveNationalRankingEntry).filter(Boolean).sort((a,b)=>b.total-a.total||b.titlePoints-a.titlePoints||b.championshipPoints-a.championshipPoints||a.club.localeCompare(b.club,'pt-BR'));
  const nationalRankingRowHtml=(entry,position,{pinned=false}={})=>{
    const clubMarkup=pinned?`<span class="national-ranking-club-cell"><i class="crest national-ranking-row-crest" aria-hidden="true">${clubInitials}</i><span class="club-link">${entry.club}</span></span>`:`<span class="club-link">${entry.club}</span>`;
    const userRow=entry.club===userClub,scoreHint=`Base ${entry.base.toFixed(1)} + Campeonatos ${entry.championshipPoints.toFixed(1)} + Títulos ${entry.titlePoints.toFixed(1)}`;
    return `<div class="national-ranking-row${pinned?' national-ranking-user-row user-ranking':userRow?' user-ranking':''}" data-club="${entry.club}" role="button" tabindex="0" aria-label="${entry.club} · ${scoreHint} · Total ${entry.total.toFixed(1)}"><span>${position}</span>${clubMarkup}<span>${entry.division}</span><span class="national-ranking-base national-ranking-col-hidden" aria-hidden="true">${entry.base.toFixed(1)}</span><span class="national-ranking-championships national-ranking-col-hidden" aria-hidden="true">${entry.championshipPoints.toFixed(1)}</span><span class="national-ranking-titles">${entry.titlePoints.toFixed(1)}</span><span class="national-ranking-total" title="${scoreHint}">${entry.total.toFixed(1)}</span></div>`;
  };
  const renderNationalRanking=()=>{
    const ranking=currentNationalRanking(),userIndex=ranking.findIndex(entry=>entry.club===userClub),userSlot=$('#nationalRankingUserRow');
    if(userIndex>=0){userSlot.innerHTML=nationalRankingRowHtml(ranking[userIndex],userIndex+1,{pinned:true});userSlot.hidden=false;}
    else{userSlot.innerHTML='';userSlot.hidden=true;}
    $('#nationalRankingTable').innerHTML=ranking.map((entry,index)=>nationalRankingRowHtml(entry,index+1,{pinned:false})).join('');
  };
  renderNationalRanking();
  const router=createRouter({ $$, onClick });
  router.onView('ranking',renderNationalRanking);
  router.onView('messages',renderMessages);
  router.bindNav();
  messages.bindHandlers({ openView:viewId=>router.openView(viewId) });
  if(savedNewGame&&!messages.getMessages().length)pushMessage({category:'club',type:'welcome',title:'Nova temporada',body:`${userClub} inicia a temporada ${careerSeason} na Série ${userDivision}. A jornada começa em 1º de janeiro; os campeonatos seguem o calendário nacional da CBF.`,round:currentRound,read:true});
  updateMessageBadge();renderDashboardMessagesFeed();
  let seasonCalendarFixtures=[...championshipFixtures.flat(),...copaDoBrasilFixtures].sort((a,b)=>fixtureDetails(a).date-fixtureDetails(b).date);
  $('#calendar .title p').textContent=`TEMPORADA ${careerSeason} · BRASILEIRÃO SÉRIE ${userDivision} + COPA DO BRASIL`;
  $('#calendar .title span').textContent=`Agenda nacional de janeiro a dezembro · ${championshipFixtures.flat().length} jogos do Brasileiro · ${copaDoBrasilFixtures.length} jogos confirmados da Copa do Brasil · ${calendarIntervalLabel(restConflictCount)}.`;
  $('.calendar-toolbar').insertAdjacentHTML('afterend',`<div id="calendarYearMonths" class="calendar-year-months">${Array.from({length:12},(_,month)=>`<button type="button" data-calendar-month="${month}">${new Date(careerSeason,month,1).toLocaleDateString('pt-BR',{month:'short'}).replace('.','').toUpperCase()}</button>`).join('')}</div>`);
  $('.calendar-legend').insertAdjacentHTML('beforeend','<span><i class="cup"></i>COPA DO BRASIL</span>');
  $('.calendar-sidebar').insertAdjacentHTML('beforeend',`<article class="card calendar-routine-card"><label>ROTINA DA SEMANA</label><div id="calendarRoutineSummary" class="calendar-routine-summary"></div></article><article class="card cup-calendar-card"><label>COPA DO BRASIL ${careerSeason}</label><strong>126 CLUBES · 9 FASES</strong><p>1ª à 4ª fase em jogo único. Da 5ª fase à semifinal em ida e volta. Os 20 clubes da Série A entram na 5ª fase.</p><div><span>INÍCIO<b>18 FEV</b></span><span>FINAL ÚNICA<b>06 DEZ</b></span></div></article>`);
  const fullCalendarCss=document.createElement('style');fullCalendarCss.textContent='.calendar-year-months{display:grid;grid-template-columns:repeat(12,1fr);gap:4px;padding:8px 0 12px}.calendar-year-months button{min-width:0;padding:7px 2px!important;background:#0d2732!important;color:#9ebfc2!important;border:1px solid #28505b!important;font-size:8px!important}.calendar-year-months button.active{background:#1d5a6d!important;color:#fff!important;border-color:#63d9ff!important;box-shadow:inset 0 -2px #b6ff38}#calendarAdvanceWeek{min-width:118px!important;background:#1d5a6d!important;color:#fff!important;border-color:#63d9ff!important;box-shadow:inset 0 -2px #b6ff38!important}#calendarAdvanceWeek:disabled{opacity:.45;cursor:not-allowed!important;box-shadow:none!important}.calendar-day.planning-week{background:#0f2430!important}.calendar-day.matchday-stop{box-shadow:inset 0 0 0 2px #ffc94f!important}.calendar-day .cup-match{background:#ffc94f!important;color:#171003!important}.calendar-day.completed-user{opacity:.78}.calendar-day.completed-user time{text-decoration:line-through;text-decoration-color:#63d9ff55}.calendar-day .completed-score{color:#b6ff38!important;font-weight:700}.calendar-day.career-today{outline:2px solid #63d9ff;outline-offset:-2px}.calendar-day.career-today time{color:#63d9ff;font-weight:700}.calendar-legend i.cup{background:#ffc94f!important}.agenda-item.cup{border-left-color:#ffc94f!important;background:#281f0d!important}.agenda-item.cup small{color:#ffc94f!important}.agenda-item.completed{opacity:.88}.agenda-item.completed strong em{color:#b6ff38;font-style:normal;font-weight:700}.calendar-routine-card{padding:14px!important}.calendar-routine-summary{display:grid;gap:8px}.calendar-routine-summary .routine-alert{padding:10px 11px;border-radius:5px;font-size:10px;line-height:1.45}.calendar-routine-summary .routine-alert.matchday{background:#2b220d;border:1px solid #ffc94f;color:#ffe6a8}.calendar-routine-summary .routine-stat{padding:9px 10px;background:#102b35;border:1px solid #28505b;border-radius:5px}.calendar-routine-summary small{display:block;color:#63d9ff;font:700 8px DM Sans;letter-spacing:.55px}.calendar-routine-summary strong{display:block;margin-top:4px;color:#edf8f5;font:700 13px Barlow Condensed;line-height:1.25}.club-upcoming-row.cup-row span:first-child{color:#ffc94f}.cup-calendar-card{padding:16px!important}.cup-calendar-card>strong{display:block;margin:13px 0 7px;color:#b6ff38;font:700 20px Barlow Condensed}.cup-calendar-card p{margin:0;color:#9ebfc2;font-size:10px;line-height:1.5}.cup-calendar-card>div{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:12px}.cup-calendar-card span{padding:8px;background:#102b35;color:#63d9ff;font-size:7px}.cup-calendar-card span b{display:block;margin-top:3px;color:#edf8f5;font-size:11px}@media(max-width:900px){.calendar-year-months{grid-template-columns:repeat(6,1fr)}}@media(max-width:520px){.calendar-year-months{grid-template-columns:repeat(4,1fr)}}';document.head.append(fullCalendarCss);
  const calendarKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const calendarDate=key=>{const [year,month,day]=key.split('-').map(Number);return new Date(year,month-1,day,12);};
  const matchBriefAlreadySent=briefKey=>messages.getMessages().some(message=>message.meta?.briefKey===briefKey);
  const opponentForGame=game=>game.home===userClub?game.away:game.home;
  const competitionLabelForGame=game=>game.competition==='COPA DO BRASIL'?`Copa do Brasil · ${game.phase||game.leg||''}`:isKnockoutShootoutCompetition(game)?`Série D · ${game.leg||'Eliminatórias'}`:`Brasileirão Série ${userDivision} · Rodada ${game.round??currentRound}`;
  const pushMatchDayBrief=game=>{
    if(!game)return;
    const opponent=opponentForGame(game),details=fixtureDetails(game),briefKey=`matchday-${game.home}-${game.away}-${calendarKey(details.date)}`;
    if(matchBriefAlreadySent(briefKey))return;
    const leaders=clubSeasonLeaders(opponent),venue=game.home===userClub?'Casa':'Fora';
    pushMessage({category:'competition',type:'matchday',title:`Jogo do dia · ${opponent}`,body:`${details.display} · ${details.time} · ${venue}. ${competitionLabelForGame(game)}. Destaques do adversário: artilheiro ${leaders.scorer.name} (${leaders.goals} gols) · assistências ${leaders.assistant.name} (${leaders.assists}).`,round:currentRound,meta:{competition:competitionLabelForGame(game),briefKey,opponent}});
  };
  const pushSeasonEndBrief=()=>{
    const row=nationalCompetitions[userDivision]?.standings?.find(item=>item.club===userClub),position=displayedClubPosition(userClub);
    pushMessage({category:'competition',type:'season-end',title:`Temporada ${careerSeason} encerrada`,body:`${userClub} terminou em ${position}º na Série ${userDivision}${row?` · ${row.points} pts (${row.wins}V-${row.draws}E-${row.losses}D · saldo ${row.goalDiff>=0?'+':''}${row.goalDiff})`:''}. Confira acessos, rebaixamentos e campeões na transição de temporada.`,round:currentRound,meta:{competition:`Brasileirão Série ${userDivision}`}});
  };
  const notifySerieDKnockoutPhase=(startRound,label)=>{
    const fixtures=(nationalCompetitions.D.fixtures[startRound-1]||[]).concat(nationalCompetitions.D.fixtures[startRound]||[]);
    if(!fixtures.some(game=>game.home===userClub||game.away===userClub))return;
    const briefKey=`serie-d-ko-${startRound}`;
    if(matchBriefAlreadySent(briefKey))return;
    pushMessage({category:'competition',type:'phase-advance',title:`Série D · ${label}`,body:`${userClub} avançou para ${label}. Os confrontos em ida e volta já estão no calendário.`,round:currentRound,meta:{competition:'Série D · Eliminatórias',briefKey}});
  };
  const calendarGames=new Map();
  const rebuildCalendarGames=()=>{
    seasonCalendarFixtures=[...championshipFixtures.flat(),...userKnockoutFixtures(),...copaDoBrasilFixtures].sort((a,b)=>fixtureDetails(a).date-fixtureDetails(b).date);
    calendarGames.clear();
    seasonCalendarFixtures.forEach(game=>{const key=calendarKey(fixtureDetails(game).date);if(!calendarGames.has(key))calendarGames.set(key,[]);calendarGames.get(key).push(game);});
    restConflictCount=calculateRestConflicts();
  };
  rebuildCalendarGames();
  const initialCalendarDate=validSavedSeason?careerCalendarDate:seasonStartDate();
  let calendarCursor=new Date(careerSeason,initialCalendarDate.getMonth(),1);
  let selectedCalendarDate=new Date(initialCalendarDate.getFullYear(),initialCalendarDate.getMonth(),initialCalendarDate.getDate());
  const openDashboardCalendarView=()=>{selectedCalendarDate=new Date(careerCalendarDate);calendarCursor=new Date(careerSeason,careerCalendarDate.getMonth(),1);$$('.nav').find(button=>button.dataset.view==='calendar')?.click();renderCalendar();};
  const trainingOptions={before:['Preparação tática','Treino leve','Descanso'],after:['Recuperação','Descanso total','Análise do jogo'],free:['Treino equilibrado','Treino técnico','Descanso intermitente']};
  let trainingRules={before:'Preparação tática',after:'Recuperação',free:'Treino equilibrado'};
  if(validSavedSeason&&savedSeason.trainingRules)trainingRules={...trainingRules,...savedSeason.trainingRules};
  else try{trainingRules={...trainingRules,...JSON.parse(localStorage.getItem('matchday-training-rules')||'{}')};}catch{}
  const seasonEndDate=()=>new Date(careerSeason,11,31,12);
  const weekBounds=date=>{const start=new Date(date);start.setDate(start.getDate()-start.getDay());start.setHours(12,0,0,0);const end=new Date(start);end.setDate(end.getDate()+6);end.setHours(12,0,0,0);return{start,end};};
  const formatWeekDay=date=>`${String(date.getDate()).padStart(2,'0')} ${date.toLocaleDateString('pt-BR',{month:'short'}).replace('.','').toUpperCase()}`;
  const userMatchOnDate=date=>{
    const fromMap=(calendarGames.get(calendarKey(date))||[]).find(game=>isUserFixture(game)&&!isFixtureCompleted(game));
    if(fromMap)return fromMap;
    return pendingUserSchedule().find(entry=>sameCalendarDay(entry.details.date,date))?.game||null;
  };
  const completedUserMatchOnDate=date=>(calendarGames.get(calendarKey(date))||[]).find(game=>isUserFixture(game)&&isFixtureCompleted(game))||null;
  const isOnPendingMatchDay=()=>!!userMatchOnDate(careerCalendarDate);
  const trainingTypeForDate=date=>{const tomorrow=new Date(date);tomorrow.setDate(tomorrow.getDate()+1);if(userMatchOnDate(tomorrow))return'before';const yesterday=new Date(date);yesterday.setDate(yesterday.getDate()-1);if(completedUserMatchOnDate(yesterday))return'after';return'free';};
  const calendarTrainingMap=()=>{const map=new Map(),add=(date,type)=>{const key=calendarKey(date);if(!map.has(key))map.set(key,[]);if(!map.get(key).some(item=>item.type===type))map.get(key).push({type,label:trainingRules[type]});};seasonCalendarFixtures.filter(isUserFixture).forEach(game=>{const matchDate=fixtureDetails(game).date,before=new Date(matchDate),after=new Date(matchDate);before.setDate(before.getDate()-1);after.setDate(after.getDate()+1);add(before,'before');add(after,'after');});const {start,end}=weekBounds(careerCalendarDate);for(let cursor=new Date(start);cursor<=end;cursor.setDate(cursor.getDate()+1)){const key=calendarKey(cursor);if(map.has(key))continue;if(!(calendarGames.get(key)||[]).some(isUserFixture))add(new Date(cursor),'free');}return map;};
  const renderTrainingRules=()=>{$$('#trainingRules [data-training-rule]').forEach(button=>button.querySelector('strong').textContent=trainingRules[button.dataset.trainingRule]);};
  const matchReportCss=document.createElement('style');matchReportCss.textContent='.agenda-item.has-report{grid-template-columns:54px minmax(0,1fr) 34px!important}.agenda-match-report{display:grid!important;place-items:center;width:32px!important;height:32px!important;min-height:0!important;padding:0!important;margin-left:auto;border:1px solid #3a6b77!important;border-radius:5px!important;background:#12313c!important;color:#75dfff!important;font-size:17px!important;line-height:1!important}.agenda-match-report:hover{background:#1b4a59!important;border-color:#75dfff!important;color:#fff!important}.match-report-modal{width:min(790px,calc(100vw - 24px));text-align:left}.match-report-modal>p{margin:0 0 14px;color:#9eb6b8;font-size:10px}.match-report-score{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:18px;padding:17px;border:1px solid #28505b;border-radius:7px;background:#0b1d25}.match-report-score span{font:700 15px Barlow Condensed;color:#edf8f5}.match-report-score span:last-child{text-align:right}.match-report-score strong{font:700 35px Barlow Condensed;color:#b6ff38}.match-report-goals{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:10px 0}.match-report-goals article{padding:10px 12px;border:1px solid #28505b;border-radius:6px;background:#0c2029}.match-report-goals b{display:block;margin-bottom:5px;color:#63d9ff;font-size:9px}.match-report-goals span{display:block;color:#e9f4f2;font-size:10px;line-height:1.5}.match-report-stats{overflow:hidden;border:1px solid #28505b;border-radius:7px}.match-report-stats h3{margin:0;padding:9px 12px;background:#123843;color:#b6ff38;text-align:center;font:700 18px Barlow Condensed}.match-report-stat{display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:8px;align-items:center;padding:8px 12px;border-top:1px solid #234650;font-size:10px}.match-report-stat span:first-child{color:#63d9ff;font-weight:700}.match-report-stat span:nth-child(2){text-align:center;color:#b8cbce}.match-report-stat span:last-child{text-align:right;color:#63d9ff;font-weight:700}.match-report-empty{padding:22px;border:1px solid #28505b;border-radius:7px;color:#9eb6b8;text-align:center;font-size:11px}@media(max-width:560px){.match-report-score{gap:7px;padding:12px}.match-report-score span{font-size:11px}.match-report-score strong{font-size:27px}.match-report-goals{grid-template-columns:1fr}}';document.head.append(matchReportCss);
  document.body.insertAdjacentHTML('beforeend',`<div id="calendarMatchReportModal" class="modal hidden"><div class="modal-card match-report-modal"><button id="closeCalendarMatchReport" class="close">×</button><label>RELATÓRIO DA PARTIDA</label><h2 id="matchReportTitle">Estatísticas finais</h2><p id="matchReportMeta"></p><div id="matchReportContent"></div></div></div><div id="treatmentModal" class="modal hidden"><div class="modal-card treatment-modal"><button id="closeTreatmentModal" class="close" type="button">×</button><label>DECISÃO MÉDICA</label><h2 id="treatmentPlayerName"></h2><p id="treatmentInjuryName" class="treatment-injury-name"></p><p id="treatmentModalText"></p><div class="treatment-actions"><button id="treatmentConservative" type="button">TRATAMENTO CONSERVADOR</button><button id="treatmentSurgery" type="button">CIRURGIA</button></div></div></div>`);
  onClick('#closeTreatmentModal',()=>{if(pendingTreatmentDecision)finishTreatmentChoice('conservative');});
  onClick('#treatmentConservative',()=>finishTreatmentChoice('conservative'));
  onClick('#treatmentSurgery',()=>finishTreatmentChoice('surgery'));
  const calendarReportGames=new Map();
  const calendarGameResult=game=>{
    if(game.competition==='COPA DO BRASIL')return game.completed?{game,result:game,data:game.data||null,goals:game.goals||null}:null;
    const roundRecord=seasonRoundHistory.find(item=>item.round===game.round),result=roundRecord?.games?.find(item=>item.home===game.home&&item.away===game.away);if(!result)return null;
    if(result.data)return{game,result,data:result.data,goals:result.goals||null};
    if(roundRecord.userStats&&isUserFixture(game)){
      const userHome=game.home===userClub,h=userHome?roundRecord.userStats.home:roundRecord.userStats.away,a=userHome?roundRecord.userStats.away:roundRecord.userStats.home,userGoals=roundRecord.userStats.goals||{home:[],away:[]},userPossession=clamp(Math.round(roundRecord.userStats.home.possession),28,72),homePossession=userHome?userPossession:100-userPossession;
      return{game,result,goals:userHome?userGoals:{home:userGoals.away||[],away:userGoals.home||[]},data:{homePossession,awayPossession:100-homePossession,homePasses:h.passes,awayPasses:a.passes,homeAccurate:h.accurate,awayAccurate:a.accurate,homeShots:h.shots,awayShots:a.shots,homeOff:h.off,awayOff:a.off,homeOnTarget:h.on,awayOnTarget:a.on,homeSaved:h.saved,awaySaved:a.saved,homePenalties:h.penalties,awayPenalties:a.penalties,homeCorners:h.corners,awayCorners:a.corners,homeOffsides:h.offsides,awayOffsides:a.offsides,homeKeeperSaves:h.keeperSaves,awayKeeperSaves:a.keeperSaves,homeTackles:h.tackles,awayTackles:a.tackles,homeFouls:h.fouls,awayFouls:a.fouls,homeYellow:h.yellow,awayYellow:a.yellow,homeRed:h.red,awayRed:a.red}};
    }
    return{game,result,data:null,goals:result.goals||null};
  };
  const reportPercent=(accurate,passes)=>passes?`${Math.round(accurate/passes*100)}%`:'0%';
  const openCalendarMatchReport=entry=>{const {game,result,data,goals}=entry,isCup=game.competition==='COPA DO BRASIL';$('#matchReportTitle').textContent='Estatísticas finais';$('#matchReportMeta').textContent=isCup?`Copa do Brasil · ${game.phase} · ${game.leg}`:isKnockoutShootoutCompetition(game)?`Série D · ${game.leg||'Eliminatórias'}`:`Brasileirão Série ${userDivision} · Rodada ${game.round}`;const scorerList=(side,score)=>{const entries=goals?.[side]||[];if(entries.length)return entries.map(goal=>`<span>${goal.minute?`${goal.minute}' · `:''}${goal.name}${goal.type==='penalty'?' (pênalti)':goal.type==='freeKick'?' (falta)':goal.type==='corner'?' (cabeça)':''}</span>`).join('');return Number(score)===0?'<span>Nenhum gol</span>':'<span>Autores não registrados</span>';};const score=`${result.homeGoals} — ${result.awayGoals}${result.penalties?` <small>(${result.penalties} pên.)</small>`:''}`,header=`<div class="match-report-score"><span>${game.home}</span><strong>${score}</strong><span>${game.away}</span></div><div class="match-report-goals"><article><b>${game.home.toUpperCase()}</b>${scorerList('home',result.homeGoals)}</article><article><b>${game.away.toUpperCase()}</b>${scorerList('away',result.awayGoals)}</article></div>`;if(!data){$('#matchReportContent').innerHTML=header+'<div class="match-report-empty">O placar está preservado, mas esta partida foi simulada antes do armazenamento das estatísticas detalhadas.</div>';$('#calendarMatchReportModal').classList.remove('hidden');return;}const v=key=>Number(data[key]??0),rows=[['Posse de bola',`${v('homePossession')}%`,`${v('awayPossession')}%`],['Total de Passes',v('homePasses'),v('awayPasses')],['% passes certos',reportPercent(v('homeAccurate'),v('homePasses')),reportPercent(v('awayAccurate'),v('awayPasses'))],['Passes errados',v('homePasses')-v('homeAccurate'),v('awayPasses')-v('awayAccurate')],['Finalizações',v('homeShots'),v('awayShots')],['Para Fora',v('homeOff')||Math.max(0,v('homeShots')-v('homeOnTarget')),v('awayOff')||Math.max(0,v('awayShots')-v('awayOnTarget'))],['No Gol',v('homeOnTarget'),v('awayOnTarget')],['Defendidas',v('homeSaved'),v('awaySaved')],['Pênaltis',v('homePenalties'),v('awayPenalties')],['Escanteios',v('homeCorners'),v('awayCorners')],['Impedimentos',v('homeOffsides'),v('awayOffsides')],['Defesas do Goleiro',v('homeKeeperSaves'),v('awayKeeperSaves')],['Desarmes',v('homeTackles'),v('awayTackles')],['Faltas Cometidas',v('homeFouls'),v('awayFouls')],['Cartões Amarelos',v('homeYellow'),v('awayYellow')],['Cartões Vermelhos',v('homeRed'),v('awayRed')]];$('#matchReportContent').innerHTML=header+`<div class="match-report-stats"><h3>ESTATÍSTICAS DA PARTIDA</h3>${rows.map(row=>`<div class="match-report-stat"><span>${row[1]}</span><span>${row[0]}</span><span>${row[2]}</span></div>`).join('')}</div>`;$('#calendarMatchReportModal').classList.remove('hidden');};
  const renderCalendarRoutine=()=>{const next=nextPendingUserEntry(),rest=restDaysUntilNextFixture(),afterBoost=Math.round((trainingRecoveryMultiplier('after')-1)*100),beforeLabel=trainingRules.before,afterLabel=trainingRules.after,careerDayLabel=careerCalendarDate.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.','').toUpperCase(),{start:weekStart,end:weekEnd}=weekBounds(careerCalendarDate),weekLabel=`${formatWeekDay(weekStart)} — ${formatWeekDay(weekEnd)}`,onMatchDay=isOnPendingMatchDay(),nextLabel=next?`${next.details.display} · ${next.game.competition==='COPA DO BRASIL'?`Copa · ${next.game.phase}`:`Rodada ${next.game.round}`}`:seasonComplete()?'Temporada encerrada':isUserSeasonIdle()?`Sem jogos do clube · calendário nacional (R${currentRound})`:'Aguardando definição';const el=$('#calendarRoutineSummary');if(el)el.innerHTML=`${onMatchDay?'<div class="routine-alert matchday">Dia de jogo · ajuste táticas e dispute a partida no dashboard antes de avançar a semana.</div>':''}<div class="routine-stat"><small>SEMANA EM PLANEJAMENTO</small><strong>${weekLabel}</strong></div><div class="routine-stat"><small>DATA ATUAL DA TEMPORADA</small><strong>${careerDayLabel}</strong></div><div class="routine-stat"><small>INTERVALO ATÉ O PRÓXIMO JOGO</small><strong>${next?`${rest} ${rest===1?'dia':'dias'}`:'—'}</strong></div><div class="routine-stat"><small>PRÓXIMO COMPROMISSO</small><strong>${nextLabel}</strong></div><div class="routine-stat"><small>ROTINA PÓS-JOGO</small><strong>${afterLabel}${afterBoost>0?` (+${afterBoost}% recuperação)`:''}</strong></div><div class="routine-stat"><small>ROTINA PRÉ-JOGO</small><strong>${beforeLabel}</strong></div>`;const advanceBtn=$('#calendarAdvanceWeek');if(advanceBtn){const blocked=onMatchDay||seasonComplete()||isUserSeasonIdle();advanceBtn.disabled=blocked;advanceBtn.title=onMatchDay?'Dispute a partida antes de avançar a semana':seasonComplete()?'Temporada encerrada':isUserSeasonIdle()?'Sem jogos do clube nesta fase':'Simula até 7 dias de treino; para no dia de jogo do clube';}};
  const renderCalendarAgenda=()=>{const key=calendarKey(selectedCalendarDate),games=[...(calendarGames.get(key)||[])].sort((a,b)=>Number(isUserFixture(b))-Number(isUserFixture(a))),activities=calendarTrainingMap().get(key)||[],dateLabel=selectedCalendarDate.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});calendarReportGames.clear();$('#calendarSelectedDay').textContent=dateLabel;const cupGames=games.filter(game=>game.competition==='COPA DO BRASIL');$('#calendarSelectedMeta').textContent=games.length?`${games.length} ${games.length===1?'jogo programado':'jogos programados'}${cupGames.length?` · ${cupGames[0].phase}`:''}`:'Sem partidas programadas';const gameRows=games.map((game,index)=>{const detail=fixtureDetails(game),userGame=isUserFixture(game),atHome=game.home===userClub,isCup=game.competition==='COPA DO BRASIL',completed=isFixtureCompleted(game),scoreLabel=fixtureResultLabel(game),eventLabel=isCup?`COPA DO BRASIL · ${game.phase} · ${game.leg}`:`BRASILEIRÃO · RODADA ${game.round}`,report=calendarGameResult(game),reportKey=`${key}-${index}`;if(report)calendarReportGames.set(reportKey,report);return `<div class="agenda-item ${report?'has-report':''} ${userGame?'user-game':''} ${isCup?'cup':''} ${completed?'completed':''}"><time>${detail.time}</time><div><small>${userGame?`SEU JOGO · ${eventLabel} · ${atHome?'EM CASA':'FORA'}${completed?' · ENCERRADO':''}`:eventLabel}</small><strong><span class="club-link" data-club="${game.home}" role="button" tabindex="0">${game.home}</span> × <span class="club-link" data-club="${game.away}" role="button" tabindex="0">${game.away}</span>${scoreLabel?` <em>· ${scoreLabel}</em>`:''}</strong></div>${report?`<button type="button" class="agenda-match-report" data-match-report="${reportKey}" title="Ver estatísticas finais" aria-label="Ver estatísticas de ${game.home} contra ${game.away}">▤</button>`:''}</div>`;}).join(''),trainingRows=activities.map(activity=>`<div class="agenda-item training"><i>MF</i><div><small>${activity.type==='before'?'PRÉ-JOGO':activity.type==='after'?'PÓS-JOGO':'DIA LIVRE'}</small><strong>${activity.label}</strong></div></div>`).join(''),freeRow=!games.length&&!activities.length?`<div class="agenda-item free"><i>—</i><div><small>DIA SEM PARTIDA</small><strong>${trainingRules.free}</strong></div></div>`:'';$('#calendarDayAgenda').innerHTML=gameRows+trainingRows+freeRow;};
  const renderCalendar=()=>{const year=calendarCursor.getFullYear(),month=calendarCursor.getMonth(),firstDay=new Date(year,month,1),gridStart=new Date(year,month,1-firstDay.getDay()),trainingMap=calendarTrainingMap(),currentRoundKey=calendarKey(fixtureDate(Math.min(Math.max(currentRound,1),Math.max(championshipFixtures.length,1)))),careerDayKey=calendarKey(careerCalendarDate),{start:planWeekStart,end:planWeekEnd}=weekBounds(careerCalendarDate);$('#calendarMonthLabel').textContent=calendarCursor.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});$$('#calendarYearMonths button').forEach(button=>button.classList.toggle('active',Number(button.dataset.calendarMonth)===month&&year===careerSeason));$('#calendarDays').innerHTML=Array.from({length:42},(_,index)=>{const date=new Date(gridStart);date.setDate(gridStart.getDate()+index);date.setHours(12,0,0,0);const key=calendarKey(date),games=calendarGames.get(key)||[],userGame=games.find(isUserFixture),pendingUserGame=userGame&&!isFixtureCompleted(userGame),atHome=userGame?.home===userClub,cupGame=games.find(game=>game.competition==='COPA DO BRASIL'),activities=trainingMap.get(key)||[],selected=key===calendarKey(selectedCalendarDate),outside=date.getMonth()!==month||date.getFullYear()!==careerSeason,userCompleted=userGame&&isFixtureCompleted(userGame),userScore=userCompleted?fixtureResultLabel(userGame):'',inPlanningWeek=date>=planWeekStart&&date<=planWeekEnd,eventText=userGame?(userGame.competition==='COPA DO BRASIL'?`COPA · ${userGame.phase}`:`${atHome?'CASA':'FORA'} · R${userGame.round}`)+(userScore?` · ${userScore}`:''):cupGame?`COPA · ${cupGame.phase}`:games.length?`${games.length} JOGOS · R${games[0].round}`:'';return `<button type="button" class="calendar-day ${outside?'outside':''} ${selected?'selected':''} ${inPlanningWeek?'planning-week':''} ${key===careerDayKey?'career-today':''} ${pendingUserGame&&key===careerDayKey?'matchday-stop':''} ${userGame?(atHome?'user-home':'user-away'):''} ${userCompleted?'completed-user':''} ${key===currentRoundKey?'current-round':''}" data-calendar-date="${key}" aria-pressed="${selected}"><time datetime="${key}">${date.getDate()}</time><span class="calendar-day-events">${eventText?`<span class="${cupGame?'cup-match':userGame?'user-match':''} ${userScore?'completed-score':''}">${eventText}</span>`:''}${activities.map(activity=>`<span class="training-event">◆ ${activity.label}</span>`).join('')}</span></button>`;}).join('');renderTrainingRules();renderCalendarRoutine();renderCalendarAgenda();};
  onCupScheduleChanged=()=>{rebuildCalendarGames();$('#calendar .title span').textContent=`Agenda nacional de janeiro a dezembro · ${championshipFixtures.flat().length} jogos do Brasileiro · ${copaDoBrasilFixtures.length} jogos confirmados da Copa do Brasil · ${calendarIntervalLabel(restConflictCount)}.`;renderCalendar();if(championshipDivision==='CUP')openChampionship('CUP');};
  onClick('#calendarDays',event=>{const day=event.target.closest('[data-calendar-date]');if(!day)return;selectedCalendarDate=calendarDate(day.dataset.calendarDate);calendarCursor=new Date(selectedCalendarDate.getFullYear(),selectedCalendarDate.getMonth(),1);renderCalendar();});
  onClick('#calendarDayAgenda',event=>{const button=event.target.closest('[data-match-report]');if(!button)return;const report=calendarReportGames.get(button.dataset.matchReport);if(report)openCalendarMatchReport(report);});
  onClick('#closeCalendarMatchReport',()=>$('#calendarMatchReportModal').classList.add('hidden'));
  onClick('#calendarYearMonths',event=>{const button=event.target.closest('[data-calendar-month]');if(!button)return;calendarCursor=new Date(careerSeason,Number(button.dataset.calendarMonth),1);selectedCalendarDate=new Date(calendarCursor);renderCalendar();});
  const moveCalendarMonth=direction=>{const nextMonth=calendarCursor.getMonth()+direction;calendarCursor=new Date(careerSeason,Math.max(0,Math.min(11,nextMonth)),1);selectedCalendarDate=new Date(calendarCursor);renderCalendar();};
  onClick('#calendarPrevious',()=>moveCalendarMonth(-1));
  onClick('#calendarNext',()=>moveCalendarMonth(1));
  onClick('#calendarCurrent',()=>{const entry=nextPendingUserEntry(),date=entry?entry.details.date:careerCalendarDate;selectedCalendarDate=new Date(date);calendarCursor=new Date(careerSeason,selectedCalendarDate.getMonth(),1);renderCalendar();});
  onClick('#trainingRules',event=>{const button=event.target.closest('[data-training-rule]');if(!button)return;const type=button.dataset.trainingRule,options=trainingOptions[type],next=(options.indexOf(trainingRules[type])+1)%options.length;trainingRules[type]=options[next];localStorage.setItem('matchday-training-rules',JSON.stringify(trainingRules));if(savedNewGame)persistSeason();renderCalendar();});
  renderCalendar();
  const refreshSeasonPresentation=()=>{
    reconcileCurrentRound();
    rebuildCalendarGames();
    futureMatches=currentRoundFixtures();
    leagueData.sort((a,b)=>b.points-a.points||b.goalDiff-a.goalDiff||b.wins-a.wins);
    leagueData.forEach((row,index)=>clubs[row.club].position=index+1);
    $('#leagueTable').innerHTML=displayedLeagueRows().map(leagueRow).join('');
    renderDashboardMiniTable();
    renderDashboardUpcoming();
    $('.upcoming-dashboard label em').textContent=`RODADA ${currentRound}`;
    renderUserMatchPresentation();
    renderNationalRanking();
    renderCalendar(); renderLeaders(); renderRecentResults();
    // O navegador do campeonato conserva a rodada escolhida pelo usuário.
  };

  const formations = {'4-3-3':[[50,91],[14,74],[38,76],[62,76],[86,74],[25,58],[50,60],[75,58],[18,27],[50,18],[82,27]],'4-4-2':[[50,91],[14,74],[38,76],[62,76],[86,74],[16,56],[38,58],[62,58],[84,56],[38,25],[62,25]],'3-5-2':[[50,91],[25,76],[50,78],[75,76],[12,56],[32,58],[50,55],[68,58],[88,56],[38,25],[62,25]],'4-2-3-1':[[50,91],[14,74],[38,76],[62,76],[86,74],[35,59],[65,59],[18,40],[50,42],[82,40],[50,19]],'4-1-4-1':[[50,91],[14,74],[38,76],[62,76],[86,74],[50,64],[16,44],[38,46],[62,46],[84,44],[50,19]],'5-3-2':[[50,91],[10,74],[30,77],[50,78],[70,77],[90,74],[27,57],[50,59],[73,57],[38,25],[62,25]],'4-3-1-2':[[50,91],[14,74],[38,76],[62,76],[86,74],[25,59],[50,64],[75,59],[50,43],[37,23],[63,23]],'3-4-3':[[50,91],[26,76],[50,78],[74,76],[15,57],[39,58],[61,58],[85,57],[18,27],[50,18],[82,27]]};
  const formationRoles={
    '4-3-3':['GOL','LAT','ZAG','ZAG','LAT','VOL','MC','MC','PE','ATA','PD'],
    '4-4-2':['GOL','LAT','ZAG','ZAG','LAT','PE','MC','MC','PD','ATA','ATA'],
    '3-5-2':['GOL','ZAG','ZAG','ZAG','LAT','VOL','MC','MEI','LAT','ATA','ATA'],
    '4-2-3-1':['GOL','LAT','ZAG','ZAG','LAT','VOL','VOL','PE','MEI','PD','ATA'],
    '4-1-4-1':['GOL','LAT','ZAG','ZAG','LAT','VOL','PE','MC','MC','PD','ATA'],
    '5-3-2':['GOL','LAT','ZAG','ZAG','ZAG','LAT','VOL','MC','MC','ATA','ATA'],
    '4-3-1-2':['GOL','LAT','ZAG','ZAG','LAT','VOL','MC','MC','MEI','ATA','ATA'],
    '3-4-3':['GOL','ZAG','ZAG','ZAG','LAT','MC','MC','LAT','PE','ATA','PD']
  };
  const formationPerformance = FORMATION_PERFORMANCE;
  const compatibleRoles = COMPATIBLE_ROLES;
  const formationNotes = {'4-3-3':'Amplitude e pressão com três atacantes.','4-4-2':'Bloco equilibrado e duas referências.','3-5-2':'Superioridade no meio-campo.','4-2-3-1':'Controle entre as linhas.','4-1-4-1':'Proteção defensiva e ocupação dos corredores.','5-3-2':'Linha defensiva forte.','4-3-1-2':'Diamante compacto para atacar pelo centro.','3-4-3':'Formação agressiva, com três homens de frente.'};
  let formation = '4-3-3',positionAssignments=[...formationRoles['4-3-3']];
  const roleAttributeScore=(player,role)=>{
    const fatigue=clamp(player.fatigue,0,100),m=stat=>matchPlayerStat(player,stat),scores={
      GOL:player.overall*.38+m('reflexes')*.27+m('positioning')*.22+m('penaltySaving')*.07+fatigue*.06,
      ZAG:player.overall*.31+m('marking')*.22+m('tackling')*.22+m('heading')*.12+m('speed')*.05+m('passing')*.03+fatigue*.05,
      LAT:player.overall*.28+m('speed')*.20+m('marking')*.14+m('tackling')*.14+m('passing')*.10+m('dribble')*.08+fatigue*.06,
      VOL:player.overall*.27+m('marking')*.16+m('tackling')*.18+m('passing')*.15+m('playmaking')*.11+m('heading')*.05+fatigue*.08,
      MC:player.overall*.27+m('passing')*.21+m('playmaking')*.21+m('dribble')*.08+m('tackling')*.06+m('speed')*.05+fatigue*.12,
      MEI:player.overall*.25+m('passing')*.20+m('playmaking')*.22+m('dribble')*.12+m('finishing')*.08+m('speed')*.05+fatigue*.08,
      PE:player.overall*.24+m('speed')*.20+m('dribble')*.20+m('finishing')*.13+m('passing')*.08+m('playmaking')*.07+fatigue*.08,
      PD:player.overall*.24+m('speed')*.20+m('dribble')*.20+m('finishing')*.13+m('passing')*.08+m('playmaking')*.07+fatigue*.08,
      ATA:player.overall*.27+m('finishing')*.25+m('heading')*.14+m('speed')*.11+m('dribble')*.09+m('playmaking')*.05+fatigue*.09
    };
    if(role==='GOL'&&player.pos!=='GOL')return -100;
    if(role!=='GOL'&&player.pos==='GOL')return -80;
    const adaptation=player.pos===role?14:(compatibleRoles[role]||[]).includes(player.pos)?3:-22;
    return (scores[role]??player.overall)+adaptation;
  };
  const lineupForRoles=(players,roles,slotIndexes=roles.map((_,index)=>index))=>{
    const available=[...players],assignment=new Map(),priority={GOL:0,PE:1,PD:1,ATA:2,LAT:3,ZAG:4,VOL:5,MEI:6,MC:7};
    [...slotIndexes].sort((a,b)=>(priority[roles[a]]??9)-(priority[roles[b]]??9)).forEach(slot=>{
      if(!available.length)return;
      available.sort((a,b)=>roleAttributeScore(b,roles[slot])-roleAttributeScore(a,roles[slot])||b.overall-a.overall||b.fatigue-a.fatigue);
      assignment.set(slot,available.shift());
    });
    return assignment;
  };
  ({ buildSimLineup, substitutionPriority } = createSimLineupBuilder({
    formationRoles,
    lineupForRoles,
    playerUnavailable,
    playerStarterBlocked,
    playerInRestrictedReturn,
    workloadLabel,
    workloadRisk,
    playerRehabMaxMinutes,
    matchDifficultyForClub,
  }));
  ({ simulateRoundMatch } = createRoundMatchSimulator({
    clamp,
    rnd,
    random: Math.random,
    getClubs: () => clubs,
    getLeagueData: () => leagueData,
    clubInstitutionalContext,
    buildSimLineup,
    substitutionPriority,
    engineTuning,
    engineFoulRisk,
    engineBlowoutDamp,
    formationPerformance,
    compatibleRoles,
    matchPlayerStat,
    playerRehabMaxMinutes,
    injurySeverityLabel,
    resolvePhysicalIncident,
    buildDeferredInjuryEntry,
    calculatePlayThroughSubChance,
    pickInjuryVictim,
  }));
  const orderRosterForFormation=(roster,targetFormation)=>{
    const roles=formationRoles[targetFormation]||formationRoles['4-3-3'],eligible=roster.filter(player=>!playerUnavailable(player)),starterPool=eligible.filter(player=>!playerStarterBlocked(player)),pool=starterPool.length>=roles.length?starterPool:eligible,assignment=lineupForRoles(pool,roles),lineup=roles.map((_,slot)=>assignment.get(slot)).filter(Boolean),selected=new Set(lineup),availableBench=eligible.filter(player=>!selected.has(player)&&!playerInRestrictedReturn(player)),restrictedBench=eligible.filter(player=>!selected.has(player)&&playerInRestrictedReturn(player)),unavailable=roster.filter(player=>!selected.has(player)&&playerUnavailable(player));
    roster.splice(0,roster.length,...lineup,...availableBench,...restrictedBench,...unavailable);
  };
  const autoSelectUserLineup=(targetFormation,{restrictToField=false,liveCards=null}={})=>{
    const roles=formationRoles[targetFormation]||formationRoles['4-3-3'];positionAssignments=[...roles];clubs[userClub].formation=targetFormation;
    if(restrictToField&&liveCards){
      const current=squad.slice(0,11),activeSlots=roles.map((_,slot)=>slot).filter(slot=>!liveCards[slot]?.red),activePlayers=activeSlots.map(slot=>current[slot]),assignment=lineupForRoles(activePlayers,roles,activeSlots),cardByPlayer=new Map(current.map((player,index)=>[player,liveCards[index]])),next=[...current],nextCards=[...liveCards];
      activeSlots.forEach(slot=>{next[slot]=assignment.get(slot);nextCards[slot]=cardByPlayer.get(next[slot])||{yellow:0,red:false};});
      squad.splice(0,11,...next);liveCards.splice(0,liveCards.length,...nextCards);return;
    }
    orderRosterForFormation(squad,targetFormation);
    if(liveCards)liveCards.splice(0,liveCards.length,...roles.map(()=>({yellow:0,red:false})));
  };
  document.body.insertAdjacentHTML('beforeend',`<div id="formationSuggestionModal" class="modal hidden"><div class="modal-card formation-suggestion-card"><button id="closeFormationSuggestion" class="close" type="button">×</button><label>SUGESTÃO TÁTICA</label><h2>Reorganizar os jogadores?</h2><p id="formationSuggestionText"></p><div id="formationSuggestionMoves" class="formation-suggestion-moves"></div><div class="formation-suggestion-actions"><button id="keepFormationLineup" type="button">MANTER ESCALAÇÃO</button><button id="applyFormationSuggestion" type="button">APLICAR SUGESTÃO</button></div></div></div>`);
  const formationSuggestionCss=document.createElement('style');formationSuggestionCss.textContent='#formationSuggestionModal{z-index:35}.formation-suggestion-card{width:min(460px,calc(100vw - 28px));padding:24px!important;text-align:left}.formation-suggestion-card h2{margin:5px 0 8px;font:700 28px Barlow Condensed}.formation-suggestion-card>p{margin:0;color:#9ebfc2;font-size:11px;line-height:1.5}.formation-suggestion-moves{display:grid;gap:5px;margin:15px 0;padding:10px;border:1px solid #28505b;border-radius:6px;background:#091820}.formation-suggestion-moves span{display:grid;grid-template-columns:minmax(0,1fr) 42px;gap:8px;padding:5px 2px;border-bottom:1px solid #203f49;color:#dce9e8;font-size:10px}.formation-suggestion-moves span:last-child{border-bottom:0}.formation-suggestion-moves b{color:#63d9ff;text-align:right}.formation-suggestion-actions{display:flex;justify-content:flex-end;gap:8px}.formation-suggestion-actions #applyFormationSuggestion{background:#24667c!important;color:#fff!important;border-color:#63d9ff!important}@media(max-width:520px){.formation-suggestion-actions{display:grid;grid-template-columns:1fr}.formation-suggestion-actions button{width:100%}}';document.head.append(formationSuggestionCss);
  let pendingFormationSuggestion=null;
  const closeFormationSuggestion=()=>{$('#formationSuggestionModal').classList.add('hidden');pendingFormationSuggestion=null;};
  const suggestFormationLineup=(targetFormation,liveCards)=>{
    const roles=formationRoles[targetFormation]||formationRoles['4-3-3'],current=squad.slice(0,11),activeSlots=roles.map((_,slot)=>slot).filter(slot=>!liveCards?.[slot]?.red),activePlayers=activeSlots.map(slot=>current[slot]),assignment=lineupForRoles(activePlayers,roles,activeSlots),moves=activeSlots.filter(slot=>assignment.get(slot)&&assignment.get(slot)!==current[slot]).map(slot=>({player:assignment.get(slot),role:roles[slot]}));
    pendingFormationSuggestion={formation:targetFormation,liveCards};
    $('#formationSuggestionText').textContent=moves.length?`A formação ${targetFormation} já foi aplicada. O assistente encontrou ${moves.length} ajuste${moves.length===1?'':'s'} de posicionamento, mas nenhuma mudança será feita sem sua confirmação.`:`A formação ${targetFormation} já foi aplicada e os jogadores atuais apresentam bom encaixe. Você pode manter a organização existente.`;
    $('#formationSuggestionMoves').innerHTML=moves.length?moves.slice(0,5).map(move=>`<span>${move.player.name}<b>${move.role}</b></span>`).join(''):'<span>Escalação atual compatível<b>OK</b></span>';
    $('#applyFormationSuggestion').disabled=!moves.length;
    $('#formationSuggestionModal').classList.remove('hidden');
  };
  onClick('#closeFormationSuggestion',closeFormationSuggestion);
  onClick('#keepFormationLineup',closeFormationSuggestion);
  onClick('#applyFormationSuggestion',()=>{if(!pendingFormationSuggestion)return;autoSelectUserLineup(pendingFormationSuggestion.formation,{restrictToField:true,liveCards:pendingFormationSuggestion.liveCards});closeFormationSuggestion();renderRoster();draw();drawBoard();renderSubstitutionControls();renderStats();});
  const boardPlayerLabel=(name,max=10)=>{
    const parts=name.split(' ').filter(Boolean);
    const short=parts.length>1?parts[parts.length-1]:parts[0]||name;
    return short.length>max?`${short.slice(0,max-1)}…`:short;
  };
  const boardPlayerBadges=({yellow,injured,atRisk})=>{
    const badges=[];
    if(yellow)badges.push('<em class="board-badge board-badge-yellow" aria-hidden="true"></em>');
    if(injured)badges.push('<em class="board-badge board-badge-injury" aria-hidden="true"></em>');
    else if(atRisk)badges.push('<em class="board-badge board-badge-risk" aria-hidden="true"></em>');
    return badges.join('');
  };
  const ensureBoardLegend=board=>{
    if(!board||board.querySelector('.board-legend'))return;
    board.insertAdjacentHTML('beforeend','<div class="board-legend" aria-hidden="true"><span><i class="board-legend-dot board-legend-yellow"></i>Amarelo</span><span><i class="board-legend-dot board-legend-injury"></i>Lesão</span><span><i class="board-legend-dot board-legend-risk"></i>Incômodo</span><span><i class="board-legend-dot board-legend-vacant"></i>Vaga</span></div>');
  };
  const drawBoard = () => {
    if (!cards) return;
    const board=$('#pausePitchPlayers')?.closest('.tactical-board');
    ensureBoardLegend(board);
    $('#pausePitchPlayers').innerHTML = formations[formation].map((p, i) => {
      const state = cards.home[i], vacant = state.red, injured=state.injured, atRisk=state.playThroughRisk;
      const displayTop=p[1]===91?88:p[1];
      const energy=clamp(squad[i].fatigue,0,100);
      const canReposition=!vacant;
      const label=vacant?(activePreparationTitle==='CARTÃO VERMELHO'?'EXPULSO':'VAGO'):boardPlayerLabel(squad[i].name);
      const title=vacant?'Arraste um titular para esta vaga':`${squad[i].name}${state.yellow?' · Advertido':''}${injured?' · Lesionado':atRisk?' · Incômodo físico':''} · ${Math.round(energy)}% energia`;
      return `<div class="board-player ${vacant?'vacant vacancy-target':''} ${canReposition?'repositionable':''}" data-slot="${i}" draggable="${canReposition}" title="${title}" style="left:${p[0]}%;top:${displayTop}%"><i style="--energy:${energy}%"><span>${vacant?'×':squad[i].number}</span></i>${boardPlayerBadges(state)}<small>${label}</small></div>`;
    }).join('');
    $$('#pauseFormations button').forEach(b => b.classList.toggle('selected', b.textContent === formation));
    enableBoardRepositioning($('#pausePitchPlayers'),'.board-player.repositionable');
  };
  const enableBoardRepositioning = (board,selector) => {
    if(!board) return;
    const draggables=[...board.querySelectorAll(selector)],targets=[...board.querySelectorAll('[data-slot]')];
    draggables.forEach(marker=>{
      marker.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain',marker.dataset.slot);event.dataTransfer.effectAllowed='move';marker.classList.add('dragging');});
      marker.addEventListener('dragend',()=>board.querySelectorAll('.drop-target,.dragging').forEach(item=>item.classList.remove('drop-target','dragging')));
    });
    targets.forEach(marker=>{
      marker.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='move';marker.classList.add('drop-target');});
      marker.addEventListener('dragleave',()=>marker.classList.remove('drop-target'));
      marker.addEventListener('drop',event=>{
        event.preventDefault(); marker.classList.remove('drop-target');
        const sourceIndex=Number(event.dataTransfer.getData('text/plain')), targetIndex=Number(marker.dataset.slot);
        if(!Number.isInteger(sourceIndex)||!Number.isInteger(targetIndex)||sourceIndex===targetIndex||cards?.home?.[sourceIndex]?.red)return;
        const moved=squad[sourceIndex],exchanged=squad[targetIndex],targetWasVacant=!!cards?.home?.[targetIndex]?.red;
        [squad[sourceIndex],squad[targetIndex]]=[exchanged,moved];
        if(cards?.home)[cards.home[sourceIndex],cards.home[targetIndex]]=[cards.home[targetIndex],cards.home[sourceIndex]];
        if(matchStarted)log(targetWasVacant?`${moved.name} ocupa a posição de ${positionAssignments[targetIndex]}; a vaga da expulsão passa para ${positionAssignments[sourceIndex]}.`:`${moved.name} troca de posição com ${exchanged.name}: ${positionAssignments[targetIndex]} e ${positionAssignments[sourceIndex]}.`,'substitution');
        renderRoster(); draw(); if(matchStarted){renderSubstitutionControls();renderStats();}
      });
    });
  };
  const renderTacticRoster = () => {
    const playerRow=(player,index,starter)=>`<div class="tactic-player-row ${playerUnavailable(player)?'unavailable':'repositionable'}" data-slot="${index}" draggable="${!playerUnavailable(player)}">${playerNameCell(player.name,player,{prefix:starter?(index+1)+'. ':''})}<span>${player.pos}</span><span>${player.overall}</span><span class="tactic-fatigue"><i><b style="width:${clamp(player.fatigue,0,100)}%"></b></i>${Math.round(player.fatigue)}%</span></div>`;
    $('#tacticStarters').innerHTML=squad.slice(0,11).map((player,index)=>playerRow(player,index,true)).join('');
    $('#tacticBench').innerHTML=squad.slice(11).map((player,index)=>playerRow(player,index+11,false)).join('');
    $$('.tactic-player-row.repositionable').forEach(row=>{
      row.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain',row.dataset.slot);event.dataTransfer.effectAllowed='move';row.classList.add('dragging');});
      row.addEventListener('dragend',()=>row.classList.remove('dragging'));
    });
  };
  const draw = () => { $('#pitchPlayers').innerHTML = formations[formation].map((p,i) => `<div class="pitch-player repositionable" data-slot="${i}" draggable="true" style="left:${p[0]}%;top:${p[1]===91?88:p[1]}%"><i style="--energy:${clamp(squad[i].fatigue,0,100)}%"><span>${squad[i].number}</span></i>${squad[i].name}</div>`).join(''); $('#formationDescription').textContent = `${formationNotes[formation]} Titulares sugeridos por encaixe, atributos e condição física.`; $$('#formations button').forEach(b => b.classList.toggle('selected', b.textContent === formation)); renderTacticRoster(); enableBoardRepositioning($('#pitchPlayers'),'.pitch-player.repositionable'); if (!$('#pausePanel').classList.contains('hidden')) drawBoard(); };
  $('#formations').innerHTML = Object.keys(formations).map(f => `<button type="button">${f}</button>`).join('');
  $('#pauseFormations').innerHTML = Object.keys(formations).map(f => `<button type="button">${f}</button>`).join('');
  const applyFormationChoice=(nextFormation,{liveDuringMatch=false,withBoard=false}={})=>{
    formation=nextFormation;
    const live=liveDuringMatch?matchStarted&&!matchFinished&&!preMatchPreparation:matchStarted&&!preMatchPreparation;
    positionAssignments=[...(formationRoles[formation]||formationRoles['4-3-3'])];
    clubs[userClub].formation=formation;
    if(live){draw();if(withBoard)drawBoard();renderSubstitutionControls();renderStats();suggestFormationLineup(formation,cards?.home||null);}
    else{autoSelectUserLineup(formation,{liveCards:cards?.home||null});renderRoster();draw();if(withBoard){drawBoard();renderSubstitutionControls();}}
  };
  const formationGridClick=(event,options)=>{const button=event.target.closest('button');if(!button)return;applyFormationChoice(button.textContent,options);};
  onClick('#formations',event=>formationGridClick(event,{liveDuringMatch:true}));
  onClick('#pauseFormations',event=>formationGridClick(event,{withBoard:true}));
  const TACTIC_SLIDER_KEYS=['mentality','possession','press','offsideLine'];
  const DEFAULT_USER_TACTICS={mentality:50,possession:50,press:50,offsideLine:50};
  const normalizeTacticSlider=value=>{const number=Number(value);return Number.isFinite(number)?clamp(Math.round(number),0,100):null;};
  const normalizeUserTactics=source=>{if(!source||typeof source!=='object')return {...DEFAULT_USER_TACTICS};const next={...DEFAULT_USER_TACTICS};TACTIC_SLIDER_KEYS.forEach(key=>{const value=normalizeTacticSlider(source[key]);if(value!==null)next[key]=value;});return next;};
  let tacticalValues=normalizeUserTactics(validSavedSeason?savedSeason?.userTactics:null);
  const tacticReadout={mentality:value=>value<35?'Defensiva':value>65?'Ofensiva':'Equilibrada',possession:value=>value<35?'Contra-ataque':value>65?'Posse de bola':'Misto',press:value=>value<35?'Baixa':value>65?'Alta':'Média',offsideLine:value=>value<35?'Baixa':value>65?'Alta':'Normal'};
  const tacticControls={mentality:[['#mentalitySlider','#mentalityReadout'],['#pauseMentalitySlider','#pauseMentalityReadout']],possession:[['#possessionSlider','#possessionReadout'],['#pausePossessionSlider','#pausePossessionReadout']],press:[['#pressSlider','#pressReadout'],['#pausePressSlider','#pausePressReadout']],offsideLine:[['#offsideLineSlider','#offsideLineReadout'],['#pauseOffsideLineSlider','#pauseOffsideLineReadout']]};
  const syncTactics=()=>Object.entries(tacticControls).forEach(([key,controls])=>controls.forEach(([sliderId,readoutId])=>{const slider=$(sliderId),readout=$(readoutId);if(!slider||!readout)return;slider.value=tacticalValues[key];slider.style.setProperty('--tactic-value',`${tacticalValues[key]}%`);readout.textContent=`${tacticReadout[key](tacticalValues[key])} · ${tacticalValues[key]}%`;}));
  Object.entries(tacticControls).forEach(([key,controls])=>controls.forEach(([sliderId])=>{on(sliderId,'input',event=>{tacticalValues[key]=Number(event.target.value);syncTactics();if(savedNewGame)persistSeason();});}));
  syncTactics();
  const suggestTacticPlan=()=>{
    const eligible=squad.filter(player=>!playerUnavailable(player)),starterPool=eligible.filter(player=>!playerStarterBlocked(player)),pool=starterPool.length>=11?starterPool:eligible;
    const scoreFormationFit=form=>{
      const roles=formationRoles[form],assignment=lineupForRoles(pool,roles);
      return roles.reduce((sum,_,slot)=>{const player=assignment.get(slot);return sum+(player?roleAttributeScore(player,roles[slot]):-50);},0);
    };
    const bestFormation=Object.keys(formations).sort((a,b)=>scoreFormationFit(b)-scoreFormationFit(a))[0]||formation;
    const samplePool=lineupForRoles(pool,formationRoles[bestFormation]||formationRoles['4-3-3']),sampleLineup=[...(formationRoles[bestFormation]||formationRoles['4-3-3'])].map((_,slot)=>samplePool.get(slot)).filter(Boolean);
    const avgStat=(players,key)=>players.reduce((sum,player)=>sum+matchPlayerStat(player,key),0)/Math.max(1,players.length),avgFatigue=sampleLineup.reduce((sum,player)=>sum+player.fatigue,0)/Math.max(1,sampleLineup.length),passingEdge=avgStat(sampleLineup,'passing')+avgStat(sampleLineup,'playmaking')-avgStat(sampleLineup,'finishing')-avgStat(sampleLineup,'speed')*.5,attackEdge=avgStat(sampleLineup,'finishing')+avgStat(sampleLineup,'dribble')+avgStat(sampleLineup,'speed')*.5-avgStat(sampleLineup,'marking')-avgStat(sampleLineup,'tackling'),defenseEdge=avgStat(sampleLineup,'marking')+avgStat(sampleLineup,'tackling')-avgStat(sampleLineup,'finishing')-avgStat(sampleLineup,'dribble')*.5;
    let mentality=52,possession=50,press=54,offsideLine=50;
    if(attackEdge>6)mentality=66;
    else if(defenseEdge>6)mentality=38;
    if(passingEdge>8){possession=72;press=Math.max(40,press-6);}
    else if(passingEdge<-6){possession=32;mentality=Math.min(88,mentality+6);}
    if(avgFatigue<62){press=Math.max(30,press-10);mentality=Math.max(25,mentality-8);}
    if(defenseEdge>attackEdge+4)offsideLine=42;
    else if(attackEdge>defenseEdge+4)offsideLine=58;
    return {formation:bestFormation,mentality:clamp(Math.round(mentality),0,100),possession:clamp(Math.round(possession),0,100),press:clamp(Math.round(press),0,100),offsideLine:clamp(Math.round(offsideLine),0,100)};
  };
  const applyTacticSuggestion=()=>{
    const plan=suggestTacticPlan();
    tacticalValues={mentality:plan.mentality,possession:plan.possession,press:plan.press,offsideLine:plan.offsideLine};
    syncTactics();
    formation=plan.formation;
    positionAssignments=[...(formationRoles[formation]||formationRoles['4-3-3'])];
    clubs[userClub].formation=formation;
    const inMatchContext=matchStarted&&!matchFinished,pausePanelOpen=!$('#pausePanel').classList.contains('hidden'),live=inMatchContext&&!preMatchPreparation;
    if(live&&cards?.home){autoSelectUserLineup(formation,{restrictToField:true,liveCards:cards.home});drawBoard();renderSubstitutionControls();renderStats();}
    else{autoSelectUserLineup(formation,{liveCards:cards?.home||null});if(inMatchContext&&pausePanelOpen){drawBoard();renderSubstitutionControls();}}
    renderRoster();
    draw();
    $('#formationDescription').textContent=`Sugestão aplicada: ${formationNotes[formation]} Escalação e sliders ajustados com base no seu elenco.`;
    if(savedNewGame)persistSeason();
  };
  $$('.tactic-suggestion-btn').forEach(button=>button.addEventListener('click',applyTacticSuggestion));
  const tacticSuggestionCss=document.createElement('style');tacticSuggestionCss.textContent='.tactic-suggestion-wrap{position:relative;margin-bottom:12px}.tactic-suggestion-btn{width:100%;min-height:42px;padding:10px 14px;border:1px solid #63d9ff;border-radius:6px;background:linear-gradient(135deg,#1d5a6d,#24667c);color:#fff;font:700 11px "DM Sans",sans-serif;letter-spacing:.55px;cursor:pointer;box-shadow:0 0 0 1px #b6ff3844,inset 0 -2px #b6ff38;transition:background .15s ease,border-color .15s ease,transform .15s ease}.tactic-suggestion-btn:hover{background:linear-gradient(135deg,#24667c,#2d8099);border-color:#b6ff38;transform:translateY(-1px)}.tactic-suggestion-btn:active{transform:translateY(0)}.tactic-suggestion-tooltip{display:block;position:absolute;left:0;right:0;top:calc(100% + 8px);z-index:6;padding:10px 12px;border:1px solid #63d9ff;border-radius:6px;background:#0d2732;color:#cfe3e6;font-size:10px;line-height:1.45;opacity:0;visibility:hidden;transform:translateY(-4px);transition:opacity .15s ease,transform .15s ease,visibility .15s;pointer-events:none;box-shadow:0 10px 24px #00000055}.tactic-suggestion-wrap:hover .tactic-suggestion-tooltip,.tactic-suggestion-wrap:focus-within .tactic-suggestion-tooltip{opacity:1;visibility:visible;transform:translateY(0)}';document.head.append(tacticSuggestionCss);
  const substitutionPanel=$('.substitution-panel');
  if(substitutionPanel?.querySelector('label')){
  substitutionPanel.querySelector('label').insertAdjacentHTML('afterend','<div class="substitution-pickers"><section class="substitution-picker"><strong>JOGADOR QUE SAI</strong><div class="substitution-player-head"><span>POS.</span><span>OVR</span><span>JOGADOR</span><span>CANSAÇO</span></div><div id="substitutionOutList" class="substitution-player-list"></div></section><section class="substitution-picker"><strong>JOGADOR QUE ENTRA</strong><div class="substitution-player-head"><span>POS.</span><span>OVR</span><span>JOGADOR</span><span>CANSAÇO</span></div><div id="substitutionInList" class="substitution-player-list"></div></section></div>');
  $('#substitutionOut')?.classList.add('substitution-native-select');
  $('#substitutionIn')?.classList.add('substitution-native-select');
  }
  const substitutionCss=document.createElement('style');
  substitutionCss.textContent='.substitution-native-select{display:none!important}.substitution-pickers{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:2px 0 10px}.substitution-picker{min-width:0;overflow:hidden;border:1px solid #28505b;border-radius:5px;background:#091820}.substitution-picker>strong{display:block;padding:8px 9px;background:#123843;color:#b6ff38;font:700 13px Barlow Condensed;letter-spacing:.25px}.substitution-player-head,.substitution-player-row{display:grid;grid-template-columns:30px 34px minmax(60px,1fr) 72px;gap:4px;align-items:center}.substitution-player-head{padding:6px 7px;background:#102b35;color:#63d9ff;font:700 7px DM Sans;letter-spacing:.2px}.substitution-player-list{max-height:176px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#397487 #091820}.substitution-panel .substitution-picker button.substitution-player-row{display:grid;width:100%;box-sizing:border-box;padding:7px!important;border-radius:0!important;border-top:1px solid #234b55!important;background:transparent!important;color:#edf8f5!important;text-align:left;box-shadow:none}.substitution-panel .substitution-picker button.substitution-player-row:hover{background:#102832!important;box-shadow:none!important;transform:none!important}.substitution-panel .substitution-picker button.substitution-player-row.selected{background:#173b48!important;box-shadow:inset 3px 0 0 #b6ff38!important}.substitution-player-row .sub-pos{color:#63d9ff;font-weight:700}.substitution-player-row .sub-ovr{color:#b6ff38;font-weight:700}.substitution-player-row .sub-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px}.substitution-player-row .sub-name small{display:inline;color:#ffc94f;font-size:7px}.sub-fatigue{display:grid;grid-template-columns:1fr 23px;gap:3px;align-items:center}.sub-fatigue i{height:6px;overflow:hidden;border-radius:6px;background:#25424b;box-shadow:inset 0 0 0 1px #397487}.sub-fatigue i b{display:block;height:100%;background:linear-gradient(90deg,#63d9ff,#b6ff38)}.sub-fatigue em{color:#cce4e2;font-size:7px;font-style:normal;text-align:right}@media(max-width:620px){.substitution-pickers{grid-template-columns:1fr}.substitution-player-head,.substitution-player-row{grid-template-columns:42px 42px minmax(90px,1fr) 100px}.substitution-player-list{max-height:150px}}';
  document.head.append(substitutionCss);
  const substitutionPlayerRow=(player,attributes,selected,liveState=null)=>`<button type="button" class="substitution-player-row ${selected?'selected':''}" ${attributes} style="display:grid!important;width:100%!important;padding:7px 8px!important;border:0!important;border-top:1px solid #234b55!important;border-radius:0!important;background:${selected?'#173b48':'#091820'}!important;color:#edf8f5!important;box-shadow:${selected?'inset 3px 0 0 #b6ff38':'none'}!important;transform:none!important"><span class="sub-pos">${player.pos}</span><span class="sub-ovr">${player.overall}</span><span class="sub-name">${playerNameCell(player.name,player,{liveState})}</span><span class="sub-fatigue"><i><b style="width:${clamp(player.fatigue,0,100)}%"></b></i><em>${Math.round(player.fatigue)}%</em></span></button>`;
  const renderSubstitutionControls = () => {
    const outgoing=$('#substitutionOut'), incoming=$('#substitutionIn');
    if(!outgoing || !incoming) return;
    const previousOut=outgoing.value, previousIn=incoming.value;
    const onField=starters().map((player,index)=>({player,index})).filter(({index})=>!cards?.home?.[index]?.red);
    outgoing.innerHTML=onField.map(({player,index})=>`<option value="${index}">${player.name} · ${player.pos} · OVR ${player.overall}</option>`).join('');
    if([...outgoing.options].some(option=>option.value===previousOut)) outgoing.value=previousOut;
    const expectedRole=positionAssignments[Number(outgoing.value)] || starters()[Number(outgoing.value)]?.pos;
    const availableBench=squad.slice(11).filter(player=>!substitutedOut?.has(player.name) && !playerUnavailable(player) && (expectedRole!=='GOL' || player.pos==='GOL'));
    incoming.innerHTML=availableBench.length ? availableBench.map(player=>`<option value="${player.name}">${player.name} · ${player.pos} · OVR ${player.overall} · ${Math.round(player.fatigue)}% cansaço</option>`).join('') : '<option value="">Sem reservas disponíveis</option>';
    if([...incoming.options].some(option=>option.value===previousIn)) incoming.value=previousIn;
    const liveCardState=index=>{const card=cards?.home?.[index];return card?{yellow:card.yellow?1:0,red:!!card.red,injured:!!card.injured,playThroughRisk:!!card.playThroughRisk}:null;};
    $('#substitutionOutList').innerHTML=onField.map(({player,index})=>substitutionPlayerRow(player,`data-substitution-out="${index}"`,String(index)===outgoing.value,liveCardState(index))).join('');
    $('#substitutionInList').innerHTML=availableBench.length?availableBench.map(player=>substitutionPlayerRow(player,`data-substitution-in="${squad.indexOf(player)}"`,player.name===incoming.value)).join(''):'<small class="substitution-empty">Sem reservas disponíveis.</small>';
    $('#substitutionCounter').textContent=preMatchPreparation ? 'PRÉ-JOGO' : `${substitutions || 0}/5`;
    $('#makeSubstitution').disabled=(!preMatchPreparation && (substitutions || 0)>=5) || !onField.length || !availableBench.length;
    const selectedIncoming=availableBench.find(player=>player.name===incoming.value), fit=selectedIncoming?positionMismatch(selectedIncoming,expectedRole):0;
    $('#substitutionHint').textContent=preMatchPreparation
      ? `Ajuste de escalação antes do jogo${fit?` · ${selectedIncoming?.pos} adaptado para ${expectedRole}`:''}. Não conta como substituição.`
      : (substitutions || 0)>=5 ? 'Limite de cinco substituições atingido.' : fit ? `Entrará na vaga de ${expectedRole}: adaptação ${fit<1?'compatível':'fora de posição'}, com leve impacto coletivo.` : `Vaga de ${expectedRole}: jogador na posição de origem.`;
  };
  const makeSubstitution = () => {
    const outIndex=Number($('#substitutionOut').value), incomingName=$('#substitutionIn').value;
    if(!matchStarted || (!preMatchPreparation && substitutions>=5) || !incomingName || cards.home[outIndex]?.red) return;
    const incomingIndex=squad.findIndex(player=>player.name===incomingName);
    if(incomingIndex<11 || playerUnavailable(squad[incomingIndex])) return;
    const outgoing=squad[outIndex], incoming=squad[incomingIndex], expectedRole=positionAssignments[outIndex], improvised=positionMismatch(incoming,expectedRole)>0;
    if(cards.home[outIndex]?.playThroughRisk){const entry=liveDeferredInjuries.home.find(item=>item.name===outgoing.name);if(entry){entry.preemptiveSubstitution=true;entry.keptPlaying=false;}cards.home[outIndex].playThroughRisk=false;}
    liveMinutesPlayed.home.set(incoming.name,liveMinutesPlayed.home.get(incoming.name)??0);
    [squad[outIndex],squad[incomingIndex]]=[incoming,outgoing];
    if(preMatchPreparation){
      cards.home[outIndex]={yellow:0,red:false};
      renderRoster(); draw(); drawBoard(); renderSubstitutionControls();
      return;
    }
    cards.home[outIndex]={yellow:0,red:false}; substitutions++; substitutedOut.add(outgoing.name);
    log(`Substituição no ${userClub}: sai ${outgoing.name}, entra ${incoming.name}${improvised?` (${incoming.pos} adaptado para ${expectedRole}).`:''}.`,'substitution');
    renderRoster(); draw(); drawBoard(); renderSubstitutionControls(); renderStats();
  };
  onClick('#makeSubstitution',makeSubstitution);
  onClick('#substitutionOutList',event=>{const row=event.target.closest('[data-substitution-out]');if(!row)return;$('#substitutionOut').value=row.dataset.substitutionOut;renderSubstitutionControls();});
  onClick('#substitutionInList',event=>{const row=event.target.closest('[data-substitution-in]');if(!row)return;const player=squad[Number(row.dataset.substitutionIn)];if(!player)return;$('#substitutionIn').value=player.name;renderSubstitutionControls();});
  on('#substitutionOut','change',renderSubstitutionControls);
  on('#substitutionIn','change',renderSubstitutionControls);
  clubs[userClub].roster=squad;
  Object.values(clubs).filter(club=>club.name!==userClub).forEach(club=>orderRosterForFormation(club.roster,club.formation));
  autoSelectUserLineup(formation);
  renderRoster();
  draw();
  const fieldMarkup='<div class="field-markings"><i class="mid-line"></i><i class="centre-circle"></i><i class="centre-spot"></i><i class="area area-top"></i><i class="area area-bottom"></i><i class="six-yard six-top"></i><i class="six-yard six-bottom"></i><i class="spot spot-top"></i><i class="spot spot-bottom"></i><i class="goal goal-top"></i><i class="goal goal-bottom"></i></div>';
  const liveOpponentCss=document.createElement('style');liveOpponentCss.textContent='#liveOpponentModal{z-index:20}.live-opponent-modal{width:min(900px,100%);text-align:left}.live-opponent-modal h2{margin:4px 0;font:700 30px Barlow Condensed}.live-opponent-meta{margin:0 0 14px;color:#718077;font-size:12px}.live-opponent-layout{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:16px}.live-opponent-roster{border:1px solid #d8e6da;border-radius:7px;overflow:hidden}.live-opponent-roster h3{margin:0;padding:10px 12px;background:#eef6ef;color:#087d58;font:700 15px Barlow Condensed}.live-opponent-head,.live-opponent-player{display:grid;grid-template-columns:1fr 42px 48px 62px;gap:7px;padding:7px 10px;align-items:center;font-size:11px}.live-opponent-head{background:#f5f9f5;color:#718077;font-size:9px;font-weight:700}.live-opponent-head span:not(:first-child),.live-opponent-player span{text-align:center}.live-opponent-player{border-top:1px solid #e5ece6}.live-opponent-player .card-yellow{color:#a47600}.live-opponent-player .card-red{color:#ce3542}.live-opponent-bench{margin-top:12px}.live-opponent-pitch{width:270px!important;height:auto!important;aspect-ratio:68/105}.dark-mode .live-opponent-meta{color:#b9ccbe}.dark-mode .live-opponent-roster{border-color:#395124}.dark-mode .live-opponent-roster h3{background:#172117;color:#b6ff38}.dark-mode .live-opponent-head{background:#142015;color:#b9ccbe}.dark-mode .live-opponent-player{border-color:#2b431a}.dark-mode .live-opponent-player .card-yellow{color:#ffe36a}.dark-mode .live-opponent-player .card-red{color:#ff8c94}@media(max-width:720px){.live-opponent-layout{grid-template-columns:1fr}.live-opponent-pitch{margin:auto}.live-opponent-modal{padding:18px}}';document.head.append(liveOpponentCss);
  document.body.insertAdjacentHTML('beforeend',`<div id="liveOpponentModal" class="modal hidden"><div class="modal-card live-opponent-modal"><button id="closeLiveOpponent" class="close">×</button><label>ANÁLISE DO ADVERSÁRIO · AO VIVO</label><h2 id="liveOpponentName"></h2><p id="liveOpponentMeta" class="live-opponent-meta"></p><div class="live-opponent-layout"><section><div id="liveOpponentRoster" class="live-opponent-roster"></div></section><div class="pause-pitch tactical-board live-opponent-pitch">${fieldMarkup}<div id="liveOpponentPitch"></div></div></div></div></div>`);
  const finalSummaryCss=document.createElement('style');finalSummaryCss.textContent='.final-goals,.final-basic{margin-top:15px;text-align:left;border:1px solid #d8e6da;border-radius:6px;padding:10px}.final-goals h3,.final-basic h3{margin:0 0 8px;text-align:center;font:700 16px Barlow Condensed;color:#087d58}.final-goals>div{display:grid;grid-template-columns:1fr 1fr;gap:10px}.final-goals article{display:grid;gap:4px;padding:8px;background:#f2f8f2;border-radius:4px;font-size:11px}.final-goals article b{color:#315b43}.final-goals article span{color:#087d58;font-weight:700}.final-basic .stat:last-child{border-bottom:0}.final-injuries{margin-top:15px;text-align:left;border:1px solid #d8e6da;border-radius:6px;padding:10px}.final-injuries h3{margin:0 0 8px;text-align:center;font:700 16px Barlow Condensed;color:#087d58}.final-injuries p{margin:6px 0;padding:7px 9px;border-radius:4px;font-size:11px;line-height:1.4;background:#f2f8f2;color:#315b43}.final-injuries p.cleared{background:#eef8ef;color:#2d6b3f;border-left:4px solid #58c978}.final-injuries p.monitoring{background:#fff8e8;color:#6b5520;border-left:4px solid #ffc94f}.dark-mode .final-goals,.dark-mode .final-basic{border-color:#395124}.dark-mode .final-goals article{background:#172117}.dark-mode .final-goals h3,.dark-mode .final-basic h3,.dark-mode .final-goals article span{color:#b6ff38}.dark-mode .final-goals article b{color:#edf7e6}.dark-mode .final-injuries{border-color:#395124}.dark-mode .final-injuries h3{color:#b6ff38}.dark-mode .final-injuries p{background:#172117;color:#d7e6cb}.dark-mode .final-injuries p.cleared{background:#173526;color:#9dffc0;border-left-color:#58e6a8}.dark-mode .final-injuries p.monitoring{background:#2a220d;color:#ffe6a2;border-left-color:#ffc94f}@media(max-width:560px){.final-goals>div{grid-template-columns:1fr}}';document.head.append(finalSummaryCss);
  const buttonPatternCss=document.createElement('style');buttonPatternCss.textContent='button:where(:not(.nav):not(.close)){border:1px solid #315f70!important;border-radius:5px!important;background:#102630!important;color:#dce9e8!important;padding:10px 15px!important;font:700 10px DM Sans!important;letter-spacing:.15px;cursor:pointer;transition:background .16s ease,border-color .16s ease,color .16s ease,transform .16s ease,box-shadow .16s ease}button:where(:not(.nav):not(.close)):hover{background:#153744!important;border-color:#58bcd8!important;color:#fff!important;box-shadow:0 5px 14px #0005;transform:translateY(-1px)}button:where(:not(.nav):not(.close)):active{transform:translateY(0);box-shadow:none}button:where(:not(.nav):not(.close)):disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none}.formation-buttons button.selected{outline:2px solid #63d9ff;outline-offset:1px}';document.head.append(buttonPatternCss);
  const tacticalDragCss=document.createElement('style');tacticalDragCss.textContent='.repositionable{cursor:grab;touch-action:none}.repositionable:active{cursor:grabbing}.repositionable.dragging{opacity:.55}.drop-target i{outline:2px solid #63d9ff!important;outline-offset:2px;box-shadow:0 0 10px #63d9ff88!important}.tactical-board .repositionable small:after{content:" ↕";color:#b6ff38;font-size:7px;opacity:.85}.tactical-board .vacant small:after{content:none}.tactical-board .vacancy-target{cursor:crosshair}.tactical-board .vacancy-target i{animation:boardVacancyPulse 2s ease-in-out infinite}@keyframes boardVacancyPulse{50%{box-shadow:0 0 0 2px #ff637066!important}}';document.head.append(tacticalDragCss);
  const boardVisualCss=document.createElement('style');boardVisualCss.textContent='.tactical-board .board-player{width:54px!important;z-index:3!important;line-height:1}.tactical-board .board-player i{position:relative!important;display:grid!important;place-items:center;width:28px!important;height:28px!important;margin:0 auto!important;font-size:10px!important;border:2px solid #fff!important;background:#07351d!important;box-shadow:0 1px 4px #00180fcc!important;overflow:visible!important}.tactical-board .board-player i:before{content:"";position:absolute;inset:-3px;border-radius:50%;background:conic-gradient(#18d69f calc(var(--energy,100)*1%),#0000 0);opacity:.55;z-index:-1}.tactical-board .board-player i span{position:relative;z-index:1;font-weight:800}.tactical-board .board-player small{display:block;max-width:54px;margin:3px auto 0!important;padding:0!important;background:none!important;color:#f4fff8!important;font:700 7px DM Sans!important;line-height:1.1!important;letter-spacing:.15px!important;text-shadow:0 1px 2px #002015;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tactical-board .board-player.vacant i{background:#2a1218!important;border:2px dashed #ff8a9a!important;color:#ffc8d0!important;box-shadow:none!important}.tactical-board .board-player.vacant i:before{display:none}.tactical-board .board-player.vacant small{color:#ffb8c2!important}.tactical-board .board-badge{position:absolute;top:0;right:calc(50% - 20px);width:0;height:0;pointer-events:none}.tactical-board .board-badge-yellow:after{content:"";position:absolute;width:6px;height:9px;border:1px solid #755600;border-radius:1px;background:#ffdc22;box-shadow:0 1px 2px #0008}.tactical-board .board-badge-injury:after{content:"+";position:absolute;display:grid;place-items:center;width:11px;height:11px;border-radius:50%;background:#ff6370;color:#fff;font:900 8px DM Sans;line-height:1;box-shadow:0 1px 3px #0009}.tactical-board .board-badge-risk:after{content:"!";position:absolute;display:grid;place-items:center;width:11px;height:11px;border-radius:50%;background:#ffc94f;color:#171003;font:900 8px DM Sans;line-height:1;box-shadow:0 1px 3px #0009}.board-legend{position:absolute;left:8px;right:8px;bottom:6px;z-index:4;display:flex;flex-wrap:wrap;justify-content:center;gap:8px 12px;padding:4px 6px;border-radius:4px;background:#00180fcc;color:#d7efe6;font:600 7px DM Sans;letter-spacing:.2px;pointer-events:none}.board-legend span{display:inline-flex;align-items:center;gap:4px;opacity:.92}.board-legend-dot{display:inline-block;width:8px;height:8px;border-radius:50%;border:1px solid #fff6}.board-legend-yellow{background:#ffdc22;border-color:#755600}.board-legend-injury{background:#ff6370;border-color:#ffb8c2}.board-legend-risk{background:#ffc94f;border-color:#ffe6a2}.board-legend-vacant{background:#2a1218;border:1px dashed #ff8a9a;border-radius:2px;width:8px;height:8px}';document.head.append(boardVisualCss);
  const indicatorPaletteCss=document.createElement('style');indicatorPaletteCss.textContent='.environment-gauge.positive{background:conic-gradient(#00c99b calc(var(--environment)*1%),#bcefe6 0)!important}.environment-gauge.positive strong{color:#00a982!important}.environment-gauge.medium{background:conic-gradient(#ff9f1c calc(var(--environment)*1%),#ffe1ad 0)!important}.environment-gauge.medium strong{color:#e87b00!important}.environment-gauge.negative{background:conic-gradient(#ff3d52 calc(var(--environment)*1%),#ffc4cb 0)!important}.environment-gauge.negative strong{color:#e1283d!important}.dashboard-factors>div.positive{border-color:#35ae82}.dashboard-factors>div.positive b{color:#00a982}.dashboard-factors>div.medium{border-color:#f39a1d}.dashboard-factors>div.medium b{color:#df7800}.dashboard-factors>div.negative{border-color:#ed4858}.dashboard-factors>div.negative b{color:#df3044}.dark-mode .environment-gauge.positive{background:conic-gradient(#00dca8 calc(var(--environment)*1%),#1b4a41 0)!important}.dark-mode .environment-gauge.medium{background:conic-gradient(#ffad28 calc(var(--environment)*1%),#4f3511 0)!important}.dark-mode .environment-gauge.negative{background:conic-gradient(#ff4c60 calc(var(--environment)*1%),#4f2028 0)!important}.dark-mode .environment-gauge.positive strong,.dark-mode .dashboard-factors>div.positive b{color:#3dffc7!important}.dark-mode .environment-gauge.medium strong,.dark-mode .dashboard-factors>div.medium b{color:#ffc35b!important}.dark-mode .environment-gauge.negative strong,.dark-mode .dashboard-factors>div.negative b{color:#ff7c89!important}.dark-mode .dashboard-factors>div.medium{border-color:#a86814}.dark-mode .dashboard-factors>div.negative{border-color:#a73542}';document.head.append(indicatorPaletteCss);
  const goalEventCss=document.createElement('style');goalEventCss.textContent='.timeline p.goal,.timeline p.yellow,.timeline p.red{display:block!important;width:100%!important;box-sizing:border-box;margin:8px 0!important;padding:8px 10px!important;border-radius:4px;font-size:14px!important;font-weight:700!important;line-height:1.35}.timeline p.goal{border:1px solid #74b80f;border-left:5px solid #a8ff19;background:#eaffc9;color:#284600}.timeline p.yellow{border:1px solid #d29a00;border-left:5px solid #ffcc18;background:#fff4bf;color:#634700}.timeline p.red{border:1px solid #d84242;border-left:5px solid #ff3d3d;background:#ffd8d8;color:#7c1414}.dark-mode .timeline p.goal{background:#1d3509;color:#c9ff63;border-color:#78b91a;border-left-color:#b6ff38;box-shadow:0 0 12px #a8ff1924}.dark-mode .timeline p.yellow{background:#392d05;color:#ffe889;border-color:#d8a718;border-left-color:#ffdb32;box-shadow:0 0 12px #ffcf1824}.dark-mode .timeline p.red{background:#3a1012;color:#ffb5b5;border-color:#df4646;border-left-color:#ff5555;box-shadow:0 0 12px #ff3d3d24}';document.head.append(goalEventCss);
  const availabilityCss=document.createElement('style');availabilityCss.textContent='.timeline p.injury,.timeline p.injury-substitution{display:block;width:100%;box-sizing:border-box;margin:7px 0;padding:7px 10px;border-left:5px solid #ff6370;border-radius:4px;background:#3b151b;color:#ffb5bd;font-size:13px;font-weight:700}.timeline p.injury-substitution{border-left-color:#63d9ff;background:#102b35;color:#bfefff}.timeline p.discomfort{display:block;width:100%;box-sizing:border-box;margin:7px 0;padding:7px 10px;border-left:5px solid #ffc94f;border-radius:4px;background:#2a220d;color:#ffe6a2;font-size:13px;font-weight:600}';document.head.append(availabilityCss);
  const penaltyDecisionCss=document.createElement('style');penaltyDecisionCss.textContent='.timeline p.penalty{display:block!important;width:100%!important;box-sizing:border-box;margin:8px 0!important;padding:10px 12px!important;border:1px solid #d79b29!important;border-left:5px solid #ffc94f!important;border-radius:5px;background:#3a2a0b!important;color:#ffe6a2!important;font-size:14px!important;font-weight:800!important;line-height:1.35;box-shadow:0 0 14px #ffc94f20}.timeline p.shootout-miss{display:block!important;width:100%!important;box-sizing:border-box;margin:8px 0!important;padding:8px 10px!important;border:1px solid #d84242!important;border-left:5px solid #ff5555!important;border-radius:5px;background:#3a1012!important;color:#ffb5b5!important;font-size:13px!important;font-weight:700!important}.timeline p.goal.shootout-standard,.timeline p.goal.shootout-specialist{display:block!important;width:100%!important;box-sizing:border-box;margin:8px 0!important;padding:8px 10px!important;border:1px solid #74b80f!important;border-left:5px solid #ffc94f!important;border-radius:5px;background:#1d3509!important;color:#c9ff63!important;font-size:14px!important;font-weight:800!important}.shootout-panel{order:-1;margin:10px 0 14px!important;padding:14px!important;border:1px solid #d79b29!important;background:linear-gradient(135deg,#251d0d,#10232b)!important;border-radius:7px!important}.shootout-panel label{display:block;color:#ffc94f!important;font-size:10px!important;font-weight:800!important;letter-spacing:1px}.shootout-panel strong{display:block;margin:4px 0 10px;color:#fff;font:700 18px Barlow Condensed}.shootout-track{display:grid;grid-template-columns:1fr 1fr;gap:10px}.shootout-track article{padding:10px;border:1px solid #315b68;border-radius:6px;background:#0d2029}.shootout-track b{display:block;margin-bottom:8px;color:#63d9ff;font-size:10px}.shootout-kicks{display:flex;flex-wrap:wrap;gap:6px}.shootout-kicks i{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;font-size:12px;font-weight:900;font-style:normal}.shootout-kicks i.hit{background:#1d3509;color:#b6ff38;border:1px solid #78b91a}.shootout-kicks i.miss{background:#3a1012;color:#ffb5b5;border:1px solid #df4646}.shootout-kicks i.pending{background:#152229;color:#8ba7aa;border:1px dashed #315b68}.shootout-hint{margin:10px 0 0;color:#9eb6b8;font-size:11px}.penalty-choice{order:-1;margin:10px 0 14px!important;padding:14px!important;border:1px solid #d79b29!important;background:linear-gradient(135deg,#251d0d,#10232b)!important;border-radius:7px!important;box-shadow:0 8px 22px #0006}.penalty-choice-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:11px;padding-bottom:10px;border-bottom:1px solid #6e5726}.penalty-choice-heading label{display:block;color:#ffc94f!important;font-size:10px!important;font-weight:800!important;letter-spacing:1px}.penalty-choice-heading strong{display:block;margin:4px 0 0!important;color:#fff;font-size:18px}.penalty-goalkeeper{display:grid;gap:2px;text-align:right;color:#9eb6b8;font-size:10px}.penalty-goalkeeper b{color:#edf8f5;font-size:11px}.penalty-goalkeeper em{color:#63d9ff;font-style:normal;font-weight:800}.penalty-choice #penaltyTakers{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.penalty-choice #penaltyTakers button{position:relative;display:grid;grid-template-columns:1fr auto;gap:7px 12px;align-items:center;margin:0!important;padding:11px!important;text-align:left;border:1px solid #315b68!important;background:#0d2029!important;color:#edf8f5!important;border-radius:6px!important}.penalty-choice #penaltyTakers button:hover{border-color:#63d9ff!important;background:#13303b!important}.penalty-choice #penaltyTakers button.best-option{border-color:#ffc94f!important;background:linear-gradient(145deg,#31250d,#10252d)!important;box-shadow:inset 3px 0 0 #ffc94f,0 0 13px #ffc94f20}.penalty-taker-title{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:6px}.penalty-taker-title b{font-size:12px}.penalty-best-badge{padding:3px 5px;border-radius:3px;background:#ffc94f;color:#171003;font-size:7px;font-weight:900;letter-spacing:.45px}.penalty-specialist{color:#b6ff38;font-size:8px;font-weight:800}.penalty-metric{display:grid;gap:2px}.penalty-metric small{color:#8ba7aa;font-size:7px;letter-spacing:.35px}.penalty-metric strong{margin:0!important;color:#f2fbf8;font-size:13px}.penalty-metric.chance strong{color:#ffc94f}.penalty-choice-note{grid-column:1/-1;color:#9eb6b8;font-size:8px}@media(max-width:720px){.penalty-choice #penaltyTakers{grid-template-columns:1fr}.penalty-choice-heading{align-items:flex-start;flex-direction:column}.penalty-goalkeeper{text-align:left}.shootout-track{grid-template-columns:1fr}}';document.head.append(penaltyDecisionCss);
  const neonDarkCss=document.createElement('style');neonDarkCss.textContent='body.dark-mode{background:#050807;color:#f4f8f2}body.dark-mode .sidebar{background:#070b08;border-right:1px solid #203313}body.dark-mode header{background:#0a0f0b;border-color:#2a4218;color:#d7e6cb}body.dark-mode .card,body.dark-mode .modal-card{background:#101811;border-color:#344d1d;box-shadow:0 0 0 1px #9cff1612}body.dark-mode .nav{color:#d2dfcb}body.dark-mode .nav:hover,body.dark-mode .nav.active{background:#a8ff19;color:#071004}body.dark-mode .brand>span:first-child,body.dark-mode .brand span:last-child,body.dark-mode .hero p,body.dark-mode .title p,body.dark-mode .card label{color:#a8ff19}body.dark-mode .season,body.dark-mode .club small,body.dark-mode .hero>div>span,body.dark-mode .teams small,body.dark-mode .teams strong small,body.dark-mode .match footer,body.dark-mode .mood small,body.dark-mode .form+small,body.dark-mode .controls p{color:#b6c8ad}body.dark-mode .match footer,body.dark-mode .club{border-color:#2d4619}body.dark-mode .match button{background:#a8ff19;color:#071004}body.dark-mode .theme-toggle{background:transparent;border-color:#8cdb13;color:#b6ff38;border-radius:999px}body.dark-mode .theme-toggle:hover{background:#a8ff19;color:#071004}body.dark-mode .formation-buttons button,body.dark-mode .controls select,body.dark-mode .match-actions button{background:#0b110c;border-color:#6da51a;color:#ecf8df}body.dark-mode .formation-buttons button.selected{background:#a8ff19;border-color:#a8ff19;color:#071004}body.dark-mode .roster-head,body.dark-mode .league-head,body.dark-mode .timeline{background:#121c13;color:#edf7e6}body.dark-mode .player-row,body.dark-mode .roster-head,body.dark-mode .league-row,body.dark-mode .standing-row,body.dark-mode .stat{border-color:#2b431a}body.dark-mode .badge{background:#a8ff19;color:#071004}body.dark-mode .standing-row.highlight{background:#263d12;color:#d7ff8c}body.dark-mode .form b{background:#a8ff19;color:#071004}body.dark-mode .form .loss{background:#5a221d;color:#ffd8d2}body.dark-mode .timeline .goal{color:#b6ff38}';document.head.append(neonDarkCss);
  const menuVisualCss=document.createElement('style');menuVisualCss.textContent='.modal-card.options-modal{padding:26px 28px!important;border:1px solid #365d42!important;box-shadow:0 20px 55px #000a!important}.options-modal>label{display:block;color:#78d4ff!important;font:700 10px DM Sans;letter-spacing:1px}.options-modal h2{margin:7px 0 20px!important;font-size:34px!important}.option-section{padding:16px!important;margin-top:12px!important;border:1px solid #315637!important;background:#0d1710!important;border-radius:8px!important}.option-section>label{color:#b6ff38!important;font-size:10px!important}.option-section p{color:#c5d3c7!important;line-height:1.45}.option-choices{gap:9px!important}.option-choices button{min-height:38px!important;background:#15231a!important;color:#edf7e6!important;border:1px solid #42664b!important;border-radius:6px!important;box-shadow:none!important}.option-choices button:hover{background:#1c3023!important;border-color:#75b884!important;transform:none!important}.option-choices button.selected{background:linear-gradient(115deg,#a8ff19,#72e1ff)!important;color:#071004!important;border-color:#a8ff19!important;box-shadow:0 0 0 1px #d6ff8d55!important}.option-choices button.selected small{color:#102316!important}.option-choices button.selected b{color:#071004!important}.pace-choice{grid-template-columns:108px 1fr!important;align-items:center!important}.pace-choice b{font-size:11px}.pace-choice small{font-size:10px!important;line-height:1.25}.future-options li{padding:10px 12px!important;background:#152019!important;border-left:3px solid #3d6650!important;color:#bdcdbf!important}.future-options b{color:#8dff44!important}.sidebar nav{gap:5px!important}.nav{border-left:3px solid transparent!important;border-radius:5px!important}.nav.active{border-left-color:#72e1ff!important}.formation-buttons button,.match-actions button{background:#132018!important;color:#e8f4e9!important;border:1px solid #416a4e!important;border-radius:5px!important;box-shadow:none!important}.formation-buttons button:hover,.match-actions button:hover{background:#1b3022!important;border-color:#75c68b!important;transform:none!important}.formation-buttons button.selected{background:linear-gradient(115deg,#a8ff19,#72e1ff)!important;color:#071004!important;border-color:#b6ff38!important}.match-actions button{padding:10px 13px!important}.close{color:#d5e6d6!important}.close:hover{color:#72e1ff!important}@media(max-width:560px){.options-modal{padding:20px!important}.pace-choice{grid-template-columns:1fr!important}.pace-choice small{grid-column:1!important}}';document.head.append(menuVisualCss);
  const matchdayPaletteCss=document.createElement('style');matchdayPaletteCss.textContent=':root{--md-night:#06131b;--md-surface:#0d2029;--md-surface-2:#122b35;--md-line:#28505b;--md-text:#edf8f5;--md-muted:#9eb6b8;--md-lime:#b6ff38;--md-cyan:#63d9ff;--md-yellow:#ffc94f;--md-red:#ff6370}body,body.dark-mode{background:radial-gradient(circle at 80% -10%,#17485a55,transparent 34%),var(--md-night)!important;color:var(--md-text)!important}header,body.dark-mode header{background:#091a23!important;border-color:var(--md-line)!important;color:var(--md-muted)!important}.sidebar,body.dark-mode .sidebar{background:linear-gradient(180deg,#06131d,#082126 68%,#061116)!important;border-color:var(--md-line)!important}.card,body.dark-mode .card,.modal-card,body.dark-mode .modal-card{background:linear-gradient(145deg,#0d2029,#0b1a22)!important;border-color:var(--md-line)!important;color:var(--md-text)!important;box-shadow:0 8px 24px #00000024!important}.card label,body.dark-mode .card label,.hero p,.title p{color:var(--md-cyan)!important}.hero>div>span,.season,.club small,.match footer,.teams small,.teams strong small,.controls p,.roster-note{color:var(--md-muted)!important}.nav,body.dark-mode .nav{color:#c8dcdd!important}.nav:hover,.nav.active,body.dark-mode .nav:hover,body.dark-mode .nav.active{background:#143947!important;color:#f7fffa!important}.nav.active{box-shadow:inset 3px 0 0 var(--md-lime)}.theme-toggle,body.dark-mode .theme-toggle{background:#102933!important;border-color:#397488!important;color:var(--md-cyan)!important}.theme-toggle:hover,body.dark-mode .theme-toggle:hover{background:#174052!important;color:#f5fffa!important}.crest,.club>b{background:linear-gradient(135deg,var(--md-lime),var(--md-cyan))!important;color:#06131b!important}.teams i{background:#164d5a!important;border:1px solid #398197}.teams i.away{background:#1b547d!important}.match footer,.club{border-color:var(--md-line)!important}.roster,.league,.standings,.scout-roster,.live-opponent-roster,.championship-grid section,.championship-grid aside,.final-basic,.final-goals{background:#0b1a22!important;border-color:var(--md-line)!important}.roster-head,.league-head,.champ-head,.live-opponent-head,.analysis-head,.stat-group,.final-basic h3,.final-goals h3{background:#102b35!important;color:var(--md-cyan)!important;border-color:var(--md-line)!important}.player-row,.league-row,.standing-row,.champ-row,.scorer-row,.fixture-row,.analysis-player,.live-opponent-player,.stat{border-color:#234650!important;color:var(--md-text)!important}.player-row:hover,.league-row:hover,.standing-row:hover,.champ-row:hover,.scorer-row:hover,.fixture-row:hover,.analysis-player:hover,.live-opponent-player:hover{background:#132c36!important}.standing-row.highlight,.league-row.highlight,.champ-row.highlight{background:#203b26!important;color:#dcffa9!important}.badge{background:#183d49!important;color:var(--md-cyan)!important}.fatigue{background:#25424b!important}.fatigue i{background:linear-gradient(90deg,var(--md-cyan),var(--md-lime))!important}.timeline,body.dark-mode .timeline{background:#091820!important;color:#e6f2ef!important;border:1px solid #244752}.pause-controls,.substitution-panel,.option-section{background:#0c1d25!important;border-color:#315b68!important}.pause-controls label,.substitution-panel label{color:var(--md-cyan)!important}.pause-controls select,.controls select,body.dark-mode .pause-controls select,body.dark-mode .controls select{background:#102833!important;color:var(--md-text)!important;border-color:#397487!important}.formation-buttons button,.match-actions button{background:#112832!important;border-color:#397487!important;color:var(--md-text)!important}.formation-buttons button.selected{background:linear-gradient(115deg,var(--md-lime),var(--md-cyan))!important;color:#06131b!important;border-color:var(--md-lime)!important}.tactical-board{background:linear-gradient(90deg,#007e45,#079b68 50%,#007e45)!important;box-shadow:inset 0 0 24px #001f20aa,0 0 0 1px #54dbff33!important}.tactical-board .field-markings,.tactical-board:before{color:#d9fff3!important;border-color:#d9fff3!important}.tactical-board .mid-line,.tactical-board .area,.tactical-board .six-yard,.tactical-board .goal,.tactical-board .centre-circle{border-color:#d9fff3!important}.timeline p.goal{background:#1b3b20!important;border-color:#84d329!important;color:#ddffa5!important}.timeline p.yellow{background:#3a2d0b!important;border-color:#e7b83c!important;color:#ffe794!important}.timeline p.red{background:#3d1520!important;border-color:#ef6572!important;color:#ffbec5!important}.stat.yellow span:first-child,.stat.yellow span:last-child{color:var(--md-yellow)!important}.stat.red span:first-child,.stat.red span:last-child{color:var(--md-red)!important}.environment-gauge.positive{background:conic-gradient(var(--md-cyan) calc(var(--environment)*1%),#234c57 0)!important}.overall-box{background:#102b35!important;border-color:#397487!important}.overall-box strong{color:var(--md-lime)!important}.leader-table{background:#0d2029!important;border-color:var(--md-line)!important}.leader-table span{color:var(--md-muted)!important}.modal{background:#02080cbb!important}.close{color:var(--md-muted)!important}.close:hover{color:var(--md-cyan)!important}';document.head.append(matchdayPaletteCss);
  const tacticSlidersCss=document.createElement('style');tacticSlidersCss.textContent='.tactic-slider{margin:0 0 16px;padding:11px 10px 10px;border:1px solid #315b68;border-radius:7px;background:#0c1d25}.tactic-slider label{display:flex!important;justify-content:space-between;align-items:center;margin:0 0 8px!important}.tactic-slider output{color:#b6ff38;font:700 10px DM Sans;letter-spacing:0;text-transform:none}.tactic-slider>div{display:grid;grid-template-columns:70px 1fr 70px;align-items:center;gap:7px}.tactic-slider small{color:#9eb6b8;font:700 8px DM Sans;text-align:center;letter-spacing:.25px}.tactic-slider input[type=range]{width:100%;height:7px;margin:0;appearance:none;border-radius:99px;background:linear-gradient(90deg,#b6ff38 0 var(--tactic-value,50%),#244853 var(--tactic-value,50%) 100%);outline:none}.tactic-slider input[type=range]::-webkit-slider-thumb{appearance:none;width:17px;height:17px;border-radius:50%;background:#63d9ff;border:3px solid #eafff7;box-shadow:0 0 0 2px #06313c;cursor:grab}.tactic-slider input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#63d9ff;border:3px solid #eafff7;box-shadow:0 0 0 2px #06313c;cursor:grab}.tactic-slider.compact{padding:9px 8px;margin-bottom:11px}.tactic-slider.compact>div{grid-template-columns:43px 1fr 43px;gap:4px}.tactic-slider.compact small{font-size:7px}.tactic-slider.compact label{font-size:9px!important}.tactic-slider.compact output{font-size:9px}@media(max-width:560px){.tactic-slider>div{grid-template-columns:55px 1fr 55px}}';document.head.append(tacticSlidersCss);
  const optionsRefinedCss=document.createElement('style');optionsRefinedCss.textContent='body .modal-card.options-modal{background:linear-gradient(145deg,#0c1d26,#0a171e)!important;border-color:#2d6578!important;box-shadow:0 24px 70px #000c!important}body .options-modal>label{color:#63d9ff!important}body .options-modal h2{color:#eef8f6!important}body .options-modal .option-section{background:#0b1921!important;border-color:#285769!important;padding:15px!important}body .options-modal .option-section>label{color:#79cce7!important}body .options-modal .option-section p{color:#b4c6c8!important}body .options-modal #themeChoices{display:flex!important;gap:8px!important}body .options-modal #themeChoices button{width:auto!important;min-width:132px!important}body .options-modal #paceChoices{display:grid!important;grid-template-columns:1fr!important;gap:7px!important}body .options-modal .option-choices button{background:#102630!important;color:#dce9e8!important;border:1px solid #315f70!important;border-radius:6px!important;box-shadow:none!important}body .options-modal .option-choices button:hover{background:#15323e!important;border-color:#58bcd8!important;color:#fff!important}body .options-modal .option-choices button.selected{background:linear-gradient(90deg,#174a5c,#1b6177)!important;color:#f2fbfb!important;border-color:#67d4ef!important;box-shadow:inset 3px 0 0 #8be7ff!important}body .options-modal .option-choices button.selected b,body .options-modal .option-choices button.selected small{color:#f2fbfb!important}body .options-modal .pace-choice{grid-template-columns:120px 1fr!important;min-height:44px!important;padding:10px 13px!important}body .options-modal .pace-choice b{color:#dff4f5!important;letter-spacing:.35px}body .options-modal .pace-choice small{color:#a8c5c8!important}body .options-modal .future-options li{background:#10232b!important;border-left:2px solid #397e92!important;color:#afc6c8!important}body .options-modal .future-options b{color:#77cfe9!important}body .options-modal .close{color:#a8c5c8!important}body .options-modal .close:hover{color:#86e2fb!important}@media(max-width:560px){body .options-modal .pace-choice{grid-template-columns:1fr!important}body .options-modal .pace-choice small{grid-column:1!important}}';document.head.append(optionsRefinedCss);
  const optionsReferenceCss=document.createElement('style');optionsReferenceCss.textContent='body .modal-card.options-modal{background:#071b24!important;border:1px solid #2a6980!important;border-radius:10px!important;box-shadow:0 18px 58px #000b!important}body .options-modal .option-section{background:#071923!important;border:1px solid #28637a!important;border-radius:8px!important}body .options-modal .option-section>label,body .options-modal>label{color:#63d9ff!important}body .options-modal #paceChoices{gap:7px!important}body .options-modal .option-choices button{background:#0d2732!important;border-color:#286278!important;color:#d7e8ea!important}body .options-modal .option-choices button:hover{background:#123442!important;border-color:#5bc6e2!important}body .options-modal .option-choices button.selected{background:#1d5a6d!important;border-color:#d4f4fb!important;box-shadow:0 0 0 1px #76dbf355!important;color:#f4fcfc!important}body .options-modal .pace-choice{min-height:45px!important}body .options-modal .pace-choice b{color:#e5f4f5!important}body .options-modal .pace-choice small{color:#b8d0d3!important}body .options-modal .future-options li{background:#0d2530!important;border-left-color:#31788e!important;color:#b8ced1!important}body .options-modal .future-options b{color:#65d5ef!important}';document.head.append(optionsReferenceCss);
  const scoutScaleCss=document.createElement('style');scoutScaleCss.textContent='#teamScoutModal .environment-gauge{width:82px!important}#teamScoutModal .environment-gauge strong{font-size:26px!important}#teamScoutModal .overall-box{width:82px!important;height:82px!important}.mood .dashboard-overall strong{font-size:30px}.mood .dashboard-overall small{color:#64786b}.dark-mode .mood .dashboard-overall small{color:#b9ccbe}';document.head.append(scoutScaleCss);
  const scoutSummaryCss=document.createElement('style');scoutSummaryCss.textContent='.scout-side{width:270px}.scout-pitch{margin-bottom:6px}.club-summary{margin-top:26px}.summary-top{display:flex;align-items:center;justify-content:space-around;gap:14px}.overall-box{width:82px;height:82px;border:2px solid #18a875;border-radius:6px;background:#e9f7ef;display:grid;place-content:center;text-align:center}.overall-box small,.environment-gauge small,.leader-table>small{display:block;font:700 9px DM Sans;letter-spacing:.55px;color:#64786b}.overall-box strong{display:block;font:700 40px Barlow Condensed;color:#087d58;line-height:.9}.environment-gauge{--environment:50;width:112px;aspect-ratio:1;border-radius:34%;background:conic-gradient(#09b69f calc(var(--environment)*1%),#c9f0eb 0);display:grid;place-items:center;transform:rotate(22.5deg)}.environment-gauge>div{width:70%;aspect-ratio:1;background:#fff;border-radius:30%;display:grid;place-content:center;text-align:center;transform:rotate(-22.5deg)}.environment-gauge strong{font:700 32px Barlow Condensed;color:#08a994;line-height:.85}.leader-table{margin-top:10px;border:1px solid #d6e5d9;border-radius:5px;padding:8px}.leader-table>div{display:grid;grid-template-columns:78px 1fr 30px;gap:5px;padding:5px 0;border-top:1px solid #e3ece4;font-size:10px}.leader-table>div:first-of-type{margin-top:5px}.leader-table span{color:#718077}.leader-table em{font-style:normal;font-weight:700;color:#07835d;text-align:right}.dark-mode .overall-box,.dark-mode .leader-table{background:#20372b;border-color:#3c5545}.dark-mode .environment-gauge>div{background:#1d3227}.dark-mode .overall-box small,.dark-mode .environment-gauge small,.dark-mode .leader-table span{color:#b9ccbe}@media(max-width:700px){.scout-side{width:auto}.club-summary{max-width:270px;margin:26px auto}}';document.head.append(scoutSummaryCss);
  document.body.insertAdjacentHTML('beforeend',`<div id="teamScoutModal" class="modal hidden"><div class="modal-card scout-modal"><button id="closeTeamScout" class="close">×</button><label>ANÁLISE DO CLUBE</label><h2 id="scoutClubName"></h2><p id="scoutClubMeta"></p><div class="scout-layout"><div class="scout-roster"><h3>Titulares</h3><div id="scoutStarters"></div><h3>Reservas</h3><div id="scoutBench"></div></div><div class="scout-side"><div class="pause-pitch tactical-board scout-pitch">${fieldMarkup}<div id="scoutPitchPlayers"></div></div><section id="scoutSummary" class="club-summary"><div class="summary-top"><div class="overall-box"><small>OVERALL</small><strong id="scoutOverall"></strong></div><div id="scoutEnvironment" class="environment-gauge"><div><strong></strong><small>AMBIENTE</small></div></div></div><div class="leader-table"><small>DESTAQUES DA TEMPORADA</small><div><span>ARTILHEIRO</span><b id="scoutScorer"></b><em id="scoutGoals"></em></div><div><span>ASSISTÊNCIAS</span><b id="scoutAssistant"></b><em id="scoutAssists"></em></div></div></section></div></div></div></div>`);
  const scoutStyle=document.createElement('style');scoutStyle.textContent='.club-scout{margin-top:17px}.club-scout>div{display:flex;gap:10px;align-items:center;margin-top:12px}.club-scout span{color:#718077;flex:1}.club-scout select{padding:8px;border:1px solid #c5d8c9;border-radius:4px}.club-scout button,.scout-button{border:0;border-radius:4px;background:#245e42;color:#fff;padding:9px;font:bold 10px DM Sans;cursor:pointer}.match .scout-button{margin-right:8px}.scout-modal h2{margin:5px 0;font:700 30px Barlow Condensed}.scout-modal p{color:#718077;margin:0 0 12px}.scout-layout{display:grid;grid-template-columns:1fr 270px;gap:16px;text-align:left}.scout-roster{border:1px solid #e1e8e1;border-radius:6px;padding:10px}.scout-roster h3{font:700 16px Barlow Condensed;margin:0 0 5px}.scout-row{display:grid;grid-template-columns:1fr 42px 40px 40px;padding:6px 2px;border-bottom:1px solid #edf1ed;font-size:11px}.scout-pitch{width:270px!important;height:auto!important;aspect-ratio:68/105}.dark-mode .club-scout span,.dark-mode .scout-modal p{color:#b9ccbe}.dark-mode .scout-roster{border-color:#3c5545}.dark-mode .scout-row{border-color:#344b3d}@media(max-width:700px){.club-scout>div,.scout-layout{display:block}.club-scout select,.club-scout button{margin-top:8px}.scout-pitch{margin:12px auto}}';document.head.append(scoutStyle);
  const analysisTableCss=document.createElement('style');analysisTableCss.textContent='.scout-roster{padding:0!important;overflow:hidden}.scout-roster>h3{display:none}.analysis-roster+.analysis-roster{border-top:12px solid #101811}.analysis-roster h3{margin:0!important;padding:10px 12px!important;background:#172117;color:#b6ff38!important;font:700 15px Barlow Condensed!important}.analysis-head,.analysis-player{display:grid;grid-template-columns:1fr 42px 48px 62px;gap:7px;padding:7px 12px;align-items:center;font-size:11px}.analysis-head{background:#142015;color:#b9ccbe;font-size:9px;font-weight:700}.analysis-head span:not(:first-child),.analysis-player span{text-align:center}.analysis-player{border-top:1px solid #2b431a;color:#edf7e6}.analysis-player b{font-weight:700}.dark-mode .analysis-roster+.analysis-roster{border-color:#101811}@media(max-width:700px){.analysis-head,.analysis-player{grid-template-columns:1fr 38px 42px 55px;padding-left:8px;padding-right:8px}}';document.head.append(analysisTableCss);
  const fatigueTableCss=document.createElement('style');fatigueTableCss.textContent='.analysis-player .table-fatigue,.live-opponent-player .table-fatigue{display:flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap;font-weight:700}.table-fatigue i{display:block;width:22px;height:5px;overflow:hidden;border-radius:99px;background:#405342}.table-fatigue i b{display:block;height:100%;border-radius:inherit;background:#f1bd2a}.table-fatigue:has(i b[style^="width:0"] ) i b{background:#48d69a}.dark-mode .table-fatigue i{background:#314535}.dark-mode .table-fatigue i b{background:#ffd24a}';document.head.append(fatigueTableCss);
  // Padrão único para todas as tabelas e listagens geradas pelo jogo.
  const tablePatternCss=document.createElement('style');tablePatternCss.textContent='.roster,.league,.standings,.scout-roster,.live-opponent-roster,.championship-grid section,.championship-grid aside,.final-basic,.final-goals{border:1px solid #395124!important;border-radius:7px!important;overflow:hidden;background:#101811}.roster-head,.league-head,.champ-head,.live-opponent-head,.analysis-head,.stat-group,.final-basic h3,.final-goals h3{background:#172117!important;color:#b6ff38!important;border-color:#395124!important;font-weight:700!important}.player-row,.standing-row,.league-row,.champ-row,.scorer-row,.fixture-row,.stat,.live-opponent-player,.analysis-player,.leader-table>div{border-color:#2b431a!important;color:#edf7e6}.player-row:hover,.standing-row:hover,.league-row:hover,.champ-row:hover,.scorer-row:hover,.fixture-row:hover,.live-opponent-player:hover,.analysis-player:hover{background:#172117}.standing-row.highlight,.league-row.highlight,.champ-row.highlight{background:#263d12!important;color:#d7ff8c!important}.standing-row.highlight span,.league-row.highlight span,.champ-row.highlight span{color:inherit!important}.stat-group{padding:9px 8px!important;letter-spacing:.6px}.stat.yellow span:first-child,.stat.yellow span:last-child{color:#ffe36a}.stat.red span:first-child,.stat.red span:last-child{color:#ff8c94}.scorer-row strong,.fixture-row i,.leader-table em{color:#b6ff38!important}.final-goals article{background:#172117!important;color:#edf7e6}.final-goals article b{color:#b6ff38!important}.final-goals article span{color:#edf7e6!important}.dark-mode .roster,.dark-mode .league,.dark-mode .standings,.dark-mode .scout-roster,.dark-mode .live-opponent-roster,.dark-mode .championship-grid section,.dark-mode .championship-grid aside,.dark-mode .final-basic,.dark-mode .final-goals{background:#101811}@media(max-width:700px){.roster-head,.player-row,.league-head,.league-row,.champ-head,.champ-row{font-size:10px}}';document.head.append(tablePatternCss);
  const possessionEmphasisCss=document.createElement('style');possessionEmphasisCss.textContent='.stats .stat.possession{min-height:46px;padding:12px 14px!important;background:#172117!important;border-top:1px solid #4d7723!important;border-bottom:1px solid #4d7723!important;font-size:14px!important;font-weight:800!important}.stats .stat.possession span:first-child,.stats .stat.possession span:last-child{font-size:17px!important;color:#b6ff38!important}.stats .stat.possession span:nth-child(2){letter-spacing:.25px;color:#f4f9ef!important}.final-basic .stat:first-of-type{min-height:42px;font-size:13px;font-weight:800;background:#172117}.final-basic .stat:first-of-type span:first-child,.final-basic .stat:first-of-type span:last-child{font-size:16px;color:#b6ff38}@media(max-width:560px){.stats .stat.possession{font-size:12px!important}.stats .stat.possession span:first-child,.stats .stat.possession span:last-child{font-size:15px!important}}';document.head.append(possessionEmphasisCss);
  const championshipSpacingCss=document.createElement('style');championshipSpacingCss.textContent='.championship-modal{width:min(1040px,calc(100vw - 32px))!important;padding:26px!important}.championship-modal>label{display:block;margin-bottom:4px}.championship-modal h2{margin:4px 0 6px!important}.championship-format{display:block;margin-bottom:20px;color:#b6c8ad;font:700 10px DM Sans;letter-spacing:.65px}.championship-grid{grid-template-columns:minmax(520px,1fr) 300px!important;gap:24px!important;align-items:start}.championship-grid section,.championship-grid aside{min-width:0}.championship-grid h3{margin:0!important;padding:12px 14px 10px!important;font-size:20px!important;line-height:1.05}.champ-head,.champ-row{grid-template-columns:34px minmax(170px,1fr) repeat(6,44px)!important;gap:6px!important;padding:10px 12px!important;min-height:34px;align-items:center}.champ-head{padding-top:11px!important;padding-bottom:11px!important}.scorer-row{grid-template-columns:28px minmax(120px,1fr) 94px 32px!important;gap:8px!important;padding:10px 12px!important;min-height:36px;align-items:center}.fixture-row{gap:5px!important;padding:10px 12px!important;min-height:48px}.fixture-row small{font-size:10px}.fixture-row b{line-height:1.25}.championship-grid aside #topScorers+h3{border-top:1px solid #395124!important;margin-top:0!important}@media(max-width:850px){.championship-modal{width:min(680px,calc(100vw - 24px))!important}.championship-grid{grid-template-columns:1fr!important}.champ-head,.champ-row{grid-template-columns:28px minmax(120px,1fr) repeat(6,34px)!important;font-size:10px}.scorer-row{grid-template-columns:28px minmax(120px,1fr) 84px 28px!important}}';document.head.append(championshipSpacingCss);
  const fatigueCell=player=>`<span class="table-fatigue"><i><b style="width:${clamp(player.fatigue,0,100)}%"></b></i>${Math.round(player.fatigue)}%</span>`;
  const analysisTable=(title,players,numbered=false)=>`<section class="analysis-roster"><h3>${title}</h3><div class="analysis-head"><span>JOGADOR</span><span>POS.</span><span>OVR</span><span>CANSAÇO</span></div>${players.map((player,index)=>`<div class="analysis-player">${playerNameCell(player.name,player,{prefix:numbered?(index+1)+'. ':''})}<span>${player.pos}</span><span>${player.overall}</span>${fatigueCell(player)}</div>`).join('')}</section>`;
  const openScout=name=>{const club=clubs[name], roster=club.roster, coords=formations[club.formation]||formations['4-3-3'], overall=Math.round(roster.slice(0,11).reduce((sum,p)=>sum+p.overall,0)/11), leaders=clubSeasonLeaders(name);$('#scoutClubName').textContent=club.name;$('#scoutClubMeta').textContent=`${club.formation} · ${club.style} · Mentalidade ${club.mentality} · ${club.position}º na tabela`;$('#scoutOverall').textContent=overall;setIndicatorTone($('#scoutEnvironment'),club.environment);$('#scoutEnvironment').style.setProperty('--environment',club.environment);$('#scoutEnvironment strong').textContent=`${club.environment}%`;$('#scoutScorer').textContent=leaders.scorer.name;$('#scoutGoals').textContent=`${leaders.goals} G`;$('#scoutAssistant').textContent=leaders.assistant.name;$('#scoutAssists').textContent=`${leaders.assists} A`;$('#scoutStarters').innerHTML=analysisTable('TITULARES',roster.slice(0,11),true);$('#scoutBench').innerHTML=analysisTable('RESERVAS',roster.slice(11));$('#scoutPitchPlayers').innerHTML=coords.map((p,i)=>`<div class="board-player" style="left:${p[0]}%;top:${p[1]===91?88:p[1]}%"><i style="--energy:${clamp(roster[i].fatigue,0,100)}%"><span>${i+1}</span></i><small>${roster[i].name}</small></div>`).join('');$('#teamScoutModal').classList.remove('hidden');};
  const openClubFromTable=target=>{const clubTarget=target.closest?.('[data-club]'),name=clubTarget?.dataset.club;if(!name||!clubs[name])return false;openScout(name);return true;};
  document.addEventListener('click',event=>openClubFromTable(event.target));
  document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&openClubFromTable(event.target))event.preventDefault();});
  scoutStyle.textContent+=' .club-link,[data-club]{cursor:pointer}.club-link:hover,.club-link:focus{text-decoration:underline;color:#b6ff38!important}.club-link:focus-visible,[data-club]:focus-visible{outline:2px solid #65d4ff;outline-offset:-2px}.championship-modal h2{margin:5px 0 14px;font:700 32px Barlow Condensed}.championship-grid{display:grid;grid-template-columns:minmax(430px,1fr) 260px;gap:18px;text-align:left}.championship-grid h3{font:700 18px Barlow Condensed;margin:0 0 6px}.champ-head,.champ-row{display:grid;grid-template-columns:30px 1fr repeat(6,35px);gap:3px;padding:8px 4px;border-bottom:1px solid #e4ebe5;font-size:11px}.champ-head{background:#f0f4f0;color:#687a6e;font-weight:bold}.champ-row span:not(:nth-child(2)),.champ-head span:not(:nth-child(2)){text-align:center}.champ-row.highlight{background:#e7f3cf;color:#42620d;font-weight:bold}.scorer-row{display:grid;grid-template-columns:22px 1fr 74px 24px;padding:7px 2px;border-bottom:1px solid #e4ebe5;font-size:11px}.scorer-row small{color:#718077}.scorer-row strong{text-align:right;color:#168456}.fixture-row{display:grid;gap:3px;padding:8px 2px;border-bottom:1px solid #e4ebe5;font-size:11px}.fixture-row small{color:#718077}.fixture-row i{color:#168456}.dark-mode .champ-head{background:#24372c;color:#d5e1d7}.dark-mode .champ-row,.dark-mode .scorer-row,.dark-mode .fixture-row{border-color:#344b3d}.dark-mode .scorer-row small,.dark-mode .fixture-row small{color:#b9ccbe}@media(max-width:700px){.championship-grid{grid-template-columns:1fr}.champ-head,.champ-row{grid-template-columns:25px 1fr repeat(6,30px);font-size:10px}}';
  const divisionTabsCss=document.createElement('style');divisionTabsCss.textContent='.division-tabs{display:flex;gap:7px;margin:13px 0 18px}.championship-modal .division-tabs button,.dark-mode .championship-modal .division-tabs button{min-width:86px;padding:8px 12px!important;border:1px solid #28505b!important;border-radius:5px!important;background:#0d2029!important;color:#9ebfc2!important;font:700 10px DM Sans!important;box-shadow:none!important;cursor:pointer}.championship-modal .division-tabs button:hover{background:#122b35!important;border-color:#397487!important;color:#edf8f5!important;box-shadow:none!important;transform:none!important}.championship-modal .division-tabs button.active{background:#174052!important;border-color:#63d9ff!important;color:#f4fcfc!important;box-shadow:inset 0 -2px #63d9ff!important}.championship-grid.non-a{grid-template-columns:1fr!important}.championship-grid.non-a .championship-sidebar{max-width:none}.championship-grid.non-a .championship-upcoming{margin-top:0!important}@media(max-width:560px){.division-tabs{display:grid;grid-template-columns:1fr 1fr}.championship-modal .division-tabs button{width:100%}}';document.head.append(divisionTabsCss);
  divisionTabsCss.textContent+='.champ-row.promotion{background:#173b2b!important;box-shadow:inset 3px 0 0 #58e6a8}.champ-row.relegation{background:#3a1d25!important;box-shadow:inset 3px 0 0 #ff6370}.series-d-layout{display:grid;gap:16px;padding:12px}.d-group-card{border:1px solid #28505b;border-radius:6px;overflow:hidden;background:#0b1a22}.d-group-card.user-group-card{border-color:#63d9ff55;background:#0d2029}.d-group-card h4{margin:0;padding:9px 10px;background:#123843;color:#b6ff38;font:700 15px Barlow Condensed;display:flex;align-items:center;justify-content:space-between;gap:8px}.d-group-card.user-group-card h4{background:#143040;color:#f4fbf5;padding:10px 12px}.d-group-card h4 em{font-style:normal;color:#b6ff38;font:700 8px DM Sans;letter-spacing:.55px}.d-group-head,.d-group-row{display:grid;grid-template-columns:28px minmax(0,1fr) 30px 34px;gap:6px;align-items:center;padding:7px 9px}.d-group-head{background:#102b35;color:#63d9ff;font:700 8px DM Sans}.d-group-row{border-top:1px solid #234650;font-size:10px;color:#d8e8ea}.d-group-row span:nth-child(n+3),.d-group-head span:nth-child(n+3){text-align:center}.d-group-row.qualified{background:#173b2b!important;box-shadow:inset 3px 0 0 #58e6a8}.d-group-row.user-club{background:#1a3224!important;box-shadow:inset 3px 0 0 #b6ff38}.d-group-row.user-club .club-link{color:#f4fbf5;font-weight:700}.d-group-grid-compact .d-group-row.qualified{background:#142922!important;box-shadow:inset 2px 0 0 #58e6a8}.d-group-others-label{margin:0 0 8px;padding:0 2px;color:#7fa8b0;font:700 9px DM Sans;letter-spacing:.6px;text-transform:uppercase}.d-group-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.d-group-grid-compact{gap:8px}.d-group-grid-compact .d-group-card.compact{background:#091820;border-color:#1e3a44}.d-group-grid-compact .d-group-card.compact h4{padding:7px 9px;font-size:12px;color:#8fb0b4;background:#0f242c}.d-group-grid-compact .d-group-row{font-size:9px;padding:5px 8px;color:#aebfc2}.d-group-grid-compact .d-group-head{padding:6px 8px;font-size:7px}.series-d-table{max-height:62vh;overflow:auto}.championship-grid.serie-d-view{grid-template-columns:minmax(420px,1fr) 280px!important;gap:20px!important}.championship-grid.serie-d-view>section>h3{font-size:17px!important;color:#9ebfc2!important;background:#102b35!important}.championship-grid.serie-d-view .series-d-table{max-height:58vh}@media(max-width:720px){.d-group-grid{grid-template-columns:1fr}}';
  divisionTabsCss.textContent+='.championship-grid section:has(.cup-stage-table){background:#0b1a22!important;border-color:#28505b!important}.championship-grid section:has(.cup-stage-table)>h3{padding:13px 16px!important;background:#102b35!important;color:#63d9ff!important;font:700 12px DM Sans!important;letter-spacing:.7px;text-transform:uppercase}.cup-stage-table{display:grid;background:#0b1a22}.championship-modal button.cup-stage-row,.dark-mode .championship-modal button.cup-stage-row{display:grid!important;grid-template-columns:30px minmax(110px,.8fr) minmax(175px,1fr) 116px;gap:12px;align-items:center;width:100%;min-height:46px;padding:10px 16px!important;border:0!important;border-bottom:1px solid #234b55!important;border-radius:0!important;background:#0b1a22!important;color:#edf8f5!important;box-shadow:none!important;text-align:left!important;transform:none!important}.championship-modal button.cup-stage-row:last-child{border-bottom:0!important}.cup-stage-row span{display:grid;place-items:center;width:22px;height:22px;border:1px solid #315b68;border-radius:50%;color:#78cbe5;font-size:9px;font-weight:800}.cup-stage-row b{font-size:10px;letter-spacing:.15px}.cup-stage-row small{color:#88a7aa;font-size:8px;letter-spacing:.2px}.cup-stage-row em{text-align:right;color:#637f84;font-size:8px;font-style:normal;font-weight:700;letter-spacing:.25px}.cup-stage-row.generated{cursor:pointer!important}.championship-modal button.cup-stage-row.generated:hover{background:#102832!important;box-shadow:none!important;transform:none!important}.championship-modal button.cup-stage-row.current{background:#102b35!important;box-shadow:inset 3px 0 #63d9ff!important}.cup-stage-row.current span{border-color:#63d9ff;color:#63d9ff}.cup-stage-row.current em{color:#b6ff38}.cup-stage-row.completed em{color:#63d9ff}.championship-modal button.cup-stage-row:disabled{background:#0b1a22!important;color:#edf8f5!important;opacity:1!important;cursor:default!important}.cup-stage-row:disabled b{color:#b2c4c5}.cup-stage-row:disabled small,.cup-stage-row:disabled em{color:#587278}@media(max-width:650px){.championship-modal button.cup-stage-row{grid-template-columns:28px 1fr;gap:5px 9px;padding:10px 12px!important}.cup-stage-row small,.cup-stage-row em{grid-column:2;text-align:left}}';
  document.body.insertAdjacentHTML('beforeend',`<div id="championshipModal" class="modal hidden"><div class="modal-card championship-modal"><button id="closeChampionship" class="close">×</button><label id="championshipDivisionLabel">CAMPEONATO BRASILEIRO · SÉRIE A</label><h2>Brasileirão 2026</h2><small id="championshipFormat" class="championship-format"></small><div id="divisionTabs" class="division-tabs">${Object.keys(divisionRules).map(division=>`<button data-division="${division}">SÉRIE ${division}</button>`).join('')}<button data-competition="CUP">COPA DO BRASIL</button></div><div class="championship-grid"><section><h3>Tabela</h3><div class="champ-head"><span>#</span><span>CLUBE</span><span>J</span><span>V</span><span>E</span><span>D</span><span>SG</span><span>PTS</span></div><div id="championshipTable"></div></section><aside class="championship-sidebar"></aside></div></div></div>`);
  let championshipDivision=userDivision,championshipRoundView=currentRound,championshipGroupView=userSerieDGroupIndex,championshipLeaderMode='scorers';
  const classificationZone=(division,index,total)=>division==='A'&&index>=total-4?'relegation':division==='B'?(index<4?'promotion':index>=total-4?'relegation':''):division==='C'?(index<4?'promotion':index>=total-2?'relegation':''):'';
  const championshipRoundLimit=division=>division==='CUP'?Math.max(1,cupCompetition.stages.length):Math.max(1,nationalCompetitions[division].fixtures.length);
  const championshipRoundHistory=division=>(division===userDivision?seasonRoundHistory:competitionRoundHistory[division])||[];
  const renderChampionshipLeaders=()=>{
    const scope=$('#championshipLeaderScope'),table=$('#championshipLeadersTable');
    if(!scope||!table)return;
    const division=championshipDivision,mode=championshipLeaderMode,metric=mode==='scorers'?'goals':'assists',entries=championshipLeadersFor(division,mode);
    scope.textContent=division==='CUP'?'Copa do Brasil':`Série ${division}`;
    $('#championshipLeaderValueName').textContent=mode==='scorers'?'GOLS':'AST';
    $$('[data-championship-leader-tab]').forEach(button=>button.classList.toggle('active',button.dataset.championshipLeaderTab===mode));
    table.innerHTML=entries.slice(0,5).length?entries.slice(0,5).map((entry,index)=>`<div class="championship-leader-row ${entry.club===userClub?'user-leader':''}"><span>${index+1}</span><span><b>${entry.name}</b><small class="club-link" data-club="${entry.club}" role="button" tabindex="0">${entry.club}</small></span><span>${entry[metric]}</span></div>`).join(''):'<div class="championship-leaders-empty">Aguardando estatísticas oficiais da competição.</div>';
  };
  const renderChampionshipRound=()=>{
    const limit=championshipRoundLimit(championshipDivision);championshipRoundView=clamp(championshipRoundView,1,limit);
    if(championshipDivision==='CUP'){
      const stage=cupCompetition.stages[championshipRoundView-1],games=stage?.fixtures||[],completed=Boolean(stage?.completed);
      $('#championshipRoundTitle').textContent=stage?.name||'Fase aguardando sorteio';$('#championshipRoundStatus').textContent=completed?'FASE CONCLUÍDA':stage?'CONFRONTOS CONFIRMADOS':'AGUARDANDO SORTEIO';$('#championshipPreviousRound').disabled=championshipRoundView<=1;$('#championshipNextRound').disabled=championshipRoundView>=limit;
      $('#futureMatches').innerHTML=games.map(game=>{const userGame=isUserFixture(game),score=game.completed?`<strong class="round-score">${game.homeGoals} — ${game.awayGoals}${game.penalties?` (${game.penalties})`:''}</strong>`:'<i>×</i>';return `<div class="fixture-row round-browser-row ${game.completed?'completed':''} ${userGame?'user-round':''}"><small>JOGO ${game.gameNumber} · ${game.leg}${userGame?' · SEU JOGO':''} · ${fixtureDetails(game).display}</small><b class="round-fixture-line"><span class="club-link" data-club="${game.home}" role="button" tabindex="0">${game.home}</span>${score}<span class="club-link" data-club="${game.away}" role="button" tabindex="0">${game.away}</span></b></div>`;}).join('')||'<div class="fixture-row round-empty"><small>AGUARDANDO SORTEIO</small><b>A próxima fase será criada somente após a conclusão de todos os confrontos atuais.</b></div>';
      renderChampionshipLeaders();
      return;
    }
    const competition=nationalCompetitions[championshipDivision],saved=championshipRoundHistory(championshipDivision).find(item=>item.round===championshipRoundView),fixtures=competition.fixtures[championshipRoundView-1]||[],games=saved?.games?.length?saved.games:fixtures,completed=Boolean(saved?.games?.length),status=completed?'RODADA CONCLUÍDA':games.length?'RODADA PROGRAMADA':'FASE A DEFINIR';$('#championshipRoundTitle').textContent=`Rodada ${championshipRoundView}`;$('#championshipRoundStatus').textContent=status;$('#championshipPreviousRound').disabled=championshipRoundView<=1;$('#championshipNextRound').disabled=championshipRoundView>=limit;
    let displayGames=games;
    const groupNav=$('#championshipGroupNav');
    if(championshipDivision==='D'&&championshipRoundView<=10){
      championshipGroupView=clamp(championshipGroupView,0,Math.max(0,serieDGroups.length-1));
      const groupSet=new Set(serieDGroups[championshipGroupView]||[]);
      displayGames=games.filter(game=>groupSet.has(game.home)&&groupSet.has(game.away));
      if(groupNav){
        groupNav.classList.remove('hidden');
        const userGroup=championshipGroupView===userSerieDGroupIndex;
        groupNav.innerHTML=`<button class="round-navigation" type="button" data-championship-group-step="-1" aria-label="Grupo anterior">←</button><div><small>${userGroup?'SEU GRUPO':'CONFRONTOS DO GRUPO'}</small><h4>Grupo A${championshipGroupView+1}</h4></div><button class="round-navigation" type="button" data-championship-group-step="1" aria-label="Próximo grupo">→</button>`;
      }
    }else if(groupNav){groupNav.classList.add('hidden');groupNav.innerHTML='';}
    $('#futureMatches').innerHTML=displayGames.map(game=>{const userGame=isUserFixture(game),score=completed?`<strong class="round-score">${game.homeGoals} — ${game.awayGoals}${game.penalties?` (${game.penalties})`:''}</strong>`:'<i>×</i>';return `<div class="fixture-row round-browser-row ${completed?'completed':''} ${userGame?'user-round':''}"><small>${completed?'ENCERRADO':`RODADA ${championshipRoundView}`}${isKnockoutShootoutCompetition(game)?` · ${game.leg}`:''}${userGame?' · SEU JOGO':''}</small><b class="round-fixture-line"><span class="club-link" data-club="${game.home}" role="button" tabindex="0">${game.home}</span>${score}<span class="club-link" data-club="${game.away}" role="button" tabindex="0">${game.away}</span></b></div>`;}).join('')||'<div class="fixture-row round-empty"><small>AGUARDANDO DEFINIÇÃO</small><b>Os confrontos desta fase ainda serão definidos pelo campeonato.</b></div>';
    if(championshipDivision==='D')$$('[data-championship-group]').forEach(card=>card.classList.toggle('active-view',Number(card.dataset.championshipGroup)===championshipGroupView));
    renderChampionshipLeaders();
  };
  const renderSerieDGroupCard=(group,groupIndex,competition,{featured=false}={})=>{
    const slots=competition.knockout?.qualifiedPerGroup||4,groupRows=group.map(club=>competition.standings.find(row=>row.club===club)).filter(Boolean).sort((a,b)=>b.points-a.points||b.wins-a.wins||b.goalDiff-a.goalDiff);
    return `<article class="d-group-card ${featured?'user-group-card':''} ${!featured?'compact':''}" data-championship-group="${groupIndex}" role="button" tabindex="0" title="Ver jogos do Grupo A${groupIndex+1}"><h4>GRUPO A${groupIndex+1}${featured?'<em>SEU GRUPO</em>':''}</h4><div class="d-group-head"><span>#</span><span>CLUBE</span><span>J</span><span>PTS</span></div>${groupRows.map((row,index)=>`<div class="d-group-row ${index<slots?'qualified':''} ${row.club===userClub?'user-club':''}" data-club="${row.club}" role="button" tabindex="0"><span>${index+1}</span><span class="club-link">${row.club}</span><span>${row.played}</span><span>${row.points}</span></div>`).join('')}</article>`;
  };
  const openChampionship=(division=championshipDivision)=>{
    championshipDivision=division;
    const table=$('#championshipTable'),head=$('#championshipModal .champ-head'),heading=$('#championshipModal .championship-grid>section>h3'),championshipGrid=$('#championshipModal .championship-grid');
    $$('#divisionTabs button').forEach(button=>button.classList.toggle('active',button.dataset.division===division||button.dataset.competition===division));
    championshipGrid?.classList.toggle('serie-d-view',division==='D');
    if(division==='CUP'){
      $('#championshipDivisionLabel').textContent='COMPETIÇÃO NACIONAL · COPA DO BRASIL';$('#championshipModal>div>h2').textContent=`Copa do Brasil ${careerSeason}`;$('#championshipFormat').textContent='126 CLUBES · 9 FASES · SORTEIOS PROGRESSIVOS · FASE ATUAL CONFIRMADA APÓS A ANTERIOR';heading.textContent='Fases da competição';head.style.display='none';table.className='cup-stage-table';table.innerHTML=cupPhaseDefinitions.map(definition=>{const stage=cupCompetition.stages.find(item=>item.index===definition.index),status=stage?.completed?'CONCLUÍDA':stage?'EM DISPUTA':'AGUARDANDO SORTEIO';return `<button class="cup-stage-row ${stage?'generated':''} ${definition.index===cupCompetition.currentPhase?'current':''}" type="button" data-cup-phase="${definition.index}" ${stage?'':'disabled'}><span>${definition.index}</span><b>${definition.name}</b><small>${definition.teams} CLUBES · ${definition.twoLegged?'IDA E VOLTA':'JOGO ÚNICO'}</small><em>${status}</em></button>`;}).join('');championshipRoundView=clamp(championshipRoundView,1,championshipRoundLimit('CUP'));renderChampionshipRound();$('#championshipModal').classList.remove('hidden');return;
    }
    const competition=nationalCompetitions[division],rows=[...competition.standings].sort((a,b)=>b.points-a.points||b.wins-a.wins||b.goalDiff-a.goalDiff);
    $('#championshipDivisionLabel').textContent=`CAMPEONATO BRASILEIRO · SÉRIE ${division}`;
    $('#championshipModal>div>h2').textContent=`Brasileirão ${careerSeason}`;
    $('#championshipFormat').textContent=division==='D'?`${userClub} · GRUPO A${userSerieDGroupIndex+1} · 4 primeiros avançam`: `${competition.clubs} CLUBES · ${competition.format.toUpperCase()} · ${competition.promotion?`${competition.promotion} ACESSOS`:''}${competition.relegation?` · ${competition.relegation} REBAIXADOS`:''}`;
    if(division==='D'){
      championshipGroupView=userSerieDGroupIndex;
      heading.textContent=`Seu grupo · A${userSerieDGroupIndex+1}`;head.style.display='none';table.className='series-d-table';
      const userIdx=Math.max(0,userSerieDGroupIndex),userGroupHtml=renderSerieDGroupCard(competition.groups[userIdx],userIdx,competition,{featured:true}),othersHtml=competition.groups.map((group,groupIndex)=>groupIndex===userIdx?'':renderSerieDGroupCard(group,groupIndex,competition)).filter(Boolean).join('');
      table.innerHTML=`<div class="series-d-layout">${userGroupHtml}<div class="d-group-others"><p class="d-group-others-label">Demais grupos</p><div class="d-group-grid d-group-grid-compact">${othersHtml}</div></div></div>`;
    }else{
      heading.textContent='Tabela';head.style.display='grid';table.className='';
      table.innerHTML=rows.map((row,index)=>`<div class="champ-row ${classificationZone(division,index,rows.length)} ${row.club===userClub?'highlight':''}" data-club="${row.club}" role="button" tabindex="0"><span>${index+1}</span><span class="club-link">${row.club}</span><span>${row.played}</span><span>${row.wins}</span><span>${row.draws}</span><span>${row.losses}</span><span>${row.goalDiff>=0?'+':''}${row.goalDiff}</span><span>${row.points}</span></div>`).join('');
    }
    renderChampionshipRound();
    $('#championshipModal').classList.remove('hidden');
  };
  onClick('#divisionTabs',event=>{const button=event.target.closest('[data-division],[data-competition]');if(!button)return;const competition=button.dataset.competition||button.dataset.division;championshipRoundView=competition==='CUP'?cupCompetition.currentPhase:clamp(currentRound,1,championshipRoundLimit(competition));openChampionship(competition);});
  onClick('#championshipTable',event=>{const phase=event.target.closest('[data-cup-phase]');if(phase&&championshipDivision==='CUP'){championshipRoundView=Number(phase.dataset.cupPhase);renderChampionshipRound();return;}const groupCard=event.target.closest('[data-championship-group]');if(groupCard&&championshipDivision==='D'&&!event.target.closest('[data-club]')){championshipGroupView=Number(groupCard.dataset.championshipGroup);renderChampionshipRound();}});
  onClick('#inspectOpponent',()=>openScout(matchClub().name));
  onClick('#closeTeamScout',()=>$('#teamScoutModal').classList.add('hidden'));
  onClick('#openChampionship',()=>openChampionship());
  onClick('#openChampionshipPage',()=>openChampionship());
  onClick('#closeChampionship',()=>$('#championshipModal').classList.add('hidden'));

  // A janela completa do campeonato mantém foco na classificação e na agenda.
  const championshipPanelCss=document.createElement('style');championshipPanelCss.textContent='.championship-sidebar{display:grid;gap:14px;min-width:0;border:0!important;border-radius:0!important;overflow:visible!important;background:transparent!important}.championship-upcoming{margin:0!important;padding-top:0!important;border:1px solid #395124!important;border-radius:7px;overflow:hidden;background:#101811}.championship-leaders{border:1px solid #395124!important;border-radius:7px;overflow:hidden;background:#101811;text-align:left}.championship-leaders>label{display:block;padding:10px 12px 8px;background:#172117;border-bottom:1px solid #395124;color:#63d9ff!important;font:700 9px DM Sans!important;letter-spacing:.65px}.championship-leaders>label em{display:block;margin-top:3px;color:#8fb0b4;font:600 8px DM Sans;letter-spacing:.35px;font-style:normal}.championship-leader-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px 10px;background:#132018;border-bottom:1px solid #395124}.championship-leader-tabs button{padding:7px 4px;border:1px solid #315b68!important;border-radius:4px!important;background:#102833!important;color:#9fcfd8!important;font:700 8px DM Sans!important;box-shadow:none!important;cursor:pointer}.championship-leader-tabs button.active{background:#1d5a6d!important;color:#f0fcfb!important;border-color:#63d9ff!important;box-shadow:inset 0 0 0 1px #ffffff22!important}.championship-leader-head,.championship-leader-row{display:grid;grid-template-columns:24px minmax(0,1fr) 34px;gap:6px;align-items:center;padding:8px 10px}.championship-leader-head{background:#102b35;color:#63d9ff;font:700 8px DM Sans;letter-spacing:.55px}.championship-leader-head span:last-child,.championship-leader-row span:last-child{text-align:right}.championship-leader-row{border-top:1px solid #234650;font-size:10px;color:#eaf6f3}.championship-leader-row b{display:block;color:#edf8f5;font-size:11px;line-height:1.2}.championship-leader-row small{display:block;margin-top:2px;color:#83a7ac;font-size:8px;line-height:1.2}.championship-leader-row span:last-child{color:#b6ff38;font:700 13px Barlow Condensed}.championship-leader-row.user-leader{background:#203b26!important;box-shadow:inset 3px 0 #b6ff38}.championship-leaders-empty{padding:16px 12px;color:#8fa9ae;font-size:10px;line-height:1.45;text-align:center}.round-browser-nav{min-height:62px;display:grid;grid-template-columns:36px minmax(0,1fr) 36px;gap:8px;align-items:center;padding:9px 10px;background:#172117;border-bottom:1px solid #395124}.round-browser-nav>div{text-align:center}.round-browser-nav h3{margin:1px 0 0!important;padding:0!important;background:transparent!important;border:0!important;color:#b6ff38!important;font-size:20px!important}.round-browser-nav h4{margin:2px 0 0!important;padding:0!important;background:transparent!important;border:0!important;color:#63d9ff!important;font:700 16px Barlow Condensed!important}.round-browser-nav small{display:block;color:#8fb0b4;font:700 7px DM Sans;letter-spacing:.65px}.championship-group-nav{min-height:52px;background:#132018;border-bottom:1px solid #395124}.championship-group-nav.hidden{display:none!important}.d-group-card[data-championship-group]{cursor:pointer}.d-group-card[data-championship-group]:hover{border-color:#63d9ff66}.d-group-card[data-championship-group].active-view{border-color:#63d9ff!important;box-shadow:0 0 0 1px #63d9ff33}#championshipModal button.round-navigation{width:34px!important;height:34px!important;min-width:34px!important;padding:0!important;border:1px solid #397487!important;border-radius:4px!important;background:#102b35!important;color:#9edff0!important;font:700 14px DM Sans!important;box-shadow:none!important;transform:none!important}#championshipModal button.round-navigation:hover{background:#1d5a6d!important;border-color:#63d9ff!important;color:#fff!important}#championshipModal button.round-navigation:disabled{opacity:.32!important;cursor:not-allowed!important}.championship-upcoming #futureMatches{max-height:34vh;overflow-y:auto}.championship-upcoming .fixture-row{min-height:56px!important;padding:11px 14px!important}.round-fixture-line{display:grid!important;grid-template-columns:minmax(0,1fr) 42px minmax(0,1fr);gap:5px;align-items:center}.round-fixture-line>span:last-child{text-align:right}.round-fixture-line>i,.round-score{text-align:center;color:#b6ff38!important;font-style:normal}.round-score{font:700 17px Barlow Condensed}.round-browser-row.user-round{background:#203b26!important;box-shadow:inset 3px 0 #b6ff38}.round-browser-row.completed small{color:#76c9dc}.round-empty{padding:18px!important}.round-empty b{color:#9eb6b8;font-weight:500;line-height:1.4}@media(max-width:850px){.championship-sidebar{width:100%}.championship-upcoming #futureMatches{max-height:280px}}';document.head.append(championshipPanelCss);
  const championshipSidebar=$('#championshipModal .championship-grid aside');
  championshipSidebar.className='championship-sidebar';
  championshipSidebar.innerHTML=`<section class="championship-upcoming"><div class="round-browser-nav"><button id="championshipPreviousRound" class="round-navigation" type="button" aria-label="Rodada anterior">←</button><div><small id="championshipRoundStatus">RODADA PROGRAMADA</small><h3 id="championshipRoundTitle">Rodada ${currentRound}</h3></div><button id="championshipNextRound" class="round-navigation" type="button" aria-label="Próxima rodada">→</button></div><div id="championshipGroupNav" class="round-browser-nav championship-group-nav hidden"></div><div id="futureMatches"></div></section><section id="championshipLeadersPanel" class="championship-leaders"><label>LÍDERES DO CAMPEONATO<em id="championshipLeaderScope">Série A</em></label><div class="championship-leader-tabs" role="tablist"><button class="active" type="button" data-championship-leader-tab="scorers">ARTILHEIROS</button><button type="button" data-championship-leader-tab="assists">ASSISTÊNCIAS</button></div><div class="championship-leader-head"><span>#</span><span>JOGADOR</span><span id="championshipLeaderValueName">GOLS</span></div><div id="championshipLeadersTable"></div></section>`;
  onClick('#championshipPreviousRound',()=>{championshipRoundView--;renderChampionshipRound();});
  onClick('#championshipNextRound',()=>{championshipRoundView++;renderChampionshipRound();});
  championshipSidebar.addEventListener('click',event=>{const leaderTab=event.target.closest('[data-championship-leader-tab]');if(leaderTab){championshipLeaderMode=leaderTab.dataset.championshipLeaderTab;renderChampionshipLeaders();return;}const groupStep=Number(event.target.closest('[data-championship-group-step]')?.dataset.championshipGroupStep||0);if(!groupStep||championshipDivision!=='D'||championshipRoundView>10)return;championshipGroupView=(championshipGroupView+groupStep+serieDGroups.length)%serieDGroups.length;renderChampionshipRound();});

  const starters = () => squad.slice(0,11);
  const activeStarters=()=>starters().filter((player,index)=>!playerUnavailable(player)&&!cards?.home?.[index]?.red&&!cards?.home?.[index]?.injured);
  const avg = attribute => {const active=activeStarters();return active.reduce((total,p)=>total+matchPlayerStat(p,attribute),0)/Math.max(1,active.length);};
  // A vaga do titular define a função esperada. Uma adaptação próxima (por
  // exemplo, VOL em MC) tem efeito pequeno; uma função distante reduz a
  // organização coletiva, sem transformar a substituição em fator decisivo.
  const positionMismatch=(player,role)=>player.pos===role?0:(compatibleRoles[role]||[]).includes(player.pos)?.45:1.35;
  const positionalPenalty=()=>starters().reduce((total,player,index)=>total+(cards?.home?.[index]?.red?0:positionMismatch(player,positionAssignments[index])),0);
  const seasonContext = {home:{streak:2,position:4,isHome:true},away:{streak:1,position:9,isHome:false}};
  const contextFactor = context => clamp(1 + context.streak*.004 + (context.isHome?.028:0) + (10-context.position)*.001 + rnd(-.009,.009),.975,1.038);
  const profile = () => {
    const mentalShift=(tacticalValues.mentality-50)/50, possessionShift=(tacticalValues.possession-50)/50, pressShift=tacticalValues.press/100, lineShift=(tacticalValues.offsideLine-50)/50;
    const shape=formationPerformance[formation]||{attack:0,passing:0,defense:0},formationBonus=[shape.attack,shape.passing,shape.defense];
    const mentalBonus = [mentalShift*4,mentalShift,mentalShift*-2.4];
    const styleBonus = [2.1-possessionShift*1.15+pressShift*.8,possessionShift*3.1+pressShift*.35,(1-possessionShift)*.45+pressShift*1.7];
    const lineDefenseBonus=-lineShift*.85;
    const institution=clubInstitutionalContext(clubs[userClub],nextUserGame?.home===userClub);
    const tiredness = (100-avg('fatigue')) / 5;
    const factor=matchFactors?.home || 1;
    const tacticalRating=(formation==='4-3-3'||formation==='4-4-2'||formation==='4-2-3-1'?1:.35)+(1-Math.abs(mentalShift)*.35)+(tacticalValues.possession>60?.9:tacticalValues.press>65?.65:.45);
    const improvisation=positionalPenalty();
    const keeper=activeStarters().find(player=>player.pos==='GOL')||activeStarters()[0]||squad[0];
    const isHome=nextUserGame?.home===userClub;
    const homeBoost=isHome?{overall:.65,attack:1.1,passing:.35,defense:.45}:{overall:0,attack:0,passing:0,defense:0};
    return { overall:(avg('overall') - (100-avg('fatigue'))*.10 + tacticalRating-improvisation*.7+institution.overall+homeBoost.overall)*factor, attack: (avg('finishing')*.48 + avg('speed')*.17 + avg('dribble')*.12 + avg('playmaking')*.23 + formationBonus[0] + mentalBonus[0] + styleBonus[0] + institution.attack - tiredness-improvisation*.85+homeBoost.attack)*factor, passing: (avg('passing')*.6 + avg('playmaking')*.4 + formationBonus[1] + mentalBonus[1] + styleBonus[1] + institution.passing - tiredness-improvisation*1.05+homeBoost.passing)*factor, defense: (avg('marking')*.52 + avg('tackling')*.48 + formationBonus[2] + mentalBonus[2] + styleBonus[2] + lineDefenseBonus + institution.defense - tiredness-improvisation*.9+homeBoost.defense)*factor, keeper: (matchPlayerStat(keeper,'reflexes')*.6 + matchPlayerStat(keeper,'positioning')*.4 + institution.keeper - tiredness)*factor };
  };
  const opponent = {overall:75, attack:76, passing:74, defense:75, keeper:76};
  const opponentForMatch = () => { const club=matchClub(), roster=club.roster.slice(0,11), avg=key=>roster.reduce((sum,p)=>sum+matchPlayerStat(p,key),0)/roster.length, factor=matchFactors?.away || 1, institution=clubInstitutionalContext(club,nextUserGame?.home===club.name), defenders=Number(club.formation[0])||4, shape=formationPerformance[club.formation]||{attack:0,passing:0,defense:0},tacticalRating=(defenders===4?1:.35)+(club.mentality==='Equilibrada'?1:0)+(club.style==='Posse de bola'?1:club.style==='Pressão alta'?.55:.35), attackBonus=(club.mentality==='Ofensiva'?4:club.mentality==='Defensiva'?-3:0)+shape.attack, passBonus=(club.style==='Posse de bola'?4:club.style==='Pressão alta'?1:-2)+shape.passing, defenseBonus=(club.mentality==='Defensiva'?4:club.mentality==='Ofensiva'?-2:0)+shape.defense, tiredness=(100-avg('fatigue'))/5, isHome=nextUserGame?.home===club.name, homeBoost=isHome?{overall:.65,attack:1.1,passing:.35,defense:.45}:{overall:0,attack:0,passing:0,defense:0}, keeper=roster.find(player=>player.pos==='GOL')||roster[0]; return {overall:(avg('overall')-(100-avg('fatigue'))*.10+tacticalRating+institution.overall+homeBoost.overall)*factor,attack:(avg('finishing')*.48+avg('speed')*.17+avg('dribble')*.12+avg('playmaking')*.23+attackBonus+institution.attack-tiredness+homeBoost.attack)*factor,passing:(avg('passing')*.6+avg('playmaking')*.4+passBonus+institution.passing-tiredness+homeBoost.passing)*factor,defense:(avg('marking')*.52+avg('tackling')*.48+defenseBonus+institution.defense-tiredness+homeBoost.defense)*factor,keeper:(matchPlayerStat(keeper,'reflexes')*.6+matchPlayerStat(keeper,'positioning')*.4+institution.keeper-tiredness)*factor}; };
  // Dados internos do motor: não são exibidos como estatísticas extras.
  const blank = () => ({possession:50,momentum:0,passes:0,accurate:0,shots:0,off:0,on:0,saved:0,penalties:0,corners:0,offsides:0,keeperSaves:0,tackles:0,fouls:0,yellow:0,red:0,xg:0,attacks:0,goodAttacks:0});
  const actorData = (side,name) => {
    const player=(side==='home'?squad:matchClub().roster).find(p=>p.name===name);
    if(!player)return undefined;
    return {...player,speed:matchPlayerStat(player,'speed'),dribble:matchPlayerStat(player,'dribble'),finishing:matchPlayerStat(player,'finishing'),passing:matchPlayerStat(player,'passing'),marking:matchPlayerStat(player,'marking'),tackling:matchPlayerStat(player,'tackling'),heading:matchPlayerStat(player,'heading'),playmaking:matchPlayerStat(player,'playmaking'),penaltyTaking:matchPlayerStat(player,'penaltyTaking'),freeKick:matchPlayerStat(player,'freeKick'),reflexes:matchPlayerStat(player,'reflexes'),positioning:matchPlayerStat(player,'positioning'),penaltySaving:matchPlayerStat(player,'penaltySaving')};
  };
  const actionWeight = (player, action) => action === 'pass' ? matchPlayerStat(player,'passing') + matchPlayerStat(player,'playmaking') : action === 'shot' ? matchPlayerStat(player,'finishing') + matchPlayerStat(player,'dribble')*.25 + matchPlayerStat(player,'speed')*.12 : action === 'tackle' || action === 'foul' ? matchPlayerStat(player,'marking') + matchPlayerStat(player,'tackling') : matchPlayerStat(player,'reflexes') + matchPlayerStat(player,'positioning');
  const activeYellows = side => cards?.[side]?.filter(card=>card.yellow && !card.red).length || 0;
  const cautionPenalty = side => activeYellows(side)*.72;
  const playerFor = (side, action, context={}) => {
    const squadForSide=side==='home'?starters():matchClub().roster.slice(0,11);
    const defensiveAction=action === 'tackle' || action === 'foul';
    const options = squadForSide.filter((p,i) => !playerUnavailable(p) && !cards?.[side]?.[i]?.red && !cards?.[side]?.[i]?.injured && (action === 'save' ? p.pos === 'GOL' : defensiveAction ? ['ZAG','LAT','VOL','MC'].includes(p.pos) : action === 'shot' ? ['PE','PD','ATA','MC'].includes(p.pos) : p.pos !== 'GOL'));
    // Em um cenário extremo (por exemplo, após expulsões), a alternativa
    // precisa continuar no elenco do próprio lado, nunca no time mandante.
    const available=squadForSide.filter((player,index)=>!playerUnavailable(player)&&!cards?.[side]?.[index]?.red&&!cards?.[side]?.[index]?.injured);
    const list=options.length ? options : (available.length ? available : squadForSide);
    const safeDefenders=list.filter(player=>!cards?.[side]?.[squadForSide.indexOf(player)]?.yellow).length;
    const weightFor=player=>{
      const slot=squadForSide.indexOf(player), card=cards?.[side]?.[slot];
      const positionalFactor=side==='home'?clamp(1-positionMismatch(player,positionAssignments[slot])*.12,.75,1):1;
      if(!defensiveAction || !card?.yellow) return actionWeight(player,action)*positionalFactor;
      // Com amarelo, o atleta evita o bote e a falta tática. Se for a última
      // saída, ele ainda pode participar — só não é a escolha preferencial.
      const cautionFactor=context.lastLine ? .66 : safeDefenders ? (action==='foul'?.12:.32) : .78;
      return actionWeight(player,action)*cautionFactor*positionalFactor;
    };
    const total=list.reduce((sum,p)=>sum+weightFor(p),0); let draw=Math.random()*total;
    return list.find(p=>(draw-=weightFor(p))<=0)?.name || list[0].name;
  };
  // Os eventos alimentam o momento em escala curta. A dissipação aplicada a
  // cada avanço impede que uma sequência ou um gol fixe a posse em 72/28.
  const influencePossession = (side, value) => {
    const rival=side === 'home' ? 'away' : 'home';
    stats[side].momentum=clamp(stats[side].momentum+value*.52,-12,12);
    stats[rival].momentum=clamp(stats[rival].momentum-value*.22,-12,12);
  };
  const tacticFor = side => {
    if(side==='home') return {formation,mentality:tacticalValues.mentality,possession:tacticalValues.possession,press:tacticalValues.press,offsideLine:tacticalValues.offsideLine};
    const club=matchClub();
    return {formation:club.formation,mentality:club.mentality==='Defensiva'?25:club.mentality==='Ofensiva'?75:50,possession:club.style==='Posse de bola'?78:club.style==='Contra-ataque'?22:50,press:club.style==='Pressão alta'?82:club.mentality==='Defensiva'?35:55,offsideLine:50};
  };
  const tacticalDiscipline = side => {
    const tactic=tacticFor(side), defenders=Number(tactic.formation[0]) || 4;
    const club=side==='home'?clubs[userClub]:matchClub();
    const institution=clubInstitutionalContext(club,nextUserGame?.home===club.name);
    const scoreDiff=side==='home' ? home-away : away-home;
    // Blocos baixos e linhas de cinco defendem mais lances; pressão alta também
    // amplia o número de duelos. Quem está atrás no placar arrisca mais.
    const defensiveMind=clamp((50-tactic.mentality)/50,0,1), counterBias=clamp((50-tactic.possession)/50,0,1), pressure=tactic.press/100;
    return (defenders-3)*.035 + defensiveMind*.09 + pressure*.10 + counterBias*.045 + (scoreDiff<0?.055:0) - activeYellows(side)*.016 + institution.discipline;
  };
  engineProgressiveFoulRisk=(otherSide,attacker,defender)=>engineProgressiveFoulRiskBase(otherSide,attacker,defender,tacticalDiscipline);
  // Limite de disciplina: um segundo amarelo continua aparecendo nas duas
  // estatísticas oficiais, mas representa uma única ocorrência disciplinar.
  // Isso impede que a expulsão consuma duas vezes o teto de cinco eventos.
  const totalCards = () => disciplineEvents || 0;
  // A média efetiva oscila durante o jogo. Ela é uma vantagem probabilística:
  // influencia os duelos, mas nunca determina por si só o vencedor.
  const liveOverall = (side,power) => {
    const roster=side==='home'?starters():matchClub().roster.slice(0,11);
    const fatigue=roster.reduce((sum,p)=>sum+p.fatigue,0)/roster.length;
    const own=stats?.[side], rival=stats?.[side==='home'?'away':'home'];
    const reds=cards?.[side]?.filter(card=>card.red).length || 0;
    const momentum=own ? clamp(own.momentum,-16,16)*.11 : 0;
    const passForm=own?.passes ? (own.accurate/own.passes-.72)*5 : 0;
    const attackForm=own && rival ? clamp((own.goodAttacks-rival.goodAttacks)*.10+(own.xg-rival.xg)*.24,-1.8,1.8) : 0;
    // Com o placar empatado, quem sustenta maior volume ofensivo ganha confiança
    // e uma vantagem transitória na média efetiva, sem definir o resultado sozinho.
    const drawDominance=home===away && own && rival ? clamp((own.goodAttacks-rival.goodAttacks)*.24+(own.shots-rival.shots)*.10+(own.xg-rival.xg)*.5,-3.2,3.2) : 0;
    return clamp(power.overall-(100-fatigue)*.055-reds*6.5+momentum+passForm+attackForm+drawDominance,50,95);
  };
  let timer, liveClockSeconds=0, liveClockSecondTimer=null, minute, home, away, pauses, stats, cards, halftimeShown, pendingPenalty, shootoutState=null, matchFactors, goals, disciplineEvents, matchStarted=false, matchFinished=false, preMatchPreparation=false, substitutions=0, substitutedOut=new Set(), activePreparationTitle='', matchDiscipline={home:new Map(),away:new Map()},liveInjuries={home:[],away:[]},liveDeferredInjuries={home:[],away:[]},liveOpeningLineup={home:[],away:[]},liveMinutesPlayed={home:new Map(),away:new Map()},availabilityCommitted=false,roundResultMessagePushed=false,liveMatchGame=null,liveDayMatchSnapshots=null;
  const liveMatchDayKey=()=>{
    if(!liveMatchGame)return null;
    if(liveMatchGame.competition==='COPA DO BRASIL')return calendarKey(new Date(liveMatchGame.date));
    return calendarKey(fixtureDetails(liveMatchGame).date);
  };
  const liveMatchDayGames=()=>{
    if(!liveMatchGame)return [];
    const dayKey=liveMatchDayKey();
    if(!dayKey)return [];
    const cupSameDay=copaDoBrasilFixtures.filter(game=>calendarKey(new Date(game.date))===dayKey&&!game.completed);
    let league=currentRoundFixtures().filter(game=>calendarKey(fixtureDetails(game).date)===dayKey);
    if(userDivision==='D'){
      const group=serieDGroups[userSerieDGroupIndex]||[];
      league=league.filter(game=>!isKnockoutShootoutCompetition(game)&&group.includes(game.home)&&group.includes(game.away));
    }
    const unique=new Map();
    [...league,...cupSameDay].forEach(game=>unique.set(`${game.home}|${game.away}|${game.competition||'L'}|${game.round||''}|${game.leg||''}`,game));
    return [...unique.values()].sort((a,b)=>Number(isUserFixture(b))-Number(isUserFixture(a))||a.home.localeCompare(b.home,'pt-BR'));
  };
  const seededGoalMinute=(homeClub,awayClub,side,index)=>{
    let state=((savedNewGame?.seed||2166136261)^currentRound^homeClub.length^awayClub.length^side.charCodeAt(0)^(index+1)*997)>>>0;
    state=Math.imul(state^state>>>15,state|1);state^=state+Math.imul(state^state>>>7,state|61);
    return clamp(1+((state^state>>>14)>>>0)%89,1,89);
  };
  const buildPartialGoalTimeline=(homeClub,awayClub,homeGoals,awayGoals)=>{
    const events=[];
    for(let i=0;i<homeGoals;i++)events.push({side:'home',minute:seededGoalMinute(homeClub,awayClub,'h',i)});
    for(let i=0;i<awayGoals;i++)events.push({side:'away',minute:seededGoalMinute(homeClub,awayClub,'a',i)});
    return events.sort((a,b)=>a.minute-b.minute);
  };
  const ensureLiveDayMatches=()=>{
    if(liveDayMatchSnapshots)return;
    liveDayMatchSnapshots=new Map();
    liveMatchDayGames().forEach(game=>{
      const id=`${game.home}|${game.away}`;
      if(isUserFixture(game)){liveDayMatchSnapshots.set(id,{game,isUser:true});return;}
      const result=simulateRoundMatch(game.home,game.away);
      liveDayMatchSnapshots.set(id,{game,isUser:false,timeline:buildPartialGoalTimeline(game.home,game.away,result.homeGoals,result.awayGoals),final:{homeGoals:result.homeGoals,awayGoals:result.awayGoals}});
    });
  };
  const livePartialAtMinute=(entry,atMinute)=>{
    if(entry.isUser){
      const userAtHome=entry.game.home===userClub;
      return {
        homeGoals:(userAtHome?goals.home:goals.away).filter(g=>(g.minute||0)<=atMinute).length,
        awayGoals:(userAtHome?goals.away:goals.home).filter(g=>(g.minute||0)<=atMinute).length
      };
    }
    const timeline=entry.timeline||[];
    return {
      homeGoals:timeline.filter(e=>e.side==='home'&&e.minute<=atMinute).length,
      awayGoals:timeline.filter(e=>e.side==='away'&&e.minute<=atMinute).length
    };
  };
  const liveDayMatchLabel=game=>{
    if(game.competition==='COPA DO BRASIL')return `Copa · ${game.phase}${game.leg?` · ${game.leg}`:''}`;
    if(isKnockoutShootoutCompetition(game))return `Série D · ${game.leg||'Eliminatórias'}`;
    return `Rod. ${game.round||currentRound}ª`;
  };
  const liveDayMatchStatus=(game,isUser,atMinute)=>{
    if(preMatchPreparation)return 'A iniciar';
    if(isUser&&matchFinished)return 'Encerrado';
    if(isUser&&halftimeShown&&atMinute<=45)return 'Intervalo';
    if(atMinute>=90)return '90\'';
    return `${String(atMinute).padStart(2,'0')}'`;
  };
  const renderLiveDayMatches=()=>{
    ensureLiveDayMatches();
    const atMinute=preMatchPreparation?0:Math.min(90,Math.max(0,minute));
    const dateSource=liveMatchGame?(liveMatchGame.competition==='COPA DO BRASIL'?new Date(liveMatchGame.date):fixtureDetails(liveMatchGame).date):careerCalendarDate;
    const dateLabel=dateSource.toLocaleDateString('pt-BR',{day:'2-digit',month:'long'});
    const metaEl=$('#liveDayMatchesMeta');
    if(metaEl)metaEl.textContent=preMatchPreparation
      ? `${dateLabel} · Os jogos desta data iniciam com o apito do ${userClub}.`
      : `${dateLabel} · ${liveDayMatchStatus(liveMatchGame,true,atMinute)==='Intervalo'?'Intervalo':`${atMinute}'`} · Resultados parciais da rodada em andamento.`;
    const dayGames=liveMatchDayGames();
    const listEl=$('#liveDayMatchesList');
    if(!listEl)return;
    if(!dayGames.length){
      listEl.innerHTML='<div class="live-day-matches-empty">Nenhuma partida programada para esta data.</div>';
      return;
    }
    listEl.innerHTML=`<div class="live-day-matches-head"><span>Comp.</span><span>Mandante</span><span>Placar</span><span>Visitante</span><span>Min.</span></div>${dayGames.map(game=>{
      const id=`${game.home}|${game.away}`;
      const entry=liveDayMatchSnapshots?.get(id)||{game,isUser:isUserFixture(game)};
      const isUser=isUserFixture(game);
      const {homeGoals,awayGoals}=preMatchPreparation&&!entry.isUser?{homeGoals:0,awayGoals:0}:livePartialAtMinute(entry,atMinute);
      return `<div class="live-day-match-row ${isUser?'user-game':''}"><span class="live-day-match-label">${liveDayMatchLabel(game)}</span><span class="live-day-match-home"><b class="club-link" data-club="${game.home}" role="button" tabindex="0">${game.home}</b></span><strong class="live-day-match-score">${homeGoals} — ${awayGoals}</strong><span class="live-day-match-away"><b class="club-link" data-club="${game.away}" role="button" tabindex="0">${game.away}</b>${isUser?'<small class="user-game-tag">SEU JOGO</small>':''}</span><span class="live-day-match-status">${liveDayMatchStatus(game,isUser,atMinute)}</span></div>`;
    }).join('')}`;
  };
  const openLiveDayMatches=()=>{renderLiveDayMatches();$('#liveDayMatchesModal')?.classList.remove('hidden');};
  const modal = $('#matchModal'), timeline = $('#timeline');
  const stopLiveSecondTimer=()=>{clearInterval(liveClockSecondTimer);liveClockSecondTimer=null;};
  const stopMatchClock=()=>{clearInterval(timer);stopLiveSecondTimer();};
  const liveMatchClockPhase=()=>{
    if(preMatchPreparation)return 'PRÉ-JOGO';
    if(matchFinished)return shootoutState?'DISPUTA DE PÊNALTIS':'FIM DE JOGO';
    if(shootoutState)return 'DISPUTA DE PÊNALTIS';
    if(halftimeShown&&minute<=45)return 'INTERVALO';
    if(minute>45)return '2º TEMPO';
    return '1º TEMPO';
  };
  const updateLiveMatchClock=()=>{
    const clock=$('#liveMatchClock'); if(!clock)return;
    const show=matchStarted&&!preMatchPreparation;
    clock.classList.toggle('hidden',!show);
    if(!show)return;
    const timeEl=clock.querySelector('.live-match-clock-time'), phaseEl=clock.querySelector('.live-match-clock-phase');
    const mm=String(Math.min(90,Math.max(0,minute))).padStart(2,'0'), ss=String(liveClockSeconds).padStart(2,'0');
    if(timeEl)timeEl.textContent=`${mm}:${ss}`;
    if(phaseEl)phaseEl.textContent=liveMatchClockPhase();
  };
  const startLiveSecondTimer=()=>{stopLiveSecondTimer();liveClockSecondTimer=setInterval(()=>{if(matchFinished||preMatchPreparation)return;liveClockSeconds=(liveClockSeconds+1)%60;updateLiveMatchClock();},1000);};
  startMatchClock=()=>{stopMatchClock();timer=setInterval(tick,gamePaceConfig[gamePace].ms);if(matchStarted&&!matchFinished&&!preMatchPreparation)startLiveSecondTimer();updateLiveMatchClock();};
  const renderLiveMatchHeader=game=>{if(!game)return;const details=fixtureDetails(game),venue=matchVenueFor(game.home),opponent=matchClub();$('#liveMatchDateTime').textContent=`${details.display} · ${details.time}`;$('#liveMatchVenue').textContent=`${venue.name} · ${venue.capacity.toLocaleString('pt-BR')} lugares`;$('#liveHomeCrest').textContent=clubCrestInitials(userClub);$('#liveAwayCrest').textContent=clubCrestInitials(opponent.name);$('#liveHomeName').textContent=userClub.toUpperCase();$('#liveAwayName').textContent=opponent.name.toUpperCase();};
  const score = () => { $('#score').textContent = `${home} — ${away}`; updateLiveMatchClock(); };
  const log = (text, type='') => { timeline.insertAdjacentHTML('beforeend', `<p class="${type}">${minute}' · ${text}</p>`); timeline.scrollTop = timeline.scrollHeight; };
  const percent = (a,b) => b ? `${Math.round(a / b * 100)}%` : '0%';
  const renderStats = () => {
    const h = stats.home, a = stats.away, hp = clamp(Math.round(h.possession),28,72), ap = 100-hp;
    const rows = [['Posse de bola',`${hp}%`,`${ap}%`,'possession'],['Passes','','','group'],['Total de Passes',h.passes,a.passes],['% passes certos',percent(h.accurate,h.passes),percent(a.accurate,a.passes)],['Passes errados',h.passes-h.accurate,a.passes-a.accurate],['Ataque','','','group'],['Finalizações',h.shots,a.shots],['Para Fora',h.off,a.off],['No Gol',h.on,a.on],['Defendidas',h.saved,a.saved],['Pênaltis',h.penalties,a.penalties],['Escanteios',h.corners,a.corners],['Impedimentos',h.offsides,a.offsides],['Defesa','','','group'],['Defesas do Goleiro',h.keeperSaves,a.keeperSaves],['Desarmes',h.tackles,a.tackles],['Faltas Cometidas',h.fouls,a.fouls],['Cartões Amarelos',h.yellow,a.yellow,'yellow'],['Cartões Vermelhos',h.red,a.red,'red']];
    $('#stats').innerHTML = rows.map(r => r[3] === 'group' ? `<div class="stat-group">${r[0]}</div>` : `<div class="stat ${r[3] || ''}"><span>${r[1]}</span><span>${r[0]}</span><span>${r[2]}</span></div>`).join('');
    renderLiveOpponent?.();
  };
  const renderFinalSummary = () => {
    const medicalReports=[['home',liveInjuries.home,clubs[userClub]],['away',liveInjuries.away,matchClub()]].flatMap(([side,entries,club])=>entries.map(entry=>{entry.injury.diagnosisPending=false;return {text:injuryDiagnosisComment({name:entry.name},entry.injury,club),outcome:'confirmed'};}));
    [['home',userClub],['away',matchClub().name]].forEach(([side,clubName])=>{
      liveDeferredInjuries[side].forEach(entry=>{
        const player=clubs[clubName].roster.find(candidate=>candidate.name===entry.name);
        if(!player||liveInjuries[side].some(item=>item.name===entry.name))return;
        const result=applyDeferredInjuryDiagnosis(player,entry,clubs[clubName]);
        if(result.injury)entry.injury={...result.injury};
        medicalReports.push({text:result.report,outcome:result.outcome});
      });
    });
    const h=stats.home,a=stats.away,hp=clamp(Math.round(h.possession),28,72),ap=100-hp;
    const scorers=side=>goals[side].length?goals[side].map(goal=>`<span>${goal.minute}' ${goal.name}</span>`).join(''):'<span>Nenhum gol</span>';
    const rows=[['Posse de bola',`${hp}%`,`${ap}%`],['Total de Passes',h.passes,a.passes],['Finalizações',h.shots,a.shots],['Faltas Cometidas',h.fouls,a.fouls],['Cartões Amarelos',h.yellow,a.yellow],['Cartões Vermelhos',h.red,a.red]];
    const injuryReports=medicalReports.map(item=>item.text);
    const injurySection=injuryReports.length?`<section class="final-injuries"><h3>DIAGNÓSTICOS MÉDICOS</h3>${medicalReports.map(item=>`<p class="${item.outcome==='cleared'?'cleared':item.outcome==='monitoring'?'monitoring':''}">${item.text}</p>`).join('')}</section>`:'';
    $('#stats').innerHTML=`<section class="final-goals"><h3>GOLS</h3><div><article><b>${userClub.toUpperCase()}</b>${scorers('home')}</article><article><b>${matchClub().name.toUpperCase()}</b>${scorers('away')}</article></div></section><section class="final-basic"><h3>ESTATÍSTICAS DA PARTIDA</h3>${rows.map(row=>`<div class="stat"><span>${row[1]}</span><span>${row[0]}</span><span>${row[2]}</span></div>`).join('')}</section>${injurySection}`;
    $('#stats').classList.remove('hidden');
    if(postMatchMedicalQueue.length){
      if(postMatchMedicalQueue.length===1){
        const item=postMatchMedicalQueue[0];
        pushMessage({category:'medical',type:'treatment-pending',title:'Ação médica pós-jogo',body:`${item.player.name} — ${item.injury.name}. Escolha cirurgia ou tratamento conservador para concluir a avaliação do departamento médico.`,round:currentRound,meta:{competition:'Departamento médico',requiresAction:true,player:item.player.name}});
      }else{
        pushMessage({category:'medical',type:'treatment-pending',title:`Ações médicas pós-jogo (${postMatchMedicalQueue.length})`,body:postMatchMedicalQueue.map(item=>`• ${item.player.name} — ${item.injury.name}`).join('\n')+'\n\nEscolha cirurgia ou tratamento conservador para cada caso pendente.',round:currentRound,meta:{competition:'Departamento médico',requiresAction:true}});
      }
      processPostMatchMedicalQueue();
    }
    const medicalDigest=medicalReports.filter(item=>item.outcome!=='confirmed');
    if(medicalDigest.length){
      pushMessage({category:'medical',type:'digest',title:'Relatório médico pós-jogo',body:medicalDigest.map(item=>`• ${item.text}`).join('\n'),round:currentRound,meta:{competition:'Departamento médico'}});
    }
  };
  const showFinalActions = () => {
    if(liveMatchGame){
      const matchDate=liveMatchGame.competition==='COPA DO BRASIL'?new Date(liveMatchGame.date):fixtureDetails(liveMatchGame).date;
      if(matchDate)advanceCareerCalendarTo(matchDate);
      if(savedNewGame)persistSeason();
    }
    $('#matchActions').classList.remove('hidden');
    $('#matchActions').innerHTML='<button id="finalDashboard">CLASSIFICAÇÃO</button><button id="finalTable">TABELA DE JOGOS</button><button id="finalNext">SAIR</button>';
    onClick('#finalDashboard',()=>{
      if(matchFinished&&!roundCommitted)advanceSeasonRound({navigateDashboard:false});
      modal.classList.add('hidden');
      openChampionship();
    });
    onClick('#finalTable',()=>{simulateRoundResults();modal.classList.add('hidden');openRoundResults();});
    onClick('#finalNext',()=>exitLiveMatch());
  };
  const exitLiveMatch=()=>{
    if(!matchFinished||roundCommitted)return;
    stopMatchClock();
    $('#shootoutPanel')?.classList.add('hidden');
    $('#penaltyChoice')?.classList.add('hidden');
    $('#liveOpponentModal').classList.add('hidden');
    closeFormationSuggestion();
    advanceSeasonRound();
  };
  const reopenMatchWindow=()=>{
    if(!matchStarted) return false;
    renderLiveMatchHeader(liveMatchGame);
    $('#roundResultsModal')?.classList.add('hidden');
    $('#liveOpponentModal').classList.add('hidden');
    modal.classList.remove('hidden');
    score();
    updateLiveMatchClock();
    if(matchFinished){
      stopMatchClock();
      $('#pausePanel').classList.add('hidden');
      $('#penaltyChoice').classList.add('hidden');
      if(shootoutState){renderShootoutTrack();$('#shootoutPanel').classList.remove('hidden');}
      else if(liveMatchGame?.penalties){$('#shootoutTitle').textContent=`Shootout ${liveMatchGame.penalties}`;$('#shootoutPanel').classList.remove('hidden');}
      $('#matchStatus').textContent=shootoutState?'Disputa de pênaltis em andamento.':liveMatchGame?.penalties?`Partida encerrada · Shootout ${liveMatchGame.penalties}.`:'Partida encerrada.';
      renderFinalSummary();
      showFinalActions();
      return true;
    }
    const awaitingDecision=!$('#pausePanel').classList.contains('hidden') || !$('#penaltyChoice').classList.contains('hidden') || shootoutState;
    if(awaitingDecision){
      stopMatchClock();
      $('#matchActions').classList.add('hidden');
      if(shootoutState){$('#shootoutPanel').classList.remove('hidden');renderShootoutTrack();}
      $('#stats').classList.toggle('hidden',preMatchPreparation);
      if(!preMatchPreparation) renderStats();
    }else{
      $('#matchActions').classList.remove('hidden');
      startMatchClock();
    }
    return true;
  };
  let roundResults = null, roundPreviewResults={};
  const cupPenaltyWinner=(first,second)=>{const strength=name=>{const club=clubs[name],lineup=club.roster.slice(0,11),takers=[...lineup].filter(player=>player.pos!=='GOL').sort((a,b)=>b.penaltyTaking-a.penaltyTaking).slice(0,5),keeper=lineup.find(player=>player.pos==='GOL')||lineup[0];return takers.reduce((sum,player)=>sum+player.penaltyTaking,0)/Math.max(1,takers.length)+(keeper?.penaltySaving||50)*.32+club.power*.18+rnd(-9,9);};return strength(first)>=strength(second)?first:second;};
  const applyCupFatigue=(game,result)=>{[['home',game.home],['away',game.away]].forEach(([side,clubName])=>Object.entries(result.fatigueAfter?.[side]||{}).forEach(([playerName,value])=>{const player=clubs[clubName].roster.find(candidate=>candidate.name===playerName);if(player)player.fatigue=clamp(value,0,100);}));applyMatchAvailability(result);};
  const nextCupEntrants=(phase,winners)=>phase===1?[...winners,...cupSecondDirect]:phase===2?[...winners,...cupSpecialEntrants]:phase===4?[...winners,...cupSerieAEntrants]:[...winners];
  const cupTieGames=(stage,tieId)=>stage.fixtures.filter(game=>game.tieId===tieId).sort((a,b)=>a.date-b.date||a.gameNumber-b.gameNumber);
  const simulateCupComputerGame=game=>{
    if(game.completed||isUserFixture(game))return null;
    const result=simulateRoundMatch(game.home,game.away);
    game.homeGoals=result.homeGoals;game.awayGoals=result.awayGoals;game.completed=true;game.data=result.data;game.goals=result.goals;
    applyCupFatigue(game,result);
    return result;
  };
  const cupTieAggregate=games=>{const aggregate=new Map();games.forEach(game=>{if(!game.completed)return;aggregate.set(game.home,(aggregate.get(game.home)||0)+(game.homeGoals||0));aggregate.set(game.away,(aggregate.get(game.away)||0)+(game.awayGoals||0));});return aggregate;};
  const resolveCupTieWinner=(games,aggregate)=>{
    const clubsInTie=[games[0].home,games[0].away],firstGoals=aggregate.get(clubsInTie[0])||0,secondGoals=aggregate.get(clubsInTie[1])||0;
    let winner=firstGoals>secondGoals?clubsInTie[0]:secondGoals>firstGoals?clubsInTie[1]:null;
    if(firstGoals===secondGoals)winner=resolveKnockoutTieWinner(games,{pickWinner:cupPenaltyWinner,int});
    games.forEach(game=>{game.winner=winner;});
    return winner;
  };
  const notifyCupTieResult=(games,winner)=>{games.forEach(game=>{if(game.home!==userClub&&game.away!==userClub)return;const opponent=game.home===userClub?game.away:game.home,scoreLabel=`${game.homeGoals} — ${game.awayGoals}${game.penalties?` (${game.penalties} pên.)`:''}`,qualified=winner===userClub;pushMessage({category:'competition',type:'cup',title:`Copa do Brasil · ${game.phase}`,body:`${game.home} ${scoreLabel} ${game.away} · ${qualified?`${userClub} avança de fase`:`${userClub} eliminado por ${opponent}`}`,round:currentRound,meta:{competition:'Copa do Brasil',phase:game.phase}});});};
  const notifyCupPhaseAdvance=(completedStage,nextStage)=>{
    if(!nextStage?.entrants?.includes(userClub))return;
    pushMessage({category:'competition',type:'phase-advance',title:`Copa do Brasil · ${nextStage.name}`,body:`${userClub} classificado para ${nextStage.name} (${nextStage.entrants.length} clubes). Confira o calendário dos confrontos.`,round:currentRound,meta:{competition:'Copa do Brasil',phase:nextStage.name}});
  };
  const stagePendingUserFixtures=stage=>stage?.fixtures?.some(game=>isUserFixture(game)&&!game.completed);
  const resolveCupTie=(stage,tieId)=>{
    const games=cupTieGames(stage,tieId);
    if(!games.length)return null;
    if(games.some(game=>isUserFixture(game)&&!game.completed))return null;
    games.forEach(game=>{if(!game.completed)simulateCupComputerGame(game);});
    if(games.some(game=>!game.completed))return null;
    const winner=resolveCupTieWinner(games,cupTieAggregate(games));
    if(games.some(isUserFixture))notifyCupTieResult(games,winner);
    return winner;
  };
  const finalizeCupStageIfReady=stage=>{
    if(!stage||stage.completed)return null;
    const ties=[...new Set(stage.fixtures.map(game=>game.tieId))],winners=[];
    for(const tieId of ties){
      const winner=resolveCupTie(stage,tieId);
      if(winner===null)return null;
      winners.push(winner);
    }
    stage.winners=winners;stage.completed=true;
    if(stage.index===9){cupCompetition.champion=winners[0]||null;cupCompetition.currentPhase=9;}
    else{const entrants=nextCupEntrants(stage.index,winners);const nextStage=createCupStage(stage.index+1,entrants);notifyCupPhaseAdvance(stage,nextStage);}
    onCupScheduleChanged();
    return winners;
  };
  const advanceCupComputerTies=stage=>{
    if(!stage||stage.completed)return false;
    let changed=false;
    [...new Set(stage.fixtures.map(game=>game.tieId))].forEach(tieId=>{
      const games=cupTieGames(stage,tieId);
      if(games.some(game=>isUserFixture(game)&&!game.completed))return;
      games.forEach(game=>{if(simulateCupComputerGame(game))changed=true;});
      if(games.every(game=>game.completed)){
        resolveCupTieWinner(games,cupTieAggregate(games));
        changed=true;
      }
    });
    if(finalizeCupStageIfReady(stage))changed=true;
    return changed;
  };
  const completeCupStage=stage=>{
    if(!stage||stage.completed)return stage?.winners||[];
    if(stagePendingUserFixtures(stage))return stage?.winners||[];
    advanceCupComputerTies(stage);
    return stage?.winners||[];
  };
  const advanceCupThroughDate=date=>{
    let changed=false;
    let stage=cupCompetition.stages.find(item=>!item.completed);
    while(stage){
      const stageDue=stage.fixtures.length&&Math.max(...stage.fixtures.map(game=>new Date(game.date).getTime()))<=date.getTime();
      if(!stageDue)break;
      if(advanceCupComputerTies(stage))changed=true;
      if(stagePendingUserFixtures(stage))break;
      if(!stage.completed)break;
      stage=cupCompetition.stages.find(item=>!item.completed);
    }
    return changed;
  };
  const reconcileSerieACupEntry=()=>{
    if(userDivision!=='A'||!cupSerieAEntrants.includes(userClub))return false;
    const userHadCup=cupCompetition.stages.some(stage=>stage.fixtures.some(game=>game.home===userClub||game.away===userClub));
    if(userHadCup)return false;
    const phase4=cupCompetition.stages.find(stage=>stage.index===4),phase5=cupCompetition.stages.find(stage=>stage.index===5);
    if(!phase4?.completed||phase5?.entrants?.includes(userClub))return false;
    const winners=Array.isArray(phase4.winners)&&phase4.winners.length?phase4.winners:[];
    if(!winners.length){
      const tieIds=[...new Set(phase4.fixtures.map(game=>game.tieId))];
      tieIds.forEach(tieId=>{const winner=resolveCupTie(phase4,tieId);if(winner)winners.push(winner);});
      if(winners.length!==tieIds.length)return false;
      phase4.winners=winners;phase4.completed=true;
    }
    if(phase5){
      const phaseIndex=cupCompetition.stages.findIndex(stage=>stage.index===5);
      if(phaseIndex>=0)cupCompetition.stages.splice(phaseIndex,1);
    }
    createCupStage(5,nextCupEntrants(4,phase4.winners));
    refreshCopaDoBrasilFixtures();
    return true;
  };
  let advanceCalendarWeek=()=>{};
  const buildLiveKnockoutStats=()=>{const h=stats.home,a=stats.away,hp=clamp(Math.round(h.possession),28,72),userAtHome=liveMatchGame?.home===userClub;return {homeGoals:userAtHome?home:away,awayGoals:userAtHome?away:home,goals:userAtHome?{home:[...goals.home],away:[...goals.away]}:{home:[...goals.away],away:[...goals.home]},data:{homePossession:hp,awayPossession:100-hp,homePasses:h.passes,awayPasses:a.passes,homeAccurate:h.accurate,awayAccurate:a.accurate,homeShots:h.shots,awayShots:a.shots,homeOnTarget:h.on,awayOnTarget:a.on,homeOff:h.off,awayOff:a.off,homeSaved:h.saved,awaySaved:a.saved,homePenalties:h.penalties,awayPenalties:a.penalties,homeOffsides:h.offsides,awayOffsides:a.offsides,homeKeeperSaves:h.keeperSaves,awayKeeperSaves:a.keeperSaves,homeTackles:h.tackles,awayTackles:a.tackles,homeFouls:h.fouls,awayFouls:a.fouls,homeYellow:h.yellow,awayYellow:a.yellow,homeRed:h.red,awayRed:a.red}};};
  const buildLiveCupStats=buildLiveKnockoutStats;
  const commitLiveKnockoutResult=()=>{
    if(!liveMatchGame||liveMatchGame.completed||!isKnockoutShootoutCompetition(liveMatchGame))return false;
    Object.assign(liveMatchGame,buildLiveKnockoutStats(),{completed:true});
    if(!availabilityCommitted)commitLiveAvailability();
    if(liveMatchGame.competition===KNOCKOUT_COMPETITIONS.COPA){
      const stage=cupCompetition.stages.find(item=>item.fixtures.includes(liveMatchGame));
      if(stage){resolveCupTie(stage,liveMatchGame.tieId);finalizeCupStageIfReady(stage);}
    }
    return true;
  };
  const commitLiveCupResult=commitLiveKnockoutResult;
  const advanceCupRound=()=>{
    if(roundCommitted)return;
    advancePostMatchDay();
    const restDays=Math.max(1,restDaysUntilNextFixture());
    Object.values(clubs).forEach(club=>orderRosterForFormation(club.roster,club.formation));
    renderRoster();draw();
    advanceCupComputerTies(cupCompetition.stages.find(item=>!item.completed));
    roundCommitted=true;
    persistSeason();
    refreshSeasonPresentation();
    $('#roundResultsModal').classList.add('hidden');modal.classList.add('hidden');
    stopMatchClock();matchStarted=false;matchFinished=false;liveMatchGame=null;liveDayMatchSnapshots=null;roundResults=null;roundResultMessagePushed=false;roundPreviewResults={};roundCommitted=false;
    $$('.nav').find(button=>button.dataset.view==='dashboard')?.click();
  };
  if(new URLSearchParams(location.search).has('engineTest')||new URLSearchParams(location.search).has('cupAudit')){
    window.__matchdayEngineBenchmark=(count=1000)=>{
      const sample=Math.max(1,Math.min(10000,Number(count)||1000)),fixtures=futureMatches.length?futureMatches:Object.values(nationalCompetitions[userDivision]?.fixtures||{})[0]||[],totals={matches:sample,goals:0,shots:0,onTarget:0,draws:0,scoreless:0,overFour:0,homeWins:0,awayWins:0,maxGoals:0};
      for(let index=0;index<sample;index++){const fixture=fixtures[index%fixtures.length],result=simulateRoundMatch(fixture.home,fixture.away),goals=result.homeGoals+result.awayGoals;totals.goals+=goals;totals.shots+=result.data.homeShots+result.data.awayShots;totals.onTarget+=result.data.homeOnTarget+result.data.awayOnTarget;totals.draws+=result.homeGoals===result.awayGoals?1:0;totals.scoreless+=goals===0?1:0;totals.overFour+=goals>=5?1:0;totals.homeWins+=result.homeGoals>result.awayGoals?1:0;totals.awayWins+=result.awayGoals>result.homeGoals?1:0;totals.maxGoals=Math.max(totals.maxGoals,goals);}
      return {...totals,goalsPerMatch:Number((totals.goals/sample).toFixed(3)),shotsPerMatch:Number((totals.shots/sample).toFixed(3)),onTargetPerMatch:Number((totals.onTarget/sample).toFixed(3)),drawRate:Number((totals.draws/sample*100).toFixed(1)),scorelessRate:Number((totals.scoreless/sample*100).toFixed(1)),overFourRate:Number((totals.overFour/sample*100).toFixed(1)),homeWinRate:Number((totals.homeWins/sample*100).toFixed(1)),awayWinRate:Number((totals.awayWins/sample*100).toFixed(1))};
    };
    window.__matchdayEngineExports={clubs,simulateRoundMatch,savedNewGame:!!savedNewGame,userDivision,createInjuryRecord,normalizeInjury,injuryCatalog,calculateEventInjuryChance,injuryMechanismFromEvent,workloadRisk,recoveryRisk,recordPlayerMatchWorkload,ensureWorkload,injuryInRestrictedPhase,matchPlayerStat,playerRehabMaxMinutes,beginRestrictedReturn,advanceRestrictedRehab,clearInjuryFully,clubMedicalQuality,medicalRecoveryModifier,medicalPreventionModifier,resolveInjuryTreatment,summarizeMatchInjuries,engineTuning,buildSimLineup,engineFoulRisk,engineBlowoutDamp};
  }
  // A tabela da rodada respeita exatamente os confrontos definidos no calendário.
  const simulateRoundResults=(force=false)=>{
    if(roundResults&&!force) return roundResults;
    roundResults=currentRoundFixtures().map(game=>{
      if(!isUserFixture(game)) return simulateRoundMatch(game.home,game.away);
      const userAtHome=game.home===userClub;
      const result={home:game.home,away:game.away,homeGoals:userAtHome?home:away,awayGoals:userAtHome?away:home,user:true,goals:userAtHome?{home:[...goals.home],away:[...goals.away]}:{home:[...goals.away],away:[...goals.home]}};
      if(liveMatchGame&&liveMatchGame.home===game.home&&liveMatchGame.away===game.away){
        Object.assign(result,{penalties:liveMatchGame.penalties,shootoutWinner:liveMatchGame.shootoutWinner,tieId:game.tieId,leg:game.leg,competition:game.competition,data:liveMatchGame.data,completed:isKnockoutShootoutCompetition(game)?true:undefined});
      }
      return result;
    });
    return roundResults;
  };
  const roundResultsCss=document.createElement('style');roundResultsCss.textContent='.round-results-modal{width:min(820px,calc(100vw - 28px));text-align:left}.round-results-modal h2{margin:5px 0 4px;font:700 32px Barlow Condensed}.round-results-modal p{margin:0;color:#9eb6b8;font-size:11px}.round-results-toolbar{display:grid;gap:10px;margin:15px 0 12px}.round-division-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.round-division-tabs button,.round-group-nav button,.round-selector button{min-height:34px;border:1px solid #315d69!important;background:#102a34!important;color:#b9ced2!important}.round-division-tabs button.active{border-color:#63d9ff!important;background:#1c5061!important;color:#f2fcff!important;box-shadow:inset 0 -2px #63d9ff}.round-context-nav{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:38px;padding:7px 9px;border:1px solid #28505b;border-radius:6px;background:#0b1d25}.round-group-nav,.round-selector{display:flex;align-items:center;gap:8px}.round-group-nav strong,.round-selector strong{min-width:92px;text-align:center;color:#edf8f5;font-size:11px}.round-group-nav button,.round-selector button{width:34px;padding:0}.round-format{color:#63d9ff;font:700 9px DM Sans;letter-spacing:.55px}.round-games{border:1px solid #28505b;border-radius:7px;overflow:hidden}.round-games-head,.round-game-row{display:grid;grid-template-columns:minmax(0,1fr) 76px minmax(0,1fr);gap:12px;align-items:center;padding:11px 14px}.round-games-head{background:#102b35;color:#63d9ff;font:700 9px DM Sans;letter-spacing:.65px}.round-games-head span:nth-child(2),.round-game-row strong{text-align:center}.round-games-head span:last-child,.round-game-row span:last-child{text-align:right}.round-game-row{min-height:44px;border-top:1px solid #234650;color:#edf8f5;font-size:12px}.round-game-row strong{font:700 19px Barlow Condensed;color:#b6ff38}.round-game-row.user-game{background:linear-gradient(90deg,#254d2c,#203b26);box-shadow:inset 4px 0 #b6ff38,0 0 16px #b6ff3818}.user-game-tag{display:inline-block;margin-left:7px;padding:3px 5px;border:1px solid #b6ff38;border-radius:3px;color:#dfff9b;font:700 8px DM Sans;letter-spacing:.35px;vertical-align:middle}.round-games-empty{padding:32px 15px;text-align:center;color:#8fa9ae;font-size:11px}@media(max-width:620px){.round-results-modal{width:calc(100vw - 16px)}.round-division-tabs{grid-template-columns:1fr 1fr}.round-context-nav{align-items:stretch;flex-direction:column}.round-format{text-align:center}.round-games-head,.round-game-row{grid-template-columns:minmax(0,1fr) 58px minmax(0,1fr);gap:5px;padding:10px 8px;font-size:10px}.round-game-row strong{font-size:16px}.user-game-tag{display:none}}';document.head.append(roundResultsCss);
  document.body.insertAdjacentHTML('beforeend',`<div id="roundResultsModal" class="modal hidden"><div class="modal-card round-results-modal"><button id="closeRoundResults" class="close">×</button><label>RODADA CONCLUÍDA</label><h2>Tabela de Jogos</h2><p id="roundResultsMeta"></p><div class="round-results-toolbar"><div id="roundDivisionTabs" class="round-division-tabs"></div><div class="round-context-nav"><div id="roundGroupNav" class="round-group-nav"></div><span id="roundFormat" class="round-format"></span><div id="roundSelector" class="round-selector"></div></div></div><div id="roundGames" class="round-games"></div></div></div>`);
  const liveDayMatchesCss=document.createElement('style');
  liveDayMatchesCss.textContent='.live-day-matches-modal{width:min(760px,calc(100vw - 28px));text-align:left}.live-day-matches-modal h2{margin:5px 0 4px;font:700 30px Barlow Condensed}.live-day-matches-modal>p{margin:0;color:#9eb6b8;font-size:11px;line-height:1.45}.live-day-matches-list{margin-top:14px;border:1px solid #28505b;border-radius:7px;overflow:hidden}.live-day-matches-head,.live-day-match-row{display:grid;grid-template-columns:72px minmax(0,1fr) 76px minmax(0,1fr) 52px;gap:10px;align-items:center;padding:10px 12px}.live-day-matches-head{background:#102b35;color:#63d9ff;font:700 9px DM Sans;letter-spacing:.55px}.live-day-matches-head span:nth-child(3),.live-day-match-score{text-align:center}.live-day-match-row{min-height:42px;border-top:1px solid #234650;color:#edf8f5;font-size:11px}.live-day-match-row.user-game{background:linear-gradient(90deg,#254d2c,#203b26);box-shadow:inset 4px 0 #b6ff38,0 0 16px #b6ff3818}.live-day-match-label{color:#7fa8b0;font:700 8px DM Sans;letter-spacing:.35px}.live-day-match-score{font:700 18px Barlow Condensed;color:#b6ff38}.live-day-match-status{text-align:center;color:#63d9ff;font:700 9px DM Sans}.live-day-match-away{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}.live-day-matches-empty{padding:28px 14px;text-align:center;color:#8fa9ae;font-size:11px}@media(max-width:620px){.live-day-matches-modal{width:calc(100vw - 16px)}.live-day-matches-head,.live-day-match-row{grid-template-columns:58px minmax(0,1fr) 58px minmax(0,1fr) 44px;gap:6px;padding:9px 8px;font-size:10px}.live-day-match-score{font-size:15px}.live-day-match-away .user-game-tag{display:none}}';
  document.head.append(liveDayMatchesCss);
  document.body.insertAdjacentHTML('beforeend',`<div id="liveDayMatchesModal" class="modal hidden"><div class="modal-card live-day-matches-modal"><button id="closeLiveDayMatches" class="close">×</button><label>AO VIVO · RODADA</label><h2>Partidas em Andamento</h2><p id="liveDayMatchesMeta"></p><div id="liveDayMatchesList" class="live-day-matches-list"></div></div></div>`);
  let roundBrowserDivision=userDivision,roundBrowserRound=currentRound,roundBrowserGroup=userDivision==='D'?userSerieDGroupIndex:0;
  const divisionRoundHistory=division=>(division===userDivision?seasonRoundHistory:competitionRoundHistory[division])||[];
  const availableResultRounds=division=>[...new Set([...divisionRoundHistory(division).map(item=>item.round),currentRound])].sort((a,b)=>a-b);
  const previewRoundGames=(division,round)=>{
    if(division===userDivision&&round===currentRound)return simulateRoundResults();
    const stored=divisionRoundHistory(division).find(item=>item.round===round);if(stored)return stored.games||[];
    if(round!==currentRound)return [];
    const key=`${division}-${round}`;if(!roundPreviewResults[key])roundPreviewResults[key]=(nationalCompetitions[division]?.fixtures?.[round-1]||[]).map(game=>simulateRoundMatch(game.home,game.away));
    return roundPreviewResults[key];
  };
  const renderRoundResultsBrowser=()=>{
    const divisions=['A','B','C','D'];
    $('#roundDivisionTabs').innerHTML=divisions.map(division=>`<button class="${division===roundBrowserDivision?'active':''}" data-round-division="${division}">SÉRIE ${division}</button>`).join('');
    const rounds=availableResultRounds(roundBrowserDivision),roundIndex=Math.max(0,rounds.indexOf(roundBrowserRound));if(!rounds.includes(roundBrowserRound))roundBrowserRound=rounds.at(-1)||currentRound;
    let games=previewRoundGames(roundBrowserDivision,roundBrowserRound),format='PONTOS CORRIDOS · TURNO E RETURNO';
    if(roundBrowserDivision==='D'&&roundBrowserRound<=10){const group=serieDGroups[roundBrowserGroup]||[];games=games.filter(game=>group.includes(game.home)&&group.includes(game.away));format=`1ª FASE · GRUPO A${roundBrowserGroup+1}`;$('#roundGroupNav').innerHTML=`<button data-group-step="-1" aria-label="Grupo anterior">‹</button><strong>GRUPO A${roundBrowserGroup+1}</strong><button data-group-step="1" aria-label="Próximo grupo">›</button>`;}
    else{$('#roundGroupNav').innerHTML='';if(roundBrowserDivision==='D')format=roundBrowserRound<=12?'2ª FASE · MATA-MATA':roundBrowserRound<=14?'3ª FASE · MATA-MATA':roundBrowserRound<=16?'OITAVAS DE FINAL':roundBrowserRound<=18?'QUARTAS DE FINAL':roundBrowserRound<=20?'SEMIFINAL':roundBrowserRound<=22?'FINAL':'MATA-MATA';}
    $('#roundFormat').textContent=format;$('#roundSelector').innerHTML=`<button data-round-step="-1" ${roundIndex<=0?'disabled':''} aria-label="Rodada anterior">‹</button><strong>RODADA ${roundBrowserRound}</strong><button data-round-step="1" ${roundIndex>=rounds.length-1?'disabled':''} aria-label="Próxima rodada">›</button>`;
    $('#roundResultsMeta').textContent=`Série ${roundBrowserDivision} · resultados preservados e organizados conforme o formato da competição.`;
    $('#roundGames').innerHTML=`<div class="round-games-head"><span>MANDANTE</span><span>PLACAR</span><span>VISITANTE</span></div>${games.length?games.map(game=>{const isUser=game.home===userClub||game.away===userClub;return `<div class="round-game-row ${isUser?'user-game':''}"><span><b class="club-link" data-club="${game.home}" role="button" tabindex="0">${game.home}</b>${isUser?'<small class="user-game-tag">SEU JOGO</small>':''}</span><strong>${game.homeGoals} — ${game.awayGoals}</strong><span><b class="club-link" data-club="${game.away}" role="button" tabindex="0">${game.away}</b></span></div>`;}).join(''):'<div class="round-games-empty">Nenhum resultado disponível para esta rodada.</div>'}`;
  };
  const openRoundResults=()=>{roundBrowserDivision=userDivision;roundBrowserRound=currentRound;roundBrowserGroup=userDivision==='D'?userSerieDGroupIndex:0;renderRoundResultsBrowser();$('#roundResultsModal').classList.remove('hidden');};
  $('#roundResultsModal').addEventListener('click',event=>{const division=event.target.closest('[data-round-division]')?.dataset.roundDivision;if(division){roundBrowserDivision=division;const rounds=availableResultRounds(division);roundBrowserRound=rounds.includes(currentRound)?currentRound:(rounds.at(-1)||currentRound);if(division==='D')roundBrowserGroup=serieDGroups.findIndex(group=>group.includes(userClub));if(roundBrowserGroup<0)roundBrowserGroup=0;renderRoundResultsBrowser();return;}const groupStep=Number(event.target.closest('[data-group-step]')?.dataset.groupStep||0);if(groupStep){roundBrowserGroup=(roundBrowserGroup+groupStep+serieDGroups.length)%serieDGroups.length;renderRoundResultsBrowser();return;}const roundStep=Number(event.target.closest('[data-round-step]')?.dataset.roundStep||0);if(roundStep){const rounds=availableResultRounds(roundBrowserDivision),index=rounds.indexOf(roundBrowserRound),next=rounds[index+roundStep];if(next){roundBrowserRound=next;renderRoundResultsBrowser();}}});
  onClick('#closeRoundResults',()=>{$('#roundResultsModal').classList.add('hidden');reopenMatchWindow();});
  onClick('#liveDayMatches',openLiveDayMatches);
  onClick('#closeLiveDayMatches',()=>{$('#liveDayMatchesModal').classList.add('hidden');});
  const recentResultsCss=document.createElement('style');
  recentResultsCss.textContent='.results-card .form b.win{background:#b6ff38!important;color:#07131a!important}.results-card .form b.draw{background:#63d9ff!important;color:#07131a!important}.results-card .form b.loss{background:#8d3440!important;color:#ffdce0!important}.results-card .form-empty{display:flex;align-items:center;min-height:28px;color:#9eb6b8;font-size:10px}.results-card .form b{cursor:help}';
  document.head.append(recentResultsCss);
  const userMatchResultLetter=game=>{
    if(game.shootoutWinner)return game.shootoutWinner===userClub?'V':'D';
    const atHome=game.home===userClub,own=Number(atHome?game.homeGoals:game.awayGoals),opponent=Number(atHome?game.awayGoals:game.homeGoals);
    return own>opponent?'V':own<opponent?'D':'E';
  };
  const userCompletedMatchResults=()=>{
    const entries=[],seen=new Set(),register=(game,meta)=>{
      if(!game||!(game.home===userClub||game.away===userClub))return;
      const scored=game.completed||game.homeGoals!=null||game.awayGoals!=null;
      if(!scored)return;
      const key=`${game.home}|${game.away}|${game.round||''}|${game.leg||''}|${game.phase||''}|${meta.competition}`;
      if(seen.has(key))return;
      seen.add(key);
      const result=userMatchResultLetter(game);
      entries.push({...game,result,points:result==='V'?3:result==='E'?1:0,sortDate:meta.sortDate,label:meta.label,competition:meta.competition});
    };
    seasonRoundHistory.forEach(round=>(round.games||[]).forEach(game=>register(game,{competition:'league',label:`Rodada ${round.round}`,sortDate:fixtureDate(round.round)})));
    copaDoBrasilFixtures.filter(game=>game.completed).forEach(game=>register(game,{competition:'cup',label:`Copa · ${game.phase}${game.leg?` · ${game.leg}`:''}`,sortDate:new Date(game.date)}));
    nationalCompetitions.D.fixtures.filter(Array.isArray).flat().filter(game=>game.completed&&isKnockoutShootoutCompetition(game)).forEach(game=>register(game,{competition:'knockout',label:`Série D · ${game.leg||'Eliminatórias'}`,sortDate:fixtureDate(game.round)}));
    return entries.sort((a,b)=>a.sortDate-b.sortDate);
  };
  const isCompletedDashboardGame=game=>game&&(game.completed||game.homeGoals!=null||game.awayGoals!=null);
  const dashboardCompletedGames=()=>{
    const entries=[],seen=new Set(),register=(game,meta)=>{
      if(!isCompletedDashboardGame(game))return;
      const key=`${game.home}|${game.away}|${game.round||''}|${game.leg||''}|${game.phase||''}|${meta.competition}`;
      if(seen.has(key))return;
      seen.add(key);
      entries.push({...game,...meta});
    };
    seasonRoundHistory.forEach(round=>(round.games||[]).forEach(game=>register(game,{competition:'league',round:round.round,label:`Rodada ${round.round}`,sortDate:fixtureDate(round.round)})));
    copaDoBrasilFixtures.forEach(game=>register(game,{competition:'cup',label:`Copa · ${game.phase}${game.leg?` · ${game.leg}`:''}`,sortDate:fixtureDetails(game).date}));
    nationalCompetitions.D.fixtures.filter(Array.isArray).flat().filter(game=>isKnockoutShootoutCompetition(game)).forEach(game=>register(game,{competition:'knockout',label:`Série D · ${game.leg||'Eliminatórias'}`,sortDate:fixtureDate(game.round)}));
    return entries.sort((a,b)=>a.sortDate-b.sortDate);
  };
  const dashboardRecentLabel=game=>{
    if(!game)return '—';
    if(game.competition==='cup')return `COPA · ${game.phase||'DO BRASIL'}${game.leg?` · ${game.leg}`:''}`;
    if(game.competition==='knockout')return `SÉRIE D · ${game.leg||'ELIMINATÓRIAS'}`;
    return `RODADA ${game.round||'—'}`;
  };
  const dashboardRecentGames=()=>{
    const completed=dashboardCompletedGames();
    if(!completed.length)return {label:'—',games:[]};
    const userGame=completed.filter(isUserFixture).at(-1),recent=completed.slice(-4);
    const picked=userGame&&!recent.some(game=>game.home===userGame.home&&game.away===userGame.away&&game.competition===userGame.competition)?[...recent.slice(-3),userGame].sort((a,b)=>a.sortDate-b.sortDate):recent;
    return {label:dashboardRecentLabel(picked.at(-1)),games:picked};
  };
  const dashboardReportGames=new Map();
  const dashboardGameReport=game=>{
    if(!isCompletedDashboardGame(game))return null;
    if(game.competition==='COPA DO BRASIL'||game.competition==='cup')return {game,result:game,data:game.data||null,goals:game.goals||null};
    if(isKnockoutShootoutCompetition(game)||game.competition==='knockout')return {game,result:game,data:game.data||null,goals:game.goals||null};
    if(game.data)return {game,result:game,data:game.data,goals:game.goals||null};
    const fromCalendar=calendarGameResult(game);
    if(fromCalendar)return fromCalendar;
    return {game,result:game,data:null,goals:game.goals||null};
  };
  const renderRecentGamesDashboard=()=>{
    const panel=$('#recentMatches'),roundLabel=$('#recentMatchesRound');
    if(!panel)return;
    dashboardReportGames.clear();
    const {label,games}=dashboardRecentGames();
    if(roundLabel)roundLabel.textContent=label;
    if(!games.length){panel.innerHTML='<div class="dashboard-results-empty">Nenhum jogo concluído.</div>';return;}
    panel.innerHTML=games.map((game,index)=>{
      const isUser=isUserFixture(game),score=`${game.homeGoals} — ${game.awayGoals}${game.penalties?` (${game.penalties})`:''}`,report=dashboardGameReport(game),reportKey=`recent-${index}`;
      if(report)dashboardReportGames.set(reportKey,report);
      return `<div class="round-game-row ${isUser?'user-game':''} ${report?'has-report':''}"><span><b class="club-link" data-club="${game.home}" role="button" tabindex="0">${game.home}</b>${isUser?'<small class="user-game-tag">SEU JOGO</small>':''}</span><strong>${score}</strong><span><b class="club-link" data-club="${game.away}" role="button" tabindex="0">${game.away}</b></span><button type="button" class="dashboard-match-report" data-match-report="${reportKey}" title="Ver estatísticas finais" aria-label="Ver estatísticas de ${game.home} contra ${game.away}">▤</button></div>`;
    }).join('');
  };
  onClick('#recentMatches',event=>{const button=event.target.closest('[data-match-report]');if(!button)return;const report=dashboardReportGames.get(button.dataset.matchReport);if(report)openCalendarMatchReport(report);});
  const renderRecentResults=()=>{
    const completed=userCompletedMatchResults().slice(-5);
    const form=$('.results-card .form'),summary=$('.results-card>small');
    if(!completed.length){form.innerHTML='<span class="form-empty">Nenhum jogo concluído.</span>';summary.textContent='A temporada ainda não possui resultados.';renderRecentGamesDashboard();return;}
    form.innerHTML=completed.map(game=>{
      const score=`${game.home} ${game.homeGoals} — ${game.awayGoals}${game.penalties?` (${game.penalties})`:''} ${game.away}`;
      return `<b class="${game.result==='V'?'win':game.result==='E'?'draw':'loss'}" title="${game.label}: ${score}">${game.result}</b>`;
    }).join('');
    const points=completed.reduce((total,game)=>total+game.points,0),games=completed.length;
    summary.textContent=games===1?`${points} ${points===1?'ponto':'pontos'} no último jogo`:`${points} pontos nos últimos ${games} jogos`;
    renderRecentGamesDashboard();
  };
  renderRecentResults();
  let roundCommitted=false;
  const recoverPlayers=(days=3)=>Object.values(clubs).forEach(club=>{const institution=clubInstitutionalContext(club);club.roster.forEach(player=>{player.fatigue=clamp(player.fatigue+dailyRecovery(player)*days*institution.recovery,0,100);});});
  persistSeason=()=>{
    if(!savedNewGame)return;
    const standings=Object.fromEntries(Object.entries(nationalCompetitions).map(([division,competition])=>[division,competition.standings.map(row=>({...row}))])),fatigue=Object.fromEntries(Object.entries(clubs).map(([clubName,club])=>[clubName,Object.fromEntries(club.roster.map(player=>[player.name,Math.round(player.fatigue*10)/10]))])),compactHistory=history=>history.map(item=>({round:item.round,games:(item.games||[]).map(game=>({home:game.home,away:game.away,homeGoals:game.homeGoals,awayGoals:game.awayGoals,data:game.data?{...game.data}:null,goals:game.goals?{home:[...(game.goals.home||[])],away:[...(game.goals.away||[])]}:null})),userStats:item.userStats?{home:{...item.userStats.home},away:{...item.userStats.away},goals:{home:[...(item.userStats.goals?.home||[])],away:[...(item.userStats.goals?.away||[])]}}:null})),compactCompetitions=Object.fromEntries(Object.entries(competitionRoundHistory).map(([division,history])=>[division,compactHistory(history)]));
    const compactCup={currentPhase:cupCompetition.currentPhase,champion:cupCompetition.champion,stages:cupCompetition.stages.map(stage=>({index:stage.index,name:stage.name,twoLegged:stage.twoLegged,entrants:stage.entrants,completed:stage.completed,winners:stage.winners,fixtures:stage.fixtures.map(game=>({home:game.home,away:game.away,competition:game.competition,phase:game.phase,phaseIndex:game.phaseIndex,leg:game.leg,date:game.date,time:game.time,gameNumber:game.gameNumber,tieId:game.tieId,completed:game.completed,homeGoals:game.homeGoals,awayGoals:game.awayGoals,penalties:game.penalties,winner:game.winner,data:game.data?{...game.data}:null,goals:game.goals?{home:[...(game.goals.home||[])],away:[...(game.goals.away||[])]}:null}))}))};
    const availability=Object.fromEntries(Object.entries(clubs).map(([clubName,club])=>[clubName,Object.fromEntries(club.roster.map(player=>[player.name,{injury:player.injury?{...player.injury}:null,injuryHistory:Array.isArray(player.injuryHistory)?player.injuryHistory.map(entry=>({...entry})):[],workload:player.workload?{...player.workload}:null,discipline:{...player.discipline}}]))]));
    const clubMedical=Object.fromEntries(Object.entries(clubs).map(([clubName,club])=>[clubName,{medicalInvestment:club.medicalInvestment??0,preventionProgram:club.preventionProgram??0,pitchCondition:club.pitchCondition||'good'}]));
    writeJson(SAVE_KEYS.season,{seed:savedNewGame.seed,currentRound,careerCalendarDate:calendarKey(careerCalendarDate),trainingRules:{...trainingRules},standings,fatigue,availability,clubMedical,userTactics:{...tacticalValues},careerMessages:messages.getMessages().map(message=>({...message})),scorers:allScorers,assistants:allAssistants,serieDGroups,dFixtures:nationalCompetitions.D.fixtures,dKnockout:nationalCompetitions.D.knockout,cupCompetition:compactCup,nationalRanking:{formulaVersion:nationalRankingFormulaVersion,entries:nationalRankingEntries,finalizedSeasons:[...nationalRankingFinalizedSeasons]},seasonRoundHistory:compactHistory(seasonRoundHistory),competitionRoundHistory:compactCompetitions,updatedAt:new Date().toISOString()});
  };
  messages.setPersist(persistSeason);
  if(validSavedSeason&&savedSeason.currentRound!==currentRound)persistSeason();
  window.addEventListener('beforeunload',()=>{if(savedNewGame)persistSeason();});
  advanceCalendarWeek=()=>{
    if(!savedNewGame||seasonComplete()||isUserSeasonIdle())return null;
    rebuildCalendarGames();
    if(isOnPendingMatchDay()){
      renderCalendar();
      return {stopped:'match'};
    }
    const seasonEnd=seasonEndDate();
    let simulatedDays=0;
    for(let step=0;step<7;step++){
      const nextDay=new Date(careerCalendarDate);
      nextDay.setDate(nextDay.getDate()+1);
      nextDay.setHours(12,0,0,0);
      if(nextDay>seasonEnd)break;
      const pendingMatch=userMatchOnDate(nextDay);
      if(pendingMatch){
        advanceCareerCalendarTo(nextDay);
        advanceCupThroughDate(nextDay);
        selectedCalendarDate=new Date(nextDay);
        calendarCursor=new Date(careerSeason,nextDay.getMonth(),1);
        simulatedDays++;
        persistSeason();
        pushMatchDayBrief(pendingMatch);
        refreshSeasonPresentation();
        renderCalendar();
        return {stopped:'match',game:pendingMatch,days:simulatedDays};
      }
      applyTrainingDay(trainingTypeForDate(nextDay));
      advanceCareerCalendarTo(nextDay);
      advanceCupThroughDate(nextDay);
      simulatedDays++;
    }
    selectedCalendarDate=new Date(careerCalendarDate);
    calendarCursor=new Date(careerSeason,careerCalendarDate.getMonth(),1);
    if(simulatedDays>0){
      persistSeason();
      refreshSeasonPresentation();
    }
    renderCalendar();
    return {stopped:null,days:simulatedDays};
  };
  const advanceToMatchDay=()=>{
    if(!savedNewGame||seasonComplete()||isUserSeasonIdle())return null;
    rebuildCalendarGames();
    normalizeCalendarBeforeNextMatch();
    if(isOnPendingMatchDay()){
      pushMatchDayBrief(userMatchOnDate(careerCalendarDate)||nextPendingUserEntry()?.game);
      refreshSeasonPresentation();
      return {stopped:'already'};
    }
    const nextEntry=nextPendingUserEntry();
    if(!nextEntry)return null;
    const targetDate=new Date(nextEntry.details.date);
    targetDate.setHours(12,0,0,0);
    const seasonEnd=seasonEndDate();
    if(targetDate>seasonEnd){
      return {stopped:'failed',days:0};
    }
    let simulatedDays=0,safety=400;
    while(!sameCalendarDay(careerCalendarDate,targetDate)&&simulatedDays<safety){
      const nextDay=new Date(careerCalendarDate);
      nextDay.setDate(nextDay.getDate()+1);
      nextDay.setHours(12,0,0,0);
      if(nextDay>seasonEnd)break;
      applyTrainingDay(trainingTypeForDate(nextDay));
      advanceCareerCalendarTo(nextDay);
      advanceCupThroughDate(nextDay);
      simulatedDays++;
    }
    selectedCalendarDate=new Date(careerCalendarDate);
    calendarCursor=new Date(careerSeason,careerCalendarDate.getMonth(),1);
    const reachedTarget=sameCalendarDay(careerCalendarDate,targetDate)&&!isFixtureCompleted(nextEntry.game);
    if(reachedTarget||isOnPendingMatchDay()){
      persistSeason();
      pushMatchDayBrief(nextEntry.game);
      refreshSeasonPresentation();
      return {stopped:'match',days:simulatedDays,game:nextEntry.game};
    }
    if(simulatedDays>0){persistSeason();refreshSeasonPresentation();}
    return {stopped:'failed',days:simulatedDays};
  };
  onClick('#openDashboardCalendar',advanceToMatchDay);
  onClick('#calendarAdvanceWeek',()=>advanceCalendarWeek());
  if(!new URLSearchParams(location.search).has('cupAudit')&&reconcileSerieACupEntry()){
    console.warn(`Copa do Brasil: ${userClub} reintegrado à 5ª fase (save inconsistente corrigido).`);
    rebuildCalendarGames();
    $('#calendar .title span').textContent=`Agenda nacional de janeiro a dezembro · ${championshipFixtures.flat().length} jogos do Brasileiro · ${copaDoBrasilFixtures.length} jogos confirmados da Copa do Brasil · ${calendarIntervalLabel(restConflictCount)}.`;
    refreshSeasonPresentation();
  }
  if(savedNewGame)persistSeason();
  const commitLiveAvailability=()=>{
    if(availabilityCommitted||!matchStarted||!liveMatchGame)return;
    const userDisciplineLines=[];
    const userOpponent=liveMatchGame.home===userClub?liveMatchGame.away:liveMatchGame.home;
    [['home',liveMatchGame.home],['away',liveMatchGame.away]].forEach(([side,clubName])=>{
      const club=clubs[clubName];
      matchDiscipline[side].forEach(entry=>userDisciplineLines.push(...applyDisciplineToPlayer(club.roster.find(player=>player.name===entry.name),entry,currentRound,clubName)));
      const entries=[...liveMinutesPlayed[side].entries()].filter(([,mins])=>mins>0).map(([name,mins])=>({name,minutes:mins,started:liveOpeningLineup[side].includes(name)}));
      applyMatchWorkload(clubName,entries,tacticFor(side));
    });
    if(userDisciplineLines.length)pushDisciplineDigest(userDisciplineLines,currentRound,userOpponent?`vs ${userOpponent}`:`Rodada ${currentRound}`);
    availabilityCommitted=true;
  };
  const recordGameLeaders=game=>{
    [game.home,game.away].forEach(clubName=>clubs[clubName].roster.slice(0,11).forEach(player=>{const scorer=allScorers.find(item=>item.club===clubName&&item.name===player.name),assistant=allAssistants.find(item=>item.club===clubName&&item.name===player.name);if(scorer)scorer.games++;if(assistant)assistant.games++;}));
    if(game.goals)[['home',game.home],['away',game.away]].forEach(([side,clubName])=>(game.goals[side]||[]).forEach(goal=>{const started=name=>clubs[clubName].roster.slice(0,11).some(player=>player.name===name);let scorer=allScorers.find(item=>item.club===clubName&&item.name===goal.name);if(!scorer){const player=clubs[clubName].roster.find(item=>item.name===goal.name);scorer={name:goal.name,club:clubName,division:clubs[clubName].division,games:1,goals:0,tieValue:(player?.finishing||50)+(player?.heading||50)*.2};allScorers.push(scorer);}else if(!started(goal.name))scorer.games++;scorer.goals++;if(goal.assist){let assistant=allAssistants.find(item=>item.club===clubName&&item.name===goal.assist);if(!assistant){const player=clubs[clubName].roster.find(item=>item.name===goal.assist);assistant={name:goal.assist,club:clubName,division:clubs[clubName].division,games:1,assists:0,tieValue:(player?.passing||50)+(player?.playmaking||50)};allAssistants.push(assistant);}else if(!started(goal.assist))assistant.games++;assistant.assists++;}}));
    allScorers.sort((a,b)=>b.goals-a.goals||b.tieValue-a.tieValue||a.games-b.games);allAssistants.sort((a,b)=>b.assists-a.assists||b.tieValue-a.tieValue||a.games-b.games);
  };
  const applyRoundToTable=game=>{
    const homeRow=leagueData.find(row=>row.club===game.home), awayRow=leagueData.find(row=>row.club===game.away);
    if(!homeRow||!awayRow) return;
    homeRow.played++;awayRow.played++;homeRow.goalDiff+=game.homeGoals-game.awayGoals;awayRow.goalDiff+=game.awayGoals-game.homeGoals;
    if(game.homeGoals>game.awayGoals){homeRow.wins++;awayRow.losses++;homeRow.points+=3;}
    else if(game.homeGoals<game.awayGoals){awayRow.wins++;homeRow.losses++;awayRow.points+=3;}
    else{homeRow.draws++;awayRow.draws++;homeRow.points++;awayRow.points++;}
    if(game.fatigueAfter){
      [['home',game.home],['away',game.away]].forEach(([side,clubName])=>Object.entries(game.fatigueAfter[side]||{}).forEach(([playerName,value])=>{const player=clubs[clubName].roster.find(candidate=>candidate.name===playerName);if(player)player.fatigue=clamp(value,0,100);}));
    }
    applyMatchAvailability(game);
  };
  const applySecondaryResult=(game,competition)=>{
    const homeRow=competition.standings.find(row=>row.club===game.home),awayRow=competition.standings.find(row=>row.club===game.away);if(!homeRow||!awayRow)return;
    homeRow.played++;awayRow.played++;homeRow.goalDiff+=game.homeGoals-game.awayGoals;awayRow.goalDiff+=game.awayGoals-game.homeGoals;
    if(game.homeGoals>game.awayGoals){homeRow.wins++;awayRow.losses++;homeRow.points+=3;}else if(game.homeGoals<game.awayGoals){awayRow.wins++;homeRow.losses++;awayRow.points+=3;}else{homeRow.draws++;awayRow.draws++;homeRow.points++;awayRow.points++;}
    if(game.fatigueAfter)[['home',game.home],['away',game.away]].forEach(([side,clubName])=>Object.entries(game.fatigueAfter[side]||{}).forEach(([playerName,value])=>{const player=clubs[clubName].roster.find(candidate=>candidate.name===playerName);if(player)player.fatigue=clamp(value,0,100);}));
    applyMatchAvailability(game);
  };
  const simulateNationalRound=()=>Object.keys(nationalCompetitions).filter(division=>division!==userDivision).forEach(division=>{const competition=nationalCompetitions[division],fixtures=competition.fixtures[currentRound-1]||[];if(!fixtures.length)return;const previewKey=`${division}-${currentRound}`,results=roundPreviewResults[previewKey]||fixtures.map(game=>simulateRoundMatch(game.home,game.away));results.forEach(recordGameLeaders);if(division!=='D'||currentRound<=10)results.forEach(game=>applySecondaryResult(game,competition));competition.standings.sort((a,b)=>b.points-a.points||b.goalDiff-a.goalDiff||b.wins-a.wins);competition.standings.forEach((row,index)=>clubs[row.club].position=index+1);competitionRoundHistory[division].push({round:currentRound,games:results.map(game=>({home:game.home,away:game.away,homeGoals:game.homeGoals,awayGoals:game.awayGoals,data:game.data,goals:game.goals}))});});
  const dKnockout=nationalCompetitions.D.knockout;
  dKnockout.stages=dKnockout.stages||{};dKnockout.promoted=dKnockout.promoted||[];
  const dRoundResults=round=>(userDivision==='D'?seasonRoundHistory:competitionRoundHistory.D).find(item=>item.round===round)?.games||[];
  const makeTies=clubsList=>Array.from({length:Math.floor(clubsList.length/2)},(_,index)=>({home:clubsList[index*2],away:clubsList[index*2+1]}));
  const installTieRounds=(ties,startRound,extraTies=[])=>{const all=[...ties,...extraTies];nationalCompetitions.D.fixtures[startRound-1]=all.map((tie,tieIndex)=>({home:tie.home,away:tie.away,round:startRound,competition:KNOCKOUT_COMPETITIONS.SERIE_D,tieId:`d-ko-r${startRound}-t${tieIndex}`,leg:'IDA',knockoutRound:startRound,twoLegged:true,completed:false}));nationalCompetitions.D.fixtures[startRound]=all.map((tie,tieIndex)=>({home:tie.away,away:tie.home,round:startRound+1,competition:KNOCKOUT_COMPETITIONS.SERIE_D,tieId:`d-ko-r${startRound}-t${tieIndex}`,leg:'VOLTA',knockoutRound:startRound,twoLegged:true,completed:false}));};
  const getSerieDTieGames=game=>{if(!game?.tieId)return[];return nationalCompetitions.D.fixtures.filter(Array.isArray).flat().filter(item=>item.tieId===game.tieId).sort((a,b)=>(a.leg==='IDA'?0:1)-(b.leg==='IDA'?0:1));};
  const mergeSerieDTieResults=(games,startRound)=>{const historyGames=[...dRoundResults(startRound),...dRoundResults(startRound+1)];return games.map(fixture=>{const played=historyGames.find(item=>item.home===fixture.home&&item.away===fixture.away);if(!played)return {...fixture};return {...fixture,...played,completed:true,penalties:played.penalties||fixture.penalties,shootoutWinner:played.shootoutWinner||fixture.shootoutWinner};});};
  const getKnockoutTieGames=game=>{if(!game)return[];if(game.competition===KNOCKOUT_COMPETITIONS.COPA){const stage=cupCompetition.stages.find(item=>item.fixtures.includes(game));return stage?cupTieGames(stage,game.tieId):[];}if(isKnockoutShootoutCompetition(game))return getSerieDTieGames(game);return [];};
  const resolveTies=(ties,startRound)=>{const idaFixtures=nationalCompetitions.D.fixtures[startRound-1]||[],winners=[],losers=[];ties.forEach((tie,tieIndex)=>{const tieId=`d-ko-r${startRound}-t${tieIndex}`,games=mergeSerieDTieResults(getSerieDTieGames({tieId}).length?getSerieDTieGames({tieId}):[idaFixtures[tieIndex],(nationalCompetitions.D.fixtures[startRound]||[])[tieIndex]].filter(Boolean),startRound),winner=resolveKnockoutTieWinner(games,{pickWinner:cupPenaltyWinner,int});winners.push(winner);losers.push(winner===tie.home?tie.away:tie.home);});return{winners,losers};};
  const updateSeriesDKnockout=completedRound=>{
    if(completedRound===10&&!dKnockout.stages.second){const qualified=serieDGroups.map(group=>group.map(name=>nationalCompetitions.D.standings.find(row=>row.club===name)).sort((a,b)=>b.points-a.points||b.wins-a.wins||b.goalDiff-a.goalDiff).slice(0,4).map(row=>row.club)),ties=[];for(let group=0;group<16;group+=2){const left=qualified[group],right=qualified[group+1];ties.push({home:left[0],away:right[3]},{home:left[1],away:right[2]},{home:left[2],away:right[1]},{home:left[3],away:right[0]});}dKnockout.stages.second=ties;installTieRounds(ties,11);notifySerieDKnockoutPhase(11,'2ª fase eliminatória');}
    if(completedRound===12&&!dKnockout.stages.third){const resolved=resolveTies(dKnockout.stages.second,11);dKnockout.stages.third=makeTies(resolved.winners);installTieRounds(dKnockout.stages.third,13);notifySerieDKnockoutPhase(13,'3ª fase eliminatória');}
    if(completedRound===14&&!dKnockout.stages.round16){const resolved=resolveTies(dKnockout.stages.third,13);dKnockout.stages.round16=makeTies(resolved.winners);installTieRounds(dKnockout.stages.round16,15);notifySerieDKnockoutPhase(15,'Oitavas de final');}
    if(completedRound===16&&!dKnockout.stages.quarter){const resolved=resolveTies(dKnockout.stages.round16,15);dKnockout.stages.quarter=makeTies(resolved.winners);installTieRounds(dKnockout.stages.quarter,17);notifySerieDKnockoutPhase(17,'Quartas de final');}
    if(completedRound===18&&!dKnockout.stages.semi){const resolved=resolveTies(dKnockout.stages.quarter,17);dKnockout.promoted=[...resolved.winners];dKnockout.stages.semi=makeTies(resolved.winners);dKnockout.stages.playoff=makeTies(resolved.losers);installTieRounds(dKnockout.stages.semi,19,dKnockout.stages.playoff);notifySerieDKnockoutPhase(19,'Semifinal');}
    if(completedRound===20&&!dKnockout.stages.final){const semifinal=resolveTies(dKnockout.stages.semi,19),playoff=resolveTies(dKnockout.stages.playoff,19);dKnockout.promoted=[...new Set([...dKnockout.promoted,...playoff.winners])];dKnockout.stages.final=makeTies(semifinal.winners);installTieRounds(dKnockout.stages.final,21);notifySerieDKnockoutPhase(21,'Final');}
    if(completedRound===22&&dKnockout.stages.final&&!dKnockout.champion)dKnockout.champion=resolveTies(dKnockout.stages.final,21).winners[0]||null;
    rebuildCalendarGames();
  };
  const finalizeNationalRankingSeason=()=>{
    if(nationalRankingFinalizedSeasons.has(careerSeason))return;
    Object.entries(nationalCompetitions).forEach(([division,competition])=>competition.standings.forEach(row=>{const entry=nationalRankingEntries[row.club];if(entry)entry.championshipPoints=roundRankingScore(entry.championshipPoints+row.points*nationalLeaguePointWeights[division]);}));
    const champions={A:ranked('A')[0],B:ranked('B')[0],C:ranked('C')[0],D:dKnockout.champion||ranked('D')[0],CUP:cupCompetition.champion};
    Object.entries(champions).forEach(([competition,clubName])=>{if(!clubName)return;const entry=nationalRankingEntries[clubName],label=competition==='CUP'?'COPA DO BRASIL':`SÉRIE ${competition}`,token=`${careerSeason}-${competition}`;if(!entry||entry.titles.some(title=>title.token===token))return;const points=nationalTitleBonuses[competition];entry.titlePoints=roundRankingScore(entry.titlePoints+points);entry.titles.push({token,season:careerSeason,competition:label,points});});
    nationalRankingFinalizedSeasons.add(careerSeason);renderNationalRanking();
  };
  const seasonTransitionCss=document.createElement('style');seasonTransitionCss.textContent='.season-transition-modal{width:min(720px,calc(100vw - 28px));text-align:left}.season-transition-modal h2{margin:5px 0 5px;font:700 32px Barlow Condensed}.season-transition-modal>p{margin:0 0 12px;color:#9eb6b8;font-size:12px}.season-transition-summary{margin:0 0 14px;padding:12px 14px;border:1px solid #28505b;border-radius:7px;background:#0b1d25}.season-transition-summary strong{display:block;margin-bottom:6px;color:#b6ff38;font:700 16px Barlow Condensed}.season-transition-summary span{display:block;color:#cfe3e6;font-size:11px;line-height:1.45}.season-champions{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:0 0 14px}.season-champions article{padding:9px 8px;border:1px solid #28505b;border-radius:6px;background:#0b1a22;text-align:center}.season-champions small{display:block;color:#63d9ff;font:700 8px DM Sans;letter-spacing:.5px}.season-champions b{display:block;margin-top:5px;color:#edf8f5;font:700 12px Barlow Condensed;line-height:1.25}.movement-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.movement-card{border:1px solid #28505b;border-radius:7px;overflow:hidden;background:#0b1a22}.movement-card h3{margin:0;padding:10px 12px;background:#123843;color:#b6ff38;font:700 17px Barlow Condensed}.movement-card div{display:grid;grid-template-columns:30px minmax(0,1fr);gap:7px;padding:7px 11px;border-top:1px solid #234b55;font-size:10px}.movement-card div.user-movement{background:#203b26;color:#dcffa9;box-shadow:inset 3px 0 #b6ff38}.movement-card small{color:#63d9ff}.season-transition-actions{display:flex;justify-content:flex-end;margin-top:16px}.season-transition-actions button{background:#b6ff38!important;color:#06131b!important;border:0!important}.idle-sim-modal{width:min(420px,calc(100vw - 28px));text-align:center}.idle-sim-modal h2{margin:8px 0 6px;font:700 28px Barlow Condensed}.idle-sim-modal p{margin:0;color:#9eb6b8;font-size:12px;line-height:1.45}.idle-sim-modal strong{display:block;margin-top:14px;color:#63d9ff;font:700 13px DM Sans}@media(max-width:620px){.movement-grid{grid-template-columns:1fr}.season-champions{grid-template-columns:1fr 1fr}}';document.head.append(seasonTransitionCss);
  document.body.insertAdjacentHTML('beforeend',`<div id="seasonTransitionModal" class="modal hidden"><div class="modal-card season-transition-modal"><label>TEMPORADA CONCLUÍDA</label><h2>Acessos e rebaixamentos</h2><p id="seasonTransitionLead">Os clubes abaixo mudarão de divisão na próxima temporada.</p><div id="seasonTransitionSummary" class="season-transition-summary"></div><div id="seasonChampions" class="season-champions"></div><div id="seasonMovements" class="movement-grid"></div><div class="season-transition-actions"><button id="startNextSeason">INICIAR PRÓXIMA TEMPORADA →</button></div></div></div><div id="idleSeasonSimModal" class="modal hidden"><div class="modal-card idle-sim-modal"><label>CALENDÁRIO NACIONAL</label><h2>Simulando não humanos</h2><p>Seu clube não tem mais partidas. O restante da temporada está sendo resolvido automaticamente.</p><strong id="idleSeasonSimStatus">Preparando…</strong></div></div>`);
  let pendingDivisionTeams=null,pendingUserDivision=userDivision,nonHumanSimRunning=false,idleSeasonWasSimulated=false;
  const ranked=division=>[...nationalCompetitions[division].standings].sort((a,b)=>b.points-a.points||b.wins-a.wins||b.goalDiff-a.goalDiff).map(row=>row.club);
  const playoffEdge=(first,second,division)=>{const table=nationalCompetitions[division].standings,a=table.find(row=>row.club===first),b=table.find(row=>row.club===second),aScore=a.points+clubs[first].power*.18+rnd(-2.5,2.5),bScore=b.points+clubs[second].power*.18+rnd(-2.5,2.5);return aScore>=bScore?first:second;};
  const finishRemainingNationalRounds=fromRound=>{for(let round=fromRound;round<=38;round++)['A','B','C'].forEach(division=>{const competition=nationalCompetitions[division],fixtures=competition.fixtures[round-1]||[],results=fixtures.map(game=>simulateRoundMatch(game.home,game.away));results.forEach(recordGameLeaders);results.forEach(game=>applySecondaryResult(game,competition));competitionRoundHistory[division].push({round,games:results.map(game=>({home:game.home,away:game.away,homeGoals:game.homeGoals,awayGoals:game.awayGoals,data:game.data,goals:game.goals}))});});Object.values(nationalCompetitions).forEach(competition=>competition.standings.sort((a,b)=>b.points-a.points||b.wins-a.wins||b.goalDiff-a.goalDiff));};
  const prepareSeasonTransition=()=>{
    const a=ranked('A'),b=ranked('B'),c=ranked('C'),relA=a.slice(-4),promB=[b[0],b[1],playoffEdge(b[2],b[5],'B'),playoffEdge(b[3],b[4],'B')],relB=b.slice(-4),promC=c.slice(0,4),relC=c.slice(-2);let promD=[...(dKnockout.promoted||[])];if(promD.length<6){const groupWinners=serieDGroups.map(group=>group.map(name=>nationalCompetitions.D.standings.find(row=>row.club===name)).sort((x,y)=>y.points-x.points||y.wins-x.wins||y.goalDiff-x.goalDiff)[0]?.club).filter(Boolean);promD=[...new Set([...promD,...groupWinners])].slice(0,6);}
    const next={A:[...divisionTeams.A.filter(name=>!relA.includes(name)),...promB],B:[...divisionTeams.B.filter(name=>!promB.includes(name)&&!relB.includes(name)),...relA,...promC],C:[...divisionTeams.C.filter(name=>!promC.includes(name)&&!relC.includes(name)),...relB,...promD],D:[...divisionTeams.D.filter(name=>!promD.includes(name)),...relC]};
    const used=new Set(Object.values(next).flat());generatedClubPool.filter(name=>!used.has(name)&&name!==userClub).some(name=>{if(next.D.length>=96)return true;next.D.push(name);used.add(name);return false;});pendingDivisionTeams=next;pendingUserDivision=Object.keys(next).find(division=>next[division].includes(userClub))||userDivision;
    const champions={A:ranked('A')[0],B:ranked('B')[0],C:ranked('C')[0],D:dKnockout.champion||ranked('D')[0],CUP:cupCompetition.champion};
    const userPromoted=promD.includes(userClub)||promC.includes(userClub)||promB.includes(userClub),userRelegated=relA.includes(userClub)||relB.includes(userClub)||relC.includes(userClub);
    const userLine=pendingUserDivision===userDivision
      ?`${userClub} permanece na Série ${pendingUserDivision} para ${careerSeason+1}.`
      :userPromoted?`${userClub} conquistou o acesso à Série ${pendingUserDivision}.`
      :userRelegated?`${userClub} foi rebaixado para a Série ${pendingUserDivision}.`
      :`${userClub} segue na Série ${pendingUserDivision} na próxima temporada.`;
    const idleNote=idleSeasonWasSimulated?` Sem jogos restantes do clube — o calendário nacional de ${careerSeason} foi simulado até o fim.`: '';
    const summary=$('#seasonTransitionSummary');if(summary)summary.innerHTML=`<strong>Situação de ${userClub}</strong><span>${userLine}${idleNote}</span>`;
    const champs=$('#seasonChampions');if(champs)champs.innerHTML=`<article><small>SÉRIE A</small><b>${champions.A||'—'}</b></article><article><small>SÉRIE B</small><b>${champions.B||'—'}</b></article><article><small>SÉRIE C</small><b>${champions.C||'—'}</b></article><article><small>SÉRIE D</small><b>${champions.D||'—'}</b></article><article><small>COPA DO BRASIL</small><b>${champions.CUP||'—'}</b></article>`;
    const lead=$('#seasonTransitionLead');if(lead)lead.textContent='Resultados finais das competições e movimentos de acesso/rebaixamento.';
    const section=(title,clubsList)=>`<article class="movement-card"><h3>${title}</h3>${clubsList.map((name,index)=>`<div class="${name===userClub?'user-movement':''}"><small>${index+1}</small><b>${name}</b></div>`).join('')||'<div><small>—</small><b>Nenhum clube</b></div>'}</article>`;
    $('#seasonMovements').innerHTML=section('SÉRIE B → SÉRIE A',promB)+section('SÉRIE A → SÉRIE B',relA)+section('SÉRIE C → SÉRIE B',promC)+section('SÉRIE B → SÉRIE C',relB)+section('SÉRIE D → SÉRIE C',promD)+section('SÉRIE C → SÉRIE D',relC);pushSeasonEndBrief();$('#seasonTransitionModal').classList.remove('hidden');
  };
  onClick('#startNextSeason',()=>{if(!pendingDivisionTeams||!savedNewGame)return;const nextSave={...savedNewGame,division:pendingUserDivision,divisionTeams:pendingDivisionTeams,userRoster:clubs[userClub].roster.map(player=>({...player,fatigue:100})),nationalRanking:{formulaVersion:nationalRankingFormulaVersion,entries:nationalRankingEntries,finalizedSeasons:[...nationalRankingFinalizedSeasons]},season:(savedNewGame.season||2026)+1,createdAt:new Date().toISOString(),version:4};localStorage.setItem('matchday-new-game',JSON.stringify(nextSave));localStorage.removeItem('matchday-season');localStorage.removeItem('matchday-live-match');redirectGame();});
  const advancePostMatchDay=()=>{
    const nextDay=new Date(careerCalendarDate);
    nextDay.setDate(nextDay.getDate()+1);
    nextDay.setHours(12,0,0,0);
    if(nextDay>seasonEndDate())return;
    applyTrainingDay(trainingTypeForDate(nextDay));
    advanceCareerCalendarTo(nextDay);
    advanceCupThroughDate(nextDay);
    selectedCalendarDate=new Date(careerCalendarDate);
    calendarCursor=new Date(careerSeason,careerCalendarDate.getMonth(),1);
  };
  const advanceSeasonRound=({navigateDashboard=true}={})=>{
    if(roundCommitted) return;
    if(liveMatchGame?.competition===KNOCKOUT_COMPETITIONS.COPA){
      commitLiveKnockoutResult();
      advanceCupRound();
      return;
    }
    roundCommitted=true;
    try{
      if(liveMatchGame&&isKnockoutShootoutCompetition(liveMatchGame))commitLiveKnockoutResult();
      const alreadyRecorded=seasonRoundHistory.some(item=>item.round===currentRound);
      if(!alreadyRecorded){
        // Primeiro são cumpridas as ausências que pertenciam à rodada disputada;
        // depois entram em vigor as novas suspensões e lesões deste jogo.
        const roundParticipants=new Set(Object.values(nationalCompetitions).flatMap(competition=>(competition.fixtures[currentRound-1]||[]).flatMap(game=>[game.home,game.away])));
        const restDays=intervalDaysForRoundAdvance();
        serveAvailability(restDays,roundParticipants);
        commitLiveAvailability();
        const completedGames=simulateRoundResults(true);
        completedGames.forEach(recordGameLeaders);if(userDivision!=='D'||currentRound<=10)completedGames.forEach(applyRoundToTable);
        simulateNationalRound();
        seasonRoundHistory.push({round:currentRound,games:completedGames.map(game=>({...game})),userStats:{home:{...stats.home},away:{...stats.away},goals:{home:[...goals.home],away:[...goals.away]}}});
        updateSeriesDKnockout(currentRound);
        Object.values(clubs).forEach(club=>orderRosterForFormation(club.roster,club.formation));
        renderRoster();draw();
        advancePostMatchDay();
      }
      const completedSeason=currentRound===38||(userDivision==='D'&&currentRound===22);if(userDivision==='D'&&currentRound===22)finishRemainingNationalRounds(23);
      if(!alreadyRecorded)currentRound++;
      reconcileCurrentRound();
      const cupReferenceDate=completedSeason?new Date(careerSeason,11,31,12):fixtureDate(clamp(currentRound,1,championshipFixtures.length));
      advanceCupThroughDate(cupReferenceDate);
      if(completedSeason)finalizeNationalRankingSeason();
      persistSeason();
      refreshSeasonPresentation();
      $('#roundResultsModal').classList.add('hidden');modal.classList.add('hidden');
      stopMatchClock();matchStarted=false;matchFinished=false;liveMatchGame=null;liveDayMatchSnapshots=null;roundResults=null;roundResultMessagePushed=false;roundPreviewResults={};
      if(completedSeason)prepareSeasonTransition();
      else if(isUserSeasonIdle())simulateNonHumanSeasonRemainder();
      else if(navigateDashboard)$$('.nav').find(button=>button.dataset.view==='dashboard')?.click();
    }finally{
      roundCommitted=false;
    }
  };
  // Avança uma rodada nacional sem partida ao vivo do usuário (clube idle/eliminado).
  const simulateIdleRound=()=>{
    const alreadyRecorded=seasonRoundHistory.some(item=>item.round===currentRound);
    if(!alreadyRecorded){
      const roundFixtures=nationalCompetitions[userDivision].fixtures[currentRound-1]||[];
      const roundParticipants=new Set(Object.values(nationalCompetitions).flatMap(competition=>(competition.fixtures[currentRound-1]||[]).flatMap(game=>[game.home,game.away])));
      const restDays=clamp(3,2,12),recoveryMod=trainingRecoveryMultiplier('after');
      serveAvailability(restDays,roundParticipants);
      const completedGames=roundFixtures.map(game=>simulateRoundMatch(game.home,game.away));
      completedGames.forEach(recordGameLeaders);
      if(userDivision!=='D'||currentRound<=10)completedGames.forEach(applyRoundToTable);
      simulateNationalRound();
      seasonRoundHistory.push({round:currentRound,games:completedGames.map(game=>({home:game.home,away:game.away,homeGoals:game.homeGoals,awayGoals:game.awayGoals,data:game.data?{...game.data}:null,goals:game.goals?{home:[...(game.goals.home||[])],away:[...(game.goals.away||[])]}:null})),userStats:null});
      updateSeriesDKnockout(currentRound);
      recoverPlayers(Math.max(1,Math.round(restDays*recoveryMod)));
      Object.values(clubs).forEach(club=>orderRosterForFormation(club.roster,club.formation));
      advanceCareerCalendarTo(fixtureDate(currentRound));
    }else updateSeriesDKnockout(currentRound);
    const completedSeasonNow=currentRound===38||(userDivision==='D'&&currentRound===22);
    if(userDivision==='D'&&currentRound===22&&!competitionRoundHistory.A.some(item=>item.round>=23))finishRemainingNationalRounds(23);
    currentRound++;
    reconcileCurrentRound();
    const cupReferenceDate=completedSeasonNow?new Date(careerSeason,11,31,12):fixtureDate(clamp(currentRound,1,Math.max(championshipFixtures.length,currentRound,1)));
    advanceCupThroughDate(cupReferenceDate);
    roundPreviewResults={};
    return completedSeasonNow;
  };
  const setIdleSimStatus=text=>{const el=$('#idleSeasonSimStatus');if(el)el.textContent=text;};
  const simulateNonHumanSeasonRemainder=()=>{
    if(nonHumanSimRunning)return;
    if(seasonComplete()){prepareSeasonTransition();return;}
    if(!isUserSeasonIdle())return;
    nonHumanSimRunning=true;
    const overlay=$('#idleSeasonSimModal');
    overlay?.classList.remove('hidden');
    setIdleSimStatus(`Rodada ${currentRound} de ${seasonMaxRound()}…`);
    $$('.nav').find(button=>button.dataset.view==='dashboard')?.click();
    const maxRound=seasonMaxRound();
    const step=()=>{
      try{
        if(currentRound>maxRound){
          idleSeasonWasSimulated=true;
          finalizeNationalRankingSeason();
          persistSeason();
          refreshSeasonPresentation();
          overlay?.classList.add('hidden');
          nonHumanSimRunning=false;
          prepareSeasonTransition();
          return;
        }
        setIdleSimStatus(`Simulando rodada ${currentRound} de ${maxRound}…`);
        const finished=simulateIdleRound();
        persistSeason();
        if(finished||currentRound>maxRound){
          idleSeasonWasSimulated=true;
          finalizeNationalRankingSeason();
          persistSeason();
          refreshSeasonPresentation();
          overlay?.classList.add('hidden');
          nonHumanSimRunning=false;
          prepareSeasonTransition();
          return;
        }
        // Yield ao browser para atualizar o overlay entre blocos de rodadas.
        setTimeout(step,0);
      }catch(error){
        console.error('Falha ao simular restante da temporada',error);
        overlay?.classList.add('hidden');
        nonHumanSimRunning=false;
        persistSeason();
        refreshSeasonPresentation();
      }
    };
    setTimeout(step,0);
  };
  const renderLiveOpponent = () => {
    if(!stats || $('#liveOpponentModal').classList.contains('hidden')) return;
    const club=matchClub();
    $('#liveOpponentName').textContent=club.name;
    $('#liveOpponentMeta').textContent=`${club.formation} · ${club.style} · Mentalidade ${club.mentality} · Atualizado aos ${minute}'`;
    const headers='<div class="live-opponent-head"><span>JOGADOR</span><span>POS.</span><span>OVR</span><span>CANSAÇO</span></div>';
    const playerRow=(player,index,isStarter)=>{const card=cards.away[index],liveState=card?{yellow:card.yellow?1:0,red:!!card.red,injured:!!card.injured,playThroughRisk:!!card.playThroughRisk}:null;return `<div class="live-opponent-player">${playerNameCell(player.name,player,{prefix:isStarter?(index+1)+'. ':'',liveState})}<span>${player.pos}</span><span>${player.overall}</span>${fatigueCell(player)}</div>`;};
    $('#liveOpponentRoster').innerHTML=`<h3>TITULARES</h3>${headers}${club.roster.slice(0,11).map((player,index)=>playerRow(player,index,true)).join('')}<div class="live-opponent-bench"><h3>RESERVAS</h3>${headers}${club.roster.slice(11).map((player,index)=>playerRow(player,index+11,false)).join('')}</div>`;
    const coords=formations[club.formation]||formations['4-3-3'];
    ensureBoardLegend($('#liveOpponentPitch')?.closest('.tactical-board'));
    $('#liveOpponentPitch').innerHTML=coords.map((point,index)=>{const card=cards.away[index]||{yellow:0,red:false,injured:false},player=club.roster[index],vacant=card.red||!player,top=point[1]===91?88:point[1],energy=clamp(player?.fatigue??0,0,100),injured=!!card.injured,label=vacant?'EXPULSO':boardPlayerLabel(player?.name||'—');return `<div class="board-player ${vacant?'vacant':''}" title="${vacant?'Expulso':`${player.name}${card.yellow?' · Advertido':''}${injured?' · Lesionado':''}`}" style="left:${point[0]}%;top:${top}%"><i style="--energy:${energy}%"><span>${vacant?'×':index+1}</span></i>${boardPlayerBadges({yellow:card.yellow,injured})}<small>${label}</small></div>`;}).join('');
  };
  const tryLiveEventInjury=(side,playerName,eventContext)=>{
    const lineup=side==='home'?starters():matchClub().roster.slice(0,11);
    const index=lineup.findIndex(player=>player.name===playerName);
    if(index<0)return false;
    const player=lineup[index];
    if(cards[side][index]?.red||cards[side][index]?.injured||injuryInAcutePhase(player.injury))return false;
    if(cards[side][index]?.playThroughRisk)return escalateLivePlayThroughInjury(side,index,player);
    if(liveDeferredInjuries[side].some(entry=>entry.name===player.name))return false;
    const club=side==='home'?clubs[userClub]:matchClub();
    const incident=resolvePhysicalIncident(player,{...eventContext,minute,fatigue:player.fatigue,minutesPlayed:liveMinutesPlayed[side].get(player.name)??0,club,pitchCondition:club.pitchCondition,tactic:tacticFor(side),occurredDuring:'match'});
    if(!incident)return false;
    const liveText=incident.comment.replace(/^\d+'\s*/,'');
    if(incident.tier==='discomfort'){player.fatigue=clamp(player.fatigue-2,0,100);log(liveText,'discomfort');renderRoster();return false;}
    if(incident.tier==='playThrough')return handleLivePlayThroughIncident(side,index,player,club,incident,liveText,eventContext);
    const injury=assignPlayerInjury(player,incident.injury,currentRound,{club,liveContext:side==='home'?{side,index}:null});
    if(!injury){stopMatchClock();$('#matchStatus').textContent='Departamento médico aguarda decisão sobre o tratamento.';return true;}
    const needsPostMatchTreatment=postMatchMedicalQueue.some(item=>item.player===player);
    cards[side][index].injured=true;liveInjuries[side].push({name:player.name,injury:{...injury}});
    log(liveText,'injury');
    if(needsPostMatchTreatment){
      log(`${player.name} será reavaliado após o apito final. Defina cirurgia ou tratamento conservador no pós-jogo.`,'injury');
      if(side==='home')$('#matchStatus').textContent='Lesão em campo — avaliação completa e tratamento ficam para o pós-jogo.';
    }
    if(side==='home'){
      $('#matchStatus').textContent='Partida pausada: jogador lesionado. Faça a substituição ou reorganize a equipe.';
      openPreparation('LESÃO');
    }else{
      const bench=club.roster.slice(11).filter(candidate=>!playerUnavailable(candidate)&&!liveInjuries.away.some(item=>item.name===candidate.name));
      if(bench.length&&liveInjuries.away.length<=5){const expected=player.pos,compatible=bench.filter(candidate=>candidate.pos===expected||(compatibleRoles[expected]||[]).includes(candidate.pos)),incoming=[...(compatible.length?compatible:bench)].sort((a,b)=>b.overall-a.overall)[0],incomingIndex=club.roster.indexOf(incoming);[club.roster[index],club.roster[incomingIndex]]=[incoming,player];cards.away[index]={yellow:0,red:false,dismissal:null,injured:false,playThroughRisk:false};liveMinutesPlayed.away.set(incoming.name,liveMinutesPlayed.away.get(incoming.name)??0);log(`${club.name} substitui o lesionado ${player.name} por ${incoming.name}.`,'injury-substitution');}
    }
    renderRoster();drawBoard();renderSubstitutionControls();renderStats();return true;
  };
  const escalateLivePlayThroughInjury=(side,index,player)=>{
    const entry=liveDeferredInjuries[side].find(item=>item.name===player.name);
    if(!entry||entry.preemptiveSubstitution||entry.aggravated)return false;
    entry.aggravated=true;
    const grade=Math.min(3,(entry.injury.grade||1)+1);
    entry.injury={...entry.injury,grade,severity:injurySeverityLabel(grade),matchStatus:'confirmed',substitutionRequired:true,diagnosisPending:false,playedThrough:true};
    cards[side][index].playThroughRisk=false;
    const injury=assignPlayerInjury(player,entry.injury,currentRound,{club,liveContext:side==='home'?{side,index}:null});
    if(!injury){stopMatchClock();$('#matchStatus').textContent='Departamento médico aguarda decisão sobre o tratamento.';return true;}
    const needsPostMatchTreatment=postMatchMedicalQueue.some(item=>item.player===player);
    cards[side][index].injured=true;liveInjuries[side].push({name:player.name,injury:{...injury}});
    liveDeferredInjuries[side]=liveDeferredInjuries[side].filter(item=>item.name!==player.name);
    log(`${player.name} teve o quadro agravado após insistir em campo.`,'injury');
    if(needsPostMatchTreatment){
      log(`${player.name} precisa de definição de tratamento após o apito final.`,'injury');
      if(side==='home')$('#matchStatus').textContent='Lesão agravada — tratamento será definido no pós-jogo.';
    }
    const club=side==='home'?clubs[userClub]:matchClub();
    if(side==='home'){
      $('#matchStatus').textContent='Partida pausada: jogador lesionado. Faça a substituição ou reorganize a equipe.';
      openPreparation('LESÃO');
    }else{
      const bench=club.roster.slice(11).filter(candidate=>!playerUnavailable(candidate)&&!liveInjuries.away.some(item=>item.name===candidate.name));
      if(bench.length&&liveInjuries.away.length<=5){const expected=player.pos,compatible=bench.filter(candidate=>candidate.pos===expected||(compatibleRoles[expected]||[]).includes(candidate.pos)),incoming=[...(compatible.length?compatible:bench)].sort((a,b)=>b.overall-a.overall)[0],incomingIndex=club.roster.indexOf(incoming);[club.roster[index],club.roster[incomingIndex]]=[incoming,player];cards.away[index]={yellow:0,red:false,dismissal:null,injured:false,playThroughRisk:false};liveMinutesPlayed.away.set(incoming.name,liveMinutesPlayed.away.get(incoming.name)??0);log(`${club.name} substitui ${player.name} após agravamento por ${incoming.name}.`,'injury-substitution');}
    }
    renderRoster();drawBoard();renderSubstitutionControls();renderStats();return true;
  };
  const handleLivePlayThroughIncident=(side,index,player,club,incident,liveText,eventContext={})=>{
    const entry=buildDeferredInjuryEntry(player,incident.injury,{...eventContext,minute,fatigue:player.fatigue},minute);
    liveDeferredInjuries[side].push(entry);
    cards[side][index].playThroughRisk=true;
    log(liveText,'discomfort');
    if(side==='home'){
      $('#matchStatus').textContent='Alerta médico: jogador com incômodo. Substitua-o para evitar agravamento ou retome mantendo-o em campo.';
      openPreparation('ALERTA MÉDICO');
      renderRoster();drawBoard();renderSubstitutionControls();
      return true;
    }
    if(Math.random()<calculatePlayThroughSubChance(player,incident.injury,entry.context)){
      const bench=club.roster.slice(11).filter(candidate=>!playerUnavailable(candidate)&&!liveInjuries.away.some(item=>item.name===candidate.name)&&!liveDeferredInjuries.away.some(item=>item.name===candidate.name));
      if(bench.length){
        const expected=player.pos,compatible=bench.filter(candidate=>candidate.pos===expected||(compatibleRoles[expected]||[]).includes(candidate.pos)),incoming=[...(compatible.length?compatible:bench)].sort((a,b)=>b.overall-a.overall)[0],incomingIndex=club.roster.indexOf(incoming);
        [club.roster[index],club.roster[incomingIndex]]=[incoming,player];
        entry.preemptiveSubstitution=true;entry.keptPlaying=false;cards.away[index].playThroughRisk=false;
        cards.away[index]={yellow:0,red:false,dismissal:null,injured:false,playThroughRisk:false};
        liveMinutesPlayed.away.set(incoming.name,liveMinutesPlayed.away.get(incoming.name)??0);
        log(`${club.name} substitui ${player.name} por precaução após incômodo (${incoming.name}).`,'injury-substitution');
        renderRoster();drawBoard();renderStats();
      }
    }
    return false;
  };
  const checkMinuteAggravation=(side,index,player)=>{
    const entry=liveDeferredInjuries[side]?.find(item=>item.name===player.name);
    if(!entry||entry.preemptiveSubstitution||entry.aggravated||!cards[side][index]?.playThroughRisk)return;
    const minutesAfter=minute-(entry.minuteAtIncident??minute),energy=player.fatigue;
    const chance=clamp(.0014+minutesAfter*.002+(energy<40?.015:0)+(energy<25?.02:0),.0008,.09);
    if(Math.random()<chance)escalateLivePlayThroughInjury(side,index,player);
  };
  const enforceLiveRehabLimit=(side,index,player)=>{
    const max=playerRehabMaxMinutes(player);
    if(!max||cards[side][index]?.red||cards[side][index]?.injured)return;
    const mins=liveMinutesPlayed[side].get(player.name)??0;
    if(mins<max||cards[side][index]?.minuteLimitWarned)return;
    cards[side][index].minuteLimitWarned=true;
    const club=side==='home'?clubs[userClub]:matchClub();
    log(`${player.name} atinge o limite médico de ${max} minutos.`,'injury-substitution');
    if(side==='home'){
      $('#matchStatus').textContent=`Limite médico: ${player.name} atingiu ${max} minutos. Substitua-o para evitar recaída.`;
      openPreparation('LIMITE MÉDICO');
      return;
    }
    const bench=club.roster.slice(11).filter(candidate=>!playerUnavailable(candidate)&&!liveInjuries.away.some(item=>item.name===candidate.name)&&!liveDeferredInjuries.away.some(item=>item.name===candidate.name));
    if(!bench.length||substitutions>=5)return;
    const expected=player.pos,compatible=bench.filter(candidate=>candidate.pos===expected||(compatibleRoles[expected]||[]).includes(candidate.pos)),incoming=[...(compatible.length?compatible:bench)].sort((a,b)=>b.overall-a.overall)[0],incomingIndex=club.roster.indexOf(incoming);
    [club.roster[index],club.roster[incomingIndex]]=[incoming,player];
    cards.away[index]={yellow:0,red:false,dismissal:null,injured:false,playThroughRisk:false,minuteLimitWarned:false};
    liveMinutesPlayed.away.set(incoming.name,liveMinutesPlayed.away.get(incoming.name)??0);
    substitutions++;
    log(`${club.name} substitui ${player.name} ao atingir limite médico por ${incoming.name}.`,'injury-substitution');
    renderRoster();drawBoard();renderSubstitutionControls();renderStats();
  };
  const applyWear = () => { [[starters(),clubs[userClub]],[matchClub().roster.slice(0,11),matchClub()]].forEach(([lineup,club],sideIndex)=>{const side=sideIndex===0?'home':'away',wear=clubInstitutionalContext(club,nextUserGame?.home===club.name).wear;lineup.forEach((player,index)=>{player.fatigue=clamp(player.fatigue-(.12+(player.age>=33?.1:player.age>=30?.07:player.age>=27?.035:0))*wear,0,100);if(cards?.[side]?.[index]&&!cards[side][index].red){liveMinutesPlayed[side].set(player.name,(liveMinutesPlayed[side].get(player.name)??0)+1);if(cards[side][index]?.playThroughRisk)checkMinuteAggravation(side,index,player);enforceLiveRehabLimit(side,index,player);}});}); renderRoster(); };
  // Um erro de dados não pode continuar avançando apenas o relógio e encerrar
  // uma partida sem eventos. Além de interromper o ciclo, a interface informa o
  // problema em vez de produzir silenciosamente um 0 x 0 com estatísticas zeradas.
  const tick = () => {
    try { applyWear(); advance(); }
    catch (error) {
      stopMatchClock();
      console.error('Falha no ciclo da simulação ao vivo:', error);
      $('#matchStatus').textContent='A simulação foi pausada para preservar a partida.';
      log('O motor encontrou uma inconsistência e interrompeu o relógio. Reabra a partida para continuar.','engine-warning');
    }
  };
  const foul = (side,otherSide,details={}) => {
    const s=stats[side], defending=side==='home'?profile():opponentForMatch();
    const attacking=otherSide==='home'?profile():opponentForMatch();
    const fouler=details.foulerName || playerFor(side,'foul');
    const attacker=details.attackerName || playerFor(otherSide,'shot');
    const foulerData=actorData(side,fouler), attackerData=actorData(otherSide,attacker);
    const tactical=tacticalDiscipline(side);
    const duel=clamp((attackerData.dribble*.42+attackerData.speed*.24+attackerData.finishing*.18+attacking.attack*.16 - (foulerData.marking*.45+foulerData.tackling*.43+defending.defense*.12))/125,-.35,.42);
    const threat=clamp(.32+(details.phase==='final'?.24:0)+(attackerData.speed+attackerData.dribble-foulerData.speed)/230+(attacking.attack-defending.defense)/190,.16,.93);
    const type=threat>.68 && Math.random()<.62 ? 'falta para matar contra-ataque' : threat>.52 ? 'falta defensiva' : 'falta ofensiva';
    const zone=threat>.78 ? 'na faixa final do campo' : threat>.57 ? 'na entrada da área' : threat>.38 ? 'na intermediária' : 'no corredor lateral';
    s.fouls++;
    const lineup=side==='home'?starters():matchClub().roster.slice(0,11);
    const index=lineup.findIndex(player=>player.name===fouler);
    const state=cards[side][index];
    if(!state)return false;
    // Cartões permanecem seletivos: a frequência vem da gravidade do duelo,
    // do local da falta e do contexto tático, não somente do aumento de faltas.
    const yellowChance=clamp(engineTuning.bookingBase+tactical*.34+Math.max(0,duel)*.20+(type.includes('contra')?.15:type==='falta defensiva'?.065:.018)+(zone.includes('final')?.065:zone.includes('área')?.04:0),.035,.36);
    // Depois de advertido, o atleta tende a se conter. O segundo amarelo só
    // volta a ser provável em uma falta grave/interrompendo contra-ataque.
    const severeSecondYellow=type.includes('contra') && (zone.includes('final') || threat>.82);
    const bookingChance=state.yellow ? yellowChance*(severeSecondYellow?.52:.16) : yellowChance;
    // Nem toda falta frontal vira chute direto: a maioria é cruzada ou
    // trabalhada. As elegíveis mantêm boa conversão para especialistas.
    const directFreeKick=zone==='na entrada da área' && type!=='falta ofensiva' && Math.random()<.12;
    let message=`${type[0].toUpperCase()+type.slice(1)} de ${fouler} em ${attacker}, ${zone}.`;
    if(Math.random()>=bookingChance || totalCards()>=5){
      log(message,'foul');
      if(directFreeKick) takeFreeKick(otherSide,attacking,defending);
    }else{
    // Vermelho direto só em falta muito grave; dois amarelos sempre geram expulsão.
    const directRed=threat>.90 && type.includes('contra') && Math.random()<.012;
    if(!directRed){ state.yellow++; s.yellow++; }
    if(directRed || state.yellow>=2){
      state.red=true;state.dismissal=directRed?'direct':'secondYellow'; s.red++;
      disciplineEvents++;
      message+=directRed ? ' Cartão vermelho direto.' : ' Segundo amarelo: cartão vermelho.';
      log(message,'red');
      matchDiscipline[side].set(fouler,{name:fouler,yellow:state.dismissal?0:state.yellow,dismissal:state.dismissal||null});
      const attackerPlayer=actorData(otherSide,attacker),foulerPlayer=actorData(side,fouler);
      const foulVictim=pickInjuryVictim({eventPhase:details.phase||'duel',contact:true,intensity:clamp(threat,.45,.9),phase:details.phase,zone:details.phase==='final'?'entrada da área':undefined},attackerPlayer,foulerPlayer);
      if(side==='home'){
        drawBoard();
        openPreparation('CARTÃO VERMELHO');
        return tryLiveEventInjury(foulVictim===attackerPlayer?otherSide:side,foulVictim.name,{eventPhase:details.phase||'duel',contact:true,intensity:clamp(threat,.45,.9),phase:details.phase,zone:details.phase==='final'?'entrada da área':undefined})||true;
      }
      renderStats();
      return tryLiveEventInjury(foulVictim===attackerPlayer?otherSide:side,foulVictim.name,{eventPhase:details.phase||'duel',contact:true,intensity:clamp(threat,.45,.9),phase:details.phase,zone:details.phase==='final'?'entrada da área':undefined});
    } else {
      disciplineEvents++;
      message+=' Cartão amarelo.'; log(message,'yellow');
      if(side==='home') drawBoard();
      if(directFreeKick) takeFreeKick(otherSide,attacking,defending);
    }
    }
    matchDiscipline[side].set(fouler,{name:fouler,yellow:state.dismissal?0:state.yellow,dismissal:state.dismissal||null});
    const attackerPlayer=actorData(otherSide,attacker),foulerPlayer=actorData(side,fouler);
    const foulVictim=pickInjuryVictim({eventPhase:details.phase||'duel',contact:true,intensity:clamp(threat,.45,.9),phase:details.phase,zone:details.phase==='final'?'entrada da área':undefined},attackerPlayer,foulerPlayer);
    return tryLiveEventInjury(foulVictim===attackerPlayer?otherSide:side,foulVictim.name,{eventPhase:details.phase||'duel',contact:true,intensity:clamp(threat,.45,.9),phase:details.phase,zone:details.phase==='final'?'entrada da área':undefined});
  };
  ({ addPasses, shot, takeFreeKick, penaltyTaker, buildAttack } = createLiveMatchActions({
    clamp,
    rnd,
    random: Math.random,
    getStats: () => stats,
    getMinute: () => minute,
    getGoals: () => goals,
    getUserClub: () => userClub,
    getMatchClub: () => matchClub(),
    getStarters: () => starters(),
    getCards: () => cards,
    incrementScore: side => { if (side === 'home') home++; else away++; },
    updateScoreboard: () => score(),
    log,
    playerFor,
    actorData,
    influencePossession,
    engineTuning,
    engineBlowoutDamp,
    engineFoulRisk,
    engineProgressiveFoulRisk,
    tacticFor,
    tryLiveEventInjury,
    foul,
    pickInjuryVictim,
  }));
  const openPreparation = title => {
    stopMatchClock();
    activePreparationTitle=title;
    $('#pauseTitle').textContent=title;
    $('#pauseHeading').textContent=preMatchPreparation?'Preparação da Partida':'Ajuste do Time';
    $('.pause-heading small').textContent=preMatchPreparation?'Organize a formação, a tática e a escalação antes do apito inicial.':title==='CARTÃO VERMELHO'?'Arraste um jogador para a vaga destacada ou troque posições; a nova organização será aplicada ao motor.':title==='LESÃO'?'O atleta lesionado não participa mais das ações. Substitua-o ou reorganize o time antes de retomar.':title==='ALERTA MÉDICO'?'O atleta apresenta incômodo físico. Substitua-o para evitar agravamento ou mantenha-o em campo assumindo o risco.':'Altere a formação, a tática e os jogadores antes de retomar.';
    $('#resumeMatch').textContent=preMatchPreparation?'INICIAR PARTIDA →':'RETOMAR PARTIDA →';
    $('#stats').before($('#pausePanel'));
    $('#matchActions').classList.add('hidden');
    $('#stats').classList.toggle('hidden',preMatchPreparation);
    $('#pausePanel').classList.remove('hidden');
    syncTactics(); drawBoard(); renderSubstitutionControls();
    if(!preMatchPreparation) renderStats();
    updateLiveMatchClock();
  };
  const shootoutGoalsCount=club=>(shootoutState?.results?.[club]||[]).filter(Boolean).length;
  const shootoutAttemptsCount=club=>(shootoutState?.results?.[club]||[]).length;
  const currentShootoutClub=()=>shootoutState?.clubs?.[(shootoutState.firstKicker+shootoutState.kickIndex)%2];
  const shootoutLineup=clubName=>{
    if(clubName===userClub)return activeStarters();
    const opponent=matchClub().name;
    if(clubName===opponent)return matchClub().roster.slice(0,11);
    return clubs[clubName]?.roster?.slice(0,11)||[];
  };
  const shootoutCardsFor=clubName=>{
    if(clubName===userClub)return cards.home;
    if(clubName===matchClub().name)return cards.away;
    return [];
  };
  const cupLiveMatchNeedsShootout=()=>liveKnockoutNeedsShootout();
  const liveKnockoutNeedsShootout=()=>{
    if(!liveMatchGame||!isKnockoutShootoutCompetition(liveMatchGame)||home!==away)return false;
    const games=getKnockoutTieGames(liveMatchGame);
    if(!games.length)return false;
    const liveStats=buildLiveKnockoutStats();
    return projectedKnockoutNeedsShootout(games,liveMatchGame,liveStats,{
      allLegsRequired:(liveGame,projected)=>projected.some(game=>!game.completed&&game!==liveGame),
    });
  };
  const renderShootoutTrack=()=>{
    if(!shootoutState)return;
    const [c0,c1]=shootoutState.clubs,mark=kicks=>(kicks||[]).map(hit=>`<i class="${hit?'hit':'miss'}">${hit?'✓':'✗'}</i>`).join('')||'<i class="pending">·</i>';
    $('#shootoutTitle').textContent=`${c0} ${shootoutGoalsCount(c0)} — ${shootoutGoalsCount(c1)} ${c1}`;
    $('#shootoutTrack').innerHTML=`<article><b>${c0.toUpperCase()}</b><div class="shootout-kicks">${mark(shootoutState.results[c0])}</div></article><article><b>${c1.toUpperCase()}</b><div class="shootout-kicks">${mark(shootoutState.results[c1])}</div></article>`;
    $('#shootoutHint').textContent=shootoutState.suddenDeath?'Morte súbita: cada cobrança pode decidir o confronto.':'Disputa alternada — escolha um cobrador diferente a cada vez.';
  };
  const logShootout=(text,type='')=>{const kickNo=Math.max(1,Math.ceil((shootoutState?.kickIndex||0)/2));timeline.insertAdjacentHTML('beforeend',`<p class="${type}">PÊN ${kickNo} · ${text}</p>`);timeline.scrollTop=timeline.scrollHeight;};
  const evaluateShootoutWinner=()=>{
    const [c0,c1]=shootoutState.clubs,g0=shootoutGoalsCount(c0),g1=shootoutGoalsCount(c1),a0=shootoutAttemptsCount(c0),a1=shootoutAttemptsCount(c1);
    if(a0<=5&&a1<=5){
      const rem0=5-a0,rem1=5-a1;
      if(g0>g1+rem1)return c0;
      if(g1>g0+rem0)return c1;
      if(a0===5&&a1===5){
        if(g0!==g1)return g0>g1?c0:c1;
        shootoutState.suddenDeath=true;
      }
      return null;
    }
    if(shootoutState.suddenDeath&&a0===a1&&a0>5&&g0!==g1)return g0>g1?c0:c1;
    return null;
  };
  const pickShootoutCpuTaker=clubName=>{
    const used=new Set(shootoutState.usedNames[clubName]||[]),lineup=shootoutLineup(clubName),cardState=shootoutCardsFor(clubName);
    const eligible=lineup.map((player,index)=>({player,index})).filter(({player,index})=>player.pos!=='GOL'&&!cardState[index]?.red&&!used.has(player.name)).map(({player})=>player).sort((a,b)=>b.penaltyTaking-a.penaltyTaking);
    return eligible[Math.random()<.82?0:Math.min(1,eligible.length-1)]||eligible[0];
  };
  const executeShootoutKick=(kickingClub,taker)=>{
    if(!shootoutState||!taker)return;
    const isUser=kickingClub===userClub,side=isUser?'home':'away',current=isUser?profile():opponentForMatch(),other=isUser?opponentForMatch():profile();
    shootoutState.usedNames[kickingClub]=shootoutState.usedNames[kickingClub]||[];
    shootoutState.usedNames[kickingClub].push(taker.name);
    const scored=shot(side,{...current,attack:current.attack+9},other,{penalty:true,shootout:true,taker:taker.name,penaltySkill:taker.penaltyTaking,logFn:logShootout})||false;
    shootoutState.results[kickingClub]=shootoutState.results[kickingClub]||[];
    shootoutState.results[kickingClub].push(scored);
    shootoutState.kickIndex++;
    renderShootoutTrack();
    $('#penaltyChoice').classList.add('hidden');
    const winner=evaluateShootoutWinner();
    if(winner)return completePenaltyShootout(winner);
    scheduleNextShootoutKick();
  };
  const startShootoutTakerChoice=kickingClub=>{
    stopMatchClock();pendingPenalty={mode:'shootout',kickingClub};$('#matchActions').classList.add('hidden');
    const section=$('#penaltyChoice'),keeperClub=shootoutState.clubs.find(name=>name!==kickingClub),keeperLineup=shootoutLineup(keeperClub),keeper=keeperLineup.find(player=>player.pos==='GOL')||keeperLineup[0];
    $('#matchModal .score').after(section);
    let heading=section.querySelector('.penalty-choice-heading');
    if(!heading){heading=document.createElement('div');heading.className='penalty-choice-heading';section.prepend(heading);}
    const kickNo=shootoutAttemptsCount(kickingClub)+1;
    heading.innerHTML=`<div><label>SHOOTOUT · ${kickingClub.toUpperCase()}</label><strong>Cobrança ${kickNo} — escolha o batedor</strong></div><span class="penalty-goalkeeper"><small>GOLEIRO ADVERSÁRIO</small><b>${keeper.name}</b><em>DEF. PÊNALTI ${keeper.penaltySaving}</em></span>`;
    const used=new Set(shootoutState.usedNames[kickingClub]||[]),cardState=shootoutCardsFor(kickingClub);
    const takers=shootoutLineup(kickingClub).map((player,index)=>({player,index})).filter(({player,index})=>player.pos!=='GOL'&&!cardState[index]?.red&&!used.has(player.name)).map(({player})=>player).sort((a,b)=>b.penaltyTaking-a.penaltyTaking||b.overall-a.overall).slice(0,5);
    const chanceFor=player=>Math.round(clamp(.69+(player.penaltyTaking-keeper.penaltySaving)/95+(player.penaltyTaking-70)/260+(player.penaltyTaking>85?.035:0),.56,.94)*100);
    $('#penaltyTakers').innerHTML=takers.length?takers.map((player,index)=>`<button class="${index===0?'best-option':''}" data-taker="${player.name}"><span class="penalty-taker-title"><b>${player.name} · ${player.pos}</b>${index===0?'<i class="penalty-best-badge">MELHOR OPÇÃO</i>':player.penaltyTaking>85?'<i class="penalty-specialist">ESPECIALISTA</i>':''}</span><span class="penalty-metric"><small>COB. PÊNALTI</small><strong>${player.penaltyTaking}</strong></span><span class="penalty-metric"><small>OVERALL</small><strong>${player.overall}</strong></span><span class="penalty-metric chance"><small>CHANCE ESTIMADA</small><strong>${chanceFor(player)}%</strong></span></button>`).join(''):'<p class="shootout-empty">Sem cobradores disponíveis.</p>';
    section.classList.remove('hidden');
    $('#matchStatus').textContent=`Shootout: ${kickingClub} define o cobrador da ${kickNo}ª cobrança.`;
  };
  const scheduleNextShootoutKick=()=>{
    if(!shootoutState)return;
    const club=currentShootoutClub();
    if(club===userClub)startShootoutTakerChoice(club);
    else{
      $('#matchStatus').textContent=`${club} prepara a cobrança…`;
      setTimeout(()=>{const taker=pickShootoutCpuTaker(club);if(taker)executeShootoutKick(club,taker);},Math.max(900,gamePaceConfig[gamePace].ms*2));
    }
  };
  const completePenaltyShootout=winner=>{
    if(!shootoutState||!liveMatchGame)return;
    const penFor=club=>shootoutGoalsCount(club);
    liveMatchGame.shootoutWinner=winner;
    liveMatchGame.shootoutPenalties=`${penFor(liveMatchGame.home)}–${penFor(liveMatchGame.away)}`;
    liveMatchGame.penalties=liveMatchGame.shootoutPenalties;
    log('Disputa de pênaltis encerrada.','penalty');
    renderShootoutTrack();
    $('#matchStatus').textContent=`Shootout: ${winner} venceu ${liveMatchGame.shootoutPenalties}.`;
    $('#penaltyChoice').classList.add('hidden');
    shootoutState=null;
    matchFinished=true;
    simulateRoundResults();
    renderFinalSummary();
    showFinalActions();
  };
  const startPenaltyShootout=()=>{
    const games=getKnockoutTieGames(liveMatchGame),clubs=[games[0]?.home,games[0]?.away].filter(Boolean);
    if(clubs.length<2)return;
    shootoutState={clubs,firstKicker:1,kickIndex:0,results:{[clubs[0]]:[],[clubs[1]]:[]},usedNames:{[clubs[0]]:[],[clubs[1]]:[]},suddenDeath:false,competition:liveMatchGame?.competition};
    log(`Empate no tempo regulamentar. Disputa de pênaltis — ${knockoutCompetitionLabel(liveMatchGame)}!`, 'penalty');
    $('#matchStatus').textContent='Disputa de pênaltis — escolha os cobradores quando for sua vez.';
    $('#matchActions').classList.add('hidden');
    const panel=$('#shootoutPanel');
    $('#matchModal .score').after(panel);
    panel.classList.remove('hidden');
    renderShootoutTrack();
    scheduleNextShootoutKick();
  };
  const startPenaltyChoice = (current, other) => {
    pendingPenalty={current,other};stopMatchClock();$('#matchActions').classList.add('hidden');
    const section=$('#penaltyChoice'),keeper=matchClub().roster.slice(0,11).find((player,index)=>player.pos==='GOL'&&!cards.away[index]?.red)||matchClub().roster[0];
    // A decisão fica no topo da partida, imediatamente abaixo do placar.
    $('#matchModal .score').after(section);
    let heading=section.querySelector('.penalty-choice-heading');
    if(!heading){heading=document.createElement('div');heading.className='penalty-choice-heading';section.prepend(heading);}
    heading.innerHTML=`<div><label>PÊNALTI PARA O ${userClub.toUpperCase()}</label><strong>Escolha o cobrador</strong></div><span class="penalty-goalkeeper"><small>GOLEIRO ADVERSÁRIO</small><b>${keeper.name}</b><em>DEF. PÊNALTI ${keeper.penaltySaving}</em></span>`;
    const takers=activeStarters().filter(player=>player.pos!=='GOL').sort((a,b)=>b.penaltyTaking-a.penaltyTaking||b.overall-a.overall).slice(0,3);
    const chanceFor=player=>Math.round(clamp(.69+(player.penaltyTaking-keeper.penaltySaving)/95+(player.penaltyTaking-70)/260+(player.penaltyTaking>85?.035:0),.56,.94)*100);
    $('#penaltyTakers').innerHTML=takers.map((player,index)=>`<button class="${index===0?'best-option':''}" data-taker="${player.name}"><span class="penalty-taker-title"><b>${player.name} · ${player.pos}</b>${index===0?'<i class="penalty-best-badge">MELHOR BATEDOR</i>':player.penaltyTaking>85?'<i class="penalty-specialist">ESPECIALISTA</i>':''}</span><span class="penalty-metric"><small>COB. PÊNALTI</small><strong>${player.penaltyTaking}</strong></span><span class="penalty-metric"><small>OVERALL</small><strong>${player.overall}</strong></span><span class="penalty-metric"><small>CONDIÇÃO</small><strong>${Math.round(player.fatigue)}%</strong></span><span class="penalty-metric chance"><small>CHANCE ESTIMADA</small><strong>${chanceFor(player)}%</strong></span>${index===0?'<small class="penalty-choice-note">Melhor combinação entre cobrança, qualidade e condição física.</small>':''}</button>`).join('');
    section.classList.remove('hidden');$('#matchStatus').textContent='Pênalti: escolha o cobrador destacado ou compare as opções.';
  };
  const advance = () => {
    const firstHalf = minute < 45;
    // Mais posses relevantes por partida: aumenta disputas, faltas e volume
    // ofensivo sem converter artificialmente uma finalização em interrupção.
    const elapsed = Math.floor(rnd(1,3));
    minute += elapsed;
    liveClockSeconds=0;
    updateLiveMatchClock();
    if (minute >= 90) {
      minute=90;
      if (cupLiveMatchNeedsShootout()) {
        stopMatchClock();
        log('Fim de jogo no tempo regulamentar.', '');
        $('#matchStatus').textContent='Empate — a disputa seguirá nos pênaltis.';
        startPenaltyShootout();
        return;
      }
      matchFinished=true; log('Fim de jogo.'); $('#matchStatus').textContent='Partida encerrada.'; stopMatchClock(); updateLiveMatchClock(); simulateRoundResults(); renderFinalSummary(); showFinalActions(); return;
    }
    if (firstHalf && minute >= 45 && !halftimeShown) { minute=45; halftimeShown=true; log('Intervalo de jogo.'); $('#matchStatus').textContent='Intervalo: faça os ajustes que considerar necessários.'; openPreparation('INTERVALO'); return; }
    const homeBase = profile(), awayBase = opponentForMatch();
    const homeLive=liveOverall('home',homeBase), awayLive=liveOverall('away',awayBase);
    // A média efetiva ajusta as ações em escala moderada: favorece o melhor
    // momento, mas atributos individuais e aleatoriedade continuam decisivos.
    const homeProfile={...homeBase,overall:homeLive,attack:homeBase.attack+(homeLive-homeBase.overall)*.22,passing:homeBase.passing+(homeLive-homeBase.overall)*.18,defense:homeBase.defense+(homeLive-homeBase.overall)*.18-cautionPenalty('home')};
    const awayProfile={...awayBase,overall:awayLive,attack:awayBase.attack+(awayLive-awayBase.overall)*.22,passing:awayBase.passing+(awayLive-awayBase.overall)*.18,defense:awayBase.defense+(awayLive-awayBase.overall)*.18-cautionPenalty('away')};
    // A posse nasce da força e das escolhas táticas; o momento criado pelos lances move a posse a cada atualização.
    const overallGap=homeLive-awayLive;
    const openingPressure=minute<=15 && Math.abs(overallGap)>5 ? clamp((Math.abs(overallGap)-5)*.65+2,2,7) : 0;
    const homeOpeningBias=overallGap>5 ? openingPressure : overallGap<-5 ? -openingPressure : 0;
    stats.home.momentum=clamp(stats.home.momentum*.88,-12,12);
    stats.away.momentum=clamp(stats.away.momentum*.88,-12,12);
    const homeTactic=tacticFor('home'),awayTactic=tacticFor('away');
    const passRate=team=>stats[team].passes?stats[team].accurate/stats[team].passes:.72;
    const passControl=clamp((passRate('home')-passRate('away'))*9,-2.4,2.4);
    const attackControl=clamp((stats.home.goodAttacks-stats.away.goodAttacks)*.075+(stats.home.attacks-stats.away.attacks)*.025,-1.7,1.7);
    const redControl=((cards.away?.filter(card=>card.red).length||0)-(cards.home?.filter(card=>card.red).length||0))*2.8;
    const structuralControl=(homeProfile.passing-awayProfile.passing)*.32+(homeProfile.overall-awayProfile.overall)*.14+(homeTactic.possession-awayTactic.possession)*.055+(stats.home.momentum-stats.away.momentum)*.16+passControl+attackControl+redControl+homeOpeningBias*.25+2.5;
    const hasRed=cards.home?.some(card=>card.red)||cards.away?.some(card=>card.red);
    const targetPossession=clamp(50+structuralControl,hasRed?29:32,hasRed?71:68);
    stats.home.possession=stats.home.possession*.74+targetPossession*.26;
    const side = Math.random()*100 < stats.home.possession ? 'home' : 'away';
    const otherSide = side === 'home' ? 'away' : 'home';
    const current = side === 'home' ? homeProfile : awayProfile;
    const other = side === 'home' ? awayProfile : homeProfile;
    const homeShare=stats.home.possession/100;
    // As estatísticas são produzidas antes da jogada e passam a influenciar o
    // ataque escolhido: melhor circulação aumenta a criação; desarmes e momento
    // defensivo reduzem as chegadas seguintes.
    const homePassQuality=addPasses('home',homeProfile,awayProfile,elapsed,homeShare);
    const awayPassQuality=addPasses('away',awayProfile,homeProfile,elapsed,1-homeShare);
    const passQuality=side==='home' ? homePassQuality : awayPassQuality;
    if(Math.random()<.012 && stats[side].penalties<1){
      stats[side].penalties++; influencePossession(side,2.5); log(`Pênalti para ${side==='home'?userClub:matchClub().name}!`,'penalty');
      if(side==='home'){startPenaltyChoice(current,other);return;}
      const taker=penaltyTaker(side); shot(side,{...current,attack:current.attack+35},other,{penalty:true,taker:taker.name,penaltySkill:taker.penaltyTaking}); renderStats(); return;
    }
    const openingBoost=minute<=15 && Math.abs(overallGap)>5 && ((overallGap>5&&side==='home')||(overallGap<-5&&side==='away')) ? clamp(.08+(Math.abs(overallGap)-5)*.022,.08,.22) : 0;
    buildAttack(side,current,other,passQuality,openingBoost);
    renderStats();
    return;
    addPasses('home',homeProfile,awayProfile,elapsed,homeShare);
    addPasses('away',awayProfile,homeProfile,elapsed,1-homeShare);
    const event = Math.random(), team = side === 'home' ? userClub : matchClub().name;
    if (event < .25) shot(side,current,other);
    else if (event < .42) { const crosser=playerFor(side,'pass'); stats[side].corners++; influencePossession(side,1.5); log(`${crosser} ganha escanteio para o ${team}.`); if(Math.random()<.37) shot(side,{...current,attack:current.attack+6},other,{corner:true}); }
    else if (event < .61) { const defender=playerFor(otherSide,'tackle'), attacker=playerFor(side,'shot'), defenderData=actorData(otherSide,defender,'tackle'), attackerData=actorData(side,attacker,'shot'), success=clamp(.48+((defenderData.tackling+defenderData.marking)/2-(attackerData.dribble+attackerData.speed*.25))/120+(other.defense-current.attack)/300,.24,.82); if(Math.random()<success){stats[otherSide].tackles++;influencePossession(otherSide,2.1);log(`${defender} desarma ${attacker} e recupera a bola.`);}else{influencePossession(side,1.6);log(`${attacker} supera ${defender} no drible e mantém o ataque.`);} }
    else if (event < .78) { const defender=playerFor(otherSide,'foul'), attacker=playerFor(side,'shot'); log(`${defender} derruba ${attacker}.`); foul(otherSide,side,true); }
    else if (event < .86) { const attacker=playerFor(side,'shot'); stats[side].offsides++; influencePossession(otherSide,1.2); log(`${attacker} é flagrado em impedimento.`); }
    else if (event < .875 && stats[side].penalties < 1) { stats[side].penalties++; influencePossession(side,2.4); log(`Pênalti para ${team}!`,'penalty'); if(side==='home'){startPenaltyChoice(current,other);return;} const taker=penaltyTaker(side); shot(side,{...current,attack:current.attack+9},other,{penalty:true,taker:taker.name,penaltySkill:taker.penaltyTaking}); }
    else { const organizer=playerFor(side,'pass'); influencePossession(side,.65); log(`${organizer} conduz a posse no campo de ataque do ${team}.`); }
    renderStats();
  };
  const bindLiveActions=()=>{const pauseButton=$('#pauseMatch'),statsButton=$('#liveStats'),opponentButton=$('#liveOpponent');if(pauseButton)pauseButton.onclick=()=>{if(pauses>=3)return;pauses++;$('#pauseCounter').textContent=`${pauses}/3`;$('#matchStatus').textContent='Pausa técnica: ajuste o time antes de retomar.';openPreparation('PAUSA TÉCNICA');};if(statsButton)statsButton.onclick=()=>{$('#stats').classList.toggle('hidden');renderStats();};if(opponentButton)opponentButton.onclick=()=>{$('#liveOpponentModal').classList.remove('hidden');renderLiveOpponent();};};
  onClick('#playMatch',() => {
    refreshUserFixtures();
    if(isUserSeasonIdle()||seasonComplete()||!nextPendingUserEntry()){
      renderUserMatchPresentation();
      if(isUserSeasonIdle())simulateNonHumanSeasonRemainder();
      else if(seasonComplete())prepareSeasonTransition();
      return;
    }
    const nextEntry=nextPendingUserEntry();
    if(nextEntry&&!sameCalendarDay(nextEntry.details.date,careerCalendarDate)){
      $$('.nav').find(button=>button.dataset.view==='calendar')?.click();
      return;
    }
    pushMatchDayBrief(nextEntry?.game);
    liveMatchGame=nextEntry?.game||nextUserGame;
    renderLiveMatchHeader(liveMatchGame);
    // Após SAIR, a partida é consolidada e o calendário avança para o dia seguinte.
    if(reopenMatchWindow()) return;
    orderRosterForFormation(squad,formation);orderRosterForFormation(matchClub().roster,matchClub().formation);
    matchStarted=true; matchFinished=false; preMatchPreparation=true; minute=0;home=0;away=0;pauses=0;halftimeShown=false;pendingPenalty=null;shootoutState=null;disciplineEvents=0;substitutions=0;substitutedOut=new Set();roundResults=null;roundResultMessagePushed=false;postMatchMedicalQueue=[];matchDiscipline={home:new Map(),away:new Map()};liveInjuries={home:[],away:[]};liveDeferredInjuries={home:[],away:[]};liveOpeningLineup={home:starters().map(player=>player.name),away:matchClub().roster.slice(0,11).map(player=>player.name)};liveMinutesPlayed={home:new Map(starters().map(player=>[player.name,0])),away:new Map(matchClub().roster.slice(0,11).map(player=>[player.name,0]))};availabilityCommitted=false;liveDayMatchSnapshots=null;matchFactors={home:contextFactor({...seasonContext.home,position:clubs[userClub].position,isHome:nextUserGame?.home===userClub}),away:contextFactor({...seasonContext.away,position:matchClub().position,isHome:nextUserGame?.home!==userClub})};cards={home:starters().map(() => ({yellow:0,red:false,dismissal:null,injured:false,playThroughRisk:false})),away:matchClub().roster.slice(0,11).map(() => ({yellow:0,red:false,dismissal:null,injured:false,playThroughRisk:false}))};goals={home:[],away:[]};stats={home:blank(),away:blank()};score();timeline.innerHTML="<p>PRÉ-JOGO · Aguardando a confirmação do treinador.</p>";$('#matchActions').innerHTML='<button id="pauseMatch">Ⅱ PAUSA TÉCNICA <small id="pauseCounter">0/3</small></button><button id="liveStats">ESTATÍSTICAS AO VIVO</button><button id="liveOpponent">VER ADVERSÁRIO</button>';bindLiveActions();$('#pauseCounter').textContent='0/3';$('#matchStatus').textContent='Organize sua equipe antes de iniciar a partida.';modal.classList.remove('hidden');$('#penaltyChoice').classList.add('hidden');$('#shootoutPanel').classList.add('hidden');$('#liveOpponentModal').classList.add('hidden');updateLiveMatchClock();openPreparation('PRÉ-JOGO');
  });
  onClick('#simulateRemainder',()=>simulateNonHumanSeasonRemainder());
  onClick('#closeMatch',()=>{
    if(matchFinished&&!roundCommitted){exitLiveMatch();return;}
    modal.classList.add('hidden');$('#liveOpponentModal').classList.add('hidden');closeFormationSuggestion();
  });
  onClick('#closeLiveOpponent',()=>$('#liveOpponentModal').classList.add('hidden'));
  onClick('#resumeMatch',()=>{
    const startingMatch=preMatchPreparation;
    preMatchPreparation=false;
    $('#pausePanel').classList.add('hidden');
    $('#stats').classList.add('hidden');
    $('#matchActions').classList.remove('hidden');
    $('#matchStatus').textContent='A partida está em andamento…';
    if(startingMatch){liveClockSeconds=0;liveDayMatchSnapshots=null;ensureLiveDayMatches();applyPreMatchTraining();renderRoster();const venue=matchVenueFor(liveMatchGame?.home||userClub);timeline.innerHTML=`<p>0' · A bola está rolando no ${venue.name}!</p>`; }
    updateLiveMatchClock();
    startMatchClock();
  });
  onClick('#penaltyTakers',e=>{const button=e.target.closest('button');if(!button)return;const takerName=button.dataset.taker;if(pendingPenalty?.mode==='shootout'){const lineup=shootoutLineup(pendingPenalty.kickingClub),taker=lineup.find(player=>player.name===takerName);if(!taker)return;executeShootoutKick(pendingPenalty.kickingClub,taker);pendingPenalty=null;return;}const taker=starters().find(p=>p.name===takerName);if(!taker||!pendingPenalty)return;shot('home',{...pendingPenalty.current,attack:pendingPenalty.current.attack+9},pendingPenalty.other,{penalty:true,taker:taker.name,penaltySkill:taker.penaltyTaking});$('#penaltyChoice').classList.add('hidden');$('#matchActions').classList.remove('hidden');$('#matchStatus').textContent='A partida está em andamento…';pendingPenalty=null;renderStats();startMatchClock();});
  // Padrão visual único para toda tabela do Matchday Football.
  const unifiedTablesCss=document.createElement('style');unifiedTablesCss.textContent=':root{--table-surface:#0b1a22;--table-head:#102b35;--table-section:#123843;--table-line:#234b55;--table-cyan:#63d9ff;--table-text:#eef9f7;--table-muted:#9ebfc2;--table-lime:#b6ff38}.roster,.league,.standings,.upcoming-dashboard,.recent-dashboard,.leaders-dashboard,.tactic-roster,.scout-roster,.live-opponent-roster,.championship-grid section,.championship-grid aside,.round-games,.final-goals,.final-basic{background:var(--table-surface)!important;border-color:#28505b!important;border-radius:7px!important;overflow:hidden}.roster-head,.league-head,.mini-table-head,.fixture-table-head,.leader-table-head,.champ-head,.live-opponent-head,.analysis-head,.round-games-head,.dashboard-results-head{background:var(--table-head)!important;color:var(--table-cyan)!important;border-color:#28505b!important;font:700 9px DM Sans!important;letter-spacing:.6px}.player-row,.league-row,.standing-row,.dashboard-fixture-row,.leader-row,.champ-row,.scorer-row,.fixture-row,.analysis-player,.live-opponent-player,.round-game-row{background:transparent!important;border-color:var(--table-line)!important;color:var(--table-text)!important}.player-row:hover,.league-row:hover,.standing-row:hover,.dashboard-fixture-row:hover,.leader-row:hover,.champ-row:hover,.scorer-row:hover,.fixture-row:hover,.analysis-player:hover,.live-opponent-player:hover,.round-game-row:hover{background:#102832!important}.tactic-roster h3,.analysis-roster h3,.live-opponent-roster h3,.championship-grid h3{background:var(--table-section)!important;color:var(--table-lime)!important;border-color:#28505b!important;font-family:Barlow Condensed!important;letter-spacing:.2px}.tactic-roster-head,.analysis-head,.live-opponent-head{background:var(--table-head)!important;color:var(--table-cyan)!important}.badge{background:#173e49!important;color:var(--table-cyan)!important;border:1px solid #397487}.club-link{color:var(--table-text)!important;font-weight:700}.standing-row.highlight,.league-row.highlight,.champ-row.highlight,.dashboard-fixture-row.involves-user,.round-game-row.user-game{background:#203b26!important;box-shadow:inset 3px 0 0 var(--table-lime)}.leader-row span:last-child,.scorer-row strong,.round-game-row strong{color:var(--table-lime)!important}.table-fatigue i,.tactic-player-row .tactic-fatigue i,.roster-fatigue i{background:#25424b!important;box-shadow:inset 0 0 0 1px #397487}.table-fatigue i b,.tactic-player-row .tactic-fatigue i b,.roster-fatigue i b{background:linear-gradient(90deg,var(--table-cyan),var(--table-lime))!important}.final-goals h3,.final-basic h3{background:var(--table-section)!important;color:var(--table-lime)!important;border-bottom:1px solid #28505b}.final-goals article{background:#102832!important;color:var(--table-text)!important}.final-goals article b{color:var(--table-cyan)!important}@media(max-width:700px){.roster-head,.player-row,.league-head,.league-row,.mini-table-head,.standing-row,.fixture-table-head,.dashboard-fixture-row,.round-games-head,.round-game-row{font-size:9px!important}}';document.head.append(unifiedTablesCss);
  // Sistema final de botões: superfícies escuras para ações comuns, azul para
  // seleção e hierarquia por contraste. O verde permanece reservado a dados.
  const refinedButtonsCss=document.createElement('style');refinedButtonsCss.textContent=`
    body.dark-mode button:not(.nav):not(.close){
      background:#102630!important;color:#dce9e8!important;
      border:1px solid #315f70!important;border-radius:6px!important;
      box-shadow:none!important
    }
    body.dark-mode button:not(.nav):not(.close):hover{
      background:#173a47!important;color:#fff!important;border-color:#58bcd8!important;
      box-shadow:0 6px 16px #0006!important;transform:translateY(-1px)
    }
    body.dark-mode button:not(.nav):not(.close):focus-visible{
      outline:2px solid #63d9ff!important;outline-offset:2px
    }
    body.dark-mode button:not(.nav):not(.close):disabled{
      background:#132229!important;color:#70888b!important;border-color:#263f48!important;
      opacity:.65;box-shadow:none!important;transform:none
    }
    body.dark-mode .formation-buttons button.selected,
    body.dark-mode .option-choices button.selected,
    body.dark-mode button.active,
    body.dark-mode button[aria-selected="true"]{
      background:#1f596c!important;color:#fff!important;border-color:#63d9ff!important;
      box-shadow:inset 3px 0 #63d9ff!important
    }
    body.dark-mode #confirmNewGame,
    body.dark-mode #openNewGame,
    body.dark-mode #resumeMatch,
    body.dark-mode #makeSubstitution,
    body.dark-mode .season-transition-actions button{
      background:#24667c!important;color:#fff!important;border-color:#63d9ff!important;
      box-shadow:inset 3px 0 #63d9ff!important
    }
    body.dark-mode #confirmNewGame:hover,
    body.dark-mode #openNewGame:hover,
    body.dark-mode #resumeMatch:hover,
    body.dark-mode #makeSubstitution:hover,
    body.dark-mode .season-transition-actions button:hover{
      background:#2d7890!important;border-color:#8ae6ff!important
    }
    .new-game-modal .division-choice-grid{gap:10px}
    body.dark-mode .new-game-modal button.division-card{
      min-height:70px;padding:12px 13px!important;text-align:left;
      background:linear-gradient(145deg,#102a34,#0b1d25)!important;
      border:1px solid #315967!important;color:#dce9e8!important;
      box-shadow:none!important;transform:none
    }
    body.dark-mode .new-game-modal button.division-card b{
      color:#eaf4f3!important;font-size:18px;letter-spacing:.2px
    }
    body.dark-mode .new-game-modal button.division-card small{
      color:#88a9ad!important;font-size:9px;line-height:1.35
    }
    body.dark-mode .new-game-modal button.division-card:hover{
      background:linear-gradient(145deg,#163945,#102832)!important;
      border-color:#4d9bb1!important;box-shadow:0 7px 16px #0005!important
    }
    body.dark-mode .new-game-modal button.division-card.selected{
      background:linear-gradient(145deg,#1c5061,#153946)!important;
      border-color:#63d9ff!important;
      box-shadow:inset 4px 0 #63d9ff,0 0 0 1px #63d9ff24!important
    }
    body.dark-mode .new-game-modal button.division-card.selected b{color:#fff!important}
    body.dark-mode .new-game-modal button.division-card.selected small{color:#c1e6ed!important}
    @media(max-width:760px){.new-game-modal .division-choice-grid{grid-template-columns:repeat(2,1fr)}}
  `;document.head.append(refinedButtonsCss);
  bindLiveActions();
  const autoBenchmarkCount=Number(new URLSearchParams(location.search).get('autoBenchmark'));
  if(autoBenchmarkCount>0&&typeof simulateRoundMatch==='function'){
    const percentile=(sorted,p)=>{const index=(sorted.length-1)*p,lower=Math.floor(index),upper=Math.ceil(index);return lower===upper?sorted[lower]:sorted[lower]+(sorted[upper]-sorted[lower])*(index-lower);};
    const sample=Math.max(100,Math.min(20000,autoBenchmarkCount)),clubNames=Object.keys(clubs),fixtures=[],pairingMode=new URLSearchParams(location.search).get('pairing')||'mixed';
    if(pairingMode==='round'){
      const roundList=futureMatches.length?futureMatches:Object.values(nationalCompetitions[userDivision]?.fixtures||{})[0]||[];
      for(let index=0;index<sample;index++){const game=roundList[index%Math.max(1,roundList.length)];fixtures.push({home:game.home,away:game.away});}
    }else for(let index=0;index<sample;index++){const home=clubNames[index%clubNames.length],away=clubNames[(index*7+3)%clubNames.length];if(home!==away)fixtures.push({home,away});}
    const scoreDist={},goalsPerMatch=[],shotsPerMatch=[],xgPerMatch=[],homePossession=[],powerGapBuckets={even:{n:0,homeWins:0,goals:0},slight:{n:0,homeWins:0,goals:0},strong:{n:0,homeWins:0,goals:0}};
    const totals={matches:0,goals:0,homeGoals:0,awayGoals:0,draws:0,homeWins:0,awayWins:0,scoreless:0,over25:0,over35:0,over45:0,maxGoals:0,shots:0,onTarget:0,fouls:0,yellows:0,reds:0,corners:0,offsides:0,penalties:0,injuries:0,subs:0,xg:0,injuryConfirmedInMatch:0,injuryDeferred:0,injuryCleared:0,injuryMonitoring:0,injuryConfirmedPostMatch:0,injuryDaysOffTotal:0};
    const started=performance.now();
    fixtures.forEach(({home,away})=>{
      const result=simulateRoundMatch(home,away),d=result.data,hg=result.homeGoals,ag=result.awayGoals,tg=hg+ag,key=`${hg}-${ag}`;
      scoreDist[key]=(scoreDist[key]||0)+1;totals.matches++;totals.goals+=tg;totals.homeGoals+=hg;totals.awayGoals+=ag;
      totals.draws+=hg===ag?1:0;totals.homeWins+=hg>ag?1:0;totals.awayWins+=ag>hg?1:0;totals.scoreless+=tg===0?1:0;
      totals.over25+=tg>=3?1:0;totals.over35+=tg>=4?1:0;totals.over45+=tg>=5?1:0;totals.maxGoals=Math.max(totals.maxGoals,tg);
      totals.shots+=(d.homeShots||0)+(d.awayShots||0);totals.onTarget+=(d.homeOnTarget||0)+(d.awayOnTarget||0);
      totals.fouls+=(d.homeFouls||0)+(d.awayFouls||0);totals.yellows+=(d.homeYellow||0)+(d.awayYellow||0);totals.reds+=(d.homeRed||0)+(d.awayRed||0);
      totals.corners+=(d.homeCorners||0)+(d.awayCorners||0);totals.offsides+=(d.homeOffsides||0)+(d.awayOffsides||0);
      totals.penalties+=(d.homePenalties||0)+(d.awayPenalties||0);totals.injuries+=(result.injuries?.home?.length||0)+(result.injuries?.away?.length||0);
      const injurySummary=summarizeMatchInjuries(result);
      totals.injuryConfirmedInMatch+=injurySummary.confirmedInMatch;totals.injuryDeferred+=injurySummary.deferred;totals.injuryCleared+=injurySummary.cleared;totals.injuryMonitoring+=injurySummary.monitoring;totals.injuryConfirmedPostMatch+=injurySummary.confirmedPostMatch;totals.injuryDaysOffTotal+=injurySummary.totalDaysOut;
      totals.subs+=(result.substitutions?.home||0)+(result.substitutions?.away||0);const matchXg=(d.homeXg||0)+(d.awayXg||0);totals.xg+=matchXg;
      goalsPerMatch.push(tg);shotsPerMatch.push((d.homeShots||0)+(d.awayShots||0));xgPerMatch.push(matchXg);homePossession.push(d.homePossession||50);
      const gap=(clubs[home]?.power||75)-(clubs[away]?.power||75),bucket=Math.abs(gap)<=2?'even':Math.abs(gap)<=6?'slight':'strong';
      powerGapBuckets[bucket].n++;powerGapBuckets[bucket].goals+=tg;powerGapBuckets[bucket].homeWins+=hg>ag?1:0;
    });
    goalsPerMatch.sort((a,b)=>a-b);shotsPerMatch.sort((a,b)=>a-b);xgPerMatch.sort((a,b)=>a-b);homePossession.sort((a,b)=>a-b);
    const n=totals.matches,report={
      sampleSize:n,elapsedMs:Math.round(performance.now()-started),mode:savedNewGame?'career':'demo',division:userDivision,pairing:pairingMode,
      builtIn:typeof window.__matchdayEngineBenchmark==='function'?window.__matchdayEngineBenchmark(Math.min(n,1000)):null,
      rates:{
        goalsPerMatch:Number((totals.goals/n).toFixed(3)),homeGoalsPerMatch:Number((totals.homeGoals/n).toFixed(3)),awayGoalsPerMatch:Number((totals.awayGoals/n).toFixed(3)),
        drawRate:Number((totals.draws/n*100).toFixed(2)),homeWinRate:Number((totals.homeWins/n*100).toFixed(2)),awayWinRate:Number((totals.awayWins/n*100).toFixed(2)),
        scorelessRate:Number((totals.scoreless/n*100).toFixed(2)),over25Rate:Number((totals.over25/n*100).toFixed(2)),over35Rate:Number((totals.over35/n*100).toFixed(2)),over45Rate:Number((totals.over45/n*100).toFixed(2)),
        shotsPerMatch:Number((totals.shots/n).toFixed(2)),onTargetPerMatch:Number((totals.onTarget/n).toFixed(2)),onTargetPct:Number((totals.onTarget/Math.max(1,totals.shots)*100).toFixed(2)),
        conversionPct:Number((totals.goals/Math.max(1,totals.onTarget)*100).toFixed(2)),foulsPerMatch:Number((totals.fouls/n).toFixed(2)),yellowsPerMatch:Number((totals.yellows/n).toFixed(2)),
        redsPerMatch:Number((totals.reds/n).toFixed(2)),cornersPerMatch:Number((totals.corners/n).toFixed(2)),offsidesPerMatch:Number((totals.offsides/n).toFixed(2)),
        penaltiesPerMatch:Number((totals.penalties/n).toFixed(2)),injuriesPerMatch:Number((totals.injuries/n).toFixed(2)),subsPerMatch:Number((totals.subs/n).toFixed(2)),
        injuryConfirmedInMatchPerMatch:Number((totals.injuryConfirmedInMatch/n).toFixed(3)),injuryDeferredPerMatch:Number((totals.injuryDeferred/n).toFixed(3)),injuryClearedPerMatch:Number((totals.injuryCleared/n).toFixed(3)),injuryMonitoringPerMatch:Number((totals.injuryMonitoring/n).toFixed(3)),injuryConfirmedPostMatchPerMatch:Number((totals.injuryConfirmedPostMatch/n).toFixed(3)),injuryDaysOffPerMatch:Number((totals.injuryDaysOffTotal/n).toFixed(2)),
        xgPerMatch:Number((totals.xg/n).toFixed(3)),xgToGoalsRatio:Number((totals.goals/Math.max(0.001,totals.xg)).toFixed(3))
      },
      percentiles:{goals:{p10:percentile(goalsPerMatch,.1),p25:percentile(goalsPerMatch,.25),p50:percentile(goalsPerMatch,.5),p75:percentile(goalsPerMatch,.75),p90:percentile(goalsPerMatch,.9)},shots:{p50:percentile(shotsPerMatch,.5),p90:percentile(shotsPerMatch,.9)},xg:{p50:percentile(xgPerMatch,.5),p90:percentile(xgPerMatch,.9)},homePossession:{p25:percentile(homePossession,.25),p50:percentile(homePossession,.5),p75:percentile(homePossession,.75)}},
      topScores:Object.entries(scoreDist).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([score,count])=>({score,count,pct:Number((count/n*100).toFixed(2))})),
      powerGapBuckets:Object.fromEntries(Object.entries(powerGapBuckets).map(([key,value])=>[key,{matches:value.n,homeWinRate:value.n?Number((value.homeWins/value.n*100).toFixed(2)):0,goalsPerMatch:value.n?Number((value.goals/value.n).toFixed(3)):0}])),
      references:{brasileiraoSerieA:{goalsPerMatch:'2.45-2.55',drawRate:'24-27%',homeWinRate:'45-48%',shotsPerMatch:'22-28',foulsPerMatch:'24-30'},topLeagues:{goalsPerMatch:'2.6-2.9',drawRate:'22-26%',homeWinRate:'44-46%'}}
    };
    document.body.innerHTML=`<pre id="benchmark-json">${JSON.stringify(report,null,2)}</pre>`;document.title='BENCHMARK_DONE';
  }
  const expectedCupEntryPhase=()=>{
    if(userDivision==='A')return 5;
    if(cupSpecialEntrants.includes(userClub))return 3;
    if(cupSecondDirect.includes(userClub))return 2;
    if(cupFirstRanked.includes(userClub))return 1;
    return null;
  };
  const userCupFixtures=()=>cupCompetition.stages.flatMap(stage=>stage.fixtures.filter(game=>game.home===userClub||game.away===userClub));
  const runCupCareerAudit=()=>{
    const expected=expectedCupEntryPhase(),seasonEnd=new Date(careerSeason,11,31,12),mayCheck=new Date(careerSeason,4,1,12);
    const fixturesAtStart=userCupFixtures().length,pendingAtStart=pendingUserSchedule().filter(entry=>entry.game.competition==='COPA DO BRASIL').length;
    // Marcos do calendário da Copa — evita avançar dia a dia (pesado em benchmarks em massa).
    [seasonStartDate(),cupDate(2,18),cupDate(2,26),cupDate(3,11),cupDate(3,18),cupDate(4,22),cupDate(5,13),cupDate(8,2),seasonEnd].forEach(date=>{
      advanceCareerCalendarTo(date);
      advanceCupThroughDate(date);
    });
    for(let pass=0;pass<20;pass++){
      let progressed=false;
      cupCompetition.stages.forEach(stage=>{
        [...new Set(stage.fixtures.map(game=>game.tieId))].forEach(tieId=>{
          const games=cupTieGames(stage,tieId);
          if(!games.some(isUserFixture))return;
          games.forEach(game=>{
            if(game.completed)return;
            const result=simulateRoundMatch(game.home,game.away);
            let homeGoals=result.homeGoals,awayGoals=result.awayGoals;
            const userHome=game.home===userClub,userGoals=userHome?homeGoals:awayGoals,oppGoals=userHome?awayGoals:homeGoals;
            if(userGoals<=oppGoals){if(userHome)homeGoals=oppGoals+1;else awayGoals=oppGoals+1;}
            Object.assign(game,{completed:true,homeGoals,awayGoals,data:result.data,goals:result.goals});
            progressed=true;
          });
          if(resolveCupTie(stage,tieId))progressed=true;
          if(finalizeCupStageIfReady(stage))progressed=true;
        });
      });
      refreshCopaDoBrasilFixtures();
      if(!progressed)break;
    }
    const fixtures=userCupFixtures(),pendingCup=pendingUserSchedule().filter(entry=>entry.game.competition==='COPA DO BRASIL');
    const everInCup=fixtures.length>0,anomalies=[];
    if(expected===null&&userDivision!=='A')anomalies.push('missing_from_pool');
    if(!everInCup&&careerCalendarDate>=mayCheck&&expected!==null)anomalies.push('never_entered_copa');
    if(userDivision==='A'&&!everInCup&&cupCompetition.stages.some(stage=>stage.index>=4&&stage.completed))anomalies.push('serie_a_missing_after_phase4');
    if(isUserSeasonIdle()&&!seasonComplete()&&expected!==null&&!everInCup)anomalies.push('idle_without_copa');
    cupCompetition.stages.forEach(stage=>{
      [...new Set(stage.fixtures.map(game=>game.tieId))].forEach(tieId=>{
        const games=cupTieGames(stage,tieId);
        if(!games.some(isUserFixture))return;
        if(games.some(game=>!game.completed)&&games.some(game=>game.winner))anomalies.push(`tie_resolved_before_user_play:F${stage.index}:${tieId}`);
      });
    });
    const phase4=cupCompetition.stages.find(stage=>stage.index===4),phase5=cupCompetition.stages.find(stage=>stage.index===5);
    if(userDivision==='A'&&phase4?.completed&&!everInCup&&(!phase5||!phase5.entrants?.includes(userClub)))anomalies.push('serie_a_not_in_phase5');
    return{
      seed:savedNewGame?.seed??null,club:userClub,division:userDivision,expectedEntryPhase:expected,
      entryPath:expected===1?'1a_fase':expected===2?'2a_fase_direta':expected===3?'3a_fase_especial':expected===5?'5a_fase_serie_a':null,
      fixturesAtStart,pendingCupAtStart:pendingAtStart,cupFixturesTotal:fixtures.length,cupFixturesCompleted:fixtures.filter(game=>game.completed).length,
      cupFixturesPending:pendingCup.length,cupCurrentPhase:cupCompetition.currentPhase,cupChampion:cupCompetition.champion,
      calendarDate:calendarKey(careerCalendarDate),currentRound,seasonIdle:isUserSeasonIdle(),seasonComplete:seasonComplete(),everInCup,anomalies
    };
  };
  window.__matchdayRunCupCareerAudit=runCupCareerAudit;
  if(new URLSearchParams(location.search).has('cupAudit')&&savedNewGame){
    const audit=runCupCareerAudit();
    document.body.innerHTML=`<pre id="cup-audit-json">${JSON.stringify(audit,null,2)}</pre>`;
    document.title=audit.anomalies.length?'CUP_AUDIT_FAIL':'CUP_AUDIT_OK';
    window.__cupAuditResult=audit;
  }
  // Save idle (eliminado / sem jogos): retoma a simulação do calendário nacional.
  if(savedNewGame&&!new URLSearchParams(location.search).has('benchmark')&&!new URLSearchParams(location.search).has('cupAudit')){
    renderUserMatchPresentation();
    if(isUserSeasonIdle())setTimeout(()=>simulateNonHumanSeasonRemainder(),0);
    else if(seasonComplete())prepareSeasonTransition();
  }
  } catch(error) {
    document.documentElement.dataset.bootError=String(error?.stack||error);
    console.error('Matchday Football failed to initialize',error);
    throw error;
  }
}
