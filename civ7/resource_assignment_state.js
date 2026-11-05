(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  const {resource_instance: instance, off_map: offMap} = queryArguments;
  if (!Number.isInteger(instance) || instance < 0 || typeof offMap !== "boolean") throw Error("Invalid resource identity");
  const matches = value => value.value === instance && Boolean(value.isOffMap) === offMap;
  if (player.Resources.getResources().filter(matches).length !== 1) throw Error("No unique owned resource");
  const assigned = player.Cities.getCities().filter(city => city.id.owner === playerId)
    .filter(city => city.Resources.getAssignedResources().some(matches));
  if (assigned.length > 1) throw Error("Ambiguous resource assignment");
  return {turn: Game.turn, age: Game.age, playerId, resource: {instance, offMap}, assignedCityId: assigned[0]?.id.id ?? null};
})()
