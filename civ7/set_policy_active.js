(() => {
  const {policy, active, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", policy, active, reason, failureReasons});
  if (typeof policy !== "string" || !policy.trim() || typeof active !== "boolean" ||
      !Number.isInteger(expectedTurn) || expectedTurn < 0) {
    return reject("An exact policy ID, boolean active flag and nonnegative expected turn are required");
  }
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) {
    return reject("The local player's turn must be active and not completed");
  }
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale; read policies again");
  const culture = player.Culture;
  const slot = CultureSlotTypes.POLICY_CULTURE_SLOT;
  const definition = GameInfo.Traditions.lookup(policy);
  if (definition?.TraditionType !== policy || definition.CultureSlotType !== "POLICY_CULTURE_SLOT" ||
      !Number.isInteger(definition.$index)) return reject("Only exact ordinary-policy IDs are supported");
  const offered = culture.getUnlockedTraditions(slot).find(type =>
    GameInfo.Traditions.lookup(type)?.TraditionType === policy);
  if (!Number.isInteger(offered)) return reject("Policy is not unlocked for the local player");
  function activeIds(type) {
    const values = culture.getActiveTraditions(type);
    if (!Array.isArray(values)) throw Error("Active policy inventory is unavailable");
    const ids = values.map(value => {
      const id = GameInfo.Traditions.lookup(value)?.TraditionType;
      if (typeof id !== "string") throw Error("Active policy identity is unavailable");
      return id;
    });
    if (new Set(ids).size !== ids.length) throw Error("Active policy inventory is ambiguous");
    return ids.sort();
  }
  const before = {turn: Game.turn, age: Game.age, playerId,
    activePolicies: activeIds(slot),
    activeTraditions: activeIds(CultureSlotTypes.TRADITION_CULTURE_SLOT),
    activeCrises: activeIds(CultureSlotTypes.CRISIS_CULTURE_SLOT)};
  if (before.activeTraditions.includes(policy) || before.activeCrises.includes(policy)) {
    return reject("Cards outside ordinary policy slots are not supported");
  }
  if (before.activePolicies.includes(policy) === active) {
    return {status: active ? "already_active" : "already_inactive", policy, active, before};
  }
  if (culture.canSwapCultureSlot(slot) !== true) return reject("Ordinary policy changes are currently locked");
  if (active) {
    const capacity = culture.getNumCultureSlots(slot);
    if (!Number.isInteger(capacity) || before.activePolicies.length >= capacity) {
      return reject("No known empty ordinary policy slot; automatic swaps and tradition-slot fallback are unsupported");
    }
  }
  const args = {TraditionType: definition.$index,
    Action: active ? PlayerOperationParameters.Activate : PlayerOperationParameters.Deactivate};
  const operation = PlayerOperationTypes.CHANGE_TRADITION;
  const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
  if (check?.Success !== true) return reject("Native policy change check failed", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      culture.canSwapCultureSlot(slot) !== true) return reject("Game context changed during validation");
  const expected = {
    activePolicies: (active ? [...before.activePolicies, policy] : before.activePolicies.filter(id => id !== policy)).sort(),
    activeTraditions: before.activeTraditions,
    activeCrises: before.activeCrises
  };
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", policy, active, before, expected};
})()
