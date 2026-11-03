const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const scriptPath = path.join(__dirname, '../civ7/growth.js');
const yieldTypes = ['YIELD_FOOD', 'YIELD_PRODUCTION', 'YIELD_HAPPINESS'];
const yields = yieldTypes.map((YieldType, $index) => ({ YieldType, $index, $hash: 100 + $index }));
yields.lookup = key => yields.find(y => y.$hash === key || y.YieldType === key);
const farm = { $hash: 200, $index: 0, ConstructibleType: 'IMPROVEMENT_FARM', ConstructibleClass: 'IMPROVEMENT', Name: 'Farm', Description: 'Farm description' };
const mine = { $hash: 201, $index: 1, ConstructibleType: 'IMPROVEMENT_MINE', ConstructibleClass: 'IMPROVEMENT', Name: 'Mine' };
const definitions = [farm, mine];
definitions.lookup = key => definitions.find(d => d.$hash === key || d.ConstructibleType === key);

function run({ ready = true, town = false, expand = true, missingPreview = false, overbuilt = false, inGame = true, playerId = 0 } = {}) {
  assert.ok(fs.existsSync(scriptPath), 'bundled growth query exists');
  const placement = {
    plotID: 10,
    yieldChanges: [3, 2, 0],
    overbuiltConstructibleID: overbuilt ? mine.$index : -1,
    changeDetails: [{ yieldType: 100, change: 3, sourceType: 4, sourcePlotIndex: 10, targetPlotIndex: 99 }],
  };
  const worker = {
    PlotIndex: 20, NumWorkers: 0, MaxWorkers: 2, IsBlocked: false,
    CurrentYields: [0, 0, 0], NextYields: [3, 0, 0],
    CurrentMaintenance: [0, 0, 0], NextMaintenance: [4, 0, 4],
  };
  const city = {
    id: { owner: 0, id: 7, type: 1 }, name: 'City', location: { x: 1, y: 1 },
    isTown: town, isCapital: false, population: 5, pendingPopulation: ready ? 1 : 0,
    Growth: { turnsUntilGrowth: 2, currentFood: 10, getNextGrowthFoodThreshold: () => ({ value: 20 }), growthType: 0, isReadyToPlacePopulation: ready },
    Workers: {
      getCityWorkerCap: () => 2,
      GetAllPlacementInfo: () => [
        worker,
        { ...worker, PlotIndex: 21, IsBlocked: true },
        { ...worker, PlotIndex: 22, NumWorkers: 2 },
        { ...worker, PlotIndex: 99 },
      ],
    },
    Constructibles: { getMaintenance: type => type === mine.ConstructibleType ? [0, 2, 0] : [0, 1, 0] },
    Yields: { calculateAllBuildingsPlacements: () => ({ buildings: [
      { constructibleType: farm.$hash, placements: missingPreview ? [] : [placement, { ...placement, plotID: 99 }] },
      { constructibleType: mine.$hash, placements: [{ ...placement, plotID: 11 }] },
    ] }) },
  };
  const commandCalls = [];
  const workerCalls = [];
  const result = vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), {
    UI: { isInGame: () => inGame }, GameContext: { localPlayerID: playerId },
    Players: { get: id => { assert.equal(id, 0); return { Cities: { getCities: () => [city] } }; } },
    GameInfo: { Yields: yields, Constructibles: definitions, Resources: { lookup: () => null } },
    Locale: { compose: key => key }, RevealedStates: { HIDDEN: 0, REVEALED: 1 },
    GameplayMap: {
      getLocationFromIndex: index => ({ x: index, y: 0 }),
      getRevealedState: (id, x) => x === 99 ? 0 : 1,
      getResourceType: () => -1,
    },
    CityCommandTypes: { EXPAND: 'expand' }, PlayerOperationTypes: { ASSIGN_WORKER: 'assign' },
    YieldSourceTypes: { BASE: 0, NATURAL: 4 },
    Game: {
      turn: 67,
      CityCommands: { canStart: (...args) => {
        commandCalls.push(args);
        return expand ? { Success: true, Plots: [10, 99], ConstructibleTypes: [200, 200] } : { Success: false, FailureReasons: ['Not ready'] };
      } },
      PlayerOperations: { canStart: (...args) => { workerCalls.push(args); return { Success: true }; } },
    },
  });
  return { data: JSON.parse(JSON.stringify(result)), commandCalls, workerCalls };
}

test('returns legal rural tiles with improvement bonuses, upkeep and net changes', () => {
  const { data, commandCalls } = run();
  assert.equal(data.turn, 67);
  const city = data.settlements[0];
  assert.equal(city.growth.pendingPopulation, 1);
  assert.equal(city.growth.readyToPlacePopulation, true);
  assert.equal(city.growth.threshold, 20);
  assert.equal(city.expansion.availableNow, true);
  assert.equal(city.expansion.options.length, 1);
  const option = city.expansion.options[0];
  assert.deepEqual(option.location, { x: 10, y: 0 });
  assert.equal(option.improvement.id, 'IMPROVEMENT_FARM');
  assert.deepEqual(option.yieldChanges, { YIELD_FOOD: 3, YIELD_PRODUCTION: 2 });
  assert.deepEqual(option.maintenanceChanges, { YIELD_PRODUCTION: 1 });
  assert.deepEqual(option.netYieldChanges, { YIELD_FOOD: 3, YIELD_PRODUCTION: 1 });
  assert.equal(option.bonuses[0].source, 'NATURAL');
  assert.equal(option.bonuses[0].yield, 'YIELD_FOOD');
  assert.equal(option.bonuses[0].targetLocation, null);
  assert.deepEqual(city.expansion.previews.map(p => p.location.x), [11]);
  assert.equal(commandCalls.length, 1);
  assert.equal(commandCalls[0][1], 'expand');
  assert.equal(commandCalls[0][3], false);
});

test('keeps improvement previews distinct from choices available now', () => {
  const { data } = run({ ready: false, expand: false });
  const city = data.settlements[0];
  assert.equal(city.expansion.availableNow, false);
  assert.deepEqual(city.expansion.options, []);
  assert.deepEqual(city.expansion.failureReasons, ['Not ready']);
  assert.deepEqual(city.expansion.previews.map(p => p.location.x), [10, 11]);
  assert.ok(city.specialists.placements.every(p => !p.availableNow));
});

test('includes empty specialist slots and calculates marginal bonuses minus upkeep', () => {
  const { data, workerCalls } = run();
  const placements = data.settlements[0].specialists.placements;
  assert.equal(placements.length, 3);
  assert.equal(placements[0].current, 0);
  assert.equal(placements[0].capacity, 2);
  assert.equal(placements[0].availableNow, true);
  assert.deepEqual(placements[0].yieldChanges, { YIELD_FOOD: 3 });
  assert.deepEqual(placements[0].maintenanceChanges, { YIELD_FOOD: 4, YIELD_HAPPINESS: 4 });
  assert.deepEqual(placements[0].netYieldChanges, { YIELD_FOOD: -1, YIELD_HAPPINESS: -4 });
  assert.equal(placements[1].blocked, true);
  assert.equal(placements[1].availableNow, false);
  assert.equal(placements[2].availableNow, false);
  assert.equal(workerCalls.length, 1);
  assert.equal(workerCalls[0][0], 0);
  assert.equal(workerCalls[0][1], 'assign');
  assert.deepEqual(JSON.parse(JSON.stringify(workerCalls[0][2])), { Location: 20, Amount: 1 });
  assert.equal(workerCalls[0][3], false);
});

test('towns cannot offer specialist growth placements', () => {
  const { data, workerCalls } = run({ town: true });
  assert.deepEqual(data.settlements[0].specialists.placements, []);
  assert.equal(workerCalls.length, 0);
});

test('missing improvement preview is unknown, not zero benefit', () => {
  const { data } = run({ missingPreview: true });
  const option = data.settlements[0].expansion.options[0];
  assert.equal(option.yieldChanges, null);
  assert.equal(option.netYieldChanges, null);
  assert.equal(option.bonuses, null);
});

test('replacing an improvement accounts for removed upkeep', () => {
  const { data } = run({ overbuilt: true });
  const option = data.settlements[0].expansion.options[0];
  assert.deepEqual(option.maintenanceChanges, { YIELD_PRODUCTION: -1 });
  assert.deepEqual(option.netYieldChanges, { YIELD_FOOD: 3, YIELD_PRODUCTION: 3 });
});

test('requires a loaded game and a valid local player', () => {
  assert.throws(() => run({ inGame: false }), /Load a save first/);
  assert.throws(() => run({ playerId: -1 }), /No local player/);
});
