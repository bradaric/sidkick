const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function fixture(options = {}) {
  const peace = {id: 10, type: 1, agreementType: 10};
  const gold = {id: 0, type: 2, subType: 20, from: 3, to: 0, amount: 600, duration: 0, isValid: true};
  const influence = {id: 0, type: 3, subType: 31, from: 0, to: 3, amount: 300, duration: 0, isValid: true};
  const city = {id: 0, type: 4, subType: 2, cityTransferType: 2, from: 3, to: 0,
    cityId: {owner: 3, id: 7, type: 8}, duration: 0};
  let items = options.empty ? [] : [peace, ...(options.terms ?? [influence, city]).map((i, n) => ({...i, id: 11 + n}))];
  let nextId = 20;
  const calls = [], listeners = [];
  const local = {isTurnActive: true, Treasury: {goldBalance: 577}, DiplomacyTreasury: {diplomacyBalance: 774},
    Diplomacy: {hasMet: id => id === 3, isAtWarWith: () => !options.atPeace, canMakePeaceWith: () => ({Success: true})},
    Cities: {getCities: () => [{id: {owner: 0, id: 1, type: 8}, location: {x: 0, y: 0}}]}};
  const ctx = vm.createContext({
    UI: {isInGame: () => true, getGameLoadingState: () => 1}, UIGameLoadingState: {GameStarted: 1},
    Configuration: {getGame: () => ({isAnyMultiplayer: !!options.multiplayer}), getUser: () => ({isAutoEndTurn: false})},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => false},
    Players: {get: id => {assert.ok([0, 3].includes(id)); return id === 0 ? local : {isMajor: true, isHuman: false,
      Diplomacy: {isAtWarWith: () => !options.atPeace}};}},
    Locale: {compose: s => s},
    DiplomacyDealDirection: {OUTGOING: 0, INCOMING: 1},
    DiplomacyDealItemTypes: {AGREEMENTS: 1, GOLD: 2, INFLUENCE: 3, CITIES: 4},
    DiplomacyDealItemAgreementTypes: {MAKE_PEACE: 10},
    DiplomacyDealItemGoldSubTypes: {SMALL_LUMP: 20, LARGE_LUMP: 21},
    DiplomacyDealItemInfluenceSubTypes: {SMALL_LUMP: 30, LARGE_LUMP: 31},
    DiplomacyDealItemCityTransferTypes: {OFFER: 2, CEDE_OCCUPIED: 3},
    DiplomacyDealProposalActions: {INSPECT: 5, PROPOSED: 4, ADJUSTED: 6, ACCEPTED: 1, REJECTED: 2},
    GameplayMap: {getGridWidth: () => 10, getGridHeight: () => 10,
      getRevealedState: () => options.hiddenCity ? 0 : 2}, RevealedStates: {VISIBLE: 2},
    Cities: {get: id => {assert.equal(options.hiddenCity, undefined, 'hidden city metadata must not be read');
      return {id, owner: id.owner, originalOwner: id.owner, location: {x: 2, y: 3}, name: 'Swenett'};}},
    // Foreign city discovery must use visible map components, not city inventories.
    MapCities: {getCity: (x, y) => x === 2 && y === 3 ? city.cityId : null},
    engine: {on: (name, callback) => {assert.equal(name, 'DiplomacyStatement'); const h = {callback, clear() {this.closed = true;}};
      listeners.push(h); return h;}},
    Game: {turn: 67, age: 42, DiplomacyDeals: {
      hasPendingDeal: () => !!options.pending,
      getWorkingDeal: w => ({id: 9, player1: 0, player2: 3, isDemand: false, isEnacted: false,
        isExpired: false, itemIds: items.map(i => i.id)}),
      getWorkingDealItem: (w, id) => items.find(i => i.id === id),
      getPossibleWorkingDealItems: (w, from, type) => [gold, influence, city].filter(i => i.from === from && i.type === type),
      addItemToWorkingDeal: (w, i) => {calls.push(['add', i]); const id = nextId++;
        items.push({...i, ...(options.agreementDefaults && i.type === 1 ? {subType: 10, from: 0, to: 3, duration: 0} : {}), id}); return id;},
      removeItemFromWorkingDeal: (w, id) => {calls.push(['remove', id]); items = items.filter(i => i.id !== id);},
      sendWorkingDeal: (w, action) => {calls.push(['send', action]); if (options.immediateResponse && action === 5)
        listeners.filter(h => !h.closed).forEach(h => h.callback({sessionId: 8,
          values: {FromPlayer: 3, ToPlayer: 0, RespondingToDealAction: 5, DealAction: 1}}));},
      clearWorkingDeal: () => {throw Error('Never clear existing work');},
    }},
  });
  const run = (args, script = 'peace_negotiation_action.js') => {
    ctx.queryArguments = {target_player_id: 3, direction: 'outgoing', operation: 'observe', ...args};
    const helper = fs.existsSync('civ7/peace_negotiation.js') ? fs.readFileSync('civ7/peace_negotiation.js', 'utf8') : 'null';
    const body = fs.existsSync(`civ7/${script}`) ? fs.readFileSync(`civ7/${script}`, 'utf8') : '({status:"unavailable"})';
    return JSON.parse(JSON.stringify(vm.runInContext(`((peaceNegotiation) => ${body})(${helper})`, ctx)));
  };
  const emit = values => listeners.filter(h => !h.closed).forEach(h => h.callback({sessionId: 8, values}));
  return {run, calls, emit, gold, influence, city, ctx, replace: next => {items = next;}};
}

test('reads converted incoming offer in outgoing draft with explicit give/receive and no mutations', () => {
  const f = fixture(); const r = f.run();
  assert.equal(r.status, 'ready');
  assert.equal(r.pendingDeal, false);
  assert.equal(r.youGive[0].amount, 300);
  assert.equal(r.youReceive[0].name, 'Swenett');
  assert.equal(r.youReceive[0].city.id, 7);
  assert.equal(r.offers.find(o => o.kind === 'City').available, true, 'native city offers have no isValid field');
  assert.equal(r.acceptance, null);
  assert.ok(r.dealToken);
  assert.equal(f.calls.length, 0);
});

test('unknown or hidden terms disable whole-deal actions rather than silently dropping concessions', () => {
  for (const options of [{terms: [{id: 1, type: 99, secret: 'SECRET'}]}, {hiddenCity: true}]) {
    const f = fixture(options), r = f.run();
    assert.equal(r.termsComplete, false);
    assert.equal(r.dealToken, null);
    assert.equal(JSON.stringify(r).includes('SECRET'), false);
    assert.equal(f.calls.length, 0);
  }
});

test('native inspection listens before send, is not a proposal, and binds response to unchanged terms', () => {
  const f = fixture({immediateResponse: true});
  const before = f.run();
  const sent = f.run({operation: 'inspect', deal_token: before.dealToken, expected_turn: 67, request_id: 'req'});
  assert.equal(sent.status, 'submitted');
  assert.deepEqual(f.calls, [['send', 5]]);
  const after = f.run({request_id: 'req'});
  assert.equal(after.inspectionResolved, true);
  assert.equal(after.acceptance, true);
  f.replace([{id: 10, type: 1, agreementType: 10}]);
  assert.equal(f.run({request_id: 'req'}).acceptance, null);
});

test('unrelated/unknown inspection responses never become accepted or rejected evidence', () => {
  const f = fixture(), r = f.run();
  f.run({operation: 'inspect', deal_token: r.dealToken, expected_turn: 67, request_id: 'req'});
  f.emit({FromPlayer: 5, ToPlayer: 0, RespondingToDealAction: 5, DealAction: 1});
  f.emit({FromPlayer: 3, ToPlayer: 0, RespondingToDealAction: 4, DealAction: 1});
  f.emit({FromPlayer: 3, ToPlayer: 0, RespondingToDealAction: 5, DealAction: 99});
  assert.equal(f.run({request_id: 'req'}).acceptance, null);
  f.emit({FromPlayer: 3, ToPlayer: 0, RespondingToDealAction: 5, DealAction: 2});
  assert.equal(f.run({request_id: 'req'}).acceptance, false);
});

test('add/remove use exact fresh tokens and currency exclusivity, preserving all unrelated terms', () => {
  const f = fixture(), r = f.run(), offer = r.offers.find(i => i.kind === 'Gold');
  const added = f.run({operation: 'add', expected_turn: 67, deal_token: r.dealToken,
    item_token: offer.itemToken, max_gold_cost: 0, max_influence_cost: 300});
  assert.equal(added.status, 'submitted');
  assert.equal(f.run().youReceive.length, 2);
  assert.equal(f.run({operation: 'remove', expected_turn: 67, deal_token: r.dealToken, item_id: 11,
    max_gold_cost: 0, max_influence_cost: 300}).status, 'rejected');
  const now = f.run();
  assert.equal(f.run({operation: 'add', expected_turn: 67, deal_token: now.dealToken,
    item_token: offer.itemToken, max_gold_cost: 0, max_influence_cost: 300}).status, 'rejected');
  assert.equal(f.calls.length, 1);
});

test('prepare only initializes an empty draft; stale, multiplayer, over-cap, pending edits fail closed', () => {
  const f = fixture({empty: true}), r = f.run();
  assert.equal(f.run({operation: 'prepare', expected_turn: 67, deal_token: r.dealToken}).status, 'submitted');
  assert.equal(f.run().termsComplete, true);
  for (const options of [{multiplayer: true}, {pending: true}]) {
    const g = fixture(options), b = g.run();
    assert.equal(g.run({operation: 'inspect', expected_turn: 67, deal_token: b.dealToken, request_id: 'x'}).status, 'rejected');
    assert.equal(g.calls.length, 0);
  }
  const g = fixture(), b = g.run();
  assert.equal(g.run({operation: 'propose', expected_turn: 67, deal_token: b.dealToken,
    max_gold_cost: 0, max_influence_cost: 299}).status, 'rejected');
  assert.equal(g.calls.length, 0);
});

test('prepare readback compares peace agreement semantics rather than native generated fields', () => {
  const f = fixture({empty: true, agreementDefaults: true}), r = f.run();
  const sent = f.run({operation: 'prepare', expected_turn: 67, deal_token: r.dealToken});
  assert.equal(sent.status, 'submitted');
  assert.equal(f.run({...sent.verificationArguments, submission: sent}, 'peace_negotiation_state.js').editApplied, true);
});

test('converted incoming proposals use ADJUSTED; edited offers cannot be silently accepted', () => {
  const f = fixture();
  const panel = {currentWorkingDealID: {direction: 0, player1: 0, player2: 3}, isNewDeal: false,
    pendingDealAdditions: [], pendingDealRemovals: [], dealHasBeenModified: false};
  f.ctx.document = {querySelectorAll: () => [{component: panel}]};
  const before = f.run();
  assert.equal(before.responseMode, 'converted_incoming');
  const sent = f.run({operation: 'propose', expected_turn: 67, deal_token: before.dealToken,
    request_id: 'counter', max_influence_cost: 300});
  assert.equal(sent.status, 'submitted');
  assert.deepEqual(f.calls, [['send', 6]]);
  const g = fixture();
  g.ctx.document = {querySelectorAll: () => [{component: panel}]};
  const read = g.run();
  g.run({operation: 'remove', expected_turn: 67, deal_token: read.dealToken, item_id: 11});
  const changed = g.run();
  assert.equal(changed.draftModified, true);
  assert.equal(g.run({operation: 'accept', expected_turn: 67, deal_token: changed.dealToken,
    request_id: 'accept'}).status, 'rejected');
  assert.equal(g.calls.length, 1);
});

test('readback does not confuse native inspection acceptance, pending proposal, or already-clear pending with peace/rejection', () => {
  const f = fixture({immediateResponse: true});
  const read = f.run();
  const sent = f.run({operation: 'inspect', expected_turn: 67, deal_token: read.dealToken, request_id: 'inspect'});
  const after = f.run({...sent.verificationArguments, submission: sent}, 'peace_negotiation_state.js');
  assert.equal(after.inspectionResolved, true);
  assert.equal(after.peaceTermsApplied, false);
  assert.equal(after.rejectionObserved, false);
  assert.equal(after.proposalObserved, false);
  const g = fixture(), b = g.run();
  const inspection = g.run({operation: 'inspect', expected_turn: 67, deal_token: b.dealToken, request_id: 'negative'});
  g.emit({FromPlayer: 3, ToPlayer: 0, RespondingToDealAction: 5, DealAction: 2});
  const negative = g.run({...inspection.verificationArguments, submission: inspection}, 'peace_negotiation_state.js');
  assert.equal(negative.inspectionResolved, true);
  assert.equal(negative.proposalObserved, false);
  assert.equal(negative.rejectionObserved, false);
});

test('an interrupted search exposes original terms and clears recovery only after exact semantic restoration', () => {
  const f = fixture(), before = f.run();
  const checkpoint = f.run({operation: 'checkpoint', deal_token: before.dealToken, expected_turn: 67});
  assert.equal(checkpoint.status, 'already_active');
  assert.equal(f.run().searchRecovery.originalItems.length, 3);
  f.run({operation: 'remove', deal_token: before.dealToken, expected_turn: 67, item_id: 11});
  const changed = f.run();
  assert.equal(f.run({operation: 'finish_search', deal_token: changed.dealToken, expected_turn: 67}).status, 'rejected');
  const original = checkpoint.searchRecovery.originalItems;
  f.replace(original.map(i => ({...i, id: i.id + 50})));
  const restored = f.run();
  assert.equal(f.run({operation: 'finish_search', deal_token: restored.dealToken, expected_turn: 67}).status, 'already_active');
  assert.equal(f.run().searchRecovery, null);
});

test('final peace requires exact currencies, gained city and preservation of every unrelated own city', () => {
  const f = fixture();
  f.ctx.document = {querySelectorAll: () => [{component: {currentWorkingDealID: {direction: 0, player1: 0, player2: 3},
    isNewDeal: false, dealHasBeenModified: false, pendingDealAdditions: [], pendingDealRemovals: []}}]};
  const before = f.run();
  const sent = f.run({operation: 'accept', expected_turn: 67, deal_token: before.dealToken, request_id: 'accept', max_influence_cost: 300});
  assert.equal(sent.status, 'submitted');
  const local = f.ctx.Players.get(0), foreign = f.ctx.Players.get(3);
  f.ctx.Players.get = id => id === 0 ? local : foreign;
  local.Diplomacy.isAtWarWith = foreign.Diplomacy.isAtWarWith = () => false;
  local.DiplomacyTreasury.diplomacyBalance = 474;
  const originalCities = local.Cities.getCities();
  const gained = {id: {owner: 0, id: 70, type: 8}, owner: 0, location: {x: 2, y: 3}, name: 'Swenett'};
  local.Cities.getCities = () => [...originalCities, gained];
  f.ctx.MapCities.getCity = (x, y) => x === 2 && y === 3 ? gained.id : null;
  f.ctx.Cities.get = () => gained;
  const verify = () => f.run({...sent.verificationArguments, submission: sent}, 'peace_negotiation_state.js');
  assert.equal(verify().peaceTermsApplied, true);
  local.DiplomacyTreasury.diplomacyBalance = 774;
  assert.equal(verify().peaceTermsApplied, false);
  local.DiplomacyTreasury.diplomacyBalance = 474;
  local.Cities.getCities = () => [gained];
  assert.equal(verify().peaceTermsApplied, false);
});

test('validity and owned-ledger changes during validation block submission; no guessed city IDs', () => {
  const f = fixture(), before = f.run();
  const local = f.ctx.Players.get(0);
  local.Cities.getCities = () => [{id: {owner: 0, id: 2, type: 8}, location: {x: 0, y: 0}}];
  assert.equal(f.run({operation: 'propose', expected_turn: 67, deal_token: before.dealToken,
    request_id: 'stale', max_influence_cost: 300}).status, 'rejected');
  assert.equal(f.calls.length, 0);
  const g = fixture({terms: [{id: 11, type: 2, subType: 20, from: 3, to: 0, amount: 600, duration: 0, isValid: false}]});
  const b = g.run();
  assert.equal(g.run({operation: 'propose', expected_turn: 67, deal_token: b.dealToken, request_id: 'invalid'}).status, 'rejected');
  assert.equal(g.calls.length, 0);
});

test('multiple offered cities remain separate terms, and native CEDE_OCCUPIED retains its recipient meaning', () => {
  const f = fixture(), first = {...f.city, id: 11};
  const second = {...f.city, id: 12, cityId: {owner: 3, id: 8, type: 8}};
  f.replace([{id: 10, type: 1, agreementType: 10}, first, second]);
  f.ctx.MapCities.getCity = (x, y) => y === 3 && (x === 2 || x === 4) ?
    {owner: 3, id: x === 2 ? 7 : 8, type: 8} : null;
  f.ctx.Cities.get = id => ({id, owner: 3, originalOwner: 3,
    location: {x: id.id === 7 ? 2 : 4, y: 3}, name: `City ${id.id}`});
  assert.equal(f.run().youReceive.length, 2);
  assert.ok(f.run().dealToken);
  const g = fixture();
  const local = g.ctx.Players.get(0);
  local.Cities.getCities = () => [{id: {owner: 0, id: 7, type: 8}, owner: 0, originalOwner: 3,
    location: {x: 2, y: 3}, name: 'Nekhen'}];
  g.replace([{id: 10, type: 1, agreementType: 10}, {...g.city, id: 11,
    subType: 3, cityTransferType: 3, cityId: {owner: 0, id: 7, type: 8}}]);
  const retained = g.run();
  assert.equal(retained.youReceive[0].name, 'Nekhen');
  assert.equal(retained.youReceive[0].transfer, 'cede_occupied');
  assert.ok(retained.dealToken);
});

test('an unresolved inspection blocks a new inspection and draft edits; context changes invalidate preview', () => {
  const f = fixture(), before = f.run();
  f.run({operation: 'inspect', expected_turn: 67, deal_token: before.dealToken, request_id: 'first'});
  assert.equal(f.run({operation: 'inspect', expected_turn: 67, deal_token: before.dealToken,
    request_id: 'second'}).status, 'rejected');
  assert.equal(f.run({operation: 'remove', expected_turn: 67, deal_token: before.dealToken, item_id: 11}).status, 'rejected');
  f.ctx.Game.turn = 68;
  f.emit({FromPlayer: 3, ToPlayer: 0, RespondingToDealAction: 5, DealAction: 1});
  assert.equal(f.run().acceptance, null);
});

test('changed native offer validity and ambiguous native response panels block writes', () => {
  const f = fixture(), before = f.run(), offer = before.offers.find(o => o.kind === 'Gold');
  let checks = 0;
  const getter = f.ctx.Game.DiplomacyDeals.getPossibleWorkingDealItems;
  f.ctx.Game.DiplomacyDeals.getPossibleWorkingDealItems = (...args) => {
    checks++;
    return getter(...args).map(i => ({...i, isValid: checks <= 6}));
  };
  assert.equal(f.run({operation: 'add', expected_turn: 67, deal_token: before.dealToken,
    item_token: offer.itemToken, max_influence_cost: 300}).status, 'rejected');
  assert.equal(f.calls.length, 0);
  const g = fixture();
  const panel = {currentWorkingDealID: {direction: 0, player1: 0, player2: 3},
    pendingDealAdditions: [], pendingDealRemovals: [], dealHasBeenModified: false, isNewDeal: false};
  g.ctx.document = {querySelectorAll: () => [{component: panel}, {component: panel}]};
  const ambiguous = g.run();
  assert.equal(g.run({operation: 'accept', expected_turn: 67, deal_token: ambiguous.dealToken,
    request_id: 'ambiguous', max_influence_cost: 300}).status, 'rejected');
  assert.equal(g.calls.length, 0);
});

module.exports = {fixture};
