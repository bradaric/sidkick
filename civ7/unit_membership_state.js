(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player) throw Error("No local player");
  const {unit_id: unitId, commander_id: commanderId, component_type: componentType, unit_type: unitType,
    commander_component_type: commanderComponentType, commander_type: commanderType} = queryArguments;
  if (![unitId, commanderId, componentType, commanderComponentType].every(v => Number.isInteger(v) && v >= 0) ||
      unitId === commanderId || !Number.isInteger(unitType) || !Number.isInteger(commanderType)) throw Error("Invalid captured membership identity");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), units = owned.filter(u => u.id.id === unitId), commanders = owned.filter(u => u.id.id === commanderId);
  if (units.length !== 1 || units[0].id.type !== componentType || units[0].type !== unitType || commanders.length !== 1 ||
      commanders[0].id.type !== commanderComponentType || commanders[0].type !== commanderType || commanders[0].isCommanderUnit !== true) throw Error("Captured unit or commander identity changed");
  const armies = [], seen = new Set();
  for (const c of owned.filter(u => u.isCommanderUnit)) {
    const a = Armies.get(c.armyId), identity = a?.getCommanderId?.(), ids = a?.getUnitIds?.();
    if (a?.owner !== playerId || !Number.isInteger(a.localId) || a.localId < 0 || identity?.owner !== playerId || identity.id !== c.id.id || identity.type !== c.id.type ||
        !Array.isArray(ids) || ids.some(id => id.owner !== playerId || id.id === c.id.id ||
          owned.filter(u => u.id.id === id.id && u.id.type === id.type).length !== 1)) throw Error("Owned packed membership is unverified");
    const members = ids.map(id => id.id).sort((a, b) => a - b);
    for (const id of members) {if (seen.has(id)) throw Error("Packed membership is ambiguous"); seen.add(id);}
    armies.push({commanderId: c.id.id, commanderType: c.type, componentType: c.id.type, armyId: a.localId, packedUnitIds: members});
  }
  armies.sort((a, b) => a.commanderId - b.commanderId);
  if (new Set(armies.map(a => a.commanderId)).size !== armies.length) throw Error("Commander identity is ambiguous");
  const unit = units[0], selected = armies.find(a => a.commanderId === commanderId);
  if (!selected) throw Error("Selected army disappeared");
  const retained=queryArguments.retained_aircraft;
  if(retained!==undefined&&(!Array.isArray(retained)||retained.length>16))throw Error("Invalid captured retained aircraft");
  const retainedAircraftPreserved=retained?.every(p=>{
    const u=owned.find(u=>u.id.id===p.unitId),c=commanders[0];return u?.id.type===p.componentType&&u.type===p.unitType&&u.isOnMap===false&&u.isDead!==true&&u.operationQueueSize===0&&
      selected.packedUnitIds.includes(p.unitId)&&u.armyId?.owner===playerId&&u.armyId.id===c.armyId?.id&&u.armyId.type===c.armyId.type&&u.Health?.damage===p.damage&&u.Combat?.attacksRemaining===p.attacks&&u.Movement?.movementMovesRemaining===p.moves;
  });
  return {turn: Game.turn, age: Game.age, playerId, unitId, unitType, componentType, commanderId, commanderType, commanderComponentType,
    commanderLocation:{x:commanders[0].location?.x,y:commanders[0].location?.y},unitDamage:unit.Health?.damage??null,commanderDamage:commanders[0].Health?.damage??null,
    unitQueueSize:unit.operationQueueSize,commanderQueueSize:commanders[0].operationQueueSize,
    ...(retained!==undefined?{retainedAircraftPreserved}:{}),
    packed: selected.packedUnitIds.includes(unitId), armies,
    location: !seen.has(unitId) && unit.isOnMap === true && Number.isInteger(unit.location?.x) && unit.location.x >= 0 &&
      Number.isInteger(unit.location?.y) && unit.location.y >= 0 ? {x: unit.location.x, y: unit.location.y} : null};
})()
