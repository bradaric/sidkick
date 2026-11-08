(() => {
  const {notification_id: notificationId, component_type: componentType, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  const allowed = ["NOTIFICATION_ADVISOR_WARNING_MILITARY", "NOTIFICATION_ADVISOR_WARNING_CULTURE",
    "NOTIFICATION_ADVISOR_WARNING_ECONOMIC", "NOTIFICATION_ADVISOR_WARNING_SCIENCE"];
  if (![notificationId, componentType, expectedTurn].every(value => Number.isInteger(value) && value >= 0))
    return reject("Exact local advisor notification ID, component type and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  if (Configuration.getGame().isAnyMultiplayer !== false) return reject("Advisor acknowledgement requires single player");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn) return reject("Fresh active local turn required");
  const inventory = Game.Notifications.getIdsForPlayer(playerId);
  if (!Array.isArray(inventory)) return reject("Advisor notification inventory is unavailable");
  const matches = inventory.filter(id => id.owner === playerId && id.id === notificationId);
  if (matches.length !== 1 || matches[0].type !== componentType) return reject("No unique owned advisor notification matches this component identity");
  const id = matches[0], notice = Game.Notifications.find(id), type = Game.Notifications.getType(id);
  const notificationType = Game.Notifications.getTypeName(type);
  if (!notice || notice.Type !== type || !allowed.includes(notificationType)) return reject("Only proven native advisor-warning notifications are supported");
  const before = {turn: Game.turn, age: Game.age, playerId, notificationId, componentType, notificationType,
    warningType: notice.WarningType ?? null, addedOnTurn: notice.AddedOnTurn ?? null};
  if (notice.Dismissed === true || notice.Expired === true) return {status: "already_active", before};
  if (notice.Dismissed !== false || notice.Expired !== false) return reject("Advisor warning activity is unverified");
  const args = {Target: {owner: playerId, id: notificationId, type: componentType}};
  const check = Game.PlayerOperations.canStart(playerId, PlayerOperationTypes.VIEWED_ADVISOR_WARNING, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true || check.InsufficientFunds === true)
    return reject("Native advisor acknowledgement is blocked or requires confirmation", check?.FailureReasons ?? []);
  const latestInventory = Game.Notifications.getIdsForPlayer(playerId);
  const latestIds = Array.isArray(latestInventory) ? latestInventory.filter(value => value.owner === playerId && value.id === notificationId) : [];
  const latest = latestIds.length === 1 && latestIds[0].type === componentType ? Game.Notifications.find(latestIds[0]) : null;
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || !latest ||
      Game.Notifications.getType(latestIds[0]) !== type || Game.Notifications.getTypeName(type) !== notificationType ||
      latest.Type !== type || latest.Dismissed !== false || latest.Expired !== false ||
      (latest.WarningType ?? null) !== before.warningType || (latest.AddedOnTurn ?? null) !== before.addedOnTurn)
    return reject("Advisor notification identity, contents or game context changed during validation");
  Game.PlayerOperations.sendRequest(playerId, PlayerOperationTypes.VIEWED_ADVISOR_WARNING, args);
  return {status: "submitted", before, expected: {notificationId, componentType, notificationType, acknowledged: true},
    verificationArguments: {notification_id: notificationId, component_type: componentType, notification_type: notificationType},
    verificationScope: "One native VIEWED_ADVISOR_WARNING request for this owned warning. Verifies notification clearance, not resolution of the underlying problem or popup UI closure. No generic dismissal, advisor-setting change, gameplay choice, turn advancement or retry"};
})()
