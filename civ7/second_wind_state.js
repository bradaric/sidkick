(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player) throw Error("No local player");
  const {commander_id: commanderId, unit_id: unitId, commander_type: commanderType, commander_component_type: commanderComponentType,
    unit_type: unitType, component_type: componentType, commander_location: source, location, packed_unit_ids: baseline,
    before_moves: moves, before_attacks: attacks, before_damage: damage} = queryArguments;
  if (![commanderId, unitId, commanderComponentType, componentType].every(v => Number.isInteger(v) && v >= 0) || commanderId === unitId ||
      !Number.isInteger(commanderType) || !Number.isInteger(unitType) || !Array.isArray(baseline) || baseline.some(id => !Number.isInteger(id) || id < 0) ||
      ![source?.x, source?.y, location?.x, location?.y, moves, attacks, damage].every(v => Number.isFinite(v) && v >= 0)) throw Error("Invalid captured Second Wind identity/baseline");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), commanders = owned.filter(u => u.id.id === commanderId), recipients = owned.filter(u => u.id.id === unitId);
  if (commanders.length !== 1 || recipients.length !== 1) throw Error("Captured commander or recipient disappeared");
  const commander = commanders[0], unit = recipients[0], army = Armies.get(commander.armyId), identity = army?.getCommanderId?.(), members = army?.getUnitIds?.();
  if (commander.type !== commanderType || commander.id.type !== commanderComponentType || unit.type !== unitType || unit.id.type !== componentType ||
      army?.owner !== playerId || identity?.owner !== playerId || identity.id !== commanderId || identity.type !== commanderComponentType || !Array.isArray(members) ||
      members.some(id => id.owner !== playerId || owned.filter(u => u.id.id === id.id && u.id.type === id.type).length !== 1)) throw Error("Captured identity/membership is unverified");
  const packedUnitIds = members.map(id => id.id).sort((a, b) => a - b), sameLocation = (u, l) => u.isOnMap === true && u.location?.x === l.x && u.location?.y === l.y;
  const visible = GameplayMap.getRevealedState(playerId, location.x, location.y) === RevealedStates.VISIBLE;
  const ids = visible ? MapUnits.getUnits(location.x, location.y) : null;
  const secondWindObserved = sameLocation(commander, source) && sameLocation(unit, location) && visible &&
    Array.isArray(ids) && ids.length === 1 && ids[0].owner === playerId && ids[0].id === unitId && ids[0].type === componentType &&
    JSON.stringify(packedUnitIds) === JSON.stringify(baseline) && unit.Health?.damage === damage &&
    unit.Movement?.movementMovesRemaining === moves + 2 && unit.Combat?.attacksRemaining === attacks + 1;
  return {turn: Game.turn, age: Game.age, playerId, commanderId, unitId, secondWindObserved,
    movesRemaining: unit.Movement?.movementMovesRemaining ?? null, attacksRemaining: unit.Combat?.attacksRemaining ?? null, packedUnitIds};
})()
