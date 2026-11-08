const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'reinforce_unit.js') {
  const calls = [], commander = {id: {owner: 0, id: 10, type: 26}, type: 100, isCommanderUnit: true,
    isOnMap: true, operationQueueSize: 0, armyId: {owner: 0, id: 10, type: 29}, location: {x: 2, y: 4}};
  const unit = {id: {owner: o.foreign ? 1 : 0, id: 20, type: 26}, type: 200, isOnMap: !o.offMap,
    isCommanderUnit: false, operationQueueSize: o.queued ? 1 : 0, location: {x: 1, y: 1}};
  const army = {owner: o.foreignArmy ? 1 : 0, localId: 10, getCommanderId: () => commander.id,
    getUnitIds: () => o.packed ? [unit.id] : []};
  const assignments = {getUnitReinforcementCommanderId: () => o.unknownAssignment ? null : o.otherAssigned ? 11 : o.assigned ? 10 : -1,
    getUnitReinforcementETA: () => o.eta ?? 3};
  const context = {queryArguments: {unit_id: 20, commander_id: 10, expected_turn: 62,
      component_type: 26, commander_component_type: 26, target_army_id: 10, ...o.args},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sent ?? false},
    Players: {get: () => ({isTurnActive: !o.inactive, Units: {getUnits: () => [commander, unit]}, Armies: assignments})},
    Armies: {get: () => army}, GameInfo: {Units: {lookup: () => ({Packable: true})}},
    GameplayMap: {getGridWidth: () => 10, getGridHeight: () => 10, getIndexFromLocation: () => 42,
      getOwner: () => o.foreignTile ? 1 : 0, getRevealedState: () => o.hidden ? 0 : 2}, RevealedStates: {VISIBLE: 2},
    Game: {turn: 62, age: 42, UnitOperations: {canStart: (id, operation, args, exclusion) => {
      calls.push({kind: 'check', id, operation, args, exclusion});
      if (o.changed) context.Game.turn++;
      return {Success: !o.blocked, Plots: o.notOffered ? [] : [42]};
    }, sendRequest: (id, operation, args) => {calls.push({kind: 'send', id, operation, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('reinforcement checks exact owned commander destination and sends the native selected-plot request once', () => {
  const {data, calls} = run(); assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 20, type: 26}, operation: 'UNITOPERATION_REINFORCE_ARMY', args: {X: 2, Y: 4}});
  assert.equal(data.expected.reinforcing, true);
  assert.equal(data.verificationArguments.target_army_id, 10);
  assert.equal(run({assigned: true, offMap: true}).data.status, 'already_active');
});

test('reinforcement rejects unowned, packed, queued, unknown assignments, foreign/hidden destinations and stale/native failures', () => {
  for (const o of [{foreign: true}, {offMap: true}, {queued: true}, {packed: true}, {unknownAssignment: true}, {otherAssigned: true},
    {foreignArmy: true}, {hidden: true}, {foreignTile: true}, {notOffered: true}, {inactive: true}, {sent: true},
    {changed: true}, {blocked: true}, {args: {unit_id: true}}, {args: {expected_turn: 61}}, {args: {commander_id: 20}}]) {
    const {data, calls} = run(o); assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});

test('reinforcement state verifies native assignment rather than pretending arrival and keeps ETA unknown when invalid', () => {
  const {data, calls} = run({assigned: true, offMap: true}, 'reinforcement_state.js');
  assert.equal(data.reinforcing, true); assert.equal(data.nativeArrivalTime, 3); assert.equal(calls.length, 0);
  assert.equal(run({}, 'reinforcement_state.js').data.reinforcing, false);
  assert.equal(run({assigned: true, eta: -1}, 'reinforcement_state.js').data.nativeArrivalTime, null);
});
