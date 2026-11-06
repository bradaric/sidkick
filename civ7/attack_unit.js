(() => {
  const {unit_id: unitId, target_player: targetPlayer, target_unit_id: targetId, x, y, kind, expected_turn: expectedTurn,
    target_territory: territory = "own_unowned"} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  const {observe_effects:observe=false,observation_radius:radius=1}=queryArguments;
  if(typeof observe!=="boolean"||!Number.isInteger(radius)||radius<1||radius>3)return reject("Optional combat observation must have a bounded1–3 tile radius");
  if (![unitId, targetPlayer, targetId, x, y, expectedTurn].every(v => Number.isInteger(v) && v >= 0) ||
      !["melee", "ranged", "naval", "shore"].includes(kind) || !["own_unowned", "enemy_field"].includes(territory) ||
      (territory === "enemy_field" && !["ranged", "melee", "shore"].includes(kind))) return reject("Exact owned attacker, hostile target identity/tile, supported kind/territory and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0 || targetPlayer === playerId) return reject("An enemy of the local player is required");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn) return reject("A fresh active local turn is required");
  if (player.Diplomacy.hasMet(targetPlayer) !== true || player.Diplomacy.isAtWarWith(targetPlayer) !== true) return reject("Target must already be a met wartime enemy; no war declaration is supported");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), matches = owned.filter(u => u.id.id === unitId);
  if (matches.length !== 1) return reject("No unique owned attacker");
  const unit = matches[0];
  const combatFormation = u => ["FORMATION_CLASS_LAND_COMBAT", "FORMATION_CLASS_NAVAL"].includes(GameInfo.Units.lookup(u.type)?.FormationClass);
  const valid = loc => loc && [loc.x, loc.y].every(v => Number.isInteger(v) && v >= 0) &&
    loc.x < GameplayMap.getGridWidth() && loc.y < GameplayMap.getGridHeight();
  const location = {x, y};
  if (!combatFormation(unit) || unit.isOnMap !== true || unit.isDead === true || unit.isCommanderUnit || unit.isEmbarked !== false || unit.operationQueueSize !== 0 ||
      !["DOMAIN_LAND", "DOMAIN_SEA"].includes(GameInfo.Units.lookup(unit.type)?.Domain) || !valid(unit.location) || !valid(location) ||
      unit.Combat?.isCombat !== true || unit.Combat.canAttack !== true || !Number.isInteger(unit.Combat.attacksRemaining) ||
      unit.Combat.attacksRemaining <= 0 || !Number.isFinite(unit.Movement?.movementMovesRemaining) || unit.Movement.movementMovesRemaining <= 0) return reject("A ready deployed unqueued land/sea noncommander, not embarked, is required");
  if (["naval", "shore"].includes(kind) && (GameInfo.Units.lookup(unit.type)?.Domain !== "DOMAIN_SEA" ||
      GameInfo.Units.lookup(unit.type)?.FormationClass !== "FORMATION_CLASS_NAVAL" || typeof GameplayMap.isWater !== "function" ||
      GameplayMap.isWater(unit.location.x, unit.location.y) !== true)) return reject("Native naval attacks require a naval combat ship on water");
  for (const commander of owned.filter(u => u.isCommanderUnit)) {
    const army = typeof Armies !== "undefined" ? Armies.get(commander.armyId) : null;
    const ids = army?.owner === playerId && typeof army.getUnitIds === "function" ? army.getUnitIds() : null;
    if (!Array.isArray(ids) || ids.some(id => id.owner === playerId && id.id === unitId && id.type === unit.id.type)) return reject("Attacker packing is active or unverified");
  }
  if (typeof player.Armies?.getUnitReinforcementCommanderId !== "function" ||
      player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) return reject("Attacker reinforcement is active or unverified");
  const same = (a, b) => a?.owner === b?.owner && a?.id === b?.id && a?.type === b?.type;
  function target() {
    if (GameplayMap.getRevealedState(playerId, x, y) !== RevealedStates.VISIBLE ||
        GameplayMap.getRevealedState(playerId, unit.location.x, unit.location.y) !== RevealedStates.VISIBLE) return null;
    if (kind === "naval" && (GameplayMap.isWater(x, y) !== true || typeof MapCities === "undefined" ||
        typeof MapCities.getDistrict !== "function" || MapCities.getDistrict(x, y) !== null)) return null;
    if (kind === "shore" && (GameplayMap.isWater(x, y) !== false || GameplayMap.isWater(unit.location.x, unit.location.y) !== true)) return null;
    const owner = GameplayMap.getOwner(x, y);
    if (territory === "own_unowned") {
      if (![playerId, -1].includes(owner)) return null;
    } else {
      // Separate enemy-field modes positively exclude undefended centres as well
      // as districts. Melee may enter this field, never a settlement/capture tile.
      if (owner !== targetPlayer || typeof MapCities === "undefined" || typeof MapCities.getCity !== "function" ||
          typeof MapCities.getDistrict !== "function" || (kind !== "shore" && MapCities.getDistrict(x, y) !== null) ||
          typeof Cities === "undefined" || typeof Cities.get !== "function") return null;
      const cityId = MapCities.getCity(x, y);
      if (cityId?.owner !== targetPlayer || !Number.isInteger(cityId.id) || cityId.id < 0) return null;
      const city = Cities.get(cityId), centre = city?.location;
      if (city?.owner !== targetPlayer || !valid(centre) || (centre.x === x && centre.y === y) ||
          GameplayMap.getRevealedState(playerId, centre.x, centre.y) !== RevealedStates.VISIBLE) return null;
    }
    const district = Game.Combat.getDefensibleDistrict(location);
    if (!district || district.owner !== -1 || district.id !== -1) return null;
    const ids = MapUnits.getUnits(x, y), defender = Game.Combat.getBestDefender(location, unit.id);
    if (!Array.isArray(ids) || ids.length !== 1 || !same(ids[0], defender) || defender?.owner !== targetPlayer ||
        defender.id !== targetId || !Number.isInteger(defender.type) || defender.type < 0 || Visibility.isVisible(playerId, defender) !== true) return null;
    const enemy = Units.get(defender);
    if (kind === "naval" && (!enemy || GameInfo.Units.lookup(enemy.type)?.Domain !== "DOMAIN_SEA" ||
        GameInfo.Units.lookup(enemy.type)?.FormationClass !== "FORMATION_CLASS_NAVAL")) return null;
    if (kind === "shore" && (!enemy || GameInfo.Units.lookup(enemy.type)?.Domain !== "DOMAIN_LAND" ||
        GameInfo.Units.lookup(enemy.type)?.FormationClass !== "FORMATION_CLASS_LAND_COMBAT")) return null;
    if (!enemy || !same(enemy.id, defender) || !combatFormation(enemy) || enemy.Combat?.isCombat !== true || enemy.isCommanderUnit || enemy.isOnMap !== true ||
        enemy.isDead === true || enemy.location?.x !== x || enemy.location?.y !== y ||
        !Number.isFinite(enemy.Health?.damage) || !Number.isFinite(enemy.Health.maxDamage) ||
        enemy.Health.damage < 0 || enemy.Health.damage >= enemy.Health.maxDamage) return null;
    return enemy;
  }
  const enemy = target();
  if (!enemy) return reject("Target is not the exact single visible hostile combat unit on an allowed field tile; no civilian, stack, district or city attacks");
  const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
    location: {x: unit.location.x, y: unit.location.y}, moves: unit.Movement.movementMovesRemaining,
    attacks: unit.Combat.attacksRemaining, hasAttacked: unit.Combat.hasAttacked ?? null,
    targetPlayer, targetUnitId: targetId, targetType: enemy.type, targetComponentType: enemy.id.type, targetDamage: enemy.Health.damage, targetTerritory: territory};
  const args = {X: x, Y: y}, plot = GameplayMap.getIndexFromLocation(location);
  const operation = kind === "melee" ? UnitOperationTypes.MOVE_TO : ["naval", "shore"].includes(kind) ? "UNITOPERATION_NAVAL_ATTACK" : UnitOperationTypes.RANGE_ATTACK;
  if (kind === "melee") {
    if (!Number.isInteger(UnitOperationMoveModifiers.ATTACK) || GameplayMap.getPlotDistance(unit.location.x, unit.location.y, x, y) !== 1 ||
        !Units.getReachableTargets(unit.id)?.includes(plot)) return reject("Melee requires a directly adjacent native attack target");
    args.Modifiers = UnitOperationMoveModifiers.ATTACK;
    if (Game.Combat.testAttackInto(unit.id, args) !== CombatTypes.COMBAT_MELEE) return reject("Native attack test did not confirm melee combat");
  } else {
    const picker = Game.UnitOperations.canStart(unit.id, operation, {}, false);
    const index = Array.isArray(picker?.Plots) ? picker.Plots.indexOf(plot) : -1;
    if (picker?.Success !== true || index < 0 || (kind === "ranged" && (!Array.isArray(picker.Modifiers) || picker.Modifiers.length !== picker.Plots.length ||
        ![OperationPlotModifiers.TARGET, OperationPlotModifiers.INDIRECT].filter(Number.isInteger).includes(picker.Modifiers[index])))) return reject("Target is not offered as attackable by the exact native picker");
  }
  const check = Game.UnitOperations.canStart(unit.id, operation, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native attack is blocked or requires an unsupported confirmation", check?.FailureReasons ?? []);
  const fresh = target();
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false || player.Diplomacy.isAtWarWith(targetPlayer) !== true ||
      unit.id.owner !== playerId || unit.id.type !== before.componentType || unit.type !== before.unitType || unit.isOnMap !== true ||
      unit.operationQueueSize !== 0 || unit.location.x !== before.location.x || unit.location.y !== before.location.y ||
      unit.Movement.movementMovesRemaining !== before.moves || unit.Combat.attacksRemaining !== before.attacks || unit.Combat.canAttack !== true ||
      !fresh || fresh.type !== before.targetType || fresh.id.type !== before.targetComponentType || fresh.Health.damage !== before.targetDamage) return reject("Combatant, target or game context changed during validation");
  const verificationArguments = {unit_id: unitId, attacker_component_type: before.componentType, attacker_type: before.unitType,
    before_attacks: before.attacks, target_player: targetPlayer, target_unit_id: targetId,
    target_component_type: before.targetComponentType, target_type: before.targetType, before_target_damage: before.targetDamage, x, y};
  if(observe){
    if(typeof combatObserver==="undefined")return reject("Fixed internal combat observer is unavailable");
    const observed=combatObserver.capture(playerId,x,y,radius,unit.id);
    if(!observed?.some(u=>u.owner===targetPlayer&&u.instanceId===targetId&&u.componentType===before.targetComponentType))return reject("Complete bounded visible observation baseline unavailable");
    if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||unit.Combat.attacksRemaining!==before.attacks||target()?.Health.damage!==before.targetDamage)return reject("Combat changed while capturing observation baseline");
    try{verificationArguments.observation_token=combatObserver.start(playerId,unit.id,observed,15000);}
    catch(error){return reject("Native bounded combat event observation unavailable");}
    before.observedUnitCount=observed.length;before.observationRadius=radius;
  }
  try{Game.UnitOperations.sendRequest(unit.id, operation, args);}
  catch(error){if(observe)combatObserver.read(verificationArguments.observation_token,true);throw error;}
  return {status: "submitted", before, expected: {unitId, targetPlayer, targetUnitId: targetId, attackObserved: true,...(observe?{observationQuiescent:true}:{})}, verificationArguments,
    verificationScope: observe?"Attack consumption/loss plus primary effect, with captured visible-unit health deltas/departures and exact native local-attack kill attributions. Unknown departures are not kills. Observation is bounded, not complete hidden/out-of-radius/interception/global effect accounting":"Attack consumed/attacker lost plus visible primary-target damage or departure; not a damage forecast, kill or capture claim. Native splash and other side effects may affect additional units and are not fully verified"};
})()
