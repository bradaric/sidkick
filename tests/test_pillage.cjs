const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'pillage_tile.js') {
  const calls = [], id = (owner, n, type = 26) => ({owner, id: n, type});
  const unit = {id: id(0, 10), type: 100, isOnMap: true, isCommanderUnit: false, isEmbarked: false,
    operationQueueSize: o.queued ? 1 : 0, location: o.coastal ? {x: 2, y: 3} : {x: 3, y: 3}, Movement: {movementMovesRemaining: o.spent ? 0 : 2}, Combat: {isCombat: !o.civilian}};
  const building = {id: id(1, 20, 2), type: 200, complete: true, damaged: Boolean(o.damaged), location: {x: 3, y: 3}};
  const baseline = [{owner: 1, instanceId: 20, componentType: 2, type: 200, complete: true, damaged: false}];
  const ctx = {queryArguments: {unit_id: 10, target_player: 1, x: 3, y: 3, target_token: JSON.stringify(baseline), expected_turn: 62,
      unit_type: 100, component_type: 26, before_moves: 2, baseline_constructibles: baseline,
      ...(o.coastal ? {kind: 'coastal', source_location: {x: 2, y: 3}} : {}),
      ...(o.route ? {kind:'route',target_token:'{"routeType":400}',before_route_type:400} : {}), ...o.args},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)},
    Players: {get: () => ({isTurnActive: !o.inactive, Units: {getUnits: () => [unit]},
      Armies: {getUnitReinforcementCommanderId: () => o.reinforcing ? 30 : -1},
      Diplomacy: {hasMet: () => !o.unmet, isAtWarWith: () => !o.peace}, Treasury: {goldBalance: 1000}})},
    GameInfo: {Routes:{lookup:n=>n===400?{RouteType:'ROUTE_TEST'}:null},Units: {lookup: () => ({Domain: o.sea || o.coastal ? 'DOMAIN_SEA' : 'DOMAIN_LAND', FormationClass: o.coastal ? 'FORMATION_CLASS_NAVAL' : 'FORMATION_CLASS_LAND_COMBAT'})}},
    GameplayMap: {getGridWidth: () => 10, getGridHeight: () => 10, getRevealedState: () => o.hidden ? 0 : 2,
      getOwner: () => o.ownTile ? 0 : 1, getIndexFromLocation: l => l.x + l.y * 10,
      getRouteType:()=>o.routeGone?-1:o.changedRoute?401:400,getPlotDistance: () => o.distant ? 2 : 1, isWater: x => x === 2}, RevealedStates: {VISIBLE: 2},
    MapUnits: {getUnits: () => o.stacked ? [unit.id, id(1, 11)] : o.coastal ? [] : [unit.id]},
    MapCities: {getCity: () => id(1, 90, 1)}, Cities: {get: () => ({owner: 1, location: o.centre ? {x: 3, y: 3} : {x: 4, y: 4}})},
    MapConstructibles: {getConstructibles: () => o.gone ? [] : [building.id]},
    Constructibles: {getByComponentID: id => {calls.push({kind: 'read', id}); return building;}},
    Game: {turn: 62, age: 42, UnitOperations: {canStart: (id, operation, args, exclusion) => {
      calls.push({kind: 'check', id, operation, args, exclusion}); if (o.changed) ctx.Game.turn++;
      if (o.changedTarget) building.type++;
      return {Success: !o.blocked, ...(o.noPlots?{}:{Plots: o.notOffered ? [] : [33]}), RequiresConfirmation: Boolean(o.confirm)};
    }, sendRequest: (id, operation, args) => {calls.push({kind: 'send', id, operation, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(`civ7/${script}`, 'utf8'), ctx);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('pillage binds an exact occupied hostile tile and complete constructible token to fixed native permission', () => {
  const {data, calls} = run(); assert.equal(data.status, 'submitted'); assert.equal(data.expected.pillageObserved, true);
  assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 10, type: 26}, operation: 'UNITOPERATION_PILLAGE', args: {X: 3, Y: 3}});
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});

test('route pillage binds a separate route token and observes route departure, never improvement damage',()=>{
 const r=run({route:true,gone:true});assert.equal(r.data.status,'submitted');assert.equal(r.calls.at(-1).operation,'UNITOPERATION_PILLAGE_ROUTE');
 assert.equal(r.calls.filter(c=>c.kind==='read').length,0);
 assert.equal(run({route:true,noPlots:true}).data.status,'submitted','native current-tile route check can omit plot lists');
 assert.equal(run({noPlots:true}).data.status,'rejected','constructible pillage picker remains unchanged');
 assert.equal(run({route:true,spent:true,routeGone:true},'pillage_state.js').data.routePillageObserved,true);
 for(const o of [{spent:false,routeGone:true},{spent:true,damaged:true},{spent:true,routeGone:true,hidden:true}])assert.equal(run({route:true,...o},'pillage_state.js').data.routePillageObserved,false);
 for(const o of [{changedRoute:true},{routeGone:true},{stacked:true},{centre:true},{peace:true},{notOffered:true}])assert.equal(run({route:true,...o}).data.status,'rejected');
});

test('pillage refuses stale target tokens, civilians, cities, shared tiles and changed/native-blocked context', () => {
  for (const o of [{spent: true}, {queued: true}, {reinforcing: true}, {civilian: true}, {sea: true}, {sent: true}, {inactive: true},
    {hidden: true}, {ownTile: true}, {centre: true}, {stacked: true}, {peace: true}, {unmet: true}, {damaged: true}, {gone: true},
    {blocked: true}, {notOffered: true}, {confirm: true}, {changed: true}, {changedTarget: true}, {args: {expected_turn: 61}}, {args: {target_token: 'stale'}}]) {
    const r = run(o); assert.equal(r.data.status, 'rejected', JSON.stringify(o)); assert.equal(r.calls.filter(c => c.kind === 'send').length, 0);
  }
});

test('pillage readback requires movement spend and visible new damage/departure, not guessed yield or hidden reads', () => {
  const good = run({spent: true, damaged: true}, 'pillage_state.js'); assert.equal(good.data.pillageObserved, true);
  assert.equal(good.calls.filter(c => c.kind === 'send').length, 0);
  for (const o of [{spent: false}, {damaged: false}, {hidden: true}]) {
    const r = run({spent: true, damaged: true, ...o}, 'pillage_state.js'); assert.equal(r.data.pillageObserved, false);
    if (o.hidden) assert.equal(r.calls.filter(c => c.kind === 'read').length, 0);
  }
  assert.equal(run({spent: true, gone: true}, 'pillage_state.js').data.pillageObserved, true);
});

test('coastal raid is a separate fixed native operation with adjacent empty land target and stable ship origin', () => {
  const {data, calls} = run({coastal: true}); assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 10, type: 26}, operation: 'UNITOPERATION_COASTAL_RAID', args: {X: 3, Y: 3}});
  assert.equal(run({coastal: true, spent: true, damaged: true}, 'pillage_state.js').data.pillageObserved, true);
  for (const o of [{distant: true}, {stacked: true}, {hidden: true}, {centre: true}, {confirm: true}, {notOffered: true}]) {
    const r = run({coastal: true, ...o}); assert.equal(r.data.status, 'rejected'); assert.equal(r.calls.filter(c => c.kind === 'send').length, 0);
  }
});
