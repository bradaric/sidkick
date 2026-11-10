(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player) throw Error("No local player");
  const blocker = Game.Notifications.getEndTurnBlockingType(playerId);
  const unitOrders = {canStartAny: null, firstReadyUnitStatus: "unavailable", firstReadyUnit: null};
  try {
    const allowed = Game.UnitOperations?.canStartAny?.(playerId);
    if (typeof allowed === "boolean") unitOrders.canStartAny = allowed;
  } catch { /* Optional unit evidence must not discard the observed turn state. */ }
  try {
    if (typeof UI.Player?.getFirstReadyUnit === "function") {
      const ready = UI.Player.getFirstReadyUnit();
      unitOrders.firstReadyUnitStatus = ready == null ? "none" : "unverified";
      if (ready?.owner === playerId && [ready.id, ready.type].every(value => Number.isInteger(value) && value >= 0)) {
        const owned = player.Units?.getUnits?.();
        if (!Array.isArray(owned)) unitOrders.firstReadyUnitStatus = "unavailable";
        else {
          const matches = owned.filter(unit => unit?.id?.owner === playerId && unit.id.id === ready.id && unit.id.type === ready.type);
          if (matches.length === 1) {
            const unit = matches[0], def = GameInfo.Units?.lookup(unit.type), key = unit.name ?? def?.Name;
            const location = unit.isOnMap === true ? unit.location : null;
            const visibleLocation = location && [location.x, location.y].every(value => Number.isInteger(value) && value >= 0) &&
              location.x < GameplayMap.getGridWidth() && location.y < GameplayMap.getGridHeight() &&
              GameplayMap.getRevealedState(playerId, location.x, location.y) !== RevealedStates.HIDDEN;
            unitOrders.firstReadyUnit = {componentId: {owner: ready.owner, id: ready.id, type: ready.type},
              instanceId: ready.id, id: def?.UnitType ?? unit.type, name: key ? Locale.compose(key) : null,
              location: visibleLocation ? {x: location.x, y: location.y} : null,
              movesRemaining: Number.isFinite(unit.Movement?.movementMovesRemaining) ? unit.Movement.movementMovesRemaining : null,
              queueSize: Number.isInteger(unit.operationQueueSize) && unit.operationQueueSize >= 0 ? unit.operationQueueSize : null,
              canMove: typeof unit.canMove === "boolean" ? unit.canMove : null,
              hasMoved: typeof unit.hasMoved === "boolean" ? unit.hasMoved : null};
            unitOrders.firstReadyUnitStatus = "identified";
          }
        }
      }
    }
  } catch {
    unitOrders.firstReadyUnitStatus = "unavailable";
    unitOrders.firstReadyUnit = null;
  }
  return {turn: Game.turn, age: Game.age, playerId, active: player.isTurnActive,
    sent: GameContext.hasSentTurnComplete(), blocker,
    hasBlocker: Number.isInteger(blocker) ? blocker !== EndTurnBlockingTypes.NONE : null,
    blockerName: Object.keys(EndTurnBlockingTypes).find(k => EndTurnBlockingTypes[k] === blocker) ?? null,
    extendedGame: Game.AgeProgressManager.isExtendedGame, ...unitOrders,
    ...remainingMoves(unitOrders.canStartAny, unitOrders.firstReadyUnitStatus, unitOrders.firstReadyUnit)};
})()
