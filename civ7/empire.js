(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const name = key => Locale.compose(key);
  const yields = Object.fromEntries([...GameInfo.Yields].map(def => [
    def.YieldType,
    player.Stats.getNetYield(def.$hash)
  ]));
  return {
    civilization: name(player.civilizationFullName),
    turn: Game.turn,
    age: name(GameInfo.Ages.lookup(Game.age).Name),
    treasury: player.Treasury.goldBalance,
    netYields: yields,
    settlements: {
      current: player.Stats.numSettlements,
      limit: player.Stats.settlementCap,
      remaining: player.Stats.settlementCap - player.Stats.numSettlements
    }
  };
})()
