const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
function run(o={}) {
 const calls=[];
 const context={queryArguments:{expected_turn:o.turn??59},UI:{isInGame:()=>!o.notInGame,
  Player:{getFirstReadyUnit:()=>o.readyUnit?{owner:0,id:20,type:26}:{owner:-1,id:-1,type:0}}},
  Configuration:{getGame:()=>({isAnyMultiplayer:o.multiplayer??false})},
  GameContext:{localPlayerID:0,hasSentTurnComplete:()=>o.sent??false,sendTurnComplete:()=>{calls.push('submit');if(o.sendThrows)throw Error('Lost acknowledgement');}},
  Players:{get:()=>({isTurnActive:!o.inactive})},EndTurnBlockingTypes:{NONE:0,UNITS:1},
  Game:{turn:59,age:42,Notifications:{getEndTurnBlockingType:()=>o.blocker??0},
   UnitOperations:{canStartAny:()=>o.readyUnit??false},AgeProgressManager:{isAgeOver:o.ageOver??false,isExtendedGame:false}}};
 let data;try {data=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../civ7/end_turn.js'),'utf8'),context);}
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
