(() => {
  const copy = value => JSON.parse(JSON.stringify(value));
  const idKey = id => `${id?.owner}:${id?.id}:${id?.type}`;
  const validId = value => Number.isSafeInteger(value) && value >= 0;
  const itemCopy = item => Object.fromEntries(['id', 'type', 'subType', 'agreementType', 'from', 'to',
    'amount', 'duration', 'isValid', 'cityTransferType', 'cityId'].filter(key => item[key] !== undefined)
    .map(key => [key, copy(item[key])]));
  const normalized = items => items.map(item => {
    if (item.type === DiplomacyDealItemTypes.AGREEMENTS && item.agreementType === DiplomacyDealItemAgreementTypes.MAKE_PEACE)
      return {type: item.type, agreementType: item.agreementType};
    const result = itemCopy(item); delete result.id; delete result.isValid;
    return result;
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  function snapshot(targetId, direction = 'outgoing') {
    if (UI.isInGame() !== true) throw Error('Load a save first');
    const playerId = GameContext.localPlayerID, player = Players.get(playerId);
    if (!validId(playerId) || !validId(targetId) || targetId === playerId || !player ||
        player.Diplomacy.hasMet(targetId) !== true || Players.get(targetId)?.isMajor !== true ||
        !['outgoing', 'incoming'].includes(direction)) throw Error('Exact met major and working-deal direction required');
    const workingDealId = {direction: direction === 'outgoing' ? DiplomacyDealDirection.OUTGOING : DiplomacyDealDirection.INCOMING,
      player1: playerId, player2: targetId};
    const deal = Game.DiplomacyDeals.getWorkingDeal(workingDealId);
    const pending = Game.DiplomacyDeals.hasPendingDeal(playerId, targetId);
    let responseMode = direction === 'incoming' ? 'incoming' : 'new';
    let uiBusy = false, uiModified = false;
    if (typeof document !== 'undefined') {
      const panels = [...document.querySelectorAll('panel-diplomacy-peace-deal')];
      let matches = 0;
      for (const element of panels) {
        const panel = element.component, id = panel?.currentWorkingDealID;
        if (id?.player1 !== playerId || id.player2 !== targetId || id.direction !== workingDealId.direction) continue;
        matches++;
        responseMode = panel.isNewDeal === false ? 'converted_incoming' : panel.isNewDeal === true ? 'new' : 'unknown';
        uiModified = panel.dealHasBeenModified !== false;
        uiBusy = !Array.isArray(panel.pendingDealAdditions) || !Array.isArray(panel.pendingDealRemovals) ||
          panel.pendingDealAdditions.length > 0 || panel.pendingDealRemovals.length > 0;
      }
      if (matches > 1) {responseMode = 'unknown'; uiBusy = true;}
    }
    const ownedCities = player.Cities.getCities().map(c => ({owner: c.id?.owner, id: c.id?.id, type: c.id?.type,
      x: c.location?.x, y: c.location?.y})).sort((a, b) => a.id - b.id);
    const ledgerKnown = ownedCities.length > 0 && ownedCities.length <= 256 && ownedCities.every(c =>
      c.owner === playerId && [c.id, c.type, c.x, c.y].every(validId)) &&
      new Set(ownedCities.map(idKey)).size === ownedCities.length;
    const base = {turn: Game.turn, age: Game.age, playerId, targetPlayerId: targetId, direction, responseMode, uiBusy,
      ownedCities: ledgerKnown ? ownedCities : null,
      pendingDeal: typeof pending === 'boolean' ? pending : null,
      atWar: player.Diplomacy.isAtWarWith(targetId),
      foreignAtWar: Players.get(targetId).Diplomacy?.isAtWarWith(playerId),
      gold: player.Treasury?.goldBalance ?? null, influence: player.DiplomacyTreasury?.diplomacyBalance ?? null};
    const recovery = globalThis.__sidkickPeaceSearchRecovery;
    const searchRecovery = recovery && recovery.turn === base.turn && recovery.age === base.age &&
      recovery.playerId === playerId && recovery.targetPlayerId === targetId ? copy(recovery) : null;
    const pendingInspection = globalThis.__sidkickPeaceInspection;
    const inspectionPending = Boolean(pendingInspection && !pendingInspection.closed && pendingInspection.expires >= Date.now());
    const result = {...base, searchRecovery, inspectionPending, status: 'unavailable', termsComplete: false, offersComplete: false,
      dealToken: null, items: [], youGive: [], youReceive: [], offers: [], acceptance: null, inspectionResolved: false,
      note: 'Incoming offers can be converted to outgoing drafts by the native UI; pendingDeal=false is not absence of a negotiation. Acceptance requires a separate native INSPECT action. Only owned or currently visible met-counterpart cities; no foreign inventory, hidden terms or private yields. No deal is changed by this read.'};
    if (!deal || !validId(deal.id) || ![deal.player1, deal.player2].includes(playerId) ||
        ![deal.player1, deal.player2].includes(targetId) || deal.player1 === deal.player2 ||
        deal.isDemand !== false || deal.isEnacted !== false || !Array.isArray(deal.itemIds) ||
        deal.itemIds.length > 64 || !deal.itemIds.every(validId) || new Set(deal.itemIds).size !== deal.itemIds.length) return result;

    const rawItems = deal.itemIds.map(id => Game.DiplomacyDeals.getWorkingDealItem(workingDealId, id));
    const rawOffers = [];
    let offersComplete = direction === 'outgoing';
    if (direction === 'outgoing') for (const from of [playerId, targetId]) {
      for (const type of [DiplomacyDealItemTypes.GOLD, DiplomacyDealItemTypes.INFLUENCE, DiplomacyDealItemTypes.CITIES]) {
        const rows = Game.DiplomacyDeals.getPossibleWorkingDealItems(workingDealId, from, type);
        if (!Array.isArray(rows) || rows.length > 256) {offersComplete = false; continue;}
        for (const row of rows) {
          if (row?.from !== from || row.type !== type) {offersComplete = false; continue;}
          rawOffers.push(row);
        }
      }
    }
    // Resolve offered identities from owned objects or visible map centres only. Never enumerate foreign Cities.
    const wanted = new Set([...rawItems, ...rawOffers].filter(i => i?.type === DiplomacyDealItemTypes.CITIES)
      .map(i => idKey(i.cityId)));
    const cities = new Map();
    if (wanted.size) {
      for (const city of player.Cities.getCities()) {
        if (city.id?.owner === playerId && wanted.has(idKey(city.id))) cities.set(idKey(city.id), city);
      }
      const width = GameplayMap.getGridWidth(), height = GameplayMap.getGridHeight();
      if (validId(width) && validId(height) && width * height <= 100000) {
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          if (GameplayMap.getRevealedState(playerId, x, y) !== RevealedStates.VISIBLE) continue;
          const id = MapCities.getCity(x, y);
          if (id?.owner !== targetId || !wanted.has(idKey(id)) || cities.has(idKey(id))) continue;
          const city = Cities.get(id);
          if (idKey(city?.id) === idKey(id) && city.owner === targetId && city.location?.x === x && city.location?.y === y)
            cities.set(idKey(id), city);
        }
      }
    }
    function describe(item) {
      if (!item || !validId(item.id)) return null;
      if (item.type === DiplomacyDealItemTypes.AGREEMENTS && item.agreementType === DiplomacyDealItemAgreementTypes.MAKE_PEACE)
        return {kind: 'Peace'};
      if (![playerId, targetId].includes(item.from) || item.to !== (item.from === playerId ? targetId : playerId) || item.duration !== 0) return null;
      const common = {fromPlayerId: item.from, toPlayerId: item.to};
      if ([DiplomacyDealItemTypes.GOLD, DiplomacyDealItemTypes.INFLUENCE].includes(item.type)) {
        const gold = item.type === DiplomacyDealItemTypes.GOLD;
        const subtypes = gold ? DiplomacyDealItemGoldSubTypes : DiplomacyDealItemInfluenceSubTypes;
        if (![subtypes.SMALL_LUMP, subtypes.LARGE_LUMP].includes(item.subType) || !Number.isFinite(item.amount) || item.amount <= 0) return null;
        return {...common, kind: gold ? 'Gold' : 'Influence', amount: item.amount};
      }
      if (item.type !== DiplomacyDealItemTypes.CITIES || !item.cityId ||
          ![item.cityId.owner, item.cityId.id, item.cityId.type].every(validId)) return null;
      const city = cities.get(idKey(item.cityId));
      if (!city || !validId(city.location?.x) || !validId(city.location?.y)) return null;
      const offer = item.subType === DiplomacyDealItemCityTransferTypes.OFFER;
      const cede = item.subType === DiplomacyDealItemCityTransferTypes.CEDE_OCCUPIED;
      if (item.cityTransferType !== item.subType || !(offer && item.from === city.owner ||
          cede && item.from === city.originalOwner && item.to === city.owner)) return null;
      return {...common, kind: 'City', name: Locale.compose(city.name), transfer: offer ? 'offer' : 'cede_occupied',
        city: {owner: item.cityId.owner, id: item.cityId.id, type: item.cityId.type,
          x: city.location.x, y: city.location.y}};
    }
    let complete = true, peaceCount = 0;
    const used = new Set(), items = [];
    for (let n = 0; n < rawItems.length; n++) {
      const item = rawItems[n], term = describe(item);
      if (!term || item.id !== deal.itemIds[n]) {complete = false; continue;}
      if (term.kind === 'Peace') peaceCount++;
      else {
        const key = term.kind === 'City' ? `City:${idKey(item.cityId)}` : term.kind;
        if (used.has(key)) complete = false;
        used.add(key);
        (item.from === playerId ? result.youGive : result.youReceive).push({...term, itemId: item.id});
      }
      items.push(itemCopy(item));
    }
    complete = complete && (peaceCount === 1 || items.length === 0);
    const seenOffers = new Set();
    for (const item of rawOffers) {
      const term = describe(item);
      if (!term || term.kind === 'Peace') {offersComplete = false; continue;}
      const token = JSON.stringify(itemCopy(item));
      if (seenOffers.has(token)) continue;
      seenOffers.add(token);
      // Native city offers omit isValid; the peace panel uses their offered-list membership.
      result.offers.push({...term, available: term.kind === 'City' ? item.isValid !== false : item.isValid === true, itemToken: token});
    }
    const original = globalThis.__sidkickPeaceIncomingOriginal;
    const apiModified = original && original.turn === base.turn && original.age === base.age &&
      original.playerId === playerId && original.targetPlayerId === targetId && original.dealId === deal.id &&
      JSON.stringify(normalized(original.items)) !== JSON.stringify(normalized(items));
    const draftModified = uiModified || Boolean(apiModified);
    const contextStable = Game.turn === base.turn && Game.age === base.age && GameContext.localPlayerID === playerId;
    const token = complete && ledgerKnown && contextStable ? JSON.stringify({...base, draftModified, workingDealId, dealId: deal.id,
      expired: typeof deal.isExpired === 'boolean' ? deal.isExpired : null, items}) : null;
    Object.assign(result, {status: 'ready', termsComplete: complete, offersComplete, items,
      dealToken: token, draftModified, contextStable, hasPeaceAgreement: peaceCount === 1, expired: deal.isExpired ?? null});
    const observation = globalThis.__sidkickPeaceInspection;
    if (observation && observation.action === DiplomacyDealProposalActions.INSPECT &&
        observation.dealToken === token && observation.expires >= Date.now() && !observation.invalid) {
      result.acceptance = observation.acceptance;
      result.inspectionResolved = typeof observation.acceptance === 'boolean';
      result.inspectionRequestId = observation.requestId;
    }
    return result;
  }

  function listen(state, requestId, action) {
    const old = globalThis.__sidkickPeaceInspection;
    if (old && !old.closed && old.expires >= Date.now()) throw Error('An unresolved inspection exists; read it before another request');
    old?.handle?.clear();
    const observation = {requestId, action, dealToken: state.dealToken, acceptance: null, expires: Date.now() + 15000,
      closed: false, invalid: false};
    observation.handle = engine.on('DiplomacyStatement', event => {
      if (observation.closed) return;
      if (Date.now() > observation.expires || Game.turn !== state.turn || Game.age !== state.age || GameContext.localPlayerID !== state.playerId) {
        observation.invalid = true; observation.closed = true; observation.handle?.clear(); return;
      }
      const values = event?.values;
      if (values?.FromPlayer !== state.targetPlayerId || values.ToPlayer !== state.playerId ||
          values.RespondingToDealAction !== action ||
          ![DiplomacyDealProposalActions.ACCEPTED, DiplomacyDealProposalActions.REJECTED].includes(values.DealAction)) return;
      observation.acceptance = values.DealAction === DiplomacyDealProposalActions.ACCEPTED;
      observation.closed = true; observation.handle?.clear();
    });
    globalThis.__sidkickPeaceInspection = observation;
  }
  return {snapshot, listen, normalized, itemCopy, validId, idKey};
})()
