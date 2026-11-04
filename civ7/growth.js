(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const name = key => key ? Locale.compose(key) : null;
  const reasons = result => (result?.FailureReasons ?? []).map(name).filter(Boolean);
  const sourceNames = Object.fromEntries(Object.entries(YieldSourceTypes).map(([key, value]) => [value, key]));
  const yieldMap = values => Object.fromEntries([...GameInfo.Yields]
    .map(def => [def.YieldType, values[def.$index]])
    .filter(([, value]) => value !== 0));
  const subtract = (left, right) => left.map((value, index) => value - right[index]);

  function revealedLocation(index) {
    if (index == null || index < 0) return null;
    const location = GameplayMap.getLocationFromIndex(index);
    return GameplayMap.getRevealedState(id, location.x, location.y) === RevealedStates.HIDDEN
      ? null
      : {x: location.x, y: location.y};
  }

  function settlement(city) {
    const ready = Boolean(city.Growth.isReadyToPlacePopulation);
    const expand = Game.CityCommands.canStart(city.id, CityCommandTypes.EXPAND, {}, false);
    // Use the engine's previews directly; do not initialize UI managers or change selection.
    const buildings = city.Yields.calculateAllBuildingsPlacements()?.buildings ?? [];

    function improvementOption(plot, def, placement) {
      const location = revealedLocation(plot);
      if (!location) return null;
      const resource = GameInfo.Resources.lookup(GameplayMap.getResourceType(location.x, location.y));
      let maintenanceChanges = null;
      if (def && placement) {
        const maintenance = city.Constructibles.getMaintenance(def.ConstructibleType);
        const previous = [...GameInfo.Constructibles].find(value => value.$index === placement.overbuiltConstructibleID);
        maintenanceChanges = previous
          ? subtract(maintenance, city.Constructibles.getMaintenance(previous.ConstructibleType))
          : maintenance;
      }
      return {
        plotIndex: plot,
        location,
        resource: resource ? {id: resource.ResourceType, name: name(resource.Name)} : null,
        improvement: def ? {id: def.ConstructibleType, name: name(def.Name), description: name(def.Description)} : null,
        yieldChanges: placement ? yieldMap(placement.yieldChanges) : null,
        maintenanceChanges: maintenanceChanges ? yieldMap(maintenanceChanges) : null,
        netYieldChanges: placement && maintenanceChanges
          ? yieldMap(subtract(placement.yieldChanges, maintenanceChanges))
          : null,
        bonuses: placement ? (placement.changeDetails ?? []).map(change => ({
          source: sourceNames[change.sourceType] ?? change.sourceType,
          yield: GameInfo.Yields.lookup(change.yieldType)?.YieldType ?? change.yieldType,
          change: change.change,
          sourceLocation: revealedLocation(change.sourcePlotIndex),
          targetLocation: revealedLocation(change.targetPlotIndex)
        })) : null
      };
    }

    const options = ready && expand?.Success ? (expand.Plots ?? []).map((plot, index) => {
      const def = GameInfo.Constructibles.lookup(expand.ConstructibleTypes?.[index]);
      const placement = def ? buildings.find(value => value.constructibleType === def.$hash)
        ?.placements?.find(value => value.plotID === plot) : null;
      return improvementOption(plot, def, placement);
    }).filter(Boolean) : [];

    // These are improvement placement previews, NOT the legal growth domain.
    const previews = [];
    for (const building of buildings) {
      const def = GameInfo.Constructibles.lookup(building.constructibleType);
      if (def?.ConstructibleClass !== "IMPROVEMENT") continue;
      for (const placement of building.placements ?? []) {
        if (options.some(option => option.plotIndex === placement.plotID && option.improvement?.id === def.ConstructibleType)) continue;
        const option = improvementOption(placement.plotID, def, placement);
        if (option) previews.push(option);
      }
    }

    const placements = city.isTown ? [] : (city.Workers.GetAllPlacementInfo() ?? []).map(info => {
      const location = revealedLocation(info.PlotIndex);
      if (!location) return null;
      const result = ready && !info.IsBlocked && info.NumWorkers < info.MaxWorkers
        ? Game.PlayerOperations.canStart(id, PlayerOperationTypes.ASSIGN_WORKER,
          {Location: info.PlotIndex, Amount: 1}, false)
        : null;
      const yieldChanges = subtract(info.NextYields, info.CurrentYields);
      const maintenanceChanges = subtract(info.NextMaintenance, info.CurrentMaintenance);
      return {
        plotIndex: info.PlotIndex,
        location,
        current: info.NumWorkers,
        capacity: info.MaxWorkers,
        blocked: Boolean(info.IsBlocked),
        availableNow: Boolean(result?.Success),
        failureReasons: reasons(result),
        yieldChanges: yieldMap(yieldChanges),
        maintenanceChanges: yieldMap(maintenanceChanges),
        netYieldChanges: yieldMap(subtract(yieldChanges, maintenanceChanges))
      };
    }).filter(Boolean);

    return {
      id: city.id,
      name: name(city.name),
      location: {x: city.location.x, y: city.location.y},
      status: city.isCapital ? "capital" : city.isTown ? "town" : "city",
      population: city.population,
      growth: {
        turns: city.Growth.turnsUntilGrowth,
        currentFood: city.Growth.currentFood,
        threshold: city.Growth.getNextGrowthFoodThreshold().value,
        type: city.Growth.growthType,
        pendingPopulation: city.pendingPopulation,
        readyToPlacePopulation: ready
      },
      expansion: {
        availableNow: ready && Boolean(expand?.Success),
        failureReasons: reasons(expand),
        options,
        previews
      },
      specialists: {
        perTileCapacity: city.Workers.getCityWorkerCap(),
        placements
      }
    };
  }

  return {turn: Game.turn, settlements: player.Cities.getCities().map(settlement)};
})()
