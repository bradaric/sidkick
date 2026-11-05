const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
function run(o = {}, script = 'unit_order.js') {
  const calls = [];
  const u = {id: {owner: o.foreign ? 1 : 0, id: 20, type: 26}, type: 201, isOnMap: !o.offMap,
    activityType: o.activity ?? 1, operationQueueSize: o.queue ?? 0, getOperationType: () => o.operation ?? -1,
    Movement: {movementMovesRemaining: 3}, isFortified: false};
  const context = {queryArguments: {unit_id: 20, order: 'sleep', expected_turn: 59, ...o.args},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => false},
    Players: {get: () => ({isTurnActive: !o.inactive, Units: {getUnits: () => o.missing ? [] : [u]}})},
    UnitActivityTypes: {AWAKE: 1, NONE: -1, SLEEP: 2, HEAL: 3, SENTRY: 4, OPERATION: 5, HOLD: 6},
    UnitOperationTypes: {SKIP_TURN: 10, SLEEP: 11, FORTIFY: 12, REST_UNTIL_HEALED: 13, ALERT: 14},
    Game: {turn: 59, age: 42},
  };
  const api = label => ({canStart: (id, type, args, exclusion) => {
    calls.push({kind: 'check', label, id, type, args, exclusion});
    if (o.changed) context.Game.turn++;
    return {Success: !o.blocked};
  }, sendRequest: (id, type, args) => {calls.push({kind: 'send', label, id, type, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}});
  context.Game.UnitOperations = api('operation'); context.Game.UnitCommands = api('command');
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}
test('only bounded non-target orders use exact native UI arguments once', () => {
  for (const [order, label, type] of [['skip','operation','UNITOPERATION_SKIP_TURN'],['sleep','operation','UNITOPERATION_SLEEP'],
    ['fortify','operation','UNITOPERATION_FORTIFY'],['heal','operation','UNITOPERATION_REST_UNTIL_HEALED'],
    ['alert','operation','UNITOPERATION_ALERT'],['wake','command','UNITCOMMAND_WAKE'],['cancel','command','UNITCOMMAND_CANCEL']]) {
    const {data,calls}=run({args:{order},...(order==='wake'?{activity:2}:order==='cancel'?{queue:1,operation:99}:{})});
    assert.equal(data.status,'submitted');
    assert.deepEqual(calls[1],{kind:'send',label,id:{owner:0,id:20,type:26},type,args:{X:-9999,Y:-9999,UnitAbilityType:-1}});
    assert.equal(data.expected.orderActive,true);
  }
});
test('foreign/off-map, stale, blocked and raw operations cannot submit', () => {
  for (const o of [{foreign:true},{offMap:true},{missing:true},{inactive:true},{blocked:true},{changed:true},
    {args:{order:'UNITOPERATION_WMD_STRIKE'}},{args:{unit_id:true}},{args:{expected_turn:58}}, {queue:1,operation:99}]) {
    const {data,calls}=run(o);assert.equal(data.status,'rejected',JSON.stringify(o));
    assert.equal(calls.filter(c=>c.kind==='send').length,0);
  }
  assert.equal(run({sendThrows:true}).calls.filter(c=>c.kind==='send').length,1);
});
test('already-active sleep is a no-op and readback distinguishes each native activity/order', () => {
  assert.equal(run({activity:2}).data.status,'already_active');
  for (const [order,activity,operation] of [['sleep',2,-1],['wake',1,-1],['cancel',1,-1],['skip',5,10],
    ['fortify',5,12],['heal',3,-1],['alert',4,-1]]) {
    const {data,calls}=run({activity,operation,args:{order}},'unit_order_state.js');
    assert.equal(data.orderActive,true,order);assert.equal(calls.length,0);
  }
  assert.equal(run({activity:1},'unit_order_state.js').data.orderActive,false);
});

test('skip settles into HOLD with no queue and retains its remaining movement', () => {
  const {data,calls}=run({activity:6,args:{order:'skip'}},'unit_order_state.js');
  assert.equal(data.orderActive,true);assert.equal(data.movesRemaining,3);assert.equal(calls.length,0);
  assert.equal(run({activity:6,args:{order:'skip'}}).data.status,'already_active');
});
