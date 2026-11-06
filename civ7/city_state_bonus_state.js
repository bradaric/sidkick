(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId), {city_state_id: targetId, expected_bonus: bonus} = queryArguments;
  if (!Number.isInteger(playerId) || playerId < 0 || !player || !Number.isInteger(targetId) || targetId < 0 || targetId === playerId || !Number.isInteger(bonus) ||
      player.Diplomacy.hasMet(targetId) !== true) throw Error("Invalid known city-state identity");
  const target = Players.get(targetId);
  if (target?.isMinor !== true) throw Error("Captured city-state identity changed");
  const current = Game.CityStates.getBonusType(targetId), pending = Game.CityStates.getCityStateBonusToSelect(playerId);
  return {turn: Game.turn, age: Game.age, playerId, targetId, bonus: current, pending,
    bonusObserved: current === bonus && pending !== targetId && target.Influence?.getSuzerain() === playerId};
})()
