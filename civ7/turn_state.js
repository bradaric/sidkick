(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player) throw Error("No local player");
  const blocker = Game.Notifications.getEndTurnBlockingType(playerId);
  return {turn: Game.turn, age: Game.age, playerId, active: player.isTurnActive,
    sent: GameContext.hasSentTurnComplete(), blocker,
    blockerName: Object.keys(EndTurnBlockingTypes).find(k => EndTurnBlockingTypes[k] === blocker) ?? null,
    extendedGame: Game.AgeProgressManager.isExtendedGame};
})()
