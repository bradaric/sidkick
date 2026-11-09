(() => {
  const text = value => value.replace(/\s+/g, " ").trim();
  function balances(playerId) {
    try {
      const player = Players.get(playerId), gold = player?.Treasury?.goldBalance, influence = player?.DiplomacyTreasury?.diplomacyBalance;
      return [gold, influence].every(Number.isFinite) ? {gold, influence} : null;
    } catch { return null; }
  }
  function ready() {
    try {
      const playerId = GameContext.localPlayerID;
      return UI.isInGame() === true && Number.isInteger(UIGameLoadingState.GameStarted) &&
        UI.getGameLoadingState() === UIGameLoadingState.GameStarted && Configuration.getGame().isAnyMultiplayer === false &&
        Configuration.getUser().isAutoEndTurn === false && Number.isInteger(Game.turn) && Number.isInteger(Game.age) &&
        Number.isInteger(playerId) && playerId >= 0 && Players.get(playerId)?.isTurnActive === true &&
        GameContext.hasSentTurnComplete() === false && typeof CustomEvent === "function" &&
        Number.isInteger(InputActionStatuses.FINISH) && balances(playerId) !== null;
    } catch { return false; }
  }
  function inspect() {
    try {
      const hosts = document.querySelectorAll("triumph-complete-popup"), panels = document.querySelectorAll("#triumph-complete-popup");
      if (hosts.length === 0 && panels.length === 0) return {view: {status: "closed", availableNow: false}};
      if (hosts.length !== 1 || panels.length !== 1) return {view: {status: "ambiguous", availableNow: false}};
      const host = hosts[0], panel = panels[0];
      const visible = node => node.isConnected === true && node.getClientRects().length > 0;
      if (!visible(host) || !visible(panel) || !host.contains(panel)) return {view: {status: "unverified", availableNow: false}};
      const cards = panel.querySelectorAll(".triumph-card"), buttons = panel.querySelectorAll('.triumph-complete-frame .fxs-button[data-name="Button"][role="button"]');
      if (cards.length !== 1 || buttons.length !== 1) return {view: {status: "unverified", availableNow: false}};
      const headings = cards[0].querySelectorAll(".text-secondary.font-title"), button = buttons[0];
      const closeLabel = text(Locale.compose("LOC_UI_CITY_CLOSE_YIELDS")), panelText = text(panel.textContent), body = text(cards[0].textContent);
      if (headings.length !== 1 || !text(headings[0].textContent) || !body || body.length > 20000 || panelText.length > 30000 ||
          !panelText.includes(text(Locale.compose("LOC_LEGACIES_COMPLETE_TITLE"))) || !visible(button) ||
          text(button.textContent) !== closeLabel || button.getAttribute("data-activatable") !== "true" ||
          button.hasAttribute("disabled") || button.getAttribute("aria-disabled") === "true" || button.classList.contains("disabled")) return {view: {status: "unverified", availableNow: false}};
      const rect = button.getBoundingClientRect();
      if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return {view: {status: "unverified", availableNow: false}};
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      if (!hit || !button.contains(hit)) return {view: {status: "covered", availableNow: false}};
      // Bind the rendered popup itself, not a similarly named legacy notification or guessed race/base definition.
      const identity = {turn: Game.turn, age: Game.age, playerId: GameContext.localPlayerID,
        title: text(headings[0].textContent), body, panelText, closeLabel};
      const token = JSON.stringify(identity), availableNow = ready();
      return {host, panel, button, token, view: {status: "open", title: identity.title, body, closeLabel,
        popupToken: availableNow ? token : null, availableNow, responseTool: "close_civ7_triumph_popup"}};
    } catch { return {view: {status: "unavailable", availableNow: false}}; }
  }
  return {ready, balances, inspect, snapshot: () => inspect().view};
})()
