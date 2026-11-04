(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const name = key => key ? Locale.compose(key) : null;
  const modern = GameInfo.Ages.lookup(Game.age)?.AgeType === "AGE_MODERN";
  const describeIdeology = hash => {
    const def = modern ? GameInfo.Ideologies.lookup(hash) : null;
    return def ? {id: def.IdeologyType, name: name(def.Name)} : null;
  };

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

  // These are three audited base-science rules, not a general modifier evaluator.
  // Validate their loaded definitions before applying the matching census.
  function matchingRequirements(setId, expected) {
    if (!setId) return expected.length === 0;
    const set = GameInfo.RequirementSets.find(value => value.RequirementSetId === setId);
    if (set?.RequirementSetType !== "REQUIREMENTSET_TEST_ALL") return false;
    const signature = (type, inverse, args) => JSON.stringify([type, Boolean(inverse),
      Object.entries(args).map(([key, value]) => [key, String(value).split(",").map(part => part.trim()).sort().join(",")])
        .sort(([left], [right]) => left.localeCompare(right))]);
    const actual = GameInfo.RequirementSetRequirements.filter(value => value.RequirementSetId === setId).map(link => {
      const requirement = GameInfo.Requirements.find(value => value.RequirementId === link.RequirementId);
      if (!requirement || requirement.Reverse || requirement.Persistent || requirement.Triggered) return null;
      const args = Object.fromEntries(GameInfo.RequirementArguments.filter(value => value.RequirementId === link.RequirementId)
        .map(value => [value.Name, value.Value]));
      return signature(requirement.RequirementType, requirement.Inverse, args);
    });
    return JSON.stringify(actual.sort()) === JSON.stringify(expected.map(args => signature(...args)).sort());
  }

  function knownModifier(modifierId, collection, effect, requirements) {
    const modifier = GameInfo.Modifiers.find(value => value.ModifierId === modifierId);
    const dynamic = modifier && GameInfo.DynamicModifiers.find(value => value.ModifierType === modifier.ModifierType);
    if (!modifier || modifier.OwnerRequirementSetId || modifier.RunOnce || modifier.NewOnly || modifier.Permanent ||
      dynamic?.CollectionType !== collection || dynamic?.EffectType !== effect ||
      !matchingRequirements(modifier.SubjectRequirementSetId, requirements)) return null;
    return Object.fromEntries(GameInfo.ModifierArguments.filter(value => value.ModifierId === modifierId)
      .map(value => [value.Name, value.Value]));
  }

  function cardImpact(def) {
    const unknown = reason => ({status: "unknown", reason, qualifyingCount: null,
      estimatedBaseYields: null, estimatedNetYieldChange: null});
    const type = def.TraditionType;
    if (!["TRADITION_PET_KOT", "TRADITION_MAYA_SYNCRETISM_EXPLORATION", "TRADITION_TEQUITL"].includes(type)) {
      return unknown("No audited base-yield estimate for this card");
    }
    const featureRequirement = ["REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES", false, {FeatureClassType: "FEATURE_CLASS_VEGETATED"}];
    let modifierId;
    let args;
    if (type === "TRADITION_PET_KOT") {
      const parentId = "PET_KOT_MOD_VEGETATED_SCIENCE";
      modifierId = "ATTACH_PET_KOT_MOD_VEGETATED_SCIENCE";
      const parent = knownModifier(parentId, "COLLECTION_PLAYER_CITIES", "EFFECT_ATTACH_MODIFIERS",
        [["REQUIREMENT_CITY_IS_CITY", false, {}]]);
      if (parent?.ModifierId !== modifierId || !GameInfo.TraditionModifiers.find(value =>
        value.TraditionType === type && value.ModifierId === parentId)) return unknown("Loaded Pet Kot rule is not supported");
      args = knownModifier(modifierId, "COLLECTION_CITY_PLOT_YIELDS", "EFFECT_PLOT_ADJUST_YIELD",
        [featureRequirement, ["REQUIREMENT_PLOT_DISTRICT_CLASS", true, {DistrictClass: "CITYCENTER,URBAN"}]]);
    } else {
      modifierId = type === "TRADITION_TEQUITL" ? "TEQUITL_MOD_TRADE_ROUTE_SCIENCE"
        : "MAYA_SYNCRETISM_EXPLORATION_SCIENCE_VEGETATION_SCIENCE";
      if (!GameInfo.TraditionModifiers.find(value => value.TraditionType === type && value.ModifierId === modifierId)) {
        return unknown("Expected science modifier is not attached to this card");
      }
      args = type === "TRADITION_TEQUITL"
        ? knownModifier(modifierId, "COLLECTION_OWNER", "EFFECT_PLAYER_ADJUST_YIELD_PER_NUM_TRADE_ROUTES", [])
        : knownModifier(modifierId, "COLLECTION_PLAYER_CONSTRUCTIBLES", "EFFECT_CONSTRUCTIBLE_ADJUST_YIELD",
          [featureRequirement, ["REQUIREMENT_CONSTRUCTIBLE_TAG_MATCHES", false, {Tag: "SCIENCE"}]]);
    }
    if (!args || args.YieldType !== "YIELD_SCIENCE" || typeof args.Amount !== "string" || !args.Amount.trim() ||
      !Number.isFinite(Number(args.Amount)) || Object.keys(args).some(key => !["YieldType", "Amount", "Tooltip"].includes(key))) {
      return unknown("Loaded science modifier is missing or differs from the audited rule");
    }
    const evidence = [];
    let qualifyingCount = 0;
    if (type === "TRADITION_TEQUITL") {
      qualifyingCount = player.Trade.countPlayerTradeRoutes();
      if (!Number.isInteger(qualifyingCount) || qualifyingCount < 0) return unknown("Current trade-route count is unavailable");
      evidence.push({source: "Player.Trade.countPlayerTradeRoutes", count: qualifyingCount});
    } else {
      const scienceTypes = new Set(GameInfo.TypeTags.filter(value => value.Tag === "SCIENCE").map(value => value.Type));
      for (const city of player.Cities.getCities()) {
        if (type === "TRADITION_PET_KOT" && city.isTown) continue;
        const locations = [];
        const plots = new Set();
        for (const componentId of city.Constructibles.getIds() ?? []) {
          const instance = Constructibles.getByComponentID(componentId);
          if (!instance || instance.owner !== id || !instance.complete || instance.damaged) continue;
          const constructible = GameInfo.Constructibles.lookup(instance.type);
          const location = instance.location;
          if (!constructible || !location || location.x < 0 || location.y < 0 ||
            GameplayMap.getRevealedState(id, location.x, location.y) === RevealedStates.HIDDEN) continue;
          const feature = GameInfo.Features.lookup(GameplayMap.getFeatureType(location.x, location.y));
          if (feature?.FeatureClassType !== "FEATURE_CLASS_VEGETATED") continue;
          if (type === "TRADITION_PET_KOT") {
            if (constructible.ConstructibleClass !== "IMPROVEMENT") continue;
            const district = Districts.getAtLocation(location);
            const districtClass = district && GameInfo.Districts.lookup(district.type)?.DistrictClass;
            const key = `${location.x},${location.y}`;
            if (!districtClass || ["CITYCENTER", "URBAN"].includes(districtClass) || plots.has(key)) continue;
            plots.add(key);
          } else if (constructible.ConstructibleClass !== "BUILDING" || !scienceTypes.has(constructible.ConstructibleType)) continue;
          locations.push({x: location.x, y: location.y});
        }
        evidence.push({settlement: name(city.name), count: locations.length, locations});
        qualifyingCount += locations.length;
      }
    }
    return {
      status: "estimated",
      scope: "Base science only, if this card is slotted; not a swap simulation or total current contribution",
      modifierId,
      qualifyingCount,
      amountPerItem: Number(args.Amount),
      estimatedBaseYields: {YIELD_SCIENCE: qualifyingCount * Number(args.Amount)},
      estimatedNetYieldChange: null,
      evidence,
      limitations: [type === "TRADITION_TEQUITL" ? "Counts current routes only; no additional routes from increased range are predicted"
        : "Only currently revealed, owned, complete, undamaged qualifying improvements/buildings are counted",
        "Excludes multipliers, cross-yield conversions, trade-range benefits, future routes and other card effects"]
    };
  }

  function card(def) {
    return {
      id: def.TraditionType,
      name: name(def.Name),
      description: name(def.Description),
      slotType: def.CultureSlotType,
      ideology: modern ? describeIdeology(player.Culture.getIdeologyForTradition(def.TraditionType)) : null,
      impact: cardImpact(def)
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
  let ideology = null;
  if (modern) {
    const chosen = describeIdeology(player.Culture.getChosenIdeology());
    ideology = {
      chosen,
      choices: [...GameInfo.Ideologies].map(def => {
        const node = def.FirstTreeNode ? GameInfo.ProgressionTreeNodes.lookup(def.FirstTreeNode) : null;
        const result = node ? Game.PlayerOperations.canStart(id, PlayerOperationTypes.SET_CULTURE_TREE_NODE,
          {ProgressionTreeNodeType: node.$hash}, false) : null;
        return {
          id: def.IdeologyType, name: name(def.Name), chosen: chosen?.id === def.IdeologyType,
          rivalIdeology: def.RivalIdeology ?? null,
          entryCivic: node ? progressionNode(node.$hash, player.Culture) : null,
          researchAllowed: result ? Boolean(result.Success) : null,
          failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean),
          adoptionPermission: null, diplomaticImpact: null
        };
      }),
      note: "Local entry-civic research checks, not immediate ideology adoption/change permission. RivalIdeology is a definition link, not a forecast of diplomatic penalties or rewards"
    };
  }
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
    ideology,
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
