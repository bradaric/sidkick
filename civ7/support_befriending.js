(() => {
  const {event_id: eventId, target_player_id: targetId, max_influence_cost: cap, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  const action = "DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN";
  if (![eventId, targetId, expectedTurn].every(v => Number.isInteger(v) && v >= 0) ||
      typeof cap !== "number" || !Number.isFinite(cap) || cap < 0) return reject("Exact own befriending event/target, Influence cap and expected turn required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0 || targetId === playerId) return reject("Local player and foreign independent required");
  const player = Players.get(playerId), age = Game.age;
  const ready = () => UI.isInGame() === true && Configuration.getGame().isAnyMultiplayer === false &&
    Configuration.getUser().isAutoEndTurn === false && GameContext.localPlayerID === playerId &&
    Game.turn === expectedTurn && Game.age === age && player?.isTurnActive === true &&
    GameContext.hasSentTurnComplete() === false &&
    (player.Diplomacy.hasMet(targetId) === true || Game.IndependentPowers.independentVillageDiscoveredByPlayer(targetId, playerId) === true) &&
    Players.get(targetId)?.isIndependent === true && player.Diplomacy.isAtWarWith(targetId) === false;
  if (!ready()) return reject("Fresh active single-player turn, disabled auto-end-turn and peaceful known independent required");
  const def = GameInfo.DiplomacyActions.lookup(action);
  if (def?.DiplomacyActionType !== action || !Number.isInteger(def.$hash)) return reject("Native befriending definition unavailable");
  function capture() {
    const rows = Game.Diplomacy.getPlayerEvents(targetId);
    if (!Array.isArray(rows)) return null;
    const matches = rows.filter(e => e.uniqueID === eventId), e = matches.length === 1 ? matches[0] : null;
    if (!e || e.initialPlayer !== playerId || e.targetPlayer !== targetId || e.actionType !== def.$hash ||
        e.actionTypeName !== action || e.hidden !== false || e.revealed !== true || e.failed !== false ||
        e.gameTurnEnd !== -1 || !Number.isInteger(e.gameTurnStart) || e.gameTurnStart < 0 ||
        e.gameTurnStart > expectedTurn || Game.Diplomacy.isProjectCanceled(eventId) !== false) return null;
    const tokens = Game.Diplomacy.getNumSupportEnvoysForPlayer(eventId, playerId);
    if (!Number.isInteger(tokens) || tokens < 0 || ![e.progressScore, e.completionScore, e.support].every(Number.isFinite) ||
        e.progressScore < 0 || e.completionScore <= e.progressScore || e.support < 0) return null;
    return {startTurn: e.gameTurnStart, progress: e.progressScore, requiredProgress: e.completionScore, support: e.support, tokens};
  }
  const source = capture(), gold = player.Treasury?.goldBalance, influence = player.DiplomacyTreasury?.diplomacyBalance;
  if (!source) return reject("Exact unique revealed active local befriending project required");
  const quote = () => Game.Diplomacy.getInfluenceForNextSupport(eventId, playerId, true), cost = quote();
  if (![cost, gold, influence].every(Number.isFinite) || cost < 0 || cost > cap || influence < cost)
    return reject("Native next-support quote must be known, affordable and within the Influence cap");
  const args = {ID: eventId, Type: DiplomacyTokenTypes.DIPLOMACY_TOKEN_GLOBAL, Amount: 1, SubType: true};
  const operation = PlayerOperationTypes.SUPPORT_DIPLOMATIC_ACTION;
  if (!Number.isInteger(operation) || !Number.isInteger(args.Type)) return reject("Native support operation/token unavailable");
  const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true || check.InsufficientFunds === true)
    return reject("Native befriending support blocked or requires confirmation", check?.FailureReasons ?? []);
  if (!ready() || JSON.stringify(capture()) !== JSON.stringify(source) || quote() !== cost ||
      player.Treasury.goldBalance !== gold || player.DiplomacyTreasury.diplomacyBalance !== influence)
    return reject("Befriending project, support, quote, balances or game context changed");
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", quotedInfluenceCost: cost,
    before: {turn: expectedTurn, age, playerId, eventId, targetId, ...source, gold, influence},
    expected: {befriendingSupportApplied: true},
    verificationArguments: {event_id: eventId, target_player_id: targetId, action_type: def.$hash,
      start_turn: source.startTurn, before_progress: source.progress, required_progress: source.requiredProgress,
      expected_tokens: source.tokens + 1, before_gold: gold, expected_influence: influence - cost},
    verificationScope: "One own support-token increment on the exact ongoing befriending project, exact capped Influence debit, unchanged Gold and progress in the same turn/Age/player. Reports native updated rate/ETA, not a guaranteed race win or complete rival/relationship effects. No turn advancement or retry"};
})()
