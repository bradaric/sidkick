const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(options = {}) {
  const file = path.join(__dirname, '../civ7/transition_loading.js');
  assert.ok(fs.existsSync(file), 'fixed transition loading observer/Begin script exists');
  let calls = 0;
  const button = {isConnected: true, textContent: 'LOC_GENERIC_CONTINUE', getClientRects: () => [{}],
    getAttribute: key => key === 'data-activatable' ? 'true' : null,
    hasAttribute: () => options.disabled ?? false, classList: {contains: () => false},
    getBoundingClientRect: () => ({x: 0, y: 0, width: 10, height: 10}), contains: node => node === button};
  const context = vm.createContext({
    UI: {getGameLoadingState: () => options.started ? 8 : options.loading ? 2 : 7,
      isInGame: () => true, notifyUIReady: () => {calls++; if (options.throwAfterBegin) throw Error('ambiguous Begin');}},
    UIGameLoadingState: {WaitingForUIReady: 7, GameStarted: 8},
    Configuration: {getGame: () => ({isAnyMultiplayer: options.multiplayer ?? false, previousAgeCount: options.count ?? 2}),
      getUser: () => ({isAutoEndTurn: options.autoEnd ?? false})},
    Autoplay: {isActive: false}, GameContext: {localPlayerID: 0},
    Game: {turn: 1, age: 99, AgeProgressManager: {isAgeOver: options.ageOver ?? false}, Notifications: {
      getIdsForPlayer: () => options.retainedChoice ? [{owner: 0, id: 1082, type: 20}] : [],
      getType: () => 20, getTypeName: () => 'NOTIFICATION_CHOOSE_CIVILIZATION',
      find: () => ({Dismissed: false, Expired: false}),
      getBlocksTurnAdvancement: () => options.choiceBlocks,
    }},
    GameInfo: {Ages: {lookup: () => ({AgeType: 'AGE_MODERN'})},
      Civilizations: {lookup: () => ({CivilizationType: 'CIVILIZATION_PRUSSIA'})}},
    Players: {get: () => ({civilizationType: 3, AdvancedStart: {getPlacementComplete: () => options.completed ?? false}})},
    Locale: {compose: value => value},
    document: {querySelectorAll: selector => !options.noButton && selector === '#age-transition-load-screen [data-name="HeroButton2"][role="button"]' ? [button] : [],
      elementFromPoint: () => options.covered ? {} : button},
    queryArguments: {operation: 'observe'},
  });
  const source = fs.readFileSync(file, 'utf8');
  const before = vm.runInContext(source, context);
  context.queryArguments = {operation: 'begin', loading_token: options.token ?? before.loadingToken};
  const result = vm.runInContext(source, context);
  return JSON.parse(JSON.stringify({before, result, calls}));
}

test('Begin is restricted to a ready new-Age load with an exact visible enabled native Begin control', () => {
  const {before, result, calls} = run();
  assert.equal(before.phase, 'awaiting_begin');
  assert.ok(before.loadingToken);
  assert.equal(result.status, 'submitted');
  assert.equal(calls, 1);
});

test('loading, ordinary initial games, stale tokens, covered controls and automatic turns cannot be bypassed', () => {
  for (const options of [{loading: true}, {count: 0}, {started: true}, {token: 'stale'},
    {disabled: true}, {covered: true}, {noButton: true}, {multiplayer: true}, {autoEnd: true}]) {
    const {result, calls} = run(options);
    assert.equal(result.status, 'rejected', JSON.stringify(options));
    assert.equal(calls, 0);
  }
});

test('new Age loading readiness is not transition completion; only a completed started deck can be complete', () => {
  assert.equal(run().before.transitionCompleted, false);
  assert.equal(run({started: true}).before.transitionCompleted, false);
  assert.equal(run({started: true, completed: true}).before.transitionCompleted, true);
  assert.equal(run({started: true, completed: true, ageOver: true}).before.transitionCompleted, false);
});

test('a native exception after Begin invocation is ambiguous, never a preflight rejection', () => {
  assert.throws(() => run({throwAfterBegin: true}), /ambiguous Begin/);
});

test('retained non-blocking choice is acknowledged without claiming Age arrival or sending another request', () => {
  const {before, calls} = run({started: true, retainedChoice: true, choiceBlocks: false});
  assert.equal(before.choicePending, false);
  assert.equal(before.choicesAcknowledged, true);
  assert.equal(before.transitionCompleted, false);
  assert.equal(calls, 0);
  assert.equal(run({started: true, retainedChoice: true, choiceBlocks: true}).before.choicePending, true);
  assert.equal(run({started: true, retainedChoice: true}).before.phase, 'unavailable', 'unknown blocking state fails closed');
  assert.equal(run({started: true, retainedChoice: true, choiceBlocks: false, completed: true}).before.transitionCompleted,
    false, 'the old completed deck does not complete an acknowledged upcoming transition');
});
