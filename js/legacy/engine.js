import { $, $$, on, onClick, redirectGame, clamp, cleanCareerText } from '../ui/dom.js';
import { clubLabelHtml, clubCrestTitleHtml } from '../ui/club-label.js';
import { bindBoardRosterHover } from '../ui/board-roster-hover.js';
import { createRouter } from '../ui/router.js';
import { createMessagesFeature } from '../feature/messages/index.js';
import { createDashboardFeature } from '../feature/dashboard/index.js';
import { createCalendarViewFeature } from '../feature/calendar-view/index.js';
import { createTacticsFeature } from '../feature/tactics/index.js';
import { createSeasonSummaryFeature } from '../feature/season-summary/index.js';
import { createPlayerCells, outfield, fatigueCell } from '../feature/shared/player-cells.js';
import { SAVE_KEYS, FEATURES } from '../core/constants.js';
import { collectWorldRosters, applyWorldRosters, stampWorldPlayers } from '../engine/world-rosters.js';
import { createTransfersEngine } from '../engine/transfers.js';
import { createTransfersFeature } from '../feature/transfers/index.js';
import {
  normalizeDevelopmentState,
  emptyDevelopmentState,
  rollPotential,
  rollSquadAge,
  ensureCalendarDevelopmentPulses,
  runDevelopmentPulse,
  advancePlayerAges,
  PULSE_IDS,
} from '../engine/player-development.js';
import { playerKey as historyPlayerKey } from '../engine/player-match-stats.js';
import {
  loadCareerSave,
  loadSeasonSave,
  isSeasonValidForCareer,
  hydrateMessages,
  clearSeasonSave,
  clearCareerStorage,
  markSkipPersistOnce,
  consumeSkipPersistOnce,
  writeJson,
  MEMORY_LIMITS,
  compactMatchResult,
  compactRoundHistory,
  compactCompetitionHistories,
  compactCupFixture,
  slimLeaderboard,
  slimAvailabilitySnapshot,
  slimFatigueSnapshot,
  slimSerieDFixturesForSave,
  pruneInjuryHistory,
  pruneRankingTitles,
  pruneClubMemory,
  involvesClub,
} from '../core/save.js';
import { createInjuryEngine } from '../engine/injury.js';
import { createFatigueEngine } from '../engine/fatigue.js';
import { createDisciplineEngine } from '../engine/discipline.js';
import { createEconomyEngine } from '../engine/economy.js';
import { createClubStatusEngine } from '../engine/club-status.js';
import { createManagerRankingEngine } from '../engine/manager-ranking.js';
import { pickSeasonGoal, evaluateSeasonGoal, seasonGoalLiveProgress } from '../engine/season-goals.js';
import { seasonGoalGauge } from '../feature/season-summary/goal-gauge.js';
import { createPlayerHistoryEngine, PLAYER_HISTORY_LIMITS, seasonAverageRating } from '../engine/player-history.js';
import { formatMatchRating, buildMatchPlayerSheets, playerKey } from '../engine/player-match-stats.js';
import {
  SERIE_D_CLUBS,
  SERIE_D_PROMOTIONS,
  serieCClubsForSeason,
  serieCRelegationSlots,
  serieCRelegationCountForTransition,
  normalizeDivisionTeamsSerieC,
} from '../engine/serie-c-calendar.js';
import { competitionRulesHtml } from '../engine/competition-rules.js';
import {
  resolveBoardJobRisk,
  generateJobOffers,
  buildManagerHireStatus,
  MANAGER_JOB_HONEYMOON_ROUNDS,
} from '../engine/manager-job.js';
import { composeBoardBrief } from '../engine/board-brief.js';
import { createManagerSackFeature } from '../feature/manager-sack/index.js';
import { createEconomyFeature } from '../feature/economy/index.js';
import { createSponsorPickerFeature } from '../feature/sponsor-picker/index.js';
import { createOptionsFeature } from '../feature/options/index.js';
import { createLiveDayMatchesFeature } from '../feature/live-day-matches/index.js';
import { createMatchLiveUiFeature } from '../feature/match-live-ui/index.js';
import { createMatchAvailability } from '../engine/match-availability.js';
import { createAwaySubController } from '../engine/match-live-away-subs.js';
import { createLiveMatchOrchestration } from '../engine/match-live-orchestration.js';
import { createMatchLiveSessionFeature } from '../feature/match-live-session/index.js';
import { tacticalKickoffMessage } from '../feature/tactics/tactical-confrontation.js';
import {
  ENGINE_TUNING,
  engineFoulRisk,
  engineProgressiveFoulRisk as engineProgressiveFoulRiskBase,
  engineBlowoutDamp,
  engineScoreDamp,
  matchDifficultyForClub,
  createSimLineupBuilder,
  FATIGUE_SUB_THRESHOLD,
} from '../engine/match-tuning.js';
import { FORMATION_PERFORMANCE, COMPATIBLE_ROLES, roundTactic } from '../engine/match-core.js';
import { createRoundMatchSimulator } from '../engine/match-sim.js';
import { createLiveMatchActions } from '../engine/match-live.js';
import {
  createLiveMatchPersistController,
  buildLiveMatchSnapshot,
  hydrateLiveMatchSnapshot,
  isValidLiveMatchSnapshot,
  loadLiveMatchSave,
  saveLiveMatchSave,
  clearLiveMatchSave,
  fixtureIdFromGame,
} from '../engine/live-match-persist.js';
import {
  KNOCKOUT_COMPETITIONS,
  isKnockoutShootoutCompetition,
  knockoutCompetitionLabel,
  resolveKnockoutTieWinner,
  projectedKnockoutNeedsShootout,
  knockoutTieNeedsPlayedShootout,
  formatKnockoutFixtureScore,
  clearStaleKnockoutShootout,
  sanitizeKnockoutShootoutSave,
  sameKnockoutFixture,
} from '../engine/knockout-shootout.js';

/** Motor legado — migração incremental para módulos (Alpha 02). */
export async function bootEngine({ bus } = {}) {
  try {
  // Descarta flag residual de Novo Jogo (navegação sem beforeunload).
  consumeSkipPersistOnce();
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
    spend,
    canAfford,
    getBalance,
    estimateWageBill,
    estimateStaffBill,
    estimateStadiumOpsBill,
    estimateRoundCostBill,
    ensureStaffContract,
    chargeRoundCosts,
    chargeWageBill,
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
    generateSponsorOffers,
    applySponsorChoice,
    purchaseStadiumNameRights,
    nameRightsCost,
    estimateSponsorInstallment,
    creditSponsorInstallment,
    ensureTvRights,
    estimateTvInstallment,
    creditTvInstallment,
    ensureSeasonCashflow,
    getSeasonCashflowStatement,
    getSponsors,
    getTvRights,
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
    getFocusCompetitionKey: () => fixtureCompetitionKey(liveMatchGame || nextUserGame) || userLeagueDisciplineKey(),
  });
  const engineTuning = ENGINE_TUNING;
  let buildSimLineup;
  let substitutionPriority;
  let engineProgressiveFoulRisk;
  let simulateRoundMatch;
  let addPasses;
  let shot;
  let planPenaltyOutcome;
  let takeFreeKick;
  let penaltyTaker;
  let buildAttack;
  // O ambiente continua representando o momento interno do clube, mas uma
  // carreira nova respeita faixas compatíveis com a estrutura de cada divisão.
  // Durante a carreira esses valores poderão ultrapassar os limites iniciais.
  const initialEnvironmentRanges={A:[58,92],B:[55,88],C:[52,84],D:[50,80]};
  const indicatorTone = value => value > 75 ? 'positive' : value > 40 ? 'medium' : 'negative';
  const setIndicatorTone = (element,value) => { if(!element) return; element.classList.remove('positive','medium','negative'); element.classList.add(indicatorTone(value)); };
  // Placeholder visual até a carreira carregar os indicadores institucionais reais.
  $$('[data-dashboard-factor]').forEach(item => { const value=Math.round(rnd(Number(item.dataset.min),Number(item.dataset.max))); item.textContent=`${value}%`; setIndicatorTone(item.parentElement,value); });
  const dashboardEnvironment=$('.dashboard-environment'); if(dashboardEnvironment) setIndicatorTone(dashboardEnvironment,86);

  $('.pause-heading h2').id='pauseHeading';
  document.body.classList.add('dark-mode');
  let startMatchClock=()=>{};
  let openSeasonGoalPreview=()=>{};
  const optionsUi=createOptionsFeature({
    $, $$, onClick, redirectGame, cleanCareerText, writeJson, clearSeasonSave, clearCareerStorage, markSkipPersistOnce, SAVE_KEYS,
    hasCareer: !!savedNewGame,
    getSavedCareer: () => savedNewGame,
    initialBudget,
    defaultCareerSeason: DEFAULT_CAREER_SEASON,
    initialEnvironmentRanges,
    onPaceChanged: () => {
      const penaltyClosed=$('#penaltyDuelModal')?$('#penaltyDuelModal').classList.contains('hidden'):$('#penaltyChoice').classList.contains('hidden');
      if(matchStarted&&!matchFinished&&$('#pausePanel').classList.contains('hidden')&&penaltyClosed&&!shootoutState)startMatchClock();
    },
    onPreviewSeasonGoal:()=>openSeasonGoalPreview(),
  });
  
  const clubInitials=userClub.split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase();
  const managerFirstName=careerProfile.managerName.split(/\s+/)[0].toUpperCase();
  $('.season').textContent=`TEMPORADA ${careerSeason}`;$('.club>b').textContent=clubInitials;$('.club strong').textContent=userClub;$('.club small').textContent=`Série ${userDivision} · ${careerSeason}`;
  $('.hero p').textContent=`BOA TARDE, ${managerFirstName}`;$('.hero>div>span').textContent=`Prepare o ${userClub} para mais uma rodada.`;$('.hero .crest').textContent=clubInitials;
  $('#calendar .title p').textContent=`BRASILEIRÃO SÉRIE ${userDivision} · TEMPORADA ${careerSeason}`;
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
  /** Camisas 1…N por ordem do elenco. `number` nunca é seed de geração. */
  const assignSquadJerseyNumbers=roster=>{
    if(!Array.isArray(roster))return roster;
    roster.forEach((player,index)=>{if(player)player.number=index+1;});
    return roster;
  };
  assignSquadJerseyNumbers(squad);
  const teams = ['Palmeiras','Flamengo','Grêmio',userClub,'Cruzeiro','Bahia','São Paulo','Internacional','Estrela do Cerrado','Botafogo','Corinthians','Vasco','Santos','Fluminense','Athletico PR','Bragantino','Fortaleza','Ceará','Goiás','Juventude'];
  const starterRoles=['GOL','LAT','ZAG','ZAG','LAT','VOL','MC','MC','PE','ATA','PD'];
  const benchRoles=['GOL','ZAG','LAT','VOL','MC','MEI','ATA'];
  const firstNames=['Adriano','André','Arthur','Breno','Bruno','Caio','Carlos','Cristian','Daniel','Davi','Diego','Douglas','Eduardo','Enzo','Erick','Fábio','Felipe','Fernando','Gabriel','Guilherme','Gustavo','Heitor','Henrique','Hugo','Igor','Ítalo','João','Kaique','Leandro','Leonardo','Lucas','Luiz','Marcelo','Marcos','Matheus','Miguel','Murilo','Nathan','Nicolas','Otávio','Paulo','Pedro','Rafael','Renan','Rodrigo','Samuel','Thiago','Vitor','Victor','Wesley'];
  const lastNames=['Almeida','Alves','Amaral','Andrade','Araújo','Barbosa','Batista','Cardoso','Carvalho','Castro','Correia','Costa','Cunha','Dias','Duarte','Esteves','Ferreira','Freitas','Garcia','Gomes','Henrique','Leite','Lima','Lopes','Machado','Marques','Martins','Mendes','Monteiro','Moreira','Moura','Nascimento','Neves','Nunes','Oliveira','Pereira','Pires','Ramos','Reis','Ribeiro','Rocha','Rodrigues','Santos','Silva','Soares','Souza','Teixeira','Vieira'];
  const formationsForClubs=['4-3-3','4-4-2','3-5-2','4-2-3-1','4-1-4-1','5-3-2','4-3-1-2','3-4-3'];
  const divisionRules={
    A:{name:'Série A',clubs:20,power:[76,84],format:'38 rodadas em turno e returno',promotion:0,relegation:4},
    B:{name:'Série B',clubs:20,power:[70,78],format:'38 rodadas; 1º e 2º sobem, 3º–6º disputam playoffs',promotion:4,relegation:4},
    C:{name:'Série C',clubs:serieCClubsForSeason(careerSeason),power:[64,73],format:'pontos corridos em turno e returno',promotion:4,relegation:serieCRelegationSlots(careerSeason)},
    D:{name:'Série D',clubs:SERIE_D_CLUBS,power:[56,68],format:'16 grupos de 6; 10 rodadas; 4 avançam por grupo; mata-mata e playoffs em ida e volta',promotion:SERIE_D_PROMOTIONS,relegation:0}
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
    const limits={A:[64,92],B:[58,86],C:[52,80],D:[45,75]}[division],age=rollSquadAge(gameRandom),ageModifier=age<=19?-4:age<=21?-2:age<=26?1:age<=29?2:age<=32?0:age<=34?-2:-5,overallBase=clamp(int(clubPower-6,clubPower+6)+ageModifier,...limits),attacking=['PE','PD','ATA','MEI','MC'].includes(role),defensive=['ZAG','LAT','VOL'].includes(role),keeper=role==='GOL',value=(base,spread=8)=>clamp(int(base-spread,base+spread),5,99);
    const first=firstNames[(index+int(0,firstNames.length-1))%firstNames.length],last=lastNames[(index*3+int(0,lastNames.length-1))%lastNames.length],secondLast=gameRandom()<.16?` ${lastNames[(index*7+int(0,lastNames.length-1))%lastNames.length]}`:'';
    const attributes={overallBase,dribble:value(attacking?overallBase+3:overallBase-15),speed:value(['LAT','PE','PD','ATA'].includes(role)?overallBase+7:overallBase-2),marking:value(defensive?overallBase+5:overallBase-18),tackling:value(defensive?overallBase+5:overallBase-19),finishing:value(attacking?overallBase+5:overallBase-21),passing:value(['MC','MEI','VOL','LAT'].includes(role)?overallBase+3:overallBase-8),heading:value(['ZAG','ATA','VOL'].includes(role)?overallBase+3:overallBase-9),positioning:keeper?value(overallBase+4):0,penaltySaving:keeper?value(overallBase):0,reflexes:keeper?value(overallBase+5):0};
    const signatureOptions={GOL:['reflexes','positioning','penaltySaving'],ZAG:['marking','tackling','heading'],LAT:['speed','tackling','passing','dribble'],VOL:['tackling','marking','passing'],MC:['passing','dribble','tackling','finishing'],MEI:['passing','dribble','finishing'],PE:['speed','dribble','finishing'],PD:['speed','dribble','finishing'],ATA:['finishing','heading','speed']}[role],signature=signatureOptions[int(0,signatureOptions.length-1)];attributes[signature]=clamp(attributes[signature]+int(4,9),5,99);
    const overall=clamp(generatedOverall(role,attributes),...limits),potential=rollPotential(overall,age,division,gameRandom),attackAverage=(attributes.dribble+attributes.speed+attributes.finishing+attributes.passing+attributes.heading)/5,rolePlaymaking=role==='GOL'||role==='ZAG'?Math.min(40,overall-28):role==='VOL'?overall-4:role==='LAT'||role==='ATA'?overall-10:overall+5,creationMultiplier=1+rnd(.005,.015)*(attackAverage>=75?1:-1),heightRanges={GOL:[184,199],ZAG:[180,196],LAT:[168,187],VOL:[174,191],MC:[168,188],MEI:[165,185],PE:[164,184],PD:[164,184],ATA:[174,194]},height=int(...heightRanges[role]),footDraw=gameRandom(),preferredFoot=footDraw<.055?'Ambidestro':role==='PE'?(footDraw<.62?'Esquerdo':'Direito'):role==='PD'?(footDraw<.18?'Esquerdo':'Direito'):(footDraw<.18?'Esquerdo':'Direito'),personalities=['Disciplinado','Determinado','Equilibrado','Líder','Competitivo','Tranquilo'];
    // `index` é só seed de nome/RNG — a camisa é atribuída depois com assignSquadJerseyNumbers.
    const p={name:`${first} ${last}${secondLast}`,pos:role,age,overall,potential,height,preferredFoot,personality:personalities[int(0,personalities.length-1)],injuryProneness:clamp(int(5,25)+(age>=31?int(3,10):0),5,38),injuryHistory:[],workload:{minutesLast7Days:0,minutesLast14Days:0,matchesLast14Days:0,consecutiveStarts:0,highIntensityLoad:0,lastMatchRound:0},dribble:attributes.dribble,speed:attributes.speed,marking:attributes.marking,tackling:attributes.tackling,finishing:attributes.finishing,passing:attributes.passing,heading:attributes.heading,positioning:attributes.positioning,penaltySaving:attributes.penaltySaving,reflexes:attributes.reflexes,freeKick:Math.min(85,value(['MC','MEI','PE','PD'].includes(role)?overall-24:overall-38,10)),penaltyTaking:Math.min(85,value(['MC','MEI','PE','PD','ATA'].includes(role)?overall-7:overall-25,10)),playmaking:clamp(Math.round(rolePlaymaking*creationMultiplier),5,role==='GOL'||role==='ZAG'?40:role==='VOL'||role==='LAT'||role==='ATA'?90:100),fatigue:100,number:0};
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
  let careerWorldNeedsPersist=false;
  let serieCSizeRepaired=false;
  if(savedNewGame){
    const restoredDivisions=savedNewGame.divisionTeams&&Object.keys(divisionRules).every(division=>Array.isArray(savedNewGame.divisionTeams[division]));
    const foundingClubName=savedNewGame.foundingClubName||savedNewGame.clubName||userClub;
    const careerClubHistory=Array.isArray(savedNewGame.careerClubHistory)
      ?savedNewGame.careerClubHistory.filter(Boolean)
      :[foundingClubName].filter(Boolean);
    if(restoredDivisions){
      Object.keys(divisionRules).forEach(division=>divisionTeams[division]=[...savedNewGame.divisionTeams[division]]);
    }else{
      // Mundo ainda não persistido: gera a pirâmide e já marca para gravar (evita sumir clube ao trocar de emprego).
      const protectedNames=new Set(
        [userClub,foundingClubName,...careerClubHistory]
          .filter(Boolean)
          .map(name=>name.toLocaleLowerCase('pt-BR')),
      );
      const available=generatedClubPool.filter(name=>!protectedNames.has(name.toLocaleLowerCase('pt-BR')));
      Object.keys(divisionRules).forEach(division=>{
        const generatedCount=divisionRules[division].clubs-(division===userDivision?1:0);
        const generated=available.splice(0,generatedCount);
        divisionTeams[division]=division===userDivision?[userClub,...generated]:generated;
      });
      careerWorldNeedsPersist=true;
    }
    // Garante clube fundador e clubes já treinados pelo jogador no universo.
    const namesInWorld=()=>new Set(Object.values(divisionTeams).flat());
    [foundingClubName,...careerClubHistory].filter(Boolean).forEach(name=>{
      if(namesInWorld().has(name))return;
      divisionTeams.D.push(name);
      careerWorldNeedsPersist=true;
    });
    // CBF 2026+: corrige Série C inflada (bug antigo: +4 clubes/temporada sem teto).
    const serieCNorm=normalizeDivisionTeamsSerieC(divisionTeams,{
      season:careerSeason,
      userClub,
      fillPool:generatedClubPool,
      dTarget:SERIE_D_CLUBS,
    });
    if(serieCNorm.changed){
      Object.keys(divisionRules).forEach(division=>{
        divisionTeams[division]=[...serieCNorm.divisionTeams[division]];
      });
      careerWorldNeedsPersist=true;
      serieCSizeRepaired=true;
    }
    if(!savedNewGame.foundingClubName||!Array.isArray(savedNewGame.divisionTeams))careerWorldNeedsPersist=true;
    divisionRules.C.clubs=serieCClubsForSeason(careerSeason);
    divisionRules.C.relegation=serieCRelegationSlots(careerSeason);
    Object.keys(divisionRules).forEach(division=>{
      if(division==='C')return;
      divisionRules[division].clubs=divisionTeams[division].length;
    });
    divisionRules.C.clubs=divisionTeams.C.length;
    teams.splice(0,teams.length,...divisionTeams[userDivision]);
    if(careerWorldNeedsPersist){
      Object.assign(savedNewGame,{
        foundingClubName,
        careerClubHistory:[...new Set([foundingClubName,...careerClubHistory,userClub].filter(Boolean))],
        divisionTeams:Object.fromEntries(Object.keys(divisionRules).map(division=>[division,[...divisionTeams[division]]])),
      });
      writeJson(SAVE_KEYS.career,{...savedNewGame});
    }
  }
  const clubs={};
  const fullBenchRoles=['GOL','ZAG','ZAG','LAT','LAT','VOL','MC','MC','MEI','PE','PD','ATA'];
  const createClub=(club,division,index)=>{const rule=divisionRules[division],basePower=int(rule.power[0],rule.power[1]),formation=club===userClub?'4-3-3':formationsForClubs[int(0,formationsForClubs.length-1)],roles=savedNewGame?generatedSquadRoles(formation):[...starterRoles,...benchRoles],roster=roles.map((role,playerIndex)=>generatedPlayer(role,playerIndex+index*29,basePower+(playerIndex<11?2:-1),division)),names=new Map(),environmentRange=initialEnvironmentRanges[division];roster.forEach(player=>{const count=names.get(player.name)||0;names.set(player.name,count+1);if(count)player.name=`${player.name} ${count+1}`;});assignSquadJerseyNumbers(roster);const power=Math.round(roster.slice(0,11).reduce((sum,player)=>sum+player.overall,0)/11);return{name:club,division,power,roster,formation,style:['Posse de bola','Contra-ataque','Pressão alta'][int(0,2)],mentality:['Defensiva','Equilibrada','Ofensiva'][int(0,2)],position:index+1,environment:int(...environmentRange),support:int(38,94),board:int(38,94),finances:int(35,96)};};
  if(savedNewGame){
    Object.entries(divisionTeams).forEach(([division,names])=>names.forEach((club,index)=>{clubs[club]=createClub(club,division,index);}));
    // Elencos do mundo (IA + usuário) — base do mercado de transferências.
    if(savedNewGame.worldRosters&&typeof savedNewGame.worldRosters==='object'){
      applyWorldRosters(clubs,savedNewGame.worldRosters,{
        seed:savedNewGame.seed,
        season:careerSeason,
      });
    }
    const user=clubs[userClub];
    if(Array.isArray(savedNewGame.userRoster)&&savedNewGame.userRoster.length>=18)user.roster=savedNewGame.userRoster.map(player=>({injuryHistory:[],workload:{minutesLast7Days:0,minutesLast14Days:0,matchesLast14Days:0,consecutiveStarts:0,highIntensityLoad:0,lastMatchRound:0},...player,fatigue:100}));
    assignSquadJerseyNumbers(user.roster);
    squad.splice(0,squad.length,...user.roster);
    // Carreira nova: faixa estável (55–88). Continuação: permite variação
    // acumulada na temporada (28–98) sem “resetar” o painel ao recarregar.
    const userEnvironmentRange=initialEnvironmentRanges[userDivision],initialStatus=savedNewGame.clubStatus||{environment:int(...userEnvironmentRange),support:int(55,88),board:int(55,88),finances:int(55,88)};
    const continuingCareer=!!(validSavedSeason||Array.isArray(savedNewGame.userRoster));
    // Só força 4-3-3 / estilo padrão em carreira nova — não apagar tática salva.
    if(!continuingCareer){user.formation='4-3-3';user.style='Posse de bola';user.mentality='Equilibrada';}
    if(continuingCareer){
      user.environment=clamp(initialStatus.environment,28,98);
      user.support=clamp(initialStatus.support,28,98);
      user.board=clamp(initialStatus.board,28,98);
      user.finances=clamp(initialStatus.finances,28,98);
    }else{
      user.environment=clamp(initialStatus.environment,...userEnvironmentRange);
      user.support=clamp(initialStatus.support,55,88);
      user.board=clamp(initialStatus.board,55,88);
      user.finances=clamp(initialStatus.finances,55,88);
    }
    user.budget=Math.max(0,Number(initialStatus.budget??initialBudget(userDivision)));
    ensureBudget(user,userDivision);
  }
  else teams.forEach((club,index)=>{if(club===userClub){clubs[club]={name:club,division:'A',roster:squad,formation:'4-3-3',style:'Posse de bola',mentality:'Equilibrada',position:4};return;}const power=clamp(78-index*.45+int(-3,3),68,82),roster=assignSquadJerseyNumbers([...starterRoles,...benchRoles].map((role,i)=>generatedPlayer(role,i+index*5,power)));clubs[club]={name:club,division:'A',roster,formation:formationsForClubs[int(0,formationsForClubs.length-1)],style:['Posse de bola','Contra-ataque','Pressão alta'][int(0,2)],mentality:['Defensiva','Equilibrada','Ofensiva'][int(0,2)],position:index+1};});
  stampWorldPlayers(clubs,{seed:savedNewGame?.seed||0,season:careerSeason});
  if(savedNewGame){
    // Primeira gravação ou migração de snapshot gordo (estourava cota do localStorage).
    const worldSample=Object.values(savedNewGame.worldRosters||{}).find(roster=>Array.isArray(roster)&&roster[0])?.[0];
    const worldFat=!!(worldSample&&(worldSample.workload||Array.isArray(worldSample.injuryHistory)||worldSample.injuryHistory));
    if(!savedNewGame.worldRosters||worldFat){
      savedNewGame.worldRosters=collectWorldRosters(clubs,{skipClub:userClub});
      writeJson(SAVE_KEYS.career,{...savedNewGame});
    }
  }
  Object.values(clubs).forEach(club=>{
    const attackers=club.roster.filter(p=>['ATA','PE','PD','MEI','MC'].includes(p.pos)).sort((a,b)=>(b.finishing+b.heading*.2)-(a.finishing+a.heading*.2));
    const creators=club.roster.filter(p=>p.pos!=='GOL').sort((a,b)=>(b.passing+b.playmaking)-(a.passing+a.playmaking));
    club.environment=club.environment??(club.name===userClub?86:int(...initialEnvironmentRanges[club.division||'A']));
    club.support=club.support??int(42,92);
    club.board=club.board??int(42,92);
    club.finances=club.finances??int(40,94);
    if(club.name===userClub){
      if(savedNewGame?.stadiumName)club.stadiumName=String(savedNewGame.stadiumName).trim();
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
    $('#treatmentModalText').textContent=`O departamento médico aguarda sua decisão pós-jogo. Cirurgia tende a encurtar o afastamento; o tratamento conservador preserva o atleta por mais tempo em observação.`;
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
    $('#treatmentModalText').textContent=`O departamento médico recomenda avaliar o tratamento. Cirurgia tende a encurtar o afastamento; o tratamento conservador preserva o atleta por mais tempo em observação.`;
    $('#treatmentModal').classList.remove('hidden');
    return null;
  };
  const finishTreatmentChoice=choice=>{
    if(!pendingTreatmentDecision)return;
    const {player,injury,club,liveContext}=pendingTreatmentDecision,record=applyTreatmentChoice(player,injury,choice,club);
    pendingTreatmentDecision=null;
    $('#treatmentModal').classList.add('hidden');
    // Enquanto houver fila, a ação médica continua pendente no badge vermelho.
    if(!postMatchMedicalQueue.length){
      messages?.resolveActionRequiredMessages?.({category:'medical',type:'treatment-pending'});
    }
    if(club?.name===userClub&&record)pushMessage?.({category:'medical',type:'treatment',title:'Tratamento definido',body:`${player.name}: ${treatmentLabel(record.treatment)} para ${record.name}. Retorno estimado em ${record.daysRemaining} dias.`,round:currentRound,meta:{competition:'Departamento médico'}});
    if(liveContext&&record){
      const {side,index}=liveContext;
      cards[side][index].injured=true;liveInjuries[side].push({name:player.name,injury:{...record}});
      log(injuryDiagnosisComment(player,record,club),'injury',side);
      pushLiveVolumeIncident(side,'injury',{name:player.name});
      if(side==='home'){
        $('#matchStatus').textContent='Partida pausada: jogador lesionado. Faça a substituição ou reorganize a equipe.';
        openPreparation('LESÃO');
      }else{
        const bench=club.roster.slice(11).filter(candidate=>!playerUnavailable(candidate)&&!liveInjuries.away.some(item=>item.name===candidate.name));
        if(bench.length&&liveInjuries.away.length<=5){const expected=player.pos,compatible=bench.filter(candidate=>candidate.pos===expected||(compatibleRoles[expected]||[]).includes(candidate.pos)),incoming=[...(compatible.length?compatible:bench)].sort((a,b)=>b.overall-a.overall)[0],incomingIndex=club.roster.indexOf(incoming);[club.roster[index],club.roster[incomingIndex]]=[incoming,player];cards.away[index]={yellow:0,red:false,dismissal:null,injured:false,playThroughRisk:false};liveMinutesPlayed.away.set(incoming.name,liveMinutesPlayed.away.get(incoming.name)??0);log(`${club.name} substitui o lesionado ${player.name} por ${incoming.name}.`,'injury-substitution');pushLiveVolumeIncident('away','substitution',{name:`${player.name} → ${incoming.name}`});}
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
  let renderHeaderGuide=()=>{};
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
    try{renderHeaderGuide();}catch{/* boot */}
  };
  const renderEnvironmentCard=()=>{
    if(!savedNewGame)return;
    const user=clubs[userClub];
    if(!user)return;
    const overall=Math.round(user.roster.slice(0,11).reduce((sum,player)=>sum+player.overall,0)/11);
    const environment=user.environment;
    const overallEl=$('.dashboard-overall strong');
    if(overallEl)overallEl.textContent=overall;
    if(dashboardEnvironment){
      dashboardEnvironment.style.setProperty('--environment',environment);
      const envStrong=dashboardEnvironment.querySelector('strong');
      if(envStrong)envStrong.textContent=`${environment}%`;
      setIndicatorTone(dashboardEnvironment,environment);
    }
    const note=$('.dashboard-environment-note');
    if(note){
      const environmentLabel=environment>75?['Vestiário em alta','O elenco está motivado.']:environment>40?['Ambiente estável','O grupo trabalha sem grande pressão.']:['Vestiário pressionado','O elenco precisa reagir.'];
      const strong=note.querySelector('strong');
      const small=note.querySelector('small');
      if(strong)strong.textContent=environmentLabel[0];
      if(small)small.textContent=environmentLabel[1];
    }
    [user.support,user.board,user.finances].forEach((value,index)=>{
      const element=$$('[data-dashboard-factor]')[index];
      if(!element)return;
      element.textContent=`${value}%`;
      setIndicatorTone(element.parentElement,value);
    });
    renderClubBudget();
  };
  const clubStatus=createClubStatusEngine({
    clamp,
    getClubs:()=>clubs,
    getUserClub:()=>userClub,
    getUserDivision:()=>userDivision,
    getBalance:club=>getBalance(club),
    persistCareerStatus:status=>{
      if(!savedNewGame||!status)return;
      savedNewGame.clubStatus={
        environment:status.environment,
        support:status.support,
        board:status.board,
        finances:status.finances,
        budget:status.budget??getBalance(clubs[userClub]),
      };
    },
    onStatusChanged:()=>renderEnvironmentCard(),
  });
  const userStandingSnapshot=()=>{
    const standings=nationalCompetitions[userDivision]?.standings||[];
    const index=standings.findIndex(row=>row.club===userClub);
    if(index<0)return null;
    const row=standings[index];
    return {position:index+1,clubsCount:standings.length,points:row.points||0,played:row.played||0};
  };
  const applyClubStatusAfterRound=(games,fillRate=null)=>{
    if(!savedNewGame||!games?.length)return;
    clubStatus.applyRoundImpacts(games,{
      userStanding:userStandingSnapshot(),
      fillRateByUserMatch:Number.isFinite(Number(fillRate))?Number(fillRate):null,
    });
  };
  /** Custos + parcela de patrocínio na rodada nacional (não roda em Copa avulsa). */
  const applyUserWageBillForRound=round=>{
    if(!savedNewGame||!clubs[userClub])return null;
    const manager=managerRanking.byClub(userClub)||managerRanking.byName(careerProfile.managerName);
    const reputation=manager?.reputation??60;
    clubs[userClub].managerReputation=reputation;
    clubs[userClub].managerName=manager?.name||careerProfile.managerName||clubs[userClub].managerName;
    const installments=userDivision==='D'?22:38;
    const result=chargeRoundCosts(clubs[userClub],{
      division:userDivision,
      round,
      season:careerSeason,
      managerId:manager?.id||null,
      managerName:manager?.name||careerProfile.managerName||null,
      managerReputation:reputation,
      preferredDivision:manager?.preferredDivision||userDivision,
      titlePoints:manager?.titlePoints||0,
    });
    creditSponsorInstallment(clubs[userClub],{round,installments});
    creditTvInstallment(clubs[userClub],{round,installments});
    clubStatus.syncFinancesFromBudget(clubs[userClub],userDivision);
    renderEnvironmentCard();
    return result;
  };
  if(savedNewGame){
    renderEnvironmentCard();
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
    const secondLeg=firstLeg.map((games,index)=>games.map(game=>({home:game.away,away:game.home,round:index+clubList.length})));
    return [...firstLeg,...secondLeg];
  };
  const serieAFixtures=buildBrazilianLeagueFixtures(divisionTeams.A);
  const serieBFixtures=savedNewGame?buildBrazilianLeagueFixtures(divisionTeams.B):[];
  const serieCFixtures=savedNewGame?buildBrazilianLeagueFixtures(divisionTeams.C):[];
  const restoredSerieDGroups=!!(savedNewGame&&!serieCSizeRepaired&&savedSeason&&savedSeason.seed===savedNewGame.seed&&Array.isArray(savedSeason.serieDGroups)&&savedSeason.serieDGroups.length===16)?savedSeason.serieDGroups:null;
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
  /** Fases do mata-mata Série D (espelho de updateSeriesDKnockout). */
  const serieDKnockoutPhaseDefs=[
    {index:1,key:'second',name:'2ª FASE',startRound:11,teams:64},
    {index:2,key:'third',name:'3ª FASE',startRound:13,teams:32},
    {index:3,key:'round16',name:'OITAVAS DE FINAL',startRound:15,teams:16},
    {index:4,key:'quarter',name:'QUARTAS DE FINAL',startRound:17,teams:8},
    {index:5,key:'semi',name:'SEMIFINAL',startRound:19,teams:8},
    {index:6,key:'final',name:'FINAL',startRound:21,teams:2},
  ];
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
  const scheduledMatchCount=(Array.isArray(championshipFixtures)?championshipFixtures:[]).reduce((total,round)=>total+(Array.isArray(round)?round.length:0),0);
  $('#calendar .title span').textContent=`${scheduledMatchCount} jogos da fase atual foram definidos no início da temporada.`;
  const nationalCompetitions={
    A:{...divisionRules.A,teams:divisionTeams.A,fixtures:serieAFixtures,standings:[]},
    B:{...divisionRules.B,teams:divisionTeams.B,fixtures:serieBFixtures,standings:[]},
    C:{...divisionRules.C,teams:divisionTeams.C,fixtures:serieCFixtures,standings:[],secondStage:{groups:2,clubsPerGroup:4}},
    D:{...divisionRules.D,teams:divisionTeams.D,groups:serieDGroups,fixtures:serieDGroupFixtures,standings:[],knockout:{qualifiedPerGroup:4,promotionSlots:SERIE_D_PROMOTIONS,promoted:[],twoLegged:true}}
  };
  const seasonRoundHistory=validSavedSeason&&Array.isArray(savedSeason.seasonRoundHistory)?compactRoundHistory(savedSeason.seasonRoundHistory,userClub):[];
  /** Log de público em casa — sobrevive ao prune de ledger/mensagens (resumo de temporada). */
  let userSeasonCrowds=validSavedSeason&&Array.isArray(savedSeason.userSeasonCrowds)
    ?savedSeason.userSeasonCrowds
      .filter(entry=>entry&&entry.home===userClub&&Number(entry.attendance)>0)
      .map(entry=>({
        home:entry.home,
        away:entry.away||entry.opponent||'—',
        attendance:Math.round(Number(entry.attendance)),
        fillRate:Number.isFinite(Number(entry.fillRate))?Number(entry.fillRate):null,
        gateRevenue:Number.isFinite(Number(entry.gateRevenue))?Number(entry.gateRevenue):null,
        competition:entry.competition||null,
        label:entry.label||null,
        phase:entry.phase||null,
        leg:entry.leg||null,
        round:entry.round??null,
      }))
    :[];
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
  const isSerieDKnockoutUiActive=()=>Boolean(nationalCompetitions.D?.knockout?.stages?.second?.length);
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
  let pendingSponsorChoice=!!(savedNewGame?.pendingSponsorChoice||savedSeason?.pendingSponsorChoice);
  let pendingSponsorOffers=savedSeason?.pendingSponsorOffers&&typeof savedSeason.pendingSponsorOffers==='object'
    ?{
      division:savedSeason.pendingSponsorOffers.division||userDivision,
      master:Array.isArray(savedSeason.pendingSponsorOffers.master)?savedSeason.pendingSponsorOffers.master.map(item=>({...item})):[],
      secondaries:Array.isArray(savedSeason.pendingSponsorOffers.secondaries)?savedSeason.pendingSponsorOffers.secondaries.map(item=>({...item})):[],
      reshufflesUsed:Number(savedSeason.pendingSponsorOffers.reshufflesUsed)||0,
    }
    :null;
  if(clubs[userClub]){
    // Só aplica economia/status da temporada se for do mesmo clube (evita herdar métricas após troca de emprego).
    let seasonStatusForClub=!savedSeason?.userClubName||savedSeason.userClubName===userClub;
    // Legado (sem userClubName): se carreira e temporada divergem em board+caixa, preferir carreira
    // — típico de troca de emprego gravada só no career save.
    if(seasonStatusForClub&&!savedSeason?.userClubName&&savedNewGame?.clubStatus&&savedSeason?.userClubStatus){
      const careerSnap=savedNewGame.clubStatus;
      const seasonSnap=savedSeason.userClubStatus;
      const boardDiff=Math.abs(Number(careerSnap.board)-Number(seasonSnap.board));
      const budgetDiff=Math.abs(Number(careerSnap.budget)-Number(seasonSnap.budget));
      if(boardDiff>=8&&budgetDiff>=100_000)seasonStatusForClub=false;
    }
    if(restoredUserBudget!=null&&seasonStatusForClub)clubs[userClub].budget=restoredUserBudget;
    else if(Number.isFinite(Number(savedNewGame?.clubStatus?.budget)))clubs[userClub].budget=Number(savedNewGame.clubStatus.budget);
    ensureBudget(clubs[userClub],userDivision);
    if(seasonStatusForClub&&Array.isArray(savedSeason?.userBudgetLedger))clubs[userClub].budgetLedger=savedSeason.userBudgetLedger.map(entry=>({...entry}));
    else clubs[userClub].budgetLedger=[];
    const savedStatus=validSavedSeason&&seasonStatusForClub&&savedSeason.userClubStatus&&typeof savedSeason.userClubStatus==='object'?savedSeason.userClubStatus:null;
    if(savedStatus){
      const user=clubs[userClub];
      if(Number.isFinite(Number(savedStatus.environment)))user.environment=clamp(Number(savedStatus.environment),clubStatus.STATUS_MIN,clubStatus.STATUS_MAX);
      if(Number.isFinite(Number(savedStatus.support)))user.support=clamp(Number(savedStatus.support),clubStatus.STATUS_MIN,clubStatus.STATUS_MAX);
      if(Number.isFinite(Number(savedStatus.board)))user.board=clamp(Number(savedStatus.board),clubStatus.STATUS_MIN,clubStatus.STATUS_MAX);
      if(Number.isFinite(Number(savedStatus.finances)))user.finances=clamp(Number(savedStatus.finances),clubStatus.STATUS_MIN,clubStatus.STATUS_MAX);
    }else{
      clubStatus.syncFinancesFromBudget(clubs[userClub],userDivision);
    }
    renderEnvironmentCard();
    const savedStadium=savedSeason?.userStadium;
    if(savedStadium&&typeof savedStadium==='object'){
      if(Number.isFinite(Number(savedStadium.capacity)))clubs[userClub].stadiumCapacity=Number(savedStadium.capacity);
      if(Number.isFinite(Number(savedStadium.capacityLevel)))clubs[userClub].stadiumCapacityLevel=Number(savedStadium.capacityLevel);
      if(savedStadium.name)clubs[userClub].stadiumName=savedStadium.name;
      if(savedStadium.ticketPrices)clubs[userClub].ticketPrices={...savedStadium.ticketPrices};
      if(Number.isFinite(Number(savedStadium.structure)))clubs[userClub].stadiumStructure=Number(savedStadium.structure);
      if(Number.isFinite(Number(savedStadium.pitchLevel)))clubs[userClub].pitchLevel=Number(savedStadium.pitchLevel);
      if(savedStadium.pitchCondition)clubs[userClub].pitchCondition=savedStadium.pitchCondition;
    }else if(savedNewGame?.stadiumName){
      clubs[userClub].stadiumName=String(savedNewGame.stadiumName).trim();
    }
    ensureStadium(clubs[userClub],userDivision);
    const savedSponsors=savedSeason?.userSponsors;
    if(savedSponsors)clubs[userClub].sponsors={
      ...savedSponsors,
      master:savedSponsors.master?{...savedSponsors.master}:null,
      secondaries:Array.isArray(savedSponsors.secondaries)?savedSponsors.secondaries.map(item=>({...item})):[],
    };
    const hasChosenSponsors=!!(
      clubs[userClub].sponsors?.master?.name
      && Array.isArray(clubs[userClub].sponsors?.secondaries)
      && clubs[userClub].sponsors.secondaries.length===3
      && Number(clubs[userClub].sponsors?.season)===Number(careerSeason)
    );
    if(pendingSponsorChoice&&hasChosenSponsors)pendingSponsorChoice=false;
    if(pendingSponsorChoice){
      ensureSponsors(clubs[userClub],{pendingChoice:true});
      if(!pendingSponsorOffers?.master?.length||pendingSponsorOffers.secondaries?.length!==5){
        // Math.random (não o PRNG da carreira): ofertas variam entre Novo Jogo.
        pendingSponsorOffers=generateSponsorOffers({division:userDivision,random:Math.random});
      }
    }else{
      ensureSponsors(clubs[userClub],{
        division:userDivision,
        season:careerSeason,
        random:Math.random,
        savedSponsors,
        creditPackage:false,
        installments:userDivision==='D'?22:38,
      });
    }
    const savedTvRights=savedSeason?.userTvRights;
    if(savedTvRights&&typeof savedTvRights==='object'){
      clubs[userClub].tvRights={...savedTvRights};
    }
    ensureTvRights(clubs[userClub],{
      division:userDivision,
      season:careerSeason,
      random:gameRandom,
      savedTvRights,
      installments:userDivision==='D'?22:38,
    });
    const savedSeasonCashflow=savedSeason?.userSeasonCashflow;
    if(savedSeasonCashflow&&typeof savedSeasonCashflow==='object'){
      clubs[userClub].seasonCashflow={
        season:savedSeasonCashflow.season??careerSeason,
        inflows:{...(savedSeasonCashflow.inflows||{})},
        outflows:{...(savedSeasonCashflow.outflows||{})},
        movementCount:Number(savedSeasonCashflow.movementCount)||0,
      };
    }
    ensureSeasonCashflow(clubs[userClub],careerSeason);
    const savedStaffContract=savedSeason?.userStaffContract;
    if(savedStaffContract&&typeof savedStaffContract==='object'&&Number(savedStaffContract.amountPerRound)>0){
      clubs[userClub].staffContract={
        managerId:savedStaffContract.managerId||null,
        amountPerRound:Number(savedStaffContract.amountPerRound),
        season:savedStaffContract.season??null,
        score:Number.isFinite(Number(savedStaffContract.score))?Number(savedStaffContract.score):null,
        at:savedStaffContract.at||null,
      };
    }
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
  let pageCompetition=userDivision;
  let pageSerieDGroup=Math.max(0,userSerieDGroupIndex);
  let pageSerieDMode='groups'; // groups | knockout
  let pageCupPhase=1;
  let pageSerieDPhase=1;
  let pagePickerOpen=false;
  let renderChampionshipPage=()=>{};
  const PAGE_COMPETITION_OPTIONS=[
    {id:'A',label:'Brasileirão Série A'},
    {id:'B',label:'Brasileirão Série B'},
    {id:'C',label:'Brasileirão Série C'},
    {id:'D',label:'Brasileirão Série D'},
    {id:'CUP',label:'Copa do Brasil'},
  ];
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
  const managerRanking=createManagerRankingEngine({getSeed:()=>savedNewGame?.seed||1});
  const storedManagerRanking=(validSavedSeason?savedSeason.managerRanking:null)||savedNewGame?.managerRanking||null;
  managerRanking.ensurePool({
    clubNames:Object.keys(clubs),
    clubDivisions:Object.fromEntries(Object.values(clubs).map(club=>[club.name,club.division])),
    userClub,
    userManagerName:careerProfile.managerName,
    userDivision,
    stored:storedManagerRanking,
  });
  managerRanking.getManagers().forEach(manager=>{
    if(manager.club&&clubs[manager.club])clubs[manager.club].managerName=manager.name;
  });
  if(clubs[userClub]){
    const bootManager=managerRanking.byClub(userClub)||managerRanking.byName(careerProfile.managerName);
    clubs[userClub].managerReputation=bootManager?.reputation??clubs[userClub].managerReputation??60;
    ensureStaffContract(clubs[userClub],{
      division:userDivision,
      season:careerSeason,
      managerId:bootManager?.id||null,
      managerName:bootManager?.name||careerProfile.managerName||null,
      managerReputation:bootManager?.reputation??60,
      preferredDivision:bootManager?.preferredDivision||userDivision,
      titlePoints:bootManager?.titlePoints||0,
      force:false,
    });
  }
  let seasonGoal=(validSavedSeason&&savedSeason.seasonGoal?.id?savedSeason.seasonGoal:null)
    ||(savedNewGame?.seasonGoal?.id?savedNewGame.seasonGoal:null)
    ||null;
  let seasonGoalResult=(validSavedSeason&&savedSeason.seasonGoalResult?.status?savedSeason.seasonGoalResult:null)||null;
  let seasonGoalJustCreated=false;
  const ensureSeasonGoal=()=>{
    if(!savedNewGame)return null;
    if(seasonGoal?.id)return seasonGoal;
    seasonGoal=pickSeasonGoal({
      division:userDivision,
      overall:clubSquadOverall(clubs[userClub]),
      seed:savedNewGame.seed||careerSeason,
    });
    seasonGoalResult=null;
    seasonGoalJustCreated=true;
    return seasonGoal;
  };
  const buildSeasonGoalLiveContext=()=>{
    const knockout=nationalCompetitions.D?.knockout||{};
    const serieDPhase=userDivision==='D'?resolveSerieDPrizePhase(userClub,knockout):null;
    const promotedList=Array.isArray(knockout.promoted)?knockout.promoted:[];
    const promoted=userDivision==='D'&&promotedList.includes(userClub);
    let position=null,clubsCount=null,points=0,played=0,wins=0,draws=0,losses=0,goalDiff=0;
    let standingsSnapshot=[];
    if(userDivision==='D'){
      const rows=seriesDGroupRows(userSerieDGroupIndex);
      standingsSnapshot=rows.map(row=>({
        club:row.club,
        points:row.points||0,
        played:row.played||0,
        wins:row.wins||0,
        goalDiff:row.goalDiff||0,
      }));
      const index=rows.findIndex(row=>row.club===userClub);
      if(index>=0){
        const row=rows[index];
        position=index+1;
        clubsCount=rows.length;
        points=row.points||0;
        played=row.played||0;
        wins=row.wins||0;
        draws=row.draws||0;
        losses=row.losses||0;
        goalDiff=row.goalDiff||0;
      }
    }else{
      const standing=userStandingSnapshot();
      const standings=nationalCompetitions[userDivision]?.standings||[];
      standingsSnapshot=standings.map(row=>({
        club:row.club,
        points:row.points||0,
        played:row.played||0,
        wins:row.wins||0,
        goalDiff:row.goalDiff||0,
      }));
      const row=standings.find(item=>item.club===userClub);
      position=standing?.position||clubs[userClub]?.position||null;
      clubsCount=standing?.clubsCount||standings.length||20;
      if(row){
        points=row.points||0;
        played=row.played||0;
        wins=row.wins||0;
        draws=row.draws||0;
        losses=row.losses||0;
        goalDiff=row.goalDiff||0;
      }
    }
    const form=[];
    for(let index=seasonRoundHistory.length-1;index>=0&&form.length<8;index--){
      const games=seasonRoundHistory[index]?.games||[];
      const game=games.find(item=>involvesClub(item,userClub));
      if(!game||game.homeGoals==null||game.awayGoals==null)continue;
      const userHome=game.home===userClub;
      const userGoals=userHome?game.homeGoals:game.awayGoals;
      const oppGoals=userHome?game.awayGoals:game.homeGoals;
      form.unshift(userGoals>oppGoals?'W':userGoals<oppGoals?'L':'D');
    }
    return {
      club:userClub,
      position,
      clubsCount,
      points,
      played,
      wins,
      draws,
      losses,
      goalDiff,
      standings:standingsSnapshot,
      form,
      serieDPhase:serieDPhase||'group',
      promoted,
      seasonRounds:userDivision==='D'?SERIE_D_GROUP_ROUNDS:38,
      division:userDivision,
    };
  };
  const renderSeasonGoalCard=()=>{
    const goal=ensureSeasonGoal();
    const labelEl=$('#dashboardSeasonGoal');
    const metaEl=$('#dashboardSeasonGoalMeta');
    const gaugeEl=$('#dashboardSeasonGoalGauge');
    if(!labelEl)return;
    if(!goal){
      labelEl.textContent='—';
      if(metaEl)metaEl.textContent='A diretoria define a expectativa da campanha.';
      if(gaugeEl){gaugeEl.innerHTML='';gaugeEl.setAttribute('aria-hidden','true');}
      return;
    }
    labelEl.textContent=goal.label;
    if(metaEl){
      const tierLabel=goal.tier==='soft'?'Expectativa conservadora':goal.tier==='stretch'?'Expectativa ambiciosa':'Expectativa equilibrada';
      metaEl.textContent=`Série ${goal.division} · ${tierLabel}`;
    }
    if(gaugeEl){
      try{
        const progress=seasonGoalLiveProgress(goal,buildSeasonGoalLiveContext());
        gaugeEl.innerHTML=seasonGoalGauge(progress,{compact:true,hideLegend:true});
        gaugeEl.removeAttribute('aria-hidden');
      }catch{
        gaugeEl.innerHTML='';
        gaugeEl.setAttribute('aria-hidden','true');
      }
    }
  };
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
  let respondToIncomingTransferOffer=()=>{};
  const openMedicalActionFlow=()=>{
    messages.openMedicalActionMessage?.();
    processPostMatchMedicalQueue?.();
  };
  const messages=createMessagesFeature({
    $,$$,onClick,
    initialMessages:initialCareerMessages,
    getHasCareer:()=>!!savedNewGame,
    getCurrentRound:()=>currentRound,
    getCareerDateIso:()=>careerCalendarDate.toISOString(),
    getCareerDate:()=>careerCalendarDate,
    onPush:message=>bus?.emit('message:push',message),
    onMedicalActionRequired:()=>{
      // Abre leitor + modal de tratamento quando a ação médica chega.
      queueMicrotask(()=>openMedicalActionFlow());
    },
    onTransferActionRequired:message=>{
      // Durante avanço da janela: acumula sync e apresenta ao final (fila).
      if(suppressTransferOfferPopup){
        if(message?.id)pendingTransferOfferPopupIds.push(message.id);
        return;
      }
      queueMicrotask(()=>{
        messages.updateMessageBadge?.();
        // Evita abrir o leitor a cada rodada na simulação idle.
        if(typeof nonHumanSimRunning!=='undefined'&&nonHumanSimRunning)return;
        messages.presentTransferActionMessages?.();
      });
    },
    onTransferOfferRespond:opts=>respondToIncomingTransferOffer(opts),
  });
  let suppressTransferOfferPopup=false;
  let pendingTransferOfferPopupIds=[];
  const pushMessage=messages.pushMessage.bind(messages);
  const renderMessages=messages.renderMessages.bind(messages);
  const renderDashboardMessagesFeed=messages.renderDashboardMessagesFeed.bind(messages);
  const updateMessageBadge=messages.updateMessageBadge.bind(messages);
  const autoMarkStaleMessages=messages.autoMarkStaleMessages.bind(messages);
  const applyDisciplineToPlayer=(player,card,round=currentRound,clubName=null,fixture=null)=>{
    if(!player||!card)return [];
    const competitionKey=fixtureCompetitionKey(fixture||liveMatchGame||{division:clubs[clubName||userClub]?.division||userDivision});
    const opponent=clubName===userClub&&fixture?fixture.home===userClub?fixture.away:fixture.home:clubName===userClub&&liveMatchGame?liveMatchGame.home===userClub?liveMatchGame.away:liveMatchGame.home:null;
    return applyDisciplineCard(player,card,{competitionKey,round,isUserClub:clubName===userClub,opponent});
  };
  const pushDisciplineDigest=(lines,round,contextLabel,fixture=null)=>{
    if(!lines.length)return;
    const shortMeta=fixture?matchdayMetaForGame(fixture):{
      competition:`Brasileirão ${userDivision}`,
      roundLabel:`Rodada ${round}`,
    };
    const opponent=String(contextLabel||'').replace(/^vs\s+/i,'').trim()||null;
    pushMessage({
      category:'discipline',
      type:'digest',
      title:'DISCIPLINA',
      body:lines.map(line=>`• ${line}`).join('\n'),
      round,
      meta:{
        competition:shortMeta.competition,
        roundLabel:shortMeta.roundLabel,
        opponent,
      },
    });
  };
  const matchAvailability=createMatchAvailability({
    getClubs:()=>clubs,
    getUserClub:()=>userClub,
    getCurrentRound:()=>currentRound,
    recordPlayerMatchWorkload,
    roundTactic,
    applyDisciplineToPlayer,
    assignPlayerInjury,
    applyDeferredInjuryDiagnosis,
    pushDisciplineDigest,
    injuryInAcutePhase,
    injuryInRestrictedPhase,
    beginRestrictedReturn,
    advanceRestrictedRehab,
    decayPlayerWorkload,
    refreshWorkloadWindows,
    getAvailabilityCommitted:()=>availabilityCommitted,
    setAvailabilityCommitted:v=>{availabilityCommitted=v;},
    getMatchStarted:()=>matchStarted,
    getLiveMatchGame:()=>liveMatchGame,
    getMatchDiscipline:()=>matchDiscipline,
    getLiveMinutesPlayed:()=>liveMinutesPlayed,
    getLiveOpeningLineup:()=>liveOpeningLineup,
    tacticFor:(...args)=>tacticFor(...args),
  });
  const {applyMatchWorkload,applyMatchAvailability,serveAvailability,commitLiveAvailability}=matchAvailability;
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
  let onCareerCalendarAdvanced=()=>{};
  const advanceCareerCalendarTo=date=>{
    if(!date)return;
    careerCalendarDate=new Date(date);
    careerCalendarDate.setHours(12,0,0,0);
    autoMarkStaleMessages?.();
    onCareerCalendarAdvanced();
  };
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
  let cupGameNumber=Math.max(0,...(cupCompetition.stages||[]).flatMap(stage=>(Array.isArray(stage?.fixtures)?stage.fixtures:[]).map(game=>game.gameNumber||0)))+1;
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
  const rebuildLeagueClubDates=()=>{
    clubMatchDates.clear();
    Object.entries(nationalCompetitions).forEach(([division,competition])=>{
      const rounds=Array.isArray(competition?.fixtures)?competition.fixtures:[];
      rounds.forEach((round,index)=>{
        if(!Array.isArray(round))return;
        const date=fixtureDateFor(division,index+1);
        round.forEach(game=>{
          if(!game?.home||!game?.away)return;
          reserveClubDate(game.home,date);
          reserveClubDate(game.away,date);
        });
      });
    });
  };
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
  const allCupFixtures=()=>(cupCompetition.stages||[]).flatMap(stage=>Array.isArray(stage?.fixtures)?stage.fixtures:[]);
  const refreshCopaDoBrasilFixtures=()=>{copaDoBrasilFixtures.length=0;copaDoBrasilFixtures.push(...allCupFixtures());};
  const rescheduleAllCupFixtures=()=>{
    rebuildLeagueClubDates();
    // Piso: jogos incompletos não podem ficar atrás do dia de carreira (fases criadas tarde
    // com datas nominais de ago/set enquanto o calendário já está em nov).
    const careerFloor=new Date(careerCalendarDate);
    careerFloor.setHours(12,0,0,0);
    const tieIdaDates=new Map();
    [...allCupFixtures()].sort((a,b)=>new Date(a.date)-new Date(b.date)||(a.gameNumber||0)-(b.gameNumber||0)||(a.leg==='VOLTA'?1:0)-(b.leg==='VOLTA'?1:0)).forEach(game=>{
      let minDate=game.leg==='VOLTA'&&tieIdaDates.has(game.tieId)?new Date(tieIdaDates.get(game.tieId)+minimumTwoLegGap):null;
      if(!game.completed){
        const gameDay=new Date(game.date);
        gameDay.setHours(12,0,0,0);
        if(gameDay.getTime()<careerFloor.getTime()){
          if(!minDate||minDate.getTime()<careerFloor.getTime())minDate=new Date(careerFloor);
        }
      }
      scheduleCupFixture(game,{minDate});
      if(game.leg!=='VOLTA')tieIdaDates.set(game.tieId,game.date.getTime());
    });
  };
  const calendarIntervalLabel=conflicts=>conflicts===0?'intervalo mínimo de 3 dias validado':`${conflicts} conflito(s) aguardando ajuste`;
  const cupPairsForStage=(definition,entrants)=>{
    const pool=Array.isArray(entrants)?entrants.filter(Boolean):[];
    if(!definition||pool.length<2)return [];
    if(definition.index===1){const ranked=[...pool];return Array.from({length:Math.min(14,Math.floor(ranked.length/2))},(_,index)=>{const pair=[ranked[index],ranked[ranked.length-1-index]];return Math.random()<.5?pair:pair.reverse();});}
    if(definition.index===5){const ranked=[...pool].sort((a,b)=>(clubs[b]?.power||0)-(clubs[a]?.power||0)),potA=shuffleCup(ranked.slice(0,16)),potB=shuffleCup(ranked.slice(16));return potA.filter((_,index)=>potB[index]).map((club,index)=>Math.random()<.5?[club,potB[index]]:[potB[index],club]);}
    const draw=shuffleCup(pool);return Array.from({length:Math.floor(draw.length/2)},(_,index)=>Math.random()<.5?[draw[index*2],draw[index*2+1]]:[draw[index*2+1],draw[index*2]]);
  };
  const createCupStage=(phaseIndex,entrants)=>{
    const definition=cupPhaseDefinitions[phaseIndex-1];
    if(!definition?.dates?.length)return null;
    const pairs=cupPairsForStage(definition,entrants),fixtures=[];
    const safeEntrants=Array.isArray(entrants)?entrants.filter(Boolean):[];
    pairs.forEach(([home,away],tieIndex)=>{
      if(!home||!away)return;
      const tieId=`F${phaseIndex}-G${tieIndex+1}`;
      const idaDate=definition.dates[0]||cupDate(6,1);
      fixtures.push({home,away,competition:'COPA DO BRASIL',phase:definition.name,phaseIndex,leg:definition.twoLegged?'IDA':'JOGO ÚNICO',date:new Date(idaDate),time:fixtureTimes[tieIndex%fixtureTimes.length],gameNumber:cupGameNumber++,tieId,completed:false});
      if(definition.twoLegged){
        const voltaDate=definition.dates[1]||definition.dates[0]||idaDate;
        fixtures.push({home:away,away:home,competition:'COPA DO BRASIL',phase:definition.name,phaseIndex,leg:'VOLTA',date:new Date(voltaDate),time:fixtureTimes[(tieIndex+1)%fixtureTimes.length],gameNumber:cupGameNumber++,tieId,completed:false});
      }
    });
    const stage={index:phaseIndex,name:definition.name,twoLegged:definition.twoLegged,entrants:safeEntrants,fixtures,completed:false,winners:[]};cupCompetition.stages.push(stage);refreshCopaDoBrasilFixtures();rescheduleAllCupFixtures();syncUserCalendarSpacing();cupCompetition.currentPhase=phaseIndex;onCupScheduleChanged();return stage;
  };
  cupCompetition.stages.forEach(stage=>{
    if(!Array.isArray(stage.fixtures))stage.fixtures=[];
    stage.fixtures.sort((a,b)=>a.date-b.date||a.gameNumber-b.gameNumber);
  });
  refreshCopaDoBrasilFixtures();
  const knockoutShootoutSanitized=sanitizeKnockoutShootoutSave({cupCompetition,serieDFixtures:nationalCompetitions.D.fixtures});
  let syncUserCalendarSpacing=()=>{rescheduleAllCupFixtures();};
  const calculateRestConflicts=()=>[...clubMatchDates.values()].reduce((total,dates)=>{const ordered=[...dates].sort((a,b)=>a-b);return total+ordered.slice(1).filter((date,index)=>date-ordered[index]<minimumMatchGap).length;},0);
  let restConflictCount=0;
  const fixtureDetails=game=>{if(game.competition==='COPA DO BRASIL'){const date=new Date(game.date),day=String(date.getDate()).padStart(2,'0'),month=date.toLocaleDateString('pt-BR',{month:'short'}).replace('.','').toUpperCase();return{date,display:`${day} ${month}`,time:game.time};}const gameIndex=(championshipFixtures[game.round-1]||[]).findIndex(candidate=>candidate.home===game.home&&candidate.away===game.away);const date=fixtureDate(game.round),day=String(date.getDate()).padStart(2,'0'),month=date.toLocaleDateString('pt-BR',{month:'short'}).replace('.','').toUpperCase();return {date,display:`${day} ${month}`,time:fixtureTimes[Math.max(0,gameIndex)%fixtureTimes.length]};};
  const clubCrestInitials=name=>name.split(' ').filter(Boolean).map(part=>part[0]).join('').slice(0,2).toUpperCase();
  /** Badge de divisão só no chaveamento da Copa (evita poluir tabelas/listas). */
  const cupClubLabel=(name,opts)=>clubLabelHtml(name,{clubs,userClub,userDivision},opts);
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
  const crowdEntryKey=entry=>`${entry.home}|${entry.away}|${entry.round??''}|${entry.leg??''}|${entry.phase??''}|${entry.competition??''}`;
  const crowdCompetitionLabel=game=>{
    if(game?.competition==='COPA DO BRASIL')return `Copa · ${game.phase||''}${game.leg?` · ${game.leg}`:''}`.replace(/\s·\s$/,'').trim();
    if(isKnockoutShootoutCompetition(game))return `Série D · ${game.leg||'Eliminatórias'}`;
    return `Rodada ${game?.round??currentRound}`;
  };
  const upsertUserSeasonCrowd=entry=>{
    if(!entry||entry.home!==userClub)return;
    const attendance=Math.round(Number(entry.attendance));
    if(!Number.isFinite(attendance)||attendance<=0)return;
    const normalized={
      home:entry.home,
      away:entry.away||entry.opponent||'—',
      attendance,
      fillRate:Number.isFinite(Number(entry.fillRate))?Number(entry.fillRate):null,
      gateRevenue:Number.isFinite(Number(entry.gateRevenue))?Number(entry.gateRevenue):null,
      competition:entry.competition||null,
      label:entry.label||crowdCompetitionLabel(entry)||'Jogo em casa',
      phase:entry.phase||null,
      leg:entry.leg||null,
      round:entry.round??null,
    };
    const key=crowdEntryKey(normalized);
    const index=userSeasonCrowds.findIndex(item=>crowdEntryKey(item)===key);
    if(index>=0)userSeasonCrowds[index]={...userSeasonCrowds[index],...normalized};
    else userSeasonCrowds.push(normalized);
  };
  const recordUserHomeCrowd=(game,gateResult=null)=>{
    if(!isUserHomeMatch(game))return;
    const crowd=Number.isFinite(Number(game.attendance))
      ?{attendance:Number(game.attendance),fillRate:game.fillRate}
      :resolveMatchAttendance(game);
    if(!crowd||!Number.isFinite(Number(crowd.attendance)))return;
    upsertUserSeasonCrowd({
      home:game.home,
      away:game.away,
      attendance:crowd.attendance,
      fillRate:crowd.fillRate,
      gateRevenue:gateResult?.ok?gateResult.entry?.amount:game.gateRevenue,
      competition:game.competition||'LEAGUE',
      label:crowdCompetitionLabel(game),
      phase:game.phase||null,
      leg:game.leg||null,
      round:game.round??null,
    });
  };
  const creditUserHomeGate=game=>{
    // Só mando de campo — visitante nunca recebe bilheteria.
    if(!isUserHomeMatch(game)||!clubs[userClub])return null;
    const venue=matchVenueFor(userClub);
    const result=creditHomeGate(clubs[userClub],game,{division:userDivision,capacity:venue.capacity});
    if(result?.ok){
      recordUserHomeCrowd(game,result);
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
    if(userAtHome)recordUserHomeCrowd(game,gateResult);
    const resultMeta=matchdayMetaForGame(game);
    pushMessage({
      category:'competition',
      type:'match-result',
      title:'RESULTADO DA PARTIDA',
      body:lines.join('\n'),
      round:currentRound,
      meta:{
        competition:resultMeta.competition,
        roundLabel:resultMeta.roundLabel,
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
  const userKnockoutFixtures=()=>userDivision==='D'
    ?(Array.isArray(nationalCompetitions.D?.fixtures)?nationalCompetitions.D.fixtures:[])
      .filter(Array.isArray).flat().filter(isKnockoutShootoutCompetition)
    :[];
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
  const hasPendingUserFixtures=()=>pendingUserSchedule().length>0;
  /** Nacional encerrado e sem partidas do usuário (inclui Copa) — UI de temporada fechada. */
  const seasonFullyComplete=()=>seasonComplete()&&!hasPendingUserFixtures();
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
  const isPendingFixtureOverdue=entry=>{
    if(!entry?.details?.date)return false;
    const target=new Date(entry.details.date);
    target.setHours(12,0,0,0);
    const today=new Date(careerCalendarDate);
    today.setHours(12,0,0,0);
    return today.getTime()>target.getTime();
  };
  const normalizeCalendarBeforeNextMatch=()=>{
    const next=nextPendingUserEntry();
    if(!next||isFixtureCompleted(next.game))return false;
    if(!isPendingFixtureOverdue(next))return false;
    // Snap no dia do jogo (não no dia anterior) para liberar JOGAR PARTIDA.
    const target=new Date(next.details.date);
    target.setHours(12,0,0,0);
    advanceCareerCalendarTo(target);
    return true;
  };
  /** Repara atraso de calendário sem reschedule pesado em loop (evita travar a UI). */
  const ensureCalendarMatchConsistency=()=>{
    const next=nextPendingUserEntry();
    if(!next||!isPendingFixtureOverdue(next))return false;
    // Copa: remarca datas atrasadas uma vez. Liga: só snap no dia do jogo.
    if(next.game?.competition==='COPA DO BRASIL')rescheduleAllCupFixtures();
    return normalizeCalendarBeforeNextMatch();
  };
  if(validSavedSeason){
    if(!savedSeason.careerCalendarDate){
      const lastCompleted=userSchedule().filter(entry=>isFixtureCompleted(entry.game)).pop(),nextPending=nextPendingUserEntry();
      advanceCareerCalendarTo(lastCompleted?.details.date??nextPending?.details.date??(currentRound>1?fixtureDate(Math.max(1,currentRound-1)):null)??seasonStartDate());
    }else if(currentRound>1&&sameCalendarDay(careerCalendarDate,seasonStartDate())){
      const lastCompleted=userSchedule().filter(entry=>isFixtureCompleted(entry.game)).pop();
      if(lastCompleted)advanceCareerCalendarTo(lastCompleted.details.date);
    }
    ensureCalendarMatchConsistency();
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
    userUpcomingGames=pendingUserSchedule().slice(0,5).map(entry=>entry.game);
    nextUserGame=nextPendingUserEntry()?.game||null;
  };
  let rosterSort={key:'pos',dir:'asc'};
  let rosterFilters={pos:'',foot:'',personality:''};
  const rosterSortValue=(p,key)=>{
    switch(key){
      case 'name':return String(p.name||'');
      case 'pos':return String(p.pos||'');
      case 'age':return Number(p.age)||0;
      case 'height':return Number(p.height)||0;
      case 'foot':return String(p.preferredFoot||'');
      case 'personality':return String(p.personality||'');
      case 'ovr':return Number(p.overall)||0;
      case 'speed':return Number(p.speed)||0;
      case 'dribble':return Number(p.dribble)||0;
      case 'marking':return Number(p.marking)||0;
      case 'tackling':return Number(p.tackling)||0;
      case 'heading':return Number(p.heading)||0;
      case 'finishing':return Number(p.finishing)||0;
      case 'passing':return Number(p.passing)||0;
      case 'playmaking':return Number(p.playmaking)||0;
      case 'freeKick':return Number(p.freeKick)||0;
      case 'penaltyTaking':return Number(p.penaltyTaking)||0;
      case 'positioning':return Number(p.positioning)||0;
      case 'penaltySaving':return Number(p.penaltySaving)||0;
      case 'reflexes':return Number(p.reflexes)||0;
      case 'fatigue':return Number(p.fatigue)||0;
      default:return 0;
    }
  };
  const syncRosterFilterOptions=()=>{
    const fill=(sel,values,allLabel,current)=>{
      if(!sel)return;
      const opts=['<option value="">'+allLabel+'</option>']
        .concat([...values].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(v=>`<option value="${v}">${v}</option>`));
      sel.innerHTML=opts.join('');
      sel.value=[...sel.options].some(o=>o.value===current)?current:'';
    };
    const pos=new Set(),foot=new Set(),personality=new Set();
    squad.forEach(p=>{
      if(p.pos)pos.add(p.pos);
      if(p.preferredFoot)foot.add(p.preferredFoot);
      if(p.personality)personality.add(p.personality);
    });
    fill($('#rosterFilters [data-roster-filter="pos"]'),pos,'Todas',rosterFilters.pos);
    fill($('#rosterFilters [data-roster-filter="foot"]'),foot,'Todos',rosterFilters.foot);
    fill($('#rosterFilters [data-roster-filter="personality"]'),personality,'Todos',rosterFilters.personality);
  };
  const ROSTER_ATTR_KEYS_OUTFIELD=['speed','dribble','marking','tackling','heading','finishing','passing','playmaking','freeKick','penaltyTaking'];
  /** Top 3 atributos do jogador (GOL prioriza stats de goleiro; linha usa campo). */
  const topRosterAttrKeys=(player,limit=3)=>{
    const keys=player?.pos==='GOL'
      ?['positioning','penaltySaving','reflexes','passing','speed','dribble','marking','tackling','heading','finishing','playmaking','freeKick','penaltyTaking']
      :ROSTER_ATTR_KEYS_OUTFIELD;
    return new Set(
      keys
        .map(key=>({key,value:Number(player?.[key])}))
        .filter(row=>Number.isFinite(row.value)&&row.value>0)
        .sort((a,b)=>b.value-a.value||a.key.localeCompare(b.key))
        .slice(0,limit)
        .map(row=>row.key),
    );
  };
  const rosterAttrCell=(player,key,groupClass,display,topKeys)=>{
    const top=topKeys.has(key);
    return `<span class="${groupClass}${top?' is-top-attr':''}">${display}</span>`;
  };
  const renderRoster=()=>{
    const list=$('#playerList');
    if(!list)return;
    syncRosterFilterOptions();
    let rows=squad.slice();
    if(rosterFilters.pos)rows=rows.filter(p=>p.pos===rosterFilters.pos);
    if(rosterFilters.foot)rows=rows.filter(p=>p.preferredFoot===rosterFilters.foot);
    if(rosterFilters.personality)rows=rows.filter(p=>p.personality===rosterFilters.personality);
    const dir=rosterSort.dir==='asc'?1:-1;
    const key=rosterSort.key;
    rows.sort((a,b)=>{
      const va=rosterSortValue(a,key),vb=rosterSortValue(b,key);
      if(typeof va==='string'||typeof vb==='string'){
        return String(va).localeCompare(String(vb),'pt-BR')*dir||String(a.name||'').localeCompare(String(b.name||''),'pt-BR');
      }
      return (va-vb)*dir||String(a.name||'').localeCompare(String(b.name||''),'pt-BR');
    });
    list.innerHTML=rows.map(p=>{
      const top=topRosterAttrKeys(p);
      return `<div class="player-row roster-expanded">
      <span>${playerNameCell(p.name,p,{allCompetitions:true})}</span>
      <span class="badge">${p.pos}</span>
      <span>${p.age}</span>
      <span>${p.overall}</span>
      <span>${p.height?`${p.height} cm`:'—'}</span>
      <span>${p.preferredFoot||'—'}</span>
      <span>${p.personality||'—'}</span>
      ${rosterAttrCell(p,'speed','roster-group-phys',p.speed,top)}
      ${rosterAttrCell(p,'dribble','roster-group-phys',p.dribble,top)}
      ${rosterAttrCell(p,'marking','roster-group-def',p.marking,top)}
      ${rosterAttrCell(p,'tackling','roster-group-def',p.tackling,top)}
      ${rosterAttrCell(p,'heading','roster-group-def',p.heading,top)}
      ${rosterAttrCell(p,'finishing','roster-group-atk',p.finishing,top)}
      ${rosterAttrCell(p,'passing','roster-group-atk',p.passing,top)}
      ${rosterAttrCell(p,'playmaking','roster-group-atk',p.playmaking,top)}
      ${rosterAttrCell(p,'freeKick','roster-group-set',p.freeKick,top)}
      ${rosterAttrCell(p,'penaltyTaking','roster-group-set',p.penaltyTaking,top)}
      ${rosterAttrCell(p,'positioning','roster-group-gk',outfield(p.positioning),top)}
      ${rosterAttrCell(p,'penaltySaving','roster-group-gk',outfield(p.penaltySaving),top)}
      ${rosterAttrCell(p,'reflexes','roster-group-gk',outfield(p.reflexes),top)}
      <span class="roster-fatigue"><i><b style="width:${clamp(p.fatigue,0,100)}%"></b></i><em>${Math.round(p.fatigue)}%</em></span>
    </div>`;
    }).join('');
    $$('#rosterHead [data-roster-sort]').forEach(btn=>{
      const active=btn.dataset.rosterSort===rosterSort.key;
      btn.classList.toggle('is-sorted',active);
      btn.classList.toggle('is-asc',active&&rosterSort.dir==='asc');
      btn.classList.toggle('is-desc',active&&rosterSort.dir==='desc');
    });
  };
  onClick('#rosterHead',event=>{
    const sortBtn=event.target.closest('[data-roster-sort]');
    if(!sortBtn)return;
    const key=sortBtn.dataset.rosterSort;
    if(rosterSort.key===key)rosterSort.dir=rosterSort.dir==='asc'?'desc':'asc';
    else{
      rosterSort.key=key;
      rosterSort.dir=['name','pos','foot','personality'].includes(key)?'asc':'desc';
    }
    renderRoster();
  });
  on('#rosterFilters','change',event=>{
    const sel=event.target.closest('[data-roster-filter]');
    if(!sel)return;
    const kind=sel.getAttribute('data-roster-filter');
    if(kind==='pos'||kind==='foot'||kind==='personality'){
      rosterFilters[kind]=sel.value||'';
      renderRoster();
    }
  });
  renderRoster();
  const leagueRow=(row,index)=>`<div class="league-row ${row.club === userClub ? 'highlight' : ''}" data-club="${row.club}" role="button" tabindex="0"><span>${userDivision==='D'?index+1:clubs[row.club].position}</span><span class="club-link">${row.club}</span><span>${row.played}</span><span>${row.wins}</span><span>${row.draws}</span><span>${row.losses}</span><span>${row.goalDiff>=0?'+':''}${row.goalDiff}</span><span>${row.points}</span></div>`;
  // leagueTable preenchido por renderChampionshipPage após helpers de fase.
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
    const clubMarkup=pinned?`<span class="national-ranking-club-cell"><i class="crest national-ranking-row-crest" aria-hidden="true">${clubCrestInitials(entry.club)}</i><span class="club-link">${entry.club}</span></span>`:`<span class="club-link">${entry.club}</span>`;
    const userRow=entry.club===userClub,scoreHint=`Base ${entry.base.toFixed(1)} + Campeonatos ${entry.championshipPoints.toFixed(1)} + Títulos ${entry.titlePoints.toFixed(1)}`;
    return `<div class="national-ranking-row${pinned?' national-ranking-user-row user-ranking':userRow?' user-ranking':''}" data-club="${entry.club}" role="button" tabindex="0" aria-label="${entry.club} · ${scoreHint} · Total ${entry.total.toFixed(1)}"><span>${position}</span>${clubMarkup}<span>${entry.division}</span><span class="national-ranking-base national-ranking-col-hidden" aria-hidden="true">${entry.base.toFixed(1)}</span><span class="national-ranking-championships national-ranking-col-hidden" aria-hidden="true">${entry.championshipPoints.toFixed(1)}</span><span class="national-ranking-titles">${entry.titlePoints.toFixed(1)}</span><span class="national-ranking-total" title="${scoreHint}">${entry.total.toFixed(1)}</span></div>`;
  };
  let nationalRankingSearchQuery='';
  const normalizeClubSearch=value=>String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .trim();
  const renderNationalRanking=()=>{
    const ranking=currentNationalRanking();
    const query=normalizeClubSearch(nationalRankingSearchQuery);
    const userIndex=ranking.findIndex(entry=>entry.club===userClub);
    const userSlot=$('#nationalRankingUserRow');
    const userMatches=!query||(userIndex>=0&&normalizeClubSearch(ranking[userIndex].club).includes(query));
    if(userIndex>=0&&userMatches){userSlot.innerHTML=nationalRankingRowHtml(ranking[userIndex],userIndex+1,{pinned:true});userSlot.hidden=false;}
    else{userSlot.innerHTML='';userSlot.hidden=true;}
    const filtered=query
      ?ranking.map((entry,index)=>({entry,position:index+1})).filter(({entry})=>normalizeClubSearch(entry.club).includes(query))
      :ranking.map((entry,index)=>({entry,position:index+1}));
    const table=$('#nationalRankingTable');
    table.innerHTML=filtered.length
      ?filtered.map(({entry,position})=>nationalRankingRowHtml(entry,position,{pinned:false})).join('')
      :'<div class="national-ranking-empty">Nenhum time encontrado.</div>';
    if(query&&filtered.length){
      requestAnimationFrame(()=>{
        const hit=table.querySelector('.national-ranking-row');
        if(!hit)return;
        hit.classList.add('ranking-search-hit');
        hit.scrollIntoView({block:'nearest',behavior:'smooth'});
      });
    }
  };
  const runNationalRankingClubSearch=()=>{
    const input=$('#nationalRankingClubSearch');
    nationalRankingSearchQuery=input?.value||'';
    renderNationalRanking();
  };
  onClick('#nationalRankingClubSearchBtn',runNationalRankingClubSearch);
  on('#nationalRankingClubSearch','keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();runNationalRankingClubSearch();}
  });
  renderNationalRanking();
  const managerRankingHelpers=()=>({
    getClubDivision:clubName=>clubs[clubName]?.division||'—',
    getClubSeasonPoints:clubName=>{
      const club=clubs[clubName];
      if(!club)return 0;
      const seasonFinalized=nationalRankingFinalizedSeasons.has(careerSeason);
      if(seasonFinalized)return 0;
      const raw=nationalCompetitions[club.division]?.standings.find(row=>row.club===clubName)?.points||0;
      return roundRankingScore(raw*(nationalLeaguePointWeights[club.division]||1));
    },
  });
  /** Comissão por rodada × ~4 rodadas ≈ salário mensal exibido no ranking. */
  const STAFF_ROUNDS_PER_MONTH=4;
  const managerMonthlySalary=(entry)=>{
    const preferred=['A','B','C','D'].includes(entry.preferredDivision)?entry.preferredDivision:null;
    const division=entry.status==='employed'?(entry.division||'D'):(preferred||'D');
    const club=entry.club?clubs[entry.club]:null;
    const perRound=estimateStaffBill(club||{},division,{
      managerId:entry.id,
      managerName:entry.name,
      managerReputation:entry.reputation,
      preferredDivision:entry.preferredDivision||division,
      titlePoints:entry.titlePoints,
    });
    return Math.max(0,Math.round(perRound*STAFF_ROUNDS_PER_MONTH));
  };
  const managerRankingRowHtml=(entry,position,{pinned=false}={})=>{
    const isUser=entry.club===userClub||entry.name===careerProfile.managerName;
    const nameCell=pinned
      ?`<span class="national-ranking-club-cell"><i class="crest national-ranking-row-crest" aria-hidden="true">${clubInitials}</i><span>${entry.name}</span></span>`
      :`<span>${entry.name}</span>`;
    const salary=managerMonthlySalary(entry);
    const salaryLabel=formatBudget(salary);
    const scoreHint=`Base ${entry.base.toFixed(1)} + Temporada ${entry.seasonPoints.toFixed(1)} + Títulos ${entry.titlePoints.toFixed(1)} · Salário ${salaryLabel}/mês`;
    return `<div class="national-ranking-row manager-ranking-row${pinned?' national-ranking-user-row user-ranking':isUser?' user-ranking':''}${entry.status==='free'?' manager-free':''}" data-manager="${entry.id}" ${entry.club?`data-club="${entry.club}"`:''} role="button" tabindex="0" aria-label="${entry.name} · ${scoreHint} · Total ${entry.total.toFixed(1)}"><span>${position}</span>${nameCell}<span class="manager-ranking-club">${entry.clubLabel}</span><span>${entry.division}</span><span class="national-ranking-col-hidden" aria-hidden="true">${entry.base.toFixed(1)}</span><span class="manager-ranking-season">${entry.seasonPoints.toFixed(1)}</span><span class="manager-ranking-salary" title="Salário mensal estimado">${salaryLabel}</span><span class="national-ranking-total" title="${scoreHint}">${entry.total.toFixed(1)}</span></div>`;
  };
  const renderManagerRanking=()=>{
    const helpers=managerRankingHelpers();
    const ranking=managerRanking.currentRanking(helpers);
    const userManager=managerRanking.byClub(userClub)||managerRanking.byName(careerProfile.managerName);
    const userIndex=userManager?ranking.findIndex(entry=>entry.id===userManager.id):-1;
    const userSlot=$('#managerRankingUserRow');
    if(userSlot){
      if(userIndex>=0){userSlot.innerHTML=managerRankingRowHtml(ranking[userIndex],userIndex+1,{pinned:true});userSlot.hidden=false;}
      else{userSlot.innerHTML='';userSlot.hidden=true;}
    }
    const table=$('#managerRankingTable');
    if(table)table.innerHTML=ranking.map((entry,index)=>managerRankingRowHtml(entry,index+1,{pinned:false})).join('');
  };
  renderManagerRanking();
  const router=createRouter({ $$, onClick });
  router.onView('ranking',renderNationalRanking);
  router.onView('managers',renderManagerRanking);
  router.onView('messages',renderMessages);
  router.bindNav();
  messages.bindHandlers({ openView:viewId=>router.openView(viewId) });
  if(savedNewGame&&!messages.getMessages().length)pushMessage({category:'club',type:'welcome',title:'Nova temporada',body:`${userClub} inicia a temporada ${careerSeason} na Série ${userDivision}. A jornada começa em 1º de janeiro; os campeonatos seguem o calendário nacional da CBF.`,round:currentRound,read:true});
  renderSeasonGoalCard();
  if(savedNewGame&&seasonGoalJustCreated&&seasonGoal){
    pushMessage({category:'club',type:'season-goal',title:'META DA TEMPORADA',body:`A diretoria definiu a expectativa para ${careerSeason}: ${seasonGoal.label}.`,round:currentRound,read:false});
    seasonGoalJustCreated=false;
  }
  autoMarkStaleMessages();
  updateMessageBadge();renderDashboardMessagesFeed();
  // Retoma ação médica pendente (badge vermelho + janelas).
  if(savedNewGame&&(messages.getMedicalActionMessages?.().length||postMatchMedicalQueue.length||pendingTreatmentDecision)){
    queueMicrotask(()=>openMedicalActionFlow());
  }
  let seasonCalendarFixtures=[...championshipFixtures.flat(),...copaDoBrasilFixtures].sort((a,b)=>fixtureDetails(a).date-fixtureDetails(b).date);
  const calendarKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const calendarDate=key=>{const [year,month,day]=key.split('-').map(Number);return new Date(year,month-1,day,12);};
  const matchBriefAlreadySent=briefKey=>messages.getMessages().some(message=>message.meta?.briefKey===briefKey);
  const opponentForGame=game=>game.home===userClub?game.away:game.home;
  const competitionLabelForGame=game=>game.competition==='COPA DO BRASIL'?`Copa do Brasil · ${game.phase||game.leg||''}`:isKnockoutShootoutCompetition(game)?`Série D · ${game.leg||'Eliminatórias'}`:`Brasileirão Série ${userDivision} · Rodada ${game.round??currentRound}`;
  const matchdayMetaForGame=game=>{
    if(game.competition==='COPA DO BRASIL'){
      return {
        competition:'Copa do Brasil',
        roundLabel:[game.phase,game.leg].filter(Boolean).join(' · ')||'Copa',
      };
    }
    if(isKnockoutShootoutCompetition(game)){
      return {competition:'Brasileirão D',roundLabel:game.leg||'Eliminatórias'};
    }
    return {
      competition:`Brasileirão ${userDivision}`,
      roundLabel:`Rodada ${game.round??currentRound}`,
    };
  };
  const pushMatchDayBrief=game=>{
    if(!game)return;
    const opponent=opponentForGame(game),details=fixtureDetails(game),briefKey=`matchday-${game.home}-${game.away}-${calendarKey(details.date)}`;
    if(matchBriefAlreadySent(briefKey))return;
    const leaders=clubSeasonLeaders(opponent),venue=game.home===userClub?'Casa':'Fora';
    const day=String(details.date.getDate()).padStart(2,'0');
    const month=String(details.date.getMonth()+1).padStart(2,'0');
    const meta=matchdayMetaForGame(game);
    const body=[
      `${day}/${month} · ${details.time} · ${venue}.`,
      '',
      `Destaques do adversário: artilheiro ${leaders.scorer.name} (${leaders.goals} gols) · assistências ${leaders.assistant.name} (${leaders.assists}).`,
    ].join('\n');
    pushMessage({
      category:'competition',
      type:'matchday',
      title:'JOGO DO DIA',
      body,
      round:currentRound,
      meta:{competition:meta.competition,roundLabel:meta.roundLabel,briefKey,opponent},
    });
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
  let championshipSerieDMode='knockout'; // groups | knockout (só quando mata-mata existe)
  let openChampionship=()=>{};
  let calendarView,dashboard;
  let transfersEngine=null;
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
    seasonFullyComplete,
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
    findMatchLog:query=>playerHistory?.findMatchLog?.(query)||null,
    formatMatchRating,
    formatVenueCrowdLine,
    getMarketDayBrief:date=>transfersEngine?.getMarketDayBrief?.(date)||null,
  });
  const {renderCalendar,openCalendarMatchReport,calendarGameResult,openDashboardCalendarView,setSelectedCalendarDate}=calendarView;
  onCupScheduleChanged=calendarView.onCupScheduleChanged;
  // Flags de partida ao vivo — declaradas cedo: refreshSeasonPresentation / PÓS-JOGO leem antes do bloco do motor.
  let matchStarted=false, matchFinished=false, roundCommitted=false;
  let advanceTransferCalendarFn=()=>({ok:false,reason:'no_club'});
  let advanceCalendarWeekFn=()=>null;
  let transfersUi=null;
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
    seasonFullyComplete,
    isUserSeasonIdle,
    nextPendingUserEntry,
    pendingUserSchedule,
    fixtureDetails,
    displayedClubPosition,
    sameCalendarDay,
    daysUntilNextFixtureFromToday,
    restDaysUntilNextFixture,
    leagueUserGameForRound,
    isKnockoutShootoutCompetition,
    knockoutCompetitionLabel,
    leadersFor,
    clubSeasonLeaders,
    getSeasonRoundHistory:()=>seasonRoundHistory,
    getCopaFixtures:()=>copaDoBrasilFixtures,
    getNationalCompetitions:()=>nationalCompetitions,
    getCareerMessages:()=>messages.getMessages(),
    getUserBudgetLedger:()=>Array.isArray(clubs[userClub]?.budgetLedger)?clubs[userClub].budgetLedger:[],
    getUserSeasonCrowds:()=>userSeasonCrowds,
    openCalendarMatchReport,
    calendarGameResult,
    isCompletedDashboardGame,
    fixtureDate,
    getUserSerieDGroupIndex:()=>userSerieDGroupIndex,
    isSponsorChoicePending:()=>!!pendingSponsorChoice,
    onRequestSponsorPicker:()=>openSponsorPickerIfPending?.(),
    // Visível só com pós-jogo pendente e modal fechado (×). Some no AVANÇAR / avanço de rodada.
    canReopenLivePostMatch:()=>{
      // Pós-jogo pendente (ainda sem AVANÇAR) + modal fechado → CTA PÓS-JOGO no dashboard.
      if(!(matchStarted&&matchFinished&&!roundCommitted&&liveMatchGame))return false;
      return !!$('#matchModal')?.classList.contains('hidden');
    },
    getTransferWindowPhase:()=>transfersEngine?.getWindowPhase?.()||null,
    isTransferMarketOpen:()=>!!transfersEngine?.marketStatus?.()?.open,
    advanceTransferCalendar:(...args)=>advanceTransferCalendarFn(...args),
    advanceCalendarWeek:(...args)=>advanceCalendarWeekFn(...args),
    showTransferWindowReport:report=>transfersUi?.showWindowReport?.(report),
  });
  let openSponsorPickerIfPending=()=>{};
  const {renderDashboardMiniTable,renderDashboardUpcoming,renderUserMatchPresentation,renderLeaders,renderRecentResults}=dashboard;
  const backfillUserSeasonCrowds=()=>{
    const before=userSeasonCrowds.length;
    messages.getMessages().forEach(message=>{
      if(message?.type!=='match-result')return;
      const meta=message.meta||{};
      if(meta.home!==userClub||!Number.isFinite(Number(meta.attendance)))return;
      upsertUserSeasonCrowd({
        home:meta.home,
        away:meta.away,
        attendance:meta.attendance,
        fillRate:meta.fillRate,
        gateRevenue:meta.gateRevenue,
        competition:meta.competition||'LEAGUE',
        label:meta.competition||'Jogo em casa',
        round:message.round??null,
      });
    });
    (clubs[userClub]?.budgetLedger||[]).forEach(entry=>{
      if(entry?.reason!=='gate_receipt')return;
      const meta=entry.meta||{};
      if(!Number.isFinite(Number(meta.attendance)))return;
      upsertUserSeasonCrowd({
        home:userClub,
        away:meta.opponent||'—',
        attendance:meta.attendance,
        fillRate:meta.fillRate,
        gateRevenue:entry.amount,
        competition:meta.competition||'LEAGUE',
        label:entry.label||'Bilheteria',
        phase:meta.phase||null,
      });
    });
    seasonRoundHistory.forEach(round=>{
      (round.games||[]).forEach(game=>{
        if(game?.home!==userClub||!Number.isFinite(Number(game.attendance)))return;
        upsertUserSeasonCrowd({
          home:game.home,
          away:game.away,
          attendance:game.attendance,
          fillRate:game.fillRate,
          gateRevenue:game.gateRevenue,
          competition:'LEAGUE',
          label:`Rodada ${round.round}`,
          round:round.round,
        });
      });
    });
    copaDoBrasilFixtures.forEach(game=>{
      if(game?.home!==userClub||!game.completed||!Number.isFinite(Number(game.attendance)))return;
      recordUserHomeCrowd(game,null);
    });
    if(userSeasonCrowds.length>before)persistSeason(true);
  };
  backfillUserSeasonCrowds();
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
    estimateWageBill,
    estimateStaffBill,
    estimateStadiumOpsBill,
    estimateRoundCostBill,
    ensureStadium,
    getTicketPrices,
    adjustTicketPrice,
    estimateGateReceipt,
    getSponsors,
    estimateSponsorInstallment,
    estimateTvInstallment,
    getSeasonCashflowStatement,
    getStructureLevel,
    getPitchLevel,
    maxPitchForStructure,
    pitchTierLabel,
    purchaseStadiumNameRights,
    nameRightsCost,
    TICKET_PRICE_RANGE,
    getUserClub:()=>userClub,
    getClubs:()=>clubs,
    getUserDivision:()=>userDivision,
    getCareerSeason:()=>careerSeason,
    getSeasonGoal:()=>ensureSeasonGoal(),
    getSeasonGoalLiveContext:()=>buildSeasonGoalLiveContext(),
    getBoardBriefContext:club=>{
      const target=club||clubs[userClub];
      if(!target)return null;
      const standing=userStandingSnapshot();
      const form=[];
      for(let index=seasonRoundHistory.length-1;index>=0&&form.length<5;index--){
        const games=seasonRoundHistory[index]?.games||[];
        const game=games.find(item=>involvesClub(item,userClub));
        if(!game||game.homeGoals==null||game.awayGoals==null)continue;
        const userHome=game.home===userClub;
        const userGoals=userHome?game.homeGoals:game.awayGoals;
        const oppGoals=userHome?game.awayGoals:game.homeGoals;
        form.unshift(userGoals>oppGoals?'W':userGoals<oppGoals?'L':'D');
      }
      const goal=ensureSeasonGoal();
      return composeBoardBrief({
        board:target.board,
        finances:target.finances,
        form,
        position:standing?.position||target.position||null,
        played:standing?.played||form.length,
        goalLabel:goal?.label||null,
        wageShortfall:!!target.wageShortfall,
      });
    },
    onBudgetChanged:()=>{
      if(clubs[userClub])clubStatus.syncFinancesFromBudget(clubs[userClub],userDivision);
      renderEnvironmentCard();
      persistSeason();
      updateMessageBadge();
      renderDashboardMessagesFeed();
    },
    pushMessage,
    getCurrentRound:()=>currentRound,
    openView:viewId=>router.openView(viewId),
  });
  economyUi.init();
  router.onView('office',()=>economyUi.renderOffice());
  router.onView('stadium',()=>economyUi.renderStadium());
  router.onView('training',()=>calendarView.renderTrainingRules());
  const syncCareerRosters=()=>{
    if(!savedNewGame||!clubs[userClub])return;
    savedNewGame.userRoster=clubs[userClub].roster.map(player=>({
      ...player,
      injuryHistory:pruneInjuryHistory(player.injuryHistory),
    }));
    savedNewGame.worldRosters=collectWorldRosters(clubs,{skipClub:userClub});
    writeJson(SAVE_KEYS.career,{...savedNewGame});
  };
  const clubFormFromHistory=clubName=>{
    const form=[];
    for(let index=seasonRoundHistory.length-1;index>=0&&form.length<5;index--){
      const games=seasonRoundHistory[index]?.games||[];
      const game=games.find(item=>involvesClub(item,clubName));
      if(!game||game.homeGoals==null||game.awayGoals==null)continue;
      const home=game.home===clubName;
      const goals=home?game.homeGoals:game.awayGoals;
      const opp=home?game.awayGoals:game.homeGoals;
      form.unshift(goals>opp?'W':goals<opp?'L':'D');
    }
    return form;
  };
  const formatTransferMoney=value=>{
    const amount=Math.round(Number(value)||0);
    if(amount>=1_000_000)return `R$ ${(amount/1_000_000).toFixed(amount>=10_000_000?0:1)} mi`;
    if(amount>=1_000)return `R$ ${(amount/1_000).toFixed(0)} mil`;
    return `R$ ${amount}`;
  };
  transfersEngine=FEATURES.transfers?createTransfersEngine({
    getClubs:()=>clubs,
    getUserClub:()=>userClub,
    getCareerSeason:()=>careerSeason,
    spend,
    credit,
    canAfford,
    isMarketOpen:()=>!(matchStarted&&!matchFinished)&&!seasonTransitionPrepared,
    getCurrentRound:()=>currentRound,
    getSeasonRoundCount:()=>seasonMaxRound(),
    getCareerDate:()=>careerCalendarDate,
    initialPendingOffers:validSavedSeason&&Array.isArray(savedSeason.pendingTransferOffers)
      ?savedSeason.pendingTransferOffers.map(item=>({...item}))
      :[],
    initialSeasonDeals:validSavedSeason&&Array.isArray(savedSeason.seasonTransferDeals)
      ?savedSeason.seasonTransferDeals.map(item=>({...item}))
      :[],
    resolveOfferMessage:messageId=>messages.resolveMessageById?.(messageId),
    getNationalRank:clubName=>{
      const ranking=currentNationalRanking();
      const position=ranking.findIndex(entry=>entry.club===clubName)+1;
      if(!position)return { position: ranking.length || 1, total: ranking.length || 1, size: ranking.length || 1 };
      return { position, total: ranking.length, size: ranking.length };
    },
    getClubForm:clubFormFromHistory,
    getUserManager:()=>{
      const manager=managerRanking.byClub(userClub)||managerRanking.byName(careerProfile?.managerName);
      if(!manager)return null;
      const entry=managerRanking.resolveEntry(manager,{
        getClubDivision:name=>clubs[name]?.division||userDivision,
      });
      return {
        reputation:Number(manager.reputation??60)||60,
        total:Number(entry?.total??manager.reputation??60)||60,
        name:manager.name||null,
      };
    },
    onAfterTransfer:result=>{
      if(result?.ok&&result.player){
        const hist=playerHistory?.getPlayer?.(playerKey(result.player));
        if(hist)hist.club=result.to;
        playerHistory?.persist?.();
      }
      if(clubs[userClub]){
        assignSquadJerseyNumbers(clubs[userClub].roster);
        squad.splice(0,squad.length,...clubs[userClub].roster);
      }
      syncCareerRosters();
      try{renderRoster();}catch{/* boot */}
      try{renderEnvironmentCard();}catch{/* boot */}
    },
  }):null;
  const notifyIncomingTransferOffers=offers=>{
    (offers||[]).forEach(offer=>{
      const isLoan=offer.type==='loan';
      const title=isLoan?'PROPOSTA DE EMPRÉSTIMO':'PROPOSTA DE COMPRA';
      const body=isLoan
        ?`${offer.fromClub} quer ${offer.playerName} por empréstimo até o fim da temporada.`
        :`${offer.fromClub} oferece ${formatTransferMoney(offer.fee)} por ${offer.playerName}.`;
      const msg=pushMessage({
        category:'transfer',
        type:'incoming-offer',
        title,
        body,
        round:currentRound,
        meta:{
          competition:'Mercado',
          requiresAction:true,
          offerId:offer.id,
          offerType:offer.type,
          playerId:offer.playerId,
          playerName:offer.playerName,
          fromClub:offer.fromClub,
          fee:offer.fee,
          expiresRound:offer.expiresRound,
        },
      });
      if(msg)transfersEngine?.attachOfferMessageId?.(offer.id,msg.id);
    });
  };
  const processAiMarketTickCore=({quietDigest=false,tickKind='week',skipUserOffers=false}={})=>{
    if(!transfersEngine)return null;
    const expired=transfersEngine.expirePendingOffers(currentRound)||[];
    expired.forEach(offer=>{
      const body=`A proposta do ${offer.fromClub} por ${offer.playerName} expirou sem resposta.`;
      const replaced=messages.replaceMessage?.(
        { offerId:offer.id, messageId:offer.messageId },
        {
          type:'offer-expired',
          title:'Proposta expirada',
          body,
          resolveAction:true,
          actionResult:'expired',
          meta:{ competition:'Mercado', offerId:offer.id, playerId:offer.playerId },
        },
      );
      if(!replaced){
        pushMessage({
          category:'transfer',
          type:'offer-expired',
          title:'Proposta expirada',
          body,
          round:currentRound,
          meta:{competition:'Mercado',offerId:offer.id,playerId:offer.playerId},
        });
      }
    });
    if(!transfersEngine.marketOpen())return { expired, tick: null };
    const tick=transfersEngine.runAiMarketTick({ tickKind, skipUserOffers });
    if(tick?.digest?.total&&!quietDigest){
      pushMessage({
        category:'transfer',
        type:'market-digest',
        title:'Mercado movimentado',
        body:`Mercado: ${tick.digest.total} negócio${tick.digest.total===1?'':'s'} entre clubes (${tick.digest.buyCount||0} compra${(tick.digest.buyCount||0)===1?'':'s'}, ${tick.digest.loanCount||0} empréstimo${(tick.digest.loanCount||0)===1?'':'s'}).`,
        round:currentRound,
        meta:{competition:'Mercado'},
      });
    }
    if(tick?.offers?.length)notifyIncomingTransferOffers(tick.offers);
    return { expired, tick };
  };
  const presentTransferOffersAfterAdvance=(result={})=>{
    const showReport=()=>{
      if(result?.report)transfersUi?.showWindowReport?.(result.report);
    };
    pendingTransferOfferPopupIds=[];
    // Todas as propostas ainda pendentes — evita perder oportunidade só na caixa.
    const opened=messages.presentTransferActionMessages?.({
      onQueueEmpty:showReport,
    });
    if(!opened)showReport();
    return !!opened;
  };
  const processAiMarketAfterRound=()=>{
    if(!transfersEngine)return;
    try{
      processAiMarketTickCore({quietDigest:false,tickKind:'postRound'});
      transfersUi?.render?.();
    }catch{/* mercado off / boot */}
  };
  /**
   * Avanço de tempo na janela (estilo FIFA Career): semana, ou dia na última semana (Deadline Day).
   * No fechamento da janela, devolve relatório com a maior transferência.
   */
  const advanceTransferCalendar=()=>{
    if(!transfersEngine||!savedNewGame)return { ok:false, reason:'no_club' };
    if(pendingSponsorChoice){openSponsorPickerIfPending();return { ok:false, reason:'sponsor' };}
    if(matchStarted&&!matchFinished)return { ok:false, reason:'market_closed' };
    if(seasonTransitionPrepared)return { ok:false, reason:'market_closed' };
    ensureCalendarMatchConsistency();
    rebuildCalendarGames();
    // Jogo atrasado / dia de jogo: não segue avançando a janela.
    if(isOnPendingMatchDay()){
      const stoppedMatch=userMatchOnDate(careerCalendarDate);
      pushMatchDayBrief(stoppedMatch);
      setSelectedCalendarDate(careerCalendarDate);
      persistSeason(true);
      refreshSeasonPresentation();
      return {ok:true,days:0,stoppedMatch,phaseBefore:transfersEngine.getWindowPhase?.()||{},phaseAfter:transfersEngine.getWindowPhase?.()||{},report:null,newOfferIds:[]};
    }
    const phaseBefore=transfersEngine.getWindowPhase?.()||{};
    if(!phaseBefore.active)return { ok:false, reason:'window_closed', status:transfersEngine.marketStatus() };
    const daysToAdvance=phaseBefore.mode==='day'?1:7;
    const seasonEnd=seasonEndDate();
    let simulatedDays=0;
    let stoppedMatch=null;
    suppressTransferOfferPopup=true;
    pendingTransferOfferPopupIds=[];
    try{
      for(let step=0;step<daysToAdvance;step++){
        const nextDay=new Date(careerCalendarDate);
        nextDay.setDate(nextDay.getDate()+1);
        nextDay.setHours(12,0,0,0);
        if(nextDay>seasonEnd)break;
        const pendingMatch=userMatchOnDate(nextDay);
        if(pendingMatch){
          applyTrainingDay(trainingTypeForDate(nextDay));
          advanceCareerCalendarTo(nextDay);
          advanceCupThroughDate(nextDay);
          simulatedDays+=1;
          stoppedMatch=pendingMatch;
          pushMatchDayBrief(pendingMatch);
          break;
        }
        applyTrainingDay(trainingTypeForDate(nextDay));
        advanceCareerCalendarTo(nextDay);
        advanceCupThroughDate(nextDay);
        simulatedDays+=1;
        // Expira propostas por calendário mesmo sem tick de oferta.
        try{transfersEngine.expirePendingOffers?.(currentRound);}catch{/* */}
        // Deadline: 1 tick/dia. Semana: só IA↔IA nos dias intermediários (sem spam ao usuário).
        try{
          if(transfersEngine.marketOpen()){
            if(phaseBefore.mode==='day'){
              processAiMarketTickCore({quietDigest:false,tickKind:'deadline'});
            }else if(step<daysToAdvance-1){
              processAiMarketTickCore({quietDigest:true,tickKind:'week',skipUserOffers:true});
            }
          }
        }catch{/* tick */}
      }
      // Semana: 1 tick de propostas ao usuário no fim do avanço.
      try{
        if(
          phaseBefore.mode==='week' &&
          !stoppedMatch &&
          transfersEngine.marketOpen()
        ){
          processAiMarketTickCore({quietDigest:false,tickKind:'week'});
        }
      }catch{/* tick */}
    }finally{
      suppressTransferOfferPopup=false;
    }
    setSelectedCalendarDate(careerCalendarDate);
    const phaseAfter=transfersEngine.getWindowPhase?.()||{};
    let report=null;
    if(phaseBefore.active&&!phaseAfter.active){
      report=transfersEngine.buildWindowClosingReport({
        windowKey:phaseBefore.windowKey,
        label:phaseBefore.label,
      });
      pushMessage({
        category:'transfer',
        type:'window-report',
        title:`Relatório · ${phaseBefore.label||'Janela'}`,
        body:report.biggest
          ?`Janela encerrada. Maior transferência: ${report.biggest.playerName} (${report.biggest.from} → ${report.biggest.to}) por ${formatTransferMoney(report.biggest.fee)}. ${report.dealCount} negócios · total ${formatTransferMoney(report.totalFees)}.`
          :`Janela encerrada sem transferências à vista registradas no mercado.`,
        round:currentRound,
        meta:{competition:'Mercado',report},
      });
    }
    persistSeason(true);
    refreshSeasonPresentation();
    transfersUi?.render?.();
    const result={
      ok:true,
      days:simulatedDays,
      mode:phaseBefore.mode,
      phaseBefore,
      phaseAfter,
      report,
      stoppedMatch,
      newOfferIds:[...new Set(pendingTransferOfferPopupIds)].filter(Boolean),
    };
    presentTransferOffersAfterAdvance(result);
    return result;
  };
  advanceTransferCalendarFn=advanceTransferCalendar;
  respondToIncomingTransferOffer=({offerId,accept}={})=>{
    if(!transfersEngine||!offerId)return;
    const result=accept
      ?transfersEngine.acceptIncomingOffer(offerId)
      :transfersEngine.rejectIncomingOffer(offerId);
    if(!result?.ok){
      const errBody=`Não foi possível ${accept?'aceitar':'recusar'} a proposta (${result?.reason||'erro'}).`;
      const replacedErr=messages.replaceMessage?.(
        { offerId },
        {
          type:'offer-error',
          title:'Proposta não concluída',
          body:errBody,
          resolveAction:false,
          meta:{ competition:'Mercado', offerId },
        },
      );
      if(!replacedErr){
        pushMessage({
          category:'transfer',
          type:'offer-error',
          title:'Proposta não concluída',
          body:errBody,
          round:currentRound,
          meta:{competition:'Mercado',offerId},
        });
      }
      return;
    }
    const offer=result.offer;
    const accepted=!!(accept&&result.deal);
    const title=accepted
      ?(offer.type==='loan'?'Empréstimo aceito':'Venda aceita')
      :'Proposta recusada';
    const body=accepted
      ?(offer.type==='loan'
        ?`${offer.playerName} foi cedido por empréstimo ao ${offer.fromClub}.`
        :`${offer.playerName} foi vendido ao ${offer.fromClub} por ${formatTransferMoney(offer.fee)}.`)
      :`Você recusou a proposta do ${offer.fromClub} por ${offer.playerName}.`;
    const replaced=messages.replaceMessage?.(
      { offerId:offer.id, messageId:offer.messageId },
      {
        type:accepted?'deal':'offer-rejected',
        title,
        body,
        resolveAction:true,
        actionResult:accepted?'accepted':'rejected',
        meta:{
          competition:'Mercado',
          offerId:offer.id,
          playerId:offer.playerId,
          requiresAction:false,
          actionResolved:true,
        },
      },
    );
    if(!replaced){
      pushMessage({
        category:'transfer',
        type:accepted?'deal':'offer-rejected',
        title,
        body,
        round:currentRound,
        meta:{competition:'Mercado',offerId:offer.id,playerId:offer.playerId},
      });
    }
    if(accepted&&clubs[userClub])clubStatus.syncFinancesFromBudget(clubs[userClub],userDivision);
    // Aceite: fecha o leitor. Recusa: mantém aberto com "Proposta recusada".
    if(accepted)messages.closeMessageReader?.();
    else{
      const keepId=replaced?.id||offer.messageId;
      if(keepId)messages.openMessageReader?.(keepId);
      else messages.closeMessageReader?.();
    }
    persistSeason(true);
    transfersUi?.render?.();
    renderEnvironmentCard();
  };
  transfersUi=FEATURES.transfers?createTransfersFeature({
    $,
    onClick,
    on,
    getTransfersEngine:()=>transfersEngine,
    getBalance:()=>getBalance(clubs[userClub]),
    getUserClub:()=>userClub,
    formatBudget,
    pushMessage,
    getCurrentRound:()=>currentRound,
    onTransferOfferRespond:opts=>respondToIncomingTransferOffer(opts),
    openOfferMessage:offer=>{
      const msg=messages.findMessage?.({ messageId:offer?.messageId, offerId:offer?.id });
      if(msg)messages.openMessageReader?.(msg.id);
    },
    onDealComplete:()=>{
      if(clubs[userClub])clubStatus.syncFinancesFromBudget(clubs[userClub],userDivision);
      persistSeason(true);
      renderEnvironmentCard();
    },
  }):null;
  if(transfersUi){
    transfersUi.bindHandlers();
    router.onView('transfers',()=>transfersUi.render());
  }
  const escapeHeaderText=value=>String(value??'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/"/g,'&quot;');
  const shortHeaderClub=name=>{
    const text=String(name||'—');
    return text.length>20?`${text.slice(0,18)}…`:text;
  };
  /** Rótulo do informativo: RODADA N ou MATA-MATA + fase/leg. */
  const headerMatchContext=game=>{
    if(!game)return { tag:'JOGO', stage:'' };
    if(game.competition==='COPA DO BRASIL'){
      const stage=[game.phase,game.leg].filter(Boolean).join(' · ');
      return { tag:'MATA-MATA', stage:stage||'Copa do Brasil' };
    }
    if(typeof isKnockoutShootoutCompetition==='function'&&isKnockoutShootoutCompetition(game)){
      const phaseLabel=game.phase||(game.knockoutRound!=null?`Fase ${game.knockoutRound}`:'Eliminatórias');
      const stage=[phaseLabel,game.leg].filter(Boolean).join(' · ');
      return { tag:'MATA-MATA', stage };
    }
    const round=game.round??currentRound;
    return { tag:`RODADA ${round}`, stage:'' };
  };
  renderHeaderGuide=()=>{
    const track=$('#headerNewsTrack');
    const dateEl=$('#headerDateLabel');
    if(dateEl&&careerCalendarDate){
      dateEl.textContent=careerCalendarDate
        .toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'})
        .replace(/\./g,'')
        .toUpperCase();
    }
    if(!track)return;
    const items=[];
    const pushItem=(kind,html,user=false)=>items.push({kind,html,user});
    const headerMatchLine=(game,details,{userTag=null,withTime=false}={})=>{
      const ctx=headerMatchContext(game);
      const tag=userTag||ctx.tag;
      const when=[ctx.stage,details.display,withTime?details.time:null].filter(Boolean).join(' · ');
      return `<i>${escapeHeaderText(tag)}</i><b>${escapeHeaderText(shortHeaderClub(game.home))} × ${escapeHeaderText(shortHeaderClub(game.away))}</b><em>${escapeHeaderText(when)}</em>`;
    };
    const next=typeof nextPendingUserEntry==='function'?nextPendingUserEntry():null;
    if(next?.game){
      const details=next.details||fixtureDetails(next.game);
      const ctx=headerMatchContext(next.game);
      const userTag=ctx.tag.startsWith('RODADA')||ctx.tag==='MATA-MATA'
        ?`SEU JOGO · ${ctx.tag}`
        :'SEU JOGO';
      pushItem('jogo',headerMatchLine(next.game,details,{userTag,withTime:true}),true);
    }
    (futureMatches||[])
      .filter(game=>game&&!isUserFixture(game)&&!isFixtureCompleted(game))
      .slice(0,2)
      .forEach(game=>{
        const details=fixtureDetails(game);
        pushItem('jogo',headerMatchLine(game,details));
      });
    if(FEATURES.transfers&&transfersEngine){
      const phase=transfersEngine.getWindowPhase?.()||{};
      const status=transfersEngine.marketStatus?.()||{};
      if(phase.active){
        const deadline=phase.isDeadlineDay?' · Deadline Day':phase.isDeadlineWeek?' · Semana final':'';
        pushItem(
          'mercado',
          `<i>MERCADO</i><b>${escapeHeaderText(phase.label||'Janela aberta')}</b><em>${phase.daysLeft!=null?`${phase.daysLeft}d restantes`:''}${deadline}</em>`,
        );
      }else{
        pushItem(
          'mercado',
          `<i>MERCADO</i><b>Janela fechada</b><em>${escapeHeaderText(status.nextOpenLabel?`Abre ${status.nextOpenLabel}`:'Aguarde a próxima janela')}</em>`,
        );
      }
      const sales=(transfersEngine.snapshotSeasonDeals?.()||[])
        .filter(deal=>Number(deal.fee)>0)
        .sort((a,b)=>Number(b.fee)-Number(a.fee))
        .slice(0,3);
      sales.forEach(deal=>{
        pushItem(
          'venda',
          `<i>VENDA</i><b>${escapeHeaderText(deal.playerName||'Jogador')}</b><em>${escapeHeaderText(shortHeaderClub(deal.from))} → ${escapeHeaderText(shortHeaderClub(deal.to))}</em><strong class="header-news-fee">${escapeHeaderText(formatBudget(deal.fee))}</strong>`,
        );
      });
      if(!sales.length){
        pushItem('venda',`<i>VENDA</i><b>Sem grandes negócios ainda</b><em>${phase.active?'Janela em andamento':'Fora da janela'}</em>`);
      }
    }else{
      pushItem('mercado',`<i>MERCADO</i><b>Informações do mercado</b><em>Em breve no informativo</em>`);
    }
    if(!items.length){
      pushItem('mercado',`<i>INFO</i><b>Informativo da temporada</b><em>Próximos jogos e mercado</em>`);
    }
    // Duplica a sequência (×2) para loop contínuo sem salto (translateX -50%).
    const seqHtml=items
      .map(item=>`<article class="header-news-item kind-${item.kind}${item.user?' is-user':''}">${item.html}</article>`)
      .join('');
    track.innerHTML=`<div class="header-news-seq">${seqHtml}</div><div class="header-news-seq" aria-hidden="true">${seqHtml}</div>`;
    requestAnimationFrame(()=>{
      const seq=track.querySelector('.header-news-seq');
      const width=seq?.getBoundingClientRect?.().width||seq?.scrollWidth||track.scrollWidth/2||480;
      // ~20px/s — ritmo de leitura confortável para chips curtos
      const seconds=Math.max(28,Math.round(width/20));
      track.style.animationDuration=`${seconds}s`;
    });
  };
  const refreshSeasonPresentation=()=>{
    reconcileCurrentRound();
    if(ensureCalendarMatchConsistency()){
      // Datas da Copa / dia de carreira corrigidos — reconstrói a grade.
    }
    rebuildCalendarGames();
    futureMatches=currentRoundFixtures();
    refreshUserFixtures();
    leagueData.sort((a,b)=>b.points-a.points||b.goalDiff-a.goalDiff||b.wins-a.wins);
    leagueData.forEach((row,index)=>clubs[row.club].position=index+1);
    renderChampionshipPage();
    renderDashboardMiniTable();
    renderDashboardUpcoming();
    $('.upcoming-dashboard label em').textContent=`RODADA ${currentRound}`;
    renderUserMatchPresentation();
    renderClubBudget();
    renderHeaderGuide();
    renderNationalRanking();
    renderManagerRanking();
    renderSeasonGoalCard();
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
    engineScoreDamp,
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
    resolveStoppageEligibility:fixture=>{
      if(!fixture)return {knockout:false,round:0,totalRounds:0};
      if(isKnockoutShootoutCompetition(fixture))return {knockout:true,round:0,totalRounds:0};
      const round=Number(fixture.round)||currentRound;
      const division=clubs[fixture.home]?.division||clubs[fixture.away]?.division||userDivision;
      const totalRounds=division==='D'
        ?SERIE_D_GROUP_ROUNDS
        :Math.max(2,nationalCompetitions[division]?.fixtures?.length||38);
      return {knockout:false,round,totalRounds};
    },
  }));
  const orderRosterForFormation=(roster,targetFormation)=>{
    if(!Array.isArray(roster))return;
    const roles=formationRoles[targetFormation]||formationRoles['4-3-3'],eligible=roster.filter(player=>!playerUnavailable(player)),starterPool=eligible.filter(player=>!playerStarterBlocked(player)),pool=starterPool.length>=roles.length?starterPool:eligible,assignment=lineupForRoles(pool,roles),lineup=roles.map((_,slot)=>assignment.get(slot)).filter(Boolean),selected=new Set(lineup),availableBench=eligible.filter(player=>!selected.has(player)&&!playerInRestrictedReturn(player)),restrictedBench=eligible.filter(player=>!selected.has(player)&&playerInRestrictedReturn(player)),unavailable=roster.filter(player=>!selected.has(player)&&playerUnavailable(player));
    roster.splice(0,roster.length,...lineup,...availableBench,...restrictedBench,...unavailable);
  };
  /** Restaura ordem do elenco (titulares + banco) sem recalcular encaixe. */
  const applyRosterOrderByNames=(roster,orderedNames)=>{
    if(!Array.isArray(orderedNames)||orderedNames.length<11||!roster?.length)return false;
    const byName=new Map(roster.map(player=>[player.name,player]));
    const next=[];
    orderedNames.forEach(name=>{const player=byName.get(name);if(player){next.push(player);byName.delete(name);}});
    byName.forEach(player=>next.push(player));
    if(next.length!==roster.length)return false;
    roster.splice(0,roster.length,...next);
    return true;
  };
  /** Troca titulares indisponíveis sem redesenhar a escalação organizada. */
  const sanitizeUserStartersForMatch=()=>{
    const roles=formationRoles[formation]||formationRoles['4-3-3'];
    for(let slot=0;slot<11;slot++){
      const starter=squad[slot];
      if(starter&&!playerUnavailable(starter)&&!playerStarterBlocked(starter))continue;
      const expected=roles[slot]||starter?.pos;
      const bench=squad.slice(11).filter(player=>!playerUnavailable(player)&&!playerStarterBlocked(player));
      if(!bench.length)continue;
      const compatible=bench.filter(player=>player.pos===expected||(compatibleRoles[expected]||[]).includes(player.pos));
      const incoming=(compatible.length?compatible:bench).sort((a,b)=>roleAttributeScore(b,expected)-roleAttributeScore(a,expected)||b.overall-a.overall)[0];
      if(!incoming)continue;
      const benchIndex=squad.indexOf(incoming);
      if(benchIndex<11)continue;
      [squad[slot],squad[benchIndex]]=[incoming,starter];
    }
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
    getStoppageElapsed:()=>stoppageElapsed,
    getStoppageActive:()=>stoppageActive,
    getStoppageFirst:()=>stoppageFirst,
    getStoppageSecond:()=>stoppageSecond,
    getMatchStarted:()=>matchStarted,
    getMatchFinished:()=>matchFinished,
    getPreMatchPreparation:()=>preMatchPreparation,
    getHalftimeShown:()=>halftimeShown,
    getShootoutState:()=>shootoutState,
    getScores:()=>calendarLiveScores(),
    getGoals:()=>calendarLiveSideGoals(),
    getVolumeSamples:()=>liveVolumeSamples,
    getVolumeIncidents:()=>calendarLiveVolumeIncidents(),
    getUserClub:()=>userClub,
    getUserAtHome:()=>userAtHomeInLiveMatch(),
    getUserDivision:()=>userDivision,
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
    getClubManagerName:clubName=>managerRanking.byClub(clubName)?.name||clubs[clubName]?.managerName||'—',
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
  
  
  
  
  
  
  
  
  
  
  
  
  
  document.body.insertAdjacentHTML('beforeend',`<div id="teamScoutModal" class="modal hidden"><div class="modal-card scout-modal"><button id="closeTeamScout" class="close">×</button><h2 id="scoutClubName"></h2><div id="scoutClubMeta"></div><div class="scout-layout"><div class="scout-roster"><h3>Titulares</h3><div id="scoutStarters"></div><h3>Reservas</h3><div id="scoutBench"></div></div><div class="scout-side"><div class="pause-pitch tactical-board scout-pitch">${fieldMarkup}<div id="scoutPitchPlayers"></div></div><p class="scout-manager" id="scoutManager"><small>TÉCNICO</small><strong>—</strong></p><section id="scoutSummary" class="club-summary"><div class="summary-top"><div class="overall-box"><small>OVERALL</small><strong id="scoutOverall"></strong></div><div id="scoutEnvironment" class="environment-gauge"><div><strong></strong><small>AMBIENTE</small></div></div></div><div class="leader-table"><small>DESTAQUES DA TEMPORADA</small><div><span>ARTILHEIRO</span><b id="scoutScorer"></b><em id="scoutGoals"></em></div><div><span>ASSISTÊNCIAS</span><b id="scoutAssistant"></b><em id="scoutAssists"></em></div></div></section></div></div></div></div>`);
  
  
  
  // Padrão único para todas as tabelas e listagens geradas pelo jogo.
  
  
  
  const playerSeasonAvgLabel=player=>{
    const key=playerKey(player);
    const bucket=playerHistory?.getPlayer?.(key)?.seasons?.[String(careerSeason)];
    const avg=bucket?.avgRating!=null?Number(bucket.avgRating):seasonAverageRating(bucket);
    return formatMatchRating(avg);
  };
  const analysisTable=(title,players,{numbered=false,slotOffset=0}={})=>`<section class="analysis-roster"><h3>${title}</h3><div class="analysis-head"><span>JOGADOR</span><span>POS.</span><span>OVR</span><span>MÉDIA</span><span>CANSAÇO</span></div>${players.map((player,index)=>`<div class="analysis-player" data-slot="${slotOffset+index}" tabindex="0">${playerNameCell(player.name,player,{prefix:numbered?(index+1)+'. ':''})}<span>${player.pos}</span><span>${player.overall}</span><span class="analysis-avg">${playerSeasonAvgLabel(player)}</span>${fatigueCell(player)}</div>`).join('')}</section>`;
  const clubManagerName=clubName=>managerRanking.byClub(clubName)?.name||clubs[clubName]?.managerName||(clubName===userClub?careerProfile.managerName:null)||'—';
  let unbindScoutBoardHover=null;
  const openScout=name=>{
    const club=clubs[name], roster=club.roster, coords=formations[club.formation]||formations['4-3-3'], overall=Math.round(roster.slice(0,11).reduce((sum,p)=>sum+p.overall,0)/11), leaders=clubSeasonLeaders(name);
    $('#scoutClubName').innerHTML=clubCrestTitleHtml(club.name,{initialsFn:clubCrestInitials});
    $('#scoutClubMeta').innerHTML=`<div class="scout-club-meta"><span class="scout-meta-chip"><small>FORMAÇÃO</small><b>${club.formation||'—'}</b></span><span class="scout-meta-chip"><small>ESTILO</small><b>${club.style||'—'}</b></span><span class="scout-meta-chip"><small>MENTALIDADE</small><b>${club.mentality||'—'}</b></span><span class="scout-meta-chip"><small>CLASSIFICAÇÃO</small><b>${club.position!=null?`${club.position}º na tabela`:'—'}</b></span></div>`;
    const managerEl=$('#scoutManager strong');
    if(managerEl)managerEl.textContent=clubManagerName(name);
    $('#scoutOverall').textContent=overall;
    setIndicatorTone($('#scoutEnvironment'),club.environment);
    $('#scoutEnvironment').style.setProperty('--environment',club.environment);
    $('#scoutEnvironment strong').textContent=`${club.environment}%`;
    $('#scoutScorer').textContent=leaders.scorer.name;$('#scoutGoals').textContent=`${leaders.goals} G`;
    $('#scoutAssistant').textContent=leaders.assistant.name;$('#scoutAssists').textContent=`${leaders.assists} A`;
    $('#scoutStarters').innerHTML=analysisTable('TITULARES',roster.slice(0,11),{numbered:true,slotOffset:0});
    $('#scoutBench').innerHTML=analysisTable('RESERVAS',roster.slice(11),{slotOffset:11});
    const labelOf=tactics?.boardPlayerLabel||(name=>{
      const parts=(name||'').split(' ').filter(Boolean);
      const short=parts.length>1?parts[parts.length-1]:parts[0]||name;
      return short.length>8?`${short.slice(0,7)}…`:short;
    });
    $('#scoutPitchPlayers').innerHTML=coords.map((p,i)=>{
      const player=roster[i];
      const label=labelOf(player?.name||'—',8);
      const title=player?.name||'—';
      const top=p[1]===91?90:p[1];
      return `<div class="board-player" data-slot="${i}" title="${title}" style="left:${p[0]}%;top:${top}%"><i style="--energy:${clamp(player?.fatigue??0,0,100)}%"><span>${i+1}</span></i><small>${label}</small></div>`;
    }).join('');
    unbindScoutBoardHover?.();
    const scoutRoster=$('#teamScoutModal .scout-roster');
    unbindScoutBoardHover=bindBoardRosterHover({
      rosterRoot:scoutRoster,
      pitchRoot:()=>$('#scoutPitchPlayers'),
      rowSelector:'.analysis-player[data-slot]',
    });
    $('#teamScoutModal').classList.remove('hidden');
  };
  const openClubFromTable=target=>{const clubTarget=target.closest?.('[data-club]'),name=clubTarget?.dataset.club;if(!name||!clubs[name])return false;openScout(name);return true;};
  document.addEventListener('click',event=>openClubFromTable(event.target));
  document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&openClubFromTable(event.target))event.preventDefault();});
  
  
  
  
  document.body.insertAdjacentHTML('beforeend',`<div id="competitionRulesModal" class="modal hidden"><div class="modal-card competition-rules-modal"><button id="closeCompetitionRules" class="close" type="button">×</button><label id="competitionRulesKicker">REGULAMENTO</label><h2 id="competitionRulesTitle">Regras</h2><div id="competitionRulesBody" class="competition-rules-body"></div></div></div>`);
  document.body.insertAdjacentHTML('beforeend',`<div id="championshipModal" class="modal hidden"><div class="modal-card championship-modal"><button id="closeChampionship" class="close">×</button><label id="championshipDivisionLabel">CAMPEONATO BRASILEIRO · SÉRIE A</label><h2>Brasileirão 2026</h2><small id="championshipFormat" class="championship-format"></small><div id="divisionTabs" class="division-tabs">${Object.keys(divisionRules).map(division=>`<button data-division="${division}">SÉRIE ${division}</button>`).join('')}<button data-competition="CUP">COPA DO BRASIL</button></div><div id="serieDModeTabs" class="serie-d-mode-tabs hidden" role="tablist" aria-label="Fase da Série D"><button type="button" data-serie-d-mode="groups">GRUPOS</button><button type="button" data-serie-d-mode="knockout">MATA-MATA</button></div><div class="championship-grid"><section><h3>Tabela</h3><div class="champ-head"><span>#</span><span>CLUBE</span><span>J</span><span>V</span><span>E</span><span>D</span><span>SG</span><span>PTS</span></div><div id="championshipTable"></div></section><aside class="championship-sidebar"></aside></div></div></div>`);
  let championshipRoundView=currentRound,championshipGroupView=userSerieDGroupIndex,championshipLeaderMode='scorers';
  const serieCRelegationZone=serieCRelegationSlots(careerSeason);
  const classificationZone=(division,index,total)=>division==='A'&&index>=total-4?'relegation':division==='B'?(index<4?'promotion':index>=total-4?'relegation':''):division==='C'?(index<4?'promotion':index>=total-serieCRelegationZone?'relegation':''):'';
  const championshipRoundLimit=division=>division==='CUP'
    ?Math.max(1,(cupCompetition.stages||[]).length)
    :Math.max(1,Array.isArray(nationalCompetitions[division]?.fixtures)?nationalCompetitions[division].fixtures.length:1);
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
    const slots=competition.knockout?.qualifiedPerGroup||4;
    const groupRows=group.map(club=>competition.standings.find(row=>row.club===club)).filter(Boolean)
      .sort((a,b)=>b.points-a.points||b.wins-a.wins||b.goalDiff-a.goalDiff);
    // Destaque (grupo do usuário): colunas completas no padrão MatchDay. Compacto: # / clube / J / PTS.
    const head=featured
      ?'<div class="d-group-head d-group-head-full"><span>#</span><span>CLUBE</span><span>J</span><span>V</span><span>E</span><span>D</span><span>SG</span><span>PTS</span></div>'
      :'<div class="d-group-head"><span>#</span><span>CLUBE</span><span>J</span><span>PTS</span></div>';
    const rows=groupRows.map((row,index)=>{
      const zone=index<slots?'qualified':'';
      const mine=row.club===userClub?'user-club':'';
      if(featured){
        const sg=row.goalDiff>=0?`+${row.goalDiff}`:String(row.goalDiff);
        return `<div class="d-group-row d-group-row-full ${zone} ${mine}" data-club="${row.club}" role="button" tabindex="0"><span>${index+1}</span><span class="club-link">${row.club}</span><span>${row.played}</span><span>${row.wins}</span><span>${row.draws}</span><span>${row.losses}</span><span>${sg}</span><span>${row.points}</span></div>`;
      }
      return `<div class="d-group-row ${zone} ${mine}" data-club="${row.club}" role="button" tabindex="0"><span>${index+1}</span><span class="club-link">${row.club}</span><span>${row.played}</span><span>${row.points}</span></div>`;
    }).join('');
    return `<article class="d-group-card ${featured?'user-group-card':''} ${!featured?'compact':''}" data-championship-group="${groupIndex}" role="button" tabindex="0" title="Ver jogos do Grupo A${groupIndex+1}"><h4>GRUPO A${groupIndex+1}${featured?'<em>SEU GRUPO</em>':''}</h4>${head}${rows}</article>`;
  };
  const markCupPhaseSelection=phaseIndex=>{
    $$('#championshipTable [data-cup-phase]').forEach(button=>{
      const index=Number(button.dataset.cupPhase);
      button.classList.toggle('current',index===phaseIndex);
    });
  };
  const markSerieDPhaseSelection=phaseIndex=>{
    $$('#championshipTable [data-serie-d-phase]').forEach(button=>{
      const index=Number(button.dataset.serieDPhase);
      button.classList.toggle('current',index===phaseIndex);
    });
  };
  const serieDPhaseIndexForRound=round=>{
    if(round<=12)return 1;
    if(round<=14)return 2;
    if(round<=16)return 3;
    if(round<=18)return 4;
    if(round<=20)return 5;
    return 6;
  };
  const serieDRoundHistoryGames=round=>{
    const history=(userDivision==='D'?seasonRoundHistory:competitionRoundHistory.D)||[];
    return history.find(item=>item.round===round)?.games||[];
  };
  const serieDStageFixturesMerged=startRound=>{
    const fixtures=nationalCompetitions.D.fixtures||[];
    const raw=[...(fixtures[startRound-1]||[]),...(fixtures[startRound]||[])];
    const historyGames=[...serieDRoundHistoryGames(startRound),...serieDRoundHistoryGames(startRound+1)];
    return raw.map(fixture=>{
      const played=historyGames.find(item=>item.home===fixture.home&&item.away===fixture.away);
      if(!played)return {...fixture};
      return {
        ...fixture,
        ...played,
        completed:true,
        penalties:played.penalties||fixture.penalties,
        shootoutWinner:played.shootoutWinner||fixture.shootoutWinner,
        winner:played.winner||fixture.winner,
      };
    });
  };
  const serieDKnockoutPhaseMeta=definition=>{
    const stageTies=nationalCompetitions.D.knockout?.stages?.[definition.key];
    if(!stageTies?.length)return {status:'AGUARDANDO SORTEIO',generated:false,completed:false};
    const fixtures=serieDStageFixturesMerged(definition.startRound);
    const tieIds=[...new Set(fixtures.map(game=>game.tieId).filter(Boolean))];
    const completed=tieIds.length>0&&tieIds.every(tieId=>{
      const games=fixtures.filter(game=>game.tieId===tieId);
      return games.length>0&&games.every(game=>game.completed);
    });
    return {status:completed?'CONCLUÍDA':'EM DISPUTA',generated:true,completed};
  };
  const syncSerieDModeTabs=()=>{
    const tabs=$('#serieDModeTabs');
    if(!tabs)return;
    const show=championshipDivision==='D'&&isSerieDKnockoutUiActive();
    tabs.classList.toggle('hidden',!show);
    if(!show)return;
    $$('#serieDModeTabs [data-serie-d-mode]').forEach(button=>{
      const active=button.dataset.serieDMode===championshipSerieDMode;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',active?'true':'false');
    });
  };
  openChampionship=(division=championshipDivision)=>{
    championshipDivision=division;
    const table=$('#championshipTable'),head=$('#championshipModal .champ-head'),heading=$('#championshipModal .championship-grid>section>h3'),championshipGrid=$('#championshipModal .championship-grid');
    const serieDKoAvailable=division==='D'&&isSerieDKnockoutUiActive();
    if(serieDKoAvailable){
      if(championshipSerieDMode!=='groups'&&championshipSerieDMode!=='knockout')championshipSerieDMode='knockout';
    }else if(division==='D'){
      championshipSerieDMode='groups';
    }
    const serieDKo=serieDKoAvailable&&championshipSerieDMode==='knockout';
    $$('#divisionTabs button').forEach(button=>button.classList.toggle('active',button.dataset.division===division||button.dataset.competition===division));
    championshipGrid?.classList.toggle('serie-d-view',division==='D'&&!serieDKo);
    championshipGrid?.classList.toggle('cup-view',division==='CUP'||serieDKo);
    if(division==='CUP'){
      $('#championshipDivisionLabel').textContent='COMPETIÇÃO NACIONAL · COPA DO BRASIL';
      $('#championshipModal>div>h2').textContent=`Copa do Brasil ${careerSeason}`;
      $('#championshipFormat').textContent='126 CLUBES · 9 FASES · SORTEIOS PROGRESSIVOS · FASE ATUAL CONFIRMADA APÓS A ANTERIOR';
      heading.textContent='Fases da competição';
      head.style.display='none';
      table.className='cup-stage-table';
      const stageCount=Math.max(1,cupCompetition.stages.length||1);
      championshipRoundView=clamp(championshipRoundView||cupCompetition.currentPhase||1,1,stageCount);
      table.innerHTML=cupPhaseDefinitions.map(definition=>{
        const stage=cupCompetition.stages.find(item=>item.index===definition.index);
        const status=stage?.completed?'CONCLUÍDA':stage?'EM DISPUTA':'AGUARDANDO SORTEIO';
        const classes=['cup-stage-row'];
        if(stage)classes.push('generated');
        if(stage?.completed)classes.push('completed');
        return `<button class="${classes.join(' ')}" type="button" data-cup-phase="${definition.index}" ${stage?'':'disabled'}><span>${definition.index}</span><b>${definition.name}</b><small>${definition.teams} CLUBES · ${definition.twoLegged?'IDA E VOLTA':'JOGO ÚNICO'}</small><em>${status}</em></button>`;
      }).join('');
      markCupPhaseSelection(championshipRoundView);
      syncSerieDModeTabs();
      $('#championshipModal').classList.remove('hidden');
      return;
    }
    const competition=nationalCompetitions[division],rows=[...competition.standings].sort((a,b)=>b.points-a.points||b.wins-a.wins||b.goalDiff-a.goalDiff);
    $('#championshipDivisionLabel').textContent=`CAMPEONATO BRASILEIRO · SÉRIE ${division}`;
    $('#championshipModal>div>h2').textContent=`Brasileirão ${careerSeason}`;
    if(serieDKo){
      $('#championshipFormat').textContent='SÉRIE D · MATA-MATA · IDA E VOLTA · FASE CONFIRMADA APÓS A ANTERIOR';
      heading.textContent='Fases eliminatórias';
      head.style.display='none';
      table.className='cup-stage-table';
      championshipRoundView=clamp(championshipRoundView||serieDPhaseIndexForRound(currentRound),1,serieDKnockoutPhaseDefs.length);
      table.innerHTML=serieDKnockoutPhaseDefs.map(definition=>{
        const meta=serieDKnockoutPhaseMeta(definition);
        const classes=['cup-stage-row'];
        if(meta.generated)classes.push('generated');
        if(meta.completed)classes.push('completed');
        return `<button class="${classes.join(' ')}" type="button" data-serie-d-phase="${definition.index}" ${meta.generated?'':'disabled'}><span>${definition.index}</span><b>${definition.name}</b><small>${definition.teams} CLUBES · IDA E VOLTA${definition.key==='semi'?' · + REPESCAGEM':''}</small><em>${meta.status}</em></button>`;
      }).join('');
      markSerieDPhaseSelection(championshipRoundView);
      syncSerieDModeTabs();
      $('#championshipModal').classList.remove('hidden');
      return;
    }
    $('#championshipFormat').textContent=division==='D'
      ?(serieDKoAvailable
        ?`${userClub} · GRUPO A${userSerieDGroupIndex+1} · FASE DE GRUPOS CONCLUÍDA · 4 primeiros avançaram`
        :`${userClub} · GRUPO A${userSerieDGroupIndex+1} · 4 primeiros avançam`)
      :`${competition.clubs} CLUBES · ${competition.format.toUpperCase()} · ${competition.promotion?`${competition.promotion} ACESSOS`:''}${competition.relegation?` · ${competition.relegation} REBAIXADOS`:''}`;
    if(division==='D'){
      // Destaque fixo no grupo do usuário; a lateral continua podendo trocar o filtro de confrontos.
      const userIdx=clamp(Math.max(0,userSerieDGroupIndex),0,Math.max(0,(competition.groups?.length||1)-1));
      championshipGroupView=userIdx;
      if(championshipRoundView>SERIE_D_GROUP_ROUNDS)championshipRoundView=SERIE_D_GROUP_ROUNDS;
      heading.textContent=`Fase de grupos · A${userIdx+1}`;head.style.display='none';table.className='series-d-table';
      const focusGroupHtml=renderSerieDGroupCard(competition.groups[userIdx],userIdx,competition,{featured:true});
      const othersHtml=competition.groups.map((group,groupIndex)=>groupIndex===userIdx?'':renderSerieDGroupCard(group,groupIndex,competition)).filter(Boolean).join('');
      table.innerHTML=`<div class="series-d-layout">${focusGroupHtml}<div class="d-group-others"><p class="d-group-others-label">Demais grupos</p><div class="d-group-grid d-group-grid-compact">${othersHtml}</div></div></div>`;
    }else{
      heading.textContent='Tabela';head.style.display='grid';table.className='';
      table.innerHTML=rows.map((row,index)=>`<div class="champ-row ${classificationZone(division,index,rows.length)} ${row.club===userClub?'highlight':''}" data-club="${row.club}" role="button" tabindex="0"><span>${index+1}</span><span class="club-link">${row.club}</span><span>${row.played}</span><span>${row.wins}</span><span>${row.draws}</span><span>${row.losses}</span><span>${row.goalDiff>=0?'+':''}${row.goalDiff}</span><span>${row.points}</span></div>`).join('');
    }
    renderChampionshipRound();
    syncSerieDModeTabs();
    $('#championshipModal').classList.remove('hidden');
  };
  onClick('#divisionTabs',event=>{
    const button=event.target.closest('[data-division],[data-competition]');
    if(!button)return;
    const competition=button.dataset.competition||button.dataset.division;
    if(competition==='CUP')championshipRoundView=cupCompetition.currentPhase;
    else if(competition==='D'&&isSerieDKnockoutUiActive()){
      championshipSerieDMode='knockout';
      championshipRoundView=serieDPhaseIndexForRound(currentRound);
    }else{
      championshipRoundView=clamp(currentRound,1,championshipRoundLimit(competition));
    }
    openChampionship(competition);
  });
  onClick('#serieDModeTabs',event=>{
    const button=event.target.closest('[data-serie-d-mode]');
    if(!button||championshipDivision!=='D'||!isSerieDKnockoutUiActive())return;
    const mode=button.dataset.serieDMode==='groups'?'groups':'knockout';
    if(mode===championshipSerieDMode)return;
    championshipSerieDMode=mode;
    if(mode==='knockout')championshipRoundView=serieDPhaseIndexForRound(currentRound);
    else{
      championshipGroupView=Math.max(0,userSerieDGroupIndex);
      championshipRoundView=Math.min(currentRound,SERIE_D_GROUP_ROUNDS)||SERIE_D_GROUP_ROUNDS;
    }
    openChampionship('D');
  });
  onClick('#championshipTable',event=>{
    const phase=event.target.closest('[data-cup-phase]');
    if(phase&&championshipDivision==='CUP'&&!phase.disabled){
      championshipRoundView=Number(phase.dataset.cupPhase);
      markCupPhaseSelection(championshipRoundView);
      openCupBracket(championshipRoundView);
      return;
    }
    const serieDPhase=event.target.closest('[data-serie-d-phase]');
    if(serieDPhase&&championshipDivision==='D'&&!serieDPhase.disabled){
      championshipRoundView=Number(serieDPhase.dataset.serieDPhase);
      markSerieDPhaseSelection(championshipRoundView);
      openSerieDBracket(championshipRoundView);
      return;
    }
    const groupCard=event.target.closest('[data-championship-group]');
    if(groupCard&&championshipDivision==='D'&&!event.target.closest('[data-club]')){
      championshipGroupView=Number(groupCard.dataset.championshipGroup);
      renderChampionshipRound();
    }
  });
  onClick('#inspectOpponent',()=>openScout(matchClub().name));
  onClick('#closeTeamScout',()=>{
    unbindScoutBoardHover?.();
    unbindScoutBoardHover=null;
    $('#teamScoutModal').classList.add('hidden');
  });
  onClick('#closeChampionship',()=>{closeCupBracket();$('#championshipModal').classList.add('hidden');});

  // A janela completa do campeonato mantém foco na classificação e na agenda.
  
  const championshipSidebar=$('#championshipModal .championship-grid aside');
  championshipSidebar.className='championship-sidebar';
  // Ordem MatchDay Série D: Grupo primeiro, Rodada depois (confrontos abaixo).
  championshipSidebar.innerHTML=`<section class="championship-upcoming"><div id="championshipGroupNav" class="round-browser-nav championship-group-nav hidden"></div><div class="round-browser-nav"><button id="championshipPreviousRound" class="round-navigation" type="button" aria-label="Rodada anterior">←</button><div><small id="championshipRoundStatus">RODADA PROGRAMADA</small><h3 id="championshipRoundTitle">Rodada ${currentRound}</h3></div><button id="championshipNextRound" class="round-navigation" type="button" aria-label="Próxima rodada">→</button></div><div id="futureMatches"></div></section><section id="championshipLeadersPanel" class="championship-leaders"><label>LÍDERES DO CAMPEONATO<em id="championshipLeaderScope">Série A</em></label><div class="championship-leader-tabs" role="tablist"><button class="active" type="button" data-championship-leader-tab="scorers">ARTILHEIROS</button><button type="button" data-championship-leader-tab="assists">ASSISTÊNCIAS</button></div><div class="championship-leader-head"><span>#</span><span>JOGADOR</span><span id="championshipLeaderValueName">GOLS</span></div><div id="championshipLeadersTable"></div></section>`;
  onClick('#championshipPreviousRound',()=>{championshipRoundView--;renderChampionshipRound();});
  onClick('#championshipNextRound',()=>{championshipRoundView++;renderChampionshipRound();});
  championshipSidebar.addEventListener('click',event=>{const leaderTab=event.target.closest('[data-championship-leader-tab]');if(leaderTab){championshipLeaderMode=leaderTab.dataset.championshipLeaderTab;renderChampionshipLeaders();return;}const groupStep=Number(event.target.closest('[data-championship-group-step]')?.dataset.championshipGroupStep||0);if(!groupStep||championshipDivision!=='D'||championshipRoundView>10)return;championshipGroupView=(championshipGroupView+groupStep+serieDGroups.length)%serieDGroups.length;renderChampionshipRound();});

  document.body.insertAdjacentHTML('beforeend',`<div id="cupBracketModal" class="modal hidden cup-bracket-modal"><div class="modal-card"><button id="closeCupBracket" class="close" type="button" aria-label="Fechar">×</button><header class="cup-bracket-head"><div class="cup-bracket-titles"><label id="cupBracketCompetitionLabel">CHAVEAMENTO · COPA DO BRASIL</label><h2 id="cupBracketTitle">Fase</h2></div><div id="cupBracketActions"></div></header><div id="cupBracketBody" class="cup-bracket-body"></div></div></div>`);
  let bracketCompetition='CUP';
  let openCupBracket=()=>{};
  let openSerieDBracket=()=>{};
  let closeCupBracket=()=>{$('#cupBracketModal')?.classList.add('hidden');};
  let goCupBracketNextPhase=()=>{};
  let goCupBracketPrevPhase=()=>{};
  const setBracketCompetitionLabel=text=>{
    const label=$('#cupBracketCompetitionLabel');
    if(label)label.textContent=text;
  };
  onClick('#closeCupBracket',()=>closeCupBracket());
  onClick('#cupBracketModal',event=>{
    if(event.target.id==='cupBracketModal'){closeCupBracket();return;}
    if(event.target.closest('[data-cup-bracket-close]')){closeCupBracket();return;}
    if(event.target.closest('[data-cup-bracket-prev]:not(:disabled)')){goCupBracketPrevPhase();return;}
    if(event.target.closest('[data-cup-bracket-next]:not(:disabled)')){goCupBracketNextPhase();return;}
  });

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
  let timer, minute, home, away, pauses, stats, cards, halftimeShown, pendingPenalty, shootoutState=null, matchFactors, goals, liveVolumeSamples=[], liveVolumePrev=null, liveVolumePulse={home:0.1,away:0.1}, liveVolumeIncidents=[], disciplineEvents, preMatchPreparation=false, substitutions=0, awaySubstitutions=0, awaySubWindows=0, substitutedOut=new Set(), activePreparationTitle='', matchDiscipline={home:new Map(),away:new Map()},liveInjuries={home:[],away:[]},liveDeferredInjuries={home:[],away:[]},liveOpeningLineup={home:[],away:[]},liveMinutesPlayed={home:new Map(),away:new Map()},availabilityCommitted=false,roundResultMessagePushed=false,preMatchTacticSnapshot=null,pauseLineupBaseline=null,stoppageFirst=0,stoppageSecond=0,stoppageElapsed=0,stoppageActive=null,stoppageHalfSnap=null;
  const playerHistory=createPlayerHistoryEngine({
    getClub:name=>clubs[name]||null,
    // Buffer de logs = só a temporada corrente, limitado ao nº real de jogos (ligas + copa).
    getMatchLogBudget:()=>{
      let total=0;
      Object.values(nationalCompetitions||{}).forEach(competition=>{
        total+=(competition.fixtures||[]).reduce((sum,round)=>sum+(Array.isArray(round)?round.length:0),0);
      });
      total+=(copaDoBrasilFixtures||[]).length;
      // Piso só se o calendário ainda não montou fixtures.
      return total>0?total:PLAYER_HISTORY_LIMITS.maxMatchLogsPerSeason;
    },
  });
  if(savedNewGame){
    const histStore=playerHistory.getStore();
    if(histStore.season==null)histStore.season=careerSeason;
  }
  let playerDevelopment=normalizeDevelopmentState(
    validSavedSeason?savedSeason?.playerDevelopment:null,
    careerSeason,
  );
  const getDevelopmentSeasonBucket=player=>{
    const key=historyPlayerKey(player);
    if(!key)return null;
    return playerHistory.getPlayer(key)?.seasons?.[String(careerSeason)]||null;
  };
  const applyDevelopmentPulseResult=result=>{
    if(!result||result.skipped)return false;
    playerDevelopment=result.state;
    if(clubs[userClub]?.roster){
      squad.splice(0,squad.length,...clubs[userClub].roster);
      try{syncCareerRosters();}catch{/* boot */}
    }
    return true;
  };
  const syncCalendarDevelopmentPulses=()=>{
    if(!savedNewGame)return;
    const {state,results}=ensureCalendarDevelopmentPulses({
      clubs,
      date:careerCalendarDate,
      season:careerSeason,
      state:playerDevelopment,
      getSeasonBucket:getDevelopmentSeasonBucket,
    });
    playerDevelopment=state;
    if(results.some(item=>!item.skipped)){
      if(clubs[userClub]?.roster){
        squad.splice(0,squad.length,...clubs[userClub].roster);
        try{syncCareerRosters();}catch{/* boot */}
      }
    }
  };
  const runSeasonEndDevelopmentPulse=()=>{
    if(!savedNewGame)return;
    const result=runDevelopmentPulse({
      clubs,
      pulseId:PULSE_IDS.seasonEnd,
      season:careerSeason,
      state:playerDevelopment,
      getSeasonBucket:getDevelopmentSeasonBucket,
    });
    applyDevelopmentPulseResult(result);
  };
  onCareerCalendarAdvanced=syncCalendarDevelopmentPulses;
  syncCalendarDevelopmentPulses();
  const liveSideMapsToFixture=game=>{
    if(!liveMatchGame||!game)return {swap:false};
    if(game.home!==liveMatchGame.home||game.away!==liveMatchGame.away)return {swap:false};
    return {swap:liveMatchGame.home!==userClub};
  };
  const disciplineMapToList=map=>{
    if(!map)return [];
    const entries=map instanceof Map?[...map.entries()]:Object.entries(map);
    return entries.map(([name,card])=>({
      name,
      yellow:card?.dismissal?0:(Number(card?.yellow)||0),
      dismissal:card?.dismissal||null,
      redContext:card?.redContext||null,
    })).filter(entry=>entry.yellow||entry.dismissal);
  };
  const enrichGameForHistory=game=>{
    if(!game?.home||!game?.away)return game;
    if(game.workload?.home?.length||game.workload?.away?.length)return game;
    const {swap}=liveSideMapsToFixture(game);
    if(!liveMatchGame||(game.home!==liveMatchGame.home&&game.home!==liveMatchGame.away))return game;
    const userSide='home',oppSide='away';
    const fixtureHomeLive=swap?oppSide:userSide;
    const fixtureAwayLive=swap?userSide:oppSide;
    const workloadFrom=side=>{
      const raw=liveMinutesPlayed?.[side];
      const entries=raw instanceof Map?[...raw.entries()]:Object.entries(raw||{});
      const opening=Array.isArray(liveOpeningLineup?.[side])?liveOpeningLineup[side]:[];
      return entries
        .filter(([,mins])=>(Number(mins)||0)>0)
        .map(([name,mins])=>({
          name,
          minutes:Math.round(Number(mins)||0),
          started:opening.includes(name),
        }));
    };
    const dataFromStats=()=>{
      const h=stats?.home||{},a=stats?.away||{};
      if(!swap){
        return {
          homePasses:Number(h.passes)||0,awayPasses:Number(a.passes)||0,
          homeAccurate:Number(h.accurate)||0,awayAccurate:Number(a.accurate)||0,
          homeShots:Number(h.shots)||0,awayShots:Number(a.shots)||0,
          homeOnTarget:Number(h.on)||0,awayOnTarget:Number(a.on)||0,
          homeSaved:Number(h.saved)||0,awaySaved:Number(a.saved)||0,
          homeKeeperSaves:Number(h.keeperSaves??h.saved)||0,awayKeeperSaves:Number(a.keeperSaves??a.saved)||0,
          homeYellow:Number(h.yellow)||0,awayYellow:Number(a.yellow)||0,
          homeRed:Number(h.red)||0,awayRed:Number(a.red)||0,
          homePossession:Number(h.possession)||0,awayPossession:Number(a.possession)||0,
        };
      }
      return {
        homePasses:Number(a.passes)||0,awayPasses:Number(h.passes)||0,
        homeAccurate:Number(a.accurate)||0,awayAccurate:Number(h.accurate)||0,
        homeShots:Number(a.shots)||0,awayShots:Number(h.shots)||0,
        homeOnTarget:Number(a.on)||0,awayOnTarget:Number(h.on)||0,
        homeSaved:Number(a.saved)||0,awaySaved:Number(h.saved)||0,
        homeKeeperSaves:Number(a.keeperSaves??a.saved)||0,awayKeeperSaves:Number(h.keeperSaves??h.saved)||0,
        homeYellow:Number(a.yellow)||0,awayYellow:Number(h.yellow)||0,
        homeRed:Number(a.red)||0,awayRed:Number(h.red)||0,
        homePossession:Number(a.possession)||0,awayPossession:Number(h.possession)||0,
      };
    };
    return {
      ...game,
      data:game.data||liveMatchGame.data||dataFromStats(),
      goals:game.goals||(swap
        ?{home:[...(goals?.away||[])],away:[...(goals?.home||[])]}
        :{home:[...(goals?.home||[])],away:[...(goals?.away||[])]}),
      workload:{home:workloadFrom(fixtureHomeLive),away:workloadFrom(fixtureAwayLive)},
      discipline:{home:disciplineMapToList(matchDiscipline[fixtureHomeLive]),away:disciplineMapToList(matchDiscipline[fixtureAwayLive])},
    };
  };
  const recordPlayerHistoryMatch=(game,meta={})=>{
    const enriched=enrichGameForHistory(game);
    return playerHistory.recordMatch(enriched,{
      season:careerSeason,
      round:meta.round??game.round??currentRound,
      competition:meta.competition||game.competition||`LEAGUE:${clubs[game.home]?.division||userDivision}`,
      leg:meta.leg||game.leg||null,
      date:meta.date||null,
      id:meta.id,
      persist:meta.persist!==false,
    });
  };
  const beginPauseLineupEdit=()=>{
    if(preMatchPreparation){pauseLineupBaseline=null;return;}
    pauseLineupBaseline=starters().map(player=>player.name);
  };
  const finalizePauseLineupEdits=()=>{
    if(!pauseLineupBaseline)return;
    const currentXI=new Set(starters().map(player=>player.name));
    const entered=starters().filter(player=>!pauseLineupBaseline.includes(player.name)).map(player=>player.name);
    let enterAt=0;
    pauseLineupBaseline.forEach(name=>{
      if(currentXI.has(name)||substitutedOut.has(name))return;
      const wasInjured=liveInjuries.home.some(entry=>entry.name===name);
      substitutions++;
      substitutedOut.add(name);
      if(wasInjured)liveInjuries.home=liveInjuries.home.filter(entry=>entry.name!==name);
      const incomingName=entered[enterAt++]||null;
      log(`Substituição no ${userClub}: sai ${name}${incomingName?`, entra ${incomingName}`:''}.`,'substitution','home');
      // Só registra no volume quando há par completo (evita seta vermelha sem quem entrou).
      if(incomingName)pushLiveVolumeIncident('home','substitution',{name:`${name} → ${incomingName}`});
    });
    pauseLineupBaseline=null;
  };
  /** Marcadores do Volume: cartões/lesões/pênalti perdido/substituição com minuto (lado do motor). */
  const pushLiveVolumeIncident=(engineSide,type,meta={})=>{
    if(engineSide!=='home'&&engineSide!=='away')return;
    if(!['yellow','red','injury','penalty-miss','substitution'].includes(type))return;
    const stoppageMin=stoppageActive?Math.max(0,Number(stoppageElapsed)||0):0;
    liveVolumeIncidents.push({
      minute:Math.min(90,Math.max(0,Number(minute)||0)),
      stoppage:stoppageMin||undefined,
      side:engineSide,
      type,
      name:meta.name||null,
    });
    matchLiveUi?.refreshMatchFeed?.();
  };
  const calendarLiveVolumeIncidents=()=>{
    if(userAtHomeInLiveMatch())return liveVolumeIncidents.map(item=>({...item}));
    return liveVolumeIncidents.map(item=>({...item,side:item.side==='home'?'away':'home'}));
  };
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
  const calendarLiveSideGoals=()=>{
    const empty={home:[],away:[]};
    if(!goals)return empty;
    return userAtHomeInLiveMatch()
      ?{home:goals.home||[],away:goals.away||[]}
      :{home:goals.away||[],away:goals.home||[]};
  };
  const volumeSideSnapshot=sideStats=>({
    attacks:Number(sideStats?.attacks)||0,
    goodAttacks:Number(sideStats?.goodAttacks)||0,
    shots:Number(sideStats?.shots)||0,
    on:Number(sideStats?.on)||0,
    corners:Number(sideStats?.corners)||0,
  });
  /**
   * Volume = pressão ofensiva do tick.
   * Sobe em ataques/chegadas/chutes/gols; cai rápido quando o time não ataca.
   */
  const recordLiveVolumeSample=()=>{
    if(!stats||!matchStarted||preMatchPreparation)return;
    const cur={
      home:volumeSideSnapshot(stats.home),
      away:volumeSideSnapshot(stats.away),
      goalsHome:(goals?.home||[]).length,
      goalsAway:(goals?.away||[]).length,
    };
    const prev=liveVolumePrev||cur;
    const attackPressure=side=>{
      const d=key=>Math.max(0,(cur[side][key]||0)-(prev[side][key]||0));
      // Só sinais de ataque — defesa/posse não empurram a barra.
      const pressure=
        d('attacks')*.48+
        d('goodAttacks')*.85+
        d('shots')*1.05+
        d('on')*.55+
        d('corners')*.6;
      if(pressure>0){
        liveVolumePulse[side]=clamp(Math.max(liveVolumePulse[side]*.28,pressure),.08,1);
      }else{
        liveVolumePulse[side]=clamp(liveVolumePulse[side]*.48,.03,.85);
      }
      return liveVolumePulse[side];
    };
    let homeAmp=attackPressure('home');
    let awayAmp=attackPressure('away');
    if(cur.goalsHome>(prev.goalsHome||0))homeAmp=liveVolumePulse.home=1;
    if(cur.goalsAway>(prev.goalsAway||0))awayAmp=liveVolumePulse.away=1;
    liveVolumePrev=cur;
    if(!userAtHomeInLiveMatch())[homeAmp,awayAmp]=[awayAmp,homeAmp];
    const sampleMinute=Math.min(90,Math.max(0,minute));
    const sampleStoppage=stoppageActive?Math.max(0,Number(stoppageElapsed)||0):0;
    const last=liveVolumeSamples[liveVolumeSamples.length-1];
    if(last&&last.minute===sampleMinute&&(Number(last.stoppage)||0)===sampleStoppage){
      // Mantém o pico ofensivo do minuto; só baixa se ambos os lados esfriaram.
      last.home=Math.max(homeAmp,last.home*.55);
      last.away=Math.max(awayAmp,last.away*.55);
      return;
    }
    liveVolumeSamples.push({minute:sampleMinute,stoppage:sampleStoppage||undefined,home:homeAmp,away:awayAmp});
  };
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
  let scheduleLiveMatchPersist=()=>{};
  let flushLiveMatchPersist=()=>null;
  let clearLiveMatchPersist=()=>{};
  const renderStats = () => {
    recordLiveVolumeSample();
    const {home:h,away:a}=calendarLiveSideStats(),{home:hp,away:ap}=calendarPossessionPair();
    const rows = [['Posse de bola',`${hp}%`,`${ap}%`,'possession'],['Passes','','','group'],['Total de Passes',h.passes,a.passes],['% passes certos',percent(h.accurate,h.passes),percent(a.accurate,a.passes)],['Passes errados',h.passes-h.accurate,a.passes-a.accurate],['Ataque','','','group'],['Finalizações',h.shots,a.shots],['Para Fora',h.off,a.off],['No Gol',h.on,a.on],['Defendidas',h.saved,a.saved],['Pênaltis',h.penalties,a.penalties],['Escanteios',h.corners,a.corners],['Impedimentos',h.offsides,a.offsides],['Defesa','','','group'],['Defesas do Goleiro',h.keeperSaves,a.keeperSaves],['Desarmes',h.tackles,a.tackles],['Faltas Cometidas',h.fouls,a.fouls],['Cartões Amarelos',h.yellow,a.yellow,'yellow'],['Cartões Vermelhos',h.red,a.red,'red']];
    const statsBody=rows.map(r => r[3] === 'group' ? `<div class="stat-group">${r[0]}</div>` : `<div class="stat ${r[3] || ''}"><span>${r[1]}</span><span>${r[0]}</span><span>${r[2]}</span></div>`).join('');
    $('#stats').innerHTML=statsBody;
    renderLiveOpponent?.();
    matchLiveUi.refreshMatchFeed?.();
    scheduleLiveMatchPersist();
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
    getLiveState:()=>({
      cards,matchStarted,matchFinished,preMatchPreparation,substitutions,substitutedOut,liveDeferredInjuries,liveMinutesPlayed,positionAssignments,activePreparationTitle,
      // Enquanto o painel de preparação/pausa estiver aberto, trocas não travam reserva.
      freeSubEdits:!!$('#pausePanel')&&!$('#pausePanel').classList.contains('hidden'),
      competitionKey:fixtureCompetitionKey(liveMatchGame||nextUserGame)||userLeagueDisciplineKey(),
    }),
    commitLiveSubstitution:(outgoingName,{wasInjured=false,wasAtRisk=false,incomingName=null}={})=>{
      substitutions++;
      substitutedOut.add(outgoingName);
      if(wasInjured)liveInjuries.home=liveInjuries.home.filter(entry=>entry.name!==outgoingName);
      if(incomingName)pushLiveVolumeIncident('home','substitution',{name:`${outgoingName} → ${incomingName}`});
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
  {
    const savedFormation=validSavedSeason?.userFormation;
    if(savedFormation&&formationRoles[savedFormation]){
      formation=savedFormation;
      clubs[userClub].formation=savedFormation;
      positionAssignments=[...formationRoles[savedFormation]];
    }else if(clubs[userClub]?.formation&&formationRoles[clubs[userClub].formation]){
      formation=clubs[userClub].formation;
      positionAssignments=[...formationRoles[formation]];
    }
    const restoredLineup=validSavedSeason?.userLineupOrder;
    if(Array.isArray(restoredLineup)&&restoredLineup.length>=11&&applyRosterOrderByNames(squad,restoredLineup)){
      clubs[userClub].formation=formation;
    }else if(!validSavedSeason){
      // Carreira nova / sem save de temporada: monta XI sugerido uma vez.
      autoSelectUserLineup(formation);
    }else{
      // Save antigo sem ordem: preserva roster da carreira, só sincroniza formação.
      clubs[userClub].formation=formation;
      positionAssignments=[...(formationRoles[formation]||formationRoles['4-3-3'])];
    }
  }
  renderRoster();
  refreshUserFixtures();
  draw();
  renderTacticalConfrontation({context:'tactics'});
  const openLiveMatchRatings=()=>{
    if(!liveMatchGame){
      console.warn('[NOTAS] Sem partida ao vivo ativa.');
      return;
    }
    const {home:h,away:a}=calendarLiveSideStats();
    const {home:homeGoals,away:awayGoals}=calendarLiveScores();
    const sideGoals=calendarLiveSideGoals();
    const {home:hp,away:ap}=calendarPossessionPair();
    const data={
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
    };
    const draft={
      home:liveMatchGame.home,
      away:liveMatchGame.away,
      round:liveMatchGame.round,
      competition:liveMatchGame.competition,
      leg:liveMatchGame.leg,
      homeGoals,
      awayGoals,
      goals:{home:[...sideGoals.home],away:[...sideGoals.away]},
      data,
    };
    const enriched=enrichGameForHistory(draft);
    const built=buildMatchPlayerSheets(enriched,{getClub:name=>clubs[name]||null});
    const ratingPlayers=[...(built.home||[]),...(built.away||[])];
    openCalendarMatchReport({
      game:liveMatchGame,
      result:{
        homeGoals,
        awayGoals,
        penalties:liveMatchGame.penalties||liveMatchGame.shootoutPenalties||null,
      },
      data,
      goals:{home:[...sideGoals.home],away:[...sideGoals.away]},
      ratingPlayers,
      incidents:calendarLiveVolumeIncidents(),
    });
  };
  const matchLiveSession=createMatchLiveSessionFeature({
    $,
    onClick,
    getLiveInjuries:()=>liveInjuries,
    getLiveDeferredInjuries:()=>liveDeferredInjuries,
    getUserClub:()=>userClub,
    getMatchClub:()=>matchClub(),
    getClubs:()=>clubs,
    applyDeferredInjuryDiagnosis,
    injuryDiagnosisComment,
    calendarLiveSideStats,
    calendarPossessionPair,
    calendarLiveSideGoals,
    getPostMatchMedicalQueue:()=>postMatchMedicalQueue,
    processPostMatchMedicalQueue,
    pushMessage,
    getCurrentRound:()=>currentRound,
    getLiveMatchGame:()=>liveMatchGame,
    getNextUserGame:()=>nextUserGame,
    fixtureDetails,
    advanceCareerCalendarTo,
    getHasCareer:()=>!!savedNewGame,
    persistSeason:(...args)=>persistSeason(...args),
    modal,
    getMatchFinished:()=>matchFinished,
    getRoundCommitted:()=>roundCommitted,
    advanceSeasonRound:(...args)=>advanceSeasonRound(...args),
    openChampionship:(...args)=>openChampionship(...args),
    simulateRoundResults:(...args)=>simulateRoundResults(...args),
    openRoundResults:(...args)=>openRoundResults(...args),
    openLiveMatchRatings,
    onPostMatchModalClosed:()=>renderUserMatchPresentation(),
    stopMatchClock,
    startMatchClock:(...args)=>startMatchClock(...args),
    closeFormationSuggestion,
    getMatchStarted:()=>matchStarted,
    renderLiveMatchHeader,
    score:(...args)=>score(...args),
    updateLiveMatchClock,
    getShootoutState:()=>shootoutState,
    renderShootoutTrack:(...args)=>renderShootoutTrack(...args),
    getPreMatchPreparation:()=>preMatchPreparation,
    renderStats,
    setActivePreparationTitle:v=>{activePreparationTitle=v;},
    onBeginLineupEdit:beginPauseLineupEdit,
    syncTactics,
    drawBoard,
    renderSubstitutionControls,
    renderTacticalConfrontation,
  });
  const {renderFinalSummary,showFinalActions,exitLiveMatch,reopenMatchWindow,openPreparation}=matchLiveSession;
  let roundResults = null, roundPreviewResults={};
  const cupPenaltyWinner=(first,second)=>{
    const strength=name=>{
      const club=clubs[name];
      if(!club?.roster?.length)return 0;
      const lineup=club.roster.slice(0,11);
      const takers=[...lineup].filter(player=>player.pos!=='GOL').sort((a,b)=>b.penaltyTaking-a.penaltyTaking).slice(0,5);
      const keeper=lineup.find(player=>player.pos==='GOL')||lineup[0];
      return takers.reduce((sum,player)=>sum+player.penaltyTaking,0)/Math.max(1,takers.length)+(keeper?.penaltySaving||50)*.32+(club.power||50)*.18+rnd(-9,9);
    };
    return strength(first)>=strength(second)?first:second;
  };
  const applyCupFatigue=(game,result)=>fatigueEngine.applyCupFatigue(game,result,applyMatchAvailability);
  const nextCupEntrants=(phase,winners)=>phase===1?[...winners,...cupSecondDirect]:phase===2?[...winners,...cupSpecialEntrants]:phase===4?[...winners,...cupSerieAEntrants]:[...winners];
  const cupTieGames=(stage,tieId)=>{
    const fixtures=Array.isArray(stage?.fixtures)?stage.fixtures:[];
    return fixtures.filter(game=>game?.tieId===tieId).sort((a,b)=>a.date-b.date||a.gameNumber-b.gameNumber);
  };
  const simulateCupComputerGame=game=>{
    if(game.completed||isUserFixture(game))return null;
    const result=simulateRoundMatch(game.home,game.away,game);
    game.homeGoals=result.homeGoals;game.awayGoals=result.awayGoals;game.completed=true;game.data=result.data;game.goals=result.goals;
    applyCupFatigue(game,result);
    recordPlayerHistoryMatch(
      {...result,home:game.home,away:game.away,round:game.phaseIndex||game.round,competition:game.competition||'COPA DO BRASIL',leg:game.leg,tieId:game.tieId},
      {persist:false,competition:'COPA DO BRASIL',round:game.phaseIndex||game.round,leg:game.leg,id:`cup-${game.tieId||'x'}-${game.leg||'u'}-${game.gameNumber||''}`},
    );
    return result;
  };
  const cupTieAggregate=games=>{const aggregate=new Map();games.forEach(game=>{if(!game.completed)return;aggregate.set(game.home,(aggregate.get(game.home)||0)+(game.homeGoals||0));aggregate.set(game.away,(aggregate.get(game.away)||0)+(game.awayGoals||0));});return aggregate;};
  const cupBracketTieFromStage=(stage,tieId)=>{
    const games=cupTieGames(stage,tieId);
    if(!games.length)return null;
    const sideA=games[0].home,sideB=games[0].away;
    const aggregate=cupTieAggregate(games);
    const allDone=games.every(game=>game.completed);
    const played=games.some(game=>game.completed);
    let winner=games.find(game=>game.winner)?.winner||games.find(game=>game.shootoutWinner)?.shootoutWinner||null;
    if(!winner&&allDone){
      const goalsA=aggregate.get(sideA)||0,goalsB=aggregate.get(sideB)||0;
      if(goalsA!==goalsB)winner=goalsA>goalsB?sideA:sideB;
    }
    const penLabel=games.map(game=>game.penalties||game.shootoutPenalties).find(Boolean)||'';
    const legMeta=games.map(game=>{
      const details=fixtureDetails(game);
      const score=game.completed?formatKnockoutFixtureScore(game,{separator:'-'}):'×';
      return `${game.leg} ${details.display} ${score}`;
    }).join(' · ');
    return {
      tieId,sideA,sideB,winner,penLabel,legMeta,played,allDone,
      scoreA:played?String(aggregate.get(sideA)||0):'—',
      scoreB:played?String(aggregate.get(sideB)||0):'—',
      userTie:sideA===userClub||sideB===userClub,
    };
  };
  const renderCupTreeTeam=(name,score,{winner=null,plain=false}={})=>{
    const classes=['cup-tree-team'];
    if(name===userClub)classes.push('user-club');
    if(winner===name)classes.push('winner');
    const main=plain?`<b>${name}</b>`:cupClubLabel(name,{tag:'b'});
    return `<div class="${classes.join(' ')}"><i class="crest">${clubCrestInitials(name)}</i><span class="cup-tree-team-main">${main}</span><em>${score}</em></div>`;
  };
  const renderCupTreeMatch=(tie,{plain=false}={})=>{
    const badge=tie.userTie?`<div class="cup-tree-user-badge">${tie.winner===userClub?'VOCÊ AVANÇOU':tie.allDone?'VOCÊ ELIMINADO':'SEU JOGO'}</div>`:'';
    const metaLine=[tie.legMeta,tie.penLabel?`PÊN. ${tie.penLabel}`:''].filter(Boolean).join(' · ');
    const winnerLine=tie.winner?`<strong>Classificado: ${tie.winner}</strong>`:'';
    return `<article class="cup-tree-match ${tie.userTie?'user-tie':''} ${tie.userTie?'':'dim-tie'}" data-user-tie="${tie.userTie?'1':'0'}">
      ${badge}
      ${renderCupTreeTeam(tie.sideA,tie.scoreA,{winner:tie.winner,plain})}
      ${renderCupTreeTeam(tie.sideB,tie.scoreB,{winner:tie.winner,plain})}
      <div class="cup-tree-match-meta"><span>${metaLine}</span>${winnerLine}</div>
    </article>`;
  };
  const renderCupPhase5Pot=()=>{
    const phase4=cupCompetition.stages.find(item=>item.index===4);
    const fromPhase4=phase4?.winners?.length
      ?phase4.winners
      :phase4?.fixtures
        ?[...new Set(phase4.fixtures.map(game=>game.tieId))]
          .map(tieId=>cupBracketTieFromStage(phase4,tieId))
          .map(tie=>tie?.winner)
          .filter(Boolean)
        :[];
    const pendingSlots=Math.max(0,12-fromPhase4.length);
    const serieA=cupSerieAEntrants.slice(0,20);
    const chips=[
      ...serieA.map(name=>`<i class="${name===userClub?'user-club':''}" title="${name}">${clubCrestInitials(name)}</i>`),
      ...fromPhase4.map(name=>`<i class="${name===userClub?'user-club':''}" title="${name}">${clubCrestInitials(name)}</i>`),
      ...Array.from({length:pendingSlots},()=>'<i class="tbd">?</i>'),
    ].join('');
    return `<div class="cup-tree-pot"><strong>POTES DO SORTEIO</strong><div class="cup-tree-pot-grid">${chips}</div></div>`;
  };
  const cupBracketPhaseStatus=(stage)=>{
    if(stage?.completed)return 'CONCLUÍDA';
    if(stage)return 'EM DISPUTA';
    return 'AGUARDANDO SORTEIO';
  };
  const cupBracketPhaseNav=(phaseIndex)=>{
    const prevStage=cupCompetition.stages.find(item=>item.index===phaseIndex-1);
    const nextStage=cupCompetition.stages.find(item=>item.index===phaseIndex+1);
    const prevReady=Boolean(prevStage?.fixtures?.length);
    const nextReady=Boolean(nextStage?.fixtures?.length);
    return `<div class="cup-bracket-phase-nav" role="group" aria-label="Navegar fases">
      <button type="button" class="cup-bracket-btn ghost cup-bracket-nav" data-cup-bracket-prev ${prevReady?'':'disabled'} aria-label="Fase anterior" title="${prevReady?'Fase anterior':'Não há fase anterior'}">←</button>
      <button type="button" class="cup-bracket-btn ghost cup-bracket-nav" data-cup-bracket-next ${nextReady?'':'disabled'} aria-label="Próxima fase" title="${nextReady?'Próxima fase':'Aguarde o sorteio da próxima fase'}">→</button>
    </div>`;
  };
  const cupBracketActionButtons=(phaseIndex,stage)=>{
    const status=cupBracketPhaseStatus(stage);
    const statusClass=stage?.completed?'':(stage?'':'is-wait');
    return `<div class="cup-bracket-actions">
      <span class="cup-bracket-status ${statusClass}">${status}</span>
      <button type="button" class="cup-bracket-btn ghost" data-cup-bracket-close>FECHAR</button>
      ${cupBracketPhaseNav(phaseIndex)}
    </div>`;
  };
  const renderCupCenterSummary=(phaseIndex,stage,{userNote='',tieCount=0,userTie=false}={})=>{
    const status=cupBracketPhaseStatus(stage);
    const statusClass=stage?.completed?'is-done':(stage?'':'is-wait');
    return `<aside class="cup-tree-pot ${userTie?'has-user':''}">
      <div class="cup-tree-pot-info">
        <strong class="cup-tree-pot-phase">${stage?.name||`Fase ${phaseIndex}`}</strong>
        <p class="cup-tree-center-user">${userNote}</p>
        <p class="cup-tree-center-count">${tieCount} confronto${tieCount===1?'':'s'}</p>
        <span class="cup-tree-pot-status ${statusClass}">${status}</span>
      </div>
      <div class="cup-tree-center-nav">${cupBracketPhaseNav(phaseIndex)}</div>
    </aside>`;
  };
  const renderCupBracket=(phaseIndex)=>{
    const definition=cupPhaseDefinitions.find(item=>item.index===phaseIndex);
    const stage=cupCompetition.stages.find(item=>item.index===phaseIndex);
    const title=$('#cupBracketTitle'),actionsEl=$('#cupBracketActions'),body=$('#cupBracketBody');
    if(!title||!actionsEl||!body)return;
    title.textContent=stage?.name||definition?.name||`Fase ${phaseIndex}`;
    actionsEl.innerHTML=cupBracketActionButtons(phaseIndex,stage);
    if(!stage?.fixtures?.length){
      body.innerHTML='<div class="cup-bracket-empty">Aguardando sorteio desta fase.</div>';
      return;
    }
    // Só a fase clicada — sem colunas de fase anterior/seguinte nem slots inventados.
    let ties=[...new Set(stage.fixtures.map(game=>game.tieId))]
      .map(tieId=>cupBracketTieFromStage(stage,tieId))
      .filter(Boolean);
    const userTies=ties.filter(tie=>tie.userTie);
    ties=[...userTies,...ties.filter(tie=>!tie.userTie)];
    if(ties.length===1){
      body.innerHTML=`<div class="cup-tree single-final"><div class="cup-tree-center"><div class="cup-tree-final-slot"><span>${stage.name}</span>${renderCupTreeMatch(ties[0])}<div class="cup-tree-center-nav">${cupBracketPhaseNav(phaseIndex)}</div></div></div></div>`;
      return;
    }
    const mid=Math.ceil(ties.length/2);
    const left=ties.slice(0,mid);
    const right=ties.slice(mid);
    const userTie=userTies[0];
    const userNote=userTie
      ?userTie.winner===userClub
        ?`${userClub} classificado`
        :userTie.allDone
          ?`${userClub} eliminado`
          :`Confronto de ${userClub}`
      :'Seu clube não está nesta fase';
    const centerHtml=phaseIndex===5
      ?`${renderCupPhase5Pot()}<div class="cup-tree-center-nav">${cupBracketPhaseNav(phaseIndex)}</div>`
      :renderCupCenterSummary(phaseIndex,stage,{userNote,tieCount:ties.length,userTie:Boolean(userTie)});
    body.innerHTML=`<div class="cup-tree phase-only ${userTies.length?'has-user-path':''}">
      <div class="cup-tree-wing left"><div class="cup-tree-round"><div class="cup-tree-matches">${left.map(renderCupTreeMatch).join('')}</div></div></div>
      <div class="cup-tree-center">${centerHtml}</div>
      <div class="cup-tree-wing right"><div class="cup-tree-round"><div class="cup-tree-matches">${right.map(renderCupTreeMatch).join('')}</div></div></div>
    </div>`;
    requestAnimationFrame(()=>{
      const focus=body.querySelector('[data-user-tie="1"]');
      focus?.scrollIntoView({block:'nearest',behavior:'smooth'});
    });
  };
  const serieDBracketTieFromStage=(startRound,tieId)=>{
    const games=serieDStageFixturesMerged(startRound)
      .filter(game=>game.tieId===tieId)
      .sort((a,b)=>(a.leg==='IDA'?0:1)-(b.leg==='IDA'?0:1));
    if(!games.length)return null;
    const sideA=games[0].home,sideB=games[0].away;
    const aggregate=cupTieAggregate(games);
    const allDone=games.every(game=>game.completed);
    const played=games.some(game=>game.completed);
    let winner=games.find(game=>game.winner)?.winner||games.find(game=>game.shootoutWinner)?.shootoutWinner||null;
    if(!winner&&allDone){
      const goalsA=aggregate.get(sideA)||0,goalsB=aggregate.get(sideB)||0;
      if(goalsA!==goalsB)winner=goalsA>goalsB?sideA:sideB;
    }
    const penLabel=games.map(game=>game.penalties||game.shootoutPenalties).find(Boolean)||'';
    const legMeta=games.map(game=>{
      const details=fixtureDetails(game);
      const score=game.completed?formatKnockoutFixtureScore(game,{separator:'-'}):'×';
      return `${game.leg||'JOGO'} ${details.display} ${score}`;
    }).join(' · ');
    return {
      tieId,sideA,sideB,winner,penLabel,legMeta,played,allDone,
      scoreA:played?String(aggregate.get(sideA)||0):'—',
      scoreB:played?String(aggregate.get(sideB)||0):'—',
      userTie:sideA===userClub||sideB===userClub,
    };
  };
  const serieDBracketPhaseNav=phaseIndex=>{
    const prevDef=serieDKnockoutPhaseDefs.find(item=>item.index===phaseIndex-1);
    const nextDef=serieDKnockoutPhaseDefs.find(item=>item.index===phaseIndex+1);
    const prevReady=Boolean(prevDef&&serieDKnockoutPhaseMeta(prevDef).generated);
    const nextReady=Boolean(nextDef&&serieDKnockoutPhaseMeta(nextDef).generated);
    return `<div class="cup-bracket-phase-nav" role="group" aria-label="Navegar fases">
      <button type="button" class="cup-bracket-btn ghost cup-bracket-nav" data-cup-bracket-prev ${prevReady?'':'disabled'} aria-label="Fase anterior" title="${prevReady?'Fase anterior':'Não há fase anterior'}">←</button>
      <button type="button" class="cup-bracket-btn ghost cup-bracket-nav" data-cup-bracket-next ${nextReady?'':'disabled'} aria-label="Próxima fase" title="${nextReady?'Próxima fase':'Aguarde o sorteio da próxima fase'}">→</button>
    </div>`;
  };
  const renderSerieDBracket=phaseIndex=>{
    const definition=serieDKnockoutPhaseDefs.find(item=>item.index===phaseIndex)||serieDKnockoutPhaseDefs[0];
    const meta=serieDKnockoutPhaseMeta(definition);
    const title=$('#cupBracketTitle'),actionsEl=$('#cupBracketActions'),body=$('#cupBracketBody');
    if(!title||!actionsEl||!body)return;
    title.textContent=definition.name;
    const statusClass=meta.completed?'':(meta.generated?'':'is-wait');
    actionsEl.innerHTML=`<div class="cup-bracket-actions">
      <span class="cup-bracket-status ${statusClass}">${meta.status}</span>
      <button type="button" class="cup-bracket-btn ghost" data-cup-bracket-close>FECHAR</button>
      ${serieDBracketPhaseNav(definition.index)}
    </div>`;
    if(!meta.generated){
      body.innerHTML='<div class="cup-bracket-empty">Aguardando sorteio desta fase.</div>';
      return;
    }
    const fixtures=serieDStageFixturesMerged(definition.startRound);
    let ties=[...new Set(fixtures.map(game=>game.tieId).filter(Boolean))]
      .map(tieId=>serieDBracketTieFromStage(definition.startRound,tieId))
      .filter(Boolean);
    const userTies=ties.filter(tie=>tie.userTie);
    ties=[...userTies,...ties.filter(tie=>!tie.userTie)];
    const hasPlayoff=definition.key==='semi'&&Boolean(nationalCompetitions.D.knockout?.stages?.playoff?.length);
    if(hasPlayoff){
      const {semi,playoff}=splitSerieDSemiPlayoffTies(ties);
      const renderGroup=(label,hint,groupTies)=>!groupTies.length?'':`<section class="cup-tree-stage-group">
        <header><h4>${label}</h4><small>${hint}</small></header>
        <div class="cup-tree-matches">${sortChampionshipTiesUserFirst(groupTies).map(tie=>renderCupTreeMatch(tie,{plain:true})).join('')}</div>
      </section>`;
      body.innerHTML=`<div class="cup-tree-split-stages">
        <div class="cup-tree-split-nav">${serieDBracketPhaseNav(definition.index)}</div>
        ${renderGroup('SEMIFINAL','Vencedores avançam à final · os 4 semifinalistas já estão garantidos na Série C na próxima temporada',semi)}
        ${renderGroup('REPESCAGEM','Vencedores conquistam o acesso à Série C',playoff)}
      </div>`;
      requestAnimationFrame(()=>{
        const focus=body.querySelector('[data-user-tie="1"]');
        focus?.scrollIntoView({block:'nearest',behavior:'smooth'});
      });
      return;
    }
    const stageLabel=definition.name;
    if(ties.length===1){
      body.innerHTML=`<div class="cup-tree single-final"><div class="cup-tree-center"><div class="cup-tree-final-slot"><span>${stageLabel}</span>${renderCupTreeMatch(ties[0],{plain:true})}<div class="cup-tree-center-nav">${serieDBracketPhaseNav(definition.index)}</div></div></div></div>`;
      return;
    }
    const mid=Math.ceil(ties.length/2);
    const left=ties.slice(0,mid);
    const right=ties.slice(mid);
    const userTie=userTies[0];
    const userNote=userTie
      ?userTie.winner===userClub
        ?`${userClub} classificado`
        :userTie.allDone
          ?`${userClub} eliminado`
          :`Confronto de ${userClub}`
      :'Seu clube não está nesta fase';
    const statusClassCenter=meta.completed?'is-done':(meta.generated?'':'is-wait');
    const centerHtml=`<aside class="cup-tree-pot ${userTie?'has-user':''}">
      <div class="cup-tree-pot-info">
        <strong class="cup-tree-pot-phase">${stageLabel}</strong>
        <p class="cup-tree-center-user">${userNote}</p>
        <p class="cup-tree-center-count">${ties.length} confronto${ties.length===1?'':'s'}</p>
        <span class="cup-tree-pot-status ${statusClassCenter}">${meta.status}</span>
      </div>
      <div class="cup-tree-center-nav">${serieDBracketPhaseNav(definition.index)}</div>
    </aside>`;
    body.innerHTML=`<div class="cup-tree phase-only ${userTies.length?'has-user-path':''}">
      <div class="cup-tree-wing left"><div class="cup-tree-round"><div class="cup-tree-matches">${left.map(tie=>renderCupTreeMatch(tie,{plain:true})).join('')}</div></div></div>
      <div class="cup-tree-center">${centerHtml}</div>
      <div class="cup-tree-wing right"><div class="cup-tree-round"><div class="cup-tree-matches">${right.map(tie=>renderCupTreeMatch(tie,{plain:true})).join('')}</div></div></div>
    </div>`;
    requestAnimationFrame(()=>{
      const focus=body.querySelector('[data-user-tie="1"]');
      focus?.scrollIntoView({block:'nearest',behavior:'smooth'});
    });
  };
  openCupBracket=phaseIndex=>{
    const index=Number(phaseIndex)||1;
    bracketCompetition='CUP';
    championshipRoundView=index;
    setBracketCompetitionLabel('CHAVEAMENTO · COPA DO BRASIL');
    markCupPhaseSelection(index);
    renderCupBracket(index);
    $('#cupBracketModal')?.classList.remove('hidden');
  };
  openSerieDBracket=phaseIndex=>{
    const index=Number(phaseIndex)||1;
    bracketCompetition='SERIE_D';
    championshipRoundView=index;
    setBracketCompetitionLabel('CHAVEAMENTO · SÉRIE D');
    markSerieDPhaseSelection(index);
    renderSerieDBracket(index);
    $('#cupBracketModal')?.classList.remove('hidden');
  };
  closeCupBracket=()=>{$('#cupBracketModal')?.classList.add('hidden');};
  goCupBracketPrevPhase=()=>{
    if(bracketCompetition==='SERIE_D'){
      const current=Number(championshipRoundView)||1;
      const prev=serieDKnockoutPhaseDefs.find(item=>item.index===current-1);
      if(!prev||!serieDKnockoutPhaseMeta(prev).generated)return;
      openSerieDBracket(prev.index);
      return;
    }
    const current=Number(championshipRoundView)||1;
    const prev=cupCompetition.stages.find(item=>item.index===current-1);
    if(!prev?.fixtures?.length)return;
    openCupBracket(prev.index);
  };
  goCupBracketNextPhase=()=>{
    if(bracketCompetition==='SERIE_D'){
      const current=Number(championshipRoundView)||1;
      const next=serieDKnockoutPhaseDefs.find(item=>item.index===current+1);
      if(!next||!serieDKnockoutPhaseMeta(next).generated)return;
      openSerieDBracket(next.index);
      return;
    }
    const current=Number(championshipRoundView)||1;
    const next=cupCompetition.stages.find(item=>item.index===current+1);
    if(!next?.fixtures?.length)return;
    openCupBracket(next.index);
  };

  const placeChampionshipPagePickerMenu=()=>{
    const btn=$('#championshipPagePickerBtn'),menu=$('#championshipPagePickerMenu');
    if(!btn||!menu||!pagePickerOpen)return;
    const rect=btn.getBoundingClientRect();
    menu.style.position='fixed';
    menu.style.top=`${Math.round(rect.bottom+6)}px`;
    menu.style.right=`${Math.round(Math.max(8,window.innerWidth-rect.right))}px`;
    menu.style.left='auto';
    menu.style.zIndex='5000';
  };
  const setChampionshipPagePickerOpen=open=>{
    pagePickerOpen=!!open;
    const btn=$('#championshipPagePickerBtn'),menu=$('#championshipPagePickerMenu');
    const host=$('.championship-page-picker');
    btn?.setAttribute('aria-expanded',pagePickerOpen?'true':'false');
    if(btn)btn.textContent=pagePickerOpen?'TODAS AS COMPETIÇÕES ▴':'TODAS AS COMPETIÇÕES ▾';
    if(!menu)return;
    menu.classList.toggle('hidden',!pagePickerOpen);
    if(pagePickerOpen){
      // Portal para body: evita clip do overflow da view/tabela.
      if(menu.parentElement!==document.body)document.body.appendChild(menu);
      placeChampionshipPagePickerMenu();
    }else{
      menu.style.position='';
      menu.style.top='';
      menu.style.right='';
      menu.style.left='';
      menu.style.zIndex='';
      if(host&&menu.parentElement!==host)host.appendChild(menu);
    }
  };
  const championshipPageIsKnockoutView=()=>pageCompetition==='CUP'||(pageCompetition==='D'&&pageSerieDMode==='knockout');
  const serieDMaxGeneratedPhaseIndex=()=>{
    let max=0;
    serieDKnockoutPhaseDefs.forEach(definition=>{
      if(serieDKnockoutPhaseMeta(definition).generated)max=Math.max(max,definition.index);
    });
    return max;
  };
  const renderChampionshipPageTieSide=(name,side)=>{
    const crest=`<i class="crest championship-page-tie-crest" aria-hidden="true">${clubCrestInitials(name)}</i>`;
    const label=`<span class="championship-page-tie-club">${cupClubLabel(name,{tag:'b'})}</span>`;
    return side==='away'
      ?`<div class="championship-page-tie-side is-away">${label}${crest}</div>`
      :`<div class="championship-page-tie-side is-home">${crest}${label}</div>`;
  };
  const renderChampionshipPageTie=tie=>{
    if(!tie)return '';
    const score=tie.played?`${tie.scoreA} — ${tie.scoreB}`:'×';
    const winner=tie.winner?`<strong class="winner-note">Classificado: ${tie.winner}${tie.penLabel?` · Pên. ${tie.penLabel}`:''}</strong>`:'';
    return `<article class="championship-page-tie ${tie.userTie?'user-tie':''}">
      <div class="championship-page-tie-line">
        ${renderChampionshipPageTieSide(tie.sideA,'home')}
        <em>${score}</em>
        ${renderChampionshipPageTieSide(tie.sideB,'away')}
      </div>
      <div class="championship-page-tie-meta">
        <small>${tie.legMeta||'Confronto'}</small>
        ${winner}
      </div>
    </article>`;
  };
  const wrapChampionshipPageTies=html=>`<div class="championship-page-ties">${html}</div>`;
  const serieDClubPairKey=(a,b)=>[String(a||''),String(b||'')].sort().join('|');
  const serieDStagePairKeys=stageTies=>new Set((stageTies||[]).map(tie=>serieDClubPairKey(tie.home,tie.away)));
  const sortChampionshipTiesUserFirst=ties=>{
    const userTies=ties.filter(tie=>tie.userTie);
    return [...userTies,...ties.filter(tie=>!tie.userTie)];
  };
  /** Na fase de semi, fixtures misturam semi + repescagem no mesmo round — separa pelo stages. */
  const splitSerieDSemiPlayoffTies=ties=>{
    const stages=nationalCompetitions.D?.knockout?.stages||{};
    const semiKeys=serieDStagePairKeys(stages.semi);
    const playoffKeys=serieDStagePairKeys(stages.playoff);
    const semi=[],playoff=[],other=[];
    ties.forEach(tie=>{
      const key=serieDClubPairKey(tie.sideA,tie.sideB);
      if(playoffKeys.has(key)&&!semiKeys.has(key))playoff.push(tie);
      else if(semiKeys.has(key))semi.push(tie);
      else other.push(tie);
    });
    // Índices sem match nos stages: primeiros vão para semi (ordem de installTieRounds).
    if(other.length){
      const expectedSemi=Math.max(0,(stages.semi||[]).length-semi.length);
      other.forEach((tie,index)=>(index<expectedSemi?semi:playoff).push(tie));
    }
    return {semi,playoff};
  };
  const renderChampionshipPageTieGroup=(label,ties,hint='')=>{
    if(!ties.length)return '';
    const list=sortChampionshipTiesUserFirst(ties).map(renderChampionshipPageTie).join('');
    return `<section class="championship-page-tie-group">
      <header class="championship-page-tie-group-head">
        <h4>${label}</h4>
        ${hint?`<small>${hint}</small>`:''}
      </header>
      <div class="championship-page-ties">${list}</div>
    </section>`;
  };
  const renderChampionshipPageKnockoutBody=()=>{
    if(pageCompetition==='CUP'){
      const definition=cupPhaseDefinitions.find(item=>item.index===pageCupPhase);
      const stage=cupCompetition.stages.find(item=>item.index===pageCupPhase);
      if(!stage?.fixtures?.length){
        return `<div class="championship-page-empty">Aguardando sorteio${definition?` da ${definition.name}`:' desta fase'}.</div>`;
      }
      let ties=[...new Set(stage.fixtures.map(game=>game.tieId))]
        .map(tieId=>cupBracketTieFromStage(stage,tieId))
        .filter(Boolean);
      ties=sortChampionshipTiesUserFirst(ties);
      const list=ties.map(renderChampionshipPageTie).join('')||'<div class="championship-page-empty">Sem confrontos nesta fase.</div>';
      return wrapChampionshipPageTies(list);
    }
    const definition=serieDKnockoutPhaseDefs.find(item=>item.index===pageSerieDPhase)||serieDKnockoutPhaseDefs[0];
    const meta=serieDKnockoutPhaseMeta(definition);
    if(!meta.generated){
      return `<div class="championship-page-empty">Aguardando sorteio da ${definition.name.toLowerCase()}.</div>`;
    }
    const fixtures=serieDStageFixturesMerged(definition.startRound);
    let ties=[...new Set(fixtures.map(game=>game.tieId).filter(Boolean))]
      .map(tieId=>serieDBracketTieFromStage(definition.startRound,tieId))
      .filter(Boolean);
    const hasPlayoff=definition.key==='semi'&&Boolean(nationalCompetitions.D.knockout?.stages?.playoff?.length);
    if(hasPlayoff){
      const {semi,playoff}=splitSerieDSemiPlayoffTies(ties);
      const groups=[
        renderChampionshipPageTieGroup('SEMIFINAL',semi,'Vencedores avançam à final · os 4 semifinalistas já estão garantidos na Série C na próxima temporada'),
        renderChampionshipPageTieGroup('REPESCAGEM',playoff,'Vencedores conquistam o acesso à Série C'),
      ].filter(Boolean).join('');
      return groups
        ?`<div class="championship-page-tie-groups">${groups}</div>`
        :'<div class="championship-page-empty">Sem confrontos nesta fase.</div>';
    }
    ties=sortChampionshipTiesUserFirst(ties);
    const list=ties.map(renderChampionshipPageTie).join('')||'<div class="championship-page-empty">Sem confrontos nesta fase.</div>';
    return wrapChampionshipPageTies(list);
  };
  renderChampionshipPage=()=>{
    const tableCard=$('.championship-page-table');
    const sub=$('#championshipPageSub');
    const title=$('#championshipPageTitle');
    const head=$('#championshipPageHead');
    const body=$('#leagueTable');
    const prevBtn=$('#championshipPagePrev');
    const nextBtn=$('#championshipPageNext');
    const menu=$('#championshipPagePickerMenu');
    const serieDModeTabs=$('#championshipPageSerieDMode');
    if(!body||!title)return;

    if(serieDModeTabs){
      const showSerieDModes=pageCompetition==='D'&&isSerieDKnockoutUiActive();
      serieDModeTabs.classList.toggle('hidden',!showSerieDModes);
      if(showSerieDModes){
        $$('#championshipPageSerieDMode [data-page-serie-d-mode]').forEach(button=>{
          const active=button.dataset.pageSerieDMode===pageSerieDMode;
          button.classList.toggle('is-active',active);
          button.setAttribute('aria-selected',active?'true':'false');
        });
      }
    }

    if(pageCompetition==='D'){
      const lastGroup=Math.max(0,serieDGroups.length-1);
      pageSerieDGroup=clamp(pageSerieDGroup,0,lastGroup);
      if(pageSerieDMode==='knockout'){
        if(!isSerieDKnockoutUiActive())pageSerieDMode='groups';
        else{
          const maxPhase=Math.max(1,serieDMaxGeneratedPhaseIndex());
          pageSerieDPhase=clamp(pageSerieDPhase||1,1,maxPhase);
        }
      }
    }else if(pageCompetition==='CUP'){
      pageCupPhase=clamp(pageCupPhase||cupCompetition.currentPhase||1,1,cupPhaseDefinitions.length);
    }

    const knockout=championshipPageIsKnockoutView();
    tableCard?.classList.toggle('is-knockout',knockout);

    if(menu){
      menu.innerHTML=PAGE_COMPETITION_OPTIONS.map(option=>`<button type="button" role="option" data-page-competition="${option.id}" class="${option.id===pageCompetition?'is-active':''}" aria-selected="${option.id===pageCompetition?'true':'false'}">${option.label}</button>`).join('');
    }

    let subText='COMPETIÇÃO NACIONAL';
    let titleText=`BRASILEIRÃO SÉRIE ${pageCompetition}`;
    let canPrev=false,canNext=false;

    if(pageCompetition==='CUP'){
      const definition=cupPhaseDefinitions.find(item=>item.index===pageCupPhase);
      const stage=cupCompetition.stages.find(item=>item.index===pageCupPhase);
      const status=stage?.completed?'FASE CONCLUÍDA':stage?'EM DISPUTA':'AGUARDANDO SORTEIO';
      subText=`COPA DO BRASIL · ${status}`;
      titleText=definition?.name||`Fase ${pageCupPhase}`;
      canPrev=pageCupPhase>1;
      canNext=pageCupPhase<cupPhaseDefinitions.length;
    }else if(pageCompetition==='D'&&pageSerieDMode==='knockout'){
      const definition=serieDKnockoutPhaseDefs.find(item=>item.index===pageSerieDPhase)||serieDKnockoutPhaseDefs[0];
      const meta=serieDKnockoutPhaseMeta(definition);
      const nextDef=serieDKnockoutPhaseDefs.find(item=>item.index===pageSerieDPhase+1);
      subText=`SÉRIE D · MATA-MATA · ${meta.status}`;
      titleText=definition.key==='semi'&&nationalCompetitions.D.knockout?.stages?.playoff?.length
        ?'SEMIFINAL E REPESCAGEM'
        :definition.name;
      canPrev=true;
      canNext=Boolean(nextDef&&serieDKnockoutPhaseMeta(nextDef).generated);
    }else if(pageCompetition==='D'){
      const lastGroup=Math.max(0,serieDGroups.length-1);
      subText='PRIMEIRA FASE · GRUPOS';
      titleText=`BRASILEIRÃO SÉRIE D · GRUPO A${pageSerieDGroup+1}`;
      canPrev=pageSerieDGroup>0;
      canNext=pageSerieDGroup<lastGroup||isSerieDKnockoutUiActive();
    }else{
      const competition=nationalCompetitions[pageCompetition];
      const clubsCount=pageCompetition==='C'
        ?serieCClubsForSeason(careerSeason)
        :(competition?.teams?.length||competition?.clubs||20);
      subText='COMPETIÇÃO NACIONAL';
      titleText=`BRASILEIRÃO SÉRIE ${pageCompetition}`;
      if(competition?.format)subText=`${clubsCount} CLUBES · PONTOS CORRIDOS`;
    }

    if(sub)sub.textContent=subText;
    title.textContent=titleText;
    if(prevBtn)prevBtn.disabled=!canPrev;
    if(nextBtn)nextBtn.disabled=!canNext;

    if(knockout){
      if(head)head.innerHTML='';
      body.innerHTML=renderChampionshipPageKnockoutBody();
    }else{
      if(head)head.innerHTML='<span>#</span><span>CLUBE</span><span>J</span><span>V</span><span>E</span><span>D</span><span>SG</span><span>PTS</span>';
      const rows=pageCompetition==='D'
        ?seriesDGroupRows(pageSerieDGroup)
        :[...(nationalCompetitions[pageCompetition]?.standings||[])].sort((a,b)=>b.points-a.points||b.wins-a.wins||b.goalDiff-a.goalDiff);
      const rowsHtml=rows.map((row,index)=>{
        const pos=index+1;
        const zone=pageCompetition==='D'
          ?(index<4?'promotion':'')
          :classificationZone(pageCompetition,index,rows.length);
        return `<div class="league-row ${zone} ${row.club===userClub?'highlight':''}" data-club="${row.club}" role="button" tabindex="0"><span>${pos}</span><span class="club-link">${row.club}</span><span>${row.played}</span><span>${row.wins}</span><span>${row.draws}</span><span>${row.losses}</span><span>${row.goalDiff>=0?'+':''}${row.goalDiff}</span><span>${row.points}</span></div>`;
      }).join('')||'<div class="championship-page-empty">Sem classificação disponível.</div>';
      const zoneLegend=pageCompetition==='A'
        ?'<div class="championship-page-zone-legend"><span><i class="relegation" aria-hidden="true"></i>Z4 · Rebaixamento</span></div>'
        :pageCompetition==='B'
          ?'<div class="championship-page-zone-legend"><span><i class="promotion" aria-hidden="true"></i>G4 · Acesso</span><span><i class="relegation" aria-hidden="true"></i>Z4 · Rebaixamento</span></div>'
          :pageCompetition==='C'
            ?`<div class="championship-page-zone-legend"><span><i class="promotion" aria-hidden="true"></i>G4 · Acesso</span><span><i class="relegation" aria-hidden="true"></i>Z${serieCRelegationZone} · Rebaixamento</span></div>`
            :pageCompetition==='D'
              ?`<div class="championship-page-zone-legend"><span><i class="promotion" aria-hidden="true"></i>4 primeiros · Avançam do grupo</span>${isSerieDKnockoutUiActive()&&pageSerieDGroup===Math.max(0,serieDGroups.length-1)?'<span>› Mata-mata disponível</span>':''}</div>`
              :'';
      body.innerHTML=rowsHtml+zoneLegend;
    }
    setChampionshipPagePickerOpen(false);
  };
  const selectChampionshipPageCompetition=competitionId=>{
    if(!PAGE_COMPETITION_OPTIONS.some(option=>option.id===competitionId))return;
    pageCompetition=competitionId;
    if(competitionId==='CUP')pageCupPhase=clamp(cupCompetition.currentPhase||1,1,cupPhaseDefinitions.length);
    if(competitionId==='D'){
      if(isSerieDKnockoutUiActive()&&currentRound>SERIE_D_GROUP_ROUNDS){
        pageSerieDMode='knockout';
        pageSerieDPhase=serieDPhaseIndexForRound(currentRound);
      }else{
        pageSerieDMode='groups';
        pageSerieDGroup=Math.max(0,userSerieDGroupIndex);
      }
    }
    setChampionshipPagePickerOpen(false);
    renderChampionshipPage();
  };
  // Mini-tabela do Dashboard: vai para a seção Campeonatos (não abre o modal).
  onClick('#openChampionship',()=>{
    selectChampionshipPageCompetition(userDivision);
    router.openView('table');
  });
  const stepChampionshipPageNav=step=>{
    if(pageCompetition==='CUP'){
      pageCupPhase=clamp(pageCupPhase+step,1,cupPhaseDefinitions.length);
    }else if(pageCompetition==='D'){
      const lastGroup=Math.max(0,serieDGroups.length-1);
      if(pageSerieDMode==='knockout'){
        if(step<0){
          if(pageSerieDPhase>1)pageSerieDPhase-=1;
          else{
            pageSerieDMode='groups';
            pageSerieDGroup=lastGroup;
          }
        }else{
          const nextDef=serieDKnockoutPhaseDefs.find(item=>item.index===pageSerieDPhase+1);
          if(nextDef&&serieDKnockoutPhaseMeta(nextDef).generated)pageSerieDPhase+=1;
        }
      }else if(step>0){
        if(pageSerieDGroup<lastGroup)pageSerieDGroup+=1;
        else if(isSerieDKnockoutUiActive()){
          pageSerieDMode='knockout';
          pageSerieDPhase=1;
        }
      }else{
        pageSerieDGroup=Math.max(0,pageSerieDGroup-1);
      }
    }else return;
    renderChampionshipPage();
  };
  onClick('#championshipPagePickerBtn',event=>{
    event.stopPropagation();
    setChampionshipPagePickerOpen(!pagePickerOpen);
  });
  onClick('#championshipPagePickerMenu',event=>{
    const option=event.target.closest('[data-page-competition]');
    if(!option)return;
    selectChampionshipPageCompetition(option.dataset.pageCompetition);
  });
  onClick('#championshipPageSerieDMode',event=>{
    const button=event.target.closest('[data-page-serie-d-mode]');
    if(!button||pageCompetition!=='D'||!isSerieDKnockoutUiActive())return;
    const mode=button.dataset.pageSerieDMode==='groups'?'groups':'knockout';
    if(mode===pageSerieDMode)return;
    pageSerieDMode=mode;
    if(mode==='knockout')pageSerieDPhase=serieDPhaseIndexForRound(currentRound);
    else pageSerieDGroup=Math.max(0,userSerieDGroupIndex);
    renderChampionshipPage();
  });
  onClick('#championshipPagePrev',()=>stepChampionshipPageNav(-1));
  onClick('#championshipPageNext',()=>stepChampionshipPageNav(1));
  const openCompetitionRulesModal=()=>{
    const rules=competitionRulesHtml(pageCompetition,careerSeason);
    const kicker=$('#competitionRulesKicker');
    const rulesTitle=$('#competitionRulesTitle');
    const rulesBody=$('#competitionRulesBody');
    if(kicker)kicker.textContent=rules.kicker;
    if(rulesTitle)rulesTitle.textContent=rules.title;
    if(rulesBody)rulesBody.innerHTML=rules.bodyHtml;
    $('#competitionRulesModal')?.classList.remove('hidden');
  };
  onClick('#championshipPageRulesBtn',()=>openCompetitionRulesModal());
  onClick('#closeCompetitionRules',()=>$('#competitionRulesModal')?.classList.add('hidden'));
  $('#competitionRulesModal')?.addEventListener('click',event=>{
    if(event.target===event.currentTarget)$('#competitionRulesModal').classList.add('hidden');
  });
  document.addEventListener('click',event=>{
    if(!pagePickerOpen)return;
    if(event.target.closest?.('#championshipPagePickerBtn')||event.target.closest?.('#championshipPagePickerMenu')||event.target.closest?.('.championship-page-picker'))return;
    setChampionshipPagePickerOpen(false);
  });
  window.addEventListener('resize',()=>{if(pagePickerOpen)placeChampionshipPagePickerMenu();});
  document.querySelector('main > .view')?.addEventListener('scroll',()=>{if(pagePickerOpen)placeChampionshipPagePickerMenu();},{passive:true});
  renderChampionshipPage();

  const resolveCupTieWinner=(games,aggregate)=>{
    const clubsInTie=[games[0].home,games[0].away],firstGoals=aggregate.get(clubsInTie[0])||0,secondGoals=aggregate.get(clubsInTie[1])||0;
    let winner=firstGoals>secondGoals?clubsInTie[0]:secondGoals>firstGoals?clubsInTie[1]:null;
    if(firstGoals===secondGoals){
      const involvesUser=games.some(isUserFixture);
      // Confronto do usuário: NÃO simular pênaltis — precisa ter sido jogado ao vivo
      winner=resolveKnockoutTieWinner(games,{
        pickWinner:cupPenaltyWinner,
        int,
        allowAutoShootout:!involvesUser,
      });
    }else games.forEach(clearStaleKnockoutShootout);
    if(winner)games.forEach(game=>{game.winner=winner;});
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
    const fixtures=Array.isArray(stage.fixtures)?stage.fixtures:[];
    if(!fixtures.length)return null;
    const ties=[...new Set(fixtures.map(game=>game.tieId).filter(Boolean))],winners=[];
    for(const tieId of ties){
      const winner=resolveCupTie(stage,tieId);
      if(winner===null)return null;
      winners.push(winner);
    }
    stage.winners=winners;stage.completed=true;
    if(stage.index===9){cupCompetition.champion=winners[0]||null;cupCompetition.currentPhase=9;}
    else{
      const entrants=nextCupEntrants(stage.index,winners);
      if(Array.isArray(entrants)&&entrants.length>=2){
        const nextStage=createCupStage(stage.index+1,entrants);
        notifyCupPhaseAdvance(stage,nextStage);
      }
    }
    onCupScheduleChanged();
    return winners;
  };
  const advanceCupComputerTies=stage=>{
    if(!stage||stage.completed)return false;
    const fixtures=Array.isArray(stage.fixtures)?stage.fixtures:[];
    if(!fixtures.length)return false;
    let changed=false;
    [...new Set(fixtures.map(game=>game.tieId).filter(Boolean))].forEach(tieId=>{
      const games=cupTieGames(stage,tieId);
      if(games.some(game=>isUserFixture(game)&&!game.completed))return;
      games.forEach(game=>{if(simulateCupComputerGame(game))changed=true;});
      if(games.length&&games.every(game=>game.completed)){
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
    if(!date)return false;
    let changed=false;
    let stage=cupCompetition.stages.find(item=>!item.completed);
    while(stage){
      const fixtures=Array.isArray(stage.fixtures)?stage.fixtures:[];
      if(!fixtures.length)break;
      const latest=Math.max(...fixtures.map(game=>new Date(game.date||0).getTime()));
      const stageDue=latest<=date.getTime();
      if(!stageDue)break;
      if(advanceCupComputerTies(stage))changed=true;
      if(stagePendingUserFixtures(stage))break;
      if(!stage.completed)break;
      stage=cupCompetition.stages.find(item=>!item.completed);
    }
    if(changed)playerHistory.persist();
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
    recordGameLeaders(liveMatchGame);
    playerHistory.persist();
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
    if(liveMatchGame&&Number.isFinite(Number(liveMatchGame.homeGoals))&&Number.isFinite(Number(liveMatchGame.awayGoals))){
      const fillRate=resolveMatchAttendance(liveMatchGame)?.fillRate??liveMatchGame.fillRate??null;
      applyClubStatusAfterRound([liveMatchGame],fillRate);
    }
    if(!availabilityCommitted)commitLiveAvailability();
    if(liveMatchGame){
      const cupParticipants=new Set([liveMatchGame.home,liveMatchGame.away].filter(Boolean));
      serveCompetitionSuspensions(clubs,cupParticipants,'COPA',currentRound);
    }
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
    clearLiveMatchPersist();
    if(evaluateManagerJobRisk())return;
    if(seasonComplete()&&tryPrepareSeasonTransition())return;
    $$('.nav').find(button=>button.dataset.view==='dashboard')?.click();
  };
  if(new URLSearchParams(location.search).has('engineTest')||new URLSearchParams(location.search).has('cupAudit')){
    window.__matchdayEngineBenchmark=(count=1000)=>{
      const sample=Math.max(1,Math.min(10000,Number(count)||1000)),fixtures=futureMatches.length?futureMatches:Object.values(nationalCompetitions[userDivision]?.fixtures||{})[0]||[],totals={matches:sample,goals:0,shots:0,onTarget:0,draws:0,scoreless:0,overFour:0,homeWins:0,awayWins:0,maxGoals:0};
      for(let index=0;index<sample;index++){const fixture=fixtures[index%fixtures.length],result=simulateRoundMatch(fixture.home,fixture.away,fixture),goals=result.homeGoals+result.awayGoals;totals.goals+=goals;totals.shots+=result.data.homeShots+result.data.awayShots;totals.onTarget+=result.data.homeOnTarget+result.data.awayOnTarget;totals.draws+=result.homeGoals===result.awayGoals?1:0;totals.scoreless+=goals===0?1:0;totals.overFour+=goals>=5?1:0;totals.homeWins+=result.homeGoals>result.awayGoals?1:0;totals.awayWins+=result.awayGoals>result.homeGoals?1:0;totals.maxGoals=Math.max(totals.maxGoals,goals);}
      return {...totals,goalsPerMatch:Number((totals.goals/sample).toFixed(3)),shotsPerMatch:Number((totals.shots/sample).toFixed(3)),onTargetPerMatch:Number((totals.onTarget/sample).toFixed(3)),drawRate:Number((totals.draws/sample*100).toFixed(1)),scorelessRate:Number((totals.scoreless/sample*100).toFixed(1)),overFourRate:Number((totals.overFour/sample*100).toFixed(1)),homeWinRate:Number((totals.homeWins/sample*100).toFixed(1)),awayWinRate:Number((totals.awayWins/sample*100).toFixed(1))};
    };
    window.__matchdayEngineExports={clubs,simulateRoundMatch,savedNewGame:!!savedNewGame,userDivision,createInjuryRecord,normalizeInjury,injuryCatalog,calculateEventInjuryChance,injuryMechanismFromEvent,workloadRisk,recoveryRisk,recordPlayerMatchWorkload,ensureWorkload,injuryInRestrictedPhase,matchPlayerStat,playerRehabMaxMinutes,beginRestrictedReturn,advanceRestrictedRehab,clearInjuryFully,clubMedicalQuality,medicalRecoveryModifier,medicalPreventionModifier,resolveInjuryTreatment,summarizeMatchInjuries,engineTuning,buildSimLineup,engineFoulRisk,engineBlowoutDamp};
  }
  // A tabela da rodada respeita exatamente os confrontos definidos no calendário.
  const simulateRoundResults=(force=false)=>{
    if(roundResults&&!force) return roundResults;
    roundResults=currentRoundFixtures().map(game=>{
      if(!isUserFixture(game)){
        const result=simulateRoundMatch(game.home,game.away,game);
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
    const key=`${division}-${round}`;if(!roundPreviewResults[key])roundPreviewResults[key]=(nationalCompetitions[division]?.fixtures?.[round-1]||[]).map(game=>simulateRoundMatch(game.home,game.away,game));
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
  onClick('#closeRoundResults',()=>{
    $('#roundResultsModal').classList.add('hidden');
    // Pós-jogo pendente: volta ao resumo; senão só atualiza o CTA do dashboard.
    if(matchStarted&&matchFinished&&!roundCommitted&&liveMatchGame)reopenMatchWindow();
    renderUserMatchPresentation();
  });
  let persistSeasonTimer=null;
  let saveQuotaWarned=false;
  let latestLiveMatchSnapshot=null;
  let managerJobCrisis=(validSavedSeason&&savedSeason.managerJobCrisis?.status?{...savedSeason.managerJobCrisis,offers:Array.isArray(savedSeason.managerJobCrisis.offers)?savedSeason.managerJobCrisis.offers.map(item=>({...item})):[]}:null)||null;
  let pendingDivisionTeams=(validSavedSeason&&savedSeason.pendingDivisionTeams?.A&&savedSeason.pendingDivisionTeams?.B&&savedSeason.pendingDivisionTeams?.C&&savedSeason.pendingDivisionTeams?.D)
    ?normalizeDivisionTeamsSerieC({
      A:[...savedSeason.pendingDivisionTeams.A],
      B:[...savedSeason.pendingDivisionTeams.B],
      C:[...savedSeason.pendingDivisionTeams.C],
      D:[...savedSeason.pendingDivisionTeams.D],
    },{season:careerSeason+1,userClub,fillPool:generatedClubPool,dTarget:SERIE_D_CLUBS}).divisionTeams
    :null;
  let pendingUserDivision=(validSavedSeason&&pendingDivisionTeams&&savedSeason.pendingUserDivision)
    ?savedSeason.pendingUserDivision
    :userDivision;
  let seasonTransitionPrepared=!!(validSavedSeason&&(savedSeason.seasonTransitionPrepared||(Array.isArray(savedSeason.userBudgetLedger)&&savedSeason.userBudgetLedger.some(entry=>entry?.reason==='season_prize'))));
  let nonHumanSimRunning=false,idleSeasonWasSimulated=false;
  const writeSeasonSave=(opts={})=>{
    if(!savedNewGame)return false;
    const activeUserClub=opts.userClub||userClub;
    const activeDivision=opts.userDivision||userDivision;
    const activeGoal=opts.seasonGoal!==undefined?opts.seasonGoal:seasonGoal;
    const activeGoalResult=opts.seasonGoalResult!==undefined?opts.seasonGoalResult:seasonGoalResult;
    const activeCrisis=opts.managerJobCrisis!==undefined?opts.managerJobCrisis:managerJobCrisis;
    pruneClubMemory(clubs,nationalRankingEntries);
    const standings=Object.fromEntries(Object.entries(nationalCompetitions).map(([division,competition])=>[division,competition.standings.map(row=>({...row}))]));
    const fatigue=slimFatigueSnapshot(clubs);
    const compactCompetitions=compactCompetitionHistories(competitionRoundHistory,activeUserClub);
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
        fixtures:stage.fixtures.map(game=>compactCupFixture(game,activeUserClub)),
      })),
    };
    const availability=slimAvailabilitySnapshot(clubs,activeUserClub);
    const clubMedical=Object.fromEntries(Object.entries(clubs).map(([clubName,club])=>[clubName,{medicalInvestment:club.medicalInvestment??0,preventionProgram:club.preventionProgram??0,pitchCondition:club.pitchCondition||'good',pitchLevel:club.pitchLevel??null,stadiumStructure:club.stadiumStructure??null}]));
    const userClubState=clubs[activeUserClub];
    if(!userClubState)return false;
    ensureStadium(userClubState,activeDivision);
    const userStadium={
      name:userClubState.stadiumName||'Estádio Solar',
      capacity:userClubState.stadiumCapacity,
      capacityLevel:userClubState.stadiumCapacityLevel??0,
      structure:userClubState.stadiumStructure??0,
      pitchLevel:userClubState.pitchLevel??0,
      pitchCondition:userClubState.pitchCondition||'average',
      ticketPrices:{national:userClubState.ticketPrices?.national,cups:userClubState.ticketPrices?.cups},
    };
    const userSponsors=!opts.resetUserEconomy&&userClubState.sponsors?{
      season:userClubState.sponsors.season,
      division:userClubState.sponsors.division,
      total:userClubState.sponsors.total,
      credited:!!userClubState.sponsors.credited,
      installments:Number(userClubState.sponsors.installments)|| (activeDivision==='D'?22:38),
      paidAmount:Number(userClubState.sponsors.paidAmount)||0,
      paidInstallments:Number(userClubState.sponsors.paidInstallments)||0,
      lastInstallmentRound:Number.isFinite(Number(userClubState.sponsors.lastInstallmentRound))
        ?Number(userClubState.sponsors.lastInstallmentRound)
        :null,
      pressure:Number.isFinite(Number(userClubState.sponsors.pressure))?Number(userClubState.sponsors.pressure):null,
      master:userClubState.sponsors.master?{...userClubState.sponsors.master}:null,
      secondaries:Array.isArray(userClubState.sponsors.secondaries)?userClubState.sponsors.secondaries.map(item=>({...item})):[],
    }:null;
    const userTvRights=!opts.resetUserEconomy&&userClubState.tvRights&&Number(userClubState.tvRights.total)>0?{
      season:userClubState.tvRights.season,
      division:userClubState.tvRights.division,
      total:Number(userClubState.tvRights.total),
      credited:!!userClubState.tvRights.credited,
      installments:Number(userClubState.tvRights.installments)|| (activeDivision==='D'?22:38),
      paidAmount:Number(userClubState.tvRights.paidAmount)||0,
      paidInstallments:Number(userClubState.tvRights.paidInstallments)||0,
      lastInstallmentRound:Number.isFinite(Number(userClubState.tvRights.lastInstallmentRound))
        ?Number(userClubState.tvRights.lastInstallmentRound)
        :null,
    }:null;
    const rankingEntries=Object.fromEntries(Object.entries(nationalRankingEntries).map(([clubName,entry])=>[clubName,{
      ...entry,
      titles:pruneRankingTitles(entry.titles),
    }]));
    const statusSnapshot=opts.userClubStatus&&typeof opts.userClubStatus==='object'
      ?{
        environment:opts.userClubStatus.environment,
        support:opts.userClubStatus.support,
        board:opts.userClubStatus.board,
        finances:opts.userClubStatus.finances,
        budget:Number.isFinite(Number(opts.userClubStatus.budget))?Number(opts.userClubStatus.budget):getBalance(userClubState),
      }
      :{
        environment:userClubState.environment,
        support:userClubState.support,
        board:userClubState.board,
        finances:userClubState.finances,
        budget:getBalance(userClubState),
      };
    const seasonBudget=Number.isFinite(Number(opts.userBudget))?Number(opts.userBudget):statusSnapshot.budget;
    const seasonLedger=opts.resetUserEconomy
      ?[]
      :Array.isArray(userClubState?.budgetLedger)?userClubState.budgetLedger.map(entry=>({...entry})):[];
    const savedMessages=messages.getMessages()
      .slice(0,MEMORY_LIMITS.seasonMessages)
      .map(message=>{
        const slim={...message};
        // Corpo longo de ofertas/relatórios: mantém o essencial.
        if(typeof slim.body==='string'&&slim.body.length>600)slim.body=`${slim.body.slice(0,600)}…`;
        return slim;
      });
    const transferDealsRaw=FEATURES.transfers&&transfersEngine?.snapshotSeasonDeals
      ?transfersEngine.snapshotSeasonDeals()
      :(validSavedSeason&&Array.isArray(savedSeason?.seasonTransferDeals)
        ?savedSeason.seasonTransferDeals.map(item=>({...item}))
        :[]);
    const transferOffersRaw=FEATURES.transfers&&transfersEngine?.snapshotPendingOffers
      ?transfersEngine.snapshotPendingOffers()
      :(validSavedSeason&&Array.isArray(savedSeason?.pendingTransferOffers)
        ?savedSeason.pendingTransferOffers.map(item=>({...item}))
        :[]);
    const seasonPayload={
      seed:savedNewGame.seed,
      userClubName:activeUserClub,
      currentRound,
      careerCalendarDate:calendarKey(careerCalendarDate),
      trainingRules:{...trainingRules},
      standings,
      fatigue,
      availability,
      clubMedical,
      userBudget:seasonBudget,
      userBudgetLedger:seasonLedger,
      userStaffContract:userClubState.staffContract&&Number(userClubState.staffContract.amountPerRound)>0?{
        managerId:userClubState.staffContract.managerId||null,
        amountPerRound:Number(userClubState.staffContract.amountPerRound),
        season:userClubState.staffContract.season??null,
        score:Number.isFinite(Number(userClubState.staffContract.score))?Number(userClubState.staffContract.score):null,
        at:userClubState.staffContract.at||null,
      }:null,
      userClubStatus:statusSnapshot,
      userStadium,
      userSponsors,
      pendingSponsorChoice:!!pendingSponsorChoice,
      pendingSponsorOffers:pendingSponsorChoice&&pendingSponsorOffers?{
        division:pendingSponsorOffers.division||activeDivision,
        master:Array.isArray(pendingSponsorOffers.master)?pendingSponsorOffers.master.map(item=>({...item})):[],
        secondaries:Array.isArray(pendingSponsorOffers.secondaries)?pendingSponsorOffers.secondaries.map(item=>({...item})):[],
        reshufflesUsed:Number(pendingSponsorOffers.reshufflesUsed)||0,
      }:null,
      userTvRights,
      userSeasonCashflow:!opts.resetUserEconomy&&userClubState.seasonCashflow?{
        season:userClubState.seasonCashflow.season??null,
        inflows:{...(userClubState.seasonCashflow.inflows||{})},
        outflows:{...(userClubState.seasonCashflow.outflows||{})},
        movementCount:Number(userClubState.seasonCashflow.movementCount)||0,
      }:null,
      userSeasonCrowds:opts.resetUserEconomy?[]:userSeasonCrowds.map(entry=>({...entry})),
      userTactics:{...tactics.getTacticalValues()},
      userFormation:formation,
      userLineupOrder:clubs[activeUserClub]?.roster?.map(player=>player.name)||[],
      careerMessages:savedMessages,
      pendingTransferOffers:transferOffersRaw,
      seasonTransferDeals:Array.isArray(transferDealsRaw)?transferDealsRaw.slice(-MEMORY_LIMITS.seasonTransferDeals):[],
      scorers:slimLeaderboard(allScorers,'goals'),
      assistants:slimLeaderboard(allAssistants,'assists'),
      serieDGroups,
      dFixtures:slimSerieDFixturesForSave(nationalCompetitions.D.fixtures),
      dKnockout:nationalCompetitions.D.knockout,
      cupCompetition:compactCup,
      nationalRanking:{formulaVersion:nationalRankingFormulaVersion,entries:rankingEntries,finalizedSeasons:[...nationalRankingFinalizedSeasons]},
      managerRanking:(()=>{
        managerRanking.syncSeasonPointsFromClubs(managerRankingHelpers().getClubSeasonPoints);
        return managerRanking.snapshot();
      })(),
      seasonGoal:activeGoal?{...activeGoal,evaluate:activeGoal.evaluate?{...activeGoal.evaluate}:null}:null,
      seasonGoalResult:activeGoalResult?{...activeGoalResult}:null,
      managerJobCrisis:activeCrisis?{
        status:activeCrisis.status,
        reason:activeCrisis.reason||null,
        message:activeCrisis.message||null,
        board:activeCrisis.board,
        finances:activeCrisis.finances,
        boardCrisisStreak:Math.max(0,Number(activeCrisis.boardCrisisStreak)||0),
        warnedBoard:!!activeCrisis.warnedBoard,
        warnedFinances:!!activeCrisis.warnedFinances,
        warnedBoardStreak:!!activeCrisis.warnedBoardStreak,
        offers:Array.isArray(activeCrisis.offers)?activeCrisis.offers.map(item=>({...item})):[],
      }:null,
      seasonRoundHistory:compactRoundHistory(seasonRoundHistory,activeUserClub),
      competitionRoundHistory:compactCompetitions,
      seasonTransitionPrepared:!!seasonTransitionPrepared,
      playerDevelopment:{
        season:playerDevelopment?.season??careerSeason,
        pulsesDone:Array.isArray(playerDevelopment?.pulsesDone)?[...playerDevelopment.pulsesDone]:[],
        yearDeltaByPlayer:{...(playerDevelopment?.yearDeltaByPlayer||{})},
        // snapByPlayer é regenerável — não inchamos o save a cada rodada.
        snapByPlayer:{},
      },
      pendingDivisionTeams:pendingDivisionTeams?{
        A:[...(pendingDivisionTeams.A||[])],
        B:[...(pendingDivisionTeams.B||[])],
        C:[...(pendingDivisionTeams.C||[])],
        D:[...(pendingDivisionTeams.D||[])],
      }:null,
      pendingUserDivision:pendingDivisionTeams?pendingUserDivision:null,
      activeLiveMatch:(matchStarted&&liveMatchGame&&!roundCommitted)?{
        fixtureId:fixtureIdFromGame(liveMatchGame),
        home:liveMatchGame.home,
        away:liveMatchGame.away,
        competition:liveMatchGame.competition||null,
        round:liveMatchGame.round??currentRound,
      }:null,
      // Snapshot AO VIVO fica só em matchday-live-match (evita duplicar no season).
      liveMatchSnapshot:null,
      updatedAt:new Date().toISOString(),
    };
    // Persiste AO VIVO na chave própria (não embute no season).
    if(matchStarted&&liveMatchGame&&!roundCommitted){
      const snap=latestLiveMatchSnapshot||buildLiveMatchSnapshot({
        seed:savedNewGame.seed,
        liveMatchGame,
        minute,home,away,pauses,halftimeShown,matchStarted,matchFinished,preMatchPreparation,
        activePreparationTitle,substitutions,awaySubstitutions,awaySubWindows,substitutedOut,
        disciplineEvents,availabilityCommitted,roundResultMessagePushed,stats,cards,goals,matchFactors,
        liveInjuries,liveDeferredInjuries,liveOpeningLineup,liveMinutesPlayed,matchDiscipline,
        liveVolumeSamples,liveVolumePrev,liveVolumePulse,liveVolumeIncidents,postMatchMedicalQueue,
        shootoutState,pendingPenalty,preMatchTacticSnapshot,
        stoppageFirst,stoppageSecond,stoppageElapsed,stoppageActive,stoppageHalfSnap,
        userFormation:formation,
        userLineupOrder:squad.map(player=>player.name),
        awayFormation:matchClub()?.formation,
        awayLineupOrder:matchClub()?.roster?.map(player=>player.name)||[],
        liveClockSeconds:matchLiveUi.getLiveClockSeconds?.()||0,
        timelineHtml:timeline?.innerHTML||'',
        matchStatusText:$('#matchStatus')?.textContent||'',
        ui:{
          pauseOpen:!!$('#pausePanel')&&!$('#pausePanel').classList.contains('hidden'),
          statsOpen:!!$('#stats')&&!$('#stats').classList.contains('hidden'),
          penaltyOpen:typeof isPenaltyDuelOpen==='function'?isPenaltyDuelOpen():!!$('#penaltyChoice')&&!$('#penaltyChoice').classList.contains('hidden'),
          shootoutOpen:!!$('#shootoutPanel')&&!$('#shootoutPanel').classList.contains('hidden'),
        },
      });
      if(snap){
        latestLiveMatchSnapshot=snap;
        saveLiveMatchSave(snap);
      }
    }
    let ok=writeJson(SAVE_KEYS.season,seasonPayload);
    // Cota: corta históricos nacionais (placar basta) e tenta de novo.
    if(!ok){
      try{
        localStorage.removeItem(SAVE_KEYS.playerHistory);
        localStorage.removeItem(SAVE_KEYS.liveMatch);
      }catch{/* ignore */}
      seasonPayload.competitionRoundHistory=Object.fromEntries(
        Object.entries(compactCompetitions).map(([division,history])=>[
          division,
          (history||[]).map(item=>({
            round:item.round,
            games:(item.games||[]).map(game=>({
              home:game.home,away:game.away,homeGoals:game.homeGoals,awayGoals:game.awayGoals,
              ...(game.penalties?{penalties:game.penalties}:{}),
              ...(game.winner?{winner:game.winner}:{}),
            })),
            userStats:null,
          })),
        ]),
      );
      seasonPayload.careerMessages=savedMessages.slice(0,40);
      seasonPayload.seasonTransferDeals=[];
      seasonPayload.userSeasonCrowds=[];
      ok=writeJson(SAVE_KEYS.season,seasonPayload);
    }
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
  transfersUi?.setPersist?.(persistSeason);
  if(validSavedSeason&&(savedSeason.currentRound!==currentRound||knockoutShootoutSanitized))persistSeason(true);
  let skipPersistOnUnload=false;
  window.addEventListener('beforeunload',()=>{
    // Novo Jogo marca skip one-shot para não regravar a carreira antiga na saída.
    let skipForNewGame=false;
    try{
      if(sessionStorage.getItem('matchday-skip-persist-once')){
        sessionStorage.removeItem('matchday-skip-persist-once');
        skipForNewGame=true;
      }
    }catch{/* ignore */}
    if(skipPersistOnUnload||skipForNewGame)return;
    try{flushLiveMatchPersist();}catch{/* ignore */}
    if(savedNewGame)persistSeason(true);
  });
  advanceCalendarWeek=()=>{
    if(pendingSponsorChoice){openSponsorPickerIfPending();return null;}
    if(!savedNewGame||isUserSeasonIdle())return null;
    if(seasonFullyComplete())return null;
    ensureCalendarMatchConsistency();
    rebuildCalendarGames();
    if(isOnPendingMatchDay()){
      pushMatchDayBrief(userMatchOnDate(careerCalendarDate)||nextPendingUserEntry()?.game);
      refreshSeasonPresentation();
      renderCalendar();
      return {stopped:'match'};
    }
    // Com janela aberta: mesma rotina do Dashboard (semana / Deadline Day + tick IA + relatório).
    const transferPhase=transfersEngine?.getWindowPhase?.()||{};
    if(transferPhase.active){
      const result=advanceTransferCalendar();
      // Relatório / propostas: advanceTransferCalendar já apresenta na tela.
      renderCalendar();
      if(!result?.ok)return {stopped:result?.reason||'failed',days:0,transfer:true,result};
      return {
        stopped:result.stoppedMatch?'match':null,
        game:result.stoppedMatch||null,
        days:result.days||0,
        transfer:true,
        mode:result.mode,
        report:result.report||null,
      };
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
  advanceCalendarWeekFn=advanceCalendarWeek;
  const advanceToMatchDay=()=>{
    if(pendingSponsorChoice){openSponsorPickerIfPending();return null;}
    if(!savedNewGame||isUserSeasonIdle())return null;
    if(seasonFullyComplete())return null;
    ensureCalendarMatchConsistency();
    rebuildCalendarGames();
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
  const recordGameLeaders=game=>{
    if(!game?.home||!game?.away)return;
    [game.home,game.away].forEach(clubName=>{
      const roster=clubs[clubName]?.roster;
      if(!Array.isArray(roster))return;
      roster.slice(0,11).forEach(player=>{
        const scorer=allScorers.find(item=>item.club===clubName&&item.name===player.name),assistant=allAssistants.find(item=>item.club===clubName&&item.name===player.name);
        if(scorer)scorer.games++;
        if(assistant)assistant.games++;
      });
    });
    if(game.goals)[['home',game.home],['away',game.away]].forEach(([side,clubName])=>{
      const club=clubs[clubName];
      if(!club?.roster)return;
      (game.goals[side]||[]).forEach(goal=>{
        if(goal?.type==='own')return;
        const started=name=>club.roster.slice(0,11).some(player=>player.name===name);
        let scorer=allScorers.find(item=>item.club===clubName&&item.name===goal.name);
        if(!scorer){
          const player=club.roster.find(item=>item.name===goal.name);
          scorer={name:goal.name,club:clubName,division:club.division,games:1,goals:0,tieValue:(player?.finishing||50)+(player?.heading||50)*.2};
          allScorers.push(scorer);
        }else if(!started(goal.name))scorer.games++;
        scorer.goals++;
        if(goal.assist){
          let assistant=allAssistants.find(item=>item.club===clubName&&item.name===goal.assist);
          if(!assistant){
            const player=club.roster.find(item=>item.name===goal.assist);
            assistant={name:goal.assist,club:clubName,division:club.division,games:1,assists:0,tieValue:(player?.passing||50)+(player?.playmaking||50)};
            allAssistants.push(assistant);
          }else if(!started(goal.assist))assistant.games++;
          assistant.assists++;
        }
      });
    });
    allScorers.sort((a,b)=>b.goals-a.goals||b.tieValue-a.tieValue||a.games-b.games);allAssistants.sort((a,b)=>b.assists-a.assists||b.tieValue-a.tieValue||a.games-b.games);
    recordPlayerHistoryMatch(game,{persist:false,round:game.round??currentRound,competition:game.competition,leg:game.leg});
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
  const simulateNationalRound=()=>{
    Object.keys(nationalCompetitions).filter(division=>division!==userDivision).forEach(division=>{
      const competition=nationalCompetitions[division];
      const fixtures=(Array.isArray(competition?.fixtures)?competition.fixtures:[])[currentRound-1]||[];
      if(!fixtures.length)return;
      const previewKey=`${division}-${currentRound}`;
      const playable=fixtures.filter(game=>game?.home&&game?.away&&clubs[game.home]&&clubs[game.away]);
      const results=roundPreviewResults[previewKey]||playable.map(game=>simulateRoundMatch(game.home,game.away,game));
      results.forEach(recordGameLeaders);
      if(division!=='D'||currentRound<=10)results.forEach(game=>applySecondaryResult(game,competition));
      competition.standings.sort((a,b)=>b.points-a.points||b.goalDiff-a.goalDiff||b.wins-a.wins);
      competition.standings.forEach((row,index)=>{if(clubs[row.club])clubs[row.club].position=index+1;});
      if(!competitionRoundHistory[division])competitionRoundHistory[division]=[];
      competitionRoundHistory[division].push({round:currentRound,games:results.map(game=>compactMatchResult(game,{keepData:false}))});
    });
    playerHistory.persist();
  };
  const dKnockout=nationalCompetitions.D.knockout;
  dKnockout.stages=dKnockout.stages||{};
  // Saves antigos usavam `promoted: 6` (nº de vagas). A lista de clubes promovidos é sempre array.
  if(typeof dKnockout.promoted==='number'){
    dKnockout.promotionSlots=dKnockout.promotionSlots||dKnockout.promoted;
    dKnockout.promoted=[];
  }else if(!Array.isArray(dKnockout.promoted)){
    dKnockout.promoted=[];
  }
  if(!Number.isFinite(Number(dKnockout.promotionSlots)))dKnockout.promotionSlots=SERIE_D_PROMOTIONS;
  const serieDPromotedClubs=()=>Array.isArray(dKnockout.promoted)?dKnockout.promoted:[];
  const dRoundResults=round=>{
    const history=userDivision==='D'?seasonRoundHistory:(competitionRoundHistory.D||[]);
    return (Array.isArray(history)?history:[]).find(item=>item.round===round)?.games||[];
  };
  const makeTies=clubsList=>{
    if(!Array.isArray(clubsList)||clubsList.length<2)return [];
    return Array.from({length:Math.floor(clubsList.length/2)},(_,index)=>({home:clubsList[index*2],away:clubsList[index*2+1]}));
  };
  const installTieRounds=(ties,startRound,extraTies=[])=>{
    const all=[...(Array.isArray(ties)?ties:[]),...(Array.isArray(extraTies)?extraTies:[])].filter(tie=>tie?.home&&tie?.away);
    if(!Array.isArray(nationalCompetitions.D.fixtures))nationalCompetitions.D.fixtures=[];
    nationalCompetitions.D.fixtures[startRound-1]=all.map((tie,tieIndex)=>({home:tie.home,away:tie.away,round:startRound,competition:KNOCKOUT_COMPETITIONS.SERIE_D,tieId:`d-ko-r${startRound}-t${tieIndex}`,leg:'IDA',knockoutRound:startRound,twoLegged:true,completed:false}));
    nationalCompetitions.D.fixtures[startRound]=all.map((tie,tieIndex)=>({home:tie.away,away:tie.home,round:startRound+1,competition:KNOCKOUT_COMPETITIONS.SERIE_D,tieId:`d-ko-r${startRound}-t${tieIndex}`,leg:'VOLTA',knockoutRound:startRound,twoLegged:true,completed:false}));
  };
  const getSerieDTieGames=game=>{
    if(!game?.tieId)return [];
    const rounds=Array.isArray(nationalCompetitions.D.fixtures)?nationalCompetitions.D.fixtures:[];
    return rounds.filter(Array.isArray).flat().filter(item=>item.tieId===game.tieId).sort((a,b)=>(a.leg==='IDA'?0:1)-(b.leg==='IDA'?0:1));
  };
  const mergeSerieDTieResults=(games,startRound)=>{const historyGames=[...dRoundResults(startRound),...dRoundResults(startRound+1)];return games.map(fixture=>{const played=historyGames.find(item=>item.home===fixture.home&&item.away===fixture.away);if(!played)return {...fixture};return {...fixture,...played,completed:true,penalties:played.penalties||fixture.penalties,shootoutWinner:played.shootoutWinner||fixture.shootoutWinner,shootoutPenalties:played.shootoutPenalties||fixture.shootoutPenalties};});};
  const getKnockoutTieGames=game=>{if(!game)return[];if(game.competition===KNOCKOUT_COMPETITIONS.COPA){const stage=cupCompetition.stages.find(item=>item.fixtures.includes(game));return stage?cupTieGames(stage,game.tieId):[];}if(isKnockoutShootoutCompetition(game))return getSerieDTieGames(game);return [];};
  /** Grava shootout da cópia resolvida de volta nas fixtures oficiais da Série D. */
  const persistSerieDTieShootout=games=>{
    const deciding=games?.[games.length-1];
    if(!deciding?.shootoutWinner)return;
    (Array.isArray(nationalCompetitions.D?.fixtures)?nationalCompetitions.D.fixtures:[])
      .filter(Array.isArray).flat().forEach(fixture=>{
      if(!sameKnockoutFixture(fixture,deciding))return;
      fixture.shootoutWinner=deciding.shootoutWinner;
      fixture.shootoutPenalties=deciding.shootoutPenalties||deciding.penalties;
      fixture.penalties=fixture.shootoutPenalties;
      fixture.winner=deciding.shootoutWinner;
    });
    const histRounds=[deciding.knockoutRound,deciding.round,(deciding.knockoutRound||0)+1].filter(Boolean);
    histRounds.forEach(round=>{
      const history=userDivision==='D'?seasonRoundHistory:(competitionRoundHistory.D||[]);
      const entry=(Array.isArray(history)?history:[]).find(item=>item.round===round);
      entry?.games?.forEach(game=>{
        if(!sameKnockoutFixture(game,deciding))return;
        game.shootoutWinner=deciding.shootoutWinner;
        game.shootoutPenalties=deciding.shootoutPenalties||deciding.penalties;
        game.penalties=game.shootoutPenalties;
        game.winner=deciding.shootoutWinner;
      });
    });
  };
  const resolveTies=(ties,startRound)=>{
    if(!Array.isArray(ties)||!ties.length)return null;
    const dFixtures=Array.isArray(nationalCompetitions.D?.fixtures)?nationalCompetitions.D.fixtures:[];
    const idaFixtures=dFixtures[startRound-1]||[];
    const winners=[],losers=[];
    for(let tieIndex=0;tieIndex<ties.length;tieIndex++){
      const tie=ties[tieIndex];
      if(!tie?.home||!tie?.away)return null;
      const tieId=`d-ko-r${startRound}-t${tieIndex}`;
      const linked=getSerieDTieGames({tieId});
      const raw=linked.length
        ?linked
        :[idaFixtures[tieIndex],(dFixtures[startRound]||[])[tieIndex]].filter(Boolean);
      const games=mergeSerieDTieResults(raw,startRound);
      if(!games.length||games.some(game=>game.homeGoals==null&&!game.completed))return null;
      const involvesUser=games.some(isUserFixture);
      // Usuário no confronto + empate no agregado → exige pênaltis jogados (não simula)
      if(involvesUser&&knockoutTieNeedsPlayedShootout(games))return null;
      const winner=resolveKnockoutTieWinner(games,{
        pickWinner:cupPenaltyWinner,
        int,
        allowAutoShootout:!involvesUser,
      });
      if(!winner)return null;
      persistSerieDTieShootout(games);
      winners.push(winner);
      losers.push(winner===tie.home?tie.away:tie.home);
    }
    return{winners,losers};
  };
  const updateSeriesDKnockout=completedRound=>{
    if(completedRound===10&&!dKnockout.stages.second){
      const qualified=serieDGroups.map(group=>(group||[])
        .map(name=>nationalCompetitions.D.standings.find(row=>row.club===name))
        .filter(Boolean)
        .sort((a,b)=>b.points-a.points||b.wins-a.wins||b.goalDiff-a.goalDiff)
        .slice(0,4)
        .map(row=>row.club));
      const ties=[];
      for(let group=0;group<16;group+=2){
        const left=qualified[group]||[],right=qualified[group+1]||[];
        if(left.length<4||right.length<4)continue;
        ties.push({home:left[0],away:right[3]},{home:left[1],away:right[2]},{home:left[2],away:right[1]},{home:left[3],away:right[0]});
      }
      if(ties.length){
        dKnockout.stages.second=ties;
        installTieRounds(ties,11);
        notifySerieDKnockoutPhase(11,'2ª fase eliminatória');
      }
    }
    if(completedRound===12&&!dKnockout.stages.third){const resolved=resolveTies(dKnockout.stages.second,11);if(!resolved)return;dKnockout.stages.third=makeTies(resolved.winners);installTieRounds(dKnockout.stages.third,13);notifySerieDKnockoutPhase(13,'3ª fase eliminatória');}
    if(completedRound===14&&!dKnockout.stages.round16){const resolved=resolveTies(dKnockout.stages.third,13);if(!resolved)return;dKnockout.stages.round16=makeTies(resolved.winners);installTieRounds(dKnockout.stages.round16,15);notifySerieDKnockoutPhase(15,'Oitavas de final');}
    if(completedRound===16&&!dKnockout.stages.quarter){const resolved=resolveTies(dKnockout.stages.round16,15);if(!resolved)return;dKnockout.stages.quarter=makeTies(resolved.winners);installTieRounds(dKnockout.stages.quarter,17);notifySerieDKnockoutPhase(17,'Quartas de final');}
    if(completedRound===18&&!dKnockout.stages.semi){const resolved=resolveTies(dKnockout.stages.quarter,17);if(!resolved)return;dKnockout.promoted=[...resolved.winners];dKnockout.stages.semi=makeTies(resolved.winners);dKnockout.stages.playoff=makeTies(resolved.losers);installTieRounds(dKnockout.stages.semi,19,dKnockout.stages.playoff);notifySerieDKnockoutPhase(19,'Semifinal');}
    if(completedRound===20&&!dKnockout.stages.final){const semifinal=resolveTies(dKnockout.stages.semi,19),playoff=resolveTies(dKnockout.stages.playoff,19);if(!semifinal||!playoff)return;dKnockout.promoted=[...new Set([...serieDPromotedClubs(),...playoff.winners])];dKnockout.stages.final=makeTies(semifinal.winners);installTieRounds(dKnockout.stages.final,21);notifySerieDKnockoutPhase(21,'Final');}
    if(completedRound===22&&dKnockout.stages.final&&!dKnockout.champion){const resolved=resolveTies(dKnockout.stages.final,21);if(!resolved)return;dKnockout.champion=resolved.winners[0]||null;}
    rebuildCalendarGames();
  };
  const finalizeNationalRankingSeason=()=>{
    if(nationalRankingFinalizedSeasons.has(careerSeason))return;
    Object.entries(nationalCompetitions).forEach(([division,competition])=>competition.standings.forEach(row=>{const entry=nationalRankingEntries[row.club];if(entry)entry.championshipPoints=roundRankingScore(entry.championshipPoints+row.points*nationalLeaguePointWeights[division]);}));
    const champions={A:ranked('A')[0],B:ranked('B')[0],C:ranked('C')[0],D:dKnockout.champion||ranked('D')[0],CUP:cupCompetition.champion};
    Object.entries(champions).forEach(([competition,clubName])=>{if(!clubName)return;const entry=nationalRankingEntries[clubName],label=competition==='CUP'?'COPA DO BRASIL':`SÉRIE ${competition}`,token=`${careerSeason}-${competition}`;if(!entry||entry.titles.some(title=>title.token===token))return;const points=nationalTitleBonuses[competition];entry.titlePoints=roundRankingScore(entry.titlePoints+points);entry.titles.push({token,season:careerSeason,competition:label,points});if(entry.titles.length>MEMORY_LIMITS.rankingTitles)entry.titles=entry.titles.slice(-MEMORY_LIMITS.rankingTitles);});
    nationalRankingFinalizedSeasons.add(careerSeason);renderNationalRanking();renderManagerRanking();
  };
  const openManagerSackModal=()=>{
    if(!managerJobCrisis||managerJobCrisis.status!=='sacked')return;
    managerSackUi.open({
      clubName:userClub,
      managerName:careerProfile.managerName,
      message:managerJobCrisis.message,
      board:managerJobCrisis.board,
      finances:managerJobCrisis.finances,
      offers:managerJobCrisis.offers||[],
      division:userDivision,
    });
  };
  const evaluateManagerJobRisk=()=>{
    if(!savedNewGame||!clubs[userClub])return false;
    if(managerJobCrisis?.status==='sacked'){
      openManagerSackModal();
      return true;
    }
    const standing=userStandingSnapshot();
    const club=clubs[userClub];
    const risk=resolveBoardJobRisk({
      board:club.board,
      finances:club.finances,
      played:standing?.played||0,
      honeymoonRounds:MANAGER_JOB_HONEYMOON_ROUNDS,
      boardCrisisStreak:managerJobCrisis?.boardCrisisStreak||0,
      alreadySacked:false,
    });
    const streak=Math.max(0,Number(risk.boardCrisisStreak)||0);
    managerJobCrisis={
      ...(managerJobCrisis||{}),
      board:risk.board,
      finances:risk.finances,
      boardCrisisStreak:streak,
    };
    if(risk.status==='warn_board'){
      const nearSack=streak>=5&&!managerJobCrisis?.warnedBoardStreak;
      if(!managerJobCrisis?.warnedBoard||nearSack){
        managerJobCrisis={
          ...managerJobCrisis,
          warnedBoard:true,
          warnedBoardStreak:nearSack?true:!!managerJobCrisis.warnedBoardStreak,
        };
        pushMessage({
          category:'club',
          type:nearSack?'manager-warn-board-final':'manager-warn-board',
          title:nearSack?'DIRETORIA NO LIMITE':'DIRETORIA INQUIETA',
          body:risk.message,
          round:currentRound,
          read:false,
        });
      }
    }else if(risk.status==='warn_finances'&&!managerJobCrisis?.warnedFinances){
      managerJobCrisis={...managerJobCrisis,warnedFinances:true};
      pushMessage({
        category:'club',
        type:'manager-warn-finances',
        title:'COBRANÇA FINANCEIRA',
        body:risk.message,
        round:currentRound,
        read:false,
      });
    }else if(risk.status==='critical'&&!managerJobCrisis?.warnedBoard){
      managerJobCrisis={
        ...managerJobCrisis,
        warnedBoard:true,
        warnedFinances:true,
      };
      pushMessage({
        category:'club',
        type:'manager-warn-critical',
        title:'PROJETO SOB AMEAÇA',
        body:risk.message,
        round:currentRound,
        read:false,
      });
    }else if(risk.status==='sacked'){
      const offers=generateJobOffers({
        clubs,
        userClub,
        userDivision,
        managerRanking,
        seed:savedNewGame.seed||careerSeason,
        count:3,
      });
      managerJobCrisis={
        status:'sacked',
        reason:risk.reason,
        message:risk.message,
        board:risk.board,
        finances:risk.finances,
        boardCrisisStreak:streak,
        warnedBoard:true,
        warnedFinances:true,
        warnedBoardStreak:true,
        offers,
      };
      pushMessage({
        category:'club',
        type:'manager-sacked',
        title:'DEMISSÃO',
        body:risk.message,
        round:currentRound,
        read:false,
        meta:{requiresAction:true},
      });
      persistSeason(true);
      openManagerSackModal();
      return true;
    }
    return false;
  };
  const acceptManagerJobOffer=offer=>{
    if(!savedNewGame||!offer?.club||!clubs[offer.club])return;
    skipPersistOnUnload=true;
    const oldClubName=userClub;
    const newClubName=offer.club;
    const newClub=clubs[newClubName];
    const newDivision=newClub.division||'D';
    const userManager=managerRanking.byClub(oldClubName)||managerRanking.byName(careerProfile.managerName);
    managerRanking.sack(oldClubName);
    managerRanking.hireFreeAgentForClub(oldClubName,clubs[oldClubName]?.division||userDivision);
    if(userManager)managerRanking.hire(newClubName,userManager.id);
    const aiOld=managerRanking.byClub(oldClubName);
    if(aiOld&&clubs[oldClubName])clubs[oldClubName].managerName=aiOld.name;
    newClub.managerName=careerProfile.managerName;
    if(clubs[oldClubName])clubs[oldClubName].staffContract=null;
    ensureStaffContract(newClub,{
      division:newDivision,
      season:careerSeason,
      managerId:userManager?.id||null,
      managerName:careerProfile.managerName,
      managerReputation:userManager?.reputation??60,
      preferredDivision:userManager?.preferredDivision||newDivision,
      titlePoints:userManager?.titlePoints||0,
      force:true,
    });
    // Status fresco do novo clube — nunca herda Ambiente/Diretoria/Caixa do anterior.
    const hireSeed=(Number(savedNewGame.seed)||1)^(careerSeason*31)^(newClubName.length*97);
    const hireStatus=buildManagerHireStatus({
      club:newClub,
      division:newDivision,
      seed:hireSeed,
      environmentRanges:initialEnvironmentRanges,
      initialBudget,
    });
    newClub.environment=hireStatus.environment;
    newClub.support=hireStatus.support;
    newClub.board=hireStatus.board;
    newClub.budget=hireStatus.budget;
    newClub.budgetLedger=[];
    newClub.sponsors=null;
    newClub.tvRights=null;
    newClub.seasonCashflow=null;
    newClub.wageShortfall=false;
    ensureBudget(newClub,newDivision);
    ensureStadium(newClub,newDivision);
    clubStatus.syncFinancesFromBudget(newClub,newDivision);
    const statusSnapshot={
      environment:newClub.environment,
      support:newClub.support,
      board:newClub.board,
      finances:newClub.finances,
      budget:getBalance(newClub),
    };
    const nextGoal=pickSeasonGoal({
      division:newDivision,
      overall:clubSquadOverall(newClub),
      seed:(savedNewGame.seed||1)^(careerSeason*17),
    });
    managerRanking.syncSeasonPointsFromClubs(managerRankingHelpers().getClubSeasonPoints);
    const rankingSnap=managerRanking.snapshot();
    pendingSponsorChoice=true;
    pendingSponsorOffers=null;
    const foundingClubName=savedNewGame.foundingClubName||oldClubName;
    const careerClubHistory=[...new Set([
      ...(Array.isArray(savedNewGame.careerClubHistory)?savedNewGame.careerClubHistory:[]),
      foundingClubName,
      oldClubName,
      newClubName,
    ].filter(Boolean))];
    const nextCareer={
      ...savedNewGame,
      clubName:newClubName,
      managerName:careerProfile.managerName,
      division:newDivision,
      foundingClubName,
      careerClubHistory,
      // Pirâmide completa: sem isso o boot regenera o mundo só com o novo clube.
      divisionTeams:Object.fromEntries(Object.keys(divisionRules).map(division=>[division,[...divisionTeams[division]]])),
      stadiumName:newClub.stadiumName||savedNewGame.stadiumName||null,
      pendingSponsorChoice:true,
      userRoster:assignSquadJerseyNumbers(newClub.roster.map(player=>({
        ...player,
        injuryHistory:pruneInjuryHistory(player.injuryHistory),
      }))),
      worldRosters:collectWorldRosters(clubs,{skipClub:newClubName}),
      clubStatus:statusSnapshot,
      managerRanking:rankingSnap,
      seasonGoal:nextGoal?{...nextGoal,evaluate:nextGoal.evaluate?{...nextGoal.evaluate}:null}:null,
      seasonGoalResult:null,
      createdAt:new Date().toISOString(),
      version:4,
    };
    writeJson(SAVE_KEYS.career,nextCareer);
    managerJobCrisis=null;
    writeSeasonSave({
      userClub:newClubName,
      userDivision:newDivision,
      seasonGoal:nextGoal,
      seasonGoalResult:null,
      managerJobCrisis:null,
      userClubStatus:statusSnapshot,
      userBudget:statusSnapshot.budget,
      resetUserEconomy:true,
    });
    managerSackUi.close();
    redirectGame();
  };
  const refuseManagerCareer=()=>{
    skipPersistOnUnload=true;
    markSkipPersistOnce();
    clearCareerStorage({clearTraining:true});
    managerSackUi.close();
    location.replace('home.html');
  };
  const managerSackUi=createManagerSackFeature({
    $,
    onAcceptOffer:acceptManagerJobOffer,
    onRefuseCareer:refuseManagerCareer,
    onViewRoster:clubName=>openScout(clubName),
  });
  managerSackUi.init();
  if(managerJobCrisis?.status==='sacked'){
    setTimeout(()=>openManagerSackModal(),0);
  }
  const sponsorPickerUi=createSponsorPickerFeature({
    $,
    onClick,
    formatBudget,
    onOffersChanged:nextOffers=>{
      if(!nextOffers?.master?.length)return;
      pendingSponsorOffers={
        division:nextOffers.division||userDivision,
        master:nextOffers.master.map(item=>({...item})),
        secondaries:Array.isArray(nextOffers.secondaries)?nextOffers.secondaries.map(item=>({...item})):[],
        reshufflesUsed:Number(nextOffers.reshufflesUsed)||0,
      };
      persistSeason(true);
    },
    onConfirmSponsors:({master,secondaries})=>{
      const applied=applySponsorChoice(clubs[userClub],{
        master,
        secondaries,
        division:userDivision,
        season:careerSeason,
        installments:userDivision==='D'?22:38,
      });
      if(!applied)return;
      // Fecha pendência antes de esconder o modal — evita ghost-click reabrir o picker.
      pendingSponsorChoice=false;
      pendingSponsorOffers=null;
      if(savedNewGame){
        savedNewGame.pendingSponsorChoice=false;
        writeJson(SAVE_KEYS.career,{...savedNewGame,pendingSponsorChoice:false});
      }
      persistSeason(true);
      sponsorPickerUi.close();
      // Próximo frame: UI de fundo, depois que o clique atual já consumiu.
      requestAnimationFrame(()=>{
        economyUi?.renderSponsors?.();
        economyUi?.renderOffice?.();
        refreshSeasonPresentation();
      });
    },
  });
  sponsorPickerUi.init();
  openSponsorPickerIfPending=()=>{
    if(!pendingSponsorChoice||!clubs[userClub])return;
    // Já aberto: não chamar open() de novo (zera seleção e parece fechar/reabrir).
    if(sponsorPickerUi.isOpen())return;
    if(!pendingSponsorOffers?.master?.length||pendingSponsorOffers.secondaries?.length!==5){
      pendingSponsorOffers=generateSponsorOffers({division:userDivision,random:Math.random});
    }
    sponsorPickerUi.open({season:careerSeason,offers:pendingSponsorOffers});
  };
  if(pendingSponsorChoice&&managerJobCrisis?.status!=='sacked'){
    // Dois ticks: garante modal após o primeiro paint do dashboard.
    setTimeout(()=>openSponsorPickerIfPending(),0);
    setTimeout(()=>{
      if(pendingSponsorChoice&&!sponsorPickerUi.isOpen())openSponsorPickerIfPending();
    },120);
  }
  const seasonSummary=createSeasonSummaryFeature({
    $,
    clubCrestInitials,
    onStartNextSeason:()=>{
      if(!pendingDivisionTeams||!savedNewGame)return;
      if(managerJobCrisis?.status==='sacked'){
        openManagerSackModal();
        return;
      }
      skipPersistOnUnload=true;
      pruneClubMemory(clubs,nationalRankingEntries);
      advancePlayerAges(clubs);
      playerDevelopment=emptyDevelopmentState((savedNewGame.season||2026)+1);
      const foundingClubName=savedNewGame.foundingClubName||savedNewGame.clubName||userClub;
      const careerClubHistory=[...new Set([
        ...(Array.isArray(savedNewGame.careerClubHistory)?savedNewGame.careerClubHistory:[]),
        foundingClubName,
        userClub,
      ].filter(Boolean))];
      const nextSave={
        ...savedNewGame,
        division:pendingUserDivision,
        divisionTeams:pendingDivisionTeams,
        foundingClubName,
        careerClubHistory,
        userRoster:clubs[userClub].roster.map(player=>({
          ...player,
          fatigue:100,
          injuryHistory:pruneInjuryHistory(player.injuryHistory),
        })),
        worldRosters:collectWorldRosters(clubs,{skipClub:userClub}),
        clubStatus:{
          ...(clubStatus.snapshotUserStatus()||savedNewGame.clubStatus||{}),
          budget:clubs[userClub].budget??savedNewGame.clubStatus?.budget??initialBudget(pendingUserDivision),
        },
        nationalRanking:{
          formulaVersion:nationalRankingFormulaVersion,
          entries:Object.fromEntries(Object.entries(nationalRankingEntries).map(([name,entry])=>[name,{...entry,titles:pruneRankingTitles(entry.titles)}])),
          finalizedSeasons:[...nationalRankingFinalizedSeasons],
        },
        managerRanking:(()=>{
          managerRanking.syncSeasonPointsFromClubs(managerRankingHelpers().getClubSeasonPoints);
          return managerRanking.snapshot();
        })(),
        seasonGoal:null,
        seasonGoalResult:null,
        season:(savedNewGame.season||2026)+1,
        stadiumName:clubs[userClub]?.stadiumName||savedNewGame.stadiumName||null,
        pendingSponsorChoice:true,
        createdAt:new Date().toISOString(),
        version:4,
      };
      writeJson(SAVE_KEYS.career,nextSave);
      playerHistory.finalizeSeason(careerSeason,{nextSeason:(savedNewGame.season||2026)+1});
      clearSeasonSave();
      pendingDivisionTeams=null;
      seasonTransitionPrepared=false;
      seasonSummary.close();
      redirectGame();
    },
    onCloseSeasonSummary:()=>{
      seasonSummary.close();
      refreshSeasonPresentation();
      $$('.nav').find(button=>button.dataset.view==='dashboard')?.click();
    },
  });
  seasonSummary.init();
  openSeasonGoalPreview=()=>seasonSummary.openPreview('missed');
  if(new URLSearchParams(location.search).get('preview')==='season-goal'){
    setTimeout(()=>openSeasonGoalPreview(),0);
  }
  const ranked=division=>[...nationalCompetitions[division].standings].sort((a,b)=>b.points-a.points||b.wins-a.wins||b.goalDiff-a.goalDiff).map(row=>row.club);
  const playoffEdge=(first,second,division)=>{const table=nationalCompetitions[division].standings,a=table.find(row=>row.club===first),b=table.find(row=>row.club===second),aScore=a.points+clubs[first].power*.18+rnd(-2.5,2.5),bScore=b.points+clubs[second].power*.18+rnd(-2.5,2.5);return aScore>=bScore?first:second;};
  const finishRemainingNationalRounds=fromRound=>{
    for(let round=fromRound;round<=38;round++){
      ['A','B','C'].forEach(division=>{
        const competition=nationalCompetitions[division];
        const fixtures=(Array.isArray(competition?.fixtures)?competition.fixtures:[])[round-1]||[];
        const playable=fixtures.filter(game=>game?.home&&game?.away&&clubs[game.home]&&clubs[game.away]);
        const results=playable.map(game=>simulateRoundMatch(game.home,game.away,game));
        results.forEach(recordGameLeaders);
        results.forEach(game=>applySecondaryResult(game,competition));
        if(!competitionRoundHistory[division])competitionRoundHistory[division]=[];
        competitionRoundHistory[division].push({round,games:results.map(game=>compactMatchResult(game,{keepData:false}))});
      });
    }
    Object.values(nationalCompetitions).forEach(competition=>{
      if(Array.isArray(competition?.standings))competition.standings.sort((a,b)=>b.points-a.points||b.wins-a.wins||b.goalDiff-a.goalDiff);
    });
    playerHistory.persist();
  };
  /** Só fecha a temporada quando o calendário nacional acabou e não há jogos do usuário (Copa inclusive). */
  const seasonReadyForTransition=()=>{
    if(!seasonComplete())return false;
    if(hasPendingUserFixtures())return false;
    advanceCupThroughDate(new Date(careerSeason,11,31,12));
    refreshCopaDoBrasilFixtures();
    rebuildCalendarGames();
    return !hasPendingUserFixtures();
  };
  const prepareSeasonTransition=()=>{
    // Empréstimos voltam ao clube de origem no fechamento da temporada.
    try{
      const returnedLoans=transfersEngine?.returnExpiredLoans?.()||0;
      if(returnedLoans>0){
        if(clubs[userClub]){
          assignSquadJerseyNumbers(clubs[userClub].roster);
          squad.splice(0,squad.length,...clubs[userClub].roster);
        }
        syncCareerRosters();
      }
      transfersEngine?.clearSeasonDeals?.();
    }catch{/* boot / mercado off */}
    const a=ranked('A'),b=ranked('B'),c=ranked('C'),relA=a.slice(-4),promB=[b[0],b[1],playoffEdge(b[2],b[5],'B'),playoffEdge(b[3],b[4],'B')],relB=b.slice(-4),promC=c.slice(0,4),relCCount=serieCRelegationCountForTransition(c.length,careerSeason+1),relC=c.slice(-relCCount);let promD=[...serieDPromotedClubs()];if(promD.length<SERIE_D_PROMOTIONS){const groupWinners=serieDGroups.map(group=>group.map(name=>nationalCompetitions.D.standings.find(row=>row.club===name)).filter(Boolean).sort((x,y)=>y.points-x.points||y.wins-x.wins||y.goalDiff-x.goalDiff)[0]?.club).filter(Boolean);promD=[...new Set([...promD,...groupWinners])].slice(0,SERIE_D_PROMOTIONS);}
    const next={A:[...divisionTeams.A.filter(name=>!relA.includes(name)),...promB],B:[...divisionTeams.B.filter(name=>!promB.includes(name)&&!relB.includes(name)),...relA,...promC],C:[...divisionTeams.C.filter(name=>!promC.includes(name)&&!relC.includes(name)),...relB,...promD],D:[...divisionTeams.D.filter(name=>!promD.includes(name)),...relC]};
    const used=new Set(Object.values(next).flat());generatedClubPool.filter(name=>!used.has(name)&&name!==userClub).some(name=>{if(next.D.length>=SERIE_D_CLUBS)return true;next.D.push(name);used.add(name);return false;});
    // Garante teto CBF da próxima temporada (saves/transições legadas).
    const nextCNorm=normalizeDivisionTeamsSerieC(next,{season:careerSeason+1,userClub,fillPool:generatedClubPool,dTarget:SERIE_D_CLUBS});
    pendingDivisionTeams=nextCNorm.divisionTeams;pendingUserDivision=Object.keys(pendingDivisionTeams).find(division=>pendingDivisionTeams[division].includes(userClub))||userDivision;
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
    let budgetAfter=getBalance(userClubState);
    if(!seasonTransitionPrepared){
      runSeasonEndDevelopmentPulse();
      credit(userClubState,prize.total,{reason:'season_prize',label:`Premiação temporada ${careerSeason}`,meta:{lines:prize.lines}});
      userClubState.wageShortfall=false;
      clubStatus.syncFinancesFromBudget(userClubState,userDivision);
      renderEnvironmentCard();
      budgetAfter=getBalance(userClubState);
      ensureSeasonGoal();
      if(seasonGoal&&!seasonGoalResult?.status){
        seasonGoalResult=evaluateSeasonGoal(seasonGoal,{
          position,
          promoted:userPromoted,
          serieDPhase:serieDPhase||'group',
          sponsorPressure:Number(clubs[userClub]?.sponsors?.pressure)||0,
        });
        if(seasonGoalResult.boardDelta){
          clubStatus.applyDeltas(clubs[userClub],{board:seasonGoalResult.boardDelta});
          renderEnvironmentCard();
        }
        pushMessage({
          category:'club',
          type:'season-goal-result',
          title:'AVALIAÇÃO DA META',
          body:`${seasonGoalResult.feeling}\nMeta: ${seasonGoalResult.label}`,
          round:currentRound,
          read:false,
        });
      }
      pushSeasonEndBrief({prizeTotal:prize.total,budgetAfter});
      seasonTransitionPrepared=true;
    }else{
      budgetAfter=getBalance(userClubState);
    }
    const leadersByDivision={
      A:{scorers:leadersFor('A','scorers'),assistants:leadersFor('A','assists')},
      B:{scorers:leadersFor('B','scorers'),assistants:leadersFor('B','assists')},
      C:{scorers:leadersFor('C','scorers'),assistants:leadersFor('C','assists')},
      D:{scorers:leadersFor('D','scorers'),assistants:leadersFor('D','assists')},
      CUP:{scorers:championshipLeadersFor('CUP','scorers'),assistants:championshipLeadersFor('CUP','assists')},
    };
    const movements=[
      {title:'Série B → Série A',clubs:promB,type:'promote'},
      {title:'Série A → Série B',clubs:relA,type:'relegate'},
      {title:'Série C → Série B',clubs:promC,type:'promote'},
      {title:'Série B → Série C',clubs:relB,type:'relegate'},
      {title:'Série D → Série C',clubs:promD,type:'promote'},
      {title:'Série C → Série D',clubs:relC,type:'relegate'},
    ];
    playerHistory.archiveSeasonBalance({
      season:careerSeason,
      userClub,
      userDivision,
      userLine,
      userStatus,
      seasonGoal,
      seasonGoalResult,
      champions,
      movements,
      leadersByDivision,
    });
    persistSeason(true);
    renderClubBudget();
    seasonSummary.open({
      userClub,
      careerSeason,
      userLine,
      idleNote,
      userStatus,
      champions,
      leadersByDivision,
      clubs,
      seasonRewards:{total:prize.total,lines:prize.lines,budgetAfter},
      formatBudget,
      seasonGoalResult,
      movements,
    });
    // Após Δ da meta: se diretoria+finanças no vermelho, demissão bloqueia a próxima temporada.
    evaluateManagerJobRisk();
  };
  const tryPrepareSeasonTransition=()=>{
    if(!seasonReadyForTransition())return false;
    prepareSeasonTransition();
    return true;
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
        // Novas punições do jogo ao vivo entram antes da simulação da rodada;
        // suspensões só são cumpridas depois que as partidas da rodada acontecem.
        const roundParticipants=new Set(Object.values(nationalCompetitions).flatMap(competition=>{
          const round=(Array.isArray(competition?.fixtures)?competition.fixtures:[])[currentRound-1]||[];
          return (Array.isArray(round)?round:[]).filter(game=>game?.home&&game?.away).flatMap(game=>[game.home,game.away]);
        }));
        const restDays=intervalDaysForRoundAdvance();
        commitLiveAvailability();
        const completedGames=simulateRoundResults(true);
        completedGames.forEach(recordGameLeaders);if(userDivision!=='D'||currentRound<=10)completedGames.forEach(applyRoundToTable);
        playerHistory.persist();
        serveDisciplineSuspensionsForRound();
        serveAvailability(restDays,roundParticipants);
        const fillRate=resolveMatchAttendance(liveMatchGame)?.fillRate??liveMatchGame?.fillRate??null;
        applyClubStatusAfterRound(completedGames,fillRate);
        applyUserWageBillForRound(currentRound);
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
      if(!alreadyRecorded)processAiMarketAfterRound();
      const cupReferenceDate=completedSeason?new Date(careerSeason,11,31,12):fixtureDate(clamp(currentRound,1,championshipFixtures.length));
      advanceCupThroughDate(cupReferenceDate);
      if(completedSeason)finalizeNationalRankingSeason();
      persistSeason(true);
      refreshSeasonPresentation();
      $('#roundResultsModal').classList.add('hidden');modal.classList.add('hidden');
      stopMatchClock();matchStarted=false;matchFinished=false;liveMatchGame=null;liveDayMatches.clearSnapshots();roundResults=null;roundResultMessagePushed=false;roundPreviewResults={};
      clearLiveMatchPersist();
      const sackedNow=evaluateManagerJobRisk();
      if(sackedNow){/* modal bloqueia avanço */}
      else if(completedSeason){
        if(!tryPrepareSeasonTransition()){
          if(navigateDashboard)$$('.nav').find(button=>button.dataset.view==='dashboard')?.click();
        }
      }
      else if(isUserSeasonIdle())simulateNonHumanSeasonRemainder();
      else if(navigateDashboard)$$('.nav').find(button=>button.dataset.view==='dashboard')?.click();
    }finally{
      roundCommitted=false;
    }
  };
  // Avança uma rodada nacional sem partida ao vivo do usuário (clube idle/eliminado).
  const simulateIdleRound=()=>{
    const fixturesOf=competition=>Array.isArray(competition?.fixtures)?competition.fixtures:[];
    const alreadyRecorded=(seasonRoundHistory||[]).some(item=>item.round===currentRound);
    if(!alreadyRecorded){
      const roundFixtures=fixturesOf(nationalCompetitions[userDivision])[currentRound-1]||[];
      const roundParticipants=new Set(
        Object.values(nationalCompetitions).flatMap(competition=>
          (fixturesOf(competition)[currentRound-1]||[])
            .filter(game=>game?.home&&game?.away)
            .flatMap(game=>[game.home,game.away]),
        ),
      );
      const restDays=clamp(3,2,12),recoveryMod=trainingRecoveryMultiplier('after');
      const completedGames=roundFixtures
        .filter(game=>game?.home&&game?.away&&clubs[game.home]&&clubs[game.away])
        .map(game=>simulateRoundMatch(game.home,game.away,game));
      completedGames.forEach(recordGameLeaders);
      playerHistory.persist();
      if(userDivision!=='D'||currentRound<=10)completedGames.forEach(applyRoundToTable);
      serveDisciplineSuspensionsForRound();
      serveAvailability(restDays,roundParticipants);
      applyClubStatusAfterRound(completedGames,null);
      applyUserWageBillForRound(currentRound);
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
      if(evaluateManagerJobRisk())return {sacked:true};
    }else updateSeriesDKnockout(currentRound);
    const completedSeasonNow=currentRound===38||(userDivision==='D'&&currentRound===22);
    if(userDivision==='D'&&currentRound===22&&!(competitionRoundHistory.A||[]).some(item=>item.round>=23))finishRemainingNationalRounds(23);
    currentRound++;
    reconcileCurrentRound();
    processAiMarketAfterRound();
    const fixtureCap=Math.max(Array.isArray(championshipFixtures)?championshipFixtures.length:0,fixturesOf(nationalCompetitions[userDivision]).length,currentRound,1);
    const cupReferenceDate=completedSeasonNow?new Date(careerSeason,11,31,12):fixtureDate(clamp(currentRound,1,fixtureCap));
    advanceCupThroughDate(cupReferenceDate);
    roundPreviewResults={};
    return {sacked:false,finished:completedSeasonNow};
  };
  const simulateNonHumanSeasonRemainder=()=>{
    if(nonHumanSimRunning)return;
    if(pendingSponsorChoice){openSponsorPickerIfPending();return;}
    if(managerJobCrisis?.status==='sacked'){openManagerSackModal();return;}
    if(seasonComplete()){tryPrepareSeasonTransition();return;}
    if(!isUserSeasonIdle())return;
    nonHumanSimRunning=true;
    seasonSummary.openIdleSim();
    seasonSummary.setIdleSimStatus(`Rodada ${currentRound} de ${seasonMaxRound()}…`);
    $$('.nav').find(button=>button.dataset.view==='dashboard')?.click();
    const maxRound=seasonMaxRound();
    const step=()=>{
      try{
        if(managerJobCrisis?.status==='sacked'){
          seasonSummary.closeIdleSim();
          nonHumanSimRunning=false;
          persistSeason(true);
          openManagerSackModal();
          return;
        }
        if(currentRound>maxRound){
          idleSeasonWasSimulated=true;
          finalizeNationalRankingSeason();
          persistSeason(true);
          refreshSeasonPresentation();
          seasonSummary.closeIdleSim();
          nonHumanSimRunning=false;
          tryPrepareSeasonTransition();
          return;
        }
        seasonSummary.setIdleSimStatus(`Simulando rodada ${currentRound} de ${maxRound}…`);
        const idleResult=simulateIdleRound();
        persistSeason();
        if(idleResult?.sacked||managerJobCrisis?.status==='sacked'){
          seasonSummary.closeIdleSim();
          nonHumanSimRunning=false;
          persistSeason(true);
          openManagerSackModal();
          return;
        }
        if(idleResult?.finished||currentRound>maxRound){
          idleSeasonWasSimulated=true;
          finalizeNationalRankingSeason();
          persistSeason(true);
          refreshSeasonPresentation();
          seasonSummary.closeIdleSim();
          nonHumanSimRunning=false;
          tryPrepareSeasonTransition();
          return;
        }
        // Yield ao browser para atualizar o overlay entre blocos de rodadas.
        setTimeout(step,0);
      }catch(error){
        console.error('Falha ao simular restante da temporada',{
          round:currentRound,
          division:userDivision,
          cupPhase:cupCompetition?.currentPhase,
          dKnockoutStages:Object.keys(dKnockout?.stages||{}),
          error,
        });
        seasonSummary.closeIdleSim();
        nonHumanSimRunning=false;
        try{persistSeason(true);}catch{/* quota / persist */}
        try{refreshSeasonPresentation();}catch{/* UI */}
      }
    };
    setTimeout(step,0);
  };
  const matchLiveAwaySubs=createAwaySubController({
    getMatchClub:()=>matchClub(),
    playerUnavailable,
    getLiveInjuries:()=>liveInjuries,
    getLiveDeferredInjuries:()=>liveDeferredInjuries,
    getCards:()=>cards,
    getLiveMinutesPlayed:()=>liveMinutesPlayed,
    getAwaySubstitutions:()=>awaySubstitutions,
    incrementAwaySubstitutions:()=>{awaySubstitutions++;},
    getAwaySubWindows:()=>awaySubWindows,
    incrementAwaySubWindows:()=>{awaySubWindows++;},
    getMatchStarted:()=>matchStarted,
    getPreMatchPreparation:()=>preMatchPreparation,
    getMatchFinished:()=>matchFinished,
    getMinute:()=>minute,
    getHomeGoals:()=>home,
    getAwayGoals:()=>away,
    engineTuning,
    FATIGUE_SUB_THRESHOLD,
    substitutionPriority:(...args)=>substitutionPriority(...args),
    compatibleRoles,
    clamp,
    log,
    renderRoster,
    drawBoard,
    renderStats,
    renderLiveOpponent,
    pushLiveVolumeIncident,
  });
  const {awayBenchPlayers,replaceAwayPlayer,maxAwaySubWindows,buildLiveAwaySubState,makeAwayFatigueSubstitution}=matchLiveAwaySubs;
  const matchLiveOrchestration=createLiveMatchOrchestration({
    $,
    clamp,
    rnd,
    log,
    getMinute:()=>minute,
    setMinute:v=>{minute=v;},
    getHalftimeShown:()=>halftimeShown,
    setHalftimeShown:v=>{halftimeShown=v;},
    getMatchFinished:()=>matchFinished,
    setMatchFinished:v=>{matchFinished=v;},
    getMatchStarted:()=>matchStarted,
    getStats:()=>stats,
    getCards:()=>cards,
    getShootoutState:()=>shootoutState,
    setShootoutState:v=>{shootoutState=v;},
    getPendingPenalty:()=>pendingPenalty,
    setPendingPenalty:v=>{pendingPenalty=v;},
    getDisciplineEvents:()=>disciplineEvents,
    setDisciplineEvents:v=>{disciplineEvents=v;},
    getMatchDiscipline:()=>matchDiscipline,
    getLiveInjuries:()=>liveInjuries,
    getLiveDeferredInjuries:()=>liveDeferredInjuries,
    getLiveMinutesPlayed:()=>liveMinutesPlayed,
    getPostMatchMedicalQueue:()=>postMatchMedicalQueue,
    pushLiveVolumeIncident,
    getUserClub:()=>userClub,
    getClubs:()=>clubs,
    getMatchClub:()=>matchClub(),
    getLiveMatchGame:()=>liveMatchGame,
    getNextUserGame:()=>nextUserGame,
    getStarters:()=>starters(),
    getActiveStarters:()=>activeStarters(),
    getCurrentRound:()=>currentRound,
    userAtHomeInLiveMatch,
    profile,
    opponentForMatch,
    liveOverall,
    cautionPenalty,
    tacticFor:(...args)=>tacticFor(...args),
    playerFor,
    actorData,
    tacticalDiscipline,
    totalCards,
    influencePossession,
    engineTuning,
    compatibleRoles,
    playerUnavailable,
    injuryInAcutePhase,
    playerRehabMaxMinutes,
    resolvePhysicalIncident,
    assignPlayerInjury,
    buildDeferredInjuryEntry,
    calculatePlayThroughSubChance,
    injurySeverityLabel,
    pickInjuryVictim,
    directRedDismissalType,
    directRedSuspensionGames,
    applyMinuteWearToLineup,
    clubInstitutionalContext,
    stopMatchClock,
    startMatchClock:(...args)=>startMatchClock(...args),
    openPreparation,
    renderRoster,
    drawBoard,
    renderSubstitutionControls,
    renderStats,
    renderLiveOpponent,
    makeAwayFatigueSubstitution,
    simulateRoundResults,
    renderFinalSummary,
    showFinalActions,
    cupLiveMatchNeedsShootout:(...args)=>cupLiveMatchNeedsShootout(...args),
    optionsUi,
    knockoutCompetitionLabel,
    getKnockoutTieGames,
    shot:(...args)=>shot(...args),
    planPenaltyOutcome:(...args)=>planPenaltyOutcome?.(...args),
    takeFreeKick:(...args)=>takeFreeKick(...args),
    penaltyTaker:(...args)=>penaltyTaker(...args),
    buildAttack:(...args)=>buildAttack(...args),
    addPasses:(...args)=>addPasses(...args),
    timeline,
    resetLiveClockSeconds:(...args)=>matchLiveUi.resetLiveClockSeconds(...args),
    updateLiveMatchClock,
    getAwaySubstitutions:()=>awaySubstitutions,
    incrementAwaySubstitutions:()=>{awaySubstitutions++;},
    getSubstitutions:()=>substitutions,
    getStoppageFirst:()=>stoppageFirst,
    setStoppageFirst:v=>{stoppageFirst=Number(v)||0;},
    getStoppageSecond:()=>stoppageSecond,
    setStoppageSecond:v=>{stoppageSecond=Number(v)||0;},
    getStoppageElapsed:()=>stoppageElapsed,
    setStoppageElapsed:v=>{stoppageElapsed=Number(v)||0;},
    getStoppageActive:()=>stoppageActive,
    setStoppageActive:v=>{stoppageActive=v||null;},
    getHomeScore:()=>home,
    getAwayScore:()=>away,
    getStoppageHalfSnap:()=>stoppageHalfSnap,
    setStoppageHalfSnap:v=>{stoppageHalfSnap=v&&typeof v==='object'?{fouls:Number(v.fouls)||0,yellow:Number(v.yellow)||0,red:Number(v.red)||0,subs:Number(v.subs)||0,goals:Number(v.goals)||0}:null;},
    getLeaguePhaseRounds:game=>{
      if(isKnockoutShootoutCompetition(game))return 0;
      const division=clubs[game?.home]?.division||clubs[game?.away]?.division||userDivision;
      if(division==='D')return SERIE_D_GROUP_ROUNDS;
      return Math.max(2,nationalCompetitions[division]?.fixtures?.length||championshipFixtures.length||38);
    },
  });
  const {
    tryLiveEventInjury,escalateLivePlayThroughInjury,handleLivePlayThroughIncident,checkMinuteAggravation,enforceLiveRehabLimit,
    applyWear,tick,foul,advance,
    shootoutGoalsCount,shootoutAttemptsCount,currentShootoutClub,shootoutLineup,shootoutCardsFor,renderShootoutTrack,logShootout,
    evaluateShootoutWinner,pickShootoutCpuTaker,executeShootoutKick,startShootoutTakerChoice,startShootoutCpuKick,scheduleNextShootoutKick,
    completePenaltyShootout,startPenaltyShootout,startPenaltyChoice,startPenaltyAgainst,
    openPenaltyDuel,closePenaltyDuel,isPenaltyDuelOpen,runPenaltyDuelResolve,
  }=matchLiveOrchestration;
  ({ addPasses, shot, takeFreeKick, penaltyTaker, buildAttack, planPenaltyOutcome } = createLiveMatchActions({
    clamp,
    rnd,
    random: Math.random,
    getStats: () => stats,
    getMinute: () => minute,
    getStoppageElapsed: () => stoppageElapsed,
    getStoppageActive: () => stoppageActive,
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
    engineScoreDamp,
    engineFoulRisk,
    engineProgressiveFoulRisk,
    tacticFor,
    tryLiveEventInjury,
    foul,
    pickInjuryVictim,
    pushLiveVolumeIncident,
  }));
  const cupLiveMatchNeedsShootout=()=>liveKnockoutNeedsShootout();
  /** Empate no AGREGADO (ida+volta) — não exige empate no placar da volta. */
  const liveKnockoutNeedsShootout=()=>{
    if(!liveMatchGame||!isKnockoutShootoutCompetition(liveMatchGame))return false;
    if(liveMatchGame.shootoutWinner||shootoutState)return false;
    const games=getKnockoutTieGames(liveMatchGame);
    if(!games.length)return false;
    const liveStats=buildLiveKnockoutStats();
    return projectedKnockoutNeedsShootout(games,liveMatchGame,liveStats);
  };
  const collectLiveMatchPersistState=()=>({
    seed:savedNewGame?.seed,
    liveMatchGame,
    minute,home,away,pauses,halftimeShown,matchStarted,matchFinished,preMatchPreparation,
    activePreparationTitle,substitutions,awaySubstitutions,awaySubWindows,substitutedOut,
    disciplineEvents,availabilityCommitted,roundResultMessagePushed,stats,cards,goals,matchFactors,
    liveInjuries,liveDeferredInjuries,liveOpeningLineup,liveMinutesPlayed,matchDiscipline,
    liveVolumeSamples,liveVolumePrev,liveVolumePulse,liveVolumeIncidents,postMatchMedicalQueue,
    shootoutState,pendingPenalty,preMatchTacticSnapshot,
    stoppageFirst,stoppageSecond,stoppageElapsed,stoppageActive,stoppageHalfSnap,
    userFormation:formation,
    userLineupOrder:squad.map(player=>player.name),
    awayFormation:matchClub()?.formation,
    awayLineupOrder:matchClub()?.roster?.map(player=>player.name)||[],
    liveClockSeconds:matchLiveUi.getLiveClockSeconds?.()||0,
    timelineHtml:timeline?.innerHTML||'',
    matchStatusText:$('#matchStatus')?.textContent||'',
    ui:{
      pauseOpen:!!$('#pausePanel')&&!$('#pausePanel').classList.contains('hidden'),
      statsOpen:!!$('#stats')&&!$('#stats').classList.contains('hidden'),
      penaltyOpen:typeof isPenaltyDuelOpen==='function'?isPenaltyDuelOpen():!!$('#penaltyChoice')&&!$('#penaltyChoice').classList.contains('hidden'),
      shootoutOpen:!!$('#shootoutPanel')&&!$('#shootoutPanel').classList.contains('hidden'),
    },
  });
  const liveMatchPersist=createLiveMatchPersistController({
    getState:collectLiveMatchPersistState,
    onFlush:snap=>{latestLiveMatchSnapshot=snap;},
  });
  scheduleLiveMatchPersist=()=>liveMatchPersist.schedule();
  flushLiveMatchPersist=()=>liveMatchPersist.flush();
  clearLiveMatchPersist=()=>{
    liveMatchPersist.clear();
    latestLiveMatchSnapshot=null;
  };
  const applyNamedLineupOrder=(roster,names)=>{
    if(!roster||!Array.isArray(names)||!names.length)return;
    const byName=new Map(roster.map(player=>[player.name,player]));
    const next=[];
    names.forEach(name=>{
      const player=byName.get(name);
      if(player){next.push(player);byName.delete(name);}
    });
    byName.forEach(player=>next.push(player));
    roster.splice(0,roster.length,...next);
  };
  const findFixtureForLiveSnapshot=ref=>{
    if(!ref)return null;
    const wanted=fixtureIdFromGame(ref);
    const fromSchedule=userSchedule().find(entry=>fixtureIdFromGame(entry.game)===wanted)?.game;
    if(fromSchedule)return fromSchedule;
    for(const stage of cupCompetition.stages||[]){
      const hit=(stage.fixtures||[]).find(game=>fixtureIdFromGame(game)===wanted);
      if(hit)return hit;
    }
    for(const roundGames of championshipFixtures||[]){
      const hit=(roundGames||[]).find(game=>fixtureIdFromGame(game)===wanted);
      if(hit)return hit;
    }
    return null;
  };
  const resolvePersistedLiveSnapshot=()=>{
    if(!savedNewGame?.seed)return null;
    const fromKey=loadLiveMatchSave();
    if(isValidLiveMatchSnapshot(fromKey,savedNewGame.seed))return hydrateLiveMatchSnapshot(fromKey);
    const fromSeason=validSavedSeason?savedSeason.liveMatchSnapshot:null;
    if(isValidLiveMatchSnapshot(fromSeason,savedNewGame.seed))return hydrateLiveMatchSnapshot(fromSeason);
    return null;
  };
  const forceCompleteLockedLiveMatch=lock=>{
    if(!lock?.home||!lock?.away)return false;
    const ref={home:lock.home,away:lock.away,competition:lock.competition,round:lock.round,tieId:lock.tieId,leg:lock.leg,date:lock.date,gameNumber:lock.gameNumber};
    const game=findFixtureForLiveSnapshot(ref)||ref;
    if(isFixtureCompleted(game)){
      clearLiveMatchPersist();
      persistSeason(true);
      return false;
    }
    const result=simulateRoundMatch(game.home,game.away,game);
    liveMatchGame=game;
    const userAtHome=game.home===userClub;
    home=userAtHome?result.homeGoals:result.awayGoals;
    away=userAtHome?result.awayGoals:result.homeGoals;
    goals=result.goals?{home:[...(result.goals.home||[])],away:[...(result.goals.away||[])]}:{home:[],away:[]};
    stats=result.data?{
      home:{...blank(),possession:result.data.homePossession??50,passes:result.data.homePasses||0,accurate:result.data.homeAccurate||0,shots:result.data.homeShots||0,on:result.data.homeOnTarget||0,off:result.data.homeOff||0,saved:result.data.homeSaved||0,penalties:result.data.homePenalties||0,offsides:result.data.homeOffsides||0,keeperSaves:result.data.homeKeeperSaves||0,tackles:result.data.homeTackles||0,fouls:result.data.homeFouls||0,yellow:result.data.homeYellow||0,red:result.data.homeRed||0},
      away:{...blank(),possession:result.data.awayPossession??50,passes:result.data.awayPasses||0,accurate:result.data.awayAccurate||0,shots:result.data.awayShots||0,on:result.data.awayOnTarget||0,off:result.data.awayOff||0,saved:result.data.awaySaved||0,penalties:result.data.awayPenalties||0,offsides:result.data.awayOffsides||0,keeperSaves:result.data.awayKeeperSaves||0,tackles:result.data.awayTackles||0,fouls:result.data.awayFouls||0,yellow:result.data.awayYellow||0,red:result.data.awayRed||0},
    }:{home:blank(),away:blank()};
    minute=90;matchStarted=true;matchFinished=true;preMatchPreparation=false;halftimeShown=true;
    cards={home:starters().map(()=>({yellow:0,red:false,dismissal:null,injured:false,playThroughRisk:false})),away:matchClub().roster.slice(0,11).map(()=>({yellow:0,red:false,dismissal:null,injured:false,playThroughRisk:false}))};
    timeline.innerHTML=`<p class="tl-event">Partida interrompida foi concluída automaticamente (anti recomeço).</p>`;
    $('#matchStatus').textContent='Partida concluída automaticamente após interrupção.';
    renderLiveMatchHeader(liveMatchGame);
    modal.classList.remove('hidden');
    score();
    renderFinalSummary();
    showFinalActions({openRatings:true});
    clearLiveMatchSave();
    latestLiveMatchSnapshot=null;
    persistSeason(true);
    return true;
  };
  const restoreLiveMatchFromSnapshot=(raw,{openModal=true}={})=>{
    if(!isValidLiveMatchSnapshot(raw,savedNewGame?.seed))return false;
    const snap=hydrateLiveMatchSnapshot(raw);
    const linked=findFixtureForLiveSnapshot(snap.fixture);
    const game=linked||{...snap.fixture};
    if(linked){
      if(snap.fixture.penalties!=null)linked.penalties=snap.fixture.penalties;
      if(snap.fixture.shootoutWinner!=null)linked.shootoutWinner=snap.fixture.shootoutWinner;
      if(snap.fixture.shootoutPenalties!=null)linked.shootoutPenalties=snap.fixture.shootoutPenalties;
      if(snap.fixture.homeGoals!=null)linked.homeGoals=snap.fixture.homeGoals;
      if(snap.fixture.awayGoals!=null)linked.awayGoals=snap.fixture.awayGoals;
      if(snap.fixture.completed)linked.completed=true;
    }
    if(isFixtureCompleted(game)&&!snap.matchFinished){
      clearLiveMatchPersist();
      return false;
    }
    liveMatchGame=game;
    if(snap.userFormation&&formations[snap.userFormation]){
      formation=snap.userFormation;
      clubs[userClub].formation=formation;
    }
    applyNamedLineupOrder(squad,snap.userLineupOrder);
    clubs[userClub].roster=squad;
    positionAssignments=[...(formationRoles[formation]||formationRoles['4-3-3'])];
    const awayClub=matchClub();
    if(snap.awayFormation&&formations[snap.awayFormation])awayClub.formation=snap.awayFormation;
    applyNamedLineupOrder(awayClub.roster,snap.awayLineupOrder);
    minute=Number(snap.minute)||0;
    home=Number(snap.home)||0;
    away=Number(snap.away)||0;
    pauses=Number(snap.pauses)||0;
    halftimeShown=!!snap.halftimeShown;
    stoppageFirst=Number(snap.stoppageFirst)||0;
    stoppageSecond=Number(snap.stoppageSecond)||0;
    stoppageElapsed=Number(snap.stoppageElapsed)||0;
    stoppageActive=snap.stoppageActive||null;
    stoppageHalfSnap=snap.stoppageHalfSnap&&typeof snap.stoppageHalfSnap==='object'?{fouls:Number(snap.stoppageHalfSnap.fouls)||0,yellow:Number(snap.stoppageHalfSnap.yellow)||0,red:Number(snap.stoppageHalfSnap.red)||0,subs:Number(snap.stoppageHalfSnap.subs)||0,goals:Number(snap.stoppageHalfSnap.goals)||0}:null;
    matchStarted=true;
    matchFinished=!!snap.matchFinished;
    preMatchPreparation=!!snap.preMatchPreparation;
    activePreparationTitle=snap.activePreparationTitle||'';
    substitutions=Number(snap.substitutions)||0;
    awaySubstitutions=Number(snap.awaySubstitutions)||0;
    awaySubWindows=Number(snap.awaySubWindows)||0;
    substitutedOut=snap.substitutedOut instanceof Set?snap.substitutedOut:new Set(snap.substitutedOut||[]);
    disciplineEvents=Number(snap.disciplineEvents)||0;
    availabilityCommitted=!!snap.availabilityCommitted;
    roundResultMessagePushed=!!snap.roundResultMessagePushed;
    stats=snap.stats||{home:blank(),away:blank()};
    cards=snap.cards||{home:starters().map(()=>({yellow:0,red:false})),away:awayClub.roster.slice(0,11).map(()=>({yellow:0,red:false}))};
    goals=snap.goals||{home:[],away:[]};
    matchFactors=snap.matchFactors||null;
    liveInjuries=snap.liveInjuries||{home:[],away:[]};
    liveDeferredInjuries=snap.liveDeferredInjuries||{home:[],away:[]};
    liveOpeningLineup=snap.liveOpeningLineup||{home:[],away:[]};
    liveMinutesPlayed=snap.liveMinutesPlayed||{home:new Map(),away:new Map()};
    matchDiscipline=snap.matchDiscipline||{home:new Map(),away:new Map()};
    liveVolumeSamples=snap.liveVolumeSamples||[];
    liveVolumePrev=snap.liveVolumePrev||null;
    liveVolumePulse=snap.liveVolumePulse||{home:0.1,away:0.1};
    liveVolumeIncidents=snap.liveVolumeIncidents||[];
    postMatchMedicalQueue=Array.isArray(snap.postMatchMedicalQueue)?snap.postMatchMedicalQueue:[];
    shootoutState=snap.shootoutState||null;
    pendingPenalty=snap.pendingPenalty||null;
    preMatchTacticSnapshot=snap.preMatchTacticSnapshot||null;
    roundResults=null;
    liveDayMatches.clearSnapshots();
    matchLiveUi.setLiveClockSeconds?.(Number(snap.liveClockSeconds)||0);
    if(preMatchPreparation){
      timeline.innerHTML='';
      timeline.classList.add('hidden');
      $('#liveVolume')?.classList.add('hidden');
    }else{
      const html=snap.timelineHtml||`<p>${minute}' · Partida retomada após recarregar a página.</p>`;
      timeline.innerHTML=/PRÉ-JOGO\s*·\s*Aguardando/.test(html)?'':html;
      timeline.classList.toggle('hidden',!timeline.innerHTML.trim());
    }
    $('#matchStatus').textContent=snap.matchStatusText||(matchFinished?'Partida encerrada.':preMatchPreparation?'Organize sua equipe antes de iniciar a partida.':'A partida está em andamento…');
    $('#matchActions').innerHTML='<button id="pauseMatch">Ⅱ PAUSA TÉCNICA <small id="pauseCounter">0/3</small></button><button id="liveStats">ESTATÍSTICAS AO VIVO</button><button id="liveOpponent">VER ADVERSÁRIO</button>';
    bindLiveActions();
    $('#pauseCounter').textContent=`${pauses}/3`;
    if(typeof closePenaltyDuel==='function')closePenaltyDuel();
    else $('#penaltyChoice')?.classList.add('hidden');
    $('#shootoutPanel').classList.add('hidden');
    $('#liveOpponentModal').classList.add('hidden');
    $('#pausePanel').classList.add('hidden');
    $('#stats').classList.add('hidden');
    renderLiveMatchHeader(liveMatchGame);
    score();
    updateLiveMatchClock();
    renderRoster();
    drawBoard();
    latestLiveMatchSnapshot=buildLiveMatchSnapshot(collectLiveMatchPersistState());
    saveLiveMatchSave(latestLiveMatchSnapshot);
    if(!openModal)return true;
    if(matchFinished){
      stopMatchClock();
      modal.classList.remove('hidden');
      // Save antigo / bug: empate no agregado sem disputa → reabre pênaltis
      if(!shootoutState&&!liveMatchGame?.shootoutWinner&&liveKnockoutNeedsShootout()){
        matchFinished=false;
        startPenaltyShootout();
        return true;
      }
      if(shootoutState){renderShootoutTrack();$('#shootoutPanel').classList.remove('hidden');}
      else if(liveMatchGame?.penalties){$('#shootoutTitle').textContent=`Shootout ${liveMatchGame.penalties}`;$('#shootoutPanel').classList.remove('hidden');}
      renderFinalSummary({processMedical:false});
      showFinalActions({reopen:true});
      return true;
    }
    modal.classList.remove('hidden');
    if(pendingPenalty?.mode==='shootout'&&shootoutState){
      stopMatchClock();
      $('#matchActions').classList.add('hidden');
      $('#shootoutPanel').classList.remove('hidden');
      renderShootoutTrack();
      startShootoutTakerChoice(pendingPenalty.kickingClub||currentShootoutClub());
      return true;
    }
    if(pendingPenalty?.mode==='shootout-cpu'&&shootoutState){
      stopMatchClock();
      $('#matchActions').classList.add('hidden');
      $('#shootoutPanel').classList.remove('hidden');
      renderShootoutTrack();
      const club=pendingPenalty.kickingClub||currentShootoutClub();
      const taker=shootoutLineup(club).find(player=>player.name===pendingPenalty.takerName)||pickShootoutCpuTaker(club);
      if(taker)startShootoutCpuKick(club,taker);
      else scheduleNextShootoutKick();
      return true;
    }
    if(pendingPenalty?.mode==='against'&&pendingPenalty?.current&&pendingPenalty?.other){
      startPenaltyAgainst(pendingPenalty.current,pendingPenalty.other);
      return true;
    }
    if(pendingPenalty?.current&&pendingPenalty?.other){
      startPenaltyChoice(pendingPenalty.current,pendingPenalty.other);
      return true;
    }
    if(shootoutState){
      stopMatchClock();
      $('#matchActions').classList.add('hidden');
      $('#shootoutPanel').classList.remove('hidden');
      renderShootoutTrack();
      scheduleNextShootoutKick();
      return true;
    }
    if(preMatchPreparation||snap.ui?.pauseOpen||activePreparationTitle){
      openPreparation(activePreparationTitle||(preMatchPreparation?'PRÉ-JOGO':'PAUSA TÉCNICA'));
      return true;
    }
    $('#matchActions').classList.remove('hidden');
    startMatchClock();
    scheduleLiveMatchPersist();
    return true;
  };
  const tryRestoreLiveMatch=({openModal=true}={})=>{
    if(matchStarted&&liveMatchGame)return reopenMatchWindow();
    const snap=resolvePersistedLiveSnapshot();
    if(snap)return restoreLiveMatchFromSnapshot(snap,{openModal});
    const lock=validSavedSeason?.activeLiveMatch;
    if(lock&&savedNewGame?.seed&&(!validSavedSeason.seed||validSavedSeason.seed===savedNewGame.seed)){
      return forceCompleteLockedLiveMatch(lock);
    }
    return false;
  };
  onClick('#playMatch',() => {
    if(pendingSponsorChoice){
      openSponsorPickerIfPending();
      return;
    }
    refreshUserFixtures();
    if(isUserSeasonIdle()){
      renderUserMatchPresentation();
      simulateNonHumanSeasonRemainder();
      return;
    }
    if(seasonFullyComplete()||(seasonComplete()&&!nextPendingUserEntry())){
      renderUserMatchPresentation();
      if(!tryPrepareSeasonTransition()){
        // Sem jogos do clube: abre o balanço mesmo se a Copa CPU já tiver sido resolvida no save.
        if(!hasPendingUserFixtures())prepareSeasonTransition();
      }
      return;
    }
    // Partida persistida (refresh) tem prioridade sobre o fluxo de calendário.
    if(tryRestoreLiveMatch()) return;
    if(reopenMatchWindow()) return;
    if(!nextPendingUserEntry()){
      renderUserMatchPresentation();
      return;
    }
    const nextEntry=nextPendingUserEntry();
    // Libera jogo no dia agendado ou se o calendário passou do jogo (atrasado).
    if(nextEntry&&isPendingFixtureOverdue(nextEntry)===false&&!sameCalendarDay(nextEntry.details.date,careerCalendarDate)){
      $$('.nav').find(button=>button.dataset.view==='calendar')?.click();
      return;
    }
    pushMatchDayBrief(nextEntry?.game);
    liveMatchGame=nextEntry?.game||nextUserGame;
    renderLiveMatchHeader(liveMatchGame);
    // NÃO cumprir suspensão no pré-jogo — o banimento vale para esta partida.
    // O cumprimento (serve) ocorre só após o jogo / avanço de rodada.
    // Mantém a escalação/formação da tela Táticas; só limpa titulares indisponíveis.
    sanitizeUserStartersForMatch();
    orderRosterForFormation(matchClub().roster,matchClub().formation);
    clubs[userClub].formation=formation;
    positionAssignments=[...(formationRoles[formation]||formationRoles['4-3-3'])];
    matchStarted=true; matchFinished=false; preMatchPreparation=true; minute=0;home=0;away=0;pauses=0;halftimeShown=false;pendingPenalty=null;shootoutState=null;disciplineEvents=0;substitutions=0;awaySubstitutions=0;awaySubWindows=0;stoppageFirst=0;stoppageSecond=0;stoppageElapsed=0;stoppageActive=null;stoppageHalfSnap=null;substitutedOut=new Set();roundResults=null;roundResultMessagePushed=false;postMatchMedicalQueue=[];matchDiscipline={home:new Map(),away:new Map()};liveInjuries={home:[],away:[]};liveDeferredInjuries={home:[],away:[]};liveOpeningLineup={home:starters().map(player=>player.name),away:matchClub().roster.slice(0,11).map(player=>player.name)};liveMinutesPlayed={home:new Map(starters().map(player=>[player.name,0])),away:new Map(matchClub().roster.slice(0,11).map(player=>[player.name,0]))};availabilityCommitted=false;liveDayMatches.clearSnapshots();preMatchTacticSnapshot=null;matchFactors={home:contextFactor({...seasonContext.home,position:clubs[userClub].position,isHome:isUserHomeMatch(liveMatchGame)}),away:contextFactor({...seasonContext.away,position:matchClub().position,isHome:!isUserHomeMatch(liveMatchGame)})};cards={home:starters().map(() => ({yellow:0,red:false,dismissal:null,injured:false,playThroughRisk:false})),away:matchClub().roster.slice(0,11).map(() => ({yellow:0,red:false,dismissal:null,injured:false,playThroughRisk:false}))};goals={home:[],away:[]};liveVolumeSamples=[];liveVolumePrev=null;liveVolumePulse={home:0.1,away:0.1};liveVolumeIncidents=[];stats={home:blank(),away:blank()};score();timeline.innerHTML='';timeline.classList.add('hidden');$('#liveVolume')?.classList.add('hidden');$('#matchActions').innerHTML='<button id="pauseMatch">Ⅱ PAUSA TÉCNICA <small id="pauseCounter">0/3</small></button><button id="liveStats">ESTATÍSTICAS AO VIVO</button><button id="liveOpponent">VER ADVERSÁRIO</button>';bindLiveActions();$('#pauseCounter').textContent='0/3';$('#matchStatus').textContent='Organize sua equipe antes de iniciar a partida.';modal.classList.remove('hidden');$('#penaltyChoice').classList.add('hidden');$('#shootoutPanel').classList.add('hidden');$('#liveOpponentModal').classList.add('hidden');updateLiveMatchClock();openPreparation('PRÉ-JOGO');
    flushLiveMatchPersist();
    persistSeason(true);
  });
  onClick('#simulateRemainder',()=>simulateNonHumanSeasonRemainder());
  const openLastPostMatchView=()=>{
    if(!(matchStarted&&matchFinished&&!roundCommitted&&liveMatchGame))return false;
    $('#calendarMatchReportModal')?.classList.add('hidden');
    const opened=reopenMatchWindow();
    if(opened){
      renderUserMatchPresentation();
      // Reabrir pelo CTA não força NOTAS de novo — o usuário abre pelo botão NOTAS.
    }
    return opened;
  };
  onClick('#reopenPostMatch',()=>{openLastPostMatchView();});
  onClick('#closeMatch',()=>{
    // Pós-jogo: × só fecha a janela — AVANÇAR é quem confirma e avança a rodada.
    if(matchFinished&&!roundCommitted){
      flushLiveMatchPersist();
      if(matchStarted)persistSeason(true);
      stopMatchClock();
      closeFormationSuggestion();
      $('#calendarMatchReportModal')?.classList.add('hidden');
      $('#liveOpponentModal').classList.add('hidden');
      modal.classList.add('hidden');
      renderUserMatchPresentation();
      return;
    }
    flushLiveMatchPersist();
    if(matchStarted)persistSeason(true);
    stopMatchClock();
    modal.classList.add('hidden');$('#liveOpponentModal').classList.add('hidden');closeFormationSuggestion();
    $('#calendarMatchReportModal')?.classList.add('hidden');
    renderUserMatchPresentation();
  });
  onClick('#resumeMatch',()=>{
    const startingMatch=preMatchPreparation;
    const startingSecondHalf=!startingMatch&&halftimeShown&&!matchFinished&&minute<=45;
    if(startingMatch)pauseLineupBaseline=null;
    else finalizePauseLineupEdits();
    preMatchPreparation=false;
    activePreparationTitle='';
    $('#pausePanel').classList.add('hidden');
    $('#stats').classList.add('hidden');
    $('#matchActions').classList.remove('hidden');
    $('#matchStatus').textContent='A partida está em andamento…';
    if(startingMatch){
      matchLiveUi.resetLiveClockSeconds();liveDayMatches.clearSnapshots();liveDayMatches.ensure();applyPreMatchTraining();renderRoster();
      liveOpeningLineup={home:starters().map(player=>player.name),away:matchClub().roster.slice(0,11).map(player=>player.name)};
      preMatchTacticSnapshot={...(tactics?.getTacticalValues?.()??DEFAULT_USER_TACTICS)};
      const venue=matchVenueFor(liveMatchGame?.home||userClub);
      const crowd=liveMatchGame?resolveMatchAttendance(liveMatchGame):null;
      const crowdLine=crowd
        ? ` Público: ${crowd.attendance.toLocaleString('pt-BR')} (${Math.round(crowd.fillRate*100)}% da capacidade).`
        : '';
      timeline.classList.remove('hidden');
      timeline.innerHTML=`<p>0' · A bola está rolando no ${venue.name}!${crowdLine}</p>`;
      const kickoff=tacticalKickoffMessage(preMatchTacticSnapshot);
      if(kickoff)log(kickoff,'tactic');
      if(!liveVolumeSamples.length)liveVolumeSamples=[{minute:0,home:0.14,away:0.14}];
    }else if(startingSecondHalf){
      // 2º tempo: relógio limpo a partir de 45:00 (acréscimo do 1º fica só no intervalo).
      stoppageActive=null;
      stoppageElapsed=0;
      minute=45;
      matchLiveUi.resetLiveClockSeconds();
      log('Início do 2º tempo.','');
    }
    updateLiveMatchClock();
    matchLiveUi.refreshMatchFeed?.();
    startMatchClock();
    flushLiveMatchPersist();
  });
  onClick('#penaltyTakers',e=>{
    const button=e.target.closest('button');
    if(!button||button.disabled)return;
    if(pendingPenalty?.mode==='against'||pendingPenalty?.mode==='shootout-cpu')return;
    const takerName=button.dataset.taker;
    // Shootout: se o pending foi apagado após a cobrança da IA, recupera pela vez atual.
    const shootoutKickClub=pendingPenalty?.mode==='shootout'
      ?pendingPenalty.kickingClub
      :(shootoutState&&currentShootoutClub()===userClub?userClub:null);
    if(shootoutKickClub){
      const lineup=shootoutLineup(shootoutKickClub),taker=lineup.find(player=>player.name===takerName);
      if(!taker)return;
      const kickingClub=shootoutKickClub;
      const isUser=kickingClub===userClub;
      const current=isUser?profile():opponentForMatch();
      const other=isUser?opponentForMatch():profile();
      const side=isUser?'home':'away';
      const plan=planPenaltyOutcome(side,{...current,attack:current.attack+9},other,{taker:taker.name,penaltySkill:taker.penaltyTaking});
      if(!plan?.outcome)return;
      pendingPenalty={mode:'shootout',kickingClub};
      runPenaltyDuelResolve(takerName,plan,()=>{
        // Limpa antes do execute — ele pode já abrir a próxima escolha/CPU.
        pendingPenalty=null;
        executeShootoutKick(kickingClub,taker,plan);
      });
      return;
    }
    const taker=starters().find(p=>p.name===takerName);
    if(!taker||!pendingPenalty)return;
    const pending={...pendingPenalty};
    const plan=planPenaltyOutcome('home',{...pending.current,attack:pending.current.attack+9},pending.other,{taker:taker.name,penaltySkill:taker.penaltyTaking});
    if(!plan?.outcome)return;
    runPenaltyDuelResolve(takerName,plan,()=>{
      shot('home',{...pending.current,attack:pending.current.attack+9},pending.other,{
        penalty:true,
        taker:taker.name,
        penaltySkill:taker.penaltyTaking,
        forcedOutcome:plan.outcome,
      });
      closePenaltyDuel();
      $('#matchActions').classList.remove('hidden');
      $('#matchStatus').textContent='A partida está em andamento…';
      pendingPenalty=null;
      renderStats();
      startMatchClock();
    });
  });
  
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
  const userCupFixtures=()=>(cupCompetition.stages||[]).flatMap(stage=>(Array.isArray(stage?.fixtures)?stage.fixtures:[]).filter(game=>game.home===userClub||game.away===userClub));
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
            const result=simulateRoundMatch(game.home,game.away,game);
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
    const restoredLive=tryRestoreLiveMatch({openModal:true});
    if(!restoredLive){
      if(isUserSeasonIdle())setTimeout(()=>simulateNonHumanSeasonRemainder(),0);
      else if(seasonComplete())tryPrepareSeasonTransition();
    }
  }
  } catch(error) {
    document.documentElement.dataset.bootError=String(error?.stack||error);
    console.error('Matchday Football failed to initialize',error);
    throw error;
  }
}
