(() => {
  const {unit_id: unitId, target_player: targetPlayer, x, y, target_token: token, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (![unitId, targetPlayer, x, y, expectedTurn].every(v => Number.isInteger(v) && v >= 0) || typeof token !== "string" || !token || token.length > 100000) return reject("Exact unit, wartime tile, constructible token and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || targetPlayer === playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn ||
      player.Diplomacy.hasMet(targetPlayer) !== true || player.Diplomacy.isAtWarWith(targetPlayer) !== true) return reject("A fresh active local turn and existing met enemy war are required");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), matches = owned.filter(u => u.id.id === unitId);
  if (matches.length !== 1) return reject("One unique owned pillager is required");
  const unit = matches[0], def = GameInfo.Units.lookup(unit.type);
  if (unit.isOnMap !== true || unit.isDead === true || unit.isCommanderUnit || unit.isEmbarked !== false || unit.operationQueueSize !== 0 || unit.Combat?.isCombat !== true ||
      def?.Domain !== "DOMAIN_LAND" || def.FormationClass !== "FORMATION_CLASS_LAND_COMBAT" || unit.location?.x !== x || unit.location?.y !== y ||
      !Number.isFinite(unit.Movement?.movementMovesRemaining) || unit.Movement.movementMovesRemaining <= 0 || x >= GameplayMap.getGridWidth() || y >= GameplayMap.getGridHeight()) return reject("A mobile unqueued unembarked land combat unit already on the exact target tile is required");
  const same = (a, b) => a?.owner === b?.owner && a?.id === b?.id && a?.type === b?.type;
  function eligible() {
    if (GameplayMap.getRevealedState(playerId, x, y) !== RevealedStates.VISIBLE || GameplayMap.getOwner(x, y) !== targetPlayer) return false;
    const units = MapUnits.getUnits(x, y), cityId = MapCities.getCity(x, y);
    if (!Array.isArray(units) || units.length !== 1 || !same(units[0], unit.id) || cityId?.owner !== targetPlayer || !Number.isInteger(cityId.id) || cityId.id < 0) return false;
    const city = Cities.get(cityId), centre = city?.location;
    if (city?.owner !== targetPlayer || ![centre?.x, centre?.y].every(v => Number.isInteger(v) && v >= 0) ||
        centre.x >= GameplayMap.getGridWidth() || centre.y >= GameplayMap.getGridHeight() || (centre.x === x && centre.y === y) ||
        GameplayMap.getRevealedState(playerId, centre.x, centre.y) !== RevealedStates.VISIBLE) return false;
    for (const commander of owned.filter(u => u.isCommanderUnit)) {
      const army = typeof Armies !== "undefined" ? Armies.get(commander.armyId) : null, ids = army?.owner === playerId ? army.getUnitIds?.() : null;
      if (!Array.isArray(ids) || ids.some(id => same(id, unit.id))) return false;
    }
    return typeof player.Armies?.getUnitReinforcementCommanderId === "function" && player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) === -1;
  }
  function constructibles() {
    if (GameplayMap.getRevealedState(playerId, x, y) !== RevealedStates.VISIBLE) return null;
    const ids = MapConstructibles.getConstructibles(x, y);
    if (!Array.isArray(ids) || ids.length > 16) return null;
    const records = [];
    for (const id of ids) {
      if (id.owner !== targetPlayer || ![id.id, id.type].every(v => Number.isInteger(v) && v >= 0)) return null;
      const c = Constructibles.getByComponentID(id);
      if (!c || !same(c.id, id) || !Number.isInteger(c.type) || typeof c.complete !== "boolean" || typeof c.damaged !== "boolean" || c.location?.x !== x || c.location?.y !== y) return null;
      records.push({owner: id.owner, instanceId: id.id, componentType: id.type, type: c.type, complete: c.complete, damaged: c.damaged});
    }
    records.sort((a, b) => a.instanceId - b.instanceId || a.componentType - b.componentType);
    return new Set(records.map(r => `${r.componentType}:${r.instanceId}`)).size === records.length ? records : null;
  }
  if (!eligible()) return reject("Pillage requires a visible enemy non-centre tile occupied only by this unpacked nonreinforcing unit");
  const baseline = constructibles();
  if (!baseline || JSON.stringify(baseline) !== token || !baseline.some(c => c.complete && !c.damaged)) return reject("Constructible token is stale/unknown or no intact completed target remains");
  const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
    moves: unit.Movement.movementMovesRemaining, constructibles: baseline, gold: player.Treasury?.goldBalance ?? null};
  const operation = "UNITOPERATION_PILLAGE", args = {X: x, Y: y}, picker = Game.UnitOperations.canStart(unit.id, operation, {}, false);
  if (picker?.Success !== true || !Array.isArray(picker.Plots) || !picker.Plots.includes(GameplayMap.getIndexFromLocation({x, y}))) return reject("Exact occupied tile is not offered by native pillage", picker?.FailureReasons ?? []);
  const check = Game.UnitOperations.canStart(unit.id, operation, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native pillage failed or needs confirmation", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      player.Diplomacy.isAtWarWith(targetPlayer) !== true || unit.id.owner !== playerId || unit.id.type !== before.componentType || unit.type !== before.unitType ||
      unit.isOnMap !== true || unit.isDead === true || unit.isEmbarked !== false || unit.operationQueueSize !== 0 || unit.location.x !== x || unit.location.y !== y ||
      unit.Movement.movementMovesRemaining !== before.moves || !eligible() || JSON.stringify(constructibles()) !== token) return reject("Pillager, target, packing or game context changed during validation");
  Game.UnitOperations.sendRequest(unit.id, operation, args);
  return {status: "submitted", before, expected: {unitId, pillageObserved: true}, verificationArguments: {unit_id: unitId, unit_type: before.unitType,
    component_type: before.componentType, target_player: targetPlayer, x, y, before_moves: before.moves, baseline_constructibles: baseline},
    verificationScope: "Source movement spent and newly damaged/departed visible constructible on the exact tile; native target selection, no exact loot/healing amount, route destruction or capture claim"};
})()
