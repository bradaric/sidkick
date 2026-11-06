(() => {
  const {mode, commander_id: commanderId, x, y, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (!["pack", "unpack"].includes(mode) || ![commanderId, expectedTurn].every(v => Number.isInteger(v) && v >= 0) ||
      (mode === "unpack" && ![x, y].every(v => Number.isInteger(v) && v >= 0))) return reject("An owned commander, supported action, native deployment plot and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), units = owned.filter(u => u.id.id === commanderId);
  if (units.length !== 1 || units[0].isCommanderUnit !== true || units[0].isOnMap !== true || units[0].operationQueueSize !== 0) return reject("A unique owned deployed unqueued commander is required");
  const commander = units[0], army = typeof Armies !== "undefined" && typeof Armies.get === "function" ? Armies.get(commander.armyId) : null;
  if (!army || army.owner !== playerId || typeof army.getCommanderId !== "function") return reject("Owned commander army identity is unavailable");
  const armyCommander = army.getCommanderId();
  if (armyCommander?.owner !== playerId || armyCommander.id !== commanderId || armyCommander.type !== commander.id.type) return reject("Army does not belong to this commander");
  const baselineIds = owned.map(u => u.id.id);
  if (baselineIds.some(id => !Number.isInteger(id) || id < 0) || new Set(baselineIds).size !== baselineIds.length) return reject("Owned unit inventory is ambiguous");
  function membership() {
    const ids = army.getUnitIds();
    if (!Array.isArray(ids) || ids.some(id => id.owner !== playerId || id.id === commanderId ||
      !owned.some(u => u.id.id === id.id && u.id.type === id.type))) return null;
    const members = ids.map(id => id.id).sort((a, b) => a - b);
    return new Set(members).size === members.length ? members : null;
  }
  const members = membership();
  if (members === null) return reject("Packed membership is unverified");
  const before = {turn: Game.turn, age: Game.age, playerId, commanderId, commanderType: commander.type,
    componentType: commander.id.type, packedUnitIds: members};
  const operation = mode === "pack" ? "UNITCOMMAND_PACK_ARMY" : "UNITCOMMAND_UNPACK_ARMY";
  let args = {X: -9999, Y: -9999, UnitAbilityType: -1};
  if (mode === "unpack") {
    if (!members.length) return reject("Commander has no verified packed units");
    if (x >= GameplayMap.getGridWidth() || y >= GameplayMap.getGridHeight() ||
        GameplayMap.getRevealedState(playerId, x, y) !== RevealedStates.VISIBLE || GameplayMap.getOwner(x, y) !== playerId) return reject("Unpacking requires a currently visible owned plot");
    const picker = Game.UnitCommands.canStart(commander.id, operation, {}, false);
    const index = GameplayMap.getIndexFromLocation({x, y});
    if (!Array.isArray(picker?.Plots) || !picker.Plots.includes(index)) return reject("Plot is not offered by the native unpack picker");
    args = {X: x, Y: y};
  }
  const check = Game.UnitCommands.canStart(commander.id, operation, args, false);
  if (check?.Success !== true) return reject("Native commander action check failed", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false || commander.id.owner !== playerId || commander.type !== before.commanderType ||
      commander.isOnMap !== true || commander.operationQueueSize !== 0 || JSON.stringify(membership()) !== JSON.stringify(members)) return reject("Commander membership or game context changed during validation");
  const field = mode === "pack" ? "packObserved" : "unpackObserved";
  const verificationArguments = {mode, commander_id: commanderId, component_type: commander.id.type,
    baseline_packed_unit_ids: members, baseline_unit_ids: baselineIds};
  Game.UnitCommands.sendRequest(commander.id, operation, args);
  return {status: "submitted", before,
    expected: {commanderId, commanderType: before.commanderType, componentType: before.componentType, [field]: true}, verificationArguments};
})()
