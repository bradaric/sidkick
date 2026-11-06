(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player) throw Error("No local player");
  const {unit_id: unitId, unit_type: unitType, component_type: componentType, target_player: targetPlayer, x, y, before_moves: moves, baseline_constructibles: baseline} = queryArguments;
  if (![unitId, componentType, targetPlayer, x, y].every(v => Number.isInteger(v) && v >= 0) || !Number.isInteger(unitType) || !Number.isFinite(moves) || moves <= 0 ||
      x >= GameplayMap.getGridWidth() || y >= GameplayMap.getGridHeight() || !Array.isArray(baseline) || !baseline.length) throw Error("Invalid captured pillage identity");
  const units = player.Units.getUnits().filter(u => u.id.owner === playerId && u.id.id === unitId);
  if (units.length !== 1 || units[0].type !== unitType || units[0].id.type !== componentType) throw Error("Captured pillager identity changed");
  const unit = units[0], currentMoves = unit.Movement?.movementMovesRemaining;
  const spent = Number.isFinite(currentMoves) && currentMoves >= 0 && currentMoves < moves;
  let changed = null;
  if (player.Diplomacy.hasMet(targetPlayer) === true && GameplayMap.getRevealedState(playerId, x, y) === RevealedStates.VISIBLE && GameplayMap.getOwner(x, y) === targetPlayer) {
    const ids = MapConstructibles.getConstructibles(x, y);
    if (!Array.isArray(ids)) throw Error("Visible constructible membership is unknown");
    changed = [];
    for (const old of baseline.filter(c => c.complete && !c.damaged)) {
      const id = ids.find(id => id.owner === old.owner && id.id === old.instanceId && id.type === old.componentType);
      if (!id) {changed.push({instanceId: old.instanceId, departed: true}); continue;}
      const c = Constructibles.getByComponentID(id);
      if (!c || c.type !== old.type || typeof c.damaged !== "boolean") throw Error("Visible constructible identity/damage is unknown");
      if (c.damaged) changed.push({instanceId: old.instanceId, damaged: true});
    }
  }
  return {turn: Game.turn, age: Game.age, playerId, unitId, movesRemaining: currentMoves ?? null, changedConstructibles: changed,
    gold: player.Treasury?.goldBalance ?? null, pillageObserved: spent && unit.isOnMap === true && unit.isDead !== true && unit.operationQueueSize === 0 &&
      unit.location?.x === x && unit.location?.y === y && Array.isArray(changed) && changed.length > 0};
})()
