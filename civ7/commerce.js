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
