(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const selectedIndex = queryArguments.great_work_index;
  if (selectedIndex != null && (!Number.isInteger(selectedIndex) || selectedIndex < 0)) throw Error("A nonnegative owned Great Work instance index is required");
  const name = key => key ? Locale.compose(key) : null;
  const cities = player.Cities.getCities().filter(city => city.id.owner === id);
  const yieldDefs = [...GameInfo.Yields].filter(def =>
    ["YIELD_CULTURE", "YIELD_GOLD", "YIELD_PRODUCTION", "YIELD_FOOD", "YIELD_SCIENCE", "YIELD_HAPPINESS"].includes(def.YieldType));
  const works = [], buildings = [];
  function addWork(index, source) {
    if (!Number.isInteger(index) || index < 0) return;
    const type = Game.Culture.getGreatWorkType(index);
    const def = GameInfo.GreatWorks.lookup(type);
    works.push({instanceIndex: index, id: def?.GreatWorkType ?? null, name: name(def?.Name),
      objectType: def?.GreatWorkObjectType ?? null, source});
  }
  for (let index = 0; index < player.Culture.getNumWorksInArchive(); index++) {
    addWork(player.Culture.getArchivedGreatWork(index), {archived: true, cityId: null, settlement: null, buildingType: null});
  }
  for (const city of cities) {
    for (const entry of city.Constructibles.getGreatWorkBuildings() ?? []) {
      const instance = Constructibles.getByComponentID(entry.constructibleID);
      if (!instance || (instance.owner != null && instance.owner !== id)) continue;
      const def = GameInfo.Constructibles.lookup(instance.type);
      const indices = (entry.slots ?? []).map(slot => slot.greatWorkIndex).filter(index => Number.isInteger(index) && index >= 0);
      const reportedCapacity = city.Constructibles.getNumGreatWorkSlots(entry.constructibleID);
      const capacity = Number.isInteger(reportedCapacity) && reportedCapacity >= 0 ? reportedCapacity : null;
      const building = {settlement: name(city.name), cityId: city.id.id, componentId: entry.constructibleID,
        buildingType: instance.type, id: def?.ConstructibleType ?? null, name: name(def?.Name), damaged: instance.damaged ?? null,
        capacity, used: indices.length, free: capacity == null ? null : Math.max(0, capacity - indices.length), workIndices: indices,
        currentGreatWorkYields: Object.fromEntries(yieldDefs.map(yieldDef => [yieldDef.YieldType,
          city.Constructibles.getBuildingYieldFromGreatWorks(yieldDef.$hash, entry.constructibleID) ?? null]))};
      buildings.push(building);
      for (const index of indices) addWork(index, {archived: false, cityId: city.id.id, settlement: building.settlement,
        buildingType: instance.type, building: building.name, damaged: building.damaged});
    }
  }
  let selectedWork = null, destinations = null;
  if (selectedIndex != null) {
    const matches = works.filter(work => work.instanceIndex === selectedIndex);
    if (matches.length !== 1) throw Error("No unique owned Great Work matches this instance index");
    selectedWork = matches[0];
    const def = selectedWork.id == null ? null : GameInfo.GreatWorks.lookup(selectedWork.id);
    const quotes = new Map();
    destinations = buildings.map(building => {
      if (!quotes.has(building.cityId)) {
        const city = cities.find(city => city.id.id === building.cityId);
        // The tooltip getter accepts a definition index, not the owned instance index.
        // It has no building argument, so this cannot establish a relocation delta.
        quotes.set(building.cityId, Number.isInteger(def?.$index) && def.$index >= 0 &&
          typeof city?.Constructibles?.getYieldFromGreatWork === "function" ? {
            workType: def.GreatWorkType, buildingSpecific: false,
            yields: Object.fromEntries(yieldDefs.map(yieldDef => {
              const value = city.Constructibles.getYieldFromGreatWork(yieldDef.YieldType, def.$index);
              return [yieldDef.YieldType, Number.isFinite(value) ? value : null];
            }))
          } : null);
      }
      const args = {Player1: id, GreatWorkIndex: selectedIndex, DestinationCity: building.cityId, DestinationBuilding: building.buildingType};
      if (!selectedWork.source.archived) args.SourceCity = selectedWork.source.cityId;
      const result = Game.PlayerOperations.canStart(id, PlayerOperationTypes.MOVE_GREAT_WORK, args, false);
      const alreadyHere = !selectedWork.source.archived && selectedWork.source.cityId === building.cityId && selectedWork.source.buildingType === building.buildingType;
      const pickerEligible = building.free > 0 && building.damaged === false &&
        (selectedWork.source.archived || selectedWork.source.damaged === false) && !alreadyHere;
      return {settlement: building.settlement, building: building.name, buildingType: building.id, componentId: building.componentId,
        free: building.free, damaged: building.damaged, alreadyHere, pickerEligible, operationAllowed: result ? Boolean(result.Success) : null,
        availableNow: Boolean(result?.Success) && pickerEligible,
        failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean),
        cityWorkTypeYieldQuote: quotes.get(building.cityId), netYieldChange: null};
    });
  }
  return {turn: Game.turn, works, buildings, selectedWork, destinations,
    note: "Owned archive/displayed instances only. Optional instance index reads picker-equivalent MOVE_GREAT_WORK eligibility for owned building types with empty capacity, not occupied-slot swaps. Building yields are current whole-building totals. cityWorkTypeYieldQuote uses the tooltip's pure city/definition-index getter, shared by destinations in that city: not an instance-specific, building-specific or marginal relocation/net-yield forecast, even when quotes differ. Missing quotes stay unknown; native zeroes/negatives are retained. No work is selected, archived or moved; targeted relocation checks are excluded from snapshots"
  };
})()
