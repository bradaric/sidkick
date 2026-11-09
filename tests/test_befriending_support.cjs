const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function game(o = {}) {
  const calls = [], playerReads = [];
  const event = {uniqueID: 62, initialPlayer: 0, targetPlayer: 7, actionType: 99,
    actionTypeName: 'DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN', hidden: false, revealed: true, failed: false,
    gameTurnEnd: -1, gameTurnStart: 63, progressScore: 32, completionScore: 60, support: 2, ...o.event};
  let tokens = 2, cost = o.cost ?? 360;
  const player = {isTurnActive: !o.inactive, Treasury: {goldBalance: 606}, DiplomacyTreasury: {diplomacyBalance: 385.40234375},
    Diplomacy: {hasMet: () => !o.unmet, isAtWarWith: () => Boolean(o.atWar)}};
  const target = {isIndependent: !o.minor};
  const context = {
    UI: {isInGame: () => !o.menu}, Configuration: {getGame: () => ({isAnyMultiplayer: Boolean(o.multiplayer)}), getUser: () => ({isAutoEndTurn: Boolean(o.autoEndTurn)})},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)},
    Players: {get: id => {playerReads.push(id); return id === 0 ? player : id === 7 ? target : null;}},
    GameInfo: {DiplomacyActions: {lookup: () => ({DiplomacyActionType: 'DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN', $hash: 99})}},
    DiplomacyTokenTypes: {DIPLOMACY_TOKEN_GLOBAL: 4}, PlayerOperationTypes: {SUPPORT_DIPLOMATIC_ACTION: 8},
    Game: {turn: 64, age: -123, IndependentPowers: {independentVillageDiscoveredByPlayer: () => Boolean(o.discovered)},
      Diplomacy: {
        getPlayerEvents: id => {assert.equal(id, 7); return o.missing ? [] : o.duplicate ? [event, event] : [event];},
        isProjectCanceled: () => Boolean(o.cancelled),
        getNumSupportEnvoysForPlayer: (id, owner) => {assert.equal(id, 62); assert.equal(owner, 0); return tokens;},
        getInfluenceForNextSupport: (id, owner, positive) => {assert.equal(id, 62); assert.equal(owner, 0); assert.equal(positive, true); return cost;},
        getCompletionData: () => ({progressPerTurn: event.support, turnsToCompletion: Math.ceil((60 - event.progressScore) / event.support)}),
      },
      PlayerOperations: {
        canStart: (id, operation, args, testVisible) => {
          assert.equal(id, 0); assert.equal(operation, 8); assert.equal(testVisible, false);
          assert.deepEqual(JSON.parse(JSON.stringify(args)), {ID: 62, Type: 4, Amount: 1, SubType: true});
          o.change?.({event, player, target, context, changeCost: () => cost++});
          return {Success: !o.blocked, RequiresConfirmation: Boolean(o.confirmation), InsufficientFunds: Boolean(o.funds)};
        },
        sendRequest: (id, operation, args) => {
          calls.push({id, operation, args: JSON.parse(JSON.stringify(args))});
          if (!o.noApply) {tokens++; event.support++; player.DiplomacyTreasury.diplomacyBalance -= cost;}
          if (o.throwSend) throw Error('Lost submission response');
        },
      }},
  };
  const sandbox = vm.createContext(context);
  const run = (file, args) => {
    assert.ok(fs.existsSync(`civ7/${file}`), `bundled ${file} exists`);
    sandbox.queryArguments = args;
    return JSON.parse(JSON.stringify(vm.runInContext(fs.readFileSync(`civ7/${file}`, 'utf8'), sandbox)));
  };
  return {calls, playerReads, event, player, context, run, submit: (args = {}) => run('support_befriending.js',
    {event_id: 62, target_player_id: 7, max_influence_cost: 360, expected_turn: 64, ...args})};
}

test('one exact native support request spends the capped quote and verifies one own-token increment', () => {
  const g = game(), result = g.submit();
  assert.equal(result.status, 'submitted'); assert.equal(result.quotedInfluenceCost, 360);
  assert.deepEqual(g.calls, [{id: 0, operation: 8, args: {ID: 62, Type: 4, Amount: 1, SubType: true}}]);
  const state = g.run('befriending_support_state.js', result.verificationArguments);
  assert.equal(state.befriendingSupportApplied, true); assert.equal(state.supportTokens, 3);
  assert.equal(state.progressPerTurn, 3); assert.equal(state.turnsRemaining, 10);
  assert.equal(g.player.DiplomacyTreasury.diplomacyBalance, 25.40234375);
  assert.equal(g.calls.length, 1);
});

test('an unmet undiscovered target is rejected before inspecting the foreign player', () => {
  const g = game({unmet: true});
  assert.equal(g.submit().status, 'rejected');
  assert.deepEqual(g.playerReads, [0]);
});

test('zero and fractional native quotes are retained and unaffordable quotes never submit', () => {
  for (const cost of [0, 359.75]) {
    const g = game({cost}), result = g.submit({max_influence_cost: cost});
    assert.equal(result.status, 'submitted'); assert.equal(result.quotedInfluenceCost, cost);
    assert.equal(g.run('befriending_support_state.js', result.verificationArguments).befriendingSupportApplied, true);
  }
  const g = game({cost: 400});
  assert.equal(g.submit({max_influence_cost: 400}).status, 'rejected'); assert.deepEqual(g.calls, []);
});

test('unsafe, stale, foreign, ambiguous, blocked and over-budget requests never submit', () => {
  for (const o of [{menu: true}, {multiplayer: true}, {autoEndTurn: true}, {inactive: true}, {sent: true}, {unmet: true},
    {atWar: true}, {minor: true}, {missing: true}, {duplicate: true}, {cancelled: true}, {blocked: true},
    {confirmation: true}, {funds: true}, {cost: 361}, {cost: NaN}, {cost: -1},
    ...[{initialPlayer: 1}, {targetPlayer: 8}, {hidden: true}, {revealed: false}, {failed: true}, {gameTurnEnd: 64},
      {actionType: 100}, {actionTypeName: 'DIPLOMACY_ACTION_DECLARE_WAR'}].map(event => ({event}))]) {
    const g = game(o); assert.equal(g.submit().status, 'rejected', JSON.stringify(o)); assert.deepEqual(g.calls, []);
  }
  for (const args of [{expected_turn: 63}, {max_influence_cost: 359}, {event_id: true}, {target_player_id: -1}]) {
    const g = game(); assert.equal(g.submit(args).status, 'rejected'); assert.deepEqual(g.calls, []);
  }
  assert.equal(game({unmet: true, discovered: true}).submit().status, 'submitted');
});

test('project, quote, balances and readiness are rechecked immediately before submission', () => {
  for (const change of [({event}) => event.progressScore++, ({event}) => event.initialPlayer = 1,
    ({event}) => event.failed = true, ({player}) => player.Treasury.goldBalance--,
    ({player}) => player.DiplomacyTreasury.diplomacyBalance--, ({player}) => player.isTurnActive = false,
    ({context}) => context.Game.turn++, ({context}) => context.Game.age++,
    ({target}) => target.isIndependent = false, ({changeCost}) => changeCost()]) {
    const g = game({change}); assert.equal(g.submit().status, 'rejected'); assert.deepEqual(g.calls, []);
  }
});

test('readback cannot equate spending alone, project replacement or changed Gold with applied support', () => {
  for (const corrupt of [g => g.event.initialPlayer = 1, g => g.event.gameTurnStart--,
    g => g.event.progressScore++, g => g.player.Treasury.goldBalance--,
    g => g.player.DiplomacyTreasury.diplomacyBalance++, g => g.event.failed = true]) {
    const g = game(), result = g.submit(); corrupt(g);
    assert.equal(g.run('befriending_support_state.js', result.verificationArguments).befriendingSupportApplied, false);
    assert.equal(g.calls.length, 1);
  }
  const g = game({noApply: true}), result = g.submit();
  g.player.DiplomacyTreasury.diplomacyBalance -= 360;
  assert.equal(g.run('befriending_support_state.js', result.verificationArguments).befriendingSupportApplied, false);
  const lost = game({throwSend: true}); assert.throws(() => lost.submit(), /Lost submission/); assert.equal(lost.calls.length, 1);
});
