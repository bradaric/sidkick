const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run({ args = { unit_id: 7, x: 1, y: 0 }, hiddenPath = false, packed = false, zoc = false, railAllowed = true, moves = 2 } = {}) {
  const script = path.join(__dirname, '../civ7/movement.js');
  assert.ok(fs.existsSync(script), 'bundled movement query exists');
  const nativeCalls = [];
  const unit = { id: { owner: 0, id: 7, type: 26 }, type: 'SETTLER', location: packed ? { x: -1, y: -1 } : { x: 0, y: 0 },
    Movement: { movementMovesRemaining: moves }, Combat: { hasMovedIntoZOC: zoc } };
  const result = vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    queryArguments: args, UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    Players: { get: id => { assert.equal(id, 0); return {
      Units: { getUnits: () => [unit] }, Cities: { getCities: () => [{ name: 'Home', location: { x: 0, y: 0 } }] },
      Stats: { numSettlements: 1, settlementCap: 3 },
    }; } },
    Units: {
      getReachableMovement: () => { assert.equal(packed, false); return [0, 1, 2, 3]; },
      getReachableTargets: () => [2],
      getPathTo: (id, dest) => { assert.equal(packed, false); nativeCalls.push(dest.x); return { plots: hiddenPath ? [0, 3, 1] : [0, 1], turns: [1, 1, 2], obstacles: [{ x: 999 }] }; },
    },
    GameplayMap: {
      getGridWidth: () => 4, getGridHeight: () => 1,
      getLocationFromIndex: i => ({ x: i, y: 0 }), getIndexFromLocation: p => p.x,
      getRevealedState: (id, x) => x === 3 ? 0 : 1,
      getPlotDistance: (x, y, xx) => Math.abs(x - xx),
      getTerrainType: x => { assert.notEqual(x, 3, 'hidden terrain is not inspected'); return 'GRASS'; },
      getFeatureType: () => 'FOREST', getBiomeType: () => 'TEMPERATE', isFreshWater: () => true,
      getResourceType: x => { assert.notEqual(x, 3, 'hidden resources are not inspected'); return x === 2 ? 'TEA' : null; },
      getYields: () => [[0, 2]],
    },
    RevealedStates: { HIDDEN: 0, VISIBLE: 1 }, UnitOperationTypes: { MOVE_TO: 'MOVE' },
    UnitOperationMoveModifiers: {ATTACK: 1, MOVE_IGNORE_UNEXPLORED_DESTINATION: 2},
    GameInfo: { Units: { lookup: () => ({ Name: 'Settler', FoundCity: true }) },
      Terrains: { lookup: () => ({ TerrainType: 'GRASS' }) }, Features: { lookup: () => ({ FeatureType: 'FOREST' }) },
      Biomes: { lookup: () => ({ BiomeType: 'TEMPERATE' }) }, Resources: { lookup: type => type ? { ResourceType: type, Name: type } : null },
      Yields: { lookup: () => ({ YieldType: 'YIELD_FOOD' }) },
    },
    Game: { turn: 109,
      UnitCommands: { canStart: (id, command, options, visible) => {
        assert.equal(packed, false, 'packed units must not be checked as deployed rail passengers');
        assert.equal(id.owner, 0); assert.equal(id.id, 7); assert.equal(command, 'UNITCOMMAND_MOVE_BY_RAIL');
        assert.equal(Object.keys(options).length, 0); assert.equal(visible, false);
        return { Success: railAllowed, FailureReasons: railAllowed ? [] : ['No rail access'], Plots: [1, 1, 3, -1, 999] };
      } },
      UnitOperations: { canStart: (id, op, options, visible) => {
      assert.equal(id.owner, 0); assert.equal(visible, false);
      if (op === 'UNITOPERATION_FOUND_CITY') return { Success: false, FailureReasons: ['Too close'] };
      if (op === 'UNITOPERATION_FOUND_CITY_ADJACENT_PLOT') return { Success: false, Plots: [3] };
      assert.equal(op, 'MOVE'); assert.equal(options.Modifiers, 2); nativeCalls.push(options.X); return { Success: true };
    } } },
  });
  return { data: JSON.parse(JSON.stringify(result)), nativeCalls };
}

test('movement options omit attack targets and hidden tiles, while paths retain native turn labels', () => {
  const { data } = run();
  assert.deepEqual(data.movement.options.map(o => o.location.x), [0, 1]);
  assert.deepEqual(data.destination.path.map(p => p.turnLabel), [1, 1]);
  assert.equal(data.site.legalToFoundAfterMoving, null);
  assert.equal(data.site.newSettlementYields, null);
  assert.deepEqual(data.site.nearbyRevealedResources.map(r => r.location.x), [2]);
  assert.ok(!JSON.stringify(data).includes('999'));
});

test('fog destinations get native move permission without hidden site inspection; invalid selectors still reject', () => {
  const {data} = run({args: {unit_id: 7, x: 3, y: 0}, hiddenPath: true});
  assert.equal(data.destination.moveAllowed, true);
  assert.equal(data.destination.path, null);
  assert.equal(data.site, null);
  assert.equal(data.destination.visibility, 'unexplored');
  assert.throws(() => run({ args: { unit_id: 99 } }), /owned unit/i);
  assert.throws(() => run({ args: { unit_id: 7, x: 1 } }), /together/i);
});

test('paths through hidden tiles are withheld in full, not returned with gaps or hidden obstacles', () => {
  assert.equal(run({ hiddenPath: true }).data.destination.path, null);
});

test('packed units and zone-of-control restrictions do not offer misleading movement ranges', () => {
  assert.deepEqual(run({ packed: true }).data.movement.options, []);
  assert.equal(run({ packed: true }).data.destination.path, null);
  assert.deepEqual(run({ zoc: true }).data.movement.options.map(o => o.location.x), [0]);
});

test('rail options use the distinct command check and exclude hidden, duplicate and invalid plots', () => {
  const { data } = run();
  assert.ok(data.rail, 'rail evidence is exported separately from ordinary movement');
  assert.equal(data.rail.operationAllowed, true);
  assert.deepEqual(data.rail.options, [{ location: { x: 1, y: 0 }, availableNow: true }]);
  assert.equal(data.rail.destinationAvailableNow, true);
  assert.equal(data.rail.travelCost, null);
  assert.ok(!JSON.stringify(data.rail).includes('999'));
});

test('rail failure, absent destinations and packed-unit permissions do not become positive options', () => {
  const blocked = run({ railAllowed: false }).data.rail;
  assert.equal(blocked?.operationAllowed, false);
  assert.equal(blocked?.destinationAvailableNow, false);
  assert.deepEqual(blocked?.failureReasons, ['No rail access']);
  assert.equal(blocked?.options[0].availableNow, false);
  assert.equal(run({ args: { unit_id: 7, x: 2, y: 0 } }).data.rail?.destinationAvailableNow, false);
  assert.equal(run({ packed: true }).data.rail?.operationAllowed, null);
  assert.deepEqual(run({ packed: true }).data.rail?.options, []);
  assert.equal(run({ zoc: true, moves: 0 }).data.rail?.operationAllowed, true, 'ordinary movement filters must not replace the rail command result');
});

test('unit inventory exposes stable local instance IDs without replacing existing type IDs', () => {
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/units.js'), 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    Players: { get: () => ({ Units: { getUnits: () => [{ id: { owner: 0, id: 7, type: 26 }, type: 'SCOUT', location: { x: 0, y: 0 } }] } }) },
    GameInfo: { Units: { lookup: () => ({ UnitType: 'SCOUT', Name: 'Scout' }) }, Unit_Stats: { lookup: () => null } }, Game: { turn: 109 },
  });
  assert.equal(data.units[0].id, 'SCOUT');
  assert.equal(data.units[0].instanceId, 7);
});
