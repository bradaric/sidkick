const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run({ modern = false, count = 2, factoryResource = 'TEA', prereq = true, rail = true, station = false,
  routeStatus = 3, malformedTarget = false, mismatchedCity = false, changedOwner = false, targetId = 20,
  revealSecond = false } = {}) {
  const records = [false, true].map(isOffMap => ({ value: 5, isOffMap, uniqueResource: { resource: 'TEA' } }));
  const city = { id: { owner: 0, id: 10 }, owner: 0, name: 'Home', location: { x: 0, y: 0 },
    Resources: { getAssignedResources: () => [records[0]], getAssignedResourcesCap: () => 2,
      getFactoryResource: () => factoryResource, getNumFactoryResources: () => count, isTreasureConstructiblePrereqMet: () => prereq },
    Constructibles: { hasConstructible: (type, includeIncomplete) => {
      assert.equal(type, 'BUILDING_RAIL_STATION'); assert.equal(includeIncomplete, false); return station;
    } },
    Trade: { isInTradeNetwork: () => true, numRoutes: 1, isInRailNetwork: () => rail, isConnectedToOwnersCapitalByLand: () => true } };
  const foreign = owner => ({ id: { owner, id: mismatchedCity ? 99 : targetId, type: 1 },
    owner: changedOwner ? 3 : owner, name: owner === 1 ? 'Known' : revealSecond ? 'OtherKnown' : 'Hidden', location: { x: owner, y: 0 } });
  const calls = [];
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/commerce.js'), 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    RevealedStates: { HIDDEN: 0 }, DomainType: { DOMAIN_LAND: 1 }, TradeRouteStatus: { SUCCESS: 1, ALREADY_EXISTS: 2, DISTANCE: 3 },
    TradeRouteSearchOptions: {INCLUDE_FAILED: 1, EXTENDED_STATUS: 2},
    PlayerOperationTypes: { ASSIGN_RESOURCE: 'ASSIGN' },
    CityOperationTypes: { BUILD: 'BUILD' }, CityCommandTypes: { PURCHASE: 'BUY' }, CityQueryType: { Constructible: 'BUILDING' },
    GameplayMap: { getLocationFromIndex: value => ({ x: value, y: 0 }), getRevealedState: (id, x) => x === 2 && !revealSecond ? 0 : 1 },
    Players: { get: id => { if (id === 0) return {
      Resources: { getResources: () => records }, Cities: { getCities: () => [city] },
      Diplomacy: { hasMet: other => [1, 2].includes(other) },
      Trade: { countPlayerTradeRoutes: () => 4, countPlayerTradeRoutesTo: () => 1, getTradeCapacityFromPlayer: () => 2,
        projectPossibleTradeRoutes: options => { assert.equal(options, 3, 'read inventory must match the writer extended-status flags'); return [
          { targetCityId: { owner: 1, id: malformedTarget ? undefined : targetId, type: 1 }, status: [routeStatus], domain: 1 },
          { targetCityId: { owner: 2, id: 20, type: 1 }, status: [1], pathPlots: [999] },
          { targetCityId: { owner: 3, id: 20, type: 1 }, status: [1] },
        ]; } },
    }; assert.ok(id === 1 || revealSecond && id === 2, 'unmet owners and hidden-city leaders are not inspected'); return { civilizationFullName: 'Known empire' }; } },
    Cities: { get: id => { assert.notEqual(id.owner, 3); return id.owner === 0 ? city : foreign(id.owner); } },
    GameInfo: { Resources: { lookup: type => type === 'TEA' ? { ResourceType: 'TEA', Name: 'Tea', ResourceClassType: modern ? 'RESOURCECLASS_FACTORY' : 'RESOURCECLASS_CITY' } : null },
      Ages: { lookup: () => ({ AgeType: modern ? 'AGE_MODERN' : 'AGE_EXPLORATION' }) },
      Constructibles: { lookup: index => ({ ConstructibleType: index === 1 ? 'BUILDING_FACTORY' : 'BUILDING_RAIL_STATION' }) },
      Yields: { lookup: () => null } },
    Game: { turn: 108, Resources: { getOriginCity: () => null },
      CityOperations: { canStartQuery: (id, op, type) => {
        assert.equal(modern, true); assert.equal(id.id, 10); assert.equal(op, 'BUILD'); assert.equal(type, 'BUILDING');
        return [{ index: 1, result: { Success: false, FailureReasons: ['Needs rail'], Plots: [999] } }];
      } },
      CityCommands: { canStartQuery: (id, op, type) => {
        assert.equal(modern, true); assert.equal(id.id, 10); assert.equal(op, 'BUY'); assert.equal(type, 'BUILDING');
        return [{ index: 1, result: { Success: false, InsufficientFunds: true, Cost: 700, FailureReasons: ['Needs gold'] } }];
      } },
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

test('available, blocked and active trade rows expose the exact native target IDs required by the trade action', () => {
  for (const routeStatus of [1, 2, 3]) {
    const route = run({routeStatus}).data.trade.routes[0];
    assert.equal(route.targetPlayerId, 1);
    assert.equal(route.targetCityId, 20, 'native city component ID, never a name/location/list index');
    assert.equal(route.targetCity, 'Known');
    assert.deepEqual(route.targetLocation, {x: 1, y: 0});
  }
  assert.equal(run({targetId: 0}).data.trade.routes[0].targetCityId, 0, 'zero is a valid native ID');
});

test('missing, mismatched and changed-owner destination identities are omitted rather than guessed', () => {
  for (const options of [{malformedTarget: true}, {mismatchedCity: true}, {changedOwner: true}]) {
    assert.deepEqual(run(options).data.trade.routes, [], JSON.stringify(options));
  }
});

test('the same city component number under different players retains distinct owner-qualified identities', () => {
  const routes = run({revealSecond: true}).data.trade.routes;
  assert.deepEqual(routes.map(route => [route.targetPlayerId, route.targetCityId]), [[1, 20], [2, 20]]);
});

test('Modern factory evidence retains native counts and assignment checks without inventing GDP', () => {
  const { data } = run({ modern: true });
  const factory = data.settlements[0].factory;
  assert.ok(factory, 'factory state is explicit in Modern');
  assert.equal(factory.constructiblePrerequisiteMet, true);
  assert.equal(factory.hasFactory, true);
  assert.equal(factory.resource.id, 'TEA');
  assert.equal(factory.resourceCount, 2);
  assert.equal(factory.producing, true);
  assert.equal(factory.assignedResourceCount, 1, 'assigned copies and native factory count remain distinct');
  assert.equal(factory.currentGDP, null);
  assert.equal(factory.gdpChangeOnAssignment, null);
  assert.equal(data.resources.owned[1].assignmentChoices[0].availableNow, true);
});

test('factory state is Age-gated and follows UI prerequisites rather than treating treasure infrastructure as factories', () => {
  assert.equal(run().data.settlements[0].factory, null);
  assert.equal(run({ modern: true, prereq: false }).data.settlements[0].factory?.hasFactory, false);
  assert.equal(run({ modern: true, factoryResource: null }).data.settlements[0].factory?.hasFactory, false);
  const empty = run({ modern: true, count: 0, factoryResource: null }).data.settlements[0].factory;
  assert.equal(empty?.hasFactory, true, 'a factory may have no assigned resource');
  assert.equal(empty?.producing, false);
  assert.equal(empty?.resource, null);
});

test('rail-network membership is independent of station presence and construction keeps blocked native reasons', () => {
  const { data } = run({ modern: true });
  const infrastructure = data.settlements[0].infrastructure;
  assert.ok(infrastructure, 'owned infrastructure state is exported');
  assert.equal(infrastructure.inRailNetwork, true);
  assert.equal(infrastructure.railStationPresent, false);
  assert.equal(infrastructure.landConnectedToCapital, true);
  assert.equal(run({ rail: false, station: true }).data.settlements[0].infrastructure.inRailNetwork, false);
  assert.equal(infrastructure.construction.factory.production.availableNow, false);
  assert.deepEqual(infrastructure.construction.factory.production.failureReasons, ['Needs rail']);
  assert.equal(infrastructure.construction.factory.purchase.cost, 700);
  assert.equal(infrastructure.construction.factory.purchase.affordable, false);
  assert.equal(infrastructure.construction.railStation, null, 'missing native entries are unknown, not legal');
  assert.ok(!JSON.stringify(data).includes('999'), 'raw construction plots are not leaked');
});

test('town focus choices check hashed project types, retain requirements and filter connections to owned settlements', () => {
  const town = { id: { owner: 0, id: 10, type: 1 }, owner: 0, name: 'Town', isTown: true, location: { x: 0, y: 0 },
    isJustConqueredFrom:true,isBeingRazed:false,
    Growth: { growthType: 2, projectType: 404 }, Gold: { getTownUpgradeCost: () => 100 },
    getConnectedCities: () => [{ owner: 0, id: 11, type: 1 }, { owner: 1, id: 99, type: 1 }], getSentFoodPerCity: () => 8 };
  const queued = [{orderType: 0, unitType: 21}];
  const city = { id: { owner: 0, id: 11, type: 1 }, name: 'City', isTown: false, location: { x: 1, y: 0 }, BuildQueue: {getQueue: () => queued} };
  const project = { $index: 4, $hash: 404, ProjectType: 'FISHING', Name: 'Fishing', Description: '+food', TownOnly: true, PrereqPopulation: 7 };
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/decisions.js'), 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    Players: { get: () => ({ Cities: { getCities: () => [town, city] }, Units: { getUnits: () => [] }, Treasury: { goldBalance: 300 } }) },
    GameInfo: { Projects: Object.assign([project], { lookup: index => { assert.equal(index, 4); return project; } }), UnitCommands: [] },
    GrowthTypes: { EXPAND: 1, PROJECT: 2 }, ProjectTypes: { NO_PROJECT: -1 },
    CityOperationTypes: { BUILD: 1 }, CityCommandTypes: { PURCHASE: 2, CHANGE_GROWTH_MODE: 3, DESTROY:4 }, CityQueryType: { Constructible: 1, Unit: 2 },
    Game: { turn: 108, CityOperations: { canStartQuery: () => [], canStart: () => ({ Success: false }) },
       CityCommands: { canStartQuery: () => [], canStart: (id, type, args, visible) => {
         if(type===4)return{Success:args.Directive===2,FailureReasons:args.Directive===3?['Cannot raze']:[]};
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
  assert.equal(data.settlements[1].production.queueToken, JSON.stringify(queued));
  assert.equal(data.settlements[0].cityId,10);
  assert.equal(data.settlements[0].cityOwner,0);
  assert.equal(data.settlements[0].captureDisposition.pending,true);
  assert.deepEqual(JSON.parse(JSON.stringify(data.settlements[0].captureDisposition.options)).map(c=>[c.choice,c.availableNow]),[['keep',true],['raze',false]]);
});
