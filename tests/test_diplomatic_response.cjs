const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'respond_diplomatic_project.js') {
  const calls = [];
  const event = {uniqueID: 76, initialPlayer: o.self ? 0 : 1, targetPlayer: o.foreign ? 2 : 0,
    actionType: 300, actionTypeName: o.action ?? (o.hostile ? 'DIPLOMACY_ACTION_DECLARE_WAR' : 'DIPLOMACY_ACTION_CULTURAL_EXCHANGE'),
    gameTurnStart: 61, gameTurnEnd: o.ended ? 62 : -1, responseType: o.response ?? -1,
    revealed: !o.unrevealed, hidden: o.hidden ?? false, failed: o.failed ?? false};
  const response = {responseType: o.offeredType ?? 12, cost: o.missingCost ? undefined : o.cost ?? 180,
    canSelect: !o.unselectable, responseName: 'Support', responseDescription: 'Both players gain Culture'};
  const picker = {actionID: o.wrongPicker ? 77 : 76, initialPlayer: 1, targetPlayer: 0, responseList: o.notOffered ? [] : o.duplicate ? [response, response] : [response]};
  const player = {isTurnActive: !o.inactive,Treasury:{goldBalance:o.gold??1000}, DiplomacyTreasury: {diplomacyBalance: o.balance ?? 500},
    Diplomacy: {hasMet: id => !o.unmet && id === 1, isAtWarWith: () => o.atWar ?? false,
      getRelationshipLevelName: () => 'Friendly', getRelationshipLevel: () => 1, getRelationshipEnum: () => 1,
       hasAllied: () => Boolean(o.allied), getPlayerRelationshipHistory: () => []}, Stats: {getNetYield: () => 10}};
  const context = {queryArguments: {action_id: 76, response: 'support', max_influence_cost: 180, expected_turn: 62,
       initial_player: 1, action: event.actionTypeName,...(o.hostileIntent?{hostile:true,hostile_baseline:{gold:1000,influence:320,atWar:false,allied:false}}:{}), ...o.args},
    UI: {isInGame: () => !o.notInGame}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sent ?? false},
    Players: {getAliveIds: () => [0, 1], get: id => id === 0 ? player : {isMajor: !o.minor}},
    Locale: {compose: value => value}, GameInfo: {Leaders: {lookup: () => null},
      DiplomacyActions: {lookup: () => ({DiplomacyActionType: event.actionTypeName, $hash: 300})}},
    DiplomaticResponseTypes: {INVALID_RESPONSE: -1, DIPLOMACY_RESPONSE_ACCEPT: 11, DIPLOMACY_RESPONSE_SUPPORT: 12, DIPLOMACY_RESPONSE_REJECT: 13},
    PlayerOperationTypes: {RESPOND_DIPLOMATIC_ACTION: 900},
    DiplomacyActionTargetTypes: {NO_DIPLOMACY_TARGET: -1}, DiplomacyActionGroups: {NO_DIPLOMACY_ACTION_GROUP: -1},
    DiplomacyProjectStatus: {PROJECT_NOT_UNLOCKED: 1, PROJECT_BLOCKED: 2, PROJECT_ACTIVE: 3}, YieldTypes: {YIELD_DIPLOMACY: 5},
    Game: {turn: 62, age: 42, Diplomacy: {getPlayerEvents: () => o.missing ? [] : [event],
      getResponseDataForUI: id => {assert.equal(id, 76); calls.push({kind: 'picker'}); return picker;},
      getCompletionData: () => null, getProjectDataForUI: () => []},
      DiplomacyDeals: {hasPendingDeal: () => false, getDealIds: () => []},
      PlayerOperations: {canStart: (id, type, args, exclusion) => {
        calls.push({kind: 'check', id, type, args, exclusion});
        if (o.changed) context.Game.turn++;
        if (o.changedCost) response.cost = 181;
        if(o.changedBalance)player.DiplomacyTreasury.diplomacyBalance--;
        return {Success: !o.blocked,RequiresConfirmation:Boolean(o.confirm)};
      }, sendRequest: (id, type, args) => {calls.push({kind: 'send', id, type, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('cooperative response uses the exact incoming event ID and selected native response with a capped quote', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.equal(data.quotedInfluenceCost, 180);
  assert.deepEqual(calls.at(-1), {kind: 'send', id: 0, type: 900, args: {ID: 76, Type: 12}});
  assert.equal(data.expected.response, 'support');
  assert.equal(run({cost: 0, balance: 0, args: {max_influence_cost: 0}}).data.status, 'submitted');
});

test('cost, native permission, stale identity, unsupported response and picker mismatches cannot submit', () => {
  for (const o of [{cost: 181}, {missingCost: true}, {balance: 179}, {blocked: true}, {changed: true}, {changedCost: true},
    {unselectable: true}, {wrongPicker: true}, {notOffered: true}, {duplicate: true}, {sent: true}, {inactive: true},
    {args: {action_id: true}}, {args: {expected_turn: 61}}, {args: {response: 'declare_war'}}, {args: {max_influence_cost: true}}]) {
    const {data, calls} = run(o);
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});

test('unowned, hidden, hostile, failed, ended or unmet events are rejected before response picker queries', () => {
  for (const o of [{self: true}, {foreign: true}, {unmet: true}, {minor: true}, {hidden: true}, {unrevealed: true},
    {hostile: true}, {atWar: true}, {failed: true}, {ended: true}, {missing: true}]) {
    const {data, calls} = run(o);
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.length, 0);
  }
  assert.equal(run({response: 12}).data.status, 'already_active');
  assert.equal(run({response: 11}).data.status, 'rejected');
});

test('targeted response readback proves the same incoming event now records the selected response', () => {
  const {data, calls} = run({response: 12}, 'diplomatic_response_state.js');
  assert.equal(data.actionId, 76);
  assert.equal(data.initialPlayer, 1);
  assert.equal(data.response, 'support');
  assert.equal(calls.length, 0);
});

test('accept/reject use their own native response enums and a terminated rejection can still be verified', () => {
  for (const [response, type, cost] of [['accept', 11, 0], ['reject', 13, 60]]) {
    const {data, calls} = run({offeredType: type, cost, args: {response, max_influence_cost: cost}});
    assert.equal(data.status, 'submitted');
    assert.deepEqual(calls.at(-1).args, {ID: 76, Type: type});
    const state = run({response: type, ended: response === 'reject'}, 'diplomatic_response_state.js').data;
    assert.equal(state.response, response);
  }
});

test('diplomacy readout exposes pending native response options and does not fabricate missing costs', () => {
  const {data, calls} = run({}, 'diplomacy.js');
  const incoming = data.majorPlayers[0].ongoingActions[0];
  assert.ok(incoming.responseOptions);
  assert.deepEqual(incoming.responseOptions[0], {response: 'support', name: 'Support', description: 'Both players gain Culture',
    quotedInfluenceCost: 180, availableNow: true, operationAllowed: true, supportedByWriteTool: true, failureReasons: []});
  assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  assert.equal(run({missingCost: true}, 'diplomacy.js').data.majorPlayers[0].ongoingActions[0].responseOptions[0].quotedInfluenceCost, null);
  assert.equal(run({hidden: true}, 'diplomacy.js').data.majorPlayers[0].ongoingActions.length, 0);
});
test('explicit hostile response binds revealed incoming sanction, native offer/cap and exact balances without relaxing cooperative default',()=>{
 for(const suffix of ['DENOUNCE','DENOUNCE_MILITARY_PRESENCE','SABOTAGE_TREASURY','SABOTAGE_MORALE','SABOTAGE_RESEARCH','SABOTAGE_CIVIC_STUDY','SABOTAGE_MILITARY_PRODUCTION','SABOTAGE_FOOD_PRODUCTION']){
  const base={hostileIntent:true,action:`DIPLOMACY_ACTION_${suffix}`},r=run(base);assert.equal(r.data.status,'submitted');assert.equal(r.data.expected.hostileResponseApplied,true);assert.equal(r.data.verificationArguments.hostile_baseline.influence,320);assert.equal(r.calls.filter(c=>c.kind==='send').length,1);
  assert.equal(run({...base,hostileIntent:false}).data.status,'rejected');
 }
 const base={hostileIntent:true,action:'DIPLOMACY_ACTION_SABOTAGE_RESEARCH'};
 for(const extra of [{hidden:true},{unrevealed:true},{changedBalance:true},{confirm:true},{atWar:true},{action:'DIPLOMACY_ACTION_DECLARE_WAR'},{action:'DIPLOMACY_ACTION_ESPIONAGE_STEAL_TECH'}])assert.equal(run({...base,...extra}).data.status,'rejected');
 const state=run({...base,response:12,balance:320},'diplomatic_response_state.js').data;assert.equal(state.hostileResponseApplied,true);
 for(const extra of [{balance:319},{gold:999},{allied:true},{atWar:true}])assert.equal(run({...base,response:12,balance:320,...extra},'diplomatic_response_state.js').data.hostileResponseApplied,false);
 const offered=run(base,'diplomacy.js').data.majorPlayers[0].ongoingActions[0].responseOptions[0];
 assert.equal(offered.supportedByWriteTool,true);assert.equal(offered.responseTool,'respond_civ7_hostile_project');
});
