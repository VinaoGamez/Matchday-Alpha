import { MODULE_VERSIONS } from '../core/constants.js';
import { roundTactic } from './match-core.js';
import { FATIGUE_SUB_THRESHOLD, fatigueMinuteWear, enginePenaltyChance } from './match-tuning.js';
import { allowsExtendedSecondHalfStoppage, ownGoalChance, rollStoppageMinutes } from './match-clock.js';
import { isKnockoutShootoutCompetition } from './knockout-shootout.js';
import { isFreeKickSpecialist, isPenaltySpecialist, penaltyGoalChanceRate, SPECIALIST_BONUS } from './player-generation.js';

/**
 * Simulador de partida da rodada (90 min) — estatísticas, gols, cartões e lesões.
 */
export function createRoundMatchSimulator(deps) {
  const {
    clamp,
    rnd,
    random,
    getClubs,
    getLeagueData,
    clubInstitutionalContext,
    buildSimLineup,
    substitutionPriority,
    engineTuning,
    engineFoulRisk,
    engineBlowoutDamp,
    engineScoreDamp = () => 1,
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
    resolveStoppageEligibility,
  } = deps;

  const roundAverage=(lineup,key)=>lineup.length?lineup.reduce((sum,player)=>sum+matchPlayerStat(player,key),0)/lineup.length:0;
  const roundPlayerView=player=>player?{...player,speed:matchPlayerStat(player,'speed'),dribble:matchPlayerStat(player,'dribble'),finishing:matchPlayerStat(player,'finishing'),passing:matchPlayerStat(player,'passing'),marking:matchPlayerStat(player,'marking'),tackling:matchPlayerStat(player,'tackling'),heading:matchPlayerStat(player,'heading'),playmaking:matchPlayerStat(player,'playmaking'),penaltyTaking:matchPlayerStat(player,'penaltyTaking'),freeKick:matchPlayerStat(player,'freeKick')}:player;
  const roundWeightedActor=(state,roles,weight,defensive=false)=>{
    const active=state.lineup.filter(player=>!state.cards.get(player.name)?.red&&!state.injuries.has(player.name));
    const preferred=active.filter(player=>roles.includes(player.pos));
    const options=preferred.length?preferred:active;
    const safeDefenders=options.some(player=>!state.cards.get(player.name)?.yellow);
    const weights=options.map(player=>{
      const card=state.cards.get(player.name), fatigue=state.fatigue.get(player.name)||player.fatigue;
      const caution=defensive&&card?.yellow?(safeDefenders ? .3 : .72):1;
      return Math.max(1,weight(roundPlayerView(player))*caution*clamp(fatigue/100,.48,1));
    });
    let draw=random()*weights.reduce((sum,value)=>sum+value,0);
    return roundPlayerView(options.find((player,index)=>(draw-=weights[index])<=0)||options[0]);
  };
  const roundFormationEffect=formation=>formationPerformance[formation]||{attack:0,passing:0,defense:0};
  const roundProfile=(state,isHome)=>{
    const active=state.lineup.filter(player=>!state.cards.get(player.name)?.red&&!state.injuries.has(player.name)), tactic=state.tactic, formation=roundFormationEffect(tactic.formation), institution=clubInstitutionalContext(getClubs()[state.name],isHome);
    const adjustedAverage=key=>active.reduce((sum,player)=>sum+matchPlayerStat(player,key)*clamp((state.fatigue.get(player.name)??player.fatigue)/100,.55,1),0)/Math.max(1,active.length);
    const tableRow=getLeagueData().find(row=>row.club===state.name), pointsPerGame=tableRow?tableRow.points/Math.max(1,tableRow.played):1.35;
    const context=(10-getClubs()[state.name].position)*.075+(pointsPerGame-1.35)*.85+(isHome ? 1.4 : 0)+state.day;
    const mentalShift=(tactic.mentality-50)/50, possessionShift=(tactic.possession-50)/50, pressShift=tactic.press/100, lineShift=(tactic.offsideLine-50)/50, yellows=[...state.cards.values()].filter(card=>card.yellow&&!card.red).length;
    const tacticOverall=mentalShift*1.4+possessionShift*1+pressShift*.55-lineShift*.35;
    return {lineup:active,overall:adjustedAverage('overall')+context*.18+institution.overall+tacticOverall+(active.length<11?(active.length-11)*5.8:0)+(isHome?.65:0),attack:adjustedAverage('finishing')*.48+adjustedAverage('speed')*.17+adjustedAverage('dribble')*.12+adjustedAverage('playmaking')*.23+formation.attack+mentalShift*9-possessionShift*2.6+pressShift*1.75+context+institution.attack+(isHome?1.1:0),passing:adjustedAverage('passing')*.6+adjustedAverage('playmaking')*.4+formation.passing+possessionShift*6.5+pressShift*.75+context*.55+institution.passing+(isHome?.35:0),defense:adjustedAverage('marking')*.52+adjustedAverage('tackling')*.48+formation.defense+mentalShift*-5.5+(1-possessionShift)*.9+pressShift*3.5-lineShift*2.1+context*.4+institution.defense-yellows*.55+(isHome?.45:0),keeper:active.find(player=>player.pos==='GOL')||state.lineup[0]};
  };
  const simulateRoundMatch=(homeClub,awayClub,fixture=null)=>{
    const homeSide=getClubs()[homeClub],awaySide=getClubs()[awayClub];
    if(!homeSide?.roster||!awaySide?.roster){
      return {
        home:homeClub,away:awayClub,homeGoals:0,awayGoals:0,
        data:{homeShots:0,awayShots:0,homeOnTarget:0,awayOnTarget:0,homeOff:0,awayOff:0,homeSaved:0,awaySaved:0,homeKeeperSaves:0,awayKeeperSaves:0,homePenalties:0,awayPenalties:0,homeOffsides:0,awayOffsides:0,homeFouls:0,awayFouls:0,homeYellow:0,awayYellow:0,homeRed:0,awayRed:0,homeCorners:0,awayCorners:0,homeTackles:0,awayTackles:0,homePasses:0,awayPasses:0,homeAccurate:0,awayAccurate:0,homePossession:50,awayPossession:50,homeXg:0,awayXg:0},
        events:[],goals:{home:[],away:[]},substitutions:{home:0,away:0},fatigueAfter:{home:{},away:{}},
        discipline:{home:[],away:[]},injuries:{home:[],away:[]},deferredInjuries:{home:[],away:[]},workload:{home:[],away:[]},
        tactics:{home:{},away:{}},
      };
    }
    const eligibility=typeof resolveStoppageEligibility==='function'
      ?resolveStoppageEligibility(fixture||{home:homeClub,away:awayClub})
      :{knockout:isKnockoutShootoutCompetition(fixture),round:Number(fixture?.round)||0,totalRounds:0};
    const extendedStoppage=allowsExtendedSecondHalfStoppage(eligibility||{});
    const createState=(club,opponent,isHome)=>{const built=buildSimLineup(club,opponent,isHome),{lineup,bench}=built,cards=new Map(lineup.map(player=>[player.name,{yellow:0,red:false,dismissal:null}])),institution=clubInstitutionalContext(club);return {name:club.name,lineup,bench,cards,injuries:new Map(),deferredInjuries:[],fatigue:new Map((club.roster||[]).map(player=>[player.name,player.fatigue])),openingLineup:lineup.map(player=>player.name),minutesPlayed:new Map(lineup.map(player=>[player.name,0])),tactic:{...(club._benchmarkTactic??roundTactic(club))},day:institution.volatility?rnd(-4.8,4.8)*institution.volatility:0,momentum:0,substitutions:0,windows:0,lastShift:''};};
    const states={home:createState(homeSide,awaySide,true),away:createState(awaySide,homeSide,false)}, metrics={home:{possession:50,passes:0,accurate:0,shots:0,on:0,off:0,saved:0,penalties:0,fouls:0,yellow:0,red:0,corners:0,offsides:0,tackles:0,xg:0,attacks:0,goodAttacks:0},away:{possession:50,passes:0,accurate:0,shots:0,on:0,off:0,saved:0,penalties:0,fouls:0,yellow:0,red:0,corners:0,offsides:0,tackles:0,xg:0,attacks:0,goodAttacks:0}};
    const events=[],goals={home:[],away:[]};let homeGoals=0,awayGoals=0,cardEvents=0,homePossession=50;
    const addEvent=(minute,text,type='')=>events.push({minute,text,type});
    const scoreFor=side=>side==='home'?homeGoals-awayGoals:awayGoals-homeGoals;
    const maxSubWindows=(side,minute)=>scoreFor(side)<0&&minute>=70?4:3;
    const adaptTactic=(side,minute)=>{const state=states[side],diff=scoreFor(side);let mode='balanced';if(minute>=58&&diff<0)mode=minute>=75?'all-in':'chasing';else if(minute>=68&&diff>0)mode='protecting';if(mode===state.lastShift)return;state.lastShift=mode;if(mode==='chasing'){state.tactic.mentality=clamp(state.tactic.mentality+10,20,82);state.tactic.press=clamp(state.tactic.press+8,25,88);}else if(mode==='all-in'){state.tactic.mentality=88;state.tactic.press=88;state.tactic.possession=clamp(state.tactic.possession+7,22,82);}else if(mode==='protecting'){state.tactic.mentality=clamp(state.tactic.mentality-9,22,72);state.tactic.press=clamp(state.tactic.press-7,28,82);}if(mode!=='balanced')addEvent(minute,`${state.name} ajusta a estratégia para ${mode==='protecting'?'proteger a vantagem':'buscar o resultado'}.`,'tactic');};
    const replacePlayer=(side,minute,outgoing,forced=false)=>{const state=states[side];if(state.substitutions>=5||state.windows>=maxSubWindows(side,minute)||!state.bench.length||!outgoing)return false;const compatible=state.bench.filter(player=>player.pos===outgoing.pos||(compatibleRoles[outgoing.pos]||[]).includes(player.pos)),candidates=compatible.length?compatible:state.bench,incoming=[...candidates].sort((a,b)=>b.overall-a.overall||b.fatigue-a.fatigue)[0];if(!incoming)return false;const slot=state.lineup.indexOf(outgoing);state.lineup[slot]=incoming;state.bench=state.bench.filter(player=>player!==incoming);state.bench.push(outgoing);state.cards.set(incoming.name,{yellow:0,red:false,dismissal:null});state.fatigue.set(incoming.name,clamp(incoming.fatigue-minute*.025,0,100));if(!state.minutesPlayed.has(incoming.name))state.minutesPlayed.set(incoming.name,0);state.substitutions++;state.windows++;addEvent(minute,`${state.name}: sai ${outgoing.name}, entra ${incoming.name}${incoming.pos!==outgoing.pos?' improvisado na função':''}.`,forced?'injury-substitution':'substitution');return true;};
    const makeSubstitution=(side,minute)=>{const state=states[side];if(state.substitutions>=5||state.windows>=maxSubWindows(side,minute)||!state.bench.length)return;const active=state.lineup.filter(player=>!state.cards.get(player.name)?.red&&!state.injuries.has(player.name)&&player.pos!=='GOL'),outgoing=[...active].sort((a,b)=>substitutionPriority(state,side,b,minute)-substitutionPriority(state,side,a,minute))[0];if(!outgoing)return;const fatigue=state.fatigue.get(outgoing.name)??outgoing.fatigue,priority=substitutionPriority(state,side,outgoing,minute),need=clamp(.3+(scoreFor(side)<0?.28:0)+(minute>=70?.22:0)+Math.max(0,FATIGUE_SUB_THRESHOLD-fatigue)/42+priority/95,(fatigue<FATIGUE_SUB_THRESHOLD?.45:.22),.95);if(random()<=need)replacePlayer(side,minute,outgoing);};
    const applyEventInjury=(injuredSide,player,minute,eventContext)=>{
      const state=states[injuredSide],club=getClubs()[state.name];if(!player||!state||state.cards.get(player.name)?.red||state.injuries.has(player.name)||state.deferredInjuries.some(entry=>entry.name===player.name))return false;
      const incident=resolvePhysicalIncident(player,{...eventContext,minute,fatigue:state.fatigue.get(player.name)??player.fatigue,minutesPlayed:state.minutesPlayed.get(player.name)??0,club,pitchCondition:club.pitchCondition,tactic:state.tactic,occurredDuring:'match'});
      if(!incident)return false;
      if(incident.tier==='discomfort'){addEvent(minute,incident.comment,'discomfort');state.fatigue.set(player.name,clamp((state.fatigue.get(player.name)??player.fatigue)-2,0,100));return false;}
      if(incident.tier==='playThrough'){
        const entry=buildDeferredInjuryEntry(player,incident.injury,{...eventContext,minute,fatigue:state.fatigue.get(player.name)??player.fatigue},minute);
        state.deferredInjuries.push(entry);
        addEvent(minute,incident.comment,'discomfort');
        if(random()<calculatePlayThroughSubChance(player,incident.injury,entry.context)&&replacePlayer(injuredSide,minute,player,false)){entry.preemptiveSubstitution=true;entry.keptPlaying=false;}
        return false;
      }
      state.injuries.set(player.name,incident.injury);addEvent(minute,incident.comment,'injury');replacePlayer(injuredSide,minute,player,true);return true;
    };
    const registerFoul=(defendingSide,attackingSide,minute,attacker,defender,zone='intermediária')=>{const defending=states[defendingSide],m=metrics[defendingSide],state=defending.cards.get(defender.name)||{yellow:0,red:false,dismissal:null},institution=clubInstitutionalContext(getClubs()[defending.name],defendingSide==='home');m.fouls++;const threat=zone==='entrada da área' ? .82 : zone==='faixa final' ? .7 : .46,type=threat>.75?'falta para matar contra-ataque':threat>.55?'falta defensiva':'falta ofensiva';const duel=(attacker.dribble*.45+attacker.speed*.25+attacker.finishing*.15-defender.marking*.4-defender.tackling*.45)/120;const defensiveMind=clamp((50-defending.tactic.mentality)/50,0,1),pressure=defending.tactic.press/100;let booking=clamp(engineTuning.bookingBase+Math.max(0,duel)*.19+pressure*.08+defensiveMind*.06+(type.includes('contra') ? .14 : type==='falta defensiva' ? .055 : 0)+(zone==='entrada da área' ? .045 : 0)+institution.discipline*.34,.035,.36);if(state.yellow)booking*=type.includes('contra')&&threat>.75 ? .48 : .13;let message=`${type[0].toUpperCase()+type.slice(1)} de ${defender.name} em ${attacker.name}, na ${zone}.`;if(random()<booking&&cardEvents<5){const directRed=threat>.9&&random()<.009;const redContext={threat,type,zone};if(!directRed){state.yellow++;m.yellow++;}if(directRed||state.yellow>=2){state.red=true;state.dismissal=directRed?directRedDismissalType(redContext):'secondYellow';state.redContext=directRed?redContext:null;m.red++;message+=directRed?' Cartão vermelho direto.':' Segundo amarelo: cartão vermelho.';addEvent(minute,message,'red');}else addEvent(minute,`${message} Cartão amarelo.`,'yellow');cardEvents++;defending.cards.set(defender.name,state);}else addEvent(minute,message,'foul');const foulVictim=pickInjuryVictim({eventPhase:zone==='entrada da área'?'final':'duel',contact:true,intensity:clamp(threat,.45,.9),zone},attacker,defender);applyEventInjury(foulVictim===attacker?attackingSide:defendingSide,foulVictim,minute,{eventPhase:zone==='entrada da área'?'final':'duel',contact:true,intensity:clamp(threat,.45,.9),zone});return zone==='entrada da área'&&type!=='falta ofensiva'&&random()<.22;};
    let currentStoppage=0;
    const attempt=(side,minute,type='normal')=>{const other=side==='home'?'away':'home',state=states[side],rival=states[other],attack=roundProfile(state,side==='home'),defend=roundProfile(rival,other==='home'),m=metrics[side],om=metrics[other];const roles=['ATA','PE','PD','MEI','MC','LAT','VOL'];const shooter=roundWeightedActor(state,roles,player=>type==='penalty'?player.penaltyTaking:type==='freeKick'?player.freeKick:type==='corner'?player.heading:player.finishing+player.dribble*.2+player.speed*.1);const keeper=defend.keeper;if(!shooter||!keeper)return;m.shots++;let goalChance,onTargetChance,xg;if(type==='penalty'){goalChance=penaltyGoalChanceRate(shooter.penaltyTaking,keeper.penaltySaving,shooter,keeper);onTargetChance=1;xg=goalChance;}else if(type==='freeKick'){const specialist=isFreeKickSpecialist(shooter);const fkEdge=specialist?Math.max(0,shooter.freeKick-28)/70:0;xg=specialist?clamp(.09+fkEdge*.12+(attack.attack-defend.defense)/900,.08,.21):.028;onTargetChance=specialist?clamp(.42+(shooter.freeKick-keeper.positioning)/220,.38,.62):.31;goalChance=clamp(xg/onTargetChance+(specialist?SPECIALIST_BONUS.freeKick:0),.075,.5);}else if(type==='corner'){const aerialDefense=roundAverage(defend.lineup.filter(player=>['ZAG','LAT','VOL'].includes(player.pos)),'heading');onTargetChance=clamp(.3+(shooter.heading-aerialDefense)/165,.22,.57);xg=clamp(.065+(shooter.heading-aerialDefense)/285+(attack.attack-defend.defense)/480+rnd(-.018,.018),.04,.2);goalChance=clamp(xg/onTargetChance,.12,.58);}else{onTargetChance=clamp(.37+(shooter.finishing-keeper.positioning)/158+(attack.attack-defend.defense)/305,.25,.72);const xgBase=engineTuning.xgOpenBase??.118,xgDiv=engineTuning.xgOpenDivisor??210,xgCeil=engineTuning.xgOpenCeil??.27,xgFloor=engineTuning.xgOpenFloor??.062,ovrDiv=engineTuning.xgOverallGapDivisor??720;xg=clamp(xgBase+(shooter.finishing+attack.attack-keeper.reflexes-defend.defense)/xgDiv+(attack.overall-defend.overall)/ovrDiv+rnd(-.028,.028),xgFloor,xgCeil);goalChance=clamp(xg/onTargetChance,.15,.55);const gap=attack.overall-defend.overall;const lead=(side==='home'?homeGoals-awayGoals:awayGoals-homeGoals);const damp=engineBlowoutDamp(gap)*engineScoreDamp(lead);if(damp<1){goalChance*=damp;xg*=damp;}}m.xg+=xg;if(random()>onTargetChance){m.off++;addEvent(minute,`${shooter.name} finaliza${type==='corner'?' de cabeça':''}, mas manda para fora.`,'shot-off');}else{m.on++;const ogChance=ownGoalChance({corner:type==='corner',freeKick:type==='freeKick',penalty:type==='penalty'});if(ogChance>0&&random()<ogChance){const ownScorer=roundWeightedActor(rival,['ZAG','LAT','VOL','GOL','MC'],player=>player.heading+player.marking*.45+(player.pos==='GOL'?35:0),true);if(ownScorer){if(side==='home')homeGoals++;else awayGoals++;goals[side].push({name:ownScorer.name,minute,stoppage:currentStoppage||undefined,type:'own',assist:null});state.momentum+=3.2;rival.momentum-=1.5;addEvent(minute,`GOOOL CONTRA! ${ownScorer.name} desvia para o próprio gol — gol para ${state.name}.`,'goal-own');return;}}if(random()<goalChance){if(side==='home')homeGoals++;else awayGoals++;const assistant=type==='penalty'||type==='freeKick'?null:roundWeightedActor(state,['MC','MEI','PE','PD','LAT','VOL'],player=>player.name===shooter.name?0:player.passing+player.playmaking);goals[side].push({name:shooter.name,minute,stoppage:currentStoppage||undefined,type,assist:assistant?.name||null});state.momentum+=3.5;rival.momentum-=1.2;addEvent(minute,`GOOOL! ${shooter.name} marca${type==='freeKick'?' de falta':type==='corner'?' de cabeça':type==='penalty'?' de pênalti':''} para ${state.name}${assistant?`, assistência de ${assistant.name}`:''}.`,'goal');}else{om.saved++;rival.momentum+=.8;addEvent(minute,`${keeper.name} defende a finalização de ${shooter.name}.`,'save');}}applyEventInjury(side,shooter,minute,{eventPhase:type==='corner'?'corner':type==='penalty'?'penalty':type==='freeKick'?'freeKick':'shot',contact:type==='corner',intensity:type==='penalty'?.9:type==='freeKick'?.75:type==='corner'?.72:.66});};
    
    const stoppageSnap=()=>({fouls:(metrics.home.fouls||0)+(metrics.away.fouls||0),yellow:(metrics.home.yellow||0)+(metrics.away.yellow||0),red:(metrics.home.red||0)+(metrics.away.red||0),subs:(states.home.substitutions||0)+(states.away.substitutions||0),goals:homeGoals+awayGoals});
    const simulateMinute=(minute)=>{
      ['home','away'].forEach(side=>{const state=states[side],institution=clubInstitutionalContext(getClubs()[state.name],side==='home');state.lineup.forEach(player=>{if(!state.cards.get(player.name)?.red){state.fatigue.set(player.name,clamp((state.fatigue.get(player.name)??player.fatigue)-fatigueMinuteWear(player)*institution.wear,0,100));state.minutesPlayed.set(player.name,(state.minutesPlayed.get(player.name)??0)+1);}});state.lineup.forEach(player=>{if(state.cards.get(player.name)?.red||state.injuries.has(player.name))return;const max=playerRehabMaxMinutes(player);if(max&&(state.minutesPlayed.get(player.name)??0)>=max)replacePlayer(side,minute,player,true);});state.deferredInjuries.forEach(entry=>{if(entry.preemptiveSubstitution||entry.aggravated||state.injuries.has(entry.name))return;const player=state.lineup.find(item=>item.name===entry.name);if(!player||state.cards.get(player.name)?.red)return;const minutesAfter=minute-(entry.minuteAtIncident??minute),energy=state.fatigue.get(player.name)??player.fatigue,chance=clamp(.0012+minutesAfter*.0018+(energy<40?.012:0)+(energy<25?.018:0),.0006,.08);if(random()>=chance)return;entry.aggravated=true;const grade=Math.min(3,(entry.injury.grade||1)+1);entry.injury={...entry.injury,grade,severity:injurySeverityLabel(grade),matchStatus:'confirmed',substitutionRequired:true,playedThrough:true};state.injuries.set(player.name,entry.injury);state.deferredInjuries=state.deferredInjuries.filter(item=>item.name!==entry.name);replacePlayer(side,minute,player,true);addEvent(minute,`${player.name} teve o quadro agravado após insistir em campo.`,'injury');});adaptTactic(side,minute);});
      ['home','away'].forEach(side=>{const chase=scoreFor(side)<0,windows=[...engineTuning.subWindows,...(chase?engineTuning.subChaseWindows:[])];if(windows.includes(minute))makeSubstitution(side,minute);});
      const hp=roundProfile(states.home,true),ap=roundProfile(states.away,false),dynamicTarget=clamp(50+(hp.passing-ap.passing)*.52+(hp.overall-ap.overall)*.24+(states.home.tactic.possession-states.away.tactic.possession)*.16+(states.home.tactic.press-states.away.tactic.press)*.035+(states.home.tactic.mentality-states.away.tactic.mentality)*.025+(states.home.momentum-states.away.momentum)*.3+3,31,69);homePossession=homePossession*.7+dynamicTarget*.3;metrics.home.possession=homePossession;metrics.away.possession=100-homePossession;
      ['home','away'].forEach(side=>{const own=side==='home'?hp:ap,other=side==='home'?ap:hp,share=(side==='home'?homePossession:100-homePossession)/100,total=Math.max(1,Math.round(rnd(5,12)*share)),accuracy=clamp(.68+(own.passing-other.defense)/210+states[side].tactic.possession/650-states[side].tactic.press/1800,.61,.91);metrics[side].passes+=total;metrics[side].accurate+=Math.round(total*accuracy);});
      const scorelessTempo=homeGoals+awayGoals===0&&minute>=30?clamp((minute-25)/360,.015,.16):0,chasingTempo=minute>=60&&homeGoals!==awayGoals?.035:0,actionRate=clamp(engineTuning.actionRateBase+scorelessTempo+chasingTempo,engineTuning.actionRateMin,engineTuning.actionRateMax);
      if(random()>actionRate)return;const side=random()*100<homePossession?'home':'away',other=side==='home'?'away':'home',state=states[side],rival=states[other],attack=side==='home'?hp:ap,defend=side==='home'?ap:hp,m=metrics[side],om=metrics[other];m.attacks++;const creator=roundWeightedActor(state,['MC','MEI','PE','PD','VOL','LAT'],player=>player.passing+player.playmaking),attacker=roundWeightedActor(state,['ATA','PE','PD','MEI','MC'],player=>player.finishing+player.dribble*.25+player.speed*.12),defender=roundWeightedActor(rival,['ZAG','LAT','VOL','MC'],player=>player.marking+player.tackling,true);if(!creator||!attacker||!defender)return;
      const creation=clamp(engineTuning.creationBase+(creator.passing*.46+creator.playmaking*.34+attacker.dribble*.12+attacker.speed*.08-defender.marking*.45-defender.tackling*.45)/130+(attack.passing-defend.defense)/130+(state.momentum-rival.momentum)/100,.22,.86);
      if(random()>creation){const foulRisk=engineFoulRisk(rival.tactic,attacker,defender);if(random()<foulRisk){const zone=random()<.18?'entrada da área':'intermediária',direct=registerFoul(other,side,minute,attacker,defender,zone);if(direct)attempt(side,minute,'freeKick');}else{om.tackles++;rival.momentum+=1.1;state.momentum-=.4;addEvent(minute,`${defender.name} desarma ${attacker.name}.`,'tackle');const tackleVictim=pickInjuryVictim({eventPhase:'tackle',contact:true,intensity:.58},attacker,defender);applyEventInjury(tackleVictim===attacker?side:other,tackleVictim,minute,{eventPhase:'tackle',contact:true,intensity:.58});}return;}
      m.goodAttacks++;state.momentum+=1.2;addEvent(minute,`${creator.name} encontra ${attacker.name}; ${state.name} acelera a jogada.`,'build');applyEventInjury(side,attacker,minute,{eventPhase:'build',contact:false,intensity:clamp(.62+creation*.18,.55,.88)});{const awarded=(metrics.home.penalties||0)+(metrics.away.penalties||0);const scoreChase=minute>=55&&Math.abs(homeGoals-awayGoals)<=1;const penP=enginePenaltyChance({minute,fouls:(metrics.home.fouls||0)+(metrics.away.fouls||0),yellow:(metrics.home.yellow||0)+(metrics.away.yellow||0),red:(metrics.home.red||0)+(metrics.away.red||0),pressHome:state.tactic.press,pressAway:rival.tactic.press,alreadyAwarded:awarded,scoreChase,duelEdge:(attacker.dribble-defender.tackling)/100,forGoodAttack:true});if(random()<penP){m.penalties++;addEvent(minute,`Pênalti para ${state.name}!`,'penalty');attempt(side,minute,'penalty');return;}}const outcome=random();if(outcome<.5)attempt(side,minute);else if(outcome<.69){m.corners++;addEvent(minute,`${attacker.name} força o escanteio para ${state.name}.`,'corner');if(random()<.58)attempt(side,minute,'corner');}else if(outcome<.86){const direct=registerFoul(other,side,minute,attacker,defender,'entrada da área');if(direct)attempt(side,minute,'freeKick');}else{const line=state.tactic.offsideLine??50,offsideChance=clamp(.015+(line/100)*.17,.01,.18);if(random()<offsideChance){m.offsides++;addEvent(minute,`${attacker.name} é flagrado em impedimento.`,'offside');}else addEvent(minute,`${defender.name} recua a linha e neutraliza a chegada de ${attacker.name}.`,'tackle');}
      states.home.momentum=clamp(states.home.momentum*.94,-15,15);states.away.momentum=clamp(states.away.momentum*.94,-15,15);
    };
    for(let minute=1;minute<=45;minute++){currentStoppage=0;simulateMinute(minute);}
    const firstHalfStoppageCtx=stoppageSnap();
    const stoppageFirst=rollStoppageMinutes({...firstHalfStoppageCtx,half:'first',extendedStoppage:false,random});
    addEvent(45,`Árbitro indica ${stoppageFirst} minuto${stoppageFirst>1?'s':''} de acréscimo no 1º tempo.`,'stoppage');
    for(let sTick=1;sTick<=stoppageFirst;sTick++){currentStoppage=sTick;simulateMinute(45);}
    currentStoppage=0;
    for(let minute=46;minute<=90;minute++){currentStoppage=0;simulateMinute(minute);}
    const fullStoppageCtx=stoppageSnap();
    const stoppageSecond=rollStoppageMinutes({fouls:Math.max(0,fullStoppageCtx.fouls-firstHalfStoppageCtx.fouls),yellow:Math.max(0,fullStoppageCtx.yellow-firstHalfStoppageCtx.yellow),red:Math.max(0,fullStoppageCtx.red-firstHalfStoppageCtx.red),subs:Math.max(0,fullStoppageCtx.subs-firstHalfStoppageCtx.subs),goals:Math.max(0,fullStoppageCtx.goals-firstHalfStoppageCtx.goals),half:'second',extendedStoppage,random});
    addEvent(90,`Árbitro indica ${stoppageSecond} minuto${stoppageSecond>1?'s':''} de acréscimo no 2º tempo.`,'stoppage');
    for(let sTick=1;sTick<=stoppageSecond;sTick++){currentStoppage=sTick;simulateMinute(90);}
    currentStoppage=0;
    const data={homeShots:metrics.home.shots,awayShots:metrics.away.shots,homeOnTarget:metrics.home.on,awayOnTarget:metrics.away.on,homeOff:metrics.home.off,awayOff:metrics.away.off,homeSaved:metrics.away.saved,awaySaved:metrics.home.saved,homeKeeperSaves:metrics.home.saved,awayKeeperSaves:metrics.away.saved,homePenalties:metrics.home.penalties||0,awayPenalties:metrics.away.penalties||0,homeOffsides:metrics.home.offsides,awayOffsides:metrics.away.offsides,homeFouls:metrics.home.fouls,awayFouls:metrics.away.fouls,homeYellow:metrics.home.yellow,awayYellow:metrics.away.yellow,homeRed:metrics.home.red,awayRed:metrics.away.red,homeCorners:metrics.home.corners,awayCorners:metrics.away.corners,homeTackles:metrics.home.tackles,awayTackles:metrics.away.tackles,homePasses:metrics.home.passes,awayPasses:metrics.away.passes,homeAccurate:metrics.home.accurate,awayAccurate:metrics.away.accurate,homePossession:Math.round(homePossession),awayPossession:100-Math.round(homePossession),homeXg:Number(metrics.home.xg.toFixed(2)),awayXg:Number(metrics.away.xg.toFixed(2))};
    const fatigueAfter={home:Object.fromEntries(states.home.fatigue),away:Object.fromEntries(states.away.fatigue)};
    const buildWorkloadSide=state=>[...state.minutesPlayed.entries()].filter(([,minutes])=>minutes>0).map(([name,minutes])=>({name,minutes,started:state.openingLineup.includes(name)}));
    const discipline=Object.fromEntries(['home','away'].map(side=>[side,[...states[side].cards.entries()].filter(([,card])=>card.yellow||card.dismissal).map(([name,card])=>({name,yellow:card.dismissal?0:card.yellow,dismissal:card.dismissal||null,redContext:card.redContext||null}))])),injuries=Object.fromEntries(['home','away'].map(side=>[side,[...states[side].injuries.entries()].map(([name,injury])=>({name,injury}))])),deferredInjuries=Object.fromEntries(['home','away'].map(side=>[side,states[side].deferredInjuries.map(entry=>({name:entry.name,injury:entry.injury,minuteAtIncident:entry.minuteAtIncident,context:entry.context,keptPlaying:entry.keptPlaying,preemptiveSubstitution:entry.preemptiveSubstitution,aggravated:entry.aggravated}))])),workload=Object.fromEntries(['home','away'].map(side=>[side,buildWorkloadSide(states[side])])),tactics={home:{...states.home.tactic},away:{...states.away.tactic}};
    return {home:homeClub,away:awayClub,homeGoals,awayGoals,data,events,goals,substitutions:{home:states.home.substitutions,away:states.away.substitutions},fatigueAfter,discipline,injuries,deferredInjuries,workload,tactics};
  };

  return {
    moduleVersion: MODULE_VERSIONS.matchSim,
    simulateRoundMatch,
    roundAverage,
    roundPlayerView,
  };
}
