(() => {
  const {card, active, slot, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  const groups = {policy: {type: CultureSlotTypes.POLICY_CULTURE_SLOT, native: "POLICY_CULTURE_SLOT", field: "activePolicies"},
    tradition: {type: CultureSlotTypes.TRADITION_CULTURE_SLOT, native: "TRADITION_CULTURE_SLOT", field: "activeTraditions"},
    crisis: {type: CultureSlotTypes.CRISIS_CULTURE_SLOT, native: "CRISIS_CULTURE_SLOT", field: "activeCrises"}};
  if (typeof card !== "string" || !card.trim() || typeof active !== "boolean" || !Object.hasOwn(groups, slot) ||
      !Number.isInteger(expectedTurn) || expectedTurn < 0) return reject("An exact card ID, boolean active flag, slot group and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const culture = player.Culture, group = groups[slot], def = GameInfo.Traditions.lookup(card);
  if (def?.TraditionType !== card || !Number.isInteger(def.$index) ||
      !(def.CultureSlotType === group.native || (def.CultureSlotType === "POLICY_CULTURE_SLOT" && slot === "tradition"))) return reject("Card type is incompatible with the requested slot");
  const ownGroup = Object.values(groups).find(g => g.native === def.CultureSlotType);
  const unlocked = culture.getUnlockedTraditions(ownGroup.type);
  if (!Array.isArray(unlocked) || unlocked.filter(type => GameInfo.Traditions.lookup(type)?.TraditionType === card).length !== 1) return reject("No unique local unlocked card matches this ID");
  function inventory() {
    const state = {}, all = [], capacities = {};
    for (const [key, g] of Object.entries(groups)) {
      const hashes = culture.getActiveTraditions(g.type), capacity = culture.getNumCultureSlots(g.type);
      if (!Array.isArray(hashes) || !Number.isInteger(capacity) || capacity < 0 || hashes.length > capacity) return null;
      const ids = hashes.map(h => GameInfo.Traditions.lookup(h)?.TraditionType);
      if (ids.some(id => typeof id !== "string")) return null;
      state[g.field] = ids.sort(); capacities[key] = capacity; all.push(...ids);
    }
    return new Set(all).size === all.length ? {...state, capacities} : null;
  }
  const snapshot = inventory();
  if (!snapshot) return reject("Card inventory or capacities are unverified or ambiguous");
  const before = {turn: Game.turn, age: Game.age, playerId, ...snapshot};
  if (Object.values(groups).some(g => g !== group && before[g.field].includes(card))) return reject("Card is active in a different slot group; remove it there explicitly first");
  if (before[group.field].includes(card) === active) return {status: active ? "already_active" : "already_inactive", before};
  if (culture.canSwapCultureSlot(group.type) !== true) return reject("Changes to this slot group are currently locked");
  if (active) {
    if (before[group.field].length >= before.capacities[slot]) return reject("No empty destination slot; implicit swaps or card migration are unsupported");
    if (slot === "tradition" && def.CultureSlotType === "POLICY_CULTURE_SLOT" &&
        before.activePolicies.length < before.capacities.policy) return reject("Native allocation would select an ordinary slot, not the requested tradition slot");
  }
  const args = {TraditionType: def.$index, Action: active ? PlayerOperationParameters.Activate : PlayerOperationParameters.Deactivate};
  const operation = PlayerOperationTypes.CHANGE_TRADITION;
  const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
  if (check?.Success !== true) return reject("Native card change check failed", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || culture.canSwapCultureSlot(group.type) !== true ||
      JSON.stringify(inventory()) !== JSON.stringify(snapshot)) return reject("Card inventory, capacity or game context changed during validation");
  const expected = Object.fromEntries(Object.values(groups).map(g => [g.field, g === group
    ? (active ? [...before[g.field], card] : before[g.field].filter(id => id !== card)).sort() : before[g.field]]));
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", before, expected};
})()
