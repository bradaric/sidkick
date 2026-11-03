(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const localId = GameContext.localPlayerID;
  if (!Number.isInteger(localId) || localId < 0) throw Error("No local player");
  const player = Players.get(localId);
  const diplomacy = player.Diplomacy;
  const name = key => key ? Locale.compose(key) : null;

  function failureReasons(project) {
    return (project?.resultData?.FailureReasons ?? []).map(name).filter(Boolean);
  }

  function availableActions(otherId) {
    const projects = Game.Diplomacy.getProjectDataForUI(
      localId,
      otherId,
      DiplomacyActionTargetTypes.NO_DIPLOMACY_TARGET,
      DiplomacyActionGroups.NO_DIPLOMACY_ACTION_GROUP,
      -1,
      DiplomacyActionTargetTypes.NO_DIPLOMACY_TARGET
    ) ?? [];
    return projects
      .filter(project => ![
        DiplomacyProjectStatus.PROJECT_NOT_UNLOCKED,
        DiplomacyProjectStatus.PROJECT_BLOCKED,
        DiplomacyProjectStatus.PROJECT_ACTIVE
      ].includes(project.projectStatus))
      .map(project => ({
        id: project.actionTypeName ?? project.actionType,
        name: name(project.actionDisplayName),
        description: name(project.projectDescription),
        group: project.actionGroup,
        influenceCost: project.influenceCost,
        available: project.projectStatus === DiplomacyProjectStatus.PROJECT_AVAILABLE,
        targetChoices: (project.targetList ?? []).length,
        secondaryTargetChoices: (project.targetList2 ?? []).length,
        failureReasons: failureReasons(project)
      }));
  }

  function ongoingActions(otherId) {
    return (Game.Diplomacy.getPlayerEvents(otherId) ?? [])
      .filter(action => {
        const involvesOther = action.initialPlayer === otherId || action.targetPlayer === otherId;
        const knownToLocal = action.initialPlayer === localId ||
          (action.targetPlayer === localId && action.revealed);
        return involvesOther && knownToLocal;
      })
      .map(action => {
        const completion = Game.Diplomacy.getCompletionData(action.uniqueID);
        return {
          id: action.uniqueID,
          type: action.actionTypeName ?? action.actionType,
          name: name(action.name),
          description: name(action.description),
          group: action.actionGroup,
          initiatedBy: action.initialPlayer === localId ? "you" : "them",
          turnStarted: action.gameTurnStart,
          completion: completion ? {
            turnsRemaining: completion.turnsToCompletion,
            progress: completion.requiredProgress == null
              ? null
              : completion.requiredProgress - completion.turnsToCompletion * completion.progressPerTurn,
            requiredProgress: completion.requiredProgress,
            progressPerTurn: completion.progressPerTurn
          } : null
        };
      });
  }

  const majorPlayers = [];
  for (const otherId of Players.getAliveIds()) {
    if (otherId === localId || !diplomacy.hasMet(otherId)) continue;
    const other = Players.get(otherId);
    if (!other?.isMajor) continue;
    const leader = GameInfo.Leaders.lookup(other.leaderType);
    majorPlayers.push({
      playerId: otherId,
      civilization: name(other.civilizationFullName),
      leader: name(leader?.Name ?? other.leaderName),
      relationship: name(diplomacy.getRelationshipLevelName(otherId)),
      relationshipLevel: diplomacy.getRelationshipLevel(otherId),
      relationshipType: diplomacy.getRelationshipEnum(otherId),
      atWar: Boolean(diplomacy.isAtWarWith(otherId)),
      allied: Boolean(diplomacy.hasAllied(otherId)),
      pendingDeal: Boolean(Game.DiplomacyDeals.hasPendingDeal(localId, otherId)),
      relationshipModifiers: (diplomacy.getPlayerRelationshipHistory(otherId) ?? []).map(event => ({
        name: name(event.eventType),
        amount: event.amount
      })),
      ongoingActions: ongoingActions(otherId),
      availableActions: availableActions(otherId)
    });
  }

  return {
    turn: Game.turn,
    scope: "Local player and met major players only",
    netInfluencePerTurn: player.Stats.getNetYield(YieldTypes.YIELD_DIPLOMACY),
    dealCount: (Game.DiplomacyDeals.getDealIds(localId) ?? []).length,
    majorPlayers
  };
})()
