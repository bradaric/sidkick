(() => {
  const {unit_id: unitId, target_player: targetPlayer, district_id: districtId, x, y, expected_turn: expectedTurn, domain = "DOMAIN_LAND"} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (!["DOMAIN_LAND", "DOMAIN_SEA"].includes(domain) || ![unitId, targetPlayer, districtId, x, y, expectedTurn].every(v => Number.isInteger(v) && v >= 0)) return reject("Exact attacker, hostile district identity/tile, supported domain and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || targetPlayer === playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      Game.turn !== expectedTurn || player.Diplomacy.hasMet(targetPlayer) !== true || player.Diplomacy.isAtWarWith(targetPlayer) !== true) return reject("A fresh active turn and existing met enemy war are required");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), matches = owned.filter(u => u.id.id === unitId);
  if (matches.length !== 1) return reject("No unique owned attacker");
  const unit = matches[0], def = GameInfo.Units.lookup(unit.type);
  const valid = l => l && [l.x, l.y].every(v => Number.isInteger(v) && v >= 0) && l.x < GameplayMap.getGridWidth() && l.y < GameplayMap.getGridHeight();
  if (unit.isOnMap !== true || unit.isDead === true || unit.isCommanderUnit || unit.isEmbarked !== false || unit.operationQueueSize !== 0 ||
      def?.Domain !== domain || def.FormationClass !== (domain === "DOMAIN_LAND" ? "FORMATION_CLASS_LAND_COMBAT" : "FORMATION_CLASS_NAVAL") || !valid(unit.location) || !valid({x, y}) ||
      GameplayMap.getRevealedState(playerId, unit.location.x, unit.location.y) !== RevealedStates.VISIBLE || unit.Combat?.isCombat !== true || unit.Combat.canAttack !== true ||
      !Number.isInteger(unit.Combat.attacksRemaining) || unit.Combat.attacksRemaining <= 0 || !(unit.Combat.rangedStrength > 0 || unit.Combat.bombardStrength > 0) ||
      !Number.isFinite(unit.Movement?.movementMovesRemaining) || unit.Movement.movementMovesRemaining <= 0) return reject("A ready deployed unqueued unembarked land ranged/siege combat unit is required");
  if (domain === "DOMAIN_SEA" && (GameplayMap.isWater(unit.location.x, unit.location.y) !== true || GameplayMap.isWater(x, y) !== false)) return reject("Naval shore bombardment requires water source and land district target");
  function packingClear() {
    for (const c of owned.filter(u => u.isCommanderUnit)) {
      const a = typeof Armies !== "undefined" ? Armies.get(c.armyId) : null, ids = a?.owner === playerId ? a.getUnitIds?.() : null;
      if (!Array.isArray(ids) || ids.some(id => id.owner === playerId && id.id === unitId && id.type === unit.id.type)) return false;
    }
    return typeof player.Armies?.getUnitReinforcementCommanderId === "function" && player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) === -1;
  }
  if (!packingClear()) return reject("Attacker packing/reinforcement is active or unknown");
  const same = (a, b) => a?.owner === b?.owner && a?.id === b?.id && a?.type === b?.type;
  function target() {
    if (GameplayMap.getRevealedState(playerId, x, y) !== RevealedStates.VISIBLE || GameplayMap.getOwner(x, y) !== targetPlayer ||
        typeof MapCities === "undefined" || typeof MapCities.getDistrict !== "function") return null;
    const id = Game.Combat.getDefensibleDistrict({x, y}), actual = MapCities.getDistrict(x, y);
    if (id?.owner !== targetPlayer || id.id !== districtId || !Number.isInteger(id.type) || id.type < 0 || !same(id, actual)) return null;
    const d = Districts.get(id);
    if (!d || !same(d.id, id) || d.owner !== targetPlayer || !Number.isInteger(d.type) || d.location?.x !== x || d.location?.y !== y ||
        !Number.isFinite(d.getMaxDamage) || d.getMaxDamage <= 0 || !Number.isFinite(d.getDamage) || d.getDamage < 0 || d.getDamage >= d.getMaxDamage) return null;
    return d;
  }
  const district = target();
  if (!district) return reject("Exact visible hostile defensible district with remaining health is required; no undefended tile or implicit war");
  const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
    location: {x: unit.location.x, y: unit.location.y}, moves: unit.Movement.movementMovesRemaining, attacks: unit.Combat.attacksRemaining,
    districtType: district.type, districtComponentType: district.id.type, districtDamage: district.getDamage, districtMaxDamage: district.getMaxDamage};
  const operation = domain === "DOMAIN_SEA" ? "UNITOPERATION_NAVAL_ATTACK" : UnitOperationTypes.RANGE_ATTACK, args = {X: x, Y: y};
  const picker = Game.UnitOperations.canStart(unit.id, operation, {}, false), plot = GameplayMap.getIndexFromLocation({x, y});
  const index = Array.isArray(picker?.Plots) ? picker.Plots.indexOf(plot) : -1;
  if (picker?.Success !== true || index < 0 || (domain === "DOMAIN_LAND" && (!Array.isArray(picker.Modifiers) || picker.Modifiers.length !== picker.Plots.length ||
      ![OperationPlotModifiers.TARGET, OperationPlotModifiers.INDIRECT].filter(Number.isInteger).includes(picker.Modifiers[index])))) return reject("Exact district is not an attackable native picker plot");
  const check = Game.UnitOperations.canStart(unit.id, operation, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native district ranged attack failed or needs confirmation", check?.FailureReasons ?? []);
  const fresh = target();
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      player.Diplomacy.isAtWarWith(targetPlayer) !== true || unit.id.owner !== playerId || unit.id.type !== before.componentType || unit.type !== before.unitType ||
      unit.isOnMap !== true || unit.operationQueueSize !== 0 || unit.isEmbarked !== false || unit.location.x !== before.location.x || unit.location.y !== before.location.y ||
      (domain === "DOMAIN_SEA" && (GameplayMap.isWater(unit.location.x, unit.location.y) !== true || GameplayMap.isWater(x, y) !== false)) ||
      unit.Combat.canAttack !== true || unit.Combat.attacksRemaining !== before.attacks || unit.Movement.movementMovesRemaining !== before.moves || !packingClear() ||
      !fresh || fresh.type !== before.districtType || fresh.id.type !== before.districtComponentType || fresh.getDamage !== before.districtDamage || fresh.getMaxDamage !== before.districtMaxDamage) return reject("Attacker, district, packing or context changed during validation");
  const verificationArguments = {unit_id: unitId, attacker_type: before.unitType, attacker_component_type: before.componentType, before_attacks: before.attacks,
    target_player: targetPlayer, district_id: districtId, district_type: before.districtType, district_component_type: before.districtComponentType, before_district_damage: before.districtDamage, x, y};
  Game.UnitOperations.sendRequest(unit.id, operation, args);
  return {status: "submitted", before, expected: {unitId, targetPlayer, districtId, districtAttackObserved: true}, verificationArguments,
    verificationScope: "Attack spent/attacker lost plus visible primary district damage/departure. Native garrison, retaliation or secondary effects may occur and are not completely verified; no entry/capture or destruction claim"};
})()
