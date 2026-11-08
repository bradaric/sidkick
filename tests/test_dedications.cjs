const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = name => fs.readFileSync(path.join(__dirname, '../civ7', name), 'utf8');

function run(options = {}) {
  const card = id => ({id, name: id, description: 'Benefit', cost: [{category: 1, value: 1}],
    individualLimit: 1, groupLimit: -1, effects: [{id: `EFFECT_${id}`, amount: 1, isPlacementEffect: false}]});
  const cards = [card('CARD_A'), card('CARD_B')];
  if ('cost' in options) cards[0].cost[0].value = options.cost;
  if ('category' in options) cards[0].cost[0].category = options.category;
  const state = {selected: [cards[1]], points: 3, closed: false, size: 3, ...options.state};
  let checks = 0;
  const submissions = [];
  const context = vm.createContext({
    UI: {isInGame: () => true, getGameLoadingState: () => options.loading ? 2 : 8},
    UIGameLoadingState: {GameStarted: 8},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(options.sent)},
    Configuration: {getGame: () => ({isAnyMultiplayer: Boolean(options.multiplayer)})},
    Autoplay: {isActive: Boolean(options.autoplay)},
    Locale: {compose: (text, ...args) => [text, ...args].join('|')},
    CardCategories: {CARD_CATEGORY_WILDCARD: 1, CARD_CATEGORY_CULTURAL: 2},
    GameInfo: {Ages: {lookup: () => ({AgeType: 'AGE_EXPLORATION'})}},
    Players: {get: id => {assert.equal(id, 0); return {
      isTurnActive: options.inactive !== true,
      AdvancedStart: options.missingAdvanced ? null : {
        getCards: () => state.selected.map(info => ({info})),
        getAvailableCards: () => cards,
        getDeckSize: () => state.size,
        getPlacementComplete: () => state.closed,
        getLegacyPoints: () => [{category: 1, value: state.points}],
      },
    };}},
    PlayerOperationTypes: {ADVANCED_START_MODIFY_DECK: 'DECK'},
    Game: {turn: 1, age: 42, PlayerOperations: {
      canStart: (id, operation, args, visible) => {
        assert.equal(id, 0); assert.equal(operation, 'DECK'); assert.equal(visible, false);
        assert.ok(['ADD', 'REMOVE'].includes(args.Type));
        checks++;
        if (options.race && checks === 7) options.race(state, cards);
        return {Success: options.allowed !== false, FailureReasons: options.allowed === false ? ['Blocked'] : []};
      },
      sendRequest: (id, operation, args) => {
        submissions.push({id, operation, args: {...args}});
        const info = cards.find(card => card.id === args.ID);
        const cost = info.cost.reduce((sum, entry) => sum + entry.value, 0);
        if (args.Type === 'ADD') {state.selected.push(info); state.points -= cost;}
        else {state.selected.splice(state.selected.findIndex(card => card.id === args.ID), 1); state.points += cost;}
      },
    }},
  });
  vm.runInContext(`globalThis.dedicationDeck = ${source('dedication_deck.js')}`, context);
  const before = vm.runInContext('dedicationDeck.snapshot(0)', context);
  if (options.readOnly) return {before: JSON.parse(JSON.stringify(before)), submissions};
  context.queryArguments = {card_id: 'CARD_A', operation: 'add', max_legacy_point_cost: 1,
    expected_turn: 1, deck_token: before?.deckToken ?? 'unavailable', ...options.arguments};
  const result = vm.runInContext(source('edit_dedication.js'), context);
  const after = vm.runInContext(source('dedication_state.js'), context);
  return JSON.parse(JSON.stringify({before, result, after, submissions}));
}

test('Dedication readout distinguishes real open capacity, full unconfirmed and completed decks', () => {
  const open = run({readOnly: true});
  assert.equal(open.before.deckSize, 3);
  assert.equal(open.before.openSlotCount, 2);
  assert.equal(open.before.selectionOpen, true);
  assert.equal(open.before.phase, 'selecting');
  assert.equal(open.before.choices[0].availableNow, true);
  assert.ok(open.before.deckToken);
  assert.deepEqual(open.submissions, []);
  const full = run({readOnly: true, state: {size: 1}}).before;
  assert.equal(full.openSlotCount, 0);
  assert.equal(full.phase, 'full_unconfirmed');
  assert.equal(full.choices[0].availableNow, false);
  const closed = run({readOnly: true, state: {closed: true}}).before;
  assert.equal(closed.phase, 'completed');
  assert.equal(closed.selectionOpen, false);
  assert.equal(closed.openSlotCount, 0, 'unused capacity does not reopen a completed selection');
  const unknownBalance = run({readOnly: true, state: {points: null}}).before;
  assert.equal(unknownBalance.choices[0].availableNow, false);
  assert.equal(unknownBalance.selected[0].removeAllowed, false);
  assert.equal(run({readOnly: true, state: {points: 0}}).before.choices[0].availableNow, false);
});

test('adding one exact offered card submits once and verifies deck and legacy-point debit, not effects', () => {
  const {result, after, submissions} = run();
  assert.equal(result.status, 'submitted');
  assert.deepEqual(submissions, [{id: 0, operation: 'DECK', args: {Type: 'ADD', ID: 'CARD_A'}}]);
  for (const [key, expected] of Object.entries(result.expected)) assert.deepEqual(after[key], expected);
  assert.equal(after.selectionComplete, false, 'selection does not finalize/apply the deck');
  assert.equal(after.totalLegacyPoints, 2);
});

test('removing one selected card uses the native ID without an implicit replacement or finalization', () => {
  const {result, after, submissions} = run({arguments: {operation: 'remove', card_id: 'CARD_B', max_legacy_point_cost: 0}});
  assert.equal(result.status, 'submitted');
  assert.deepEqual(submissions[0].args, {Type: 'REMOVE', ID: 'CARD_B'});
  assert.equal(submissions.length, 1);
  assert.equal(after.totalLegacyPoints, 4);
  for (const [key, expected] of Object.entries(result.expected)) assert.deepEqual(after[key], expected);
});

test('completed, full, unknown and unavailable selection states reject despite permissive native checks', () => {
  for (const options of [
    {state: {closed: true}}, {state: {closed: null}}, {state: {size: 1}}, {state: {size: null}},
    {missingAdvanced: true}, {inactive: true}, {sent: true}, {loading: true}, {multiplayer: true}, {autoplay: true},
  ]) {
    const data = run(options);
    assert.equal(data.result.status, 'rejected', JSON.stringify(options));
    assert.equal(data.submissions.length, 0);
  }
});

test('exact identifiers, fresh deck tokens, native eligibility and explicit caps are required', () => {
  for (const options of [
    {arguments: {card_id: 'Dedication name'}}, {arguments: {operation: 'confirm'}},
    {arguments: {card_id: 'CARD_B', operation: 'add'}},
    {arguments: {card_id: 'CARD_A', operation: 'remove'}},
    {arguments: {deck_token: 'stale'}}, {arguments: {expected_turn: 0}},
    {arguments: {max_legacy_point_cost: 0}}, {arguments: {max_legacy_point_cost: -1}},
    {arguments: {expected_turn: true}}, {allowed: false}, {state: {points: null}},
    {cost: -1}, {cost: null}, {cost: 2}, {category: 99},
  ]) {
    const data = run(options);
    assert.equal(data.result.status, 'rejected', JSON.stringify(options));
    assert.equal(data.submissions.length, 0);
  }
});

test('zero-cost cards and native wildcard substitution retain exact total-spend verification', () => {
  const free = run({cost: 0, arguments: {max_legacy_point_cost: 0}});
  assert.equal(free.result.status, 'submitted');
  assert.equal(free.after.totalLegacyPoints, 3);
  assert.equal(free.result.expected.totalLegacyPoints, 3);
  const wildcard = run({category: 2});
  assert.equal(wildcard.result.status, 'submitted');
  assert.equal(wildcard.before.choices[0].costs[0].category, 'CARD_CATEGORY_CULTURAL');
  assert.equal(wildcard.after.legacyPoints[0].category, 'CARD_CATEGORY_WILDCARD');
  assert.equal(wildcard.after.totalLegacyPoints, 2);
});

test('last-moment balance, cost, completion and deck-content races reject before submission', () => {
  for (const race of [
    state => {state.points--;}, state => {state.closed = true;},
    (state, cards) => {cards[0].cost[0].value = 2;},
    (state, cards) => {state.selected.push(cards[0]);},
  ]) {
    const data = run({race});
    assert.equal(data.result.status, 'rejected');
    assert.equal(data.submissions.length, 0);
  }
});

test('the core snapshot uses native slot counts and does not call completed capacity an open slot', () => {
  for (const closed of [false, true, null]) {
    const player = {Techs: {getResearching: () => null}, Culture: {getResearching: () => null},
      Cities: {getCities: () => []}, AdvancedStart: {getDeckSize: () => 5,
        getPlacementComplete: () => closed, getCards: () => [{info: {id: 'CARD_A'}}], getAvailableCards: () => []}};
    const data = vm.runInNewContext(source('player.js'), {
      UI: {isInGame: () => true}, GameContext: {localPlayerID: 0}, Players: {get: () => player},
      Locale: {compose: value => value}, GameInfo: {Leaders: {lookup: () => ({})}, Ages: {lookup: () => ({})}},
      Game: {turn: 1, age: 42},
    });
    assert.equal(data.dedications.slotCount, 5);
    assert.equal(data.dedications.selectionComplete, closed);
    assert.equal(data.dedications.selectionPending, closed === false);
    assert.equal(data.dedications.openSlotCount, closed === false ? 4 : closed === true ? 0 : null);
  }
});
