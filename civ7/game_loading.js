(() => {
  // Fixed ordinary loading-screen observer/Begin; gameplay keeps its GameStarted gate.
  const a = queryArguments;
  const unavailable = phase => ({phase, loadingToken: null, loadCompleted: false});
  const reject = reason => ({status: "rejected", reason, loadCompleted: false});
  const store = globalThis.__sidkickGameLoading ??= {root: null, generation: 0, consumed: false};
  function beginControl() {
    const roots = [...document.querySelectorAll('#load-screen')];
    const buttons = [...document.querySelectorAll('#load-screen .load-screen-begin-game-button [data-name="HeroButton2"][role="button"]')];
    if (roots.length !== 1 || buttons.length !== 1) return null;
    const button = buttons[0], rect = button.getBoundingClientRect();
    if (button.isConnected !== true || button.getClientRects().length === 0 ||
        button.textContent.replace(/\s+/g, " ").trim() !== Locale.compose("LOC_LOADING_BEGIN_GAME").replace(/\s+/g, " ").trim() ||
        button.getAttribute("data-activatable") !== "true" || button.hasAttribute("disabled") ||
        button.getAttribute("aria-disabled") === "true" || button.classList.contains("disabled") ||
        ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 ||
        !button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))) return null;
    return {root: roots[0], button};
  }
  function observe() {
    try {
      if (Configuration.getGame().isAnyMultiplayer !== false || Configuration.getUser().isAutoEndTurn !== false ||
          (typeof Autoplay !== "undefined" && Autoplay.isActive !== false)) return unavailable("unavailable");
      const loading = UI.getGameLoadingState();
      if (Number.isInteger(UIGameLoadingState.NotStarted) && loading === UIGameLoadingState.NotStarted)
        return unavailable("not_started");
      // Native returns numeric 0 here; the bootstrap uses its truthiness, not === false.
      const transition = Modding.getTransitionInProgress();
      if (transition !== false && transition !== 0 || document.querySelectorAll('#age-transition-load-screen').length > 0)
        return {...unavailable("transition"), nextAction: "get_civ7_transition_workflow"};
      const started = Number.isInteger(UIGameLoadingState.GameStarted) && loading === UIGameLoadingState.GameStarted;
      const waiting = Number.isInteger(UIGameLoadingState.WaitingForUIReady) && loading === UIGameLoadingState.WaitingForUIReady;
      if (!started && !waiting || started && document.querySelectorAll('#loading-curtain').length > 0)
        return unavailable("loading");
      if (started && UI.isInGame() !== true) return unavailable("unavailable");
      const playerId = GameContext.localPlayerID, count = Configuration.getGame().previousAgeCount;
      if (!Number.isInteger(playerId) || playerId < 0 || !Number.isSafeInteger(Game.turn) || Game.turn < 0 ||
          !Number.isInteger(Game.age) || !Number.isSafeInteger(count) || count < 0) return unavailable("unavailable");
      const state = {turn: Game.turn, age: Game.age, playerId, previousAgeCount: count,
        ageType: GameInfo.Ages.lookup(Game.age)?.AgeType ?? null,
        civilization: GameInfo.Civilizations.lookup(Players.get(playerId)?.civilizationType)?.CivilizationType ?? null};
      if (typeof state.ageType !== "string" || typeof state.civilization !== "string") return unavailable("unavailable");
      if (started) return {...state, phase: "started", loadingToken: null, loadCompleted: true, nextAction: "get_civ7_turn_context"};
      const control = beginControl();
      if (!control) return {...state, ...unavailable("loading")};
      // Bind to this rendered screen, not just turn/Age: reloading the same save needs a new token.
      if (store.root !== control.root) {
        store.root = control.root; store.generation++; store.consumed = false;
      }
      return {...state, phase: "awaiting_begin", loadCompleted: false,
        loadingToken: store.consumed ? null : JSON.stringify({...state, generation: store.generation}),
        nextAction: store.consumed ? "get_civ7_loading_state" : "begin_civ7_loaded_game"};
    } catch { return unavailable("unavailable"); }
  }
  const before = observe();
  if (a.operation === "observe") return before;
  if (a.operation !== "begin" || before.phase !== "awaiting_begin" || typeof a.loading_token !== "string" ||
      !before.loadingToken || a.loading_token !== before.loadingToken) return reject("Exact ready ordinary-load Begin token required");
  try {
    const control = beginControl();
    if (!control || observe().loadingToken !== before.loadingToken || beginControl()?.button !== control.button ||
        typeof UI.notifyUIReady !== "function") return reject("Native ordinary-load Begin is unavailable, covered or changed");
  } catch { return reject("Native ordinary-load Begin readiness unavailable"); }
  // Consume before invoking: an exception can follow an applied write. Never retry it.
  store.consumed = true;
  UI.notifyUIReady();
  return {status: "submitted", before, loadCompleted: false};
})()
