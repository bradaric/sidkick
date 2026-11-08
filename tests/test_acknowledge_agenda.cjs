const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'acknowledge_agenda.js') {
  const calls = [], id = {owner: o.foreign ? 1 : 0, id: 288, type: 20};
  const n = {Dismissed: o.dismissed ?? false, Expired: false};
  const context = {queryArguments: {notification_id: 288, expected_turn: 60, component_type: 20, ...o.args},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => false},
    Players: {get: () => ({isTurnActive: !o.inactive})}, Game: {turn: 60, age: 42,
      Notifications: {getIdsForPlayer: () => o.missing ? [] : o.duplicate ? [id, id] : [id], find: () => n,
        getType: () => 99, getTypeName: () => o.wrongType ? 'NOTIFICATION_CHOOSE_GOVERNMENT' : 'NOTIFICATION_DIPLOMATIC_ACTION_AGENDA',
        dismiss: value => {calls.push(value); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('agenda acknowledgement dismisses exactly one proven-owned agenda notification', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls, [{owner: 0, id: 288, type: 20}]);
  assert.equal(data.expected.acknowledged, true);
  for (const o of [{foreign: true}, {missing: true}, {duplicate: true}, {wrongType: true}, {inactive: true},
    {args: {expected_turn: 59}}, {args: {notification_id: true}}]) {
    const {data, calls} = run(o);
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.length, 0);
  }
  assert.equal(run({dismissed: true}).data.status, 'already_active');
  assert.equal(run({sendThrows: true}).calls.length, 1);
});

test('agenda readback requires its captured identity and never dismisses anything', () => {
  assert.equal(run({}, 'agenda_state.js').data.acknowledged, false);
  for (const o of [{dismissed: true}, {missing: true}]) {
    const {data, calls} = run(o, 'agenda_state.js');
    assert.equal(data.acknowledged, true);
    assert.equal(calls.length, 0);
  }
});
