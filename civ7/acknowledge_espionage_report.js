(() => {
  const reject = reason => ({status: "rejected", reason});
  const {phase} = queryArguments, playerId = GameContext.localPlayerID;
  if (!espionageReport.ready(playerId)) return reject("Active single-player GameStarted turn with auto-end-turn disabled and native report UI required");
  if (phase === "open") {
    const {notification_id: notificationId, component_type: componentType, expected_turn: expectedTurn, report_token: token} = queryArguments;
    if (![notificationId, componentType, expectedTurn].every(value => Number.isInteger(value) && value >= 0) ||
        Game.turn !== expectedTurn || typeof token !== "string" || !token || token.length > 100000) return reject("Exact report component, fresh token and expected turn required");
    const id = {owner: playerId, id: notificationId, type: componentType};
    const report = espionageReport.record(playerId, id);
    if (!report || JSON.stringify(report.identity) !== token) return reject("Owned espionage report identity or token is stale/unavailable");
    const player = Players.get(playerId), before = {turn: Game.turn, age: Game.age, playerId, identity: report.identity, reportToken: token,
      gold: player.Treasury?.goldBalance, influence: player.DiplomacyTreasury?.diplomacyBalance};
    if (![before.gold, before.influence].every(Number.isFinite)) return reject("Own currency baseline unavailable");
    const state = espionageReport.observe(before);
    if (!state.identityUnchanged || !state.balancesUnchanged || !["closed", "matching"].includes(state.uiStatus)) return reject("Report contents or open report panel cannot be verified");
    if (!report.pending && state.popupClosed) return {status: "already_active", before};
    if (state.uiStatus === "closed") Game.Notifications.activate(id);
    return {status: "submitted", before};
  }
  if (phase === "continue") {
    const {before} = queryArguments;
    if (!before || Game.turn !== before.turn || Game.age !== before.age || playerId !== before.playerId) return reject("Game context changed after report activation");
    const state = espionageReport.observe(before), window = espionageReport.ui(before.identity);
    if (!state.identityUnchanged || !state.balancesUnchanged || state.uiStatus !== "matching" || window.status !== "matching") return reject("Exact report, balances or native Continue button changed");
    window.continueButton.dispatchEvent(new CustomEvent("action-activate", {bubbles: false, cancelable: true, detail: {x: 0, y: 0}}));
    return {status: "submitted"};
  }
  return reject("Only the fixed espionage report open/Continue phases are supported");
})()
