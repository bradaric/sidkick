(() => {
  const {unit_id: unitId, target_city_id: cityId, expected_turn: expectedTurn} = queryArguments;
  const targetCommanderId = queryArguments.target_commander_id, transfer = targetCommanderId !== undefined;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (![unitId, transfer ? targetCommanderId : cityId, expectedTurn].every(v => Number.isInteger(v) && v >= 0) || transfer && (unitId === targetCommanderId || cityId != null)) return reject("Exact owned aircraft, one city/air-commander target and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn) return reject("A fresh active local turn is required");
  const units = player.Units.getUnits().filter(u => u.id.owner === playerId && u.id.id === unitId);
  const targets = transfer ? player.Units.getUnits().filter(u=>u.id.owner===playerId&&u.id.id===targetCommanderId) : player.Cities.getCities().filter(c => c.id.owner === playerId && c.id.id === cityId);
  if (units.length !== 1 || targets.length !== 1) return reject("Unique owned aircraft and destination city/commander identities are required");
  const unit = units[0], city = transfer ? null : targets[0], destination = {x: targets[0].location?.x, y: targets[0].location?.y};
  const valid = l => l && [l.x, l.y].every(v => Number.isInteger(v) && v >= 0) && l.x < GameplayMap.getGridWidth() && l.y < GameplayMap.getGridHeight();
  const visible = l => valid(l) && GameplayMap.getRevealedState(playerId, l.x, l.y) === RevealedStates.VISIBLE;
  if (unit.isCommanderUnit || unit.isDead === true || unit.operationQueueSize !== 0 ||
      GameInfo.Units.lookup(unit.type)?.Domain !== "DOMAIN_AIR" || GameInfo.Units.lookup(unit.type)?.FormationClass !== "FORMATION_CLASS_AIR" ||
      !visible(destination) || !(transfer ? [-1,playerId].includes(GameplayMap.getOwner(destination.x,destination.y)) : GameplayMap.getOwner(destination.x, destination.y) === playerId) ||
      !Number.isFinite(unit.Health?.damage) || !Number.isFinite(unit.Health.maxDamage) || unit.Health.damage < 0 || unit.Health.damage >= unit.Health.maxDamage ||
      typeof player.Armies?.getUnitReinforcementCommanderId !== "function" || player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) return reject("An unqueued nonreinforcing aircraft and visible owned city centre are required");
  function armies() {
    if (typeof Armies === "undefined" || typeof Armies.get !== "function") return null;
    const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), seen = new Set(), records = [];
    for (const c of owned.filter(u => u.isCommanderUnit)) {
      const a = Armies.get(c.armyId), identity = a?.getCommanderId?.(), ids = a?.getUnitIds?.();
      if (a?.owner !== playerId || !Number.isInteger(a.localId) || a.localId < 0 || identity?.owner !== playerId || identity.id !== c.id.id || identity.type !== c.id.type ||
          !Array.isArray(ids) || ids.some(id => id.owner !== playerId || id.id === c.id.id || owned.filter(u => u.id.id === id.id && u.id.type === id.type).length !== 1)) return null;
      const members = ids.map(id => id.id).sort((a, b) => a - b);
      for (const id of members) {if (seen.has(id)) return null; seen.add(id);}
      records.push({commanderId: c.id.id, commanderType: c.type, componentType: c.id.type, armyId: a.localId, packedUnitIds: members});
    }
    records.sort((a, b) => a.commanderId - b.commanderId);
    return new Set(records.map(a => a.commanderId)).size === records.length ? records : null;
  }
  const baseline = armies();
  if (!baseline) return reject("Complete owned army membership is unknown");
  function baseInfo(id) {
    const c = player.Units.getUnits().find(u => u.id.owner === playerId && u.id.id === id), a = baseline.find(a => a.commanderId === id);
    const kind = c?.isAerodromeCommander === true ? "city" : c?.isSquadronCommander === true ? "squadron" : c && GameInfo.Units.lookup(c.type)?.UnitType === "UNIT_CARRIER_COMMANDER" ? "carrier" : null;
    if (!c || !kind || c.isOnMap !== true || c.isDead === true || c.operationQueueSize !== 0 || !a ||
        !visible(c.location) || ![-1,playerId].includes(GameplayMap.getOwner(c.location.x,c.location.y)) || !Number.isInteger(c.armyId?.type) ||
        c.armyId.owner !== playerId || c.armyId.id !== a.armyId) return null;
    if(kind === "carrier" && GameplayMap.isWater(c.location.x,c.location.y) !== true)return null;
    const cities = player.Cities.getCities().filter(city => city.id.owner === playerId && city.location?.x === c.location.x && city.location?.y === c.location.y);
    if (kind === "city" && (cities.length !== 1 || GameplayMap.getOwner(c.location.x,c.location.y) !== playerId)) return null;
    return {commanderId: c.id.id, commanderType: c.type, componentType: c.id.type, armyId: a.armyId, armyComponentType: c.armyId.type,
      location: {x: c.location.x, y: c.location.y}, kind, cityId: kind === "city" ? cities[0].id.id : null, cityComponentType: kind === "city" ? cities[0].id.type : null};
  }
  const containing = baseline.filter(a => a.packedUnitIds.includes(unitId));
  const sourceBase = containing.length === 1 ? baseInfo(containing[0].commanderId) : null;
  if (containing.length && (!sourceBase || unit.isOnMap !== false || unit.armyId?.owner !== playerId || unit.armyId.id !== sourceBase.armyId || unit.armyId.type !== sourceBase.armyComponentType)) return reject("Packed source must be stationed in one captured visible owned city Aerodrome, squadron or carrier");
  const source = sourceBase ? sourceBase.location : unit.location;
  if ((!sourceBase && unit.isOnMap !== true) || !visible(source)) return reject("Aircraft source deployment or visible city Aerodrome is unverified");
  const baseCandidates = player.Units.getUnits().filter(u => u.id.owner === playerId && (u.isAerodromeCommander === true || transfer && (u.isSquadronCommander === true || GameInfo.Units.lookup(u.type)?.UnitType === "UNIT_CARRIER_COMMANDER")) && u.location?.x === destination.x && u.location?.y === destination.y);
  if (baseCandidates.length > 1) return reject("Destination city Aerodrome identity is ambiguous");
  const targetBase = baseCandidates.length ? baseInfo(baseCandidates[0].id.id) : null;
  if (transfer ? !targetBase || targetBase.commanderId !== targetCommanderId : baseCandidates.length && (!targetBase || targetBase.cityId !== cityId)) return reject("Destination air commander identity/location is unverified or ambiguous");
  const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
    targetCityId: cityId ?? null, targetCityComponentType: city?.id.type ?? null, targetCommanderId: targetCommanderId ?? null, location: {x: source.x, y: source.y}, destination,
    rawLocation: {x: unit.location?.x, y: unit.location?.y}, onMap: unit.isOnMap,
    sourceAirBase: sourceBase, targetAirBase: targetBase, damage: unit.Health.damage, armies: baseline};
  if (targetBase ? sourceBase?.commanderId === targetBase.commanderId : before.location.x === destination.x && before.location.y === destination.y) return {status: "already_active", before};
  const operation = "UNITOPERATION_REBASE", args = {X: destination.x, Y: destination.y};
  const picker = Game.UnitOperations.canStart(unit.id, operation, {}, false);
  if (picker?.Success !== true || !Array.isArray(picker.Plots) || !picker.Plots.includes(GameplayMap.getIndexFromLocation(destination))) return reject("Native rebase picker does not offer the exact city/air-commander destination", picker?.FailureReasons ?? []);
  const check = Game.UnitOperations.canStart(unit.id, operation, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Exact native rebase permission failed or needs confirmation", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      unit.id.owner !== playerId || unit.id.type !== before.componentType || unit.type !== before.unitType || unit.isOnMap !== before.onMap || unit.operationQueueSize !== 0 ||
      unit.location?.x !== before.rawLocation.x || unit.location?.y !== before.rawLocation.y || unit.Health.damage !== before.damage ||
      (!transfer && (city.id.owner !== playerId || city.id.type !== before.targetCityComponentType || city.location?.x !== destination.x || city.location?.y !== destination.y)) ||
      (!sourceBase && !visible(unit.location)) || (sourceBase && JSON.stringify(baseInfo(sourceBase.commanderId)) !== JSON.stringify(sourceBase)) ||
      (targetBase && JSON.stringify(baseInfo(targetBase.commanderId)) !== JSON.stringify(targetBase)) ||
      !visible(destination) || !(transfer ? [-1,playerId].includes(GameplayMap.getOwner(destination.x,destination.y)) : GameplayMap.getOwner(destination.x,destination.y) === playerId) ||
      JSON.stringify(armies()) !== JSON.stringify(baseline) || player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) return reject("Aircraft, city, membership or game context changed during validation");
  const expectedArmies = baseline.map(a => {
    let ids = a.packedUnitIds;
    if (sourceBase && a.commanderId === sourceBase.commanderId) ids = ids.filter(id => id !== unitId);
    if (targetBase && a.commanderId === targetBase.commanderId) ids = [...ids, unitId].sort((a, b) => a - b);
    return {...a, packedUnitIds: ids};
  });
  const verificationArguments = {unit_id: unitId, target_city_id: cityId ?? null, ...(transfer ? {target_commander_id:targetCommanderId} : {}), unit_type: before.unitType, component_type: before.componentType,
    target_city_component_type: before.targetCityComponentType, destination, baseline_armies: baseline, expected_armies: expectedArmies,
    target_air_base: targetBase, before_damage: before.damage};
  Game.UnitOperations.sendRequest(unit.id, operation, args);
  return {status: "submitted", before, expected: {unitId, ...(transfer ? {targetCommanderId} : {targetCityId:cityId}), rebaseObserved: true}, verificationArguments,
    verificationScope: "Exact aircraft arrival/stationing at captured city Aerodrome, squadron or carrier, clear queue, stable health and precisely the captured source/destination membership delta with all other members preserved; no future-turn or mission-effect claim"};
})()
