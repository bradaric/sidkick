const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run({unitId = null, packed = false, allowed = true, weapons = 0} = {}) {
  const script = path.join(__dirname, '../civ7/logistics.js');
  assert.ok(fs.existsSync(script), 'bundled military logistics query exists');
  const calls = [];
  const units = [
    {id: {owner: 0, id: 1}, type: 'CARRIER', name: 'Carrier', armyId: 10, isCommanderUnit: true, isFleetCommander: true, location: {x: 2, y: 0}},
    {id: {owner: 0, id: 2}, type: 'AIR', name: 'Aircraft', location: {x: 1, y: 0}},
    {id: {owner: 0, id: 3}, type: 'INFANTRY', name: 'Reinforcement', location: {x: -1, y: -1}},
  ];
  const data = vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    queryArguments: {unit_id: unitId}, UI: {isInGame: () => true}, GameContext: {localPlayerID: 0}, Locale: {compose: s => s},
    Players: {get: id => {assert.equal(id, 0); return {
      Units: {getUnits: () => units},
      WMDs: {getWeaponCount: hash => {assert.equal(hash, -20); return weapons;}, canDeployWMD: () => {throw Error('No launch checks');}},
      Armies: {
        getUnitReinforcementCommanderId: (component, owner) => {assert.equal(owner, 0); return component.id === 3 ? 10 : -1;},
        getUnitReinforcementETA: (component, owner) => {assert.equal(component.id, 3); assert.equal(owner, 0); return 4;},
      },
    };}},
    Armies: {get: army => {assert.equal(army, 10); return {owner: 0, localId: 10, combatUnitCapacity: 4, nonCombatUnitCapacity: 1,
      getUnitIds: () => [{owner: 1, id: 9999}, ...(packed ? [{owner: 0, id: 2}] : [])]};}},
    Units: {get: () => {throw Error('Only the proven owned inventory may be inspected');}},
    GameInfo: {Units: {lookup: type => ({UnitType: type, Domain: type === 'AIR' ? 'DOMAIN_AIR' : 'DOMAIN_SEA', Packable: true, WMDCapable: type === 'AIR'})},
      WMDs: [{$hash: -20, WeaponType: 'NUCLEAR', Name: 'Nuclear device'}]},
    GameplayMap: {getGridWidth: () => 3, getGridHeight: () => 1,
      getLocationFromIndex: index => {assert.ok(index >= 0 && index < 3); return {x: index, y: 0};},
      getRevealedState: (owner, x) => x === 0 ? 0 : x === 1 ? 1 : 2},
    RevealedStates: {HIDDEN: 0, FOGGED: 1, VISIBLE: 2},
    Game: {turn: 57, UnitOperations: {
      canStart: (id, operation, args, visible) => {
        assert.equal(packed, false, 'packed aircraft are not queried as deployed');
        assert.equal(id.id, 2); assert.equal(visible, false); assert.equal(Object.keys(args).length, 0);
        assert.ok(['UNITOPERATION_REBASE', 'UNITOPERATION_REINFORCE_ARMY'].includes(operation));
        calls.push(operation); return {Success: allowed, Plots: [0, 1, 2, 2, 999, -1], FailureReasons: allowed ? [] : ['No eligible base'], secret: 'SECRET'};
      }, sendRequest: () => {throw Error('No movement, reinforcement or launch requests');},
    }},
  });
  return {data: JSON.parse(JSON.stringify(data)), calls};
}

test('owned logistics inventory retains native capacities, packed membership, reinforcement quotes and WMD counts', () => {
  const {data, calls} = run({packed: true, weapons: 2});
  assert.equal(data.commanders[0].combatCapacity, 4);
  assert.deepEqual(data.commanders[0].packedUnitIds, [2]);
  assert.equal(data.reinforcements[0].commanderInstanceId, 1);
  assert.equal(data.reinforcements[0].nativeArrivalTime, 4);
  assert.equal(data.wmdStockpile[0].count, 2);
  assert.equal(data.selectedUnit, null);
  assert.equal(calls.length, 0, 'inventory does not build a unit-by-destination matrix');
  assert.ok(!JSON.stringify(data).includes('9999'));
});

test('targeted rebase/reinforcement options use distinct native operations and filter hidden or invalid plots', () => {
  const {data, calls} = run({unitId: 2});
  assert.deepEqual(calls, ['UNITOPERATION_REBASE', 'UNITOPERATION_REINFORCE_ARMY']);
  assert.deepEqual(data.selectedUnit.rebase.options.map(option => option.location.x), [1, 2]);
  assert.equal(data.selectedUnit.rebase.options[0].availableNow, true);
  assert.equal(data.selectedUnit.rebase.travelTurns, null);
  assert.ok(!JSON.stringify(data).includes('SECRET'));
});

test('native rejection and packed membership never become positive transport choices', () => {
  const blocked = run({unitId: 2, allowed: false}).data.selectedUnit.rebase;
  assert.equal(blocked.operationAllowed, false);
  assert.ok(blocked.options.every(option => !option.availableNow));
  assert.deepEqual(blocked.failureReasons, ['No eligible base']);
  const {data, calls} = run({unitId: 2, packed: true});
  assert.equal(calls.length, 0, 'packed membership gates even plausible map coordinates');
  assert.equal(data.selectedUnit.rebase.operationAllowed, null);
  assert.equal(data.wmdStockpile[0].count, 0);
});

test('unknown/foreign and invalid unit selectors are rejected before targeted operation checks', () => {
  assert.throws(() => run({unitId: 9999}), /owned/i);
  assert.throws(() => run({unitId: true}), /instance/i);
  assert.throws(() => run({unitId: -1}), /instance/i);
});
