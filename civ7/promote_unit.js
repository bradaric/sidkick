(() => {
  const {unit_id: unitId, discipline, promotion, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (![unitId, expectedTurn].every(v => Number.isInteger(v) && v >= 0) ||
      [discipline, promotion].some(v => typeof v !== "string" || !v.trim())) return reject("An owned unit, exact discipline/promotion IDs and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const units = player.Units.getUnits().filter(u => u.id.owner === playerId && u.id.id === unitId);
  if (units.length !== 1 || units[0].isOnMap !== true || units[0].isDead === true || units[0].operationQueueSize !== 0) return reject("A unique owned deployed unit without queued orders is required");
  const unit = units[0], def = GameInfo.Units.lookup(unit.type), experience = unit.Experience;
  const promotionDef = GameInfo.UnitPromotions.lookup(promotion), disciplineDef = GameInfo.UnitPromotionDisciplines.lookup(discipline);
  if (!experience || promotionDef?.UnitPromotionType !== promotion || disciplineDef?.UnitPromotionDisciplineType !== discipline ||
      !GameInfo.UnitPromotionClassSets.filter(s => s.PromotionClassType === def?.PromotionClass && s.UnitPromotionDisciplineType === discipline).length ||
      !GameInfo.UnitPromotionDisciplineDetails.filter(s => s.UnitPromotionDisciplineType === discipline && s.UnitPromotionType === promotion).length) return reject("Promotion is not in this unit's native class/discipline tree");
  const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
    promotionPoints: experience.getStoredPromotionPoints ?? null, commendations: experience.getStoredCommendations ?? null};
  if (experience.hasPromotion(discipline, promotion) === true) return {status: "already_active", before};
  if (experience.canPromote !== true || experience.canEarnPromotion(discipline, promotion, false) !== true) return reject("Native promotion picker eligibility is not met");
  const args = {PromotionType: Database.makeHash(promotion), PromotionDisciplineType: Database.makeHash(discipline)};
  if (!Object.values(args).every(Number.isInteger)) return reject("Promotion hash identity is unavailable");
  const check = Game.UnitCommands.canStart(unit.id, UnitCommandTypes.PROMOTE, args, false);
  if (check?.Success !== true) return reject("Native promotion command check failed", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false || unit.id.owner !== playerId || unit.type !== before.unitType || unit.isOnMap !== true ||
      unit.operationQueueSize !== 0 || (experience.getStoredPromotionPoints ?? null) !== before.promotionPoints ||
      (experience.getStoredCommendations ?? null) !== before.commendations || experience.canPromote !== true ||
      experience.canEarnPromotion(discipline, promotion, false) !== true || experience.hasPromotion(discipline, promotion) !== false) return reject("Unit promotion or game context changed during validation");
  Game.UnitCommands.sendRequest(unit.id, UnitCommandTypes.PROMOTE, args);
  return {status: "submitted", before, expected: {unitId, unitType: before.unitType, componentType: before.componentType,
    discipline, promotion, hasPromotion: true}, verificationArguments: {unit_id: unitId, discipline, promotion}};
})()
