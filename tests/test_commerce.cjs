const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run() {
  const records = [false, true].map(isOffMap => ({ value: 5, isOffMap, uniqueResource: { resource: 'TEA' } }));
  const city = { id: { owner: 0, id: 10 }, owner: 0, name: 'Home', location: { x: 0, y: 0 },
    Resources: { getAssignedResources: () => [records[0]], getAssignedResourcesCap: () => 2 }, Trade: { isInTradeNetwork: () => true, numRoutes: 1 } };
  const foreign = owner => ({ id: { owner, id: 20 }, owner, name: owner === 1 ? 'Known' : 'Hidden', location: { x: owner, y: 0 } });
  const calls = [];
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/commerce.js'), 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    RevealedStates: { HIDDEN: 0 }, DomainType: { DOMAIN_LAND: 1 }, TradeRouteStatus: { SUCCESS: 1, ALREADY_EXISTS: 2, DISTANCE: 3 },
    PlayerOperationTypes: { ASSIGN_RESOURCE: 'ASSIGN' },
    GameplayMap: { getLocationFromIndex: value => ({ x: value, y: 0 }), getRevealedState: (id, x) => x === 2 ? 0 : 1 },
    Players: { get: id => { if (id === 0) return {
      Resources: { getResources: () => records }, Cities: { getCities: () => [city] },
      Diplomacy: { hasMet: other => [1, 2].includes(other) },
      Trade: { countPlayerTradeRoutes: () => 4, countPlayerTradeRoutesTo: () => 1, getTradeCapacityFromPlayer: () => 2,
        projectPossibleTradeRoutes: () => [
          { targetCityId: { owner: 1 }, status: [3], domain: 1 },
          { targetCityId: { owner: 2 }, status: [1], pathPlots: [999] },
          { targetCityId: { owner: 3 }, status: [1] },
        ] },
    }; assert.equal(id, 1, 'unmet owners and hidden-city leaders are not inspected'); return { civilizationFullName: 'Known empire' }; } },
    Cities: { get: id => { assert.notEqual(id.owner, 3); return id.owner === 0 ? city : foreign(id.owner); } },
    GameInfo: { Resources: { lookup: () => ({ ResourceType: 'TEA', Name: 'Tea' }) }, Yields: { lookup: () => null } },
    Game: { turn: 108, Resources: { getOriginCity: () => null },
      PlayerOperations: { canStart: (id, op, args, visible) => {
        assert.equal(id, 0); assert.equal(op, 'ASSIGN'); assert.equal(args.City, 10); assert.equal(visible, false);
        calls.push(args); return { Success: args.ID === 5, FailureReasons: args.ID === 5 ? [] : ['Already assigned'] };
      } },
    },
  });
  return { data: JSON.parse(JSON.stringify(data)), calls };
}

test('resource choices use read-only assignment checks and distinguish off-map IDs from map instances', () => {
  const { data, calls } = run();
  assert.equal(data.resources.unassigned.length, 1, 'off-map ID collision must not hide an unassigned resource');
  assert.equal(data.resources.unassigned[0].offMap, true);
  assert.ok(data.resources.owned[0].assignmentChoices, 'resource assignment choices exist');
  assert.equal(data.resources.owned[0].assignmentChoices[0].alreadyAssignedHere, true);
  assert.equal(data.resources.owned[1].assignmentChoices[0].availableNow, true);
  assert.equal(data.resources.owned[1].assignmentChoices[0].netYieldChange, null);
  assert.deepEqual(calls.map(c => c.ID), [-1, 5]);
});

test('trade comparisons retain blocked known routes, exclude hidden/unmet cities and do not invent net benefits', () => {
  const { data } = run();
  assert.equal(data.trade.currentRouteCount, 4);
  assert.equal(data.trade.routes.length, 1);
  const route = data.trade.routes[0];
  assert.equal(route.status, 'blocked');
  assert.deepEqual(route.statusReasons, ['DISTANCE']);
  assert.equal(route.netYieldChange, null);
  assert.ok(!JSON.stringify(data).includes('Hidden'));
  assert.ok(!JSON.stringify(data).includes('999'));
});

test('town focus choices check hashed project types, retain requirements and filter connections to owned settlements', () => {
  const town = { id: { owner: 0, id: 10, type: 1 }, owner: 0, name: 'Town', isTown: true, location: { x: 0, y: 0 },
    Growth: { growthType: 2, projectType: 404 }, Gold: { getTownUpgradeCost: () => 100 },
    getConnectedCities: () => [{ owner: 0, id: 11, type: 1 }, { owner: 1, id: 99, type: 1 }], getSentFoodPerCity: () => 8 };
  const city = { id: { owner: 0, id: 11, type: 1 }, name: 'City', isTown: false, location: { x: 1, y: 0 } };
  const project = { $index: 4, $hash: 404, ProjectType: 'FISHING', Name: 'Fishing', Description: '+food', TownOnly: true, PrereqPopulation: 7 };
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/decisions.js'), 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    Players: { get: () => ({ Cities: { getCities: () => [town, city] }, Units: { getUnits: () => [] }, Treasury: { goldBalance: 300 } }) },
    GameInfo: { Projects: Object.assign([project], { lookup: index => { assert.equal(index, 4); return project; } }), UnitCommands: [] },
    GrowthTypes: { EXPAND: 1, PROJECT: 2 }, ProjectTypes: { NO_PROJECT: -1 },
    CityOperationTypes: { BUILD: 1 }, CityCommandTypes: { PURCHASE: 2, CHANGE_GROWTH_MODE: 3 }, CityQueryType: { Constructible: 1, Unit: 2 },
    Game: { turn: 108, CityOperations: { canStartQuery: () => [], canStart: () => ({ Success: false }) },
      CityCommands: { canStartQuery: () => [], canStart: (id, type, args, visible) => {
        assert.equal(id.id, 10); assert.equal(type, 3); assert.equal(visible, false);
        if (args.ProjectType == null) return { Success: true, Projects: [4] };
        assert.ok([-1, 404].includes(args.ProjectType), 'use project hash for the specific focus check');
        return { Success: args.ProjectType === 404, FailureReasons: args.ProjectType === -1 ? ['Locked'] : [] };
      } },
    },
  });
  const focus = JSON.parse(JSON.stringify(data)).settlements[0].townFocus;
  assert.ok(focus, 'town focus comparisons are exported');
  assert.equal(focus.options[0].availableNow, false);
  assert.equal(focus.options[1].current, true);
  assert.equal(focus.options[1].prerequisitePopulation, 7);
  assert.equal(focus.options[1].netYieldChange, null);
  assert.deepEqual(focus.connectedOwnedSettlements, ['City']);
  assert.equal(focus.reportedFoodPerConnectedCity, 8);
});
