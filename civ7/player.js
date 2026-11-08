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
  function triumphs() {
    const legacies = player.Legacies;
    if (!legacies) return [];
    return [...GameInfo.Legacies]
      .filter(def => legacies.isValidLegacy(def.LegacyType))
      .map(def => {
        const state = legacies.getProgress(def.LegacyType);
        return {
          id: def.LegacyType,
          name: name(def.Name),
          requirements: name(def.TriggerDescription),
          reward: name(def.Description),
          major: Boolean(def.MajorLegacy),
          firstPlayerOnly: Boolean(def.FirstPlayerOnly),
          complete: Boolean(legacies.isTriggered(def.LegacyType)),
          progress: (state?.progress ?? []).map(value => ({
            current: value.current,
            total: value.total
          }))
        };
      });
  }
  function dedications() {
    const advancedStart = player.AdvancedStart;
    if (!advancedStart) return null;
    const card = info => ({
      id: info.id,
      name: name(info.name),
      description: name(info.description)
    });
    const selected = advancedStart.getCards().map(value => card(value.info));
    const size = advancedStart.getDeckSize?.();
    const slotCount = Number.isSafeInteger(size) && size >= selected.length ? size : null;
    const closed = advancedStart.getPlacementComplete();
    return {
      selectionComplete: typeof closed === "boolean" ? closed : null,
      selectionPending: closed === false,
      slotCount,
      openSlotCount: closed === true ? 0 : closed === false && slotCount !== null ? slotCount - selected.length : null,
      selected,
      choices: advancedStart.getAvailableCards().map(card)
    };
  }
  return {
    civilization: name(player.civilizationFullName),
    leader: name(GameInfo.Leaders.lookup(player.leaderType).Name),
    turn: Game.turn, age: name(GameInfo.Ages.lookup(Game.age).Name),
    technology: research(player.Techs), civic: research(player.Culture),
    triumphs: triumphs(), dedications: dedications(),
    settlements: player.Cities.getCities().map(city => ({
      name: name(city.name), population: city.population,
      netYields: Object.fromEntries([...GameInfo.Yields].map(y =>
        [y.YieldType, city.Yields.getNetYield(y.$hash)])),
      productionQueue: city.BuildQueue.getQueue().map(item)
    }))
  };
})()

