(() => {
  const {resource_instance: instance, off_map: offMap, settlement, expected_turn: expectedTurn} = queryArguments;
  const reject = reason => ({status: "rejected", reason});
  if (!Number.isInteger(instance) || instance < 0 || typeof offMap !== "boolean" ||
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
  if (before.assignedCityId === target.id.id) return {status: "already_active", before};
  if (player.Resources.isResourceAssignmentLocked() !== false) return reject("Resource assignment is currently locked");
  const capacity = target.Resources.getAssignedResourcesCap();
  const used = target.Resources.getAssignedResources().length;
  if (!Number.isInteger(capacity) || used >= capacity) return reject("No known empty destination resource slot");
  // Match the commerce UI, including the off-map identity flag and native ID.
  const args = {Location: GameplayMap.getLocationFromIndex(instance), City: target.id.id,
    Flags: offMap, ID: offMap ? instance : -1};
  const operation = PlayerOperationTypes.ASSIGN_RESOURCE;
  const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
  if (check?.Success !== true) return {status: "rejected", reason: "Native resource assignment check failed", failureReasons: check?.FailureReasons ?? []};
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      player.Resources.isResourceAssignmentLocked() !== false) return reject("Game context changed during validation");
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", before, expected: {resource: {instance, offMap}, assignedCityId: target.id.id}};
})()
