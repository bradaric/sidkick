(() => {
  if(!UI.isInGame())throw Error('Load a save first');
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),{unit_id:unitId,commander_id:commanderId,commander_type:commanderType,commander_component_type:componentType,before_level:level,before_points:points,before_damage:damage,before_gold:gold,before_influence:influence,location,baseline_units:baseline,baseline_armies:membership}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0||!player||![unitId,commanderId,componentType,level,points].every(v=>Number.isInteger(v)&&v>=0)||!Number.isInteger(commanderType)||!Array.isArray(baseline)||!Array.isArray(membership)||![damage,gold,influence].every(Number.isFinite))throw Error('Invalid captured Great Person effect baseline');
  const units=player.Units.getUnits().filter(u=>u.id.owner===playerId),commander=units.find(u=>u.id.id===commanderId),same=(a,b)=>a?.owner===b?.owner&&a?.id===b?.id&&a?.type===b?.type;
  const inventory=units.map(u=>({instanceId:u.id.id,componentType:u.id.type,unitType:u.type})).sort((a,b)=>a.instanceId-b.instanceId),expected=baseline.filter(u=>u.instanceId!==unitId),armies=[],seen=new Set();
  for(const c of units.filter(u=>u.isCommanderUnit)){
    const a=Armies.get(c.armyId),ids=a?.getUnitIds?.();if(a?.owner!==playerId||!same(a.getCommanderId?.(),c.id)||!Array.isArray(ids)||ids.some(id=>id.owner!==playerId||!units.some(u=>same(u.id,id))))throw Error('Owned membership unknown');
    for(const id of ids){if(seen.has(id.id))throw Error('Owned membership ambiguous');seen.add(id.id);}armies.push({commanderId:c.id.id,componentType:c.id.type,unitType:c.type,armyId:a.localId,packedUnitIds:ids.map(id=>id.id).sort((a,b)=>a-b)});
  }armies.sort((a,b)=>a.commanderId-b.commanderId);
  const retired=!units.some(u=>u.id.id===unitId),targetPreserved=commander?.type===commanderType&&commander.id.type===componentType&&commander.isCommanderUnit===true&&commander.isArmyCommander===true&&commander.isOnMap===true&&commander.isEmbarked===false&&commander.operationQueueSize===0&&
    commander.location?.x===location?.x&&commander.location?.y===location?.y&&GameplayMap.getRevealedState(playerId,location.x,location.y)===RevealedStates.VISIBLE&&[-1,playerId].includes(GameplayMap.getOwner(location.x,location.y))&&commander.Health?.damage===damage;
  return{turn:Game.turn,age:Game.age,playerId,unitId,commanderId,sourceRetired:retired,level:commander?.Experience?.getLevel??null,promotionPoints:commander?.Experience?.getStoredPromotionPoints??null,
    greatPersonEffectObserved:Boolean(retired&&targetPreserved&&commander.Experience.getLevel===level+5&&commander.Experience.getStoredPromotionPoints===points+5&&commander.Experience.experiencePoints===0&&JSON.stringify(inventory)===JSON.stringify(expected)&&JSON.stringify(armies)===JSON.stringify(membership)&&player.Treasury?.goldBalance===gold&&player.DiplomacyTreasury?.diplomacyBalance===influence)};
})()
