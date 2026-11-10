const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
function run(o={}) {
 const calls=[];
 const context={queryArguments:{expected_turn:o.turn??59},UI:{isInGame:()=>!o.notInGame,
  Player:{getFirstReadyUnit:()=>o.readyUnit?{owner:0,id:20,type:26}:null}},
  Configuration:{getGame:()=>({isAnyMultiplayer:o.multiplayer??false}),getUser:()=>{
   if(o.missingPreference)throw Error('unavailable');
   return {isUnitCycle_RemainingMoves:o.cycleRemainingMoves??false};}},
  Units:{get:()=>o.unit??({id:{owner:0,id:20,type:26},canMove:o.canMove??true,hasMoved:o.hasMoved??false})},
  GameContext:{localPlayerID:0,hasSentTurnComplete:()=>o.sent??false,sendTurnComplete:()=>{calls.push('submit');if(o.sendThrows)throw Error('Lost acknowledgement');}},
  Players:{get:()=>({isTurnActive:!o.inactive})},EndTurnBlockingTypes:{NONE:0,UNITS:1},
  Game:{turn:59,age:42,Notifications:{getEndTurnBlockingType:()=>o.blocker??0},
   UnitOperations:{canStartAny:()=>o.readyUnit??false},AgeProgressManager:{isAgeOver:o.ageOver??false,isExtendedGame:false}}};
 const helper=fs.readFileSync(path.join(__dirname,'../civ7/remaining_moves.js'),'utf8');
 const script=fs.readFileSync(path.join(__dirname,'../civ7/end_turn.js'),'utf8');
 let data;try {data=vm.runInNewContext(`((remainingMoves)=>${script})(${helper})`,context);}
 catch(e){if(!o.sendThrows)throw e;data={error:e.message};}
 return JSON.parse(JSON.stringify({data,calls}));
}
test('end turn sends once only for the active single-player local turn with no blockers',()=>{
 const {data,calls}=run();assert.equal(data.status,'submitted');assert.deepEqual(calls,['submit']);
 assert.equal(data.before.turn,59);
});
test('turn guard never ignores native blockers, remaining units, stale/sent state or age boundaries',()=>{
 for(const o of [{blocker:1},{readyUnit:true},{multiplayer:true},{inactive:true},{sent:true},{turn:58},{ageOver:true},{notInGame:true}]){
  const {data,calls}=run(o);assert.equal(data.status,'rejected',JSON.stringify(o));assert.equal(calls.length,0);
 }
 assert.equal(run({sendThrows:true}).calls.length,1);
});
test('already moved or immobile ready units do not block when remaining-moves cycling is off',()=>{
 for(const o of [{hasMoved:true},{canMove:false}]){
  const {data,calls}=run({readyUnit:true,...o});
  assert.equal(data.status,'submitted');assert.deepEqual(calls,['submit']);
 }
});
test('remaining-moves cycling still blocks already moved ready units',()=>{
 const {data,calls}=run({readyUnit:true,hasMoved:true,cycleRemainingMoves:true});
 assert.equal(data.status,'rejected');assert.deepEqual(calls,[]);
});
test('unknown unit readiness rejects rather than submitting or falsely claiming a unit blocker',()=>{
 for(const extra of [{missingPreference:true},{unit:{id:{owner:0,id:20,type:26}}},
  {unit:{id:{owner:1,id:20,type:26},canMove:true,hasMoved:false}}]){
  const {data,calls}=run({readyUnit:true,...extra});
  assert.equal(data.status,'rejected');assert.equal(data.remainingMovesBlocker,null);
  assert.match(data.reason,/readiness is unavailable/);assert.deepEqual(calls,[]);
 }
});
