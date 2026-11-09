const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function run({missingOwner = false, throwOwner = false} = {}) {
  const ownerReads = [];
  const playerReads = [];
  const data = vm.runInNewContext(fs.readFileSync('civ7/map.js', 'utf8'), {
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0}, Game: {turn: 59},
    Players: {get: id => {
      playerReads.push(id);
      assert.ok(id === 0 || id === 1, 'unmet player identities must not be read');
      return id === 0 ? {civilizationFullName: 'Rome', Diplomacy: {hasMet: other => other === 1}}
        : {civilizationFullName: 'Egypt'};
    }},
    Locale: {compose: key => key}, RevealedStates: {HIDDEN: 0, REVEALED: 1, VISIBLE: 2},
    RiverTypes: {NO_RIVER: 0},
    GameplayMap: {
      getGridWidth: () => 7, getGridHeight: () => 1,
      getRevealedState: (id, x) => x === 5 ? 0 : x === 4 ? 1 : 2,
      ...(!missingOwner ? {getOwner: x => {
        ownerReads.push(x);
        assert.ok(x !== 4 && x !== 5, 'current ownership must not be read in fog or hidden tiles');
        if (throwOwner) throw Error('unavailable');
        return [0, 1, -1, 2, 1, 1, undefined][x];
      }} : {}),
      getIndexFromLocation: p => p.x,
      getTerrainType: x => {assert.notEqual(x, 5); return 'FLAT';},
      getFeatureType: () => null, getBiomeType: () => null, getResourceType: () => null,
      getRiverType: () => 0, getYields: () => [], isWater: () => false, isFreshWater: () => false,
    },
    GameInfo: {Terrains: {lookup: () => ({TerrainType: 'TERRAIN_FLAT'})},
      Features: {lookup: () => null}, Biomes: {lookup: () => null}, Resources: {lookup: () => null}},
  });
  return {data: JSON.parse(JSON.stringify(data)), ownerReads, playerReads};
}

test('explored map distinguishes our territory, a met civilization and unowned land', () => {
  const {data} = run();
  assert.deepEqual(data.tiles[0].ownership, {status: 'ours', playerId: 0, civilization: 'Rome'});
  assert.deepEqual(data.tiles[1].ownership, {status: 'foreign', playerId: 1, civilization: 'Egypt'});
  assert.deepEqual(data.tiles[2].ownership, {status: 'unowned', playerId: null, civilization: null});
});

test('unmet, fogged and unavailable ownership stay unknown, not unowned', () => {
  const {data, ownerReads, playerReads} = run();
  for (const x of [3, 4, 6]) {
    assert.deepEqual(data.tiles.find(t => t.x === x).ownership,
      {status: 'unknown', playerId: null, civilization: null});
  }
  assert.equal(data.tiles.some(t => t.x === 5), false);
  assert.deepEqual(ownerReads, [0, 1, 2, 3, 6]);
  assert.ok(!playerReads.includes(2));
  for (const settings of [{missingOwner: true}, {throwOwner: true}]) {
    const result = run(settings).data;
    assert.equal(result.tiles[0].terrain, 'TERRAIN_FLAT');
    assert.equal(result.tiles[0].ownership.status, 'unknown');
  }
});
