(() => {
  const {unit_id: unitId, target_unit_type: targetType, max_gold_cost: cap, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (![unitId, expectedTurn].every(v => Number.isInteger(v) && v >= 0) || typeof targetType !== "string" || !targetType ||
      !Number.isFinite(cap) || cap < 0) return reject("An owned unit, exact upgrade target, finite Gold cap and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId);
  const units = owned.filter(u => u.id.id === unitId);
  if (units.length !== 1 || units[0].isOnMap !== true || units[0].isDead === true || units[0].operationQueueSize !== 0) return reject("A unique owned deployed unqueued unit is required");
  const unit = units[0], from = GameInfo.Units.lookup(unit.type), target = GameInfo.Units.lookup(targetType);
  if (!from || target?.UnitType !== targetType || !Number.isInteger(target.$hash)) return reject("Unit/target type identity is unverified");
  const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: from.UnitType,
    unitHash: unit.type, componentType: unit.id.type, gold: player.Treasury?.goldBalance ?? null};
  if (from.UnitType === targetType) return {status: "already_active", before};
  if (!GameInfo.UnitUpgrades.filter(r => r.Unit === from.UnitType && r.UpgradeUnit === targetType).length) return reject("Target is not this unit's direct loaded upgrade");
  const baselineIds = owned.map(u => u.id.id), location = unit.location;
  if (baselineIds.some(v => !Number.isInteger(v) || v < 0) || new Set(baselineIds).size !== baselineIds.length ||
      !location || ![location.x, location.y].every(v => Number.isInteger(v) && v >= 0)) return reject("Owned unit inventory or source location is unverified");
  before.location = {x: location.x, y: location.y};
  const args = {X: -9999, Y: -9999, UnitAbilityType: -1};
  // Native UPGRADE exposes only a localized description, not a numeric cost.
  // Accept the observed exact English quote; never derive costs or parse other formats loosely.
  function quote(check) {
    if (check?.Success !== true || GameInfo.Units.lookup(check.UnitType)?.UnitType !== targetType ||
        !Array.isArray(check.AdditionalDescription) || check.AdditionalDescription.length !== 1) return null;
    const text = check.AdditionalDescription[0], prefix = `Upgrade to ${Locale.compose(target.Name)}: `, suffix = " [icon:YIELD_GOLD] Gold";
    if (typeof text !== "string" || !text.startsWith(prefix) || !text.endsWith(suffix)) return null;
    const amount = text.slice(prefix.length, -suffix.length);
    return /^(0|[1-9][0-9]*)$/.test(amount) && Number.isSafeInteger(Number(amount)) ? Number(amount) : null;
  }
  const check = Game.UnitCommands.canStart(unit.id, UnitCommandTypes.UPGRADE, args, false), cost = quote(check);
  if (cost == null || cost > cap || !Number.isFinite(before.gold) || before.gold < cost) return reject("Native upgrade is blocked, price format is unsupported, or quote exceeds Gold cap/balance", check?.FailureReasons ?? []);
  const fresh = Game.UnitCommands.canStart(unit.id, UnitCommandTypes.UPGRADE, args, false);
  if (quote(fresh) !== cost || Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || unit.id.owner !== playerId ||
      unit.type !== before.unitHash || unit.id.type !== before.componentType || unit.isOnMap !== true || unit.operationQueueSize !== 0 ||
      unit.location?.x !== before.location.x || unit.location?.y !== before.location.y ||
      !Number.isFinite(player.Treasury.goldBalance) || player.Treasury.goldBalance < cost) return reject("Unit, fresh upgrade quote or game context changed during validation");
  const verificationArguments = {unit_id: unitId, target_unit_type: targetType, baseline_unit_ids: baselineIds,
    source_location: before.location, source_component_type: before.componentType, before_gold: before.gold, quoted_gold_cost: cost};
  Game.UnitCommands.sendRequest(unit.id, UnitCommandTypes.UPGRADE, args);
  return {status: "submitted", before, quotedGoldCost: cost, quoteSource: "exact-native-English-upgrade-description",
    expected: {originalUnitId: unitId, componentType: before.componentType, unitType: targetType, upgradeObserved: true}, verificationArguments};
})()
