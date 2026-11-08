(() => {
  const {commander_id: commanderId, unit_id: unitId, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (![commanderId, unitId, expectedTurn].every(v => Number.isInteger(v) && v >= 0) || commanderId === unitId) return reject("Distinct owned commander/recipient IDs and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn) return reject("A fresh active local turn is required");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), commanders = owned.filter(u => u.id.id === commanderId), recipients = owned.filter(u => u.id.id === unitId);
  if (commanders.length !== 1 || recipients.length !== 1) return reject("Unique owned commander and recipient identities are required");
  const commander = commanders[0], unit = recipients[0];
  const valid = l => l && [l.x, l.y].every(v => Number.isInteger(v) && v >= 0) && l.x < GameplayMap.getGridWidth() && l.y < GameplayMap.getGridHeight();
  function capture() {
    if (commander.isCommanderUnit !== true || commander.isOnMap !== true || commander.isDead === true || commander.operationQueueSize !== 0 ||
        unit.isCommanderUnit || unit.isOnMap !== true || unit.isDead === true || unit.operationQueueSize !== 0 ||
        GameInfo.Units.lookup(commander.type)?.Domain !== "DOMAIN_LAND" || GameInfo.Units.lookup(unit.type)?.Domain !== "DOMAIN_LAND" ||
        GameInfo.Units.lookup(unit.type)?.FormationClass !== "FORMATION_CLASS_LAND_COMBAT" || unit.Combat?.isCombat !== true ||
        !valid(commander.location) || !valid(unit.location) ||
        GameplayMap.getRevealedState(playerId, commander.location.x, commander.location.y) !== RevealedStates.VISIBLE ||
        GameplayMap.getRevealedState(playerId, unit.location.x, unit.location.y) !== RevealedStates.VISIBLE ||
        ![-1, playerId].includes(GameplayMap.getOwner(unit.location.x, unit.location.y)) ||
        typeof player.Armies?.getUnitReinforcementCommanderId !== "function" || player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) return null;
    const ids = MapUnits.getUnits(unit.location.x, unit.location.y), army = Armies.get(commander.armyId), identity = army?.getCommanderId?.(), members = army?.getUnitIds?.();
    if (!Array.isArray(ids) || ids.length !== 1 || ids[0].owner !== playerId || ids[0].id !== unitId || ids[0].type !== unit.id.type ||
        army?.owner !== playerId || identity?.owner !== playerId || identity.id !== commanderId || identity.type !== commander.id.type || !Array.isArray(members) ||
        members.some(id => id.owner !== playerId || id.id === unitId || id.id === commanderId || owned.filter(u => u.id.id === id.id && u.id.type === id.type).length !== 1) ||
        new Set(members.map(id => id.id)).size !== members.length ||
        ![unit.Movement?.movementMovesRemaining, unit.Combat.attacksRemaining, unit.Health?.damage, unit.Health?.maxDamage].every(v => Number.isFinite(v) && v >= 0) ||
        !Number.isInteger(unit.Combat.attacksRemaining) || unit.Health.damage >= unit.Health.maxDamage) return null;
    return {turn: Game.turn, age: Game.age, playerId, commanderId, commanderType: commander.type, commanderComponentType: commander.id.type,
      unitId, unitType: unit.type, componentType: unit.id.type, commanderLocation: {x: commander.location.x, y: commander.location.y},
      location: {x: unit.location.x, y: unit.location.y}, movesRemaining: unit.Movement.movementMovesRemaining, attacksRemaining: unit.Combat.attacksRemaining,
      damage: unit.Health.damage, maxDamage: unit.Health.maxDamage, packedUnitIds: members.map(id => id.id).sort((a, b) => a - b)};
  }
  const before = capture();
  if (!before) return reject("A deployed land commander and unambiguous visible unqueued nonreinforcing land combat recipient with known army membership are required");
  const command = "UNITCOMMAND_GRANT_SECOND_WIND", args = {X: before.location.x, Y: before.location.y};
  const picker = Game.UnitCommands.canStart(commander.id, command, {}, false);
  if (picker?.Success !== true || !Array.isArray(picker.Plots) || !picker.Plots.includes(GameplayMap.getIndexFromLocation(before.location))) return reject("Native Second Wind picker does not offer this recipient", picker?.FailureReasons ?? []);
  const check = Game.UnitCommands.canStart(commander.id, command, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Exact native Second Wind permission failed or needs confirmation", check?.FailureReasons ?? []);
  if (GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      commander.id.owner !== playerId || unit.id.owner !== playerId || JSON.stringify(capture()) !== JSON.stringify(before)) return reject("Recipient, commander, membership or game context changed during validation");
  const verificationArguments = {commander_id: commanderId, unit_id: unitId, commander_type: before.commanderType, commander_component_type: before.commanderComponentType,
    unit_type: before.unitType, component_type: before.componentType, commander_location: before.commanderLocation, location: before.location,
    packed_unit_ids: before.packedUnitIds, before_moves: before.movesRemaining, before_attacks: before.attacksRemaining, before_damage: before.damage};
  Game.UnitCommands.sendRequest(commander.id, command, args);
  return {status: "submitted", before, expected: {commanderId, unitId, secondWindObserved: true}, verificationArguments};
})()
