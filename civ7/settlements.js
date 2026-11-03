(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const name = key => key ? Locale.compose(key) : null;

  function productionName(item) {
    switch (item.kind) {
      case ProductionKind.CONSTRUCTIBLE:
        return GameInfo.Constructibles.lookup(item.constructibleType);
      case ProductionKind.UNIT:
        return GameInfo.Units.lookup(item.unitType);
      case ProductionKind.PROJECT:
        return GameInfo.Projects.lookup(item.projectType);
      default:
        return null;
    }
  }

  function greatWorkSlots(city) {
    const buildings = city.Constructibles.getGreatWorkBuildings() ?? [];
    return buildings.map(entry => {
      const instance = Constructibles.getByComponentID(entry.constructibleID);
      const def = instance ? GameInfo.Constructibles.lookup(instance.type) : null;
      const slots = (entry.slots ?? []).map(slot => {
        if (slot.greatWorkIndex == null || slot.greatWorkIndex < 0) return null;
        const workType = Game.Culture.getGreatWorkType(slot.greatWorkIndex);
        const work = GameInfo.GreatWorks.lookup(workType);
        return work ? {id: work.GreatWorkType, name: name(work.Name)} : null;
      });
      return {
        building: def ? name(def.Name) : null,
        capacity: city.Constructibles.getNumGreatWorkSlots(entry.constructibleID),
        works: slots.filter(Boolean)
      };
    });
  }

  function constructibles(city) {
    const records = (city.Constructibles.getIds() ?? []).map(componentId => {
      const instance = Constructibles.getByComponentID(componentId);
      if (!instance) return null;
      const def = GameInfo.Constructibles.lookup(instance.type);
      if (!def) return null;
      const maintenance = city.Constructibles.getMaintenance(def.ConstructibleType) ?? [];
      return {
        id: def.ConstructibleType,
        name: name(def.Name),
        class: def.ConstructibleClass,
        location: instance.location ? {x: instance.location.x, y: instance.location.y} : null,
        damaged: Boolean(instance.damaged),
        maintenance: Object.fromEntries(maintenance
          .map((value, index) => [GameInfo.Yields[index]?.YieldType, value])
          .filter(value => value[0] && value[1] > 0))
      };
    }).filter(Boolean);

    const districtMap = new Map();
    for (const record of records.filter(value => value.class === "BUILDING" || value.class === "WONDER")) {
      const key = record.location ? `${record.location.x},${record.location.y}` : "unknown";
      if (!districtMap.has(key)) {
        const district = record.location ? Districts.getAtLocation(record.location) : null;
        const quarter = district && district.uniqueQuarterType !== UniqueQuarterTypes.NO_QUARTER
          ? GameInfo.UniqueQuarters.lookup(district.uniqueQuarterType)
          : null;
        districtMap.set(key, {
          location: record.location,
          name: name(quarter?.Name),
          buildings: []
        });
      }
      districtMap.get(key).buildings.push(record);
    }
    return {
      districts: [...districtMap.values()],
      improvements: records.filter(value => value.class === "IMPROVEMENT"),
      other: records.filter(value => !["BUILDING", "WONDER", "IMPROVEMENT"].includes(value.class))
    };
  }

  function settlement(city) {
    const all = constructibles(city);
    const focusDef = city.isTown && city.Growth.growthType !== GrowthTypes.EXPAND
      ? GameInfo.Projects.lookup(city.Growth.projectType)
      : null;
    const focus = !city.isTown
      ? null
      : city.Growth.growthType === GrowthTypes.EXPAND
        ? {id: "GROWTH", name: name("LOC_UI_FOOD_CHOOSER_FOCUS_GROWTH")}
        : focusDef
          ? {id: focusDef.ProjectType, name: name(focusDef.Name ?? `LOC_${focusDef.ProjectType}_NAME`)}
          : null;
    const specialistPlacements = (city.Workers.GetAllPlacementInfo() ?? [])
      .filter(info => info.NumWorkers > 0)
      .map(info => ({
        location: GameplayMap.getLocationFromIndex(info.PlotIndex),
        current: info.NumWorkers,
        capacity: info.MaxWorkers
      }));
    return {
      name: name(city.name),
      location: {x: city.location.x, y: city.location.y},
      status: city.isCapital ? "capital" : city.isTown ? "town" : "city",
      distantLands: Boolean(city.isDistantLands),
      population: city.population,
      urbanPopulation: city.urbanPopulation,
      ruralPopulation: city.ruralPopulation,
      specialists: {
        current: city.Workers.getNumWorkers(false),
        perTileCapacity: city.Workers.getCityWorkerCap(),
        placements: specialistPlacements
      },
      growth: {
        turns: city.Growth.turnsUntilGrowth,
        currentFood: city.Growth.currentFood,
        threshold: city.Growth.getNextGrowthFoodThreshold().value,
        type: city.Growth.growthType
      },
      focus,
      happiness: {
        netPerTurn: city.Happiness.netHappinessPerTurn,
        unrest: Boolean(city.Happiness.hasUnrest)
      },
      netYields: Object.fromEntries([...GameInfo.Yields].map(def => [
        def.YieldType,
        city.Yields.getNetYield(def.$hash)
      ])),
      productionQueue: city.BuildQueue.getQueue().map(item => {
        const def = productionName(item);
        const type = def?.ConstructibleType ?? def?.UnitType ?? def?.ProjectType ?? null;
        return {
          id: type,
          name: def ? name(def.Name) : null,
          turns: type ? city.BuildQueue.getTurnsLeft(type) : null
        };
      }),
      districts: all.districts,
      improvements: all.improvements,
      otherConstructibles: all.other,
      greatWorks: greatWorkSlots(city)
    };
  }

  const archivedWorks = [];
  for (let i = 0; i < player.Culture.getNumWorksInArchive(); i++) {
    const workIndex = player.Culture.getArchivedGreatWork(i);
    const work = GameInfo.GreatWorks.lookup(Game.Culture.getGreatWorkType(workIndex));
    if (work) archivedWorks.push({id: work.GreatWorkType, name: name(work.Name)});
  }
  return {
    turn: Game.turn,
    settlements: player.Cities.getCities().map(settlement),
    archivedGreatWorks: archivedWorks
  };
})()
