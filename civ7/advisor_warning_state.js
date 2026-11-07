(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  const {notification_id: notificationId, component_type: componentType, notification_type: notificationType} = queryArguments;
  const allowed = ["NOTIFICATION_ADVISOR_WARNING_MILITARY", "NOTIFICATION_ADVISOR_WARNING_CULTURE",
    "NOTIFICATION_ADVISOR_WARNING_ECONOMIC", "NOTIFICATION_ADVISOR_WARNING_SCIENCE"];
  if (!Number.isInteger(playerId) || playerId < 0 || ![notificationId, componentType].every(value => Number.isInteger(value) && value >= 0) ||
      !allowed.includes(notificationType)) throw Error("Invalid captured advisor notification identity/type");
  const inventory = Game.Notifications.getIdsForPlayer(playerId);
  if (!Array.isArray(inventory)) throw Error("Advisor notification inventory is unavailable");
  const ids = inventory.filter(id => id.owner === playerId && id.id === notificationId);
  if (ids.length > 1 || ids.length === 1 && ids[0].type !== componentType) throw Error("Advisor notification identity changed");
  let acknowledged = ids.length === 0;
  if (ids.length === 1) {
    const notice = Game.Notifications.find(ids[0]), type = Game.Notifications.getType(ids[0]);
    if (!notice || notice.Type !== type || Game.Notifications.getTypeName(type) !== notificationType)
      throw Error("Advisor notification type or record is unverified");
    acknowledged = notice.Dismissed === true || notice.Expired === true;
  }
  return {turn: Game.turn, age: Game.age, playerId, notificationId, componentType, notificationType, acknowledged};
})()
