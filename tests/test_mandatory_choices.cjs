const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'mandatory_choice.js') {
  const mode = o.mode ?? 'government', calls = [];
  const notifications = o.notPending ? [] : [{owner: o.foreign ? 1 : 0, id: 9, type: 20}];
  const notificationType = mode === 'resource_review' ? 'NOTIFICATION_ASSIGN_NEW_RESOURCES' :
    mode === 'policy_review' ? 'NOTIFICATION_TRADITIONS_AVAILABLE' :
    mode === 'celebration' ? 'NOTIFICATION_CHOOSE_GOLDEN_AGE' : 'NOTIFICATION_CHOOSE_GOVERNMENT';
  const government = {GovernmentType: 'GOVERNMENT_TEST', $index: 7, $hash: 700};
  const celebration = {GoldenAgeType: 'GOLDEN_AGE_TEST', $hash: 800};
  const culture = {getGovernmentType: () => o.current ? 700 : 701, getGoldenAgeChoices: () => o.notOffered ? [] : [800]};
  const happiness = {canChoose: () => o.canChoose ?? !o.notPending, isInGoldenAge: () => o.current ?? false,
    getCurrentGoldenAge: () => 800};
  const context = {
    queryArguments: {mode, selection: mode === 'celebration' ? 'GOLDEN_AGE_TEST' : 'GOVERNMENT_TEST', expected_turn: 60, ...o.args},
    UI: {isInGame: () => !o.notInGame}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sent ?? false},
    Players: {get: () => ({isTurnActive: !o.inactive, Culture: culture, Happiness: happiness})},
    GameInfo: {Ages: {lookup: () => ({AgeType: 'AGE_MODERN'})},
      StartingGovernments: {filter: predicate => (o.notOffered ? [] : [
        {AgeType: o.wrongAge ? 'AGE_ANTIQUITY' : 'AGE_MODERN', GovernmentType: 'GOVERNMENT_TEST'}]).filter(predicate)},
      Governments: {lookup: v => ['GOVERNMENT_TEST', 700].includes(v) ? government : null},
      GoldenAges: {lookup: v => ['GOLDEN_AGE_TEST', 800].includes(v) ? celebration : null}},
    Database: {makeHash: value => {assert.equal(value, 'GOLDEN_AGE_TEST'); return 800;}},
    PlayerOperationTypes: {CHANGE_GOVERNMENT: 100, CHOOSE_GOLDEN_AGE: 200, CONSIDER_ASSIGN_RESOURCE: 300, CONSIDER_ASSIGN_TRADITIONS: 400},
    PlayerOperationParameters: {Activate: 1},
    Game: {turn: 60, age: 42, Notifications: {
      getIdsForPlayer: () => notifications, getType: () => 55, getTypeName: () => notificationType,
      find: () => ({Dismissed: o.dismissed ?? false, Expired: o.expired ?? false})},
      PlayerOperations: {canStart: (id, type, args, exclusion) => {
        calls.push({kind: 'check', id, type, args, exclusion});
        if (o.changed) context.Game.turn++;
        return {Success: !o.blocked, FailureReasons: ['Native blocker']};
      }, sendRequest: (id, type, args) => {
        calls.push({kind: 'send', id, type, args});
        if (o.sendThrows) throw Error('Lost acknowledgement');
      }}},
  };
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('pending government uses its definition INDEX and activation, not its hash', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.at(-1), {kind: 'send', id: 0, type: 100, args: {GovernmentType: 7, Action: 1}});
  assert.deepEqual(data.expected, {government: 'GOVERNMENT_TEST', governmentPending: false});
  for (const o of [{notOffered: true}, {wrongAge: true}, {notPending: true}, {dismissed: true}, {expired: true}, {foreign: true}]) {
    assert.equal(run(o).data.status, 'rejected', JSON.stringify(o));
  }
  assert.equal(run({notPending: true, current: true}).data.status, 'already_active');
});

test('celebration needs canChoose plus exact offered ID and submits the UI hash', () => {
  const {data, calls} = run({mode: 'celebration'});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.at(-1), {kind: 'send', id: 0, type: 200, args: {GoldenAgeType: 800}});
  assert.equal(data.expected.celebration, 'GOLDEN_AGE_TEST');
  assert.equal(data.expected.celebrationPending, false);
  for (const o of [{notOffered: true}, {notPending: true}]) {
    assert.equal(run({mode: 'celebration', ...o}).data.status, 'rejected');
  }
  assert.equal(run({mode: 'celebration', notPending: true, current: true}).data.status, 'already_active');
});

test('a real local celebration notification remains pending even when active and canChoose is false', () => {
  const o = {mode: 'celebration', canChoose: false, current: true};
  assert.equal(run(o).data.status, 'submitted');
  assert.equal(run(o, 'mandatory_choice_state.js').data.celebrationPending, true);
  for (const invalid of [{dismissed: true}, {expired: true}, {foreign: true}]) {
    assert.equal(run({...o, ...invalid}).data.status, 'already_active');
    assert.equal(run({...o, ...invalid}, 'mandatory_choice_state.js').data.celebrationPending, false);
  }
});

test('resource review only acknowledges a pending resource review with the exact native command', () => {
  const {data, calls} = run({mode: 'resource_review'});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.at(-1), {kind: 'send', id: 0, type: 300, args: {}});
  assert.deepEqual(data.expected, {resourceReviewPending: false});
  assert.equal(run({mode: 'resource_review', notPending: true}).data.status, 'already_active');
});

test('policy review mirrors closing the policy screen without implicitly changing cards', () => {
  const {data, calls} = run({mode: 'policy_review'});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.at(-1), {kind: 'send', id: 0, type: 400, args: {}});
  assert.deepEqual(data.expected, {policyReviewPending: false});
  assert.equal(run({mode: 'policy_review', notPending: true}).data.status, 'already_active');
});

test('all picker modes fail closed on stale/inactive/native-blocked/unsupported contexts', () => {
  for (const mode of ['government', 'celebration', 'resource_review', 'policy_review']) {
    for (const o of [{notInGame: true}, {inactive: true}, {sent: true}, {blocked: true}, {changed: true},
      {args: {expected_turn: 59}}, {args: {expected_turn: true}}, {args: {mode: 'dismiss_any'}}]) {
      const {data, calls} = run({mode, ...o});
      assert.equal(data.status, 'rejected', JSON.stringify({mode, o}));
      assert.equal(calls.filter(c => c.kind === 'send').length, 0);
    }
    assert.equal(run({mode, sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
  }
});

test('picker readback is read-only and includes actual selection and pending flags', () => {
  const {data, calls} = run({current: true, notPending: true}, 'mandatory_choice_state.js');
  assert.equal(data.government, 'GOVERNMENT_TEST');
  assert.equal(data.governmentPending, false);
  assert.equal(data.celebration, 'GOLDEN_AGE_TEST');
  assert.equal(data.celebrationPending, false);
  assert.equal(data.resourceReviewPending, false);
  assert.equal(calls.length, 0);
});
