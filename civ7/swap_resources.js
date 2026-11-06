(() => {
  const {first_resource_instance: first, first_off_map: firstOff, second_resource_instance: second, second_off_map: secondOff, expected_turn: expectedTurn} = queryArguments;
  const reject = reason => ({status: "rejected", reason});
  if (![first, second, expectedTurn].every(v => Number.isInteger(v) && v >= 0) || [firstOff, secondOff].some(v => typeof v !== "boolean") ||
      (first === second && firstOff === secondOff)) return reject("Two distinct exact resource/off-map identities and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn) return reject("A fresh active local turn is required");
  const key = r => `${r.offMap ? 1 : 0}:${r.instance}`;
  function ledger() {
    const resources = player.Resources.getResources();
    if (!Array.isArray(resources) || resources.some(r => !Number.isInteger(r.value) || r.value < 0 || typeof r.isOffMap !== "boolean")) return null;
    const assignments = resources.map(r => ({instance: r.value, offMap: r.isOffMap, assignedCityId: null})).sort((a, b) => key(a).localeCompare(key(b)));
    if (new Set(assignments.map(key)).size !== assignments.length) return null;
    for (const city of player.Cities.getCities().filter(c => c.id.owner === playerId)) {
      const assigned = city.Resources.getAssignedResources();
      if (!Number.isInteger(city.id.id) || city.id.id < 0 || !Array.isArray(assigned)) return null;
      for (const r of assigned) {
        const matches = assignments.filter(a => a.instance === r.value && a.offMap === Boolean(r.isOffMap));
        if (matches.length !== 1 || matches[0].assignedCityId !== null) return null;
        matches[0].assignedCityId = city.id.id;
      }
    }
    return assignments;
  }
  const assignments = ledger(), a = assignments?.find(r => r.instance === first && r.offMap === firstOff), b = assignments?.find(r => r.instance === second && r.offMap === secondOff);
  if (!a || !b || a.assignedCityId === null || b.assignedCityId === null) return reject("Both exact owned resources must have unique known source assignments; no implicit assignment");
  const before = {turn: Game.turn, age: Game.age, playerId, assignments};
  if (a.assignedCityId === b.assignedCityId) return {status: "already_active", before};
  if (player.Resources.isResourceAssignmentLocked() !== false) return reject("Resource assignments are locked");
  const args = {Location: GameplayMap.getLocationFromIndex(first), Location2: GameplayMap.getLocationFromIndex(second), ID1: firstOff ? first : -1, ID2: secondOff ? second : -1};
  const operation = PlayerOperationTypes.SWAP_RESOURCES;
  if (operation == null) return reject("Native resource swap operation is unavailable");
  const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return {status: "rejected", reason: "Native resource swap failed or requires confirmation", failureReasons: check?.FailureReasons ?? []};
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      player.Resources.isResourceAssignmentLocked() !== false || JSON.stringify(ledger()) !== JSON.stringify(assignments)) return reject("Resource ownership, assignment ledger or game context changed during validation");
  const expectedAssignments = assignments.map(r => ({...r, assignedCityId: key(r) === key(a) ? b.assignedCityId : key(r) === key(b) ? a.assignedCityId : r.assignedCityId}));
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", before, expected: {swapObserved: true}, verificationArguments: {expected_assignments: expectedAssignments}};
})()
