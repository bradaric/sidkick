const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run({unitId = null, packed = false, allowed = true, weapons = 0,
  armyState = 'known', reinforcementApi = 'known', visibility = [0, 1, 2],
  missingVisibilityGetter = false, missingVisibilityEnum = false, offMap = false, commanderCommands = false} = {}) {
  const script = path.join(__dirname, '../civ7/logistics.js');
  assert.ok(fs.existsSync(script), 'bundled military logistics query exists');
  const calls = [];
  const units = [
    {id: {owner: 0, id: 1}, type: 'CARRIER', name: 'Carrier', armyId: 10, isCommanderUnit: true, isFleetCommander: true, location: {x: 2, y: 0}},
    {id: {owner: 0, id: 2}, type: 'AIR', name: 'Aircraft', isOnMap: !offMap, location: {x: 1, y: 0}},
    {id: {owner: 0, id: 3}, type: 'INFANTRY', name: 'Reinforcement', location: {x: -1, y: -1}},
  ];
  const data = vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    queryArguments: {unit_id: unitId}, UI: {isInGame: () => true}, GameContext: {localPlayerID: 0}, Locale: {compose: s => s},
    Players: {get: id => {assert.equal(id, 0); return {
      Units: {getUnits: () => units},
      WMDs: {getWeaponCount: hash => {assert.equal(hash, -20); return weapons;}, canDeployWMD: () => {throw Error('No launch checks');}},
      Armies: reinforcementApi === 'missing-object' ? undefined : {
        getUnitReinforcementCommanderId: reinforcementApi === 'missing-assignment' ? undefined :
          (component, owner) => {assert.equal(owner, 0); return component.id === 3 ? 10 : -1;},
        getUnitReinforcementETA: reinforcementApi === 'missing-eta' ? undefined :
          (component, owner) => {assert.equal(component.id, 3); assert.equal(owner, 0); return 4;},
      },
    };}},
    ...(armyState === 'missing-global' ? {} : {Armies: {get: armyState === 'missing-getter' ? undefined : army => {
      assert.equal(army, 10);
      if (armyState === 'missing-army') return null;
      return {owner: armyState === 'foreign' ? 1 : 0, localId: 10, combatUnitCapacity: 4, nonCombatUnitCapacity: 1,
        getUnitIds: armyState === 'missing-membership-getter' ? undefined : () => {
          assert.notEqual(armyState, 'foreign', 'foreign membership must not be inspected');
          return armyState === 'missing-membership' ? null : [{owner: 1, id: 9999}, ...(packed ? [{owner: 0, id: 2}] : [])];
        }};
    }}}),
    Units: {get: () => {throw Error('Only the proven owned inventory may be inspected');}},
    GameInfo: {Units: {lookup: type => ({UnitType: type, Domain: type === 'AIR' ? 'DOMAIN_AIR' : 'DOMAIN_SEA', Packable: true, WMDCapable: type === 'AIR'})},
      WMDs: [{$hash: -20, WeaponType: 'NUCLEAR', Name: 'Nuclear device'}]},
    GameplayMap: {getGridWidth: () => 3, getGridHeight: () => 1,
      getLocationFromIndex: index => {assert.ok(index >= 0 && index < 3); return {x: index, y: 0};},
      getRevealedState: missingVisibilityGetter ? undefined : (owner, x) => {assert.equal(owner, 0); return visibility[x];},
      getOwner: x => x === 1 ? 0 : 1},
    ...(missingVisibilityEnum ? {} : {RevealedStates: {HIDDEN: 0, REVEALED: 1, VISIBLE: 2}}),
    Game: {turn: 57, ...(commanderCommands ? {UnitCommands: {canStart: (id, command, args, exclusion) => {
      assert.equal(id.id, 1); assert.equal(exclusion, false); calls.push(command);
      return {Success: allowed, Plots: [0, 1, 2, 999, -1], FailureReasons: allowed ? [] : ['Blocked']};
    }, sendRequest: () => {throw Error('No commander write');}}} : {}), UnitOperations: {
      canStart: (id, operation, args, visible) => {
        assert.equal(packed, false, 'packed aircraft are not queried as deployed');
        assert.equal(armyState, 'known', 'unknown packing evidence must suppress transport checks');
        assert.equal(offMap, false, 'off-map aircraft are not queried as deployed');
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

test('missing or foreign commander membership stays unknown and suppresses deployment checks', () => {
  for (const armyState of ['missing-global', 'missing-getter', 'missing-army', 'foreign',
    'missing-membership-getter', 'missing-membership']) {
    const {data, calls} = run({unitId: 2, armyState});
    assert.equal(data.commanders[0].packedUnitIds, null, armyState);
    assert.equal(data.selectedUnit.deployed, false, armyState);
    assert.equal(data.selectedUnit.location, null, armyState);
    assert.equal(data.selectedUnit.rebase.operationAllowed, null, armyState);
    assert.deepEqual(data.selectedUnit.rebase.options, [], armyState);
    assert.equal(data.selectedUnit.reinforceArmy.operationAllowed, null, armyState);
    assert.equal(calls.length, 0, armyState);
  }
});

test('missing reinforcement assignment APIs stay unknown without losing other inventory', () => {
  for (const reinforcementApi of ['missing-object', 'missing-assignment']) {
    const {data} = run({reinforcementApi});
    assert.equal(data.reinforcements, null, reinforcementApi);
    assert.equal(data.commanders[0].combatCapacity, 4);
    assert.equal(data.airUnits[0].instanceId, 2);
    assert.equal(data.wmdStockpile[0].count, 0);
  }
});

test('missing reinforcement ETA preserves the known assignment with an unknown arrival quote', () => {
  const {data} = run({reinforcementApi: 'missing-eta'});
  assert.equal(data.reinforcements[0].commanderInstanceId, 1);
  assert.equal(data.reinforcements[0].nativeArrivalTime, null);
});

test('unknown visibility values never become transport destinations', () => {
  for (const state of [undefined, null, -1, 3]) {
    const {data} = run({unitId: 2, visibility: [0, state, 2]});
    assert.deepEqual(data.selectedUnit.rebase.options.map(option => option.location.x), [2]);
    assert.deepEqual(data.selectedUnit.reinforceArmy.options.map(option => option.location.x), [2]);
  }
});

test('missing visibility getter or enum withholds destinations without losing native permission', () => {
  for (const options of [{missingVisibilityGetter: true}, {missingVisibilityEnum: true}]) {
    const {data} = run({unitId: 2, ...options});
    assert.equal(data.selectedUnit.rebase.operationAllowed, true);
    assert.deepEqual(data.selectedUnit.rebase.options, []);
    assert.deepEqual(data.selectedUnit.reinforceArmy.options, []);
  }
});

test('off-map aircraft are not checked as deployed even with plausible coordinates', () => {
  const {data, calls} = run({unitId: 2, offMap: true});
  assert.equal(data.selectedUnit.deployed, false);
  assert.equal(data.selectedUnit.location, null);
  assert.equal(data.selectedUnit.rebase.operationAllowed, null);
  assert.equal(calls.length, 0);
});

test('targeted commander readout includes native pack permission and only visible owned checked unpack plots', () => {
  const {data, calls} = run({unitId: 1, commanderCommands: true, visibility: [0, 2, 2]});
  assert.ok(data.selectedUnit.pack);
  assert.equal(data.selectedUnit.pack.operationAllowed, true);
  assert.deepEqual(data.selectedUnit.unpack.options, [{location: {x: 1, y: 0}, availableNow: true, failureReasons: []}]);
  assert.deepEqual(calls, ['UNITCOMMAND_PACK_ARMY', 'UNITCOMMAND_UNPACK_ARMY', 'UNITCOMMAND_UNPACK_ARMY']);
  assert.equal(run({unitId: 1, commanderCommands: true, allowed: false, visibility: [0, 2, 2]}).data.selectedUnit.unpack.options[0].availableNow, false);
});
