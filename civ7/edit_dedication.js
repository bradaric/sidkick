(() => {
  const {card_id: cardId, operation, deck_token: token, max_legacy_point_cost: cap, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (typeof cardId !== "string" || !cardId.trim() || cardId.length > 512 || !["add", "remove"].includes(operation) ||
      typeof token !== "string" || !token || token.length > 250000 ||
      !Number.isSafeInteger(cap) || cap < 0 || !Number.isSafeInteger(expectedTurn) || expectedTurn < 0)
    return reject("Exact card ID, add/remove operation, current deck token, legacy-point cap and turn required");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0 || !dedicationDeck.ready(playerId) || Game.turn !== expectedTurn)
    return reject("Fresh GameStarted active single-player turn required");
  const before = dedicationDeck.snapshot(playerId);
  if (!before || before.deckToken !== token || before.selectionOpen !== true || before.selectionComplete !== false)
    return reject("Dedication selection is closed, unavailable or its deck token is stale");
  if (!Number.isSafeInteger(before.totalLegacyPoints)) return reject("Legacy-point balances are unknown or unsupported");
  const adding = operation === "add", matches = (adding ? before.choices : before.selected).filter(card => card.id === cardId);
  if (matches.length !== 1) return reject("One exact offered or uniquely selected native card ID is required");
  const card = matches[0], quote = dedicationDeck.total(card.costs);
  if (adding ? card.availableNow !== true : card.removeAllowed !== true)
    return reject("Native card/slot/limit eligibility is blocked", card.failureReasons);
  if (quote === null || (adding && (quote > cap || quote > before.totalLegacyPoints)))
    return reject("Card legacy-point cost is unknown, unsupported, unaffordable or over cap");
  const type = adding ? "ADD" : "REMOVE", args = {Type: type, ID: cardId};
  const check = Game.PlayerOperations.canStart(playerId, PlayerOperationTypes.ADVANCED_START_MODIFY_DECK, args, false);
  if (check?.Success !== true) return reject("Native deck modification check failed", check?.FailureReasons ?? []);
  const latest = dedicationDeck.snapshot(playerId);
  if (!dedicationDeck.ready(playerId) || GameContext.localPlayerID !== playerId || latest?.deckToken !== token)
    return reject("Deck, cost, balances, loading or turn context changed during validation");
  const selectedCardIds = [...before.selectedCardIds];
  if (adding) selectedCardIds.push(cardId);
  else selectedCardIds.splice(selectedCardIds.indexOf(cardId), 1);
  selectedCardIds.sort();
  const expected = {selectedCardIds, totalLegacyPoints: before.totalLegacyPoints + (adding ? -quote : quote),
    selectionComplete: false, deckSize: before.deckSize};
  Game.PlayerOperations.sendRequest(playerId, PlayerOperationTypes.ADVANCED_START_MODIFY_DECK, args);
  return {status: "submitted", before, expected, quotedLegacyPointCost: adding ? quote : 0,
    verificationScope: "One native card add/remove only; exact selected-card multiset and total legacy-point debit/refund, not category allocation or applied effects. No replacement, capital change, effect use, deck finalization or turn advancement"};
})()
