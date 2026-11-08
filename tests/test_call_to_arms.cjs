const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'diplomacy.js') {
  const reads = [], checks = [], mutations = [], payments = [];
  const mutate = () => {mutations.push('write'); throw Error('No game or UI changes allowed');};
  const notificationId = {owner: 0, id: 294, type: 20};
  const notification = {Type: 42, Dismissed: false, Expired: false, BlocksTurnAdvancement: true,
    Target: {id: 39}, ...o.notification};
  const event = {uniqueID: 39, initialPlayer: 4, targetPlayer: 5, actionTypeName: 'DIPLOMACY_ACTION_DECLARE_WAR',
    hidden: false, revealed: true, failed: false, gameTurnEnd: -1, ...o.event};
  const allied = o.allied ?? [4];
  let cost = Object.hasOwn(o, 'cost') ? o.cost : 240;
  const local = {isTurnActive: !o.inactive, Treasury: {goldBalance: o.gold ?? 1000},
    DiplomacyTreasury: {diplomacyBalance: o.influence ?? 500}, Diplomacy: {
    hasMet: id => [4, 5].includes(id) && !(o.unmet && id === 5), hasAllied: id => allied.includes(id),
    isAtWarWith: id => id === o.localWarWith, getRelationshipLevelName: () => 'Friendly', getRelationshipLevel: () => 40,
    getRelationshipEnum: () => 2, getPlayerRelationshipHistory: () => [],
  }, Stats: {getNetYield: () => 40}};
  const context = {
    queryArguments: o.args ?? {}, Configuration: {getGame: () => ({isAnyMultiplayer: o.multiplayer ?? false})},
    UI: {isInGame: () => true, getGameLoadingState: () => o.notStarted ? 6 : 8, selectUnit: mutate},
    UIGameLoadingState: {GameStarted: 8},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent), sendTurnComplete: mutate},
    Locale: {compose: (key, ...args) => [key, ...args].join('|')},
    Players: {getAliveIds: () => [0, 4, 5, 6], get: id => {
      reads.push(['player', id]);
      if (id === 0) return local;
      assert.ok(id !== 6 && !(o.unmet && id === 5), 'unmet identities must not be inspected');
      return {isMajor: true, civilizationFullName: id === 4 ? 'America' : 'Maurya', leaderName: id === 4 ? 'Franklin' : 'Ashoka'};
    }},
    GameInfo: {Leaders: {lookup: () => null}},
    DiplomacyActionTargetTypes: {NO_DIPLOMACY_TARGET: -1}, DiplomacyActionGroups: {NO_DIPLOMACY_ACTION_GROUP: -1},
    YieldTypes: {YIELD_DIPLOMACY: 1},
    PlayerOperationTypes: {DECLARE_WAR: 10, CANCEL_ALLIANCE: 11, PAY_TO_AVOID_CALL_TO_ARMS: 12},
    DiplomacyActionTypes: {DIPLOMACY_ACTION_DECLARE_WAR: 100, DIPLOMACY_ACTION_FORM_ALLIANCE: 101},
    Game: {turn: 37, age: 42,
      Notifications: {
        getIdsForPlayer: () => o.noNotices ? [] : [notificationId], getType: () => 42,
        getTypeName: () => 'NOTIFICATION_DIPLOMATIC_ALLY_AT_WAR', find: () => notification,
        dismiss: mutate, markAsSeen: mutate,
      },
      Diplomacy: {
        getProjectDataForUI: () => [],
        getPlayerEvents: () => [{uniqueID: 99, initialPlayer: 4, targetPlayer: 5, name: 'SECRET_FOREIGN_EVENT'}],
        getCompletionData: () => {throw Error('Do not broaden third-party event disclosure');},
        getNextCallToArms: () => o.noNext ? -1 : 39,
        getDiplomaticEventData: id => {reads.push(['event', id]); assert.equal(id, 39); return event;},
        getPayToAvoidCallToArmsCost: (...args) => {reads.push(['quote', ...args]); return cost;},
        canPayToAvoidCallToArms: (...args) => {reads.push(['canPay', ...args]); return o.canPay ?? true;},
      },
      PlayerOperations: {canStart: (playerId, operation, args, exclusion) => {
        checks.push({playerId, operation, args, exclusion});
        assert.equal(playerId, 0); assert.equal(exclusion, false);
        if (o.changedTurn) context.Game.turn++;
        if (o.changedCost) cost++;
        if (o.changedInfluence) local.DiplomacyTreasury.diplomacyBalance--;
        if (o.changedGold) local.Treasury.goldBalance--;
        if (o.expiredAfterCheck) notification.Expired = true;
        return {Success: operation !== o.blockedOperation, RequiresConfirmation: Boolean(o.confirm),
          InsufficientFunds: Boolean(o.insufficientFunds), FailureReasons: operation === o.blockedOperation ? ['Native blocked'] : []};
      }, sendRequest: (playerId, operation, args) => {
        payments.push({playerId, operation, args});
        if (script !== 'pay_call_to_arms.js' || operation !== 12) mutate();
        if (o.sendThrows) throw Error('Lost acknowledgement');
      }},
      DiplomacyDeals: {hasPendingDeal: () => false, getDealIds: () => []},
    },
  };
  if (o.noNotificationApi) delete context.Game.Notifications;
  if (o.noQuoteApi) delete context.Game.Diplomacy.getPayToAvoidCallToArmsCost;
  if (o.noPermissionApi) delete context.Game.PlayerOperations.canStart;
  let data;
  try { data = vm.runInNewContext(fs.readFileSync(`civ7/${script}`, 'utf8'), context); }
  catch (error) { if (!o.sendThrows) throw error; data = {error: error.message}; }
  assert.deepEqual(mutations, [], 'reading choices never sends requests, dismisses notifications or changes UI');
  if (script !== 'pay_call_to_arms.js') assert.equal(payments.length, 0);
  return JSON.parse(JSON.stringify({data, reads, checks, payments}));
}

test('pending ally-war notification exposes join, break-alliance neutrality and paid neutrality', () => {
  const {data, reads, checks} = run();
  assert.ok(Array.isArray(data.callToArms), 'separate call-to-arms prompts are exposed');
  const prompt = data.callToArms[0];
  assert.equal(prompt.status, 'pending');
  assert.equal(prompt.warEventId, 39);
  assert.deepEqual(prompt.notification, {owner: 0, id: 294, type: 20});
  assert.equal(prompt.initialPlayer.leader, 'Franklin');
  assert.equal(prompt.targetPlayer.leader, 'Ashoka');
  assert.deepEqual(prompt.responseOptions.map(option => option.response), ['join_war', 'stay_neutral', 'pay_influence']);
  const [join, neutral, pay] = prompt.responseOptions;
  assert.equal(join.warTargetPlayerId, 5);
  assert.equal(join.allyPlayerId, 4);
  assert.deepEqual(neutral.breaksAllianceWithPlayerIds, [4]);
  assert.equal(pay.quotedInfluenceCost, 240);
  assert.equal(pay.availableNow, true);
  assert.ok([join, neutral].every(option => option.supportedByWriteTool === false));
  assert.equal(pay.supportedByWriteTool, true);
  assert.equal(pay.responseTool, 'pay_civ7_call_to_arms');
  assert.equal(JSON.parse(pay.paymentToken).warEventId, 39);
  assert.deepEqual(checks.map(check => [check.operation, check.args]), [
    [10, {Player1: 0, Player2: 5, Type: 100}],
    [11, {Player1: 0, Player2: 4, Type: 101}],
    [12, {Player1: 0, Player2: 4, Player3: 5}],
  ]);
  assert.ok(reads.some(read => JSON.stringify(read) === JSON.stringify(['quote', 0, 4, 5])));
  assert.ok(data.majorPlayers.every(player => player.ongoingActions.length === 0), 'unrelated foreign events remain withheld');
});

test('defending ally and wars between two allies mirror the native panel choices', () => {
  const defending = run({allied: [5]}).data.callToArms[0].responseOptions;
  assert.equal(defending[0].warTargetPlayerId, 4);
  assert.deepEqual(defending[1].breaksAllianceWithPlayerIds, [5]);
  const {data, reads} = run({allied: [4, 5]});
  const options = data.callToArms[0].responseOptions;
  assert.deepEqual(options.map(option => option.response), ['join_war', 'stay_neutral', 'join_war']);
  assert.deepEqual(options.filter(option => option.response === 'join_war').map(option => option.warTargetPlayerId), [4, 5]);
  assert.deepEqual(options[1].breaksAllianceWithPlayerIds, [4, 5]);
  assert.ok(!reads.some(read => read[0] === 'quote'), 'no pay option is invented when both parties are allies');
});

test('call-to-arms eligibility preserves native blocks, unaffordability, zero cost and missing APIs', () => {
  assert.equal(run({canPay: false}).data.callToArms[0].responseOptions[2].availableNow, false);
  assert.equal(run({confirm: true}).data.callToArms[0].responseOptions[2].availableNow, false);
  assert.equal(run({cost: 0}).data.callToArms[0].responseOptions[2].quotedInfluenceCost, 0);
  for (const [operation, index] of [[10, 0], [11, 1], [12, 2]]) {
    const option = run({blockedOperation: operation}).data.callToArms[0].responseOptions[index];
    assert.equal(option.availableNow, false);
    assert.ok(option.failureReasons.includes('Native blocked'));
  }
  const unknown = run({noQuoteApi: true}).data.callToArms[0].responseOptions[2];
  assert.equal(unknown.quotedInfluenceCost, null);
  assert.equal(unknown.availableNow, null);
  assert.ok(run({noPermissionApi: true}).data.callToArms[0].responseOptions.every(option => option.operationAllowed === null));
});

test('expired or dismissed notices are not pending; unavailable evidence is not an empty checklist', () => {
  assert.deepEqual(run({noNotices: true}).data.callToArms, []);
  assert.deepEqual(run({notification: {Dismissed: true}}).data.callToArms, []);
  assert.deepEqual(run({notification: {Expired: true}}).data.callToArms, []);
  assert.equal(run({noNotificationApi: true}).data.callToArms, null);
  const {data} = run({notification: {Target: null}, noNext: true});
  assert.equal(data.callToArms[0].status, 'unavailable');
  assert.equal(data.callToArms[0].responseOptions, null);
  assert.equal(run({notification: {Target: null}}).data.callToArms[0].warEventId, 39);
});

test('unmet, hidden, stale or nonwar event evidence never exposes participants or options', () => {
  for (const o of [{unmet: true}, {allied: []}, {event: {uniqueID: 40}}, {event: {hidden: true}},
    {event: {revealed: false}}, {event: {failed: true}}, {event: {gameTurnEnd: 36}},
    {event: {initialPlayer: 0}}, {event: {actionTypeName: 'SECRET_PROJECT'}},
    {notification: {Type: 43}}, {notification: {BlocksTurnAdvancement: false}}]) {
    const {data, reads, checks} = run(o);
    const prompt = data.callToArms[0];
    assert.equal(prompt.status, 'unavailable', JSON.stringify(o));
    assert.equal(prompt.responseOptions, null);
    assert.equal(prompt.initialPlayer, undefined);
    assert.equal(checks.length, 0);
    if (o.unmet) assert.ok(!reads.some(read => read[0] === 'player' && read[1] === 5));
  }
});

function paymentArgs(o = {}) {
  const prompt = run().data.callToArms[0];
  const pay = prompt.responseOptions.find(option => option.response === 'pay_influence');
  return {war_event_id: 39, ally_player_id: 4, opponent_player_id: 5, payment_token: pay.paymentToken,
    max_influence_cost: 240, expected_turn: 37, ...o};
}

test('paid neutrality submits exactly the native payment operation, bound to the fresh pending prompt', () => {
  const {data, payments} = run({args: paymentArgs()}, 'pay_call_to_arms.js');
  assert.equal(data.status, 'submitted');
  assert.equal(data.quotedInfluenceCost, 240);
  assert.deepEqual(payments, [{playerId: 0, operation: 12, args: {Player1: 0, Player2: 4, Player3: 5}}]);
  assert.equal(data.verificationArguments.expected_influence, 260);
  assert.deepEqual(data.verificationArguments.notification, {owner: 0, id: 294, type: 20});
  assert.equal(data.expected.callToArmsPaymentApplied, true);
  assert.equal(run({args: paymentArgs(), sendThrows: true}, 'pay_call_to_arms.js').payments.length, 1);
});

test('payment never bypasses caps, prompt/price binding, peaceful alliances or native eligibility', () => {
  const args = paymentArgs();
  for (const o of [{args: {max_influence_cost: 239}}, {args: {max_influence_cost: true}},
    {args: {payment_token: 'stale'}}, {args: {war_event_id: 40}}, {args: {expected_turn: 36}},
    {args: {ally_player_id: 5, opponent_player_id: 4}}, {cost: 241}, {cost: -1}, {cost: null},
    {influence: 239}, {canPay: false}, {blockedOperation: 12}, {confirm: true}, {insufficientFunds: true},
    {noQuoteApi: true}, {noPermissionApi: true}, {noNotices: true}, {noNext: true},
    {notification: {Expired: true}}, {notification: {Target: {id: 40}}}, {event: {hidden: true}},
    {event: {gameTurnEnd: 36}}, {unmet: true}, {allied: []}, {allied: [4, 5]},
    {localWarWith: 4}, {localWarWith: 5}, {multiplayer: true}, {notStarted: true}, {sent: true}, {inactive: true},
    {cost: 241, args: {max_influence_cost: 300}},
    {changedTurn: true}, {changedCost: true}, {changedGold: true}, {changedInfluence: true}, {expiredAfterCheck: true}]) {
    const {data, payments} = run({...o, args: {...args, ...o.args}}, 'pay_call_to_arms.js');
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.deepEqual(payments, []);
  }
});

test('payment readback needs prompt clearance and the exact debit with Gold, alliance and peace preserved', () => {
  const submitted = run({args: paymentArgs()}, 'pay_call_to_arms.js').data;
  const after = {noNotices: true, noNext: true, influence: 260, args: submitted.verificationArguments};
  assert.equal(run(after, 'call_to_arms_payment_state.js').data.callToArmsPaymentApplied, true);
  assert.equal(run({...after, noNotices: false, notification: {Expired: true}},
    'call_to_arms_payment_state.js').data.callToArmsPaymentApplied, true);
  for (const change of [{influence: 500}, {influence: 259}, {gold: 999}, {allied: []}, {allied: [4, 5]},
    {localWarWith: 5}, {noNotices: false, noNext: false}, {noNext: false}, {event: {uniqueID: 40}}, {notStarted: true}, {multiplayer: true}]) {
    assert.equal(run({...after, ...change}, 'call_to_arms_payment_state.js').data.callToArmsPaymentApplied, false, JSON.stringify(change));
  }
});

test('a genuine zero-cost payment still needs a native request and resolved pending prompt', () => {
  const free = run({cost: 0}).data.callToArms[0].responseOptions.find(option => option.response === 'pay_influence');
  const {data, payments} = run({cost: 0, args: paymentArgs({payment_token: free.paymentToken, max_influence_cost: 0})}, 'pay_call_to_arms.js');
  assert.equal(data.status, 'submitted');
  assert.equal(data.quotedInfluenceCost, 0);
  assert.equal(payments.length, 1);
  assert.equal(run({args: data.verificationArguments}, 'call_to_arms_payment_state.js').data.callToArmsPaymentApplied, false);
  assert.equal(run({noNotices: true, noNext: true, args: data.verificationArguments}, 'call_to_arms_payment_state.js').data.callToArmsPaymentApplied, true);
});
