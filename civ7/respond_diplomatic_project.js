(() => {
  const {action_id: actionId, response, max_influence_cost: cap, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  const {hostile=false}=queryArguments;
  if(typeof hostile!=="boolean")return reject("Explicit supported response family required");
  const responseTypes = {accept: DiplomaticResponseTypes.DIPLOMACY_RESPONSE_ACCEPT,
    support: DiplomaticResponseTypes.DIPLOMACY_RESPONSE_SUPPORT, reject: DiplomaticResponseTypes.DIPLOMACY_RESPONSE_REJECT};
  const allowed = hostile?["DIPLOMACY_ACTION_DENOUNCE","DIPLOMACY_ACTION_DENOUNCE_MILITARY_PRESENCE","DIPLOMACY_ACTION_SABOTAGE_TREASURY","DIPLOMACY_ACTION_SABOTAGE_MORALE",
    "DIPLOMACY_ACTION_SABOTAGE_RESEARCH","DIPLOMACY_ACTION_SABOTAGE_CIVIC_STUDY","DIPLOMACY_ACTION_SABOTAGE_MILITARY_PRODUCTION","DIPLOMACY_ACTION_SABOTAGE_FOOD_PRODUCTION"]:["DIPLOMACY_ACTION_OPEN_BORDERS", "DIPLOMACY_ACTION_RESEARCH_COLLABORATION",
    "DIPLOMACY_ACTION_CULTURAL_EXCHANGE", "DIPLOMACY_ACTION_LOCAL_FESTIVALS",
    "DIPLOMACY_ACTION_GINSING_AGREEMENT", "DIPLOMACY_ACTION_FARMERS_MARKET"];
  if (!Number.isInteger(actionId) || actionId < 0 || !Object.hasOwn(responseTypes, response) ||
      !Number.isInteger(responseTypes[response]) || !Number.isFinite(cap) || cap < 0 ||
      !Number.isInteger(expectedTurn) || expectedTurn < 0) return reject("An exact incoming event ID, supported response, Influence cap and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const find = () => (Game.Diplomacy.getPlayerEvents(playerId) ?? []).filter(e => e.uniqueID === actionId);
  const matches = find();
  if (matches.length !== 1) return reject("No unique local diplomatic event matches this ID");
  const event = matches[0], initial = event.initialPlayer;
  if (event.targetPlayer !== playerId || initial === playerId || !Number.isInteger(initial) || initial < 0 ||
      event.hidden !== false || event.revealed !== true || event.failed !== false || event.gameTurnEnd !== -1 ||
       !allowed.includes(event.actionTypeName)) return reject("Only exact revealed ongoing incoming projects in the selected fixed family are supported");
  if (!player.Diplomacy.hasMet(initial) || Players.get(initial)?.isMajor !== true || player.Diplomacy.isAtWarWith(initial)) return reject("A met peaceful major initiator is required");
  const def = GameInfo.DiplomacyActions.lookup(event.actionTypeName);
  if (def?.DiplomacyActionType !== event.actionTypeName || !Number.isInteger(def.$hash) || def.$hash !== event.actionType) return reject("Project action identity is unverified");
  const before = {turn: Game.turn, age: Game.age, playerId, actionId, initialPlayer: initial,
    action: event.actionTypeName, responseType: event.responseType, influence: player.DiplomacyTreasury?.diplomacyBalance ?? null};
  if(hostile){
    before.gold=player.Treasury?.goldBalance;before.atWar=player.Diplomacy.isAtWarWith(initial);before.allied=player.Diplomacy.hasAllied(initial);
    if(!Number.isFinite(before.gold)||before.atWar!==false||typeof before.allied!=="boolean")return reject("Known own balances, peace and alliance baseline required for hostile response");
  }
  if (event.responseType === responseTypes[response]) return {status: "already_active", before};
  if (event.responseType !== DiplomaticResponseTypes.INVALID_RESPONSE) return reject("This project already has a different response; replacement is unsupported");
  function selectedResponse() {
    const ui = Game.Diplomacy.getResponseDataForUI(actionId);
    if (ui?.actionID !== actionId || ui.initialPlayer !== initial || ui.targetPlayer !== playerId || !Array.isArray(ui.responseList)) return null;
    const rows = ui.responseList.filter(row => row.responseType === responseTypes[response]);
    return rows.length === 1 ? rows[0] : null;
  }
  const selected = selectedResponse(), cost = selected?.cost;
  if (selected?.canSelect !== true || !Number.isFinite(cost) || cost < 0 || cost > cap ||
      !Number.isFinite(before.influence) || before.influence < cost) return reject("Response is unoffered, blocked, missing a quote, over cap or unaffordable");
  const args = {ID: actionId, Type: responseTypes[response]}, operation = PlayerOperationTypes.RESPOND_DIPLOMATIC_ACTION;
  const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
  if (check?.Success !== true || check.InsufficientFunds || hostile&&check.RequiresConfirmation===true) return reject("Native diplomatic response check failed or requires unsupported confirmation", check?.FailureReasons ?? []);
  const latest = find(), latestResponse = selectedResponse();
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || latest.length !== 1 ||
      latest[0].initialPlayer !== initial || latest[0].targetPlayer !== playerId || latest[0].actionType !== def.$hash ||
      latest[0].hidden !== false || latest[0].revealed !== true || latest[0].failed !== false || latest[0].gameTurnEnd !== -1 ||
       latest[0].responseType !== before.responseType || latestResponse?.cost !== cost || latestResponse?.canSelect !== true ||
       hostile&&(player.Diplomacy.hasMet(initial)!==true||player.Diplomacy.isAtWarWith(initial)!==before.atWar||player.Diplomacy.hasAllied(initial)!==before.allied||player.Treasury.goldBalance!==before.gold||player.DiplomacyTreasury.diplomacyBalance!==before.influence)||
      !Number.isFinite(player.DiplomacyTreasury.diplomacyBalance) || player.DiplomacyTreasury.diplomacyBalance < cost) return reject("Project, response quote or game context changed during validation");
  const verificationArguments = {action_id: actionId, initial_player: initial, action: before.action,...(hostile?{hostile_baseline:{gold:before.gold,influence:before.influence-cost,atWar:before.atWar,allied:before.allied}}:{})};
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", before, quotedInfluenceCost: cost,
     expected: {actionId, initialPlayer: initial, action: before.action, response,...(hostile?{hostileResponseApplied:true}:{})}, verificationArguments,
     ...(hostile?{verificationScope:"Exact native offered response to one revealed incoming peaceful sanction; verifies event response, exact own Influence debit, stable Gold/peace/alliance. Relationship/cooldowns and ongoing sanction effects may change and are not fully verified. No secret espionage attribution, new war/deal, turn or retry"}:{})};
})()
