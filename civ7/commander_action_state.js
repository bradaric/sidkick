(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  const {mode, commander_id: commanderId, component_type: componentType,
    baseline_packed_unit_ids: baselinePacked, baseline_unit_ids: baselineOwned} = queryArguments;
  if (!["pack", "unpack", "move", "rail", "overrun"].includes(mode) || ![commanderId, componentType].every(v => Number.isInteger(v) && v >= 0) ||
      ![baselinePacked, baselineOwned].every(a => Array.isArray(a) && a.every(v => Number.isInteger(v) && v >= 0) && new Set(a).size === a.length) ||
      !baselineOwned.includes(commanderId) || baselinePacked.some(id => id === commanderId || !baselineOwned.includes(id))) throw Error("Invalid submitted commander baseline");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), matches = owned.filter(u => u.id.id === commanderId && u.id.type === componentType);
  if (matches.length !== 1 || matches[0].isCommanderUnit !== true) throw Error("No unique owned commander matches submitted identity");
  const commander = matches[0], army = Armies.get(commander.armyId);
  if (!army || army.owner !== playerId) throw Error("Owned army is unavailable");
  const armyCommander = typeof army.getCommanderId === "function" ? army.getCommanderId() : null;
  if (armyCommander?.owner !== playerId || armyCommander.id !== commanderId || armyCommander.type !== componentType) throw Error("Army commander identity changed");
  const members = army.getUnitIds();
  if (!Array.isArray(members) || members.some(id => id.owner !== playerId || id.id === commanderId ||
      !owned.some(u => u.id.id === id.id && u.id.type === id.type))) throw Error("Packed membership is unavailable");
  const packed = members.map(id => id.id).sort((a, b) => a - b);
  if (new Set(packed).size !== packed.length) throw Error("Packed membership is ambiguous");
  const added = packed.filter(id => !baselinePacked.includes(id));
  const deployed = baselinePacked.filter(id => owned.some(u => u.id.id === id && u.isOnMap === true && !packed.includes(id)));
  let overrunObserved = false, targetLeftTile = null;
  if (mode === "overrun") {
    const {target_player: targetPlayer, target_unit_id: targetId, target_component_type: targetComponentType, x, y, before_moves: moves} = queryArguments;
    if (![targetPlayer, targetId, targetComponentType, x, y].every(v => Number.isInteger(v) && v >= 0) || targetPlayer === playerId ||
        !baselinePacked.length || !Number.isFinite(moves) || moves <= 0 || x >= GameplayMap.getGridWidth() || y >= GameplayMap.getGridHeight()) throw Error("Invalid submitted Overrun baseline");
    if (player.Diplomacy.hasMet(targetPlayer) === true && GameplayMap.getRevealedState(playerId, x, y) === RevealedStates.VISIBLE) {
      const ids = MapUnits.getUnits(x, y);
      if (Array.isArray(ids)) targetLeftTile = !ids.some(id => id.owner === targetPlayer && id.id === targetId && id.type === targetComponentType);
    }
    overrunObserved = targetLeftTile === true && commander.isOnMap === true && commander.location?.x === x && commander.location?.y === y &&
      Number.isFinite(commander.Movement?.movementMovesRemaining) && commander.Movement.movementMovesRemaining >= 0 && commander.Movement.movementMovesRemaining < moves &&
      JSON.stringify(packed) === JSON.stringify([...baselinePacked].sort((a, b) => a - b));
  }
  return {turn: Game.turn, age: Game.age, playerId, commanderId, commanderType: commander.type, componentType,
    location: commander.isOnMap === true && Number.isInteger(commander.location?.x) && commander.location.x >= 0 &&
      Number.isInteger(commander.location?.y) && commander.location.y >= 0 ? {x: commander.location.x, y: commander.location.y} : null,
    packedUnitIds: packed, newPackedUnitIds: added, deployedUnitIds: deployed, queueSize: commander.operationQueueSize, overrunObserved, targetLeftTile, killConfirmed: null,
    packObserved: added.length > 0 && baselinePacked.every(id => packed.includes(id)) && added.every(id => baselineOwned.includes(id)),
    unpackObserved: baselinePacked.length > 0 && packed.length === 0 && deployed.length === baselinePacked.length};
})()
