(() => {
  const {mode, selection, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (!["government", "celebration", "resource_review", "policy_review"].includes(mode) ||
      !Number.isInteger(expectedTurn) || expectedTurn < 0 ||
      (["government", "celebration"].includes(mode) && (typeof selection !== "string" || !selection.trim()))) return reject("Invalid mandatory choice arguments");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const hasNotification = type => (Game.Notifications.getIdsForPlayer(playerId) ?? []).some(id => {
    if (id.owner !== playerId) return false;
    const n = Game.Notifications.find(id);
    return n && !n.Dismissed && !n.Expired && Game.Notifications.getTypeName(Game.Notifications.getType(id)) === type;
  });
  const before = {turn: Game.turn, age: Game.age, playerId};
  let operation, args, expected, pending;
  if (mode === "government") {
    const currentType = player.Culture.getGovernmentType();
    before.government = GameInfo.Governments.lookup(currentType)?.GovernmentType ?? null;
    pending = () => player.Culture.getGovernmentType() === -1 || hasNotification("NOTIFICATION_CHOOSE_GOVERNMENT");
    before.governmentPending = pending();
    const age = GameInfo.Ages.lookup(Game.age)?.AgeType;
    const def = GameInfo.Governments.lookup(selection);
    if (!def || def.GovernmentType !== selection || !Number.isInteger(def.$index) ||
        !GameInfo.StartingGovernments.filter(g => g.AgeType === age && g.GovernmentType === selection).length) return reject("An exact current-Age government picker ID is required");
    if (!before.governmentPending) return before.government === selection ? {status: "already_active", before} : reject("No government choice is pending");
    operation = PlayerOperationTypes.CHANGE_GOVERNMENT;
    args = {GovernmentType: def.$index, Action: PlayerOperationParameters.Activate};
    expected = {government: selection, governmentPending: false};
  } else if (mode === "celebration") {
    pending = () => hasNotification("NOTIFICATION_CHOOSE_GOLDEN_AGE") || player.Happiness?.canChoose() === true;
    before.celebrationPending = pending();
    before.celebration = player.Happiness?.isInGoldenAge() === true
      ? GameInfo.GoldenAges.lookup(player.Happiness.getCurrentGoldenAge())?.GoldenAgeType ?? null : null;
    const def = GameInfo.GoldenAges.lookup(selection);
    if (!def || def.GoldenAgeType !== selection || !(player.Culture.getGoldenAgeChoices() ?? [])
      .some(type => GameInfo.GoldenAges.lookup(type)?.GoldenAgeType === selection)) return reject("An exact offered celebration ID is required");
    if (!before.celebrationPending) return before.celebration === selection ? {status: "already_active", before} : reject("No celebration choice is pending");
    operation = PlayerOperationTypes.CHOOSE_GOLDEN_AGE;
    args = {GoldenAgeType: Database.makeHash(selection)};
    expected = {celebration: selection, celebrationPending: false};
  } else {
    const policyReview = mode === "policy_review";
    const field = policyReview ? "policyReviewPending" : "resourceReviewPending";
    pending = policyReview ? () => hasNotification("NOTIFICATION_TRADITIONS_AVAILABLE") || hasNotification("NOTIFICATION_CRISIS")
      : () => hasNotification("NOTIFICATION_ASSIGN_NEW_RESOURCES");
    before[field] = pending();
    if (!before[field]) return {status: "already_active", before};
    operation = policyReview ? PlayerOperationTypes.CONSIDER_ASSIGN_TRADITIONS : PlayerOperationTypes.CONSIDER_ASSIGN_RESOURCE;
    args = {};
    expected = {[field]: false};
  }
  const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
  if (check?.Success !== true) return reject("Native mandatory choice check failed", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || !pending()) return reject("Choice or game context changed during validation");
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", before, expected};
})()
