(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player) throw Error("No local player");
  const {unit_id: unitId, unit_type: unitType, component_type: componentType, before_attacks: beforeAttacks, baseline_armies: baseline, source_base: source,
    target_player: targetPlayer, target_unit_id: targetId, target_type: targetType, target_component_type: targetComponentType, before_target_damage: beforeDamage, x, y} = queryArguments;
  if (![unitId, componentType, beforeAttacks, targetPlayer, targetId, targetComponentType, x, y, source?.commanderId, source?.location?.x, source?.location?.y].every(v => Number.isInteger(v) && v >= 0) ||
      beforeAttacks <= 0 || !Number.isInteger(unitType) || !Number.isInteger(targetType) || !Array.isArray(baseline) || !Number.isFinite(beforeDamage) || beforeDamage < 0 ||
      targetPlayer === playerId || x >= GameplayMap.getGridWidth() || y >= GameplayMap.getGridHeight()) throw Error("Invalid captured air strike identity");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), matches = owned.filter(u => u.id.id === unitId), records = [], seen = new Set();
  if (matches.length > 1 || (matches.length && (matches[0].type !== unitType || matches[0].id.type !== componentType))) throw Error("Captured aircraft identity changed");
  for (const c of owned.filter(u => u.isCommanderUnit)) {
    const a = Armies.get(c.armyId), identity = a?.getCommanderId?.(), ids = a?.getUnitIds?.();
    if (a?.owner !== playerId || !Number.isInteger(a.localId) || a.localId < 0 || identity?.owner !== playerId || identity.id !== c.id.id || identity.type !== c.id.type ||
        !Array.isArray(ids) || ids.some(id => id.owner !== playerId || id.id === c.id.id || owned.filter(u => u.id.id === id.id && u.id.type === id.type).length !== 1)) throw Error("Owned army identity/membership is unknown");
    const members = ids.map(id => id.id).sort((a, b) => a - b);
    for (const id of members) {if (seen.has(id)) throw Error("Army membership is ambiguous"); seen.add(id);}
    records.push({commanderId: c.id.id, commanderType: c.type, componentType: c.id.type, armyId: a.localId, packedUnitIds: members});
  }
  records.sort((a, b) => a.commanderId - b.commanderId);
  const unit = matches[0], base = owned.find(u => u.id.id === source.commanderId), attacks = unit?.Combat?.attacksRemaining ?? null;
  const spent = !unit || (Number.isInteger(attacks) && attacks >= 0 && attacks < beforeAttacks);
  const expected = baseline.map(a => ({...a, packedUnitIds: unit ? a.packedUnitIds : a.packedUnitIds.filter(id => id !== unitId)}));
  const city = player.Cities.getCities().find(c => c.id.owner === playerId && c.id.id === source.cityId && c.id.type === source.cityComponentType);
  const sourcePreserved = base?.id.type === source.componentType && base.type === source.commanderType && base.isAerodromeCommander === true && base.isOnMap === true && base.isDead !== true &&
    base.location?.x === source.location.x && base.location?.y === source.location.y && base.armyId?.owner === playerId && base.armyId.id === source.armyId && base.armyId.type === source.armyComponentType &&
    city?.location?.x === source.location.x && city?.location?.y === source.location.y && GameplayMap.getRevealedState(playerId, source.location.x, source.location.y) === RevealedStates.VISIBLE &&
    GameplayMap.getOwner(source.location.x, source.location.y) === playerId && JSON.stringify(records) === JSON.stringify(expected) &&
    (!unit || (unit.isOnMap === false && unit.operationQueueSize === 0 && unit.armyId?.owner === playerId && unit.armyId.id === source.armyId && unit.armyId.type === source.armyComponentType));
  let targetDamage = null, targetLeftTile = null;
  if (player.Diplomacy.hasMet(targetPlayer) === true && GameplayMap.getRevealedState(playerId, x, y) === RevealedStates.VISIBLE) {
    const ids = MapUnits.getUnits(x, y);
    if (Array.isArray(ids)) {
      const id = ids.find(id => id.owner === targetPlayer && id.id === targetId && id.type === targetComponentType);
      targetLeftTile = !id;
      if (id && Visibility.isVisible(playerId, id) === true) {
        const enemy = Units.get(id);
        if (!enemy || enemy.type !== targetType) throw Error("Visible primary target identity changed");
        if (Number.isFinite(enemy.Health?.damage)) targetDamage = enemy.Health.damage;
      }
    }
  }
  return {turn: Game.turn, age: Game.age, playerId, unitId, targetPlayer, targetUnitId: targetId, attackerPresent: Boolean(unit), attacksRemaining: attacks,
    sourcePreserved: Boolean(sourcePreserved), targetDamage, targetLeftTile,
    airAttackObserved: Boolean(spent && sourcePreserved && (targetLeftTile === true || (targetDamage !== null && targetDamage > beforeDamage)))};
})()
