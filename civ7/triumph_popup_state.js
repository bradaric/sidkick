(() => {
  const captured = globalThis.__sidkickTriumphClose;
  if (!captured || typeof queryArguments.request_id !== "string" || captured.requestId !== queryArguments.request_id)
    throw Error("Captured Triumph popup identity unavailable or replaced");
  const playerId = GameContext.localPlayerID, currency = triumphPopup.balances(playerId);
  return {turn: Game.turn, age: Game.age, playerId,
    capturedPopupClosed: captured.host.isConnected === false && captured.panel.isConnected === false,
    balancesUnchanged: playerId === captured.playerId && currency?.gold === captured.gold && currency?.influence === captured.influence,
    currentPopup: triumphPopup.snapshot()};
})()
