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
      wildcardPoints: player.Identity.getWildcardPoints(),
      branches: [...GameInfo.Attributes].map(def => ({
        id: def.AttributeType,
        name: name(def.Name),
        availablePoints: player.Identity.getAvailableAttributePoints(def.AttributeType),
        nextPointProgressPercent: player.Identity.getNextAttributePointProgress(def.AttributeType) * 100
      }))
    }
  };
})()
