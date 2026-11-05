(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const localId = GameContext.localPlayerID;
  if (!Number.isInteger(localId) || localId < 0) throw Error("No local player");
  const player = Players.get(localId);
  const diplomacy = player.Diplomacy;
  const name = key => key ? Locale.compose(key) : null;
  const finite = value => Number.isFinite(value) ? value : null;
  const nonnegative = value => Number.isFinite(value) && value >= 0 ? value : null;
  const responseTypes = typeof DiplomaticResponseTypes === "undefined" ? {} : DiplomaticResponseTypes;
  const responseNames = Object.fromEntries(Object.entries(responseTypes).map(([key, value]) => [value, key]));

  function terms(actionType) {
    const def = GameInfo.DiplomacyActions?.lookup(actionType);
    return def ? {description: name(def.Description), definitionBaseDuration: nonnegative(def.BaseDuration),
      mutualSupport: def.IsMutualSupport ?? null, supportable: def.Supportable ?? null, opposable: def.Opposable ?? null} : null;
  }

  function failureReasons(...records) {
    return [...new Set(records.flatMap(record => record?.resultData?.FailureReasons ?? []).map(name).filter(Boolean))];
  }

  function secondaryChoice(project, primary, target, otherId) {
    const parameter = target.parameterName;
    if (!Number.isInteger(target.targetID) || target.targetID === -1 || (parameter !== "Unit" && target.targetID < 0)) return null;
    let kind, label;
    if (parameter === "Player3" || parameter === "ID2") {
      if (target.targetID !== localId && !diplomacy.hasMet(target.targetID)) return null;
      const other = target.targetID === localId ? player : Players.get(target.targetID);
      if (!other || (parameter === "ID2" && !other.isMinor && !other.isIndependent)) return null;
      kind = "player";
      label = name(other.civilizationFullName);
    } else if (parameter === "Amount2") {
      kind = "amount";
      label = name(target.targetName);
    } else if (parameter === "City") {
      const cities = player.Cities?.getCities().filter(city => city.id.owner === localId && city.id.id === target.targetID) ?? [];
      if (cities.length !== 1) return null;
      kind = "owned-settlement";
      label = name(cities[0].name);
    } else if (parameter === "Unit") {
      // The picker resolves public unit definitions here, not foreign unit instances.
      const def = GameInfo.Units?.lookup(target.targetName);
      if (!def) return null;
      kind = "unit-type";
      label = name(def.Name);
    } else return null;
    const args = {Player1: localId, Player2: otherId, Type: project.actionType, Amount: 1, [parameter]: target.targetID};
    const result = project.operationType == null ? null : Game.PlayerOperations.canStart(localId, project.operationType, args, false);
    const reasons = failureReasons(project, primary, target, {resultData: result});
    return {parameter, value: target.targetID, kind, name: label,
      operationAllowed: result ? Boolean(result.Success) : null,
      availableNow: project.projectStatus === DiplomacyProjectStatus.PROJECT_AVAILABLE && !reasons.length && Boolean(result?.Success),
      quotedInfluenceCost: nonnegative(target.costYieldD), failureReasons: reasons};
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
      .map(project => {
        const target = (project.targetList1 ?? []).find(value => value.targetID === otherId);
        const reasons = failureReasons(project, target);
        const requiresSecondaryTarget = Boolean(project.targetList2?.length) || (project.target2Type != null &&
          ![DiplomacyActionTargetTypes.NO_DIPLOMACY_TARGET, DiplomacyActionTargetTypes.DIPLOMACY_TARGET_NONE].includes(project.target2Type));
        const selectedCost = nonnegative(target?.costYieldD);
        const secondaryTargets = target ? (project.targetList2 ?? []).map(secondary => secondaryChoice(project, target, secondary, otherId)).filter(Boolean) : [];
        return {
          id: project.actionTypeName ?? project.actionType,
          name: name(project.actionDisplayName),
          description: name(project.projectDescription),
          group: project.actionGroup,
          influenceCost: requiresSecondaryTarget ? null : selectedCost,
          selectedTargetInfluenceCost: selectedCost,
          available: project.projectStatus === DiplomacyProjectStatus.PROJECT_AVAILABLE && Boolean(target) && !reasons.length &&
            (!requiresSecondaryTarget || secondaryTargets.some(choice => choice.availableNow)),
          targetChoices: target ? 1 : 0,
          requiresSecondaryTarget,
          // Do not expose unrelated targets or counts from unfiltered native lists.
          secondaryTargetChoices: requiresSecondaryTarget ? null : 0,
          secondaryTargets,
          secondaryTargetsComplete: !requiresSecondaryTarget,
          terms: terms(project.actionType ?? project.actionTypeName),
          quotedBaseDuration: project.actionType == null ? null : nonnegative(Game.Diplomacy.getBaseDiplomaticActionDuration?.(project.actionType)),
          nativeLastStageDuration: nonnegative(project.lastStageDuration),
          failureReasons: reasons
        };
      });
  }

  function ongoingActions(otherId) {
    return (Game.Diplomacy.getPlayerEvents(otherId) ?? [])
      .filter(action => {
        const involvesOther = action.initialPlayer === otherId || action.targetPlayer === otherId;
        const incomingEspionage = DiplomacyActionGroups.DIPLOMACY_ACTION_GROUP_ESPIONAGE != null &&
          action.actionGroup === DiplomacyActionGroups.DIPLOMACY_ACTION_GROUP_ESPIONAGE;
        const knownToLocal = action.initialPlayer === localId ||
          (action.targetPlayer === localId && action.revealed && !action.hidden && !incomingEspionage);
        return involvesOther && knownToLocal;
      })
      .map(action => {
        const completion = Game.Diplomacy.getCompletionData(action.uniqueID);
        const stage = Game.Diplomacy.getActiveStage?.(action.uniqueID);
        return {
          id: action.uniqueID,
          type: action.actionTypeName ?? action.actionType,
          name: name(action.name),
          description: name(action.description),
          group: action.actionGroup,
          initiatedBy: action.initialPlayer === localId ? "you" : "them",
          turnStarted: nonnegative(action.gameTurnStart),
          turnEnded: nonnegative(action.gameTurnEnd),
          support: finite(action.support),
          response: action.responseType === responseTypes.INVALID_RESPONSE ? null : responseNames[action.responseType] ?? null,
          terms: terms(action.actionType ?? action.actionTypeName),
          activeStage: stage ? {id: stage.stageType ?? null, previouslyEntered: stage.previouslyEntered ?? null,
            effects: (stage.stageModifiers ?? []).map(effect => ({description: name(effect.description), available: effect.available ?? null}))} : null,
          completion: completion ? {
            turnsRemaining: nonnegative(completion.turnsToCompletion),
            progress: finite(action.progressScore),
            requiredProgress: nonnegative(completion.requiredProgress),
            progressPerTurn: finite(completion.progressPerTurn),
            turnsToNextStage: nonnegative(completion.turnsToNextStage)
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
    scope: "Local player and met major counterparts; secondary choices are visibility-filtered",
    netInfluencePerTurn: player.Stats.getNetYield(YieldTypes.YIELD_DIPLOMACY),
    dealCount: (Game.DiplomacyDeals.getDealIds(localId) ?? []).length,
    detailNote: "Secondary choices include only met/local players, owned settlements, public unit types and offered amounts; unsupported/foreign-settlement choices and raw target plots are omitted. Exact selected-argument checks do not establish complete total costs; quoted secondary influence is not added to the primary quote. Project terms are definitions; duration/completion quotes are not guaranteed final expiry dates. Progress uses native event scores, not a duration formula. Incoming hidden/espionage events are omitted rather than attributed. Enacted peace-deal item terms and working-deal negotiations remain unsupported; no deal is created, changed or sent",
    majorPlayers
  };
})()
