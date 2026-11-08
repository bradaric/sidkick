(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player) throw Error("No local player");
  const {unit_id: unitId, kind, unit_type: unitType, component_type: componentType, location, operation, operation_hash: operationHash, command, args,
    baseline_cities: baseline, before_charges: charges, continent, before_research: research, source_city_id: cityId, before_population: population, before_pending_population: pending} = queryArguments;
  const operations = {found:"UNITOPERATION_FOUND_CITY",found_adjacent:"UNITOPERATION_FOUND_CITY_ADJACENT_PLOT",foreign_spread:"UNITOPERATION_SPREAD_RELIGION",excavate:"UNITOPERATION_EXCAVATE",research:"UNITOPERATION_RESEARCH_ARTIFACTS",spread:"UNITOPERATION_SPREAD_RELIGION",great_person:"UNITCOMMAND_ACTIVATE_GREAT_PERSON",resettle:"UNITCOMMAND_RESETTLE"};
  if (!Object.hasOwn(operations,kind) || operation !== operations[kind] || ![unitId,componentType,location?.x,location?.y].every(v=>Number.isInteger(v)&&v>=0) || !Number.isInteger(unitType) || !Number.isInteger(operationHash) || !Array.isArray(baseline)) throw Error("Invalid captured civilian activity identity");
  const matches = player.Units.getUnits().filter(u=>u.id.owner===playerId&&u.id.id===unitId);
  if (matches.length>1 || matches.length&&(matches[0].type!==unitType||matches[0].id.type!==componentType)) throw Error("Captured civilian identity changed");
  const unit=matches[0], cities=player.Cities.getCities().filter(c=>c.id.owner===playerId), same=(a,b)=>a?.owner===b?.owner&&a?.id===b?.id&&a?.type===b?.type;
  const lost=!unit, queued=Boolean(unit&&unit.operationQueueSize>0&&unit.getOperationType(0)===operationHash);
  let currentCharges=null;
  if (unit&&unit.isOnMap===true&&unit.location?.x===location.x&&unit.location?.y===location.y) {
    const check=(command?Game.UnitCommands:Game.UnitOperations).canStart(unit.id,operation,args,false);
    if (Number.isInteger(check?.ChargesRemaining)&&check.ChargesRemaining>=0) currentCharges=check.ChargesRemaining;
  }
  const chargeSpent=Number.isInteger(charges)&&charges>0&&currentCharges!==null&&currentCharges<charges;
  let observed=false, newSettlements=[], researchNow=null, populationNow=null, pendingNow=null;
  if (kind==='found'||kind==='found_adjacent') {
    newSettlements=cities.filter(c=>!baseline.some(id=>same(id,c.id)));
    observed=lost&&cities.length===baseline.length+1&&baseline.every(id=>cities.some(c=>same(id,c.id)))&&newSettlements.length===1&&
      newSettlements[0].location?.x===location.x&&newSettlements[0].location?.y===location.y;
  } else if (kind==='research') {
    researchNow=player.Culture?.getNumAgesResearched(continent)??null;
    observed=queued || Number.isInteger(researchNow)&&Number.isInteger(research)&&researchNow>research;
  } else if (kind==='resettle') {
    const city=cities.find(c=>c.id.id===cityId); populationNow=city?.population??null;pendingNow=city?.pendingPopulation??null;
    observed=(lost||chargeSpent)&&Number.isInteger(populationNow)&&Number.isInteger(pendingNow)&&
      (populationNow>population||pendingNow>pending);
  } else if (kind==='excavate') observed=queued||chargeSpent||lost;
  else observed=chargeSpent||lost;
  return {turn:Game.turn,age:Game.age,playerId,unitId,activityObserved:Boolean(observed),unitConsumed:lost,operationQueued:queued,
    chargeConsumed:chargeSpent,chargesRemaining:currentCharges,researchNow,populationNow,pendingNow,newSettlements:newSettlements.map(c=>({id:c.id,location:c.location})),
    note:"Queued archaeology is start/order verification, not completed excavation or artifact acquisition. Charge/unit consumption is not complete spread/Great Person effect accounting"};
})()
