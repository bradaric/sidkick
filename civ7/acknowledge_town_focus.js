(() => {
  const {notification_id: notificationId, component_type: componentType, expected_turn: expectedTurn} = queryArguments;
  const TYPE = "NOTIFICATION_CHOOSE_TOWN_PROJECT", reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (![notificationId, componentType, expectedTurn].every(v => Number.isInteger(v) && v >= 0)) return reject("Exact Town reminder component and expected turn required");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  const ready = () => UI.isInGame() === true && Configuration.getGame().isAnyMultiplayer === false &&
    Configuration.getUser().isAutoEndTurn === false && GameContext.localPlayerID === playerId &&
    player?.isTurnActive === true && GameContext.hasSentTurnComplete() === false && Game.turn === expectedTurn;
  if (!ready()) return reject("Fresh active single-player turn with auto-end-turn disabled required");
  const same = (a, b) => a?.owner === b?.owner && a?.id === b?.id && a?.type === b?.type;
  function capture() {
    const inventory = Game.Notifications.getIdsForPlayer(playerId);
    if (!Array.isArray(inventory)) return null;
    const ids = inventory.filter(id => id.owner === playerId && id.id === notificationId);
    if (ids.length !== 1 || ids[0].type !== componentType) return null;
    const n = Game.Notifications.find(ids[0]), type = Game.Notifications.getType(ids[0]);
    if (!n || n.Type !== type || Game.Notifications.getTypeName(type) !== TYPE ||
        typeof n.Dismissed !== "boolean" || typeof n.Expired !== "boolean" ||
        !Number.isInteger(n.AddedOnTurn) || n.AddedOnTurn < 0 || n.AddedOnTurn > Game.turn ||
        n.Target?.owner !== playerId || ![n.Target.id, n.Target.type].every(v => Number.isInteger(v) && v >= 0)) return null;
    const towns = player.Cities.getCities().filter(city => city.id.owner === playerId && same(city.id, n.Target));
    if (towns.length !== 1 || towns[0].isTown !== true) return null;
    const town = towns[0], gold = player.Treasury?.goldBalance;
    if (![town.Growth?.growthType, town.Growth?.projectType].every(Number.isInteger) || !Number.isFinite(gold)) return null;
    const pending = !n.Dismissed && !n.Expired;
    // The native operation targets a Town, so reject ambiguous multiple reminders for it.
    if (pending && inventory.filter(id => {
      if (id.owner !== playerId || Game.Notifications.getTypeName(Game.Notifications.getType(id)) !== TYPE) return false;
      const other = Game.Notifications.find(id);
      return other && other.Dismissed !== true && other.Expired !== true && same(other.Target, town.id);
    }).length !== 1) return null;
    return {notificationId, componentType, notificationType: TYPE, addedOnTurn: n.AddedOnTurn,
      townId: town.id.id, townComponentType: town.id.type, townName: Locale.compose(town.name),
      growthType: town.Growth.growthType, projectType: town.Growth.projectType, gold, pending};
  }
  const state = capture();
  if (!state) return reject("Reminder identity/type, unique owned Town, current focus or Gold is unverified");
  const before = {turn: Game.turn, age: Game.age, playerId, ...state};
  if (!state.pending) return {status: "already_active", before};
  const town = {owner: playerId, id: state.townId, type: state.townComponentType};
  const operation = CityOperationTypes.CONSIDER_TOWN_PROJECT;
  if (!Number.isInteger(operation)) return reject("Native Town-consider operation unavailable");
  const check = Game.CityOperations.canStart(town, operation, {}, false);
  if (check?.Success !== true || check.RequiresConfirmation === true || check.InsufficientFunds === true ||
      check.Cost != null && check.Cost !== 0) return reject("Native Town acknowledgement is blocked, costly or requires confirmation", check?.FailureReasons ?? []);
  const latest = capture();
  if (!ready() || Game.age !== before.age || !latest || JSON.stringify(latest) !== JSON.stringify(state)) return reject("Town reminder, focus, Gold or game context changed during validation");
  Game.CityOperations.sendRequest(town, operation, {});
  return {status: "submitted", before,
    expected: {notificationId, componentType, townId: state.townId, townComponentType: state.townComponentType,
      acknowledged: true, focusUnchanged: true, goldUnchanged: true},
    verificationArguments: {notification_id: notificationId, component_type: componentType, town_id: state.townId,
      town_component_type: state.townComponentType, added_on_turn: state.addedOnTurn,
      before_growth_type: state.growthType, before_project_type: state.projectType, before_gold: state.gold},
    verificationScope: "Exact Town reminder clearance and unchanged owned Town growth/project mode and Gold; not popup closure or removal of other turn blockers"};
})()
