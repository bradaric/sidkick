(() => {
  const {war_event_id: eventId, ally_player_id: allyId, opponent_player_id: opponentId,
    payment_token: token, max_influence_cost: cap, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (![eventId, allyId, opponentId, expectedTurn].every(value => Number.isInteger(value) && value >= 0) || allyId === opponentId ||
      !Number.isFinite(cap) || cap < 0 || typeof token !== "string" || !token || token.length > 100000) return reject("Exact pending war, ally/opponent, payment token, Influence cap and expected turn required");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || [allyId, opponentId].includes(playerId) ||
      typeof PlayerOperationTypes === "undefined" || !Number.isInteger(PlayerOperationTypes.PAY_TO_AVOID_CALL_TO_ARMS) ||
      typeof Game.PlayerOperations?.canStart !== "function") return reject("Verified local player and native payment operation required");
  let notification;
  try { notification = JSON.parse(token)?.notification; } catch { return reject("Payment token is invalid; refresh diplomacy"); }
  if (notification?.owner !== playerId || ![notification.id, notification.type].every(value => Number.isInteger(value) && value >= 0)) return reject("Payment token must identify the local pending notification");

  function current() {
    try {
      if (!UI.isInGame() || typeof UI.getGameLoadingState !== "function" || typeof UIGameLoadingState === "undefined" ||
          !Number.isInteger(UIGameLoadingState.GameStarted) || UI.getGameLoadingState() !== UIGameLoadingState.GameStarted ||
          typeof Configuration === "undefined" || Configuration.getGame().isAnyMultiplayer !== false ||
          GameContext.localPlayerID !== playerId || Game.turn !== expectedTurn || !Number.isInteger(Game.age) ||
          player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
          ![allyId, opponentId].every(id => player.Diplomacy.hasMet(id) === true && Players.get(id)?.isMajor === true) ||
          player.Diplomacy.hasAllied(allyId) !== true || player.Diplomacy.hasAllied(opponentId) !== false ||
          [allyId, opponentId].some(id => player.Diplomacy.isAtWarWith(id) !== false)) return null;
      const ids = Game.Notifications.getIdsForPlayer(playerId);
      if (!Array.isArray(ids)) return null;
      const matches = ids.filter(id => id?.owner === playerId && id.id === notification.id && id.type === notification.type);
      if (matches.length !== 1) return null;
      const type = Game.Notifications.getType(matches[0]), n = Game.Notifications.find(matches[0]);
      if (Game.Notifications.getTypeName(type) !== "NOTIFICATION_DIPLOMATIC_ALLY_AT_WAR" || n?.Type !== type ||
          n.Dismissed !== false || n.Expired !== false || n.BlocksTurnAdvancement !== true ||
          Game.Diplomacy.getNextCallToArms(playerId) !== eventId || (n.Target?.id ?? eventId) !== eventId) return null;
      const event = Game.Diplomacy.getDiplomaticEventData(eventId);
      if (event?.uniqueID !== eventId || event.hidden !== false || event.revealed !== true || event.failed !== false ||
          event.gameTurnEnd !== -1 || !["DIPLOMACY_ACTION_DECLARE_WAR", "DIPLOMACY_ACTION_DECLARE_FORMAL_WAR"].includes(event.actionTypeName) ||
          ![event.initialPlayer, event.targetPlayer].includes(allyId) || ![event.initialPlayer, event.targetPlayer].includes(opponentId)) return null;
      const cost = Game.Diplomacy.getPayToAvoidCallToArmsCost(playerId, allyId, opponentId);
      if (!Number.isFinite(cost) || cost < 0 || Game.Diplomacy.canPayToAvoidCallToArms(playerId, allyId, opponentId) !== true) return null;
      return {turn: Game.turn, age: Game.age, playerId, warEventId: eventId, notification,
        initialPlayerId: event.initialPlayer, targetPlayerId: event.targetPlayer,
        allyPlayerId: allyId, opponentPlayerId: opponentId, quotedInfluenceCost: cost};
    } catch { return null; }
  }

  const state = current();
  if (!state || JSON.stringify(state) !== token) return reject("Pending call-to-arms, payment quote or token is stale/unavailable; refresh diplomacy");
  const cost = state.quotedInfluenceCost;
  const before = {...state, gold: player.Treasury?.goldBalance, influence: player.DiplomacyTreasury?.diplomacyBalance};
  if (![before.gold, before.influence].every(value => Number.isFinite(value) && value >= 0) || cost > cap || before.influence < cost) return reject("Native payment quote is unaffordable or exceeds the approved Influence cap");
  const args = {Player1: playerId, Player2: allyId, Player3: opponentId};
  const check = Game.PlayerOperations.canStart(playerId, PlayerOperationTypes.PAY_TO_AVOID_CALL_TO_ARMS, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true || check.InsufficientFunds === true) return reject("Native paid-neutrality operation is blocked or requires confirmation", check?.FailureReasons ?? []);
  if (JSON.stringify(current()) !== token || player.Treasury?.goldBalance !== before.gold ||
      player.DiplomacyTreasury?.diplomacyBalance !== before.influence) return reject("Pending prompt, quote, alliance, balances or game context changed during validation");
  const verificationArguments = {war_event_id: eventId, ally_player_id: allyId, opponent_player_id: opponentId,
    initial_player_id: state.initialPlayerId, target_player_id: state.targetPlayerId, notification,
    before_gold: before.gold, expected_influence: before.influence - cost};
  Game.PlayerOperations.sendRequest(playerId, PlayerOperationTypes.PAY_TO_AVOID_CALL_TO_ARMS, args);
  return {status: "submitted", before, quotedInfluenceCost: cost, expected: {callToArmsPaymentApplied: true}, verificationArguments,
    verificationScope: "One native paid-neutrality request. Verifies exact own Influence debit, pending prompt clearance, unchanged Gold and preserved alliance/peace with the two participants. No war declaration, alliance cancellation, notification dismissal, UI manipulation or turn advance; no claim about future diplomacy effects"};
})()
