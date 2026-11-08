(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  const {mode, city_id: cityId, item, x, y, baseline_queue: baselineQueue, baseline_asset_ids: baselineIds} = queryArguments;
  if (!["append", "purchase"].includes(mode) || !Number.isInteger(cityId) || cityId < 0) throw Error("Invalid construction readback identity");
  const cities = player.Cities.getCities().filter(city => city.id.owner === playerId && city.id.id === cityId);
  if (cities.length !== 1) throw Error("No unique owned settlement matches the submitted city ID");
  const city = cities[0];
  const unit = GameInfo.Units.lookup(item), building = GameInfo.Constructibles.lookup(item), project = GameInfo.Projects.lookup(item);
  const advanced = ["wonder", "repair", "overbuild", "improvement"].includes(queryArguments.construction_intent);
  const def = unit?.UnitType === item ? unit : building?.ConstructibleType === item && (building.ConstructibleClass === "BUILDING" || advanced && ["WONDER", "IMPROVEMENT"].includes(building.ConstructibleClass))
    ? building : mode === "append" && project?.ProjectType === item ? project : null;
  if (!def || !Number.isInteger(def.$hash)) throw Error("Unknown construction item");
  const isBuilding = def === building, isUnit = def === unit;
  const queue = city.BuildQueue.getQueue();
  if (!Array.isArray(queue)) throw Error("Production queue is unavailable");
  const state = {turn: Game.turn, age: Game.age, playerId, cityId, item, queue,
    gold: player.Treasury?.goldBalance ?? null};
  if (!Array.isArray(baselineQueue)) throw Error("Captured production queue is required");
  if (mode === "append") {
    const last = queue[baselineQueue.length];
    const samePrefix = queue.length === baselineQueue.length + 1 &&
      JSON.stringify(queue.slice(0, baselineQueue.length)) === JSON.stringify(baselineQueue);
    return {...state, queueAppendObserved: samePrefix && last?.type === def.$hash &&
      (!isBuilding || (last.location?.x === x && last.location?.y === y))};
  }
  const validId = id => id?.owner === playerId && Number.isInteger(id.id) && id.id >= 0 && Number.isInteger(id.type);
  if (!Array.isArray(baselineIds) || baselineIds.some(id => !validId(id))) throw Error("Captured owned asset identities are required");
  if (!isUnit && (!isBuilding || !Number.isInteger(x) || x < 0 || !Number.isInteger(y) || y < 0)) throw Error("Exact purchased building tile is required");
  const key = id => `${id.owner}:${id.id}:${id.type}`;
  const old = new Set(baselineIds.map(key));
  const assets = isUnit ? player.Units.getUnits() : (city.Constructibles.getIds() ?? []).map(id => Constructibles.getByComponentID(id)).filter(Boolean);
  const matching = assets.filter(value => value.id?.owner === playerId && value.type === def.$hash);
  if (matching.some(value => !validId(value.id)) || new Set(matching.map(value => key(value.id))).size !== matching.length) throw Error("Asset identity is unverified");
  const fresh = matching.filter(value => !old.has(key(value.id)));
  const newAssets = fresh.map(value => ({id: value.id,
    location: value.location && Number.isInteger(value.location.x) && value.location.x >= 0 &&
      Number.isInteger(value.location.y) && value.location.y >= 0 && value.isOnMap !== false
      ? {x: value.location.x, y: value.location.y} : null,
    damaged: isBuilding ? Boolean(value.damaged) : null}));
  const purchaseObserved = JSON.stringify(queue) === JSON.stringify(baselineQueue) && newAssets.length === 1 && (isUnit ||
    (newAssets[0].location?.x === x && newAssets[0].location?.y === y && fresh[0].damaged === false));
  return {...state, purchaseObserved, newAssets};
})()
