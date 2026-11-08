const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function fixture(options = {}) {
  const nodes = [
    {$hash: 101, ProgressionTreeNodeType: 'NODE_TECH_A'},
    {$hash: 102, ProgressionTreeNodeType: 'NODE_TECH_B'},
    {$hash: 201, ProgressionTreeNodeType: 'NODE_CIVIC'},
  ];
  const calls = [];
  const context = {
    queryArguments: {technology: 'NODE_TECH_B', expected_turn: 58, ...options.arguments},
    UI: {isInGame: () => options.inGame !== false},
    GameContext: {localPlayerID: options.playerId ?? 0, hasSentTurnComplete: () => options.sentTurn ?? false},
    Players: {get: () => options.missingPlayer ? null : {
      isTurnActive: options.activeTurn ?? true,
      Techs: {
        getResearching: () => options.noResearch ? null : {type: options.current ?? 101},
        getTargetNode: () => options.target ?? -1,
        getAllAvailableNodeTypes: () => options.available ?? [101, 102],
      },
    }},
    ProgressionTreeNodeTypes: {NO_NODE: -1},
    PlayerOperationTypes: {SET_TECH_TREE_NODE: 'SET_TECH'},
    GameInfo: {ProgressionTreeNodes: {lookup: type => nodes.find(node => node.$hash === type)}},
    Game: {turn: 58, age: 42, PlayerOperations: {
      canStart: (id, operation, args, exclusion) => {
        calls.push({kind: 'check', id, operation, args, exclusion});
        if (options.changeTurnDuringCheck) context.Game.turn++;
        return {Success: options.allowed ?? true, FailureReasons: options.reasons ?? []};
      },
      sendRequest: (id, operation, args) => {
        calls.push({kind: 'send', id, operation, args});
        if (options.sendThrows) throw Error('Response lost after submission');
      },
    }},
  };
  return {context, calls};
}

function run(options = {}, script = 'select_technology.js') {
  const {context, calls} = fixture(options);
  const result = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);
  return {data: JSON.parse(JSON.stringify(result)), calls: JSON.parse(JSON.stringify(calls))};
}

test('technology selection checks exact offered native arguments and submits once', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.equal(data.technology, 'NODE_TECH_B');
  assert.deepEqual(data.before, {turn: 58, age: 42, playerId: 0, activeTechnology: 'NODE_TECH_A'});
  assert.deepEqual(calls, [
    {kind: 'check', id: 0, operation: 'SET_TECH', args: {ProgressionTreeNodeType: 102}, exclusion: false},
    {kind: 'send', id: 0, operation: 'SET_TECH', args: {ProgressionTreeNodeType: 102}},
  ]);
});

test('rejects stale turns, nonlocal/inactive phases and malformed arguments without sending', () => {
  for (const options of [
    {arguments: {expected_turn: 57}}, {arguments: {expected_turn: true}},
    {arguments: {technology: '  '}}, {arguments: {technology: 102}},
    {inGame: false}, {playerId: -1}, {missingPlayer: true}, {activeTurn: false},
    {sentTurn: true}, {target: 102},
  ]) {
    const {data, calls} = run(options);
    assert.equal(data.status, 'rejected', JSON.stringify(options));
    assert.equal(calls.length, 0, JSON.stringify(options));
  }
});

test('only exact technology IDs offered by the local Techs interface can be selected', () => {
  for (const technology of ['NODE_CIVIC', 'NODE_UNKNOWN', 'Tech B', "'); GameContext.sendTurnComplete(); //"]) {
    const {data, calls} = run({arguments: {technology}});
    assert.equal(data.status, 'rejected');
    assert.equal(calls.length, 0);
  }
});

test('native rejection retains failure reasons and never sends', () => {
  const {data, calls} = run({allowed: false, reasons: ['Prerequisite missing']});
  assert.equal(data.status, 'rejected');
  assert.deepEqual(data.failureReasons, ['Prerequisite missing']);
  assert.deepEqual(calls.map(call => call.kind), ['check']);
});

test('an already active technology is a no-op', () => {
  const {data, calls} = run({current: 102});
  assert.equal(data.status, 'already_active');
  assert.equal(calls.length, 0);
});

test('no active technology is supported without inventing a previous selection', () => {
  const {data} = run({noResearch: true});
  assert.equal(data.status, 'submitted');
  assert.equal(data.before.activeTechnology, null);
});

test('a context change during the eligibility check prevents submission', () => {
  const {data, calls} = run({changeTurnDuringCheck: true});
  assert.equal(data.status, 'rejected');
  assert.deepEqual(calls.map(call => call.kind), ['check']);
});

test('a send exception is never retried', () => {
  const {context, calls} = fixture({sendThrows: true});
  assert.throws(() => vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/select_technology.js'), 'utf8'), context), /Response lost/);
  assert.equal(calls.filter(call => call.kind === 'send').length, 1);
});

test('fresh technology readback performs no eligibility checks or writes', () => {
  const {data, calls} = run({current: 102}, 'technology_state.js');
  assert.deepEqual(data, {turn: 58, age: 42, playerId: 0, activeTechnology: 'NODE_TECH_B'});
  assert.equal(calls.length, 0);
});
