(() => {
  const {mode, unit_id: unitId, commander_id: commanderId, x, y, expected_turn: expectedTurn, domain = "DOMAIN_LAND"} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (!["DOMAIN_LAND", "DOMAIN_SEA"].includes(domain) || !["join", "leave"].includes(mode) || ![unitId, commanderId, expectedTurn].every(v => Number.isInteger(v) && v >= 0) ||
      unitId === commanderId || (mode === "leave" && ![x, y].every(v => Number.isInteger(v) && v >= 0))) return reject("Distinct owned unit/commander IDs, supported membership action/tile and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn) return reject("A fresh active local turn is required");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), units = owned.filter(u => u.id.id === unitId), commanders = owned.filter(u => u.id.id === commanderId);
  if (units.length !== 1 || commanders.length !== 1) return reject("Unique owned unit and commander identities are required");
  const unit = units[0], commander = commanders[0], def = GameInfo.Units.lookup(unit.type);
  if (unit.isCommanderUnit || unit.isDead === true || def?.Packable !== true || def.Domain !== domain || commander.isCommanderUnit !== true ||
      commander.isOnMap !== true || commander.isDead === true || GameInfo.Units.lookup(commander.type)?.Domain !== domain ||
      (domain === "DOMAIN_SEA" && (commander.isFleetCommander !== true || def.FormationClass !== "FORMATION_CLASS_NAVAL"))) return reject("A packable same-domain unit and deployed commander are required; fleet actions require a naval combat unit and Fleet Commander");
  function armies() {
    if (typeof Armies === "undefined" || typeof Armies.get !== "function") return null;
    const seen = new Set(), records = [];
    for (const c of owned.filter(u => u.isCommanderUnit)) {
      const a = Armies.get(c.armyId), identity = a?.getCommanderId?.(), ids = a?.getUnitIds?.();
      if (a?.owner !== playerId || !Number.isInteger(a.localId) || a.localId < 0 || identity?.owner !== playerId || identity.id !== c.id.id || identity.type !== c.id.type ||
          !Array.isArray(ids) || ids.some(id => id.owner !== playerId || id.id === c.id.id ||
            owned.filter(u => u.id.id === id.id && u.id.type === id.type).length !== 1)) return null;
      const members = ids.map(id => id.id).sort((a, b) => a - b);
      for (const id of members) {if (seen.has(id)) return null; seen.add(id);}
      records.push({commanderId: c.id.id, commanderType: c.type, componentType: c.id.type, armyId: a.localId, packedUnitIds: members});
    }
    records.sort((a, b) => a.commanderId - b.commanderId);
    return new Set(records.map(a => a.commanderId)).size === records.length ? records : null;
  }
  const baseline = armies(), selected = baseline?.find(a => a.commanderId === commanderId), containing = baseline?.filter(a => a.packedUnitIds.includes(unitId));
  if (!selected || !containing || containing.length > 1) return reject("Owned army identity and complete packed membership must be known");
  const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
    commanderId, commanderType: commander.type, commanderComponentType: commander.id.type, armies: baseline,
    unitLocation: {x: unit.location?.x, y: unit.location?.y}, commanderLocation: {x: commander.location?.x, y: commander.location?.y}};
  if (containing.length && containing[0].commanderId !== commanderId) return reject("Unit is in a different commander; no implicit transfer");
  if (mode === "join" && containing.length) return {status: "already_active", before};
  if (mode === "leave" && !containing.length) return unit.isOnMap === true ? {status: "already_inactive", before} : reject("Unpacked deployment is unverified");
  if (unit.operationQueueSize !== 0 || commander.operationQueueSize !== 0 ||
      typeof player.Armies?.getUnitReinforcementCommanderId !== "function" || player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) return reject("Queued orders or active/unknown reinforcement assignment prevent membership changes");
  const valid = l => l && [l.x, l.y].every(v => Number.isInteger(v) && v >= 0) && l.x < GameplayMap.getGridWidth() && l.y < GameplayMap.getGridHeight();
  const destination = mode === "join" ? before.commanderLocation : {x, y};
  const visible = l => valid(l) && GameplayMap.getRevealedState(playerId, l.x, l.y) === RevealedStates.VISIBLE;
  const water = l => valid(l) && typeof GameplayMap.isWater === "function" && GameplayMap.isWater(l.x, l.y) === true;
  if (!visible(before.commanderLocation) || !visible(destination) || ![-1, playerId].includes(GameplayMap.getOwner(destination.x, destination.y))) return reject("Commander and destination must be currently visible on an own/unowned destination");
  if (domain === "DOMAIN_SEA" && (!water(before.commanderLocation) || !water(destination) || (mode === "join" && !water(before.unitLocation)))) return reject("Fleet commander, joining ship and deployment destination must be on water");
  if (mode === "join") {
    if (unit.isOnMap !== true || !visible(before.unitLocation) || GameplayMap.getPlotDistance(before.unitLocation.x, before.unitLocation.y, destination.x, destination.y) > 1 ||
        owned.filter(c => c.isCommanderUnit && c.isOnMap === true && c.location?.x === destination.x && c.location?.y === destination.y).length !== 1) return reject("Joining requires a deployed nearby unit and one unambiguous commander on the destination");
  } else if (GameplayMap.getPlotDistance(before.commanderLocation.x, before.commanderLocation.y, x, y) !== 1 ||
      !Array.isArray(MapUnits.getUnits(x, y)) || MapUnits.getUnits(x, y).length !== 0) return reject("Leaving requires an adjacent empty deployment plot");
  const command = mode === "join" ? "UNITCOMMAND_ADD_TO_ARMY" : "UNITCOMMAND_REMOVE_FROM_ARMY", args = {X: destination.x, Y: destination.y};
  const picker = Game.UnitCommands.canStart(unit.id, command, {}, false);
  if (picker?.Success !== true || !Array.isArray(picker.Plots) || !picker.Plots.includes(GameplayMap.getIndexFromLocation(destination))) return reject("Destination is not offered by the native membership picker", picker?.FailureReasons ?? []);
  const check = Game.UnitCommands.canStart(unit.id, command, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native membership command failed or needs unsupported confirmation", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      unit.id.owner !== playerId || unit.id.type !== before.componentType || unit.type !== before.unitType || unit.operationQueueSize !== 0 ||
      commander.id.owner !== playerId || commander.id.type !== before.commanderComponentType || commander.type !== before.commanderType || commander.operationQueueSize !== 0 ||
      commander.location.x !== before.commanderLocation.x || commander.location.y !== before.commanderLocation.y ||
      JSON.stringify(armies()) !== JSON.stringify(baseline) || !visible(destination) || ![-1, playerId].includes(GameplayMap.getOwner(destination.x, destination.y)) ||
      (domain === "DOMAIN_SEA" && (!water(before.commanderLocation) || !water(destination) || (mode === "join" && !water(before.unitLocation)))) ||
      player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1 ||
      (mode === "join" ? unit.isOnMap !== true || unit.location.x !== before.unitLocation.x || unit.location.y !== before.unitLocation.y : MapUnits.getUnits(x, y)?.length !== 0)) return reject("Unit, commander, membership, destination or game context changed during validation");
  const expectedArmies = baseline.map(a => ({...a, packedUnitIds: a.commanderId !== commanderId ? a.packedUnitIds :
    mode === "join" ? [...a.packedUnitIds, unitId].sort((a, b) => a - b) : a.packedUnitIds.filter(id => id !== unitId)}));
  const verificationArguments = {unit_id: unitId, commander_id: commanderId, component_type: before.componentType, unit_type: before.unitType,
    commander_component_type: before.commanderComponentType, commander_type: before.commanderType};
  Game.UnitCommands.sendRequest(unit.id, command, args);
  return {status: "submitted", before, expected: {unitId, unitType: before.unitType, componentType: before.componentType,
    commanderId, commanderType: before.commanderType, commanderComponentType: before.commanderComponentType, packed: mode === "join", armies: expectedArmies,
    ...(mode === "leave" ? {location: destination} : {})}, verificationArguments};
})()
