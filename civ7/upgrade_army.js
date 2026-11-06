(() => {
  const {commander_id: commanderId, max_gold_cost: cap, expected_turn: expectedTurn} = queryArguments;
  const reject = reason => ({status: "rejected", reason});
  if (![commanderId, expectedTurn].every(v => Number.isInteger(v) && v >= 0) || !Number.isFinite(cap) || cap < 0) return reject("An exact owned commander, finite Gold cap and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId), age = Game.age;
  if (!Number.isInteger(playerId) || playerId < 0 || !player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn) return reject("A fresh active local turn is required");
  const args = {X: -9999, Y: -9999, UnitAbilityType: -1};
  function capture() {
    const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), commanders = owned.filter(u => u.id.id === commanderId);
    if (commanders.length !== 1 || typeof Armies === "undefined" || typeof Armies.get !== "function") return null;
    const commander = commanders[0], l = commander.location, domain = GameInfo.Units.lookup(commander.type)?.Domain;
    if (commander.isCommanderUnit !== true || commander.isOnMap !== true || commander.isDead === true || commander.operationQueueSize !== 0 ||
        !["DOMAIN_LAND", "DOMAIN_SEA"].includes(domain) || !l || ![l.x, l.y].every(v => Number.isInteger(v) && v >= 0) ||
        l.x >= GameplayMap.getGridWidth() || l.y >= GameplayMap.getGridHeight() || GameplayMap.getRevealedState(playerId, l.x, l.y) !== RevealedStates.VISIBLE ||
        GameplayMap.getOwner(l.x, l.y) !== playerId || !Number.isFinite(player.Treasury?.goldBalance)) return null;
    const inventory = owned.map(u => ({unitId: u.id.id, unitType: u.type, componentType: u.id.type})).sort((a, b) => a.unitId - b.unitId);
    if (inventory.some(u => ![u.unitId, u.componentType].every(v => Number.isInteger(v) && v >= 0) || !Number.isInteger(u.unitType)) ||
        new Set(inventory.map(u => u.unitId)).size !== inventory.length) return null;
    const armies = [], seen = new Set();
    for (const c of owned.filter(u => u.isCommanderUnit)) {
      const a = Armies.get(c.armyId), identity = a?.getCommanderId?.(), ids = a?.getUnitIds?.();
      if (a?.owner !== playerId || !Number.isInteger(a.localId) || a.localId < 0 || identity?.owner !== playerId || identity.id !== c.id.id || identity.type !== c.id.type ||
          !Array.isArray(ids) || ids.some(id => id.owner !== playerId || id.id === c.id.id || owned.filter(u => u.id.id === id.id && u.id.type === id.type).length !== 1)) return null;
      const members = ids.map(id => id.id).sort((a, b) => a - b);
      for (const id of members) {if (seen.has(id)) return null; seen.add(id);}
      armies.push({commanderId: c.id.id, commanderType: c.type, componentType: c.id.type, armyId: a.localId, packedUnitIds: members});
    }
    armies.sort((a, b) => a.commanderId - b.commanderId);
    const selected = armies.find(a => a.commanderId === commanderId), plan = [];
    if (!selected || !selected.packedUnitIds.length || selected.packedUnitIds.length > 16) return null;
    // Initial group scope deliberately requires every packed member to have a
    // complete direct-upgrade quote; mixed eligibility is never inferred.
    for (const id of selected.packedUnitIds) {
      const unit = owned.find(u => u.id.id === id), from = GameInfo.Units.lookup(unit.type);
      if (unit.isCommanderUnit || unit.isDead === true || unit.operationQueueSize !== 0 || from?.Domain !== domain ||
          !["FORMATION_CLASS_LAND_COMBAT", "FORMATION_CLASS_NAVAL"].includes(from.FormationClass)) return null;
      const check = Game.UnitCommands.canStart(unit.id, "UNITCOMMAND_UPGRADE", args, false), target = Number.isInteger(check?.UnitType) ? GameInfo.Units.lookup(check.UnitType) : null;
      if (check?.Success !== true || check.RequiresConfirmation === true || !target || !Number.isInteger(target.$hash) || target.Domain !== domain ||
          !GameInfo.UnitUpgrades.filter(r => r.Unit === from.UnitType && r.UpgradeUnit === target.UnitType).length ||
          !Array.isArray(check.AdditionalDescription) || check.AdditionalDescription.length !== 1) return null;
      const text = check.AdditionalDescription[0], prefix = `Upgrade to ${Locale.compose(target.Name)}: `, suffix = " [icon:YIELD_GOLD] Gold";
      if (typeof text !== "string" || !text.startsWith(prefix) || !text.endsWith(suffix)) return null;
      const amount = text.slice(prefix.length, -suffix.length), goldCost = Number(amount);
      if (!/^(0|[1-9][0-9]*)$/.test(amount) || !Number.isSafeInteger(goldCost)) return null;
      plan.push({unitId: id, unitType: unit.type, componentType: unit.id.type, targetUnitType: target.$hash, goldCost});
    }
    const group = Game.UnitCommands.canStart(commander.id, "UNITCOMMAND_UPGRADE_ARMY", args, false);
    const text = Array.isArray(group?.AdditionalDescription) && group.AdditionalDescription.length === 1 ? group.AdditionalDescription[0] : null;
    const match = typeof text === "string" ? /^Upgrade ([1-9][0-9]*) units: (0|[1-9][0-9]*) \[icon:YIELD_GOLD\] Gold$/.exec(text) : null;
    if (group?.Success !== true || group.RequiresConfirmation === true || !match || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[2])) ||
        Number(match[1]) !== plan.length || Number(match[2]) !== plan.reduce((total, p) => total + p.goldCost, 0)) return null;
    return {turn: Game.turn, age: Game.age, playerId, commanderId, commanderType: commander.type, componentType: commander.id.type,
      location: {x: l.x, y: l.y}, gold: player.Treasury.goldBalance, inventory, armies, plan, quotedGoldCost: Number(match[2])};
  }
  const before = capture();
  if (!before || before.turn !== expectedTurn || before.age !== age || before.quotedGoldCost > cap || before.gold < before.quotedGoldCost) return reject("Complete direct member quotes/native aggregate eligibility must agree within Gold cap and balance; unsupported English quote formats or mixed eligibility are rejected");
  const fresh = capture();
  if (!fresh || JSON.stringify(fresh) !== JSON.stringify(before) || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Commander, quotes, complete owned inventory, membership, balance or game context changed during validation");
  const commander = player.Units.getUnits().find(u => u.id.owner === playerId && u.id.id === commanderId && u.id.type === before.componentType);
  Game.UnitCommands.sendRequest(commander.id, "UNITCOMMAND_UPGRADE_ARMY", args);
  return {status: "submitted", before, quotedGoldCost: before.quotedGoldCost, quoteSource: "exact-native-English-group-and-member-descriptions",
    expected: {commanderId, upgradeObserved: true}, verificationArguments: {baseline: before},
    verificationScope: "All captured packed members become their directly quoted types in this same army with exact Gold spend, all unaffected owned unit identities/types and other army memberships preserved; duplicate-type replacement members are verified as a multiset, not individually paired"};
})()
