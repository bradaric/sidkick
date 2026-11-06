(() => {
  const {unit_id:unitId,expected_turn:expectedTurn}=queryArguments,reject=(reason,failureReasons=[])=>({status:"rejected",reason,failureReasons});
  if(![unitId,expectedTurn].every(v=>Number.isInteger(v)&&v>=0))return reject("Exact owned combat unit and expected turn required");
  if(!UI.isInGame())return reject("Load a save first");
  const command="UNITCOMMAND_PLUNDER_TRADE_ROUTE";
  if(GameInfo.UnitCommands.lookup(command)?.CommandType!==command)return reject("Native trade-plunder command not defined in installed rules");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId);
  if(!Number.isInteger(playerId)||playerId<0||!player||Game.turn!==expectedTurn||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false)return reject("Fresh active local turn required");
  const owned=player.Units.getUnits().filter(u=>u.id.owner===playerId),matches=owned.filter(u=>u.id.id===unitId);if(matches.length!==1)return reject("Unique owned plundering unit required");
  const unit=matches[0],def=GameInfo.Units.lookup(unit.type),location={x:unit.location?.x,y:unit.location?.y},same=(a,b)=>a?.owner===b?.owner&&a?.id===b?.id&&a?.type===b?.type;
  if(unit.isOnMap!==true||unit.isDead===true||unit.isCommanderUnit||unit.isEmbarked!==false||unit.operationQueueSize!==0||unit.Combat?.isCombat!==true||!["DOMAIN_LAND","DOMAIN_SEA"].includes(def?.Domain)||!["FORMATION_CLASS_LAND_COMBAT","FORMATION_CLASS_NAVAL"].includes(def.FormationClass)||
      !Number.isFinite(unit.Movement?.movementMovesRemaining)||unit.Movement.movementMovesRemaining<=0||![location.x,location.y].every(v=>Number.isInteger(v)&&v>=0)||location.x>=GameplayMap.getGridWidth()||location.y>=GameplayMap.getGridHeight())return reject("Ready deployed unqueued unembarked land/sea combat unit required");
  function clear(){
    if(GameplayMap.getRevealedState(playerId,location.x,location.y)!==RevealedStates.VISIBLE)return false;
    const owner=GameplayMap.getOwner(location.x,location.y),ids=MapUnits.getUnits(location.x,location.y);
    if(![-1,playerId].includes(owner)&&!(Number.isInteger(owner)&&owner>=0&&player.Diplomacy.hasMet(owner)===true&&player.Diplomacy.isAtWarWith(owner)===true))return false;
    if(!Array.isArray(ids)||ids.length!==1||!same(ids[0],unit.id))return false;
    for(const c of owned.filter(u=>u.isCommanderUnit)){const a=typeof Armies!=="undefined"?Armies.get(c.armyId):null,members=a?.owner===playerId?a.getUnitIds?.():null;if(!Array.isArray(members)||members.some(id=>same(id,unit.id)))return false;}
    return typeof player.Armies?.getUnitReinforcementCommanderId==="function"&&player.Armies.getUnitReinforcementCommanderId(unit.id,playerId)===-1;
  }
  if(!clear()||!Number.isFinite(player.Treasury?.goldBalance)||player.Treasury.goldBalance<0)return reject("Visible sole-unit source on own/unowned/existing-war tile, known packing and treasury required");
  const before={turn:Game.turn,age:Game.age,playerId,unitId,unitType:unit.type,componentType:unit.id.type,location,moves:unit.Movement.movementMovesRemaining,gold:player.Treasury.goldBalance};
  const args={X:-9999,Y:-9999,UnitAbilityType:-1},check=Game.UnitCommands.canStart(unit.id,command,args,false);
  if(check?.Success!==true||check.RequiresConfirmation===true)return reject("Native current-tile trade plunder unavailable or requires confirmation",check?.FailureReasons??[]);
  if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||unit.id.owner!==playerId||unit.id.type!==before.componentType||unit.type!==before.unitType||unit.isOnMap!==true||unit.isDead===true||unit.isEmbarked!==false||unit.operationQueueSize!==0||
      unit.location.x!==location.x||unit.location.y!==location.y||unit.Movement.movementMovesRemaining!==before.moves||player.Treasury.goldBalance!==before.gold||!clear())return reject("Plunder unit, source, treasury or context changed during validation");
  Game.UnitCommands.sendRequest(unit.id,command,args);
  return{status:"submitted",before,expected:{plunderObserved:true},verificationArguments:{unit_id:unitId,unit_type:unit.type,component_type:unit.id.type,location,before_moves:before.moves,before_gold:before.gold},
    verificationScope:"Native selects an eligible trade route at the exact current tile; no exact route/owner selection or physical road destruction claim. Readback proves movement spend, stable source, positive treasury gain and command no longer available, not complete route identity/payload/connectivity effects"};
})()
