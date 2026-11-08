const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'place_population.js') {
  const calls = [];
  const buildings = o.buildings ?? [];
  const city = {id: {owner: o.foreign ? 1 : 0, id: 10, type: 1}, name: 'Hanseong', population: 5,
    pendingPopulation: o.pending ?? 1, Growth: {isReadyToPlacePopulation: o.ready ?? true},
    Constructibles: {getIds: () => buildings.map(b => b.id)}};
  const player = {isTurnActive: !o.inactive, Cities: {getCities: () => o.duplicate ? [city, city] : [city]},
    Units:{getUnits:()=>o.migrantAlive?[{id:{owner:0,id:30,type:26},type:100}]:[]}};
  const context = {queryArguments: {settlement: 'Hanseong', x: 12, y: 37,
    improvement: 'IMPROVEMENT_FISHING_BOAT', expected_turn: 59, city_id: 10, baseline_component_ids: [], ...o.args},
    UI: {isInGame: () => !o.notInGame}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sentTurn ?? false},
    Players: {get: () => player}, Locale: {compose: x => x},
    GameInfo: {Constructibles: {lookup: value => [301, 'IMPROVEMENT_FISHING_BOAT'].includes(value)
      ? {$hash: 301, ConstructibleType: 'IMPROVEMENT_FISHING_BOAT', ConstructibleClass: 'IMPROVEMENT'} : null}},
    GameplayMap: {getGridWidth: () => 74, getGridHeight: () => 50, getIndexFromLocation: () => 2750,
      getRevealedState: () => o.hidden ? 0 : 1, getOwner: () => o.foreignPlot ? 4 : 0},
    RevealedStates: {HIDDEN: 0}, MapConstructibles: {getConstructibles: () => o.occupied ? [{owner: 0, id: 7, type: 2}] : []},
    Constructibles: {getByComponentID: id => buildings.find(b => b.id.id === id.id)},
    CityCommandTypes: {EXPAND: 900}, Game: {turn: 59, age: 42, CityCommands: {
      canStart: (id, command, args, exclusion) => {
        calls.push({kind: 'check', id, command, args, exclusion});
        if ('X' in args) {
          if (o.changed) city.pendingPopulation = 0;
          return {Success: !o.selectedBlocked}; // Selected-tile results omit plot lists.
        }
        return {Success: !o.generalBlocked, Plots: o.illegal ? [999] : o.ambiguous ? [2750, 2750] : [2750],
          ConstructibleTypes: [o.wrongImprovement ? 999 : 301, 301]};
      },
      sendRequest: (id, command, args) => {calls.push({kind: 'send', id, command, args}); if (o.sendThrows) throw Error('Lost acknowledgement');},
    }},
  };
  let data;
  try { data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context); }
  catch (error) { if (!o.sendThrows) throw error; data = {error: error.message}; }
  return JSON.parse(JSON.stringify({data, calls}));
}

test('population placement checks the offered improvement and exact tile, then sends once', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.map(c => c.kind), ['check', 'check', 'send']);
  assert.deepEqual(calls[0].args, {});
  assert.deepEqual(calls[2], {kind: 'send', id: {owner: 0, id: 10, type: 1}, command: 900, args: {X: 12, Y: 37}});
  assert.equal(data.expected.pendingPopulation, 0);
  assert.equal(data.expected.newImprovementObserved, true);
  assert.deepEqual(data.verificationArguments.baseline_component_ids, []);
});

test('not-ready, stale, unowned, hidden, occupied, illegal and mismatched improvement choices never submit', () => {
  for (const o of [{ready: false}, {pending: 0}, {foreign: true}, {duplicate: true}, {inactive: true},
    {notInGame: true}, {sentTurn: true}, {hidden: true}, {foreignPlot: true}, {occupied: true},
    {illegal: true}, {ambiguous: true}, {wrongImprovement: true}, {generalBlocked: true},
    {selectedBlocked: true}, {changed: true}, {args: {x: true}}, {args: {y: 50}},
    {args: {expected_turn: 58}}, {args: {improvement: 'BUILDING_QUAY'}}]) {
    const {data, calls} = run(o);
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
});

test('population submission never retries a lost acknowledgement', () => {
  const {data, calls} = run({sendThrows: true});
  assert.match(data.error, /Lost acknowledgement/);
  assert.equal(calls.filter(c => c.kind === 'send').length, 1);
});

test('population readback proves a new owned improvement at the exact tile, not mere tile ownership', () => {
  const building = {id: {owner: 0, id: 22, type: 2}, type: 301, location: {x: 12, y: 37}, damaged: false};
  const read = (buildings, extra = {}) => run({pending: 0, buildings, ...extra}, 'population_state.js').data;
  assert.equal(read([building]).newImprovementObserved, true);
  assert.equal(read([building]).pendingPopulation, 0);
  for (const changed of [{id: {...building.id, owner: 1}}, {type: 999}, {location: {x: 13, y: 37}}, {damaged: true}]) {
    assert.equal(read([{...building, ...changed}]).newImprovementObserved, false);
  }
  assert.equal(read([]).newImprovementObserved, false);
  assert.equal(read([building], {args: {baseline_component_ids: [building.id]}}).newImprovementObserved, false);
});

test('resettlement readback additionally requires exact Migrant consumption and population growth',()=>{
  const building={id:{owner:0,id:22,type:2},type:301,location:{x:12,y:37},damaged:false};
  const args={resettle_unit_id:30,resettle_unit_type:100,resettle_component_type:26,before_population:4,before_pending_population:0};
  const read=o=>run({pending:0,buildings:[building],args,...o},'population_state.js').data;
  assert.equal(read({}).resettleObserved,true);
  assert.equal(read({migrantAlive:true}).resettleObserved,false);
  assert.equal(read({buildings:[]}).resettleObserved,false);
  assert.equal(read({args:{...args,before_population:5}}).resettleObserved,false);
});
