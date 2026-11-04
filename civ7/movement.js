(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const {unit_id: unitId, x, y} = queryArguments;
  if (!Number.isInteger(unitId) || unitId < 0) throw Error("A nonnegative owned unit instance ID is required");
  if ((x == null) !== (y == null)) throw Error("Supply x and y together");
  const matches = player.Units.getUnits().filter(unit => unit.id.id === unitId);
  if (matches.length !== 1) throw Error("No unique owned unit matches this instance ID");
  const unit = matches[0];
  const width = GameplayMap.getGridWidth(), height = GameplayMap.getGridHeight();
  const valid = location => location && Number.isInteger(location.x) && Number.isInteger(location.y) &&
    location.x >= 0 && location.y >= 0 && location.x < width && location.y < height;
  const revealed = location => valid(location) && GameplayMap.getRevealedState(id, location.x, location.y) !== RevealedStates.HIDDEN;
  const locationForPlot = index => Number.isInteger(index) && index >= 0 && index < width * height
    ? GameplayMap.getLocationFromIndex(index) : null;
  const name = key => key ? Locale.compose(key) : null;
  const reasons = result => (result?.FailureReasons ?? []).map(name).filter(Boolean);
  const deployed = valid(unit.location);
  const destination = x == null ? deployed ? unit.location : null : {x, y};
  if (destination && !revealed(destination)) throw Error("Destination must be a valid revealed tile");
  const def = GameInfo.Units.lookup(unit.type);
  const checkMove = location => Game.UnitOperations.canStart(unit.id, UnitOperationTypes.MOVE_TO,
    {X: location.x, Y: location.y}, false);
  const options = [];
  if (deployed && unit.Movement?.movementMovesRemaining > 0) {
    const attackPlots = new Set(Units.getReachableTargets(unit.id) ?? []);
    const plots = unit.Combat?.hasMovedIntoZOC ? [GameplayMap.getIndexFromLocation(unit.location)]
      : Units.getReachableMovement(unit.id) ?? [];
    for (const plot of new Set(plots)) {
      const location = locationForPlot(plot);
      if (!revealed(location) || attackPlots.has(plot)) continue;
      const result = checkMove(location);
      options.push({location: {x: location.x, y: location.y}, availableNow: Boolean(result?.Success), failureReasons: reasons(result)});
    }
  }
  let target = null;
  if (destination) {
    const result = deployed ? checkMove(destination) : null;
    const path = deployed ? Units.getPathTo(unit.id, destination) : null;
    // A partial path would still leak the shape of an unexplored route. Withhold it all.
    const safePath = path?.plots && path.plots.every(plot => revealed(locationForPlot(plot)));
    target = {
      location: {x: destination.x, y: destination.y},
      moveAllowed: result ? Boolean(result.Success) : null,
      failureReasons: reasons(result),
      path: safePath ? path.plots.map((plot, index) => ({location: locationForPlot(plot), turnLabel: path.turns?.[index] ?? null})) : null,
      pathNote: "Native turn labels, not inferred turns remaining; unavailable/unrevealed paths and raw obstacles are withheld"
    };
  }
  const railResult = deployed ? Game.UnitCommands.canStart(unit.id, "UNITCOMMAND_MOVE_BY_RAIL", {}, false) : null;
  const railOptions = [...new Set(railResult?.Plots ?? [])].map(locationForPlot).filter(revealed)
    .map(location => ({location: {x: location.x, y: location.y}, availableNow: Boolean(railResult?.Success)}));
  const rail = {
    operationAllowed: railResult ? Boolean(railResult.Success) : null,
    failureReasons: reasons(railResult), options: railOptions,
    destinationAvailableNow: !railResult || !destination ? null : Boolean(railResult.Success) &&
      railOptions.some(option => option.location.x === destination.x && option.location.y === destination.y),
    travelCost: null,
    note: "Read-only MOVE_BY_RAIL command check and revealed native destination plots, separate from ordinary movement. No path, travel cost or future rail connection is inferred"
  };
  let founding = null;
  if (def?.FoundCity) {
    const current = deployed ? Game.UnitOperations.canStart(unit.id, "UNITOPERATION_FOUND_CITY", {}, false) : null;
    const adjacent = deployed ? Game.UnitOperations.canStart(unit.id, "UNITOPERATION_FOUND_CITY_ADJACENT_PLOT", {}, false) : null;
    founding = {
      currentLocation: deployed ? {x: unit.location.x, y: unit.location.y} : null,
      availableNow: Boolean(current?.Success), failureReasons: reasons(current),
      adjacentOptions: (adjacent?.Plots ?? []).map(locationForPlot).filter(revealed)
        .map(location => ({location, availableNow: Boolean(adjacent?.Success)}))
    };
  }
  let site = null;
  if (destination) {
    const resource = type => {
      const record = GameInfo.Resources.lookup(type);
      return record ? {id: record.ResourceType, name: name(record.Name)} : null;
    };
    const nearby = [];
    for (let yy = 0; yy < height; yy++) {
      for (let xx = 0; xx < width; xx++) {
        if (!revealed({x: xx, y: yy}) || GameplayMap.getPlotDistance(destination.x, destination.y, xx, yy) > 3) continue;
        const found = resource(GameplayMap.getResourceType(xx, yy));
        if (found) nearby.push({location: {x: xx, y: yy}, resource: found});
      }
    }
    const currentSite = deployed && destination.x === unit.location.x && destination.y === unit.location.y;
    const adjacentSite = founding?.adjacentOptions.find(option => option.location.x === destination.x && option.location.y === destination.y);
    site = {
      location: {x: destination.x, y: destination.y},
      terrain: GameInfo.Terrains.lookup(GameplayMap.getTerrainType(destination.x, destination.y))?.TerrainType ?? null,
      feature: GameInfo.Features.lookup(GameplayMap.getFeatureType(destination.x, destination.y))?.FeatureType ?? null,
      biome: GameInfo.Biomes.lookup(GameplayMap.getBiomeType(destination.x, destination.y))?.BiomeType ?? null,
      freshWater: Boolean(GameplayMap.isFreshWater(destination.x, destination.y)),
      currentTileYields: Object.fromEntries((GameplayMap.getYields(GameplayMap.getIndexFromLocation(destination), id) ?? [])
        .map(value => [GameInfo.Yields.lookup(value[0])?.YieldType ?? value[0], value[1]])),
      nearbyRevealedResources: nearby,
      ownedSettlementDistances: player.Cities.getCities().map(city => ({name: name(city.name),
        distance: GameplayMap.getPlotDistance(destination.x, destination.y, city.location.x, city.location.y)})),
      legalToFoundHereNow: founding ? currentSite ? founding.availableNow : adjacentSite?.availableNow ?? null : null,
      legalToFoundAfterMoving: null,
      newSettlementYields: null,
      note: "Revealed site evidence, not a future founding-validity or settlement-yield simulation; nearby resources are within three hexes"
    };
  }
  return {
    turn: Game.turn,
    unit: {instanceId: unit.id.id, type: def?.UnitType ?? unit.type, name: name(unit.name ?? def?.Name)},
    movement: {remaining: unit.Movement?.movementMovesRemaining ?? null, options},
    destination: target, rail, founding, site,
    settlementLimit: {current: player.Stats.numSettlements, limit: player.Stats.settlementCap}
  };
})()
