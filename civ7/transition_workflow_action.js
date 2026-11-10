(() => {
  // Fixed internal modes selected only by distinct typed Python action wrappers.
  const {operation, workflow_token: token, expected_turn: turn} = queryArguments, a = queryArguments;
  const reject = reason => ({status: "rejected", reason});
  if (!["open", "view_map", "memento", "confirm_choices", "advance", "effect", "place_effect", "capital", "complete_deck"].includes(operation) ||
      typeof token !== "string" || !token || token.length > 250000 || !Number.isSafeInteger(turn) || turn < 0) return reject("Fresh workflow token and turn required");
  const before = transitionWorkflow.snapshot();
  if (!before.workflowToken || before.workflowToken !== token || before.turn !== turn) return reject("Transition phase/context changed or token is stale");
  let type, args, expected, control, verificationArguments;
  let expectedCivilization = before.nextCivilization;
  if (operation === "open") {
    if (!before.choicePending || !before.choiceNotification) return reject("No pending civilization chooser");
    if (before.chooserOpen) return {status: "already_active", before};
    expected = {chooserOpen: true};
  } else if (operation === "view_map") {
    control = transitionWorkflow.viewMapControl();
    if (!control || !Number.isInteger(InputActionStatuses.FINISH)) return reject("No unique unobstructed native View Map control");
    expected = {chooserOpen: false, dedicationPanelOpen: false};
  } else if (operation === "memento") {
    const slots = before.mementos.slots.filter(slot => slot.parameter === a.slot);
    if (!before.choicePending || !before.mementos.available || slots.length !== 1 || typeof a.memento !== "string") return reject("Exact editable transition Memento slot required");
    const matches = slots[0].choices.filter(choice => choice.id === a.memento && choice.selectionPermission === true);
    if (matches.length !== 1 || a.memento !== "NONE" && before.mementos.slots.some(slot => slot.parameter !== a.slot && slot.selected === a.memento))
      return reject("Memento is blocked/unknown or already equipped elsewhere; no implicit swap");
    if (slots[0].selected === a.memento) return {status: "already_active", before};
    expected = {mementoSelections: before.mementoSelections.map(slot => ({...slot, selected: slot.parameter === a.slot ? a.memento : slot.selected}))};
  } else if (operation === "confirm_choices") {
    if (a.confirm !== true || !before.finishAllowed) return reject("Explicit confirmation and fully valid civilization/Memento loadout required");
    type = PlayerOperationTypes.SET_AGE_TRANSITION_DATA; args = {Finished: true};
  } else if (operation === "advance") {
    if (a.expected_civilization != null) {
      if (typeof a.expected_civilization !== "string" || !a.expected_civilization || a.expected_civilization.length > 512 ||
          expectedCivilization !== null && a.expected_civilization !== expectedCivilization ||
          before.requiresExpectedCivilization && !before.recoveryCivilizations.includes(a.expected_civilization))
        return reject("Expected civilization conflicts with the captured loadout or is not an eligible next-Age recovery target");
      expectedCivilization = a.expected_civilization;
    }
    if (a.confirm !== true || !(before.advanceAllowed || before.advanceReady && before.requiresExpectedCivilization && expectedCivilization !== null))
      return reject("Explicit confirmation, closed chooser and an unblocked Age boundary required; acknowledged choices without a receipt also require expected_civilization. Never re-confirm Finished");
  } else if (operation === "effect" || operation === "place_effect") {
    const matches = before.effects.filter(effect => effect.id === a.effect_id);
    const placing = operation === "place_effect";
    if (!before.dedicationActive || before.dedicationPanelOpen || !before.effectsKnown || matches.length !== 1 ||
        matches[0].amount <= 0 || (placing ? matches[0].placementRequired !== true : matches[0].availableNow !== true))
      return reject("One unique pending effect of the requested kind with the Dedication UI closed is required");
    if (placing) {
      const width = GameplayMap.getGridWidth(), height = GameplayMap.getGridHeight();
      if (![a.x, a.y].every(value => Number.isSafeInteger(value) && value >= 0) ||
          !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || a.x >= width || a.y >= height)
        return reject("Exact in-bounds placement coordinates required");
      const revealed = GameplayMap.getRevealedState(before.playerId, a.x, a.y);
      if (!Number.isInteger(revealed) || !Number.isInteger(RevealedStates.HIDDEN) || revealed === RevealedStates.HIDDEN || revealed < 0 ||
          before.ownedSettlements.some(city => city.x === a.x && city.y === a.y)) return reject("Exact revealed unoccupied native settlement placement target required");
      type = PlayerOperationTypes.ADVANCED_START_PLACE_SETTLEMENT; args = {ID: a.effect_id, X: a.x, Y: a.y};
      verificationArguments = {placement: {x: a.x, y: a.y, before: before.ownedSettlements}};
    } else {type = PlayerOperationTypes.ADVANCED_START_USE_EFFECT; args = {ID: a.effect_id};}
    expected = {effects: before.effects.map(effect => effect.id === a.effect_id ? {...effect, amount: effect.amount - 1,
      availableNow: !placing && effect.amount > 1} : effect), selectedCardIds: before.selectedCardIds, selectionComplete: false,
      ...(placing ? {placementApplied: true} : {})};
  } else if (operation === "capital") {
    if (!Number.isSafeInteger(a.city_id) || a.city_id < 0 || !before.dedicationActive || before.dedicationPanelOpen ||
        before.capitals.filter(city => city.id === a.city_id && city.selectionPermission === true).length !== 1) return reject("Exact eligible owned capital candidate and closed Dedication UI required");
    if (before.capitalId === a.city_id) return {status: "already_active", before};
    type = PlayerOperationTypes.SELECT_CAPITAL; args = {Player1: before.playerId, City: a.city_id, Swap: false};
    expected = {capitalId: a.city_id, selectedCardIds: before.selectedCardIds, selectionComplete: false};
  } else {
    if (a.confirm !== true || !before.completeDeckAllowed || !Number.isSafeInteger(before.totalLegacyPoints) ||
        before.totalLegacyPoints > 0 && a.accept_unused_points !== true) return reject("Explicit confirmation, resolved effects, valid capital and acknowledgement of unused points required");
    type = PlayerOperationTypes.ADVANCED_START_MARK_COMPLETED; args = {};
    expected = {selectionComplete: true, transitionCompleted: true};
  }
  if (!["open", "view_map", "memento", "advance"].includes(operation) && type === undefined) return reject("Native transition operation unavailable");
  if (type !== undefined && Game.PlayerOperations.canStart(before.playerId, type, args, false)?.Success !== true) return reject("Native operation is blocked");
  const latest = transitionWorkflow.snapshot();
  if (latest.workflowToken !== token || control && transitionWorkflow.viewMapControl() !== control) return reject("Transition choices, eligibility or UI changed during validation");
  if (operation === "confirm_choices") {
    // Keep this in the current UI runtime so a lost transport response does not lose the target.
    // Record before submission; a later native acknowledgement, not this record, proves acceptance.
    globalThis.__sidkickTransitionConfirmation = JSON.parse(JSON.stringify({turn: before.turn, age: before.age,
      playerId: before.playerId, previousAgeCount: before.previousAgeCount, nextAge: before.nextAge,
      civilization: before.nextCivilization, mementoSelections: before.mementoSelections,
      notification: before.choiceNotification, ownedSettlements: before.ownedSettlements}));
  }
  if (operation === "open") Game.Notifications.activate(before.choiceNotification);
  else if (operation === "view_map") control.dispatchEvent(new CustomEvent("engine-input", {bubbles: false, cancelable: true,
    detail: {name: "accept", status: InputActionStatuses.FINISH}}));
  else if (operation === "memento") GameSetup.setPlayerParameterValue(before.playerId, a.slot, a.memento);
  else if (operation === "advance") GameContext.sendTurnComplete();
  else Game.PlayerOperations.sendRequest(before.playerId, type, args);
  return {status: "submitted", before: operation === "advance" ? {...before, nextCivilization: expectedCivilization} : before,
    ...(expected ? {expected} : {}), ...(verificationArguments ? {verificationArguments} : {}),
    verificationScope: "One explicitly requested transition step only. No profile writes, name swaps, implicit Memento swaps, card auto-fill, force-completion, extra turns or automatic retries. Applied effect requires observed native amount decrement; it is not a complete reward/carry-over forecast"};
})()
