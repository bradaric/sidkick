(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId), r = player?.Religion;
  if (!Number.isInteger(playerId) || playerId < 0 || !r) throw Error("No local player");
  const {expected_pantheons: p, expected_beliefs: b, expected_religion: religion, expected_founded: founded = queryArguments.kind !== "pantheon",
    expected_custom_name: customName = null} = queryArguments;
  if (![p, b].every(a => Array.isArray(a) && a.every(Number.isInteger)) || typeof founded !== "boolean" || (religion !== null && typeof religion !== "string") ||
      (customName !== null && (typeof customName !== "string" || !customName.trim() || customName.length > 16))) throw Error("Invalid captured religious selections");
  const actualFounded = r.hasCreatedReligion();
  if (typeof actualFounded !== "boolean") throw Error("Local religious state is unknown: hasCreatedReligion");
  const pantheons = r.getPantheons(), beliefs = actualFounded ? r.getBeliefs() : [];
  const invalidFields = Object.entries({pantheons, beliefs})
    .filter(([, values]) => !Array.isArray(values) || !values.every(Number.isInteger)).map(([field]) => field);
  if (invalidFields.length) throw Error(`Local religious selections are unknown: ${invalidFields.join(", ")}`);
  const currentReligion = actualFounded ? GameInfo.Religions.lookup(r.getReligionType())?.ReligionType ?? null : null;
  const rawName = customName !== null && actualFounded && typeof r.getReligionName === "function" ? r.getReligionName() : null;
  const religionName = typeof rawName === "string" ? Locale.compose(rawName) : null;
  return {turn: Game.turn, age: Game.age, playerId, pantheons, beliefs, religion: currentReligion, religionName,
    choiceObserved: actualFounded === founded && currentReligion === religion &&
      (customName === null || religionName === customName) &&
      JSON.stringify([...pantheons].sort((a, b) => a - b)) === JSON.stringify(p) && JSON.stringify([...beliefs].sort((a, b) => a - b)) === JSON.stringify(b)};
})()
