const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'unit_membership.js') {
  const calls = [], mode = o.mode ?? 'join',group=mode==='airdrop_group', packed = mode === 'join' ? Boolean(o.applied) : !o.applied;
  const component = id => ({owner: 0, id, type: 26});
  const unit = {id: {...component(10), owner: o.foreign ? 1 : 0}, type: 100, isOnMap: !packed,isEmbarked:false,
    operationQueueSize: o.queued ? 1 : 0, location: packed ? {x: -9999, y: -9999} : o.origin ? {x: 3, y: 3} : {x: 2, y: 3},
    armyId:packed?{owner:0,id:30,type:29}:null,Health:{damage:0,maxDamage:100},Movement: {movementMovesRemaining: 2}};
  if((mode==='airdrop'||group)&&o.applied)unit.location={x:2,y:1};
  const commanders = [30, 40].map(id => ({id: component(id), type: 300, isCommanderUnit: true, isOnMap: true,
    isFleetCommander: !o.notFleet,Experience:{hasPromotion:()=>!o.unpromoted},Health:{damage:0,maxDamage:100},Movement:{movementMovesRemaining:3},
    operationQueueSize: 0, armyId: {owner: 0, id, type: 29}, location: id === 30 ? {x: 3, y: 3} : {x: o.ambiguous ? 3 : 5, y: o.ambiguous ? 3 : 5}}));
  const owned = [unit, {id: component(11), type:o.aircraftPayload?200:100, isOnMap:Boolean(group&&o.applied),isEmbarked:false,location:group&&o.applied?{x:o.badLanding?8:1,y:1}:{x:-9999,y:-9999},armyId:commanders[0].armyId,operationQueueSize:0,Health:{damage:o.retainedDamage?1:0,maxDamage:100},Combat:{attacksRemaining:0},Movement:{movementMovesRemaining:0}}, ...commanders];
  const baseline = [{commanderId: 30, commanderType: 300, componentType: 26, armyId: 30,
    packedUnitIds: mode==='airdrop'?(o.extraAirMember?[10,11]:[10]):mode === 'join' ? [11] : [10, 11]},
    {commanderId: 40, commanderType: 300, componentType: 26, armyId: 40, packedUnitIds: []}];
  const context = {queryArguments: {mode, unit_id: 10, commander_id: 30, expected_turn: 62,
      ...(mode==='airdrop'||group?{x:2,y:1,airdrop:true}:mode === 'leave' ? {x: o.origin ? 3 : 2, y: 3} : {}), unit_type: 100, component_type: 26,
      ...(group?{payload_unit_ids:o.omittedPayload?[10]:[10,11],airdrop_payload:[{unitId:10,componentType:26,unitType:100,damage:0},{unitId:11,componentType:26,unitType:100,damage:0}],landing_zone:[{x:2,y:1},{x:1,y:1}]}:{}),
      commander_type: 300, commander_component_type: 26, baseline_armies: baseline,...(o.airlift?{air_transport:true}:{}),...(o.aircraftPayload?{retained_aircraft:[{unitId:11,componentType:26,unitType:200,damage:0,attacks:0,moves:0}]}:{}), ...o.args},
    UI: {isInGame: () => true}, Locale: {compose: x => x}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sent ?? false},
    Players: {get: () => ({isTurnActive: !o.inactive, Units: {getUnits: () => o.missing ? owned.slice(1) : owned},
      Cities:{getCities:()=>[{id:{owner:0,id:7,type:1},name:'Target',location:{x:3,y:3}}]},
      Armies: {getUnitReinforcementCommanderId: () => o.reinforcing ? 30 : -1}})},
    Armies: {get: id => ({owner: o.foreignArmy ? 1 : 0, localId: id.id,
      getCommanderId: () => component(id.id), getUnitIds: () => o.unknownArmy ? null :
         id.id === 30 ? [...(group&&o.applied||mode==='airdrop'&&!o.extraAirMember?[]:[component(11)]), ...(packed ? [component(10)] : [])] : []})},
    GameInfo: {UnitOperations:{lookup:()=>({OperationType:'UNITOPERATION_UNIT_AIR_DROP'})},Terrains:{lookup:()=>({TerrainType:o.river?'TERRAIN_NAVIGABLE_RIVER':'TERRAIN_FLAT'})},TypeTags:[{Type:'UNIT_100',Tag:o.wrongAirRole?'UNIT_CLASS_CAVALRY':'UNIT_CLASS_INFANTRY'}],Constructibles:{lookup:()=>({ConstructibleType:'IMPROVEMENT_TEST',ConstructibleClass:'IMPROVEMENT'})},Units: {lookup: type => ({UnitType:o.airlift&&type===300?'UNIT_SQUADRON_COMMANDER':o.merchant&&type===100?'UNIT_MERCHANT':o.migrant&&type===100?'UNIT_MIGRANT':`UNIT_${type}`,Domain:o.aircraftPayload&&type===200?'DOMAIN_AIR':o.airlift&&type===300?'DOMAIN_AIR': o.mixedDomain && type === 100 ? 'DOMAIN_LAND' : o.sea ? 'DOMAIN_SEA' : 'DOMAIN_LAND',
      FormationClass:o.aircraftPayload&&type===200?'FORMATION_CLASS_AIR':o.airlift?'FORMATION_CLASS_LAND_COMBAT': o.civilian ? 'FORMATION_CLASS_CIVILIAN' : 'FORMATION_CLASS_NAVAL', Packable: !o.notPackable})}},
    GameplayMap: {getGridWidth: () => 10, getGridHeight: () => 10, getPlotDistance: (x,y,a,b) => group?Math.max(Math.abs(x-a),Math.abs(y-b),Math.abs(x-a+y-b)):o.distant ? 2 : o.origin ? 0 : 1,
      getIndexFromLocation: l => l.x + l.y * 10, getRevealedState: () => o.hidden ? 0 : 2,
      getLocationFromIndex: i => ({x: i % 10, y: Math.floor(i / 10)}),
      getTerrainType:()=>1,getOwner: () => o.foreignTile ? 1 : 0, isWater: () => !o.landTile}, RevealedStates: {VISIBLE: 2},
    MapUnits: {getUnits: () => o.occupied ? [component(99)] : o.origin ? [component(30)] : []},
    MapConstructibles:{getConstructibles:()=>[]},
    MapCities:{getDistrict:()=>o.landingDistrict?{owner:0,id:9,type:4}:null},
    Game: {turn: 62, age: 42, UnitOperations: {canStart: () => ({Success: false, Plots: []})}, UnitCommands: {canStart: (id, command, args, exclusion) => {
      calls.push({kind: 'check', id, command, args, exclusion});
      if (o.changed) context.Game.turn++;
      if (o.changedOccupancy) o.occupied = true;
      return {Success: !o.blocked, Plots: o.notOffered ? [] : [mode === 'join' || o.origin ? 33 : 32], ConstructibleTypes:[1], RequiresConfirmation: o.confirm};
    }, sendRequest: (id, command, args) => {calls.push({kind: 'send', id, command, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  if(mode==='airdrop'||group)context.Game.UnitOperations={canStart:(id,command,args,exclusion)=>{calls.push({kind:'check',id,command,args,exclusion});if(o.changed)context.Game.turn++;return{Success:!o.blocked,Plots:o.notOffered?[]:[12],RequiresConfirmation:Boolean(o.confirm)};},sendRequest:(id,command,args)=>calls.push({kind:'send',id,command,args})};
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
test('Infantry airlift membership requires explicit promoted squadron intent and preserves all other armies',()=>{
 for(const mode of ['join','leave']){const r=run({airlift:true,landTile:true,mode});assert.equal(r.data.status,'submitted');assert.equal(r.calls.at(-1).command,mode==='join'?'UNITCOMMAND_ADD_TO_ARMY':'UNITCOMMAND_REMOVE_FROM_ARMY');}
 for(const o of [{unpromoted:true},{wrongAirRole:true},{landTile:false},{ambiguous:true}])assert.equal(run({airlift:true,landTile:true,...o}).data.status,'rejected');
});
test('single-Infantry Airdrop uses the Squadron operation, not ordinary unit leave, and rejects mixed payloads',()=>{
 const r=run({mode:'airdrop',airlift:true,landTile:true});assert.equal(r.data.status,'submitted');assert.deepEqual(r.calls.at(-1),{kind:'send',id:{owner:0,id:30,type:26},command:'UNITOPERATION_UNIT_AIR_DROP',args:{X:2,Y:1}});assert.equal(r.data.expected.packed,false);assert.deepEqual(r.data.expected.location,{x:2,y:1});
 const s=run({mode:'airdrop',airlift:true,landTile:true,applied:true},'unit_membership_state.js').data;assert.deepEqual(s.location,{x:2,y:1});assert.deepEqual(s.commanderLocation,{x:3,y:3});assert.equal(s.unitDamage,0);
 for(const o of [{extraAirMember:true},{unpromoted:true},{occupied:true},{hidden:true},{foreignTile:true},{river:true},{notOffered:true},{changed:true}])assert.equal(run({mode:'airdrop',airlift:true,landTile:true,...o}).data.status,'rejected');
});
test('one Infantry can Airdrop while exact stationed aircraft remain packed and unspent',()=>{
 const r=run({mode:'airdrop',airlift:true,landTile:true,extraAirMember:true,aircraftPayload:true});assert.equal(r.data.status,'submitted');assert.deepEqual(r.data.expected.armies[0].packedUnitIds,[11]);assert.equal(r.data.expected.retainedAircraftPreserved,true);
 const base={mode:'airdrop',airlift:true,landTile:true,extraAirMember:true,aircraftPayload:true,applied:true};
 assert.equal(run(base,'unit_membership_state.js').data.retainedAircraftPreserved,true);
 assert.equal(run({...base,retainedDamage:true},'unit_membership_state.js').data.retainedAircraftPreserved,false);
 const logistics=run({mode:'airdrop',airlift:true,landTile:true,extraAirMember:true,aircraftPayload:true,args:{unit_id:30}},'logistics.js').data.selectedUnit.airdrop;
 assert.deepEqual(logistics.payloadUnitIds,[10]);assert.deepEqual(logistics.retainedAircraftIds,[11]);assert.equal(logistics.supportedPayload,true);
});
test('mass Infantry Airdrop binds the complete ground payload and verifies all landings inside the safe explicit footprint',()=>{
 const base={mode:'airdrop_group',airlift:true,landTile:true};const r=run(base);assert.equal(r.data.status,'submitted');assert.equal(r.calls.filter(c=>c.kind==='send').length,1);assert.deepEqual(r.data.expected.armies[0].packedUnitIds,[]);assert.equal(r.data.expected.massAirdropApplied,true);assert.equal(r.data.verificationArguments.landing_zone.length,7);
 assert.equal(run({...base,applied:true},'unit_membership_state.js').data.massAirdropApplied,true);
 for(const extra of [{badLanding:true},{retainedDamage:true}])assert.equal(run({...base,applied:true,...extra},'unit_membership_state.js').data.massAirdropApplied,false);
 for(const extra of [{omittedPayload:true},{occupied:true},{landingDistrict:true},{hidden:true},{unpromoted:true},{river:true}])assert.equal(run({...base,...extra}).data.status,'rejected');
 const logistics=run({...base,args:{unit_id:30}},'logistics.js').data.selectedUnit.airdrop;
 assert.deepEqual(logistics.payloadUnitIds,[10,11]);assert.equal(logistics.supportedPayload,true);assert.equal(logistics.options[0].landingZone.length,7);
});
test('selected airlift logistics exposes promoted Infantry membership and exact visible empty landing offers',()=>{
 const join=run({airlift:true,landTile:true},'logistics.js').data.selectedUnit;
 assert.equal(join.addToArmy.options[0].transport,'squadron-infantry');
 const leave=run({airlift:true,landTile:true,mode:'leave'},'logistics.js').data.selectedUnit;
 assert.equal(leave.removeFromArmy.options[0].transport,'squadron-infantry');
 const drop=run({airlift:true,landTile:true,mode:'airdrop',args:{unit_id:30}},'logistics.js').data.selectedUnit.airdrop;
 assert.deepEqual(drop.payloadUnitIds,[10]);assert.equal(drop.options[0].availableNow,true);assert.deepEqual(drop.options[0].location,{x:2,y:1});
 assert.equal(run({airlift:true,landTile:true,unpromoted:true},'logistics.js').data.selectedUnit.addToArmy.options.length,0);
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

test('selected Migrant logistics exposes visible native expansion choices and exact improvement IDs',()=>{
  const r=run({migrant:true},'logistics.js');assert.equal(r.data.selectedUnit.resettle.options[0].improvement,'IMPROVEMENT_TEST');
  assert.equal(run({migrant:true,hidden:true},'logistics.js').data.selectedUnit.resettle.options.length,0);
});

test('selected Merchant logistics exposes only visible owned native road city endpoints',()=>{
  assert.equal(run({merchant:true},'logistics.js').data.selectedUnit.connectWithRoad.options[0].targetCityId,7);
  assert.deepEqual(run({merchant:true,hidden:true},'logistics.js').data.selectedUnit.connectWithRoad.options,[]);
});
