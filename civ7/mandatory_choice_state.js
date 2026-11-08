(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  const hasNotification = type => (Game.Notifications.getIdsForPlayer(playerId) ?? []).some(id => {
    if (id.owner !== playerId) return false;
    const n = Game.Notifications.find(id);
    return n && !n.Dismissed && !n.Expired && Game.Notifications.getTypeName(Game.Notifications.getType(id)) === type;
  });
  const governmentType = player.Culture.getGovernmentType();
  return {turn: Game.turn, age: Game.age, playerId,
    government: GameInfo.Governments.lookup(governmentType)?.GovernmentType ?? null,
    governmentPending: governmentType === -1 || hasNotification("NOTIFICATION_CHOOSE_GOVERNMENT"),
    celebration: player.Happiness?.isInGoldenAge() === true
      ? GameInfo.GoldenAges.lookup(player.Happiness.getCurrentGoldenAge())?.GoldenAgeType ?? null : null,
    celebrationPending: hasNotification("NOTIFICATION_CHOOSE_GOLDEN_AGE") ||
      (typeof player.Happiness?.canChoose === "function" ? player.Happiness.canChoose() : null),
    resourceReviewPending: hasNotification("NOTIFICATION_ASSIGN_NEW_RESOURCES"),
    policyReviewPending: hasNotification("NOTIFICATION_TRADITIONS_AVAILABLE") || hasNotification("NOTIFICATION_CRISIS")};
})()
