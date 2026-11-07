(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const name = key => key ? Locale.compose(key) : null;
  function autoExplore(unit, def) {
    if (def?.UnitType !== "UNIT_SCOUT") return null;
    const type = typeof UnitOperationTypes === "undefined" ? null : UnitOperationTypes.AUTOMATE_EXPLORE;
    const activity = unit.activityType, queue = unit.operationQueueSize;
    const operation = typeof unit.getOperationType === "function" ? unit.getOperationType(0) : null;
    const active = Number.isInteger(type) && Number.isInteger(activity) && Number.isInteger(queue) && queue >= 0 && Number.isInteger(operation) &&
      typeof UnitActivityTypes !== "undefined" ? operation === type && (activity === UnitActivityTypes.OPERATION || queue > 0) : null;
    const result = unit.isOnMap === true && unit.isDead !== true && typeof Game.UnitOperations?.canStart === "function"
      ? Game.UnitOperations.canStart(unit.id, "UNITOPERATION_AUTOMATE_EXPLORE", {X: -9999, Y: -9999, UnitAbilityType: -1}, false) : null;
    return {active, operationAllowed: result ? result.Success === true : null,
      failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean),
      note: "Native Scout auto-explore permission/operation evidence only; engine-selected movement may persist on later turns. No future coverage or safety is guaranteed"};
  }
  function upgrade(unit, def) {
    if (unit.isOnMap !== true || typeof Game.UnitCommands?.canStart !== "function" ||
        typeof UnitCommandTypes === "undefined" || !Number.isInteger(UnitCommandTypes.UPGRADE)) return null;
    const result = Game.UnitCommands.canStart(unit.id, UnitCommandTypes.UPGRADE, {X: -9999, Y: -9999, UnitAbilityType: -1}, false);
    const target = Number.isInteger(result?.UnitType) ? GameInfo.Units.lookup(result.UnitType) : null;
    let cost = null;
    if (target && Array.isArray(result?.AdditionalDescription) && result.AdditionalDescription.length === 1) {
      const text = result.AdditionalDescription[0], prefix = `Upgrade to ${name(target.Name)}: `, suffix = " [icon:YIELD_GOLD] Gold";
      if (typeof text === "string" && text.startsWith(prefix) && text.endsWith(suffix)) {
        const amount = text.slice(prefix.length, -suffix.length);
        if (/^(0|[1-9][0-9]*)$/.test(amount) && Number.isSafeInteger(Number(amount))) cost = Number(amount);
      }
    }
    const linked = target && GameInfo.UnitUpgrades?.filter(r => r.Unit === def?.UnitType && r.UpgradeUnit === target.UnitType).length > 0;
    return {targetUnitType: target?.UnitType ?? null, targetName: name(target?.Name), quotedGoldCost: cost,
      quoteSource: cost == null ? null : "exact-native-English-upgrade-description",
      operationAllowed: result?.Success === true, availableNow: result?.Success === true && Boolean(linked) && cost != null &&
        unit.operationQueueSize === 0 && Number.isFinite(player.Treasury?.goldBalance) && player.Treasury.goldBalance >= cost,
      failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean)};
  }
  const owned = player.Units.getUnits().filter(unit => unit.id.owner === id);
  const commanders = owned.filter(unit => unit.isCommanderUnit).map(commander => {
    const candidate = typeof Armies !== "undefined" && typeof Armies?.get === "function" ? Armies.get(commander.armyId) : null;
    const army = candidate?.owner === id ? candidate : null;
    return {commander, packedIds: typeof army?.getUnitIds === "function" ? army.getUnitIds() ?? null : null};
  });
  const packingKnown = commanders.every(entry => entry.packedIds !== null);
  return {
    turn: Game.turn,
    units: owned.map(unit => {
      const def = GameInfo.Units.lookup(unit.type);
      const stats = def ? GameInfo.Unit_Stats.lookup(def.UnitType) : null;
      const experience = unit.Experience;
      const packedBy = commanders.find(entry => entry.packedIds?.some(unitId =>
        unitId.owner === unit.id.owner && unitId.id === unit.id.id && unitId.type === unit.id.type));
      const isPacked = packedBy ? true : packingKnown ? false : null;
      const reinforcementArmy = typeof player.Armies?.getUnitReinforcementCommanderId === "function"
        ? player.Armies.getUnitReinforcementCommanderId(unit.id, id) : null;
      const isReinforcing = reinforcementArmy === -1 ? false
        : Number.isInteger(reinforcementArmy) && reinforcementArmy >= 0 ? true : null;
      const location = unit.location;
      const promotions = [];
      const promotionChoices = [];
      const seenPromotions = new Set();
      if (experience && def?.PromotionClass) {
        for (const set of GameInfo.UnitPromotionClassSets) {
          if (set.PromotionClassType !== def.PromotionClass) continue;
          const discipline = GameInfo.UnitPromotionDisciplines.lookup(set.UnitPromotionDisciplineType);
          const details = GameInfo.UnitPromotionDisciplineDetails.filter(value => value.UnitPromotionDisciplineType === set.UnitPromotionDisciplineType);
          for (const detail of details) {
            const promotion = GameInfo.UnitPromotions.lookup(detail.UnitPromotionType);
            const key = `${set.UnitPromotionDisciplineType}:${detail.UnitPromotionType}`;
            if (!promotion || !discipline || seenPromotions.has(key)) continue;
            seenPromotions.add(key);
            if (experience.hasPromotion(set.UnitPromotionDisciplineType, promotion.UnitPromotionType)) {
              promotions.push({
                id: promotion.UnitPromotionType,
                disciplineId: set.UnitPromotionDisciplineType,
                discipline: name(discipline?.Name),
                name: name(promotion.Name),
                description: name(promotion.Description),
                commendation: Boolean(promotion.Commendation)
              });
            } else {
              const result = Game.UnitCommands.canStart(unit.id, UnitCommandTypes.PROMOTE,
                {PromotionType: Database.makeHash(promotion.UnitPromotionType),
                  PromotionDisciplineType: Database.makeHash(set.UnitPromotionDisciplineType)}, false);
              const pickerEligible = Boolean(experience.canPromote &&
                experience.canEarnPromotion(set.UnitPromotionDisciplineType, promotion.UnitPromotionType, false));
              const prerequisites = [...new Set(details.filter(value => value.UnitPromotionType === promotion.UnitPromotionType)
                .map(value => value.PrereqUnitPromotion).filter(Boolean))];
              promotionChoices.push({
                disciplineId: set.UnitPromotionDisciplineType,
                id: promotion.UnitPromotionType, name: name(promotion.Name), description: name(promotion.Description),
                discipline: name(discipline.Name), commendation: Boolean(promotion.Commendation),
                prerequisites: prerequisites.map(type => ({id: type,
                  purchased: Boolean(experience.hasPromotion(set.UnitPromotionDisciplineType, type))})),
                prerequisiteMode: null,
                pickerEligible, operationAllowed: Boolean(result?.Success),
                availableNow: pickerEligible && Boolean(result?.Success),
                failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean)
              });
            }
          }
        }
      }
      return {
        id: def?.UnitType ?? unit.type,
        instanceId: unit.id.id,
        name: name(unit.name ?? def?.Name),
        typeName: name(def?.Name),
        upgrade: upgrade(unit, def),
        autoExplore: autoExplore(unit, def),
        formationClass: def?.FormationClass ?? null,
        promotionClass: def?.PromotionClass ?? null,
        domain: def?.Domain ?? null,
        location: isPacked === false && unit.isOnMap !== false && location &&
          Number.isInteger(location.x) && Number.isInteger(location.y) && location.x >= 0 && location.y >= 0
          ? {x: location.x, y: location.y}
          : null,
        isPacked, isReinforcing,
        packedInCommander: packedBy ? name(packedBy.commander.name) : null,
        reinforcingCommander: isReinforcing === true ? reinforcementArmy : null,
        commander: Boolean(unit.isCommanderUnit),
        combat: stats ? {
          melee: stats.Combat,
          ranged: stats.RangedCombat,
          bombard: stats.Bombard,
          range: stats.Range,
          baseMoves: def.BaseMoves,
          buildCharges: def.BuildCharges
        } : null,
        health: unit.Health ? {
          current: unit.Health.maxDamage - unit.Health.damage,
          maximum: unit.Health.maxDamage,
          damage: unit.Health.damage
        } : null,
        movement: unit.Movement ? {
          remaining: unit.Movement.movementMovesRemaining,
          maximum: unit.Movement.maxMoves
        } : null,
        experience: experience ? {
          level: experience.getLevel,
          current: experience.experiencePoints,
          nextLevel: experience.experienceToNextLevel,
          promotionPoints: experience.getStoredPromotionPoints,
          commendations: experience.getStoredCommendations,
          promotions,
          promotionChoices
        } : null
      };
    })
  };
})()
