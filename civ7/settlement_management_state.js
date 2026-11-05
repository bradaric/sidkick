(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  const {mode, city_id: cityId, x, y} = queryArguments;
  if (!["focus", "upgrade", "specialist"].includes(mode) || !Number.isInteger(cityId) || cityId < 0) throw Error("Invalid submitted settlement identity");
  const cities = player.Cities.getCities().filter(c => c.id.owner === playerId && c.id.id === cityId);
  if (cities.length !== 1) throw Error("No unique owned settlement matches the submitted ID");
  const city = cities[0];
  const focus = city.isTown !== true ? null : city.Growth.growthType === GrowthTypes.EXPAND ? "GROWTH"
    : GameInfo.Projects.lookup(city.Growth.projectType)?.ProjectType ?? null;
  const state = {turn: Game.turn, age: Game.age, playerId, cityId, isTown: city.isTown, focus,
    gold: player.Treasury?.goldBalance ?? null, pendingPopulation: city.pendingPopulation};
  if (mode !== "specialist") return state;
  if ([x, y].some(v => !Number.isInteger(v) || v < 0) || x >= GameplayMap.getGridWidth() || y >= GameplayMap.getGridHeight() ||
      GameplayMap.getRevealedState(playerId, x, y) === RevealedStates.HIDDEN) throw Error("Invalid specialist tile");
  const plot = GameplayMap.getIndexFromLocation({x, y});
  const placements = (city.Workers.GetAllPlacementInfo() ?? []).filter(p => p.PlotIndex === plot);
  if (placements.length !== 1 || !Number.isInteger(placements[0].NumWorkers)) throw Error("Specialist count is unavailable");
  return {...state, location: {x, y}, workerCount: placements[0].NumWorkers};
})()
