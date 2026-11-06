(() => {
  const {unit_id: unitId, x, y, expected_turn: expectedTurn, mode = "step", target_player: targetPlayer} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (!["step", "rail", "advance"].includes(mode) || [unitId, x, y, expectedTurn].some(value => !Number.isInteger(value) || value < 0) ||
      (mode === "advance" && (!Number.isInteger(targetPlayer) || targetPlayer < 0))) return reject("Exact owned unit, supported move/tile/enemy and expected turn are required");
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
  const shore = fromWater !== toWater;
  if (!["DOMAIN_LAND", "DOMAIN_SEA"].includes(domain) ||
      typeof fromWater !== "boolean" || typeof toWater !== "boolean" ||
      (domain === "DOMAIN_SEA" && (!fromWater || !toWater)) ||
      (shore && (domain !== "DOMAIN_LAND" || unit.isEmbarked !== fromWater))) return reject("Land shore crossings need consistent native embarkation; sea units must stay on water");
  const sameId = (a, b) => a.owner === b.owner && a.id === b.id && a.type === b.type;
  for (const commander of units.filter(value => value.isCommanderUnit)) {
    const army = typeof Armies !== "undefined" ? Armies.get(commander.armyId) : null;
    const packed = army?.owner === playerId && typeof army.getUnitIds === "function" ? army.getUnitIds() : null;
    if (!Array.isArray(packed) || packed.some(id => sameId(id, unit.id))) return reject("Unit packing state is packed or unverified");
  }
  if (typeof player.Armies?.getUnitReinforcementCommanderId !== "function" ||
      player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) return reject("Unit reinforcement state is active or unverified");
  if (mode === "rail") {
    const visibleOwnedLand = l => valid(l) && GameplayMap.getRevealedState(playerId, l.x, l.y) === RevealedStates.VISIBLE &&
      GameplayMap.getOwner(l.x, l.y) === playerId && GameplayMap.isWater(l.x, l.y) === false;
    if (domain !== "DOMAIN_LAND" || unit.isEmbarked !== false || unit.isOnMap !== true || unit.isDead === true || unit.operationQueueSize !== 0 ||
        !visibleOwnedLand(unit.location) || !visibleOwnedLand(destination)) return reject("Rail requires an unqueued unembarked land unit and visible owned land endpoints");
    const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
      location: {x: unit.location.x, y: unit.location.y}, movesRemaining: unit.Movement.movementMovesRemaining};
    if (before.location.x === x && before.location.y === y) return {status: "already_active", before};
    const clear = () => visibleOwnedLand(destination) && Array.isArray(MapUnits.getUnits(x, y)) && MapUnits.getUnits(x, y).length === 0;
    if (!clear()) return reject("Rail requires an empty destination");
    const command = "UNITCOMMAND_MOVE_BY_RAIL", args = {X: x, Y: y};
    const picker = Game.UnitCommands.canStart(unit.id, command, {}, false);
    if (picker?.Success !== true || !Array.isArray(picker.Plots) || !picker.Plots.includes(GameplayMap.getIndexFromLocation(destination))) return reject("Exact destination is not offered by native rail; no ordinary-movement fallback", picker?.FailureReasons ?? []);
    const check = Game.UnitCommands.canStart(unit.id, command, args, false);
    if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native rail permission failed or needs confirmation", check?.FailureReasons ?? []);
    const packingClear = units.filter(u => u.isCommanderUnit).every(c => {
      const a = Armies.get(c.armyId), ids = a?.owner === playerId ? a.getUnitIds?.() : null;
      return Array.isArray(ids) && !ids.some(id => sameId(id, unit.id));
    });
    if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
        unit.id.owner !== playerId || unit.id.type !== before.componentType || unit.type !== before.unitType || unit.isOnMap !== true || unit.operationQueueSize !== 0 ||
        unit.location.x !== before.location.x || unit.location.y !== before.location.y || unit.Movement.movementMovesRemaining !== before.movesRemaining ||
        !visibleOwnedLand(unit.location) || !clear() || !packingClear || player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) return reject("Unit, rail endpoints or game context changed during validation");
    Game.UnitCommands.sendRequest(unit.id, command, args);
    return {status: "submitted", before, expected: {unitId, unitType: before.unitType, componentType: before.componentType, location: destination, queueSize: 0}, verificationArguments: {unit_id: unitId}};
  }
  if (GameplayMap.getPlotDistance(unit.location.x, unit.location.y, x, y) !== 1 ||
      GameplayMap.getRevealedState(playerId, unit.location.x, unit.location.y) !== RevealedStates.VISIBLE ||
      GameplayMap.getRevealedState(playerId, x, y) !== RevealedStates.VISIBLE) return reject("Only an adjacent currently visible step is supported");
  const owner = GameplayMap.getOwner(x, y);
  const enemyField = () => owner === targetPlayer && targetPlayer !== playerId && player.Diplomacy.hasMet(targetPlayer) === true && player.Diplomacy.isAtWarWith(targetPlayer) === true &&
    typeof MapCities !== "undefined" && typeof MapCities.getDistrict === "function" && MapCities.getDistrict(x, y) === null;
  if (mode === "advance") {
    if (!enemyField() || unit.isOnMap !== true || unit.isDead === true || unit.operationQueueSize !== 0 || unit.isEmbarked !== false || shore ||
        (domain === "DOMAIN_LAND" && fromWater !== false) || unit.Combat?.isCombat !== true ||
        !["FORMATION_CLASS_LAND_COMBAT", "FORMATION_CLASS_NAVAL"].includes(GameInfo.Units.lookup(unit.type)?.FormationClass)) return reject("Advance requires an unqueued land/sea combat unit and an empty-field target owned by an exact met wartime enemy; no district/city or shore crossing");
  } else if (owner !== -1 && owner !== playerId) return reject("Foreign territory is not supported");
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
    location: {x: unit.location.x, y: unit.location.y}, movesRemaining: unit.Movement.movementMovesRemaining,
    embarked: typeof unit.isEmbarked === "boolean" ? unit.isEmbarked : null};
  const check = Game.UnitOperations.canStart(unit.id, UnitOperationTypes.MOVE_TO, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native movement check failed or needs confirmation", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || unit.id.owner !== playerId ||
      unit.location.x !== before.location.x || unit.location.y !== before.location.y ||
      (shore && (unit.isEmbarked !== before.embarked || GameplayMap.isWater(x, y) !== toWater ||
        GameplayMap.isWater(before.location.x, before.location.y) !== fromWater)) ||
      unit.Movement.movementMovesRemaining !== before.movesRemaining || GameplayMap.getOwner(x, y) !== owner ||
      (mode === "advance" && (!enemyField() || unit.id.type !== before.componentType || unit.type !== before.unitType || unit.isOnMap !== true || unit.isDead === true || unit.operationQueueSize !== 0 || unit.isEmbarked !== false)) ||
      MapUnits.getUnits(x, y)?.length !== 0) return reject("Game context, unit or destination changed during validation");
  // Do not invoke WorldInput: its helper can attack, declare war or swap units.
  Game.UnitOperations.sendRequest(unit.id, UnitOperationTypes.MOVE_TO, args);
  return {status: "submitted", before, expected: {unitId, unitType: unit.type, componentType: unit.id.type, location: {x, y},
    ...(shore ? {embarked: toWater} : {}), ...(mode === "advance" ? {queueSize: 0, embarked: false} : {})},
    verificationArguments: {unit_id: unitId}};
})()
