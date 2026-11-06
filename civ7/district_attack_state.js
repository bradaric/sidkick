(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player) throw Error("No local player");
  const {unit_id: unitId, attacker_type: unitType, attacker_component_type: componentType, before_attacks: beforeAttacks,
    target_player: targetPlayer, district_id: districtId, district_type: districtType, district_component_type: districtComponentType,
    before_district_damage: beforeDamage, x, y} = queryArguments;
  if (![unitId, componentType, beforeAttacks, targetPlayer, districtId, districtComponentType, x, y].every(v => Number.isInteger(v) && v >= 0) ||
      beforeAttacks <= 0 || !Number.isInteger(unitType) || !Number.isInteger(districtType) || !Number.isFinite(beforeDamage) || beforeDamage < 0 || targetPlayer === playerId ||
      x >= GameplayMap.getGridWidth() || y >= GameplayMap.getGridHeight()) throw Error("Invalid captured district attack identity");
  const units = player.Units.getUnits().filter(u => u.id.owner === playerId && u.id.id === unitId);
  if (units.length > 1 || (units.length && (units[0].id.type !== componentType || units[0].type !== unitType))) throw Error("Attacker identity changed");
  const attacks = units[0]?.Combat?.attacksRemaining ?? null, spent = units.length === 0 || (Number.isInteger(attacks) && attacks >= 0 && attacks < beforeAttacks);
  let districtDamage = null, districtLeftTile = null;
  if (player.Diplomacy.hasMet(targetPlayer) === true && GameplayMap.getRevealedState(playerId, x, y) === RevealedStates.VISIBLE) {
    const id = MapCities.getDistrict(x, y);
    districtLeftTile = !(id?.owner === targetPlayer && id.id === districtId && id.type === districtComponentType);
    if (!districtLeftTile) {
      const d = Districts.get(id);
      if (!d || d.type !== districtType) throw Error("Visible district identity changed");
      if (Number.isFinite(d.getDamage)) districtDamage = d.getDamage;
    }
  }
  return {turn: Game.turn, age: Game.age, playerId, unitId, targetPlayer, districtId, attacksRemaining: attacks, attackConsumedOrAttackerLost: spent,
    districtDamage, districtLeftTile, districtAttackObserved: spent && (districtLeftTile === true || (districtDamage !== null && districtDamage > beforeDamage)),
    note: "A district departing a visible tile is not proof of destruction or capture; no hidden district state is queried"};
})()
