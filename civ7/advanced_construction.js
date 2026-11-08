(() => {
  const {settlement, item, construction_intent: intent, target_token: token, x, y, expected_turn: expectedTurn, replace_improvement: replaceImprovement = false} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (typeof settlement !== "string" || !settlement.trim() || typeof item !== "string" || !item || !["wonder", "repair", "overbuild", "improvement"].includes(intent) ||
      typeof replaceImprovement !== "boolean" || (replaceImprovement && !["wonder", "improvement"].includes(intent)) ||
      typeof token !== "string" || !token || token.length > 100000 || ![x, y, expectedTurn].every(v => Number.isInteger(v) && v >= 0)) return reject("Exact city, constructible/intent, tile token and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn) return reject("A fresh active local turn is required");
  const matches = player.Cities.getCities().filter(c => c.id.owner === playerId && Locale.compose(c.name).toLowerCase() === settlement.toLowerCase());
  if (matches.length !== 1 || matches[0].isTown !== false) return reject("One unique owned city, not a town, is required");
  const city = matches[0], def = GameInfo.Constructibles.lookup(item), klass = intent === "wonder" ? "WONDER" : intent === "improvement" ? "IMPROVEMENT" : "BUILDING";
  if (def?.ConstructibleType !== item || !Number.isInteger(def.$hash) || (intent === "repair" ? !["BUILDING", "IMPROVEMENT", "WONDER"].includes(def.ConstructibleClass) || def.Repairable !== true : def.ConstructibleClass !== klass)) return reject("Exact constructible class/intent is not supported");
  const plot = GameplayMap.getIndexFromLocation({x, y}), l = Number.isInteger(plot) && plot >= 0 ? GameplayMap.getLocationFromIndex(plot) : null;
  function tileOwnership() {
    if (l?.x !== x || l?.y !== y || GameplayMap.getRevealedState(playerId, x, y) !== RevealedStates.VISIBLE) return null;
    const owner = GameplayMap.getOwner(x, y), assigned = MapCities.getCity(x, y);
    if (owner === playerId && assigned?.owner === playerId && assigned.id === city.id.id && assigned.type === city.id.type) {
      return {owner, city: {owner: assigned.owner, id: assigned.id, type: assigned.type}, requiresExpansion: false};
    }
    const noPlayer = typeof PlayerIds !== "undefined" ? PlayerIds.NO_PLAYER : null;
    if (!["wonder", "improvement"].includes(intent) || !Number.isInteger(noPlayer) || noPlayer >= 0 ||
        ![playerId, noPlayer].includes(owner) || !(assigned === null ||
          assigned?.owner === noPlayer && assigned.id === -1 && assigned.type === 0)) return null;
    return {owner, city: assigned === null ? null : {owner: assigned.owner, id: assigned.id, type: assigned.type}, requiresExpansion: true};
  }
  const ownership = tileOwnership();
  if (!ownership) return reject("Placement tile must be visible and assigned to this city, or an unassigned non-foreign expansion site");
  function tileState() {
    if (JSON.stringify(tileOwnership()) !== JSON.stringify(ownership)) return null;
    const ids = MapConstructibles.getConstructibles(x, y);
    if (!Array.isArray(ids) || ids.length > 16 || ownership.requiresExpansion && ids.length !== 0) return null;
    const records = [];
    for (const id of ids) {
      const c = id.owner === playerId ? Constructibles.getByComponentID(id) : null;
      if (!c || c.id?.owner !== playerId || c.id.id !== id.id || c.id.type !== id.type || !Number.isInteger(c.type) || typeof c.complete !== "boolean" || typeof c.damaged !== "boolean" || c.location?.x !== x || c.location?.y !== y) return null;
      records.push({owner: id.owner, instanceId: id.id, componentType: id.type, type: c.type, complete: c.complete, damaged: c.damaged});
    }
    records.sort((a, b) => a.instanceId - b.instanceId || a.componentType - b.componentType);
    return new Set(records.map(r => `${r.componentType}:${r.instanceId}`)).size === records.length ? records : null;
  }
  const tile = tileState(), queue = city.BuildQueue.getQueue();
  if (tile === null) return reject("Target tile constructible state is unavailable or invalid");
  if (JSON.stringify(tile) !== token) return reject("Tile token is stale; refresh building placements");
  if (!Array.isArray(queue)) return reject("Production queue is unavailable");
  if (queue.length >= 64) return reject("Production queue is full");
  if (intent === "repair") {
    if (tile.filter(c => c.type === def.$hash && c.complete && c.damaged).length !== 1) return reject("Repair requires one exact completed damaged instance of the selected type on this tile");
  } else {
    const previews = city.Yields.calculateAllBuildingsPlacements()?.buildings?.filter(b => b.constructibleType === def.$hash)
      .flatMap(b => b.placements ?? []).filter(p => p.plotID === plot) ?? [];
    if (previews.length !== 1) return reject("One exact native placement preview is required");
    const previous = previews[0].overbuiltConstructibleID;
    if (intent === "overbuild" || replaceImprovement) {
      const old = Number.isInteger(previous) && previous >= 0 ? GameInfo.Constructibles.lookup(previous) : null;
      if (old?.ConstructibleClass !== (replaceImprovement ? "IMPROVEMENT" : "BUILDING") || tile.filter(c => c.type === old.$hash && c.complete && !c.damaged).length !== 1) return reject("Replacement requires one exact known intact old constructible matching the native preview and acknowledged class");
    } else if (previous !== -1) return reject("This intent must not overbuild another constructible");
  }
  if (!Number.isInteger(CityOperationsParametersValues.Append)) return reject("Native Append mode is unavailable");
  const args = {ConstructibleType: def.$hash, X: x, Y: y, InsertMode: CityOperationsParametersValues.Append};
  const blocked = c => c?.Success !== true || c.RequiresConfirmation === true || c.InQueue || c.InProgress || c.MoveToNewLocation || c.InsufficientFunds ||
    (intent !== "repair" && (c.RepairDamaged || c.AlreadyExists));
  const before = {turn: Game.turn, age: Game.age, playerId, cityId: city.id.id, componentType: city.id.type, queue: JSON.parse(JSON.stringify(queue)), tile, ownership};
  const general = Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, {ConstructibleType: def.$hash, InsertMode: args.InsertMode}, false);
  if (blocked(general) || ![...(general.Plots ?? []), ...(general.ExpandUrbanPlots ?? [])].includes(plot) ||
      (ownership.requiresExpansion && !(general.ExpandUrbanPlots ?? []).includes(plot)) ||
      (intent === "repair" && general.RepairDamaged !== true)) return reject("Exact native construction/repair plot or intent is not offered", general?.FailureReasons ?? []);
  const check = Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false);
  if (blocked(check)) return reject("Selected native advanced construction failed or requires confirmation", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      city.id.owner !== playerId || city.id.type !== before.componentType || city.isTown !== false || JSON.stringify(city.BuildQueue.getQueue()) !== JSON.stringify(before.queue) || JSON.stringify(tileState()) !== token) return reject("City, tile, queue or context changed during validation");
  const verificationArguments = {mode: "append", city_id: before.cityId, item, x, y, baseline_queue: before.queue, baseline_asset_ids: [], construction_intent: intent};
  Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, args);
  return {status: "submitted", before, expected: {cityId: before.cityId, item, queueAppendObserved: true}, verificationArguments,
    verificationScope: "Exact queued advanced construction with preserved queue prefix and placement only; completion, repaired HP, replacement destruction/yields or Wonder ownership require later readback, not claimed now"};
})()
