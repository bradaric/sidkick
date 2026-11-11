(() => {
  const {civilization, selection_token: token, expected_turn: expectedTurn} = queryArguments;
  const reject = reason => ({status: "rejected", reason});
  if (typeof civilization !== "string" || !civilization.trim() || civilization.length > 512 ||
      typeof token !== "string" || !token || token.length > 250000 || !Number.isSafeInteger(expectedTurn) || expectedTurn < 0)
    return reject("Exact civilization ID, fresh selection token and expected turn required");
  const before = transitionCivilization.snapshot();
  if (!before || before.selectionOpen !== true || before.turn !== expectedTurn || before.selectionToken !== token)
    return reject("No editable pending civilization transition or selection context/token is stale");
  const matches = before.choices.filter(choice => choice.id === civilization);
  if (matches.length !== 1 || matches[0].selectionPermission !== true)
    return reject("One exact valid and unlocked next-Age civilization is required");
  const latest = transitionCivilization.snapshot();
  if (!latest || latest.selectionOpen !== true || latest.selectionToken !== token)
    return reject("Transition choice, eligibility or game context changed during validation");
  if (before.selected === civilization) return {status: "already_active", before};
  // Same setter as core/ui-next/screens/create-game/{civ-select,game-parameters}-model.js.
  // SET_AGE_TRANSITION_DATA(Finished) is a separate operation and is deliberately not sent.
  GameSetup.setPlayerParameterValue(before.playerId, "AgeTransitionPlayerCivilization", civilization);
  return {status: "submitted", before,
    expected: {selected: civilization, selectionOpen: true, nextAge: before.nextAge, notification: before.notification},
    verificationScope: "Pending transition civilization parameter only; no finalization, screen navigation, Memento/Dedication/capital selection or Age/turn advancement"};
})()
