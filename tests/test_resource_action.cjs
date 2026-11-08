const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(options = {}, script = 'assign_resource.js') {
  const resource = {value: 7, isOffMap: false,uniqueResource:{resource:100}};
  const offMap = {value: 7, isOffMap: true};
  const owned = options.unknown ? [offMap] : [resource, offMap, ...(options.ambiguous ? [resource] : [])];
  const calls = [];
  const cities = [10, 20].map(id => ({id: {owner: 0, id}, owner: 0, name: id === 10 ? 'Home' : 'Target',
    Resources: {getAssignedResources: () => options.unassigned ? [] : id === (options.alreadyHere ? 20 : 10) ? [options.offMapAssigned ? offMap : resource] : [],
      getFactoryResource:()=>options.differentFactory?200:100,getNumFactoryResources:()=>options.emptyFactory?0:1,
      getAssignedResourcesCap: () => options.full ? 0 : 2}}));
  const foreign = {id: {owner: 1, id: 20}};
  Object.defineProperty(foreign, 'Resources', {get: () => {throw Error('No foreign inventory reads');}});
  cities.push(foreign);
  const context = {
    queryArguments: {resource_instance: 7, off_map: false, settlement: 'Target', expected_turn: 58, ...options.arguments},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => false},
    Locale: {compose: value => value}, GameplayMap: {getLocationFromIndex: value => ({x: value, y: 0})},
    GameInfo:{Resources:{lookup:n=>({ResourceClassType:options.factory?'RESOURCECLASS_FACTORY':'RESOURCECLASS_CITY',$hash:n??100})}},
    Players: {get: () => ({isTurnActive: true, Cities: {getCities: () => cities}, Resources: {
      getResources: () => owned, isResourceAssignmentLocked: () => options.locked ?? false,
    }})},
    PlayerOperationTypes: {ASSIGN_RESOURCE: 'ASSIGN'}, PlayerOperationParameters: {Deactivate: 0},
    Game: {turn: 58, age: 42, PlayerOperations: {
      canStart: (id, operation, args, exclusion) => {
        calls.push({kind: 'check', id, operation, args, exclusion});
        if (options.changed) context.Game.turn++;
        return {Success: options.allowed ?? true, RequiresConfirmation: Boolean(options.confirm), FailureReasons: ['Blocked']};
      },
      sendRequest: (id, operation, args) => calls.push({kind: 'send', id, operation, args}),
    }},
  };
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);
  return JSON.parse(JSON.stringify({data, calls}));
}

test('resource assignment uses one native request and a proven owned destination', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.equal(data.before.assignedCityId, 10);
  assert.deepEqual(data.expected, {resource: {instance: 7, offMap: false}, assignedCityId: 20});
  assert.deepEqual(calls, [
    {kind: 'check', id: 0, operation: 'ASSIGN', args: {Location: {x: 7, y: 0}, City: 20, Flags: false, ID: -1}, exclusion: false},
    {kind: 'send', id: 0, operation: 'ASSIGN', args: {Location: {x: 7, y: 0}, City: 20, Flags: false, ID: -1}},
  ]);
});

test('ordinary factory assignment cannot silently change another producing factory specialization',()=>{
 assert.equal(run({factory:true,differentFactory:true}).data.status,'rejected');
 assert.equal(run({factory:true,differentFactory:true,emptyFactory:true}).data.status,'submitted');
 assert.equal(run({factory:true}).data.status,'submitted');
});

test('off-map and map resources with the same number remain distinct', () => {
  const {data, calls} = run({arguments: {off_map: true}});
  assert.equal(data.status, 'submitted');
  assert.equal(data.before.assignedCityId, null);
  assert.equal(calls[1].args.ID, 7);
  assert.equal(calls[1].args.Flags, true);
});

test('resource locks, full destinations, ambiguous identities and invalid selectors never submit', () => {
  for (const options of [{locked: true}, {full: true}, {unknown: true}, {ambiguous: true},
    {arguments: {settlement: 'Foreign'}}, {arguments: {resource_instance: true}},
    {arguments: {off_map: 1}}, {arguments: {expected_turn: 57}}]) {
    const {data, calls} = run(options);
    assert.equal(data.status, 'rejected', JSON.stringify(options));
    assert.equal(calls.length, 0);
  }
  assert.match(run({locked: true}).data.reason, /locked/i);
});

test('native rejection and changed context do not become assignments', () => {
  for (const options of [{allowed: false}, {changed: true}]) {
    const {data, calls} = run(options);
    assert.equal(data.status, 'rejected');
    assert.deepEqual(calls.map(call => call.kind), ['check']);
  }
});

test('already assigned resources are no-ops even while locked', () => {
  const {data, calls} = run({alreadyHere: true, locked: true});
  assert.equal(data.status, 'already_active');
  assert.equal(calls.length, 0);
});

test('resource readback is targeted, owned-only and read-only', () => {
  const {data, calls} = run({}, 'resource_assignment_state.js');
  assert.deepEqual(data, {turn: 58, age: 42, playerId: 0,
    resource: {instance: 7, offMap: false}, assignedCityId: 10});
  assert.equal(calls.length, 0);
});

test('one resource can be natively unassigned only from its exact current owned settlement', () => {
  const {data, calls} = run({arguments: {mode: 'unassign', settlement: 'Home'}});
  assert.equal(data.status, 'submitted'); assert.equal(data.expected.assignedCityId, null);
  assert.deepEqual(calls.at(-1).args, {Location: {x: 7, y: 0}, City: 10, ID: -1, Action: 0});
  assert.deepEqual(run({offMapAssigned: true, arguments: {mode: 'unassign', settlement: 'Home', off_map: true}}).calls.at(-1).args,
    {Location: {x: 7, y: 0}, City: 10, ID: 7, Action: 0});
  assert.equal(run({unassigned: true, locked: true, arguments: {mode: 'unassign', settlement: 'Home'}}).data.status, 'already_inactive');
  for (const options of [{arguments: {mode: 'unassign', settlement: 'Target'}}, {locked: true}, {allowed: false}, {confirm: true}]) {
    const r = run({arguments: {mode: 'unassign', settlement: 'Home'}, ...options});
    assert.equal(r.data.status, 'rejected'); assert.equal(r.calls.filter(c => c.kind === 'send').length, 0);
  }
});
