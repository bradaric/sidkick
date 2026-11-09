(() => {
  const TYPE = "NOTIFICATION_DIPLOMATIC_ACTION_ESPIONAGE";
  const validId = value => Number.isInteger(value) && value >= 0;
  function ready(playerId) {
    try {
      const player = Players.get(playerId);
      return UI.isInGame() === true && typeof UIGameLoadingState !== "undefined" &&
        Number.isInteger(UIGameLoadingState.GameStarted) && UI.getGameLoadingState() === UIGameLoadingState.GameStarted &&
        Configuration.getGame().isAnyMultiplayer === false && Configuration.getUser().isAutoEndTurn === false &&
        GameContext.localPlayerID === playerId && player?.isTurnActive === true && GameContext.hasSentTurnComplete() === false &&
        typeof document !== "undefined" && typeof document.querySelectorAll === "function" &&
        typeof CustomEvent === "function" && typeof Game.Notifications.activate === "function";
    } catch { return false; }
  }
  function inventory(playerId) {
    const ids = Game.Notifications.getIdsForPlayer(playerId);
    if (!Array.isArray(ids)) throw Error("Notification inventory unavailable");
    return ids;
  }
  function record(playerId, id) {
    if (!validId(playerId) || id?.owner !== playerId || ![id.id, id.type].every(validId)) return null;
    const matches = inventory(playerId).filter(value => value?.owner === playerId && value.id === id.id);
    if (matches.length !== 1 || matches[0].type !== id.type) return null;
    const n = Game.Notifications.find(matches[0]), type = Game.Notifications.getType(matches[0]);
    const summary = Game.Notifications.getSummary(matches[0]);
    if (!n || n.Type !== type || Game.Notifications.getTypeName(type) !== TYPE || typeof summary !== "string" || !summary ||
        !validId(n.AddedOnTurn) || n.AddedOnTurn > Game.turn || ![n.Target?.id, n.Target?.type].every(validId) ||
        typeof n.Dismissed !== "boolean" || typeof n.Expired !== "boolean" || typeof n.BlocksTurnAdvancement !== "boolean") return null;
    const header = Game.Diplomacy.getDiplomaticEventData(n.Target.id);
    if (header?.uniqueID !== n.Target.id || typeof header.failed !== "boolean" || typeof header.revealed !== "boolean") return null;
    // The UI has no notification-ID attribute. Require a unique owned report body before matching its panel.
    const matchingBodies = inventory(playerId).filter(other => other?.owner === playerId &&
      Game.Notifications.getTypeName(Game.Notifications.getType(other)) === TYPE && Game.Notifications.getSummary(other) === summary);
    if (matchingBodies.length !== 1) return null;
    return {identity: {turn: Game.turn, age: Game.age, playerId, notification: {owner: playerId, id: id.id, type: id.type},
      notificationType: type, addedOnTurn: n.AddedOnTurn, eventId: n.Target.id, eventComponentType: n.Target.type,
      summary, failed: header.failed, revealed: header.revealed},
      pending: !n.Dismissed && !n.Expired && n.BlocksTurnAdvancement};
  }
  function ui(identity) {
    try {
      const panels = document.querySelectorAll("screen-espionage-details");
      if (panels.length === 0) return {status: "closed"};
      if (panels.length !== 1) return {status: "ambiguous"};
      const panel = panels[0];
      if (panel.isConnected !== true || panel.getClientRects().length === 0) return {status: "unavailable"};
      const details = panel.querySelectorAll("#espionage-details-container .font-body.text-base.font-fit-shrink");
      if (details.length !== 1 || details[0].innerHTML !== Locale.stylize(identity.summary)) return {status: "other"};
      const buttons = panel.querySelectorAll("#espionage-details-button-container > chooser-item");
      const text = value => value.replace(/\s+/g, " ").trim();
      if (buttons.length !== 2 || !buttons[0].querySelector(".espionage-details-acknowledge-icon") ||
          !buttons[1].querySelector(".espionage-details-diplomacy-icon") || buttons[0].hasAttribute("disabled") ||
          text(buttons[0].textContent) !== text(Locale.compose("LOC_DIPLOMACY_ESPIONAGE_DETAILS_ACKNOWLEDGE")) ||
          text(buttons[1].textContent) !== text(Locale.compose("LOC_DIPLOMACY_OPEN_DIPLOMACY"))) return {status: "other"};
      return {status: "matching", continueButton: buttons[0]};
    } catch { return {status: "unavailable"}; }
  }
  function snapshot(playerId, id) {
    try {
      const report = record(playerId, id);
      if (!report) return null;
      const window = ui(report.identity), player = Players.get(playerId);
      const supported = ready(playerId) && [player.Treasury?.goldBalance, player.DiplomacyTreasury?.diplomacyBalance].every(Number.isFinite) &&
        ["closed", "matching"].includes(window.status) && (report.pending || window.status === "matching");
      return {pending: report.pending, failed: report.identity.failed, revealed: report.identity.revealed,
        reportToken: supported ? JSON.stringify(report.identity) : null,
        responseOptions: [
          {response: "continue", name: Locale.compose("LOC_DIPLOMACY_ESPIONAGE_DETAILS_ACKNOWLEDGE"),
            availableNow: supported, supportedByWriteTool: supported, responseTool: "acknowledge_civ7_espionage_report"},
          {response: "open_diplomacy", name: Locale.compose("LOC_DIPLOMACY_OPEN_DIPLOMACY"), navigationOnly: true, supportedByWriteTool: false}
        ]};
    } catch { return null; }
  }
  function observe(before) {
    const identity = before?.identity, playerId = GameContext.localPlayerID;
    if (!identity || identity.playerId !== playerId || !validId(identity.notification?.id) || !validId(identity.notification?.type) ||
        identity.notification.owner !== playerId || before.reportToken !== JSON.stringify(identity) ||
        ![before.gold, before.influence].every(Number.isFinite)) throw Error("Captured espionage report identity/balances required");
    const ids = inventory(playerId).filter(value => value?.owner === playerId && value.id === identity.notification.id);
    let current = null;
    if (ids.length === 1 && ids[0].type === identity.notification.type) {
      const n = Game.Notifications.find(ids[0]);
      // Never follow a replaced notification into a different espionage event.
      if (n?.Type === identity.notificationType && n.AddedOnTurn === identity.addedOnTurn &&
          n.Target?.id === identity.eventId && n.Target?.type === identity.eventComponentType &&
          Game.Notifications.getSummary(ids[0]) === identity.summary) current = record(playerId, identity.notification);
    }
    const identityUnchanged = ids.length === 0 || Boolean(current && JSON.stringify(current.identity) === before.reportToken);
    const player = Players.get(playerId), balancesUnchanged = player.Treasury?.goldBalance === before.gold &&
      player.DiplomacyTreasury?.diplomacyBalance === before.influence;
    const window = ui(identity);
    return {turn: Game.turn, age: Game.age, playerId, identityUnchanged, balancesUnchanged, uiStatus: window.status,
      acknowledged: identityUnchanged && (ids.length === 0 || current?.pending === false), popupClosed: window.status === "closed"};
  }
  return {ready, record, ui, snapshot, observe};
})()
