(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  const {unit_id: unitId} = queryArguments;
  if (!Number.isInteger(unitId) || unitId < 0) throw Error("An owned unit instance ID is required");
  const units = player.Units.getUnits().filter(unit => unit.id.owner === playerId);
  const matches = units.filter(unit => unit.id.id === unitId);
  if (matches.length !== 1) throw Error("No unique owned unit matches the submitted instance ID");
  const unit = matches[0], location = unit.location;
  let deployed = unit.isOnMap !== false;
  for (const commander of units.filter(value => value.isCommanderUnit)) {
    const army = typeof Armies !== "undefined" ? Armies.get(commander.armyId) : null;
    const packed = army?.owner === playerId && typeof army.getUnitIds === "function" ? army.getUnitIds() : null;
    if (!Array.isArray(packed) || packed.some(id => id.owner === playerId && id.id === unitId && id.type === unit.id.type)) deployed = false;
  }
  if (typeof player.Armies?.getUnitReinforcementCommanderId !== "function" ||
      player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) deployed = false;
  return {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
    location: deployed && location && Number.isInteger(location.x) && location.x >= 0 &&
      Number.isInteger(location.y) && location.y >= 0 ? {x: location.x, y: location.y} : null,
    movesRemaining: unit.Movement?.movementMovesRemaining ?? null};
})()
