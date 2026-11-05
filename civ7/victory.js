(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const localId = GameContext.localPlayerID;
  if (!Number.isInteger(localId) || localId < 0) throw Error("No local player");
  const localPlayer = Players.get(localId);
  if (!localPlayer) throw Error("No local player");
  const diplomacy = localPlayer.Diplomacy;
  const name = key => key ? Locale.compose(key) : null;
  const age = GameInfo.Ages.lookup(Game.age);
  const currentAgePoints = Game.AgeProgressManager.getCurrentAgeProgressionPoints();
  const maximumAgePoints = Game.AgeProgressManager.getMaxAgeProgressionPoints();
  const agePercent = Number.isFinite(currentAgePoints) && maximumAgePoints > 0 ? currentAgePoints / maximumAgePoints * 100 : null;

  function dominanceSchedule(type) {
    if (type.ScoringType !== "COUNTDOWN_VICTORY_SCORING_TYPE_DOMINATION") return null;
    const config = typeof Configuration === "undefined" ? null : Configuration.getGame();
    const startingAge = config?.campaignStartAgeType == null ? null : GameInfo.Ages.lookup(config.campaignStartAgeType)?.AgeType ?? null;
    const previousAgeCount = config?.previousAgeCount ?? null;
    const tiers = startingAge == null || previousAgeCount == null ? [] : (GameInfo.VictoryDominationPercents ?? [])
      .filter(row => row.VictoryType === type.VictoryType && row.StartingAge === startingAge && row.PreviousAgeCount === previousAgeCount)
      .map(row => ({name: name(row.Name), minAgeProgressPercent: row.MinAgeProgressPercent ?? null,
        dominationPercent: row.DominationPercent ?? null,
        multiplier: Number.isFinite(row.DominationPercent) ? (row.DominationPercent + 100) / 100 : null}))
      .sort((a, b) => a.minAgeProgressPercent - b.minAgeProgressPercent);
    const reached = agePercent == null ? [] : tiers.filter(tier => Number.isFinite(tier.minAgeProgressPercent) && tier.minAgeProgressPercent <= agePercent);
    return {startingAge, previousAgeCount, ageProgressPercent: agePercent, tiers,
      currentTier: reached[reached.length - 1] ?? null,
      nextTier: agePercent == null ? null : tiers.find(tier => Number.isFinite(tier.minAgeProgressPercent) && tier.minAgeProgressPercent > agePercent) ?? null,
      estimatedTurnsUntilChange: null,
      note: "Loaded campaign/previous-Age rule schedule, matching the victory UI. Thresholds change with Age progress, not a fixed turn estimate. Native targetPoints/countdown remain authoritative; missing tiers are unknown, not a 1x rule"
    };
  }

  function modernProjectRequirements() {
    if (age?.AgeType !== "AGE_MODERN") return null;
    const cities = localPlayer.Cities.getCities();
    const completed = localPlayer.LegacyPaths?.getCompletedLegacyPaths();
    const completedPaths = completed == null ? null : new Set(completed
      .map(type => GameInfo.LegacyPaths.lookup(type)?.LegacyPathType).filter(Boolean));
    // Include loaded production projects, not a hardcoded victory chain that may be obsolete.
    const projects = [...GameInfo.Projects].filter(def => !def.TownOnly && !def.UpgradeToCity && def.Cost > 0).map(def => {
      const constructible = def.PrereqConstructible ? GameInfo.Constructibles.lookup(def.PrereqConstructible) : null;
      const legacyPath = def.RequireCompletedLegacyPathType ? GameInfo.LegacyPaths.lookup(def.RequireCompletedLegacyPathType) : null;
      const unlocks = GameInfo.ProgressionTreeNodeUnlocks.filter(unlock => !unlock.Hidden &&
        unlock.TargetKind === "KIND_PROJECT" && unlock.TargetType === def.ProjectType).map(unlock => {
        const node = GameInfo.ProgressionTreeNodes.lookup(unlock.ProgressionTreeNodeType);
        const state = node ? Game.ProgressionTrees.getNode(localId, node.$hash) : null;
        return {id: unlock.ProgressionTreeNodeType, name: name(node?.Name), requiredDepth: unlock.UnlockDepth ?? null,
          depthUnlocked: state?.depthUnlocked ?? null,
          met: state?.depthUnlocked == null || unlock.UnlockDepth == null ? null : state.depthUnlocked >= unlock.UnlockDepth};
      });
      const hasPrerequisite = city => city.Constructibles?.hasConstructible(def.PrereqConstructible, false) ?? null;
      const anyCityPrerequisite = def.PrereqConstructible && def.PrereqAnyCity ? cities.map(hasPrerequisite) : null;
      const empirePrerequisite = anyCityPrerequisite?.some(value => value === true) ? true
        : anyCityPrerequisite?.every(value => value === false) ? false : null;
      return {
        id: def.ProjectType, name: name(def.Name), description: name(def.Description),
        baseProductionCost: def.Cost, maxPlayerInstances: def.MaxPlayerInstances ?? null,
        completedCopies: null, completionForecast: null,
        requirements: {
          cityOnly: Boolean(def.CityOnly), requiresUnlock: def.RequiresUnlock ?? null,
          constructible: def.PrereqConstructible ? {id: def.PrereqConstructible, name: name(constructible?.Name), anyOwnedSettlement: Boolean(def.PrereqAnyCity)} : null,
          legacyPath: def.RequireCompletedLegacyPathType ? {id: def.RequireCompletedLegacyPathType, name: name(legacyPath?.Name),
            complete: completedPaths == null ? null : completedPaths.has(def.RequireCompletedLegacyPathType)} : null,
          unlocks
        },
        settlements: cities.map(city => {
          const result = Game.CityOperations.canStart(city.id, CityOperationTypes.BUILD, {ProjectType: def.$index}, false);
          return {
            name: name(city.name), availableNow: result ? Boolean(result.Success) : null,
            failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean),
            meetsNativeRequirements: result?.Requirements?.MeetsRequirements ?? null,
            fullFailure: result?.Requirements?.FullFailure ?? null,
            prerequisiteConstructiblePresent: !def.PrereqConstructible ? null : def.PrereqAnyCity ? empirePrerequisite : hasPrerequisite(city),
            inQueue: result?.InQueue ?? null,
            productionCost: city.Production.getProjectProductionCost(def.ProjectType) ?? null,
            turnsAtCurrentProduction: result?.Success ? city.BuildQueue.getTurnsLeft(def.ProjectType) ?? null : null
          };
        })
      };
    });
    return {projects,
      scope: "Loaded Modern non-town, non-upgrade projects with positive definition costs; includes conversion projects, not an assertion that every project wins a victory",
      note: "Owned settlements only. Visible unlock links and definition prerequisites are evidence, not an exhaustive requirement evaluator or an AND dependency chain. Native BUILD checks decide availability; current-production turn quotes are not victory forecasts"
    };
  }

  const modifierEffects = new Map([...(GameInfo.DynamicModifiers ?? [])].map(row => [row.ModifierType, row]));
  const trackerArguments = new Map((GameInfo.ModifierArguments?.filter(arg => arg.Name === "TrackerName") ?? [])
    .map(arg => [arg.ModifierId, arg.Value]));
  const attachmentArguments = new Map((GameInfo.ModifierArguments?.filter(arg => arg.Name === "ModifierId") ?? [])
    .map(arg => [arg.ModifierId, arg.Value]));

  function cultureActivationEvidence(rule) {
    if (!GameInfo.Modifiers || !GameInfo.DynamicModifiers || !GameInfo.ModifierArguments) return null;
    const effect = modifier => modifierEffects.get(modifier.ModifierType);
    const activators = GameInfo.Modifiers.filter(modifier =>
      effect(modifier)?.EffectType === "EFFECT_PLAYER_ACTIVATE_VICTORY_POINT_TRACKER" &&
      trackerArguments.get(modifier.ModifierId) === rule.ScoringId);
    const activatorIds = new Set(activators.map(modifier => modifier.ModifierId));
    // A bounded definition join, not a recursive modifier/requirement evaluator.
    const parents = GameInfo.Modifiers.filter(modifier => effect(modifier)?.EffectType === "EFFECT_ATTACH_MODIFIERS" &&
      activatorIds.has(attachmentArguments.get(modifier.ModifierId)));
    const modifiers = [...activators, ...parents];
    const modifierIds = new Set(modifiers.map(modifier => modifier.ModifierId));
    return {
      modifiers: modifiers.map(modifier => ({id: modifier.ModifierId, effect: effect(modifier)?.EffectType ?? null,
        collection: effect(modifier)?.CollectionType ?? null,
        ownerRequirementSet: modifier.OwnerRequirementSetId ?? null, subjectRequirementSet: modifier.SubjectRequirementSetId ?? null})),
      unlocks: GameInfo.ProgressionTreeNodeUnlocks == null ? null : GameInfo.ProgressionTreeNodeUnlocks
        .filter(unlock => !unlock.Hidden && unlock.TargetKind === "KIND_MODIFIER" && modifierIds.has(unlock.TargetType))
        .map(unlock => {
          const node = GameInfo.ProgressionTreeNodes.lookup(unlock.ProgressionTreeNodeType);
          const state = node ? Game.ProgressionTrees.getNode(localId, node.$hash) : null;
          return {modifierId: unlock.TargetType, id: unlock.ProgressionTreeNodeType, name: name(node?.Name),
            requiredDepth: unlock.UnlockDepth ?? null, depthUnlocked: state?.depthUnlocked ?? null,
            researchRequirementMet: Number.isFinite(state?.depthUnlocked) && Number.isFinite(unlock.UnlockDepth)
              ? state.depthUnlocked >= unlock.UnlockDepth : null,
            requiredGovernment: unlock.RequiredGovernmentType ?? null, requiredTrait: unlock.RequiredTraitType ?? null,
            excludedTrait: unlock.NotTraitType ?? null};
        }),
      traditions: GameInfo.TraditionModifiers == null ? null : GameInfo.TraditionModifiers.filter(link => modifierIds.has(link.ModifierId))
        .map(link => {
          const def = GameInfo.Traditions.lookup(link.TraditionType);
          return {modifierId: link.ModifierId, id: link.TraditionType, name: name(def?.Name),
            active: def && typeof localPlayer.Culture?.isTraditionActive === "function"
              ? localPlayer.Culture.isTraditionActive(def.$hash) ?? null : null};
        }),
      note: "Public activation-effect definitions plus direct or one-attachment research/policy links. Local mastery depth and policy state are evidence, not evaluated tracker activation or qualifying Tourism contributions. Requirement sets, other attachment depths, Triumph/building/leader sources and modifier lifetimes are not evaluated; an empty list does not prove inactivity"
    };
  }

  let cultureInventory;
  function ownedCultureInventory() {
    if (cultureInventory !== undefined) return cultureInventory;
    const revealed = location => location && Number.isInteger(location.x) && Number.isInteger(location.y) &&
      location.x >= 0 && location.y >= 0 && location.x < GameplayMap.getGridWidth() && location.y < GameplayMap.getGridHeight() &&
      GameplayMap.getRevealedState(localId, location.x, location.y) !== RevealedStates.HIDDEN;
    const readWork = index => {
      if (!Number.isInteger(index) || index < 0) return null;
      const type = Game.Culture?.getGreatWorkType?.(index);
      const def = type == null ? null : GameInfo.GreatWorks?.lookup(type);
      return {instanceIndex: index, id: def?.GreatWorkType ?? null, name: name(def?.Name), objectType: def?.GreatWorkObjectType ?? null};
    };
    const cities = localPlayer.Cities?.getCities?.();
    const settlements = cities == null ? null : cities.filter(city => city.id.owner === localId).map(city => {
      const ids = city.Constructibles?.getIds?.();
      const assets = ids == null ? null : [];
      let inventoryComplete = ids != null;
      for (const component of ids ?? []) {
        if (component.owner !== localId) continue;
        const instance = Constructibles.getByComponentID(component);
        if (!instance || instance.owner !== localId) { inventoryComplete = false; continue; }
        const location = instance.location;
        if (!revealed(location)) { inventoryComplete = false; continue; }
        const def = GameInfo.Constructibles.lookup(instance.type);
        if (!def) { inventoryComplete = false; continue; }
        const traitDefinition = def.ConstructibleClass === "IMPROVEMENT" ? GameInfo.Improvements?.lookup(def.ConstructibleType)
          : def.ConstructibleClass === "BUILDING" ? GameInfo.Buildings?.lookup(def.ConstructibleType) : null;
        assets.push({instanceId: component.id, id: def.ConstructibleType, name: name(def.Name), class: def.ConstructibleClass,
          definitionAge: def.Age ?? null, location: {x: location.x, y: location.y},
          complete: instance.complete ?? null, damaged: instance.damaged ?? null,
          traitType: traitDefinition?.TraitType ?? null, traitDefinitionKnown: traitDefinition != null});
      }
      const buildings = city.Constructibles?.getGreatWorkBuildings?.();
      let displayedWorks = buildings == null ? null : [];
      for (const building of buildings ?? []) {
        if (building.constructibleID?.owner !== localId) continue;
        const instance = Constructibles.getByComponentID(building.constructibleID);
        if (!instance || instance.owner !== localId || !revealed(instance.location) || building.slots == null) {
          displayedWorks = null;
          break;
        }
        for (const slot of building.slots) {
          const work = readWork(slot.greatWorkIndex);
          if (work) displayedWorks.push({...work, buildingComplete: instance.complete ?? null, buildingDamaged: instance.damaged ?? null});
        }
      }
      return {cityId: city.id.id, settlement: name(city.name), town: city.isTown ?? null,
        railNetworkMembership: city.Trade?.isInRailNetwork?.() ?? null, inventoryComplete, assets, displayedWorks};
    });
    const archiveCount = localPlayer.Culture?.getNumWorksInArchive?.();
    const archivedWorks = Number.isInteger(archiveCount) && archiveCount >= 0 &&
      (archiveCount === 0 || typeof localPlayer.Culture?.getArchivedGreatWork === "function") ? [] : null;
    for (let index = 0; archivedWorks != null && index < archiveCount; index++) {
      const work = readWork(localPlayer.Culture.getArchivedGreatWork(index));
      if (work) archivedWorks.push(work);
    }
    cultureInventory = {settlements, archivedWorks};
    return cultureInventory;
  }

  function cultureLocalEvidence(rule, localScoring) {
    const assetBasis = ({VICTORY_TRACKER_WONDER: "wonders", VICTORY_TRACKER_UNIQUE_IMPROVEMENT: "trait-linked-improvements",
      VICTORY_TRACKER_UNIQUE_QUARTER: "trait-linked-buildings", VICTORY_TRACKER_GREAT_WORK: "great-works"})[rule.TrackerType] ?? "unknown";
    const trackerCode = typeof VictoryTrackerTypes === "undefined" ? undefined : VictoryTrackerTypes[rule.TrackerType];
    const ledgerEntryIndices = trackerCode == null || localScoring == null ? null
      : localScoring.flatMap((score, index) => score.trackerType === trackerCode ? [index] : []);
    const required = GameInfo.VictoryScoringArgs?.find(arg => arg.ScoringId === rule.ScoringId && arg.Key === "REQUIRED_CONSTRUCTIBLE")?.ValueAsText;
    const inventory = assetBasis === "unknown" ? null : ownedCultureInventory();
    const worksOfType = works => works == null || !rule.Data ? null : works.filter(work => work.objectType == null || work.objectType === rule.Data);
    const settlements = inventory?.settlements?.map(city => {
      let candidateAssets = null;
      if (assetBasis === "wonders") candidateAssets = city.assets?.filter(asset => asset.class === "WONDER") ?? null;
      if (assetBasis === "trait-linked-improvements" || assetBasis === "trait-linked-buildings") {
        const kind = assetBasis === "trait-linked-improvements" ? "IMPROVEMENT" : "BUILDING";
        candidateAssets = city.assets == null || city.assets.some(asset => asset.class === kind && !asset.traitDefinitionKnown)
          ? null : city.assets.filter(asset => asset.class === kind && asset.traitType);
      }
      const matching = city.assets?.filter(asset => asset.id === required);
      const observed = matching?.some(asset => asset.complete === true && asset.damaged === false) ? true
        : matching == null || !city.inventoryComplete || matching.some(asset => asset.complete == null || asset.damaged == null) ? null : false;
      return {cityId: city.cityId, settlement: city.settlement, town: city.town, railNetworkMembership: city.railNetworkMembership,
        inventoryComplete: city.inventoryComplete, candidateAssets,
        requiredConstructible: required ? {id: required, observedCompleteUndamaged: observed} : null,
        displayedWorks: assetBasis === "great-works" ? worksOfType(city.displayedWorks) : null};
    }) ?? null;
    return {assetBasis, settlements, archivedWorks: assetBasis === "great-works" ? worksOfType(inventory?.archivedWorks) : null,
      requiredConstructibleScope: null, ledgerMatchBasis: trackerCode == null ? "unknown" : "tracker-family-only", ledgerEntryIndices,
      qualifyingCount: null, attributedPoints: null,
      note: "Local revealed owned candidates only: trait-linked buildings are not certified unique-quarter qualifiers; definition Age is not inferred build/scoring Age. Incomplete/damaged candidates are retained. Rail membership and observed required-building presence do not evaluate requirement scope or activation. Ledger indices refer to this victory's local progress.scoring and match tracker family only, potentially including other rules, Ages or work types: do not attribute or sum them per rule. Current/archived works do not reconstruct historical maximum displays. Unknown families, qualification, attributed points and future gains remain unknown"
    };
  }

  const players = [];
  for (const playerId of Players.getAliveIds()) {
    const isLocal = playerId === localId;
    if (!isLocal && !diplomacy?.hasMet(playerId)) continue;
    const player = Players.get(playerId);
    if (!player?.isMajor || !player.Victories) continue;
    const leader = GameInfo.Leaders.lookup(player.leaderType);
    players.push({
      id: playerId,
      isLocal,
      team: player.team,
      civilization: name(player.civilizationFullName),
      leader: name(leader?.Name ?? player.leaderName)
    });
  }

  const completedVictories = Game.VictoryManager.getVictories();
  const victoryConditions = [...GameInfo.VictoryTypes]
    .sort((a, b) => a.VictoryType.localeCompare(b.VictoryType))
    .map(type => {
      const definition = GameInfo.Victories.find(
        value => value.VictoryType === type.VictoryType
      );
      if (!definition) return null;
      const targetPoints = Game.VictoryManager.getCountdownVictoryDominanceScore(type.$hash);
      let localScoring = null;
      const progress = players.map(known => {
        const player = Players.get(known.id);
        const scoring = player.Victories.getScoringForVictoryType(type.$hash);
        if (known.isLocal) localScoring = scoring;
        const status = player.Victories.getVictoryCountdownStatus(type.$hash);
        const turnsProgress = Number.isFinite(status?.turns) ? status.turns : null;
        const duration = type.CountdownDuration;
        return {
          playerId: known.id,
          points: player.Victories.getPointsForVictoryType(type.$hash),
          won: completedVictories.some(
            victory => victory.victory === type.$hash && victory.team === player.team
          ),
          countdown: status ? {
            isDominant: typeof status.isDominant === "boolean" ? status.isDominant : null,
            turnsProgress,
            turnsRemaining: duration > 0 && turnsProgress != null
              ? Math.max(duration - turnsProgress, 0)
              : null,
            prerequisites: (status.prereqs ?? []).map(prereq => ({
              name: name(prereq.description),
              current: prereq.current ?? null,
              total: prereq.total ?? null,
              complete: Number.isFinite(prereq.current) && Number.isFinite(prereq.total) ? prereq.current >= prereq.total : null
            }))
          } : null,
          scoring: (scoring ?? []).map(score => ({
            name: name(score.name),
            points: score.points,
            turn: score.turn,
            age: name(GameInfo.Ages.lookup(score.age)?.Name),
            trackerType: score.trackerType
          }))
        };
      });
      return {
        id: type.VictoryType,
        class: definition.VictoryClassType,
        name: name(type.Name),
        description: name(type.Description),
        finalAge: name(GameInfo.Ages.lookup(type.FinalAge)?.Name),
        enabled: Boolean(Game.VictoryManager.isCountdownVictoryEnabled(type.VictoryType)),
        scoringType: type.ScoringType,
        minimumPoints: type.MinimumPoints,
        targetPoints: targetPoints === -1 ? null : targetPoints,
        countdownDuration: type.CountdownDuration,
        prerequisiteRuleSet: type.PrereqRequirementSetId ?? null,
        dominanceSchedule: dominanceSchedule(type),
        scoringRules: (GameInfo.VictoryScorings ?? []).filter(rule => rule.VictoryType === type.VictoryType).map(rule => ({
          id: rule.ScoringId, name: name(rule.Name), trackerType: rule.TrackerType, definitionPoints: rule.Points ?? null,
          data: rule.Data ?? null, requiresActivation: rule.RequiresActivation == null ? null : Boolean(rule.RequiresActivation),
          staticCarryover: rule.StaticCarryover == null ? null : Boolean(rule.StaticCarryover), activeForLocalPlayer: null,
          activationEvidence: definition.VictoryClassType === "VICTORY_CLASS_CULTURE" ? cultureActivationEvidence(rule) : null,
          localEvidence: definition.VictoryClassType === "VICTORY_CLASS_CULTURE" ? cultureLocalEvidence(rule, localScoring) : null,
          arguments: (GameInfo.VictoryScoringArgs ?? []).filter(arg => arg.ScoringId === rule.ScoringId)
            .map(arg => ({key: arg.Key, value: arg.ValueAsText || (arg.ValueAsInt ?? null)}))
        })),
        progress
      };
    })
    .filter(Boolean);

  const victoryAlerts = [];
  for (const victory of victoryConditions) {
    for (const progress of victory.progress) {
      if (progress.won) victoryAlerts.push({kind: "completed-victory", victoryId: victory.id, playerId: progress.playerId,
        isLocal: progress.playerId === localId});
      else if (victory.enabled && progress.countdown?.isDominant === true) victoryAlerts.push({
        kind: "dominance-countdown", victoryId: victory.id, playerId: progress.playerId, isLocal: progress.playerId === localId,
        turnsRemaining: progress.countdown.turnsRemaining,
        note: "Remaining engine countdown if qualifying conditions continue; not an unconditional future victory date"
      });
    }
    const schedule = victory.dominanceSchedule;
    if (Number.isFinite(schedule?.currentTier?.multiplier) && Number.isFinite(schedule?.nextTier?.multiplier) &&
        schedule.nextTier.multiplier < schedule.currentTier.multiplier) victoryAlerts.push({
      kind: "dominance-threshold-change", victoryId: victory.id,
      atAgeProgressPercent: schedule.nextTier.minAgeProgressPercent,
      currentMultiplier: schedule.currentTier.multiplier, nextMultiplier: schedule.nextTier.multiplier,
      note: "A lower scheduled ratio can make victory easier without any rival earning additional points; recheck native targets/countdowns as Age progress changes"
    });
  }
  return {
    turn: Game.turn,
    age: name(GameInfo.Ages.lookup(Game.age)?.Name),
    ageProgress: {
      current: currentAgePoints,
      total: maximumAgePoints,
      percent: agePercent,
      extendedGame: Boolean(Game.AgeProgressManager.isExtendedGame)
    },
    scope: "Local player and met major players only",
    players,
    victoryAlerts,
    planningNote: "Inspect victoryAlerts and each dominanceSchedule, not a remembered ratio or description. Public scoring rules are conditional definitions, not a complete dependency evaluator or a promise that every source is active. No thresholds are recomputed from only met rivals",
    victoryConditions,
    modernProjects: modernProjectRequirements()
  };
})()
