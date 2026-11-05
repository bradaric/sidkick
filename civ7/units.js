(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const name = key => key ? Locale.compose(key) : null;
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
