(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  const {unit_id: unitId, target_player_id: targetPlayerId, target_city_id: targetCityId,
    baseline_route_count: baselineCount, baseline_player_route_count: baselinePlayerCount} = queryArguments;
  if ([unitId, targetPlayerId, targetCityId, baselineCount, baselinePlayerCount].some(value => !Number.isInteger(value) || value < 0)) throw Error("Captured trade identities and counts are required");
  if (targetPlayerId === playerId || !player.Diplomacy.hasMet(targetPlayerId)) throw Error("A met foreign target is required");
  const options = TradeRouteSearchOptions.INCLUDE_FAILED + TradeRouteSearchOptions.EXTENDED_STATUS;
  const routes = player.Trade.projectPossibleTradeRoutes(options);
  if (!Array.isArray(routes)) throw Error("Trade route inventory is unavailable");
  const matching = routes.filter(route => route.targetCityId?.owner === targetPlayerId && route.targetCityId.id === targetCityId);
  const city = matching.length === 1 ? Cities.get(matching[0].targetCityId) : null;
  let targetLocation = null;
  if (city && city.owner === targetPlayerId && city.id.owner === targetPlayerId && city.id.id === targetCityId) {
    const location = city.location;
    if (location && Number.isInteger(location.x) && Number.isInteger(location.y) && location.x >= 0 && location.y >= 0 &&
        location.x < GameplayMap.getGridWidth() && location.y < GameplayMap.getGridHeight() &&
        GameplayMap.getRevealedState(playerId, location.x, location.y) !== RevealedStates.HIDDEN) targetLocation = {x: location.x, y: location.y};
  }
  const routeCount = player.Trade.countPlayerTradeRoutes();
  const playerRouteCount = player.Trade.countPlayerTradeRoutesTo(targetPlayerId);
  const targetActive = targetLocation !== null && matching.length === 1 && matching[0].status?.includes(TradeRouteStatus.ALREADY_EXISTS) === true;
  const merchantPresent = player.Units.getUnits().some(unit => unit.id.owner === playerId && unit.id.id === unitId);
  return {turn: Game.turn, age: Game.age, playerId, targetPlayerId, targetCityId, targetLocation,
    routeCount, playerRouteCount, targetActive, merchantPresent,
    newRouteObserved: targetActive && routeCount === baselineCount + 1 && playerRouteCount === baselinePlayerCount + 1};
})()
