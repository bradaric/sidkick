(() => {
  if(!UI.isInGame())throw Error("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId);
  if(!Number.isInteger(playerId)||playerId<0||!player)throw Error("No local player");
  const {unit_id:unitId,unit_type:unitType,component_type:componentType,source_city_id:sourceId,target_city_id:targetId,source_component_type:sourceType,target_component_type:targetType,
    source_location:origin,target_location:destination,before_moves:moves,source_connections:sourceLinks,target_connections:targetLinks}=queryArguments;
  if(![unitId,componentType,sourceId,targetId,sourceType,targetType,origin?.x,origin?.y,destination?.x,destination?.y].every(v=>Number.isInteger(v)&&v>=0)||!Number.isInteger(unitType)||!Number.isFinite(moves)||moves<=0||![sourceLinks,targetLinks].every(Array.isArray))throw Error("Invalid captured road identity");
  const cities=player.Cities.getCities().filter(c=>c.id.owner===playerId),sources=cities.filter(c=>c.id.id===sourceId&&c.id.type===sourceType),targets=cities.filter(c=>c.id.id===targetId&&c.id.type===targetType);
  if(sources.length!==1||targets.length!==1)throw Error("Captured road endpoint changed");
  const units=player.Units.getUnits().filter(u=>u.id.owner===playerId&&u.id.id===unitId);
  if(units.length>1||units.length&&(units[0].type!==unitType||units[0].id.type!==componentType))throw Error("Captured Merchant identity changed");
  const unit=units[0],spent=!unit||Number.isFinite(unit.Movement?.movementMovesRemaining)&&unit.Movement.movementMovesRemaining>=0&&unit.Movement.movementMovesRemaining<moves;
  const source=sources[0],target=targets[0],a=source.getConnectedCities(),b=target.getConnectedCities(),same=(a,b)=>a?.owner===b?.owner&&a?.id===b?.id&&a?.type===b?.type;
  const stable=source.location?.x===origin.x&&source.location?.y===origin.y&&target.location?.x===destination.x&&target.location?.y===destination.y&&[origin,destination].every(l=>GameplayMap.getRevealedState(playerId,l.x,l.y)===RevealedStates.VISIBLE&&GameplayMap.getOwner(l.x,l.y)===playerId);
  return{turn:Game.turn,age:Game.age,playerId,sourceCityId:sourceId,targetCityId:targetId,merchantConsumed:!unit,
    roadConnectionObserved:Boolean(spent&&stable&&Array.isArray(a)&&Array.isArray(b)&&a.some(id=>same(id,target.id))&&b.some(id=>same(id,source.id))&&sourceLinks.every(id=>a.some(next=>same(next,id)))&&targetLinks.every(id=>b.some(next=>same(next,id))))};
})()
