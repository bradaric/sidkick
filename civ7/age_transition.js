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
  const categoryNames = Object.fromEntries(Object.entries(CardCategories).map(([key, value]) => [value, key]));
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

  // Match the UI's card-text injections without importing its stateful model.
  function cardText(text) {
    if (!text) return null;
    const [base, ...args] = text.split("\\");
    const values = args.map((arg, index) => {
      if (index === 0) return arg;
      const [nested, ...nestedArgs] = arg.split("//");
      return nestedArgs.length ? Locale.compose(nested, ...nestedArgs.map(value => value.includes("LOC_") ? Locale.compose(value) : value))
        : arg.includes("LOC_") ? Locale.compose(arg) : arg;
    });
    return Locale.compose(base, ...values);
  }
  const costs = entries => entries == null ? null : entries.map(entry => ({category: categoryNames[entry.category] ?? entry.category, amount: entry.value}));
  const advanced = player.AdvancedStart;
  let dedications = null;
  if (advanced) {
    const selected = advanced.getCards() ?? [];
    const deckSize = advanced.getDeckSize();
    const closed = advanced.getPlacementComplete();
    const slotAvailable = Number.isInteger(deckSize) ? selected.length < deckSize : null;
    const describe = info => ({id: info.id, name: cardText(info.name), description: cardText(info.description),
      costs: costs(info.cost), individualLimit: info.individualLimit ?? null, groupLimit: info.groupLimit ?? null,
      limitGroup: info.limitID || null,
      effects: (info.effects ?? []).map(effect => ({id: effect.id, name: cardText(effect.name), description: cardText(effect.description),
        placementRequired: Boolean(effect.isPlacementEffect), reportedAmount: effect.amount ?? null}))});
    dedications = {
      deckAge: currentAge?.AgeType ?? null, deckSize, selectionComplete: closed,
      legacyPoints: costs(advanced.getLegacyPoints()),
      selected: selected.map(card => describe(card.info)),
      choices: (advanced.getAvailableCards() ?? []).map(info => {
        const result = Game.PlayerOperations.canStart(id, PlayerOperationTypes.ADVANCED_START_MODIFY_DECK, {Type: "ADD", ID: info.id}, false);
        return {...describe(info), selectedCount: selected.filter(card => card.info.id === info.id).length,
          slotAvailable, operationAllowed: Boolean(result?.Success),
          availableNow: closed === false && slotAvailable === true && Boolean(result?.Success), failureReasons: reasons(result)};
      }),
      nextAgeChoices: null,
      note: "These are the current engine deck's cards, not a projected next-Age deck. Future cards and final carry-over effects are unknown until the engine supplies them"
    };
  }

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
  return {
    turn: Game.turn, currentAge: {id: currentAge?.AgeType ?? null, name: name(currentAge?.Name)}, nextAge,
    civilizations: {parameter: "AgeTransitionPlayerCivilization", parameterAvailable: Boolean(civParameter),
      selected: civParameter?.value?.value ?? null, unlockBypassEnabled: bypass, choices: civilizations,
      note: "Native unlock progress plus next-Age transition-domain validity; requirement links are not interpreted as all being required. Selection permission is not inferred"},
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
