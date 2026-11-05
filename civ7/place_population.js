(() => {
  const {settlement, x, y, improvement, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (typeof settlement !== "string" || !settlement.trim() || typeof improvement !== "string" || !improvement ||
      [x, y, expectedTurn].some(value => !Number.isInteger(value) || value < 0)) return reject("Exact settlement, tile, improvement and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  if (x >= GameplayMap.getGridWidth() || y >= GameplayMap.getGridHeight() ||
      GameplayMap.getRevealedState(playerId, x, y) === RevealedStates.HIDDEN) return reject("An exact revealed tile is required");
  const matches = player.Cities.getCities().filter(city => city.id.owner === playerId &&
    Locale.compose(city.name).toLowerCase() === settlement.toLowerCase());
  if (matches.length !== 1) return reject("No unique owned settlement matches this name");
  const city = matches[0];
  if (city.Growth.isReadyToPlacePopulation !== true || !Number.isInteger(city.pendingPopulation) || city.pendingPopulation < 1) return reject("No pending population is ready to place");
  const owner = GameplayMap.getOwner(x, y);
  if (owner !== -1 && owner !== playerId) return reject("Foreign tiles are not supported");
  const occupied = MapConstructibles.getConstructibles(x, y);
  if (!Array.isArray(occupied) || occupied.length) return reject("An empty improvement tile is required; no overbuilding or specialists");
  const general = Game.CityCommands.canStart(city.id, CityCommandTypes.EXPAND, {}, false);
  if (general?.Success !== true || !Array.isArray(general.Plots)) return reject("Native growth expansion is unavailable", general?.FailureReasons ?? []);
  const plot = GameplayMap.getIndexFromLocation({x, y});
  const indices = general.Plots.flatMap((value, index) => value === plot ? [index] : []);
  if (indices.length !== 1) return reject("No unique legal growth choice matches this tile");
  const def = GameInfo.Constructibles.lookup(general.ConstructibleTypes?.[indices[0]]);
  if (def?.ConstructibleClass !== "IMPROVEMENT" || def.ConstructibleType !== improvement || !Number.isInteger(def.$hash)) return reject("The offered improvement does not match the approved choice");
  const ids = city.Constructibles.getIds();
  const validId = id => id?.owner === playerId && Number.isInteger(id.id) && id.id >= 0 && Number.isInteger(id.type);
  if (!Array.isArray(ids) || ids.some(id => !validId(id))) return reject("Owned constructible identities are unavailable");
  const before = {turn: Game.turn, age: Game.age, playerId, cityId: city.id.id,
    population: city.population, pendingPopulation: city.pendingPopulation,
    componentIds: ids.map(id => ({owner: id.owner, id: id.id, type: id.type}))};
  const args = {X: x, Y: y};
  const check = Game.CityCommands.canStart(city.id, CityCommandTypes.EXPAND, args, false);
  if (check?.Success !== true) return reject("Native selected growth tile check failed", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      city.id.owner !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      city.Growth.isReadyToPlacePopulation !== true || city.pendingPopulation !== before.pendingPopulation ||
      GameplayMap.getOwner(x, y) !== owner || MapConstructibles.getConstructibles(x, y)?.length !== 0) return reject("Game context or growth choice changed during validation");
  const verificationArguments = {...queryArguments, city_id: city.id.id, baseline_component_ids: before.componentIds};
  Game.CityCommands.sendRequest(city.id, CityCommandTypes.EXPAND, args);
  return {status: "submitted", before, expected: {cityId: city.id.id, improvement, location: {x, y},
    pendingPopulation: before.pendingPopulation - 1, newImprovementObserved: true}, verificationArguments};
})()
