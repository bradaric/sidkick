(() => {
  const {unit_id: unitId, x, y, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if ([unitId, x, y, expectedTurn].some(value => !Number.isInteger(value) || value < 0)) return reject("Exact owned unit, adjacent tile and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const units = player.Units.getUnits().filter(value => value.id.owner === playerId);
  const matches = units.filter(value => value.id.id === unitId);
  if (matches.length !== 1) return reject("No unique owned unit matches this instance ID");
  const unit = matches[0];
  const valid = location => location && Number.isInteger(location.x) && Number.isInteger(location.y) &&
    location.x >= 0 && location.y >= 0 && location.x < GameplayMap.getGridWidth() && location.y < GameplayMap.getGridHeight();
  const destination = {x, y};
  if (!valid(unit.location) || !valid(destination) || unit.isOnMap === false || unit.isCommanderUnit ||
      !Number.isFinite(unit.Movement?.movementMovesRemaining) || unit.Movement.movementMovesRemaining <= 0) return reject("A mobile on-map noncommander unit is required");
  const domain = GameInfo.Units.lookup(unit.type)?.Domain;
  const fromWater = GameplayMap.isWater(unit.location.x, unit.location.y);
  const toWater = GameplayMap.isWater(x, y);
  // Land-domain units can already be embarked. Keep the current terrain state
  // rather than mistaking water-to-water travel for an embarkation transition.
  if (!["DOMAIN_LAND", "DOMAIN_SEA"].includes(domain) ||
      typeof fromWater !== "boolean" || typeof toWater !== "boolean" || fromWater !== toWater ||
      (domain === "DOMAIN_SEA" && !toWater)) return reject("Only land/sea steps without embarking or disembarking are supported");
  const sameId = (a, b) => a.owner === b.owner && a.id === b.id && a.type === b.type;
  for (const commander of units.filter(value => value.isCommanderUnit)) {
    const army = typeof Armies !== "undefined" ? Armies.get(commander.armyId) : null;
    const packed = army?.owner === playerId && typeof army.getUnitIds === "function" ? army.getUnitIds() : null;
    if (!Array.isArray(packed) || packed.some(id => sameId(id, unit.id))) return reject("Unit packing state is packed or unverified");
  }
  if (typeof player.Armies?.getUnitReinforcementCommanderId !== "function" ||
      player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) return reject("Unit reinforcement state is active or unverified");
  if (GameplayMap.getPlotDistance(unit.location.x, unit.location.y, x, y) !== 1 ||
      GameplayMap.getRevealedState(playerId, unit.location.x, unit.location.y) !== RevealedStates.VISIBLE ||
      GameplayMap.getRevealedState(playerId, x, y) !== RevealedStates.VISIBLE) return reject("Only an adjacent currently visible step is supported");
  const owner = GameplayMap.getOwner(x, y);
  if (owner !== -1 && owner !== playerId) return reject("Foreign territory is not supported");
  const occupants = MapUnits.getUnits(x, y);
  if (!Array.isArray(occupants) || occupants.length) return reject("An empty destination is required; no captures or swaps");
  const plot = GameplayMap.getIndexFromLocation(destination);
  const reachable = Units.getReachableMovement(unit.id), attacks = Units.getReachableTargets(unit.id);
  if (!Array.isArray(reachable) || !reachable.includes(plot) || !Array.isArray(attacks) || attacks.includes(plot)) return reject("Destination is not verified reachable noncombat movement");
  const path = Units.getPathTo(unit.id, destination);
  if (!Array.isArray(path?.plots) || path.plots.length !== 2) return reject("A direct one-edge path is required");
  const from = GameplayMap.getLocationFromIndex(path.plots[0]), to = GameplayMap.getLocationFromIndex(path.plots[1]);
  if (from.x !== unit.location.x || from.y !== unit.location.y || to.x !== x || to.y !== y) return reject("The native path does not match this direct step");
  if (!Number.isInteger(UnitOperationMoveModifiers.NONE)) return reject("Native nonattack movement modifier is unavailable");
  const args = {X: x, Y: y, Modifiers: UnitOperationMoveModifiers.NONE};
  if (Game.Combat.testAttackInto(unit.id, args) !== CombatTypes.NO_COMBAT) return reject("Native combat check did not confirm noncombat movement");
  const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
    location: {x: unit.location.x, y: unit.location.y}, movesRemaining: unit.Movement.movementMovesRemaining};
  const check = Game.UnitOperations.canStart(unit.id, UnitOperationTypes.MOVE_TO, args, false);
  if (check?.Success !== true) return reject("Native movement check failed", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || unit.id.owner !== playerId ||
      unit.location.x !== before.location.x || unit.location.y !== before.location.y ||
      unit.Movement.movementMovesRemaining !== before.movesRemaining || GameplayMap.getOwner(x, y) !== owner ||
      MapUnits.getUnits(x, y)?.length !== 0) return reject("Game context, unit or destination changed during validation");
  // Do not invoke WorldInput: its helper can attack, declare war or swap units.
  Game.UnitOperations.sendRequest(unit.id, UnitOperationTypes.MOVE_TO, args);
  return {status: "submitted", before, expected: {unitId, unitType: unit.type, componentType: unit.id.type, location: {x, y}},
    verificationArguments: {unit_id: unitId}};
})()
