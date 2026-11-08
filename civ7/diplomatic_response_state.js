(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0 || !Players.get(playerId)) throw Error("No local player");
  const {action_id: actionId, initial_player: initial, action} = queryArguments;
  if (![actionId, initial].every(v => Number.isInteger(v) && v >= 0) || typeof action !== "string" || !action) throw Error("Invalid submitted diplomatic response identity");
  const events = (Game.Diplomacy.getPlayerEvents(playerId) ?? []).filter(e => e.uniqueID === actionId);
  if (events.length !== 1 || events[0].initialPlayer !== initial || events[0].targetPlayer !== playerId ||
      events[0].actionTypeName !== action || events[0].hidden !== false || events[0].revealed !== true) throw Error("Submitted incoming event identity is unavailable or changed");
  const event = events[0], names = new Map([[DiplomaticResponseTypes.DIPLOMACY_RESPONSE_ACCEPT, "accept"],
    [DiplomaticResponseTypes.DIPLOMACY_RESPONSE_SUPPORT, "support"], [DiplomaticResponseTypes.DIPLOMACY_RESPONSE_REJECT, "reject"]]);
  const baseline=queryArguments.hostile_baseline,player=Players.get(playerId);
  if(baseline!==undefined&&(!baseline||![baseline.gold,baseline.influence].every(Number.isFinite)||typeof baseline.atWar!=="boolean"||typeof baseline.allied!=="boolean"))throw Error("Invalid captured hostile response balance/diplomacy baseline");
  return {turn: Game.turn, age: Game.age, playerId, actionId, initialPlayer: initial, action,
    ...(baseline?{hostileResponseApplied:names.has(event.responseType)&&player.Diplomacy.hasMet(initial)===true&&player.Diplomacy.isAtWarWith(initial)===baseline.atWar&&player.Diplomacy.hasAllied(initial)===baseline.allied&&player.Treasury?.goldBalance===baseline.gold&&player.DiplomacyTreasury?.diplomacyBalance===baseline.influence}:{}),
    response: names.get(event.responseType) ?? null, turnEnded: event.gameTurnEnd,
    influence: Players.get(playerId).DiplomacyTreasury?.diplomacyBalance ?? null};
})()
