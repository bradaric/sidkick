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
  const parameter = (id, value) => ({ID: id, hidden: false, readOnly: false, invalidReason: 0,
    value: {value}, domain: {possibleValues: ['NONE', 'M_A', 'M_B'].map(value => ({value, invalidReason: 0}))}});
  const city = id => ({id: {owner: 0, id, type: 2}, owner: 0, name: `City ${id}`, isCapital: state.capital === id,
    location: id === 12 ? {x: 4, y: 5} : {x: id - 9, y: 1}});
  const selection = () => ({turn: state.turn, age: state.age, playerId: 0, nextAge: 'AGE_MODERN',
    selected: 'CIVILIZATION_PRUSSIA', selectionOpen: state.pending && options.editable !== false,
    notification: state.pending ? {owner: 0, id: 7, type: 9} : null,
    choices: [{id: 'CIVILIZATION_PRUSSIA', selectionPermission: options.editable !== false}]});
  let snapshots = 0;
  const context = vm.createContext({
    UI: {isInGame: () => true, getGameLoadingState: () => options.loading ? 2 : 8,
      Player: {getFirstReadyUnit: () => null}}, UIGameLoadingState: {GameStarted: 8},
    Configuration: {getGame: () => ({isAnyMultiplayer: options.multiplayer ?? false, previousAgeCount: state.pending ? 1 : 2}),
      getUser: () => ({isAutoEndTurn: options.autoEnd ?? false})}, Autoplay: {isActive: options.autoplay ?? false},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => false,
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
      selectionOpen: !state.pending && !state.completed, selectionComplete: state.completed,
      selectedCardIds: ['CARD_A'], totalLegacyPoints: 2, deckSize: 3,
      selected: [{id: 'CARD_A', effects: [{id: 'EFFECT_A', placementRequired: options.placement ?? false, reportedAmount: state.amount}]}]})},
    Players: {get: () => ({isTurnActive: true, civilizationType: 99,
      Cities: {getCapital: () => city(state.capital), getCityIds: () => [city(10).id, city(11).id, ...(state.placed ? [city(12).id] : [])],
        getPotentialSwitchCapitalCityIds: () => [city(11).id]},
      AdvancedStart: {getPlacementComplete: () => state.completed},
    })}, Cities: {get: id => city(id.id)},
    GameInfo: {Ages: {lookup: () => ({AgeType: state.pending ? 'AGE_EXPLORATION' : 'AGE_MODERN'})},
      Civilizations: {lookup: () => ({CivilizationType: 'CIVILIZATION_PRUSSIA'})}},
    PlayerOperationTypes: {SET_AGE_TRANSITION_DATA: 'FINISH', ADVANCED_START_USE_EFFECT: 'EFFECT',
      ADVANCED_START_MARK_COMPLETED: 'COMPLETE', SELECT_CAPITAL: 'CAPITAL', ADVANCED_START_PLACE_SETTLEMENT: 'PLACE'},
    Game: {get turn() {return state.turn;}, get age() {return state.age;},
      AgeProgressManager: {get isAgeOver() {return options.ageOver ?? state.pending;}, isExtendedGame: false, isFinalAge: false},
      UnitOperations: {canStartAny: () => false},
      Notifications: {getIdsForPlayer: () => state.pending || !state.completed ? [{owner: 0, id: 7, type: 9}] : [],
        getType: () => 9, getTypeName: () => state.pending ? 'NOTIFICATION_CHOOSE_CIVILIZATION' : 'NOTIFICATION_AGE_TRANSITION',
        find: () => ({Type: 9, Dismissed: false, Expired: false, AddedOnTurn: 125}),
        getBlocksTurnAdvancement: () => true, getEndTurnBlockingType: () => options.blocker ?? (state.pending || !state.completed ? 9 : 0),
        activate: id => {calls.push(['open', {...id}]); state.panel = true;}},
      PlayerOperations: {canStart: () => ({Success: options.allowed ?? true}),
        sendRequest: (id, type, args) => {calls.push([type, id, {...args}]);
          if (type === 'FINISH') state.pending = false;
          if (type === 'EFFECT' && !options.ignoreEffect) state.amount--;
          if (type === 'PLACE') {state.amount--; state.placed = true;}
          if (type === 'CAPITAL') state.capital = args.City;
          if (type === 'COMPLETE') state.completed = true;}},
    },
    document: {querySelectorAll: selector => {
      if (selector === '#age-transition-screen') return state.panel && state.pending ? [panel] : [];
      if (selector === 'screen-dedication-selection') return state.panel && !state.pending ? [panel] : [];
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
