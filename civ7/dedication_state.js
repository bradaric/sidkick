(() => dedicationDeck.snapshot(GameContext.localPlayerID) ?? {
  turn: Game.turn, age: Game.age, playerId: GameContext.localPlayerID,
  reason: "Dedication deck state is unavailable",
})()
