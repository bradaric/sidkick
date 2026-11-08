(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const {notification_id: notificationId, component_type: componentType} = queryArguments;
  if (![notificationId, componentType].every(v => Number.isInteger(v) && v >= 0)) throw Error("Invalid agenda notification identity");
  const ids = (Game.Notifications.getIdsForPlayer(playerId) ?? []).filter(id => id.owner === playerId && id.id === notificationId);
  if (ids.length > 1 || (ids.length === 1 && ids[0].type !== componentType)) throw Error("Agenda notification identity changed");
  const notification = ids.length ? Game.Notifications.find(ids[0]) : null;
  if (ids.length && (!notification || Game.Notifications.getTypeName(Game.Notifications.getType(ids[0])) !== "NOTIFICATION_DIPLOMATIC_ACTION_AGENDA")) throw Error("Agenda notification type is unverified");
  return {turn: Game.turn, age: Game.age, playerId, notificationId, componentType,
    acknowledged: !ids.length || notification.Dismissed === true || notification.Expired === true};
})()
