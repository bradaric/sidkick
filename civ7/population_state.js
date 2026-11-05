(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  const {city_id: cityId, x, y, improvement, baseline_component_ids: baseline} = queryArguments;
  if ([cityId, x, y].some(value => !Number.isInteger(value) || value < 0) || !Array.isArray(baseline)) throw Error("Captured growth identity is required");
  const matches = player.Cities.getCities().filter(city => city.id.owner === playerId && city.id.id === cityId);
  if (matches.length !== 1) throw Error("No unique owned settlement");
  const city = matches[0];
  const def = GameInfo.Constructibles.lookup(improvement);
  if (def?.ConstructibleType !== improvement || def.ConstructibleClass !== "IMPROVEMENT") throw Error("Unknown improvement identity");
  const validId = id => id?.owner === playerId && Number.isInteger(id.id) && id.id >= 0 && Number.isInteger(id.type);
  if (baseline.some(id => !validId(id))) throw Error("Captured owned constructible identities are required");
  const key = id => `${id.owner}:${id.id}:${id.type}`;
  const old = new Set(baseline.map(key));
  const fresh = city.Constructibles.getIds().map(id => Constructibles.getByComponentID(id)).filter(value =>
    value && validId(value.id) && !old.has(key(value.id)) && value.type === def.$hash &&
    value.location?.x === x && value.location?.y === y && value.damaged === false);
  return {turn: Game.turn, age: Game.age, playerId, cityId, improvement, location: {x, y},
    population: city.population, pendingPopulation: city.pendingPopulation,
    newImprovementObserved: fresh.length === 1, newImprovements: fresh.map(value => ({id: value.id, location: {x, y}}))};
})()
