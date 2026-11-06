const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'rebase_unit.js') {
  const calls = [], id = n => ({owner: 0, id: n, type: 26});
  const aircraft = {id: {...id(10), owner: o.foreign ? 1 : 0}, type: 100, isOnMap: !o.offMap, isCommanderUnit: false,
    operationQueueSize: o.queued ? 1 : 0, location: o.arrived ? {x: 5, y: 5} : {x: 2, y: 2},
    Movement: {movementMovesRemaining: 2}, Health: {damage: o.damaged ? 1 : 0, maxDamage: 100}};
  const commander = {id: id(30), type: 300, isCommanderUnit: true, armyId: {owner: 0, id: 1}};
  const owned = [aircraft, commander], city = {id: {owner: o.foreignCity ? 1 : 0, id: 7, type: 1}, location: {x: 5, y: 5}};
  const baseline = [{commanderId: 30, commanderType: 300, componentType: 26, armyId: 1, packedUnitIds: []}];
  const ctx = {queryArguments: {unit_id: 10, target_city_id: 7, expected_turn: 62, unit_type: 100, component_type: 26,
      target_city_component_type: 1, destination: {x: 5, y: 5}, baseline_armies: baseline, before_damage: 0, ...o.args},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)},
    Players: {get: () => ({isTurnActive: !o.inactive, Units: {getUnits: () => owned},
      Cities: {getCities: () => o.missingCity ? [] : o.ambiguousCity ? [city, city] : [city]},
      Armies: {getUnitReinforcementCommanderId: () => o.reinforcing ? 1 : -1}})},
    Armies: {get: () => ({owner: 0, localId: 1, getCommanderId: () => id(30),
      getUnitIds: () => o.unknownArmy ? null : o.packed ? [id(10)] : []})},
    GameInfo: {Units: {lookup: () => ({Domain: o.notAir ? 'DOMAIN_LAND' : 'DOMAIN_AIR', FormationClass: 'FORMATION_CLASS_AIR'})}},
    GameplayMap: {getGridWidth: () => 10, getGridHeight: () => 10, getRevealedState: () => o.hidden ? 0 : 2,
      getOwner: () => o.foreignTile ? 1 : 0, getIndexFromLocation: l => l.x + 10 * l.y}, RevealedStates: {VISIBLE: 2},
    Game: {turn: 62, age: 42, UnitOperations: {canStart: (id, operation, args, exclusion) => {
      calls.push({kind: 'check', id, operation, args, exclusion});
      if (o.changed) ctx.Game.turn++;
      if (o.changedCity) city.location = {x: 6, y: 5};
      return {Success: !o.blocked, Plots: o.notOffered ? [] : [55], RequiresConfirmation: Boolean(o.confirm)};
    }, sendRequest: (id, operation, args) => {calls.push({kind: 'send', id, operation, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(`civ7/${script}`, 'utf8'), ctx);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('air rebase checks exact city centre in native offered plots and submits once', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted'); assert.equal(data.expected.rebaseObserved, true);
  assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 10, type: 26}, operation: 'UNITOPERATION_REBASE', args: {X: 5, Y: 5}});
  assert.deepEqual(data.verificationArguments.destination, {x: 5, y: 5});
  assert.equal(run({arrived: true}).data.status, 'already_active');
});

test('rebase cannot move packed, queued, reinforcing, foreign, hidden or native-ineligible units', () => {
  for (const o of [{foreign: true}, {offMap: true}, {notAir: true}, {queued: true}, {reinforcing: true}, {unknownArmy: true},
    {packed: true}, {foreignCity: true}, {missingCity: true}, {ambiguousCity: true}, {hidden: true}, {foreignTile: true},
    {sent: true}, {inactive: true}, {changed: true}, {changedCity: true}, {blocked: true}, {notOffered: true}, {confirm: true},
    {args: {expected_turn: 61}}, {args: {unit_id: true}}]) {
    const {data, calls} = run(o); assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});

test('rebase readback proves city arrival, clear queue, stable health and preserved army membership', () => {
  const {data, calls} = run({arrived: true}, 'unit_rebase_state.js');
  assert.equal(data.rebaseObserved, true); assert.equal(calls.length, 0);
  for (const o of [{arrived: false}, {queued: true}, {damaged: true}, {offMap: true}, {hidden: true}, {packed: true}]) {
    assert.equal(run({arrived: true, ...o}, 'unit_rebase_state.js').data.rebaseObserved, false, JSON.stringify(o));
  }
});
