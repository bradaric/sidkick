const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}) {
  const reads = [];
  const state = (x, y) => o.states?.[`${x},${y}`] ?? (Object.hasOwn(o, 'state') ? o.state : 2);
  const record = (kind, x, y, visibleOnly = false) => {
    reads.push({kind, x, y});
    assert.ok([1, 2].includes(state(x, y)), 'never inspect hidden/unknown tile data');
    if (visibleOnly) assert.equal(state(x, y), 2, 'entities only on currently visible tiles');
  };
  const cityId = {owner: o.foreignCity ? 1 : 0, id: 10, type: 1};
  const unitId = {owner: o.foreignUnit ? 1 : 0, id: 20, type: 26};
  const ctx = {
    queryArguments: {x: 2, y: 2, width: 3, height: 3, ...o.args},
    UI: {isInGame: () => !o.notInGame}, GameContext: {localPlayerID: 0}, Game: {turn: 7, age: 42},
    RevealedStates: {HIDDEN: 0, REVEALED: 1, VISIBLE: 2},
    GameplayMap: {
      getGridWidth: () => o.mapWidth ?? 6, getGridHeight: () => o.mapHeight ?? 5,
      getRevealedState: (player, x, y) => {reads.push({kind: 'visibility', x, y}); return state(x, y);},
      getTerrainType: (x, y) => {record('terrain', x, y); if (o.changedTurn) ctx.Game.turn++; return o.terrain ?? 'TERRAIN_FLAT';},
    },
    Players: {get: () => ({Diplomacy: {hasMet: () => !o.unmet, isAtWarWith: () => Boolean(o.atWar)}})},
    GameInfo: {Terrains: {lookup: type => ({TerrainType: type})}, Units: {lookup: () => ({UnitType: 'UNIT_SCOUT', Name: 'Scout'})}},
    Locale: {compose: value => value},
    MapCities: {getCity: (x, y) => {record('city', x, y, true); return o.city && x === 2 && y === 2 ? cityId : null;}},
    Cities: {get: id => {
      assert.ok(id.owner === 0 || !o.unmet, 'never resolve unmet cities');
      return {id, owner: id.owner, location: {x: o.district ? 3 : 2, y: 2}, name: 'Test City'};
    }},
    MapUnits: {getUnits: (x, y) => {record('units', x, y, true); return o.unit && x === 2 && y === 2 ? [unitId] : [];}},
    Visibility: {isVisible: () => !o.invisibleUnit},
    Units: {get: id => {
      assert.ok(!o.invisibleUnit && (id.owner === 0 || !o.unmet), 'never resolve hidden/unmet unit details');
      return {id, owner: id.owner, isOnMap: !o.offMap, location: {x: o.wrongUnitLocation ? 3 : 2, y: 2}, type: 100, name: 'Scout'};
    }},
  };
  if (o.noOverlayApis) {delete ctx.MapCities; delete ctx.MapUnits;}
  const data = vm.runInNewContext(fs.readFileSync('civ7/ascii_map.js', 'utf8'), ctx);
  return JSON.parse(JSON.stringify({data, reads}));
}

test('renders a bounded north-up odd-row-offset ASCII grid with coordinate labels', () => {
  const {data, reads} = run();
  assert.deepEqual(data.center, {x: 2, y: 2});
  assert.deepEqual(data.bounds, {minX: 1, maxX: 3, minY: 1, maxY: 3});
  assert.equal(data.turn, 7);
  assert.equal(data.ascii, 'x |   1   2   3\n3 |   ... ... ...\n2 | ... ... ...\n1 |   ... ... ...');
  assert.equal(reads.filter(read => read.kind === 'terrain').length, 9);
  assert.equal(data.settlements.length, 0);
  assert.equal(data.units.length, 0);
  assert.match(data.ascii, /^[\x20-\x7e\n]+$/);
});

test('explored fog retains terrain but never queries entities; hidden/unknown tiles are opaque', () => {
  for (const state of [0, 1, 99, null]) {
    const {data, reads} = run({state, city: true, unit: true});
    assert.equal(data.settlements.length, 0);
    assert.equal(data.units.length, 0);
    assert.equal(reads.some(read => ['city', 'units'].includes(read.kind)), false);
    if (state === 1) assert.ok(data.ascii.includes('. :'));
    else {
      assert.ok(data.ascii.includes('???'));
      assert.equal(reads.some(read => read.kind === 'terrain'), false);
    }
  }
});

test('clips at map edges without shifting the requested center or wrapping across the seam', () => {
  const {data, reads} = run({args: {x: 0, y: 0, width: 5, height: 3}});
  assert.deepEqual(data.bounds, {minX: 0, maxX: 2, minY: 0, maxY: 1});
  assert.deepEqual(data.center, {x: 0, y: 0});
  assert.equal(reads.filter(read => read.kind === 'terrain').length, 6);
  assert.ok(reads.every(read => read.x >= 0 && read.x <= 2 && read.y >= 0 && read.y <= 1));
});

test('terrain symbols are stable and unknown definitions are not guessed', () => {
  for (const [terrain, glyph] of [['TERRAIN_FLAT', '.'], ['TERRAIN_HILL', '^'], ['TERRAIN_MOUNTAIN', 'M'],
    ['TERRAIN_COAST', '~'], ['TERRAIN_OCEAN', 'O'], ['TERRAIN_NAVIGABLE_RIVER', '='], ['MOD_TERRAIN', '?'], ['toString', '?']]) {
    assert.ok(run({terrain}).data.ascii.includes(`${glyph}..`), terrain);
  }
});

test('even the largest viewport scans only its bounded area, not the world', () => {
  const {data, reads} = run({mapWidth: 200, mapHeight: 200, args: {x: 100, y: 100, width: 31, height: 21}});
  assert.equal(reads.filter(read => read.kind === 'terrain').length, 31 * 21);
  assert.deepEqual(data.bounds, {minX: 85, maxX: 115, minY: 90, maxY: 110});
  assert.equal(data.ascii.split('\n').length, 22);
});

test('visible own/met cities and units have coordinates and markers; city overlay wins without losing unit evidence', () => {
  const own = run({city: true, unit: true}).data;
  assert.ok(own.ascii.includes('.C.'));
  assert.deepEqual(own.settlements[0], {x: 2, y: 2, ownerId: 0, cityId: 10, name: 'Test City', marker: 'C'});
  assert.equal(own.units[0].instanceId, 20);
  assert.equal(own.units[0].marker, 'U');
  const foreign = run({city: true, unit: true, foreignCity: true, foreignUnit: true}).data;
  assert.equal(foreign.settlements[0].marker, 'c');
  assert.equal(foreign.units[0].marker, 'u');
  assert.ok(run({unit: true, foreignUnit: true, atWar: true}).data.ascii.includes('.!.'));
});

test('fogged, invisible, packed, mismatched and unmet entities never appear; districts are not city centres', () => {
  for (const o of [{state: 1}, {foreignCity: true, foreignUnit: true, unmet: true}]) {
    const data = run({city: true, unit: true, ...o}).data;
    assert.equal(data.settlements.length, 0);
    assert.equal(data.units.length, 0);
  }
  assert.equal(run({city: true, district: true}).data.settlements.length, 0);
  for (const o of [{invisibleUnit: true}, {offMap: true}, {wrongUnitLocation: true}]) {
    assert.equal(run({unit: true, ...o}).data.units.length, 0);
  }
});

test('unavailable entity APIs are reported as incomplete coverage, not an empty safe map', () => {
  const data = run({noOverlayApis: true}).data;
  assert.equal(data.coverage.settlements, false);
  assert.equal(data.coverage.units, false);
  assert.ok(data.ascii.includes('.?.'));
});

test('invalid, unbounded and stale-context requests fail without revealing a map', () => {
  for (const args of [{x: true}, {x: -1}, {x: 6}, {y: 5}, {width: 0}, {width: 32}, {width: 4},
    {height: 22}, {height: 2}, {height: true}]) assert.throws(() => run({args}), /coordinate|dimension|width|height|viewport/i);
  assert.throws(() => run({changedTurn: true}), /context changed/i);
  assert.throws(() => run({notInGame: true}), /Load a save/);
});
