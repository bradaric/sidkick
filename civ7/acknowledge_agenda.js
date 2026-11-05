(() => {
  const {notification_id: notificationId, expected_turn: expectedTurn} = queryArguments;
  const reject = reason => ({status: "rejected", reason});
  if (!Number.isInteger(notificationId) || notificationId < 0 || !Number.isInteger(expectedTurn) || expectedTurn < 0) return reject("An exact local agenda notification ID and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const ids = (Game.Notifications.getIdsForPlayer(playerId) ?? []).filter(id => id.owner === playerId && id.id === notificationId);
  if (ids.length !== 1) return reject("No unique owned agenda notification matches this ID");
  const id = ids[0], notification = Game.Notifications.find(id);
  if (!notification || Game.Notifications.getTypeName(Game.Notifications.getType(id)) !== "NOTIFICATION_DIPLOMATIC_ACTION_AGENDA") return reject("Only agenda-message acknowledgement is supported");
  const before = {turn: Game.turn, age: Game.age, playerId, notificationId, componentType: id.type};
  if (notification.Dismissed || notification.Expired) return {status: "already_active", before};
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Game context changed during validation");
  Game.Notifications.dismiss(id);
  return {status: "submitted", before, expected: {notificationId, componentType: id.type, acknowledged: true},
    verificationArguments: {notification_id: notificationId, component_type: id.type}};
})()
