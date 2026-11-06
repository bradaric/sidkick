(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  const index = queryArguments.great_work_index;
  if (!Number.isInteger(index) || index < 0) throw Error("Invalid Great Work instance index");
  const locations = [], inventory = [], expectedInventory = queryArguments.expected_inventory;
  if (expectedInventory !== undefined && !Array.isArray(expectedInventory)) throw Error("Invalid captured work ledger");
  const count = player.Culture.getNumWorksInArchive();
  if (!Number.isInteger(count) || count < 0) throw Error("Archive inventory is unavailable");
  for (let slot = 0; slot < count; slot++) {
    const work = player.Culture.getArchivedGreatWork(slot), location = {archived: true, cityId: null, buildingType: null};
    if (expectedInventory !== undefined) inventory.push({index:work,location});
    if (work === index) locations.push(location);
  }
  for (const city of player.Cities.getCities().filter(city => city.id.owner === playerId)) {
    const entries = city.Constructibles.getGreatWorkBuildings();
    if (!Array.isArray(entries)) throw Error("Owned slot inventory is unavailable");
    for (const entry of entries) {
      if (entry.constructibleID?.owner !== playerId) continue;
      const instance = Constructibles.getByComponentID(entry.constructibleID);
      if (!instance || (instance.owner != null && instance.owner !== playerId)) continue;
      if (!Array.isArray(entry.slots)) throw Error("Owned slot inventory is unavailable");
      for (const slot of entry.slots) {
        if (!Number.isInteger(slot.greatWorkIndex)) throw Error("Owned slot inventory is unavailable");
        if (slot.greatWorkIndex === index) {
          const definition = GameInfo.Constructibles.lookup(instance.type);
          if (!definition) throw Error("Building identity is unavailable");
          locations.push({archived: false, cityId: city.id.id, buildingType: definition.ConstructibleType});
        }
        if (expectedInventory !== undefined && slot.greatWorkIndex >= 0) {
          const definition = GameInfo.Constructibles.lookup(instance.type);
          if (!definition) throw Error("Owned ledger building identity is unavailable");
          inventory.push({index:slot.greatWorkIndex,location:{archived:false,cityId:city.id.id,buildingType:definition.ConstructibleType}});
        }
      }
    }
  }
  if (locations.length !== 1) throw Error("No unique owned Great Work matches");
  inventory.sort((a,b)=>a.index-b.index);
  return {turn: Game.turn, age: Game.age, playerId, greatWorkIndex: index, location: locations[0],
    ...(expectedInventory !== undefined ? {inventoryPreserved:new Set(inventory.map(r=>r.index)).size===inventory.length&&JSON.stringify(inventory)===JSON.stringify(expectedInventory)} : {})};
})()
