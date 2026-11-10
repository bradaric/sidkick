(() => {
  const reject = reason => ({status: "rejected", reason});
  const {expected_turn: expectedTurn} = queryArguments;
  if (!Number.isInteger(expectedTurn) || expectedTurn < 0) return reject("A nonnegative expected turn is required");
  if (!UI.isInGame()) return reject("Load a save first");
  if (Configuration.getGame().isAnyMultiplayer !== false) return reject("Only a verified single-player game is supported");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false) return reject("Local turn is inactive or already submitted");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  if (Game.AgeProgressManager.isAgeOver && !Game.AgeProgressManager.isExtendedGame) return reject("An Age boundary requires separate handling");
  const blocker = Game.Notifications.getEndTurnBlockingType(playerId);
  if (blocker !== EndTurnBlockingTypes.NONE) return {...reject("A native end-turn blocker remains"), blocker};
  const ready = UI.Player.getFirstReadyUnit();
  const unit = ready?.owner === playerId && [ready.id, ready.type].every(v => Number.isInteger(v) && v >= 0)
    ? Units.get(ready) : null;
  const identified = unit?.id?.owner === playerId && unit.id.id === ready?.id && unit.id.type === ready?.type;
  const readiness = remainingMoves(Game.UnitOperations.canStartAny(playerId),
    ready == null ? "none" : identified ? "identified" : "unverified", unit);
  if (readiness.remainingMovesBlocker !== false) return {
    ...reject(readiness.remainingMovesBlocker === true ? "A unit still needs an explicit order" : "Unit turn readiness is unavailable"),
    ...readiness};
  const before = {turn: Game.turn, age: Game.age, playerId};
  if (before.turn !== expectedTurn || GameContext.localPlayerID !== playerId || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false || Game.Notifications.getEndTurnBlockingType(playerId) !== EndTurnBlockingTypes.NONE) return reject("Turn state changed during validation");
  GameContext.sendTurnComplete();
  return {status: "submitted", before};
})()
