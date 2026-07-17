import { clamp } from '../ui/dom.js';
import { MODULE_VERSIONS } from '../core/constants.js';

/**
 * Motor de lesões — catálogo, risco, reabilitação e disponibilidade.
 * UI de tratamento permanece no engine legado.
 */
export function createInjuryEngine(deps) {
  const { rnd, int, gameRandom, getCurrentRound, getCareerSeason } = deps;

  const clubMedicalQuality=club=>clamp(Math.round((club?.finances??50)*.5+(club?.environment??50)*.38+(club?.medicalInvestment??0)*6),35,98);
  const pitchInjuryModifier=condition=>condition==='poor'?1.08:condition==='average'?1.03:1;
  const pitchLabel=condition=>({good:'GRAMADO BOM',average:'GRAMADO MÉDIO',poor:'GRAMADO RUIM'})[condition]||'GRAMADO BOM';
  const preventionWorkloadEase=club=>clamp(1-(club?.preventionProgram??0)*.18,.64,1);
  const effectiveWorkloadRisk=(player,club)=>{const base=workloadRisk(player.workload);return 1+(base-1)*preventionWorkloadEase(club);};
  const injuryAllowsTreatmentChoice=injury=>injury?.grade===2;
  const medicalDepartmentLabel=quality=>quality>=82?'DEPARTAMENTO ELITE':quality>=68?'ESTRUTURA SÓLIDA':quality>=52?'PADRÃO':'ESTRUTURA LIMITADA';
  const medicalRecoveryModifier=club=>clamp(1.07-(clubMedicalQuality(club)-50)/720,.9,1.06);
  const medicalPreventionModifier=(club,mechanism)=>{
    if(!club)return 1;
    if(mechanism==='block'||mechanism==='fall'||mechanism==='tackle')return clamp(1-(clubMedicalQuality(club)-50)/900,.96,1.01);
    return clamp(1-(clubMedicalQuality(club)-50)/460,.9,1.03);
  };
  const medicalDiagnosisModifier=club=>clamp(1+(clubMedicalQuality(club)-50)/220,.94,1.1);
  const medicalRehabSupport=club=>{
    const quality=clubMedicalQuality(club);
    return {dayMultiplier:clamp(1+(quality-50)/95,1,1.35),recurrenceFactor:clamp(1-(quality-50)/280,.78,1),minutesBonus:Math.round((quality-50)/10),restrictedDaysFactor:clamp(1-(quality-50)/320,.82,1)};
  };
  const resolveInjuryTreatment=(definition,gradeEntry,club,grade)=>{
    const preferred=gradeEntry.treatment||'conservative';
    if(preferred!=='surgery')return {treatment:'conservative',surgery:false,physiotherapy:true,daysFactor:1};
    const quality=clubMedicalQuality(club);
    if(grade>=3)return {treatment:'surgery',surgery:true,physiotherapy:true,daysFactor:clamp(.9-(quality-50)/900,.84,.94)};
    if(quality>=70&&grade===2&&gameRandom()<.32)return {treatment:'surgery',surgery:true,physiotherapy:true,daysFactor:.9};
    if(quality<48&&gameRandom()<.24)return {treatment:'conservative',surgery:false,physiotherapy:true,daysFactor:1.08,examPending:true};
    return {treatment:'surgery',surgery:true,physiotherapy:true,daysFactor:.95};
  };
  const treatmentLabel=treatment=>treatment==='surgery'?'CIRURGIA':treatment==='physiotherapy'?'FISIOTERAPIA':'TRATAMENTO CONSERVADOR';
  const injuryCategoryWeights={muscle:44,contusion:21,ankle:15,knee:9,tendon:5,fracture:2,other:4};
  const mechanismCategoryWeights={
    sprint:{muscle:75,tendon:15,ankle:5,knee:5},
    tackle:{contusion:45,ankle:25,knee:17,fracture:8,muscle:5},
    directionChange:{ankle:38,knee:32,muscle:25,other:5},
    aerialDuel:{contusion:50,ankle:18,knee:12,fracture:10,other:10},
    shot:{muscle:55,contusion:25,knee:10,ankle:10},
    block:{contusion:60,fracture:15,ankle:15,muscle:10},
    fall:{contusion:35,ankle:25,knee:20,fracture:15,muscle:5},
    unknown:injuryCategoryWeights
  };
  const injuryCatalog=[
    {type:'mild_contusion',category:'contusion',name:'Contusão leve',bodyPart:'thigh',sideable:true,mechanisms:['tackle','aerialDuel','block','fall'],typeWeight:4,matchHint:'forte contusão após uma dividida',grades:[{grade:1,severity:'Leve',days:[1,7],recurrenceRisk:.04,treatment:'conservative',weight:1}]},
    {type:'muscle_hematoma',category:'contusion',name:'Hematoma muscular',bodyPart:'thigh',sideable:true,mechanisms:['tackle','aerialDuel','block','fall'],typeWeight:2.2,matchHint:'hematoma após contato forte',grades:[{grade:1,severity:'Leve',days:[3,10],recurrenceRisk:.06,treatment:'conservative',weight:.62},{grade:2,severity:'Mediana',days:[10,21],recurrenceRisk:.1,treatment:'conservative',weight:.38}]},
    {type:'hamstring_strain',category:'muscle',name:'Estiramento de isquiotibiais',bodyPart:'hamstring',sideable:true,mechanisms:['sprint','directionChange','shot'],typeWeight:4.5,matchHint:'desconforto na parte posterior da coxa após uma arrancada',grades:[{grade:1,severity:'Leve',days:[7,14],recurrenceRisk:.12,treatment:'conservative',weight:.5},{grade:2,severity:'Mediana',days:[15,35],recurrenceRisk:.18,treatment:'conservative',weight:.35},{grade:3,severity:'Grave',days:[45,90],recurrenceRisk:.24,treatment:'conservative',weight:.15}]},
    {type:'hamstring_rupture',category:'muscle',name:'Ruptura de isquiotibiais',bodyPart:'hamstring',sideable:true,mechanisms:['sprint','shot'],typeWeight:.25,matchHint:'ruptura muscular na posterior da coxa',grades:[{grade:3,severity:'Grave',days:[90,150],recurrenceRisk:.28,treatment:'surgery',weight:1}]},
    {type:'quadriceps_strain',category:'muscle',name:'Lesão de quadríceps',bodyPart:'quadriceps',sideable:true,mechanisms:['sprint','shot','directionChange'],typeWeight:3,matchHint:'desconforto no quadríceps após esforço máximo',grades:[{grade:1,severity:'Leve',days:[7,14],recurrenceRisk:.1,treatment:'conservative',weight:.52},{grade:2,severity:'Mediana',days:[15,30],recurrenceRisk:.16,treatment:'conservative',weight:.33},{grade:3,severity:'Grave',days:[40,75],recurrenceRisk:.22,treatment:'conservative',weight:.15}]},
    {type:'adductor_strain',category:'muscle',name:'Lesão de adutor',bodyPart:'adductor',sideable:true,mechanisms:['directionChange','sprint','shot'],typeWeight:2.6,matchHint:'desconforto na virilha após mudança de direção',grades:[{grade:1,severity:'Leve',days:[7,14],recurrenceRisk:.11,treatment:'conservative',weight:.55},{grade:2,severity:'Mediana',days:[15,28],recurrenceRisk:.17,treatment:'conservative',weight:.35},{grade:3,severity:'Grave',days:[35,60],recurrenceRisk:.23,treatment:'conservative',weight:.1}]},
    {type:'calf_strain',category:'muscle',name:'Lesão de panturrilha',bodyPart:'calf',sideable:true,mechanisms:['sprint','directionChange'],typeWeight:2.8,matchHint:'desconforto na panturrilha após aceleração',grades:[{grade:1,severity:'Leve',days:[5,12],recurrenceRisk:.1,treatment:'conservative',weight:.58},{grade:2,severity:'Mediana',days:[12,28],recurrenceRisk:.15,treatment:'conservative',weight:.32},{grade:3,severity:'Grave',days:[30,55],recurrenceRisk:.2,treatment:'conservative',weight:.1}]},
    {type:'ankle_sprain_mild',category:'ankle',name:'Entorse leve de tornozelo',bodyPart:'ankle',sideable:true,mechanisms:['tackle','directionChange','aerialDuel','fall'],typeWeight:3.8,matchHint:'problema no tornozelo em uma disputa pela bola',grades:[{grade:1,severity:'Leve',days:[5,12],recurrenceRisk:.08,treatment:'conservative',weight:1}]},
    {type:'ankle_sprain_moderate',category:'ankle',name:'Entorse moderada de tornozelo',bodyPart:'ankle',sideable:true,mechanisms:['tackle','directionChange','aerialDuel','fall'],typeWeight:2.4,matchHint:'entorse no tornozelo após aterrissagem',grades:[{grade:2,severity:'Mediana',days:[12,28],recurrenceRisk:.14,treatment:'conservative',weight:1}]},
    {type:'ankle_ligament_rupture',category:'ankle',name:'Ruptura ligamentar do tornozelo',bodyPart:'ankle',sideable:true,mechanisms:['tackle','directionChange','fall'],typeWeight:.35,matchHint:'lesão grave no tornozelo',grades:[{grade:3,severity:'Grave',days:[45,90],recurrenceRisk:.2,treatment:'surgery',weight:1}]},
    {type:'knee_ligament_sprain',category:'knee',name:'Distensão do ligamento do joelho',bodyPart:'knee',sideable:true,mechanisms:['directionChange','tackle','aerialDuel'],typeWeight:2.2,matchHint:'incidente no joelho após contato',grades:[{grade:1,severity:'Leve',days:[10,21],recurrenceRisk:.1,treatment:'conservative',weight:.45},{grade:2,severity:'Mediana',days:[22,45],recurrenceRisk:.16,treatment:'conservative',weight:.55}]},
    {type:'meniscus_injury',category:'knee',name:'Lesão meniscal',bodyPart:'knee',sideable:true,mechanisms:['directionChange','tackle','aerialDuel'],typeWeight:.9,matchHint:'lesão no joelho após rotação',grades:[{grade:2,severity:'Mediana',days:[30,60],recurrenceRisk:.18,treatment:'surgery',weight:.55},{grade:3,severity:'Grave',days:[60,150],recurrenceRisk:.22,treatment:'surgery',weight:.45}]},
    {type:'acl_rupture',category:'knee',name:'Ruptura do Ligamento Cruzado Anterior',bodyPart:'knee',sideable:true,mechanisms:['directionChange','tackle'],typeWeight:.12,matchHint:'joelho após girar com o pé apoiado no gramado',grades:[{grade:3,severity:'Grave',days:[180,330],recurrenceRisk:.18,treatment:'surgery',weight:1}]},
    {type:'foot_fracture',category:'fracture',name:'Fratura no pé',bodyPart:'foot',sideable:true,mechanisms:['tackle','block','fall','aerialDuel'],typeWeight:.8,matchHint:'trauma grave no pé',grades:[{grade:3,severity:'Grave',days:[45,120],recurrenceRisk:.12,treatment:'surgery',weight:1}]},
    {type:'leg_fracture',category:'fracture',name:'Fratura na perna',bodyPart:'leg',sideable:true,mechanisms:['tackle','aerialDuel','fall'],typeWeight:.5,matchHint:'fratura após choque violento',grades:[{grade:3,severity:'Grave',days:[60,210],recurrenceRisk:.1,treatment:'surgery',weight:1}]}
  ];
  const injurySeverityLabel=grade=>grade===3?'Grave':grade===2?'Mediana':'Leve';
  const injurySideLabel=side=>side==='left'?'esquerdo':side==='right'?'direito':null;
  const pickWeighted=(items,weightFor)=>{const weights=items.map(weightFor),total=weights.reduce((sum,value)=>sum+value,0);if(!total)return items[0];let draw=gameRandom()*total;return items.find((item,index)=>(draw-=weights[index])<=0)||items[items.length-1];};
  const normalizeInjury=injury=>{
    if(!injury)return null;
    const normalized=injury.type&&injury.category?{...injury}:null;
    if(normalized){
      normalized.returnToPlay=normalized.returnToPlay||null;
      normalized.rehabilitationStage=normalized.rehabilitationStage||((normalized.daysRemaining??0)>0?'acute':'fit');
      normalized.medicallyCleared=!!normalized.medicallyCleared;
      normalized.surgery=!!normalized.surgery;
      normalized.physiotherapy=normalized.physiotherapy!==false;
      normalized.examPending=!!normalized.examPending;
      return normalized;
    }
    const legacySeverity=injury.severity||'Mediana';
    return {id:`legacy-${Date.now()}-${int(0,999999)}`,category:'unknown',type:'legacy_injury',name:`Lesão ${legacySeverity}`,bodyPart:'unknown',side:null,mechanism:'unknown',severity:legacySeverity,grade:legacySeverity==='Grave'?3:legacySeverity==='Mediana'?2:1,daysRemaining:injury.daysRemaining,totalDays:injury.totalDays??injury.daysRemaining,startedRound:injury.startedRound,recurrenceRisk:0,performancePenalty:0,treatment:'conservative',occurredDuring:'unknown',eventType:'unknown',minute:null,rehabilitationStage:'acute',medicallyCleared:false,returnToPlay:null,matchStatus:'confirmed',substitutionRequired:true,playedThrough:false,legacy:true};
  };
  const injuryInAcutePhase=injury=>!!(injury?.daysRemaining>0);
  const injuryInRestrictedPhase=injury=>!!(injury&&!injury.daysRemaining&&injury.rehabilitationStage==='restricted'&&injury.returnToPlay);
  const playerInRestrictedReturn=player=>injuryInRestrictedPhase(player?.injury);
  const playerRehabMaxMinutes=player=>player?.injury?.returnToPlay?.maxRecommendedMinutes??null;
  const injuryStatModifier=(player,stat)=>{
    const injury=player?.injury;
    if(!injury||injuryInAcutePhase(injury)||!injuryInRestrictedPhase(injury))return 1;
    const rtp=injury.returnToPlay,progress=clamp((rtp.daysCompleted??0)/Math.max(1,rtp.daysUntilFullFitness??1),0,1),ease=1-progress*.4;
    const mods={speed:.95,dribble:.93,finishing:.97,passing:.97,marking:.96,tackling:.96,heading:.96,playmaking:.97};
    const base=mods[stat]??(1-(injury.performancePenalty||.03));
    return clamp(base-(1-base)*progress*.25-(injury.performancePenalty||0)*ease*.5,.84,1);
  };
  const matchPlayerStat=(player,stat)=>Math.round((player?.[stat]??50)*injuryStatModifier(player,stat));
  const rehabMinuteOverload=(player,minutesPlayed)=>{
    const max=playerRehabMaxMinutes(player);
    if(!max||minutesPlayed==null||minutesPlayed<=max)return 1;
    return clamp(1+(minutesPlayed-max)/18,1,1.65);
  };
  const recurrenceReturnModifier=player=>{
    const rtp=player?.injury?.returnToPlay;
    return injuryInRestrictedPhase(player?.injury)?(rtp?.recurrenceModifier??1.35):1;
  };
  const fatigueExhaustionRisk=energy=>energy>=80?1:energy>=60?1.08:energy>=40?1.22:energy>=25?1.38:1.55;
  const ageInjuryRisk=age=>age>=34?1.18:age>=31?1.1:age>=28?1.04:age<=21?.94:1;
  const pronenessInjuryRisk=proneness=>1+(clamp(proneness??18,5,38)-18)/55;
  const previousInjuryModifier=(player,bodyPart,type)=>{
    const history=player?.injuryHistory||[];
    const related=history.filter(entry=>entry.bodyPart===bodyPart||entry.type===type);
    let mod=1;
    if(related.length){const recent=related.some(entry=>entry.season>=getCareerSeason()-1);mod=recent?1.35:1.12;}
    const injury=player?.injury;
    if(injuryInRestrictedPhase(injury)&&(injury.bodyPart===bodyPart||injury.type===type))mod*=1.28;
    return mod;
  };
  const tacticalInjuryRisk=tactic=>{
    if(!tactic)return 1;
    const press=tactic.press/100,mentality=(tactic.mentality-50)/50,possession=(tactic.possession-50)/50;
    return clamp(1+press*.1+Math.max(0,mentality)*.06+Math.max(0,-possession)*.04,.92,1.22);
  };
  const defaultWorkload=()=>({minutesLast7Days:0,minutesLast14Days:0,matchesLast14Days:0,consecutiveStarts:0,highIntensityLoad:0,lastMatchRound:0});
  const ensureWorkload=player=>{player.workload={...defaultWorkload(),...player.workload};return player.workload;};
  const workloadRisk=workload=>{
    if(!workload)return 1;
    let mod=1,m7=workload.minutesLast7Days??0,m14=workload.minutesLast14Days??0,matches=workload.matchesLast14Days??0,starts=workload.consecutiveStarts??0,hil=workload.highIntensityLoad??0;
    if(m7>=240)mod*=1.22;else if(m7>=180)mod*=1.14;else if(m7>=120)mod*=1.08;
    if(m14>=420)mod*=1.12;else if(m14>=300)mod*=1.06;
    if(matches>=5)mod*=1.16;else if(matches>=4)mod*=1.1;else if(matches>=3)mod*=1.05;
    if(starts>=4)mod*=1.14;else if(starts>=3)mod*=1.08;
    if(hil>=14)mod*=1.12;else if(hil>=8)mod*=1.06;
    return clamp(mod,1,1.55);
  };
  const recoveryRisk=(player,round=getCurrentRound())=>{
    const last=ensureWorkload(player).lastMatchRound??0;
    if(!last||round<=last)return 1.08;
    const daysSince=(round-last)*3;
    if(daysSince<=2)return 1.14;
    if(daysSince<=4)return 1.06;
    if(daysSince>=10)return .94;
    if(daysSince>=7)return .97;
    return 1;
  };
  const tacticalMechanismRisk=(tactic,mechanism)=>{
    if(!tactic)return 1;
    const press=tactic.press/100,possession=tactic.possession/100,mentality=(tactic.mentality-50)/50;
    if(mechanism==='sprint'||mechanism==='directionChange')return clamp(1+press*.12+Math.max(0,mentality)*.1+Math.max(0,.5-possession)*.06,.92,1.35);
    if(mechanism==='tackle'||mechanism==='block'||mechanism==='foul')return clamp(1+press*.08+Math.max(0,mentality)*.06,.94,1.25);
    if(mechanism==='shot')return clamp(1+Math.max(0,mentality)*.05+Math.max(0,.45-possession)*.04,.95,1.18);
    return 1;
  };
  const matchIntensityFactor=tactic=>{
    if(!tactic)return 1;
    return clamp(1+(tactic.press-50)/55+Math.max(0,tactic.mentality-50)/70+Math.max(0,50-tactic.possession)/90,.85,1.45);
  };
  const decayPlayerWorkload=(player,days=3)=>{
    const w=ensureWorkload(player);
    w.minutesLast7Days=Math.max(0,w.minutesLast7Days-days*12);
    w.minutesLast14Days=Math.max(0,w.minutesLast14Days-days*12);
    w.highIntensityLoad=Math.max(0,Number((w.highIntensityLoad-days*.35).toFixed(2)));
    if(w.minutesLast14Days<30)w.matchesLast14Days=0;
  };
  const refreshWorkloadWindows=(player,round=getCurrentRound())=>{
    const w=ensureWorkload(player),roundsSinceLast=w.lastMatchRound?round-w.lastMatchRound:99;
    if(roundsSinceLast>=5)w.matchesLast14Days=0;
    if(roundsSinceLast>=3)w.consecutiveStarts=0;
  };
  const recordPlayerMatchWorkload=(player,minutes,started,tactic,round=getCurrentRound())=>{
    if(!player||minutes<=0)return;
    const w=ensureWorkload(player),intensity=matchIntensityFactor(tactic);
    w.minutesLast7Days+=minutes;
    w.minutesLast14Days+=minutes;
    w.matchesLast14Days++;
    w.lastMatchRound=round;
    w.highIntensityLoad=Number((w.highIntensityLoad+minutes*intensity/90).toFixed(2));
    if(started&&minutes>=45)w.consecutiveStarts++;
    else w.consecutiveStarts=0;
  };
  const workloadLabel=player=>{
    const w=ensureWorkload(player);
    if(w.minutesLast7Days>=210||w.matchesLast14Days>=4||w.consecutiveStarts>=3)return 'CARGA ALTA';
    if(w.minutesLast7Days>=150||w.matchesLast14Days>=3)return 'SOBRECARGA';
    return '';
  };
  const injuryEventTypeFromPhase={duel:'tackle',progression:'directionChange',final:'tackle',shot:'shot',corner:'aerialDuel',penalty:'shot',freeKick:'shot',build:'sprint',tackle:'tackle',block:'block',aerial:'aerialDuel',fall:'fall'};
  const injuryMechanismFromEvent=context=>context?.eventType||injuryEventTypeFromPhase[context?.eventPhase]||'unknown';
  const eventInjuryBaseRisk={tackle:.0018,directionChange:.0014,sprint:.0012,shot:.0011,aerialDuel:.0016,block:.0022,fall:.0015,foul:.002};
  const calculateEventInjuryChance=(player,context)=>{
    const mechanism=injuryMechanismFromEvent(context),energy=context.fatigue??player?.fatigue??100;
    let chance=eventInjuryBaseRisk[mechanism]??context.baseRisk??.0012;
    chance*=fatigueExhaustionRisk(energy)*ageInjuryRisk(player.age)*pronenessInjuryRisk(player.injuryProneness)*tacticalInjuryRisk(context.tactic);
    chance*=effectiveWorkloadRisk(player,context.club||null)*recoveryRisk(player,context.round??getCurrentRound())*tacticalMechanismRisk(context.tactic,mechanism)*recurrenceReturnModifier(player);
    if(context.club)chance*=medicalPreventionModifier(context.club,mechanism);
    if(context.pitchCondition)chance*=pitchInjuryModifier(context.pitchCondition);
    if(context.minutesPlayed!=null)chance*=rehabMinuteOverload(player,context.minutesPlayed);
    if(context.contact)chance*=1.22;
    chance*=.75+(context.intensity??.55)*.55;
    if(context.zone==='entrada da área'||context.phase==='final')chance*=1.12;
    return clamp(chance,.00035,.028);
  };
  const pickInjuryVictim=(context,primary,secondary)=>{
    if(!secondary||!primary)return primary;
    const contact=context.contact!==false,mechanism=injuryMechanismFromEvent(context);
    if(mechanism==='shot'||context.eventPhase==='shot'||context.eventPhase==='penalty'||context.eventPhase==='freeKick'||context.eventPhase==='corner')return primary;
    if(mechanism==='sprint'||context.eventPhase==='build')return primary;
    return gameRandom()<(contact?.78:.42)?primary:secondary;
  };
  const selectInjuryMechanism=context=>injuryMechanismFromEvent(context);
  const selectInjuryCategory=(mechanism,context={})=>{
    const base=mechanismCategoryWeights[mechanism]||mechanismCategoryWeights.unknown;
    let weights={...base};
    const tactic=context.tactic;
    if(tactic&&(mechanism==='sprint'||mechanism==='directionChange')){
      const muscleBoost=1+(tactic.press-50)/90+Math.max(0,tactic.mentality-50)/130;
      weights.muscle=(weights.muscle||44)*muscleBoost;
      if(tactic.possession<35)weights.muscle*=1.08;
    }
    if(tactic&&tactic.press>=72&&(mechanism==='tackle'||mechanism==='foul'))weights.contusion=(weights.contusion||21)*1.08;
    return pickWeighted(Object.entries(weights),([,weight])=>weight)[0];
  };
  const selectInjuryType=(category,player,mechanism)=>{
    const candidates=injuryCatalog.filter(definition=>definition.category===category&&definition.mechanisms.includes(mechanism));
    if(!candidates.length)return injuryCatalog.find(definition=>definition.type==='mild_contusion');
    return pickWeighted(candidates,definition=>definition.typeWeight);
  };
  const determineInjuryGrade=(definition,player,context)=>{
    const energy=context?.fatigue??player?.fatigue??100;
    return pickWeighted(definition.grades,grade=>{
      let weight=grade.weight??(grade.grade===1?.55:grade.grade===2?.32:.1);
      if(player?.age>=32&&grade.grade>=2)weight*=1.15;
      if(energy<45&&grade.grade>=2)weight*=1.2;
      if(workloadRisk(player.workload)>1.1&&grade.grade>=2)weight*=1.1;
      if(previousInjuryModifier(player,definition.bodyPart,definition.type)>1.1&&grade.grade>=2)weight*=1.1;
      return weight;
    }).grade;
  };
  const calculateRecoveryTime=(definition,gradeEntry,player,club,treatmentPlan=null)=>{
    const [minDays,maxDays]=gradeEntry.days;
    let days=int(minDays,maxDays);
    const ageMod=player.age>=34?1.12:player.age>=30?1.06:player.age<=22?.94:1;
    const medicalMod=club?medicalRecoveryModifier(club):1;
    const pronenessMod=1+(clamp(player.injuryProneness??18,5,38)-18)/420;
    const treatmentMod=treatmentPlan?.daysFactor??1;
    days=Math.round(days*ageMod*medicalMod*pronenessMod*treatmentMod*rnd(.9,1.1));
    return Math.max(1,days);
  };
  const buildInjuryRecord=(player,definition,gradeEntry,context,round,tier='confirmed')=>{
    const side=definition.sideable?(gameRandom()<.5?'left':'right'):null;
    const treatmentPlan=tier==='confirmed'||tier==='playThrough'?resolveInjuryTreatment(definition,gradeEntry,context?.club,gradeEntry.grade):{treatment:gradeEntry.treatment||'conservative',surgery:false,physiotherapy:true,daysFactor:1};
    let days=calculateRecoveryTime(definition,gradeEntry,player,context?.club,treatmentPlan);
    if(tier==='playThrough')days=Math.max(1,Math.round(days*(gradeEntry.grade===1?.55:.75)));
    const minimumDays=Math.max(1,Math.round(days*.82)),maximumDays=Math.max(minimumDays,Math.round(days*1.18));
    const recurrenceBase=gradeEntry.recurrenceRisk??.08;
    const recurrenceRisk=Number((recurrenceBase*previousInjuryModifier(player,definition.bodyPart,definition.type)*(context?.club?medicalRehabSupport(context.club).recurrenceFactor:1)).toFixed(3));
    return {id:`injury-${Date.now()}-${int(0,999999)}`,category:definition.category,type:definition.type,name:definition.name,bodyPart:definition.bodyPart,side,mechanism:context?.eventType||'unknown',severity:gradeEntry.severity||injurySeverityLabel(gradeEntry.grade),grade:gradeEntry.grade,daysRemaining:days,totalDays:days,estimatedReturn:{minimumDays,maximumDays},treatment:treatmentPlan.treatment||gradeEntry.treatment||'conservative',surgery:!!treatmentPlan.surgery,physiotherapy:treatmentPlan.physiotherapy!==false,examPending:!!treatmentPlan.examPending,recurrenceRisk,performancePenalty:tier==='playThrough'&&gradeEntry.grade===1?.02:gradeEntry.grade===3?.08:gradeEntry.grade===2?.04:0,occurredDuring:context?.occurredDuring||'match',eventType:context?.eventType||'unknown',minute:context?.minute??null,startedRound:round,rehabilitationStage:tier==='confirmed'?'acute':'monitoring',medicallyCleared:false,returnToPlay:null,matchHint:definition.matchHint,matchStatus:tier,substitutionRequired:tier==='confirmed',playedThrough:tier==='playThrough',diagnosisPending:tier!=='confirmed',legacy:false};
  };
  const classifyIncidentTier=(definition,gradeEntry,context)=>{
    const grade=gradeEntry.grade,intensity=context.intensity??.55;
    if(grade>=3||definition.category==='fracture'||['acl_rupture','hamstring_rupture','ankle_ligament_rupture','leg_fracture','foot_fracture'].includes(definition.type))return 'confirmed';
    if(grade===2)return gameRandom()<.08?'playThrough':'confirmed';
    if(gameRandom()<clamp(.4+(1-intensity)*.16+(definition.category==='contusion'?.1:0),.3,.58))return 'discomfort';
    return gameRandom()<clamp(.38+(definition.type==='mild_contusion'?.14:0),.25,.52)?'playThrough':'confirmed';
  };
  const discomfortMatchComment=(player,definition,minute)=>{
    const side=injurySideLabel(definition.sideable&&gameRandom()<.5?'left':'right');
    const text={muscle:'apresenta leve desconforto muscular, mas permanece em campo',contusion:'reclama de contato forte, mas segue em atividade',ankle:'sentiu o tornozelo, porém continua jogando',knee:'sentiu o joelho, mas permanece em campo',fracture:'sofreu um choque, mas retorna ao jogo',tendon:'apresenta leve incômodo muscular, mas continua'}[definition.category]||'apresenta leve desconforto, mas permanece em campo';
    return `${minute}' ${player.name} ${text}${side?` (${side})`:''}.`;
  };
  const resolvePhysicalIncident=(player,context,round=getCurrentRound())=>{
    if(gameRandom()>=calculateEventInjuryChance(player,context))return null;
    const mechanism=injuryMechanismFromEvent(context),category=selectInjuryCategory(mechanism,context),definition=selectInjuryType(category,player,mechanism),grade=determineInjuryGrade(definition,player,context),gradeEntry=definition.grades.find(item=>item.grade===grade)||definition.grades[0],tier=classifyIncidentTier(definition,gradeEntry,context);
    if(tier==='discomfort')return {tier,player,comment:discomfortMatchComment(player,definition,context.minute)};
    const injury=buildInjuryRecord(player,definition,gradeEntry,{...context,injuryCategory:definition.category},round,tier);
    return {tier,player,injury,comment:injuryMatchComment(player,injury,context.minute,tier)};
  };
  const createInjuryRecord=(player,round=getCurrentRound(),context={})=>{
    const mechanism=selectInjuryMechanism(context),category=selectInjuryCategory(mechanism,context),definition=selectInjuryType(category,player,mechanism),gradeEntry=definition.grades.find(item=>item.grade===determineInjuryGrade(definition,player,context))||definition.grades[0];
    return buildInjuryRecord(player,definition,gradeEntry,context,round,'confirmed');
  };
  const injuryAvailabilityLabel=injury=>{
    if(!injury)return '';
    if(injuryInRestrictedPhase(injury)){
      const rtp=injury.returnToPlay,daysLeft=Math.max(0,(rtp.daysUntilFullFitness??0)-(rtp.daysCompleted??0));
      const treatment=injury.surgery?'PÓS-CIRURGIA':injury.physiotherapy?'REABILITAÇÃO':'RETORNO';
      return `${treatment} · MÁX ${rtp.maxRecommendedMinutes}' · ${daysLeft} ${daysLeft===1?'DIA':'DIAS'}`;
    }
    if(!injury?.daysRemaining)return '';
    const label=injury.name||`Lesão ${injury.severity}`;
    const days=`${injury.daysRemaining} ${injury.daysRemaining===1?'DIA':'DIAS'}`;
    const plan=injury.surgery?' · CIRURGIA':injury.examPending?' · EXAMES':injury.physiotherapy?' · FISIOTERAPIA':'';
    return injury.estimatedReturn?`${label.toUpperCase()}${plan} · ${days}`:`${injury.severity?.toUpperCase()||'LESÃO'}${plan} · ${days}`;
  };
  const injuryMatchComment=(player,injury,minute,tier=injury?.matchStatus||'confirmed')=>{
    const side=injurySideLabel(injury.side);
    if(tier==='discomfort')return discomfortMatchComment(player,{category:injury.category},minute);
    if(tier==='playThrough'){
      const hint={muscle:'sentiu a musculatura e passa por avaliação rápida — pode seguir ou sair',contusion:'reclama de pancada e é avaliado — decisão de campo pendente',ankle:'incômodo no tornozelo — equipe médica consulta o técnico',knee:'desconforto no joelho — avaliação rápida antes de continuar'}[injury.category]||'apresenta incômodo e passa por avaliação rápida — decisão do técnico';
      return `${minute}' ${player.name} ${hint}${side?` (${side})`:''}.`;
    }
    if(injury.diagnosisPending&&injury.category&&injury.category!=='unknown'){
      const suspicion={muscle:'apresenta desconforto muscular e sai de campo',contusion:'sofre uma forte contusão e precisa deixar o jogo',ankle:'sentiu o tornozelo em uma disputa e não continua',knee:'sentiu o joelho e deixa o campo',fracture:'sofre um trauma grave e sai de campo',tendon:'apresenta desconforto muscular e deixa o campo'}[injury.category]||'sai lesionado do campo';
      return `${minute}' ${player.name} ${suspicion}${side?` (${side})`:''}.`;
    }
    if(injury.matchHint&&minute!=null)return `${minute}' ${player.name} ${injury.matchHint}${side?` (${side})`:''}.`;
    const part=injury.bodyPart&&injury.bodyPart!=='unknown'?` na região ${injury.bodyPart}`:'';
    return `${minute!=null?`${minute}' `:''}${player.name} sofre ${injury.name.toLowerCase()}${part}${side?` (${side})`:''} e sai de campo.`;
  };
  const injuryDiagnosisComment=(player,injury,club=null)=>{
    const plan=injury.surgery?` Tratamento: cirurgia${injury.physiotherapy?' + fisioterapia':''}.`:injury.examPending?' Aguardando exames de imagem.':injury.physiotherapy?' Tratamento: fisioterapia e reabilitação.':' Tratamento conservador.';
    const medical=club?` Departamento médico: ${medicalDepartmentLabel(clubMedicalQuality(club))}.`:'';
    return `${player.name}: diagnóstico de ${injury.name.toLowerCase()}${injury.grade?` (grau ${injury.grade})`:''}${injury.playedThrough?' após ter permanecido em campo':''}.${plan} Previsão de retorno entre ${injury.estimatedReturn?.minimumDays??injury.daysRemaining} e ${injury.estimatedReturn?.maximumDays??injury.daysRemaining} dias.${medical}`;
  };
  const buildDeferredInjuryEntry=(player,injury,context,minute)=>({name:player.name,injury,minuteAtIncident:minute??context?.minute??injury.minute??null,context:{fatigue:context?.fatigue??player?.fatigue??100,intensity:context?.intensity??.55,contact:!!context?.contact,eventType:context?.eventType||injury.eventType,mechanism:injury.mechanism},keptPlaying:true,preemptiveSubstitution:false,aggravated:false});
  const calculatePlayThroughSubChance=(player,injury,context={})=>{
    let chance=.28;
    const energy=context.fatigue??player?.fatigue??100;
    if(energy<45)chance+=.22;
    if(energy<30)chance+=.12;
    if((injury.grade??1)>=2)chance+=.25;
    if(context.contact)chance+=.08;
    if((context.intensity??.55)>.72)chance+=.1;
    if(player.age>=32)chance+=.08;
    if((player.injuryProneness??18)>26)chance+=.06;
    if(previousInjuryModifier(player,injury.bodyPart,injury.type)>1.1)chance+=.12;
    return clamp(chance,.18,.88);
  };
  const resolvePostMatchDiagnosis=(player,injury,meta={})=>{
    if(meta.aggravated){
      const grade=Math.min(3,(injury.grade||1)+1);
      return {outcome:'confirmed',injury:{...injury,grade,severity:injurySeverityLabel(grade),matchStatus:'confirmed',substitutionRequired:true,diagnosisPending:false,playedThrough:true}};
    }
    const energy=meta.context?.fatigue??player?.fatigue??100,intensity=meta.context?.intensity??.55,contact=!!meta.context?.contact;
    const minutesAfter=meta.preemptiveSubstitution?0:Math.max(0,90-(meta.minuteAtIncident??45)),grade=injury.grade??1;
    let confirmChance=grade===1?.24:.48;
    if(energy<50)confirmChance+=.14;
    if(energy<35)confirmChance+=.1;
    if(intensity>.72)confirmChance+=.1;
    else if(intensity>.55)confirmChance+=.04;
    if(contact)confirmChance+=.08;
    if(injury.type==='mild_contusion')confirmChance-=.1;
    if(injury.category==='muscle'&&!contact)confirmChance-=.06;
    if(player.age>=32)confirmChance+=.07;
    if((player.injuryProneness??18)>26)confirmChance+=.05;
    if(previousInjuryModifier(player,injury.bodyPart,injury.type)>1.1)confirmChance+=.12;
    if(minutesAfter>25)confirmChance+=.16;
    if(minutesAfter>40)confirmChance+=.12;
    if(workloadRisk(player.workload)>1.12)confirmChance+=.08;
    if(recoveryRisk(player,meta.round??getCurrentRound())>1.05)confirmChance+=.06;
    if(meta.club){
      const medical=medicalDiagnosisModifier(meta.club);
      if(grade===1)confirmChance=clamp(confirmChance/medical,.05,.88);
      else confirmChance=clamp(confirmChance*clamp(medical,.96,1.08),.08,.92);
    }
    if(meta.preemptiveSubstitution)confirmChance*=clamp(.35+(90-minutesAfter)/180,.25,.55);
    confirmChance=clamp(confirmChance,.06,.9);
    const roll=gameRandom();
    if(roll<confirmChance)return {outcome:'confirmed',injury:{...injury,matchStatus:'confirmed',substitutionRequired:true,diagnosisPending:false,playedThrough:true}};
    const monitoringChance=clamp(.42-(energy-60)/180+(meta.preemptiveSubstitution?.15:0)-(contact?.06:0),.18,.62);
    if(roll<confirmChance+monitoringChance){
      const days=Math.max(1,Math.round((injury.daysRemaining||2)*(meta.preemptiveSubstitution?.45:.72)));
      return {outcome:'monitoring',injury:{...injury,matchStatus:'monitoring',substitutionRequired:false,diagnosisPending:false,playedThrough:!meta.preemptiveSubstitution,daysRemaining:days,totalDays:days,estimatedReturn:{minimumDays:Math.max(1,days-1),maximumDays:days+1},rehabilitationStage:'monitoring',performancePenalty:.015}};
    }
    return {outcome:'cleared',injury:null};
  };
  const injuryPostMatchReport=(player,diagnosis)=>{
    if(diagnosis.outcome==='cleared'){
      const cleared={muscle:'exames não indicaram lesão muscular — apto para a próxima partida',contusion:'pancada sem gravidade — liberado pelo departamento médico',ankle:'tornozelo sem alterações — apto',knee:'joelho sem lesão estrutural — liberado'}[diagnosis.category]||'exames não confirmaram lesão — apto para treinar normalmente';
      return `${player.name}: ${cleared}.`;
    }
    if(diagnosis.outcome==='monitoring'){
      const injury=diagnosis.injury;
      return `${player.name}: quadro de ${injury.name.toLowerCase()} leve confirmado${injury.playedThrough?' após ter permanecido em campo':''}. Repouso de ${injury.daysRemaining} ${injury.daysRemaining===1?'dia':'dias'} por precaução.`;
    }
    return injuryDiagnosisComment(player,diagnosis.injury,diagnosis.club);
  };
  const finalizeInjuryRecovery=player=>{
    if(!player?.injury)return;
    const history=player.injuryHistory||[];
    for(let index=history.length-1;index>=0;index--){if(!history[index].recoveredAt){history[index].recoveredAt=new Date().toISOString().slice(0,10);break;}}
    player.injury=null;
  };
  const beginRestrictedReturn=(player,club=null)=>{
    const injury=normalizeInjury(player?.injury);
    if(!injury)return;
    const grade=injury.grade??1,totalDays=injury.totalDays??7,rehab=medicalRehabSupport(club);
    if(grade===1&&totalDays<=4&&gameRandom()<.55){clearInjuryFully(player);return;}
    const restrictedDays=Math.max(2,Math.round((grade===1?int(3,6):grade===2?int(5,11):int(8,16))*rehab.restrictedDaysFactor));
    const maxMinutes=Math.min(90,(grade===1?45:grade===2?35:25)+rehab.minutesBonus);
    injury.daysRemaining=0;
    injury.rehabilitationStage='restricted';
    injury.medicallyCleared=true;
    injury.returnToPlay={status:'restricted',maxRecommendedMinutes:maxMinutes,baseMaxMinutes:maxMinutes,recurrenceModifier:clamp(1.18+(injury.recurrenceRisk??.08)*2.2*rehab.recurrenceFactor,1.12,1.75),daysUntilFullFitness:restrictedDays,daysCompleted:0};
    player.injury=injury;
  };
  const advanceRestrictedRehab=(player,days=3,club=null)=>{
    const injury=player?.injury;
    if(!injuryInRestrictedPhase(injury))return;
    const rtp=injury.returnToPlay,rehab=medicalRehabSupport(club);
    rtp.daysCompleted=(rtp.daysCompleted??0)+days*rehab.dayMultiplier;
    const progress=clamp(rtp.daysCompleted/Math.max(1,rtp.daysUntilFullFitness),0,1);
    rtp.maxRecommendedMinutes=Math.min(90,Math.round((rtp.baseMaxMinutes??rtp.maxRecommendedMinutes)+progress*(90-(rtp.baseMaxMinutes??rtp.maxRecommendedMinutes))+rehab.minutesBonus*.35));
    if(rtp.daysCompleted>=rtp.daysUntilFullFitness)clearInjuryFully(player);
  };
  const clearInjuryFully=player=>{
    if(!player?.injury)return;
    const injury=player.injury,grade=injury.grade??1;
    if(grade>=3&&player.age>=30&&gameRandom()<clamp(.08+(player.age-30)*.01,0,.18)){
      if(player.speed)player.speed=Math.max(42,player.speed-1);
      if(player.dribble)player.dribble=Math.max(42,player.dribble-1);
    }
    finalizeInjuryRecovery(player);
  };
  const playerUnavailable=player=>!!injuryInAcutePhase(player?.injury);
  const playerStarterBlocked=player=>playerUnavailable(player)||playerInRestrictedReturn(player);
  const availabilityLabel=player=>workloadLabel(player)||'';

  return {
    moduleVersion: MODULE_VERSIONS.injury,
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
    playerUnavailable,
    playerStarterBlocked,
    availabilityLabel,
    injurySeverityLabel,
  };
}
