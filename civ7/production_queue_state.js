(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId), {city_id: cityId, component_type: componentType} = queryArguments;
  if (!Number.isInteger(playerId) || playerId < 0 || !player || ![cityId, componentType].every(v => Number.isInteger(v) && v >= 0)) throw Error("Invalid owned city identity");
  const matches = player.Cities.getCities().filter(c => c.id.owner === playerId && c.id.id === cityId && c.id.type === componentType);
  if (matches.length !== 1) throw Error("Captured owned city identity changed");
  const queue = matches[0].BuildQueue.getQueue();
  if (!Array.isArray(queue)) throw Error("Production queue is unknown");
  return {turn: Game.turn, age: Game.age, playerId, cityId, queue, queueToken: JSON.stringify(queue)};
})()
