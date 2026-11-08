(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const width = GameplayMap.getGridWidth();
  const height = GameplayMap.getGridHeight();
  const tileOwnership = (x, y) => {
    const unknown = {status: "unknown", playerId: null, civilization: null};
    // Current native ownership is not evidence of last-known ownership in fog.
    if (GameplayMap.getRevealedState(id, x, y) !== RevealedStates.VISIBLE) return unknown;
    try {
      const ownerId = GameplayMap.getOwner?.(x, y);
      if (ownerId === -1) return {status: "unowned", playerId: null, civilization: null};
      if (!Number.isInteger(ownerId) || ownerId < 0 ||
          ownerId !== id && Players.get(id)?.Diplomacy?.hasMet(ownerId) !== true) return unknown;
      const key = Players.get(ownerId)?.civilizationFullName;
      return {status: ownerId === id ? "ours" : "foreign", playerId: ownerId,
        civilization: key ? Locale.compose(key) : null};
    } catch { return unknown; }
  };
  const tiles = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const revealed = GameplayMap.getRevealedState(id, x, y);
      if (revealed === RevealedStates.HIDDEN) continue;
      const index = GameplayMap.getIndexFromLocation({x, y});
      const terrain = GameInfo.Terrains.lookup(GameplayMap.getTerrainType(x, y));
      const feature = GameInfo.Features.lookup(GameplayMap.getFeatureType(x, y));
      const biome = GameInfo.Biomes.lookup(GameplayMap.getBiomeType(x, y));
      const resource = GameInfo.Resources.lookup(GameplayMap.getResourceType(x, y));
      const river = GameplayMap.getRiverType(x, y);
      const rawYields = GameplayMap.getYields(index, id) ?? [];
      tiles.push({
        x,
        y,
        visible: revealed === RevealedStates.VISIBLE,
        ownership: tileOwnership(x, y),
        terrain: terrain?.TerrainType ?? null,
        biome: biome?.BiomeType ?? null,
        feature: feature?.FeatureType ?? null,
        resource: resource?.ResourceType ?? null,
        water: Boolean(GameplayMap.isWater(x, y)),
        freshWater: Boolean(GameplayMap.isFreshWater(x, y)),
        river: river === RiverTypes.NO_RIVER ? null : Locale.compose(GameplayMap.getRiverName(x, y)),
        yields: Object.fromEntries(rawYields.map(value => [
          GameInfo.Yields.lookup(value[0])?.YieldType ?? value[0],
          value[1]
        ]))
      });
    }
  }
  return {turn: Game.turn, width, height, tiles};
})()
