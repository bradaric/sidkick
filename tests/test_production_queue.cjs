const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'edit_production_queue.js') {
  const calls = [], baseline = [{orderType: 0, unitType: 100}, {orderType: 0, unitType: 200}, {orderType: 0, unitType: 300}];
  const action = o.action ?? 'cancel', expected = action === 'cancel' ? [baseline[0], baseline[2]] : [baseline[0], baseline[2], baseline[1]];
  let queue = o.applied ? expected : baseline;
  const city = {id: {owner: o.foreign ? 1 : 0, id: 10, type: 1}, name: 'Home', isTown: Boolean(o.town), BuildQueue: {getQueue: () => queue}};
  const ctx = {queryArguments: {settlement: 'Home', queue_token: o.stale ? 'stale' : JSON.stringify(baseline), action,
      index: 1, other_index: action === 'swap' ? 2 : null, expected_turn: 62, city_id: 10, component_type: 1, ...o.args},
    UI: {isInGame: () => true}, Locale: {compose: s => s}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)},
    Players: {get: () => ({isTurnActive: !o.inactive, Cities: {getCities: () => o.duplicate ? [city, city] : [city]}})},
    CityOperationsParametersValues: {RemoveAt: 4, Swap: 5}, CityOperationTypes: {BUILD: 100},
    Game: {turn: 62, age: 42, CityOperations: {canStart: (id, operation, args, exclusion) => {
      calls.push({kind: 'check', id, operation, args, exclusion}); if (o.changed) ctx.Game.turn++;
      if (o.changedQueue) queue = queue.slice(1);
      return {Success: !o.blocked, RequiresConfirmation: Boolean(o.confirm)};
    }, sendRequest: (id, operation, args) => {calls.push({kind: 'send', id, operation, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(`civ7/${script}`, 'utf8'), ctx);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls, expected}));
}

test('queue cancellation and adjacent swap use fixed native insertion modes and capture the entire expected queue', () => {
  for (const action of ['cancel', 'swap']) {
    const {data, calls, expected} = run({action}); assert.equal(data.status, 'submitted'); assert.deepEqual(data.expected.queue, expected);
    assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 10, type: 1}, operation: 100,
      args: action === 'cancel' ? {InsertMode: 4, QueueLocation: 1} : {InsertMode: 5, QueueSourceLocation: 1, QueueDestinationLocation: 2}});
  }
});

test('queue editing refuses stale tokens, wrong cities, invalid indices and unsupported/native-blocked operations', () => {
  for (const o of [{stale: true}, {foreign: true}, {town: true}, {duplicate: true}, {sent: true}, {inactive: true}, {changed: true}, {changedQueue: true},
    {blocked: true}, {confirm: true}, {args: {index: true}}, {args: {index: 3}}, {args: {action: 'raw'}},
    {args: {expected_turn: 61}}, {action: 'swap', args: {index: 0, other_index: 2}}, {args: {other_index: 2}}]) {
    const {data, calls} = run(o); assert.equal(data.status, 'rejected', JSON.stringify(o)); assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});

test('queue readback returns the exact owned queue without submitting or reading a foreign city', () => {
  const {data, calls, expected} = run({applied: true}, 'production_queue_state.js'); assert.deepEqual(data.queue, expected); assert.equal(calls.length, 0);
  assert.throws(() => run({foreign: true}, 'production_queue_state.js'), /city|identity/i);
});
