(() => {
  const {technology, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", technology, reason, failureReasons});
  if (typeof technology !== "string" || !technology.trim() || !Number.isInteger(expectedTurn) || expectedTurn < 0) {
    return reject("An exact technology type ID and nonnegative expected turn are required");
  }
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) {
    return reject("The local player's turn must be active and not completed");
  }
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale; read research again");
  const techs = player.Techs;
  // The picker clears long-term targets with a second request. This first action
  // deliberately does not modify that separate state or submit a request batch.
  if (techs.getTargetNode() !== ProgressionTreeNodeTypes.NO_NODE) {
    return reject("An existing research target must be cleared in the game before selecting a single technology");
  }
  const nodeType = techs.getAllAvailableNodeTypes().find(type =>
    GameInfo.ProgressionTreeNodes.lookup(type)?.ProgressionTreeNodeType === technology);
  if (!Number.isInteger(nodeType)) return reject("Technology is not offered by the local technology picker");
  const current = techs.getResearching();
  const before = {turn: Game.turn, age: Game.age, playerId,
    activeTechnology: current && current.type !== ProgressionTreeNodeTypes.NO_NODE
      ? GameInfo.ProgressionTreeNodes.lookup(current.type)?.ProgressionTreeNodeType ?? null : null};
  if (current?.type === nodeType) return {status: "already_active", technology, before};
  const args = {ProgressionTreeNodeType: nodeType};
  const operation = PlayerOperationTypes.SET_TECH_TREE_NODE;
  const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
  if (check?.Success !== true) return reject("Native technology selection check failed", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) {
    return reject("Game context changed during validation; read research again");
  }
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", technology, before};
})()
