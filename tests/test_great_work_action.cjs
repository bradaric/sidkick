const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(options = {}, script = 'move_great_work.js') {
  const calls = [];
  const cities = [10, 20].map(id => ({id: {owner: 0, id}, Constructibles: {
    getGreatWorkBuildings: () => [{constructibleID: {owner: 0, id},
      slots: options.missingSlots && id === 20 ? undefined : id === 10
        ? (options.archived ? [] : [{greatWorkIndex: 6}])
        : (options.full ? [{greatWorkIndex: 7}] : [])},
      ...(options.ambiguous && id === 20 ? [{constructibleID: {owner: 0, id: 21}, slots: []}] : [])],
    getNumGreatWorkSlots: () => id === 10 ? 2 : 1,
  }}));
  const foreign = {id: {owner: 1, id: 20}};
  Object.defineProperty(foreign, 'Constructibles', {get: () => {throw Error('No foreign building reads');}});
  cities.push(foreign);
  const context = {
    queryArguments: {great_work_index: 6, destination_city_id: 20, destination_building: 'BUILDING_MUSEUM', expected_turn: 58, ...options.arguments},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => false},
    Players: {get: () => ({isTurnActive: true, Cities: {getCities: () => cities}, Culture: {
      getNumWorksInArchive: () => options.archived ? 1 : 0,
      getArchivedGreatWork: () => 6,
    }})},
    Constructibles: {getByComponentID: component => {
      assert.equal(component.owner, 0);
      return {owner: options.foreignDestination && component.id === 20 ? 1 : 0,
        type: component.id === 10 ? 1001 : 2002,
        damaged: component.id === 10 ? options.sourceDamaged ?? false : options.damaged ?? false};
    }},
    GameInfo: {Constructibles: {lookup: type => ({ConstructibleType: type === 1001 ? 'BUILDING_PALACE' : 'BUILDING_MUSEUM'})}},
    PlayerOperationTypes: {MOVE_GREAT_WORK: 'MOVE_WORK'},
    Game: {turn: 58, age: 42, PlayerOperations: {
      canStart: (id, operation, args, exclusion) => {
        calls.push({kind: 'check', id, operation, args, exclusion});
        if (options.changed) context.Game.age++;
        return {Success: options.allowed ?? true, RequiresConfirmation:Boolean(options.confirm), FailureReasons: ['Incompatible work']};
      },
      sendRequest: (id, operation, args) => calls.push({kind: 'send', id, operation, args}),
    }},
  };
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);
  return JSON.parse(JSON.stringify({data, calls}));
}

test('Great Work relocation sends source city and native destination building type, not component ID', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.deepEqual(data.expected, {greatWorkIndex: 6,
    location: {archived: false, cityId: 20, buildingType: 'BUILDING_MUSEUM'},inventoryPreserved:true});
  assert.deepEqual(data.verificationArguments.expected_inventory,[{index:6,location:{archived:false,cityId:20,buildingType:'BUILDING_MUSEUM'}}]);
  assert.deepEqual(calls, [
    {kind: 'check', id: 0, operation: 'MOVE_WORK', args: {Player1: 0, GreatWorkIndex: 6, DestinationCity: 20, DestinationBuilding: 2002, SourceCity: 10}, exclusion: false},
    {kind: 'send', id: 0, operation: 'MOVE_WORK', args: {Player1: 0, GreatWorkIndex: 6, DestinationCity: 20, DestinationBuilding: 2002, SourceCity: 10}},
  ]);
});

test('archived works omit SourceCity and remain proven-owned instances', () => {
  const {data, calls} = run({archived: true});
  assert.equal(data.status, 'submitted');
  assert.equal(data.before.location.archived, true);
  assert.ok(!('SourceCity' in calls[1].args));
});

test('full, damaged, foreign, ambiguous and missing-slot destinations never receive a request', () => {
  for (const options of [{full: true}, {damaged: true}, {sourceDamaged: true},
    {foreignDestination: true}, {ambiguous: true}, {missingSlots: true},
    {arguments: {destination_city_id: 999}}, {arguments: {destination_building: 'Museum'}},
    {arguments: {great_work_index: 999}}, {arguments: {great_work_index: true}},
    {arguments: {expected_turn: 57}}]) {
    const {data, calls} = run(options);
    assert.equal(data.status, 'rejected', JSON.stringify(options));
    assert.equal(calls.length, 0);
  }
});

test('already displayed at the requested destination is a no-op', () => {
  const {data, calls} = run({arguments: {destination_city_id: 10, destination_building: 'BUILDING_PALACE'}});
  assert.equal(data.status, 'already_active');
  assert.equal(calls.length, 0);
});

test('native Great Work rejection and changed context prevent relocation', () => {
  for (const options of [{allowed: false}, {changed: true}, {confirm:true}]) {
    const {data, calls} = run(options);
    assert.equal(data.status, 'rejected');
    assert.deepEqual(calls.map(call => call.kind), ['check']);
  }
});

test('Great Work readback locates one owned instance without native requests or yield simulation', () => {
  const {data, calls} = run({}, 'great_work_location_state.js');
  assert.deepEqual(data, {turn: 58, age: 42, playerId: 0, greatWorkIndex: 6,
    location: {archived: false, cityId: 10, buildingType: 'BUILDING_PALACE'}});
  assert.equal(calls.length, 0);
});

test('archive move uses the exact owned work and preserves the full owned work ledger',()=>{
  const r=run({full:true},'archive_great_work.js');assert.equal(r.data.status,'submitted');
  assert.deepEqual(r.calls.at(-1).args,{Player1:0,GreatWorkIndex:6,SourceCity:10,DestinationCity:-1,DestinationBuilding:-1});
  const expected=[{index:6,location:{archived:true,cityId:null,buildingType:null}},{index:7,location:{archived:false,cityId:20,buildingType:'BUILDING_MUSEUM'}}];
  const after=run({full:true,archived:true,arguments:{expected_inventory:expected}},'great_work_location_state.js').data;
  assert.equal(after.inventoryPreserved,true);assert.equal(after.location.archived,true);
  assert.equal(run({full:false,archived:true,arguments:{expected_inventory:expected}},'great_work_location_state.js').data.inventoryPreserved,false);
  assert.equal(run({archived:true},'archive_great_work.js').data.status,'already_active');
  assert.equal(run({sourceDamaged:true},'archive_great_work.js').data.status,'rejected');
});
