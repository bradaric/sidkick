const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(options = {}, script = 'select_civic.js') {
  const nodes = [{type: 101, ProgressionTreeNodeType: 'NODE_CIVIC_A'},
    {type: 102, ProgressionTreeNodeType: 'NODE_CIVIC_B'},
    {type: 201, ProgressionTreeNodeType: 'NODE_TECH'}];
  const calls = [];
  const forbidden = () => {throw Error('Civic action must not touch technology, policy, target setters or turn completion');};
  const context = {
    queryArguments: {civic: 'NODE_CIVIC_B', expected_turn: 58, ...options.arguments},
    UI: {isInGame: () => options.inGame !== false},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => options.sent ?? false, sendTurnComplete: forbidden},
    Players: {get: () => ({isTurnActive: options.activeTurn ?? true, Techs: new Proxy({}, {get: forbidden}),
      Culture: {
        getTargetNode: () => options.target ?? -1,
        getAllAvailableNodeTypes: () => [101, 102],
        getResearching: () => options.noResearch ? null : {type: options.current ?? 101},
      }})},
    ProgressionTreeNodeTypes: {NO_NODE: -1},
    PlayerOperationTypes: {SET_CULTURE_TREE_NODE: 'SET_CIVIC'},
    GameInfo: {ProgressionTreeNodes: {lookup: value => nodes.find(node => node.type === value)}},
    Game: {turn: 58, age: 42, PlayerOperations: {
      canStart: (id, operation, args, exclusion) => {
        assert.equal(operation, 'SET_CIVIC');
        calls.push({kind: 'check', id, operation, args, exclusion});
        if (options.changeAge) context.Game.age++;
        return {Success: options.allowed ?? true, FailureReasons: options.allowed === false ? ['Civic blocked'] : []};
      },
      sendRequest: (id, operation, args) => {
        assert.equal(operation, 'SET_CIVIC');
        calls.push({kind: 'send', id, operation, args});
      },
    }},
  };
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);
  return JSON.parse(JSON.stringify({data, calls}));
}

test('civic selection validates and submits only the offered native civic selector', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.equal(data.civic, 'NODE_CIVIC_B');
  assert.deepEqual(data.before, {turn: 58, age: 42, playerId: 0, activeCivic: 'NODE_CIVIC_A'});
  assert.deepEqual(calls, [
    {kind: 'check', id: 0, operation: 'SET_CIVIC', args: {ProgressionTreeNodeType: 102}, exclusion: false},
    {kind: 'send', id: 0, operation: 'SET_CIVIC', args: {ProgressionTreeNodeType: 102}},
  ]);
});

test('civic selection rejects stale/inactive phases, existing targets and invalid or technology selectors', () => {
  for (const options of [{inGame: false}, {activeTurn: false}, {sent: true}, {target: 102},
    {arguments: {expected_turn: 57}}, {arguments: {expected_turn: true}}, {arguments: {civic: 102}},
    {arguments: {civic: ' '}}, {arguments: {civic: 'NODE_TECH'}}, {arguments: {civic: 'Civic B'}}]) {
    const {data, calls} = run(options);
    assert.equal(data.status, 'rejected', JSON.stringify(options));
    assert.equal(calls.length, 0);
  }
});

test('native civic rejection and changed context never submit a request', () => {
  const blocked = run({allowed: false});
  assert.equal(blocked.data.status, 'rejected');
  assert.deepEqual(blocked.data.failureReasons, ['Civic blocked']);
  assert.deepEqual(blocked.calls.map(call => call.kind), ['check']);
  const changed = run({changeAge: true});
  assert.equal(changed.data.status, 'rejected');
  assert.deepEqual(changed.calls.map(call => call.kind), ['check']);
});

test('already active civics are no-ops and empty research remains null', () => {
  const active = run({current: 102});
  assert.equal(active.data.status, 'already_active');
  assert.equal(active.calls.length, 0);
  assert.equal(run({noResearch: true}).data.before.activeCivic, null);
});

test('fresh civic readback is read-only and separate from technology', () => {
  const {data, calls} = run({current: 102}, 'civic_state.js');
  assert.deepEqual(data, {turn: 58, age: 42, playerId: 0, activeCivic: 'NODE_CIVIC_B'});
  assert.equal(calls.length, 0);
});
