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
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
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

  let crisis = null;
  if (Game.CrisisManager.isCrisisEnabled(0)) {
    const currentStage = Game.CrisisManager.getCurrentCrisisStage(0);
    crisis = {
      active: currentStage >= 0,
      currentStage: currentStage >= 0 ? currentStage : null,
      stages: [0, 1, 2, 3].map(stage => ({
        stage,
        triggerPercent: Game.CrisisManager.getCrisisStageTriggerPercent(0, stage)
      })),
      minimumTurnsRemaining: currentStage >= 0
        ? Game.CrisisManager.getMinimumTurnsRemainingInCurrentCrisis(0, currentStage)
        : null,
      maximumTurnsRemaining: currentStage >= 0
        ? Game.CrisisManager.getMaximumTurnsRemainingInCurrentCrisis(0, currentStage)
        : null
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
    quests,
    notifications
  };
})()
