const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const source = name => fs.readFileSync(path.join(__dirname, '../civ7', name), 'utf8');

function fixture(options = {}) {
  assert.ok(fs.existsSync(path.join(__dirname, '../civ7/transition_workflow.js')), 'guarded transition workflow exists');
  const state = {turn: 125, age: 1, pending: true, panel: false, amount: 1, completed: false,
    capital: 10, memento: 'M_A', other: 'NONE', ...options.state};
  const calls = [], reads = [];
  const oldAge = () => Boolean(state.pending || state.acknowledged);
  const parameter = (id, value) => ({ID: id, hidden: false, readOnly: false, invalidReason: 0,
    value: {value}, domain: {possibleValues: ['NONE', 'M_A', 'M_B'].map(value => ({value, invalidReason: 0}))}});
  const city = id => ({id: {owner: 0, id, type: 2}, owner: 0, name: `City ${id}`, isCapital: state.capital === id,
    location: id === 12 ? {x: 4, y: 5} : {x: id - 9, y: 1}});
  const selection = () => ({turn: state.turn, age: state.age, playerId: 0, nextAge: 'AGE_MODERN',
    selected: state.acknowledged ? 'CIVILIZATION_MAYA' : 'CIVILIZATION_PRUSSIA', selectionOpen: state.pending && options.editable !== false,
    notification: oldAge() && !(state.acknowledged && options.removeAcknowledgedNotice) ? {owner: 0, id: 7, type: 9} : null,
    notificationBlocksTurn: oldAge() && !(state.acknowledged && options.removeAcknowledgedNotice) ? Boolean(state.pending) : null,
    choicesAcknowledged: Boolean(state.acknowledged && !options.removeAcknowledgedNotice),
    choices: [{id: 'CIVILIZATION_PRUSSIA', selectionPermission: options.editable !== false && state.pending,
      setupReason: 0, unlocked: true}]});
  let snapshots = 0;
  const context = vm.createContext({
    UI: {isInGame: () => true, getGameLoadingState: () => options.loading ? 2 : 8,
      Player: {getFirstReadyUnit: () => null}}, UIGameLoadingState: {GameStarted: 8},
    Configuration: {getGame: () => ({isAnyMultiplayer: options.multiplayer ?? false, previousAgeCount: oldAge() ? 1 : 2}),
      getUser: () => ({isAutoEndTurn: options.autoEnd ?? false})}, Autoplay: {isActive: options.autoplay ?? false},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => options.sent ?? false,
      sendTurnComplete: () => {calls.push(['advance']); state.turn++;}},
    Locale: {compose: key => key}, EndTurnBlockingTypes: {NONE: 0}, RevealedStates: {HIDDEN: 0},
    GameplayMap: {getGridWidth: () => 20, getGridHeight: () => 20, getRevealedState: () => options.unknownPlot ? undefined : options.hiddenPlot ? 0 : 1},
    remainingMoves: () => ({remainingMovesBlocker: 'unitBlocker' in options ? options.unitBlocker : false}),
    GameSetupParameterInvalidReason: {Valid: 0}, GameSetupDomainValueInvalidReason: {Valid: 0},
    DisplayType: {DISPLAY_LOCKED: 0, DISPLAY_UNLOCKED: 1},
    Online: {Metaprogression: {
      getMementosData: () => {reads.push('mementos'); if (options.profileUnavailable) throw Error('offline');
        return ['M_A', 'M_B'].map(mementoTypeId => ({mementoTypeId, displayType: options.locked ? 0 : 1}));},
      getMementoSlotData: () => ['PlayerMementoMajorSlot', 'PlayerMementoMinorSlot'].map(mementoTypeId =>
        ({mementoTypeId, displayType: options.lockedSlot ? 0 : 1})),
      setSeenMemento: () => assert.fail('no profile mutations'),
    }},
    GameSetup: {resolveString: value => value,
      getMementoFilteredPlayerParameters: () => [parameter('PlayerMementoMajorSlot', 'M_A'), parameter('PlayerMementoMinorSlot', 'NONE')],
      getPlayerParameters: () => [parameter('AgeTransitionPlayerMementoMajorSlot', state.memento),
        parameter('AgeTransitionPlayerMementoMinorSlot', state.other)],
      setPlayerParameterValue: (id, key, value) => {calls.push(['set', id, key, value]);
        if (key === 'AgeTransitionPlayerMementoMajorSlot') state.memento = value; else state.other = value;},
    },
    transitionCivilization: {snapshot: () => {snapshots++; if (snapshots === 3) options.race?.(state); return selection();}},
    dedicationDeck: {snapshot: () => ({turn: state.turn, age: state.age, playerId: 0, deckToken: 'deck',
      selectionOpen: !oldAge() && !state.completed, selectionComplete: oldAge() || state.completed,
      selectedCardIds: ['CARD_A'], totalLegacyPoints: 2, deckSize: 3,
      selected: [{id: 'CARD_A', effects: [{id: 'EFFECT_A', placementRequired: options.placement ?? false, reportedAmount: state.amount}]}]})},
    Players: {get: () => ({isTurnActive: options.active ?? true, civilizationType: 99,
      Cities: {getCapital: () => city(state.capital), getCityIds: () => [city(10).id, city(11).id, ...(state.placed ? [city(12).id] : [])],
        getPotentialSwitchCapitalCityIds: () => [city(11).id]},
      AdvancedStart: {getPlacementComplete: () => state.completed},
    })}, Cities: {get: id => city(id.id)},
    GameInfo: {Ages: {lookup: () => ({AgeType: oldAge() ? 'AGE_EXPLORATION' : 'AGE_MODERN'})},
      Civilizations: {lookup: () => ({CivilizationType: 'CIVILIZATION_PRUSSIA'})}},
    PlayerOperationTypes: {SET_AGE_TRANSITION_DATA: 'FINISH', ADVANCED_START_USE_EFFECT: 'EFFECT',
      ADVANCED_START_MARK_COMPLETED: 'COMPLETE', SELECT_CAPITAL: 'CAPITAL', ADVANCED_START_PLACE_SETTLEMENT: 'PLACE'},
    Game: {get turn() {return state.turn;}, get age() {return state.age;},
      AgeProgressManager: {get isAgeOver() {return 'ageOver' in options ? options.ageOver : oldAge();},
        isExtendedGame: options.extended ?? false, isFinalAge: options.finalAge ?? false,
        getCurrentAgeProgressionPoints: () => options.currentProgress,
        getMaxAgeProgressionPoints: () => options.maximumProgress},
      UnitOperations: {canStartAny: () => false},
      Notifications: {getIdsForPlayer: () => oldAge() || !state.completed || options.retainCompletedNotice ? [{owner: 0, id: 7, type: 9}] : [],
        getType: () => 9, getTypeName: () => oldAge() ? 'NOTIFICATION_CHOOSE_CIVILIZATION' : 'NOTIFICATION_AGE_TRANSITION',
        find: () => ({Type: 9, Dismissed: false, Expired: false, AddedOnTurn: 125}),
        getBlocksTurnAdvancement: () => !state.acknowledged && !state.completed,
        getEndTurnBlockingType: () => options.blocker ?? (state.acknowledged || state.completed ? 0 : 9),
        activate: id => {calls.push(['open', {...id}]); state.panel = true;}},
      PlayerOperations: {canStart: () => ({Success: options.allowed ?? true}),
        sendRequest: (id, type, args) => {calls.push([type, id, {...args}]);
          if (type === 'FINISH') {state.pending = false; state.acknowledged = Boolean(options.retainChoice);}
          if (type === 'EFFECT' && !options.ignoreEffect) state.amount--;
          if (type === 'PLACE') {state.amount--; state.placed = true;}
          if (type === 'CAPITAL') state.capital = args.City;
          if (type === 'COMPLETE') state.completed = true;}},
    },
    document: {querySelectorAll: selector => {
      if (selector === '#age-transition-screen') return state.panel && oldAge() ? [panel] : [];
      if (selector === 'screen-dedication-selection') return state.panel && !oldAge() ? [panel] : [];
      return [];
    }},
  });
  const button = {isConnected: true, textContent: 'LOC_ADVANCED_START_VIEW_MAP', getClientRects: () => [{}],
    getAttribute: name => name === 'data-activatable' ? 'true' : null, hasAttribute: () => false,
    classList: {contains: () => false}, getBoundingClientRect: () => ({x: 0, y: 0, width: 10, height: 10}),
    contains: node => node === button,
    dispatchEvent: () => {calls.push(['view_map']); state.panel = false;}};
  const panel = {isConnected: true, getClientRects: () => [{}], querySelectorAll: () => [button]};
  context.document.elementFromPoint = () => button;
  context.CustomEvent = class {constructor(type, args) {this.type = type; this.detail = args.detail;}};
  context.InputActionStatuses = {FINISH: 1};
  vm.runInContext(`globalThis.transitionWorkflow = ${source('transition_workflow.js')}`, context);
  const read = () => JSON.parse(JSON.stringify(vm.runInContext('transitionWorkflow.snapshot()', context)));
  const before = read();
  function act(operation, args = {}) {
    context.queryArguments = {operation, workflow_token: before.workflowToken, expected_turn: before.turn, ...args};
    return JSON.parse(JSON.stringify(vm.runInContext(source('transition_workflow_action.js'), context)));
  }
  return {state, before, calls, reads, act, read, context};
}

test('workflow intentionally reads Memento profile eligibility but never writes profile metadata', () => {
  const f = fixture();
  assert.equal(f.before.mementos.available, true);
  assert.ok(f.before.workflowToken);
  assert.equal(f.before.mementos.slots[0].choices.find(c => c.id === 'M_B').selectionPermission, true);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.reads, ['mementos']);
});

test('opening activates only the exact pending native civilization notification', () => {
  const f = fixture();
  assert.equal(f.act('open').status, 'submitted');
  assert.deepEqual(f.calls, [['open', {owner: 0, id: 7, type: 9}]]);
  assert.equal(f.read().chooserOpen, true);
});

test('one Memento assignment preserves every other slot, never toggles or automatically swaps', () => {
  const f = fixture();
  const r = f.act('memento', {slot: 'AgeTransitionPlayerMementoMajorSlot', memento: 'M_B'});
  assert.equal(r.status, 'submitted');
  assert.deepEqual(f.calls, [['set', 0, 'AgeTransitionPlayerMementoMajorSlot', 'M_B']]);
  assert.equal(f.state.other, 'NONE');
  const duplicate = fixture({state: {other: 'M_B'}});
  assert.equal(duplicate.act('memento', {slot: 'AgeTransitionPlayerMementoMajorSlot', memento: 'M_B'}).status, 'rejected');
  assert.deepEqual(duplicate.calls, []);
});

test('locked or unknown profile/slot metadata and stale tokens cannot equip or finalize', () => {
  for (const options of [{locked: true}, {lockedSlot: true}, {profileUnavailable: true},
    {loading: true}, {multiplayer: true}, {autoEnd: true}, {autoplay: true}, {race: state => {state.other = 'M_B';}}]) {
    const f = fixture(options);
    assert.equal(f.act('memento', {slot: 'AgeTransitionPlayerMementoMajorSlot', memento: 'M_B'}).status, 'rejected');
    assert.deepEqual(f.calls, []);
  }
  const stale = fixture();
  assert.equal(stale.act('confirm_choices', {confirm: true, workflow_token: 'stale'}).status, 'rejected');
  assert.deepEqual(stale.calls, []);
});

test('confirming an eligible loadout sends only Finished, never a turn or card operation', () => {
  const f = fixture();
  assert.equal(f.act('confirm_choices', {confirm: true}).status, 'submitted');
  assert.deepEqual(f.calls, [['FINISH', 0, {Finished: true}]]);
  const no = fixture();
  assert.equal(no.act('confirm_choices', {confirm: false}).status, 'rejected');
  assert.deepEqual(no.calls, []);
});

test('Dedication effects are one native request and require a closed UI to prevent native auto-cascades', () => {
  const f = fixture({state: {pending: false}});
  assert.equal(f.act('effect', {effect_id: 'EFFECT_A'}).status, 'submitted');
  assert.deepEqual(f.calls, [['EFFECT', 0, {ID: 'EFFECT_A'}]]);
  assert.equal(f.read().effects[0].amount, 0);
  const open = fixture({state: {pending: false, panel: true}});
  assert.equal(open.act('effect', {effect_id: 'EFFECT_A'}).status, 'rejected');
  assert.deepEqual(open.calls, []);
  assert.equal(open.act('view_map').status, 'submitted');
  assert.equal(open.read().dedicationPanelOpen, false);
});

test('capital selection checks native owned candidates and never swaps settlement names', () => {
  const f = fixture({state: {pending: false}});
  assert.equal(f.act('capital', {city_id: 11}).status, 'submitted');
  assert.deepEqual(f.calls, [['CAPITAL', 0, {Player1: 0, City: 11, Swap: false}]]);
  assert.equal(f.read().capitalId, 11);
  const bad = fixture({state: {pending: false}});
  assert.equal(bad.act('capital', {city_id: 99}).status, 'rejected');
  assert.deepEqual(bad.calls, []);
});

test('deck completion refuses pending effects and requires explicit unused-point acknowledgement', () => {
  const pending = fixture({state: {pending: false}});
  assert.equal(pending.act('complete_deck', {confirm: true, accept_unused_points: true}).status, 'rejected');
  assert.deepEqual(pending.calls, []);
  const f = fixture({state: {pending: false, amount: 0}});
  assert.equal(f.act('complete_deck', {confirm: true, accept_unused_points: true}).status, 'submitted');
  assert.deepEqual(f.calls, [['COMPLETE', 0, {}]]);
  assert.equal(f.read().transitionCompleted, true);
});

test('a completed deck with a retained non-blocking transition notification is still readable as complete', () => {
  const f = fixture({retainCompletedNotice: true, state: {pending: false, amount: 0}});
  assert.equal(f.act('complete_deck', {confirm: true, accept_unused_points: true}).status, 'submitted');
  assert.equal(f.read().transitionCompleted, true);
});

test('placement effects use one exact revealed legal plot and verify a new owned settlement', () => {
  const f = fixture({placement: true, state: {pending: false}});
  const r = f.act('place_effect', {effect_id: 'EFFECT_A', x: 4, y: 5});
  assert.equal(r.status, 'submitted');
  assert.deepEqual(f.calls, [['PLACE', 0, {ID: 'EFFECT_A', X: 4, Y: 5}]]);
  f.context.queryArguments = r.verificationArguments;
  const after = vm.runInContext(source('transition_workflow_state.js'), f.context);
  assert.equal(after.placementApplied, true);
  for (const options of [{hiddenPlot: true}, {unknownPlot: true}, {allowed: false}]) {
    const bad = fixture({...options, placement: true, state: {pending: false}});
    assert.equal(bad.act('place_effect', {effect_id: 'EFFECT_A', x: 4, y: 5}).status, 'rejected');
    assert.deepEqual(bad.calls, []);
  }
});

test('ordinary turns, native blockers and unknown readiness never enter the Age-boundary path', () => {
  for (const options of [{ageOver: false}, {blocker: 3}, {unitBlocker: null}, {unitBlocker: true}]) {
    const f = fixture({ageOver: true, ...options, state: {pending: false, completed: true, amount: 0}});
    assert.equal(f.act('advance', {confirm: true}).status, 'rejected');
    assert.deepEqual(f.calls, []);
  }
  const f = fixture({ageOver: true, state: {pending: false, completed: true, amount: 0}});
  assert.equal(f.act('advance', {confirm: true}).status, 'submitted');
  assert.deepEqual(f.calls, [['advance']]);
  assert.equal(f.before.transitionCompleted, false, 'an upcoming Age boundary is not a completed transition');
});

test('a pending but non-editable civilization choice cannot be treated as already confirmed', () => {
  const f = fixture({editable: false, blocker: 0, ageOver: true});
  assert.equal(f.before.choicePending, true);
  assert.equal(f.act('advance', {confirm: true}).status, 'rejected');
  assert.deepEqual(f.calls, []);
});

test('refreshed tokens let the workflow proceed through explicit choices and deck steps without extra turns', () => {
  const f = fixture();
  const act = (op, args = {}) => f.act(op, {workflow_token: f.read().workflowToken, ...args});
  assert.equal(act('open').status, 'submitted');
  assert.equal(act('memento', {slot: 'AgeTransitionPlayerMementoMajorSlot', memento: 'M_B'}).status, 'submitted');
  assert.equal(act('view_map').status, 'submitted');
  assert.equal(act('confirm_choices', {confirm: true}).status, 'submitted');
  assert.equal(f.read().phase, 'dedications');
  assert.equal(act('effect', {effect_id: 'EFFECT_A'}).status, 'submitted');
  assert.equal(act('capital', {city_id: 11}).status, 'submitted');
  assert.equal(act('complete_deck', {confirm: true, accept_unused_points: true}).status, 'submitted');
  assert.equal(f.read().transitionCompleted, true);
  assert.equal(f.calls.some(call => call[0] === 'advance'), false);
});

test('acknowledged choices retain the submitted loadout after selector reset, allow closure, and never re-confirm', () => {
  const f = fixture({retainChoice: true, state: {panel: true}});
  assert.equal(f.act('confirm_choices', {confirm: true}).status, 'submitted');
  const ack = f.read();
  assert.equal(ack.phase, 'choices_acknowledged');
  assert.equal(ack.choicePending, false);
  assert.equal(ack.choicesAcknowledged, true);
  assert.equal(ack.nextCivilization, 'CIVILIZATION_PRUSSIA', 'never use the reset Maya setup selector as the target');
  assert.deepEqual(ack.confirmedLoadout.mementoSelections, f.before.mementoSelections);
  assert.equal(ack.advanceAllowed, false, 'close the stale chooser before boundary advancement');
  assert.equal(f.act('confirm_choices', {confirm: true, workflow_token: ack.workflowToken}).status, 'rejected');
  assert.equal(f.act('view_map', {workflow_token: ack.workflowToken}).status, 'submitted');
  const closed = f.read();
  assert.equal(closed.advanceAllowed, true);
  assert.equal(f.act('advance', {workflow_token: closed.workflowToken, confirm: true}).status, 'submitted');
  assert.equal(f.calls.filter(call => call[0] === 'FINISH').length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'set').length, 0);
});

test('pre-fix acknowledged state never guesses the reset selector target; explicit recovery expectation is required', () => {
  const f = fixture({state: {pending: false, acknowledged: true}});
  assert.equal(f.before.phase, 'choices_acknowledged');
  assert.equal(f.before.nextCivilization, null);
  assert.equal(f.before.requiresExpectedCivilization, true);
  assert.equal(f.act('advance', {confirm: true}).status, 'rejected');
  assert.equal(f.act('advance', {confirm: true, expected_civilization: 'CIVILIZATION_MAYA'}).status, 'rejected');
  const result = f.act('advance', {confirm: true, expected_civilization: 'CIVILIZATION_PRUSSIA'});
  assert.equal(result.status, 'submitted');
  assert.equal(result.before.nextCivilization, 'CIVILIZATION_PRUSSIA');
  assert.deepEqual(f.calls, [['advance']]);
});

test('acknowledgement with native isAgeOver=false remains incomplete and exposes the boundary blocker', () => {
  const f = fixture({ageOver: false, state: {pending: false, acknowledged: true}});
  assert.equal(f.before.phase, 'choices_acknowledged');
  assert.equal(f.before.transitionCompleted, false);
  assert.equal(f.before.advanceReady, false);
  assert.equal(f.before.ageBoundary.nativeAgeOver, false);
  assert.equal(f.before.ageBoundary.blocker, 0);
  assert.equal(f.before.ageBoundary.remainingMovesBlocker, false);
});

test('live T125 regression: acknowledged 140/140 permits one boundary submission despite isAgeOver=false', () => {
  const f = fixture({ageOver: false, currentProgress: 140, maximumProgress: 140,
    state: {pending: false, acknowledged: true}});
  assert.equal(f.before.ageBoundary.nativeAgeOver, false);
  assert.equal(f.before.ageBoundary.progressComplete, true);
  assert.equal(f.before.ageBoundary.boundarySource, 'acknowledged_progress_complete');
  assert.equal(f.before.advanceReady, true);
  assert.equal(f.before.advanceAllowed, false, 'missing receipt still requires an explicit expected civilization');
  assert.equal(f.before.nextAction, 'advance_civ7_age_transition');
  assert.equal(f.act('advance', {confirm: true}).status, 'rejected');
  const result = f.act('advance', {confirm: true, expected_civilization: 'CIVILIZATION_PRUSSIA'});
  assert.equal(result.status, 'submitted');
  assert.equal(result.before.nextCivilization, 'CIVILIZATION_PRUSSIA');
  assert.equal(f.before.transitionCompleted, false);
  assert.deepEqual(f.calls, [['advance']], 'no re-selection, repeat Finished or extra turn');
});

test('the progression fallback preserves every other boundary safeguard and rejects incomplete/unknown counts', () => {
  for (const changes of [
    {currentProgress: 139}, {currentProgress: null}, {maximumProgress: null}, {maximumProgress: 0},
    {currentProgress: '140'}, {maximumProgress: '140'}, {currentProgress: Infinity}, {currentProgress: NaN},
    {ageOver: undefined}, {ageOver: null}, {extended: true}, {finalAge: true}, {blocker: 3},
    {unitBlocker: true}, {unitBlocker: null}, {sent: true}, {active: false}, {multiplayer: true},
    {loading: true}, {autoEnd: true}, {autoplay: true},
    {state: {pending: false, acknowledged: true, panel: true}},
    {state: {pending: true}}, {state: {pending: false, completed: true}},
  ]) {
    const f = fixture({ageOver: false, currentProgress: 140, maximumProgress: 140,
      state: {pending: false, acknowledged: true}, ...changes});
    assert.equal(f.act('advance', {confirm: true, expected_civilization: 'CIVILIZATION_PRUSSIA'}).status,
      'rejected', JSON.stringify(changes));
    assert.deepEqual(f.calls, []);
  }
});

test('captured loadout can advance on complete native progress without a recovery override', () => {
  const f = fixture({retainChoice: true, ageOver: false, currentProgress: 141, maximumProgress: 140});
  assert.equal(f.act('confirm_choices', {confirm: true}).status, 'submitted');
  const ack = f.read();
  assert.equal(ack.advanceAllowed, true);
  const result = f.act('advance', {confirm: true, workflow_token: ack.workflowToken});
  assert.equal(result.status, 'submitted');
  assert.equal(result.before.nextCivilization, 'CIVILIZATION_PRUSSIA');
  assert.deepEqual(f.calls.map(call => call[0]), ['FINISH', 'advance']);
});

test('a captured confirmation with a cleared notification also uses native completed progression', () => {
  const f = fixture({retainChoice: true, removeAcknowledgedNotice: true, ageOver: false,
    currentProgress: 140, maximumProgress: 140});
  f.act('confirm_choices', {confirm: true});
  const ack = f.read();
  assert.equal(ack.phase, 'choices_acknowledged');
  assert.equal(ack.nextCivilization, 'CIVILIZATION_PRUSSIA');
  assert.equal(ack.advanceAllowed, true);
  assert.equal(ack.transitionCompleted, false);
});

test('progress changing during validation rejects before the boundary submission', () => {
  const options = {ageOver: false, currentProgress: 140, maximumProgress: 140,
    state: {pending: false, acknowledged: true}};
  options.race = () => {options.currentProgress = 139;};
  const f = fixture(options);
  assert.equal(f.act('advance', {confirm: true, expected_civilization: 'CIVILIZATION_PRUSSIA'}).status, 'rejected');
  assert.deepEqual(f.calls, []);
});

test('a confirmation receipt cannot follow changed origin context or override the captured civilization', () => {
  const f = fixture({retainChoice: true});
  f.act('confirm_choices', {confirm: true});
  const ack = f.read();
  assert.equal(f.act('advance', {confirm: true, workflow_token: ack.workflowToken,
    expected_civilization: 'CIVILIZATION_MEXICO'}).status, 'rejected');
  f.state.turn++;
  const changed = f.read();
  assert.equal(changed.confirmedLoadout, null);
  assert.equal(changed.nextCivilization, null);
  assert.equal(changed.advanceAllowed, false);
});
