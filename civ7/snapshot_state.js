(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  return {turn: Game.turn, age: Game.age, playerId,
    civilization: player.civilizationType, leader: player.leaderType};
})()
