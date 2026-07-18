import { $, $$, on, onClick, redirectGame, clamp, cleanCareerText } from '../ui/dom.js';
import { createRouter } from '../ui/router.js';
import { createMessagesFeature } from '../feature/messages/index.js';
import { createDashboardFeature } from '../feature/dashboard/index.js';
import { createCalendarViewFeature } from '../feature/calendar-view/index.js';
import { createTacticsFeature } from '../feature/tactics/index.js';
import { createSeasonSummaryFeature } from '../feature/season-summary/index.js';
import { createPlayerCells, injectPlayerStatusCss, outfield, fatigueCell } from '../feature/shared/player-cells.js';
import { SAVE_KEYS } from '../core/constants.js';
import {
  loadCareerSave,
  loadSeasonSave,
  isSeasonValidForCareer,
  hydrateMessages,
  clearSeasonSave,
  writeJson,
  MEMORY_LIMITS,
  compactMatchResult,
  compactRoundHistory,
  compactCompetitionHistories,
  compactCupFixture,
  slimLeaderboard,
  slimAvailabilitySnapshot,
  pruneInjuryHistory,
  pruneRankingTitles,
  pruneClubMemory,
  involvesClub,
} from '../core/save.js';
import { createInjuryEngine } from '../engine/injury.js';
import { createFatigueEngine } from '../engine/fatigue.js';
import { createDisciplineEngine } from '../engine/discipline.js';
import { createEconomyEngine } from '../engine/economy.js';
import { createEconomyFeature } from '../feature/economy/index.js';
import { createOptionsFeature } from '../feature/options/index.js';
import { createLiveDayMatchesFeature } from '../feature/live-day-matches/index.js';
import { createMatchLiveUiFeature } from '../feature/match-live-ui/index.js';
import {
  injectTacticalConfrontationCss,
  tacticalKickoffMessage,
} from '../feature/tactics/tactical-confrontation.js';
import {
  ENGINE_TUNING,
  engineFoulRisk,
  engineProgressiveFoulRisk as engineProgressiveFoulRiskBase,
  engineBlowoutDamp,
  matchDifficultyForClub,
  createSimLineupBuilder,
  FATIGUE_SUB_THRESHOLD,
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
  formatKnockoutFixtureScore,
  clearStaleKnockoutShootout,
  sanitizeKnockoutShootoutSave,
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
    playerUnavailable: playerInjuryUnavailable,
    injurySeverityLabel,
  } = injuryEngine;
  const discipline = createDisciplineEngine();
  const {
    YELLOW_SUSPENSION_LIMIT,
    normalizePlayerDiscipline,
    competitionKeyFromFixture,
    competitionLabel,
    getYellowAccumulation,
    activeSuspensions,
    isSuspendedForCompetition,
    isSuspendedAnywhere,
    directRedDismissalType,
    directRedSuspensionGames,
    applyDisciplineCard,
    serveCompetitionSuspensions,
    disciplineBadgeCompetitionKeys,
  } = discipline;
  const economy = createEconomyEngine();
  const {
    initialBudget,
    formatBudget,
    formatCapacity,
    formatTicketPrice,
    computeSeasonPrize,
    resolveSerieDPrizePhase,
    resolveCupPrizePhase,
    ensureBudget,
    ensureStadium,
    getStructureLevel,
    getPitchLevel,
    maxPitchForStructure,
    pitchTierLabel,
    credit,
    getBalance,
    listUpgrades,
    listStadiumUpgrades,
    purchaseUpgrade,
    purchaseStadiumUpgrade,
    getTicketPrices,
    adjustTicketPrice,
    estimateGateReceipt,
    competitionAttraction,
    computeMatchAttendance,
    attachMatchAttendance,
    creditHomeGate,
    ensureSponsors,
    getSponsors,
    TICKET_PRICE_RANGE,
  } = economy;
  let economyUi;
  // Declarados cedo: playerUnavailable / orderRosterForFormation leem durante o boot.
  let liveMatchGame = null;
  let nextUserGame = null;
  const userLeagueDisciplineKey = () => `LEAGUE:${userDivision}`;
  const fixtureCompetitionKey = fixture =>
    competitionKeyFromFixture(fixture, { isKnockoutShootout: isKnockoutShootoutCompetition, clubs });
  const playerUnavailable = (player, competitionKey = undefined) => {
    if (playerInjuryUnavailable(player)) return true;
    const resolvedKey =
      competitionKey !== undefined && competitionKey !== null
        ? competitionKey
        : liveMatchGame || nextUserGame
          ? fixtureCompetitionKey(liveMatchGame || nextUserGame)
          : null;
    if (resolvedKey) return isSuspendedForCompetition(player, resolvedKey);
    return isSuspendedAnywhere(player);
  };
  const playerUnavailableForFixture = (player, fixture) =>
    playerUnavailable(player, fixture ? fixtureCompetitionKey(fixture) : null);
  const playerStarterBlocked = player =>
    playerUnavailableForFixture(player, liveMatchGame || nextUserGame) || playerInRestrictedReturn(player);
  injectPlayerStatusCss();
  injectTacticalConfrontationCss();
  const { playerNameCell, playerStatusBadges } = createPlayerCells({
    injuryInAcutePhase,
    injuryInRestrictedPhase,
    injurySeverityLabel,
    YELLOW_SUSPENSION_LIMIT,
    getYellowAccumulation,
    activeSuspensions,
    disciplineBadgeCompetitionKeys,
    competitionLabel,
    userLeagueDisciplineKey,
  });
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
  let startMatchClock=()=>{};
  const optionsUi=createOptionsFeature({
    $, $$, onClick, redirectGame, cleanCareerText, writeJson, clearSeasonSave, SAVE_KEYS,
    hasCareer: !!savedNewGame,
    getSavedCareer: () => savedNewGame,
    initialBudget,
    defaultCareerSeason: DEFAULT_CAREER_SEASON,
    initialEnvironmentRanges,
    onPaceChanged: () => {
      if(matchStarted&&!matchFinished&&$('#pausePanel').classList.contains('hidden')&&$('#penaltyChoice').classList.contains('hidden')&&!shootoutState)startMatchClock();
    },
  });
  
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
    user.budget=Math.max(0,Number(initialStatus.budget??initialBudget(userDivision)));
    ensureBudget(user,userDivision);
  }
  else teams.forEach((club,index)=>{if(club===userClub){clubs[club]={name:club,division:'A',roster:squad,formation:'4-3-3',style:'Posse de bola',mentality:'Equilibrada',position:4};return;}const power=clamp(78-index*.45+int(-3,3),68,82),roster=[...starterRoles,...benchRoles].map((role,i)=>generatedPlayer(role,i+index*5,power));clubs[club]={name:club,division:'A',roster,formation:formationsForClubs[int(0,formationsForClubs.length-1)],style:['Posse de bola','Contra-ataque','Pressão alta'][int(0,2)],mentality:['Defensiva','Equilibrada','Ofensiva'][int(0,2)],position:index+1};});
  Object.values(clubs).forEach(club=>{
    const attackers=club.roster.filter(p=>['ATA','PE','PD','MEI','MC'].includes(p.pos)).sort((a,b)=>(b.finishing+b.heading*.2)-(a.finishing+a.heading*.2));
    const creators=club.roster.filter(p=>p.pos!=='GOL').sort((a,b)=>(b.passing+b.playmaking)-(a.passing+a.playmaking));
    club.environment=club.environment??(club.name===userClub?86:int(...initialEnvironmentRanges[club.division||'A']));
    club.support=club.support??int(42,92);
    club.board=club.board??int(42,92);
    club.finances=club.finances??int(40,94);
    if(club.name===userClub){
      ensureBudget(club,club.division||userDivision);
      ensureStadium(club,club.division||userDivision);
    }
    club.medicalInvestment=club.medicalInvestment??0;
    club.preventionProgram=club.preventionProgram??0;
    // Usuário começa em gramado médio (nível 2); estrutura 1 libera até esse teto.
    if(club.name===userClub){
      club.pitchCondition=club.pitchCondition||'average';
      club.pitchLevel=Number.isFinite(Number(club.pitchLevel))?club.pitchLevel:2;
      club.stadiumStructure=Number.isFinite(Number(club.stadiumStructure))?club.stadiumStructure:1;
    }else{
      club.pitchCondition=club.pitchCondition||'good';
      club.pitchLevel=Number.isFinite(Number(club.pitchLevel))?club.pitchLevel:3;
      club.stadiumStructure=Number.isFinite(Number(club.stadiumStructure))?club.stadiumStructure:2;
    }
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
      wear:clamp(1-(club.finances-50)/900-(club.environment-50)/1800,.94,1.06),
      recovery:clamp(1+(club.finances-50)/500+(club.environment-50)/1000,.90,1.15),
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
  const renderClubBudget=()=>{
    const club=clubs[userClub];
    if(club)ensureBudget(club,userDivision);
    const budget=getBalance(club);
    const label=formatBudget(budget);
    const headerBudget=$('#headerBudget');
    if(headerBudget)headerBudget.textContent=label;
    const dashboardBudget=$('#dashboardBudget');
    if(dashboardBudget){
      dashboardBudget.textContent=label;
      setIndicatorTone(dashboardBudget.parentElement,Math.min(100,Math.round(budget/200_000)));
    }
    economyUi?.renderOffice?.();
    economyUi?.renderStadium?.();
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
    renderClubBudget();
    const specialistRows=Object.keys(divisionRules).map(division=>{const divisionClubs=divisionTeams[division],freeClubs=divisionClubs.filter(name=>clubs[name].roster.some(player=>player.freeKick>85)).length,penaltyClubs=divisionClubs.filter(name=>clubs[name].roster.some(player=>player.penaltyTaking>85)).length;return `<span><b>Série ${division}</b>${divisionClubs.length} clubes · ${freeClubs} com especialista em faltas · ${penaltyClubs} em pênaltis</span>`;}).join('');
    $('.new-game-action').insertAdjacentHTML('afterend',`<div class="generated-world-summary"><small>CARREIRA ATUAL</small><span class="career-current"><b>${userClub}</b>${careerProfile.managerName} · Série ${userDivision}</span><small>UNIVERSO NACIONAL</small>${specialistRows}</div>`);
  }
  const resolveOpponentClubName=()=>{
    const game=liveMatchGame||nextUserGame;
    if(game){
      const name=game.home===userClub?game.away:game.home;
      if(clubs[name])return name;
    }
    return Object.keys(clubs).find(name=>name!==userClub&&clubs[name]?.roster)||Object.keys(clubs).find(name=>name!==userClub)||userClub;
  };
  const matchClub=()=>clubs[resolveOpponentClubName()];
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
  const seasonRoundHistory=validSavedSeason&&Array.isArray(savedSeason.seasonRoundHistory)?compactRoundHistory(savedSeason.seasonRoundHistory,userClub):[];
  const initialCareerMessages=hydrateMessages(savedSeason,validSavedSeason);
  const competitionRoundHistory=validSavedSeason&&savedSeason.competitionRoundHistory
    ?{A:[],B:[],C:[],D:[],...compactCompetitionHistories(savedSeason.competitionRoundHistory,userClub)}
    :{A:[],B:[],C:[],D:[]};
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
    if(player.injuryHistory.length>MEMORY_LIMITS.injuryHistory)player.injuryHistory=player.injuryHistory.slice(-MEMORY_LIMITS.injuryHistory);
    return record;
  };
  // Disponibilidade do atleta persiste entre rodadas. Suspensões: 3 amarelos
  // por competição ou expulsão (vermelho direto com gravidade variável).
  const restoredAvailability=validSavedSeason?savedSeason.availability||{}:{};
  const restoredClubMedical=validSavedSeason?savedSeason.clubMedical||{}:{};
  const restoredUserBudget=validSavedSeason&&Number.isFinite(Number(savedSeason.userBudget))?Number(savedSeason.userBudget):null;
  if(clubs[userClub]){
    if(restoredUserBudget!=null)clubs[userClub].budget=restoredUserBudget;
    ensureBudget(clubs[userClub],userDivision);
    if(Array.isArray(savedSeason?.userBudgetLedger))clubs[userClub].budgetLedger=savedSeason.userBudgetLedger.map(entry=>({...entry}));
    const savedStadium=savedSeason?.userStadium;
    if(savedStadium&&typeof savedStadium==='object'){
      if(Number.isFinite(Number(savedStadium.capacity)))clubs[userClub].stadiumCapacity=Number(savedStadium.capacity);
      if(Number.isFinite(Number(savedStadium.capacityLevel)))clubs[userClub].stadiumCapacityLevel=Number(savedStadium.capacityLevel);
      if(savedStadium.name)clubs[userClub].stadiumName=savedStadium.name;
      if(savedStadium.ticketPrices)clubs[userClub].ticketPrices={...savedStadium.ticketPrices};
      if(Number.isFinite(Number(savedStadium.structure)))clubs[userClub].stadiumStructure=Number(savedStadium.structure);
      if(Number.isFinite(Number(savedStadium.pitchLevel)))clubs[userClub].pitchLevel=Number(savedStadium.pitchLevel);
      if(savedStadium.pitchCondition)clubs[userClub].pitchCondition=savedStadium.pitchCondition;
    }
    ensureStadium(clubs[userClub],userDivision);
    const savedSponsors=savedSeason?.userSponsors;
    if(savedSponsors)clubs[userClub].sponsors={
      ...savedSponsors,
      master:savedSponsors.master?{...savedSponsors.master}:null,
      secondaries:Array.isArray(savedSponsors.secondaries)?savedSponsors.secondaries.map(item=>({...item})):[],
    };
    ensureSponsors(clubs[userClub],{
      division:userDivision,
      season:careerSeason,
      random:gameRandom,
      savedSponsors,
      creditPackage:true,
    });
  }
  Object.entries(clubs).forEach(([clubName,club])=>{
    const medical=restoredClubMedical[clubName];
    if(medical){
      club.medicalInvestment=medical.medicalInvestment??club.medicalInvestment??0;
      club.preventionProgram=medical.preventionProgram??club.preventionProgram??0;
      club.pitchCondition=medical.pitchCondition||club.pitchCondition||'good';
      if(Number.isFinite(Number(medical.pitchLevel)))club.pitchLevel=Number(medical.pitchLevel);
      if(Number.isFinite(Number(medical.stadiumStructure)))club.stadiumStructure=Number(medical.stadiumStructure);
    }
    club.roster.forEach(player=>{
    const restored=restoredAvailability[clubName]?.[player.name]||{};
    player.injuryHistory=pruneInjuryHistory(Array.isArray(restored.injuryHistory)?restored.injuryHistory:Array.isArray(player.injuryHistory)?player.injuryHistory:[]);
    player.workload={minutesLast7Days:0,minutesLast14Days:0,matchesLast14Days:0,consecutiveStarts:0,highIntensityLoad:0,lastMatchRound:0,...player.workload,...restored.workload};
    player.injury=restored.injury?normalizeInjury({...restored.injury}):player.injury?normalizeInjury({...player.injury}):null;
    player.discipline=normalizePlayerDiscipline(restored.discipline,{defaultLeagueKey:`LEAGUE:${clubs[clubName]?.division||userDivision}`});
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
    return [club.name,{club:club.name,base,championshipPoints,titlePoints:roundRankingScore(stored?.titlePoints||0),titles:pruneRankingTitles(Array.isArray(stored?.titles)?stored.titles:[])}];
  }));
  pruneClubMemory(clubs,nationalRankingEntries);
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
  const applyDisciplineToPlayer=(player,card,round=currentRound,clubName=null,fixture=null)=>{
    if(!player||!card)return [];
    const competitionKey=fixtureCompetitionKey(fixture||liveMatchGame||{division:clubs[clubName||userClub]?.division||userDivision});
    const opponent=clubName===userClub&&fixture?fixture.home===userClub?fixture.away:fixture.home:clubName===userClub&&liveMatchGame?liveMatchGame.home===userClub?liveMatchGame.away:liveMatchGame.home:null;
    return applyDisciplineCard(player,card,{competitionKey,round,isUserClub:clubName===userClub,opponent});
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
  const applyMatchAvailability=(game,fixture=null)=>{
    if(!game)return;
    const matchFixture=fixture||game.fixture||game;
    const userDisciplineLines=[];
    const userOpponent=matchFixture.home===userClub?matchFixture.away:matchFixture.away===userClub?matchFixture.home:null;
    [['home',matchFixture.home],['away',matchFixture.away]].forEach(([side,clubName])=>{
      const club=clubs[clubName];if(!club)return;
      applyMatchWorkload(clubName,game.workload?.[side],game.tactics?.[side]||roundTactic(club));
      (game.discipline?.[side]||[]).forEach(entry=>{
        const lines=applyDisciplineToPlayer(club.roster.find(player=>player.name===entry.name),entry,currentRound,clubName,matchFixture);
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
  }));
  const serveDisciplineSuspensionsForRound=()=>{
    Object.entries(nationalCompetitions).forEach(([division,competition])=>{
      const fixtures=competition.fixtures?.[currentRound-1]||[];
      if(!fixtures.length)return;
      const participants=new Set(fixtures.flatMap(game=>[game.home,game.away]));
      const competitionKey=division==='D'&&currentRound>SERIE_D_GROUP_ROUNDS&&fixtures.some(isKnockoutShootoutCompetition)?'SERIE_D_KO':`LEAGUE:${division}`;
      serveCompetitionSuspensions(clubs,participants,competitionKey,currentRound);
    });
    const cupFixturesOnRound=copaDoBrasilFixtures.filter(game=>!game.completed&&game.round===currentRound);
    if(cupFixturesOnRound.length){
      const participants=new Set(cupFixturesOnRound.flatMap(game=>[game.home,game.away]));
      serveCompetitionSuspensions(clubs,participants,'COPA',currentRound);
    }
  };
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
  const knockoutShootoutSanitized=sanitizeKnockoutShootoutSave({cupCompetition,serieDFixtures:nationalCompetitions.D.fixtures});
  let syncUserCalendarSpacing=()=>{rescheduleAllCupFixtures();};
  const calculateRestConflicts=()=>[...clubMatchDates.values()].reduce((total,dates)=>{const ordered=[...dates].sort((a,b)=>a-b);return total+ordered.slice(1).filter((date,index)=>date-ordered[index]<minimumMatchGap).length;},0);
  let restConflictCount=0;
  const fixtureDetails=game=>{if(game.competition==='COPA DO BRASIL'){const date=new Date(game.date),day=String(date.getDate()).padStart(2,'0'),month=date.toLocaleDateString('pt-BR',{month:'short'}).replace('.','').toUpperCase();return{date,display:`${day} ${month}`,time:game.time};}const gameIndex=(championshipFixtures[game.round-1]||[]).findIndex(candidate=>candidate.home===game.home&&candidate.away===game.away);const date=fixtureDate(game.round),day=String(date.getDate()).padStart(2,'0'),month=date.toLocaleDateString('pt-BR',{month:'short'}).replace('.','').toUpperCase();return {date,display:`${day} ${month}`,time:fixtureTimes[Math.max(0,gameIndex)%fixtureTimes.length]};};
  const clubCrestInitials=name=>name.split(' ').filter(Boolean).map(part=>part[0]).join('').slice(0,2).toUpperCase();
  const matchVenueFor=homeClubName=>{
    if(homeClubName===userClub){
      const userVenue=ensureStadium(clubs[userClub],userDivision);
      return {name:userVenue?.name||'Estádio Solar',capacity:userVenue?.capacity||42000};
    }
    const club=clubs[homeClubName],seed=[...homeClubName].reduce((sum,char)=>sum+char.charCodeAt(0),0)+(club?.power||70)*17,capacity=Math.round((18000+(seed%52000))/1000)*1000,lastWord=homeClubName.split(' ').filter(Boolean).pop()||homeClubName;
    return {name:`Estádio ${lastWord}`,capacity};
  };
  /** Lotação do dia — Ambiente, preço, fase e ruído do fixture (AO VIVO e bilheteria). */
  const resolveMatchAttendance=game=>{
    if(!game?.home||!clubs[game.home])return null;
    const homeClub=clubs[game.home];
    const venue=matchVenueFor(game.home);
    if(game.home!==userClub){
      ensureStadium(homeClub,homeClub.division||'A');
      homeClub.stadiumCapacity=venue.capacity;
    }
    return attachMatchAttendance(homeClub,game,{division:homeClub.division||userDivision,capacity:venue.capacity});
  };
  const formatVenueCrowdLine=game=>{
    const venue=matchVenueFor(game.home);
    const crowd=resolveMatchAttendance(game);
    const homeTag=game.home===userClub?'CASA':'FORA';
    if(!crowd)return `${venue.name} (${homeTag})`;
    return `${venue.name} (${homeTag}) · ${crowd.attendance.toLocaleString('pt-BR')} · ${Math.round(crowd.fillRate*100)}%`;
  };
  const isUserHomeMatch=game=>!!game&&game.home===userClub&&game.away!==userClub;
  const creditUserHomeGate=game=>{
    // Só mando de campo — visitante nunca recebe bilheteria.
    if(!isUserHomeMatch(game)||!clubs[userClub])return null;
    const venue=matchVenueFor(userClub);
    const result=creditHomeGate(clubs[userClub],game,{division:userDivision,capacity:venue.capacity});
    if(result?.ok){
      renderClubBudget();
      economyUi?.renderOffice?.();
      persistSeason();
    }
    return result;
  };
  /** Resultado da partida + público/bilheteria (mando de campo) numa única mensagem. */
  const pushUserMatchResultMessage=(game,gateResult=null)=>{
    if(!game||roundResultMessagePushed)return;
    if(game.home!==userClub&&game.away!==userClub)return;
    roundResultMessagePushed=true;
    const userAtHome=isUserHomeMatch(game);
    const calendarScores=(()=>{
      if(Number.isFinite(Number(game.homeGoals))&&Number.isFinite(Number(game.awayGoals))){
        return {home:Number(game.homeGoals),away:Number(game.awayGoals)};
      }
      return calendarLiveScores();
    })();
    const homeGoals=calendarScores.home,awayGoals=calendarScores.away;
    const userGoals=userAtHome?homeGoals:awayGoals;
    const oppGoals=userAtHome?awayGoals:homeGoals;
    const outcome=userGoals>oppGoals?'Vitória':userGoals<oppGoals?'Derrota':'Empate';
    const scoreLabel=game.penalties
      ? `${homeGoals}—${awayGoals} (${game.penalties})`
      : `${homeGoals}—${awayGoals}`;
    const crowd=resolveMatchAttendance(game);
    const lines=[
      `${game.home} ${scoreLabel} ${game.away}`,
      `${outcome} · ${competitionLabelForGame(game)}`,
    ];
    if(crowd){
      lines.push(`Público: ${crowd.attendance.toLocaleString('pt-BR')} (${Math.round(crowd.fillRate*100)}% lotação)`);
    }
    if(userAtHome&&gateResult?.ok&&gateResult.entry?.amount>0){
      lines.push(`Bilheteria (casa): +${formatBudget(gateResult.entry.amount)} · caixa ${formatBudget(gateResult.balance)}`);
    }
    pushMessage({
      category:'competition',
      type:'match-result',
      title:'RESULTADO DA PARTIDA',
      body:lines.join('\n'),
      round:currentRound,
      meta:{
        competition:competitionLabelForGame(game),
        outcome,
        home:game.home,
        away:game.away,
        homeGoals,
        awayGoals,
        attendance:crowd?.attendance??null,
        fillRate:crowd?.fillRate??null,
        gateRevenue:gateResult?.ok?gateResult.entry.amount:null,
      },
    });
  };
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
  const fixtureResultLabel=game=>{
    if(game.competition==='COPA DO BRASIL'||isKnockoutShootoutCompetition(game)){
      if(!game.completed&&!game.homeGoals&&game.homeGoals!==0){
        const roundRecord=seasonRoundHistory.find(item=>item.round===game.round),result=roundRecord?.games?.find(item=>item.home===game.home&&item.away===game.away);
        if(result)return formatKnockoutFixtureScore(result,{separator:'—'});
        return null;
      }
      return formatKnockoutFixtureScore(game,{separator:'—'});
    }
    const roundRecord=seasonRoundHistory.find(item=>item.round===game.round),result=roundRecord?.games?.find(item=>item.home===game.home&&item.away===game.away);
    if(!result)return null;
    return `${result.homeGoals}—${result.awayGoals}`;
  };
  let userUpcomingGames=[];
  const refreshUserFixtures=()=>{
    userUpcomingGames=pendingUserSchedule().slice(0,3).map(entry=>entry.game);
    nextUserGame=nextPendingUserEntry()?.game||null;
  };
  const renderRoster = () => $('#playerList').innerHTML = squad.map(p => `<div class="player-row roster-expanded"><span>${playerNameCell(p.name,p)}</span><span class="badge">${p.pos}</span><span>${p.age}</span><span>${p.potential ?? p.overall}</span><span>${p.height ? `${p.height} cm` : '—'}</span><span>${p.preferredFoot || '—'}</span><span>${p.personality || '—'}</span><span>${p.injuryProneness ?? '—'}</span><span>${p.overall}</span><span>${p.dribble}</span><span>${p.speed}</span><span>${p.marking}</span><span>${p.tackling}</span><span>${p.finishing}</span><span>${p.passing}</span><span>${p.heading}</span><span>${outfield(p.positioning)}</span><span>${outfield(p.penaltySaving)}</span><span>${outfield(p.reflexes)}</span><span>${p.freeKick}</span><span>${p.penaltyTaking}</span><span>${p.playmaking}</span><span class="roster-fatigue"><i><b style="width:${clamp(p.fatigue,0,100)}%"></b></i><em>${Math.round(p.fatigue)}%</em></span></div>`).join('');
  renderRoster();
  const leagueRow=(row,index)=>`<div class="league-row ${row.club === userClub ? 'highlight' : ''}" data-club="${row.club}" role="button" tabindex="0"><span>${userDivision==='D'?index+1:clubs[row.club].position}</span><span class="club-link">${row.club}</span><span>${row.played}</span><span>${row.wins}</span><span>${row.draws}</span><span>${row.losses}</span><span>${row.goalDiff>=0?'+':''}${row.goalDiff}</span><span>${row.points}</span></div>`;
  $('#leagueTable').innerHTML = displayedLeagueRows().map(leagueRow).join('');
  $('.upcoming-dashboard label em').textContent=`RODADA ${currentRound}`;
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
  const pushSeasonEndBrief=({prizeTotal=0,budgetAfter=null}={})=>{
    const row=nationalCompetitions[userDivision]?.standings?.find(item=>item.club===userClub),position=displayedClubPosition(userClub);
    const prizeLine=prizeTotal>0?` Premiação creditada: +${formatBudget(prizeTotal)} · orçamento ${formatBudget(budgetAfter??clubs[userClub]?.budget??0)}.`:'';
    pushMessage({category:'competition',type:'season-end',title:`Temporada ${careerSeason} encerrada`,body:`${userClub} terminou em ${position}º na Série ${userDivision}${row?` · ${row.points} pts (${row.wins}V-${row.draws}E-${row.losses}D · saldo ${row.goalDiff>=0?'+':''}${row.goalDiff})`:''}.${prizeLine} Confira acessos, rebaixamentos, campeões e premiação na transição de temporada.`,round:currentRound,meta:{competition:`Brasileirão Série ${userDivision}`}});
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
  const trainingOptions={before:['Preparação tática','Treino leve','Descanso'],after:['Recuperação','Descanso total','Análise do jogo'],free:['Treino equilibrado','Treino técnico','Descanso intermitente']};
  let trainingRules={before:'Preparação tática',after:'Recuperação',free:'Treino equilibrado'};
  if(validSavedSeason&&savedSeason.trainingRules)trainingRules={...trainingRules,...savedSeason.trainingRules};
  else try{trainingRules={...trainingRules,...JSON.parse(localStorage.getItem('matchday-training-rules')||'{}')};}catch{}
  const fatigueEngine=createFatigueEngine({
    clamp,
    getClubs:()=>clubs,
    getUserClub:()=>userClub,
    clubInstitutionalContext,
    getTrainingRules:()=>trainingRules,
    getMatchClub:()=>matchClub(),
  });
  const {
    trainingRecoveryMultiplier,
    recoverPlayers,
    applyTrainingDay,
    applyPreMatchTraining,
    applyMinuteWearToLineup,
  }=fatigueEngine;
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
  document.body.insertAdjacentHTML('beforeend',`<div id="treatmentModal" class="modal hidden"><div class="modal-card treatment-modal"><button id="closeTreatmentModal" class="close" type="button">×</button><label>DECISÃO MÉDICA</label><h2 id="treatmentPlayerName"></h2><p id="treatmentInjuryName" class="treatment-injury-name"></p><p id="treatmentModalText"></p><div class="treatment-actions"><button id="treatmentConservative" type="button">TRATAMENTO CONSERVADOR</button><button id="treatmentSurgery" type="button">CIRURGIA</button></div></div></div>`);
  onClick('#closeTreatmentModal',()=>{if(pendingTreatmentDecision)finishTreatmentChoice('conservative');});
  onClick('#treatmentConservative',()=>finishTreatmentChoice('conservative'));
  onClick('#treatmentSurgery',()=>finishTreatmentChoice('surgery'));
  const isCompletedDashboardGame=game=>game&&(game.completed||game.homeGoals!=null||game.awayGoals!=null);
  let championshipDivision=userDivision;
  let openChampionship=()=>{};
  let calendarView,dashboard;
  calendarView=createCalendarViewFeature({
    $,$$,onClick,writeJson,
    getUserClub:()=>userClub,
    getUserDivision:()=>userDivision,
    getCurrentRound:()=>currentRound,
    getCareerSeason:()=>careerSeason,
    getCareerCalendarDate:()=>careerCalendarDate,
    getChampionshipFixtures:()=>championshipFixtures,
    getCopaFixtures:()=>copaDoBrasilFixtures,
    getCalendarGames:()=>calendarGames,
    rebuildCalendarGames,
    getRestConflictCount:()=>restConflictCount,
    calendarIntervalLabel,
    isUserFixture,
    isFixtureCompleted,
    fixtureDetails,
    fixtureResultLabel,
    fixtureDate,
    seasonComplete,
    isUserSeasonIdle,
    nextPendingUserEntry,
    restDaysUntilNextFixture,
    trainingRecoveryMultiplier,
    getSeasonRoundHistory:()=>seasonRoundHistory,
    getTrainingRules:()=>trainingRules,
    setTrainingRule:(type,value)=>{trainingRules[type]=value;},
    getHasCareer:()=>!!savedNewGame,
    openView:viewId=>router.openView(viewId),
    getChampionshipDivision:()=>championshipDivision,
    openChampionship,
    weekBounds,
    formatWeekDay,
    userMatchOnDate,
    isOnPendingMatchDay,
    calendarTrainingMap,
    trainingOptions,
  });
  const {renderCalendar,openCalendarMatchReport,calendarGameResult,openDashboardCalendarView,setSelectedCalendarDate}=calendarView;
  onCupScheduleChanged=calendarView.onCupScheduleChanged;
  dashboard=createDashboardFeature({
    $,$$,onClick,
    getUserClub:()=>userClub,
    getUserDivision:()=>userDivision,
    getCurrentRound:()=>currentRound,
    getCareerSeason:()=>careerSeason,
    getCareerCalendarDate:()=>careerCalendarDate,
    getClubs:()=>clubs,
    getDisplayedLeagueRows:displayedLeagueRows,
    getFutureMatches:()=>futureMatches,
    isUserFixture,
    isFixtureCompleted,
    seasonComplete,
    isUserSeasonIdle,
    nextPendingUserEntry,
    pendingUserSchedule,
    fixtureDetails,
    fixtureCompetitionLabel,
    displayedClubPosition,
    sameCalendarDay,
    daysUntilNextFixtureFromToday,
    restDaysUntilNextFixture,
    leagueUserGameForRound,
    isKnockoutShootoutCompetition,
    knockoutCompetitionLabel,
    leadersFor,
    getSeasonRoundHistory:()=>seasonRoundHistory,
    getCopaFixtures:()=>copaDoBrasilFixtures,
    getNationalCompetitions:()=>nationalCompetitions,
    openCalendarMatchReport,
    calendarGameResult,
    isCompletedDashboardGame,
    fixtureDate,
    getUserSerieDGroupIndex:()=>userSerieDGroupIndex,
  });
  const {renderDashboardMiniTable,renderDashboardUpcoming,renderUserMatchPresentation,renderLeaders,renderRecentResults}=dashboard;
  calendarView.init(initialCalendarDate);
  dashboard.init();
  economyUi=createEconomyFeature({
    $,
    onClick,
    listUpgrades,
    listStadiumUpgrades,
    purchaseUpgrade,
    purchaseStadiumUpgrade,
    formatBudget,
    formatCapacity,
    formatTicketPrice,
    getBalance,
    ensureStadium,
    getTicketPrices,
    adjustTicketPrice,
    estimateGateReceipt,
    getSponsors,
    getStructureLevel,
    getPitchLevel,
    maxPitchForStructure,
    pitchTierLabel,
    TICKET_PRICE_RANGE,
    getUserClub:()=>userClub,
    getClubs:()=>clubs,
    getUserDivision:()=>userDivision,
    getCareerSeason:()=>careerSeason,
    onBudgetChanged:()=>{renderClubBudget();persistSeason();updateMessageBadge();renderDashboardMessagesFeed();},
    pushMessage,
    getCurrentRound:()=>currentRound,
    openView:viewId=>router.openView(viewId),
  });
  economyUi.init();
  router.onView('office',()=>economyUi.renderOffice());
  router.onView('stadium',()=>economyUi.renderStadium());
  router.onView('training',()=>calendarView.renderTrainingRules());
  const refreshSeasonPresentation=()=>{
    reconcileCurrentRound();
    rebuildCalendarGames();
    futureMatches=currentRoundFixtures();
    refreshUserFixtures();
    leagueData.sort((a,b)=>b.points-a.points||b.goalDiff-a.goalDiff||b.wins-a.wins);
    leagueData.forEach((row,index)=>clubs[row.club].position=index+1);
    $('#leagueTable').innerHTML=displayedLeagueRows().map(leagueRow).join('');
    renderDashboardMiniTable();
    renderDashboardUpcoming();
    $('.upcoming-dashboard label em').textContent=`RODADA ${currentRound}`;
    renderUserMatchPresentation();
    renderClubBudget();
    renderNationalRanking();
    renderCalendar(); renderLeaders(); renderRecentResults();
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
    directRedDismissalType,
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
  const suggestFormationLineup=(targetFormation,liveCards)=>{
    const roles=formationRoles[targetFormation]||formationRoles['4-3-3'],current=squad.slice(0,11),activeSlots=roles.map((_,slot)=>slot).filter(slot=>!liveCards?.[slot]?.red),activePlayers=activeSlots.map(slot=>current[slot]),assignment=lineupForRoles(activePlayers,roles,activeSlots),moves=activeSlots.filter(slot=>assignment.get(slot)&&assignment.get(slot)!==current[slot]).map(slot=>({player:assignment.get(slot),role:roles[slot]}));
    tactics?.openFormationSuggestion?.(targetFormation,liveCards,moves);
  };
  const DEFAULT_USER_TACTICS={mentality:50,possession:50,press:50,offsideLine:50};
  let tactics;
  let draw=()=>{},drawBoard=()=>{},renderTacticRoster=()=>{},renderSubstitutionControls=()=>{},makeSubstitution=()=>{},syncTactics=()=>{},applyTacticSuggestion=()=>{},closeFormationSuggestion=()=>{},tacticFor;
  clubs[userClub].roster=squad;
  Object.values(clubs).filter(club=>club.name!==userClub).forEach(club=>orderRosterForFormation(club.roster,club.formation));
  const fieldMarkup='<div class="field-markings"><i class="mid-line"></i><i class="centre-circle"></i><i class="centre-spot"></i><i class="area area-top"></i><i class="area area-bottom"></i><i class="six-yard six-top"></i><i class="six-yard six-bottom"></i><i class="spot spot-top"></i><i class="spot spot-bottom"></i><i class="goal goal-top"></i><i class="goal goal-bottom"></i></div>';

  const matchLiveUi=createMatchLiveUiFeature({
    $,onClick,clamp,fieldMarkup,
    getMinute:()=>minute,
    getMatchStarted:()=>matchStarted,
    getMatchFinished:()=>matchFinished,
    getPreMatchPreparation:()=>preMatchPreparation,
    getHalftimeShown:()=>halftimeShown,
    getShootoutState:()=>shootoutState,
    getScores:()=>calendarLiveScores(),
    getUserClub:()=>userClub,
    fixtureDetails,
    formatVenueCrowdLine,
    clubCrestInitials,
    getMatchClub:()=>matchClub(),
    getStats:()=>stats,
    getCards:()=>cards,
    getFormations:()=>formations,
    getTactics:()=>tactics,
    playerNameCell,
    fatigueCell,
    getPauses:()=>pauses,
    incrementPauses:()=>++pauses,
    openPreparation:title=>openPreparation(title),
    renderStats:()=>renderStats(),
  });
  matchLiveUi.injectOpponentModal();
  const renderLiveMatchHeader=matchLiveUi.renderHeader;
  const score=matchLiveUi.score;
  const log=matchLiveUi.log;
  const renderLiveOpponent=matchLiveUi.renderLiveOpponent;
  const bindLiveActions=matchLiveUi.bindLiveActions;
  const updateLiveMatchClock=matchLiveUi.updateClock;
  
  
  
  
  
  
  
  
  
  
  
  
  
  document.body.insertAdjacentHTML('beforeend',`<div id="teamScoutModal" class="modal hidden"><div class="modal-card scout-modal"><button id="closeTeamScout" class="close">×</button><label>ANÁLISE DO CLUBE</label><h2 id="scoutClubName"></h2><p id="scoutClubMeta"></p><div class="scout-layout"><div class="scout-roster"><h3>Titulares</h3><div id="scoutStarters"></div><h3>Reservas</h3><div id="scoutBench"></div></div><div class="scout-side"><div class="pause-pitch tactical-board scout-pitch">${fieldMarkup}<div id="scoutPitchPlayers"></div></div><section id="scoutSummary" class="club-summary"><div class="summary-top"><div class="overall-box"><small>OVERALL</small><strong id="scoutOverall"></strong></div><div id="scoutEnvironment" class="environment-gauge"><div><strong></strong><small>AMBIENTE</small></div></div></div><div class="leader-table"><small>DESTAQUES DA TEMPORADA</small><div><span>ARTILHEIRO</span><b id="scoutScorer"></b><em id="scoutGoals"></em></div><div><span>ASSISTÊNCIAS</span><b id="scoutAssistant"></b><em id="scoutAssists"></em></div></div></section></div></div></div></div>`);
  
  
  
  // Padrão único para todas as tabelas e listagens geradas pelo jogo.
  
  
  
  const analysisTable=(title,players,numbered=false)=>`<section class="analysis-roster"><h3>${title}</h3><div class="analysis-head"><span>JOGADOR</span><span>POS.</span><span>OVR</span><span>CANSAÇO</span></div>${players.map((player,index)=>`<div class="analysis-player">${playerNameCell(player.name,player,{prefix:numbered?(index+1)+'. ':''})}<span>${player.pos}</span><span>${player.overall}</span>${fatigueCell(player)}</div>`).join('')}</section>`;
  const openScout=name=>{const club=clubs[name], roster=club.roster, coords=formations[club.formation]||formations['4-3-3'], overall=Math.round(roster.slice(0,11).reduce((sum,p)=>sum+p.overall,0)/11), leaders=clubSeasonLeaders(name);$('#scoutClubName').textContent=club.name;$('#scoutClubMeta').textContent=`${club.formation} · ${club.style} · Mentalidade ${club.mentality} · ${club.position}º na tabela`;$('#scoutOverall').textContent=overall;setIndicatorTone($('#scoutEnvironment'),club.environment);$('#scoutEnvironment').style.setProperty('--environment',club.environment);$('#scoutEnvironment strong').textContent=`${club.environment}%`;$('#scoutScorer').textContent=leaders.scorer.name;$('#scoutGoals').textContent=`${leaders.goals} G`;$('#scoutAssistant').textContent=leaders.assistant.name;$('#scoutAssists').textContent=`${leaders.assists} A`;$('#scoutStarters').innerHTML=analysisTable('TITULARES',roster.slice(0,11),true);$('#scoutBench').innerHTML=analysisTable('RESERVAS',roster.slice(11));$('#scoutPitchPlayers').innerHTML=coords.map((p,i)=>`<div class="board-player" style="left:${p[0]}%;top:${p[1]===91?88:p[1]}%"><i style="--energy:${clamp(roster[i].fatigue,0,100)}%"><span>${i+1}</span></i><small>${roster[i].name}</small></div>`).join('');$('#teamScoutModal').classList.remove('hidden');};
  const openClubFromTable=target=>{const clubTarget=target.closest?.('[data-club]'),name=clubTarget?.dataset.club;if(!name||!clubs[name])return false;openScout(name);return true;};
  document.addEventListener('click',event=>openClubFromTable(event.target));
  document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&openClubFromTable(event.target))event.preventDefault();});
  
  
  
  
  document.body.insertAdjacentHTML('beforeend',`<div id="championshipModal" class="modal hidden"><div class="modal-card championship-modal"><button id="closeChampionship" class="close">×</button><label id="championshipDivisionLabel">CAMPEONATO BRASILEIRO · SÉRIE A</label><h2>Brasileirão 2026</h2><small id="championshipFormat" class="championship-format"></small><div id="divisionTabs" class="division-tabs">${Object.keys(divisionRules).map(division=>`<button data-division="${division}">SÉRIE ${division}</button>`).join('')}<button data-competition="CUP">COPA DO BRASIL</button></div><div class="championship-grid"><section><h3>Tabela</h3><div class="champ-head"><span>#</span><span>CLUBE</span><span>J</span><span>V</span><span>E</span><span>D</span><span>SG</span><span>PTS</span></div><div id="championshipTable"></div></section><aside class="championship-sidebar"></aside></div></div></div>`);
  let championshipRoundView=currentRound,championshipGroupView=userSerieDGroupIndex,championshipLeaderMode='scorers';
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
  openChampionship=(division=championshipDivision)=>{
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
  const buildTacticalRatings=(tv,clubFormation,roster,institution,isHome,factor,{improvisation=0,tacticalRatingExtra=0}={})=>{
    const avg=key=>roster.reduce((sum,p)=>sum+matchPlayerStat(p,key),0)/roster.length;
    const mentalShift=(tv.mentality-50)/50,possessionShift=(tv.possession-50)/50,pressShift=tv.press/100,lineShift=(tv.offsideLine-50)/50;
    const shape=formationPerformance[clubFormation]||{attack:0,passing:0,defense:0},formationBonus=[shape.attack,shape.passing,shape.defense];
    const mentalBonus=[mentalShift*9,mentalShift*2.5,mentalShift*-5.5];
    const styleBonus=[2.4-possessionShift*2.6+pressShift*1.75,possessionShift*6.5+pressShift*.75,(1-possessionShift)*.9+pressShift*3.5];
    const lineDefenseBonus=-lineShift*2.1;
    const tiredness=(100-avg('fatigue'))/5;
    const homeBoost=isHome?{overall:.65,attack:1.1,passing:.35,defense:.45}:{overall:0,attack:0,passing:0,defense:0};
    const overallTacticBonus=mentalShift*1.4+possessionShift*1+pressShift*.55-lineShift*.35;
    const keeper=roster.find(player=>player.pos==='GOL')||roster[0];
    return {
      overall:(avg('overall')-(100-avg('fatigue'))*.10+tacticalRatingExtra+overallTacticBonus-improvisation*.7+institution.overall+homeBoost.overall)*factor,
      attack:(avg('finishing')*.48+avg('speed')*.17+avg('dribble')*.12+avg('playmaking')*.23+formationBonus[0]+mentalBonus[0]+styleBonus[0]+institution.attack-tiredness-improvisation*.85+homeBoost.attack)*factor,
      passing:(avg('passing')*.6+avg('playmaking')*.4+formationBonus[1]+mentalBonus[1]+styleBonus[1]+institution.passing-tiredness-improvisation*1.05+homeBoost.passing)*factor,
      defense:(avg('marking')*.52+avg('tackling')*.48+formationBonus[2]+mentalBonus[2]+styleBonus[2]+lineDefenseBonus+institution.defense-tiredness-improvisation*.9+homeBoost.defense)*factor,
      keeper:(matchPlayerStat(keeper,'reflexes')*.6+matchPlayerStat(keeper,'positioning')*.4+institution.keeper-tiredness)*factor,
    };
  };
  const profile = () => {
    const tv=tactics?.getTacticalValues?.()??DEFAULT_USER_TACTICS;
    const institution=clubInstitutionalContext(clubs[userClub],nextUserGame?.home===userClub);
    const factor=matchFactors?.home || 1;
    const tacticalRating=(formation==='4-3-3'||formation==='4-4-2'||formation==='4-2-3-1'?1:.35)+(1-Math.abs((tv.mentality-50)/50)*.35)+(tv.possession>60?.9:tv.press>65?.65:.45);
    return buildTacticalRatings(tv,formation,starters(),institution,nextUserGame?.home===userClub,factor,{improvisation:positionalPenalty(),tacticalRatingExtra:tacticalRating});
  };
  const opponent = {overall:75, attack:76, passing:74, defense:75, keeper:76};
  const opponentForMatch = () => {
    const club=matchClub();
    if(!club?.roster?.length)return {...opponent};
    const roster=club.roster.slice(0,11), factor=matchFactors?.away || 1;
    const institution=clubInstitutionalContext(club,nextUserGame?.home===club.name);
    const tv=roundTactic(club);
    const defenders=Number(club.formation[0])||4;
    const tacticalRating=(defenders===4?1:.35)+(club.mentality==='Equilibrada'?1:0)+(club.style==='Posse de bola'?1:club.style==='Pressão alta'?.55:.35);
    return buildTacticalRatings(tv,club.formation,roster,institution,nextUserGame?.home===club.name,factor,{tacticalRatingExtra:tacticalRating});
  };
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
  tacticFor=side=>{
    if(tactics?.tacticFor)return tactics.tacticFor(side);
    if(side==='home')return{formation,mentality:DEFAULT_USER_TACTICS.mentality,possession:DEFAULT_USER_TACTICS.possession,press:DEFAULT_USER_TACTICS.press,offsideLine:DEFAULT_USER_TACTICS.offsideLine};
    const club=matchClub();
    const base=roundTactic(club);
    return{...base,mentality:club.mentality==='Defensiva'?25:club.mentality==='Ofensiva'?75:50,possession:club.style==='Posse de bola'?78:club.style==='Contra-ataque'?22:50,press:club.style==='Pressão alta'?82:club.mentality==='Defensiva'?35:55};
  };
  const tacticalDiscipline = side => {
    const tactic=tacticFor(side), defenders=Number(tactic.formation[0]) || 4;
    const club=side==='home'?clubs[userClub]:matchClub();
    const institution=clubInstitutionalContext(club,nextUserGame?.home===club.name);
    const scoreDiff=side==='home' ? home-away : away-home;
    // Blocos baixos e linhas de cinco defendem mais lances; pressão alta também
    // amplia o número de duelos. Quem está atrás no placar arrisca mais.
    const defensiveMind=clamp((50-tactic.mentality)/50,0,1), counterBias=clamp((50-tactic.possession)/50,0,1), pressure=tactic.press/100;
    return (defenders-3)*.035 + defensiveMind*.09 + pressure*.14 + counterBias*.045 + (scoreDiff<0?.055:0) - activeYellows(side)*.016 + institution.discipline;
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
  let timer, minute, home, away, pauses, stats, cards, halftimeShown, pendingPenalty, shootoutState=null, matchFactors, goals, disciplineEvents, matchStarted=false, matchFinished=false, preMatchPreparation=false, substitutions=0, awaySubstitutions=0, awaySubWindows=0, substitutedOut=new Set(), activePreparationTitle='', matchDiscipline={home:new Map(),away:new Map()},liveInjuries={home:[],away:[]},liveDeferredInjuries={home:[],away:[]},liveOpeningLineup={home:[],away:[]},liveMinutesPlayed={home:new Map(),away:new Map()},availabilityCommitted=false,roundResultMessagePushed=false,preMatchTacticSnapshot=null;
  const liveDayMatches=createLiveDayMatchesFeature({
    $, $$, onClick, clamp,
    getLiveMatchGame: () => liveMatchGame,
    getMinute: () => minute,
    getGoals: () => goals,
    getPreMatchPreparation: () => preMatchPreparation,
    getMatchFinished: () => matchFinished,
    getHalftimeShown: () => halftimeShown,
    getUserClub: () => userClub,
    getUserDivision: () => userDivision,
    getCurrentRound: () => currentRound,
    getClubs: () => clubs,
    getNationalCompetitions: () => nationalCompetitions,
    getCopaDoBrasilFixtures: () => copaDoBrasilFixtures,
    getSerieDGroups: () => serieDGroups,
    getUserSerieDGroupIndex: () => userSerieDGroupIndex,
    SERIE_D_GROUP_ROUNDS,
    isUserFixture,
    isKnockoutShootoutCompetition,
    fixtureDetails,
    fixtureDateFor,
    calendarKey,
    simulateRoundMatch,
    getCareerCalendarDate: () => careerCalendarDate,
    getSeasonRoundHistory: () => seasonRoundHistory,
    getCompetitionRoundHistory: () => competitionRoundHistory,
    getCareerSeed: () => savedNewGame?.seed,
  });
  const modal = $('#matchModal'), timeline = $('#timeline');
  const stopMatchClock=()=>{clearInterval(timer);matchLiveUi.stopLiveSecondTimer();};
  startMatchClock=()=>{stopMatchClock();timer=setInterval(tick,optionsUi.getPaceMs());if(matchStarted&&!matchFinished&&!preMatchPreparation)matchLiveUi.startLiveSecondTimer();updateLiveMatchClock();};
  const userAtHomeInLiveMatch=()=>!liveMatchGame||liveMatchGame.home===userClub;
  const calendarLiveScores=()=>userAtHomeInLiveMatch()?{home,away}:{home:away,away:home};
  const calendarLiveSideStats=()=>userAtHomeInLiveMatch()?{home:stats.home,away:stats.away}:{home:stats.away,away:stats.home};
  const calendarLiveSideGoals=()=>userAtHomeInLiveMatch()?{home:goals.home,away:goals.away}:{home:goals.away,away:goals.home};
  const ensureTacticalConfrontationSlots=()=>{
    if(!$('#tacticalConfrontationPause')&&$('#pausePanel')){
      const heading=$('#pausePanel .pause-heading');
      if(heading)heading.insertAdjacentHTML('afterend','<div id="tacticalConfrontationPause"></div>');
    }
    if(!$('#tacticalConfrontationTactics')&&$('#tactics .controls')){
      $('#tactics .controls').insertAdjacentHTML('afterbegin','<div id="tacticalConfrontationTactics"></div>');
    }
  };
  const renderTacticalConfrontation=()=>{
    // Confronto tático oculto — pré-jogo, pausa, táticas e estatísticas ao vivo.
    ensureTacticalConfrontationSlots();
    const pauseSlot=$('#tacticalConfrontationPause');
    const tacticsSlot=$('#tacticalConfrontationTactics');
    if(pauseSlot)pauseSlot.innerHTML='';
    if(tacticsSlot)tacticsSlot.innerHTML='';
  };
  const percent = (a,b) => b ? `${Math.round(a / b * 100)}%` : '0%';
  const calendarPossessionPair = () => {
    // Faixa alinhada ao motor ao vivo (posse típica BR ~36–64, com vermelho um pouco mais larga).
    const userShare = clamp(Number(stats?.home?.possession) || 50, 30, 70);
    const homeShare = Math.round(userAtHomeInLiveMatch() ? userShare : 100 - userShare);
    return { home: homeShare, away: 100 - homeShare };
  };
  const renderStats = () => {
    const {home:h,away:a}=calendarLiveSideStats(),{home:hp,away:ap}=calendarPossessionPair();
    const rows = [['Posse de bola',`${hp}%`,`${ap}%`,'possession'],['Passes','','','group'],['Total de Passes',h.passes,a.passes],['% passes certos',percent(h.accurate,h.passes),percent(a.accurate,a.passes)],['Passes errados',h.passes-h.accurate,a.passes-a.accurate],['Ataque','','','group'],['Finalizações',h.shots,a.shots],['Para Fora',h.off,a.off],['No Gol',h.on,a.on],['Defendidas',h.saved,a.saved],['Pênaltis',h.penalties,a.penalties],['Escanteios',h.corners,a.corners],['Impedimentos',h.offsides,a.offsides],['Defesa','','','group'],['Defesas do Goleiro',h.keeperSaves,a.keeperSaves],['Desarmes',h.tackles,a.tackles],['Faltas Cometidas',h.fouls,a.fouls],['Cartões Amarelos',h.yellow,a.yellow,'yellow'],['Cartões Vermelhos',h.red,a.red,'red']];
    const statsBody=rows.map(r => r[3] === 'group' ? `<div class="stat-group">${r[0]}</div>` : `<div class="stat ${r[3] || ''}"><span>${r[1]}</span><span>${r[0]}</span><span>${r[2]}</span></div>`).join('');
    $('#stats').innerHTML=statsBody;
    renderLiveOpponent?.();
  };
  tactics=createTacticsFeature({
    $,$$,playerNameCell,
    onTacticsChanged:()=>{renderTacticalConfrontation({context:'tactics'});if(matchStarted&&!matchFinished&&!preMatchPreparation&&$('#stats')&&!$('#stats').classList.contains('hidden'))renderStats();},
    getFormations:()=>formations,
    getFormationRoles:()=>formationRoles,
    getFormationNotes:()=>formationNotes,
    getUserClub:()=>userClub,
    getClubs:()=>clubs,
    getHasCareer:()=>!!savedNewGame,
    getSquad:()=>squad,
    getFormation:()=>formation,
    setFormation:next=>{formation=next;clubs[userClub].formation=next;},
    getPositionAssignments:()=>positionAssignments,
    setPositionAssignments:next=>{positionAssignments=next;},
    playerUnavailable,
    playerStarterBlocked,
    matchPlayerStat,
    roleAttributeScore,
    lineupForRoles,
    autoSelectUserLineup,
    suggestFormationLineup,
    renderRoster,
    renderStats,
    log,
    getLiveState:()=>({cards,matchStarted,matchFinished,preMatchPreparation,substitutions,substitutedOut,liveDeferredInjuries,liveMinutesPlayed,positionAssignments,activePreparationTitle}),
    commitLiveSubstitution:(outgoingName,{wasInjured=false,wasAtRisk=false}={})=>{
      substitutions++;
      substitutedOut.add(outgoingName);
      if(wasInjured)liveInjuries.home=liveInjuries.home.filter(entry=>entry.name!==outgoingName);
      const injuredStillOnField=cards.home.some(card=>card?.injured);
      const atRiskStillOnField=cards.home.some(card=>card?.playThroughRisk);
      if(activePreparationTitle==='LESÃO'&&wasInjured&&!injuredStillOnField)$('#matchStatus').textContent='Substituição realizada. Retome a partida quando estiver pronto.';
      else if(activePreparationTitle==='ALERTA MÉDICO'&&wasAtRisk&&!atRiskStillOnField)$('#matchStatus').textContent='Substituição realizada. Retome a partida quando estiver pronto.';
    },
    tacticForAway:()=>{
      const club=matchClub();
      const base=roundTactic(club);
      return{...base,mentality:club.mentality==='Defensiva'?25:club.mentality==='Ofensiva'?75:50,possession:club.style==='Posse de bola'?78:club.style==='Contra-ataque'?22:50,press:club.style==='Pressão alta'?82:club.mentality==='Defensiva'?35:55};
    },
  });
  ({draw,drawBoard,renderTacticRoster,renderSubstitutionControls,makeSubstitution,syncTactics,applyTacticSuggestion,closeFormationSuggestion,tacticFor}=tactics);
  tactics.init(validSavedSeason?savedSeason?.userTactics:null);
  autoSelectUserLineup(formation);
  renderRoster();
  refreshUserFixtures();
  draw();
  renderTacticalConfrontation({context:'tactics'});
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
    const h=calendarLiveSideStats().home,a=calendarLiveSideStats().away,{home:hp,away:ap}=calendarPossessionPair();
    const sideGoals=calendarLiveSideGoals();
    const scorers=side=>sideGoals[side].length?sideGoals[side].map(goal=>`<span>${goal.minute}' ${goal.name}</span>`).join(''):'<span>Nenhum gol</span>';
    const rows=[['Posse de bola',`${hp}%`,`${ap}%`],['Total de Passes',h.passes,a.passes],['Finalizações',h.shots,a.shots],['Faltas Cometidas',h.fouls,a.fouls],['Cartões Amarelos',h.yellow,a.yellow],['Cartões Vermelhos',h.red,a.red]];
    const injuryReports=medicalReports.map(item=>item.text);
    const injurySection=injuryReports.length?`<section class="final-injuries"><h3>DIAGNÓSTICOS MÉDICOS</h3>${medicalReports.map(item=>`<p class="${item.outcome==='cleared'?'cleared':item.outcome==='monitoring'?'monitoring':''}">${item.text}</p>`).join('')}</section>`:'';
    const homeClub=(liveMatchGame||nextUserGame)?.home||userClub,awayClub=(liveMatchGame||nextUserGame)?.away||matchClub().name;
    $('#stats').innerHTML=`<section class="final-goals"><h3>GOLS</h3><div><article><b>${homeClub.toUpperCase()}</b>${scorers('home')}</article><article><b>${awayClub.toUpperCase()}</b>${scorers('away')}</article></div></section><section class="final-basic"><h3>ESTATÍSTICAS DA PARTIDA</h3>${rows.map(row=>`<div class="stat"><span>${row[1]}</span><span>${row[0]}</span><span>${row[2]}</span></div>`).join('')}</section>${injurySection}`;
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
      if(savedNewGame)persistSeason(true);
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
  const applyCupFatigue=(game,result)=>fatigueEngine.applyCupFatigue(game,result,applyMatchAvailability);
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
    else games.forEach(clearStaleKnockoutShootout);
    games.forEach(game=>{game.winner=winner;});
    return winner;
  };
  const notifyCupTieResult=(games,winner)=>{games.forEach(game=>{if(game.home!==userClub&&game.away!==userClub)return;const opponent=game.home===userClub?game.away:game.home,scoreLabel=formatKnockoutFixtureScore(game),qualified=winner===userClub;pushMessage({category:'competition',type:'cup',title:`Copa do Brasil · ${game.phase}`,body:`${game.home} ${scoreLabel} ${game.away} · ${qualified?`${userClub} avança de fase`:`${userClub} eliminado por ${opponent}`}`,round:currentRound,meta:{competition:'Copa do Brasil',phase:game.phase}});});};
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
  const buildLiveKnockoutStats=()=>{
    const {home:h,away:a}=calendarLiveSideStats();
    const {home:homeGoals,away:awayGoals}=calendarLiveScores();
    const sideGoals=calendarLiveSideGoals();
    const {home:hp,away:ap}=calendarPossessionPair();
    return {
      homeGoals,
      awayGoals,
      goals:{home:[...sideGoals.home],away:[...sideGoals.away]},
      data:{
        homePossession:hp,awayPossession:ap,
        homePasses:h.passes,awayPasses:a.passes,
        homeAccurate:h.accurate,awayAccurate:a.accurate,
        homeShots:h.shots,awayShots:a.shots,
        homeOnTarget:h.on,awayOnTarget:a.on,
        homeOff:h.off,awayOff:a.off,
        homeSaved:h.saved,awaySaved:a.saved,
        homePenalties:h.penalties,awayPenalties:a.penalties,
        homeOffsides:h.offsides,awayOffsides:a.offsides,
        homeKeeperSaves:h.keeperSaves,awayKeeperSaves:a.keeperSaves,
        homeTackles:h.tackles,awayTackles:a.tackles,
        homeFouls:h.fouls,awayFouls:a.fouls,
        homeYellow:h.yellow,awayYellow:a.yellow,
        homeRed:h.red,awayRed:a.red,
      },
    };
  };
  const buildLiveCupStats=buildLiveKnockoutStats;
  const commitLiveKnockoutResult=()=>{
    if(!liveMatchGame||liveMatchGame.completed||!isKnockoutShootoutCompetition(liveMatchGame))return false;
    Object.assign(liveMatchGame,buildLiveKnockoutStats(),{completed:true});
    clearStaleKnockoutShootout(liveMatchGame);
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
    const gateResult=creditUserHomeGate(liveMatchGame);
    pushUserMatchResultMessage(liveMatchGame,gateResult);
    advancePostMatchDay();
    const restDays=Math.max(1,restDaysUntilNextFixture());
    Object.values(clubs).forEach(club=>orderRosterForFormation(club.roster,club.formation));
    renderRoster();draw();
    advanceCupComputerTies(cupCompetition.stages.find(item=>!item.completed));
    roundCommitted=true;
    persistSeason(true);
    refreshSeasonPresentation();
    $('#roundResultsModal').classList.add('hidden');modal.classList.add('hidden');
    stopMatchClock();matchStarted=false;matchFinished=false;liveMatchGame=null;liveDayMatches.clearSnapshots();roundResults=null;roundResultMessagePushed=false;roundPreviewResults={};roundCommitted=false;
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
      if(!isUserFixture(game)){
        const result=simulateRoundMatch(game.home,game.away);
        return {...result,fixture:game,home:game.home,away:game.away,round:game.round,competition:game.competition};
      }
      const userAtHome=game.home===userClub;
      const result={home:game.home,away:game.away,homeGoals:userAtHome?home:away,awayGoals:userAtHome?away:home,user:true,fixture:game,round:game.round,competition:game.competition,goals:userAtHome?{home:[...goals.home],away:[...goals.away]}:{home:[...goals.away],away:[...goals.home]}};
      if(liveMatchGame&&liveMatchGame.home===game.home&&liveMatchGame.away===game.away){
        Object.assign(result,{penalties:liveMatchGame.penalties,shootoutWinner:liveMatchGame.shootoutWinner,tieId:game.tieId,leg:game.leg,competition:game.competition,data:liveMatchGame.data,completed:isKnockoutShootoutCompetition(game)?true:undefined});
      }
      return result;
    });
    return roundResults;
  };
  
  document.body.insertAdjacentHTML('beforeend',`<div id="roundResultsModal" class="modal hidden"><div class="modal-card round-results-modal"><button id="closeRoundResults" class="close">×</button><label>RODADA CONCLUÍDA</label><h2>Tabela de Jogos</h2><p id="roundResultsMeta"></p><div class="round-results-toolbar"><div id="roundDivisionTabs" class="round-division-tabs"></div><div class="round-context-nav"><div id="roundGroupNav" class="round-group-nav"></div><span id="roundFormat" class="round-format"></span><div id="roundSelector" class="round-selector"></div></div></div><div id="roundGames" class="round-games"></div></div></div>`);
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
  let roundCommitted=false;
  let persistSeasonTimer=null;
  let saveQuotaWarned=false;
  const writeSeasonSave=()=>{
    if(!savedNewGame)return false;
    pruneClubMemory(clubs,nationalRankingEntries);
    const standings=Object.fromEntries(Object.entries(nationalCompetitions).map(([division,competition])=>[division,competition.standings.map(row=>({...row}))]));
    const fatigue=Object.fromEntries(Object.entries(clubs).map(([clubName,club])=>[clubName,Object.fromEntries(club.roster.map(player=>[player.name,Math.round(player.fatigue*10)/10]))]));
    const compactCompetitions=compactCompetitionHistories(competitionRoundHistory,userClub);
    const compactCup={
      currentPhase:cupCompetition.currentPhase,
      champion:cupCompetition.champion,
      stages:cupCompetition.stages.map(stage=>({
        index:stage.index,
        name:stage.name,
        twoLegged:stage.twoLegged,
        entrants:stage.entrants,
        completed:stage.completed,
        winners:stage.winners,
        fixtures:stage.fixtures.map(game=>compactCupFixture(game,userClub)),
      })),
    };
    const availability=slimAvailabilitySnapshot(clubs,userClub);
    const clubMedical=Object.fromEntries(Object.entries(clubs).map(([clubName,club])=>[clubName,{medicalInvestment:club.medicalInvestment??0,preventionProgram:club.preventionProgram??0,pitchCondition:club.pitchCondition||'good',pitchLevel:club.pitchLevel??null,stadiumStructure:club.stadiumStructure??null}]));
    const userClubState=clubs[userClub];
    ensureStadium(userClubState,userDivision);
    const userStadium={
      name:userClubState.stadiumName||'Estádio Solar',
      capacity:userClubState.stadiumCapacity,
      capacityLevel:userClubState.stadiumCapacityLevel??0,
      structure:userClubState.stadiumStructure??0,
      pitchLevel:userClubState.pitchLevel??0,
      pitchCondition:userClubState.pitchCondition||'average',
      ticketPrices:{national:userClubState.ticketPrices?.national,cups:userClubState.ticketPrices?.cups},
    };
    const userSponsors=userClubState.sponsors?{
      season:userClubState.sponsors.season,
      division:userClubState.sponsors.division,
      total:userClubState.sponsors.total,
      credited:!!userClubState.sponsors.credited,
      master:userClubState.sponsors.master?{...userClubState.sponsors.master}:null,
      secondaries:Array.isArray(userClubState.sponsors.secondaries)?userClubState.sponsors.secondaries.map(item=>({...item})):[],
    }:null;
    const rankingEntries=Object.fromEntries(Object.entries(nationalRankingEntries).map(([clubName,entry])=>[clubName,{
      ...entry,
      titles:pruneRankingTitles(entry.titles),
    }]));
    const ok=writeJson(SAVE_KEYS.season,{
      seed:savedNewGame.seed,
      currentRound,
      careerCalendarDate:calendarKey(careerCalendarDate),
      trainingRules:{...trainingRules},
      standings,
      fatigue,
      availability,
      clubMedical,
      userBudget:getBalance(userClubState),
      userBudgetLedger:Array.isArray(userClubState?.budgetLedger)?userClubState.budgetLedger.map(entry=>({...entry})):[],
      userStadium,
      userSponsors,
      userTactics:{...tactics.getTacticalValues()},
      careerMessages:messages.getMessages().map(message=>({...message})),
      scorers:slimLeaderboard(allScorers,'goals'),
      assistants:slimLeaderboard(allAssistants,'assists'),
      serieDGroups,
      dFixtures:nationalCompetitions.D.fixtures,
      dKnockout:nationalCompetitions.D.knockout,
      cupCompetition:compactCup,
      nationalRanking:{formulaVersion:nationalRankingFormulaVersion,entries:rankingEntries,finalizedSeasons:[...nationalRankingFinalizedSeasons]},
      seasonRoundHistory:compactRoundHistory(seasonRoundHistory,userClub),
      competitionRoundHistory:compactCompetitions,
      updatedAt:new Date().toISOString(),
    });
    if(!ok&&!saveQuotaWarned){
      saveQuotaWarned=true;
      console.warn('[matchday] Não foi possível salvar a temporada (memória do navegador cheia).');
    }
    return ok;
  };
  persistSeason=(immediate=false)=>{
    if(!savedNewGame)return;
    if(immediate===true){
      if(persistSeasonTimer){clearTimeout(persistSeasonTimer);persistSeasonTimer=null;}
      writeSeasonSave();
      return;
    }
    if(persistSeasonTimer)clearTimeout(persistSeasonTimer);
    persistSeasonTimer=setTimeout(()=>{
      persistSeasonTimer=null;
      writeSeasonSave();
    },MEMORY_LIMITS.persistDebounceMs);
  };
  dashboard.setPersist(persistSeason);
  calendarView.setPersist(persistSeason);
  tactics.setPersist(persistSeason);
  messages.setPersist(persistSeason);
  if(validSavedSeason&&(savedSeason.currentRound!==currentRound||knockoutShootoutSanitized))persistSeason(true);
  let skipPersistOnUnload=false;
  window.addEventListener('beforeunload',()=>{if(savedNewGame&&!skipPersistOnUnload)persistSeason(true);});
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
        setSelectedCalendarDate(nextDay);
        simulatedDays++;
        persistSeason(true);
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
    setSelectedCalendarDate(careerCalendarDate);
    if(simulatedDays>0){
      persistSeason(true);
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
    setSelectedCalendarDate(careerCalendarDate);
    const reachedTarget=sameCalendarDay(careerCalendarDate,targetDate)&&!isFixtureCompleted(nextEntry.game);
    if(reachedTarget||isOnPendingMatchDay()){
      persistSeason(true);
      pushMatchDayBrief(nextEntry.game);
      refreshSeasonPresentation();
      return {stopped:'match',days:simulatedDays,game:nextEntry.game};
    }
    if(simulatedDays>0){persistSeason(true);refreshSeasonPresentation();}
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
  if(savedNewGame)persistSeason(true);
  const commitLiveAvailability=()=>{
    if(availabilityCommitted||!matchStarted||!liveMatchGame)return;
    const userDisciplineLines=[];
    const userOpponent=liveMatchGame.home===userClub?liveMatchGame.away:liveMatchGame.home;
    const opponentClub=liveMatchGame.home===userClub?liveMatchGame.away:liveMatchGame.home;
    [['home',userClub],['away',opponentClub]].forEach(([side,clubName])=>{
      const club=clubs[clubName];
      matchDiscipline[side].forEach(entry=>userDisciplineLines.push(...applyDisciplineToPlayer(club.roster.find(player=>player.name===entry.name),entry,currentRound,clubName,liveMatchGame)));
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
    applyMatchAvailability(game,game.fixture||game);
  };
  const applySecondaryResult=(game,competition)=>{
    const homeRow=competition.standings.find(row=>row.club===game.home),awayRow=competition.standings.find(row=>row.club===game.away);if(!homeRow||!awayRow)return;
    homeRow.played++;awayRow.played++;homeRow.goalDiff+=game.homeGoals-game.awayGoals;awayRow.goalDiff+=game.awayGoals-game.homeGoals;
    if(game.homeGoals>game.awayGoals){homeRow.wins++;awayRow.losses++;homeRow.points+=3;}else if(game.homeGoals<game.awayGoals){awayRow.wins++;homeRow.losses++;awayRow.points+=3;}else{homeRow.draws++;awayRow.draws++;homeRow.points++;awayRow.points++;}
    if(game.fatigueAfter)[['home',game.home],['away',game.away]].forEach(([side,clubName])=>Object.entries(game.fatigueAfter[side]||{}).forEach(([playerName,value])=>{const player=clubs[clubName].roster.find(candidate=>candidate.name===playerName);if(player)player.fatigue=clamp(value,0,100);}));
    applyMatchAvailability(game,game.fixture||game);
  };
  const simulateNationalRound=()=>Object.keys(nationalCompetitions).filter(division=>division!==userDivision).forEach(division=>{const competition=nationalCompetitions[division],fixtures=competition.fixtures[currentRound-1]||[];if(!fixtures.length)return;const previewKey=`${division}-${currentRound}`,results=roundPreviewResults[previewKey]||fixtures.map(game=>simulateRoundMatch(game.home,game.away));results.forEach(recordGameLeaders);if(division!=='D'||currentRound<=10)results.forEach(game=>applySecondaryResult(game,competition));competition.standings.sort((a,b)=>b.points-a.points||b.goalDiff-a.goalDiff||b.wins-a.wins);competition.standings.forEach((row,index)=>clubs[row.club].position=index+1);competitionRoundHistory[division].push({round:currentRound,games:results.map(game=>compactMatchResult(game,{keepData:false}))});});
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
    Object.entries(champions).forEach(([competition,clubName])=>{if(!clubName)return;const entry=nationalRankingEntries[clubName],label=competition==='CUP'?'COPA DO BRASIL':`SÉRIE ${competition}`,token=`${careerSeason}-${competition}`;if(!entry||entry.titles.some(title=>title.token===token))return;const points=nationalTitleBonuses[competition];entry.titlePoints=roundRankingScore(entry.titlePoints+points);entry.titles.push({token,season:careerSeason,competition:label,points});if(entry.titles.length>MEMORY_LIMITS.rankingTitles)entry.titles=entry.titles.slice(-MEMORY_LIMITS.rankingTitles);});
    nationalRankingFinalizedSeasons.add(careerSeason);renderNationalRanking();
  };
  let pendingDivisionTeams=null,pendingUserDivision=userDivision,nonHumanSimRunning=false,idleSeasonWasSimulated=false;
  const seasonSummary=createSeasonSummaryFeature({
    $,
    clubCrestInitials,
    onStartNextSeason:()=>{
      if(!pendingDivisionTeams||!savedNewGame)return;
      skipPersistOnUnload=true;
      pruneClubMemory(clubs,nationalRankingEntries);
      const nextSave={
        ...savedNewGame,
        division:pendingUserDivision,
        divisionTeams:pendingDivisionTeams,
        userRoster:clubs[userClub].roster.map(player=>({
          ...player,
          fatigue:100,
          injuryHistory:pruneInjuryHistory(player.injuryHistory),
        })),
        clubStatus:{...savedNewGame.clubStatus,budget:clubs[userClub].budget??savedNewGame.clubStatus?.budget??initialBudget(pendingUserDivision)},
        nationalRanking:{
          formulaVersion:nationalRankingFormulaVersion,
          entries:Object.fromEntries(Object.entries(nationalRankingEntries).map(([name,entry])=>[name,{...entry,titles:pruneRankingTitles(entry.titles)}])),
          finalizedSeasons:[...nationalRankingFinalizedSeasons],
        },
        season:(savedNewGame.season||2026)+1,
        createdAt:new Date().toISOString(),
        version:4,
      };
      writeJson(SAVE_KEYS.career,nextSave);
      clearSeasonSave();
      pendingDivisionTeams=null;
      seasonSummary.close();
      redirectGame();
    },
  });
  seasonSummary.init();
  const ranked=division=>[...nationalCompetitions[division].standings].sort((a,b)=>b.points-a.points||b.wins-a.wins||b.goalDiff-a.goalDiff).map(row=>row.club);
  const playoffEdge=(first,second,division)=>{const table=nationalCompetitions[division].standings,a=table.find(row=>row.club===first),b=table.find(row=>row.club===second),aScore=a.points+clubs[first].power*.18+rnd(-2.5,2.5),bScore=b.points+clubs[second].power*.18+rnd(-2.5,2.5);return aScore>=bScore?first:second;};
  const finishRemainingNationalRounds=fromRound=>{for(let round=fromRound;round<=38;round++)['A','B','C'].forEach(division=>{const competition=nationalCompetitions[division],fixtures=competition.fixtures[round-1]||[],results=fixtures.map(game=>simulateRoundMatch(game.home,game.away));results.forEach(recordGameLeaders);results.forEach(game=>applySecondaryResult(game,competition));competitionRoundHistory[division].push({round,games:results.map(game=>compactMatchResult(game,{keepData:false}))});});Object.values(nationalCompetitions).forEach(competition=>competition.standings.sort((a,b)=>b.points-a.points||b.wins-a.wins||b.goalDiff-a.goalDiff));};
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
    const userStatus=userPromoted?'promoted':userRelegated?'relegated':'neutral';
    const position=displayedClubPosition(userClub);
    const leagueChampion=champions[userDivision];
    const serieDPhase=userDivision==='D'?resolveSerieDPrizePhase(userClub,dKnockout):null;
    const cupPhase=resolveCupPrizePhase(userClub,cupCompetition);
    const prize=computeSeasonPrize({division:userDivision,position,totalTeams:divisionTeams[userDivision]?.length||20,champion:leagueChampion,cupChampion:champions.CUP,promoted:userPromoted,userClub,serieDPhase,cupPhase});
    const userClubState=clubs[userClub];
    ensureBudget(userClubState,userDivision);
    credit(userClubState,prize.total,{reason:'season_prize',label:`Premiação temporada ${careerSeason}`,meta:{lines:prize.lines}});
    const budgetAfter=getBalance(userClubState);
    const leadersByDivision={
      A:{scorers:leadersFor('A','scorers'),assistants:leadersFor('A','assists')},
      B:{scorers:leadersFor('B','scorers'),assistants:leadersFor('B','assists')},
      C:{scorers:leadersFor('C','scorers'),assistants:leadersFor('C','assists')},
      D:{scorers:leadersFor('D','scorers'),assistants:leadersFor('D','assists')},
      CUP:{scorers:championshipLeadersFor('CUP','scorers'),assistants:championshipLeadersFor('CUP','assists')},
    };
    pushSeasonEndBrief({prizeTotal:prize.total,budgetAfter});
    persistSeason();
    renderClubBudget();
    seasonSummary.open({
      userClub,
      careerSeason,
      userLine,
      idleNote,
      userStatus,
      champions,
      leadersByDivision,
      seasonRewards:{total:prize.total,lines:prize.lines,budgetAfter},
      formatBudget,
      movements:[
        {title:'Série B → Série A',clubs:promB,type:'promote'},
        {title:'Série A → Série B',clubs:relA,type:'relegate'},
        {title:'Série C → Série B',clubs:promC,type:'promote'},
        {title:'Série B → Série C',clubs:relB,type:'relegate'},
        {title:'Série D → Série C',clubs:promD,type:'promote'},
        {title:'Série C → Série D',clubs:relC,type:'relegate'},
      ],
    });
  };
  const advancePostMatchDay=()=>{
    const nextDay=new Date(careerCalendarDate);
    nextDay.setDate(nextDay.getDate()+1);
    nextDay.setHours(12,0,0,0);
    if(nextDay>seasonEndDate())return;
    applyTrainingDay(trainingTypeForDate(nextDay));
    advanceCareerCalendarTo(nextDay);
    advanceCupThroughDate(nextDay);
    setSelectedCalendarDate(careerCalendarDate);
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
      const gateResult=creditUserHomeGate(liveMatchGame);
      if(liveMatchGame&&isKnockoutShootoutCompetition(liveMatchGame))commitLiveKnockoutResult();
      pushUserMatchResultMessage(liveMatchGame,gateResult);
      const alreadyRecorded=seasonRoundHistory.some(item=>item.round===currentRound);
      if(!alreadyRecorded){
        // Primeiro são cumpridas as ausências que pertenciam à rodada disputada;
        // depois entram em vigor as novas suspensões e lesões deste jogo.
        const roundParticipants=new Set(Object.values(nationalCompetitions).flatMap(competition=>(competition.fixtures[currentRound-1]||[]).flatMap(game=>[game.home,game.away])));
        const restDays=intervalDaysForRoundAdvance();
        serveDisciplineSuspensionsForRound();
        serveAvailability(restDays,roundParticipants);
        commitLiveAvailability();
        const completedGames=simulateRoundResults(true);
        completedGames.forEach(recordGameLeaders);if(userDivision!=='D'||currentRound<=10)completedGames.forEach(applyRoundToTable);
        simulateNationalRound();
        seasonRoundHistory.push({
          round:currentRound,
          games:completedGames.map(game=>compactMatchResult(game,{keepData:involvesClub(game,userClub)})),
          userStats:{home:{...stats.home},away:{...stats.away},goals:{home:[...goals.home],away:[...goals.away]}},
        });
        updateSeriesDKnockout(currentRound);
        Object.values(clubs).forEach(club=>orderRosterForFormation(club.roster,club.formation));
        renderRoster();draw();
        recoverPlayers(Math.max(1,Math.round(restDays*trainingRecoveryMultiplier('after'))));
        advancePostMatchDay();
      }
      const completedSeason=currentRound===38||(userDivision==='D'&&currentRound===22);if(userDivision==='D'&&currentRound===22)finishRemainingNationalRounds(23);
      if(!alreadyRecorded)currentRound++;
      reconcileCurrentRound();
      const cupReferenceDate=completedSeason?new Date(careerSeason,11,31,12):fixtureDate(clamp(currentRound,1,championshipFixtures.length));
      advanceCupThroughDate(cupReferenceDate);
      if(completedSeason)finalizeNationalRankingSeason();
      persistSeason(true);
      refreshSeasonPresentation();
      $('#roundResultsModal').classList.add('hidden');modal.classList.add('hidden');
      stopMatchClock();matchStarted=false;matchFinished=false;liveMatchGame=null;liveDayMatches.clearSnapshots();roundResults=null;roundResultMessagePushed=false;roundPreviewResults={};
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
      seasonRoundHistory.push({
        round:currentRound,
        games:completedGames.map(game=>compactMatchResult(game,{keepData:involvesClub(game,userClub)})),
        userStats:null,
      });
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
  const simulateNonHumanSeasonRemainder=()=>{
    if(nonHumanSimRunning)return;
    if(seasonComplete()){prepareSeasonTransition();return;}
    if(!isUserSeasonIdle())return;
    nonHumanSimRunning=true;
    seasonSummary.openIdleSim();
    seasonSummary.setIdleSimStatus(`Rodada ${currentRound} de ${seasonMaxRound()}…`);
    $$('.nav').find(button=>button.dataset.view==='dashboard')?.click();
    const maxRound=seasonMaxRound();
    const step=()=>{
      try{
        if(currentRound>maxRound){
          idleSeasonWasSimulated=true;
          finalizeNationalRankingSeason();
          persistSeason(true);
          refreshSeasonPresentation();
          seasonSummary.closeIdleSim();
          nonHumanSimRunning=false;
          prepareSeasonTransition();
          return;
        }
        seasonSummary.setIdleSimStatus(`Simulando rodada ${currentRound} de ${maxRound}…`);
        const finished=simulateIdleRound();
        persistSeason();
        if(finished||currentRound>maxRound){
          idleSeasonWasSimulated=true;
          finalizeNationalRankingSeason();
          persistSeason(true);
          refreshSeasonPresentation();
          seasonSummary.closeIdleSim();
          nonHumanSimRunning=false;
          prepareSeasonTransition();
          return;
        }
        // Yield ao browser para atualizar o overlay entre blocos de rodadas.
        setTimeout(step,0);
      }catch(error){
        console.error('Falha ao simular restante da temporada',error);
        seasonSummary.closeIdleSim();
        nonHumanSimRunning=false;
        persistSeason(true);
        refreshSeasonPresentation();
      }
    };
    setTimeout(step,0);
  };
  const awayBenchPlayers=()=>matchClub().roster.slice(11).filter(candidate=>!playerUnavailable(candidate)&&!liveInjuries.away.some(item=>item.name===candidate.name)&&!liveDeferredInjuries.away.some(item=>item.name===candidate.name));
  const replaceAwayPlayer=(index,incoming,minute,tag='substitution')=>{
    const club=matchClub();
    if(awaySubstitutions>=5||!incoming||index<0)return false;
    const outgoing=club.roster[index];
    const incomingIndex=club.roster.indexOf(incoming);
    if(incomingIndex<11||!outgoing)return false;
    [club.roster[index],club.roster[incomingIndex]]=[incoming,outgoing];
    cards.away[index]={yellow:0,red:false,dismissal:null,injured:false,playThroughRisk:false,minuteLimitWarned:false};
    incoming.fatigue=clamp(incoming.fatigue-minute*.02,0,100);
    liveMinutesPlayed.away.set(incoming.name,liveMinutesPlayed.away.get(incoming.name)??0);
    awaySubstitutions++;
    log(`${club.name}: sai ${outgoing.name}, entra ${incoming.name}${incoming.pos!==outgoing.pos?' improvisado na função':''}.`,tag);
    return true;
  };
  const maxAwaySubWindows=()=>(away<home&&minute>=70?4:3);
  const buildLiveAwaySubState=()=>({name:matchClub().name,lineup:matchClub().roster.slice(0,11),fatigue:new Map(matchClub().roster.slice(0,11).map(player=>[player.name,player.fatigue])),minutesPlayed:liveMinutesPlayed.away,deferredInjuries:liveDeferredInjuries.away,homeGoals:home,awayGoals:away});
  const makeAwayFatigueSubstitution=()=>{
    if(!matchStarted||preMatchPreparation||matchFinished||awaySubstitutions>=5||awaySubWindows>=maxAwaySubWindows())return;
    const chasing=away<home;
    const windows=[55,...engineTuning.subWindows,...(chasing?engineTuning.subChaseWindows:[])];
    if(!windows.includes(minute))return;
    const bench=awayBenchPlayers();
    if(!bench.length)return;
    const lineup=matchClub().roster.slice(0,11);
    const state=buildLiveAwaySubState();
    const active=lineup.map((player,index)=>({player,index})).filter(({player,index})=>!cards.away[index]?.red&&!cards.away[index]?.injured&&player.pos!=='GOL');
    const outgoingEntry=[...active].sort((a,b)=>substitutionPriority(state,'away',b.player,minute)-substitutionPriority(state,'away',a.player,minute))[0];
    if(!outgoingEntry)return;
    const {player:outgoing,index}=outgoingEntry;
    const fatigue=outgoing.fatigue;
    const priority=substitutionPriority(state,'away',outgoing,minute);
    const need=clamp(.3+(chasing?.28:0)+(minute>=70?.22:0)+Math.max(0,FATIGUE_SUB_THRESHOLD-fatigue)/42+priority/95,(fatigue<FATIGUE_SUB_THRESHOLD?.45:.22),.95);
    if(Math.random()>need)return;
    const expected=outgoing.pos,compatible=bench.filter(candidate=>candidate.pos===expected||(compatibleRoles[expected]||[]).includes(candidate.pos)),candidates=compatible.length?compatible:bench,incoming=[...candidates].sort((a,b)=>b.overall-a.overall||b.fatigue-a.fatigue)[0];
    if(!incoming||!replaceAwayPlayer(index,incoming,minute))return;
    awaySubWindows++;
    renderRoster();drawBoard();renderStats();renderLiveOpponent();
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
    if(!bench.length||awaySubstitutions>=5)return;
    const expected=player.pos,compatible=bench.filter(candidate=>candidate.pos===expected||(compatibleRoles[expected]||[]).includes(candidate.pos)),incoming=[...(compatible.length?compatible:bench)].sort((a,b)=>b.overall-a.overall)[0],incomingIndex=club.roster.indexOf(incoming);
    [club.roster[index],club.roster[incomingIndex]]=[incoming,player];
    cards.away[index]={yellow:0,red:false,dismissal:null,injured:false,playThroughRisk:false,minuteLimitWarned:false};
    liveMinutesPlayed.away.set(incoming.name,liveMinutesPlayed.away.get(incoming.name)??0);
    awaySubstitutions++;
    log(`${club.name} substitui ${player.name} ao atingir limite médico por ${incoming.name}.`,'injury-substitution');
    renderRoster();drawBoard();renderSubstitutionControls();renderStats();
  };
  const applyWear = () => { [[starters(),clubs[userClub],'home'],[matchClub().roster.slice(0,11),matchClub(),'away']].forEach(([lineup,club,side])=>{const wear=clubInstitutionalContext(club,nextUserGame?.home===club.name).wear;applyMinuteWearToLineup({lineup,side,cards,liveMinutesPlayed,wear,onPlayThrough:checkMinuteAggravation,onRehab:enforceLiveRehabLimit});}); makeAwayFatigueSubstitution(); renderRoster(); };
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
    // Vermelho direto: punição de 1 a 3 jogos conforme gravidade da falta.
    const directRed=threat>.90 && type.includes('contra') && Math.random()<.012;
    if(!directRed){ state.yellow++; s.yellow++; }
    if(directRed || state.yellow>=2){
      const dismissalType=directRed?directRedDismissalType({threat,type,zone}):'secondYellow';
      state.red=true;state.dismissal=dismissalType; s.red++;
      disciplineEvents++;
      const gamesLabel=directRed?` Suspenso por ${directRedSuspensionGames({threat,type,zone})} jogo${directRedSuspensionGames({threat,type,zone})===1?'':'s'}.`:'';
      message+=directRed ? ` Cartão vermelho direto.${gamesLabel}` : ' Segundo amarelo: cartão vermelho.';
      log(message,'red');
      matchDiscipline[side].set(fouler,{name:fouler,yellow:0,dismissal:state.dismissal,redContext:directRed?{threat,type,zone}:null});
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
    syncTactics(); drawBoard(); renderSubstitutionControls(); renderTacticalConfrontation({context:'pause'});
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
      setTimeout(()=>{const taker=pickShootoutCpuTaker(club);if(taker)executeShootoutKick(club,taker);},Math.max(450,optionsUi.getPaceMs()*2));
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
    matchLiveUi.resetLiveClockSeconds();
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
    const homeProfile={...homeBase,overall:homeLive,attack:homeBase.attack+(homeLive-homeBase.overall)*.30,passing:homeBase.passing+(homeLive-homeBase.overall)*.26,defense:homeBase.defense+(homeLive-homeBase.overall)*.26-cautionPenalty('home')};
    const awayProfile={...awayBase,overall:awayLive,attack:awayBase.attack+(awayLive-awayBase.overall)*.30,passing:awayBase.passing+(awayLive-awayBase.overall)*.26,defense:awayBase.defense+(awayLive-awayBase.overall)*.26-cautionPenalty('away')};
    // Posse: força + tática + mando real do calendário (não o "home" interno do motor).
    // Alinhado ao match-sim: swings perceptíveis sem extremos irreais (ex.: 62–38 constantes).
    const overallGap=homeLive-awayLive;
    const openingPressure=minute<=15 && Math.abs(overallGap)>5 ? clamp((Math.abs(overallGap)-5)*.55+1.5,1.5,5.5) : 0;
    const homeOpeningBias=overallGap>5 ? openingPressure : overallGap<-5 ? -openingPressure : 0;
    stats.home.momentum=clamp(stats.home.momentum*.88,-12,12);
    stats.away.momentum=clamp(stats.away.momentum*.88,-12,12);
    const homeTactic=tacticFor('home'),awayTactic=tacticFor('away');
    const passRate=team=>stats[team].passes?stats[team].accurate/stats[team].passes:.72;
    const passControl=clamp((passRate('home')-passRate('away'))*4,-1.2,1.2);
    const attackControl=clamp((stats.home.goodAttacks-stats.away.goodAttacks)*.04+(stats.home.attacks-stats.away.attacks)*.015,-1,1);
    const redControl=((cards.away?.filter(card=>card.red).length||0)-(cards.home?.filter(card=>card.red).length||0))*2;
    // Motor home = usuário; o bônus de mando segue o calendário (casa/fora de verdade).
    const venueBias=userAtHomeInLiveMatch()?2.2:-2.2;
    const structuralControl=(homeProfile.passing-awayProfile.passing)*.40+(homeProfile.overall-awayProfile.overall)*.16+(homeTactic.possession-awayTactic.possession)*.10+(homeTactic.press-awayTactic.press)*.03+(homeTactic.mentality-awayTactic.mentality)*.02+(stats.home.momentum-stats.away.momentum)*.12+passControl+attackControl+redControl+homeOpeningBias*.2+venueBias;
    const hasRed=cards.home?.some(card=>card.red)||cards.away?.some(card=>card.red);
    const possMin=hasRed?30:36,possMax=hasRed?70:64;
    const targetPossession=clamp(50+structuralControl,possMin,possMax);
    // Motor: home = usuário, away = adversário. Espelhar visitante (como no match-sim).
    stats.home.possession=stats.home.possession*.78+targetPossession*.22;
    // Âncora suave no volume de passes — posse e estatística de passe ficam coerentes.
    const passTotal=(stats.home.passes||0)+(stats.away.passes||0);
    if(passTotal>=40){
      const passShare=(stats.home.passes/passTotal)*100;
      stats.home.possession=clamp(stats.home.possession*.88+passShare*.12,possMin,possMax);
    }
    stats.away.possession=100-stats.home.possession;
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
    // Não sobrescrever liveMatchGame antes de reabrir partida em andamento/encerrada.
    if(reopenMatchWindow()) return;
    liveMatchGame=nextEntry?.game||nextUserGame;
    renderLiveMatchHeader(liveMatchGame);
    const matchCompKey=fixtureCompetitionKey(liveMatchGame);
    serveCompetitionSuspensions(clubs,new Set([userClub,matchClub().name]),matchCompKey,currentRound);
    orderRosterForFormation(squad,formation);orderRosterForFormation(matchClub().roster,matchClub().formation);
    matchStarted=true; matchFinished=false; preMatchPreparation=true; minute=0;home=0;away=0;pauses=0;halftimeShown=false;pendingPenalty=null;shootoutState=null;disciplineEvents=0;substitutions=0;awaySubstitutions=0;awaySubWindows=0;substitutedOut=new Set();roundResults=null;roundResultMessagePushed=false;postMatchMedicalQueue=[];matchDiscipline={home:new Map(),away:new Map()};liveInjuries={home:[],away:[]};liveDeferredInjuries={home:[],away:[]};liveOpeningLineup={home:starters().map(player=>player.name),away:matchClub().roster.slice(0,11).map(player=>player.name)};liveMinutesPlayed={home:new Map(starters().map(player=>[player.name,0])),away:new Map(matchClub().roster.slice(0,11).map(player=>[player.name,0]))};availabilityCommitted=false;liveDayMatches.clearSnapshots();preMatchTacticSnapshot=null;matchFactors={home:contextFactor({...seasonContext.home,position:clubs[userClub].position,isHome:isUserHomeMatch(liveMatchGame)}),away:contextFactor({...seasonContext.away,position:matchClub().position,isHome:!isUserHomeMatch(liveMatchGame)})};cards={home:starters().map(() => ({yellow:0,red:false,dismissal:null,injured:false,playThroughRisk:false})),away:matchClub().roster.slice(0,11).map(() => ({yellow:0,red:false,dismissal:null,injured:false,playThroughRisk:false}))};goals={home:[],away:[]};stats={home:blank(),away:blank()};score();timeline.innerHTML="<p>PRÉ-JOGO · Aguardando a confirmação do treinador.</p>";$('#matchActions').innerHTML='<button id="pauseMatch">Ⅱ PAUSA TÉCNICA <small id="pauseCounter">0/3</small></button><button id="liveStats">ESTATÍSTICAS AO VIVO</button><button id="liveOpponent">VER ADVERSÁRIO</button>';bindLiveActions();$('#pauseCounter').textContent='0/3';$('#matchStatus').textContent='Organize sua equipe antes de iniciar a partida.';modal.classList.remove('hidden');$('#penaltyChoice').classList.add('hidden');$('#shootoutPanel').classList.add('hidden');$('#liveOpponentModal').classList.add('hidden');updateLiveMatchClock();openPreparation('PRÉ-JOGO');
  });
  onClick('#simulateRemainder',()=>simulateNonHumanSeasonRemainder());
  onClick('#closeMatch',()=>{
    if(matchFinished&&!roundCommitted){exitLiveMatch();return;}
    stopMatchClock();
    modal.classList.add('hidden');$('#liveOpponentModal').classList.add('hidden');closeFormationSuggestion();
  });
  onClick('#resumeMatch',()=>{
    const startingMatch=preMatchPreparation;
    preMatchPreparation=false;
    $('#pausePanel').classList.add('hidden');
    $('#stats').classList.add('hidden');
    $('#matchActions').classList.remove('hidden');
    $('#matchStatus').textContent='A partida está em andamento…';
    if(startingMatch){
      matchLiveUi.resetLiveClockSeconds();liveDayMatches.clearSnapshots();liveDayMatches.ensure();applyPreMatchTraining();renderRoster();
      preMatchTacticSnapshot={...(tactics?.getTacticalValues?.()??DEFAULT_USER_TACTICS)};
      const venue=matchVenueFor(liveMatchGame?.home||userClub);
      const crowd=liveMatchGame?resolveMatchAttendance(liveMatchGame):null;
      const crowdLine=crowd
        ? ` Público: ${crowd.attendance.toLocaleString('pt-BR')} (${Math.round(crowd.fillRate*100)}% da capacidade).`
        : '';
      timeline.innerHTML=`<p>0' · A bola está rolando no ${venue.name}!${crowdLine}</p>`;
      const kickoff=tacticalKickoffMessage(preMatchTacticSnapshot);
      if(kickoff)log(kickoff,'tactic');
    }
    updateLiveMatchClock();
    startMatchClock();
  });
  onClick('#penaltyTakers',e=>{const button=e.target.closest('button');if(!button)return;const takerName=button.dataset.taker;if(pendingPenalty?.mode==='shootout'){const lineup=shootoutLineup(pendingPenalty.kickingClub),taker=lineup.find(player=>player.name===takerName);if(!taker)return;executeShootoutKick(pendingPenalty.kickingClub,taker);pendingPenalty=null;return;}const taker=starters().find(p=>p.name===takerName);if(!taker||!pendingPenalty)return;shot('home',{...pendingPenalty.current,attack:pendingPenalty.current.attack+9},pendingPenalty.other,{penalty:true,taker:taker.name,penaltySkill:taker.penaltyTaking});$('#penaltyChoice').classList.add('hidden');$('#matchActions').classList.remove('hidden');$('#matchStatus').textContent='A partida está em andamento…';pendingPenalty=null;renderStats();startMatchClock();});
  
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
