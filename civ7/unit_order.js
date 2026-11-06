(() => {
  const {unit_id: unitId, order, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  const operations = {skip: "UNITOPERATION_SKIP_TURN", sleep: "UNITOPERATION_SLEEP", fortify: "UNITOPERATION_FORTIFY",
    heal: "UNITOPERATION_REST_UNTIL_HEALED", alert: "UNITOPERATION_ALERT"};
  const commands = {wake: "UNITCOMMAND_WAKE", cancel: "UNITCOMMAND_CANCEL"};
  if (!Object.hasOwn(operations, order) && !Object.hasOwn(commands, order)) return reject("Unsupported non-target unit order");
  if (!Number.isInteger(unitId) || unitId < 0 || !Number.isInteger(expectedTurn) || expectedTurn < 0) return reject("An exact owned unit and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const units = player.Units.getUnits().filter(u => u.id.owner === playerId && u.id.id === unitId);
  if (units.length !== 1 || units[0].isOnMap !== true) return reject("A unique owned on-map unit is required");
  const unit = units[0], activity = unit.activityType, operation = unit.getOperationType(0), queue = unit.operationQueueSize;
  if (!Number.isInteger(activity) || !Number.isInteger(operation) || !Number.isInteger(queue) || queue < 0) return reject("Unit order state is unverified");
  const active = order === "sleep" ? activity === UnitActivityTypes.SLEEP : order === "heal" ?
    activity === UnitActivityTypes.HEAL || ((activity === UnitActivityTypes.OPERATION || (activity === UnitActivityTypes.HOLD && queue > 0)) && operation === UnitOperationTypes.REST_UNTIL_HEALED) :
    order === "alert" ? activity === UnitActivityTypes.SENTRY || (activity === UnitActivityTypes.OPERATION && operation === UnitOperationTypes.ALERT) :
    order === "wake" || order === "cancel" ? [UnitActivityTypes.AWAKE, UnitActivityTypes.NONE].includes(activity) && queue === 0 :
    order === "skip" && activity === UnitActivityTypes.HOLD && queue === 0 ? true :
    activity === UnitActivityTypes.OPERATION && operation === UnitOperationTypes[order === "skip" ? "SKIP_TURN" : "FORTIFY"];
  const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
    activity, operation, queueSize: queue};
  if (active) return {status: "already_active", before};
  if (queue > 0 && order !== "cancel" && order !== "wake") return reject("Cancel the existing queued order explicitly first");
  const api = Object.hasOwn(commands, order) ? Game.UnitCommands : Game.UnitOperations;
  const type = commands[order] ?? operations[order];
  const args = {X: -9999, Y: -9999, UnitAbilityType: -1};
  const check = api.canStart(unit.id, type, args, false);
  if (check?.Success !== true) return reject("Native unit order check failed", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || unit.id.owner !== playerId ||
      unit.activityType !== activity || unit.getOperationType(0) !== operation || unit.operationQueueSize !== queue) return reject("Unit or game context changed during validation");
  api.sendRequest(unit.id, type, args);
  return {status: "submitted", before, expected: {unitId, unitType: unit.type, componentType: unit.id.type, order, orderActive: true},
    verificationArguments: {unit_id: unitId, order}};
})()
