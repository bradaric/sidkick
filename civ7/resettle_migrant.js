(() => {
  const {unit_id: unitId, x, y, improvement, expected_turn: expectedTurn} = queryArguments;
  const reject=(reason,failureReasons=[])=>({status:"rejected",reason,failureReasons});
  if (![unitId,x,y,expectedTurn].every(v=>Number.isInteger(v)&&v>=0)||typeof improvement!=="string"||!improvement) return reject("Exact Migrant, expansion tile/improvement and expected turn required");
  if(!UI.isInGame())return reject("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId);
  if(!Number.isInteger(playerId)||playerId<0||!player||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||Game.turn!==expectedTurn)return reject("Fresh active local turn required");
  const owned=player.Units.getUnits().filter(u=>u.id.owner===playerId),matches=owned.filter(u=>u.id.id===unitId);
  if(matches.length!==1)return reject("Unique owned Migrant required");
  const unit=matches[0],valid=l=>l&&[l.x,l.y].every(v=>Number.isInteger(v)&&v>=0)&&l.x<GameplayMap.getGridWidth()&&l.y<GameplayMap.getGridHeight();
  if(GameInfo.Units.lookup(unit.type)?.UnitType!=="UNIT_MIGRANT"||unit.isCommanderUnit||unit.isOnMap!==true||unit.isDead===true||unit.isEmbarked!==false||unit.operationQueueSize!==0||!valid(unit.location)||!valid({x,y})||
      !Number.isFinite(unit.Movement?.movementMovesRemaining)||unit.Movement.movementMovesRemaining<=0)return reject("Ready deployed unqueued unembarked Migrant required");
  const source={x:unit.location.x,y:unit.location.y},same=(a,b)=>a?.owner===b?.owner&&a?.id===b?.id&&a?.type===b?.type;
  const cities=player.Cities.getCities().filter(c=>c.id.owner===playerId),cityId=MapCities.getCity(source.x,source.y),city=cities.find(c=>same(c.id,cityId));
  if(!city||![city.population,city.pendingPopulation].every(v=>Number.isInteger(v)&&v>=0))return reject("One owned source settlement and known population required");
  function clear(){
    if(GameplayMap.getRevealedState(playerId,source.x,source.y)!==RevealedStates.VISIBLE||GameplayMap.getRevealedState(playerId,x,y)!==RevealedStates.VISIBLE||GameplayMap.getOwner(source.x,source.y)!==playerId||
        ![-1,playerId].includes(GameplayMap.getOwner(x,y)))return false;
    const c=MapCities.getCity(x,y),ids=MapConstructibles.getConstructibles(x,y),units=MapUnits.getUnits(x,y);
    if(c?.owner>=0&&!same(c,city.id)||!Array.isArray(ids)||ids.length||!Array.isArray(units)||units.length)return false;
    for(const commander of owned.filter(u=>u.isCommanderUnit)){
      const a=typeof Armies!=="undefined"?Armies.get(commander.armyId):null,members=a?.owner===playerId?a.getUnitIds?.():null;
      if(!Array.isArray(members)||members.some(id=>same(id,unit.id)))return false;
    }
    return typeof player.Armies?.getUnitReinforcementCommanderId==="function"&&player.Armies.getUnitReinforcementCommanderId(unit.id,playerId)===-1;
  }
  if(!clear())return reject("Visible empty own/unowned native expansion tile in this source settlement required; no implicit tile transfer");
  const components=city.Constructibles.getIds(),validId=id=>id?.owner===playerId&&[id.id,id.type].every(v=>Number.isInteger(v)&&v>=0);
  if(!Array.isArray(components)||components.some(id=>!validId(id)))return reject("Source constructible inventory unknown");
  const before={turn:Game.turn,age:Game.age,playerId,unitId,unitType:unit.type,componentType:unit.id.type,cityId:city.id.id,cityComponentType:city.id.type,
    location:source,moves:unit.Movement.movementMovesRemaining,population:city.population,pendingPopulation:city.pendingPopulation,componentIds:components.map(id=>({owner:id.owner,id:id.id,type:id.type}))};
  const command="UNITCOMMAND_RESETTLE",picker=Game.UnitCommands.canStart(unit.id,command,{},false),plot=GameplayMap.getIndexFromLocation({x,y});
  if(picker?.Success!==true||!Array.isArray(picker.Plots)||!Array.isArray(picker.ConstructibleTypes))return reject("Native resettlement picker unavailable",picker?.FailureReasons??[]);
  const offered=picker.Plots.flatMap((p,i)=>p===plot&&picker.ConstructibleTypes[i]!=null?[GameInfo.Constructibles.lookup(picker.ConstructibleTypes[i])]:[]);
  if(!offered.length||offered.some(d=>d?.ConstructibleClass!=="IMPROVEMENT"||d.ConstructibleType!==improvement||!Number.isInteger(d.$hash)))return reject("Exact chosen native improvement not offered, or target metadata ambiguous");
  const args={X:x,Y:y},check=Game.UnitCommands.canStart(unit.id,command,args,false);
  if(check?.Success!==true||check.RequiresConfirmation===true)return reject("Native selected resettlement failed or needs confirmation",check?.FailureReasons??[]);
  if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||unit.id.owner!==playerId||unit.id.type!==before.componentType||unit.type!==before.unitType||
      unit.isOnMap!==true||unit.operationQueueSize!==0||unit.location.x!==source.x||unit.location.y!==source.y||unit.Movement.movementMovesRemaining!==before.moves||city.id.owner!==playerId||city.id.type!==before.cityComponentType||
      city.population!==before.population||city.pendingPopulation!==before.pendingPopulation||!clear()||JSON.stringify(city.Constructibles.getIds())!==JSON.stringify(before.componentIds))return reject("Migrant, source city, tile, population or turn changed during validation");
  Game.UnitCommands.sendRequest(unit.id,command,args);
  return{status:"submitted",before,expected:{cityId:before.cityId,improvement,location:{x,y},resettleObserved:true},verificationArguments:{city_id:before.cityId,x,y,improvement,
    baseline_component_ids:before.componentIds,resettle_unit_id:unitId,resettle_unit_type:unit.type,resettle_component_type:unit.id.type,before_population:before.population,before_pending_population:before.pendingPopulation},
    verificationScope:"Exact consumed Migrant plus one new chosen improvement in captured city and observed population/pending increase; no turn or implicit tile transfer"};
})()
