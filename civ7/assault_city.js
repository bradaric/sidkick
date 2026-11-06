(() => {
  const {unit_id:unitId,target_player:targetPlayer,target_city_id:cityId,x,y,mode,expected_turn:expectedTurn}=queryArguments,reject=(reason,failureReasons=[])=>({status:"rejected",reason,failureReasons});
  if(![unitId,targetPlayer,cityId,x,y,expectedTurn].every(v=>Number.isInteger(v)&&v>=0)||!["melee","occupy"].includes(mode))return reject("Exact attacker, wartime city/centre, melee/occupy mode and expected turn required");
  if(!UI.isInGame())return reject("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId);
  if(!Number.isInteger(playerId)||playerId<0||!player||targetPlayer===playerId||Game.turn!==expectedTurn||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||player.Diplomacy.hasMet(targetPlayer)!==true||player.Diplomacy.isAtWarWith(targetPlayer)!==true)return reject("Fresh active local turn and existing met enemy war required");
  const owned=player.Units.getUnits().filter(u=>u.id.owner===playerId),matches=owned.filter(u=>u.id.id===unitId);
  if(matches.length!==1)return reject("Unique owned attacker required");
  const unit=matches[0],def=GameInfo.Units.lookup(unit.type),valid=l=>l&&[l.x,l.y].every(v=>Number.isInteger(v)&&v>=0)&&l.x<GameplayMap.getGridWidth()&&l.y<GameplayMap.getGridHeight(),same=(a,b)=>a?.owner===b?.owner&&a?.id===b?.id&&a?.type===b?.type;
  if(unit.isCommanderUnit||unit.isOnMap!==true||unit.isDead===true||unit.isEmbarked!==false||unit.operationQueueSize!==0||def?.Domain!=="DOMAIN_LAND"||def.FormationClass!=="FORMATION_CLASS_LAND_COMBAT"||unit.Combat?.isCombat!==true||
      !valid(unit.location)||!valid({x,y})||GameplayMap.getPlotDistance(unit.location.x,unit.location.y,x,y)!==1||GameplayMap.getRevealedState(playerId,unit.location.x,unit.location.y)!==RevealedStates.VISIBLE||
      GameplayMap.isWater(unit.location.x,unit.location.y)!==false||!Number.isFinite(unit.Movement?.movementMovesRemaining)||unit.Movement.movementMovesRemaining<=0||mode==="melee"&&(unit.Combat.canAttack!==true||!Number.isInteger(unit.Combat.attacksRemaining)||unit.Combat.attacksRemaining<=0))return reject("Ready adjacent unembarked unqueued land combat unit required");
  function packingClear(){for(const c of owned.filter(u=>u.isCommanderUnit)){const a=typeof Armies!=="undefined"?Armies.get(c.armyId):null,ids=a?.owner===playerId?a.getUnitIds?.():null;if(!Array.isArray(ids)||ids.some(id=>same(id,unit.id)))return false;}return typeof player.Armies?.getUnitReinforcementCommanderId==="function"&&player.Armies.getUnitReinforcementCommanderId(unit.id,playerId)===-1;}
  function target(){
    if(GameplayMap.getRevealedState(playerId,x,y)!==RevealedStates.VISIBLE||GameplayMap.getOwner(x,y)!==targetPlayer||GameplayMap.isWater(x,y)!==false)return null;
    const id=MapCities.getCity(x,y),occupants=MapUnits.getUnits(x,y);if(id?.owner!==targetPlayer||id.id!==cityId||!Number.isInteger(id.type)||!Array.isArray(occupants)||occupants.length)return null;
    const c=Cities.get(id);if(!c||!same(c.id,id)||c.owner!==targetPlayer||c.location?.x!==x||c.location?.y!==y)return null;
    const dId=Game.Combat.getDefensibleDistrict({x,y}),d=dId?.owner===targetPlayer&&same(dId,MapCities.getDistrict(x,y))?Districts.get(dId):null;
    if(mode==="melee"&&(!d||!same(d.id,dId)||d.owner!==targetPlayer||!Number.isInteger(d.type)||!Number.isFinite(d.getDamage)||!Number.isFinite(d.getMaxDamage)||d.getDamage<0||d.getDamage>d.getMaxDamage))return null;
    return{cityComponentType:id.type,district:d?{id:{owner:d.id.owner,id:d.id.id,type:d.id.type},type:d.type,damage:d.getDamage}:null};
  }
  const captured=target();if(!captured||!packingClear())return reject("Exact visible empty enemy centre and known unpacked/nonreinforcing attacker required; no garrison/civilian/stack inference");
  const baselineCities=player.Cities.getCities().filter(c=>c.id.owner===playerId).map(c=>({owner:c.id.owner,id:c.id.id,type:c.id.type})).sort((a,b)=>a.id-b.id);
  if(baselineCities.some(id=>![id.id,id.type].every(v=>Number.isInteger(v)&&v>=0))||new Set(baselineCities.map(id=>id.id)).size!==baselineCities.length)return reject("Owned settlement ledger unknown");
  const before={turn:Game.turn,age:Game.age,playerId,unitId,unitType:unit.type,componentType:unit.id.type,location:{x:unit.location.x,y:unit.location.y},moves:unit.Movement.movementMovesRemaining,attacks:unit.Combat.attacksRemaining??null,target:captured,cities:baselineCities};
  const modifiers=mode==="melee"?UnitOperationMoveModifiers.ATTACK:UnitOperationMoveModifiers.NONE,args={X:x,Y:y,Modifiers:modifiers},plot=GameplayMap.getIndexFromLocation({x,y});
  const reachable=mode==="melee"?Units.getReachableTargets(unit.id):Units.getReachableMovement(unit.id);
  if(!Number.isInteger(modifiers)||!Array.isArray(reachable)||!reachable.includes(plot)||Game.Combat.testAttackInto(unit.id,args)!==(mode==="melee"?CombatTypes.COMBAT_MELEE:CombatTypes.NO_COMBAT))return reject("Native exact city melee/occupation classification and reachability required");
  if(mode==="occupy"){
    const path=Units.getPathTo(unit.id,{x,y});if(!Array.isArray(path?.plots)||path.plots.length!==2||path.plots[0]!==GameplayMap.getIndexFromLocation(before.location)||path.plots[1]!==plot||!Array.isArray(path.turns)||path.turns.length!==2||path.turns.some(t=>t!==1))return reject("Occupation requires one direct current-turn native path");
  }
  const check=Game.UnitOperations.canStart(unit.id,UnitOperationTypes.MOVE_TO,args,false);
  if(check?.Success!==true||check.RequiresConfirmation===true)return reject("Native city action failed or needs confirmation",check?.FailureReasons??[]);
  if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||player.Diplomacy.isAtWarWith(targetPlayer)!==true||unit.id.owner!==playerId||unit.id.type!==before.componentType||unit.type!==before.unitType||unit.isOnMap!==true||unit.isEmbarked!==false||unit.operationQueueSize!==0||
      unit.location.x!==before.location.x||unit.location.y!==before.location.y||unit.Movement.movementMovesRemaining!==before.moves||unit.Combat.attacksRemaining!==before.attacks||!packingClear()||JSON.stringify(target())!==JSON.stringify(captured)||
      JSON.stringify(player.Cities.getCities().filter(c=>c.id.owner===playerId).map(c=>({owner:c.id.owner,id:c.id.id,type:c.id.type})).sort((a,b)=>a.id-b.id))!==JSON.stringify(baselineCities))return reject("Attacker, centre/district, owned settlement ledger or context changed during validation");
  Game.UnitOperations.sendRequest(unit.id,UnitOperationTypes.MOVE_TO,args);
  return{status:"submitted",before,expected:{unitId,...(mode==="occupy"?{captured:true}:{assaultObserved:true})},verificationArguments:{unit_id:unitId,unit_type:unit.type,component_type:unit.id.type,before_attacks:before.attacks,before_moves:before.moves,
    target_player:targetPlayer,target_city_id:cityId,x,y,mode,baseline_cities:baselineCities,district_id:captured.district?.id??null,district_type:captured.district?.type??null,before_district_damage:captured.district?.damage??null},
    verificationScope:"Explicit settlement assault/occupation: attack or movement consumption plus primary centre-district damage or exact new owned settlement preserving prior cities. Capture disposition remains a separate keep/raze choice; no garrison/civilian/kill/splash or full conquest effect accounting"};
})()
