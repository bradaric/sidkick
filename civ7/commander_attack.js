(() => {
  const {commander_id: commanderId, target_player: targetPlayer, target_unit_id: targetId, x, y, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  const {observe_effects:observe=false}=queryArguments;
  if(typeof observe!=="boolean")return reject("Combat observation must be an explicit boolean");
  if (![commanderId, targetPlayer, targetId, x, y, expectedTurn].every(v => Number.isInteger(v) && v >= 0)) return reject("Exact commander, hostile identity/tile and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || targetPlayer === playerId || !player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      Game.turn !== expectedTurn || player.Diplomacy.hasMet(targetPlayer) !== true || player.Diplomacy.isAtWarWith(targetPlayer) !== true) return reject("A fresh active turn and existing met enemy war are required");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), matches = owned.filter(u => u.id.id === commanderId);
  if (matches.length !== 1) return reject("No unique owned commander");
  const commander = matches[0], domain = GameInfo.Units.lookup(commander.type)?.Domain;
  const valid = l => l && [l.x, l.y].every(v => Number.isInteger(v) && v >= 0) && l.x < GameplayMap.getGridWidth() && l.y < GameplayMap.getGridHeight();
  if (commander.isCommanderUnit !== true || commander.isOnMap !== true || commander.isDead === true || commander.isEmbarked !== false || commander.operationQueueSize !== 0 ||
      !["DOMAIN_LAND", "DOMAIN_SEA"].includes(domain) || !valid(commander.location) || !valid({x, y}) ||
      !Number.isFinite(commander.Movement?.movementMovesRemaining) || commander.Movement.movementMovesRemaining <= 0 ||
      GameplayMap.getRevealedState(playerId, commander.location.x, commander.location.y) !== RevealedStates.VISIBLE ||
      GameplayMap.isWater(commander.location.x, commander.location.y) !== (domain === "DOMAIN_SEA") ||
      GameplayMap.getPlotDistance(commander.location.x, commander.location.y, x, y) !== 1) return reject("A mobile deployed unqueued unembarked same-domain commander adjacent to the target is required");
  const army = typeof Armies !== "undefined" ? Armies.get(commander.armyId) : null, identity = army?.getCommanderId?.();
  if (army?.owner !== playerId || !Number.isInteger(army.localId) || army.localId < 0 || identity?.owner !== playerId || identity.id !== commanderId || identity.type !== commander.id.type) return reject("Owned commander army identity is unverified");
  function membership() {
    const ids = army.getUnitIds?.();
    if (!Array.isArray(ids) || ids.length > 16 || ids.some(id => id.owner !== playerId || id.id === commanderId || owned.filter(u => u.id.id === id.id && u.id.type === id.type).length !== 1)) return null;
    const packed = ids.map(id => id.id).sort((a, b) => a - b);
    return new Set(packed).size === packed.length ? packed : null;
  }
  const packed = membership();
  if (!packed) return reject("Packed membership must be completely known");
  const same = (a, b) => a?.owner === b?.owner && a?.id === b?.id && a?.type === b?.type;
  function target() {
    if (GameplayMap.getRevealedState(playerId, x, y) !== RevealedStates.VISIBLE || ![-1, playerId].includes(GameplayMap.getOwner(x, y)) ||
        GameplayMap.isWater(x, y) !== (domain === "DOMAIN_SEA") || typeof MapCities === "undefined" || typeof MapCities.getDistrict !== "function" || MapCities.getDistrict(x, y) !== null) return null;
    const district = Game.Combat.getDefensibleDistrict({x, y}), ids = MapUnits.getUnits(x, y);
    if (!district || district.owner !== -1 || district.id !== -1 || !Array.isArray(ids) || ids.length !== 1) return null;
    const id = Game.Combat.getBestDefender({x, y}, commander.id);
    if (!same(id, ids[0]) || id?.owner !== targetPlayer || id.id !== targetId || !Number.isInteger(id.type) || id.type < 0 || Visibility.isVisible(playerId, id) !== true) return null;
    const u = Units.get(id), def = u ? GameInfo.Units.lookup(u.type) : null;
    if (!u || !same(u.id, id) || u.isOnMap !== true || u.isDead === true || u.isCommanderUnit || u.Combat?.isCombat !== true || def?.Domain !== domain ||
        def.FormationClass !== (domain === "DOMAIN_LAND" ? "FORMATION_CLASS_LAND_COMBAT" : "FORMATION_CLASS_NAVAL") || u.location?.x !== x || u.location?.y !== y ||
        !Number.isFinite(u.Health?.damage) || !Number.isFinite(u.Health.maxDamage) || u.Health.damage < 0 || u.Health.damage >= u.Health.maxDamage) return null;
    return u;
  }
  const enemy = target();
  if (!enemy) return reject("One exact visible hostile same-domain combat target on an adjacent own/unowned field is required; no district, city, stack or civilian");
  const before = {turn: Game.turn, age: Game.age, playerId, unitId: commanderId, unitType: commander.type, componentType: commander.id.type,
    location: {x: commander.location.x, y: commander.location.y}, moves: commander.Movement.movementMovesRemaining,
    attacks: Number.isInteger(commander.Combat?.attacksRemaining) ? commander.Combat.attacksRemaining : null, armyId: army.localId, packedUnitIds: packed,
    targetType: enemy.type, targetComponentType: enemy.id.type, targetDamage: enemy.Health.damage};
  const command = "UNITCOMMAND_COMMANDER_ATTACK", args = {X: x, Y: y};
  const picker = Game.UnitCommands.canStart(commander.id, command, {}, false);
  if (picker?.Success !== true || !Array.isArray(picker.Plots) || !picker.Plots.includes(GameplayMap.getIndexFromLocation({x, y}))) return reject("Exact target is not offered by native commander ability", picker?.FailureReasons ?? []);
  const check = Game.UnitCommands.canStart(commander.id, command, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native commander attack failed or needs confirmation", check?.FailureReasons ?? []);
  const fresh = target();
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      player.Diplomacy.isAtWarWith(targetPlayer) !== true || commander.id.owner !== playerId || commander.id.type !== before.componentType || commander.type !== before.unitType ||
      commander.isOnMap !== true || commander.operationQueueSize !== 0 || commander.location.x !== before.location.x || commander.location.y !== before.location.y ||
      commander.Movement.movementMovesRemaining !== before.moves || JSON.stringify(membership()) !== JSON.stringify(packed) ||
      !fresh || fresh.type !== before.targetType || fresh.id.type !== before.targetComponentType || fresh.Health.damage !== before.targetDamage) return reject("Commander, membership, target or context changed during validation");
  const verificationArguments = {unit_id: commanderId, attacker_component_type: before.componentType, attacker_type: before.unitType, before_attacks: 1,
    commander_attack: true, before_moves: before.moves, commander_before_attacks: before.attacks, baseline_army_id: before.armyId,
    baseline_packed_unit_ids: packed, commander_location: before.location, target_player: targetPlayer, target_unit_id: targetId,
    target_component_type: before.targetComponentType, target_type: before.targetType, before_target_damage: before.targetDamage, x, y};
  if(observe){
    if(typeof combatObserver==="undefined")return reject("Fixed native combat observer unavailable");
    const baseline=combatObserver.capture(playerId,x,y,1,commander.id);
    if(!baseline?.some(u=>u.owner===targetPlayer&&u.instanceId===targetId&&u.componentType===before.targetComponentType))return reject("Bounded visible commander-attack baseline unavailable");
    if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||JSON.stringify(membership())!==JSON.stringify(packed)||commander.Movement.movementMovesRemaining!==before.moves||target()?.Health.damage!==before.targetDamage)return reject("Commander attack changed during observation capture");
    try{verificationArguments.observation_token=combatObserver.start(playerId,commander.id,baseline,15000);}catch(error){return reject("Native commander-attack observation unavailable");}
  }
  try{Game.UnitCommands.sendRequest(commander.id, command, args);}catch(error){if(observe)combatObserver.read(verificationArguments.observation_token,true);throw error;}
  return {status: "submitted", before, expected: {unitId: commanderId, targetPlayer, targetUnitId: targetId, abilityAttackObserved: true,...(observe?{observationQuiescent:true}:{})}, verificationArguments,
    verificationScope: "Commander spend plus primary effect, stable source and packing. Optional bounded visible health/native exact unit kills wait500ms captured-event quiet; not independent ability-charge accounting or complete hidden/global effects"};
})()
