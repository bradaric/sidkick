const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(options = {}, script = 'set_policy_active.js') {
  const definitions = [
    {$hash: 101, $index: 1, TraditionType: 'POLICY_A', CultureSlotType: 'POLICY_CULTURE_SLOT'},
    {$hash: 102, $index: 2, TraditionType: 'POLICY_B', CultureSlotType: 'POLICY_CULTURE_SLOT'},
    {$hash: 103, $index: 3, TraditionType: 'POLICY_IN_TRADITION', CultureSlotType: 'POLICY_CULTURE_SLOT'},
    {$hash: 201, $index: 4, TraditionType: 'TRADITION_A', CultureSlotType: 'TRADITION_CULTURE_SLOT'},
    {$hash: 301, $index: 5, TraditionType: 'CRISIS_A', CultureSlotType: 'CRISIS_CULTURE_SLOT'},
  ];
  const groups = [[101], options.migrated ? [201, 103] : [201], [301]];
  const calls = [];
  const context = {
    queryArguments: {policy: 'POLICY_A', active: false, expected_turn: 58, ...options.arguments},
    UI: {isInGame: () => options.inGame !== false},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => false},
    CultureSlotTypes: {POLICY_CULTURE_SLOT: 0, TRADITION_CULTURE_SLOT: 1, CRISIS_CULTURE_SLOT: 2},
    PlayerOperationTypes: {CHANGE_TRADITION: 'POLICY'},
    PlayerOperationParameters: {Activate: 'ADD', Deactivate: 'REMOVE'},
    GameInfo: {Traditions: {lookup: value => definitions.find(row => row.$hash === value || row.TraditionType === value)}},
    Players: {get: () => ({isTurnActive: options.activeTurn ?? true, Culture: {
      getActiveTraditions: slot => groups[slot],
      getUnlockedTraditions: slot => {assert.equal(slot, 0); return options.unlocked ?? [101, 102, 103];},
      getNumCultureSlots: slot => {assert.equal(slot, 0); return options.capacity ?? 2;},
      canSwapCultureSlot: slot => {assert.equal(slot, 0); return options.canSwap ?? true;},
    }})},
    Game: {turn: 58, age: 42, PlayerOperations: {
      canStart: (id, operation, args, exclusion) => {
        calls.push({kind: 'check', id, operation, args, exclusion});
        if (options.changeTurn) context.Game.turn++;
        return {Success: options.allowed ?? true, FailureReasons: ['Native blocker']};
      },
      sendRequest: (id, operation, args) => {calls.push({kind: 'send', id, operation, args});},
    }},
  };
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);
  return JSON.parse(JSON.stringify({data, calls}));
}

test('ordinary policy removal uses the definition index and preserves other slot groups', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.deepEqual(data.before, {turn: 58, age: 42, playerId: 0,
    activePolicies: ['POLICY_A'], activeTraditions: ['TRADITION_A'], activeCrises: ['CRISIS_A']});
  assert.deepEqual(data.expected, {activePolicies: [], activeTraditions: ['TRADITION_A'], activeCrises: ['CRISIS_A']});
  assert.deepEqual(calls, [
    {kind: 'check', id: 0, operation: 'POLICY', args: {TraditionType: 1, Action: 'REMOVE'}, exclusion: false},
    {kind: 'send', id: 0, operation: 'POLICY', args: {TraditionType: 1, Action: 'REMOVE'}},
  ]);
});

test('ordinary policy addition requires an empty ordinary slot and submits once', () => {
  const {data, calls} = run({arguments: {policy: 'POLICY_B', active: true}});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(data.expected.activePolicies, ['POLICY_A', 'POLICY_B']);
  assert.equal(calls[1].args.TraditionType, 2);
  assert.equal(calls[1].args.Action, 'ADD');
  const full = run({arguments: {policy: 'POLICY_B', active: true}, capacity: 1});
  assert.equal(full.data.status, 'rejected');
  assert.equal(full.calls.length, 0, 'must not fall back to a tradition slot');
});

test('policy swap locks reject before an operation check or request', () => {
  const {data, calls} = run({canSwap: false});
  assert.equal(data.status, 'rejected');
  assert.match(data.reason, /locked/i);
  assert.equal(calls.length, 0);
});

test('only exact unlocked ordinary cards in ordinary slots are supported', () => {
  for (const options of [{arguments: {policy: 'TRADITION_A'}}, {arguments: {policy: 'CRISIS_A'}},
    {arguments: {policy: 'UNKNOWN'}}, {unlocked: []},
    {migrated: true, arguments: {policy: 'POLICY_IN_TRADITION'}}]) {
    const {data, calls} = run(options);
    assert.equal(data.status, 'rejected');
    assert.equal(calls.length, 0);
  }
});

test('invalid policy inputs and stale/inactive contexts never submit', () => {
  for (const options of [{arguments: {policy: ' '}}, {arguments: {active: 1}},
    {arguments: {expected_turn: true}}, {arguments: {expected_turn: 57}},
    {inGame: false}, {activeTurn: false}]) {
    const {data, calls} = run(options);
    assert.equal(data.status, 'rejected');
    assert.equal(calls.length, 0);
  }
});

test('already-set policy membership is a no-op even while swapping is locked', () => {
  const enabled = run({canSwap: false, arguments: {active: true}});
  assert.equal(enabled.data.status, 'already_active');
  assert.equal(enabled.calls.length, 0);
  const disabled = run({canSwap: false, arguments: {policy: 'POLICY_B'}});
  assert.equal(disabled.data.status, 'already_inactive');
  assert.equal(disabled.calls.length, 0);
});

test('native policy blockers and a changed context prevent submission', () => {
  const blocked = run({allowed: false});
  assert.equal(blocked.data.status, 'rejected');
  assert.deepEqual(blocked.data.failureReasons, ['Native blocker']);
  assert.deepEqual(blocked.calls.map(call => call.kind), ['check']);
  const changed = run({changeTurn: true});
  assert.equal(changed.data.status, 'rejected');
  assert.deepEqual(changed.calls.map(call => call.kind), ['check']);
});

test('policy readback is read-only and retains sorted membership of every slot group', () => {
  const {data, calls} = run({}, 'policy_state.js');
  assert.deepEqual(data, {turn: 58, age: 42, playerId: 0,
    activePolicies: ['POLICY_A'], activeTraditions: ['TRADITION_A'], activeCrises: ['CRISIS_A']});
  assert.equal(calls.length, 0);
});
