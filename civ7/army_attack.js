(() => {
  const {commander_id: commanderId, target_player: targetPlayer, target_unit_id: targetId, x, y, expected_turn: expectedTurn, attack_kind: kind} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (![commanderId, targetPlayer, targetId, x, y, expectedTurn].every(v => Number.isInteger(v) && v >= 0) || !["ranged", "melee"].includes(kind)) return reject("Exact commander, enemy identity/tile, supported focused attack and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0 || targetPlayer === playerId) return reject("A local player and hostile target are required");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn ||
      player.Diplomacy.hasMet(targetPlayer) !== true || player.Diplomacy.isAtWarWith(targetPlayer) !== true) return reject("A fresh active local turn and existing met enemy war are required");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), matches = owned.filter(u => u.id.id === commanderId);
  if (matches.length !== 1) return reject("No unique owned commander");
  const commander = matches[0], valid = l => l && [l.x, l.y].every(v => Number.isInteger(v) && v >= 0) && l.x < GameplayMap.getGridWidth() && l.y < GameplayMap.getGridHeight();
  if (commander.isCommanderUnit !== true || commander.isOnMap !== true || commander.isDead === true || commander.operationQueueSize !== 0 ||
      GameInfo.Units.lookup(commander.type)?.Domain !== "DOMAIN_LAND" || !valid(commander.location) || !valid({x, y}) ||
      !Number.isFinite(commander.Movement?.movementMovesRemaining) || commander.Movement.movementMovesRemaining <= 0 ||
      GameplayMap.getRevealedState(playerId, commander.location.x, commander.location.y) !== RevealedStates.VISIBLE) return reject("A mobile deployed unqueued land commander is required");
  const army = typeof Armies !== "undefined" ? Armies.get(commander.armyId) : null, identity = army?.getCommanderId?.();
  if (army?.owner !== playerId || identity?.owner !== playerId || identity.id !== commanderId || identity.type !== commander.id.type ||
      !Array.isArray(army.getUnitIds()) || army.getUnitIds().length !== 0) return reject("Commander must have verified empty packed membership; deploy its units first");
  const same = (a, b) => a?.owner === b?.owner && a?.id === b?.id && a?.type === b?.type;
  function target() {
    if (GameplayMap.getRevealedState(playerId, x, y) !== RevealedStates.VISIBLE || ![-1, playerId].includes(GameplayMap.getOwner(x, y))) return null;
    const district = Game.Combat.getDefensibleDistrict({x, y}), ids = MapUnits.getUnits(x, y);
    if (!district || district.owner !== -1 || district.id !== -1 || !Array.isArray(ids) || ids.length !== 1) return null;
    const id = Game.Combat.getBestDefender({x, y}, commander.id);
    if (!same(id, ids[0]) || id?.owner !== targetPlayer || id.id !== targetId || !Number.isInteger(id.type) || id.type < 0 || Visibility.isVisible(playerId, id) !== true) return null;
    const u = Units.get(id);
    if (!u || !same(u.id, id) || u.isOnMap !== true || u.isDead === true || u.isCommanderUnit || u.Combat?.isCombat !== true ||
        !["FORMATION_CLASS_LAND_COMBAT", "FORMATION_CLASS_NAVAL"].includes(GameInfo.Units.lookup(u.type)?.FormationClass) ||
        u.location?.x !== x || u.location?.y !== y || !Number.isFinite(u.Health?.damage) || !Number.isFinite(u.Health.maxDamage) ||
        u.Health.damage < 0 || u.Health.damage >= u.Health.maxDamage) return null;
    if (kind === "melee" && (GameInfo.Units.lookup(u.type)?.Domain !== "DOMAIN_LAND" || GameplayMap.isWater(x, y) !== false)) return null;
    return u;
  }
  const enemy = target();
  if (!enemy) return reject("Primary target must be one exact visible hostile combat unit on an own/unowned field; no districts, stacks or civilian targets");
  const radius = Units.getCommandRadiusPlots(commander.id);
  if (!Array.isArray(radius) || !radius.length) return reject("Native command radius is unavailable");
  function participants() {
    const packed = new Set();
    for (const c of owned.filter(u => u.isCommanderUnit)) {
      const a = Armies.get(c.armyId), ids = a?.owner === playerId ? a.getUnitIds?.() : null;
      if (!Array.isArray(ids) || ids.some(id => id.owner !== playerId)) return null;
      for (const id of ids) packed.add(`${id.id}:${id.type}`);
    }
    if (typeof player.Armies?.getUnitReinforcementCommanderId !== "function") return null;
    const roles = kind === "ranged" ? ["UNIT_CLASS_RANGED"] : ["UNIT_CLASS_INFANTRY", "UNIT_CLASS_CAVALRY"];
    const candidates = owned.filter(u => !u.isCommanderUnit && u.isOnMap === true && u.isDead !== true && u.operationQueueSize === 0 &&
      u.isEmbarked === false && valid(u.location) && GameInfo.Units.lookup(u.type)?.Domain === "DOMAIN_LAND" &&
      GameInfo.Units.lookup(u.type)?.FormationClass === "FORMATION_CLASS_LAND_COMBAT" &&
      GameInfo.TypeTags.filter(t => t.Type === GameInfo.Units.lookup(u.type)?.UnitType && roles.includes(t.Tag)).length > 0 &&
      u.Combat?.isCombat === true &&
      u.Combat.canAttack === true && Number.isInteger(u.Combat.attacksRemaining) && u.Combat.attacksRemaining > 0 &&
      (kind === "melee" || u.Combat.rangedStrength > 0 || u.Combat.bombardStrength > 0) && Number.isFinite(u.Movement?.movementMovesRemaining) && u.Movement.movementMovesRemaining > 0 &&
      radius.includes(GameplayMap.getIndexFromLocation(u.location)) && !packed.has(`${u.id.id}:${u.id.type}`) &&
      player.Armies.getUnitReinforcementCommanderId(u.id, playerId) === -1);
    const eligible = [];
    for (const u of candidates) {
      const args = {X: x, Y: y};
      if (kind === "melee") {
        const targets = Units.getReachableTargets(u.id);
        if (!Array.isArray(targets)) return null;
        if (!targets.includes(GameplayMap.getIndexFromLocation({x, y}))) continue;
        // Do not let a coordinated command hide movement paths or future orders.
        if (GameplayMap.getPlotDistance(u.location.x, u.location.y, x, y) !== 1 || !Number.isInteger(UnitOperationMoveModifiers.ATTACK)) return null;
        args.Modifiers = UnitOperationMoveModifiers.ATTACK;
        if (Game.Combat.testAttackInto(u.id, args) !== CombatTypes.COMBAT_MELEE) continue;
      }
      const operation = kind === "ranged" ? UnitOperationTypes.RANGE_ATTACK : UnitOperationTypes.MOVE_TO;
      if (Game.UnitOperations.canStart(u.id, operation, args, false)?.Success !== true) continue;
      eligible.push({unit_id: u.id.id, component_type: u.id.type, unit_type: u.type, before_attacks: u.Combat.attacksRemaining,
        location: {x: u.location.x, y: u.location.y}, moves: u.Movement.movementMovesRemaining});
    }
    return eligible.sort((a, b) => a.unit_id - b.unit_id);
  }
  const eligible = participants();
  if (!eligible || !eligible.length || eligible.length > 16 || new Set(eligible.map(p => p.unit_id)).size !== eligible.length) return reject("No bounded known deployed role-eligible participants in native radius, or a melee approach would require travel");
  const before = {turn: Game.turn, age: Game.age, playerId, unitId: commanderId, unitType: commander.type, componentType: commander.id.type,
    location: {...commander.location}, moves: commander.Movement.movementMovesRemaining, participants: eligible,
    targetType: enemy.type, targetComponentType: enemy.id.type, targetDamage: enemy.Health.damage};
  const command = kind === "ranged" ? "UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED" : "UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE", args = {X: x, Y: y};
  const picker = Game.UnitCommands.canStart(commander.id, command, {}, false);
  if (picker?.Success !== true || !Array.isArray(picker.Plots) || !picker.Plots.includes(GameplayMap.getIndexFromLocation({x, y}))) return reject("Target is not offered by the exact native focused land attack", picker?.FailureReasons ?? []);
  const check = Game.UnitCommands.canStart(commander.id, command, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native focused attack is blocked or requires confirmation", check?.FailureReasons ?? []);
  const fresh = target();
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false || player.Diplomacy.isAtWarWith(targetPlayer) !== true || commander.type !== before.unitType ||
      commander.id.owner !== playerId || commander.id.type !== before.componentType || commander.isOnMap !== true || commander.operationQueueSize !== 0 ||
      commander.location.x !== before.location.x || commander.location.y !== before.location.y || commander.Movement.movementMovesRemaining !== before.moves ||
      army.getUnitIds().length !== 0 || JSON.stringify(participants()) !== JSON.stringify(eligible) ||
      !fresh || fresh.type !== before.targetType || fresh.id.type !== before.targetComponentType || fresh.Health.damage !== before.targetDamage) return reject("Commander, participants, target or game context changed during validation");
  const verificationArguments = {unit_id: commanderId, attacker_component_type: commander.id.type, attacker_type: commander.type,
    before_attacks: 1, participants: eligible, target_player: targetPlayer, target_unit_id: targetId, target_component_type: before.targetComponentType,
    target_type: before.targetType, before_target_damage: before.targetDamage, x, y};
  Game.UnitCommands.sendRequest(commander.id, command, args);
  return {status: "submitted", before, expected: {unitId: commanderId, targetPlayer, targetUnitId: targetId, attackObserved: true}, verificationArguments,
    verificationScope: "At least one captured participant consumes an attack/is lost plus observed primary-target damage/departure. Native splash/other side effects are possible and not fully verified; engine chooses participants, not per-unit selection"};
})()
