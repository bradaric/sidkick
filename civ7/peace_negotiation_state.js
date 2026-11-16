(() => {
  const {target_player_id: targetId, direction, request_id: requestId, submission} = queryArguments;
  const state = peaceNegotiation.snapshot(targetId, direction);
  if (!submission || submission.before?.targetPlayerId !== targetId) throw Error('Exact peace submission required');
  const before = submission.before;
  const current = Players.get(state.playerId).Cities.getCities().map(c =>
    ({owner: c.id.owner, id: c.id.id, type: c.id.type, x: c.location.x, y: c.location.y}));
  const ledger = rows => rows.map(c => JSON.stringify(c)).sort().join('|');
  const currenciesUnchanged = state.gold === before.gold && state.influence === before.influence;
  const ownedUnchanged = ledger(current) === ledger(before.ownedCities);
  const normalized = JSON.stringify(peaceNegotiation.normalized(state.items));
  const edited = state.termsComplete === true && normalized === JSON.stringify(submission.expectedItems) &&
    currenciesUnchanged && ownedUnchanged && state.atWar === true && state.foreignAtWar === true;
  const native = globalThis.__sidkickPeaceInspection;
  const responseMatches = native && native.requestId === requestId && native.dealToken === submission.originalToken &&
    native.invalid === false && native.expires >= Date.now() && typeof native.acceptance === 'boolean';
  const net = type => submission.expectedRawItems.filter(i => i.type === type)
    .reduce((sum, i) => sum + (i.to === before.playerId ? i.amount : -i.amount), 0);
  const peace = state.atWar === false && state.foreignAtWar === false;
  const cities = submission.expectedCities;
  let citiesApplied = Array.isArray(cities), expectedOwned = [...before.ownedCities];
  for (const term of cities ?? []) {
    const {x, y} = term.city;
    // Final IDs may be reallocated on transfer; bind the exact centre and expected recipient.
    if (GameplayMap.getRevealedState(before.playerId, x, y) !== RevealedStates.VISIBLE) {citiesApplied = false; continue;}
    const id = MapCities.getCity(x, y);
    if (id?.owner !== term.toPlayerId) {citiesApplied = false; continue;}
    const city = Cities.get(id);
    if (peaceNegotiation.idKey(city?.id) !== peaceNegotiation.idKey(id) || city.owner !== term.toPlayerId ||
        city.location?.x !== x || city.location?.y !== y) {citiesApplied = false; continue;}
    expectedOwned = expectedOwned.filter(c => c.x !== x || c.y !== y);
    if (term.toPlayerId === before.playerId) expectedOwned.push({owner: id.owner, id: id.id, type: id.type, x, y});
  }
  const peaceTermsApplied = peace && citiesApplied && ledger(current) === ledger(expectedOwned) &&
    state.gold === before.gold + net(DiplomacyDealItemTypes.GOLD) &&
    state.influence === before.influence + net(DiplomacyDealItemTypes.INFLUENCE);
  return {...state, editApplied: edited, peaceTermsApplied,
    inspectionResolved: submission.operation === 'inspect' && state.inspectionResolved && state.inspectionRequestId === requestId,
    proposalObserved: submission.operation === 'propose' && (state.pendingDeal === true || peaceTermsApplied || Boolean(responseMatches && native.acceptance === false)),
    rejectionObserved: submission.operation === 'reject' && state.atWar === true && state.foreignAtWar === true && currenciesUnchanged && ownedUnchanged &&
      state.pendingDeal === false && (JSON.parse(submission.originalToken).pendingDeal === true ||
        state.dealToken !== submission.originalToken || Boolean(responseMatches && native.acceptance === false)),
    nativeResponse: responseMatches ? native.acceptance : null};
})()
