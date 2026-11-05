(() => {
  const {civic, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", civic, reason, failureReasons});
  if (typeof civic !== "string" || !civic.trim() || !Number.isInteger(expectedTurn) || expectedTurn < 0) {
    return reject("An exact civic type ID and nonnegative expected turn are required");
  }
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) {
    return reject("The local player's turn must be active and not completed");
  }
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale; read research again");
  const culture = player.Culture;
  // Do not copy the picker's separate target-clearing request into this action.
  if (culture.getTargetNode() !== ProgressionTreeNodeTypes.NO_NODE) {
    return reject("An existing civic target must be cleared in the game before selecting a single civic");
  }
  const nodeType = culture.getAllAvailableNodeTypes().find(type =>
    GameInfo.ProgressionTreeNodes.lookup(type)?.ProgressionTreeNodeType === civic);
  if (!Number.isInteger(nodeType)) return reject("Civic is not offered by the local civic picker");
  const current = culture.getResearching();
  const before = {turn: Game.turn, age: Game.age, playerId,
    activeCivic: current && current.type !== ProgressionTreeNodeTypes.NO_NODE
      ? GameInfo.ProgressionTreeNodes.lookup(current.type)?.ProgressionTreeNodeType ?? null : null};
  if (current?.type === nodeType) return {status: "already_active", civic, before};
  const args = {ProgressionTreeNodeType: nodeType};
  const operation = PlayerOperationTypes.SET_CULTURE_TREE_NODE;
  const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
  if (check?.Success !== true) return reject("Native civic selection check failed", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) {
    return reject("Game context changed during validation; read research again");
  }
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", civic, before};
})()
