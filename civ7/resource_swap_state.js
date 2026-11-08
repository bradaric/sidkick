(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId), expected = queryArguments.expected_assignments;
  if (!Number.isInteger(playerId) || playerId < 0 || !player) throw Error("No local player");
  if (!Array.isArray(expected) || expected.some(r => !Number.isInteger(r.instance) || r.instance < 0 || typeof r.offMap !== "boolean" ||
      (r.assignedCityId !== null && (!Number.isInteger(r.assignedCityId) || r.assignedCityId < 0)))) throw Error("Invalid captured resource ledger");
  const key = r => `${r.offMap ? 1 : 0}:${r.instance}`, resources = player.Resources.getResources();
  if (!Array.isArray(resources) || resources.some(r => !Number.isInteger(r.value) || r.value < 0 || typeof r.isOffMap !== "boolean")) throw Error("Owned resources are unknown");
  const assignments = resources.map(r => ({instance: r.value, offMap: r.isOffMap, assignedCityId: null})).sort((a, b) => key(a).localeCompare(key(b)));
  if (new Set(assignments.map(key)).size !== assignments.length) throw Error("Owned resource identity is ambiguous");
  for (const city of player.Cities.getCities().filter(c => c.id.owner === playerId)) {
    const assigned = city.Resources.getAssignedResources();
    if (!Number.isInteger(city.id.id) || city.id.id < 0 || !Array.isArray(assigned)) throw Error("Owned source assignment is unknown");
    for (const r of assigned) {
      const matches = assignments.filter(a => a.instance === r.value && a.offMap === Boolean(r.isOffMap));
      if (matches.length !== 1 || matches[0].assignedCityId !== null) throw Error("Resource assignment is ambiguous");
      matches[0].assignedCityId = city.id.id;
    }
  }
  return {turn: Game.turn, age: Game.age, playerId, assignments, swapObserved: JSON.stringify(assignments) === JSON.stringify(expected)};
})()
