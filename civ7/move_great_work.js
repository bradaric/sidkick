(() => {
  const {great_work_index: index, destination_city_id: destinationId,
    destination_building: destinationType, expected_turn: expectedTurn} = queryArguments;
  const reject = reason => ({status: "rejected", greatWorkIndex: index, reason});
  if (!Number.isInteger(index) || index < 0 || !Number.isInteger(destinationId) || destinationId < 0 ||
      typeof destinationType !== "string" || !destinationType.trim() || !Number.isInteger(expectedTurn) || expectedTurn < 0) {
    return reject("An owned work instance, owned city ID, exact building type and expected turn are required");
  }
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const sources = [], buildings = [], inventory = [];
  const archiveCount = player.Culture.getNumWorksInArchive();
  if (!Number.isInteger(archiveCount) || archiveCount < 0) return reject("Archive inventory is unavailable");
  for (let slot = 0; slot < archiveCount; slot++) {
    const work = player.Culture.getArchivedGreatWork(slot);
    if (!Number.isInteger(work) || work < 0) return reject("Archive work identity is unavailable");
    inventory.push({index:work,location:{archived:true,cityId:null,buildingType:null}});
    if (work === index) sources.push({
      location: {archived: true, cityId: null, buildingType: null}, damaged: false});
  }
  let inventoryError = false;
  for (const city of player.Cities.getCities().filter(city => city.id.owner === playerId)) {
    const entries = city.Constructibles.getGreatWorkBuildings();
    if (!Array.isArray(entries)) { inventoryError = true; continue; }
    for (const entry of entries) {
      if (entry.constructibleID?.owner !== playerId) continue;
      const instance = Constructibles.getByComponentID(entry.constructibleID);
      if (!instance || (instance.owner != null && instance.owner !== playerId)) continue;
      const definition = GameInfo.Constructibles.lookup(instance.type);
      if (!definition || !Array.isArray(entry.slots) ||
          entry.slots.some(slot => !Number.isInteger(slot.greatWorkIndex))) { inventoryError = true; continue; }
      const indices = entry.slots.map(slot => slot.greatWorkIndex).filter(value => value >= 0);
      const location = {archived: false, cityId: city.id.id, buildingType: definition.ConstructibleType};
      for (const work of indices) inventory.push({index:work,location});
      for (const work of indices) if (work === index) sources.push({location, damaged: instance.damaged});
      buildings.push({location, nativeType: instance.type, damaged: instance.damaged,
        capacity: city.Constructibles.getNumGreatWorkSlots(entry.constructibleID), used: indices.length});
    }
  }
  if (inventoryError) return reject("Owned Great Work slot inventory is incomplete");
  inventory.sort((a,b)=>a.index-b.index);
  if (new Set(inventory.map(r=>r.index)).size !== inventory.length) return reject("Owned work ledger identity is ambiguous");
  if (sources.length !== 1) return reject("No unique owned Great Work matches this instance index");
  const targets = buildings.filter(building => building.location.cityId === destinationId &&
    building.location.buildingType === destinationType);
  if (targets.length !== 1) return reject("No unique owned destination building matches");
  const source = sources[0], target = targets[0];
  const before = {turn: Game.turn, age: Game.age, playerId, greatWorkIndex: index, location: source.location};
  if (!source.location.archived && source.location.cityId === destinationId && source.location.buildingType === destinationType) {
    return {status: "already_active", greatWorkIndex: index, before};
  }
  if (source.damaged !== false || target.damaged !== false) return reject("Source or destination damage is present or unverified");
  if (!Number.isInteger(target.capacity) || target.capacity <= target.used) return reject("No known empty destination slot");
  if (!Number.isInteger(target.nativeType)) return reject("Destination building type is unavailable");
  const args = {Player1: playerId, GreatWorkIndex: index, DestinationCity: destinationId, DestinationBuilding: target.nativeType};
  if (!source.location.archived) args.SourceCity = source.location.cityId;
  const operation = PlayerOperationTypes.MOVE_GREAT_WORK;
  const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return {status: "rejected", greatWorkIndex: index,
    reason: "Native Great Work move check failed", failureReasons: check?.FailureReasons ?? []};
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Game context changed during validation");
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", greatWorkIndex: index, before,
    expected: {greatWorkIndex: index, location: target.location, inventoryPreserved:true},
    verificationArguments:{great_work_index:index,expected_inventory:inventory.map(r=>({index:r.index,location:r.index===index?target.location:r.location}))}};
})()
