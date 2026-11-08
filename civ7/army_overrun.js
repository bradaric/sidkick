(() => {
  const {commander_id: commanderId, target_player: targetPlayer, target_unit_id: targetId, x, y, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (![commanderId, targetPlayer, targetId, x, y, expectedTurn].every(v => Number.isInteger(v) && v >= 0)) return reject("Exact commander, enemy identity/tile and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || targetPlayer === playerId || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn || player.Diplomacy.hasMet(targetPlayer) !== true ||
      player.Diplomacy.isAtWarWith(targetPlayer) !== true) return reject("A fresh active local turn and existing met enemy war are required");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), commanders = owned.filter(u => u.id.id === commanderId);
  if (commanders.length !== 1) return reject("No unique owned commander");
  const commander = commanders[0], valid = l => l && [l.x, l.y].every(v => Number.isInteger(v) && v >= 0) &&
    l.x < GameplayMap.getGridWidth() && l.y < GameplayMap.getGridHeight();
  if (commander.isCommanderUnit !== true || commander.isOnMap !== true || commander.isDead === true || commander.isEmbarked !== false || commander.operationQueueSize !== 0 ||
      GameInfo.Units.lookup(commander.type)?.Domain !== "DOMAIN_LAND" || !valid(commander.location) || !valid({x, y}) ||
      !Number.isFinite(commander.Movement?.movementMovesRemaining) || commander.Movement.movementMovesRemaining <= 0 ||
      GameplayMap.getRevealedState(playerId, commander.location.x, commander.location.y) !== RevealedStates.VISIBLE ||
      GameplayMap.isWater(commander.location.x, commander.location.y) !== false || GameplayMap.getPlotDistance(commander.location.x, commander.location.y, x, y) !== 1) return reject("A mobile deployed unqueued land commander adjacent to the target is required");
  const army = typeof Armies !== "undefined" ? Armies.get(commander.armyId) : null;
  const identity = army?.getCommanderId?.();
  if (army?.owner !== playerId || identity?.owner !== playerId || identity.id !== commanderId || identity.type !== commander.id.type) return reject("Owned commander army identity is unverified");
  function membership() {
    const ids = army.getUnitIds?.();
    if (!Array.isArray(ids) || !ids.length || ids.some(id => id.owner !== playerId || id.id === commanderId ||
        owned.filter(u => u.id.id === id.id && u.id.type === id.type).length !== 1)) return null;
    const members = ids.map(id => id.id).sort((a, b) => a - b);
    if (new Set(members).size !== members.length || !members.some(id => {
      const u = owned.find(u => u.id.id === id);
      return u.isCommanderUnit !== true && u.isDead !== true && GameInfo.Units.lookup(u.type)?.FormationClass === "FORMATION_CLASS_LAND_COMBAT" &&
        GameInfo.Units.lookup(u.type)?.Domain === "DOMAIN_LAND" && u.Combat?.isCombat === true;
    })) return null;
    return members;
  }
  const members = membership(), baselineOwned = owned.map(u => u.id.id);
  if (!members || new Set(baselineOwned).size !== baselineOwned.length || baselineOwned.some(id => !Number.isInteger(id) || id < 0)) return reject("Verified packed land combat members and unique owned inventory are required");
  const same = (a, b) => a?.owner === b?.owner && a?.id === b?.id && a?.type === b?.type;
  function target() {
    if (GameplayMap.getRevealedState(playerId, x, y) !== RevealedStates.VISIBLE || ![-1, playerId].includes(GameplayMap.getOwner(x, y)) || GameplayMap.isWater(x, y) !== false) return null;
    const district = Game.Combat.getDefensibleDistrict({x, y}), ids = MapUnits.getUnits(x, y);
    if (!district || district.owner !== -1 || district.id !== -1 || !Array.isArray(ids) || ids.length !== 1) return null;
    const id = Game.Combat.getBestDefender({x, y}, commander.id);
    if (!same(id, ids[0]) || id?.owner !== targetPlayer || id.id !== targetId || !Number.isInteger(id.type) || id.type < 0 || Visibility.isVisible(playerId, id) !== true) return null;
    const u = Units.get(id), def = u ? GameInfo.Units.lookup(u.type) : null;
    if (!u || !same(u.id, id) || u.isOnMap !== true || u.isDead === true || u.isCommanderUnit || u.Combat?.isCombat !== true ||
        def?.Domain !== "DOMAIN_LAND" || def.FormationClass !== "FORMATION_CLASS_LAND_COMBAT" || u.location?.x !== x || u.location?.y !== y ||
        !Number.isFinite(u.Health?.damage) || !Number.isFinite(u.Health.maxDamage) || u.Health.damage < 0 || u.Health.damage >= u.Health.maxDamage) return null;
    return u;
  }
  const enemy = target();
  if (!enemy) return reject("One exact visible hostile land combat target on an own/unowned land field is required; no stack, district or civilian target");
  const before = {turn: Game.turn, age: Game.age, playerId, commanderId, commanderType: commander.type, componentType: commander.id.type,
    location: {...commander.location}, movesRemaining: commander.Movement.movementMovesRemaining, packedUnitIds: members,
    targetType: enemy.type, targetComponentType: enemy.id.type, targetDamage: enemy.Health.damage};
  const command = "UNITCOMMAND_ARMY_OVERRUN", args = {X: x, Y: y};
  const picker = Game.UnitCommands.canStart(commander.id, command, {}, false);
  if (picker?.Success !== true || !Array.isArray(picker.Plots) || !picker.Plots.includes(GameplayMap.getIndexFromLocation({x, y}))) return reject("Native Overrun picker does not offer this target; no strength/odds threshold is guessed", picker?.FailureReasons ?? []);
  const check = Game.UnitCommands.canStart(commander.id, command, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Exact native Overrun permission failed or needs confirmation", check?.FailureReasons ?? []);
  const fresh = target();
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      player.Diplomacy.isAtWarWith(targetPlayer) !== true || commander.id.owner !== playerId || commander.id.type !== before.componentType || commander.type !== before.commanderType ||
      commander.isOnMap !== true || commander.operationQueueSize !== 0 || commander.location.x !== before.location.x || commander.location.y !== before.location.y ||
      commander.Movement.movementMovesRemaining !== before.movesRemaining || JSON.stringify(membership()) !== JSON.stringify(members) ||
      !fresh || fresh.type !== before.targetType || fresh.id.type !== before.targetComponentType || fresh.Health.damage !== before.targetDamage) return reject("Commander, packed members, target or game context changed during validation");
  const verificationArguments = {mode: "overrun", commander_id: commanderId, component_type: before.componentType, baseline_packed_unit_ids: members,
    baseline_unit_ids: baselineOwned, target_player: targetPlayer, target_unit_id: targetId, target_component_type: before.targetComponentType,
    x, y, before_moves: before.movesRemaining};
  Game.UnitCommands.sendRequest(commander.id, command, args);
  return {status: "submitted", before, expected: {commanderId, commanderType: before.commanderType, componentType: before.componentType,
    packedUnitIds: members, location: {x, y}, overrunObserved: true}, verificationArguments,
    verificationScope: "Native Overrun only; proves target departure from a still-visible tile, commander arrival/movement spend and preserved packed members, not an independent kill count or hidden target state"};
})()
