const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function unit(overrides = {}) {
  return {id: {owner: 0, id: 42, type: 26}, type: 100, name: 'Western Scout',
    isOnMap: true, location: {x: 2, y: 3}, Movement: {movementMovesRemaining: 2},
    operationQueueSize: 0, canMove: true, hasMoved: false, ...overrides};
}

function run(o = {}) {
  const owned = o.unit ?? unit();
  const noMutation = () => assert.fail('turn readback must not select, order or advance');
  const context = {
    Configuration: {getUser: () => ({isUnitCycle_RemainingMoves: o.cycleRemainingMoves ?? false})},
    UI: {isInGame: () => true, Player: {
      ...(!o.missingReady ? {getFirstReadyUnit: () => {
        if (o.throwReady) throw Error('unavailable');
        return Object.hasOwn(o, 'ready') ? o.ready : owned.id;
      }} : {}), selectUnit: noMutation, selectNextReadyUnit: noMutation,
    }},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => false, sendTurnComplete: noMutation},
    Players: {get: () => ({isTurnActive: true, Units: {getUnits: () => o.units ?? [owned]}})},
    Game: {turn: 59, age: 42, Notifications: {getEndTurnBlockingType: () => o.blocker ?? 0},
      AgeProgressManager: {isExtendedGame: false}, UnitOperations: {
        ...(!o.missingPermission ? {canStartAny: () => {
          if (o.throwPermission) throw Error('unavailable');
          return Object.hasOwn(o, 'canStartAny') ? o.canStartAny : true;
        }} : {}), sendRequest: noMutation,
      }},
    EndTurnBlockingTypes: {NONE: 0, UNITS: 1, PRODUCTION: 2},
    GameInfo: {Units: {lookup: () => ({UnitType: 'UNIT_SCOUT', Name: 'Scout'})}},
    Locale: {compose: s => s},
    GameplayMap: {getGridWidth: () => 10, getGridHeight: () => 10,
      getRevealedState: (id, x) => x === 9 ? 0 : 1}, RevealedStates: {HIDDEN: 0},
  };
  const helper = fs.readFileSync(path.join(__dirname, '../civ7/remaining_moves.js'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '../civ7/turn_state.js'), 'utf8');
  return JSON.parse(JSON.stringify(vm.runInNewContext(`((remainingMoves)=>${script})(${helper})`, context)));
}

test('turn readback identifies the native first-ready unit and actual remaining movement/queue', () => {
  const data = run({blocker: 1});
  assert.equal(data.hasBlocker, true);
  assert.equal(data.blockerName, 'UNITS');
  assert.equal(data.canStartAny, true);
  assert.equal(data.firstReadyUnitStatus, 'identified');
  assert.deepEqual(data.firstReadyUnit, {componentId: unit().id, instanceId: 42,
    id: 'UNIT_SCOUT', name: 'Western Scout', location: {x: 2, y: 3}, movesRemaining: 2, queueSize: 0,
    canMove: true, hasMoved: false});
});

test('readback distinguishes first-ready units from native remaining-moves blockers', () => {
  assert.equal(run().remainingMovesBlocker, true);
  for (const overrides of [{hasMoved: true}, {canMove: false}]) {
    assert.equal(run({unit: unit(overrides)}).remainingMovesBlocker, false);
    assert.equal(run({unit: unit(overrides), cycleRemainingMoves: true}).remainingMovesBlocker, true);
  }
  assert.equal(run({ready: null}).remainingMovesBlocker, false);
  assert.equal(run({missingPermission: true}).remainingMovesBlocker, null);
  assert.equal(run({ready: {...unit().id, owner: 1}}).remainingMovesBlocker, null);
});

test('ready cycle target stays separate from the native blocker and is not inferred from movement', () => {
  assert.equal(run({blocker: 2}).blockerName, 'PRODUCTION');
  assert.equal(run().hasBlocker, false);
  const none = run({ready: null});
  assert.equal(none.firstReadyUnitStatus, 'none');
  assert.equal(none.firstReadyUnit, null);
});

test('missing or throwing optional readiness APIs preserve core turn evidence', () => {
  for (const o of [{missingReady: true}, {throwReady: true}]) {
    const data = run(o);
    assert.equal(data.turn, 59);
    assert.equal(data.active, true);
    assert.equal(data.firstReadyUnitStatus, 'unavailable');
    assert.equal(data.firstReadyUnit, null);
  }
  for (const o of [{missingPermission: true}, {throwPermission: true}, {canStartAny: 1}]) {
    assert.equal(run(o).canStartAny, null);
  }
});

test('foreign stale or ambiguous first-ready identities are not reported as owned units', () => {
  for (const o of [{ready: {...unit().id, owner: 1}}, {ready: {...unit().id, type: 99}},
    {ready: {...unit().id, id: -1}}, {units: []}, {units: [unit(), unit()]}]) {
    const data = run(o);
    assert.equal(data.firstReadyUnitStatus, 'unverified');
    assert.equal(data.firstReadyUnit, null);
  }
});

test('readback preserves queues without inventing destinations and withholds hidden/off-map locations', () => {
  for (const overrides of [{location: {x: 9, y: 3}}, {isOnMap: false}, {location: {x: -1, y: 3}}]) {
    const data = run({unit: unit({...overrides, operationQueueSize: 1})});
    assert.equal(data.firstReadyUnit.location, null);
    assert.equal(data.firstReadyUnit.queueSize, 1);
    assert.equal(Object.hasOwn(data.firstReadyUnit, 'queuedDestination'), false);
  }
});
