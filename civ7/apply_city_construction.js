(() => {
  const {mode, settlement, item, expected_turn: expectedTurn, x, y, max_gold_cost: cap} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (!["append", "purchase"].includes(mode) || typeof settlement !== "string" || !settlement.trim() ||
      typeof item !== "string" || !item || !Number.isInteger(expectedTurn) || expectedTurn < 0 ||
      ((x != null || y != null) && (!Number.isInteger(x) || x < 0 || !Number.isInteger(y) || y < 0)) ||
      (mode === "purchase" && (!Number.isFinite(cap) || cap < 0))) return reject("Invalid construction arguments");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const matches = player.Cities.getCities().filter(city => city.id.owner === playerId &&
    Locale.compose(city.name).toLowerCase() === settlement.toLowerCase());
  if (matches.length !== 1) return reject("No unique owned settlement matches this exact name");
  const city = matches[0];
  if (mode === "append" && city.isTown !== false) return reject("Production append requires a city, not a town focus");
  const unit = GameInfo.Units.lookup(item), building = GameInfo.Constructibles.lookup(item), project = GameInfo.Projects.lookup(item);
  const choices = [
    unit?.UnitType === item ? {kind: "unit", def: unit, parameter: "UnitType"} : null,
    building?.ConstructibleType === item && building.ConstructibleClass === "BUILDING"
      ? {kind: "building", def: building, parameter: "ConstructibleType"} : null,
    project?.ProjectType === item && mode === "append" ? {kind: "project", def: project, parameter: "ProjectType"} : null,
  ].filter(Boolean);
  if (choices.length !== 1 || !Number.isInteger(choices[0].def.$hash)) return reject("Unsupported or ambiguous exact item type ID");
  const {kind, def, parameter} = choices[0];
  if (kind === "building" ? x == null || y == null : x != null || y != null) return reject("Only buildings require explicit x and y");
  let plot = null;
  if (kind === "building") {
    plot = GameplayMap.getIndexFromLocation({x, y});
    const location = Number.isInteger(plot) && plot >= 0 ? GameplayMap.getLocationFromIndex(plot) : null;
    if (!location || location.x !== x || location.y !== y ||
        GameplayMap.getRevealedState(playerId, x, y) === RevealedStates.HIDDEN) return reject("An exact revealed building tile is required");
    const previews = city.Yields.calculateAllBuildingsPlacements()?.buildings
      ?.filter(value => value.constructibleType === def.$hash).flatMap(value => value.placements ?? [])
      .filter(value => value.plotID === plot) ?? [];
    if (previews.length !== 1 || previews[0].overbuiltConstructibleID !== -1) return reject("A verified placement with no overbuilding is required");
  }
  const queue = city.BuildQueue.getQueue();
  if (!Array.isArray(queue)) return reject("Production queue is unavailable");
  // Capture value snapshots, not mutable engine wrappers, for prefix/readback checks.
  const before = {turn: Game.turn, age: Game.age, playerId, cityId: city.id.id,
    queue: JSON.parse(JSON.stringify(queue)), gold: player.Treasury?.goldBalance ?? null};
  const assets = mode !== "purchase" ? [] : kind === "unit" ? player.Units.getUnits()
    .filter(value => value.id.owner === playerId && value.type === def.$hash)
    : (city.Constructibles.getIds() ?? []).map(id => Constructibles.getByComponentID(id))
      .filter(value => value && value.id.owner === playerId && value.type === def.$hash);
  const validId = id => id?.owner === playerId && Number.isInteger(id.id) && id.id >= 0 && Number.isInteger(id.type);
  const assetIds = assets.map(value => value.id);
  const idKey = id => `${id.owner}:${id.id}:${id.type}`;
  if (assetIds.some(id => !validId(id)) || new Set(assetIds.map(idKey)).size !== assetIds.length) return reject("Asset identity is unverified");
  before.assetIds = JSON.parse(JSON.stringify(assetIds));
  if (mode === "append" && !Number.isInteger(CityOperationsParametersValues.Append)) return reject("Native Append insertion mode is unavailable");
  const args = {[parameter]: def.$hash, ...(kind === "building" ? {X: x, Y: y} : {}),
    ...(mode === "append" ? {InsertMode: CityOperationsParametersValues.Append} : {})};
  const api = mode === "append" ? Game.CityOperations : Game.CityCommands;
  const operation = mode === "append" ? CityOperationTypes.BUILD : CityCommandTypes.PURCHASE;
  const blocked = check => check?.Success !== true || check.InQueue || check.InProgress ||
    check.RepairDamaged || check.AlreadyExists || check.InsufficientFunds;
  if (kind === "building") {
    // Native plot lists belong to the coordinate-free check; selecting X/Y
    // returns permission/cost for that tile but can omit both plot lists.
    const generalArgs = {[parameter]: def.$hash,
      ...(mode === "append" ? {InsertMode: CityOperationsParametersValues.Append} : {})};
    const general = api.canStart(city.id, operation, generalArgs, false);
    if (blocked(general) || ![...(general.Plots ?? []), ...(general.ExpandUrbanPlots ?? [])].includes(plot)) {
      return reject("Requested building tile is not in the native legal plots", general?.FailureReasons ?? []);
    }
  }
  const check = api.canStart(city.id, operation, args, false);
  if (blocked(check)) {
    return reject("Native construction check failed or requires an unsupported repair/existing order", check?.FailureReasons ?? []);
  }
  const cost = mode === "purchase" ? check.Cost : null;
  if (mode === "purchase" && (!Number.isFinite(cost) || cost < 0 || cost > cap ||
      !Number.isFinite(before.gold) || before.gold < cost)) return {...reject("Purchase quote or Gold balance is missing, insufficient or over cap"), quotedGoldCost: cost ?? null};
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      city.id.owner !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      JSON.stringify(city.BuildQueue.getQueue()) !== JSON.stringify(before.queue) ||
      (mode === "purchase" && (!Number.isFinite(player.Treasury.goldBalance) || player.Treasury.goldBalance < cost))) return reject("Game context, queue or balance changed during validation");
  const verificationArguments = {...queryArguments, city_id: city.id.id,
    baseline_queue: before.queue, baseline_asset_ids: before.assetIds};
  api.sendRequest(city.id, operation, args);
  return {status: "submitted", cityId: city.id.id, item, kind, quotedGoldCost: cost, before,
    expected: {cityId: city.id.id, item, [mode === "append" ? "queueAppendObserved" : "purchaseObserved"]: true},
    verificationArguments};
})()
