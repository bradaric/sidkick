(() => {
  const {resource_instance: instance, off_map: offMap, settlement, expected_turn: expectedTurn, mode = "assign"} = queryArguments;
  const reject = reason => ({status: "rejected", reason});
  if (!["assign", "unassign"].includes(mode) || !Number.isInteger(instance) || instance < 0 || typeof offMap !== "boolean" ||
      typeof settlement !== "string" || !settlement.trim() || !Number.isInteger(expectedTurn) || expectedTurn < 0) {
    return reject("A resource identity, exact owned settlement name and expected turn are required");
  }
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const matchesResource = value => value.value === instance && Boolean(value.isOffMap) === offMap;
  if (player.Resources.getResources().filter(matchesResource).length !== 1) return reject("No unique owned resource matches this identity");
  const cities = player.Cities.getCities().filter(city => city.id.owner === playerId);
  const targets = cities.filter(city => Locale.compose(city.name).toLowerCase() === settlement.toLowerCase());
  if (targets.length !== 1) return reject("No unique owned settlement matches this name");
  const target = targets[0];
  const assigned = cities.filter(city => city.Resources.getAssignedResources().some(matchesResource));
  if (assigned.length > 1) return reject("Resource assignment is ambiguous");
  const before = {turn: Game.turn, age: Game.age, playerId, resource: {instance, offMap},
    assignedCityId: assigned[0]?.id.id ?? null};
  if (mode === "unassign") {
    if (before.assignedCityId === null) return {status: "already_inactive", before};
    if (before.assignedCityId !== target.id.id) return reject("Resource is not assigned to the exact requested source settlement");
  } else if (before.assignedCityId === target.id.id) return {status: "already_active", before};
  if (player.Resources.isResourceAssignmentLocked() !== false) return reject("Resource assignment is currently locked");
  const capacity = target.Resources.getAssignedResourcesCap();
  const used = target.Resources.getAssignedResources().length;
  if (mode === "assign" && (!Number.isInteger(capacity) || used >= capacity)) return reject("No known empty destination resource slot");
  const resourceDef=GameInfo.Resources.lookup(player.Resources.getResources().find(matchesResource)?.uniqueResource?.resource);
  const factorySafe=()=>{
    if(mode!=="assign"||resourceDef?.ResourceClassType!=="RESOURCECLASS_FACTORY")return true;
    const count=target.Resources.getNumFactoryResources();
    return Number.isInteger(count)&&count>=0&&(count===0||GameInfo.Resources.lookup(target.Resources.getFactoryResource())?.$hash===resourceDef.$hash);
  };
  if(!factorySafe())return reject("Factory specialization is unknown/different; explicitly clear its factory resources first, never silently replace them");
  // Match the commerce UI, including the off-map identity flag and native ID.
  if (mode === "unassign" && (typeof PlayerOperationParameters === "undefined" || !Number.isInteger(PlayerOperationParameters.Deactivate))) return reject("Native deactivation parameter is unavailable");
  const args = {Location: GameplayMap.getLocationFromIndex(instance), City: target.id.id,
    ID: offMap ? instance : -1, ...(mode === "assign" ? {Flags: offMap} : {Action: PlayerOperationParameters.Deactivate})};
  const operation = PlayerOperationTypes.ASSIGN_RESOURCE;
  const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return {status: "rejected", reason: "Native resource command failed or needs confirmation", failureReasons: check?.FailureReasons ?? []};
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      player.Resources.isResourceAssignmentLocked() !== false || !factorySafe() ||
      (mode === "unassign" && (player.Resources.getResources().filter(matchesResource).length !== 1 ||
        cities.filter(c => c.Resources.getAssignedResources().some(matchesResource)).length !== 1 ||
        !target.Resources.getAssignedResources().some(matchesResource)))) return reject("Game context or exact resource source changed during validation");
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", before, expected: {resource: {instance, offMap}, assignedCityId: mode === "unassign" ? null : target.id.id}};
})()
