(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId), b = queryArguments.baseline;
  if (!Number.isInteger(playerId) || playerId < 0 || !player) throw Error("No local player");
  if (!b || !Number.isInteger(b.commanderId) || !Array.isArray(b.inventory) || !Array.isArray(b.armies) || !Array.isArray(b.plan) ||
      !b.plan.length || b.plan.length > 16 || !Number.isFinite(b.gold) || !Number.isSafeInteger(b.quotedGoldCost) || b.quotedGoldCost < 0 ||
      b.plan.some(p => ![p.unitId, p.componentType].every(v => Number.isInteger(v) && v >= 0) || !Number.isInteger(p.targetUnitType))) throw Error("Invalid captured group upgrade baseline");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId);
  const inventory = owned.map(u => ({unitId: u.id.id, unitType: u.type, componentType: u.id.type})).sort((a, b) => a.unitId - b.unitId);
  if (new Set(inventory.map(u => u.unitId)).size !== inventory.length) throw Error("Owned unit identity is ambiguous");
  const armies = [], seen = new Set();
  for (const c of owned.filter(u => u.isCommanderUnit)) {
    const a = Armies.get(c.armyId), identity = a?.getCommanderId?.(), ids = a?.getUnitIds?.();
    if (a?.owner !== playerId || !Number.isInteger(a.localId) || a.localId < 0 || identity?.owner !== playerId || identity.id !== c.id.id || identity.type !== c.id.type ||
        !Array.isArray(ids) || ids.some(id => id.owner !== playerId || id.id === c.id.id || owned.filter(u => u.id.id === id.id && u.id.type === id.type).length !== 1)) throw Error("Owned army membership is unverified");
    const members = ids.map(id => id.id).sort((a, b) => a - b);
    for (const id of members) {if (seen.has(id)) throw Error("Packed membership is ambiguous"); seen.add(id);}
    armies.push({commanderId: c.id.id, commanderType: c.type, componentType: c.id.type, armyId: a.localId, packedUnitIds: members});
  }
  armies.sort((a, b) => a.commanderId - b.commanderId);
  const commander = owned.find(u => u.id.id === b.commanderId), selected = armies.find(a => a.commanderId === b.commanderId);
  const original = b.armies.find(a => a.commanderId === b.commanderId), plannedIds = new Set(b.plan.map(p => p.unitId));
  const upgradedMemberIds = selected?.packedUnitIds ?? [], currentMembers = inventory.filter(u => upgradedMemberIds.includes(u.unitId));
  const types = items => items.map(u => `${u.componentType}:${u.unitType}`).sort();
  const sameGroupIdentity = selected && original && ['commanderId', 'commanderType', 'componentType', 'armyId'].every(k => selected[k] === original[k]);
  const unchangedOutside = b.inventory.filter(u => !plannedIds.has(u.unitId));
  const currentOutside = inventory.filter(u => !upgradedMemberIds.includes(u.unitId));
  const preserved = JSON.stringify(currentOutside) === JSON.stringify(unchangedOutside) &&
    JSON.stringify(armies.filter(a => a.commanderId !== b.commanderId)) === JSON.stringify(b.armies.filter(a => a.commanderId !== b.commanderId));
  const validNewIds = currentMembers.every(u => plannedIds.has(u.unitId) || !b.inventory.some(v => v.unitId === u.unitId));
  const retained = b.plan.every(p => {
    const u = inventory.find(u => u.unitId === p.unitId);
    return !u || (upgradedMemberIds.includes(u.unitId) && u.componentType === p.componentType && u.unitType === p.targetUnitType);
  });
  const gold = player.Treasury?.goldBalance;
  const upgradeObserved = Boolean(sameGroupIdentity && commander?.isOnMap === true && commander.operationQueueSize === 0 &&
    commander.location?.x === b.location?.x && commander.location?.y === b.location?.y && commander.type === b.commanderType && commander.id.type === b.componentType &&
    preserved && validNewIds && retained && inventory.length === b.inventory.length && currentMembers.length === b.plan.length &&
    JSON.stringify(types(currentMembers)) === JSON.stringify(types(b.plan.map(p => ({componentType: p.componentType, unitType: p.targetUnitType})))) &&
    Number.isFinite(gold) && b.gold - gold === b.quotedGoldCost);
  return {turn: Game.turn, age: Game.age, playerId, commanderId: b.commanderId, upgradeObserved, gold,
    upgradedMemberIds, memberTypes: currentMembers, unaffectedInventoryPreserved: preserved};
})()
