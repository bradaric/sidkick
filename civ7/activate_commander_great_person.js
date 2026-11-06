(() => {
  const {unit_id:unitId,commander_id:commanderId,expected_turn:expectedTurn}=queryArguments,reject=(reason,failureReasons=[])=>({status:'rejected',reason,failureReasons});
  const {effect='promotions'}=queryArguments,heal=effect==='heal';
  if(!['promotions','heal'].includes(effect))return reject('Explicit fixed promotions/heal profile required');
  if(![unitId,commanderId,expectedTurn].every(v=>Number.isInteger(v)&&v>=0)||unitId===commanderId)return reject('Distinct owned concrete Great Person/Army Commander IDs and expected turn required');
  if(!UI.isInGame())return reject('Load a save first');
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),age=Game.age;
  if(!Number.isInteger(playerId)||playerId<0||!player||Game.turn!==expectedTurn||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false)return reject('Fresh active local turn required');
  const owned=()=>player.Units.getUnits().filter(u=>u.id.owner===playerId),units=owned(),matches=units.filter(u=>u.id.id===unitId),targets=units.filter(u=>u.id.id===commanderId);
  if(matches.length!==1||targets.length!==1)return reject('Unique owned source and exact Army Commander required');
  const unit=matches[0],commander=targets[0],location={x:unit.location?.x,y:unit.location?.y},same=(a,b)=>a?.owner===b?.owner&&a?.id===b?.id&&a?.type===b?.type,command='UNITCOMMAND_ACTIVATE_GREAT_PERSON';
  const suffix=heal?'MORELOS':'SANTA_ANNA',unitType=`UNIT_REVOLUCIONARIO_${suffix}`,profile=GameInfo.GreatPersonIndividuals?.lookup(`GREAT_PERSON_INDIVIDUAL_REVOLUCIONARIO_${suffix}`);
  if(profile?.UnitType!==unitType||profile.ActionCharges!==1||profile.ActionRequiresOnUnitType!=='UNIT_ARMY_COMMANDER'||![profile.ActionRequiresGoldCost,profile.ActionRequiresInfluenceCost].every(v=>v===null||v===0)||
      [profile.ScaleGoldCostByActivation,profile.ScaleGoldCostByRelationship,profile.ScaleInfluenceCostByRelationship].some(v=>v!==false))return reject('Installed exact single-charge Army profile with known no currency/scaled cost required');
  const valid=l=>l&&[l.x,l.y].every(v=>Number.isInteger(v)&&v>=0)&&l.x<GameplayMap.getGridWidth()&&l.y<GameplayMap.getGridHeight();
  const sourceValid=()=>GameInfo.Units.lookup(unit.type)?.UnitType===unitType&&unit.isCommanderUnit!==true&&unit.isDead!==true&&unit.isOnMap===true&&unit.isEmbarked===false&&unit.operationQueueSize===0&&unit.Movement?.movementMovesRemaining>0&&
    commander.isCommanderUnit===true&&commander.isArmyCommander===true&&GameInfo.Units.lookup(commander.type)?.Domain==='DOMAIN_LAND'&&commander.isOnMap===true&&commander.isDead!==true&&commander.isEmbarked===false&&commander.operationQueueSize===0&&
    unit.location?.x===location.x&&unit.location?.y===location.y&&commander.location?.x===location.x&&commander.location?.y===location.y&&valid(location)&&GameplayMap.getRevealedState(playerId,location.x,location.y)===RevealedStates.VISIBLE&&[-1,playerId].includes(GameplayMap.getOwner(location.x,location.y))&&GameplayMap.isWater(location.x,location.y)===false&&
    units.filter(u=>u.isArmyCommander===true&&u.isOnMap===true&&u.location?.x===location.x&&u.location?.y===location.y).length===1;
  const clear=()=>{if(!sourceValid())return false;const ids=MapUnits.getUnits(location.x,location.y);return Array.isArray(ids)&&ids.every(id=>id.owner===playerId)&&ids.some(id=>same(id,unit.id))&&ids.some(id=>same(id,commander.id));};
  if(!clear()||GameInfo.UnitCommands.lookup(command)?.CommandType!==command)return reject('Concrete selected Great Person at one exact unambiguous visible land Army Commander required; no placeholder, foreign stack or implicit target');
  function inventory(){const out=owned().map(u=>({instanceId:u.id.id,componentType:u.id.type,unitType:u.type})).sort((a,b)=>a.instanceId-b.instanceId);return out.length<=1024&&out.every(r=>Number.isInteger(r.instanceId)&&r.instanceId>=0&&Number.isInteger(r.componentType)&&r.componentType>=0&&Number.isInteger(r.unitType))&&new Set(out.map(r=>r.instanceId)).size===out.length?out:null;}
  function armies(){const out=[],seen=new Set(),all=owned();for(const c of all.filter(u=>u.isCommanderUnit)){
    const a=Armies.get(c.armyId),ids=a?.getUnitIds?.();if(a?.owner!==playerId||!same(a.getCommanderId?.(),c.id)||!Number.isInteger(a.localId)||!Array.isArray(ids)||ids.some(id=>id.owner!==playerId||id.id===c.id.id||!all.some(u=>same(u.id,id))))return null;
    for(const id of ids){if(seen.has(id.id))return null;seen.add(id.id);}out.push({commanderId:c.id.id,componentType:c.id.type,unitType:c.type,armyId:a.localId,packedUnitIds:ids.map(id=>id.id).sort((a,b)=>a-b)});
  }return out.sort((a,b)=>a.commanderId-b.commanderId);}
  const baseline=inventory(),membership=armies(),level=commander.Experience?.getLevel,points=commander.Experience?.getStoredPromotionPoints,xp=commander.Experience?.experiencePoints,damage=commander.Health?.damage,gold=player.Treasury?.goldBalance,influence=player.DiplomacyTreasury?.diplomacyBalance;
  const unpacked=()=>membership&&!membership.some(a=>a.packedUnitIds.includes(unitId)||a.packedUnitIds.includes(commanderId))&&typeof player.Armies?.getUnitReinforcementCommanderId==='function'&&[unit,commander].every(u=>player.Armies.getUnitReinforcementCommanderId(u.id,playerId)===-1);
  if(!baseline||!membership||!unpacked()||![level,points].every(v=>Number.isInteger(v)&&v>=0)||!Number.isFinite(xp)||xp<0||!heal&&xp!==0||![damage,gold,influence].every(Number.isFinite))return reject('Complete owned ledgers and known experience baseline required; promotions profile requires zero XP remainder');
  function health(){
    const all=owned(),byId=new Map(all.map(u=>[u.id.id,u])),radius=Units.getCommandRadiusPlots(commander.id);
    if(!Array.isArray(radius)||!radius.length||radius.length>512||new Set(radius).size!==radius.length||radius.some(i=>!Number.isInteger(i)||i<0||i>=GameplayMap.getGridWidth()*GameplayMap.getGridHeight())||!radius.includes(GameplayMap.getIndexFromLocation(location)))return null;
    const inside=l=>valid(l)&&radius.includes(GameplayMap.getIndexFromLocation(l)),records=[];
    for(const u of all){
      const parent=membership.find(a=>a.packedUnitIds.includes(u.id.id)),at=u.isOnMap===true?u.location:parent?byId.get(parent.commanderId)?.location:null;
      if(typeof u.isOnMap!=='boolean'||(u.isOnMap||parent)&&!valid(at)||!Number.isFinite(u.Health?.damage)||!Number.isFinite(u.Health.maxDamage)||u.Health.damage<0||u.Health.damage>=u.Health.maxDamage||u.Health.maxDamage>100||u.Health.maxDamage<=0)return null;
      const reinforcing=player.Armies.getUnitReinforcementCommanderId(u.id,playerId);
      if(!Number.isInteger(reinforcing)||reinforcing< -1)return null;
      if(reinforcing>=0){const target=membership.find(a=>a.armyId===reinforcing),c=target&&byId.get(target.commanderId);if(!c||!valid(c.location)||inside(c.location)||inside(at))return null;}
      if(inside(at)&&u.operationQueueSize!==0)return null;
      records.push({instanceId:u.id.id,componentType:u.id.type,unitType:u.type,damage:u.Health.damage,maxDamage:u.Health.maxDamage,heal:Boolean(inside(at))});
    }return{radius:[...radius].sort((a,b)=>a-b),units:records.sort((a,b)=>a.instanceId-b.instanceId)};
  }
  const healing=heal?health():null;
  if(heal&&(!healing||!healing.units.some(u=>u.instanceId!==unitId&&u.heal&&u.damage>0)))return reject('Known complete own health/radius, safe packed projection and at least one wounded recipient required; no queued/radius reinforcement ambiguity');
  const args={X:location.x,Y:location.y,UnitAbilityType:-1},quote=heal?'Activate on an Army Commander to [icon:Action_Heal] Heal all Units in the Command Radius to full.':'Activate on an Army Commander to grant it enough experience for 5 [icon:NAR_REW_PROMOTION] Promotions.';
  const check=Game.UnitCommands.canStart(unit.id,command,args,false);
  if(check?.Success!==true||check.RequiresConfirmation===true||check.Cost!==undefined&&check.Cost!==0||!Array.isArray(check.AdditionalDescription)||check.AdditionalDescription.length!==1||check.AdditionalDescription[0]!==quote)return reject('Exact native selected profile quote and permission required; no guessed/localised bonus or nonzero cost',check?.FailureReasons??[]);
  if(Game.turn!==expectedTurn||Game.age!==age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||!clear()||!unpacked()||JSON.stringify(inventory())!==JSON.stringify(baseline)||JSON.stringify(armies())!==JSON.stringify(membership)||commander.Experience.getLevel!==level||commander.Experience.getStoredPromotionPoints!==points||commander.Experience.experiencePoints!==xp||commander.Health.damage!==damage||heal&&JSON.stringify(health())!==JSON.stringify(healing)||player.Treasury.goldBalance!==gold||player.DiplomacyTreasury.diplomacyBalance!==influence)return reject('Great Person, target, experience/health, ledgers, balances or context changed');
  Game.UnitCommands.sendRequest(unit.id,command,args);
  return{status:'submitted',before:{turn:expectedTurn,age,playerId,unitId,commanderId,location,level,points,xp,damage,gold,influence,inventory:baseline,armies:membership,...(heal?{healing}:{})},expected:{greatPersonEffectObserved:true},verificationArguments:{unit_id:unitId,unit_type:unit.type,component_type:unit.id.type,commander_id:commanderId,commander_type:commander.type,commander_component_type:commander.id.type,before_level:level,before_points:points,before_xp:xp,before_damage:damage,before_gold:gold,before_influence:influence,location,baseline_units:baseline,baseline_armies:membership,...(heal?{effect,baseline_health:healing.units}:{})},
    verificationScope:'Fixed Santa Anna promotion or Morelos heal profile. Proves source retirement, selected-radius primary healing, target location/queue and other unit identities/armies/balances. Morelos can heal other Commander areas/packed units too: reports additional owned heals separately, allowing only unchanged health or native99-damage reduction. Immediate snapshot only, not a future/global-effect guarantee, normal turn healing or recharge. Does not assign promotions or claim every trait/secondary effect'};
})()
