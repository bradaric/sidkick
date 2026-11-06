(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  const {target_kind: kind, target_player_id: targetId, action, baseline_event_ids: baseline} = queryArguments;
  if (!Number.isInteger(targetId) || targetId < 0 || targetId === playerId || !(player.Diplomacy.hasMet(targetId) ||
      kind === "independent" && Game.IndependentPowers?.independentVillageDiscoveredByPlayer(targetId, playerId) === true)) throw Error("A known foreign target is required");
  const target = Players.get(targetId);
  if (!target || (kind === "major" ? target.isMajor !== true : kind === "city-state" ? target.isMinor !== true : kind !== "independent" || target.isIndependent !== true)) throw Error("Target kind is unverified");
  const definition = GameInfo.DiplomacyActions.lookup(action);
  if (definition?.DiplomacyActionType !== action || !Number.isInteger(definition.$hash)) throw Error("Project identity is unavailable");
  if (!Array.isArray(baseline) || baseline.some(id => !Number.isInteger(id) || id < 0)) throw Error("Pre-submit event identities are required");
  const records = Game.Diplomacy.getPlayerEvents(targetId);
  if (!Array.isArray(records)) throw Error("Project event inventory is unavailable");
  const own = records.filter(event => event.initialPlayer === playerId && event.targetPlayer === targetId && event.actionType === definition.$hash);
  const eventIds = own.map(event => event.uniqueID);
  if (eventIds.some(id => !Number.isInteger(id) || id < 0) || new Set(eventIds).size !== eventIds.length) throw Error("Project event identity is unverified");
  const fresh = own.filter(event => !baseline.includes(event.uniqueID) && event.gameTurnStart === Game.turn &&
    event.gameTurnEnd === -1 && event.failed !== true);
  const newProjects = fresh.map(event => {
    const completion = Game.Diplomacy.getCompletionData(event.uniqueID);
    const remaining = completion?.turnsToCompletion;
    return {id: event.uniqueID, turnStarted: event.gameTurnStart,
      progress: Number.isFinite(event.progressScore) ? event.progressScore : null,
      turnsRemaining: Number.isFinite(remaining) && remaining >= 0 ? remaining : null};
  });
  return {turn: Game.turn, age: Game.age, playerId, targetPlayerId: targetId, targetKind: kind, action,
    eventIds: eventIds.sort((a, b) => a - b), newProjectObserved: newProjects.length === 1, newProjects,
    influence: player.DiplomacyTreasury?.diplomacyBalance ?? null};
})()
