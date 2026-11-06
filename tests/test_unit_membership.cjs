const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'unit_membership.js') {
  const calls = [], mode = o.mode ?? 'join', packed = mode === 'join' ? Boolean(o.applied) : !o.applied;
  const component = id => ({owner: 0, id, type: 26});
  const unit = {id: {...component(10), owner: o.foreign ? 1 : 0}, type: 100, isOnMap: !packed,
    operationQueueSize: o.queued ? 1 : 0, location: packed ? {x: -9999, y: -9999} : o.origin ? {x: 3, y: 3} : {x: 2, y: 3},
    Movement: {movementMovesRemaining: 2}};
  const commanders = [30, 40].map(id => ({id: component(id), type: 300, isCommanderUnit: true, isOnMap: true,
    isFleetCommander: !o.notFleet,
    operationQueueSize: 0, armyId: {owner: 0, id, type: 29}, location: id === 30 ? {x: 3, y: 3} : {x: o.ambiguous ? 3 : 5, y: o.ambiguous ? 3 : 5}}));
  const owned = [unit, {id: component(11), type: 100, isOnMap: false}, ...commanders];
  const baseline = [{commanderId: 30, commanderType: 300, componentType: 26, armyId: 30,
    packedUnitIds: mode === 'join' ? [11] : [10, 11]},
    {commanderId: 40, commanderType: 300, componentType: 26, armyId: 40, packedUnitIds: []}];
  const context = {queryArguments: {mode, unit_id: 10, commander_id: 30, expected_turn: 62,
      ...(mode === 'leave' ? {x: o.origin ? 3 : 2, y: 3} : {}), unit_type: 100, component_type: 26,
      commander_type: 300, commander_component_type: 26, baseline_armies: baseline, ...o.args},
    UI: {isInGame: () => true}, Locale: {compose: x => x}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sent ?? false},
    Players: {get: () => ({isTurnActive: !o.inactive, Units: {getUnits: () => o.missing ? owned.slice(1) : owned},
      Armies: {getUnitReinforcementCommanderId: () => o.reinforcing ? 30 : -1}})},
    Armies: {get: id => ({owner: o.foreignArmy ? 1 : 0, localId: id.id,
      getCommanderId: () => component(id.id), getUnitIds: () => o.unknownArmy ? null :
        id.id === 30 ? [component(11), ...(packed ? [component(10)] : [])] : []})},
    GameInfo: {Units: {lookup: type => ({Domain: o.mixedDomain && type === 100 ? 'DOMAIN_LAND' : o.sea ? 'DOMAIN_SEA' : 'DOMAIN_LAND',
      FormationClass: o.civilian ? 'FORMATION_CLASS_CIVILIAN' : 'FORMATION_CLASS_NAVAL', Packable: !o.notPackable})}},
    GameplayMap: {getGridWidth: () => 10, getGridHeight: () => 10, getPlotDistance: () => o.distant ? 2 : o.origin ? 0 : 1,
      getIndexFromLocation: l => l.x + l.y * 10, getRevealedState: () => o.hidden ? 0 : 2,
      getLocationFromIndex: i => ({x: i % 10, y: Math.floor(i / 10)}),
      getOwner: () => o.foreignTile ? 1 : 0, isWater: () => !o.landTile}, RevealedStates: {VISIBLE: 2},
    MapUnits: {getUnits: () => o.occupied ? [component(99)] : o.origin ? [component(30)] : []},
    Game: {turn: 62, age: 42, UnitOperations: {canStart: () => ({Success: false, Plots: []})}, UnitCommands: {canStart: (id, command, args, exclusion) => {
      calls.push({kind: 'check', id, command, args, exclusion});
      if (o.changed) context.Game.turn++;
      if (o.changedOccupancy) o.occupied = true;
      return {Success: !o.blocked, Plots: o.notOffered ? [] : [mode === 'join' || o.origin ? 33 : 32], RequiresConfirmation: o.confirm};
    }, sendRequest: (id, command, args) => {calls.push({kind: 'send', id, command, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('join and leave act on one exact unit and preserve every other captured army member', () => {
  for (const mode of ['join', 'leave']) {
    const {data, calls} = run({mode});
    assert.equal(data.status, 'submitted');
    assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 10, type: 26},
      command: mode === 'join' ? 'UNITCOMMAND_ADD_TO_ARMY' : 'UNITCOMMAND_REMOVE_FROM_ARMY',
      args: mode === 'join' ? {X: 3, Y: 3} : {X: 2, Y: 3}});
    assert.deepEqual(data.expected.armies.map(a => a.packedUnitIds), [mode === 'join' ? [10, 11] : [11], []]);
    assert.equal(data.expected.packed, mode === 'join');
  }
  assert.equal(run({applied: true}).data.status, 'already_active');
  assert.equal(run({mode: 'leave', applied: true}).data.status, 'already_inactive');
});

test('individual deployment may use the exact commander origin only when no other unit occupies it', () => {
  for (const sea of [false, true]) {
    const args = sea ? {domain: 'DOMAIN_SEA'} : {};
    const r = run({mode: 'leave', origin: true, sea, args}); assert.equal(r.data.status, 'submitted');
    assert.deepEqual(r.data.expected.location, {x: 3, y: 3});
    assert.deepEqual(run({mode: 'leave', origin: true, applied: true, sea, args}, 'unit_membership_state.js').data.location, {x: 3, y: 3});
    assert.equal(run({mode: 'leave', origin: true, sea, args}, 'logistics.js').data.selectedUnit.removeFromArmy.options[0].availableNow, true);
  }
  for (const o of [{occupied: true}, {ambiguous: true}, {changedOccupancy: true}, {blocked: true}, {confirm: true}]) {
    const r = run({mode: 'leave', origin: true, ...o}); assert.equal(r.data.status, 'rejected');
    assert.equal(r.calls.filter(c => c.kind === 'send').length, 0);
  }
});

test('membership rejects unknown, foreign, ambiguous, queued, reinforcing, stale and unsupported destinations', () => {
  for (const mode of ['join', 'leave']) for (const o of [{foreign: true}, {missing: true}, {foreignArmy: true}, {unknownArmy: true},
    {queued: true}, {reinforcing: true}, {hidden: true}, {foreignTile: true}, {distant: true}, {notPackable: true}, {sea: true},
    {inactive: true}, {sent: true}, {changed: true}, {blocked: true}, {confirm: true}, {notOffered: true},
    {args: {unit_id: true}}, {args: {expected_turn: 61}}, {args: {commander_id: 40}}]) {
    const {data, calls} = run({mode, ...o}); assert.equal(data.status, 'rejected', JSON.stringify({mode, o}));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({ambiguous: true}).data.status, 'rejected');
  assert.equal(run({mode: 'leave', occupied: true}).data.status, 'rejected');
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});

test('membership readback proves selected unit membership/deployment and reports the complete army inventory', () => {
  for (const mode of ['join', 'leave']) {
    const {data, calls} = run({mode, applied: true}, 'unit_membership_state.js');
    assert.equal(data.packed, mode === 'join');
    assert.deepEqual(data.armies.map(a => a.packedUnitIds), [mode === 'join' ? [10, 11] : [11], []]);
    if (mode === 'leave') assert.deepEqual(data.location, {x: 2, y: 3});
    assert.equal(calls.length, 0);
  }
});

test('targeted logistics offers exact local commander join and individual leave plots without writing', () => {
  const join = run({}, 'logistics.js');
  assert.deepEqual(join.data.selectedUnit.addToArmy.options.map(o => o.commanderId), [30]);
  assert.equal(join.data.selectedUnit.addToArmy.options[0].availableNow, true);
  const leave = run({mode: 'leave'}, 'logistics.js');
  assert.deepEqual(leave.data.selectedUnit.removeFromArmy.options[0].location, {x: 2, y: 3});
  assert.equal(leave.data.selectedUnit.removeFromArmy.commanderId, 30);
  assert.equal(leave.calls.filter(c => c.kind === 'send').length, 0);
  assert.deepEqual(run({hidden: true}, 'logistics.js').data.selectedUnit.addToArmy.options, []);
  assert.deepEqual(run({mode: 'leave', occupied: true}, 'logistics.js').data.selectedUnit.removeFromArmy.options, []);
});

test('explicit fleet membership changes one naval combat unit and preserves captured armies', () => {
  for (const mode of ['join', 'leave']) {
    const {data, calls} = run({sea: true, mode, args: {domain: 'DOMAIN_SEA'}});
    assert.equal(data.status, 'submitted'); assert.equal(calls.filter(c => c.kind === 'send').length, 1);
    assert.deepEqual(data.expected.armies[0].packedUnitIds, mode === 'join' ? [10, 11] : [11]);
  }
  for (const mode of ['join', 'leave']) for (const o of [{landTile: true}, {mixedDomain: true}, {civilian: true}, {notFleet: true},
    {unknownArmy: true}, {occupied: true, mode: 'leave'}, {foreignTile: true}, {args: {domain: 'DOMAIN_AIR'}}]) {
    const {data, calls} = run({sea: true, mode, args: {domain: 'DOMAIN_SEA'}, ...o});
    assert.equal(data.status, 'rejected', JSON.stringify({mode, o})); assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
});

test('selected naval logistics exposes checked same-domain fleet join/leave only on water', () => {
  assert.equal(run({sea: true}, 'logistics.js').data.selectedUnit.addToArmy.options[0].commanderId, 30);
  assert.equal(run({sea: true, mode: 'leave'}, 'logistics.js').data.selectedUnit.removeFromArmy.options[0].availableNow, true);
  for (const mode of ['join', 'leave']) {
    assert.deepEqual(run({sea: true, mode, landTile: true}, 'logistics.js').data.selectedUnit[mode === 'join' ? 'addToArmy' : 'removeFromArmy'].options, []);
  }
});
