(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  const {unit_id: unitId, commander_id: commanderId, component_type: componentType,
    commander_component_type: commanderType, target_army_id: targetArmyId} = queryArguments;
  if (!player || ![unitId, commanderId, componentType, commanderType, targetArmyId].every(v => Number.isInteger(v) && v >= 0) ||
      typeof player.Armies?.getUnitReinforcementCommanderId !== "function") throw Error("Invalid reinforcement identity or unavailable assignment API");
  const commanders = player.Units.getUnits().filter(u => u.id.owner === playerId && u.id.id === commanderId && u.id.type === commanderType);
  if (commanders.length !== 1 || commanders[0].isCommanderUnit !== true) throw Error("Target commander identity changed");
  const army = Armies.get(commanders[0].armyId), identity = army?.getCommanderId();
  if (!army || army.owner !== playerId || army.localId !== targetArmyId || identity?.owner !== playerId ||
      identity.id !== commanderId || identity.type !== commanderType) throw Error("Target army identity changed");
  // Reinforcing units may be off-map; query only the captured owner-qualified component.
  const component = {owner: playerId, id: unitId, type: componentType};
  const assignment = player.Armies.getUnitReinforcementCommanderId(component, playerId);
  const eta = assignment === targetArmyId && typeof player.Armies.getUnitReinforcementETA === "function"
    ? player.Armies.getUnitReinforcementETA(component, playerId) : null;
  return {turn: Game.turn, age: Game.age, playerId, unitId, commanderId, targetArmyId,
    assignedArmyId: Number.isInteger(assignment) && assignment >= 0 ? assignment : null,
    reinforcing: assignment === targetArmyId, nativeArrivalTime: Number.isFinite(eta) && eta >= 0 ? eta : null};
})()
