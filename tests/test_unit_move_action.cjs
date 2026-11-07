const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'move_unit.js') {
  const calls = [];
  const unit = {id: {owner: o.foreignUnit ? 1 : 0, id: 20, type: 26}, type: 201,
    location: {x: 9, y: 15}, isOnMap: !o.offMap, isCommanderUnit: o.commander ?? false,
    isEmbarked: ['rail', 'advance','travel'].includes(o.args?.mode) ? false : undefined, operationQueueSize: 0,Health:{damage:0,maxDamage:100},
    Combat: o.combatUnit ? {isCombat: true} : undefined,
    Movement: {movementMovesRemaining: o.moves ?? 3}, ...o.unit};
  if (o.embark || o.disembark) unit.isEmbarked = Boolean(o.disembark);
  if (o.unknownEmbarkation) unit.isEmbarked = undefined;
  const units = o.missing ? [] : [unit];
  if (o.duplicate) units.push(unit);
  if (o.packed || o.unknownPacking) units.push({id: {owner: 0, id: 30, type: 26}, isCommanderUnit: true, armyId: 8});
  let occupants = o.occupied ? [{owner: 4, id: 99, type: 26}] : [];
  const context = {queryArguments: {unit_id: 20, x: 10, y: 15, expected_turn: 59, ...o.args},
    UI: {isInGame: () => !o.notInGame}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sentTurn ?? false},
    Players: {get: () => ({isTurnActive: !o.inactive, Units: {getUnits: () => units},
      Diplomacy: {hasMet: () => !o.unmet, isAtWarWith: () => !o.peace,willMoveStartWar:()=>({Success:Boolean(o.startsWar)})},
      Armies: {getUnitReinforcementCommanderId: () => o.reinforcing ? 7 : -1}})},
    Armies: {get: () => o.unknownPacking ? null : {owner: 0, getUnitIds: () => [unit.id]}},
    GameInfo: {Units: {lookup: () => ({Domain: o.air ? 'DOMAIN_AIR' : o.sea ? 'DOMAIN_SEA' : 'DOMAIN_LAND',
      FormationClass: o.sea ? 'FORMATION_CLASS_NAVAL' : 'FORMATION_CLASS_LAND_COMBAT'})}},
    MapCities: {getDistrict: () => o.district ? {owner: 4, id: 99, type: 4} : null},
    GameplayMap: {getGridWidth: () => 74, getGridHeight: () => 50,
      getRevealedState: (id, x) => o.hidden || (o.foggedTarget && x === 10) ? 0 : 2,
      getPlotDistance: (x,y,a,b) => o.travel?Math.abs(x-a):o.distant ? 2 : 1, getIndexFromLocation: loc => o.travel?loc.x-8:loc.x === 9 ? 1 : 2,
      getLocationFromIndex: index => ({x:o.travel?index+8:index === 1 ? 9 : 10, y: 15}),
      getOwner: () => o.foreignPlot ? 4 : o.ownedPlot ? 0 : -1,
      isWater: x => o.unknownWater ? undefined : Boolean(o.sea || o.embarked ||
        (o.embark && x === 10) || (o.disembark && x === 9))},
    RevealedStates: {HIDDEN: -1, VISIBLE: 2}, MapUnits: {getUnits: () => occupants},
    Units: {getReachableMovement: () => o.unreachable ? [] : o.travel?[2,3]:[2], getReachableTargets: () => o.attack ? [2] : [],
      getPathTo: () => ({plots:o.travel?[1,2,3]: o.detour ? [1, 3, 2] : o.emptyPath ? [] : [1, 2],...(o.travel?{turns:o.future?[1,1,2]:[1,1,1]}:{})})},
    UnitOperationMoveModifiers: {NONE: o.noModifier ? undefined : 0}, UnitOperationTypes: {MOVE_TO: 900}, CombatTypes: {NO_COMBAT: 0},
    Game: {turn: 59, age: 42, Combat: {testAttackInto: () => o.combat ? 1 : 0}, UnitCommands: {
      canStart: (id, operation, args, exclusion) => {calls.push({kind: 'railCheck', id, operation, args, exclusion});
        if (o.changedTurn) context.Game.turn++;
        return {Success: !o.nativeBlocked, Plots: o.unreachable ? [] : [2], RequiresConfirmation: Boolean(o.confirm)};},
      sendRequest: (id, operation, args) => calls.push({kind: 'railSend', id, operation, args}),
    }, UnitOperations: {
      canStart: (id, operation, args, exclusion) => {
        calls.push({kind: 'check', id, operation, args, exclusion});
        if (o.changedTurn) context.Game.turn++;
        if (o.changedLocation) unit.location.x++;
        if (o.changedOccupancy) occupants = [{owner: 0, id: 31, type: 26}];
        return {Success: !o.nativeBlocked, RequiresConfirmation: Boolean(o.confirm)};
      },
      sendRequest: (id, operation, args) => {calls.push({kind: 'send', id, operation, args}); if (o.sendThrows) throw Error('Lost acknowledgement');},
    }},
  };
  let data;
  try { data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context); }
  catch (error) { if (!o.sendThrows) throw error; data = {error: error.message}; }
  return JSON.parse(JSON.stringify({data, calls}));
}

test('one-tile land and sea movement explicitly uses NONE and never calls the attack/swap UI helper', () => {
  for (const sea of [false, true]) {
    const {data, calls} = run({sea});
    assert.equal(data.status, 'submitted');
    assert.deepEqual(calls[1], {kind: 'send', id: {owner: 0, id: 20, type: 26}, operation: 900,
      args: {X: 10, Y: 15, Modifiers: 0}});
    assert.deepEqual(data.expected.location, {x: 10, y: 15});
    assert.equal(calls.filter(c => c.kind === 'send').length, 1);
  }
});
test('bounded ordinary travel validates every native current-turn edge and submits MOVE_TO once',()=>{
 for(const sea of [false,true]){
  const r=run({travel:true,sea,unit:{isEmbarked:false},args:{mode:'travel',x:11,max_steps:2}});assert.equal(r.data.status,'submitted');assert.equal(r.calls.filter(c=>c.kind==='send').length,1);assert.equal(r.data.expected.queueSize,0);assert.deepEqual(r.data.path,[{x:9,y:15},{x:10,y:15},{x:11,y:15}]);
 }
 for(const o of [{future:true},{foggedTarget:true},{occupied:true},{attack:true},{combat:true},{changedTurn:true},{changedOccupancy:true},{unit:{operationQueueSize:1}},{unreachable:true},{args:{mode:'travel',x:11,max_steps:1}}]){
  const r=run({travel:true,args:{mode:'travel',x:11,max_steps:2},...o});assert.equal(r.data.status,'rejected');assert.equal(r.calls.some(c=>c.kind==='send'),false);
 }
});
test('audit: strict travel still rejects embarked land on isWater-false source before checking native permission', () => {
  const {data, calls} = run({travel:true, unit:{isEmbarked:true}, args:{mode:'travel',x:11,max_steps:2}});
  assert.equal(data.status,'rejected');
  assert.match(data.reason,/same-surface/);
  assert.equal(calls.length,0,'remaining strict-travel guard, not a native rejection; use normal movement instead');
});
test('peaceful foreign travel binds exact met owner and positive native nonwar/noncombat evidence',()=>{
 const base={travel:true,foreignPlot:true,peace:true,args:{mode:'travel',x:11,max_steps:2,peaceful_player_id:4}};
 assert.equal(run(base).data.status,'submitted');
 for(const extra of [{startsWar:true},{peace:false},{unmet:true},{district:true},{nativeBlocked:true},{confirm:true},{args:{...base.args,peaceful_player_id:3}},{args:{mode:'travel',x:11,max_steps:2}}])assert.equal(run({...base,...extra}).data.status,'rejected');
 const r=run({...base,unit:{location:{x:11,y:15}}},'unit_position_state.js');assert.equal(r.data.peacePreserved,true);
});

test('an already-embarked land unit can take a water-to-water step without changing embarkation state', () => {
  const {data, calls} = run({embarked: true});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls[1].args, {X: 10, Y: 15, Modifiers: 0});
  assert.equal(calls.filter(c => c.kind === 'send').length, 1);
});

test('foreign, packed, reinforcing, off-map, immobile and stale units cannot move', () => {
  for (const o of [{foreignUnit: true}, {missing: true}, {duplicate: true}, {packed: true}, {unknownPacking: true},
    {reinforcing: true}, {offMap: true}, {moves: 0}, {commander: true}, {air: true}, {inactive: true},
    {sentTurn: true}, {notInGame: true}, {args: {expected_turn: 58}}, {args: {unit_id: true}},
    {args: {x: -1}}, {args: {y: 50}}, {changedTurn: true}, {changedLocation: true}]) {
    const {data, calls} = run(o);
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
});

test('land units can cross a shore only with consistent source embarkation and exact native step permission', () => {
  for (const o of [{embark: true}, {disembark: true}]) {
    const {data, calls} = run(o);
    assert.equal(data.status, 'submitted');
    assert.equal(data.before.embarked, Boolean(o.disembark));
    assert.equal(data.expected.embarked, Boolean(o.embark));
    assert.equal(calls.filter(c => c.kind === 'send').length, 1);
  }
  for (const o of [{embark: true, unknownEmbarkation: true}, {disembark: true, unknownEmbarkation: true},
    {embark: true, nativeBlocked: true}, {disembark: true, nativeBlocked: true}]) {
    assert.equal(run(o).data.status, 'rejected');
  }
});

test('fogged, occupied, foreign, non-adjacent, attack and detour destinations cannot move', () => {
  for (const o of [{hidden: true}, {foggedTarget: true}, {occupied: true}, {foreignPlot: true}, {distant: true},
    {unreachable: true}, {attack: true}, {combat: true},
    {unknownWater: true}, {detour: true}, {emptyPath: true},
    {nativeBlocked: true}, {noModifier: true}, {changedOccupancy: true}]) {
    const {data, calls} = run(o);
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
});

test('movement submission never retries a lost acknowledgement', () => {
  const {data, calls} = run({sendThrows: true});
  assert.match(data.error, /Lost acknowledgement/);
  assert.equal(calls.filter(c => c.kind === 'send').length, 1);
});

test('readback reports the exact owned component, type and actual location without submitting', () => {
  const {data, calls} = run({unit: {location: {x: 10, y: 15}}}, 'unit_position_state.js');
  assert.equal(data.unitId, 20);
  assert.equal(data.unitType, 201);
  assert.equal(data.componentType, 26);
  assert.deepEqual(data.location, {x: 10, y: 15});
  assert.equal(calls.length, 0);
  assert.equal(run({offMap: true}, 'unit_position_state.js').data.location, null);
  assert.equal(run({unit: {isEmbarked: true}}, 'unit_position_state.js').data.embarked, true);
  assert.equal(run({unit: {isEmbarked: false}}, 'unit_position_state.js').data.embarked, false);
  assert.equal(run({}, 'unit_position_state.js').data.embarked, null);
});

test('readback withholds plausible coordinates after packing or reinforcement, including unknown packing state', () => {
  for (const o of [{packed: true}, {unknownPacking: true}, {reinforcing: true}]) {
    assert.equal(run(o, 'unit_position_state.js').data.location, null);
  }
});

test('ordinary-unit rail uses only the exact native rail command and verifies clear-queue arrival', () => {
  const {data, calls} = run({ownedPlot: true, distant: true, args: {mode: 'rail'}});
  assert.equal(data.status, 'submitted'); assert.equal(data.expected.queueSize, 0);
  assert.deepEqual(calls.at(-1), {kind: 'railSend', id: {owner: 0, id: 20, type: 26}, operation: 'UNITCOMMAND_MOVE_BY_RAIL', args: {X: 10, Y: 15}});
  assert.equal(run({}, 'unit_position_state.js').data.queueSize, 0);
  for (const o of [{sea: true}, {ownedPlot: false}, {foreignPlot: true}, {packed: true}, {unknownPacking: true}, {reinforcing: true},
    {occupied: true}, {hidden: true}, {nativeBlocked: true}, {unreachable: true}, {confirm: true}, {changedTurn: true}, {unit: {operationQueueSize: 1}},
    {unit: {isEmbarked: true}}, {args: {mode: 'raw'}}]) {
    const r = run({ownedPlot: true, args: {mode: 'rail'}, ...o});
    assert.equal(r.data.status, 'rejected', JSON.stringify(o)); assert.equal(r.calls.filter(c => c.kind === 'railSend').length, 0);
  }
});

test('explicit wartime advance enters only an empty visible enemy non-district field with NONE', () => {
  const {data, calls} = run({combatUnit: true, foreignPlot: true, args: {mode: 'advance', target_player: 4}});
  assert.equal(data.status, 'submitted'); assert.deepEqual(calls.at(-1).args, {X: 10, Y: 15, Modifiers: 0});
  assert.equal(data.expected.queueSize, 0);
  for (const o of [{combatUnit: false}, {peace: true}, {unmet: true}, {district: true}, {occupied: true}, {hidden: true}, {confirm: true},
    {combat: true}, {foreignPlot: false}, {unit: {operationQueueSize: 1}}, {args: {mode: 'advance', target_player: 3}}]) {
    const r = run({combatUnit: true, foreignPlot: true, args: {mode: 'advance', target_player: 4}, ...o});
    assert.equal(r.data.status, 'rejected', JSON.stringify(o)); assert.equal(r.calls.filter(c => c.kind === 'send').length, 0);
  }
});
