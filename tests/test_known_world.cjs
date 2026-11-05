const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run({cityApi = true, invalidComponent = false} = {}) {
  const cityReads = [], tileReads = [];
  const visible = {id: {owner: 1, id: 10}, owner: 1, name: 'Visible city', location: {x: 2, y: 0},
    population: 7, isTown: false, isCapital: true,
    get Production() {throw Error('Foreign production is private');}, get Religion() {throw Error('Foreign religion is private');}};
  const fogged = {owner: 1, location: {x: 1, y: 0}, get name() {throw Error('Fogged centre metadata must not be read');}};
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/known_world.js'), 'utf8'), {
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0}, Locale: {compose: s => s},
    Players: {getAliveIds: () => [0, 1, 2], get: id => {
      assert.notEqual(id, 2, 'unmet owners are filtered before player reads');
      return id === 0 ? {Diplomacy: {hasMet: owner => owner === 1, getRelationshipLevelName: () => 'Friendly',
        getRelationshipLevel: () => 2, isAtWarWith: () => false}} : {
        isMajor: true, civilizationFullName: 'Known empire', leaderType: 10,
        get Cities() {throw Error('Do not enumerate a foreign empire settlement inventory');},
      };
    }},
    GameInfo: {Leaders: {lookup: () => ({Name: 'Known leader'})}, Terrains: {lookup: () => ({TerrainType: 'LAND'})},
      Features: {lookup: () => null}, Resources: {lookup: () => null}},
    RevealedStates: {HIDDEN: 0, FOGGED: 1, VISIBLE: 2},
    GameplayMap: {getGridWidth: () => 7, getGridHeight: () => 1,
      getRevealedState: (id, x) => x === 0 ? 0 : x === 1 ? 1 : 2,
      getTerrainType: () => 0, getFeatureType: () => 0, getResourceType: () => 0},
    MapCities: cityApi ? {getCity: (x, y) => {
      assert.ok(x >= 2, 'foreign settlement discovery scans currently visible tiles only'); tileReads.push(x);
      return {owner: x === 4 ? 2 : x === 6 ? 0 : 1, id: x === 3 && invalidComponent ? -1 : x === 5 ? 11 : 10};
    }} : undefined,
    Cities: {get: component => {
      assert.equal(component.owner, 1, 'own/unmet components are rejected before city reads');
      cityReads.push(component.id); return component.id === 10 ? visible : fogged;
    }},
    Game: {turn: 57},
  });
  return {data: JSON.parse(JSON.stringify(data)), cityReads, tileReads};
}

test('known-world settlement intelligence is deduplicated and limited to visible centres of met owners', () => {
  const {data, cityReads} = run();
  assert.ok(data.visibleForeignSettlements, 'visible foreign settlement summary is exported');
  assert.equal(data.visibleForeignSettlements.length, 1);
  assert.equal(data.visibleForeignSettlements[0].name, 'Visible city');
  assert.equal(data.visibleForeignSettlements[0].ownerId, 1);
  assert.deepEqual(data.visibleForeignSettlements[0].location, {x: 2, y: 0});
  assert.equal(data.visibleForeignSettlements[0].population, 7);
  assert.equal(data.visibleForeignSettlements[0].town, false);
  assert.deepEqual(cityReads, [10, 11]);
  assert.equal(data.exploredMap.exploredTiles, 6, 'existing revealed-terrain aggregate is retained');
});

test('a visible outlying district does not expose metadata from its fogged settlement centre', () => {
  const {data, tileReads} = run();
  assert.deepEqual(tileReads, [2, 3, 4, 5, 6]);
  assert.ok(data.visibleForeignSettlements, 'settlement scope is explicit');
  assert.equal(data.visibleForeignSettlements.length, 1);
  assert.ok(!JSON.stringify(data).includes('SECRET'));
});

test('missing native settlement-discovery API is unknown rather than an assertion that no settlements exist', () => {
  const {data, cityReads} = run({cityApi: false});
  assert.equal(data.visibleForeignSettlements, null);
  assert.equal(cityReads.length, 0);
  assert.equal(data.metLeaders.length, 1);
});

test('invalid native city component IDs are rejected before object lookup', () => {
  const {cityReads} = run({invalidComponent: true});
  assert.ok(!cityReads.includes(-1));
});
