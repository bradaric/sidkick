(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const name = key => Locale.compose(key);
  function research(system) {
    const current = system.getResearching();
    if (!current || current.type === -1) return null;
    const node = Game.ProgressionTrees.getNode(id, current.type);
    const label = name(GameInfo.ProgressionTreeNodes.lookup(node.nodeType).Name);
    return node.depthUnlocked >= 1 ? label + " " + Locale.toRomanNumeral(node.depthUnlocked + 1) : label;
  }
  function item(q) {
    switch (q.kind) {
      case ProductionKind.CONSTRUCTIBLE: return name(GameInfo.Constructibles.lookup(q.constructibleType).Name);
      case ProductionKind.UNIT: return name(GameInfo.Units.lookup(q.unitType).Name);
      case ProductionKind.PROJECT: return name(GameInfo.Projects.lookup(q.projectType).Name);
      default: throw Error("Unsupported production kind " + q.kind);
    }
  }
  return {
    civilization: name(player.civilizationFullName),
    leader: name(GameInfo.Leaders.lookup(player.leaderType).Name),
    turn: Game.turn, age: name(GameInfo.Ages.lookup(Game.age).Name),
    technology: research(player.Techs), civic: research(player.Culture),
    settlements: player.Cities.getCities().map(city => ({
      name: name(city.name), population: city.population,
      netYields: Object.fromEntries([...GameInfo.Yields].map(y =>
        [y.YieldType, city.Yields.getNetYield(y.$hash)])),
      productionQueue: city.BuildQueue.getQueue().map(item)
    }))
  };
})()


