(() => {
  const {unit_id: unitId, target_city_id: cityId, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (![unitId, cityId, expectedTurn].every(v => Number.isInteger(v) && v >= 0)) return reject("Exact owned aircraft/city IDs and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn) return reject("A fresh active local turn is required");
  const units = player.Units.getUnits().filter(u => u.id.owner === playerId && u.id.id === unitId);
  const cities = player.Cities.getCities().filter(c => c.id.owner === playerId && c.id.id === cityId);
  if (units.length !== 1 || cities.length !== 1) return reject("Unique owned aircraft and destination city identities are required");
  const unit = units[0], city = cities[0], destination = {x: city.location?.x, y: city.location?.y};
  const valid = l => l && [l.x, l.y].every(v => Number.isInteger(v) && v >= 0) && l.x < GameplayMap.getGridWidth() && l.y < GameplayMap.getGridHeight();
  const visible = l => valid(l) && GameplayMap.getRevealedState(playerId, l.x, l.y) === RevealedStates.VISIBLE;
  if (unit.isOnMap !== true || unit.isCommanderUnit || unit.isDead === true || unit.operationQueueSize !== 0 ||
      GameInfo.Units.lookup(unit.type)?.Domain !== "DOMAIN_AIR" || GameInfo.Units.lookup(unit.type)?.FormationClass !== "FORMATION_CLASS_AIR" ||
      !visible(unit.location) || !visible(destination) || GameplayMap.getOwner(destination.x, destination.y) !== playerId ||
      !Number.isFinite(unit.Health?.damage) || !Number.isFinite(unit.Health.maxDamage) || unit.Health.damage < 0 || unit.Health.damage >= unit.Health.maxDamage ||
      typeof player.Armies?.getUnitReinforcementCommanderId !== "function" || player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) return reject("A deployed visible unqueued nonreinforcing aircraft and visible owned city centre are required");
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
  if (!baseline || baseline.some(a => a.packedUnitIds.includes(unitId))) return reject("Aircraft is packed or complete owned army membership is unknown");
  const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
    targetCityId: cityId, targetCityComponentType: city.id.type, location: {x: unit.location.x, y: unit.location.y}, destination,
    damage: unit.Health.damage, armies: baseline};
  if (before.location.x === destination.x && before.location.y === destination.y) return {status: "already_active", before};
  const operation = "UNITOPERATION_REBASE", args = {X: destination.x, Y: destination.y};
  const picker = Game.UnitOperations.canStart(unit.id, operation, {}, false);
  if (picker?.Success !== true || !Array.isArray(picker.Plots) || !picker.Plots.includes(GameplayMap.getIndexFromLocation(destination))) return reject("Native rebase picker does not offer the exact city centre", picker?.FailureReasons ?? []);
  const check = Game.UnitOperations.canStart(unit.id, operation, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Exact native rebase permission failed or needs confirmation", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      unit.id.owner !== playerId || unit.id.type !== before.componentType || unit.type !== before.unitType || unit.isOnMap !== true || unit.operationQueueSize !== 0 ||
      unit.location.x !== before.location.x || unit.location.y !== before.location.y || unit.Health.damage !== before.damage ||
      city.id.owner !== playerId || city.id.type !== before.targetCityComponentType || city.location?.x !== destination.x || city.location?.y !== destination.y ||
      !visible(unit.location) || !visible(destination) || GameplayMap.getOwner(destination.x, destination.y) !== playerId ||
      JSON.stringify(armies()) !== JSON.stringify(baseline) || player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) return reject("Aircraft, city, membership or game context changed during validation");
  const verificationArguments = {unit_id: unitId, target_city_id: cityId, unit_type: before.unitType, component_type: before.componentType,
    target_city_component_type: before.targetCityComponentType, destination, baseline_armies: baseline, before_damage: before.damage};
  Game.UnitOperations.sendRequest(unit.id, operation, args);
  return {status: "submitted", before, expected: {unitId, targetCityId: cityId, rebaseObserved: true}, verificationArguments,
    verificationScope: "Exact aircraft deployed at the captured owned city centre, clear operation queue, stable health and all owned army memberships preserved; no carrier/squadron transfer or future-turn arrival claim"};
})()
