(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const {unit_id: unitId, x, y} = queryArguments;
  if (!Number.isInteger(unitId) || unitId < 0) throw Error("An owned unit instance ID is required");
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 ||
    x >= GameplayMap.getGridWidth() || y >= GameplayMap.getGridHeight() ||
    GameplayMap.getRevealedState(id, x, y) !== RevealedStates.VISIBLE) throw Error("Target must be a currently visible tile");
  const player = Players.get(id);
  const matches = player.Units.getUnits().filter(unit => unit.id.id === unitId);
  if (matches.length !== 1) throw Error("No unique owned unit matches this instance ID");
  const attacker = matches[0];
  const deployed = Number.isInteger(attacker.location?.x) && Number.isInteger(attacker.location?.y) &&
    attacker.location.x >= 0 && attacker.location.y >= 0 &&
    attacker.location.x < GameplayMap.getGridWidth() && attacker.location.y < GameplayMap.getGridHeight();
  const name = key => key ? Locale.compose(key) : null;
  const location = {x, y};
  const hostile = componentId => Number.isInteger(componentId?.owner) && componentId.owner >= 0 &&
    componentId.owner !== id && player.Diplomacy.hasMet(componentId.owner) && player.Diplomacy.isAtWarWith(componentId.owner);
  const strength = unit => unit.Combat ? {melee: unit.Combat.getMeleeStrength(false),
    ranged: unit.Combat.rangedStrength, bombard: unit.Combat.bombardStrength} : null;
  const health = unit => unit.Health ? {current: unit.Health.maxDamage - unit.Health.damage, maximum: unit.Health.maxDamage} : null;
  let defender = null;
  const districtId = deployed ? Game.Combat.getDefensibleDistrict(location) : null;
  if (hostile(districtId)) {
    const district = Districts.get(districtId);
    if (district) defender = {
      kind: "district", name: name(GameInfo.Districts.lookup(district.type)?.Name),
      civilization: name(Players.get(district.owner)?.civilizationFullName),
      health: Number.isFinite(district.getMaxDamage) && Number.isFinite(district.getDamage)
        ? {current: district.getMaxDamage - district.getDamage, maximum: district.getMaxDamage} : null,
      strength: null
    };
  } else if (deployed) {
    const defenderId = Game.Combat.getBestDefender(location, attacker.id);
    if (hostile(defenderId) && Visibility.isVisible(id, defenderId)) {
      const unit = Units.get(defenderId);
      if (unit) {
        const def = GameInfo.Units.lookup(unit.type);
        defender = {kind: "unit", ownerId: defenderId.owner, instanceId: defenderId.id, componentType: defenderId.type,
          name: name(unit.name ?? def?.Name), type: def?.UnitType ?? unit.type,
          civilization: name(Players.get(unit.owner)?.civilizationFullName), health: health(unit), strength: strength(unit)};
      }
    }
  }
  const options = [];
  if (defender && attacker.Combat?.isCombat && attacker.Combat.canAttack) {
    const attacks = [
      {kind: "melee", operation: UnitOperationTypes.MOVE_TO, modifiers: UnitOperationMoveModifiers.ATTACK},
      {kind: "ranged", operation: UnitOperationTypes.RANGE_ATTACK},
      {kind: "naval", operation: "UNITOPERATION_NAVAL_ATTACK"},
      {kind: "air", operation: "UNITOPERATION_AIR_ATTACK"}
    ];
    for (const attack of attacks) {
      const args = {X: x, Y: y};
      if (attack.modifiers != null) args.Modifiers = attack.modifiers;
      const result = Game.UnitOperations.canStart(attacker.id, attack.operation, args, false);
      options.push({kind: attack.kind, availableNow: Boolean(result?.Success),
        failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean)});
    }
  }
  let commanderAttack = null, focusedLandRangedAttack = null;
  if (defender && deployed && attacker.isCommanderUnit) {
    const result = Game.UnitCommands.canStart(attacker.id, "UNITCOMMAND_COMMANDER_ATTACK", {}, false);
    const targetInNativePlots = (result?.Plots ?? []).includes(GameplayMap.getIndexFromLocation(location));
    commanderAttack = {
      operationAllowed: result ? Boolean(result.Success) : null, targetInNativePlots,
      availableNow: Boolean(result?.Success) && targetInNativePlots,
      failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean)
    };
    const focused = Game.UnitCommands.canStart(attacker.id, "UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED", {}, false);
    const offered = Array.isArray(focused?.Plots) && focused.Plots.includes(GameplayMap.getIndexFromLocation(location));
    const selected = focused?.Success === true && offered
      ? Game.UnitCommands.canStart(attacker.id, "UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED", {X: x, Y: y}, false) : null;
    focusedLandRangedAttack = {operationAllowed: focused?.Success === true, targetInNativePlots: offered,
      selectedTargetAllowed: selected?.Success === true, availableNow: focused?.Success === true && offered && selected?.Success === true,
      failureReasons: [...(focused?.FailureReasons ?? []), ...(selected?.FailureReasons ?? [])].map(name).filter(Boolean),
      scope: "Engine-selected nearby land-ranged units; primary target only, native splash may affect adjacent enemies"};
  }
  const terrain = GameInfo.Terrains.lookup(GameplayMap.getTerrainType(x, y));
  const feature = GameInfo.Features.lookup(GameplayMap.getFeatureType(x, y));
  const biome = GameInfo.Biomes.lookup(GameplayMap.getBiomeType(x, y));
  const targetTerrain = {
    terrain: terrain ? {id: terrain.TerrainType, name: name(terrain.Name), definitionDefenseModifier: terrain.DefenseModifier ?? null} : null,
    feature: feature ? {id: feature.FeatureType, name: name(feature.Name), definitionDefenseModifier: feature.DefenseModifier ?? null} : null,
    biome: biome ? {id: biome.BiomeType, name: name(biome.Name)} : null,
    note: "Visible target definition values only, not an applied or combined combat-defense total"
  };
  const modifierKeys = ["combatStrengthModifier", "rangedStrengthModifier", "bombardStrengthModifier", "antiAirStrengthModifier",
    "friendlyTerritoryCombatMod", "flankingAttackPercentageModifier", "flankingAttackStrengthModifier", "canMoveAfterAttacking"];
  const reportedModifiers = attacker.Combat?.combatModifiers;
  const attackerDef = GameInfo.Units.lookup(attacker.type);
  return {
    turn: Game.turn,
    attacker: {instanceId: attacker.id.id, name: name(attacker.name ?? attackerDef?.Name),
      health: health(attacker), strength: strength(attacker), canAttack: Boolean(attacker.Combat?.canAttack),
      readiness: {
        deployed, attacksRemaining: attacker.Combat?.attacksRemaining ?? null,
        maximumAttacks: attacker.Combat?.maxNumAttacks ?? null, attackRange: attacker.Combat?.attackRange ?? null,
        antiAirStrength: attacker.Combat?.antiAirStrength ?? null,
        canAttackAfterMoving: attacker.Combat?.canAttackAfterMoving ?? null,
        hasAttacked: attacker.Combat?.hasAttacked ?? null, hasMoved: attacker.Movement?.hasMoved ?? null,
        movementRemaining: attacker.Movement?.movementMovesRemaining ?? null,
        stoppedByZOC: attacker.Combat?.hasMovedIntoZOC ?? null,
        fortified: attacker.isFortified ?? null, embarked: attacker.isEmbarked ?? null
      },
      reportedModifiers: reportedModifiers ? Object.fromEntries(modifierKeys.map(key => [key, reportedModifiers[key] ?? null])) : null
    },
    location, targetTerrain, defender, options, commanderAttack, focusedLandRangedAttack,
    contextualStrength: null,
    expectedDamageToAttacker: null, expectedDamageToDefender: null, outcome: null,
    note: "Visible hostile target and read-only operation/commander-command checks only. Strengths, local reported modifiers and terrain definition values are separate evidence, not contextual totals or a damage simulation. Commander availability requires this target in the native plot list; no other plots are returned. No asynchronous simulation or attack request is issued"
  };
})()
