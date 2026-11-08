(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const name = key => key ? Locale.compose(key) : null;
  const normalized = value => value.trim().toLowerCase();
  const selector = normalized(queryArguments.settlement);
  if (!selector) throw Error("A settlement name is required");
  const matches = player.Cities.getCities().filter(city => normalized(name(city.name)) === selector);
  if (!matches.length) throw Error("No owned settlement matches that exact name");
  if (matches.length > 1) throw Error("Ambiguous settlement name; rename one settlement to distinguish it");
  const city = matches[0];
  const filter = queryArguments.constructible == null ? null : normalized(queryArguments.constructible);
  const reasons = result => (result.FailureReasons ?? []).map(name).filter(Boolean);
  const sourceNames = Object.fromEntries(Object.entries(YieldSourceTypes).map(([key, value]) => [value, key]));
  const yieldMap = values => Object.fromEntries([...GameInfo.Yields]
    .map(def => [def.YieldType, values[def.$index]])
    .filter(([, value]) => value !== 0));
  const subtract = (left, right) => left.map((value, index) => value - right[index]);
  const describe = def => def ? {id: def.ConstructibleType, name: name(def.Name), class: def.ConstructibleClass} : null;

  function revealedLocation(index) {
    if (index == null || index < 0) return null;
    const location = GameplayMap.getLocationFromIndex(index);
    return GameplayMap.getRevealedState(id, location.x, location.y) === RevealedStates.HIDDEN
      ? null
      : {x: location.x, y: location.y};
  }

  const choices = new Map();
  function addChoices(entries, method) {
    for (const entry of entries ?? []) {
      const def = GameInfo.Constructibles.lookup(entry.index);
      if (!def || !["BUILDING", "WONDER", "IMPROVEMENT"].includes(def.ConstructibleClass) || !entry.result) continue;
      if (filter !== null && normalized(def.ConstructibleType) !== filter && normalized(name(def.Name)) !== filter) continue;
      if (!choices.has(def.ConstructibleType)) choices.set(def.ConstructibleType, {def});
      choices.get(def.ConstructibleType)[method] = entry.result;
    }
  }
  addChoices(Game.CityOperations.canStartQuery(city.id, CityOperationTypes.BUILD, CityQueryType.Constructible), "production");
  addChoices(Game.CityCommands.canStartQuery(city.id, CityCommandTypes.PURCHASE, CityQueryType.Constructible), "purchase");
  if (filter !== null && !choices.size) throw Error("No matching building or wonder in this settlement's current construction/purchase queries");
  if (filter !== null && choices.size > 1) throw Error("Ambiguous building name; use its exact constructible type ID");

  const selected = [...choices.values()].filter(choice => filter !== null || choice.production?.Success ||
    choice.purchase?.Success || choice.purchase?.InsufficientFunds);
  const buildings = selected.length ? city.Yields.calculateAllBuildingsPlacements()?.buildings ?? [] : [];

  function choiceData(result, def, purchase) {
    if (!result) return null;
    return {
      availableNow: Boolean(result.Success),
      affordable: purchase ? !result.InsufficientFunds : null,
      cost: purchase ? result.Cost ?? city.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, def.ConstructibleType)
        : city.Production.getConstructibleProductionCost(def.$hash),
      turns: purchase ? null : city.BuildQueue.getTurnsLeft(def.ConstructibleType),
      repair: Boolean(result.RepairDamaged),
      inQueue: Boolean(result.InQueue),
      alreadyExists: Boolean(result.AlreadyExists),
      failureReasons: reasons(result)
    };
  }

  function validPlots(result, purchase) {
    return new Set(result && (result.Success || (purchase && result.InsufficientFunds))
      ? [...(result.Plots ?? []), ...(result.ExpandUrbanPlots ?? [])] : []);
  }

  const constructibles = selected.map(({def, production, purchase}) => {
    const buildPlots = validPlots(production, false);
    const buyPlots = validPlots(purchase, true);
    const previews = buildings.find(building => building.constructibleType === def.$hash)?.placements ?? [];
    const placements = [...new Set([...buildPlots, ...buyPlots])].map(plot => {
      const location = revealedLocation(plot);
      if (!location) return null;
      const preview = previews.find(value => value.plotID === plot);
      let targetToken = null;
      if (typeof MapConstructibles !== "undefined" && typeof Constructibles !== "undefined" && GameplayMap.getRevealedState(id, location.x, location.y) === RevealedStates.VISIBLE) {
        const ids = MapConstructibles.getConstructibles(location.x, location.y);
        const records = Array.isArray(ids) ? ids.map(component => {
          const c = Constructibles.getByComponentID(component);
          return c ? {owner: component.owner, instanceId: component.id, componentType: component.type, type: c.type, complete: c.complete, damaged: c.damaged} : null;
        }) : null;
        if (records && records.every(c => c && Number.isInteger(c.type) && typeof c.complete === "boolean" && typeof c.damaged === "boolean")) {
          records.sort((a, b) => a.instanceId - b.instanceId || a.componentType - b.componentType);
          targetToken = JSON.stringify(records);
        }
      }
      const previous = preview ? [...GameInfo.Constructibles]
        .find(value => value.$index === preview.overbuiltConstructibleID) : null;
      const maintenance = preview ? city.Constructibles.getMaintenance(def.ConstructibleType) : null;
      const maintenanceChanges = previous && maintenance
        ? subtract(maintenance, city.Constructibles.getMaintenance(previous.ConstructibleType))
        : maintenance;
      return {
        plotIndex: plot,
        targetToken,
        location,
        validForProduction: buildPlots.has(plot),
        validForPurchase: buyPlots.has(plot),
        expandsUrban: Boolean(production?.ExpandUrbanPlots?.includes(plot) || purchase?.ExpandUrbanPlots?.includes(plot)),
        previewAvailable: Boolean(preview),
        overbuilds: describe(previous),
        yieldChanges: preview ? yieldMap(preview.yieldChanges) : null,
        maintenanceChanges: maintenanceChanges ? yieldMap(maintenanceChanges) : null,
        netYieldChanges: preview && maintenanceChanges ? yieldMap(subtract(preview.yieldChanges, maintenanceChanges)) : null,
        bonuses: preview ? (preview.changeDetails ?? []).map(change => ({
          source: sourceNames[change.sourceType] ?? change.sourceType,
          yield: GameInfo.Yields.lookup(change.yieldType)?.YieldType ?? change.yieldType,
          change: change.change,
          sourceLocation: revealedLocation(change.sourcePlotIndex),
          targetLocation: revealedLocation(change.targetPlotIndex)
        })) : null
      };
    }).filter(Boolean);
    return {
      ...describe(def),
      description: name(def.Description),
      production: choiceData(production, def, false),
      purchase: choiceData(purchase, def, true),
      placements
    };
  });

  return {
    turn: Game.turn,
    settlement: {
      id: city.id,
      name: name(city.name),
      location: {x: city.location.x, y: city.location.y},
      status: city.isCapital ? "capital" : city.isTown ? "town" : "city"
    },
    yieldScope: "Total engine-reported placement effects, including effects on other settlements; net changes subtract maintenance",
    constructibles
  };
})()
