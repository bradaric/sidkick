(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, a = queryArguments, TYPE = "NOTIFICATION_CHOOSE_TOWN_PROJECT";
  if (!Number.isInteger(playerId) || playerId < 0 ||
      ![a.notification_id, a.component_type, a.town_id, a.town_component_type, a.added_on_turn].every(v => Number.isInteger(v) && v >= 0) ||
      ![a.before_growth_type, a.before_project_type].every(Number.isInteger) || !Number.isFinite(a.before_gold)) throw Error("Invalid captured Town reminder identity/focus");
  const player = Players.get(playerId), inventory = Game.Notifications.getIdsForPlayer(playerId);
  if (!Array.isArray(inventory)) throw Error("Town reminder inventory unavailable");
  const towns = player.Cities.getCities().filter(city => city.id.owner === playerId && city.id.id === a.town_id);
  if (towns.length !== 1 || towns[0].id.type !== a.town_component_type) throw Error("Owned Town identity changed");
  const town = towns[0], ids = inventory.filter(id => id.owner === playerId && id.id === a.notification_id);
  if (ids.length > 1 || ids.length === 1 && ids[0].type !== a.component_type) throw Error("Town reminder identity changed");
  let acknowledged = ids.length === 0;
  if (ids.length === 1) {
    const n = Game.Notifications.find(ids[0]), type = Game.Notifications.getType(ids[0]);
    if (!n || n.Type !== type || Game.Notifications.getTypeName(type) !== TYPE || n.AddedOnTurn !== a.added_on_turn ||
        n.Target?.owner !== playerId || n.Target.id !== a.town_id || n.Target.type !== a.town_component_type) throw Error("Town reminder type or target identity changed");
    acknowledged = n.Dismissed === true || n.Expired === true;
  }
  return {turn: Game.turn, age: Game.age, playerId, notificationId: a.notification_id, componentType: a.component_type,
    notificationType: TYPE, townId: a.town_id, townComponentType: a.town_component_type, acknowledged,
    focusUnchanged: town.isTown === true && town.Growth?.growthType === a.before_growth_type && town.Growth?.projectType === a.before_project_type,
    goldUnchanged: player.Treasury?.goldBalance === a.before_gold};
})()
