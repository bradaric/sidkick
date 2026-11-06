(() => {
  const {commander_id:commanderId,mission,target_player:targetPlayer,target_unit_id:targetId,x,y,expected_turn:expectedTurn}=queryArguments,reject=(reason,failureReasons=[])=>({status:"rejected",reason,failureReasons});
  const sweep=mission==="sweep",bomb=mission==="bomb",districtId=queryArguments.district_id;
  if(![commanderId,x,y,expectedTurn,...(sweep?[]:[targetPlayer,bomb?districtId:targetId])].every(v=>Number.isInteger(v)&&v>=0)||!["land","sweep","bomb"].includes(mission))return reject("Exact air commander, supported location/land/district mission and expected turn required");
  if(!UI.isInGame())return reject("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),command=sweep?"UNITCOMMAND_FOCUSED_ATTACK_AIR_TO_AIR":bomb?"UNITCOMMAND_FOCUSED_ATTACK_AIR_BOMB":"UNITCOMMAND_FOCUSED_ATTACK_AIR_TO_LAND";
  const warValid=()=>sweep||targetPlayer!==playerId&&player.Diplomacy.hasMet(targetPlayer)===true&&player.Diplomacy.isAtWarWith(targetPlayer)===true;
  if(!Number.isInteger(playerId)||playerId<0||!player||Game.turn!==expectedTurn||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||!warValid()||GameInfo.UnitCommands.lookup(command)?.CommandType!==command)return reject("Fresh active context, existing met war for targeted attacks and installed focused-air command required");
  const owned=()=>player.Units.getUnits().filter(u=>u.id.owner===playerId),same=(a,b)=>a?.owner===b?.owner&&a?.id===b?.id&&a?.type===b?.type,valid=l=>l&&[l.x,l.y].every(v=>Number.isInteger(v)&&v>=0)&&l.x<GameplayMap.getGridWidth()&&l.y<GameplayMap.getGridHeight(),visible=l=>valid(l)&&GameplayMap.getRevealedState(playerId,l.x,l.y)===RevealedStates.VISIBLE;
  const matches=owned().filter(u=>u.id.id===commanderId);if(matches.length!==1)return reject("Unique owned air commander required");
  const base=matches[0],definition=GameInfo.Units.lookup(base.type),carrier=definition?.UnitType==="UNIT_CARRIER_COMMANDER";
  const baseValid=()=>base.isCommanderUnit===true&&["UNIT_SQUADRON_COMMANDER","UNIT_CARRIER_COMMANDER"].includes(GameInfo.Units.lookup(base.type)?.UnitType)&&base.isOnMap===true&&base.isDead!==true&&base.operationQueueSize===0&&visible(base.location)&&[-1,playerId].includes(GameplayMap.getOwner(base.location.x,base.location.y))&&(!carrier||GameplayMap.isWater(base.location.x,base.location.y)===true)&&Number.isFinite(base.Movement?.movementMovesRemaining)&&base.Movement.movementMovesRemaining>0;
  if(!baseValid()||base.armyId?.owner!==playerId||!Number.isInteger(base.armyId.id)||!Number.isInteger(base.armyId.type))return reject("Ready visible owned squadron/carrier and army identity required");
  function armies(){
    const units=owned(),seen=new Set(),out=[];
    for(const c of units.filter(u=>u.isCommanderUnit)){
      const a=Armies.get(c.armyId),identity=a?.getCommanderId?.(),ids=a?.getUnitIds?.();
      if(a?.owner!==playerId||!same(identity,c.id)||!Number.isInteger(a.localId)||!Array.isArray(ids)||ids.some(id=>id.owner!==playerId||id.id===c.id.id||units.filter(u=>same(u.id,id)).length!==1))return null;
      for(const id of ids){if(seen.has(id.id))return null;seen.add(id.id);}
      out.push({commanderId:c.id.id,commanderType:c.type,componentType:c.id.type,armyId:a.localId,packedUnitIds:ids.map(id=>id.id).sort((a,b)=>a-b)});
    }
    return out.sort((a,b)=>a.commanderId-b.commanderId);
  }
  const baseline=armies(),sourceArmy=baseline?.find(a=>a.commanderId===commanderId);
  if(!sourceArmy||sourceArmy.armyId!==base.armyId.id||!sourceArmy.packedUnitIds.length||sourceArmy.packedUnitIds.length>16)return reject("Bounded complete packed air membership required");
  function participants(){
    const result=[];for(const id of sourceArmy.packedUnitIds){
      const u=owned().find(u=>u.id.id===id),def=u&&GameInfo.Units.lookup(u.type);
      if(!u||u.isCommanderUnit||u.isDead===true||u.isOnMap!==false||u.operationQueueSize!==0||!same(u.armyId,base.armyId)||def?.Domain!=="DOMAIN_AIR"||def.FormationClass!=="FORMATION_CLASS_AIR"||u.Combat?.isCombat!==true||typeof player.Armies?.getUnitReinforcementCommanderId!=="function"||player.Armies.getUnitReinforcementCommanderId(u.id,playerId)!==-1)return null;
      // Capture every ready role-eligible aircraft: the native command chooses which
      // can participate in this mission; never substitute individual AIR_ATTACKs.
      const role=sweep?"UNIT_CLASS_AIR_FIGHTER":bomb?"UNIT_CLASS_BOMBER":"UNIT_CLASS_GROUND_ATTACKER";
      if(GameInfo.TypeTags.filter(t=>t.Type===def.UnitType&&t.Tag===role).length>0&&u.Combat.canAttack===true&&Number.isInteger(u.Combat.attacksRemaining)&&u.Combat.attacksRemaining>0&&Number.isFinite(u.Movement?.movementMovesRemaining)&&u.Movement.movementMovesRemaining>0)result.push({unitId:id,componentType:u.id.type,unitType:u.type,attacks:u.Combat.attacksRemaining,moves:u.Movement.movementMovesRemaining});
    }return result.sort((a,b)=>a.unitId-b.unitId);
  }
  function target(){
    if(sweep)return visible({x,y})&&[-1,playerId].includes(GameplayMap.getOwner(x,y))?{location:{x,y}}:null;
    if(bomb){
      if(!visible({x,y})||GameplayMap.getOwner(x,y)!==targetPlayer)return null;
      const id=MapCities.getDistrict(x,y),ids=MapUnits.getUnits(x,y);if(id?.owner!==targetPlayer||id.id!==districtId||!Number.isInteger(id.type)||!Array.isArray(ids)||ids.length)return null;
      const d=Districts.get(id);if(!d||!same(d.id,id)||d.owner!==targetPlayer||d.location?.x!==x||d.location?.y!==y||!Number.isInteger(d.type)||!Number.isFinite(d.getDamage)||!Number.isFinite(d.getMaxDamage)||d.getDamage<0||d.getDamage>d.getMaxDamage)return null;
      if(d.getMaxDamage===0){
        const ids=MapConstructibles.getConstructibles(x,y);if(!Array.isArray(ids)||!ids.length)return null;
        const records=ids.map(id=>{const c=Constructibles.get(id);return c&&same(c.id,id)&&id.owner===targetPlayer&&c.location?.x===x&&c.location?.y===y&&Number.isInteger(c.type)&&typeof c.complete==='boolean'&&typeof c.damaged==='boolean'?{owner:id.owner,instanceId:id.id,componentType:id.type,type:c.type,complete:c.complete,damaged:c.damaged}:null;});
        if(records.some(c=>!c))return null;records.sort((a,b)=>a.instanceId-b.instanceId||a.componentType-b.componentType);
        if(JSON.stringify(records)!==queryArguments.target_token||!records.some(c=>c.complete&&!c.damaged))return null;
        return{type:d.type,componentType:id.type,damage:d.getDamage,constructibles:records};
      }
      return d.getDamage<d.getMaxDamage?{type:d.type,componentType:id.type,damage:d.getDamage}:null;
    }
    if(!visible({x,y})||![-1,playerId].includes(GameplayMap.getOwner(x,y)))return null;
    const district=MapCities.getDistrict(x,y);if(district&&!(district.owner===-1&&district.id===-1))return null;
    const ids=MapUnits.getUnits(x,y);if(!Array.isArray(ids)||ids.length!==1||ids[0].owner!==targetPlayer||ids[0].id!==targetId||Visibility.isVisible(playerId,ids[0])!==true)return null;
    const u=Units.get(ids[0]),def=u&&GameInfo.Units.lookup(u.type);
    if(!u||!same(u.id,ids[0])||u.isOnMap!==true||u.isDead===true||u.isCommanderUnit||u.Combat?.isCombat!==true||u.location?.x!==x||u.location?.y!==y||!Number.isFinite(u.Health?.damage)||!Number.isFinite(u.Health.maxDamage)||u.Health.damage<0||u.Health.damage>=u.Health.maxDamage||
        (def?.Domain!=="DOMAIN_LAND"||def.FormationClass!=="FORMATION_CLASS_LAND_COMBAT"))return null;
    return{type:u.type,componentType:u.id.type,damage:u.Health.damage};
  }
  const captured=participants(),enemy=target();if(!captured?.length||!enemy)return reject("Known ready role-eligible stationed aircraft and exact visible supported location/land/district target required; no implicit garrison/stack/civilian targeting");
  const source={commanderId,commanderType:base.type,componentType:base.id.type,armyId:base.armyId.id,armyComponentType:base.armyId.type,location:{x:base.location.x,y:base.location.y},carrier};
  const before={turn:Game.turn,age:Game.age,playerId,source,moves:base.Movement.movementMovesRemaining,participants:captured,armies:baseline,target:enemy},args={X:x,Y:y},picker=Game.UnitCommands.canStart(base.id,command,{},false);
  if(picker?.Success!==true||!Array.isArray(picker.Plots)||!picker.Plots.includes(GameplayMap.getIndexFromLocation({x,y})))return reject("Exact target not offered by native grouped air mission",picker?.FailureReasons??[]);
  const check=Game.UnitCommands.canStart(base.id,command,args,false);if(check?.Success!==true||check.RequiresConfirmation===true)return reject("Native grouped air mission failed or requires confirmation",check?.FailureReasons??[]);
  if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||!warValid()||!baseValid()||base.type!==source.commanderType||base.id.type!==source.componentType||base.location.x!==source.location.x||base.location.y!==source.location.y||base.armyId.id!==source.armyId||base.armyId.type!==source.armyComponentType||base.Movement.movementMovesRemaining!==before.moves||JSON.stringify(armies())!==JSON.stringify(baseline)||JSON.stringify(participants())!==JSON.stringify(captured)||JSON.stringify(target())!==JSON.stringify(enemy))return reject("Air commander, aircraft, target or context changed during validation");
  Game.UnitCommands.sendRequest(base.id,command,args);
  return{status:"submitted",before,expected:{[sweep?"sweepObserved":"groupAirAttackObserved"]:true},verificationArguments:{mission,source,baseline_armies:baseline,participants:captured,...(sweep?{}:{target_player:targetPlayer,...(bomb?{district_id:districtId,baseline_constructibles:enemy.constructibles??null}:{target_unit_id:targetId}),target_type:enemy.type,target_component_type:enemy.componentType,before_target_damage:enemy.damage}),x,y},
      verificationScope:sweep?"Native Fighter Sweep at exact visible own/unowned location: captured fighter attack/movement consumption or loss plus exact surviving memberships and stable base. No enemy/interception/kill or new visibility gain claimed":"Native selects role-eligible participants in one focused ground-attack/carpet-bomb mission. Primary visible unit/district damage/departure plus at least one captured aircraft attack consumption/loss, exact surviving full army membership and stable base required. Some/all captured consumption reported separately; not full interception, splash, kill, capture, recharge or turn accounting"};
})()
