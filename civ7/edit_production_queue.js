(() => {
  const {settlement, queue_token: token, action, index, other_index: other, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (typeof settlement !== "string" || !settlement.trim() || typeof token !== "string" || !token || token.length > 100000 ||
      !["cancel", "swap"].includes(action) || ![index, expectedTurn].every(v => Number.isInteger(v) && v >= 0) ||
      (action === "cancel" ? other != null : !Number.isInteger(other) || other < 0 || Math.abs(index - other) !== 1)) return reject("Exact settlement/queue token, supported edit indices and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn) return reject("A fresh active local turn is required");
  const matches = player.Cities.getCities().filter(c => c.id.owner === playerId && Locale.compose(c.name).toLowerCase() === settlement.toLowerCase());
  if (matches.length !== 1 || matches[0].isTown !== false) return reject("One unique owned city, not a town, is required");
  const city = matches[0], raw = city.BuildQueue.getQueue();
  if (!Array.isArray(raw) || raw.length > 64 || index >= raw.length || (action === "swap" && other >= raw.length) || JSON.stringify(raw) !== token) return reject("Queue token is stale, queue is unsupported or index is out of range");
  const queue = JSON.parse(JSON.stringify(raw)), before = {turn: Game.turn, age: Game.age, playerId, cityId: city.id.id, componentType: city.id.type, queue};
  const insertion = action === "cancel" ? CityOperationsParametersValues.RemoveAt : CityOperationsParametersValues.Swap;
  if (!Number.isInteger(insertion)) return reject("Native queue edit mode is unavailable");
  const args = action === "cancel" ? {InsertMode: insertion, QueueLocation: index} : {InsertMode: insertion, QueueSourceLocation: index, QueueDestinationLocation: other};
  const check = Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native queue edit failed or needs confirmation", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      city.id.owner !== playerId || city.id.type !== before.componentType || city.isTown !== false || JSON.stringify(city.BuildQueue.getQueue()) !== token) return reject("Owned city, full queue or game context changed during validation");
  const expectedQueue = [...queue];
  if (action === "cancel") expectedQueue.splice(index, 1);
  else [expectedQueue[index], expectedQueue[other]] = [expectedQueue[other], expectedQueue[index]];
  Game.CityOperations.sendRequest(city.id, CityOperationTypes.BUILD, args);
  return {status: "submitted", before, expected: {cityId: before.cityId, queue: expectedQueue},
    verificationArguments: {city_id: before.cityId, component_type: before.componentType},
    verificationScope: "Complete ordered queue transformation only; cancellation may release placement reservations or affect current production, with no refund/progress-retention promise"};
})()
