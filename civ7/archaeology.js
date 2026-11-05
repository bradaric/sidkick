(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  if (!player) throw Error("No local player");
  const age = GameInfo.Ages.lookup(Game.age)?.AgeType ?? null;
  if (age !== "AGE_MODERN") return {turn: Game.turn, age, applicable: false,
    sites: null, continents: null, explorers: null, displayBuildings: null};
  const name = key => key ? Locale.compose(key) : null;
  const width = GameplayMap.getGridWidth(), height = GameplayMap.getGridHeight();
  const valid = location => location && Number.isInteger(location.x) && Number.isInteger(location.y) &&
    location.x >= 0 && location.y >= 0 && location.x < width && location.y < height;
  const sites = [], continentIds = new Set();
  // Match the continent lens: visibility filter before looking up constructible instances.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const revealed = GameplayMap.getRevealedState(id, x, y);
      if (revealed === RevealedStates.HIDDEN) continue;
      const continent = GameplayMap.getContinentType(x, y);
      if (Number.isInteger(continent) && continent >= 0) continentIds.add(continent);
      const base = {location: {x, y}, visible: revealed === RevealedStates.VISIBLE,
        continent: continent >= 0 ? continent : null, availableAfterMoving: null};
      for (const componentId of MapConstructibles.getHiddenFilteredConstructibles(x, y) ?? []) {
        const instance = Constructibles.getByComponentID(componentId);
        const def = instance && GameInfo.Constructibles.lookup(instance.type);
        if (!def) continue;
        const ruins = def.ConstructibleType === "IMPROVEMENT_RUINS";
        const research = ["BUILDING_MUSEUM", "BUILDING_UNIVERSITY", "BUILDING_UNIVERSITY_MO"].includes(def.ConstructibleType);
        if (!ruins && !research) continue;
        sites.push({...base, kind: ruins ? "ruins" : "research-building", id: def.ConstructibleType,
          name: name(def.Name), complete: instance.complete ?? null, damaged: instance.damaged ?? null});
      }
      if (GameplayMap.isNaturalWonder(x, y)) sites.push({...base, kind: "natural-wonder"});
    }
  }
  const continents = [...continentIds].map(continent => ({
    index: continent, id: GameInfo.Continents.lookup(continent)?.ContinentType ?? null,
    name: name(GameInfo.Continents.lookup(continent)?.Description),
    agesResearched: player.Culture?.getNumAgesResearched(continent) ?? null,
    agesAvailableToResearch: player.Culture?.getNumAgesAvailableToResearch(continent) ?? null,
    researchStatus: name(player.Culture?.getContinentResearchStatus(continent))
  }));
  const explorers = player.Units.getUnits().filter(unit => unit.id.owner === id && GameInfo.Units.lookup(unit.type)?.ExtractsArtifacts)
    .map(unit => {
      const deployed = Boolean(valid(unit.location));
      return {instanceId: unit.id.id, id: GameInfo.Units.lookup(unit.type)?.UnitType ?? null, name: name(unit.name),
        location: deployed ? {x: unit.location.x, y: unit.location.y} : null,
        movementRemaining: unit.Movement?.movementMovesRemaining ?? null,
        operations: ["UNITOPERATION_EXCAVATE", "UNITOPERATION_RESEARCH_ARTIFACTS"].map(operation => {
          const result = deployed ? Game.UnitOperations.canStart(unit.id, operation, {X: -9999, Y: -9999, UnitAbilityType: -1}, false) : null;
          return {operation, operationAllowed: result ? Boolean(result.Success) : null, availableNow: Boolean(result?.Success),
            failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean),
            additionalDescriptions: (result?.AdditionalDescription ?? []).map(name).filter(Boolean),
            chargesRemaining: result?.ChargesRemaining ?? null};
        })};
    });
  const displayBuildings = [];
  for (const city of player.Cities.getCities()) {
    if (city.id.owner !== id) continue;
    for (const entry of city.Constructibles.getGreatWorkBuildings() ?? []) {
      const instance = Constructibles.getByComponentID(entry.constructibleID);
      if (!instance) continue;
      const def = GameInfo.Constructibles.lookup(instance.type);
      const capacity = city.Constructibles.getNumGreatWorkSlots(entry.constructibleID);
      const used = (entry.slots ?? []).filter(slot => Number.isInteger(slot.greatWorkIndex) && slot.greatWorkIndex >= 0).length;
      displayBuildings.push({settlement: name(city.name), id: def?.ConstructibleType ?? null, name: name(def?.Name),
        damaged: instance.damaged ?? null, capacity: capacity ?? null, used,
        free: Number.isInteger(capacity) && capacity >= 0 ? Math.max(0, capacity - used) : null,
        artifactCompatible: null, projectedTourism: null});
    }
  }
  return {turn: Game.turn, age, applicable: true, sites, continents, explorers, displayBuildings,
    note: "Revealed UI-filtered archaeology candidates only, including fogged observations, not proof that an artifact remains. Research counts belong to the local player on revealed continents; no hidden ruin totals. Explorer operations are current-position checks, not eligibility after moving, excavation time or artifact rewards. Display capacity is not artifact compatibility or projected Tourism; use get_civ7_great_works for owned-instance relocation checks. No actions or UI selections are issued. This map-scanning query is excluded from snapshots"
  };
})()
