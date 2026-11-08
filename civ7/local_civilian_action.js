(() => {
  const {unit_id: unitId, kind, expected_turn: expectedTurn, ability = null} = queryArguments;
  const modes = {found: [false, "UNITOPERATION_FOUND_CITY"],found_adjacent:[false,"UNITOPERATION_FOUND_CITY_ADJACENT_PLOT"],foreign_spread:[false,"UNITOPERATION_SPREAD_RELIGION"], excavate: [false, "UNITOPERATION_EXCAVATE"], research: [false, "UNITOPERATION_RESEARCH_ARTIFACTS"],
    spread: [false, "UNITOPERATION_SPREAD_RELIGION"], great_person: [true, "UNITCOMMAND_ACTIVATE_GREAT_PERSON"], resettle: [true, "UNITCOMMAND_RESETTLE"]};
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (!Object.hasOwn(modes, kind) || ![unitId, expectedTurn].every(v => Number.isInteger(v) && v >= 0) || (ability !== null && (typeof ability !== "string" || !ability))) return reject("Exact owned unit, supported local activity/ability and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn) return reject("A fresh active local turn is required");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), matches = owned.filter(u => u.id.id === unitId);
  if (matches.length !== 1) return reject("One unique owned civilian unit is required");
  const unit = matches[0], def = GameInfo.Units.lookup(unit.type), [command, operation] = modes[kind], api = command ? Game.UnitCommands : Game.UnitOperations;
  const adjacent=kind==="found_adjacent",foreignSpread=kind==="foreign_spread",founding=kind==="found"||adjacent,spreading=kind==="spread"||foreignSpread;
  const operationHash = (command ? GameInfo.UnitCommands : GameInfo.UnitOperations).lookup(operation)?.$hash;
  if (!def || !Number.isInteger(operationHash) || unit.isCommanderUnit || unit.isDead === true || unit.isOnMap !== true || (adjacent?typeof unit.isEmbarked!=="boolean":unit.isEmbarked !== false) || unit.operationQueueSize !== 0 ||
      !Number.isFinite(unit.Movement?.movementMovesRemaining) || unit.Movement.movementMovesRemaining <= 0 ||
      founding && def.FoundCity !== true || ["excavate", "research"].includes(kind) && def.ExtractsArtifacts !== true || spreading && !(def.SpreadCharges > 0)) return reject("A ready deployed unqueued role-eligible unit is required; only adjacent founding permits embarkation");
  const location = {x: unit.location?.x, y: unit.location?.y};
  if (![location.x, location.y].every(v => Number.isInteger(v) && v >= 0) || location.x >= GameplayMap.getGridWidth() || location.y >= GameplayMap.getGridHeight()) return reject("Unit location is unknown");
  const same = (a, b) => a?.owner === b?.owner && a?.id === b?.id && a?.type === b?.type;
  function foreignTarget(){
    if(!foreignSpread)return true;
    const {target_player:owner,target_city_id:id}=queryArguments;
    if(![owner,id].every(v=>Number.isInteger(v)&&v>=0)||owner===playerId||player.Diplomacy.hasMet(owner)!==true||GameplayMap.getRevealedState(playerId,location.x,location.y)!==RevealedStates.VISIBLE||GameplayMap.getOwner(location.x,location.y)!==owner)return false;
    const at=MapCities.getCity(location.x,location.y);if(at?.owner!==owner||at.id!==id||!Number.isInteger(at.type))return false;
    const city=Cities.get(at);return same(city?.id,at)&&city.owner===owner&&city.location?.x===location.x&&city.location?.y===location.y;
  }
  const destination=adjacent?{x:queryArguments.x,y:queryArguments.y}:location;
  function adjacentTarget(){
    if(!adjacent)return true;
    if(ability!==null||![destination.x,destination.y].every(v=>Number.isInteger(v)&&v>=0)||destination.x>=GameplayMap.getGridWidth()||destination.y>=GameplayMap.getGridHeight()||GameplayMap.getPlotDistance(location.x,location.y,destination.x,destination.y)!==1||GameplayMap.getRevealedState(playerId,destination.x,destination.y)!==RevealedStates.VISIBLE||GameplayMap.getOwner(destination.x,destination.y)!==-1||GameplayMap.isWater(destination.x,destination.y)!==false)return false;
    const city=MapCities.getCity(destination.x,destination.y),units=MapUnits.getUnits(destination.x,destination.y);return(!city||city.owner<0)&&Array.isArray(units)&&units.length===0;
  }
  function clear() {
    if (GameplayMap.getRevealedState(playerId, location.x, location.y) !== RevealedStates.VISIBLE) return false;
    const cityId = MapCities.getCity(location.x, location.y);
    const neutralRuin = kind === "excavate" && (!cityId || cityId.owner < 0) &&
      (MapConstructibles.getHiddenFilteredConstructibles(location.x, location.y) ?? []).some(id => {
        const c = Constructibles.getByComponentID(id);
        return c && GameInfo.Constructibles.lookup(c.type)?.ConstructibleType === "IMPROVEMENT_RUINS";
      });
    if (![-1, playerId].includes(GameplayMap.getOwner(location.x, location.y)) && !neutralRuin && !(foreignSpread&&foreignTarget())) return false;
    const ids = MapUnits.getUnits(location.x, location.y);
    if (!Array.isArray(ids) || ids.some(id => id.owner !== playerId && !(foreignSpread && id.owner === queryArguments.target_player)) || !ids.some(id => same(id, unit.id))) return false;
    for (const c of owned.filter(u => u.isCommanderUnit)) {
      const a = typeof Armies !== "undefined" ? Armies.get(c.armyId) : null, ids = a?.owner === playerId ? a.getUnitIds?.() : null;
      if (!Array.isArray(ids) || ids.some(id => same(id, unit.id))) return false;
    }
    return typeof player.Armies?.getUnitReinforcementCommanderId === "function" && player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) === -1;
  }
  if (!clear()||!foreignTarget()||!adjacentTarget()) return reject("Exact visible source/destination, qualified foreign centre when requested, no foreign stack except target-owner units for foreign spread and known unpacked/nonreinforcing source required");
  const cities = player.Cities.getCities().filter(c => c.id.owner === playerId), cityAt = MapCities.getCity(location.x, location.y);
  const city = cities.find(c => same(c.id, cityAt));
  if (kind === "found" && (GameplayMap.getOwner(location.x, location.y) !== -1 || cityAt && cityAt.owner >= 0)) return reject("Founding requires an unowned tile outside an existing settlement");
  if (["spread", "resettle"].includes(kind) && (!city || GameplayMap.getOwner(location.x, location.y) !== playerId)) return reject("Initial spread/resettle scope is the current owned settlement only");
  const abilityDef = ability === null ? null : GameInfo.UnitAbilities.lookup(ability);
  if (ability !== null && (abilityDef?.UnitAbilityType !== ability || !Number.isInteger(abilityDef.$index) || (command ? abilityDef.CommandType : abilityDef.OperationType) !== operation)) return reject("Exact supplied ability must belong to this fixed operation/command");
  const args = adjacent?{X:destination.x,Y:destination.y}:{X: location.x, Y: location.y, UnitAbilityType: abilityDef?.$index ?? -1};
  const continent = kind === "research" ? GameplayMap.getContinentType(location.x, location.y) : null;
  const research = kind === "research" ? player.Culture?.getNumAgesResearched(continent) : null;
  const cityIds = cities.map(c => ({owner: c.id.owner, id: c.id.id, type: c.id.type})).sort((a, b) => a.id - b.id);
  if (cityIds.some(id => ![id.id, id.type].every(v => Number.isInteger(v) && v >= 0)) || new Set(cityIds.map(id => id.id)).size !== cityIds.length ||
      kind === "research" && (![continent, research].every(v => Number.isInteger(v) && v >= 0)) ||
      kind === "resettle" && (![city.population, city.pendingPopulation].every(v => Number.isInteger(v) && v >= 0))) return reject("Owned settlement/research/population baseline is unknown");
  const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type, location,
    moves: unit.Movement.movementMovesRemaining,embarked:unit.isEmbarked,destination, cityIds, research, population: city?.population ?? null, pendingPopulation: city?.pendingPopulation ?? null};
  if(adjacent){const picker=api.canStart(unit.id,operation,{},false);if(picker?.Success!==true||!Array.isArray(picker.Plots)||!picker.Plots.includes(GameplayMap.getIndexFromLocation(destination)))return reject("Exact adjacent founding plot not offered natively",picker?.FailureReasons??[]);}
  if (kind === "resettle") {
    const picker = api.canStart(unit.id, operation, {}, false);
    if (picker?.Success !== true || !Array.isArray(picker.Plots) || !picker.Plots.includes(GameplayMap.getIndexFromLocation(location))) return reject("Current tile is not offered for resettlement; choose an explicit native expansion destination instead");
  }
  const check = api.canStart(unit.id, operation, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true || spreading && (!Number.isInteger(check.ChargesRemaining) || check.ChargesRemaining <= 0)) return reject("Native local activity failed, needs confirmation or has unknown spread charges", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || unit.id.owner !== playerId || unit.id.type !== before.componentType || unit.type !== before.unitType ||
      unit.isOnMap !== true || unit.isDead === true || unit.isEmbarked !== before.embarked || unit.operationQueueSize !== 0 || unit.location.x !== location.x || unit.location.y !== location.y || unit.Movement.movementMovesRemaining !== before.moves || !clear() || !foreignTarget()||!adjacentTarget()||
      JSON.stringify(player.Cities.getCities().filter(c => c.id.owner === playerId).map(c => ({owner:c.id.owner,id:c.id.id,type:c.id.type})).sort((a,b)=>a.id-b.id)) !== JSON.stringify(cityIds) ||
      kind === "research" && player.Culture.getNumAgesResearched(continent) !== research || kind === "resettle" && (city.population !== before.population || city.pendingPopulation !== before.pendingPopulation)) return reject("Civilian unit, settlement, research or turn changed during validation");
  api.sendRequest(unit.id, operation, args);
  return {status: "submitted", before, expected: {unitId, activityObserved: true}, verificationArguments: {unit_id: unitId, kind, unit_type: before.unitType, component_type: before.componentType,
    location:destination, operation, operation_hash: operationHash, command, args, baseline_cities: cityIds, before_charges: Number.isInteger(check.ChargesRemaining) ? check.ChargesRemaining : null,
    continent, before_research: research, source_city_id: city?.id.id ?? null, before_population: before.population, before_pending_population: before.pendingPopulation},
    verificationScope: "Founding: new exact owned settlement and consumed settler. Archaeology: exact operation queued or observed research/charge consumption, not future artifact reward. Spread/Great Person: charge/unit consumed, not full effect accounting. Resettle: consumed charge/unit plus observed population/pending growth. No turn advancement"};
})()
