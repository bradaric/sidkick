const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run({ age = 'AGE_MODERN', packed = false, allowed = false, missingResult = false,
  missingResearch = false, unknownCapacity = false } = {}) {
  const script = path.join(__dirname, '../civ7/archaeology.js');
  assert.ok(fs.existsSync(script), 'bundled archaeology query exists');
  const calls = [];
  const modernOnly = () => assert.equal(age, 'AGE_MODERN');
  const culture = {
    getNumAgesResearched: continent => { modernOnly(); assert.equal(continent, 4); return missingResearch ? undefined : 1; },
    getNumAgesAvailableToResearch: () => missingResearch ? undefined : 1,
    getContinentResearchStatus: () => missingResearch ? undefined : 'Research another Age',
    getContinentRuralRuinCount: () => { throw Error('Hidden continental totals must not be queried'); },
  };
  const explorer = {id: {owner: 0, id: 7}, type: 'EXPLORER', name: 'Explorer', location: packed ? {x: -1, y: -1} : {x: 0, y: 0},
    Movement: {movementMovesRemaining: 2}};
  const data = vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0}, Locale: {compose: key => key},
    Players: {get: id => {assert.equal(id, 0); return {Culture: culture,
      Units: {getUnits: () => [explorer, {id: {owner: 0, id: 8}, type: 'SCOUT'}]},
      Cities: {getCities: () => [{id: {owner: 0, id: 10}, name: 'Home', Constructibles: {
        getGreatWorkBuildings: () => [{constructibleID: {owner: 0, id: 30}, slots: [{greatWorkIndex: 1}, {greatWorkIndex: -1}]}],
        getNumGreatWorkSlots: () => unknownCapacity ? undefined : 3,
      }}]},
    };}},
    GameInfo: {
      Ages: {lookup: () => ({AgeType: age})}, Units: {lookup: type => ({UnitType: type, ExtractsArtifacts: type === 'EXPLORER'})},
      Continents: {lookup: () => ({ContinentType: 'KNOWN_CONTINENT', Description: 'Known continent'})},
      Constructibles: {lookup: type => ({ConstructibleType: type, Name: type})},
    },
    GameplayMap: {
      getGridWidth: () => 5, getGridHeight: () => 1,
      getRevealedState: (id, x) => x === 4 ? 0 : x === 3 ? 1 : 2,
      getContinentType: (x, y) => {assert.ok(x < 4, 'hidden continent is never inspected'); return 4;},
      isNaturalWonder: x => {assert.ok(x < 4); return x === 2;},
    },
    RevealedStates: {HIDDEN: 0, FOGGED: 1, VISIBLE: 2},
    MapConstructibles: {getHiddenFilteredConstructibles: x => {
      modernOnly(); assert.ok(x < 4, 'hidden tiles are filtered before constructible reads');
      return [{owner: 0, id: x === 0 ? 20 : x === 1 ? 21 : x === 3 ? 22 : 23}];
    }},
    Constructibles: {getByComponentID: component => ({type: component.id === 20 || component.id === 22 ? 'IMPROVEMENT_RUINS'
      : component.id === 21 ? 'BUILDING_UNIVERSITY_MO' : component.id === 30 ? 'BUILDING_MUSEUM' : 'UNRELATED',
      complete: true, damaged: component.id === 21})},
    Game: {turn: 12, age: 1, UnitOperations: {
      sendRequest: () => {throw Error('Archaeology actions are forbidden');},
      canStart: (id, operation, args, visibleOnly) => {
        modernOnly(); assert.equal(packed, false); assert.equal(id.id, 7);
        assert.ok(['UNITOPERATION_EXCAVATE', 'UNITOPERATION_RESEARCH_ARTIFACTS'].includes(operation));
        assert.equal(args.X, -9999); assert.equal(args.Y, -9999); assert.equal(args.UnitAbilityType, -1);
        assert.equal(visibleOnly, false); calls.push(operation);
        return missingResult ? null : {Success: allowed, FailureReasons: allowed ? [] : ['Research required'],
          AdditionalDescription: ['Current-position action'], ChargesRemaining: 0, Plots: [9999], secret: 'FOREIGN_DATA'};
      },
    }},
  });
  return {data: JSON.parse(JSON.stringify(data)), calls};
}

test('archaeology sites use revealed UI-filtered evidence, not hidden ruin counts or arbitrary target checks', () => {
  const {data, calls} = run();
  assert.deepEqual(data.sites.map(site => site.kind), ['ruins', 'research-building', 'natural-wonder', 'ruins']);
  assert.equal(data.sites[3].visible, false);
  assert.equal(data.sites[1].damaged, true);
  assert.equal(data.sites[0].availableAfterMoving, null);
  assert.equal(data.continents.length, 1);
  assert.equal(data.continents[0].agesResearched, 1);
  assert.equal(data.continents[0].agesAvailableToResearch, 1);
  assert.equal(data.continents[0].researchStatus, 'Research another Age');
  assert.equal(calls.length, 2, 'only current-state checks per owned Explorer, not a site-by-unit matrix');
  assert.ok(!JSON.stringify(data).includes('FOREIGN_DATA'));
  assert.ok(!JSON.stringify(data).includes('9999'));
});

test('owned artifact extractors expose current-position operation readiness and native blockers', () => {
  const {data} = run();
  assert.equal(data.explorers.length, 1);
  assert.equal(data.explorers[0].instanceId, 7);
  assert.equal(data.explorers[0].operations[0].operationAllowed, false);
  assert.deepEqual(data.explorers[0].operations[0].failureReasons, ['Research required']);
  assert.equal(data.explorers[0].operations[0].chargesRemaining, 0);
  assert.equal(run({allowed: true}).data.explorers[0].operations[0].availableNow, true);
  assert.equal(run({missingResult: true}).data.explorers[0].operations[0].operationAllowed, null);
});

test('packed artifact extractors never enter deployed operation checks', () => {
  const {data, calls} = run({packed: true});
  assert.equal(calls.length, 0);
  assert.equal(data.explorers[0].location, null);
  assert.equal(data.explorers[0].operations[0].operationAllowed, null);
  assert.equal(data.explorers[0].operations[0].availableNow, false);
});

test('display capacity is reported as capacity, never artifact compatibility or projected tourism', () => {
  const {data} = run();
  assert.equal(data.displayBuildings[0].free, 2);
  assert.equal(data.displayBuildings[0].artifactCompatible, null);
  assert.equal(data.displayBuildings[0].projectedTourism, null);
  assert.equal(run({unknownCapacity: true}).data.displayBuildings[0].free, null);
  assert.equal(run({missingResearch: true}).data.continents[0].agesResearched, null);
});

test('archaeology stays explicitly unavailable outside Modern without querying Modern interfaces', () => {
  const {data, calls} = run({age: 'AGE_EXPLORATION'});
  assert.equal(data.applicable, false);
  assert.equal(data.sites, null);
  assert.equal(data.continents, null);
  assert.equal(data.explorers, null);
  assert.equal(calls.length, 0);
});
