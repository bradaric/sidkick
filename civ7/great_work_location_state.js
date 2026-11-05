(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  const index = queryArguments.great_work_index;
  if (!Number.isInteger(index) || index < 0) throw Error("Invalid Great Work instance index");
  const locations = [];
  const count = player.Culture.getNumWorksInArchive();
  if (!Number.isInteger(count) || count < 0) throw Error("Archive inventory is unavailable");
  for (let slot = 0; slot < count; slot++) {
    if (player.Culture.getArchivedGreatWork(slot) === index) locations.push({archived: true, cityId: null, buildingType: null});
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
      }
    }
  }
  if (locations.length !== 1) throw Error("No unique owned Great Work matches");
  return {turn: Game.turn, age: Game.age, playerId, greatWorkIndex: index, location: locations[0]};
})()
