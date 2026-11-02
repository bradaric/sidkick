(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const diplomacy = player.Diplomacy;
  const name = key => key ? Locale.compose(key) : null;
  const leaders = [];
  const cityStates = [];
  const independents = [];

  for (const otherId of Players.getAliveIds()) {
    if (otherId === id || !diplomacy.hasMet(otherId)) continue;
    const other = Players.get(otherId);
    if (!other) continue;
    if (other.isMajor) {
      const leader = GameInfo.Leaders.lookup(other.leaderType);
      leaders.push({
        civilization: name(other.civilizationFullName),
        leader: name(leader?.Name ?? other.leaderName),
        relationship: name(diplomacy.getRelationshipLevelName(otherId)),
        relationshipLevel: diplomacy.getRelationshipLevel(otherId),
        atWar: Boolean(diplomacy.isAtWarWith(otherId))
      });
      continue;
    }
    if (other.isMinor) {
      const type = GameInfo.CityStateTypes.lookup(other.getCityStateCityStateType());
      const bonusHash = Game.CityStates.getBonusType(otherId);
      const bonus = GameInfo.CityStateBonuses.find(value => value.$hash === bonusHash);
      const suzerainId = other.Influence?.getSuzerain() ?? -1;
      let suzerain = null;
      if (suzerainId === id) suzerain = "You";
      else if (suzerainId >= 0 && diplomacy.hasMet(suzerainId)) {
        suzerain = name(Players.get(suzerainId)?.civilizationFullName);
      }
      cityStates.push({
        name: name(other.civilizationFullName),
        type: name(type?.Name),
        bonus: name(bonus?.Name),
        suzerain,
        atWar: Boolean(diplomacy.isAtWarWith(otherId))
      });
      continue;
    }
    if (other.isIndependent) {
      const relation = Game.IndependentPowers.getIndependentHostility(otherId, id);
      independents.push({
        name: name(other.civilizationFullName),
        relationship: name(relation),
        atWar: Boolean(diplomacy.isAtWarWith(otherId))
      });
    }
  }

  const width = GameplayMap.getGridWidth();
  const height = GameplayMap.getGridHeight();
  const terrain = {};
  const features = {};
  const resources = {};
  let explored = 0;
  let visible = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const increment = (object, key) => {
    if (!key) return;
    object[key] = (object[key] ?? 0) + 1;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const state = GameplayMap.getRevealedState(id, x, y);
      if (state === RevealedStates.HIDDEN) continue;
      explored++;
      if (state === RevealedStates.VISIBLE) visible++;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      increment(terrain, GameInfo.Terrains.lookup(GameplayMap.getTerrainType(x, y))?.TerrainType);
      increment(features, GameInfo.Features.lookup(GameplayMap.getFeatureType(x, y))?.FeatureType);
      increment(resources, GameInfo.Resources.lookup(GameplayMap.getResourceType(x, y))?.ResourceType);
    }
  }
  return {
    turn: Game.turn,
    metLeaders: leaders,
    cityStates,
    independents,
    exploredMap: {
      width,
      height,
      exploredTiles: explored,
      currentlyVisibleTiles: visible,
      bounds: explored ? {minX, minY, maxX, maxY} : null,
      terrain,
      features,
      resources
    }
  };
})()
