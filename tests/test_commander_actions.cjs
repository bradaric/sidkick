const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'commander_action.js') {
  const calls = [], commander = {id: {owner: o.foreign ? 1 : 0, id: 10, type: 26}, type: 100,
    isCommanderUnit: !o.notCommander, isOnMap: !o.offMap, isEmbarked: Boolean(o.embarked), operationQueueSize: o.queued ? 1 : 0,
    armyId: {owner: 0, id: 10, type: 29}, location: o.baseArrived||o.arrived?{x:3,y:3}:{x: 2, y: 3}, Health:{damage:0,maxDamage:100},Movement: {movementMovesRemaining: o.immobile || o.baseArrived ? 0 : 3}};
  if (o.unknownEmbarkation) commander.isEmbarked = undefined;
  const member = {id: {owner: 0, id: 20, type: 26}, type: 200, isOnMap: !o.packed, location: {x: 2, y: 3}};
  const members = () => o.packed ? [member.id] : [];
  const army = {owner: o.foreignArmy ? 1 : 0, getCommanderId: () => commander.id, getUnitIds: () => o.unknownMembers ? null : members()};
  const mode = o.mode ?? 'pack';
  const context = {queryArguments: {mode, commander_id: 10, unit_id: 10, x: 2, y: 3, expected_turn: 62,
      baseline_packed_unit_ids: mode === 'unpack' || (['move', 'rail','shore','air_base'].includes(mode) && o.packed) ? [20] : [], baseline_unit_ids: [10, 20], component_type: 26,
      destination:{x:3,y:3},before_moves:3,before_damage:0,army_id:10,army_component_type:29, ...o.args},
    UI: {isInGame: () => true}, Locale: {compose: x => x}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sent ?? false},
    Players: {get: () => ({isTurnActive: !o.inactive, Units: {getUnits: () => [commander, member]}})},
    ...(o.missingArmyApi ? {} : {Armies: {get: () => army}}), GameplayMap: {getGridWidth: () => 10, getGridHeight: () => 10,
      getIndexFromLocation: loc => loc.x + loc.y * 10, getRevealedState: (id,x) => o.hidden || o.hiddenTarget && x===3 ? 0 : 2, getOwner: () => o.foreignTile ? 1 : 0,
      getLocationFromIndex: i => ({x: i % 10, y: Math.floor(i / 10)}),
      getTerrainType: x => {
        assert.ok(!o.hiddenTarget || x!==3, 'never inspect hidden destination terrain');
        return o.unknownTerrain ? 2 : o.river || o.riverAt==='source' && x===2 || o.riverAt==='target' && x===3 ? 1 : 0;
      }, isWater: x => o.disembark?x===2:Boolean(o.shore&&x===3), getPlotDistance: () => 1},
    GameInfo: {UnitOperations:{lookup:()=>o.undefinedBase?null:{OperationType:'UNITOPERATION_ESTABLISH_BASE'}},Terrains:{lookup:n=>n===2?null:{TerrainType:n===1?'TERRAIN_NAVIGABLE_RIVER':'TERRAIN_FLAT'}},Units: {lookup: () => ({UnitType:o.air?'UNIT_SQUADRON_COMMANDER':'UNIT_TEST',Domain:o.air?'DOMAIN_AIR': o.sea ? 'DOMAIN_SEA' : 'DOMAIN_LAND'})}}, MapUnits: {getUnits: () => o.occupied ? [member.id] : []},MapConstructibles:{getConstructibles:()=>o.constructed?[{owner:0,id:1,type:2}]:[]},
    Units: {getReachableMovement: () => o.notOffered ? [] : [33, 34], getReachableTargets: () => o.attack ? [33] : [],
      getPathTo: () => ({plots: o.longPath ? [32, 33, 34] : [32, 33], turns: o.futureTurn ? [1, 2] : o.longPath ? [1, 1, 1] : [1, 1]})},
    UnitOperationMoveModifiers: {NONE: 0}, UnitOperationTypes: {MOVE_TO: 900}, CombatTypes: {NO_COMBAT: -1},
    RevealedStates: {VISIBLE: 2, REVEALED: 1, HIDDEN: 0},
    Game: {turn: 62, age: 42, Combat: {testAttackInto: () => o.combat ? 0 : -1}, UnitOperations: {canStart: (id, type, args, exclusion) => {
      calls.push({kind: 'moveCheck', id, type, args, exclusion});
      if (o.changed) context.Game.turn++;
      if (o.changedRiver) o.riverAt = undefined;
      return {Success: !o.blocked,RequiresConfirmation:Boolean(o.confirm),Plots:o.notOffered?[]:[33]};
    }, sendRequest: (id, type, args) => {calls.push({kind: 'moveSend', id, type, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}},
    UnitCommands: {canStart: (id, type, args, exclusion) => {
      calls.push({kind: 'check', id, type, args, exclusion});
      if (o.changed) context.Game.turn++;
      return {Success: !o.blocked, Plots: o.notOffered ? [] : [mode === 'rail' ? 33 : 32], RequiresConfirmation: Boolean(o.confirm)};
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

test('squadron establishment uses one installed offered native base operation preserving exact packed army',()=>{
 const r=run({mode:'air_base',air:true,packed:true,args:{x:3,y:3}});assert.equal(r.data.status,'submitted');assert.equal(r.calls.at(-1).type,'UNITOPERATION_ESTABLISH_BASE');assert.equal(r.data.expected.establishmentObserved,true);
 assert.equal(run({mode:'air_base',air:true,packed:true,baseArrived:true},'commander_action_state.js').data.establishmentObserved,true);
 assert.equal(run({mode:'air_base',air:true,packed:true},'commander_action_state.js').data.establishmentObserved,false);
 for(const o of [{air:false},{undefinedBase:true},{constructed:true},{occupied:true},{hidden:true},{foreignTile:true},{shore:true},{notOffered:true},{blocked:true},{confirm:true},{changed:true},{unknownMembers:true}]){
  const r=run({mode:'air_base',air:true,packed:true,args:{x:3,y:3},...o});assert.equal(r.data.status,'rejected',JSON.stringify(o));assert.equal(r.calls.filter(c=>c.kind==='moveSend').length,0);
 }
});

test('targeted squadron logistics offers only visible empty checked land base destinations',()=>{
 const r=run({air:true,args:{unit_id:10}},'logistics.js');assert.deepEqual(r.data.selectedUnit.establishBase.options.map(o=>o.location),[{x:3,y:3}]);
 for(const o of [{hidden:true},{foreignTile:true},{occupied:true},{constructed:true},{shore:true}])assert.deepEqual(run({air:true,args:{unit_id:10},...o},'logistics.js').data.selectedUnit.establishBase.options,[]);
 assert.equal(run({air:true,confirm:true,args:{unit_id:10}},'logistics.js').data.selectedUnit.establishBase.options[0].availableNow,false);
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
  assert.equal(run({mode:'move',embarked:true,river:true,args:{x:3,y:3}}).data.status,'submitted','existing same-water river travel cannot assume isWater equals embarkation');
});

test('explicit packed shore crossing uses one direct noncombat path and proves embarkation with unchanged army',()=>{
 for(const disembark of [false,true]){
  const o={mode:'shore',packed:true,shore:true,disembark,embarked:disembark,args:{x:3,y:3}};
  const r=run(o);assert.equal(r.data.status,'submitted');assert.equal(r.data.expected.embarked,!disembark);assert.equal(r.data.expected.queueSize,0);assert.deepEqual(r.data.expected.packedUnitIds,[20]);
  assert.equal(r.calls.at(-1).type,900);
 }
 for(const o of [{shore:false},{sea:true},{unknownTerrain:true},{embarked:true},{longPath:true},{futureTurn:true},{occupied:true},{combat:true},{attack:true},{unknownMembers:true},{changed:true}]){
  const r=run({mode:'shore',packed:true,shore:true,args:{x:3,y:3},...o});assert.equal(r.data.status,'rejected');assert.equal(r.calls.filter(c=>c.kind==='moveSend').length,0);
 }
 assert.equal(run({mode:'shore',packed:true,embarked:true},'commander_action_state.js').data.embarked,true);
});

test('river-to-land and land-to-river commander transitions defer to native movement, not isWater embarkation guesses', () => {
  for (const packed of [false, true]) for (const riverAt of ['source', 'target']) {
    const {data, calls} = run({mode: 'shore', packed, riverAt, embarked: riverAt==='source', args: {x:3,y:3}});
    assert.equal(data.status, 'submitted');
    assert.equal(Object.hasOwn(data.expected, 'embarked'), false, 'never infer a river embarkation outcome from isWater');
    assert.equal(data.expected.embarkationObserved, true);
    assert.equal(data.expected.queueSize, 0);
    assert.deepEqual(data.expected.packedUnitIds, packed ? [20] : []);
    assert.deepEqual(calls.at(-1), {kind:'moveSend',id:{owner:0,id:10,type:26},type:900,args:{X:3,Y:3,Modifiers:0}});
    assert.equal(calls.filter(call=>call.kind==='moveSend').length, 1);
  }
});

test('river commander exceptions preserve native, visibility, safety and stale-state rejection', () => {
  for (const extra of [{blocked:true},{confirm:true},{notOffered:true},{occupied:true},{combat:true},{attack:true},
    {foreignTile:true},{hiddenTarget:true},{futureTurn:true},{longPath:true},{unknownMembers:true},{unknownEmbarkation:true},
    {changed:true},{changedRiver:true},{queued:true}]) {
    const {data,calls}=run({mode:'shore',packed:true,riverAt:'source',embarked:true,args:{x:3,y:3},...extra});
    assert.equal(data.status,'rejected',JSON.stringify(extra));
    assert.equal(calls.some(call=>call.kind==='moveSend'),false);
  }
  assert.equal(run({mode:'shore',riverAt:'source',embarked:true,args:{x:3,y:3},sendThrows:true}).calls.filter(call=>call.kind==='moveSend').length,1);
});

test('river transition readback reports actual native embarkation and withholds success for unknown evidence', () => {
  for (const embarked of [false,true]) {
    const {data,calls}=run({mode:'shore',packed:true,arrived:true,embarked},'commander_action_state.js');
    assert.equal(data.embarked,embarked);
    assert.equal(data.embarkationObserved,true);
    assert.deepEqual(data.location,{x:3,y:3});
    assert.deepEqual(data.packedUnitIds,[20]);
    assert.equal(calls.length,0);
  }
  assert.equal(run({mode:'shore',unknownEmbarkation:true},'commander_action_state.js').data.embarkationObserved,false);
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

test('commander rail uses one fixed native offered/selected command without simulating an ordinary path', () => {
  for (const packed of [false, true]) {
    const {data, calls} = run({mode: 'rail', packed, args: {x: 3, y: 3}});
    assert.equal(data.status, 'submitted'); assert.deepEqual(data.expected.location, {x: 3, y: 3});
    assert.equal(data.expected.queueSize, 0); assert.deepEqual(data.expected.packedUnitIds, packed ? [20] : []);
    assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 10, type: 26}, type: 'UNITCOMMAND_MOVE_BY_RAIL', args: {X: 3, Y: 3}});
    assert.equal(calls.filter(c => c.kind.startsWith('move')).length, 0);
  }
  assert.equal(run({mode: 'rail'}).data.status, 'already_active');
  assert.equal(run({mode: 'rail'}, 'commander_action_state.js').data.queueSize, 0);
});

test('rail refuses hidden/foreign/water/occupied destinations and stale/native-ineligible sources', () => {
  for (const o of [{foreign: true}, {offMap: true}, {notCommander: true}, {sea: true}, {embarked: true}, {queued: true}, {unknownMembers: true},
    {hidden: true}, {foreignTile: true}, {shore: true}, {occupied: true}, {immobile: true}, {blocked: true}, {confirm: true}, {notOffered: true},
    {changed: true}, {args: {expected_turn: 61}}, {args: {x: true}}]) {
    const {data, calls} = run({mode: 'rail', args: {x: 3, y: 3}, ...o});
    assert.equal(data.status, 'rejected', JSON.stringify(o)); assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
});

test('targeted commander logistics offers exact checked visible-owned empty land rail destinations', () => {
  const {data, calls} = run({mode: 'rail'}, 'logistics.js');
  assert.deepEqual(data.selectedUnit.rail.options[0].location, {x: 3, y: 3});
  assert.equal(data.selectedUnit.rail.options[0].availableNow, true);
  assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  for (const o of [{hidden: true}, {foreignTile: true}, {shore: true}, {occupied: true}]) {
    assert.deepEqual(run({mode: 'rail', ...o}, 'logistics.js').data.selectedUnit.rail.options, []);
  }
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
