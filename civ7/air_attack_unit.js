(() => {
  const {unit_id: unitId, target_player: targetPlayer, target_unit_id: targetId, x, y, expected_turn: expectedTurn} = queryArguments;
  const sourceCommanderId = queryArguments.source_commander_id, explicitBase = sourceCommanderId !== undefined;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  const {observe_effects:observe=false}=queryArguments;
  if(typeof observe!=="boolean")return reject("Combat observation must be an explicit boolean");
  if (![unitId, targetPlayer, targetId, x, y, expectedTurn, ...(explicitBase ? [sourceCommanderId] : [])].every(v => Number.isInteger(v) && v >= 0)) return reject("Exact aircraft, hostile target identity/tile, optional source commander and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || targetPlayer === playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn ||
      player.Diplomacy.hasMet(targetPlayer) !== true || player.Diplomacy.isAtWarWith(targetPlayer) !== true) return reject("A fresh active local turn and existing met enemy war are required");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), matches = owned.filter(u => u.id.id === unitId);
  if (matches.length !== 1) return reject("One unique owned aircraft is required");
  const unit = matches[0], def = GameInfo.Units.lookup(unit.type);
  const valid = l => l && [l.x, l.y].every(v => Number.isInteger(v) && v >= 0) && l.x < GameplayMap.getGridWidth() && l.y < GameplayMap.getGridHeight();
  const visible = l => valid(l) && GameplayMap.getRevealedState(playerId, l.x, l.y) === RevealedStates.VISIBLE;
  const same = (a, b) => a?.owner === b?.owner && a?.id === b?.id && a?.type === b?.type;
  if (unit.isOnMap !== false || unit.isDead === true || unit.isCommanderUnit || unit.operationQueueSize !== 0 || def?.Domain !== "DOMAIN_AIR" || def.FormationClass !== "FORMATION_CLASS_AIR" ||
      unit.Combat?.isCombat !== true || unit.Combat.canAttack !== true || !Number.isInteger(unit.Combat.attacksRemaining) || unit.Combat.attacksRemaining <= 0 ||
      !Number.isFinite(unit.Movement?.movementMovesRemaining) || unit.Movement.movementMovesRemaining <= 0 ||
      typeof player.Armies?.getUnitReinforcementCommanderId !== "function" || player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) return reject("A ready unqueued nonreinforcing aircraft stationed in a captured city Aerodrome is required");
  function armies() {
    if (typeof Armies === "undefined") return null;
    const records = [], seen = new Set();
    for (const c of owned.filter(u => u.isCommanderUnit)) {
      const a = Armies.get(c.armyId), ids = a?.getUnitIds?.(), identity = a?.getCommanderId?.();
      if (a?.owner !== playerId || !Number.isInteger(a.localId) || a.localId < 0 || !same(identity, c.id) || !Array.isArray(ids) ||
          ids.some(id => id.owner !== playerId || id.id === c.id.id || owned.filter(u => same(u.id, id)).length !== 1)) return null;
      const members = ids.map(id => id.id).sort((a, b) => a - b);
      for (const id of members) {if (seen.has(id)) return null; seen.add(id);}
      records.push({commanderId: c.id.id, commanderType: c.type, componentType: c.id.type, armyId: a.localId, packedUnitIds: members});
    }
    records.sort((a, b) => a.commanderId - b.commanderId);
    return new Set(records.map(a => a.commanderId)).size === records.length ? records : null;
  }
  const baseline = armies(), containing = baseline?.filter(a => a.packedUnitIds.includes(unitId));
  if (!containing || containing.length !== 1) return reject("Complete unique source and other army membership must be known");
  const source = containing[0], base = owned.find(u => u.id.id === source.commanderId);
  const baseKind = () => base?.isAerodromeCommander === true ? "city" : base && GameInfo.Units.lookup(base.type)?.UnitType === "UNIT_CARRIER_COMMANDER" ? "carrier" : base?.isSquadronCommander === true ? "squadron" : null;
  const kind = baseKind();
  const baseLocationValid = () => visible(base.location) && (kind === "city" ? GameplayMap.getOwner(base.location.x,base.location.y) === playerId : [-1,playerId].includes(GameplayMap.getOwner(base.location.x,base.location.y))) &&
    (kind !== "carrier" || GameplayMap.isWater(base.location.x,base.location.y) === true);
  if (!kind || (explicitBase ? base?.id.id !== sourceCommanderId : kind !== "city") || base.isOnMap !== true || base.isDead === true || base.operationQueueSize !== 0 || !baseLocationValid() ||
      base.armyId?.owner !== playerId || base.armyId.id !== source.armyId || !Number.isInteger(base.armyId.type) ||
      !same(unit.armyId, base.armyId)) return reject("Source must be the exact visible owned captured air base; non-city sources require explicit source_commander_id");
  const cities = player.Cities.getCities().filter(c => c.id.owner === playerId && c.location?.x === base.location.x && c.location?.y === base.location.y);
  if (kind === "city" && cities.length !== 1) return reject("Source Aerodrome must be at one exact owned city centre");
  const sourceBase = {commanderId: base.id.id, commanderType: base.type, componentType: base.id.type, armyId: source.armyId, armyComponentType: base.armyId.type,
    location: {x: base.location.x, y: base.location.y}, kind, cityId: kind === "city" ? cities[0].id.id : null, cityComponentType: kind === "city" ? cities[0].id.type : null};
  function target() {
    if (!visible({x, y}) || ![-1, playerId].includes(GameplayMap.getOwner(x, y)) || MapCities.getDistrict(x, y) !== null) return null;
    const district = Game.Combat.getDefensibleDistrict({x, y}), ids = MapUnits.getUnits(x, y), id = Game.Combat.getBestDefender({x, y}, unit.id);
    if (!district || district.owner !== -1 || district.id !== -1 || !Array.isArray(ids) || ids.length !== 1 || !same(ids[0], id) ||
        id?.owner !== targetPlayer || id.id !== targetId || !Number.isInteger(id.type) || id.type < 0 || Visibility.isVisible(playerId, id) !== true) return null;
    const enemy = Units.get(id), d = enemy ? GameInfo.Units.lookup(enemy.type) : null;
    if (!enemy || !same(enemy.id, id) || enemy.isOnMap !== true || enemy.isDead === true || enemy.isCommanderUnit || enemy.Combat?.isCombat !== true ||
        !["DOMAIN_LAND", "DOMAIN_SEA"].includes(d?.Domain) || !["FORMATION_CLASS_LAND_COMBAT", "FORMATION_CLASS_NAVAL"].includes(d.FormationClass) || enemy.location?.x !== x || enemy.location?.y !== y ||
        !Number.isFinite(enemy.Health?.damage) || !Number.isFinite(enemy.Health.maxDamage) || enemy.Health.damage < 0 || enemy.Health.damage >= enemy.Health.maxDamage) return null;
    return enemy;
  }
  const enemy = target();
  if (!enemy) return reject("Exact single visible hostile land/sea combat unit on an own/unowned non-district field is required");
  const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type, moves: unit.Movement.movementMovesRemaining,
    attacks: unit.Combat.attacksRemaining, sourceBase, armies: baseline, targetType: enemy.type, targetComponentType: enemy.id.type, targetDamage: enemy.Health.damage};
  const operation = "UNITOPERATION_AIR_ATTACK", args = {X: x, Y: y}, picker = Game.UnitOperations.canStart(unit.id, operation, {}, false);
  if (picker?.Success !== true || !Array.isArray(picker.Plots) || !picker.Plots.includes(GameplayMap.getIndexFromLocation({x, y}))) return reject("Exact target is not offered by native AIR_ATTACK", picker?.FailureReasons ?? []);
  const check = Game.UnitOperations.canStart(unit.id, operation, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native air strike failed or needs confirmation", check?.FailureReasons ?? []);
  const fresh = target();
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      player.Diplomacy.isAtWarWith(targetPlayer) !== true || unit.id.owner !== playerId || unit.id.type !== before.componentType || unit.type !== before.unitType || unit.isOnMap !== false || unit.isDead === true ||
      unit.operationQueueSize !== 0 || unit.Combat.canAttack !== true || unit.Combat.attacksRemaining !== before.attacks || unit.Movement.movementMovesRemaining !== before.moves || !same(unit.armyId, base.armyId) ||
      base.type !== sourceBase.commanderType || base.id.type !== sourceBase.componentType || baseKind() !== kind || base.isOnMap !== true || base.isDead === true || base.operationQueueSize !== 0 ||
      base.armyId?.owner !== playerId || base.armyId.id !== sourceBase.armyId || base.armyId.type !== sourceBase.armyComponentType ||
      base.location.x !== sourceBase.location.x || base.location.y !== sourceBase.location.y || !baseLocationValid() ||
      (kind === "city" && (cities[0].id.owner !== playerId || cities[0].id.id !== sourceBase.cityId || cities[0].id.type !== sourceBase.cityComponentType ||
      cities[0].location.x !== sourceBase.location.x || cities[0].location.y !== sourceBase.location.y)) || JSON.stringify(armies()) !== JSON.stringify(baseline) ||
      player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1 || !fresh || fresh.type !== before.targetType || fresh.id.type !== before.targetComponentType || fresh.Health.damage !== before.targetDamage) return reject("Aircraft, base, army membership, target or context changed during validation");
  const verificationArguments = {unit_id: unitId, unit_type: before.unitType, component_type: before.componentType, before_attacks: before.attacks, baseline_armies: baseline, source_base: sourceBase,
    target_player: targetPlayer, target_unit_id: targetId, target_type: before.targetType, target_component_type: before.targetComponentType, before_target_damage: before.targetDamage, x, y};
  if(observe){
    if(typeof combatObserver==="undefined")return reject("Fixed native combat observer unavailable");
    const baseline=combatObserver.capture(playerId,x,y,1,unit.id);
    if(!baseline?.some(u=>u.owner===targetPlayer&&u.instanceId===targetId&&u.componentType===before.targetComponentType))return reject("Bounded visible air-strike baseline unavailable");
    if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||JSON.stringify(armies())!==JSON.stringify(before.armies)||unit.Combat.attacksRemaining!==before.attacks||target()?.Health.damage!==before.targetDamage)return reject("Air strike changed during observation capture");
    try{verificationArguments.observation_token=combatObserver.start(playerId,unit.id,baseline,15000);}catch(error){return reject("Native air-strike observation unavailable");}
  }
  try{Game.UnitOperations.sendRequest(unit.id, operation, args);}catch(error){if(observe)combatObserver.read(verificationArguments.observation_token,true);throw error;}
  return {status: "submitted", before, expected: {unitId, targetPlayer, targetUnitId: targetId, airAttackObserved: true,...(observe?{observationQuiescent:true}:{})}, verificationArguments,
    verificationScope: "Aircraft consumption/loss plus primary effect and surviving base membership. Optional bounded visible health/native exact kill evidence waits500ms captured-event quiet, not full interception/splash/global effects, district strike or mission recharge"};
})()
