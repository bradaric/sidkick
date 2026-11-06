(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const diplomacy = player.Diplomacy;
  const name = key => key ? Locale.compose(key) : null;
  const reasons = (...results) => [...new Set(results.flatMap(result => result?.FailureReasons ?? []).map(name).filter(Boolean))];
  const cost = value => Number.isFinite(value) && value >= 0 ? value : null;
  const statusNames = Object.fromEntries(Object.entries(DiplomacyProjectStatus).map(([key, value]) => [value, key]));
  const independentIds = new Set(Players.getAliveIndependentIds());
  const bonusSelection = Game.CityStates.getCityStateBonusToSelect(id);
  const independentActions = new Set([
    "DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN", "DIPLOMACY_ACTION_INCITE_RAID",
    "DIPLOMACY_ACTION_MINOR_TRADE", "DIPLOMACY_ACTION_DEMAND_TRIBUTE", "DIPLOMACY_ACTION_BECOME_SUZERAIN"
  ]);
  const relevantAction = type => typeof type === "string" &&
    (type.startsWith("DIPLOMACY_ACTION_CS_") || independentActions.has(type));
  const bonusInfo = def => def ? {id: def.CityStateBonusType, name: name(def.Name), description: name(def.Description)} : null;

  function knownPlayer(playerId) {
    if (playerId == null || playerId < 0 || (playerId !== id && !diplomacy.hasMet(playerId))) return null;
    const other = playerId === id ? player : Players.get(playerId);
    return {playerId, civilization: name(other?.civilizationFullName), isLocal: playerId === id};
  }

  function actions(otherId) {
    const projects = Game.Diplomacy.getProjectDataForUI(id, otherId,
      DiplomacyActionTargetTypes.NO_DIPLOMACY_TARGET, DiplomacyActionGroups.NO_DIPLOMACY_ACTION_GROUP,
      -1, DiplomacyActionTargetTypes.NO_DIPLOMACY_TARGET) ?? [];
    return projects.filter(project => relevantAction(project.actionTypeName) &&
      ![DiplomacyProjectStatus.PROJECT_BLOCKED, DiplomacyProjectStatus.PROJECT_ACTIVE].includes(project.projectStatus))
      .map(project => {
        // Other targets and targetPlot can include unrevealed locations: never return them.
        const target = (project.targetList1 ?? []).find(value => value.targetID === otherId);
        const failureReasons = reasons(project.resultData, target?.resultData);
        const requiresSecondaryTarget = Boolean(project.targetList2?.length);
        const levyUnits=project.actionTypeName==="DIPLOMACY_ACTION_CS_LEVY_UNIT"&&target?.costYieldD===0?(project.targetList2??[]).flatMap(t=>{
          if(t.parameterName!=="Unit"||!Number.isInteger(t.targetID)||t.targetID<0||typeof t.targetName!=="string")return[];
          const def=GameInfo.Units?.lookup(t.targetName);if(def?.UnitType!==t.targetName)return[];
          const result=Game.PlayerOperations.canStart(id,project.operationType,{Amount:1,Player1:id,Player2:otherId,Type:project.actionType,Unit:t.targetID},false);
          const blocked=reasons(project.resultData,target.resultData,t.resultData,result);
          return[{offeredUnitId:t.targetID,unitType:def.UnitType,name:name(def.Name),quotedInfluenceCost:cost(t.costYieldD),availableNow:project.projectStatus===DiplomacyProjectStatus.PROJECT_AVAILABLE&&!blocked.length&&result?.Success===true&&result.RequiresConfirmation!==true,failureReasons:blocked}];
        }):[];
        return {
          id: project.actionTypeName,
          name: name(project.actionTypeName === "DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN"
            ? "LOC_DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN_START_ACTION_NAME" : project.actionDisplayName),
          description: name(project.projectDescription),
          status: statusNames[project.projectStatus] ?? project.projectStatus,
          availableNow: project.projectStatus === DiplomacyProjectStatus.PROJECT_AVAILABLE && Boolean(target) && !failureReasons.length,
          influenceCost: requiresSecondaryTarget ? null : cost(target?.costYieldD),
          selectedTargetInfluenceCost: cost(target?.costYieldD),
          costDescription: name(project.costDescription),
          requiresSecondaryTarget,
          levyUnits,
          failureReasons
        };
      });
  }

  function ongoingActions(otherId) {
    return (Game.Diplomacy.getPlayerEvents(otherId) ?? [])
      .filter(event => event.initialPlayer === id && event.targetPlayer === otherId &&
        (relevantAction(event.actionTypeName) || event.actionType === DiplomacyActionTypes.DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN))
      .map(event => {
        const completion = Game.Diplomacy.getCompletionData(event.uniqueID);
        const befriending = event.actionTypeName === "DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN" ||
          event.actionType === DiplomacyActionTypes.DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN;
        let supportAction = null;
        if (befriending) {
          const result = Game.PlayerOperations.canStart(id, PlayerOperationTypes.SUPPORT_DIPLOMATIC_ACTION,
            {ID: event.uniqueID, Type: DiplomacyTokenTypes.DIPLOMACY_TOKEN_GLOBAL, Amount: 1, SubType: true}, false);
          supportAction = {
            influenceCost: cost(Game.Diplomacy.getInfluenceForNextSupport(event.uniqueID, id, true)),
            availableNow: Boolean(result.Success),
            failureReasons: reasons(result)
          };
        }
        return {
          id: event.uniqueID,
          type: event.actionTypeName ?? event.actionType,
          name: name(event.name),
          description: name(event.description),
          turnStarted: event.gameTurnStart,
          progress: event.progressScore ?? null,
          requiredProgress: completion?.requiredProgress ?? event.completionScore ?? null,
          turnsRemaining: completion?.turnsToCompletion ?? null,
          progressPerTurn: completion?.progressPerTurn ?? null,
          support: event.support ?? null,
          supportAction
        };
      });
  }

  const powers = [];
  for (const otherId of Players.getAliveIds()) {
    if (otherId === id) continue;
    const met = Boolean(diplomacy.hasMet(otherId));
    const discovered = independentIds.has(otherId) &&
      Boolean(Game.IndependentPowers.independentVillageDiscoveredByPlayer(otherId, id));
    if (!met && !discovered) continue;
    const other = Players.get(otherId);
    if (!other || (!other.isMinor && !other.isIndependent)) continue;
    const suzerainId = other.Influence?.getSuzerain() ?? -1;
    const youAreSuzerain = suzerainId === id;
    const type = other.isMinor ? GameInfo.CityStateTypes.lookup(other.getCityStateCityStateType()) : null;
    const bonusHash = other.isMinor ? Game.CityStates.getBonusType(otherId) : null;
    const bonus = other.isMinor ? [...GameInfo.CityStateBonuses].find(def => def.$hash === bonusHash) : null;
    const bonusChoices = other.isMinor ? [...GameInfo.CityStateBonuses]
      .filter(def => Game.CityStates.canHaveBonus(id, otherId, def.CityStateBonusType))
      .map(def => {
        const result = bonusSelection === otherId && youAreSuzerain
          ? Game.PlayerOperations.canStart(id, PlayerOperationTypes.CHOOSE_CITY_STATE_BONUS,
            {OtherPlayer: otherId, CityStateBonusType: def.$hash}, false) : null;
        return {...bonusInfo(def), eligible: true, availableNow: Boolean(result?.Success), failureReasons: reasons(result)};
      }) : [];
    powers.push({
      playerId: otherId,
      name: name(other.civilizationFullName),
      kind: other.isMinor ? "city-state" : "independent",
      met,
      villageDiscovered: other.isIndependent ? discovered : null,
      relationship: other.isIndependent ? name(Game.IndependentPowers.getIndependentHostility(otherId, id)) : null,
      atWar: Boolean(diplomacy.isAtWarWith(otherId)),
      type: type ? {id: type.CityStateType, name: name(type.Name)} : null,
      hasSuzerain: suzerainId >= 0,
      suzerain: knownPlayer(suzerainId),
      youAreSuzerain,
      bonus: bonusInfo(bonus),
      bonusChoices,
      actions: actions(otherId),
      ongoingActions: ongoingActions(otherId)
    });
  }
  return {
    turn: Game.turn,
    scope: "Met city-states and met/discovered independents; ongoing actions initiated by the local player only",
    influence: {balance: player.DiplomacyTreasury?.diplomacyBalance ?? null, netPerTurn: player.Stats.getNetYield(YieldTypes.YIELD_DIPLOMACY)},
    pendingBonusSelection: powers.some(power => power.playerId === bonusSelection) ? bonusSelection : null,
    powers
  };
})()
