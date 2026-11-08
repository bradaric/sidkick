(() => {
  const {node, expected_turn: expectedTurn} = queryArguments;
  const reject = reason => ({status: "rejected", node, reason});
  if (typeof node !== "string" || !node.trim() || !Number.isInteger(expectedTurn) || expectedTurn < 0) return reject("An exact attribute node ID and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const matches = [];
  for (const branch of GameInfo.Attributes) {
    if (!branch.ProgressionTreeType) continue;
    for (const entry of Game.ProgressionTrees.getTreeStructure(branch.ProgressionTreeType) ?? []) {
      const definition = GameInfo.ProgressionTreeNodes.lookup(entry.nodeType);
      if (definition?.ProgressionTreeNodeType === node &&
          Game.ProgressionTrees.canEverUnlock(playerId, entry.nodeType)?.isLocked === false) {
        matches.push({branch, definition, type: entry.nodeType});
      }
    }
  }
  if (matches.length !== 1) return reject("No unique applicable local attribute node matches this ID");
  const {branch, definition, type} = matches[0];
  if (definition.Repeatable) return reject("Repeatable attribute purchases are not supported in this increment");
  const state = Game.ProgressionTrees.getNode(playerId, type);
  if (!Number.isInteger(state?.depthUnlocked) || state.depthUnlocked < 0) return reject("Attribute node state is unavailable");
  const branchPoints = player.Identity.getAvailableAttributePoints(branch.AttributeType);
  const wildcardPoints = player.Identity.getWildcardPoints();
  const before = {turn: Game.turn, age: Game.age, playerId, node, depthUnlocked: state.depthUnlocked,
    branch: branch.AttributeType, branchPoints, wildcardPoints};
  if (state.depthUnlocked > 0) return {status: "already_active", node, before};
  if (Game.ProgressionTrees.hasLegendUnlocked(playerId, type)?.isLocked !== false) return reject("Leader milestone is locked or unverified");
  const nodeState = Game.ProgressionTrees.getNodeState(playerId, type);
  if ([ProgressionTreeNodeState.NODE_STATE_INVALID, ProgressionTreeNodeState.NODE_STATE_CLOSED,
       ProgressionTreeNodeState.NODE_STATE_FULLY_UNLOCKED].includes(nodeState)) return reject("Attribute node is not open for purchase");
  if (!Number.isInteger(branchPoints) || branchPoints < 0 || !Number.isInteger(wildcardPoints) || wildcardPoints < 0) return reject("Attribute point balances are unavailable");
  if (branchPoints + wildcardPoints === 0) return reject("No attribute or wildcard points are available");
  const args = {ProgressionTreeNodeType: type};
  const operation = PlayerOperationTypes.BUY_ATTRIBUTE_TREE_NODE;
  const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
  if (check?.Success !== true) return {status: "rejected", node, reason: "Native attribute purchase check failed", failureReasons: check?.FailureReasons ?? []};
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Game context changed during validation");
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", node, before, expected: {node, depthUnlocked: before.depthUnlocked + 1}};
})()
