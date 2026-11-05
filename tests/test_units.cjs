const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run({packed = false, armyState = 'known', reinforcementApi = 'known',
  reinforcementId = -1, offMap = false, location = {x: 1, y: 2},
  foreignUnits = false, noCommander = false} = {}) {
  let inventoryReads = 0;
  const owned = [
    ...(!noCommander ? [{id: {owner: 0, id: 1, type: 26}, type: 'COMMANDER', name: 'Commander',
      isCommanderUnit: true, armyId: 10, location: {x: 0, y: 0}}] : []),
    {id: {owner: 0, id: 7, type: 26}, type: 'INFANTRY', name: 'Infantry', location, isOnMap: !offMap},
  ];
  const foreign = {id: {owner: 2, id: 7, type: 26}, type: 'SECRET', isCommanderUnit: true,
    armyId: 99, name: 'SECRET_FOREIGN_UNIT', location: {x: 1, y: 2}};
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/units.js'), 'utf8'), {
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0}, Locale: {compose: s => s},
    Players: {get: () => ({
      Units: {getUnits: () => {inventoryReads++; return [...owned, ...(foreignUnits ? [foreign] : [])];}},
      Armies: reinforcementApi === 'missing-object' ? undefined : {
        getUnitReinforcementCommanderId: reinforcementApi === 'missing-getter' ? undefined : (component, owner) => {
          assert.equal(component.owner, 0); assert.equal(owner, 0);
          return component.id === 7 ? reinforcementId : -1;
        },
      },
    })},
    ...(armyState === 'missing-global' ? {} : {Armies: {
      get: armyState === 'missing-getter' ? undefined : armyId => {
        assert.equal(armyId, 10, 'only owned commanders are inspected');
        if (armyState === 'missing-army') return null;
        return {owner: armyState === 'foreign' ? 2 : 0,
          getUnitIds: armyState === 'missing-membership-getter' ? undefined : () => {
            assert.notEqual(armyState, 'foreign', 'foreign army membership is not inspected');
            return armyState === 'missing-membership' ? null : [
              {owner: 2, id: 7, type: 26}, {owner: 0, id: 7, type: 99},
              ...(packed ? [{owner: 0, id: 7, type: 26}] : []),
            ];
          }};
      },
    }}),
    Units: {get: () => {throw Error('No foreign member lookups');}},
    GameInfo: {Units: {lookup: type => {
      assert.notEqual(type, 'SECRET'); return {UnitType: type, Name: type};
    }}, Unit_Stats: {lookup: () => null}},
    Game: {turn: 58, UnitOperations: {sendRequest: () => {throw Error('No game actions');}}},
  });
  return {data: JSON.parse(JSON.stringify(data)), inventoryReads};
}

test('unit state distinguishes observed false from unknown without changing legacy fields', () => {
  const {data, inventoryReads} = run();
  const unit = data.units.find(unit => unit.instanceId === 7);
  assert.equal(unit.id, 'INFANTRY');
  assert.equal(unit.isPacked, false);
  assert.equal(unit.isReinforcing, false);
  assert.equal(unit.packedInCommander, null);
  assert.equal(unit.reinforcingCommander, null);
  assert.deepEqual(unit.location, {x: 1, y: 2});
  assert.equal(inventoryReads, 1, 'use one proven-owned inventory for membership and units');
});

test('positive packed membership suppresses plausible deployed coordinates and retains commander name', () => {
  const unit = run({packed: true}).data.units.find(unit => unit.instanceId === 7);
  assert.equal(unit.isPacked, true);
  assert.equal(unit.packedInCommander, 'Commander');
  assert.equal(unit.location, null);
});

test('missing or foreign army evidence leaves packing unknown instead of crashing or implying deployment', () => {
  for (const armyState of ['missing-global', 'missing-getter', 'missing-army', 'foreign',
    'missing-membership-getter', 'missing-membership']) {
    const unit = run({armyState}).data.units.find(unit => unit.instanceId === 7);
    assert.equal(unit.isPacked, null, armyState);
    assert.equal(unit.packedInCommander, null, armyState);
    assert.equal(unit.location, null, armyState);
    assert.equal(unit.isReinforcing, false, 'independent reinforcement evidence survives');
  }
});

test('missing reinforcement APIs leave reinforcement state unknown without discarding other unit evidence', () => {
  for (const reinforcementApi of ['missing-object', 'missing-getter']) {
    const unit = run({reinforcementApi}).data.units.find(unit => unit.instanceId === 7);
    assert.equal(unit.isReinforcing, null, reinforcementApi);
    assert.equal(unit.reinforcingCommander, null, reinforcementApi);
    assert.equal(unit.isPacked, false);
    assert.deepEqual(unit.location, {x: 1, y: 2});
  }
});

test('native reinforcement IDs retain zero and positive assignments while malformed values remain unknown', () => {
  for (const reinforcementId of [0, 10, null, -2, NaN, true, '10']) {
    const unit = run({reinforcementId}).data.units.find(unit => unit.instanceId === 7);
    const assigned = Number.isInteger(reinforcementId) && reinforcementId >= 0;
    assert.equal(unit.isReinforcing, assigned ? true : null);
    assert.equal(unit.reinforcingCommander, assigned ? reinforcementId : null);
  }
});

test('off-map and invalid-location units do not become deployed or imply packing', () => {
  for (const options of [{offMap: true}, {location: null}, {location: {x: -1, y: 2}},
    {location: {x: NaN, y: 2}}, {location: {x: 1.5, y: 2}}]) {
    const unit = run(options).data.units.find(unit => unit.instanceId === 7);
    assert.equal(unit.location, null);
    assert.equal(unit.isPacked, false, 'off-map/invalid coordinates do not prove packing');
  }
});

test('foreign inventory entries and colliding foreign member IDs are never inspected or exported', () => {
  const {data} = run({foreignUnits: true});
  assert.deepEqual(data.units.map(unit => unit.instanceId), [1, 7]);
  assert.equal(data.units[1].isPacked, false);
  assert.ok(!JSON.stringify(data).includes('SECRET'));
});

test('no owned commanders is known empty packing evidence even without army APIs', () => {
  const unit = run({noCommander: true, armyState: 'missing-global'}).data.units[0];
  assert.equal(unit.isPacked, false);
  assert.deepEqual(unit.location, {x: 1, y: 2});
});
