(() => {
  const {kind, choice_id: choiceId, expected_turn: expectedTurn, confirm_unit_replacements: confirmReplacements} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (!["units", "infrastructure", "self"].includes(kind) || !Number.isInteger(choiceId) || choiceId === -1 ||
      choiceId < -2147483648 || choiceId > 2147483647 || !Number.isInteger(expectedTurn) || expectedTurn < 0 ||
      typeof confirmReplacements !== "boolean") return reject("Exact offered Syncretism kind, signed choice ID, expected turn and replacement acknowledgement required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId), age = Game.age, TYPE = "NOTIFICATION_CHOOSE_SYNCRETISM";
  const ready = () => UI.isInGame() === true && Configuration.getGame().isAnyMultiplayer === false &&
    Configuration.getUser().isAutoEndTurn === false && GameContext.localPlayerID === playerId && Game.age === age &&
    Game.turn === expectedTurn && player?.isTurnActive === true && GameContext.hasSentTurnComplete() === false;
  if (!ready()) return reject("Fresh active single-player turn with auto-end-turn disabled required");
  const [flag, operation, getter] = {
    units: [SyncreticChoiceTypes.SYNCRETIC_CHOICE_UNITS, PlayerOperationTypes.CHOOSE_SYNCRETISM_UNITS, "getUnitChoiceSyncreticUnlocks"],
    infrastructure: [SyncreticChoiceTypes.SYNCRETIC_CHOICE_INFRASTRUCTURE, PlayerOperationTypes.CHOOSE_SYNCRETISM_INFRASTRUCTURE, "getInfrastructureChoiceSyncreticUnlocks"],
    self: [SyncreticChoiceTypes.SYNCRETIC_CHOICE_SELF, PlayerOperationTypes.CHOOSE_SYNCRETISM_SELF, "getSelfChoiceSyncreticUnlocks"]
  }[kind];
  if (![flag, operation].every(Number.isInteger)) return reject("Native Syncretism operation unavailable");
  function capture() {
    if (player.Identity.getSyncreticCivType() !== -1 || player.Identity.getSyncreticChoiceType() !== -1) return null;
    const inventory = Game.Notifications.getIdsForPlayer(playerId);
    if (!Array.isArray(inventory)) return null;
    const pending = [];
    for (const id of inventory) {
      if (id.owner !== playerId || Game.Notifications.getTypeName(Game.Notifications.getType(id)) !== TYPE) continue;
      const n = Game.Notifications.find(id);
      if (!n || typeof n.Dismissed !== "boolean" || typeof n.Expired !== "boolean" ||
          !Number.isInteger(n.AddedOnTurn) || n.AddedOnTurn < 0 || n.AddedOnTurn > expectedTurn) return null;
      if (!n.Dismissed && !n.Expired) pending.push({id: id.id, type: id.type, addedOnTurn: n.AddedOnTurn});
    }
    if (pending.length !== 1 || ![pending[0].id, pending[0].type].every(v => Number.isInteger(v) && v >= 0) ||
        inventory.filter(id => id.owner === playerId && id.id === pending[0].id).length !== 1) return null;
    const offered = Game.Unlocks.getSyncreticCivUnlocksForChoice(playerId, flag);
    if (!Array.isArray(offered) || offered.filter(value => value === choiceId).length !== 1) return null;
    const trait = GameInfo.LegacyCivilizationTraits.lookup(choiceId), civ = trait && GameInfo.Civilizations.lookup(trait.CivilizationType);
    if (trait?.$hash !== choiceId || !civ || civ.CivilizationType !== trait.CivilizationType || !Number.isInteger(civ.$hash) || civ.$hash === -1) return null;
    const unlocks = Game.Unlocks[getter](civ.CivilizationType);
    if (!Array.isArray(unlocks) || !unlocks.length || unlocks.length > 128 || unlocks.some(r =>
      !["KIND_UNIT", "KIND_CONSTRUCTIBLE", "KIND_QUARTER", "KIND_TRADITION", "KIND_CULTURE_SLOT"].includes(r.kind) ||
      !Number.isInteger(r.typeHash) || r.typeHash === -1)) return null;
    return {notification: pending[0], civilization: civ.CivilizationType, civilizationHash: civ.$hash,
      rewards: unlocks.map(r => ({kind: r.kind, typeHash: r.typeHash}))};
  }
  const source = capture(), gold = player.Treasury?.goldBalance, influence = player.DiplomacyTreasury?.diplomacyBalance;
  if (!source || ![gold, influence].every(Number.isFinite)) return reject("One exact pending owned choice, no prior selection, offered reward identity and known balances required");
  const args = {CivilizationType: choiceId}; // Native argument is the offered legacy-trait hash, not civ.$hash.
  function permission() {
    const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
    if (check?.Success !== true || check.RequiresConfirmation === true || check.InsufficientFunds === true ||
        check.Cost != null && check.Cost !== 0) return null;
    const units = check.Units ?? [], descriptions = check.AdditionalDescription ?? [];
    if (!Array.isArray(units) || !Array.isArray(descriptions) || units.some(v => !Number.isInteger(v)) ||
        descriptions.some(v => typeof v !== "string")) return null;
    return {units: [...units], descriptions: [...descriptions]};
  }
  const check = permission();
  if (!check) return reject("Native Syncretism choice is blocked, costly or requires confirmation");
  if (!confirmReplacements && (kind === "units" || source.rewards.some(r => r.kind === "KIND_UNIT") || check.units.length || check.descriptions.length))
    return reject("Explicit confirm_unit_replacements=true required after reviewing native rewards/replacement warnings");
  const latestCheck = permission();
  if (!ready() || JSON.stringify(capture()) !== JSON.stringify(source) || JSON.stringify(latestCheck) !== JSON.stringify(check) ||
      player.Treasury.goldBalance !== gold || player.DiplomacyTreasury.diplomacyBalance !== influence)
    return reject("Pending choice, offers, rewards, replacement warnings, balances or game context changed");
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", before: {turn: expectedTurn, age, playerId, kind, choiceId, ...source, gold, influence},
    expected: {syncretismObserved: true},
    verificationArguments: {kind, civilization: source.civilization, civilization_hash: source.civilizationHash,
      choice_type: flag, notification_id: source.notification.id, component_type: source.notification.type,
      added_on_turn: source.notification.addedOnTurn, before_gold: gold, before_influence: influence},
    verificationScope: "Exact chosen civilization and Syncretism family, captured reminder cleared and no active Syncretism reminder, unchanged Gold/Influence in the same turn/Age/player. Not complete unlock/replacement/yield accounting or popup closure. No separate Tradition-slotting request, turn advancement or retry"};
})()
