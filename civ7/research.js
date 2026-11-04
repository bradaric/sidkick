(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const name = key => key ? Locale.compose(key) : null;

  function unlockDefinition(unlock) {
    let def = null;
    switch (unlock.TargetKind) {
      case "KIND_CONSTRUCTIBLE": def = GameInfo.Constructibles.lookup(unlock.TargetType); break;
      case "KIND_UNIT": def = GameInfo.Units.lookup(unlock.TargetType); break;
      case "KIND_TRADITION": def = GameInfo.Traditions.lookup(unlock.TargetType); break;
      case "KIND_DIPLOMATIC_ACTION": def = GameInfo.DiplomacyActions.lookup(unlock.TargetType); break;
      case "KIND_PROJECT": def = GameInfo.Projects.lookup(unlock.TargetType); break;
      case "KIND_MODIFIER": def = GameInfo.Modifiers.find(value => value.ModifierId === unlock.TargetType); break;
    }
    const modifierName = unlock.TargetKind === "KIND_MODIFIER"
      ? GameInfo.ModifierStrings.find(value => value.ModifierId === unlock.TargetType && value.Context === "Name")?.Text
      : null;
    const modifierDescription = unlock.TargetKind === "KIND_MODIFIER"
      ? GameInfo.ModifierStrings.find(value => value.ModifierId === unlock.TargetType && value.Context === "Description")?.Text
      : null;
    return {
      kind: unlock.TargetKind,
      id: unlock.TargetType,
      name: name(modifierName ?? def?.Name) ?? unlock.TargetType,
      description: name(modifierDescription ?? def?.Description ?? def?.Tooltip),
      masteryDepth: unlock.UnlockDepth ?? 0
    };
  }

  function progressionNode(nodeType, system) {
    const def = GameInfo.ProgressionTreeNodes.lookup(nodeType);
    const state = Game.ProgressionTrees.getNode(id, nodeType);
    if (!def || !state) return null;
    const suffix = state.depthUnlocked >= 1
      ? ` ${Locale.toRomanNumeral(state.depthUnlocked + 1)}`
      : "";
    return {
      id: def.ProgressionTreeNodeType,
      name: `${name(def.Name)}${suffix}`,
      cost: system.getNodeCost(nodeType),
      turns: system.getTurnsForNode(nodeType),
      progress: state.progress,
      depthUnlocked: state.depthUnlocked,
      unlocks: (state.unlockIndices ?? [])
        .map(index => GameInfo.ProgressionTreeNodeUnlocks[index])
        .filter(unlock => unlock && !unlock.Hidden && (unlock.UnlockDepth ?? 1) - 1 === state.depthUnlocked)
        .map(unlockDefinition)
    };
  }

  function current(system) {
    const researching = system.getResearching();
    if (!researching || researching.type === -1) return null;
    return progressionNode(researching.type, system);
  }

  function card(def) {
    return {
      id: def.TraditionType,
      name: name(def.Name),
      description: name(def.Description),
      slotType: def.CultureSlotType
    };
  }

  function policyGroup(slotType) {
    const activeHashes = player.Culture.getActiveTraditions(slotType) ?? [];
    const unlockedHashes = player.Culture.getUnlockedTraditions(slotType) ?? [];
    const active = activeHashes.map(hash => GameInfo.Traditions.lookup(hash)).filter(Boolean).map(card);
    const available = unlockedHashes
      .filter(hash => !player.Culture.isTraditionActive(hash))
      .map(hash => GameInfo.Traditions.lookup(hash)).filter(Boolean).map(card);
    return {
      capacity: player.Culture.getNumCultureSlots(slotType),
      active,
      available
    };
  }

  const wildcardPoints = player.Identity.getWildcardPoints();
  const nodeStateNames = Object.fromEntries(Object.entries(ProgressionTreeNodeState).map(([key, value]) => [value, key]));
  function attributeBranch(def) {
    const availablePoints = player.Identity.getAvailableAttributePoints(def.AttributeType);
    const tree = def.ProgressionTreeType ? GameInfo.ProgressionTrees.lookup(def.ProgressionTreeType) : null;
    // Match the tree UI's content filtering without initializing its stateful managers.
    const structure = tree ? (Game.ProgressionTrees.getTreeStructure(tree.ProgressionTreeType) ?? [])
      .filter(node => !Game.ProgressionTrees.canEverUnlock(id, node.nodeType).isLocked) : [];
    const states = new Map(structure.map(node => [node.nodeType, Game.ProgressionTrees.getNode(id, node.nodeType)]));
    const nodes = structure.map(node => {
      const nodeDef = GameInfo.ProgressionTreeNodes.lookup(node.nodeType);
      const state = states.get(node.nodeType);
      if (!nodeDef || !state) return null;
      const nodeState = Game.ProgressionTrees.getNodeState(id, node.nodeType);
      const legendLocked = Boolean(Game.ProgressionTrees.hasLegendUnlocked(id, node.nodeType).isLocked);
      const result = Game.PlayerOperations.canStart(id, PlayerOperationTypes.BUY_ATTRIBUTE_TREE_NODE,
        {ProgressionTreeNodeType: node.nodeType}, false);
      const unlocks = (state.unlockIndices ?? []).map(index => GameInfo.ProgressionTreeNodeUnlocks[index])
        .filter(unlock => unlock && !unlock.Hidden).map(unlockDefinition);
      const fullyUnlocked = nodeState === ProgressionTreeNodeState.NODE_STATE_FULLY_UNLOCKED;
      const basePointCost = nodeDef.Cost ?? null;
      return {
        id: nodeDef.ProgressionTreeNodeType,
        name: name(nodeDef.Name) ?? unlocks.find(unlock => unlock.name && unlock.name !== unlock.id)?.name ?? nodeDef.ProgressionTreeNodeType,
        description: name(nodeDef.Description) ?? (unlocks.map(unlock => unlock.description).filter(Boolean).join("\n") || null),
        state: nodeStateNames[nodeState] ?? nodeState,
        purchased: state.depthUnlocked > 0,
        fullyUnlocked,
        repeatable: Boolean(nodeDef.Repeatable),
        timesRepeated: state.repeatedDepth ?? 0,
        depthUnlocked: state.depthUnlocked,
        maxDepth: state.maxDepth,
        basePointCost,
        funding: {
          coversBaseCost: basePointCost == null ? null : availablePoints + wildcardPoints >= basePointCost,
          wildcardPointsNeededAtBaseCost: basePointCost == null ? null : Math.max(basePointCost - availablePoints, 0)
        },
        availableNow: Boolean(result.Success) && !legendLocked &&
          nodeState !== ProgressionTreeNodeState.NODE_STATE_CLOSED && nodeState !== ProgressionTreeNodeState.NODE_STATE_INVALID &&
          (!fullyUnlocked || Boolean(nodeDef.Repeatable)),
        legendLocked,
        lockedReason: legendLocked ? name(Game.ProgressionTrees.getLegendAttributeNodeLockedString(id, node.nodeType)) : null,
        failureReasons: (result.FailureReasons ?? []).map(name).filter(Boolean),
        prerequisites: structure.filter(parent => (parent.connectedNodeTypes ?? []).includes(node.nodeType))
          .map(parent => ({
            id: GameInfo.ProgressionTreeNodes.lookup(parent.nodeType)?.ProgressionTreeNodeType ?? parent.nodeType,
            purchased: (states.get(parent.nodeType)?.depthUnlocked ?? 0) > 0
          })),
        unlocks
      };
    }).filter(Boolean);
    return {
      id: def.AttributeType,
      name: name(def.Name),
      availablePoints,
      nextPointProgressPercent: player.Identity.getNextAttributePointProgress(def.AttributeType) * 100,
      tree: tree?.ProgressionTreeType ?? null,
      prerequisiteMode: tree?.PrereqFormat ?? null,
      nodes
    };
  }

  const government = GameInfo.Governments.lookup(player.Culture.getGovernmentType());
  return {
    turn: Game.turn,
    technology: {
      active: current(player.Techs),
      available: player.Techs.getAllAvailableNodeTypes().map(type => progressionNode(type, player.Techs)).filter(Boolean)
    },
    civic: {
      active: current(player.Culture),
      available: player.Culture.getAllAvailableNodeTypes().map(type => progressionNode(type, player.Culture)).filter(Boolean)
    },
    government: government ? {
      id: government.GovernmentType,
      name: name(government.Name),
      description: name(government.Description)
    } : null,
    policies: {
      totalCapacity: player.Culture.getNumAllCultureSlots(),
      policies: policyGroup(CultureSlotTypes.POLICY_CULTURE_SLOT),
      traditions: policyGroup(CultureSlotTypes.TRADITION_CULTURE_SLOT),
      crises: policyGroup(CultureSlotTypes.CRISIS_CULTURE_SLOT)
    },
    attributes: {
      wildcardPoints,
      branches: [...GameInfo.Attributes].map(attributeBranch)
    }
  };
})()
