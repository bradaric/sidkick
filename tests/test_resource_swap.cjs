const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'swap_resources.js') {
  const calls = [], resources = [{value: 7, isOffMap: false}, {value: 7, isOffMap: true}, {value: 9, isOffMap: false}];
  const a = o.applied ? 20 : 10, b = o.applied ? 10 : 20;
  const cities = [10, 20].map(id => ({id: {owner: 0, id}, Resources: {getAssignedResources: () =>
    [...(!o.unassigned && id === a ? [resources[0]] : []), ...(id === (o.sameCity ? a : b) ? [resources[1]] : []),
      ...(o.unrelatedChanged && id === 20 ? [resources[2]] : [])]}}));
  const foreign = {id: {owner: 1, id: 30}};
  Object.defineProperty(foreign, 'Resources', {get: () => {throw Error('No foreign assignment reads');}}); cities.push(foreign);
  const expected = [{instance: 7, offMap: false, assignedCityId: 20}, {instance: 9, offMap: false, assignedCityId: null},
    {instance: 7, offMap: true, assignedCityId: 10}];
  const ctx = {queryArguments: {first_resource_instance: 7, first_off_map: false, second_resource_instance: 7, second_off_map: true,
      expected_turn: 62, expected_assignments: expected, ...o.args},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)},
    Players: {get: () => ({isTurnActive: !o.inactive, Cities: {getCities: () => cities}, Resources: {
      getResources: () => o.unknown ? resources.slice(1) : o.duplicate ? [...resources, resources[0]] : resources,
      isResourceAssignmentLocked: () => Boolean(o.locked)}})},
    GameplayMap: {getLocationFromIndex: n => ({x: n, y: 0})}, PlayerOperationTypes: {SWAP_RESOURCES: 'SWAP'},
    Game: {turn: 62, age: 42, PlayerOperations: {canStart: (id, operation, args, exclusion) => {
      calls.push({kind: 'check', id, operation, args, exclusion}); if (o.changed) ctx.Game.turn++;
      return {Success: !o.blocked, RequiresConfirmation: Boolean(o.confirm)};
    }, sendRequest: (id, operation, args) => {calls.push({kind: 'send', id, operation, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(`civ7/${script}`, 'utf8'), ctx);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('atomic resource swap keeps same-number map/off-map resources distinct and preserves every other assignment', () => {
  const {data, calls} = run(); assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.at(-1), {kind: 'send', id: 0, operation: 'SWAP', args: {Location: {x: 7, y: 0}, Location2: {x: 7, y: 0}, ID1: -1, ID2: 7}});
  assert.deepEqual(data.verificationArguments.expected_assignments, [
    {instance: 7, offMap: false, assignedCityId: 20}, {instance: 9, offMap: false, assignedCityId: null}, {instance: 7, offMap: true, assignedCityId: 10}]);
  assert.equal(run({sameCity: true}).data.status, 'already_active');
});

test('resource swap refuses locks, unknown/duplicate identities, unassigned sources and stale/native-blocked calls', () => {
  for (const o of [{locked: true}, {unknown: true}, {duplicate: true}, {unassigned: true}, {sent: true}, {inactive: true}, {changed: true},
    {blocked: true}, {confirm: true}, {args: {second_off_map: false}}, {args: {first_off_map: 1}}, {args: {expected_turn: 61}}]) {
    const {data, calls} = run(o); assert.equal(data.status, 'rejected', JSON.stringify(o)); assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});

test('resource swap readback proves both destinations and the full owned assignment ledger without writing', () => {
  const {data, calls} = run({applied: true}, 'resource_swap_state.js'); assert.equal(data.swapObserved, true); assert.equal(calls.length, 0);
  assert.equal(run({}, 'resource_swap_state.js').data.swapObserved, false);
  assert.equal(run({applied: true, unrelatedChanged: true}, 'resource_swap_state.js').data.swapObserved, false);
});
