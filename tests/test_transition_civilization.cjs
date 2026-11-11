const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const source = name => fs.readFileSync(path.join(__dirname, '../civ7', name), 'utf8');

function run(options = {}) {
  assert.ok(fs.existsSync(path.join(__dirname, '../civ7/transition_civilization.js')), 'transition selection helper exists');
  const writes = [], state = {selected: 'RANDOM', pending: true, turn: 113, age: 1, ...options.state};
  const notice = {owner: 0, id: 7, type: 9};
  const parameter = {hidden: false, readOnly: false, invalidReason: 0,
    domain: {possibleValues: [
      {value: 'CIVILIZATION_PRUSSIA', originDomain: 'ModernCivs', invalidReason: 0},
      {value: 'CIVILIZATION_OTHER', originDomain: 'ModernCivs', invalidReason: 0},
      {value: 'CIVILIZATION_OLD', originDomain: 'ExplorationCivs', invalidReason: 0},
    ]}, ...options.parameter};
  let inspections = 0;
  const context = vm.createContext({
    UI: {isInGame: () => true, getGameLoadingState: () => options.loading ? 2 : 8},
    UIGameLoadingState: {GameStarted: 8},
    Configuration: {getGame: () => ({isAnyMultiplayer: options.multiplayer ?? false,
      getValue: key => key === 'NoCivilizationUnlocks' ? options.bypass ?? false : 'UNKNOWN'})},
    Autoplay: {isActive: options.autoplay ?? false},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => options.sent ?? false},
    Players: {get: () => ({isTurnActive: options.active ?? true})}, Locale: {compose: key => key},
    dedicationDeck: {snapshot: () => ({})}, RequirementState: {Met: 1, AlwaysMet: 2},
    PlayerOperationTypes: {SET_AGE_TRANSITION_DATA: 'FINISH'},
    GameSetupParameterInvalidReason: {Valid: 0}, GameSetupDomainValueInvalidReason: {Valid: 0},
    GameSetup: {resolveString: value => value, getMementoFilteredPlayerParameters: () => [],
      findGameParameter: () => ({value: {originDomain: 'Ages'}}),
      findPlayerParameter: (id, key) => {
        assert.equal(id, 0); assert.equal(key, 'AgeTransitionPlayerCivilization');
        inspections++;
        if (inspections === 3) options.race?.(state, parameter);
        return options.missingParameter ? null : {...parameter, value: {value: state.selected}};
      },
      setPlayerParameterValue: (id, key, value) => {
        writes.push({id, key, value});
        if (!options.ignoreSetter) state.selected = value;
      }},
    Database: {query: (db, sql) => {
      assert.equal(db, 'config'); assert.match(sql, /^SELECT /);
      if (!/FROM Ages/.test(sql)) return [];
      return [{Domain: 'Ages', AgeType: 'AGE_EXPLORATION', ChronologyIndex: 20},
        {Domain: 'Ages', AgeType: 'AGE_MODERN', ChronologyIndex: 30, PlayerCivilizationDomain: 'ModernCivs'}];
    }},
    GameInfo: {Ages: {lookup: () => ({AgeType: 'AGE_EXPLORATION'})},
      UnlockRequirements: [],
      UnlockRewards: ['LEADER', 'GAMEPLAY'].map(id => ({UnlockRewardKind: 'KIND_CIVILIZATION',
        UnlockRewardType: 'CIVILIZATION_PRUSSIA', UnlockType: id}))},
    Game: {get turn() {return state.turn;}, get age() {return state.age;},
      AgeProgressManager: {isFinalAge: options.finalAge ?? false},
      Unlocks: {getProgressForPlayer: type => options.unknownUnlock ? null : {isUnlocked: type === 'LEADER' && !options.locked}},
      Notifications: {getIdsForPlayer: () => state.pending ? (options.duplicateNotice ? [notice, {...notice, id: 8}] : [notice]) : [],
        find: () => ({Type: 9, Dismissed: false, Expired: false, AddedOnTurn: 113, ...options.notice}), getType: () => 9,
        getTypeName: () => options.noticeType ?? 'NOTIFICATION_CHOOSE_CIVILIZATION',
        getBlocksTurnAdvancement: () => options.blocks ?? true},
      PlayerOperations: {canStart: () => ({Success: true}),
        sendRequest: () => assert.fail('must never finalize or send another operation')}},
  });
  vm.runInContext(`globalThis.transitionCivilization = ${source('transition_civilization.js')}`, context);
  if (options.query) {
    const data = vm.runInContext(source('age_transition.js'), context);
    return JSON.parse(JSON.stringify({data, writes}));
  }
  const before = vm.runInContext('transitionCivilization.snapshot()', context);
  if (options.readOnly) return JSON.parse(JSON.stringify({before, writes}));
  context.queryArguments = {civilization: 'CIVILIZATION_PRUSSIA', expected_turn: 113,
    selection_token: before?.selectionToken ?? 'unavailable', ...options.arguments};
  const result = vm.runInContext(source('select_transition_civilization.js'), context);
  const after = vm.runInContext(source('transition_civilization_state.js'), context);
  return JSON.parse(JSON.stringify({before, result, after, writes}));
}

test('transition selection advertises eligibility without writes and honors alternative leader unlock', () => {
  const {before, writes} = run({readOnly: true});
  assert.equal(before.selectionOpen, true);
  assert.ok(before.selectionToken);
  assert.equal(before.choices.find(c => c.id === 'CIVILIZATION_PRUSSIA').selectionPermission, true);
  assert.deepEqual(writes, []);
});

test('a retained non-blocking civilization notification is acknowledged, not a selectable choice', () => {
  const {before, writes} = run({readOnly: true, blocks: false});
  assert.ok(before, 'acknowledged notification must remain readable');
  assert.equal(before.selectionOpen, false);
  assert.equal(before.choicesAcknowledged, true);
  assert.equal(before.notificationBlocksTurn, false);
  assert.equal(before.selectionToken, null);
  assert.ok(before.choices.every(c => c.selectionPermission === false));
  assert.deepEqual(writes, []);
});

test('the planning query exposes the same guarded selection token and permission without mutations', () => {
  const {data, writes} = run({query: true});
  assert.equal(data.civilizations.selectionOpen, true);
  assert.ok(data.civilizations.selectionToken);
  assert.equal(data.civilizations.choices.find(c => c.id === 'CIVILIZATION_PRUSSIA').selectionPermission, true);
  assert.deepEqual(writes, []);
  const planning = run({query: true, state: {pending: false}}).data.civilizations;
  assert.equal(planning.selectionOpen, false);
  assert.equal(planning.selectionToken, null);
  assert.equal(planning.choices[0].eligibleByChecks, true);
  assert.equal(planning.choices[0].selectionPermission, false);
});

test('selecting Prussia sets only the transition civilization once and verifies the pending selection', () => {
  const {result, after, writes} = run();
  assert.equal(result.status, 'submitted');
  assert.deepEqual(writes, [{id: 0, key: 'AgeTransitionPlayerCivilization', value: 'CIVILIZATION_PRUSSIA'}]);
  for (const [key, expected] of Object.entries(result.expected)) assert.deepEqual(after[key], expected);
  assert.equal(after.selectionOpen, true);
  assert.equal(after.selected, 'CIVILIZATION_PRUSSIA');
});

test('already selected civilizations do not trigger another setter', () => {
  const {result, writes} = run({state: {selected: 'CIVILIZATION_PRUSSIA'}});
  assert.equal(result.status, 'already_active');
  assert.deepEqual(writes, []);
});

test('planning candidates alone, unknown readiness and invalid selectors cannot authorize selection', () => {
  for (const options of [
    {state: {pending: false}}, {duplicateNotice: true}, {noticeType: 'NOTIFICATION_AGE_TRANSITION'},
    {blocks: false}, {missingParameter: true}, {parameter: {readOnly: true}},
    {notice: {Dismissed: true}}, {notice: {Expired: true}}, {notice: {AddedOnTurn: undefined}},
    {parameter: {readOnly: undefined}}, {parameter: {hidden: true}}, {parameter: {invalidReason: 2}},
    {loading: true}, {multiplayer: true}, {active: false}, {sent: true}, {autoplay: true}, {finalAge: true},
    {locked: true}, {unknownUnlock: true},
    {arguments: {civilization: 'CIVILIZATION_OLD'}}, {arguments: {civilization: 'RANDOM'}},
    {arguments: {civilization: 'Prussia'}}, {arguments: {civilization: 'CIVILIZATION_OTHER'}},
    {arguments: {selection_token: 'stale'}}, {arguments: {expected_turn: 112}}, {arguments: {expected_turn: true}},
  ]) {
    const {result, writes} = run(options);
    assert.equal(result.status, 'rejected', JSON.stringify(options));
    assert.deepEqual(writes, []);
  }
});

test('configured unlock bypass is honored but never overrides selector validity', () => {
  assert.equal(run({bypass: true, locked: true}).result.status, 'submitted');
  const invalid = {domain: {possibleValues: [{value: 'CIVILIZATION_PRUSSIA', originDomain: 'ModernCivs', invalidReason: 3}]}};
  assert.equal(run({bypass: true, parameter: invalid}).result.status, 'rejected');
});

test('changed turn, selected value, pending choice, selector or unlock context rejects before writing', () => {
  for (const race of [state => {state.turn++;}, state => {state.age++;},
    state => {state.selected = 'CIVILIZATION_OTHER';}, state => {state.pending = false;},
    (state, parameter) => {parameter.readOnly = true;},
    (state, parameter) => {parameter.domain.possibleValues[0].invalidReason = 3;},
  ]) {
    const {result, writes} = run({race});
    assert.equal(result.status, 'rejected');
    assert.deepEqual(writes, []);
  }
});

test('setter invocation is not proof the selection applied', () => {
  const {result, after, writes} = run({ignoreSetter: true});
  assert.equal(result.status, 'submitted');
  assert.notEqual(after.selected, result.expected.selected);
  assert.equal(writes.length, 1);
});
