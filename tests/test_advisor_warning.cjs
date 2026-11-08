const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const types = ['MILITARY', 'CULTURE', 'ECONOMIC', 'SCIENCE'].map(name => `NOTIFICATION_ADVISOR_WARNING_${name}`);

function run(o = {}, script = 'acknowledge_advisor_warning.js') {
  const calls = [];
  const id = {owner: o.foreign ? 1 : 0, id: 288, type: o.wrongComponent ? 21 : 20};
  const notification = {Type: 99, Dismissed: Boolean(o.dismissed), Expired: Boolean(o.expired), WarningType: 101, AddedOnTurn: 60};
  let reads = 0;
  const context = {
    queryArguments: {notification_id: 288, component_type: 20, expected_turn: 60,
      notification_type: o.type ?? types[0], ...o.args},
    UI: {isInGame: () => !o.notInGame},
    Configuration: {getGame: () => ({isAnyMultiplayer: Boolean(o.multiplayer)})},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sentTurn)},
    Players: {get: () => ({isTurnActive: !o.inactive})},
    PlayerOperationTypes: {VIEWED_ADVISOR_WARNING: 900},
    Game: {turn: 60, age: 42, Notifications: {
      getIdsForPlayer: () => {
        reads++;
        return o.unknownInventory ? null : o.missing || o.vanish && reads > 1 ? [] : o.duplicate ? [id, id] : [id];
      },
      find: () => o.missingRecord ? null : notification,
      getType: () => 99,
      getTypeName: () => o.type ?? types[0],
      dismiss: () => {throw Error('Generic notification dismissal must not be used');},
    }, PlayerOperations: {
      canStart: (player, operation, args, exclude) => {
        calls.push({kind: 'check', player, operation, args, exclude});
        if (o.changedTurn) context.Game.turn++;
        if (o.changedOwner) id.owner = 1;
        if (o.changedWarning) notification.WarningType++;
        if (o.changedRecordType) notification.Type++;
        return {Success: !o.blocked, RequiresConfirmation: Boolean(o.confirm), FailureReasons: ['Native advisor blocker']};
      },
      sendRequest: (player, operation, args) => {
        calls.push({kind: 'send', player, operation, args});
        if (o.sendThrows) throw Error('Lost acknowledgement');
      },
    }},
  };
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);}
  catch (error) {if (!o.sendThrows) throw error; data = {error: error.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('acknowledges exactly one owned advisor warning using the dedicated native operation', () => {
  for (const type of types) {
    const {data, calls} = run({type});
    assert.equal(data.status, 'submitted');
    assert.deepEqual(calls, [
      {kind: 'check', player: 0, operation: 900, args: {Target: {owner: 0, id: 288, type: 20}}, exclude: false},
      {kind: 'send', player: 0, operation: 900, args: {Target: {owner: 0, id: 288, type: 20}}},
    ]);
    assert.deepEqual(data.verificationArguments, {notification_id: 288, component_type: 20, notification_type: type});
    assert.equal(data.expected.acknowledged, true);
  }
});

test('foreign, stale, ambiguous, missing and non-advisor notifications never reach native permission checks', () => {
  for (const o of [{foreign: true}, {wrongComponent: true}, {missing: true}, {unknownInventory: true},
    {duplicate: true}, {missingRecord: true}, {inactive: true}, {sentTurn: true}, {notInGame: true}, {multiplayer: true},
    {args: {notification_id: true}}, {args: {component_type: true}}, {args: {expected_turn: 59}},
    ...['NOTIFICATION_PLAYER_MET', 'NOTIFICATION_CHOOSE_GOVERNMENT', 'NOTIFICATION_DIPLOMATIC_ACTION_AGENDA',
      'NOTIFICATION_ADVISOR_WARNING_FAKE'].map(type => ({type}))]) {
    const {data, calls} = run(o);
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.length, 0);
  }
});

test('native blockers, confirmations and changed notification/context never submit', () => {
  for (const o of [{blocked: true}, {confirm: true}, {changedTurn: true}, {changedOwner: true},
    {changedWarning: true}, {changedRecordType: true}, {vanish: true}]) {
    const {data, calls} = run(o);
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.some(call => call.kind === 'send'), false);
  }
  assert.deepEqual(run({blocked: true}).data.failureReasons, ['Native advisor blocker']);
});

test('inactive warnings are no-ops and a lost submission acknowledgement never retries', () => {
  for (const o of [{dismissed: true}, {expired: true}]) {
    const {data, calls} = run(o);
    assert.equal(data.status, 'already_active');
    assert.equal(calls.length, 0);
  }
  const uncertain = run({sendThrows: true});
  assert.match(uncertain.data.error, /Lost acknowledgement/);
  assert.equal(uncertain.calls.filter(call => call.kind === 'send').length, 1);
});

test('advisor readback requires proven inventory and exact type; never acknowledges an unknown/missing record', () => {
  assert.equal(run({}, 'advisor_warning_state.js').data.acknowledged, false);
  for (const o of [{missing: true}, {dismissed: true}, {expired: true}]) {
    const {data, calls} = run(o, 'advisor_warning_state.js');
    assert.equal(data.acknowledged, true);
    assert.equal(calls.length, 0);
  }
  for (const o of [{unknownInventory: true}, {duplicate: true}, {wrongComponent: true}, {missingRecord: true},
    {type: 'NOTIFICATION_PLAYER_MET', args: {notification_type: types[0]}},
    {args: {notification_type: 'NOTIFICATION_CHOOSE_GOVERNMENT'}}]) {
    assert.throws(() => run(o, 'advisor_warning_state.js'), /inventory|identity|type/i);
  }
});
