(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player) throw Error("No local player");
  const {unit_id: unitId, target_city_id: cityId, unit_type: unitType, component_type: componentType,
    target_city_component_type: cityComponentType, destination, baseline_armies: baseline, before_damage: damage,
    expected_armies: expectedArmies = baseline, target_air_base: targetBase = null} = queryArguments;
  if (![unitId, cityId, componentType, cityComponentType, destination?.x, destination?.y].every(v => Number.isInteger(v) && v >= 0) ||
      !Number.isInteger(unitType) || !Array.isArray(baseline) || !Array.isArray(expectedArmies) || !Number.isFinite(damage) || damage < 0 ||
      destination.x >= GameplayMap.getGridWidth() || destination.y >= GameplayMap.getGridHeight()) throw Error("Invalid captured rebase identity/baseline");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), units = owned.filter(u => u.id.id === unitId);
  const cities = player.Cities.getCities().filter(c => c.id.owner === playerId && c.id.id === cityId);
  if (units.length !== 1 || units[0].id.type !== componentType || units[0].type !== unitType || cities.length !== 1 || cities[0].id.type !== cityComponentType) throw Error("Captured aircraft or city identity changed");
  const armies = [], seen = new Set();
  for (const c of owned.filter(u => u.isCommanderUnit)) {
    const a = Armies.get(c.armyId), identity = a?.getCommanderId?.(), ids = a?.getUnitIds?.();
    if (a?.owner !== playerId || !Number.isInteger(a.localId) || a.localId < 0 || identity?.owner !== playerId || identity.id !== c.id.id || identity.type !== c.id.type ||
        !Array.isArray(ids) || ids.some(id => id.owner !== playerId || id.id === c.id.id || owned.filter(u => u.id.id === id.id && u.id.type === id.type).length !== 1)) throw Error("Owned packed membership is unverified");
    const members = ids.map(id => id.id).sort((a, b) => a - b);
    for (const id of members) {if (seen.has(id)) throw Error("Packed membership is ambiguous"); seen.add(id);}
    armies.push({commanderId: c.id.id, commanderType: c.type, componentType: c.id.type, armyId: a.localId, packedUnitIds: members});
  }
  armies.sort((a, b) => a.commanderId - b.commanderId);
  if (new Set(armies.map(a => a.commanderId)).size !== armies.length) throw Error("Commander identity is ambiguous");
  const unit = units[0], city = cities[0];
  const base = targetBase ? owned.find(u => u.id.id === targetBase.commanderId) : null;
  const stationed = targetBase && base?.id.type === targetBase.componentType && base.type === targetBase.commanderType && base.isAerodromeCommander === true && base.isOnMap === true &&
    base.location?.x === destination.x && base.location?.y === destination.y && unit.isOnMap === false && unit.armyId?.owner === playerId &&
    unit.armyId.id === targetBase.armyId && unit.armyId.type === targetBase.armyComponentType &&
    armies.find(a => a.commanderId === targetBase.commanderId)?.packedUnitIds.includes(unitId);
  const deployed = !targetBase && unit.isOnMap === true && !seen.has(unitId) && unit.location?.x === destination.x && unit.location?.y === destination.y;
  const rebaseObserved = Boolean((stationed || deployed) && unit.isDead !== true && unit.operationQueueSize === 0 && unit.Health?.damage === damage &&
    city.location?.x === destination.x && city.location?.y === destination.y &&
    GameplayMap.getRevealedState(playerId, destination.x, destination.y) === RevealedStates.VISIBLE && GameplayMap.getOwner(destination.x, destination.y) === playerId &&
    JSON.stringify(armies) === JSON.stringify(expectedArmies));
  return {turn: Game.turn, age: Game.age, playerId, unitId, targetCityId: cityId, rebaseObserved, armies,
    location: unit.isOnMap === true ? {x: unit.location?.x, y: unit.location?.y} : null,
    stationedInAirBase: stationed ? targetBase.commanderId : null, queueSize: unit.operationQueueSize};
})()
