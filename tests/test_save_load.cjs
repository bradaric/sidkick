const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function game(o = {}) {
  const calls = [], events = new Map(), timers = new Map();
  let now = 1000, nextQuery = 1;
  const file = {ID: 1, fileName: 'Checkpoint.Civ7Save', displayName: 'Checkpoint',
    location: 1, locationCategories: 0, type: 1, contentType: 0, slot: -1, additionalInfo: '',
    isDirectory: false, isPrevious: false, isPlayerSave: true, isAutosave: false, isQuicksave: false,
    isLiveEventGame: false, saveTime: 100n, gameGUID: 'campaign', currentTurn: 40,
    hostAge: 'AGE_EXPLORATION', hostLeaderName: 'Catherine', hostCivilizationName: 'Chola',
    savedByVersion: '1', requiredMods: [{ID: 'base'}], ...o.file};
  const context = {
    queryArguments: {}, Date: {now: () => now},
    setTimeout: fn => {const id = timers.size + 1; timers.set(id, fn); return id;},
    clearTimeout: id => timers.delete(id),
    UI: {isInGame: () => !o.menu, getGameLoadingState: () => o.loading ? 7 : o.menu ? 0 : 8},
    UIGameLoadingState: {NotStarted: 0, GameStarted: 8},
    document: {querySelector: tag => o.menu && tag === 'main-menu' && !o.notMainMenu ? {isConnected: true} : null},
    Configuration: {getGame: () => ({isAnyMultiplayer: Boolean(o.multiplayer), isGameStarted: !o.menu})},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)},
    Players: {get: () => ({isTurnActive: !o.inactive})}, Game: {turn: 40, age: -123},
    GameInfo: {Ages: {lookup: () => ({AgeType: 'AGE_EXPLORATION'})}},
    SaveLocations: {LOCAL_STORAGE: 1}, SaveTypes: {SINGLE_PLAYER: 1},
    SaveFileTypes: {GAME_STATE: 0}, SaveLocationCategories: {NORMAL: 1, QUICKSAVE: 2, AUTOSAVE: 4, PREVIOUS: 8, DIRECTORY: 16},
    ServerType: {SERVER_TYPE_NONE: 0}, SerializerResult: {RESULT_OK: 0, RESULT_PENDING: 1},
    ModAllowance: {Full: 2}, Modding: {
      getModHandle: id => o.missingMod ? null : id,
      getInstalledMods: () => [{handle: 'base', allowance: o.unownedMod ? 0 : 2}],
    },
    engine: {on: (event, fn) => {
      const set = events.get(event) ?? new Set(); events.set(event, set); set.add(fn);
      return {clear: () => set.delete(fn)};
    }},
    GameStateStorage: {
      querySaveGameList: args => {calls.push(['query', JSON.parse(JSON.stringify(args))]); return nextQuery++;},
      closeFileListQuery: id => calls.push(['closeQuery', id]),
    },
    Network: {
      saveGame: args => {calls.push(['save', JSON.parse(JSON.stringify(args))]); if (o.saveThrows) throw Error('Lost response'); return o.saveReturn ?? true;},
      loadGame: (args, server) => {calls.push(['load', JSON.parse(JSON.stringify(args)), server]); if (o.loadThrows) throw Error('Lost response'); return o.loadReturn ?? true;},
      syncGame: () => {throw Error('No cloud sync');}, deleteGame: () => {throw Error('No deletion');},
    },
  };
  if (o.menu) Object.defineProperty(context, 'Game', {get: () => {throw Error('Do not read gameplay globals from menu');}});
  const sandbox = vm.createContext(context);
  const source = fs.readFileSync('civ7/save_load.js', 'utf8');
  const emit = (event, ...args) => {for (const fn of [...(events.get(event) ?? [])]) fn(...args);};
  const run = args => {sandbox.queryArguments = args; return JSON.parse(JSON.stringify(vm.runInContext(source, sandbox)));};
  function list(files = [file], request = 'inventory') {
    const started = run({operation: 'list_start', request_id: request});
    assert.equal(started.status, 'pending');
    emit('FileListQueryResults', nextQuery - 1, files);
    return run({operation: 'list_poll', request_id: request});
  }
  return {context, calls, file, run, list, emit, events, timers, advance: ms => {now += ms;},
    load: token => run({operation: 'load', inventory_id: 'inventory', save_token: token,
      confirm_discard_unsaved_progress: true, expected_turn: o.menu ? null : 40}),
    save: name => run({operation: 'save', inventory_id: 'inventory', request_id: 'saving', save_name: name, expected_turn: 40})};
}

test('local save inventory includes stable exact tokens, filters unsupported files and closes only its own query', () => {
  const g = game(), records = [g.file, {...g.file, location: 2}, {...g.file, type: 2}, {...g.file, contentType: 2},
    {...g.file, isDirectory: true}, {...g.file, isLiveEventGame: true}, {...g.file, fileName: '../escape.Civ7Save'}];
  const list = g.list(records);
  assert.equal(list.status, 'ready'); assert.equal(list.saves.length, 1);
  assert.equal(list.saves[0].canLoad, true); assert.equal(typeof list.saves[0].saveToken, 'string');
  assert.equal(list.saves[0].saveTime, '100'); assert.equal('path' in list.saves[0], false);
  assert.deepEqual(g.calls, [['query', {Location: 1, Type: 1, LocationOptions: 7, ContentType: 0, ForceRefresh: true}], ['closeQuery', 1]]);
  const refreshed = g.list([{...g.file, ID: 99}], 'refresh');
  assert.equal(refreshed.saves[0].saveToken, list.saves[0].saveToken, 'query-local IDs are not persistent save identity');
});

test('new saves use native local single-player no-overwrite parameters and observe normal serializer completion', () => {
  const g = game(); g.list([]);
  const saved = g.save('New checkpoint'); assert.equal(saved.status, 'submitted');
  assert.deepEqual(g.calls.find(c => c[0] === 'save'), ['save', {Location: 1, LocationCategories: 1,
    Type: 1, ContentType: 0, FileName: 'New checkpoint', Overwrite: false}]);
  const state = () => g.run({operation: 'save_state', request_id: 'saving'});
  g.emit('SaveComplete', {options: 2, result: 0}); assert.equal(state().serializerComplete, false);
  g.emit('SaveComplete', {options: 1, result: 1}); assert.equal(state().serializerComplete, false);
  g.emit('SaveComplete', {options: 1, result: 0}); assert.equal(state().serializerOk, true);
  assert.equal(g.events.get('SaveComplete').size, 0);
  assert.equal(g.calls.filter(c => c[0] === 'save').length, 1);
});

test('captured live normal-save event with options=65 records success instead of timing out', () => {
  const g = game(); g.list([]); g.save('Fresh');
  g.emit('SaveComplete', {result: 0, type: 1, options: 65, fileType: 0});
  const state = g.run({operation: 'save_state', request_id: 'saving'});
  assert.equal(state.serializerComplete, true);
  assert.equal(state.serializerOk, true);
  assert.equal(state.nativeResult, 0);
  assert.equal(g.events.get('SaveComplete').size, 0);
  assert.equal(g.calls.filter(c => c[0] === 'save').length, 1);
});

test('non-category flags never let auto, quick, previous, directory or uncategorized events verify a manual save', () => {
  for (const options of [0, 64, null, true, 65.5,
    ...[2, 4, 8, 16].flatMap(category => [category, category | 1, category | 64, category | 65])]) {
    const g = game(); g.list([]); g.save('Fresh');
    g.emit('SaveComplete', {options, result: 0});
    assert.equal(g.run({operation: 'save_state', request_id: 'saving'}).serializerComplete, false, String(options));
    assert.equal(g.calls.filter(c => c[0] === 'save').length, 1);
  }
});

test('flagged manual completions retain pending, filename and failure checks', () => {
  const g = game(); g.list([]); g.save('Fresh');
  const state = () => g.run({operation: 'save_state', request_id: 'saving'});
  g.emit('SaveComplete', {options: 65, result: 1});
  assert.equal(state().serializerComplete, false);
  g.emit('SaveComplete', {options: 65, result: 0, fileName: 'Other.Civ7Save'});
  assert.equal(state().serializerComplete, false);
  g.emit('SaveComplete', {options: 65, result: 4, fileName: 'Fresh.Civ7Save'});
  assert.equal(state().serializerComplete, true);
  assert.equal(state().serializerOk, false);
  assert.equal(g.calls.filter(c => c[0] === 'save').length, 1);
});

test('missing category-mask constants reject saving without affecting read-only inventory', () => {
  for (const missing of ['PREVIOUS', 'DIRECTORY']) {
    const g = game(); delete g.context.SaveLocationCategories[missing];
    assert.equal(g.list([]).status, 'ready');
    assert.equal(g.save('Fresh').status, 'rejected');
    assert.equal(g.calls.some(c => c[0] === 'save'), false);
  }
});

test('save collisions, paths, reserved names, stale contexts and non-single-player states never write', () => {
  for (const name of ['Checkpoint', 'checkpoint', '../escape', 'a/b', 'x.Civ7Save', 'CON', ' name', '', 'a'.repeat(81)]) {
    const g = game(); g.list(); assert.equal(g.save(name).status, 'rejected', name);
    assert.equal(g.calls.some(c => c[0] === 'save'), false);
  }
  const stale = game(); stale.list([]); stale.context.Game.turn++;
  assert.equal(stale.save('Fresh').status, 'rejected');
  for (const o of [{menu: true}, {loading: true}, {multiplayer: true}, {inactive: true}, {sent: true}]) {
    const g = game(o);
    assert.equal(g.save('Fresh').status, 'rejected'); assert.equal(g.calls.some(c => c[0] === 'save'), false);
  }
});

test('exact listed single-player saves load once from game or menu, with explicit discard confirmation and no completion claim', () => {
  for (const menu of [false, true]) {
    const g = game({menu}), listed = g.list();
    const result = g.load(listed.saves[0].saveToken);
    assert.equal(result.status, 'submitted'); assert.equal(result.loadCompleted, false);
    assert.equal(result.requiresFreshState, true);
    assert.deepEqual(g.calls.find(c => c[0] === 'load'), ['load', {Location: 1, LocationCategories: 0, Type: 1,
      ContentType: 0, FileName: 'Checkpoint.Civ7Save', DisplayName: 'Checkpoint', Slot: -1, AdditionalInfo: ''}, 0]);
    assert.equal(g.load(listed.saves[0].saveToken).status, 'rejected', 'consume the internal inventory on submission');
    assert.equal(g.calls.filter(c => c[0] === 'load').length, 1);
  }
});

test('load requires exact fresh identity, available content and acknowledgement; menu cannot read or bypass loading gameplay', () => {
  for (const o of [{missingMod: true}, {unownedMod: true}]) {
    const g = game(o), list = g.list(); assert.equal(list.saves[0].canLoad, false);
    assert.equal(g.load(list.saves[0].saveToken).status, 'rejected'); assert.equal(g.calls.some(c => c[0] === 'load'), false);
  }
  for (const change of [args => {args.confirm_discard_unsaved_progress = false;}, args => {args.expected_turn = 39;},
    args => {args.save_token = 'forged';}]) {
    const g = game(), list = g.list(), args = {operation: 'load', inventory_id: 'inventory',
      save_token: list.saves[0].saveToken, expected_turn: 40, confirm_discard_unsaved_progress: true};
    change(args); assert.equal(g.run(args).status, 'rejected'); assert.equal(g.calls.some(c => c[0] === 'load'), false);
  }
  const stale = game(), old = stale.list().saves[0].saveToken;
  stale.list([{...stale.file, saveTime: 101n}], 'fresh');
  assert.equal(stale.run({operation: 'load', inventory_id: 'fresh', save_token: old,
    expected_turn: 40, confirm_discard_unsaved_progress: true}).status, 'rejected');
  const expired = game(), token = expired.list().saves[0].saveToken; expired.advance(6000);
  assert.equal(expired.load(token).status, 'rejected');
  const duplicate = game(), dup = duplicate.list([duplicate.file, duplicate.file]);
  assert.equal(duplicate.load(dup.saves[0].saveToken).status, 'rejected');
  for (const o of [{loading: true}, {multiplayer: true}, {menu: true, notMainMenu: true}]) {
    const g = game(o); assert.equal(g.load(old).status, 'rejected'); assert.equal(g.calls.some(c => c[0] === 'load'), false);
  }
});

test('query results cannot cross identities and timed-out query cleanup never closes other UI queries', () => {
  const g = game(); g.run({operation: 'list_start', request_id: 'first'});
  g.emit('FileListQueryResults', 999, [g.file]);
  assert.equal(g.run({operation: 'list_poll', request_id: 'first'}).status, 'pending');
  g.run({operation: 'list_close', request_id: 'first'});
  assert.deepEqual(g.calls.filter(c => c[0] === 'closeQuery'), [['closeQuery', 1]]);
  assert.equal(g.events.get('FileListQueryResults').size, 0);
});

test('auto and quick saves load with their native categories; load failures and lost responses never resubmit', () => {
  for (const category of [2, 4]) {
    const g = game({file: {locationCategories: category, isAutosave: category === 4, isQuicksave: category === 2}});
    const listed = g.list(); assert.equal(g.load(listed.saves[0].saveToken).status, 'submitted');
    assert.equal(g.calls.find(c => c[0] === 'load')[1].LocationCategories, category);
  }
  const rejected = game({loadReturn: false}), files = rejected.list();
  assert.equal(rejected.load(files.saves[0].saveToken).status, 'rejected');
  assert.equal(rejected.calls.filter(c => c[0] === 'load').length, 1);
  const lost = game({loadThrows: true}), token = lost.list().saves[0].saveToken;
  assert.throws(() => lost.load(token), /Lost response/);
  assert.equal(lost.load(token).status, 'rejected');
  assert.equal(lost.calls.filter(c => c[0] === 'load').length, 1);
});

test('save observations ignore another filename and retain failures as unverified without a second write', () => {
  const g = game(); g.list([]); g.save('Fresh');
  g.emit('SaveComplete', {options: 1, result: 0, fileName: 'Other.Civ7Save'});
  assert.equal(g.run({operation: 'save_state', request_id: 'saving'}).serializerComplete, false);
  g.emit('SaveComplete', {options: 1, result: 4});
  const failed = g.run({operation: 'save_state', request_id: 'saving'});
  assert.equal(failed.serializerComplete, true); assert.equal(failed.serializerOk, false);
  assert.equal(g.calls.filter(c => c[0] === 'save').length, 1);
});

test('missing native constants or loading-state evidence cannot fall back to native default locations/types', () => {
  for (const change of [g => {delete g.context.SaveLocations.LOCAL_STORAGE;},
    g => {delete g.context.SaveTypes.SINGLE_PLAYER;}, g => {delete g.context.ServerType.SERVER_TYPE_NONE;},
    g => {delete g.context.ModAllowance.Full;}, g => {delete g.context.UIGameLoadingState.GameStarted;}]) {
    const g = game(), token = g.list().saves[0].saveToken; change(g);
    assert.equal(g.save('Fresh').status, 'rejected'); assert.equal(g.load(token).status, 'rejected');
    assert.equal(g.calls.some(c => ['save', 'load'].includes(c[0])), false);
  }
});
