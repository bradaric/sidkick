(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  const name = key => key ? Locale.compose(key) : null;
  const reasons = result => (result?.FailureReasons ?? []).map(name).filter(Boolean);
  const cities = player.Cities.getCities();

  function townFocus(city) {
    if (!city.isTown) return null;
    const offered = Game.CityCommands.canStart(city.id, CityCommandTypes.CHANGE_GROWTH_MODE,
      {Type: GrowthTypes.PROJECT}, false);
    const choices = [{id: "GROWTH", name: name("LOC_UI_FOOD_CHOOSER_FOCUS_GROWTH"),
      description: name("LOC_PROJECT_TOWN_FOOD_INCREASE_DESCRIPTION"), type: GrowthTypes.EXPAND,
      project: ProjectTypes.NO_PROJECT, prerequisitePopulation: null}];
    for (const index of offered?.Projects ?? []) {
      const def = GameInfo.Projects.lookup(index);
      if (def) choices.push({id: def.ProjectType, name: name(def.Name), description: name(def.Description),
        type: GrowthTypes.PROJECT, project: def.$hash, prerequisitePopulation: def.PrereqPopulation ?? null});
    }
    return {
      scope: "Growth plus the engine's currently offered focus projects; no stateful preview initialization",
      failureReasons: reasons(offered),
      options: choices.map(choice => {
        const result = Game.CityCommands.canStart(city.id, CityCommandTypes.CHANGE_GROWTH_MODE,
          {Type: choice.type, ProjectType: choice.project, City: city.id.id}, false);
        return {
          id: choice.id, name: choice.name, description: choice.description,
          current: city.Growth.growthType === choice.type &&
            (choice.type === GrowthTypes.EXPAND || city.Growth.projectType === choice.project),
          availableNow: Boolean(result?.Success), failureReasons: reasons(result),
          prerequisitePopulation: choice.prerequisitePopulation,
          netYieldChange: null
        };
      }),
      connectedOwnedSettlements: (city.getConnectedCities() ?? []).map(connected => cities.find(other =>
        other.id.owner === connected.owner && other.id.id === connected.id && other.id.type === connected.type))
        .filter(Boolean).map(other => name(other.name)),
      reportedFoodPerConnectedCity: city.getSentFoodPerCity(),
      comparisonNote: "Reported food is current engine data, not a projection for another focus or a guarantee food is being exported"
    };
  }

  function constructibleChoice(city, entry, purchase) {
    const result = entry.result;
    if (!result || (!result.Success && !(purchase && result.InsufficientFunds))) return null;
    const def = GameInfo.Constructibles.lookup(entry.index);
    if (!def) return null;
    const yieldChanges = Object.fromEntries(
      GameInfo.Constructible_YieldChanges
        .filter(value => value.ConstructibleType === def.ConstructibleType)
        .map(value => [value.YieldType, value.YieldChange])
    );
    const cost = purchase
      ? result.Cost ?? city.Gold.getBuildingPurchaseCost(YieldTypes.YIELD_GOLD, def.ConstructibleType)
      : city.Production.getConstructibleProductionCost(def.$hash);
    return {
      id: def.ConstructibleType,
      name: name(def.Name),
      description: name(def.Description),
      class: def.ConstructibleClass,
      cost,
      turns: purchase ? null : city.BuildQueue.getTurnsLeft(def.ConstructibleType),
      available: Boolean(result.Success),
      affordable: purchase ? !result.InsufficientFunds : null,
      repair: Boolean(result.RepairDamaged),
      alreadyExists: Boolean(result.AlreadyExists),
      inQueue: Boolean(result.InQueue),
      validPlacementCount: (result.Plots ?? []).length + (result.ExpandUrbanPlots ?? []).length,
      yieldChanges,
      failureReasons: reasons(result)
    };
  }

  function unitChoice(city, entry, purchase) {
    const result = entry.result;
    if (!result || (!result.Success && !(purchase && result.InsufficientFunds))) return null;
    const def = GameInfo.Units.lookup(entry.index);
    if (!def) return null;
    const stats = GameInfo.Unit_Stats.lookup(def.UnitType);
    const cost = purchase
      ? result.Cost ?? city.Gold.getUnitPurchaseCost(YieldTypes.YIELD_GOLD, def.UnitType)
      : city.Production.getUnitProductionCost(def.UnitType);
    return {
      id: def.UnitType,
      name: name(def.Name),
      description: name(def.Description),
      formationClass: def.FormationClass,
      domain: def.Domain,
      cost,
      turns: purchase ? null : city.BuildQueue.getTurnsLeft(def.UnitType),
      available: Boolean(result.Success),
      affordable: purchase ? !result.InsufficientFunds : null,
      combat: stats ? {
        melee: stats.Combat,
        ranged: stats.RangedCombat,
        bombard: stats.Bombard,
        range: stats.Range,
        baseMoves: def.BaseMoves,
        buildCharges: def.BuildCharges
      } : null,
      failureReasons: reasons(result)
    };
  }

  function projectChoice(city, def) {
    if ((def.CityOnly && city.isTown) || (def.TownOnly && !city.isTown)) return null;
    const result = Game.CityOperations.canStart(
      city.id,
      CityOperationTypes.BUILD,
      {ProjectType: def.$index},
      false
    );
    if (!result?.Success) return null;
    return {
      id: def.ProjectType,
      name: name(def.Name),
      description: name(def.Description),
      productionCost: city.Production.getProjectProductionCost(def.ProjectType),
      turns: city.BuildQueue.getTurnsLeft(def.ProjectType),
      upgradesTownToCity: Boolean(def.UpgradeToCity)
    };
  }

  function settlement(city) {
    const rawQueue = typeof city.BuildQueue?.getQueue === "function" ? city.BuildQueue.getQueue() : null;
    const queue = Array.isArray(rawQueue) ? JSON.parse(JSON.stringify(rawQueue)) : null;
    const buildConstructibles = Game.CityOperations.canStartQuery(
      city.id, CityOperationTypes.BUILD, CityQueryType.Constructible
    ) ?? [];
    const buildUnits = Game.CityOperations.canStartQuery(
      city.id, CityOperationTypes.BUILD, CityQueryType.Unit
    ) ?? [];
    const buyConstructibles = Game.CityCommands.canStartQuery(
      city.id, CityCommandTypes.PURCHASE, CityQueryType.Constructible
    ) ?? [];
    const buyUnits = Game.CityCommands.canStartQuery(
      city.id, CityCommandTypes.PURCHASE, CityQueryType.Unit
    ) ?? [];
    const townUpgradeCost = city.isTown ? city.Gold?.getTownUpgradeCost() ?? null : null;
    const captureOptions=city.isJustConqueredFrom===true&&city.isBeingRazed===false?[['keep',2],['raze',3]].map(([choice,directive])=>{
      const result=Game.CityCommands.canStart(city.id,CityCommandTypes.DESTROY,{Directive:directive},false);
      return{choice,availableNow:result?.Success===true&&result.RequiresConfirmation!==true,failureReasons:reasons(result)};
    }):[];
    return {
      cityId:city.id.id,
      cityOwner:city.id.owner,
      name: name(city.name),
      captureDisposition:{pending:typeof city.isJustConqueredFrom==='boolean'?city.isJustConqueredFrom:null,beingRazed:typeof city.isBeingRazed==='boolean'?city.isBeingRazed:null,options:captureOptions},
      status: city.isCapital ? "capital" : city.isTown ? "town" : "city",
      location: {x: city.location.x, y: city.location.y},
      townFocus: townFocus(city),
      townUpgrade: city.isTown ? {
        cost: townUpgradeCost,
        affordable: townUpgradeCost == null ? null : player.Treasury.goldBalance >= townUpgradeCost
      } : null,
      production: {
        queue, queueToken: queue ? JSON.stringify(queue) : null,
        constructibles: buildConstructibles.map(entry => constructibleChoice(city, entry, false)).filter(Boolean),
        units: buildUnits.map(entry => unitChoice(city, entry, false)).filter(Boolean),
        projects: [...GameInfo.Projects].map(def => projectChoice(city, def)).filter(Boolean)
      },
      purchases: {
        constructibles: buyConstructibles.map(entry => constructibleChoice(city, entry, true)).filter(Boolean),
        units: buyUnits.map(entry => unitChoice(city, entry, true)).filter(Boolean)
      }
    };
  }

  const upgradeCommands = [...GameInfo.UnitCommands].filter(def =>
    def.CommandType === "UNITCOMMAND_UPGRADE" || def.CommandType === "UNITCOMMAND_UPGRADE_ARMY"
  );
  const unitUpgrades = [];
  for (const unit of player.Units.getUnits()) {
    const unitDef = GameInfo.Units.lookup(unit.type);
    for (const command of upgradeCommands) {
      const parameters = {X: -9999, Y: -9999, UnitAbilityType: -1};
      const visible = Game.UnitCommands.canStart(unit.id, command.CommandType, parameters, true);
      if (!visible?.Success) continue;
      const enabled = Game.UnitCommands.canStart(unit.id, command.CommandType, parameters, false);
      unitUpgrades.push({
        unit: name(unit.name ?? unitDef?.Name),
        unitType: unitDef?.UnitType ?? unit.type,
        command: command.CommandType,
        name: name(command.Name),
        description: name(command.Description),
        available: Boolean(enabled?.Success),
        failureReasons: reasons(enabled)
      });
    }
  }

  return {
    turn: Game.turn,
    treasury: player.Treasury.goldBalance,
    settlements: cities.map(settlement),
    unitUpgrades
  };
})()
