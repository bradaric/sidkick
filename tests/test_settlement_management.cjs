const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'settlement_management.js') {
  const mode = o.mode ?? 'focus', calls = [];
  const worker = {PlotIndex: 80, NumWorkers: o.workers ?? 0, MaxWorkers: 2, IsBlocked: o.blocked ?? false};
  const city = {id: {owner: o.foreign ? 1 : 0, id: 10, type: 1}, name: 'Test',
    isTown: o.isTown ?? mode !== 'specialist', pendingPopulation: o.pending ?? 1,
    Growth: {growthType: o.currentFocus ? 20 : 10, projectType: o.currentFocus ? 301 : -1,
      isReadyToPlacePopulation: o.ready ?? true},
    Gold: {getTownUpgradeCost: () => o.cost === null ? undefined : o.cost ?? 500},
    Workers: {GetAllPlacementInfo: () => o.notOffered ? [] : [worker]}};
  const player = {isTurnActive: !o.inactive, Treasury: {goldBalance: o.gold ?? 1000},
    Cities: {getCities: () => o.duplicate ? [city, city] : [city]}};
  const native = label => ({canStart: (id, operation, args, exclusion) => {
    calls.push({kind: 'check', label, id, operation, args, exclusion});
    if (o.changed) context.Game.turn++;
    if (o.changedPrice) o.cost = 501;
    if (operation === 800 && args.Type === 20 && args.ProjectType == null) {
      return {Success: false, Projects: o.notOffered ? [] : [5]};
    }
    return {Success: !o.nativeBlocked, InsufficientFunds: o.insufficient ?? false,
      ...(o.nativeCost == null ? {} : {Cost: o.nativeCost}), FailureReasons: ['Native blocker']};
  }, sendRequest: (id, operation, args) => {
    calls.push({kind: 'send', label, id, operation, args});
    if (o.sendThrows) throw Error('Lost acknowledgement');
  }});
  const context = {queryArguments: {mode, settlement: 'Test', focus: 'PROJECT_TOWN_PRODUCTION', max_gold_cost: 500,
    x: 6, y: 1, expected_turn: 59, city_id: 10, ...o.args},
    UI: {isInGame: () => !o.notInGame}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sentTurn ?? false},
    Players: {get: () => player}, Locale: {compose: x => x},
    GrowthTypes: {EXPAND: 10, PROJECT: 20}, ProjectTypes: {NO_PROJECT: -1},
    GameInfo: {Projects: {lookup: value => [5, 301, 'PROJECT_TOWN_PRODUCTION'].includes(value)
      ? {$hash: 301, ProjectType: 'PROJECT_TOWN_PRODUCTION'} : null}},
    GameplayMap: {getGridWidth: () => 74, getGridHeight: () => 50, getIndexFromLocation: () => 80,
      getRevealedState: () => o.hidden ? 0 : 1}, RevealedStates: {HIDDEN: 0},
    CityCommandTypes: {CHANGE_GROWTH_MODE: 800, PURCHASE: 900}, OrderTypes: {ORDER_TOWN_UPGRADE: 700},
    PlayerOperationTypes: {ASSIGN_WORKER: 600},
    Game: {turn: 59, age: 42, CityCommands: native('city'), PlayerOperations: native('player')},
  };
  let data;
  try { data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context); }
  catch (error) { if (!o.sendThrows) throw error; data = {error: error.message}; }
  return JSON.parse(JSON.stringify({data, calls}));
}

test('focus uses the offered project hash, exact town ID and native helper arguments', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.at(-1), {kind: 'send', label: 'city', id: {owner: 0, id: 10, type: 1}, operation: 800,
    args: {Type: 20, ProjectType: 301, City: 10}});
  assert.equal(data.expected.focus, 'PROJECT_TOWN_PRODUCTION');
  assert.equal(run({currentFocus: true}).data.status, 'already_active');
});

test('growth focus is explicit and does not require a project list', () => {
  const {data, calls} = run({currentFocus: true, notOffered: true, args: {focus: 'GROWTH'}});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.at(-1).args, {Type: 10, ProjectType: -1, City: 10});
  for (const o of [{notOffered: true}, {args: {focus: 'PROJECT_UNKNOWN'}}, {isTown: false}]) {
    assert.equal(run(o).data.status, 'rejected');
  }
});

test('upgrade uses the dedicated purchase directive, current town quote and explicit cap', () => {
  const {data, calls} = run({mode: 'upgrade'});
  assert.equal(data.status, 'submitted');
  assert.equal(data.quotedGoldCost, 500);
  assert.deepEqual(calls.at(-1), {kind: 'send', label: 'city', id: {owner: 0, id: 10, type: 1}, operation: 900,
    args: {Directive: 700}});
  assert.equal(data.expected.isTown, false);
  for (const o of [{cost: 501}, {cost: null}, {gold: 499}, {insufficient: true}, {changedPrice: true},
    {nativeCost: 501}, {args: {max_gold_cost: true}}, {args: {max_gold_cost: -1}}]) {
    const {data, calls} = run({mode: 'upgrade', ...o});
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({mode: 'upgrade', isTown: false}).data.status, 'already_active');
  assert.equal(run({mode: 'upgrade', cost: 0, gold: 0, args: {max_gold_cost: 0}}).data.status, 'submitted');
});

test('specialists consume one pending population in the selected owned city and increase that tile count', () => {
  const {data, calls} = run({mode: 'specialist'});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.at(-1), {kind: 'send', label: 'player', id: 0, operation: 600,
    args: {Location: 80, Amount: 1}});
  assert.equal(data.expected.workerCount, 1);
  assert.equal(data.expected.pendingPopulation, 0);
  for (const o of [{isTown: true}, {ready: false}, {pending: 0}, {workers: 2}, {blocked: true},
    {notOffered: true}, {hidden: true}, {args: {x: true}}, {args: {y: 50}}]) {
    const {data, calls} = run({mode: 'specialist', ...o});
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
});

test('all modes reject stale, inactive, foreign, ambiguous and native-blocked actions', () => {
  for (const mode of ['focus', 'upgrade', 'specialist']) {
    for (const o of [{foreign: true}, {duplicate: true}, {inactive: true}, {notInGame: true}, {sentTurn: true},
      {args: {expected_turn: 58}}, {args: {mode: 'raw'}}, {nativeBlocked: true}, {changed: true}]) {
      const {data, calls} = run({mode, ...o});
      assert.equal(data.status, 'rejected', JSON.stringify({mode, o}));
      assert.equal(calls.filter(c => c.kind === 'send').length, 0);
    }
    const uncertain = run({mode, sendThrows: true});
    assert.match(uncertain.data.error, /Lost acknowledgement/);
    assert.equal(uncertain.calls.filter(c => c.kind === 'send').length, 1);
  }
});

test('targeted state reports actual role, focus, worker count and pending population without writing', () => {
  for (const mode of ['focus', 'upgrade', 'specialist']) {
    const {data, calls} = run({mode, currentFocus: true, workers: 1, pending: 0}, 'settlement_management_state.js');
    assert.equal(data.cityId, 10);
    assert.equal(data.pendingPopulation, 0);
    if (mode === 'focus') assert.equal(data.focus, 'PROJECT_TOWN_PRODUCTION');
    if (mode === 'specialist') assert.equal(data.workerCount, 1);
    assert.equal(calls.length, 0);
  }
});
