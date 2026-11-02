(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const name = key => key ? Locale.compose(key) : null;

  function resource(record) {
    const def = GameInfo.Resources.lookup(record.uniqueResource.resource);
    const origin = Game.Resources.getOriginCity(record.value);
    const originCity = origin ? Cities.get(origin) : null;
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
  const settlements = player.Cities.getCities().map(city => {
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

  const capacityByPlayer = new Map();
  const routes = (player.Trade.projectPossibleTradeRoutes() ?? []).map(route => {
    const targetCity = Cities.get(route.targetCityId);
    if (!targetCity) return null;
    const targetPlayer = Players.get(targetCity.owner);
    const statuses = route.status ?? [];
    const active = statuses.includes(TradeRouteStatus.ALREADY_EXISTS);
    const available = statuses.includes(TradeRouteStatus.SUCCESS);
    if (!active && !available) return null;
    if (!capacityByPlayer.has(targetCity.owner)) {
      capacityByPlayer.set(targetCity.owner, {
        playerId: targetCity.owner,
        civilization: name(targetPlayer?.civilizationFullName),
        current: player.Trade.countPlayerTradeRoutesTo(targetCity.owner),
        capacity: player.Trade.getTradeCapacityFromPlayer(targetCity.owner)
      });
    }
    return {
      status: active ? "active" : "available",
      domain: route.domain === DomainType.DOMAIN_LAND ? "land" : "sea",
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
      unassigned: owned.filter(item => !settlements.some(city => city.assigned.some(assigned => assigned.instance === item.instance)))
    },
    settlements,
    trade: {
      capacityByPlayer: [...capacityByPlayer.values()],
      routes
    }
  };
})()
