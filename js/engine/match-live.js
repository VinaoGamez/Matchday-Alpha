import { MODULE_VERSIONS } from '../core/constants.js';
import { ownGoalChance } from './match-clock.js';

/**
 * Ações de partida ao vivo — passes, finalização e construção de jogadas.
 * Orquestração (tick, advance, foul, lesões UI) permanece no engine legado.
 */
export function createLiveMatchActions(deps) {
  const {
    clamp,
    rnd,
    random,
    getStats,
    getMinute,
    getStoppageElapsed,
    getStoppageActive,
    getGoals,
    getUserClub,
    getMatchClub,
    getStarters,
    getCards,
    incrementScore,
    updateScoreboard,
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
    pushLiveVolumeIncident,
  } = deps;

  const goalClock = () => {
    const active = !!getStoppageActive?.();
    const stoppage = active ? Math.max(0, Number(getStoppageElapsed?.() || 0)) : 0;
    return {
      minute: getMinute(),
      stoppage: stoppage > 0 ? stoppage : undefined,
    };
  };

  const addPasses = (side, current, other, minutes, share) => {
    const item = getStats()[side];
    const passerName = playerFor(side, 'pass');
    const passer = actorData(side, passerName, 'pass');
    const tactic = tacticFor(side);
    const possessionBias = (tactic.possession - 50) / 105;
    const pressBias = (tactic.press - 50) / 320;
    const total = Math.max(2, Math.round(minutes * rnd(7, 10) * share));
    const accuracy = clamp(
      .62 +
        (passer.passing * 0.56 + passer.playmaking * 0.44 - other.defense) / 125 +
        (current.passing - other.passing) / 175 +
        item.momentum / 220 +
        possessionBias +
        pressBias,
      .58,
      .93,
    );
    item.passes += total;
    item.accurate += Math.round(total * accuracy);
    influencePossession(side, accuracy > 0.79 ? 0.8 : -0.25);
    return accuracy;
  };
  const penaltyGoalChance = (penaltySkill, keeperSaving, specialist) =>
    clamp(.69 + (penaltySkill - keeperSaving) / 95 + (penaltySkill - 70) / 260 + (specialist ? .035 : 0), .56, .94);

  /** Planeja resultado/canto da cobrança (para animação + motor usarem o mesmo desfecho). */
  const planPenaltyOutcome = (side, current, other, options = {}) => {
    const attacker = options.taker || playerFor(side, 'shot');
    const goalkeeper = playerFor(side === 'home' ? 'away' : 'home', 'save');
    const keeperData = actorData(side === 'home' ? 'away' : 'home', goalkeeper, 'save');
    const penaltySkill = Number(options.penaltySkill) || actorData(side, attacker, 'shot').penaltyTaking || 70;
    const specialist = penaltySkill > 85;
    const forced = options.forcedOutcome;
    let outcome = forced;
    if (!outcome) {
      const onTargetChance = clamp(.9 + (penaltySkill - 70) / 350, .8, .96);
      if (random() >= onTargetChance) outcome = 'wide';
      else outcome = random() < penaltyGoalChance(penaltySkill, keeperData.penaltySaving, specialist) ? 'goal' : 'save';
    }
    let corner = options.forcedCorner;
    if (!corner) {
      const roll = random();
      corner = outcome === 'wide'
        ? (roll < .38 ? 'over' : roll < .69 ? 'left' : 'right')
        : roll < .28 ? 'center' : roll < .64 ? 'left' : 'right';
    }
    if (outcome === 'wide' && corner === 'center') corner = random() < .5 ? 'left' : 'right';
    return {
      outcome,
      corner,
      scored: outcome === 'goal',
      taker: attacker,
      goalkeeper,
      penaltySkill,
      specialist,
      kickKey: `${outcome}-${corner}`,
    };
  };

  const shot = (side,current,other,options={}) => {
    const s=getStats()[side], otherStats=getStats()[side === 'home' ? 'away' : 'home'], team=side === 'home' ? getUserClub() : getMatchClub().name;
    const writeLog=options.logFn||log;
    const attacker=options.taker || playerFor(side,'shot'), attackerData=actorData(side,attacker,'shot');
    const goalkeeper=playerFor(side === 'home' ? 'away' : 'home','save'), keeperData=actorData(side === 'home' ? 'away' : 'home',goalkeeper,'save');
    const label=options.shootout ? 'na cobrança do shootout' : options.penalty ? 'na cobrança de pênalti' : options.freeKick ? 'na cobrança de falta' : options.corner ? 'de cabeça após o escanteio' : 'na finalização';
    const finishing=options.corner ? attackerData.heading : options.freeKick ? attackerData.freeKick : attackerData.finishing;
    const freeKickSpecialist=options.freeKick && attackerData.freeKick>85;
    const penaltySpecialist=options.penalty && options.penaltySkill>85;
    if(!options.shootout){s.shots++; influencePossession(side,1.8);}
    const forcedOutcome = options.forcedOutcome;
    const onTarget = forcedOutcome
      ? forcedOutcome !== 'wide'
      : options.penalty || options.shootout
        ? random() < clamp(.9 + ((options.penaltySkill || attackerData.penaltyTaking || 70) - 70) / 350, .8, .96)
        : random()<clamp(options.freeKick ? (freeKickSpecialist ? clamp(.50+(finishing-keeperData.positioning)/170+(current.attack-other.defense)/600,.42,.58) : clamp(.30+(finishing-keeperData.positioning)/220,.25,.42)) : options.corner ? clamp(.30+(attackerData.heading-keeperData.positioning)/165,.22,.57) : clamp(.37+(finishing-keeperData.positioning)/158+(current.attack-other.defense)/175,.25,.76),.18,.76);
    if(!onTarget){
      if(!options.shootout){s.off++;}
      if(options.penalty && !options.shootout){
        pushLiveVolumeIncident?.(side, 'penalty-miss', { name: attacker });
        writeLog(`${attacker} finaliza ${label}, mas a bola sai para fora.`, 'penalty-miss', side);
      } else {
        writeLog(`${attacker} finaliza ${label}, mas a bola sai para fora.`, options.shootout ? 'shootout-miss' : undefined, side);
      }
      return options.shootout ? false : undefined;
    }
    if(!options.shootout){s.on++;}
    const defendingSide = side === 'home' ? 'away' : 'home';
    const ogRoll = ownGoalChance({
      corner: !!options.corner,
      freeKick: !!options.freeKick,
      penalty: !!options.penalty,
      shootout: !!options.shootout,
    });
    if (!forcedOutcome && !options.shootout && ogRoll > 0 && random() < ogRoll) {
      const ownScorer = playerFor(defendingSide, 'tackle') || playerFor(defendingSide, 'foul') || goalkeeper;
      const clock = goalClock();
      incrementScore(side);
      getGoals()?.[side].push({ name: ownScorer, minute: clock.minute, stoppage: clock.stoppage, assist: null, type: 'own' });
      updateScoreboard();
      influencePossession(side, 3.2);
      writeLog(
        `GOOOL CONTRA! ${ownScorer} desvia para o próprio gol — gol para o ${team}.`,
        'goal own',
        side,
      );
      return;
    }
    let goalChance=options.penalty || options.shootout ? penaltyGoalChance(options.penaltySkill, keeperData.penaltySaving, penaltySpecialist) : options.freeKick ? (freeKickSpecialist ? clamp(.20+(attackerData.freeKick-60)/220+(attackerData.freeKick-keeperData.positioning)/500+(current.attack-other.defense)/900,.18,.34) : clamp(.11+(attackerData.freeKick-65)/600+(attackerData.freeKick-keeperData.positioning)/650,.115,.15)) : (()=>{const xg=clamp(.128+(finishing+current.attack-keeperData.reflexes-other.defense)/115+(current.overall-other.overall)/520+rnd(-.028,.028),.072,.36);return clamp(xg/onTarget,.15,.68);})();
    if(!options.penalty&&!options.freeKick&&!options.corner&&!options.shootout){const gap=current.overall-other.overall;if(gap>engineTuning.blowoutGapStart)goalChance*=engineBlowoutDamp(gap);}
    const scores = forcedOutcome
      ? forcedOutcome === 'goal'
      : random() < goalChance;
    if(scores){
      if(options.shootout){
        const goalType=`goal shootout-${penaltySpecialist?'specialist':'standard'}`;
        writeLog(`GOL! ${attacker} converte ${label} para o ${team}.`, goalType, side);
        return true;
      }
      const clock = goalClock();
      const goalKind = options.penalty ? 'penalty' : options.freeKick ? 'freeKick' : options.corner ? 'corner' : 'normal';
      incrementScore(side);const suggestedAssist=options.penalty||options.freeKick?null:playerFor(side,'pass'),assist=suggestedAssist&&suggestedAssist!==attacker?suggestedAssist:null;getGoals()?.[side].push({name:attacker,minute:clock.minute,stoppage:clock.stoppage,assist,type:goalKind});updateScoreboard();influencePossession(side,3.8);const goalType=options.freeKick ? `goal free-kick-${freeKickSpecialist?'specialist':'standard'}` : options.penalty ? `goal penalty-${penaltySpecialist?'specialist':'standard'}` : 'goal';writeLog(`GOOOL! ${attacker} marca ${label} para o ${team}${assist?`, assistência de ${assist}`:''}.`,goalType,side);
      if(options.shootout) return true;
    }
    else{
      if(!options.shootout){s.saved++;otherStats.keeperSaves++;}
      influencePossession(side === 'home'?'away':'home', options.shootout ? 0 : 1.4);
      if(options.penalty && !options.shootout){
        pushLiveVolumeIncident?.(side, 'penalty-miss', { name: attacker });
        writeLog(`${attacker} finaliza ${label}, mas ${goalkeeper} faz a defesa.`, 'penalty-miss', side);
      } else {
        writeLog(`${attacker} finaliza ${label}, mas ${goalkeeper} faz a defesa.`, options.shootout ? 'shootout-miss' : undefined, side);
      }
      if(options.shootout) return false;
    }
    if(options.shootout) return false;
    if(tryLiveEventInjury(side,attacker,{eventPhase:options.corner?'corner':options.penalty?'penalty':options.freeKick?'freeKick':'shot',contact:!!options.corner,intensity:options.penalty?.9:options.freeKick?.75:options.corner?.72:.66}))return;
  };
  const takeFreeKick = (side,current,other) => {
    const lineup=side==='home'?getStarters():getMatchClub().roster.slice(0,11);
    const ranked=lineup.filter((player,index)=>!getCards()[side][index].red && player.pos!=='GOL').sort((a,b)=>b.freeKick-a.freeKick);
    const taker=ranked[random()<.78?0:Math.min(1,ranked.length-1)] || ranked[0];
    if(!taker) return;
    const directAttempt=clamp(.30+(taker.freeKick-45)/105,.22,.72);
    if(random()<directAttempt){
      log(`${taker.name} assume a cobrança de falta na entrada da área.`, `free-kick-${taker.freeKick>85?'specialist':'standard'}`, side);
      shot(side,current,other,{freeKick:true,taker:taker.name});
    } else log(`${taker.name} levanta a falta na área, mas a defesa afasta.`, '', side);
  };
  const penaltyTaker = side => {
    const lineup=side==='home'?getStarters():getMatchClub().roster.slice(0,11);
    const eligible=lineup.filter((player,index)=>player.pos!=='GOL' && !getCards()[side][index].red).sort((a,b)=>b.penaltyTaking-a.penaltyTaking);
    const specialists=eligible.filter(player=>player.penaltyTaking>85);
    const choices=specialists.length ? specialists : eligible;
    return choices[random()<.80?0:Math.min(1,choices.length-1)] || eligible[0];
  };
  // Cada posse relevante passa por construção, duelo e desfecho. Assim, os
  // números de passe, desarme e posse passam a decidir quais jogadas chegam ao gol.
  const buildAttack = (side,current,other,passAccuracy,openingBoost=0) => {
    const otherSide = side === 'home' ? 'away' : 'home';
    const team = side === 'home' ? getUserClub() : getMatchClub().name;
    const s=getStats()[side], o=getStats()[otherSide];
    const creatorName=playerFor(side,'pass'), creator=actorData(side,creatorName);
    const attackerName=playerFor(side,'shot'), attacker=actorData(side,attackerName);
    const defenderName=playerFor(otherSide,'tackle'), defender=actorData(otherSide,defenderName);
    const creation = clamp(engineTuning.creationBase+(creator.passing*.46+creator.playmaking*.34+attacker.dribble*.12+attacker.speed*.08-defender.marking*.45-defender.tackling*.45)/130+(current.passing-other.defense)/130+(s.momentum-o.momentum)/100+openingBoost,.22,.88);
    s.attacks++;
    if(random() > creation){
      // O futebol brasileiro tem uma taxa alta de interrupções. A falta nasce
      // sobretudo do duelo, mas pressão, bloco defensivo e perseguição no
      // placar aumentam a tendência sem torná-la automática.
      const otherTactic=tacticFor(otherSide);
      const foulRisk=engineFoulRisk(otherTactic,attacker,defender);
      if(random()<foulRisk){
        if(foul(otherSide,side,{foulerName:defenderName,attackerName,phase:'duel'}))return;
      } else {
        o.tackles++; influencePossession(otherSide,1.45);
        log(`${defenderName} intercepta a tentativa de ${creatorName} e recupera para o ${side === 'home' ? getMatchClub().name : getUserClub()}.`);
        const tackleVictim=pickInjuryVictim({eventPhase:'tackle',contact:true,intensity:.58},attacker,defender);
        if(tryLiveEventInjury(tackleVictim===attacker?side:otherSide,tackleVictim.name,{eventPhase:'tackle',contact:true,intensity:.58}))return;
      }
      return;
    }
    s.goodAttacks++; influencePossession(side,1.25+creation);
    log(`${creatorName} encontra ${attackerName}; ${team} acelera a jogada.`);
    if(tryLiveEventInjury(side,attackerName,{eventPhase:'build',contact:false,intensity:clamp(.62+creation*.18,.55,.88)}))return;
    // Mesmo uma construção bem-sucedida pode terminar em contato antes da
    // finalização. Isso eleva a cadência de faltas sem fabricar cartões.
    const progressiveFoulRisk=engineProgressiveFoulRisk(otherSide,attacker,defender);
    if(random()<progressiveFoulRisk){
      if(foul(otherSide,side,{foulerName:defenderName,attackerName,phase:'progression'}))return;
      return;
    }
    const end=random();
    if(end < .53) shot(side,{...current,attack:current.attack+32+creation*24},other);
    else if(end < .73){
      s.corners++; influencePossession(side,1.25);
      log(`${attackerName} força o escanteio para o ${team}.`);
      if(random()<.58) shot(side,{...current,attack:current.attack+28+creation*20},other,{corner:true});
    } else if(end < .93) {
      const defender=playerFor(otherSide,'foul',{lastLine:true});
      log(`${defender} para ${attackerName} perto da área.`);
      if(foul(otherSide,side,{foulerName:defender,attackerName,phase:'final'}))return;
    } else {
      const line=(tacticFor(side).offsideLine ?? 50);
      const offsideChance=clamp(.015+(line/100)*.17,.01,.18);
      if(random()<offsideChance){s.offsides++;influencePossession(otherSide,.9);log(`${attackerName} é flagrado em impedimento.`);}
      else{influencePossession(otherSide,.55);log(`${defenderName} recua a linha e neutraliza a chegada de ${attackerName}.`);}
    }
  };

  return {
    moduleVersion: MODULE_VERSIONS.matchLive,
    addPasses,
    shot,
    takeFreeKick,
    penaltyTaker,
    buildAttack,
    planPenaltyOutcome,
  };
}
