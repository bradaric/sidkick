(() => {
  const {target_kind: kind, target_player_id: targetId, action,
    max_influence_cost: maximumCost, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  const allowed = kind === "major" ? ["DIPLOMACY_ACTION_OPEN_BORDERS",
    "DIPLOMACY_ACTION_RESEARCH_COLLABORATION", "DIPLOMACY_ACTION_CULTURAL_EXCHANGE"]
    : kind === "city-state" ? ["DIPLOMACY_ACTION_CS_PROMOTE_GROWTH",
      "DIPLOMACY_ACTION_CS_BOLSTER_MILITARY", "DIPLOMACY_ACTION_CS_INCORPORATE", "DIPLOMACY_ACTION_CS_LEVY_UNIT"] : kind === "independent" ? ["DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN"] : kind === "hostile" ? [
        "DIPLOMACY_ACTION_DENOUNCE", "DIPLOMACY_ACTION_DENOUNCE_MILITARY_PRESENCE", "DIPLOMACY_ACTION_SABOTAGE_TREASURY", "DIPLOMACY_ACTION_SABOTAGE_MORALE",
        "DIPLOMACY_ACTION_SABOTAGE_RESEARCH", "DIPLOMACY_ACTION_SABOTAGE_CIVIC_STUDY", "DIPLOMACY_ACTION_SABOTAGE_MILITARY_PRODUCTION", "DIPLOMACY_ACTION_COUNTER_SPY",
        "DIPLOMACY_ACTION_ESPIONAGE_MILITARY_SABOTAGE", "DIPLOMACY_ACTION_ESPIONAGE_STEAL_TECH", "DIPLOMACY_ACTION_ESPIONAGE_STEAL_CIVIC", "DIPLOMACY_ACTION_ESPIONAGE_MILITARY_INFILTRATION"] : [];
  if (!allowed.includes(action) || !Number.isInteger(targetId) || targetId < 0 ||
      typeof maximumCost !== "number" || !Number.isFinite(maximumCost) || maximumCost < 0 ||
      !Number.isInteger(expectedTurn) || expectedTurn < 0) return reject("Unsupported project or invalid target, budget or turn");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const known = () => player.Diplomacy.hasMet(targetId) === true || (kind === "independent" && Game.IndependentPowers?.independentVillageDiscoveredByPlayer(targetId, playerId) === true);
  if (targetId === playerId || !known()) return reject("A met foreign target or discovered independent power is required");
  const target = Players.get(targetId);
  if (!target || (["major", "hostile"].includes(kind) ? target.isMajor !== true : kind === "city-state" ? target.isMinor !== true : target.isIndependent !== true)) return reject("Target is not the requested player kind");
  const war = player.Diplomacy.isAtWarWith(targetId);
  if (!["independent", "hostile"].includes(kind) && war) return reject("This handler does not initiate cooperative projects during war");
  const levy = action === "DIPLOMACY_ACTION_CS_LEVY_UNIT", requiresSuzerainty = levy || action === "DIPLOMACY_ACTION_CS_INCORPORATE";
  if (requiresSuzerainty && target.Influence?.getSuzerain() !== playerId) return reject("Local suzerainty is required for incorporation/levy");
  const definition = GameInfo.DiplomacyActions.lookup(action);
  if (definition?.DiplomacyActionType !== action || !Number.isInteger(definition.$hash)) return reject("Project definition is unavailable");
  const records = Game.Diplomacy.getPlayerEvents(targetId);
  if (!Array.isArray(records)) return reject("Project event inventory is unavailable");
  const own = records.filter(event => event.initialPlayer === playerId && event.targetPlayer === targetId && event.actionType === definition.$hash);
  const eventIds = own.map(event => event.uniqueID);
  if (eventIds.some(value => !Number.isInteger(value) || value < 0) || new Set(eventIds).size !== eventIds.length) return reject("Project event identity is unverified");
  const before = {turn: Game.turn, age: Game.age, playerId, eventIds: eventIds.sort((a, b) => a - b),
    influence: player.DiplomacyTreasury?.diplomacyBalance ?? null};
  if (own.some(event => event.gameTurnEnd === -1 && event.failed !== true)) return {status: "already_active", before};
  const projects = Game.Diplomacy.getProjectDataForUI(playerId, targetId,
    DiplomacyActionTargetTypes.NO_DIPLOMACY_TARGET, DiplomacyActionGroups.NO_DIPLOMACY_ACTION_GROUP,
    -1, DiplomacyActionTargetTypes.NO_DIPLOMACY_TARGET);
  if (!Array.isArray(projects)) return reject("Project picker data is unavailable");
  // The native picker also returns ongoing rows for other counterparts (for
  // example Hanseong's incorporation while querying Kumasi). Only start rows
  // can establish uniqueness; multiple available rows remain an error.
  const matches = projects.filter(project => project.actionTypeName === action &&
    project.projectStatus === DiplomacyProjectStatus.PROJECT_AVAILABLE);
  if (matches.length !== 1) return reject("No unique offered project matches this action");
  const project = matches[0];
  if (project.projectStatus !== DiplomacyProjectStatus.PROJECT_AVAILABLE ||
      project.actionType !== definition.$hash || !Number.isInteger(project.operationType)) return reject("Project is not currently offered");
  const noTargetTypes = [DiplomacyActionTargetTypes.NO_DIPLOMACY_TARGET,
    DiplomacyActionTargetTypes.DIPLOMACY_TARGET_NONE].filter(Number.isInteger);
  if (!Array.isArray(project.targetList2) || (!levy && (project.targetList2.length || !noTargetTypes.includes(project.target2Type)))) return reject("Secondary-target actions require a separate exact supported family");
  const primary = (project.targetList1 ?? []).filter(value => value.targetID === targetId);
  if (primary.length !== 1) return reject("No unique selected primary target is offered");
  function unitInventory(){
    const records=player.Units.getUnits().filter(u=>u.id.owner===playerId).map(u=>({instanceId:u.id.id,componentType:u.id.type,unitType:u.type})).sort((a,b)=>a.instanceId-b.instanceId);
    return records.length<=1024&&records.every(r=>Number.isInteger(r.instanceId)&&r.instanceId>=0&&Number.isInteger(r.componentType)&&r.componentType>=0&&Number.isInteger(r.unitType))&&new Set(records.map(r=>r.instanceId)).size===records.length?records:null;
  }
  let selected = primary[0], levyType = null;
  if(levy){
    const {target_unit_id:unitId,unit_type:unitType}=queryArguments,def=GameInfo.Units.lookup(unitType);
    if(!Number.isInteger(unitId)||unitId<0||def?.UnitType!==unitType||!Number.isInteger(def.$hash)||primary[0].costYieldD!==0)return reject("Exact public unit type/offered ID and known zero primary cost required; no guessed total cost");
    const options=project.targetList2.filter(t=>t.parameterName==="Unit"&&t.targetID===unitId&&t.targetName===unitType);
    if(options.length!==1)return reject("No unique exact offered levy unit/type pair");
    selected=options[0];
    levyType=def.$hash;before.unitInventory=unitInventory();
    if(!before.unitInventory)return reject("Complete unique owned unit inventory required for immediate levy receipt verification");
  }
  const reasons = [...(project.resultData?.FailureReasons ?? []), ...(primary[0].resultData?.FailureReasons ?? []), ...(selected.resultData?.FailureReasons ?? [])];
  if (reasons.length) return reject("Project or selected target is blocked", reasons);
  const quotedCost = selected.costYieldD;
  if (!Number.isFinite(quotedCost) || quotedCost < 0) return reject("Selected-target Influence cost is unavailable");
  if (quotedCost > maximumCost) return {...reject("Selected-target Influence cost exceeds the approved cap"), quotedInfluenceCost: quotedCost};
  if (!Number.isFinite(before.influence) || before.influence < quotedCost) return reject("Insufficient or unverified Influence balance");
  // The quick-start UI supplies both Player2 and ID, including for city-states.
  // Incorporation's operationType is distinct; use the matched native project.
  const args = {Amount: 1, Player1: playerId, Type: project.actionType, Player2: targetId, ...(levy ? {Unit:selected.targetID} : {ID:targetId})};
  const check = Game.PlayerOperations.canStart(playerId, project.operationType, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native project start failed or requires confirmation", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      !known() || (kind === "independent" ? target.isIndependent !== true : player.Diplomacy.isAtWarWith(targetId) !== war) ||
      (requiresSuzerainty && target.Influence?.getSuzerain() !== playerId) || (levy && primary[0].costYieldD !== 0) ||
      (levy && JSON.stringify(unitInventory()) !== JSON.stringify(before.unitInventory)) ||
      selected.costYieldD !== quotedCost || player.DiplomacyTreasury.diplomacyBalance < quotedCost) return reject("Game context, target or cost changed during validation");
  const verificationArguments = {...queryArguments, baseline_event_ids: before.eventIds,...(levy?{baseline_units:before.unitInventory,expected_unit_type:levyType,before_influence:before.influence,quoted_cost:quotedCost}:{})};
  Game.PlayerOperations.sendRequest(playerId, project.operationType, args);
  return {status: "submitted", targetPlayerId: targetId, action, quotedInfluenceCost: quotedCost, before,
    expected: {targetPlayerId: targetId, ...(levy?{levyObserved:true}:{targetKind:kind,action,newProjectObserved:true})}, verificationArguments,
    ...(levy ? {verificationScope:"Exactly one new chosen-type owned unit with all prior unit identities/types preserved and exact selected Influence spend under continued suzerainty. Native offered unit bound at submission; not prior foreign HP/experience, full transfer-side effect or persistent-project accounting"} : {})};
})()
