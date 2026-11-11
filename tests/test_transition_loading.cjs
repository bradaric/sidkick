const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(options = {}) {
  const file = path.join(__dirname, '../civ7/transition_loading.js');
  assert.ok(fs.existsSync(file), 'fixed transition loading observer/Begin script exists');
  let calls = 0, welcomeCalls = 0;
  const button = {isConnected: true, textContent: 'LOC_GENERIC_CONTINUE', getClientRects: () => [{}],
    getAttribute: key => key === 'data-activatable' ? 'true' : null,
    hasAttribute: () => options.disabled ?? false, classList: {contains: () => false},
    getBoundingClientRect: () => ({x: 0, y: 0, width: 10, height: 10}), contains: node => node === button,
    dispatchEvent: () => {welcomeCalls++;}};
  const welcomeButton = {...button, textContent:'LOC_TUTORIAL_CALLOUT_BEGIN', contains: node => node === welcomeButton};
  const welcome = {isConnected:true, getClientRects:()=>[{}],
    getAttribute: key => key === 'itemid' ? 'welcome_intro' : JSON.stringify({
      title:options.wrongWelcome ? 'Other tutorial' : 'LOC_TUTORIAL_MODERN_WELCOME_TITLE', body:{text:'Modern intro'},
      option1:{text:'LOC_TUTORIAL_CALLOUT_BEGIN',actionKey:'inline-accept',closes:true}}),
    querySelectorAll:()=>[welcomeButton]};
  const context = vm.createContext({
    UI: {getGameLoadingState: () => options.started ? 8 : options.loading ? 2 : 7,
      isInGame: () => true, Player:{getFirstReadyUnit:()=>options.readyUnit ? {owner:0,id:77,type:26} : null},
      notifyUIReady: () => {calls++; if (options.throwAfterBegin) throw Error('ambiguous Begin');}},
    UIGameLoadingState: {WaitingForUIReady: 7, GameStarted: 8},
    Configuration: {getGame: () => ({isAnyMultiplayer: options.multiplayer ?? false, previousAgeCount: options.count ?? 2}),
      getUser: () => ({isAutoEndTurn: options.autoEnd ?? false})},
    Autoplay: {isActive: false}, GameContext: {localPlayerID: 0,hasSentTurnComplete:()=>options.sent ?? false},
    EndTurnBlockingTypes:{NONE:0},
    Game: {turn: 1, age: 99, AgeProgressManager: {isAgeOver: options.ageOver ?? false},
      UnitOperations:{canStartAny:()=>options.canStartAny ?? false}, Notifications: {
      getEndTurnBlockingType:()=>options.blocker ?? 0,
      getIdsForPlayer: () => options.retainedChoice ? [{owner: 0, id: 1082, type: 20}] : [],
      getType: () => 20, getTypeName: () => 'NOTIFICATION_CHOOSE_CIVILIZATION',
      find: () => ({Dismissed: false, Expired: false}),
      getBlocksTurnAdvancement: () => options.choiceBlocks,
    }},
    GameInfo: {Ages: {lookup: () => ({AgeType: 'AGE_MODERN'})},
      Civilizations: {lookup: () => ({CivilizationType: 'CIVILIZATION_PRUSSIA'})}},
    Players: {get: () => ({civilizationType: 3,isTurnActive:true, AdvancedStart: {getPlacementComplete: () => options.completed ?? false}})},
    Locale: {compose: value => value},
    document: {querySelectorAll: selector => selector === '#loading-curtain' ? options.curtain ? [{}] : []
      : selector === 'tutorial-callout[itemid="welcome_intro"]'
      ? options.welcome ? [welcome] : []
      : !options.noButton && selector === '#age-transition-load-screen [data-name="HeroButton2"][role="button"]' ? [button] : [],
      elementFromPoint: () => options.covered ? {} : options.welcome ? welcomeButton : button},
    CustomEvent: class {constructor(type,args){this.type=type;this.detail=args.detail;}}, InputActionStatuses:{FINISH:1},
    queryArguments: {operation: 'observe'},
  });
  const source = fs.readFileSync(file, 'utf8');
  const before = vm.runInContext(source, context);
  context.queryArguments = {operation: 'begin', loading_token: options.token ?? before.loadingToken};
  const result = vm.runInContext(source, context);
  return JSON.parse(JSON.stringify({before, result, calls, welcomeCalls}));
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

test('GameStarted while the startup curtain still covers the UI is loading, not actionable', () => {
  const r=run({started:true,curtain:true});
  assert.equal(r.before.phase,'loading');
  assert.equal(r.result.status,'rejected');
  assert.equal(r.calls,0);
});

test('the loading-safe observer exposes native reactivated turn blockers without submitting orders', () => {
  const r=run({started:true,readyUnit:true,canStartAny:true,blocker:3});
  assert.equal(r.before.active,true);
  assert.equal(r.before.sent,false);
  assert.equal(r.before.hasBlocker,true);
  assert.equal(r.before.unitOrdersPending,true);
  assert.equal(r.calls+r.welcomeCalls,0);
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

test('the in-game welcome Begin is a separate token-bound acknowledgement, not notifyUIReady again', () => {
  const {before,result,calls,welcomeCalls}=run({started:true,welcome:true});
  assert.equal(before.phase,'awaiting_welcome');
  assert.equal(before.beginStage,'welcome');
  assert.ok(before.loadingToken);
  assert.equal(result.status,'submitted');
  assert.equal(calls,0);
  assert.equal(welcomeCalls,1);
  assert.equal(before.transitionCompleted,false);
});

test('welcome acknowledgement rejects unrelated/covered/disabled popups and initial games', () => {
  for (const change of [{wrongWelcome:true},{covered:true},{disabled:true},{count:0},{token:'stale'}]) {
    const r=run({started:true,welcome:true,...change});
    assert.equal(r.result.status,'rejected');
    assert.equal(r.calls+r.welcomeCalls,0);
  }
});
