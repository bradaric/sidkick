(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, a = queryArguments;
  if (!Number.isInteger(playerId) || playerId < 0 ||
      ![a.event_id, a.target_player_id, a.start_turn, a.expected_tokens].every(v => Number.isInteger(v) && v >= 0) ||
      !Number.isInteger(a.action_type) || ![a.before_progress, a.required_progress, a.before_gold, a.expected_influence].every(Number.isFinite))
    throw Error("Invalid captured befriending support identity/baseline");
  const player = Players.get(playerId), rows = Game.Diplomacy.getPlayerEvents(a.target_player_id);
  if (!Array.isArray(rows)) throw Error("Befriending inventory unavailable");
  const matches = rows.filter(e => e.uniqueID === a.event_id), e = matches.length === 1 ? matches[0] : null;
  const preserved = Boolean(e && e.initialPlayer === playerId && e.targetPlayer === a.target_player_id &&
    e.actionType === a.action_type && e.actionTypeName === "DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN" &&
    e.gameTurnStart === a.start_turn && e.gameTurnEnd === -1 && e.hidden === false && e.revealed === true && e.failed === false &&
    e.progressScore === a.before_progress && e.completionScore === a.required_progress &&
    Game.Diplomacy.isProjectCanceled(a.event_id) === false &&
    (player.Diplomacy.hasMet(a.target_player_id) === true || Game.IndependentPowers.independentVillageDiscoveredByPlayer(a.target_player_id, playerId) === true) &&
    Players.get(a.target_player_id)?.isIndependent === true && player.Diplomacy.isAtWarWith(a.target_player_id) === false);
  const tokens = preserved ? Game.Diplomacy.getNumSupportEnvoysForPlayer(a.event_id, playerId) : null;
  const completion = preserved ? Game.Diplomacy.getCompletionData(a.event_id) : null;
  return {turn: Game.turn, age: Game.age, playerId, eventId: a.event_id, supportTokens: tokens,
    progress: preserved ? e.progressScore : null, requiredProgress: preserved ? e.completionScore : null,
    progressPerTurn: completion?.progressPerTurn ?? null, turnsRemaining: completion?.turnsToCompletion ?? null,
    befriendingSupportApplied: preserved && tokens === a.expected_tokens && player.Treasury?.goldBalance === a.before_gold &&
      player.DiplomacyTreasury?.diplomacyBalance === a.expected_influence};
})()
