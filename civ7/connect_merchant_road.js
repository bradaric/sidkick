(() => {
  const {unit_id: unitId,target_city_id:targetId,expected_turn:expectedTurn}=queryArguments;
  const reject=(reason,failureReasons=[])=>({status:"rejected",reason,failureReasons});
  if(![unitId,targetId,expectedTurn].every(v=>Number.isInteger(v)&&v>=0))return reject("Exact Merchant, owned target city and expected turn required");
  if(!UI.isInGame())return reject("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId);
  if(!Number.isInteger(playerId)||playerId<0||!player||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||Game.turn!==expectedTurn)return reject("Fresh active local turn required");
  const owned=player.Units.getUnits().filter(u=>u.id.owner===playerId),matches=owned.filter(u=>u.id.id===unitId),cities=player.Cities.getCities().filter(c=>c.id.owner===playerId);
  if(matches.length!==1)return reject("Unique owned Merchant required");
  const unit=matches[0],same=(a,b)=>a?.owner===b?.owner&&a?.id===b?.id&&a?.type===b?.type;
  const valid=l=>l&&[l.x,l.y].every(v=>Number.isInteger(v)&&v>=0)&&l.x<GameplayMap.getGridWidth()&&l.y<GameplayMap.getGridHeight();
  if(GameInfo.Units.lookup(unit.type)?.UnitType!=="UNIT_MERCHANT"||unit.isCommanderUnit||unit.isOnMap!==true||unit.isDead===true||unit.isEmbarked!==false||unit.operationQueueSize!==0||!valid(unit.location)||
      !Number.isFinite(unit.Movement?.movementMovesRemaining)||unit.Movement.movementMovesRemaining<=0)return reject("Ready deployed unqueued unembarked Merchant required");
  const sourceId=MapCities.getCity(unit.location.x,unit.location.y),sources=cities.filter(c=>same(c.id,sourceId)),targets=cities.filter(c=>c.id.id===targetId);
  if(sources.length!==1||targets.length!==1||same(sources[0].id,targets[0].id))return reject("Distinct exact owned source and target settlements required");
  const source=sources[0],target=targets[0],origin={x:unit.location.x,y:unit.location.y},destination={x:target.location?.x,y:target.location?.y};
  const visibleOwned=l=>valid(l)&&GameplayMap.getRevealedState(playerId,l.x,l.y)===RevealedStates.VISIBLE&&GameplayMap.getOwner(l.x,l.y)===playerId;
  function clear(){
    if(!visibleOwned(origin)||!visibleOwned(destination)||source.location?.x!==origin.x||source.location?.y!==origin.y)return false;
    for(const c of owned.filter(u=>u.isCommanderUnit)){const a=typeof Armies!=="undefined"?Armies.get(c.armyId):null,ids=a?.owner===playerId?a.getUnitIds?.():null;if(!Array.isArray(ids)||ids.some(id=>same(id,unit.id)))return false;}
    return typeof player.Armies?.getUnitReinforcementCommanderId==="function"&&player.Armies.getUnitReinforcementCommanderId(unit.id,playerId)===-1;
  }
  const connections=c=>{const ids=c.getConnectedCities();return Array.isArray(ids)?ids.filter(id=>id.owner===playerId&&cities.some(city=>same(city.id,id))).map(id=>({owner:id.owner,id:id.id,type:id.type})).sort((a,b)=>a.id-b.id):null;};
  if(!clear())return reject("Merchant at visible owned source centre, visible owned target centre and known unpacked/nonreinforcing state required");
  const sourceLinks=connections(source),targetLinks=connections(target);
  if(!sourceLinks||!targetLinks||sourceLinks.some(id=>same(id,target.id))||targetLinks.some(id=>same(id,source.id)))return reject("Endpoints already connected or connection inventory unknown; cannot prove a new road connection");
  const before={turn:Game.turn,age:Game.age,playerId,unitId,unitType:unit.type,componentType:unit.id.type,moves:unit.Movement.movementMovesRemaining,
    sourceCityId:source.id.id,sourceComponentType:source.id.type,targetComponentType:target.id.type,origin,destination,sourceLinks,targetLinks};
  const command="UNITCOMMAND_CONNECT_WITH_ROAD",picker=Game.UnitCommands.canStart(unit.id,command,{},false),args={X:destination.x,Y:destination.y};
  if(picker?.Success!==true||!Array.isArray(picker.Plots)||!picker.Plots.includes(GameplayMap.getIndexFromLocation(destination)))return reject("Exact target city centre not offered by native road command",picker?.FailureReasons??[]);
  const check=Game.UnitCommands.canStart(unit.id,command,args,false);
  if(check?.Success!==true||check.RequiresConfirmation===true||Number.isFinite(check.Cost)&&check.Cost>0)return reject("Native road failed, needs confirmation or quotes unsupported extra cost",check?.FailureReasons??[]);
  if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||unit.id.owner!==playerId||unit.id.type!==before.componentType||unit.type!==before.unitType||unit.isOnMap!==true||unit.operationQueueSize!==0||
      unit.location.x!==origin.x||unit.location.y!==origin.y||unit.Movement.movementMovesRemaining!==before.moves||source.id.owner!==playerId||target.id.owner!==playerId||source.id.type!==before.sourceComponentType||target.id.type!==before.targetComponentType||
      target.location.x!==destination.x||target.location.y!==destination.y||!clear()||JSON.stringify(connections(source))!==JSON.stringify(sourceLinks)||JSON.stringify(connections(target))!==JSON.stringify(targetLinks))return reject("Merchant, endpoints, connections or context changed during validation");
  Game.UnitCommands.sendRequest(unit.id,command,args);
  return{status:"submitted",before,expected:{roadConnectionObserved:true},verificationArguments:{unit_id:unitId,unit_type:before.unitType,component_type:before.componentType,
    source_city_id:source.id.id,target_city_id:targetId,source_component_type:source.id.type,target_component_type:target.id.type,source_location:origin,target_location:destination,
    before_moves:before.moves,source_connections:sourceLinks,target_connections:targetLinks},verificationScope:"Merchant consumption/movement spend and new bidirectional owned city connection, preserving prior endpoint links; not independent proof of every road hex or a travel order"};
})()
