(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const name = key => key ? Locale.compose(key) : null;
  const cities = player.Cities.getCities();
  const sameResource = (left, right) => left.instance === right.instance && left.offMap === right.offMap;
  const reasons = result => (result?.FailureReasons ?? []).map(name).filter(Boolean);
  const statusNames = Object.fromEntries(Object.entries(TradeRouteStatus).map(([key, value]) => [value, key]));
  const age = GameInfo.Ages.lookup(Game.age)?.AgeType ?? null;
  const modern = age === "AGE_MODERN";

  function infrastructureChoices(city) {
    if (!modern) return null;
    const production = Game.CityOperations.canStartQuery(city.id, CityOperationTypes.BUILD, CityQueryType.Constructible) ?? [];
    const purchase = Game.CityCommands.canStartQuery(city.id, CityCommandTypes.PURCHASE, CityQueryType.Constructible) ?? [];
    function choice(type) {
      const find = entries => entries.find(entry => GameInfo.Constructibles.lookup(entry.index)?.ConstructibleType === type)?.result;
      const build = find(production), buy = find(purchase);
      const describe = (result, buying) => result ? {
        availableNow: Boolean(result.Success), failureReasons: reasons(result),
        cost: result.Cost ?? null, affordable: buying && result.InsufficientFunds != null ? !result.InsufficientFunds : null,
        repair: Boolean(result.RepairDamaged), inQueue: Boolean(result.InQueue), alreadyExists: Boolean(result.AlreadyExists)
      } : null;
      return build || buy ? {id: type, production: describe(build, false), purchase: describe(buy, true)} : null;
    }
    return {factory: choice("BUILDING_FACTORY"), railStation: choice("BUILDING_RAIL_STATION")};
  }

  function factoryState(city, assigned) {
    if (!modern) return null;
    const count = city.Resources.getNumFactoryResources();
    const def = GameInfo.Resources.lookup(city.Resources.getFactoryResource());
    const prerequisite = city.Resources.isTreasureConstructiblePrereqMet();
    return {
      constructiblePrerequisiteMet: prerequisite,
      // Same factory indicator as the commerce UI, including its empty-factory case.
      hasFactory: prerequisite && (count === 0 || def != null),
      resource: def ? {id: def.ResourceType, name: name(def.Name), description: name(def.Tooltip)} : null,
      resourceCount: count, producing: count > 0,
      assignedResourceCount: assigned.filter(record => record.class === "RESOURCECLASS_FACTORY").length,
      clearToken: def && Number.isInteger(count) && count > 0 ? JSON.stringify({resourceType:def.ResourceType,count,
        resources:assigned.filter(record=>record.class==="RESOURCECLASS_FACTORY").map(({instance,offMap})=>({instance,offMap})).sort((a,b)=>a.instance-b.instance||Number(a.offMap)-Number(b.offMap))}) : null,
      currentGDP: null, gdpChangeOnAssignment: null,
      note: "Native factory count and current assignment count are distinct evidence; no GDP rate or marginal production is inferred"
    };
  }

  function knownCity(componentId) {
    if (!componentId || (componentId.owner !== id && !player.Diplomacy.hasMet(componentId.owner))) return null;
    const city = Cities.get(componentId);
    if (!city || (city.owner !== id &&
      GameplayMap.getRevealedState(id, city.location.x, city.location.y) === RevealedStates.HIDDEN)) return null;
    return city;
  }

  function resource(record) {
    const def = GameInfo.Resources.lookup(record.uniqueResource.resource);
    const origin = Game.Resources.getOriginCity(record.value);
    const originCity = knownCity(origin);
    return {
      instance: record.value,
      id: def?.ResourceType ?? record.uniqueResource.resource,
      name: name(def?.Name),
      description: name(def?.Tooltip),
      class: def?.ResourceClassType ?? null,
      offMap: Boolean(record.isOffMap),
      origin: originCity ? name(originCity.name) : null
    };
  }

  const owned = (player.Resources.getResources() ?? []).map(resource);
  const settlements = cities.map(city => {
    const assigned = (city.Resources.getAssignedResources() ?? []).map(resource);
    const capacity = city.Resources.getAssignedResourcesCap();
    return {
      name: name(city.name),
      capacity,
      used: assigned.length,
      free: Math.max(0, capacity - assigned.length),
      inTradeNetwork: Boolean(city.Trade.isInTradeNetwork()),
      routeCount: city.Trade.numRoutes,
      infrastructure: {
        railStationPresent: city.Constructibles?.hasConstructible("BUILDING_RAIL_STATION", false) ?? null,
        inRailNetwork: city.Trade.isInRailNetwork(),
        landConnectedToCapital: city.Trade.isConnectedToOwnersCapitalByLand(),
        construction: infrastructureChoices(city)
      },
      factory: factoryState(city, assigned),
      assigned
    };
  });

  for (const record of owned) {
    record.assignmentChoices = cities.map((city, index) => {
      const result = Game.PlayerOperations.canStart(id, PlayerOperationTypes.ASSIGN_RESOURCE,
        {Location: GameplayMap.getLocationFromIndex(record.instance), City: city.id.id,
          ID: record.offMap ? record.instance : -1}, false);
      return {
        settlement: name(city.name),
        alreadyAssignedHere: settlements[index].assigned.some(assigned => sameResource(assigned, record)),
        availableNow: Boolean(result?.Success), failureReasons: reasons(result),
        netYieldChange: null
      };
    });
  }

  const capacityByPlayer = new Map();
  const routes = (player.Trade.projectPossibleTradeRoutes() ?? []).map(route => {
    const targetCity = knownCity(route.targetCityId);
    if (!targetCity) return null;
    const targetPlayer = Players.get(targetCity.owner);
    const statuses = route.status ?? [];
    const active = statuses.includes(TradeRouteStatus.ALREADY_EXISTS);
    const available = statuses[0] === TradeRouteStatus.SUCCESS;
    if (!capacityByPlayer.has(targetCity.owner)) {
      capacityByPlayer.set(targetCity.owner, {
        playerId: targetCity.owner,
        civilization: name(targetPlayer?.civilizationFullName),
        current: player.Trade.countPlayerTradeRoutesTo(targetCity.owner),
        capacity: player.Trade.getTradeCapacityFromPlayer(targetCity.owner)
      });
    }
    return {
      status: active ? "active" : available ? "available" : "blocked",
      statusReasons: statuses.map(value => statusNames[value] ?? value),
      merchantOperationAllowed: null,
      netYieldChange: null,
      domain: route.domain === DomainType.DOMAIN_LAND ? "land" : route.domain === DomainType.DOMAIN_SEA ? "sea" : null,
      targetCity: name(targetCity.name),
      targetCivilization: name(targetPlayer?.civilizationFullName),
      targetLocation: {x: targetCity.location.x, y: targetCity.location.y},
      imports: (route.importPayloads ?? []).map(resource),
      exports: (route.exportYields ?? []).map(value => ({
        yield: GameInfo.Yields.lookup(value.yieldType)?.YieldType ?? value.yieldType,
        amount: value.amount
      }))
    };
  }).filter(Boolean);

  return {
    turn: Game.turn,
    age,
    resources: {
      owned,
      total: owned.length,
      unassigned: owned.filter(item => !settlements.some(city => city.assigned.some(assigned => sameResource(assigned, item)))),
      comparisonNote: "Assignment checks are read-only; marginal yields are unknown without a verified pure preview"
    },
    settlements,
    trade: {
      currentRouteCount: player.Trade.countPlayerTradeRoutes(),
      capacityByPlayer: [...capacityByPlayer.values()],
      routes,
      comparisonNote: "Known revealed route candidates, including blocked routes; status is route-level, not merchant-specific eligibility. Payloads are engine quotes, not marginal empire-wide benefits"
    }
  };
})()
