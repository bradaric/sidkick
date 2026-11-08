(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, unitId = queryArguments.unit_id;
  const matches = Players.get(playerId)?.Units.getUnits().filter(unit => unit.id.owner === playerId && unit.id.id === unitId) ?? [];
  const state = {turn: Game.turn, age: Game.age, playerId, unitId, present: matches.length === 1};
  if (!state.present) return state;
  const unit = matches[0], location = unit.location;
  const queueSize = Number.isInteger(unit.operationQueueSize) && unit.operationQueueSize >= 0 ? unit.operationQueueSize : null;
  return {...state, unitType: unit.type, componentType: unit.id.type,
    isDead: typeof unit.isDead === "boolean" ? unit.isDead : null,
    location: unit.isOnMap === true && location && Number.isInteger(location.x) && location.x >= 0 &&
      Number.isInteger(location.y) && location.y >= 0 ? {x: location.x, y: location.y} : null,
    queueSize, operation: queueSize > 0 && typeof unit.getOperationType === "function" ? unit.getOperationType(0) : null,
    movesRemaining: unit.Movement?.movementMovesRemaining ?? null, damage: unit.Health?.damage ?? null,
    embarked: typeof unit.isEmbarked === "boolean" ? unit.isEmbarked : null};
})()
