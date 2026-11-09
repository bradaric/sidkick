(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, a = queryArguments, TYPE = "NOTIFICATION_CHOOSE_SYNCRETISM";
  if (!Number.isInteger(playerId) || playerId < 0 || ![a.notification_id, a.component_type, a.added_on_turn].every(v => Number.isInteger(v) && v >= 0) ||
      ![a.civilization_hash, a.choice_type].every(Number.isInteger) || typeof a.civilization !== "string" ||
      ![a.before_gold, a.before_influence].every(Number.isFinite)) throw Error("Invalid captured Syncretism identity/baseline");
  const flags = {units: SyncreticChoiceTypes.SYNCRETIC_CHOICE_UNITS, infrastructure: SyncreticChoiceTypes.SYNCRETIC_CHOICE_INFRASTRUCTURE, self: SyncreticChoiceTypes.SYNCRETIC_CHOICE_SELF};
  if (!Object.hasOwn(flags, a.kind) || flags[a.kind] !== a.choice_type) throw Error("Captured Syncretism family changed");
  const player = Players.get(playerId), civ = GameInfo.Civilizations.lookup(a.civilization_hash);
  const chosenCiv = player.Identity.getSyncreticCivType(), chosenKind = player.Identity.getSyncreticChoiceType();
  const inventory = Game.Notifications.getIdsForPlayer(playerId);
  if (!Array.isArray(inventory)) throw Error("Syncretism notification inventory unavailable");
  const captured = inventory.filter(id => id.owner === playerId && id.id === a.notification_id);
  let capturedCleared = captured.length === 0, pending = false;
  if (captured.length === 1 && captured[0].type === a.component_type && Game.Notifications.getTypeName(Game.Notifications.getType(captured[0])) === TYPE) {
    const n = Game.Notifications.find(captured[0]);
    capturedCleared = Boolean(n && n.AddedOnTurn === a.added_on_turn && (n.Dismissed === true || n.Expired === true));
  }
  for (const id of inventory) {
    if (id.owner !== playerId || Game.Notifications.getTypeName(Game.Notifications.getType(id)) !== TYPE) continue;
    const n = Game.Notifications.find(id);
    if (typeof n?.Dismissed !== "boolean" || typeof n?.Expired !== "boolean") throw Error("Syncretism reminder state unknown");
    if (!n.Dismissed && !n.Expired) pending = true;
  }
  const balancesUnchanged = player.Treasury?.goldBalance === a.before_gold && player.DiplomacyTreasury?.diplomacyBalance === a.before_influence;
  return {turn: Game.turn, age: Game.age, playerId, chosenCivilizationHash: chosenCiv, chosenChoiceType: chosenKind,
    capturedReminderCleared: capturedCleared, pending, balancesUnchanged,
    syncretismObserved: civ?.CivilizationType === a.civilization && civ.$hash === a.civilization_hash &&
      chosenCiv === a.civilization_hash && chosenKind === a.choice_type && capturedCleared && !pending && balancesUnchanged};
})()
