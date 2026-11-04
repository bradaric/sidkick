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
        defender = {kind: "unit", name: name(unit.name ?? def?.Name), type: def?.UnitType ?? unit.type,
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
  const attackerDef = GameInfo.Units.lookup(attacker.type);
  return {
    turn: Game.turn,
    attacker: {instanceId: attacker.id.id, name: name(attacker.name ?? attackerDef?.Name),
      health: health(attacker), strength: strength(attacker), canAttack: Boolean(attacker.Combat?.canAttack)},
    location, defender, options,
    expectedDamageToAttacker: null, expectedDamageToDefender: null, outcome: null,
    note: "Visible hostile target and read-only operation checks only. Strengths are non-contextual native values, not a damage simulation. No asynchronous simulation or attack request is issued"
  };
})()
