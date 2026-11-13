const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const selector = '#load-screen .load-screen-begin-game-button [data-name="HeroButton2"][role="button"]';
function fixture(options = {}) {
  let calls = 0;
  const button = {isConnected: !options.detached, textContent: options.wrongLabel ? 'Other' : 'LOC_LOADING_BEGIN_GAME',
    getClientRects: () => options.hidden ? [] : [{}],
    getAttribute: key => key === 'data-activatable' ? 'true' : null,
    hasAttribute: () => !!options.disabled, classList: {contains: () => false},
    getBoundingClientRect: () => ({x: 0, y: 0, width: 10, height: 10}), contains: node => node === button};
  const root = {};
  const context = vm.createContext({
    queryArguments: {operation: 'observe'},
    UI: {getGameLoadingState: () => options.state ?? 7, isInGame: () => options.inGame ?? true,
      notifyUIReady: () => {calls++; if (options.throwAfterBegin) throw Error('ambiguous Begin');}},
    UIGameLoadingState: {NotStarted: 0, WaitingForUIReady: 7, GameStarted: 8},
    Configuration: {getGame: () => ({isAnyMultiplayer: Object.hasOwn(options, 'multiplayer') ? options.multiplayer : false, previousAgeCount: options.count ?? 0}),
      getUser: () => ({isAutoEndTurn: options.autoEnd ?? false})},
    Autoplay: {isActive: options.autoplay ?? false},
    Modding: {getTransitionInProgress: () => Object.hasOwn(options, 'transition') ? options.transition : false},
    GameContext: {localPlayerID: 0}, Game: {get turn() {return options.turn ?? 40;}, age: 1},
    Players: {get: () => ({civilizationType: 3})},
    GameInfo: {Ages: {lookup: () => ({AgeType: 'AGE_ANTIQUITY'})},
      Civilizations: {lookup: () => ({CivilizationType: 'CIVILIZATION_MAYA'})}},
    Locale: {compose: value => value},
    document: {querySelectorAll: query => query === selector ? options.noButton ? [] : options.duplicate ? [button, button] : [button]
      : query === '#load-screen' ? [options.root ?? root]
      : query === '#age-transition-load-screen' ? options.ageScreen ? [{}] : []
      : query === '#loading-curtain' ? options.curtain ? [{}] : [] : [],
      elementFromPoint: () => options.covered ? {} : button},
  });
  function run(arguments = {operation: 'observe'}) {
    const file = path.join(__dirname, '../civ7/game_loading.js');
    assert.ok(fs.existsSync(file), 'ordinary loading observer/Begin script exists');
    context.queryArguments = arguments;
    return JSON.parse(JSON.stringify(vm.runInContext(fs.readFileSync(file, 'utf8'), context)));
  }
  return {run, options, get calls() {return calls;}};
}

test('ordinary load issues a fresh token and submits native Begin once without requiring a previous Age', () => {
  for (const count of [0, 2]) {
    const f = fixture({count}), before = f.run();
    assert.equal(before.phase, 'awaiting_begin');
    assert.ok(before.loadingToken);
    assert.equal(before.nextAction, 'begin_civ7_loaded_game');
    assert.equal(f.calls, 0);
    assert.equal(f.run({operation: 'begin', loading_token: before.loadingToken}).status, 'submitted');
    assert.equal(f.calls, 1);
  }
});

test('captured native transition flag zero means ordinary load, not an Age transition', () => {
  const f = fixture({transition: 0});
  assert.equal(f.run().phase, 'awaiting_begin');
  assert.ok(f.run().loadingToken);
});

test('loading, started, transitions, multiplayer, automatic turns and unsafe controls cannot be bypassed', () => {
  for (const options of [{state: 2}, {state: 8}, {transition: true}, {transition: 1}, {transition: null}, {ageScreen: true},
    {multiplayer: true}, {multiplayer: null}, {autoEnd: true}, {autoplay: true},
    {disabled: true}, {hidden: true}, {detached: true}, {covered: true}, {wrongLabel: true},
    {noButton: true}, {duplicate: true}]) {
    const f = fixture(options), before = f.run();
    assert.equal(before.loadingToken, null, JSON.stringify(options));
    assert.equal(f.run({operation: 'begin', loading_token: before.loadingToken ?? 'invented'}).status, 'rejected');
    assert.equal(f.calls, 0);
  }
});

test('stale tokens and controls/context changed after observation reject before submission', () => {
  for (const change of [{turn: 41}, {disabled: true}, {covered: true}, {state: 8}, {transition: true}]) {
    const f = fixture(), before = f.run();
    Object.assign(f.options, change);
    assert.equal(f.run({operation: 'begin', loading_token: before.loadingToken}).status, 'rejected');
    assert.equal(f.calls, 0);
  }
  const f = fixture();
  assert.equal(f.run({operation: 'begin', loading_token: 'stale'}).status, 'rejected');
});

test('a consumed token cannot submit a second Begin while native loading state still lags', () => {
  const f = fixture(), before = f.run();
  assert.equal(f.run({operation: 'begin', loading_token: before.loadingToken}).status, 'submitted');
  assert.equal(f.run({operation: 'begin', loading_token: before.loadingToken}).status, 'rejected');
  assert.equal(f.run().loadingToken, null);
  assert.equal(f.calls, 1);
});

test('a new screen for the same save gets a different token and rejects the old one', () => {
  const f = fixture(), before = f.run();
  f.options.root = {};
  const after = f.run();
  assert.notEqual(after.loadingToken, before.loadingToken);
  assert.equal(f.run({operation: 'begin', loading_token: before.loadingToken}).status, 'rejected');
  assert.equal(f.calls, 0);
  assert.equal(f.run({operation: 'begin', loading_token: after.loadingToken}).status, 'submitted');
  assert.equal(f.calls, 1);
});

test('GameStarted behind the startup curtain is still loading, never completed', () => {
  const f = fixture({state: 8, curtain: true});
  assert.equal(f.run().phase, 'loading');
  assert.equal(f.run().loadCompleted, false);
  f.options.curtain = false;
  assert.equal(f.run().phase, 'started');
  assert.equal(f.run().loadCompleted, true);
});

test('exceptions after native Begin are ambiguous and consume the token without retrying', () => {
  const f = fixture({throwAfterBegin: true}), before = f.run();
  assert.throws(() => f.run({operation: 'begin', loading_token: before.loadingToken}), /ambiguous Begin/);
  assert.equal(f.run({operation: 'begin', loading_token: before.loadingToken}).status, 'rejected');
  assert.equal(f.calls, 1);
});
