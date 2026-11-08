const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const QUEUE = [{kind: 1, type: 101, instance: 7, location: {x: 25, y: 11}, modifiers: 0}];
const UNIT = {id: {owner: 0, id: 11, type: 2}, type: 201, location: {x: 26, y: 12}};

function run(o = {}, script = 'apply_city_construction.js') {
  const calls = [];
  const mode = o.mode ?? 'append';
  const kind = o.kind ?? 'unit';
  const item = kind === 'unit' ? 'UNIT_SCOUT' : kind === 'building' ? 'BUILDING_QUAY' : 'PROJECT_TEST';
  const args = {mode, settlement: 'Copan', item, expected_turn: 58,
    x: kind === 'building' ? 24 : null, y: kind === 'building' ? 4 : null,
    max_gold_cost: mode === 'purchase' ? 120 : null,
    city_id: 10, baseline_queue: QUEUE, baseline_asset_ids: [UNIT.id], ...o.args};
  let queue = JSON.parse(JSON.stringify(o.queue ?? QUEUE));
  const units = o.units ?? [UNIT];
  const buildings = o.buildings ?? [];
  const definition = kind === 'unit' ? {UnitType: item, $hash: 201, $index: 2}
    : kind === 'building' ? {ConstructibleType: item, ConstructibleClass: o.wonder ? 'WONDER' : 'BUILDING', $hash: 301, $index: 3}
      : {ProjectType: item, $hash: 401, $index: 4};
  const result = {Success: o.allowed ?? true, Cost: o.cost === null ? undefined : o.cost ?? 120,
    Plots: [320], ...o.result};
  const city = {id: {owner: o.foreign ? 1 : 0, id: 10, type: 1}, name: 'Copan',
    location: {x: 26, y: 12}, isTown: o.town ?? false,
    BuildQueue: {getQueue: () => queue},
    Yields: {calculateAllBuildingsPlacements: () => ({buildings: o.noPreview ? [] : [
      {constructibleType: 301, placements: [{plotID: 320, overbuiltConstructibleID: o.overbuild ?? -1}]}]})},
    Constructibles: {getIds: () => buildings.map(b => b.id)},
  };
  const player = {isTurnActive: o.inactive !== true, Treasury: {goldBalance: o.gold ?? 1000},
    Cities: {getCities: () => o.missingCity ? [] : o.duplicateCity ? [city, city] : [city]},
    Units: {getUnits: () => units}};
  const native = label => ({
    canStart: (id, operation, parameters, exclusion) => {
      calls.push({kind: 'check', label, id, operation, parameters, exclusion});
      if (o.changedTurn) context.Game.turn++;
      if (o.changedQueue) queue = [];
      if (o.changedGold) player.Treasury.goldBalance = 0;
      return kind === 'building' && parameters.X == null && parameters.Y == null
        ? {...result, ...o.generalResult} : {...result, ...o.selectedResult};
    },
    sendRequest: (id, operation, parameters) => {
      calls.push({kind: 'send', label, id, operation, parameters});
      if (o.sendThrows) throw Error('Acknowledgement lost');
    },
  });
  const lookup = (field, value) => definition[field] === value || value === definition.$hash ? definition : null;
  const context = {queryArguments: args, UI: {isInGame: () => !o.notInGame},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sentTurn ?? false},
    Players: {get: id => {assert.equal(id, 0); return player;}}, Locale: {compose: value => value},
    GameInfo: {Units: {lookup: value => lookup('UnitType', value)},
      Constructibles: {lookup: value => lookup('ConstructibleType', value)},
      Projects: {lookup: value => lookup('ProjectType', value)}},
    GameplayMap: {getIndexFromLocation: location => location.x === 24 && location.y === 4 ? 320 : -1,
      getLocationFromIndex: () => ({x: 24, y: 4}), getRevealedState: () => o.hidden ? 0 : 1},
    RevealedStates: {HIDDEN: 0},
    Constructibles: {getByComponentID: id => buildings.find(b => JSON.stringify(b.id) === JSON.stringify(id))},
    CityOperationsParametersValues: {Append: o.noAppendMode ? undefined : 900}, CityOperationTypes: {BUILD: 800},
    CityCommandTypes: {PURCHASE: 700},
    Game: {turn: 58, age: 42, CityOperations: native('operation'), CityCommands: native('command')},
  };
  const source = fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8');
  let data;
  try { data = vm.runInNewContext(source, context); }
  catch (error) { if (!o.sendThrows) throw error; data = {error: error.message}; }
  return JSON.parse(JSON.stringify({data, calls}));
}

test('append explicitly uses Append and captures the existing queue for verification', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls[1], {kind: 'send', label: 'operation', id: {owner: 0, id: 10, type: 1},
    operation: 800, parameters: {UnitType: 201, InsertMode: 900}});
  assert.deepEqual(data.verificationArguments.baseline_queue, QUEUE);
  assert.equal(data.expected.queueAppendObserved, true);
  assert.equal(calls.filter(c => c.kind === 'send').length, 1);
});

test('buildings require an explicit valid non-overbuilding tile for append and purchase', () => {
  for (const mode of ['append', 'purchase']) {
    const {data, calls} = run({kind: 'building', mode});
    assert.equal(data.status, 'submitted');
    assert.deepEqual(calls.find(call => call.kind === 'send').parameters, {ConstructibleType: 301, X: 24, Y: 4,
      ...(mode === 'append' ? {InsertMode: 900} : {})});
    for (const extra of [{args: {x: null}}, {args: {y: null}}, {args: {x: true}},
      {args: {x: 25}}, {overbuild: 0}, {noPreview: true}, {hidden: true}, {wonder: true},
      {result: {InProgress: true}}, {result: {RepairDamaged: true}}, {result: {AlreadyExists: true}}]) {
      const blocked = run({kind: 'building', mode, ...extra});
      assert.equal(blocked.data.status, 'rejected', JSON.stringify(extra));
      assert.equal(blocked.calls.filter(c => c.kind === 'send').length, 0);
    }
  }
});

test('building plot membership comes from the general check when the selected-tile check omits lists', () => {
  for (const mode of ['append', 'purchase']) {
    const {data, calls} = run({kind: 'building', mode,
      generalResult: {Plots: undefined, ExpandUrbanPlots: [320]},
      selectedResult: {Plots: undefined, ExpandUrbanPlots: undefined}});
    assert.equal(data.status, 'submitted');
    assert.deepEqual(calls.map(call => call.kind), ['check', 'check', 'send']);
    assert.equal(calls[0].parameters.X, undefined);
    assert.equal(calls[0].parameters.Y, undefined);
    assert.equal(calls[1].parameters.X, 24);
    assert.equal(calls[1].parameters.Y, 4);
    assert.deepEqual(calls[2].parameters, calls[1].parameters);
  }
});

test('a selected-tile success cannot bypass missing/illegal general plots or general blockers', () => {
  for (const mode of ['append', 'purchase']) {
    for (const generalResult of [{Plots: [999]}, {Plots: undefined, ExpandUrbanPlots: undefined},
      {Success: false}, {InProgress: true}, {InQueue: true}, {RepairDamaged: true}, {AlreadyExists: true}]) {
      const {data, calls} = run({kind: 'building', mode, generalResult});
      assert.equal(data.status, 'rejected', JSON.stringify(generalResult));
      assert.equal(calls.filter(call => call.kind === 'send').length, 0);
    }
  }
});

test('a general legal plot never bypasses the selected-tile blocker or exact selected purchase cost', () => {
  for (const selectedResult of [{Success: false}, {InQueue: true}, {Cost: 120.01}, {Cost: undefined}]) {
    const {data, calls} = run({kind: 'building', mode: 'purchase',
      generalResult: {Cost: 1}, selectedResult});
    assert.equal(data.status, 'rejected', JSON.stringify(selectedResult));
    assert.equal(calls.filter(call => call.kind === 'send').length, 0);
  }
});

test('unit purchases in cities and towns use commands, retain fractional costs and capture owned IDs', () => {
  for (const town of [false, true]) {
    const {data, calls} = run({mode: 'purchase', town, cost: 119.5,
      units: [UNIT, {...UNIT, id: {owner: 1, id: 99, type: 2}}]});
    assert.equal(data.status, 'submitted');
    assert.equal(data.quotedGoldCost, 119.5);
    assert.deepEqual(data.verificationArguments.baseline_asset_ids, [UNIT.id]);
    assert.deepEqual(calls[1], {kind: 'send', label: 'command', id: {owner: 0, id: 10, type: 1},
      operation: 700, parameters: {UnitType: 201}});
  }
});

test('purchase cap, balance and unknown quote block submission; genuine zero is allowed', () => {
  for (const extra of [{cost: 120.01}, {cost: null}, {gold: 119}, {result: {InsufficientFunds: true}},
    {args: {max_gold_cost: true}}, {args: {max_gold_cost: -1}}, {args: {max_gold_cost: Infinity}}]) {
    const {data, calls} = run({mode: 'purchase', ...extra});
    assert.equal(data.status, 'rejected', JSON.stringify(extra));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({mode: 'purchase', cost: 0, gold: 0, args: {max_gold_cost: 0}}).data.status, 'submitted');
});

test('native blockers, foreign/ambiguous names, stale/inactive contexts and unsupported actions cannot write', () => {
  for (const extra of [{allowed: false}, {foreign: true}, {missingCity: true}, {duplicateCity: true},
    {notInGame: true}, {inactive: true}, {sentTurn: true}, {args: {expected_turn: 57}},
    {args: {expected_turn: true}}, {args: {mode: 'upgrade'}}, {args: {item: 'NO_SUCH_ITEM'}},
    {args: {x: 24, y: 4}}, {args: {settlement: ''}}, {town: true},
    {changedTurn: true}, {changedQueue: true}, {result: {InQueue: true}}]) {
    const {data, calls} = run(extra);
    assert.equal(data.status, 'rejected', JSON.stringify(extra));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({mode: 'purchase', changedGold: true}).data.status, 'rejected');
  assert.equal(run({mode: 'purchase', kind: 'project'}).data.status, 'rejected');
});

test('ordinary projects can append in a city but not change town focus or be purchased', () => {
  const {data, calls} = run({kind: 'project'});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls[1].parameters, {ProjectType: 401, InsertMode: 900});
  assert.equal(run({kind: 'project', town: true}).data.status, 'rejected');
});

test('a missing native Append constant must not fall back to default queue insertion', () => {
  const {data, calls} = run({noAppendMode: true});
  assert.equal(data.status, 'rejected');
  assert.equal(calls.filter(c => c.kind === 'send').length, 0);
});

test('a lost send acknowledgement never causes another submission', () => {
  const {data, calls} = run({mode: 'purchase', sendThrows: true});
  assert.match(data.error, /Acknowledgement lost/);
  assert.equal(calls.filter(c => c.kind === 'send').length, 1);
});

test('append readback needs exactly the original queue followed by the requested new item', () => {
  const appended = {kind: 2, type: 201, unitType: 201, location: {x: -1, y: -1}};
  const read = queue => run({queue}, 'city_construction_state.js');
  assert.equal(read([...QUEUE, appended]).data.queueAppendObserved, true);
  for (const queue of [QUEUE, [appended, ...QUEUE], [appended], [...QUEUE, appended, appended],
    [{...QUEUE[0], instance: 99}, appended], [...QUEUE, {...appended, type: 202}]]) {
    assert.equal(read(queue).data.queueAppendObserved, false);
  }
  assert.equal(read([...QUEUE, appended]).calls.length, 0);
});

test('unit readback requires one new owned matching ID, not Gold loss or foreign/old/wrong units', () => {
  const fresh = {...UNIT, id: {...UNIT.id, id: 12}};
  const read = units => run({mode: 'purchase', units}, 'city_construction_state.js');
  assert.equal(read([UNIT, fresh]).data.purchaseObserved, true);
  assert.deepEqual(read([UNIT, fresh]).data.newAssets[0].id, fresh.id);
  for (const units of [[UNIT], [UNIT, {...fresh, type: 999}], [UNIT, {...fresh, id: {...fresh.id, owner: 1}}],
    [UNIT, fresh, {...fresh, id: {...fresh.id, id: 13}}]]) {
    assert.equal(read(units).data.purchaseObserved, false);
  }
});

test('purchase readback also requires the existing production queue to remain unchanged', () => {
  const fresh = {...UNIT, id: {...UNIT.id, id: 12}};
  for (const queue of [[], [...QUEUE, {type: 201}], [{...QUEUE[0], instance: 99}]]) {
    const {data} = run({mode: 'purchase', units: [UNIT, fresh], queue}, 'city_construction_state.js');
    assert.equal(data.purchaseObserved, false);
  }
});

test('building append readback cannot verify the right building at the wrong tile', () => {
  const tail = {type: 301, location: {x: 24, y: 4}};
  const read = tail => run({kind: 'building', queue: [...QUEUE, tail]}, 'city_construction_state.js');
  assert.equal(read(tail).data.queueAppendObserved, true);
  assert.equal(read({...tail, location: {x: 23, y: 4}}).data.queueAppendObserved, false);
});

test('building readback proves a new matching owned component at the exact requested tile', () => {
  const building = {id: {owner: 0, id: 22, type: 3}, type: 301, location: {x: 24, y: 4}, damaged: false};
  const read = (buildings, args = {}) => run({mode: 'purchase', kind: 'building', buildings,
    args: {baseline_asset_ids: [], ...args}}, 'city_construction_state.js');
  assert.equal(read([building]).data.purchaseObserved, true);
  for (const changed of [{location: {x: 23, y: 4}}, {damaged: true}, {type: 999},
    {id: {...building.id, owner: 1}}]) {
    assert.equal(read([{...building, ...changed}]).data.purchaseObserved, false);
  }
  assert.equal(read([building], {baseline_asset_ids: [building.id]}).data.purchaseObserved, false);
});
