(() => {
  // The ONLY transition write permitted outside GameStarted is this fixed Begin operation.
  const a = queryArguments, reject = reason => ({status: "rejected", reason});
  function welcomeControl(ageType) {
    try {
      const roots = [...document.querySelectorAll('tutorial-callout[itemid="welcome_intro"]')];
      if (roots.length !== 1 || !["AGE_EXPLORATION", "AGE_MODERN"].includes(ageType)) return null;
      const root = roots[0], value = JSON.parse(root.getAttribute("value"));
      const title = Locale.compose(`LOC_TUTORIAL_${ageType.replace("AGE_", "")}_WELCOME_TITLE`);
      if (root.isConnected !== true || root.getClientRects().length === 0 || value.title !== title ||
          typeof value.body?.text !== "string" || !value.body.text || value.option1?.text !== "LOC_TUTORIAL_CALLOUT_BEGIN" ||
          value.option1.actionKey !== "inline-accept" || value.option1.closes !== true || value.option2 || value.option3) return null;
      const buttons = [...root.querySelectorAll('.tutorial-callout-option1[role="button"]')];
      if (buttons.length !== 1) return null;
      const button = buttons[0], r = button.getBoundingClientRect();
      const text = button.textContent.replace(/\s+/g, " ").trim();
      if (button.isConnected !== true || button.getClientRects().length === 0 ||
          !["LOC_TUTORIAL_CALLOUT_BEGIN", Locale.compose("LOC_TUTORIAL_CALLOUT_BEGIN")].includes(text) ||
          button.getAttribute("data-activatable") !== "true" || button.hasAttribute("disabled") ||
          button.getAttribute("aria-disabled") === "true" || button.classList.contains("disabled") ||
          ![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0 ||
          !button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))) return null;
      return {button, identity: {title, body: value.body.text, label: text}};
    } catch { return null; }
  }
  function beginControl() {
    try {
      // load-screen-bootstrap renders this instead of the ordinary save-load Begin screen.
      const buttons = [...document.querySelectorAll('#age-transition-load-screen [data-name="HeroButton2"][role="button"]')];
      if (buttons.length !== 1) return null;
      const button = buttons[0], rect = button.getBoundingClientRect();
      const label = Locale.compose("LOC_GENERIC_CONTINUE").replace(/\s+/g, " ").trim();
      if (button.isConnected !== true || button.getClientRects().length === 0 || button.textContent.replace(/\s+/g, " ").trim() !== label ||
          button.getAttribute("data-activatable") !== "true" || button.hasAttribute("disabled") ||
          button.getAttribute("aria-disabled") === "true" || button.classList.contains("disabled") ||
          ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 ||
          !button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))) return null;
      return button;
    } catch { return null; }
  }
  function observe() {
    try {
      if (Configuration.getGame().isAnyMultiplayer !== false || Configuration.getUser().isAutoEndTurn !== false ||
          (typeof Autoplay !== "undefined" && Autoplay.isActive !== false)) return {phase: "unavailable", transitionCompleted: false};
      const loading = UI.getGameLoadingState();
      const started = Number.isInteger(UIGameLoadingState.GameStarted) && loading === UIGameLoadingState.GameStarted;
      const waiting = Number.isInteger(UIGameLoadingState.WaitingForUIReady) && loading === UIGameLoadingState.WaitingForUIReady;
      if (started && UI.isInGame() !== true) return {phase: "unavailable", transitionCompleted: false};
      if (started && document.querySelectorAll("#loading-curtain").length > 0)
        return {phase: "loading", transitionCompleted: false};
      if (!started && !waiting) return {phase: "loading", transitionCompleted: false};
      const playerId = GameContext.localPlayerID, player = Players.get(playerId), count = Configuration.getGame().previousAgeCount;
      if (!Number.isInteger(playerId) || playerId < 0 || !Number.isSafeInteger(Game.turn) || !Number.isInteger(Game.age) ||
          !Number.isSafeInteger(count) || count < 0 || waiting && count === 0) return {phase: "unavailable", transitionCompleted: false};
      const state = {turn: Game.turn, age: Game.age, playerId, previousAgeCount: count,
        ageType: GameInfo.Ages.lookup(Game.age)?.AgeType ?? null,
        civilization: GameInfo.Civilizations.lookup(player.civilizationType)?.CivilizationType ?? null};
      if (typeof state.ageType !== "string" || typeof state.civilization !== "string") return {phase: "unavailable", transitionCompleted: false};
      const ids = Game.Notifications.getIdsForPlayer(playerId);
      if (!Array.isArray(ids)) return {phase: "unavailable", transitionCompleted: false};
      let choicesAcknowledged = false;
      const pending = typeName => {
        const active = [];
        for (const id of ids) {
          if (id.owner !== playerId || Game.Notifications.getTypeName(Game.Notifications.getType(id)) !== typeName) continue;
          const n = Game.Notifications.find(id);
          if (!n || typeof n.Dismissed !== "boolean" || typeof n.Expired !== "boolean") throw Error("Unknown notification state");
          if (n.Dismissed || n.Expired) continue;
          const blocks = Game.Notifications.getBlocksTurnAdvancement(id);
          if (typeof blocks !== "boolean") throw Error("Unknown notification blocking state");
          active.push(blocks);
        }
        if (active.length > 1) throw Error("Ambiguous transition notifications");
        if (typeName === "NOTIFICATION_CHOOSE_CIVILIZATION") choicesAcknowledged = active.length === 1 && active[0] === false;
        return active.some(blocks => blocks);
      };
      const choicePending = pending("NOTIFICATION_CHOOSE_CIVILIZATION"), dedicationPending = pending("NOTIFICATION_AGE_TRANSITION");
      const selectionComplete = player.AdvancedStart?.getPlacementComplete();
      let chooserOpen = null;
      try {
        const roots = [...document.querySelectorAll("#age-transition-screen")].filter(node => node.isConnected === true && node.getClientRects().length > 0);
        if (roots.length <= 1) chooserOpen = roots.length === 1;
      } catch { /* UI cleanup availability is separate from native acknowledgement. */ }
      const welcomePending = started && document.querySelectorAll('tutorial-callout[itemid="welcome_intro"]').length > 0;
      const welcome = welcomePending && count > 0 && state.turn === 1 ? welcomeControl(state.ageType) : null;
      let active = null, sent = null, hasBlocker = null, unitOrdersPending = null;
      if (started) {
        try {
          active = typeof player.isTurnActive === "boolean" ? player.isTurnActive : null;
          const sentValue = GameContext.hasSentTurnComplete();
          sent = typeof sentValue === "boolean" ? sentValue : null;
          const blocker = Game.Notifications.getEndTurnBlockingType(playerId);
          if (Number.isInteger(blocker) && Number.isInteger(EndTurnBlockingTypes.NONE)) hasBlocker = blocker !== EndTurnBlockingTypes.NONE;
          const any = Game.UnitOperations.canStartAny(playerId);
          if (typeof any === "boolean") unitOrdersPending = any && UI.Player.getFirstReadyUnit() != null;
        } catch { /* Readiness can be unavailable during startup; never infer clear blockers. */ }
      }
      return {...state, phase: welcomePending ? "awaiting_welcome" : started ? "started" : "awaiting_begin",
        beginStage: welcomePending ? "welcome" : waiting ? "loading" : null, choicePending, choicesAcknowledged, chooserOpen,
        active, sent, hasBlocker, unitOrdersPending,
        selectionComplete: typeof selectionComplete === "boolean" ? selectionComplete : null,
        transitionCompleted: started && !welcomePending && count > 0 && !choicePending && !choicesAcknowledged && !dedicationPending && selectionComplete === true &&
          Game.AgeProgressManager?.isAgeOver === false,
        loadingToken: welcome ? JSON.stringify({...state, welcome: welcome.identity})
          : waiting && beginControl() ? JSON.stringify(state) : null};
    } catch { return {phase: "unavailable", transitionCompleted: false}; }
  }
  const before = observe();
  if (a.operation === "observe") return before;
  if (a.operation !== "begin" || !["awaiting_begin", "awaiting_welcome"].includes(before.phase) || typeof a.loading_token !== "string" ||
      !before.loadingToken || a.loading_token !== before.loadingToken) return reject("Exact ready transition-Age Begin token required");
  try {
    const currentControl = () => before.phase === "awaiting_welcome" ? welcomeControl(before.ageType)?.button : beginControl();
    const button = currentControl();
    if (!button || observe().loadingToken !== before.loadingToken || currentControl() !== button ||
        before.phase === "awaiting_welcome" && (!Number.isInteger(InputActionStatuses.FINISH) || typeof CustomEvent !== "function"))
      return reject("Native transition Continue is disabled, covered, unavailable or changed");
  } catch { return reject("Native Begin readiness unavailable"); }
  // Keep submission outside preflight catch: an exception here may follow an applied write.
  // Loading Continue uses the native readiness call only in WaitingForUIReady,
  // without the Apple Arcade store-review request. The in-game welcome instead
  // activates its exact Begin button; it never sends readiness a second time.
  if (before.phase === "awaiting_welcome") welcomeControl(before.ageType).button.dispatchEvent(new CustomEvent("engine-input", {
    bubbles: false, cancelable: true, detail: {name: "accept", status: InputActionStatuses.FINISH}}));
  else UI.notifyUIReady();
  return {status: "submitted", before, transitionCompleted: false};
})()
