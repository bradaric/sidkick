(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const name = key => key ? Locale.compose(key) : null;
  const age = GameInfo.Ages.lookup(Game.age);
  const leader = GameInfo.Leaders.lookup(player.leaderType);
  const civilization = GameInfo.Civilizations.lookup(player.civilizationType);
  const previous = player.previousAgeCivilizationType == null || player.previousAgeCivilizationType === -1 ? null
    : GameInfo.Civilizations.lookup(player.previousAgeCivilizationType);
  const leaderItems = Database.query("config", "SELECT * FROM LeaderItems ORDER BY SortIndex");
  const civilizationItems = Database.query("config", "SELECT * FROM CivilizationItems ORDER BY SortIndex");
  function items(catalog, key, type) {
    if (catalog == null || type == null) return null;
    return catalog.filter(row => row[key] === type && (!row.AgeType || row.AgeType === age?.AgeType) &&
      ["KIND_TRAIT", "KIND_UNIT", "KIND_BUILDING", "KIND_IMPROVEMENT", "KIND_QUARTER", "KIND_TRADITION", "KIND_PROJECT"].includes(row.Kind))
      .map(row => ({id: row.Type ?? null, kind: row.Kind, name: name(row.Name), description: name(row.Description), age: row.AgeType ?? null}));
  }
  function traits(links, key, type) {
    if (links == null || type == null) return null;
    return links.filter(link => link[key] === type).map(link => {
      const trait = GameInfo.Traits?.lookup(link.TraitType);
      const modifiers = GameInfo.TraitModifiers == null ? null : GameInfo.TraitModifiers.filter(row => row.TraitType === link.TraitType)
        .map(row => {
          const modifier = GameInfo.Modifiers?.find(value => value.ModifierId === row.ModifierId);
          return {id: row.ModifierId,
            description: name(GameInfo.ModifierStrings?.find(value => value.ModifierId === row.ModifierId && value.Context === "Description")?.Text),
            ownerRequirementSet: modifier?.OwnerRequirementSetId ?? null, subjectRequirementSet: modifier?.SubjectRequirementSetId ?? null,
            appliedYieldContribution: null};
        });
      return {id: link.TraitType, name: name(trait?.Name), description: name(trait?.Description), modifiers};
    });
  }
  const yields = Object.fromEntries([...GameInfo.Yields].map(def => [
    def.YieldType,
    player.Stats.getNetYield(def.$hash)
  ]));
  return {
    civilization: name(player.civilizationFullName),
    turn: Game.turn,
    age: name(age?.Name),
    identity: {
      leader: {id: leader?.LeaderType ?? null, name: name(leader?.Name),
        items: items(leaderItems, "LeaderType", leader?.LeaderType),
        traits: traits(GameInfo.LeaderTraits, "LeaderType", leader?.LeaderType)},
      civilization: {id: civilization?.CivilizationType ?? null, name: name(civilization?.Name) ?? name(player.civilizationFullName),
        items: items(civilizationItems, "CivilizationType", civilization?.CivilizationType),
        traits: traits(GameInfo.CivilizationTraits, "CivilizationType", civilization?.CivilizationType)},
      previousCivilization: previous ? {id: previous.CivilizationType, name: name(previous.Name)} : null,
      note: "Local current identity/persona and current-Age or Age-independent public definitions only. Linked trait modifiers preserve requirement-set IDs, not evaluated activation or yield contributions. Previous civilization identity does not imply its abilities carried over; unique items are not construction/training eligibility"
    },
    treasury: player.Treasury.goldBalance,
    netYields: yields,
    settlements: {
      current: player.Stats.numSettlements,
      limit: player.Stats.settlementCap,
      remaining: player.Stats.settlementCap - player.Stats.numSettlements
    }
  };
})()
