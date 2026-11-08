(() => {
  if(!UI.isInGame())throw Error('Load a save first');
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),{unit_id:unitId,commander_id:commanderId,commander_type:commanderType,commander_component_type:componentType,before_level:level,before_points:points,before_damage:damage,before_gold:gold,before_influence:influence,location,baseline_units:baseline,baseline_armies:membership}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0||!player||![unitId,commanderId,componentType,level,points].every(v=>Number.isInteger(v)&&v>=0)||!Number.isInteger(commanderType)||!Array.isArray(baseline)||!Array.isArray(membership)||![damage,gold,influence].every(Number.isFinite))throw Error('Invalid captured Great Person effect baseline');
  const units=player.Units.getUnits().filter(u=>u.id.owner===playerId),commander=units.find(u=>u.id.id===commanderId),same=(a,b)=>a?.owner===b?.owner&&a?.id===b?.id&&a?.type===b?.type;
  const heal=queryArguments.effect==='heal',combatGold=queryArguments.effect==='combat_gold',health=queryArguments.baseline_health,xp=queryArguments.before_xp;
  if(heal&&(!Array.isArray(health)||health.length>1024||!Number.isFinite(xp)||xp<0))throw Error('Invalid captured radius-health/experience baseline');
  const baselineAbilities=queryArguments.baseline_abilities,ability=combatGold?GameInfo.UnitAbilities?.lookup('ABILITY_VILLA'):null;
  if(combatGold&&(!Array.isArray(baselineAbilities)||baselineAbilities.length>256||baselineAbilities.some(v=>!Number.isInteger(v))||new Set(baselineAbilities).size!==baselineAbilities.length||ability?.UnitAbilityType!=='ABILITY_VILLA'||!Number.isInteger(ability.$hash)||baselineAbilities.includes(ability.$hash)||!Number.isFinite(xp)||xp<0))throw Error('Invalid captured exact Villa ability/experience baseline');
  const rawAbilities=combatGold?commander?.getAbilities?.():null,commanderAbilities=Array.isArray(rawAbilities)?[...rawAbilities].sort((a,b)=>a-b):null;
  const abilityApplied=combatGold&&commanderAbilities&&JSON.stringify(commanderAbilities)===JSON.stringify([...baselineAbilities,ability.$hash].sort((a,b)=>a-b));
  const inventory=units.map(u=>({instanceId:u.id.id,componentType:u.id.type,unitType:u.type})).sort((a,b)=>a.instanceId-b.instanceId),expected=baseline.filter(u=>u.instanceId!==unitId),armies=[],seen=new Set();
  for(const c of units.filter(u=>u.isCommanderUnit)){
    const a=Armies.get(c.armyId),ids=a?.getUnitIds?.();if(a?.owner!==playerId||!same(a.getCommanderId?.(),c.id)||!Array.isArray(ids)||ids.some(id=>id.owner!==playerId||!units.some(u=>same(u.id,id))))throw Error('Owned membership unknown');
    for(const id of ids){if(seen.has(id.id))throw Error('Owned membership ambiguous');seen.add(id.id);}armies.push({commanderId:c.id.id,componentType:c.id.type,unitType:c.type,armyId:a.localId,packedUnitIds:ids.map(id=>id.id).sort((a,b)=>a-b)});
  }armies.sort((a,b)=>a.commanderId-b.commanderId);
  const retired=!units.some(u=>u.id.id===unitId),targetPreserved=commander?.type===commanderType&&commander.id.type===componentType&&commander.isCommanderUnit===true&&commander.isArmyCommander===true&&commander.isOnMap===true&&commander.isEmbarked===false&&commander.operationQueueSize===0&&
    commander.location?.x===location?.x&&commander.location?.y===location?.y&&GameplayMap.getRevealedState(playerId,location.x,location.y)===RevealedStates.VISIBLE&&[-1,playerId].includes(GameplayMap.getOwner(location.x,location.y))&&commander.Health?.damage===(heal?Math.max(0,damage-99):damage);
  const healthMismatches=heal?health.filter(r=>r.instanceId!==unitId).flatMap(r=>{const u=units.find(u=>u.id.id===r.instanceId),expectedDamage=r.heal?Math.max(0,r.damage-99):r.damage,metadataChanged=u?.id.type!==r.componentType||u?.type!==r.unitType||u?.Health?.maxDamage!==r.maxDamage;
    const accounted=u?.Health?.damage===expectedDamage||!r.heal&&u?.Health?.damage===Math.max(0,r.damage-99);
    return metadataChanged||!accounted?[{unitId:r.instanceId,expectedDamage,damage:u?.Health?.damage??null,...(metadataChanged?{identityOrMaxHealthChanged:true}:{})}]:[];
  }):[];
  const ownedHealthAsExpected=heal&&healthMismatches.length===0;
  const healedUnitIds=heal?health.filter(r=>r.instanceId!==unitId&&r.heal&&r.damage>0&&units.some(u=>u.id.id===r.instanceId&&u.Health?.damage===Math.max(0,r.damage-99))).map(r=>r.instanceId):[];
  const additionalHealedUnitIds=heal?health.filter(r=>r.instanceId!==unitId&&!r.heal&&r.damage>0&&units.some(u=>u.id.id===r.instanceId&&u.Health?.damage===Math.max(0,r.damage-99))).map(r=>r.instanceId):[];
  return{turn:Game.turn,age:Game.age,playerId,unitId,commanderId,sourceRetired:retired,level:commander?.Experience?.getLevel??null,promotionPoints:commander?.Experience?.getStoredPromotionPoints??null,
    ...(heal?{effect:'heal',ownedHealthAsExpected,healedUnitIds,additionalHealedUnitIds,healthMismatches:healthMismatches.slice(0,32)}:{}),...(combatGold?{effect:'combat_gold',commanderAbilities,abilityApplied:Boolean(abilityApplied)}:{}),greatPersonEffectObserved:Boolean(retired&&targetPreserved&&commander.Experience.getLevel===(heal||combatGold?level:level+5)&&commander.Experience.getStoredPromotionPoints===(heal||combatGold?points:points+5)&&commander.Experience.experiencePoints===(heal||combatGold?xp:0)&&(!heal||ownedHealthAsExpected&&healedUnitIds.length>0)&&(!combatGold||abilityApplied)&&JSON.stringify(inventory)===JSON.stringify(expected)&&JSON.stringify(armies)===JSON.stringify(membership)&&player.Treasury?.goldBalance===gold&&player.DiplomacyTreasury?.diplomacyBalance===influence)};
})()
