(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const name = key => key ? Locale.compose(key) : null;
  const commanders = player.Units.getUnits().filter(unit => unit.isCommanderUnit).map(commander => {
    const army = Armies.get(commander.armyId);
    return {commander, packedIds: army?.getUnitIds() ?? []};
  });
  return {
    turn: Game.turn,
    units: player.Units.getUnits().map(unit => {
      const def = GameInfo.Units.lookup(unit.type);
      const stats = def ? GameInfo.Unit_Stats.lookup(def.UnitType) : null;
      const experience = unit.Experience;
      const packedBy = commanders.find(entry => entry.packedIds.some(unitId =>
        unitId.owner === unit.id.owner && unitId.id === unit.id.id && unitId.type === unit.id.type));
      const reinforcementArmy = player.Armies?.getUnitReinforcementCommanderId(unit.id, id) ?? -1;
      const promotions = [];
      if (experience && def?.PromotionClass) {
        for (const set of GameInfo.UnitPromotionClassSets) {
          if (set.PromotionClassType !== def.PromotionClass) continue;
          const discipline = GameInfo.UnitPromotionDisciplines.lookup(set.UnitPromotionDisciplineType);
          for (const detail of GameInfo.UnitPromotionDisciplineDetails.filter(value => value.UnitPromotionDisciplineType === set.UnitPromotionDisciplineType)) {
            const promotion = GameInfo.UnitPromotions.lookup(detail.UnitPromotionType);
            if (promotion && experience.hasPromotion(set.UnitPromotionDisciplineType, promotion.UnitPromotionType)) {
              promotions.push({
                discipline: name(discipline?.Name),
                name: name(promotion.Name),
                description: name(promotion.Description),
                commendation: Boolean(promotion.Commendation)
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
        location: unit.location.x >= 0 && unit.location.y >= 0
          ? {x: unit.location.x, y: unit.location.y}
          : null,
        packedInCommander: packedBy ? name(packedBy.commander.name) : null,
        reinforcingCommander: reinforcementArmy === -1 ? null : reinforcementArmy,
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
          promotions
        } : null
      };
    })
  };
})()
