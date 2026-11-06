(() => {
  if(!UI.isInGame())throw Error("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),{source,baseline_armies:baseline,participants,target_player:targetPlayer,target_unit_id:targetId,x,y,target_type:targetType,target_component_type:targetComponent,before_target_damage:damage}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0||!player||![source?.commanderId,source?.componentType,targetPlayer,targetId,x,y,targetComponent].every(v=>Number.isInteger(v)&&v>=0)||!Number.isInteger(targetType)||!Array.isArray(baseline)||!Array.isArray(participants)||!participants.length||!Number.isFinite(damage))throw Error("Invalid captured group air mission");
  const owned=player.Units.getUnits().filter(u=>u.id.owner===playerId),same=(a,b)=>a?.owner===b?.owner&&a?.id===b?.id&&a?.type===b?.type,base=owned.find(u=>u.id.id===source.commanderId),records=[],observations=[],lost=[];
  for(const p of participants){
    const units=owned.filter(u=>u.id.id===p.unitId);if(units.length>1||units.length&&(units[0].id.type!==p.componentType||units[0].type!==p.unitType))throw Error("Captured aircraft identity changed");
    const u=units[0],spent=!u||Number.isInteger(u.Combat?.attacksRemaining)&&u.Combat.attacksRemaining>=0&&u.Combat.attacksRemaining<p.attacks;
    if(!u)lost.push(p.unitId);observations.push({unitId:p.unitId,attackConsumedOrUnitLost:spent,unitLost:!u});
  }
  for(const c of owned.filter(u=>u.isCommanderUnit)){
    const a=Armies.get(c.armyId),ids=a?.getUnitIds?.();if(a?.owner!==playerId||!same(a.getCommanderId?.(),c.id)||!Array.isArray(ids))throw Error("Owned air mission membership unknown");
    records.push({commanderId:c.id.id,commanderType:c.type,componentType:c.id.type,armyId:a.localId,packedUnitIds:ids.map(id=>id.id).sort((a,b)=>a-b)});
  }
  records.sort((a,b)=>a.commanderId-b.commanderId);
  const expected=baseline.map(a=>({...a,packedUnitIds:a.packedUnitIds.filter(id=>!lost.includes(id))})),carrier=base&&GameInfo.Units.lookup(base.type)?.UnitType==="UNIT_CARRIER_COMMANDER";
  const basePreserved=base?.type===source.commanderType&&base.id.type===source.componentType&&base.isOnMap===true&&base.isDead!==true&&base.operationQueueSize===0&&base.location?.x===source.location.x&&base.location?.y===source.location.y&&base.armyId?.owner===playerId&&base.armyId.id===source.armyId&&base.armyId.type===source.armyComponentType&&
    carrier===source.carrier&&(!carrier||GameplayMap.isWater(source.location.x,source.location.y)===true)&&GameplayMap.getRevealedState(playerId,source.location.x,source.location.y)===RevealedStates.VISIBLE&&[-1,playerId].includes(GameplayMap.getOwner(source.location.x,source.location.y))&&JSON.stringify(records)===JSON.stringify(expected)&&
    participants.every(p=>lost.includes(p.unitId)||owned.some(u=>u.id.id===p.unitId&&u.isOnMap===false&&u.operationQueueSize===0&&same(u.armyId,base.armyId)));
  let targetLeftTile=null,currentDamage=null;
  if(player.Diplomacy.hasMet(targetPlayer)===true&&GameplayMap.getRevealedState(playerId,x,y)===RevealedStates.VISIBLE){
    const ids=MapUnits.getUnits(x,y);if(Array.isArray(ids)){const id=ids.find(id=>id.owner===targetPlayer&&id.id===targetId&&id.type===targetComponent);targetLeftTile=!id;
      if(id&&Visibility.isVisible(playerId,id)===true){const u=Units.get(id);if(u?.type!==targetType)throw Error("Visible primary air-mission target identity changed");if(Number.isFinite(u.Health?.damage))currentDamage=u.Health.damage;}}
  }
  return{turn:Game.turn,age:Game.age,playerId,groupAirAttackObserved:Boolean(basePreserved&&observations.some(p=>p.attackConsumedOrUnitLost)&&(targetLeftTile===true||currentDamage!==null&&currentDamage>damage)),participants:observations,allParticipantsConsumed:observations.every(p=>p.attackConsumedOrUnitLost),basePreserved:Boolean(basePreserved),targetLeftTile,targetDamage:currentDamage,killConfirmed:null};
})()
