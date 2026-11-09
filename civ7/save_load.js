(() => {
  // Fixed local-only operations, selected by typed Python wrappers, never caller JS.
  const a = queryArguments, reject = reason => ({status: "rejected", reason});
  const now = Date.now();
  const store = globalThis.__sidkickSaveLoad ??= {queries: Object.create(null), save: null};
  const requestId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
  function closeQuery(q) {
    q.listener?.clear(); clearTimeout(q.timer);
    if (!q.closed && Number.isInteger(q.nativeId)) GameStateStorage.closeFileListQuery(q.nativeId);
    q.closed = true;
  }
  for (const [id, q] of Object.entries(store.queries)) {
    if (now - q.created > 60000) {closeQuery(q); delete store.queries[id];}
  }
  if (a.operation === "list_close") {
    const q = store.queries[a.request_id];
    if (q) {closeQuery(q); if (!q.entries) delete store.queries[a.request_id];}
    return {status: "closed"};
  }
  try {
    if (![SaveLocations.LOCAL_STORAGE, SaveTypes.SINGLE_PLAYER, SaveFileTypes.GAME_STATE,
      SaveLocationCategories.NORMAL, SaveLocationCategories.QUICKSAVE, SaveLocationCategories.AUTOSAVE,
      ServerType.SERVER_TYPE_NONE, SerializerResult.RESULT_OK, SerializerResult.RESULT_PENDING, ModAllowance.Full]
      .every(Number.isInteger)) return reject("Native local save/load constants unavailable");
  } catch { return reject("Native local save/load constants unavailable"); }
  function context() {
    try {
      if (Configuration.getGame().isAnyMultiplayer !== false) return null;
      const inGame = UI.isInGame(), state = UI.getGameLoadingState();
      if (inGame === false && Number.isInteger(UIGameLoadingState.NotStarted) && state === UIGameLoadingState.NotStarted &&
          Configuration.getGame().isGameStarted === false && document.querySelector("main-menu")?.isConnected === true) return {mode: "menu"};
      if (inGame !== true || !Number.isInteger(UIGameLoadingState.GameStarted) || state !== UIGameLoadingState.GameStarted ||
          Configuration.getGame().isGameStarted !== true || !Number.isInteger(Game.turn) || !Number.isInteger(Game.age) ||
          !Number.isInteger(GameContext.localPlayerID) || GameContext.localPlayerID < 0) return null;
      return {mode: "game", turn: Game.turn, age: Game.age, playerId: GameContext.localPlayerID,
        ageType: typeof GameInfo === "undefined" ? null : GameInfo.Ages?.lookup(Game.age)?.AgeType ?? null};
    } catch { return null; }
  }
  const current = context();
  if (!current) return reject("Stable local single-player GameStarted game or main menu required; finish loading first");
  const sameContext = old => JSON.stringify(old) === JSON.stringify(current);
  function content(modIds) {
    const missingMods = [], unownedMods = [];
    try {
      const installed = Modding.getInstalledMods();
      if (!Array.isArray(installed)) throw Error("Installed content unavailable");
      for (const id of modIds) {
        const handle = Modding.getModHandle(id), mod = handle == null ? null : installed.find(m => m.handle === handle);
        if (!mod) missingMods.push(id);
        else if (mod.allowance !== ModAllowance.Full) unownedMods.push(id);
      }
      return {canLoad: missingMods.length === 0 && unownedMods.length === 0, missingMods, unownedMods};
    } catch { return {canLoad: false, missingMods: null, unownedMods: null}; }
  }
  function entry(f) {
    if (f?.location !== SaveLocations.LOCAL_STORAGE || f.type !== SaveTypes.SINGLE_PLAYER || f.contentType !== SaveFileTypes.GAME_STATE ||
        f.isDirectory !== false || f.isPlayerSave !== true || f.isPrevious === true || f.isLiveEventGame === true ||
        typeof f.fileName !== "string" || f.fileName.length > 255 || !/\.Civ7Save$/i.test(f.fileName) || /[\\/:\x00-\x1f]/.test(f.fileName) || f.fileName.includes("..") ||
        typeof f.displayName !== "string" || !Number.isInteger(f.locationCategories) || f.locationCategories < 0 || (f.locationCategories & ~7) !== 0 ||
        !Number.isInteger(f.slot) || f.slot < -1 || typeof f.additionalInfo !== "string" || f.additionalInfo.length > 1024 ||
        !Number.isInteger(f.currentTurn) || f.currentTurn < 0 || typeof f.hostAge !== "string" || !f.hostAge ||
        typeof f.gameGUID !== "string" || !f.gameGUID || !/^\d+$/.test(String(f.saveTime)) ||
        !Array.isArray(f.requiredMods) || f.requiredMods.some(m => typeof m?.ID !== "string" || !m.ID)) return null;
    const modIds = [...new Set(f.requiredMods.map(m => m.ID))].sort();
    const params = {Location: f.location, LocationCategories: f.locationCategories, Type: f.type,
      ContentType: f.contentType, FileName: f.fileName, DisplayName: f.displayName, Slot: f.slot, AdditionalInfo: f.additionalInfo};
    // File-list IDs change on every refresh; bind persistent identity and revision instead.
    const saveToken = JSON.stringify({params, saveTime: String(f.saveTime), gameGUID: f.gameGUID,
      currentTurn: f.currentTurn, age: f.hostAge, savedByVersion: f.savedByVersion ?? null, modIds});
    return {params, modIds, public: {fileName: f.fileName, displayName: f.displayName, saveTime: String(f.saveTime),
      currentTurn: f.currentTurn, age: f.hostAge, gameGUID: f.gameGUID, leader: f.hostLeaderName ?? null,
      civilization: f.hostCivilizationName ?? null, isAutosave: f.isAutosave === true, isQuicksave: f.isQuicksave === true,
      savedByVersion: f.savedByVersion ?? null, saveToken, ...content(modIds)}};
  }
  if (a.operation === "list_start") {
    if (!requestId(a.request_id) || Object.hasOwn(store.queries, a.request_id) || Object.keys(store.queries).length >= 16) return reject("Unique bounded save-list request required");
    const q = {created: now, context: current, nativeId: null, entries: null, closed: false};
    store.queries[a.request_id] = q;
    q.listener = engine.on("FileListQueryResults", (id, files) => {
      if (id !== q.nativeId) return;
      try {
        if (!Array.isArray(files) || files.length > 10000) throw Error("Save inventory unavailable or too large");
        q.entries = files.map(entry).filter(Boolean); q.completed = Date.now();
      } catch (error) {q.error = String(error);}
      closeQuery(q);
    });
    try {
      q.nativeId = GameStateStorage.querySaveGameList({Location: SaveLocations.LOCAL_STORAGE, Type: SaveTypes.SINGLE_PLAYER,
        LocationOptions: SaveLocationCategories.NORMAL | SaveLocationCategories.QUICKSAVE | SaveLocationCategories.AUTOSAVE,
        ContentType: SaveFileTypes.GAME_STATE, ForceRefresh: true});
      if (!Number.isInteger(q.nativeId) || q.nativeId < 0) throw Error("Native save query was not accepted");
      q.timer = setTimeout(() => {q.error = "Save query timed out"; closeQuery(q);}, 5000);
    } catch (error) {closeQuery(q); delete store.queries[a.request_id]; throw error;}
    return {status: "pending"};
  }
  if (a.operation === "list_poll") {
    const q = store.queries[a.request_id];
    if (!q || !sameContext(q.context)) return reject("Save-list context changed or request expired");
    if (q.error) throw Error(q.error);
    return q.entries ? {status: "ready", inventoryId: a.request_id, context: current, saves: q.entries.map(e => e.public)} : {status: "pending"};
  }
  if (a.operation === "save_state") {
    const s = store.save;
    if (!s || s.id !== a.request_id || !sameContext(s.context)) return reject("Save observation or game context changed");
    return {status: "ready", context: current, serializerComplete: Number.isInteger(s.result),
      serializerOk: s.result === SerializerResult.RESULT_OK, nativeResult: s.result ?? null};
  }
  if (!["save", "load"].includes(a.operation)) return reject("Unsupported fixed save/load operation");
  if (store.save && !store.save.finished && now < store.save.expires) return reject("Another save outcome is still pending; never retry automatically");
  if (current.mode === "game" && (!Number.isInteger(a.expected_turn) || a.expected_turn < 0 || a.expected_turn !== current.turn ||
      Players.get(current.playerId)?.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false)) return reject("Fresh active local single-player turn required");
  if (current.mode === "menu" && (a.operation !== "load" || a.expected_turn !== null)) return reject("Only loading without expected_turn is supported from the main menu");
  const q = store.queries[a.inventory_id];
  if (!q?.entries || q.consumed || !sameContext(q.context) || now - q.completed > 5000) return reject("Fresh exact local save inventory required");
  if (a.operation === "load") {
    if (a.confirm_discard_unsaved_progress !== true || typeof a.save_token !== "string") return reject("Explicit confirmation to discard unsaved progress and exact save token required");
    const matches = q.entries.filter(e => e.public.saveToken === a.save_token);
    if (matches.length !== 1 || !matches[0].public.canLoad || !content(matches[0].modIds).canLoad) return reject("Save identity changed, is ambiguous, or requires unavailable/unowned content");
    const selected = matches[0]; q.consumed = true;
    const accepted = Network.loadGame(selected.params, ServerType.SERVER_TYPE_NONE);
    return {status: accepted === true ? "submitted" : accepted === false ? "rejected" : "unknown",
      loadCompleted: false, requiresFreshState: true, save: selected.public,
      reason: "Native load acceptance is not completed loading. Wait for loading/Begin, refresh state and never retry automatically"};
  }
  if (typeof a.save_name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 _-]{0,79}$/.test(a.save_name) || a.save_name.trim() !== a.save_name ||
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(a.save_name) || !requestId(a.request_id) || typeof current.ageType !== "string") return reject("Safe new save name and verified current Age required");
  const fileName = `${a.save_name}.Civ7Save`;
  if (q.entries.some(e => e.public.fileName.toLowerCase() === fileName.toLowerCase() ||
      e.public.displayName.toLowerCase() === a.save_name.toLowerCase())) return reject("Save already exists; overwriting is never supported");
  const s = {id: a.request_id, context: current, expires: now + 15000, finished: false};
  store.save = s;
  s.listener = engine.on("SaveComplete", event => {
    // Autosave/quicksave completion must never verify a manual save.
    if (!Number.isInteger(event?.options) || (event.options & ~SaveLocationCategories.NORMAL) !== 0 ||
        !Number.isInteger(event.result) || event.result === SerializerResult.RESULT_PENDING ||
        (typeof event.fileName === "string" && event.fileName.toLowerCase() !== fileName.toLowerCase())) return;
    s.result = event.result; s.finished = true; s.listener.clear(); clearTimeout(s.timer);
  });
  s.timer = setTimeout(() => {s.listener.clear(); s.finished = true;}, 15000);
  q.consumed = true;
  let accepted;
  try {
    accepted = Network.saveGame({Location: SaveLocations.LOCAL_STORAGE, LocationCategories: SaveLocationCategories.NORMAL,
      Type: SaveTypes.SINGLE_PLAYER, ContentType: SaveFileTypes.GAME_STATE, FileName: a.save_name, Overwrite: false});
  } catch (error) {s.listener.clear(); clearTimeout(s.timer); throw error;}
  if (accepted !== true) {s.listener.clear(); clearTimeout(s.timer); s.finished = true;}
  return {status: accepted === true ? "submitted" : accepted === false ? "rejected" : "unknown", before: current, requestId: s.id};
})()
