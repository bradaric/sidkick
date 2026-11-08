(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  const current = player.Culture.getResearching();
  return {turn: Game.turn, age: Game.age, playerId,
    activeCivic: current && current.type !== ProgressionTreeNodeTypes.NO_NODE
      ? GameInfo.ProgressionTreeNodes.lookup(current.type)?.ProgressionTreeNodeType ?? null : null};
})()
