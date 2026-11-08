(() => {
  const name = key => key ? Locale.compose(key) : null;
  const categoryNames = Object.fromEntries(Object.entries(CardCategories).map(([key, value]) => [value, key]));
  function cardText(text) {
    if (!text) return null;
    const [base, ...args] = text.split("\\");
    return Locale.compose(base, ...args.map((arg, index) => {
      if (index === 0) return arg;
      const [nested, ...nestedArgs] = arg.split("//");
      return nestedArgs.length ? Locale.compose(nested, ...nestedArgs.map(value => value.includes("LOC_") ? Locale.compose(value) : value))
        : arg.includes("LOC_") ? Locale.compose(arg) : arg;
    }));
  }
  const costs = entries => Array.isArray(entries) ? entries.map(entry => ({
    category: categoryNames[entry.category] ?? null, amount: entry.value ?? null,
  })) : null;
  function total(entries) {
    if (!Array.isArray(entries) || !entries.every(entry => typeof entry.category === "string" &&
        Number.isSafeInteger(entry.amount) && entry.amount >= 0)) return null;
    const sum = entries.reduce((sum, entry) => sum + entry.amount, 0);
    return Number.isSafeInteger(sum) ? sum : null;
  }
  function ready(playerId) {
    const player = Players.get(playerId);
    return UI.isInGame() === true && typeof UI.getGameLoadingState === "function" &&
      typeof UIGameLoadingState !== "undefined" && Number.isInteger(UIGameLoadingState?.GameStarted) &&
      UI.getGameLoadingState() === UIGameLoadingState.GameStarted && Configuration.getGame().isAnyMultiplayer === false &&
      (typeof Autoplay === "undefined" || Autoplay.isActive === false) && player?.isTurnActive === true &&
      typeof GameContext.hasSentTurnComplete === "function" && GameContext.hasSentTurnComplete() === false;
  }
  function snapshot(playerId) {
    if (!Number.isInteger(playerId) || playerId < 0) return null;
    const advanced = Players.get(playerId)?.AdvancedStart;
    if (!advanced || !["getCards", "getAvailableCards", "getDeckSize", "getPlacementComplete", "getLegacyPoints"]
      .every(method => typeof advanced[method] === "function")) return null;
    const cards = advanced.getCards(), available = advanced.getAvailableCards();
    if (!Array.isArray(cards) || !Array.isArray(available) ||
        !cards.every(card => typeof card?.info?.id === "string" && card.info.id.length > 0) ||
        !available.every(card => typeof card?.id === "string" && card.id.length > 0)) return null;
    const size = advanced.getDeckSize(), closed = advanced.getPlacementComplete();
    const deckSize = Number.isSafeInteger(size) && size >= cards.length ? size : null;
    const selectionComplete = typeof closed === "boolean" ? closed : null;
    const selectionOpen = selectionComplete === false && deckSize !== null && ready(playerId);
    const openSlotCount = selectionComplete === true ? 0 : deckSize === null || selectionComplete === null ? null : deckSize - cards.length;
    const legacyPoints = costs(advanced.getLegacyPoints()), totalLegacyPoints = total(legacyPoints);
    const describe = info => ({id: info.id, name: cardText(info.name), description: cardText(info.description),
      costs: costs(info.cost), individualLimit: info.individualLimit ?? null, groupLimit: info.groupLimit ?? null,
      limitGroup: info.limitID || null,
      effects: (info.effects ?? []).map(effect => ({id: effect.id, name: cardText(effect.name), description: cardText(effect.description),
        placementRequired: Boolean(effect.isPlacementEffect), reportedAmount: effect.amount ?? null}))});
    const check = (type, cardId) => Game.PlayerOperations.canStart(playerId,
      PlayerOperationTypes.ADVANCED_START_MODIFY_DECK, {Type: type, ID: cardId}, false);
    const selected = cards.map(card => {
      const result = check("REMOVE", card.info.id);
      return {...describe(card.info), removeAllowed: selectionOpen && totalLegacyPoints !== null &&
        total(costs(card.info.cost)) !== null && cards.filter(other => other.info.id === card.info.id).length === 1 && result?.Success === true,
        failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean)};
    });
    const choices = available.map(info => {
      const result = check("ADD", info.id), selectedCount = cards.filter(card => card.info.id === info.id).length;
      const withinLimit = Number.isInteger(info.individualLimit) && (info.individualLimit <= 0 || selectedCount < info.individualLimit);
      const quote = total(costs(info.cost));
      return {...describe(info), selectedCount, slotAvailable: openSlotCount !== null && openSlotCount > 0,
        operationAllowed: result?.Success === true,
        availableNow: selectionOpen && openSlotCount > 0 && withinLimit && quote !== null && totalLegacyPoints !== null &&
          quote <= totalLegacyPoints && available.filter(other => other.id === info.id).length === 1 && result?.Success === true,
        failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean)};
    });
    const state = {turn: Game.turn, age: Game.age, playerId, deckAge: GameInfo.Ages.lookup(Game.age)?.AgeType ?? null,
      deckSize, selectionComplete, selectionOpen, openSlotCount,
      phase: selectionComplete === true ? "completed" : selectionComplete === null || deckSize === null ? "unknown"
        : openSlotCount === 0 ? "full_unconfirmed" : "selecting",
      legacyPoints, totalLegacyPoints, selected, choices,
      selectedCardIds: cards.map(card => card.info.id).sort(), nextAgeChoices: null};
    return {...state, deckToken: JSON.stringify(state),
      note: "Current engine deck only; slot count is capacity, not a focused/numbered UI slot. Completed decks cannot reopen. Add/remove only edits selection: effects, capital choice and final confirmation are separate and unsupported by this writer. Future cards are unknown"};
  }
  return {snapshot, ready, total};
})()
