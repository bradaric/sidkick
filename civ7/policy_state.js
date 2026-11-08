(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  function activeIds(slot) {
    const values = player.Culture.getActiveTraditions(slot);
    if (!Array.isArray(values)) throw Error("Active policy inventory is unavailable");
    const ids = values.map(value => {
      const id = GameInfo.Traditions.lookup(value)?.TraditionType;
      if (typeof id !== "string") throw Error("Active policy identity is unavailable");
      return id;
    });
    if (new Set(ids).size !== ids.length) throw Error("Active policy inventory is ambiguous");
    return ids.sort();
  }
  return {turn: Game.turn, age: Game.age, playerId,
    activePolicies: activeIds(CultureSlotTypes.POLICY_CULTURE_SLOT),
    activeTraditions: activeIds(CultureSlotTypes.TRADITION_CULTURE_SLOT),
    activeCrises: activeIds(CultureSlotTypes.CRISIS_CULTURE_SLOT)};
})()
