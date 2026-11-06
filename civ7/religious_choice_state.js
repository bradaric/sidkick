(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId), r = player?.Religion;
  if (!Number.isInteger(playerId) || playerId < 0 || !r) throw Error("No local player");
  const {expected_pantheons: p, expected_beliefs: b, expected_religion: religion, expected_founded: founded = queryArguments.kind !== "pantheon"} = queryArguments;
  if (![p, b].every(a => Array.isArray(a) && a.every(Number.isInteger)) || typeof founded !== "boolean" || (religion !== null && typeof religion !== "string")) throw Error("Invalid captured religious selections");
  const pantheons = r.getPantheons(), beliefs = r.getBeliefs();
  if (![pantheons, beliefs].every(a => Array.isArray(a) && a.every(Number.isInteger))) throw Error("Local religious selections are unknown");
  const currentReligion = r.hasCreatedReligion() ? GameInfo.Religions.lookup(r.getReligionType())?.ReligionType ?? null : null;
  return {turn: Game.turn, age: Game.age, playerId, pantheons, beliefs, religion: currentReligion,
    choiceObserved: r.hasCreatedReligion() === founded && currentReligion === religion &&
      JSON.stringify([...pantheons].sort((a, b) => a - b)) === JSON.stringify(p) && JSON.stringify([...beliefs].sort((a, b) => a - b)) === JSON.stringify(b)};
})()
