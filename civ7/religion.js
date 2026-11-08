(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const religion = player.Religion;
  const name = key => key ? Locale.compose(key) : null;
  const hasCreatedReligion = Boolean(religion.hasCreatedReligion());
  const canFoundReligion = Boolean(religion.canCreateReligion());
  const hasHolyCity = Boolean(religion.hasHolyCity());
  const beliefsEarned = religion.getNumBeliefsEarned();
  const pantheonChoicesUnlocked = religion.getNumPantheonsUnlocked();
  const describeBelief = def => ({
    id: def.BeliefType,
    name: name(def.Name),
    description: name(def.Description),
    class: def.BeliefClassType
  });
  const resolveBeliefs = hashes => (hashes ?? []).map(hash => GameInfo.Beliefs.lookup(hash))
    .filter(Boolean).map(describeBelief);
  const pantheons = resolveBeliefs(religion.getPantheons());
  const beliefs = hasCreatedReligion ? resolveBeliefs(religion.getBeliefs()) : [];
  const selected = new Set([...pantheons, ...beliefs].map(belief => belief.id));

  // Match panel-belief-picker's slots; ADD_BELIEF alone does not enforce them.
  const founderCapacity = canFoundReligion ? 1
    : [1, 2, 3].includes(beliefsEarned) ? 1
      : beliefsEarned === 4 ? 2 : beliefsEarned === 5 ? 3 : 0;
  const capacities = {
    BELIEF_CLASS_RELIQUARY: hasCreatedReligion || canFoundReligion ? 1 : 0,
    BELIEF_CLASS_FOUNDER: founderCapacity,
    BELIEF_CLASS_ENHANCER: beliefsEarned >= 3 ? 1 : 0
  };
  const slots = Object.fromEntries(Object.entries(capacities).map(([type, capacity]) => {
    const used = beliefs.filter(belief => belief.class === type).length;
    return [type, {capacity, used, free: Math.max(capacity - used, 0)}];
  }));

  const choices = {pantheons: [], beliefs: [], religions: []};
  for (const def of GameInfo.Beliefs) {
    if (selected.has(def.BeliefType)) continue;
    const pantheon = def.BeliefClassType === "BELIEF_CLASS_PANTHEON";
    if (!pantheon && !slots[def.BeliefClassType]) continue;
    const result = Game.PlayerOperations.canStart(id,
      pantheon ? PlayerOperationTypes.FOUND_PANTHEON : PlayerOperationTypes.ADD_BELIEF,
      {BeliefType: def.$hash}, false);
    const option = {
      ...describeBelief(def),
      operationAllowed: Boolean(result.Success),
      failureReasons: (result.FailureReasons ?? []).map(name).filter(Boolean),
      additionalDescriptions: (result.AdditionalDescription ?? []).map(name).filter(Boolean)
    };
    if (pantheon) {
      choices.pantheons.push({
        ...option,
        availableNow: pantheonChoicesUnlocked > 0 && option.operationAllowed
      });
    } else {
      const claimable = Boolean(Game.Religion.isBeliefClaimable(def.$index));
      const slotAvailable = slots[def.BeliefClassType].free > 0;
      choices.beliefs.push({
        ...option,
        claimable,
        slotAvailable,
        availableNow: hasCreatedReligion && claimable && slotAvailable && option.operationAllowed,
        availableForFounding: !hasCreatedReligion && canFoundReligion && claimable && slotAvailable
      });
    }
  }

  // Match panel-religion-picker's definitions, icon context and public taken status.
  // Do not resolve founders or foreign custom names for this catalogue.
  for (const def of GameInfo.Religions) {
    const founded = typeof Game.Religion.hasBeenFounded === "function"
      ? Game.Religion.hasBeenFounded(def.ReligionType) : null;
    const hasBeenFounded = typeof founded === "boolean" ? founded : null;
    const result = Number.isInteger(def.$hash) && PlayerOperationTypes.FOUND_RELIGION != null &&
      typeof Game.PlayerOperations.canStart === "function"
      ? Game.PlayerOperations.canStart(id, PlayerOperationTypes.FOUND_RELIGION, {ReligionType: def.$hash}, false) : null;
    const operationAllowed = typeof result?.Success === "boolean" ? result.Success : null;
    const requiresConfirmation = result ? result.RequiresConfirmation === true : null;
    choices.religions.push({
      id: def.ReligionType, name: name(def.Name),
      icon: {id: def.ReligionType, context: "RELIGION_DECO"},
      iconString: typeof def.IconString === "string" ? def.IconString : null,
      requiresCustomName: typeof def.RequiresCustomName === "boolean" ? def.RequiresCustomName : null,
      hasBeenFounded, operationAllowed, requiresConfirmation,
      failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean),
      additionalDescriptions: (result?.AdditionalDescription ?? []).map(name).filter(Boolean),
      availableNow: !hasCreatedReligion && canFoundReligion && hasBeenFounded === false &&
        operationAllowed === true && requiresConfirmation === false
    });
  }

  function religionInfo(type) {
    const def = GameInfo.Religions.lookup(type);
    if (!def) return null;
    const founderId = Game.Religion.getPlayerFromReligion(def.ReligionType);
    let displayName = name(def.Name);
    let founder = null;
    if (founderId === id || (Number.isInteger(founderId) && founderId >= 0 && player.Diplomacy.hasMet(founderId))) {
      const owner = founderId === id ? player : Players.get(founderId);
      displayName = name(owner?.Religion?.getReligionName()) ?? displayName;
      founder = {
        playerId: founderId,
        civilization: name(owner?.civilizationFullName),
        isLocal: founderId === id
      };
    }
    return {id: def.ReligionType, name: displayName, founder};
  }

  const ownedUnits = player.Units == null ? null : player.Units.getUnits().filter(unit => unit.id.owner === id);
  const packedIds = new Set();
  let packingKnown = true;
  for (const commander of ownedUnits?.filter(unit => unit.isCommanderUnit) ?? []) {
    const army = typeof Armies !== "undefined" && typeof Armies?.get === "function" ? Armies.get(commander.armyId) : null;
    if (!army || army.owner !== id || typeof army.getUnitIds !== "function") { packingKnown = false; continue; }
    const members = army.getUnitIds();
    if (members == null) { packingKnown = false; continue; }
    for (const member of members) if (member.owner === id) packedIds.add(member.id);
  }
  const religiousUnits = ownedUnits == null ? null : ownedUnits.map(unit => {
    const def = GameInfo.Units.lookup(unit.type);
    if (!(def?.SpreadCharges > 0)) return null;
    const location = unit.location;
    const deployed = packingKnown && !packedIds.has(unit.id.id) && unit.isOnMap !== false &&
      location && Number.isInteger(location.x) && Number.isInteger(location.y) && location.x >= 0 && location.y >= 0 &&
      location.x < GameplayMap.getGridWidth() && location.y < GameplayMap.getGridHeight();
    // Match the action panel's non-target operation check; do not invent arbitrary target previews.
    const result = deployed ? Game.UnitOperations.canStart(unit.id, "UNITOPERATION_SPREAD_RELIGION",
      {X: -9999, Y: -9999, UnitAbilityType: -1}, false) : null;
    return {instanceId: unit.id.id, id: def.UnitType, name: name(unit.name ?? def.Name),
      location: deployed ? {x: location.x, y: location.y} : null, baseSpreadCharges: def.SpreadCharges,
      chargesRemaining: result?.ChargesRemaining ?? null, operationAllowed: result ? Boolean(result.Success) : null,
      availableNow: Boolean(result?.Success), failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean),
      additionalDescriptions: (result?.AdditionalDescription ?? []).map(name).filter(Boolean),
      targetConversionPreview: null};
  }).filter(Boolean);

  return {
    turn: Game.turn,
    scope: "Local player, owned settlements and public religion-picker choices; foreign founders identified only when met",
    hasCreatedReligion,
    canFoundReligion,
    religion: hasCreatedReligion ? religionInfo(religion.getReligionType()) : null,
    hasHolyCity,
    holyCityName: hasHolyCity ? name(religion.getHolyCityName()) : null,
    pantheons,
    pantheonChoicesUnlocked,
    beliefs,
    beliefsEarned,
    slots,
    choices,
    religionChoiceNote: "Religion choices use definition names, native icon ID/context references (not browser image URLs), and the picker's public taken status without identifying founders. Stock RELIGION_CUSTOM_5 is the butterfly icon. Founding checks here omit a custom name; custom-name eligibility must be rechecked by choose_civ7_religious_action with the exact custom_name. requiresCustomName is the definition flag. Custom names must be nonblank, at most 16 UTF-16 units, without markup/control characters; standard named religions cannot be renamed. Founding and subsequent belief choices are separate actions",
    religiousUnits,
    spreadNote: "Proven owned units with positive definition SpreadCharges; current non-target operation permission/charge quotes and native action-panel additionalDescriptions only, not arbitrary destination eligibility, converted-population counts or a conversion forecast. Text is not parsed into an outcome. Owned commander membership and on-map state gate deployment, not coordinates alone. Packed/off-map units and units with unknown packing evidence are not queried as deployed missionaries; a withheld location does not prove the unit is packed",
    settlements: player.Cities.getCities().map(city => ({
      id: city.id,
      name: name(city.name),
      location: {x: city.location.x, y: city.location.y},
      status: city.isCapital ? "capital" : city.isTown ? "town" : "city",
      isHolyCity: Boolean(city.Religion.isHolyCity),
      majority: religionInfo(city.Religion.majorityReligion),
      urban: religionInfo(city.Religion.urbanReligion),
      rural: religionInfo(city.Religion.ruralReligion)
    }))
  };
})()
