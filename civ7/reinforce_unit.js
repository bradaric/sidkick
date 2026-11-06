(() => {
  const {unit_id: unitId, commander_id: commanderId, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (![unitId, commanderId, expectedTurn].every(v => Number.isInteger(v) && v >= 0) || unitId === commanderId) return reject("Distinct owned unit/commander IDs and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId);
  const units = owned.filter(u => u.id.id === unitId), commanders = owned.filter(u => u.id.id === commanderId);
  if (units.length !== 1 || commanders.length !== 1 || commanders[0].isCommanderUnit !== true || units[0].isCommanderUnit ||
      GameInfo.Units.lookup(units[0].type)?.Packable !== true) return reject("A unique owned packable non-commander and commander are required");
  const unit = units[0], commander = commanders[0];
  const army = typeof Armies !== "undefined" && typeof Armies.get === "function" ? Armies.get(commander.armyId) : null;
  const identity = typeof army?.getCommanderId === "function" ? army.getCommanderId() : null;
  if (!army || army.owner !== playerId || !Number.isInteger(army.localId) || army.localId < 0 ||
      identity?.owner !== playerId || identity.id !== commanderId || identity.type !== commander.id.type ||
      typeof player.Armies?.getUnitReinforcementCommanderId !== "function") return reject("Owned target army or native assignment identity is unavailable");
  const assigned = player.Armies.getUnitReinforcementCommanderId(unit.id, playerId);
  const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type,
    commanderId, commanderType: commander.type, targetArmyId: army.localId, previousAssignment: assigned};
  if (assigned === army.localId) return {status: "already_active", before};
  if (assigned !== -1) return reject("Existing or unknown reinforcement assignment cannot be redirected");
  if (unit.isOnMap !== true || unit.isDead === true || unit.operationQueueSize !== 0 ||
      commander.isOnMap !== true || commander.operationQueueSize !== 0) return reject("Both units must be deployed and unqueued");
  for (const c of owned.filter(u => u.isCommanderUnit)) {
    const a = Armies.get(c.armyId);
    if (!a || a.owner !== playerId || typeof a.getUnitIds !== "function") return reject("Owned packed membership is unknown");
    const ids = a.getUnitIds();
    if (!Array.isArray(ids)) return reject("Owned packed membership is unknown");
    if (ids.some(id => id.owner === playerId && id.id === unitId && id.type === unit.id.type)) return reject("Unit is already packed");
  }
  const location = commander.location;
  if (!location || ![location.x, location.y].every(v => Number.isInteger(v) && v >= 0) ||
      location.x >= GameplayMap.getGridWidth() || location.y >= GameplayMap.getGridHeight() ||
      GameplayMap.getRevealedState(playerId, location.x, location.y) !== RevealedStates.VISIBLE ||
      GameplayMap.getOwner(location.x, location.y) !== playerId) return reject("Target commander must be on a currently visible owned plot");
  before.destination = {x: location.x, y: location.y};
  const operation = "UNITOPERATION_REINFORCE_ARMY";
  const picker = Game.UnitOperations.canStart(unit.id, operation, {}, false);
  if (!Array.isArray(picker?.Plots) || !picker.Plots.includes(GameplayMap.getIndexFromLocation(before.destination))) return reject("Commander plot is not a native offered reinforcement destination", picker?.FailureReasons ?? []);
  const args = {X: before.destination.x, Y: before.destination.y};
  const check = Game.UnitOperations.canStart(unit.id, operation, args, false);
  if (check?.Success !== true) return reject("Native reinforcement check failed", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false || unit.id.owner !== playerId || unit.type !== before.unitType || unit.isOnMap !== true ||
      unit.operationQueueSize !== 0 || commander.id.owner !== playerId || commander.type !== before.commanderType || commander.isOnMap !== true ||
      commander.operationQueueSize !== 0 || commander.location.x !== before.destination.x || commander.location.y !== before.destination.y ||
      player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) return reject("Unit, commander or game context changed during validation");
  const verificationArguments = {unit_id: unitId, commander_id: commanderId, component_type: unit.id.type,
    commander_component_type: commander.id.type, target_army_id: army.localId};
  Game.UnitOperations.sendRequest(unit.id, operation, args);
  return {status: "submitted", before, expected: {unitId, commanderId, targetArmyId: army.localId, reinforcing: true},
    verificationArguments, verificationScope: "Native reinforcement assignment only, not arrival or future path safety"};
})()
