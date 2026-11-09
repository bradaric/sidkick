(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  const {war_event_id: eventId, ally_player_id: allyId, opponent_player_id: opponentId,
    initial_player_id: initialId, target_player_id: targetId, notification, before_gold: gold, expected_influence: influence} = queryArguments;
  if (!Number.isInteger(playerId) || playerId < 0 || !player || notification?.owner !== playerId ||
      ![eventId, allyId, opponentId, initialId, targetId, notification.id, notification.type].every(value => Number.isInteger(value) && value >= 0) ||
      allyId === opponentId || initialId === targetId || ![initialId, targetId].includes(allyId) || ![initialId, targetId].includes(opponentId) ||
      ![gold, influence].every(value => Number.isFinite(value) && value >= 0) ||
      ![allyId, opponentId].every(id => id !== playerId && player.Diplomacy.hasMet(id) === true && Players.get(id)?.isMajor === true)) throw Error("Invalid captured call-to-arms payment identity/balances");
  const ids = Game.Notifications.getIdsForPlayer(playerId);
  if (!Array.isArray(ids)) throw Error("Pending notification inventory unavailable");
  const matches = ids.filter(id => id?.owner === playerId && id.id === notification.id && id.type === notification.type);
  let noticeCleared = matches.length === 0;
  if (matches.length === 1) {
    const type = Game.Notifications.getType(matches[0]), n = Game.Notifications.find(matches[0]);
    noticeCleared = Boolean(n && n.Type === type && Game.Notifications.getTypeName(type) === "NOTIFICATION_DIPLOMATIC_ALLY_AT_WAR" &&
      n.Target?.id === eventId && (n.Dismissed === true || n.Expired === true || n.BlocksTurnAdvancement === false));
  }
  const next = Game.Diplomacy.getNextCallToArms(playerId), event = Game.Diplomacy.getDiplomaticEventData(eventId);
  const promptCleared = noticeCleared && Number.isInteger(next) && next >= -1 && next !== eventId;
  const warPreserved = Boolean(event && event.uniqueID === eventId && event.initialPlayer === initialId && event.targetPlayer === targetId &&
    event.hidden === false && event.revealed === true && event.failed === false && event.gameTurnEnd === -1 &&
    ["DIPLOMACY_ACTION_DECLARE_WAR", "DIPLOMACY_ACTION_DECLARE_FORMAL_WAR"].includes(event.actionTypeName));
  const alliancePreserved = player.Diplomacy.hasAllied(allyId) === true && player.Diplomacy.hasAllied(opponentId) === false &&
    [allyId, opponentId].every(id => player.Diplomacy.isAtWarWith(id) === false);
  const gameStarted = typeof UI.getGameLoadingState === "function" && typeof UIGameLoadingState !== "undefined" &&
    Number.isInteger(UIGameLoadingState.GameStarted) && UI.getGameLoadingState() === UIGameLoadingState.GameStarted;
  const singlePlayer = typeof Configuration !== "undefined" && Configuration.getGame().isAnyMultiplayer === false;
  const currentGold = player.Treasury?.goldBalance, currentInfluence = player.DiplomacyTreasury?.diplomacyBalance;
  return {turn: Game.turn, age: Game.age, playerId, warEventId: eventId, promptCleared, warPreserved, alliancePreserved,
    gold: currentGold, influence: currentInfluence,
    callToArmsPaymentApplied: gameStarted && singlePlayer && promptCleared && warPreserved && alliancePreserved && currentGold === gold && currentInfluence === influence};
})()
