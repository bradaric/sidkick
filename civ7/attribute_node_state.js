(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  const {node} = queryArguments;
  if (typeof node !== "string" || !node.trim()) throw Error("An exact attribute node ID is required");
  const matches = [];
  for (const branch of GameInfo.Attributes) {
    if (!branch.ProgressionTreeType) continue;
    for (const entry of Game.ProgressionTrees.getTreeStructure(branch.ProgressionTreeType) ?? []) {
      if (GameInfo.ProgressionTreeNodes.lookup(entry.nodeType)?.ProgressionTreeNodeType === node &&
          Game.ProgressionTrees.canEverUnlock(playerId, entry.nodeType)?.isLocked === false) matches.push({branch, type: entry.nodeType});
    }
  }
  if (matches.length !== 1) throw Error("No unique applicable local attribute node");
  const {branch, type} = matches[0];
  const state = Game.ProgressionTrees.getNode(playerId, type);
  if (!Number.isInteger(state?.depthUnlocked) || state.depthUnlocked < 0) throw Error("Attribute state is unavailable");
  return {turn: Game.turn, age: Game.age, playerId, node, depthUnlocked: state.depthUnlocked,
    branch: branch.AttributeType, branchPoints: player.Identity.getAvailableAttributePoints(branch.AttributeType),
    wildcardPoints: player.Identity.getWildcardPoints()};
})()
