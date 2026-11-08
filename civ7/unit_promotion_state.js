(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  const {unit_id: unitId, discipline, promotion} = queryArguments;
  if (!Number.isInteger(unitId) || unitId < 0 || [discipline, promotion].some(v => typeof v !== "string" || !v)) throw Error("Invalid submitted promotion identity");
  const units = player.Units.getUnits().filter(u => u.id.owner === playerId && u.id.id === unitId);
  if (units.length !== 1 || !units[0].Experience) throw Error("No unique owned promoted unit");
  const unit = units[0], experience = unit.Experience;
  return {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
    discipline, promotion, hasPromotion: experience.hasPromotion(discipline, promotion),
    promotionPoints: experience.getStoredPromotionPoints ?? null, commendations: experience.getStoredCommendations ?? null};
})()
