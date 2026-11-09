(() => {
  const {popup_token: token, expected_turn: expectedTurn, request_id: requestId} = queryArguments;
  const reject = reason => ({status: "rejected", reason});
  if (typeof token !== "string" || !token || token.length > 100000 || !Number.isInteger(expectedTurn) || expectedTurn < 0 ||
      typeof requestId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(requestId)) return reject("Fresh exact Triumph popup token, request identity and expected turn required");
  if (!triumphPopup.ready() || Game.turn !== expectedTurn) return reject("Active single-player GameStarted turn with auto-end-turn disabled required");
  const popup = triumphPopup.inspect(), playerId = GameContext.localPlayerID, currency = triumphPopup.balances(playerId);
  if (!popup.view.availableNow || popup.token !== token || !currency) return reject("Exact visible Triumph popup and unobstructed native Close control required");
  const before = {turn: Game.turn, age: Game.age, playerId, requestId, title: popup.view.title, ...currency};
  const latest = triumphPopup.inspect(), currentCurrency = triumphPopup.balances(playerId);
  if (!latest.view.availableNow || latest.token !== token || latest.host !== popup.host || latest.panel !== popup.panel ||
      latest.button !== popup.button || currentCurrency?.gold !== before.gold || currentCurrency?.influence !== before.influence)
    return reject("Triumph popup, Close control, currency balances or game context changed");
  // Retain the captured DOM identity so a subsequently queued popup is never mistaken for this one.
  globalThis.__sidkickTriumphClose = {...before, host: popup.host, panel: popup.panel};
  popup.button.dispatchEvent(new CustomEvent("engine-input", {bubbles: false, cancelable: true,
    detail: {name: "accept", status: InputActionStatuses.FINISH}}));
  return {status: "submitted", before, expected: {capturedPopupClosed: true, balancesUnchanged: true},
    verificationArguments: {request_id: requestId},
    verificationScope: "Captured Triumph popup DOM detached and own Gold/Influence unchanged; another queued popup may appear. No legacy-notification dismissal, reward selection or turn advancement"};
})()
