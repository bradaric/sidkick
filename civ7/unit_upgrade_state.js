(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  const {unit_id: originalUnitId, target_unit_type: targetType, baseline_unit_ids: baseline,
    source_location: location, source_component_type: componentType, before_gold: beforeGold, quoted_gold_cost: cost} = queryArguments;
  if (!player || !Number.isInteger(originalUnitId) || originalUnitId < 0 || !Number.isInteger(componentType) || componentType < 0 ||
      !Array.isArray(baseline) || !baseline.includes(originalUnitId) || baseline.some(v => !Number.isInteger(v) || v < 0) ||
      new Set(baseline).size !== baseline.length || typeof targetType !== "string" || !targetType || !location ||
      ![location.x, location.y].every(v => Number.isInteger(v) && v >= 0) ||
      !Number.isFinite(beforeGold) || !Number.isFinite(cost) || cost < 0 || beforeGold < cost) throw Error("Invalid submitted upgrade baseline");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId);
  const originals = owned.filter(u => u.id.id === originalUnitId);
  if (originals.length > 1 || (originals.length && originals[0].id.type !== componentType)) throw Error("Original unit identity is ambiguous or changed");
  const matches = unit => unit.id.type === componentType && unit.isOnMap === true && unit.isDead !== true &&
    GameInfo.Units.lookup(unit.type)?.UnitType === targetType && unit.location?.x === location.x && unit.location?.y === location.y;
  const candidates = originals.length ? originals.filter(matches) : owned.filter(u => !baseline.includes(u.id.id) && matches(u));
  if (candidates.length > 1) throw Error("Upgraded replacement identity is ambiguous");
  const unit = candidates[0] ?? originals[0], gold = player.Treasury?.goldBalance ?? null;
  return {turn: Game.turn, age: Game.age, playerId, originalUnitId, unitId: unit?.id.id ?? null, componentType,
    unitType: unit ? GameInfo.Units.lookup(unit.type)?.UnitType ?? null : null, gold,
    upgradeObserved: candidates.length === 1 && Number.isFinite(gold) && beforeGold - gold === cost};
})()
