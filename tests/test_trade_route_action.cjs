const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'establish_trade_route.js') {
  const calls = [], cityReads = [];
  const cityId = {owner: 5, id: 10, type: 1};
  const merchant = {id: {owner: 0, id: 20, type: 26}, type: 201, isOnMap: o.offMap ? false : true,
    isDead: Boolean(o.dead),
    location: o.unitLocation ?? {x: 23, y: 38}, Movement: {movementMovesRemaining: o.moves ?? 4},
    operationQueueSize: o.queue ?? 0, getOperationType: () => o.operation ?? 901};
  const units = o.missingUnit ? [] : [merchant];
  if (o.duplicateUnit) units.push(merchant);
  if (o.foreignUnit) merchant.id.owner = 1;
  const commander = {id: {owner: 0, id: 30, type: 26}, isCommanderUnit: true, armyId: 8};
  if (o.packed || o.unknownPacking) units.push(commander);
  const route = {targetCityId: cityId, status: o.active ? [2] : [1], domain: 0};
  if (o.blocked) route.status = [3];
  let total = o.total ?? 2;
  const player = {isTurnActive: !o.inactive,
    Units: {getUnits: () => units},
    Diplomacy: {hasMet: id => id === 5 && !o.unmet, isAtWarWith: () => o.atWar ?? false,
      willMoveStartWar: () => ({Success: Boolean(o.moveWar)})},
    Trade: {projectPossibleTradeRoutes: options => {
      assert.equal(options, 3, 'must request extended status including existing routes');
      return o.noRoutes ? [] : o.ambiguous ? [route, route] : [route];
    }, countPlayerTradeRoutes: () => total, countPlayerTradeRoutesTo: id => {
      assert.equal(id, 5); return o.toPlayer ?? 0;
    }},
  };
  const args = {unit_id: 20, target_player_id: 5, target_city_id: 10, expected_turn: 58,
    baseline_route_count: 2, baseline_player_route_count: 0, ...o.args};
  const context = {queryArguments: args,
    Configuration: {getGame: () => ({isAnyMultiplayer: Boolean(o.multiplayer)})},
    UI: {isInGame: () => !o.notInGame}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sentTurn ?? false},
    Players: {get: id => {assert.equal(id, 0); return player;}},
    Cities: {get: id => {
      assert.equal(o.unmet, undefined, 'never inspect an unmet target city');
      cityReads.push(id);
      return {id: cityId, owner: o.changedOwner ? 4 : 5, location: {x: 18, y: 39},
        getPurchasedPlots: () => o.noPlots ? [] : o.hiddenClosest ? [3062, 3138] : [3138, 3137]};
    }},
    Armies: {get: () => o.unknownPacking ? null : {owner: 0, getUnitIds: () => o.packed ? [merchant.id] : []}},
    GameInfo: {Units: {lookup: () => ({UnitType: o.notMerchant ? 'UNIT_SCOUT' : 'UNIT_MERCHANT'})}},
    GameplayMap: {getGridWidth: () => 80, getGridHeight: () => 50,
      getRevealedState: (id, x) => o.hidden || o.hiddenClosest && x === 22 ? 0 : 1,
      getLocationFromIndex: index => ({x: index % 80, y: Math.floor(index / 80)}),
      getPlotDistance: (x, y, a, b) => Math.abs(x - a) + Math.abs(y - b)},
    Units: {getPathTo: () => ({plots: o.noPath ? [] : [3063, 3138]})},
    RevealedStates: {HIDDEN: 0, VISIBLE: 1}, TradeRouteSearchOptions: {INCLUDE_FAILED: 1, EXTENDED_STATUS: 2},
    UnitOperationTypes: {MOVE_TO: 901}, UnitOperationMoveModifiers: {ATTACK: 1, MOVE_IGNORE_UNEXPLORED_DESTINATION: 2}, CombatTypes: {NO_COMBAT: 0},
    TradeRouteStatus: {SUCCESS: 1, ALREADY_EXISTS: 2}, UnitCommandTypes: {MAKE_TRADE_ROUTE: 900},
    Game: {turn: 58, age: 42, Combat: {testAttackInto: () => o.moveCombat ? 1 : 0}, UnitCommands: {
      canStart: (id, command, parameters, exclusion) => {
        calls.push({kind: 'check', id, command, parameters, exclusion});
        if (o.changedTurn) context.Game.turn++;
        if (o.changedCounts) total++;
        return o.unknownDirect ? {} : {Success: !o.nativeBlocked, RequiresConfirmation: Boolean(o.directConfirm), FailureReasons: ['Native trade blocker']};
      },
      sendRequest: (id, command, parameters) => {
        calls.push({kind: 'send', id, command, parameters});
        if (o.sendThrows) throw Error('Lost acknowledgement');
      },
    }, UnitOperations: {
      canStart: (id, operation, parameters, exclusion) => {
        calls.push({kind: 'moveCheck', id, operation, parameters, exclusion});
        if (o.moveChangedTurn) context.Game.turn++;
        if (o.moveChangedUnit) merchant.type++;
        return {Success: !o.moveBlocked && !(o.firstMoveBlocked && parameters.X === 18),
          RequiresConfirmation: Boolean(o.moveConfirm), FailureReasons: ['Native move blocker']};
      },
      sendRequest: (id, operation, parameters) => {
        calls.push({kind: 'moveSend', id, operation, parameters});
        if (o.moveSendThrows) throw Error('Lost acknowledgement');
      },
    }},
  };
  const source = fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8');
  let data;
  try { data = vm.runInNewContext(source, context); }
  catch (error) { if (!o.sendThrows && !o.moveSendThrows) throw error; data = {error: error.message}; }
  return JSON.parse(JSON.stringify({data, calls, cityReads}));
}

test('direct trade establishment sends exactly one native command for the exact Merchant and city tile', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls, [
    {kind: 'check', id: {owner: 0, id: 20, type: 26}, command: 900, parameters: {X: 18, Y: 39}, exclusion: false},
    {kind: 'send', id: {owner: 0, id: 20, type: 26}, command: 900, parameters: {X: 18, Y: 39}},
  ]);
  assert.equal(data.expected.newRouteObserved, true);
  assert.equal(data.verificationArguments.baseline_route_count, 2);
  assert.equal(data.verificationArguments.baseline_player_route_count, 0);
});

test('a selectable route can send a freshly bought zero-movement Merchant when direct establishment is unavailable', () => {
  const {data, calls} = run({nativeBlocked: true, moves: 0});
  assert.equal(data.status, 'submitted');
  assert.equal(data.submissionKind, 'send_merchant');
  assert.equal(calls.filter(call => call.kind === 'send').length, 0, 'no rejected MAKE_TRADE_ROUTE request is sent');
  const moves = calls.filter(call => call.kind === 'moveSend');
  assert.equal(moves.length, 1);
  assert.deepEqual(moves[0], {kind: 'moveSend', id: {owner: 0, id: 20, type: 26}, operation: 901,
    parameters: {X: 18, Y: 39, Modifiers: 2}});
  assert.equal(data.expected.tradeActionObserved, true);
  assert.equal(run({moves: 0}).data.submissionKind, 'establish_route', 'zero movement alone does not block a valid direct command either');
});

test('native rejection never forces movement, and lost direct or dispatch acknowledgements never retry', () => {
  const rejected = run({nativeBlocked: true, moveBlocked: true});
  assert.equal(rejected.data.status, 'rejected');
  assert.equal(rejected.calls.some(c => ['send', 'moveSend'].includes(c.kind)), false);
  const uncertain = run({sendThrows: true});
  assert.match(uncertain.data.error, /Lost acknowledgement/);
  assert.equal(uncertain.calls.filter(c => c.kind === 'send').length, 1);
  const dispatchUnknown = run({nativeBlocked: true, moveSendThrows: true});
  assert.match(dispatchUnknown.data.error, /Lost acknowledgement/);
  assert.equal(dispatchUnknown.calls.filter(c => c.kind === 'moveSend').length, 1);
});

test('Send Merchant does not use hidden city plots, start war, request combat or ignore confirmations', () => {
  const visible = run({nativeBlocked: true, hiddenClosest: true});
  assert.equal(visible.data.status, 'submitted');
  assert.deepEqual(visible.data.dispatchDestination, {x: 18, y: 39});
  for (const extra of [{moveWar: true}, {moveCombat: true}, {moveConfirm: true}, {directConfirm: true}, {moveChangedTurn: true},
    {moveChangedUnit: true}, {multiplayer: true}, {dead: true}, {noPath: true}, {noPlots: true}, {unknownDirect: true}]) {
    const result = run({nativeBlocked: true, ...extra});
    assert.equal(result.data.status, 'rejected', JSON.stringify(extra));
    assert.equal(result.calls.some(c => ['send', 'moveSend'].includes(c.kind)), false);
  }
});

test('dispatch checks other city plots after a blocked nearest plot without submitting twice', () => {
  const {data, calls} = run({nativeBlocked: true, firstMoveBlocked: true});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(data.dispatchDestination, {x: 17, y: 39});
  assert.equal(calls.filter(call => call.kind === 'moveCheck').length, 2);
  assert.deepEqual(calls.filter(call => call.kind === 'moveSend').map(call => call.parameters),
    [{X: 17, Y: 39, Modifiers: 2}]);
});

test('unsupported, unowned, packed or unavailable Merchants and stale contexts never submit', () => {
  for (const o of [{missingUnit: true}, {duplicateUnit: true}, {foreignUnit: true}, {offMap: true},
    {notMerchant: true}, {packed: true}, {unknownPacking: true}, {inactive: true}, {sentTurn: true},
    {notInGame: true}, {args: {expected_turn: 57}}, {args: {unit_id: true}},
    {args: {target_city_id: true}}, {args: {target_player_id: -1}}, {args: {expected_turn: true}},
    {changedTurn: true}, {changedCounts: true}]) {
    const {data, calls} = run(o);
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.some(c => ['send', 'moveSend'].includes(c.kind)), false);
  }
});

test('unmet/hidden/war targets, changed ownership and ambiguous or blocked projected routes cannot submit', () => {
  for (const o of [{unmet: true}, {hidden: true}, {atWar: true}, {changedOwner: true},
    {noRoutes: true}, {ambiguous: true}, {blocked: true}]) {
    const {data, calls, cityReads} = run(o);
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.length, 0);
    if (o.unmet) assert.deepEqual(cityReads, []);
  }
});

test('an already established target is a no-op without spending another Merchant action', () => {
  const {data, calls} = run({active: true});
  assert.equal(data.status, 'already_active');
  assert.equal(calls.length, 0);
});

test('readback requires the target to become active and exact total/counterpart count increases', () => {
  const successful = run({active: true, total: 3, toPlayer: 1}, 'trade_route_state.js');
  assert.equal(successful.data.newRouteObserved, true);
  assert.equal(successful.calls.length, 0);
  for (const o of [{active: true}, {total: 3, toPlayer: 1},
    {active: true, total: 3, toPlayer: 0}, {active: true, total: 4, toPlayer: 2},
    {active: true, total: 3, toPlayer: 1, args: {baseline_route_count: 3}},
    {active: true, total: 3, toPlayer: 1, ambiguous: true}]) {
    assert.equal(run(o, 'trade_route_state.js').data.newRouteObserved, false, JSON.stringify(o));
  }
});

test('Merchant disappearance or movement alone cannot establish success', () => {
  assert.equal(run({missingUnit: true}, 'trade_route_state.js').data.newRouteObserved, false);
  assert.equal(run({missingUnit: true, active: true, total: 3, toPlayer: 1}, 'trade_route_state.js').data.newRouteObserved, true);
});

test('dispatch readback distinguishes queued/moving Merchant evidence from an actually active route', () => {
  const args = {dispatch_target: {x: 18, y: 39}, dispatch_from: {x: 23, y: 38}, dispatch_unit_type: 201, dispatch_component_type: 26};
  const queued = run({queue: 1, args}, 'trade_route_state.js').data;
  assert.equal(queued.tradeActionObserved, true);
  assert.equal(queued.newRouteObserved, false);
  assert.equal(queued.merchantMoveOrderObserved, true);
  const moved = run({unitLocation: {x: 22, y: 38}, args}, 'trade_route_state.js').data;
  assert.equal(moved.tradeActionObserved, true);
  assert.equal(moved.newRouteObserved, false);
  assert.equal(moved.merchantMovementObserved, true);
  assert.equal(run({args}, 'trade_route_state.js').data.tradeActionObserved, false);
  for (const extra of [{queue: 1, operation: 902}, {queue: 1, missingUnit: true}, {queue: 1, duplicateUnit: true},
    {queue: 1, dead: true}, {queue: 1, args: {...args, dispatch_unit_type: 202}},
    {queue: 1, args: {...args, dispatch_component_type: 99}}]) {
    assert.equal(run({args, ...extra}, 'trade_route_state.js').data.tradeActionObserved, false);
  }
  const active = run({args, missingUnit: true, active: true, total: 3, toPlayer: 1}, 'trade_route_state.js').data;
  assert.equal(active.newRouteObserved, true);
  assert.equal(active.tradeActionObserved, true);
});
