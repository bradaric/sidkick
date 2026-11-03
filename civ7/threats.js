(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const localId = GameContext.localPlayerID;
  if (!Number.isInteger(localId) || localId < 0) throw Error("No local player");
  const localPlayer = Players.get(localId);
  const diplomacy = localPlayer.Diplomacy;
  const name = key => key ? Locale.compose(key) : null;
  const width = GameplayMap.getGridWidth();
  const height = GameplayMap.getGridHeight();
  const seen = new Set();
  const units = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (GameplayMap.getRevealedState(localId, x, y) !== RevealedStates.VISIBLE) continue;
      for (const unitId of MapUnits.getUnits(x, y) ?? []) {
        const key = `${unitId.owner}:${unitId.id}:${unitId.type}`;
        if (seen.has(key) || !Visibility.isVisible(localId, unitId)) continue;
        seen.add(key);
        const unit = Units.get(unitId);
        if (!unit || unit.owner === localId) continue;
        const owner = Players.get(unit.owner);
        if (!owner || !diplomacy.hasMet(unit.owner)) continue;
        const atWar = Boolean(diplomacy.isAtWarWith(unit.owner));
        if (!atWar) continue;
        const def = GameInfo.Units.lookup(unit.type);
        const stats = def ? GameInfo.Unit_Stats.lookup(def.UnitType) : null;
        const leader = owner.isMajor ? GameInfo.Leaders.lookup(owner.leaderType) : null;
        units.push({
          owner: {
            playerId: unit.owner,
            civilization: name(owner.civilizationFullName),
            leader: name(leader?.Name ?? owner.leaderName),
            type: owner.isMajor ? "major" : owner.isMinor ? "city-state" : "independent",
            atWar
          },
          id: def?.UnitType ?? unit.type,
          name: name(unit.name ?? def?.Name),
          formationClass: def?.FormationClass ?? null,
          domain: def?.Domain ?? null,
          location: {x, y},
          health: unit.Health ? {
            current: unit.Health.maxDamage - unit.Health.damage,
            maximum: unit.Health.maxDamage,
            damage: unit.Health.damage
          } : null,
          movement: unit.Movement ? {
            remaining: unit.Movement.movementMovesRemaining,
            maximum: unit.Movement.maxMoves
          } : null,
          combat: stats ? {
            melee: stats.Combat,
            ranged: stats.RangedCombat,
            bombard: stats.Bombard,
            range: stats.Range,
            baseMoves: def.BaseMoves
          } : null
        });
      }
    }
  }

  return {
    turn: Game.turn,
    scope: "Enemy units on currently visible tiles, owned by met players only",
    visibleForeignUnits: units
  };
})()
