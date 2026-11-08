(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player) throw Error("No local player");
  const {unit_id: unitId, order} = queryArguments;
  if (!Number.isInteger(unitId) || unitId < 0 || !["skip", "sleep", "wake", "fortify", "heal", "alert", "cancel", "auto_explore"].includes(order)) throw Error("Invalid unit order identity");
  const units = player.Units.getUnits().filter(u => u.id.owner === playerId && u.id.id === unitId);
  if (units.length !== 1) throw Error("No unique owned unit matches the submitted ID");
  const unit = units[0], activity = unit.activityType, operation = unit.getOperationType(0), queue = unit.operationQueueSize;
  const orderActive = order === "auto_explore" ? Number.isInteger(UnitOperationTypes.AUTOMATE_EXPLORE) &&
    operation === UnitOperationTypes.AUTOMATE_EXPLORE && (activity === UnitActivityTypes.OPERATION || queue > 0) :
    order === "sleep" ? activity === UnitActivityTypes.SLEEP : order === "heal" ?
    activity === UnitActivityTypes.HEAL || ((activity === UnitActivityTypes.OPERATION || (activity === UnitActivityTypes.HOLD && queue > 0)) && operation === UnitOperationTypes.REST_UNTIL_HEALED) :
    order === "alert" ? activity === UnitActivityTypes.SENTRY || (activity === UnitActivityTypes.OPERATION && operation === UnitOperationTypes.ALERT) :
    order === "wake" || order === "cancel" ? [UnitActivityTypes.AWAKE, UnitActivityTypes.NONE].includes(activity) && queue === 0 :
    order === "skip" && activity === UnitActivityTypes.HOLD && queue === 0 ? true :
    activity === UnitActivityTypes.OPERATION && operation === UnitOperationTypes[order === "skip" ? "SKIP_TURN" : "FORTIFY"];
  return {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
    order, orderActive, activity, operation, queueSize: queue, movesRemaining: unit.Movement?.movementMovesRemaining ?? null,
    healingQueued: order === "heal" && queue > 0 && operation === UnitOperationTypes.REST_UNTIL_HEALED};
})()
