(() => {
  const {target_player_id: targetId, direction = 'outgoing', operation = 'observe', expected_turn: expectedTurn,
    deal_token: token, item_token: itemToken, item_id: itemId, request_id: requestId,
    max_gold_cost: goldCap = 0, max_influence_cost: influenceCap = 0} = queryArguments;
  const reject = reason => ({status: 'rejected', reason});
  const state = peaceNegotiation.snapshot(targetId, direction);
  if (operation === 'observe') {
    if (requestId !== undefined && state.inspectionRequestId !== requestId) {
      state.acceptance = null; state.inspectionResolved = false;
    }
    return state;
  }
  if (!['prepare', 'add', 'remove', 'inspect', 'propose', 'accept', 'reject', 'checkpoint', 'finish_search'].includes(operation)) return reject('Unknown peace operation');
  if (state.inspectionPending) return reject('An unresolved native peace request exists; inspect current state before any further edit or send');
  const player = Players.get(state.playerId);
  if (!peaceNegotiation.validId(expectedTurn) || state.turn !== expectedTurn || !Number.isInteger(state.age) ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      UI.getGameLoadingState() !== UIGameLoadingState.GameStarted || Configuration.getGame().isAnyMultiplayer !== false ||
      Configuration.getUser().isAutoEndTurn !== false || (typeof Autoplay !== 'undefined' && Autoplay.isActive !== false) ||
      state.atWar !== true || state.foreignAtWar !== true || state.uiBusy !== false || state.responseMode === 'unknown' || state.termsComplete !== true || !state.dealToken ||
      token !== state.dealToken || typeof token !== 'string' || token.length > 250000 ||
      ![state.gold, state.influence].every(v => Number.isFinite(v) && v >= 0)) return reject('Fresh exact supported draft, balances and active single-player turn required');
  if (player.Diplomacy.canMakePeaceWith(targetId)?.Success !== true) return reject('Native peace eligibility failed');
  if (state.expired !== false) return reject('Working-deal expiry is unknown or expired');
  if (state.pendingDeal !== false && !(direction === 'incoming' && ['accept', 'reject'].includes(operation) && state.pendingDeal === true))
    return reject('Do not overwrite a pending negotiation; use exact incoming response or the UI-converted outgoing draft');
  if (direction === 'incoming' && !['accept', 'reject'].includes(operation)) return reject('Only outgoing working drafts can be edited or inspected');
  if (![goldCap, influenceCap].every(v => Number.isFinite(v) && v >= 0)) return reject('Finite nonnegative gross spending caps required');
  const parsed = JSON.parse(token), items = parsed.items, working = parsed.workingDealId;
  if (operation === 'checkpoint') {
    const recovery = globalThis.__sidkickPeaceSearchRecovery;
    if (recovery && recovery.turn === state.turn && recovery.age === state.age && recovery.playerId === state.playerId)
      return reject('An unfinished peace search exists; restore its original terms first');
    globalThis.__sidkickPeaceSearchRecovery = {turn: state.turn, age: state.age, playerId: state.playerId,
      targetPlayerId: targetId, originalItems: items, originalToken: token};
    return {...state, status: 'already_active', searchRecovery: globalThis.__sidkickPeaceSearchRecovery};
  }
  if (operation === 'finish_search') {
    if (!state.searchRecovery || JSON.stringify(peaceNegotiation.normalized(items)) !==
        JSON.stringify(peaceNegotiation.normalized(state.searchRecovery.originalItems))) return reject('Original search terms have not been restored');
    delete globalThis.__sidkickPeaceSearchRecovery;
    return {...state, status: 'already_active', searchRecovery: null};
  }
  let expected = [...items], selected = null;
  if (operation === 'prepare') {
    if (state.hasPeaceAgreement) return {...state, status: 'already_active'};
    if (items.length) return reject('Prepare never clears existing work');
    selected = {type: DiplomacyDealItemTypes.AGREEMENTS, agreementType: DiplomacyDealItemAgreementTypes.MAKE_PEACE};
    expected.push(selected);
  } else {
    if (!state.hasPeaceAgreement) return reject('Prepare the peace agreement first');
    if (operation === 'add') {
      const offer = state.offers.filter(row => row.itemToken === itemToken && row.available === true);
      if (offer.length !== 1 || items.length >= 64) return reject('One exact currently valid native offered term required');
      selected = JSON.parse(itemToken);
      if (items.some(i => i.type === selected.type && (i.type !== DiplomacyDealItemTypes.CITIES ||
          peaceNegotiation.idKey(i.cityId) === peaceNegotiation.idKey(selected.cityId)))) return reject('One lump per currency and one term per city; remove the old choice first');
      expected.push(selected);
    } else if (operation === 'remove') {
      selected = items.find(i => i.id === itemId && i.type !== DiplomacyDealItemTypes.AGREEMENTS);
      if (!selected) return reject('Exact existing concession item_id required; never remove peace implicitly');
      expected = items.filter(i => i.id !== itemId);
    }
  }
  const debit = type => expected.filter(i => i.type === type && i.from === state.playerId).reduce((sum, i) => sum + i.amount, 0);
  if (['add', 'propose', 'accept'].includes(operation) && expected.some(i =>
      i.type !== DiplomacyDealItemTypes.AGREEMENTS && (i.type === DiplomacyDealItemTypes.CITIES ?
        i.isValid === false : i.isValid !== true))) return reject('Selected concessions require native validity before adding or submitting');
  if (!['remove', 'prepare', 'inspect', 'reject'].includes(operation) &&
      (debit(DiplomacyDealItemTypes.GOLD) > Math.min(goldCap, state.gold) ||
       debit(DiplomacyDealItemTypes.INFLUENCE) > Math.min(influenceCap, state.influence))) return reject('Gross local currency obligations exceed caps or balances');
  const owned = state.ownedCities;
  const conceded = expected.filter(i => i.type === DiplomacyDealItemTypes.CITIES && i.from === state.playerId && i.subType === DiplomacyDealItemCityTransferTypes.OFFER);
  if (!['remove', 'reject', 'inspect'].includes(operation) && conceded.length >= owned.length) return reject('Cannot concede every owned settlement');
  // Re-read the whole draft and offers immediately before any write; no clearing or guessed terms.
  const fresh = peaceNegotiation.snapshot(targetId, direction);
  if (fresh.dealToken !== token || fresh.inspectionPending || operation === 'add' &&
      !fresh.offers.some(row => row.itemToken === itemToken && row.available === true)) return reject('Negotiation or native offered term changed during validation');
  const before = {turn: state.turn, age: state.age, playerId: state.playerId, targetPlayerId: targetId,
    gold: state.gold, influence: state.influence, ownedCities: owned};
  if (['accept', 'reject'].includes(operation) && state.responseMode === 'new')
    return reject('No proven incoming offer: use propose for a new outgoing draft');
  if (operation === 'accept' && state.draftModified) return reject('Incoming terms were edited: explicitly propose a counteroffer, never silently accept it');
  if (['add', 'remove'].includes(operation) && state.responseMode === 'converted_incoming') {
    const old = globalThis.__sidkickPeaceIncomingOriginal;
    if (!old || old.turn !== state.turn || old.age !== state.age || old.playerId !== state.playerId ||
        old.targetPlayerId !== targetId || old.dealId !== parsed.dealId)
      globalThis.__sidkickPeaceIncomingOriginal = {turn: state.turn, age: state.age, playerId: state.playerId,
        targetPlayerId: targetId, dealId: parsed.dealId, items};
  }
  if (['inspect', 'propose', 'accept', 'reject'].includes(operation)) {
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(requestId) || Players.get(targetId).isHuman !== false)
      return reject('Unique request ID and known AI counterpart required for native inspection');
    const action = operation === 'inspect' ? DiplomacyDealProposalActions.INSPECT : operation === 'propose' ?
      (state.responseMode === 'converted_incoming' ? DiplomacyDealProposalActions.ADJUSTED : DiplomacyDealProposalActions.PROPOSED) :
      operation === 'accept' ? DiplomacyDealProposalActions.ACCEPTED : DiplomacyDealProposalActions.REJECTED;
    try {peaceNegotiation.listen(state, requestId, action);} catch (error) {return reject(String(error));}
    // A transport/native exception from send is UNKNOWN, never a safe-to-retry rejection.
    Game.DiplomacyDeals.sendWorkingDeal(working, action);
  } else if (operation === 'prepare' || operation === 'add') Game.DiplomacyDeals.addItemToWorkingDeal(working, selected);
  else if (operation === 'remove') Game.DiplomacyDeals.removeItemFromWorkingDeal(working, selected.id);
  return {status: 'submitted', before, operation, verificationArguments: {target_player_id: targetId, direction, request_id: requestId},
    expectedItems: peaceNegotiation.normalized(expected), expectedRawItems: expected, originalToken: token,
    expectedCities: [...state.youGive, ...state.youReceive].filter(i => i.kind === 'City'),
    verificationScope: 'One exact native draft edit, INSPECT, proposal or response. INSPECT acceptance is only a preview, never peace. No turn, auto-submit, hidden-city inventory, rollback or automatic retry. Native responses lack a caller request ID; counterpart/context/unchanged terms are checked, but concurrent UI negotiation must be avoided.'};
})()
