(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  const name = key => key ? Locale.compose(key) : null;
  const resolve = value => value == null ? null : GameSetup.resolveString(value);
  const reasons = result => (result?.FailureReasons ?? []).map(name).filter(Boolean);
  const reasonNames = Object.fromEntries(Object.entries(GameSetupDomainValueInvalidReason).map(([key, value]) => [value, key]));
  const requirementNames = Object.fromEntries(Object.entries(RequirementState).map(([key, value]) => [value, key]));
  const currentAge = GameInfo.Ages.lookup(Game.age);
  const ageDomain = resolve(GameSetup.findGameParameter("Age")?.value?.originDomain);
  const ages = (Database.query("config", "SELECT * FROM Ages") ?? [])
    .filter(age => age.Domain === ageDomain && !age.Hidden).sort((a, b) => a.ChronologyIndex - b.ChronologyIndex);
  const configuredAge = ages.find(age => age.AgeType === currentAge?.AgeType);
  const next = Game.AgeProgressManager.isFinalAge || !configuredAge ? null
    : ages.find(age => age.ChronologyIndex > configuredAge.ChronologyIndex) ?? null;
  const nextAge = next ? {id: next.AgeType, name: name(next.Name), civilizationDomain: next.PlayerCivilizationDomain} : null;
  // The normal PlayerCivilization selector can report different locks. Use the transition selector.
  const civParameter = GameSetup.findPlayerParameter(id, "AgeTransitionPlayerCivilization");
  const bypass = Configuration.getGame().getValue("NoCivilizationUnlocks") === true;
  const items = Database.query("config", "SELECT * FROM CivilizationItems ORDER BY SortIndex") ?? [];
  const civilizations = next ? (civParameter?.domain?.possibleValues ?? [])
    .filter(value => resolve(value.originDomain) === next.PlayerCivilizationDomain && value.value !== "RANDOM")
    .map(value => {
      const type = String(value.value);
      const unlockPaths = GameInfo.UnlockRewards.filter(reward => reward.UnlockRewardKind === "KIND_CIVILIZATION" && reward.UnlockRewardType === type)
        .map(reward => {
          const progress = Game.Unlocks.getProgressForPlayer(reward.UnlockType, id);
          return {
            id: reward.UnlockType,
            isUnlocked: typeof progress?.isUnlocked === "boolean" ? progress.isUnlocked : null,
            requirements: GameInfo.UnlockRequirements.filter(requirement => requirement.UnlockType === reward.UnlockType).map(requirement => {
              const state = progress?.progress?.find(entry => entry.requirementSetId === requirement.RequirementSetId);
              return {id: requirement.RequirementSetId, description: name(requirement.Description),
                gameplayUnlock: Boolean(requirement.GameplayUnlock),
                state: state ? requirementNames[state.state] ?? state.state : null,
                met: state?.state == null ? null : [RequirementState.Met, RequirementState.AlwaysMet].includes(state.state),
                current: state?.current ?? null, total: state?.total ?? null};
            })
          };
        });
      const unlocked = bypass || unlockPaths.some(path => path.isUnlocked === true) ? true
        : unlockPaths.length && unlockPaths.every(path => path.isUnlocked === false) ? false : null;
      const setupValid = value.invalidReason == null ? null : value.invalidReason === GameSetupDomainValueInvalidReason.Valid;
      return {
        id: type, name: name(resolve(value.name)), setupValid,
        setupReason: reasonNames[value.invalidReason] ?? value.invalidReason ?? null,
        unlocked, eligibleByChecks: setupValid === false || unlocked === false ? false : setupValid === true && unlocked === true ? true : null,
        selectionPermission: null,
        unlockPaths,
        bonuses: items.filter(item => item.CivilizationType === type && (!item.AgeType || item.AgeType === next.AgeType))
          .map(item => ({id: item.Type ?? null, kind: item.Kind, name: name(item.Name), description: name(item.Description)}))
      };
    }) : [];

  const dedications = dedicationDeck.snapshot(id);

  const mementoDefinitions = Database.query("config", "SELECT * FROM Mementos") ?? [];
  const currentSlots = [], transitionSlots = [], seenSlots = new Set();
  for (const parameter of GameSetup.getMementoFilteredPlayerParameters(id) ?? []) {
    const parameterId = resolve(parameter.ID);
    if (!parameterId || parameter.hidden || parameter.invalidReason !== GameSetupParameterInvalidReason.Valid || seenSlots.has(parameterId)) continue;
    const transition = parameterId.startsWith("AgeTransitionPlayerMemento");
    if (!transition && !parameterId.startsWith("PlayerMemento")) continue;
    seenSlots.add(parameterId);
    const describe = value => {
      if (!value) return null;
      const type = String(value.value);
      const definition = mementoDefinitions.find(entry => entry.Type === type);
      return {id: type, name: name(resolve(value.name)) ?? name(definition?.Name) ?? type,
        description: name(resolve(value.description)) ?? name(definition?.Description),
        functionalDescription: name(definition?.FunctionalDescription),
        setupValid: value.invalidReason == null ? null : value.invalidReason === GameSetupDomainValueInvalidReason.Valid,
        setupReason: reasonNames[value.invalidReason] ?? value.invalidReason ?? null,
        profileUnlocked: null, selectionPermission: null};
    };
    (transition ? transitionSlots : currentSlots).push({parameter: parameterId, readOnly: Boolean(parameter.readOnly),
      selected: describe(parameter.value), choices: (parameter.domain?.possibleValues ?? []).map(describe)});
  }

  const setting = Configuration.getGame().getValue("AgeTransitionSettingName");
  const knownMode = ["AGE_TRANSITION_SETTING_KEEP_MORE", "AGE_TRANSITION_SETTING_ORIGINAL"].includes(setting);
  const knownNext = next && ["AGE_EXPLORATION", "AGE_MODERN"].includes(next.AgeType);
  let goldCap = null, influenceCap = null;
  if (knownMode && knownNext) {
    const keepMore = setting === "AGE_TRANSITION_SETTING_KEEP_MORE";
    // Source-inspected capGold/capInfluence steps in base-standard/scripts/age-transition-post-load.js.
    goldCap = Game.EconomicRules.adjustForGameSpeed(keepMore ? next.AgeType === "AGE_MODERN" ? 9000 : 6000 : 3000);
    influenceCap = Game.EconomicRules.adjustForGameSpeed(keepMore ? next.AgeType === "AGE_MODERN" ? 1200 : 800 : 500);
  }
  const finish = Game.PlayerOperations.canStart(id, PlayerOperationTypes.SET_AGE_TRANSITION_DATA, {Finished: true}, false);
  const selection = transitionCivilization.snapshot();
  for (const choice of civilizations) {
    const matches = selection?.choices.filter(candidate => candidate.id === choice.id) ?? [];
    choice.selectionPermission = matches.length === 1 && matches[0].selectionPermission === true;
  }
  return {
    turn: Game.turn, currentAge: {id: currentAge?.AgeType ?? null, name: name(currentAge?.Name)}, nextAge,
    civilizations: {parameter: "AgeTransitionPlayerCivilization", parameterAvailable: Boolean(civParameter),
      selectionOpen: selection?.selectionOpen === true, selectionToken: selection?.selectionToken ?? null,
      selected: civParameter?.value?.value ?? null, unlockBypassEnabled: bypass, choices: civilizations,
      note: "Planning eligibility is distinct from selectionPermission, which requires a pending local civilization choice and editable transition selector. No finalization"},
    dedications,
    mementos: {currentSlots, transitionSlots, profileMetadataQueried: false,
      note: "Filtered local setup candidates only. Profile unlock status/equip permission are unknown; no Online metaprogression calls are made"},
    transitionCompletionCheck: {operationAllowed: Boolean(finish?.Success), failureReasons: reasons(finish),
      note: "Read-only finish-operation check, not proof that individual selections may be changed now"},
    carryOverRules: {setting: setting ?? null, goldCapEstimate: goldCap, influenceCapEstimate: influenceCap,
      currentGoldAboveCap: goldCap == null || player.Treasury?.goldBalance == null ? null : Math.max(0, player.Treasury.goldBalance - goldCap),
      currentInfluenceAboveCap: influenceCap == null || player.DiplomacyTreasury?.diplomacyBalance == null ? null
        : Math.max(0, player.DiplomacyTreasury.diplomacyBalance - influenceCap),
      nonCapitalCityRegressionRule: "The inspected script regresses non-capital cities before generating retention cards; final city/town state is not predicted",
      source: "base-standard/scripts/age-transition-post-load.js: regressCitiesToTowns, capGold, capInfluence",
      note: "Source-inspected game-speed-adjusted estimates before dynamic cards, not transition-tested final balances or a unit/city survival simulation"}
  };
})()
