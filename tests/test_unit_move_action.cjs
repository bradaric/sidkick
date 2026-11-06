const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'move_unit.js') {
  const calls = [];
  const unit = {id: {owner: o.foreignUnit ? 1 : 0, id: 20, type: 26}, type: 201,
    location: {x: 9, y: 15}, isOnMap: !o.offMap, isCommanderUnit: o.commander ?? false,
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
      Armies: {getUnitReinforcementCommanderId: () => o.reinforcing ? 7 : -1}})},
    Armies: {get: () => o.unknownPacking ? null : {owner: 0, getUnitIds: () => [unit.id]}},
    GameInfo: {Units: {lookup: () => ({Domain: o.air ? 'DOMAIN_AIR' : o.sea ? 'DOMAIN_SEA' : 'DOMAIN_LAND'})}},
    GameplayMap: {getGridWidth: () => 74, getGridHeight: () => 50,
      getRevealedState: (id, x) => o.hidden || (o.foggedTarget && x === 10) ? 0 : 2,
      getPlotDistance: () => o.distant ? 2 : 1, getIndexFromLocation: loc => loc.x === 9 ? 1 : 2,
      getLocationFromIndex: index => ({x: index === 1 ? 9 : 10, y: 15}),
      getOwner: () => o.foreignPlot ? 4 : -1,
      isWater: x => o.unknownWater ? undefined : Boolean(o.sea || o.embarked ||
        (o.embark && x === 10) || (o.disembark && x === 9))},
    RevealedStates: {HIDDEN: -1, VISIBLE: 2}, MapUnits: {getUnits: () => occupants},
    Units: {getReachableMovement: () => o.unreachable ? [] : [2], getReachableTargets: () => o.attack ? [2] : [],
      getPathTo: () => ({plots: o.detour ? [1, 3, 2] : o.emptyPath ? [] : [1, 2]})},
    UnitOperationMoveModifiers: {NONE: o.noModifier ? undefined : 0}, UnitOperationTypes: {MOVE_TO: 900}, CombatTypes: {NO_COMBAT: 0},
    Game: {turn: 59, age: 42, Combat: {testAttackInto: () => o.combat ? 1 : 0}, UnitOperations: {
      canStart: (id, operation, args, exclusion) => {
        calls.push({kind: 'check', id, operation, args, exclusion});
        if (o.changedTurn) context.Game.turn++;
        if (o.changedLocation) unit.location.x++;
        if (o.changedOccupancy) occupants = [{owner: 0, id: 31, type: 26}];
        return {Success: !o.nativeBlocked};
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
