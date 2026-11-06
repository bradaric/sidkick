(() => {
  const {unit_id: unitId, target_player: targetPlayer, target_unit_id: targetId, x, y, kind, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (![unitId, targetPlayer, targetId, x, y, expectedTurn].every(v => Number.isInteger(v) && v >= 0) ||
      !["melee", "ranged"].includes(kind)) return reject("Exact owned attacker, hostile target identity/tile, melee/ranged kind and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0 || targetPlayer === playerId) return reject("An enemy of the local player is required");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn) return reject("A fresh active local turn is required");
  if (player.Diplomacy.hasMet(targetPlayer) !== true || player.Diplomacy.isAtWarWith(targetPlayer) !== true) return reject("Target must already be a met wartime enemy; no war declaration is supported");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), matches = owned.filter(u => u.id.id === unitId);
  if (matches.length !== 1) return reject("No unique owned attacker");
  const unit = matches[0];
  const combatFormation = u => ["FORMATION_CLASS_LAND_COMBAT", "FORMATION_CLASS_NAVAL"].includes(GameInfo.Units.lookup(u.type)?.FormationClass);
  const valid = loc => loc && [loc.x, loc.y].every(v => Number.isInteger(v) && v >= 0) &&
    loc.x < GameplayMap.getGridWidth() && loc.y < GameplayMap.getGridHeight();
  const location = {x, y};
  if (!combatFormation(unit) || unit.isOnMap !== true || unit.isDead === true || unit.isCommanderUnit || unit.isEmbarked !== false || unit.operationQueueSize !== 0 ||
      !["DOMAIN_LAND", "DOMAIN_SEA"].includes(GameInfo.Units.lookup(unit.type)?.Domain) || !valid(unit.location) || !valid(location) ||
      unit.Combat?.isCombat !== true || unit.Combat.canAttack !== true || !Number.isInteger(unit.Combat.attacksRemaining) ||
      unit.Combat.attacksRemaining <= 0 || !Number.isFinite(unit.Movement?.movementMovesRemaining) || unit.Movement.movementMovesRemaining <= 0) return reject("A ready deployed unqueued land/sea noncommander, not embarked, is required");
  for (const commander of owned.filter(u => u.isCommanderUnit)) {
    const army = typeof Armies !== "undefined" ? Armies.get(commander.armyId) : null;
    const ids = army?.owner === playerId && typeof army.getUnitIds === "function" ? army.getUnitIds() : null;
    if (!Array.isArray(ids) || ids.some(id => id.owner === playerId && id.id === unitId && id.type === unit.id.type)) return reject("Attacker packing is active or unverified");
  }
  if (typeof player.Armies?.getUnitReinforcementCommanderId !== "function" ||
      player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) return reject("Attacker reinforcement is active or unverified");
  const same = (a, b) => a?.owner === b?.owner && a?.id === b?.id && a?.type === b?.type;
  function target() {
    if (GameplayMap.getRevealedState(playerId, x, y) !== RevealedStates.VISIBLE ||
        GameplayMap.getRevealedState(playerId, unit.location.x, unit.location.y) !== RevealedStates.VISIBLE) return null;
    const owner = GameplayMap.getOwner(x, y);
    // Keep this first combat family in owned/unowned fields, excluding enemy
    // settlement tiles even when an undefended centre has no defensible district.
    if (![playerId, -1].includes(owner)) return null;
    const district = Game.Combat.getDefensibleDistrict(location);
    if (!district || district.owner !== -1 || district.id !== -1) return null;
    const ids = MapUnits.getUnits(x, y), defender = Game.Combat.getBestDefender(location, unit.id);
    if (!Array.isArray(ids) || ids.length !== 1 || !same(ids[0], defender) || defender?.owner !== targetPlayer ||
        defender.id !== targetId || !Number.isInteger(defender.type) || defender.type < 0 || Visibility.isVisible(playerId, defender) !== true) return null;
    const enemy = Units.get(defender);
    if (!enemy || !same(enemy.id, defender) || !combatFormation(enemy) || enemy.Combat?.isCombat !== true || enemy.isCommanderUnit || enemy.isOnMap !== true ||
        enemy.isDead === true || enemy.location?.x !== x || enemy.location?.y !== y ||
        !Number.isFinite(enemy.Health?.damage) || !Number.isFinite(enemy.Health.maxDamage) ||
        enemy.Health.damage < 0 || enemy.Health.damage >= enemy.Health.maxDamage) return null;
    return enemy;
  }
  const enemy = target();
  if (!enemy) return reject("Target is not the exact single visible hostile combat unit on an undefended-district tile; no civilian, stack or city attacks");
  const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
    location: {x: unit.location.x, y: unit.location.y}, moves: unit.Movement.movementMovesRemaining,
    attacks: unit.Combat.attacksRemaining, hasAttacked: unit.Combat.hasAttacked ?? null,
    targetPlayer, targetUnitId: targetId, targetType: enemy.type, targetComponentType: enemy.id.type, targetDamage: enemy.Health.damage};
  const args = {X: x, Y: y}, plot = GameplayMap.getIndexFromLocation(location);
  const operation = kind === "melee" ? UnitOperationTypes.MOVE_TO : UnitOperationTypes.RANGE_ATTACK;
  if (kind === "melee") {
    if (!Number.isInteger(UnitOperationMoveModifiers.ATTACK) || GameplayMap.getPlotDistance(unit.location.x, unit.location.y, x, y) !== 1 ||
        !Units.getReachableTargets(unit.id)?.includes(plot)) return reject("Melee requires a directly adjacent native attack target");
    args.Modifiers = UnitOperationMoveModifiers.ATTACK;
    if (Game.Combat.testAttackInto(unit.id, args) !== CombatTypes.COMBAT_MELEE) return reject("Native attack test did not confirm melee combat");
  } else {
    const picker = Game.UnitOperations.canStart(unit.id, operation, {}, false);
    const index = Array.isArray(picker?.Plots) ? picker.Plots.indexOf(plot) : -1;
    if (picker?.Success !== true || index < 0 || !Array.isArray(picker.Modifiers) || picker.Modifiers.length !== picker.Plots.length ||
        ![OperationPlotModifiers.TARGET, OperationPlotModifiers.INDIRECT].filter(Number.isInteger).includes(picker.Modifiers[index])) return reject("Target is not an attackable native ranged-picker plot");
  }
  const check = Game.UnitOperations.canStart(unit.id, operation, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native attack is blocked or requires an unsupported confirmation", check?.FailureReasons ?? []);
  const fresh = target();
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false || player.Diplomacy.isAtWarWith(targetPlayer) !== true ||
      unit.id.owner !== playerId || unit.id.type !== before.componentType || unit.type !== before.unitType || unit.isOnMap !== true ||
      unit.operationQueueSize !== 0 || unit.location.x !== before.location.x || unit.location.y !== before.location.y ||
      unit.Movement.movementMovesRemaining !== before.moves || unit.Combat.attacksRemaining !== before.attacks || unit.Combat.canAttack !== true ||
      !fresh || fresh.type !== before.targetType || fresh.id.type !== before.targetComponentType || fresh.Health.damage !== before.targetDamage) return reject("Combatant, target or game context changed during validation");
  const verificationArguments = {unit_id: unitId, attacker_component_type: before.componentType, attacker_type: before.unitType,
    before_attacks: before.attacks, target_player: targetPlayer, target_unit_id: targetId,
    target_component_type: before.targetComponentType, target_type: before.targetType, before_target_damage: before.targetDamage, x, y};
  Game.UnitOperations.sendRequest(unit.id, operation, args);
  return {status: "submitted", before, expected: {unitId, targetPlayer, targetUnitId: targetId, attackObserved: true}, verificationArguments,
    verificationScope: "Attack consumed/attacker lost plus visible target damage or departure from tile; not a damage forecast, kill or capture claim"};
})()
