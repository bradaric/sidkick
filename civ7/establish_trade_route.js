(() => {
  const {unit_id: unitId, target_player_id: targetPlayerId, target_city_id: targetCityId, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if ([unitId, targetPlayerId, targetCityId, expectedTurn].some(value => !Number.isInteger(value) || value < 0)) return reject("Nonnegative owned Merchant, target player/city IDs and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  if (targetPlayerId === playerId || !player.Diplomacy.hasMet(targetPlayerId) || player.Diplomacy.isAtWarWith(targetPlayerId)) return reject("A met peaceful foreign target is required");
  const units = player.Units.getUnits().filter(value => value.id.owner === playerId);
  const matches = units.filter(value => value.id.id === unitId);
  if (matches.length !== 1) return reject("No unique owned Merchant matches this instance ID");
  const unit = matches[0];
  if (GameInfo.Units.lookup(unit.type)?.UnitType !== "UNIT_MERCHANT" || unit.isOnMap !== true || unit.isDead === true) return reject("A live on-map Merchant is required");
  const validLocation = location => location && Number.isInteger(location.x) && Number.isInteger(location.y) &&
    location.x >= 0 && location.y >= 0 && location.x < GameplayMap.getGridWidth() && location.y < GameplayMap.getGridHeight();
  if (!validLocation(unit.location)) return reject("Merchant location is unverified");
  const sameId = (a, b) => a.owner === b.owner && a.id === b.id && a.type === b.type;
  for (const commander of units.filter(value => value.isCommanderUnit)) {
    const army = typeof Armies !== "undefined" ? Armies.get(commander.armyId) : null;
    const packed = army?.owner === playerId && typeof army.getUnitIds === "function" ? army.getUnitIds() : null;
    if (!Array.isArray(packed) || packed.some(id => sameId(id, unit.id))) return reject("Merchant packing state is packed or unverified");
  }
  const options = TradeRouteSearchOptions.INCLUDE_FAILED + TradeRouteSearchOptions.EXTENDED_STATUS;
  const routes = player.Trade.projectPossibleTradeRoutes(options);
  if (!Array.isArray(routes)) return reject("Trade route inventory is unavailable");
  const offered = routes.filter(route => route.targetCityId?.owner === targetPlayerId && route.targetCityId.id === targetCityId);
  if (offered.length !== 1) return reject("No unique offered route matches the target player and city");
  const route = offered[0];
  const city = Cities.get(route.targetCityId);
  if (!city || city.owner !== targetPlayerId || !sameId(city.id, route.targetCityId) || !validLocation(city.location) ||
      GameplayMap.getRevealedState(playerId, city.location.x, city.location.y) === RevealedStates.HIDDEN) return reject("Target city identity or revealed location is unverified");
  const before = {turn: Game.turn, age: Game.age, playerId,
    routeCount: player.Trade.countPlayerTradeRoutes(), playerRouteCount: player.Trade.countPlayerTradeRoutesTo(targetPlayerId),
    unitId: {...unit.id}, unitType: unit.type, unitLocation: {x: unit.location.x, y: unit.location.y},
    targetCity: {...city.id}, targetLocation: {x: city.location.x, y: city.location.y}};
  if (![before.routeCount, before.playerRouteCount].every(value => Number.isInteger(value) && value >= 0)) return reject("Route counts are unverified");
  if (route.status?.includes(TradeRouteStatus.ALREADY_EXISTS)) return {status: "already_active", before};
  if (route.status?.[0] !== TradeRouteStatus.SUCCESS) return reject("The projected route is not currently available");
  const args = {X: city.location.x, Y: city.location.y};
  const check = Game.UnitCommands.canStart(unit.id, UnitCommandTypes.MAKE_TRADE_ROUTE, args, false);
  if (typeof check?.Success !== "boolean") return reject("Native direct trade-route permission is unverified");
  if (check?.RequiresConfirmation === true) return reject("Native trade-route command requires confirmation", check.FailureReasons ?? []);
  let dispatchDestination = null;
  let dispatchArgs = null;
  if (check?.Success !== true) {
    // Match the chooser's Send Merchant branch: nearest reachable city plot.
    // Use ordinary nonattack MOVE_TO, not WorldInput's attack/swap/war helper.
    if (Configuration.getGame().isAnyMultiplayer !== false) return reject("Merchant dispatch requires single player");
    const modifier = UnitOperationMoveModifiers.MOVE_IGNORE_UNEXPLORED_DESTINATION;
    if (!Number.isInteger(modifier) || !Number.isInteger(UnitOperationMoveModifiers.ATTACK) ||
        (modifier & UnitOperationMoveModifiers.ATTACK) !== 0 || !Number.isInteger(UnitOperationTypes.MOVE_TO) ||
        typeof player.Diplomacy.willMoveStartWar !== "function") return reject("Native nonattack dispatch APIs are unavailable");
    const plots = city.getPurchasedPlots();
    if (!Array.isArray(plots)) return reject("Target city plots are unavailable");
    const candidates = plots.filter(index => Number.isInteger(index) && index >= 0 &&
      index < GameplayMap.getGridWidth() * GameplayMap.getGridHeight()).map(index => GameplayMap.getLocationFromIndex(index))
      .filter(location => validLocation(location) && GameplayMap.getRevealedState(playerId, location.x, location.y) !== RevealedStates.HIDDEN)
      .sort((a, b) => GameplayMap.getPlotDistance(before.unitLocation.x, before.unitLocation.y, a.x, a.y) -
        GameplayMap.getPlotDistance(before.unitLocation.x, before.unitLocation.y, b.x, b.y));
    let failureReasons = check?.FailureReasons ?? [];
    for (const location of candidates) {
      const path = Units.getPathTo(unit.id, location);
      if (!Array.isArray(path?.plots) || path.plots.length === 0) continue;
      const moveArgs = {X: location.x, Y: location.y, Modifiers: modifier};
      if (player.Diplomacy.willMoveStartWar(unit.id, location)?.Success === true) continue;
      if (GameplayMap.getRevealedState(playerId, location.x, location.y) === RevealedStates.VISIBLE &&
          Game.Combat.testAttackInto(unit.id, moveArgs) !== CombatTypes.NO_COMBAT) continue;
      const moveCheck = Game.UnitOperations.canStart(unit.id, UnitOperationTypes.MOVE_TO, moveArgs, false);
      if (moveCheck?.Success !== true || moveCheck.RequiresConfirmation === true) {
        failureReasons = moveCheck?.FailureReasons ?? failureReasons;
        continue;
      }
      dispatchDestination = {x: location.x, y: location.y};
      dispatchArgs = moveArgs;
      break;
    }
    if (!dispatchArgs) return reject("Neither direct establishment nor a permitted nonattack Send Merchant move is available", failureReasons);
  }
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || !sameId(unit.id, before.unitId) ||
      unit.type !== before.unitType || unit.isOnMap !== true || unit.isDead === true ||
      unit.location.x !== before.unitLocation.x || unit.location.y !== before.unitLocation.y ||
      city.owner !== targetPlayerId || city.location.x !== args.X || city.location.y !== args.Y ||
      player.Trade.countPlayerTradeRoutes() !== before.routeCount ||
      player.Trade.countPlayerTradeRoutesTo(targetPlayerId) !== before.playerRouteCount) return reject("Game context or trade state changed during validation");
  const verificationArguments = {...queryArguments, baseline_route_count: before.routeCount,
    baseline_player_route_count: before.playerRouteCount};
  if (dispatchArgs) {
    Game.UnitOperations.sendRequest(unit.id, UnitOperationTypes.MOVE_TO, dispatchArgs);
    return {status: "submitted", submissionKind: "send_merchant", before, dispatchDestination,
      expected: {targetPlayerId, targetCityId, tradeActionObserved: true},
      verificationArguments: {...verificationArguments, dispatch_target: dispatchDestination,
        dispatch_from: before.unitLocation, dispatch_unit_type: before.unitType, dispatch_component_type: before.unitId.type},
      verificationScope: "One native nonattack MOVE_TO toward a revealed target-city plot. May replace/queue travel on later user-advanced turns; movement/queue evidence is not an active route or an exact queued-destination binding. No turn advancement or automatic follow-up establishment"};
  }
  Game.UnitCommands.sendRequest(unit.id, UnitCommandTypes.MAKE_TRADE_ROUTE, args);
  return {status: "submitted", submissionKind: "establish_route", before, expected: {targetPlayerId, targetCityId,
    targetLocation: before.targetLocation, newRouteObserved: true}, verificationArguments};
})()
