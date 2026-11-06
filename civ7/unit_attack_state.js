(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player) throw Error("No local player");
  const {unit_id: unitId, attacker_component_type: componentType, attacker_type: unitType, before_attacks: beforeAttacks,
    target_player: targetPlayer, target_unit_id: targetUnitId, target_component_type: targetComponentType,
    target_type: targetType, before_target_damage: beforeDamage, x, y} = queryArguments;
  if (![unitId, componentType, beforeAttacks, targetPlayer, targetUnitId, targetComponentType, x, y].every(v => Number.isInteger(v) && v >= 0) ||
      beforeAttacks <= 0 || !Number.isInteger(unitType) || !Number.isInteger(targetType) || !Number.isFinite(beforeDamage) || beforeDamage < 0 ||
      x >= GameplayMap.getGridWidth() || y >= GameplayMap.getGridHeight() || targetPlayer === playerId) throw Error("Invalid submitted combat identity");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId);
  const own = owned.filter(u => u.id.id === unitId);
  if (own.length > 1 || (own.length && (own[0].id.type !== componentType || own[0].type !== unitType))) throw Error("Attacker identity is ambiguous or changed");
  const attacker = own[0], attacks = attacker?.Combat?.attacksRemaining ?? null;
  let consumed = own.length === 0 || (Number.isInteger(attacks) && attacks < beforeAttacks);
  let consumedUnitIds = consumed ? [unitId] : [];
  if (queryArguments.participants !== undefined) {
    const participants = queryArguments.participants;
    if (!Array.isArray(participants) || participants.length < 1 || participants.length > 16 ||
        participants.some(p => ![p.unit_id, p.component_type, p.before_attacks].every(v => Number.isInteger(v) && v >= 0) ||
          p.unit_id === unitId || p.before_attacks <= 0 || !Number.isInteger(p.unit_type)) ||
        new Set(participants.map(p => p.unit_id)).size !== participants.length) throw Error("Invalid submitted attack participants");
    if (!attacker || attacker.isCommanderUnit !== true) throw Error("Focused attack commander identity changed");
    consumedUnitIds = participants.filter(p => {
      const units = owned.filter(u => u.id.id === p.unit_id);
      if (units.length > 1 || (units.length && (units[0].id.type !== p.component_type || units[0].type !== p.unit_type))) throw Error("Participant identity changed");
      return !units.length || (Number.isInteger(units[0].Combat?.attacksRemaining) && units[0].Combat.attacksRemaining < p.before_attacks);
    }).map(p => p.unit_id);
    consumed = consumedUnitIds.length > 0;
  }
  let targetDamage = null, targetLeftTile = null;
  if (player.Diplomacy.hasMet(targetPlayer) === true && GameplayMap.getRevealedState(playerId, x, y) === RevealedStates.VISIBLE) {
    const ids = MapUnits.getUnits(x, y);
    if (Array.isArray(ids)) {
      const component = {owner: targetPlayer, id: targetUnitId, type: targetComponentType};
      const present = ids.some(id => id.owner === targetPlayer && id.id === targetUnitId && id.type === targetComponentType);
      targetLeftTile = !present;
      if (present && Visibility.isVisible(playerId, component) === true) {
        const target = Units.get(component);
        if (!target || target.type !== targetType) throw Error("Visible target identity changed");
        if (Number.isFinite(target.Health?.damage)) targetDamage = target.Health.damage;
      }
    }
  }
  if (queryArguments.commander_attack === true) {
    const {before_moves: moves, commander_before_attacks: oldAttacks, baseline_army_id: armyId,
      baseline_packed_unit_ids: baseline, commander_location: location} = queryArguments;
    if (!attacker || attacker.isCommanderUnit !== true || queryArguments.participants !== undefined || !Number.isFinite(moves) || moves <= 0 ||
        !Number.isInteger(armyId) || armyId < 0 || !Array.isArray(baseline) || baseline.some(id => !Number.isInteger(id) || id < 0) || new Set(baseline).size !== baseline.length ||
        ![location?.x, location?.y].every(v => Number.isInteger(v) && v >= 0)) throw Error("Invalid captured commander ability baseline");
    const army = Armies.get(attacker.armyId), identity = army?.getCommanderId?.(), ids = army?.getUnitIds?.();
    if (army?.owner !== playerId || army.localId !== armyId || identity?.owner !== playerId || identity.id !== unitId || identity.type !== componentType ||
        !Array.isArray(ids) || ids.some(id => id.owner !== playerId || owned.filter(u => u.id.id === id.id && u.id.type === id.type).length !== 1)) throw Error("Commander army identity or membership changed");
    const packed = ids.map(id => id.id).sort((a, b) => a - b), packingPreserved = JSON.stringify(packed) === JSON.stringify(baseline);
    const currentMoves = attacker.Movement?.movementMovesRemaining;
    const sourceMovementSpent = Number.isFinite(currentMoves) && currentMoves >= 0 && currentMoves < moves;
    const sourceAttackSpent = Number.isInteger(oldAttacks) && oldAttacks >= 0 && Number.isInteger(attacks) && attacks >= 0 && attacks < oldAttacks;
    const targetEffect = targetLeftTile === true || (targetDamage != null && targetDamage > beforeDamage);
    const sourceStayed = attacker.isOnMap === true && attacker.isDead !== true && attacker.location?.x === location.x && attacker.location?.y === location.y;
    return {turn: Game.turn, age: Game.age, playerId, unitId, targetPlayer, targetUnitId, targetDamage, targetLeftTile,
      sourceMovementSpent, sourceAttackSpent, packingPreserved, movesRemaining: currentMoves ?? null, attacksRemaining: attacks,
      abilityAttackObserved: sourceStayed && attacker.operationQueueSize === 0 && packingPreserved && (sourceMovementSpent || sourceAttackSpent) && targetEffect};
  }
  return {turn: Game.turn, age: Game.age, playerId, unitId, targetPlayer, targetUnitId,
    attackerPresent: Boolean(attacker), attacksRemaining: attacks, attackConsumedOrAttackerLost: consumed, consumedUnitIds,
    targetDamage, targetLeftTile, attackObserved: consumed && (targetLeftTile === true || (targetDamage != null && targetDamage > beforeDamage)),
    note: "A target leaving a visible tile is not proof of destruction; no hidden target state or damage forecast is queried"};
})()
