(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  const name = key => key ? Locale.compose(key) : null;

  function safeLocation(value) {
    if (!value) return null;
    const x = value.x ?? value.X;
    const y = value.y ?? value.Y;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 ||
      x >= GameplayMap.getGridWidth() || y >= GameplayMap.getGridHeight()) return null;
    if (GameplayMap.getRevealedState(playerId, x, y) === RevealedStates.HIDDEN) return null;
    return {x, y};
  }

  const notifications = (Game.Notifications.getIdsForPlayer(playerId) ?? []).map(id => {
    const notification = Game.Notifications.find(id);
    if (!notification) return null;
    const type = Game.Notifications.getType(id);
    return {
      id: {owner: id.owner, id: id.id, type: id.type},
      type: Game.Notifications.getTypeName(type),
      summary: name(Game.Notifications.getSummary(id)),
      severity: Game.Notifications.getSeverity(id),
      blocksTurn: Boolean(Game.Notifications.getBlocksTurnAdvancement(id)),
      location: safeLocation(notification.Location)
    };
  }).filter(Boolean);

  const quests = (player.Stories.getActiveQuests() ?? []).map(quest => {
    const def = GameInfo.NarrativeStories.lookup(quest.story);
    let text = player.Stories.determineNarrativeInjectionStoryType(
      quest.story, StoryTextTypes.IMPERATIVE
    );
    if (!text) {
      text = player.Stories.determineNarrativeInjectionStoryType(
        quest.story, StoryTextTypes.REWARD
      );
    }
    return {
      id: def?.NarrativeStoryType ?? quest.storyId ?? quest.story,
      name: name(def?.StoryTitle ?? def?.Name),
      description: name(text),
      progress: quest.progress,
      goal: quest.goal,
      endTurn: quest.endTurn === -1 ? null : quest.endTurn,
      turnsRemaining: quest.endTurn === -1 ? null : Math.max(quest.endTurn - Game.turn, 0)
    };
  });

  const stories = player.Stories;
  const seenStories = new Set();
  const pendingEvents = [];
  const pendingIds = [...(stories.getPendingMetIds() ?? []),
    stories.getFirstPendingDiscoveryLastMetID(), stories.getFirstPendingMetId()];
  for (const storyId of pendingIds) {
    if (!storyId || storyId.owner !== playerId) continue;
    const key = `${storyId.owner}:${storyId.id}:${storyId.type}`;
    if (seenStories.has(key)) continue;
    seenStories.add(key);
    const story = stories.find(storyId);
    const def = story && GameInfo.NarrativeStories.lookup(story.type);
    if (!def) continue;
    const injected = type => name(stories.determineNarrativeInjectionComponentId(storyId, type));
    const event = {
      id: def.NarrativeStoryType,
      instanceId: {owner: storyId.owner, id: storyId.id, type: storyId.type},
      activation: def.UIActivation ?? null,
      isCrisis: Boolean(def.Crisis || def.UIActivation === "CRISIS"),
      name: injected(StoryTextTypes.TITLE), body: injected(StoryTextTypes.BODY),
      location: safeLocation(stories.getStoryPlotCoord(storyId)),
      choices: null
    };
    event.trialRequiresAcknowledgement=def.UIActivation==="TRIAL";
    {
      const links = def.VariableLinks ? stories.getOrderedLinks(storyId) ?? []
        : GameInfo.NarrativeStory_Links.filter(value => value.FromNarrativeStoryType === def.NarrativeStoryType)
          .map(value => value.ToNarrativeStoryType);
      const choices = [];
      const seenChoices = new Set();
      for (const link of links) {
        const option = GameInfo.NarrativeStories.lookup(link);
        if (!option || seenChoices.has(option.NarrativeStoryType)) continue;
        const activation = option.Activation?.toUpperCase();
        if (activation !== "LINKED" && !(["LINKED_REQUISITE", "LINKED_COMMON", "LINKED_SUBJECT_REQUISITE"].includes(activation) &&
          stories.determineRequisiteLink(option.NarrativeStoryType, storyId))) continue;
        seenChoices.add(option.NarrativeStoryType);
        const text = type => name(stories.determineNarrativeInjection(storyId, option.$hash, type));
        choices.push({id: option.NarrativeStoryType, name: text(StoryTextTypes.OPTION),
          reward: text(StoryTextTypes.REWARD), action: text(StoryTextTypes.IMPERATIVE),
          baseCost: Number.isFinite(option.Cost) ? {yield: option.CostYield ?? null, amount: option.Cost} : null,
          canAfford: option.Cost === 0 || Boolean(stories.canAfford(option.NarrativeStoryType))});
      }
      if (!choices.length) choices.push({id: "CLOSE", name: name("LOC_NARRATIVE_STORY_END_STORY_NAME"),
        reward: injected(StoryTextTypes.REWARD), action: null, baseCost: {yield: null, amount: 0}, canAfford: true});
      event.choices = choices.map(choice => {
        const result = Game.PlayerOperations.canStart(playerId, PlayerOperationTypes.CHOOSE_NARRATIVE_STORY_DIRECTION,
          {TargetType: choice.id, Target: storyId, Action: PlayerOperationParameters.Activate}, false);
        const quote=Number.isFinite(result?.Cost)&&result.Cost>=0?{yield:choice.baseCost?.yield??null,amount:result.Cost}:null;
        return {...choice, quotedCost:quote, operationAllowed: Boolean(result?.Success),
          supportedByExtendedTool:choice.baseCost?.amount===0||quote!==null&&["YIELD_GOLD","YIELD_DIPLOMACY"].includes(quote.yield),
          availableNow: choice.canAfford && Boolean(result?.Success),
          failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean)};
      });
    }
    pendingEvents.push(event);
  }

  function crisisSettlement(city) {
    const plaguePlots = [];
    for (const index of new Set(city.getPurchasedPlots() ?? [])) {
      const location = safeLocation(GameplayMap.getLocationFromIndex(index));
      if (!location) continue;
      for (const effect of MapPlotEffects.getPlotEffects(index) ?? []) {
        if (effect.onlyVisibleToOwner && effect.owner !== playerId) continue;
        const def = GameInfo.PlotEffects.lookup(effect.effectType);
        if (def?.PlotEffectType !== "PLOTEFFECT_PLAGUE") continue;
        plaguePlots.push({location, name: name(def.Name), remainingTurns: effect.duration > 0 ? effect.duration : null,
          definitionBaseDamage: def.Damage ?? null});
      }
    }
    const damagedConstructibles = (city.Constructibles.getIds() ?? []).map(componentId => {
      const instance = Constructibles.getByComponentID(componentId);
      if (!instance?.damaged) return null;
      const def = GameInfo.Constructibles.lookup(instance.type);
      return {id: def?.ConstructibleType ?? instance.type, name: name(def?.Name),
        location: safeLocation(instance.location), damageCause: null};
    }).filter(Boolean);
    return {name: name(city.name), infected: city.isInfected == null ? null : Boolean(city.isInfected),
      plaguePlots, damagedConstructibles,
      netHappinessPerTurn: city.Happiness?.netHappinessPerTurn ?? null,
      unrest: city.Happiness?.hasUnrest == null ? null : Boolean(city.Happiness.hasUnrest),
      crisisYieldPenalty: null};
  }

  let crisis = null;
  if (Game.CrisisManager.isCrisisEnabled(0)) {
    const currentStage = Game.CrisisManager.getCurrentCrisisStage(0);
    const numStages = Game.CrisisManager.getNumCrisisStages(0);
    crisis = {
      active: currentStage >= 0,
      currentStage: currentStage >= 0 ? currentStage : null,
      stages: Number.isInteger(numStages) && numStages >= 0 ? Array.from({length: numStages}, (_, stage) => ({
        stage,
        triggerPercent: Game.CrisisManager.getCrisisStageTriggerPercent(0, stage)
      })) : null,
      minimumTurnsRemaining: currentStage >= 0
        ? Game.CrisisManager.getMinimumTurnsRemainingInCurrentCrisis(0, currentStage)
        : null,
      maximumTurnsRemaining: currentStage >= 0
        ? Game.CrisisManager.getMaximumTurnsRemainingInCurrentCrisis(0, currentStage)
        : null,
      settlements: player.Cities.getCities().map(crisisSettlement),
      effectNote: "Owned settlement evidence only. Definition damage is not predicted damage; existing damage is not attributed to plague. Numerical crisis yield penalties are unknown"
    };
  }

  const currentAgePoints = Game.AgeProgressManager.getCurrentAgeProgressionPoints();
  const maximumAgePoints = Game.AgeProgressManager.getMaxAgeProgressionPoints();
  return {
    turn: Game.turn,
    age: name(GameInfo.Ages.lookup(Game.age)?.Name),
    ageProgress: {
      current: currentAgePoints,
      total: maximumAgePoints,
      percent: maximumAgePoints > 0 ? currentAgePoints / maximumAgePoints * 100 : null,
      extendedGame: Boolean(Game.AgeProgressManager.isExtendedGame),
      finalAge: Boolean(Game.AgeProgressManager.isFinalAge),
      countdownStarted: Boolean(Game.AgeProgressManager.ageCountdownStarted),
      countdownLength: Game.AgeProgressManager.getAgeCountdownLength,
      turnsRemaining: Game.AgeProgressManager.ageCountdownStarted
        ? Math.max(maximumAgePoints - currentAgePoints, 0)
        : null
    },
    crisis,
    pendingEvents,
    pendingEventsCoverage: {reportedPendingCount: stories.getNumPendingMet(),
      scope: "Native local pending IDs plus the two UI queue heads; trial choices are not modeled. Base costs are definition values, not runtime quotes"},
    quests,
    notifications
  };
})()
