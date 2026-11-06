const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const{test}=require('node:test');
function run(o={}){
 const calls=[],unit={id:{owner:0,id:10,type:26},type:100,isOnMap:true,isEmbarked:false,isCommanderUnit:false,operationQueueSize:0,location:{x:2,y:2},Movement:{movementMovesRemaining:2}};
 const city={id:{owner:0,id:7,type:1},population:5,pendingPopulation:0,Constructibles:{getIds:()=>[]}};
 const ctx={queryArguments:{unit_id:10,x:3,y:3,improvement:'IMPROVEMENT_TEST',expected_turn:62},UI:{isInGame:()=>true},GameContext:{localPlayerID:0,hasSentTurnComplete:()=>false},
 Players:{get:()=>({isTurnActive:true,Units:{getUnits:()=>[unit]},Cities:{getCities:()=>[city]},Armies:{getUnitReinforcementCommanderId:()=>o.reinforcing?30:-1}})},
 GameInfo:{Units:{lookup:()=>({UnitType:o.wrongRole?'UNIT_SCOUT':'UNIT_MIGRANT'})},Constructibles:{lookup:()=>({ConstructibleType:'IMPROVEMENT_TEST',ConstructibleClass:'IMPROVEMENT',$hash:200})}},
 GameplayMap:{getGridWidth:()=>10,getGridHeight:()=>10,getRevealedState:()=>o.hidden?0:2,getOwner:(x,y)=>x===2?0:o.foreign?1:-1,getIndexFromLocation:l=>l.x+l.y*10},RevealedStates:{VISIBLE:2},
 MapCities:{getCity:(x,y)=>x===2?city.id:null},MapConstructibles:{getConstructibles:()=>o.occupied?[{owner:0,id:9,type:2}]:[]},MapUnits:{getUnits:()=>[]},
 Game:{turn:62,age:42,UnitCommands:{canStart:(id,op,args,exclusion)=>{calls.push({kind:'check',id,op,args,exclusion});if(o.changed)ctx.Game.turn++;return{Success:!o.blocked,Plots:o.notOffered?[]:[33,33],ConstructibleTypes:[2],RequiresConfirmation:Boolean(o.confirm)};},sendRequest:(id,op,args)=>calls.push({kind:'send',id,op,args})}}};
 return JSON.parse(JSON.stringify({data:vm.runInNewContext(fs.readFileSync('civ7/resettle_migrant.js','utf8'),ctx),calls}));
}
test('Migrant resettlement binds explicit native expansion plot/improvement, even duplicate trailing plot metadata',()=>{
 const r=run();assert.equal(r.data.status,'submitted');assert.deepEqual(r.calls.at(-1),{kind:'send',id:{owner:0,id:10,type:26},op:'UNITCOMMAND_RESETTLE',args:{X:3,Y:3}});
 assert.equal(r.data.expected.resettleObserved,true);
 for(const o of[{wrongRole:true},{hidden:true},{foreign:true},{occupied:true},{reinforcing:true},{notOffered:true},{blocked:true},{confirm:true},{changed:true}]){const r=run(o);assert.equal(r.data.status,'rejected');assert.equal(r.calls.filter(c=>c.kind==='send').length,0);}
});
