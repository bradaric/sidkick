const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'commander_action.js') {
  const calls = [], commander = {id: {owner: o.foreign ? 1 : 0, id: 10, type: 26}, type: 100,
    isCommanderUnit: !o.notCommander, isOnMap: !o.offMap, operationQueueSize: o.queued ? 1 : 0,
    armyId: {owner: 0, id: 10, type: 29}, location: {x: 2, y: 3}, Movement: {movementMovesRemaining: o.immobile ? 0 : 3}};
  const member = {id: {owner: 0, id: 20, type: 26}, type: 200, isOnMap: !o.packed, location: {x: 2, y: 3}};
  const members = () => o.packed ? [member.id] : [];
  const army = {owner: o.foreignArmy ? 1 : 0, getCommanderId: () => commander.id, getUnitIds: () => o.unknownMembers ? null : members()};
  const mode = o.mode ?? 'pack';
  const context = {queryArguments: {mode, commander_id: 10, x: 2, y: 3, expected_turn: 62,
      baseline_packed_unit_ids: mode === 'unpack' || (mode === 'move' && o.packed) ? [20] : [], baseline_unit_ids: [10, 20], component_type: 26, ...o.args},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sent ?? false},
    Players: {get: () => ({isTurnActive: !o.inactive, Units: {getUnits: () => [commander, member]}})},
    ...(o.missingArmyApi ? {} : {Armies: {get: () => army}}), GameplayMap: {getGridWidth: () => 10, getGridHeight: () => 10,
      getIndexFromLocation: loc => loc.x + loc.y * 10, getRevealedState: () => o.hidden ? 0 : 2, getOwner: () => o.foreignTile ? 1 : 0,
      getLocationFromIndex: i => ({x: i % 10, y: Math.floor(i / 10)}),
      isWater: x => o.shore && x === 3 ? true : false, getPlotDistance: () => 1},
    GameInfo: {Units: {lookup: () => ({Domain: 'DOMAIN_LAND'})}}, MapUnits: {getUnits: () => o.occupied ? [member.id] : []},
    Units: {getReachableMovement: () => o.notOffered ? [] : [33, 34], getReachableTargets: () => o.attack ? [33] : [],
      getPathTo: () => ({plots: o.longPath ? [32, 33, 34] : [32, 33], turns: o.futureTurn ? [1, 2] : o.longPath ? [1, 1, 1] : [1, 1]})},
    UnitOperationMoveModifiers: {NONE: 0}, UnitOperationTypes: {MOVE_TO: 900}, CombatTypes: {NO_COMBAT: -1},
    RevealedStates: {VISIBLE: 2, REVEALED: 1, HIDDEN: 0},
    Game: {turn: 62, age: 42, Combat: {testAttackInto: () => o.combat ? 0 : -1}, UnitOperations: {canStart: (id, type, args, exclusion) => {
      calls.push({kind: 'moveCheck', id, type, args, exclusion});
      if (o.changed) context.Game.turn++;
      return {Success: !o.blocked};
    }, sendRequest: (id, type, args) => {calls.push({kind: 'moveSend', id, type, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}},
    UnitCommands: {canStart: (id, type, args, exclusion) => {
      calls.push({kind: 'check', id, type, args, exclusion});
      if (o.changed) context.Game.turn++;
      return {Success: !o.blocked, Plots: o.notOffered ? [] : [32]};
    }, sendRequest: (id, type, args) => {calls.push({kind: 'send', id, type, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('pack uses native pack-nearby semantics with fixed UI arguments and captured own membership', () => {
  const {data, calls} = run(); assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 10, type: 26}, type: 'UNITCOMMAND_PACK_ARMY',
    args: {X: -9999, Y: -9999, UnitAbilityType: -1}});
  assert.deepEqual(data.before.packedUnitIds, []);
  assert.equal(data.expected.packObserved, true);
});

test('commander movement preserves captured packed membership and uses one bounded noncombat path request', () => {
  for (const packed of [false, true]) {
    const {data, calls} = run({mode: 'move', packed, args: {x: 3, y: 3, max_steps: 1}});
    assert.equal(data.status, 'submitted');
    assert.deepEqual(data.expected.location, {x: 3, y: 3});
    assert.deepEqual(data.expected.packedUnitIds, packed ? [20] : []);
    assert.deepEqual(calls.at(-1), {kind: 'moveSend', id: {owner: 0, id: 10, type: 26}, type: 900, args: {X: 3, Y: 3, Modifiers: 0}});
  }
  assert.equal(run({mode: 'move', longPath: true, args: {x: 4, y: 3, max_steps: 2}}).data.status, 'submitted');
});

test('commander movement rejects future-turn, long, hostile, occupied, shore and stale paths without queueing', () => {
  for (const o of [{immobile: true}, {futureTurn: true}, {longPath: true}, {hidden: true}, {foreignTile: true},
    {attack: true}, {combat: true}, {occupied: true}, {shore: true}, {unknownMembers: true}, {queued: true}, {changed: true},
    {blocked: true}, {notOffered: true}, {args: {max_steps: true}}, {args: {max_steps: 9}}, {args: {x: -1}}]) {
    const {data, calls} = run({mode: 'move', args: {x: 3, y: 3, max_steps: 1}, ...o});
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind.endsWith('Send')).length, 0);
  }
  assert.equal(run({mode: 'move', args: {x: 3, y: 3, max_steps: 1}, sendThrows: true}).calls.filter(c => c.kind === 'moveSend').length, 1);
});

test('commander move state reports actual commander location and native packed membership', () => {
  const {data, calls} = run({mode: 'move', packed: true}, 'commander_action_state.js');
  assert.deepEqual(data.location, {x: 2, y: 3});
  assert.deepEqual(data.packedUnitIds, [20]); assert.equal(calls.length, 0);
});

test('unpack requires a currently visible owned native-offered deployment plot and exact command permission', () => {
  const {data, calls} = run({mode: 'unpack', packed: true}); assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 10, type: 26}, type: 'UNITCOMMAND_UNPACK_ARMY', args: {X: 2, Y: 3}});
  assert.equal(data.expected.unpackObserved, true);
  for (const o of [{hidden: true}, {foreignTile: true}, {notOffered: true}, {packed: false}, {args: {x: true}}]) {
    assert.equal(run({mode: 'unpack', packed: true, ...o}).data.status, 'rejected', JSON.stringify(o));
  }
});

test('commander actions reject unowned, unknown membership, queued, inactive or stale contexts', () => {
  for (const mode of ['pack', 'unpack']) {
    for (const o of [{foreign: true}, {notCommander: true}, {offMap: true}, {foreignArmy: true}, {unknownMembers: true}, {missingArmyApi: true},
      {queued: true}, {inactive: true}, {sent: true}, {changed: true}, {blocked: true}, {args: {expected_turn: 61}}, {args: {mode: 'raw'}}]) {
      const {data, calls} = run({mode, packed: mode === 'unpack', ...o});
      assert.equal(data.status, 'rejected', JSON.stringify({mode, o}));
      assert.equal(calls.filter(c => c.kind === 'send').length, 0);
    }
    assert.equal(run({mode, packed: mode === 'unpack', sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
  }
});

test('readback verifies actual new packing or full deployment of prior members without another request', () => {
  const pack = run({packed: true}, 'commander_action_state.js');
  assert.equal(pack.data.packObserved, true); assert.deepEqual(pack.data.packedUnitIds, [20]); assert.equal(pack.calls.length, 0);
  const unpack = run({mode: 'unpack'}, 'commander_action_state.js');
  assert.equal(unpack.data.unpackObserved, true); assert.deepEqual(unpack.data.deployedUnitIds, [20]); assert.equal(unpack.calls.length, 0);
  assert.equal(run({}, 'commander_action_state.js').data.packObserved, false);
  assert.equal(run({mode: 'unpack', packed: true}, 'commander_action_state.js').data.unpackObserved, false);
});
