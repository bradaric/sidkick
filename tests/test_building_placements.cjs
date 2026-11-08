const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const scriptPath = path.join(__dirname, '../civ7/building_placements.js');

function run({ settlement = 'City', constructible = null, duplicateCity = false, missingPreview = false } = {}) {
  assert.ok(fs.existsSync(scriptPath), 'bundled building-placement query exists');
  const yields = ['YIELD_FOOD', 'YIELD_PRODUCTION', 'YIELD_GOLD'].map((YieldType, $index) => ({ YieldType, $index, $hash: 100 + $index }));
  yields.lookup = key => yields.find(d => d.$hash === key);
  const definitions = [
    { $index: 1, $hash: 201, ConstructibleType: 'BUILDING_BANK', ConstructibleClass: 'BUILDING', Name: 'Bank', Description: 'Bank description' },
    { $index: 2, $hash: 202, ConstructibleType: 'WONDER_TEST', ConstructibleClass: 'WONDER', Name: 'Wonder' },
    { $index: 3, $hash: 203, ConstructibleType: 'IMPROVEMENT_FARM', ConstructibleClass: 'IMPROVEMENT', Name: 'Farm' },
    { $index: 4, $hash: 204, ConstructibleType: 'BUILDING_OLD', ConstructibleClass: 'BUILDING', Name: 'Old building' },
    { $index: 5, $hash: 205, ConstructibleType: 'BUILDING_BLOCKED', ConstructibleClass: 'BUILDING', Name: 'Blocked' },
  ];
  definitions.lookup = key => definitions.find(d => d.$index === key || d.$hash === key || d.ConstructibleType === key);
  const preview = {
    plotID: 10, yieldChanges: [3, -2, 8], overbuiltConstructibleID: 4,
    changeDetails: [
      { sourceType: 0, yieldType: 102, change: 6, sourcePlotIndex: 10, targetPlotIndex: -1 },
      { sourceType: 1, yieldType: 102, change: 2, sourcePlotIndex: 10, targetPlotIndex: 11 },
      { sourceType: 2, yieldType: 100, change: 3, sourcePlotIndex: 10, targetPlotIndex: 99 },
      { sourceType: 0, yieldType: 101, change: -2, sourcePlotIndex: 10, targetPlotIndex: -1 },
    ],
  };
  const city = {
    id: { owner: 0, id: 7, type: 1 }, name: 'City', location: { x: 1, y: 1 }, isTown: false,
    Constructibles: { getMaintenance: type => type === 'BUILDING_OLD' ? [0, 0, 1] : [0, 0, 3] },
    Production: { getConstructibleProductionCost: () => 100 },
    Gold: { getBuildingPurchaseCost: () => 400 },
    BuildQueue: { getTurnsLeft: () => 4 },
    Yields: { calculateAllBuildingsPlacements: () => {
      previewCalls++;
      return { buildings: [
        { constructibleType: 201, placements: missingPreview ? [] : [preview, { ...preview, plotID: 11 }, { ...preview, plotID: 12 }, { ...preview, plotID: 13 }] },
        { constructibleType: 202, placements: [{ ...preview, plotID: 12, overbuiltConstructibleID: -1 }] },
      ] };
    } },
  };
  const other = { id: { owner: 0, id: 8, type: 1 }, name: duplicateCity ? 'City' : 'Other' };
  const build = [
    { index: 1, result: { Success: true, Plots: [10, 99], ExpandUrbanPlots: [11, 10] } },
    { index: 2, result: { Success: true, Plots: [12] } },
    { index: 3, result: { Success: true, Plots: [10] } },
    { index: 5, result: { Success: false, FailureReasons: ['Blocked by rules'] } },
  ];
  const buy = [{ index: 1, result: { Success: false, InsufficientFunds: true, Cost: 400, Plots: [10, 12], FailureReasons: ['Not enough gold'] } }];
  const calls = [];
  let previewCalls = 0;
  const query = type => (id, operation, queryType) => {
    assert.equal(id, city.id, 'only the selected settlement is queried');
    assert.equal(queryType, 'constructible');
    calls.push({ type, operation });
    return type === 'build' ? build : buy;
  };
  const result = vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), {
    queryArguments: { settlement, constructible },
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 },
    Players: { get: id => { assert.equal(id, 0); return { Cities: { getCities: () => [city, other] } }; } },
    Locale: { compose: key => key }, GameInfo: { Yields: yields, Constructibles: definitions },
    Game: { turn: 96, CityOperations: { canStartQuery: query('build') }, CityCommands: { canStartQuery: query('buy') } },
    CityOperationTypes: { BUILD: 'BUILD' }, CityCommandTypes: { PURCHASE: 'PURCHASE' }, CityQueryType: { Constructible: 'constructible' },
    YieldTypes: { YIELD_GOLD: 102 }, YieldSourceTypes: { BASE: 0, ADJACENCY: 1, WAREHOUSE: 2 },
    RevealedStates: { HIDDEN: 0, VISIBLE: 2 },
    MapConstructibles: {getConstructibles: x => {assert.notEqual(x, 99); return x === 10 ? [{owner: 0, id: 20, type: 2}] : [];}},
    Constructibles: {getByComponentID: () => ({type: 204, complete: true, damaged: false})},
    GameplayMap: { getLocationFromIndex: x => ({ x, y: 0 }), getRevealedState: (id, x) => x === 99 ? 0 : x === 11 ? 1 : 2 },
  });
  return { data: JSON.parse(JSON.stringify(result)), calls, previewCalls };
}

test('requires exactly one owned settlement before querying placements', () => {
  assert.throws(() => run({ settlement: '' }), /settlement/i);
  assert.throws(() => run({ settlement: 'Missing' }), /settlement/i);
  assert.throws(() => run({ duplicateCity: true }), /ambiguous/i);
  const { data, calls, previewCalls } = run({ settlement: ' city ' });
  assert.equal(data.settlement.name, 'City');
  assert.equal(previewCalls, 1);
  assert.deepEqual(calls, [{ type: 'build', operation: 'BUILD' }, { type: 'buy', operation: 'PURCHASE' }]);
});

test('returns buildings, wonders and improvements with deduplicated legal production/purchase tiles', () => {
  const { data } = run();
  assert.deepEqual(data.constructibles.map(c => c.id), ['BUILDING_BANK', 'WONDER_TEST', 'IMPROVEMENT_FARM']);
  const bank = data.constructibles[0];
  assert.equal(bank.production.availableNow, true);
  assert.equal(bank.production.cost, 100);
  assert.equal(bank.production.turns, 4);
  assert.equal(bank.purchase.availableNow, false);
  assert.equal(bank.purchase.affordable, false);
  assert.equal(bank.purchase.cost, 400);
  assert.deepEqual(bank.purchase.failureReasons, ['Not enough gold']);
  assert.deepEqual(bank.placements.map(p => p.plotIndex), [10, 11, 12]);
  assert.equal(bank.placements[0].validForProduction, true);
  assert.equal(bank.placements[0].validForPurchase, true);
  assert.equal(bank.placements[1].validForPurchase, false);
  assert.equal(bank.placements[1].expandsUrban, true);
  assert.equal(bank.placements[2].validForProduction, false);
  assert.equal(bank.placements[2].validForPurchase, true);
  assert.equal(bank.placements[0].targetToken, JSON.stringify([{owner: 0, instanceId: 20, componentType: 2, type: 204, complete: true, damaged: false}]));
  assert.equal(bank.placements[1].targetToken, null, 'revealed but fogged tiles cannot supply a current mutation token');
});

test('reports actual placement gains, losses, and net upkeep after overbuilding', () => {
  const bank = run().data.constructibles[0];
  const tile = bank.placements[0];
  assert.equal(tile.previewAvailable, true);
  assert.equal(tile.overbuilds.id, 'BUILDING_OLD');
  assert.deepEqual(tile.yieldChanges, { YIELD_FOOD: 3, YIELD_PRODUCTION: -2, YIELD_GOLD: 8 });
  assert.deepEqual(tile.maintenanceChanges, { YIELD_GOLD: 2 });
  assert.deepEqual(tile.netYieldChanges, { YIELD_FOOD: 3, YIELD_PRODUCTION: -2, YIELD_GOLD: 6 });
  assert.deepEqual(tile.bonuses.map(b => b.source), ['BASE', 'ADJACENCY', 'WAREHOUSE', 'BASE']);
  assert.equal(tile.bonuses[2].targetLocation, null, 'hidden bonus coordinates are excluded');
  assert.equal(tile.bonuses[3].change, -2, 'negative changes are preserved');
});

test('optional filter matches an exact type ID or localized name without case sensitivity', () => {
  assert.deepEqual(run({ constructible: ' building_bank ' }).data.constructibles.map(c => c.id), ['BUILDING_BANK']);
  assert.deepEqual(run({ constructible: ' bank ' }).data.constructibles.map(c => c.id), ['BUILDING_BANK']);
  assert.throws(() => run({ constructible: 'Missing' }), /building|constructible|wonder/i);
});

test('an explicitly requested blocked building returns its reasons, not fake legal tiles', () => {
  const blocked = run({ constructible: 'BUILDING_BLOCKED' }).data.constructibles[0];
  assert.equal(blocked.production.availableNow, false);
  assert.deepEqual(blocked.production.failureReasons, ['Blocked by rules']);
  assert.deepEqual(blocked.placements, []);
});

test('missing previews are unknown rather than zero yield', () => {
  const tile = run({ missingPreview: true }).data.constructibles[0].placements[0];
  assert.equal(tile.previewAvailable, false);
  assert.equal(tile.yieldChanges, null);
  assert.equal(tile.netYieldChanges, null);
  assert.equal(tile.maintenanceChanges, null);
  assert.equal(tile.bonuses, null);
});
