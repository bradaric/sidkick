(() => {
  const {mode, settlement, focus, x, y, max_gold_cost: cap, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (!["focus", "upgrade", "specialist"].includes(mode) || typeof settlement !== "string" || !settlement.trim() ||
      !Number.isInteger(expectedTurn) || expectedTurn < 0 ||
      (mode === "focus" && (typeof focus !== "string" || !focus)) ||
      (mode === "upgrade" && (!Number.isFinite(cap) || cap < 0)) ||
      (mode === "specialist" && [x, y].some(v => !Number.isInteger(v) || v < 0))) return reject("Invalid settlement-management arguments");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const matches = player.Cities.getCities().filter(c => c.id.owner === playerId && Locale.compose(c.name).toLowerCase() === settlement.toLowerCase());
  if (matches.length !== 1) return reject("No unique owned settlement matches this name");
  const city = matches[0];
  const currentFocus = city.isTown !== true ? null : city.Growth.growthType === GrowthTypes.EXPAND ? "GROWTH"
    : GameInfo.Projects.lookup(city.Growth.projectType)?.ProjectType ?? null;
  const before = {turn: Game.turn, age: Game.age, playerId, cityId: city.id.id,
    isTown: city.isTown, focus: currentFocus, pendingPopulation: city.pendingPopulation,
    gold: player.Treasury?.goldBalance ?? null};
  let api = Game.CityCommands, operation, subject = city.id, args, expected, cost = null;
  if (mode === "focus") {
    if (city.isTown !== true) return reject("Town focus requires a town");
    if (focus !== "GROWTH" && GameInfo.Projects.lookup(focus)?.ProjectType !== focus) return reject("An exact offered town-focus type ID is required");
    if (focus === currentFocus) return {status: "already_active", before};
    let project = ProjectTypes.NO_PROJECT, type = GrowthTypes.EXPAND;
    if (focus !== "GROWTH") {
      const offered = api.canStart(city.id, CityCommandTypes.CHANGE_GROWTH_MODE, {Type: GrowthTypes.PROJECT}, false);
      const choices = (offered?.Projects ?? []).map(index => GameInfo.Projects.lookup(index)).filter(def => def?.ProjectType === focus);
      if (choices.length !== 1 || !Number.isInteger(choices[0].$hash)) return reject("No unique offered town focus matches this ID");
      project = choices[0].$hash; type = GrowthTypes.PROJECT;
    }
    operation = CityCommandTypes.CHANGE_GROWTH_MODE;
    args = {Type: type, ProjectType: project, City: city.id.id};
    expected = {cityId: city.id.id, isTown: true, focus};
  } else if (mode === "upgrade") {
    if (city.isTown === false) return {status: "already_active", before};
    if (city.isTown !== true) return reject("Town status is unverified");
    cost = city.Gold.getTownUpgradeCost();
    if (!Number.isFinite(cost) || cost < 0 || cost > cap || !Number.isFinite(before.gold) || before.gold < cost) return reject("Town upgrade quote or Gold balance is missing, insufficient or over cap");
    operation = CityCommandTypes.PURCHASE;
    args = {Directive: OrderTypes.ORDER_TOWN_UPGRADE};
    expected = {cityId: city.id.id, isTown: false};
  } else {
    if (city.isTown !== false || city.Growth.isReadyToPlacePopulation !== true ||
        !Number.isInteger(city.pendingPopulation) || city.pendingPopulation < 1) return reject("A city with ready pending population is required");
    if (x >= GameplayMap.getGridWidth() || y >= GameplayMap.getGridHeight() ||
        GameplayMap.getRevealedState(playerId, x, y) === RevealedStates.HIDDEN) return reject("A revealed owned specialist tile is required");
    const plot = GameplayMap.getIndexFromLocation({x, y});
    const placements = (city.Workers.GetAllPlacementInfo() ?? []).filter(p => p.PlotIndex === plot);
    if (placements.length !== 1 || placements[0].IsBlocked || !Number.isInteger(placements[0].NumWorkers) ||
        !Number.isInteger(placements[0].MaxWorkers) || placements[0].NumWorkers < 0 ||
        placements[0].NumWorkers >= placements[0].MaxWorkers) return reject("No unique unblocked specialist slot has free capacity");
    before.workerCount = placements[0].NumWorkers;
    api = Game.PlayerOperations; operation = PlayerOperationTypes.ASSIGN_WORKER; subject = playerId;
    args = {Location: plot, Amount: 1};
    expected = {cityId: city.id.id, isTown: false, location: {x, y}, workerCount: before.workerCount + 1,
      pendingPopulation: before.pendingPopulation - 1};
  }
  const check = api.canStart(subject, operation, args, false);
  if (check?.Success !== true || check.InsufficientFunds) return reject("Native settlement action check failed", check?.FailureReasons ?? []);
  if (mode === "upgrade" && ((check.Cost != null && check.Cost !== cost) || city.Gold.getTownUpgradeCost() !== cost ||
      !Number.isFinite(player.Treasury.goldBalance) || player.Treasury.goldBalance < cost)) return reject("Town upgrade quote or balance changed during validation");
  if (mode === "specialist") {
    const current = (city.Workers.GetAllPlacementInfo() ?? []).filter(p => p.PlotIndex === args.Location);
    if (city.Growth.isReadyToPlacePopulation !== true || city.pendingPopulation !== before.pendingPopulation ||
        current.length !== 1 || current[0].IsBlocked || current[0].NumWorkers !== before.workerCount ||
        current[0].NumWorkers >= current[0].MaxWorkers) return reject("Specialist slot or pending population changed during validation");
  }
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      city.id.owner !== playerId || city.isTown !== before.isTown || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false) return reject("Game context changed during validation");
  const verificationArguments = {...queryArguments, city_id: city.id.id};
  api.sendRequest(subject, operation, args);
  return {status: "submitted", before, expected, quotedGoldCost: cost, verificationArguments};
})()
