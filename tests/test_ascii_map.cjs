const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}) {
  const reads = [];
  const playerReads = [];
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
      getTerrainType: (x, y) => {record('terrain', x, y); if (o.changedTurn) ctx.Game.turn++; return o.terrains?.[`${x},${y}`] ?? o.terrain ?? 'TERRAIN_FLAT';},
      ...(!o.noOwnerApi ? {getOwner: (x, y) => {
        record('owner', x, y, true);
        if (o.throwOwner) throw Error('ownership unavailable');
        return o.owners?.[`${x},${y}`] ?? (Object.hasOwn(o, 'owner') ? o.owner : -1);
      }} : {}),
    },
    Players: {get: id => {
      playerReads.push(id);
      return {civilizationFullName: id === 0 ? 'Rome' : 'Egypt',
        Diplomacy: {hasMet: () => !o.unmet, isAtWarWith: () => Boolean(o.atWar)}};
    }},
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
      return {id, owner: id.owner, isOnMap: !o.offMap, location: {x: o.wrongUnitLocation ? 3 : 2, y: 2}, type: 100, name: 'Scout',
        get Health() {record('health', 2, 2, true); return o.health;}};
    }},
  };
  if (o.noOverlayApis) {delete ctx.MapCities; delete ctx.MapUnits;}
  const data = vm.runInNewContext(fs.readFileSync('civ7/ascii_map.js', 'utf8'), ctx);
  return JSON.parse(JSON.stringify({data, reads, playerReads}));
}

test('renders wider flat-topped hexes with shared edges and explicit native coordinate labels', () => {
  const {data, reads} = run();
  assert.deepEqual(data.center, {x: 2, y: 2});
  assert.deepEqual(data.bounds, {minX: 1, maxX: 3, minY: 1, maxY: 3});
  assert.equal(data.turn, 7);
  const lines = data.ascii.split('\n');
  assert.equal(lines[0], 'center (2,2); N=upper-left E=upper-right');
  assert.equal(lines.length, 16);
  assert.ok(lines[7].startsWith('+       +---+       +'), 'adjacent content rows interlock with a shared cap');
  assert.ok(lines[7].endsWith('(1,3) (3,2)'), 'native odd-row coordinates survive the oblique projection');
  assert.ok(!data.ascii.includes('|'), 'no vertical dividers or internal bars');
  assert.equal(data.projection.style, 'flat-top');
  assert.equal(data.projection.north, 'upper-left');
  assert.equal(data.projection.east, 'upper-right');
  assert.equal(reads.filter(read => read.kind === 'terrain').length, 9);
  assert.equal(data.settlements.length, 0);
  assert.equal(data.units.length, 0);
  assert.match(data.ascii, /^[\x20-\x7e\n]+$/);
});

test('a visible flat-land hex has blank interiors instead of punctuation triplets', () => {
  const data = run({args: {width: 1, height: 1}}).data;
  assert.equal(data.ascii, [
    'center (2,2); N=upper-left E=upper-right',
    '  +---+',
    ' /     \\',
    '+       +  (2,2)',
    ' \\     /',
    '  +---+',
  ].join('\n'));
});

test('all six native neighbors share drawn edges, with each native coordinate labelled exactly once', () => {
  const lines = run().data.ascii.split('\n'), positions = new Map();
  for (let row = 1; row < lines.length; row++) {
    const labels = lines[row].match(/\(\d+,\d+\)/g) ?? [];
    const contents = [...lines[row].matchAll(/\+ {7}\+/g)];
    assert.equal(contents.length, labels.length);
    for (let i = 0; i < labels.length; i++) {
      assert.equal(positions.has(labels[i]), false);
      positions.set(labels[i], {x: contents[i].index + 4, y: row});
    }
  }
  assert.equal(positions.size, 9);
  const boundary = ({x, y}) => new Set([
    ...[-2, -1, 0, 1, 2].flatMap(dx => [`${x + dx},${y - 2}`, `${x + dx},${y + 2}`]),
    `${x - 3},${y - 1}`, `${x + 3},${y - 1}`, `${x - 4},${y}`, `${x + 4},${y}`,
    `${x - 3},${y + 1}`, `${x + 3},${y + 1}`,
  ]);
  const center = boundary(positions.get('(2,2)'));
  for (const label of ['(1,2)', '(3,2)', '(1,1)', '(2,1)', '(1,3)', '(2,3)']) {
    const shared = [...boundary(positions.get(label))].filter(point => center.has(point));
    assert.ok(shared.length === 3 || shared.length === 5, `${label} must share a diagonal or horizontal edge`);
    for (const point of shared) {
      const [column, row] = point.split(',').map(Number);
      assert.match(lines[row][column], /[+\-/\\]/);
    }
  }
  for (const label of ['(3,1)', '(3,3)']) {
    assert.equal([...boundary(positions.get(label))].some(point => center.has(point)), false);
  }
});

test('explored fog retains terrain but never queries entities; hidden/unknown tiles are opaque', () => {
  for (const state of [0, 1, 99, null]) {
    const {data, reads} = run({state, city: true, unit: true});
    assert.equal(data.settlements.length, 0);
    assert.equal(data.units.length, 0);
    assert.equal(reads.some(read => ['city', 'units'].includes(read.kind)), false);
    if (state === 1) assert.ok(data.ascii.includes('FOG'));
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

test('distinct terrain textures fill the upper and lower interiors without changing the hex outline', () => {
  for (const [terrain, texture] of [['TERRAIN_FLAT', '     '], ['TERRAIN_HILL', '^^^^^'], ['TERRAIN_MOUNTAIN', 'MMMMM'],
    ['TERRAIN_COAST', '~~~~~'], ['TERRAIN_OCEAN', 'OOOOO'], ['TERRAIN_NAVIGABLE_RIVER', '====='], ['MOD_TERRAIN', '?????'], ['toString', '?????']]) {
    const data = run({terrain, args: {width:1,height:1}}).data;
    assert.equal(data.ascii.split('\n')[2], ` /${texture}\\`, terrain);
    assert.equal(data.ascii.split('\n')[4], ` \\${texture}/`, terrain);
  }
});

test('the occupant is prominent at the center and fog is labelled explicitly, not as trailing punctuation', () => {
  const visible = run({terrain:'TERRAIN_HILL',unit:true,args:{width:1,height:1}}).data;
  assert.equal(visible.ascii, [
    'center (2,2); N=upper-left E=upper-right',
    '  +---+',
    ' /^^^^^\\',
    '+   U   +  (2,2)',
    ' \\^^^^^/',
    '  +---+',
  ].join('\n'));
  const fogged = run({terrain:'TERRAIN_MOUNTAIN',state:1,unit:true,args:{width:1,height:1}}).data;
  assert.ok(fogged.ascii.includes('/MMMMM\\'));
  assert.ok(fogged.ascii.includes('+       +'));
  assert.ok(fogged.ascii.includes('\\ FOG /'));
  assert.equal(fogged.units.length,0);
  assert.equal(visible.ascii.includes('FOG'),false);
});

test('mixed visible and fogged terrain textures preserve shared edges and do not inspect hidden tiles', () => {
  const {data,reads} = run({unit:true,states:{'1,3':0,'2,3':1},terrains:{
    '2,2':'TERRAIN_HILL','2,3':'TERRAIN_MOUNTAIN','1,2':'TERRAIN_COAST','3,2':'TERRAIN_NAVIGABLE_RIVER',
  }});
  for (const texture of ['^^^^^','MMMMM','~~~~~','=====','FOG','???']) assert.ok(data.ascii.includes(texture));
  assert.ok(data.ascii.includes('+   U   +'));
  assert.equal(data.units.length,1);
  assert.equal(reads.filter(read=>read.kind==='terrain').length,8);
  assert.equal(reads.filter(read=>read.kind==='units').length,7);
});

test('SVG data mode reuses the same bounded visibility filters and withholds unknown terrain/entities', () => {
  const {data,reads} = run({unit:true,states:{'1,3':0,'2,3':1},args:{render:'svg'}});
  assert.equal(data.tiles.length,9);
  assert.equal(Object.hasOwn(data,'ascii'),false);
  assert.deepEqual(data.tiles.find(tile=>tile.x===1&&tile.y===3),
    {x:1,y:3,terrain:null,visibility:'unknown',marker:'???',
      ownership:{status:'unknown',playerId:null,civilization:null}});
  assert.equal(data.tiles.find(tile=>tile.x===2&&tile.y===3).marker,' ');
  assert.equal(data.tiles.find(tile=>tile.x===2&&tile.y===2).marker,'U');
  assert.equal(data.units.length,1);
  assert.equal(reads.filter(read=>read.kind==='terrain').length,8);
  assert.equal(reads.filter(read=>read.kind==='units').length,7);
  assert.throws(()=>run({changedTurn:true,args:{render:'svg'}}),/context changed/i);
});

test('map unit health uses remaining native HP only for already-visible owned or met units', () => {
  for (const extra of [{}, {foreignUnit:true}, {foreignUnit:true,atWar:true}]) {
    const {data,reads}=run({unit:true,health:{damage:28,maxDamage:100},args:{render:'svg'},...extra});
    assert.deepEqual(data.units[0].health,{current:72,maximum:100});
    assert.equal(reads.filter(read=>read.kind==='health').length,1);
  }
  assert.deepEqual(run({unit:true,health:{damage:60,maxDamage:200},args:{render:'svg'}}).data.units[0].health,
    {current:140,maximum:200});
});

test('missing or invalid unit health stays unknown rather than looking fully healed', () => {
  for (const health of [undefined,null,{}, {damage:0,maxDamage:0}, {damage:-1,maxDamage:100},
    {damage:101,maxDamage:100}, {damage:NaN,maxDamage:100}, {damage:0,maxDamage:Infinity},
    {damage:'28',maxDamage:100}, {damage:false,maxDamage:100}]) {
    assert.equal(run({unit:true,health,args:{render:'svg'}}).data.units[0].health,null);
  }
  assert.deepEqual(run({unit:true,health:{damage:100,maxDamage:100},args:{render:'svg'}}).data.units[0].health,
    {current:0,maximum:100});
});

test('health is never queried for fogged, unknown, invisible, unmet or off-map units', () => {
  for (const extra of [{state:0}, {state:1}, {invisibleUnit:true}, {foreignUnit:true,unmet:true},
    {offMap:true}, {wrongUnitLocation:true}]) {
    const {data,reads}=run({unit:true,health:{damage:28,maxDamage:100},args:{render:'svg'},...extra});
    assert.equal(data.units.length,0);
    assert.equal(reads.some(read=>read.kind==='health'),false);
  }
});

test('even the largest viewport scans only its bounded area, not the world', () => {
  const {data, reads} = run({mapWidth: 200, mapHeight: 200, args: {x: 100, y: 100, width: 31, height: 21}});
  assert.equal(reads.filter(read => read.kind === 'terrain').length, 31 * 21);
  assert.deepEqual(data.bounds, {minX: 85, maxX: 115, minY: 90, maxY: 110});
  assert.equal(data.ascii.split('\n').length, 126);
});

test('visible own/met cities and units have coordinates and markers; city overlay wins without losing unit evidence', () => {
  const own = run({city: true, unit: true}).data;
  assert.ok(own.ascii.includes('+   C   +'));
  assert.deepEqual(own.settlements[0], {x: 2, y: 2, ownerId: 0, cityId: 10, name: 'Test City', marker: 'C'});
  assert.equal(own.units[0].instanceId, 20);
  assert.equal(own.units[0].marker, 'U');
  const foreign = run({city: true, unit: true, foreignCity: true, foreignUnit: true}).data;
  assert.equal(foreign.settlements[0].marker, 'c');
  assert.equal(foreign.units[0].marker, 'u');
  assert.ok(run({unit: true, foreignUnit: true, atWar: true}).data.ascii.includes('+   !   +'));
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
  assert.ok(data.ascii.includes('+   ?   +'));
});

test('invalid, unbounded and stale-context requests fail without revealing a map', () => {
  for (const args of [{x: true}, {x: -1}, {x: 6}, {y: 5}, {width: 0}, {width: 32}, {width: 4},
    {height: 22}, {height: 2}, {height: true}]) assert.throws(() => run({args}), /coordinate|dimension|width|height|viewport/i);
  assert.throws(() => run({changedTurn: true}), /context changed/i);
  assert.throws(() => run({notInGame: true}), /Load a save/);
});

test('ASCII and SVG map tiles carry ownership without changing the ASCII drawing or entity ownership', () => {
  for (const render of [undefined, 'svg']) {
    const args = {width: 3, height: 1, render};
    const {data} = run({args, owners: {'1,2': 0, '2,2': 1, '3,2': -1}});
    assert.deepEqual(data.tiles.map(tile => tile.ownership), [
      {status: 'ours', playerId: 0, civilization: 'Rome'},
      {status: 'foreign', playerId: 1, civilization: 'Egypt'},
      {status: 'unowned', playerId: null, civilization: null},
    ]);
    if (!render) assert.equal(data.ascii, run({args}).data.ascii);
    const occupied = run({args, owner: 0, unit: true, foreignUnit: true}).data;
    assert.equal(occupied.tiles.find(tile => tile.x === 2).ownership.status, 'ours');
    assert.equal(occupied.units[0].ownerId, 1, 'tile owner is not inferred from the occupying unit');
  }
});

test('both map modes withhold current ownership in fog/unknown tiles and never resolve unmet owners', () => {
  for (const render of [undefined, 'svg']) {
    for (const state of [0, 1, 99, null]) {
      const {data, reads} = run({state, owner: 1, args: {render}});
      assert.ok(data.tiles.every(tile => tile.ownership.status === 'unknown'));
      assert.equal(reads.some(read => read.kind === 'owner'), false);
    }
    const {data, playerReads} = run({owner: 1, unmet: true, args: {render}});
    assert.ok(data.tiles.every(tile => tile.ownership.status === 'unknown' && tile.ownership.playerId === null && tile.ownership.civilization === null));
    assert.ok(!playerReads.includes(1));
    for (const extra of [{noOwnerApi: true}, {throwOwner: true}, {owner: -2}, {owner: null}, {owner: '1'}]) {
      assert.ok(run({...extra, args: {render}}).data.tiles.every(tile => tile.ownership.status === 'unknown'));
    }
  }
});
