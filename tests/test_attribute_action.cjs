const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(options = {}, script = 'buy_attribute_node.js') {
  const calls = [];
  const state = {depthUnlocked: options.purchased ? 1 : 0};
  const context = {
    queryArguments: {node: 'NODE_ATTRIBUTE_A', expected_turn: 58, ...options.arguments},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => false},
    Players: {get: () => ({isTurnActive: true, Identity: {
      getAvailableAttributePoints: type => {assert.equal(type, 'ATTRIBUTE_A'); return options.points ?? 1;},
      getWildcardPoints: () => options.wildcards ?? 0,
    }})},
    GameInfo: {Attributes: [{AttributeType: 'ATTRIBUTE_A', ProgressionTreeType: 'TREE_A'}],
      ProgressionTreeNodes: {lookup: type => type === 101 ? {ProgressionTreeNodeType: 'NODE_ATTRIBUTE_A', Repeatable: options.repeatable ?? false} : null}},
    ProgressionTreeNodeState: {NODE_STATE_INVALID: 0, NODE_STATE_CLOSED: 1, NODE_STATE_OPEN: 2, NODE_STATE_FULLY_UNLOCKED: 5},
    PlayerOperationTypes: {BUY_ATTRIBUTE_TREE_NODE: 'BUY'},
    Game: {turn: 58, age: 42, ProgressionTrees: {
      getTreeStructure: type => {assert.equal(type, 'TREE_A'); return [{nodeType: 101}];},
      canEverUnlock: () => ({isLocked: options.inapplicable ?? false}),
      hasLegendUnlocked: () => ({isLocked: options.legendLocked ?? false}),
      getNodeState: () => options.closed ? 1 : 2,
      getNode: () => state,
    }, PlayerOperations: {
      canStart: (id, operation, args, exclusion) => {
        calls.push({kind: 'check', id, operation, args, exclusion});
        if (options.changed) context.Game.turn++;
        return {Success: options.allowed ?? true, FailureReasons: ['Native attribute blocker']};
      },
      sendRequest: (id, operation, args) => {
        calls.push({kind: 'send', id, operation, args});
        if (options.immediate) state.depthUnlocked++;
      },
    }},
  };
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);
  return JSON.parse(JSON.stringify({data, calls}));
}

test('attribute purchase uses the offered native node and verifies a first unlock', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.deepEqual(data.expected, {node: 'NODE_ATTRIBUTE_A', depthUnlocked: 1});
  assert.equal(data.before.branchPoints, 1);
  assert.deepEqual(calls, [
    {kind: 'check', id: 0, operation: 'BUY', args: {ProgressionTreeNodeType: 101}, exclusion: false},
    {kind: 'send', id: 0, operation: 'BUY', args: {ProgressionTreeNodeType: 101}},
  ]);
});

test('wildcard funding can support a purchase without fabricated price calculations', () => {
  const {data} = run({points: 0, wildcards: 1});
  assert.equal(data.status, 'submitted');
  assert.equal(data.before.wildcardPoints, 1);
  assert.ok(!('expectedPointCost' in data));
});

test('an immediately applied purchase still verifies against the captured pre-submit depth', () => {
  const {data} = run({immediate: true});
  assert.equal(data.before.depthUnlocked, 0);
  assert.equal(data.expected.depthUnlocked, 1);
});

test('no points, locked/inapplicable nodes, repeatables and invalid selectors never spend points', () => {
  for (const options of [{points: 0}, {inapplicable: true}, {legendLocked: true}, {closed: true},
    {repeatable: true}, {arguments: {node: 'UNKNOWN'}}, {arguments: {node: 101}},
    {arguments: {expected_turn: true}}, {arguments: {expected_turn: 57}}]) {
    const {data, calls} = run(options);
    assert.equal(data.status, 'rejected', JSON.stringify(options));
    assert.equal(calls.length, 0);
  }
});

test('already purchased ordinary perks are no-ops', () => {
  const {data, calls} = run({purchased: true, points: 0});
  assert.equal(data.status, 'already_active');
  assert.equal(calls.length, 0);
});

test('native attribute rejection and changed context do not submit', () => {
  for (const options of [{allowed: false}, {changed: true}]) {
    const {data, calls} = run(options);
    assert.equal(data.status, 'rejected');
    assert.deepEqual(calls.map(call => call.kind), ['check']);
  }
});

test('attribute readback is targeted and retains observed branch and wildcard balances', () => {
  const {data, calls} = run({}, 'attribute_node_state.js');
  assert.deepEqual(data, {turn: 58, age: 42, playerId: 0, node: 'NODE_ATTRIBUTE_A',
    depthUnlocked: 0, branch: 'ATTRIBUTE_A', branchPoints: 1, wildcardPoints: 0});
  assert.equal(calls.length, 0);
});
