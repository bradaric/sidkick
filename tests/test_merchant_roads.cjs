const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const{test}=require('node:test');
function run(o={},script='connect_merchant_road.js'){
 const calls=[],unit={id:{owner:0,id:10,type:26},type:100,isOnMap:true,isEmbarked:false,isCommanderUnit:false,operationQueueSize:0,location:{x:2,y:2},Movement:{movementMovesRemaining:3}};
 const cities=[{id:{owner:0,id:7,type:1},location:{x:2,y:2}},{id:{owner:0,id:8,type:1},location:{x:4,y:4}}];
 for(const c of cities)c.getConnectedCities=()=>o.applied||o.connected?[cities.find(d=>d!==c).id]:[];
 const ctx={queryArguments:{unit_id:10,target_city_id:8,expected_turn:62,unit_type:100,component_type:26,source_city_id:7,source_component_type:1,target_component_type:1,source_location:{x:2,y:2},target_location:{x:4,y:4},before_moves:3,source_connections:[],target_connections:[]},
 UI:{isInGame:()=>true},GameContext:{localPlayerID:0,hasSentTurnComplete:()=>false},Players:{get:()=>({isTurnActive:true,Units:{getUnits:()=>o.applied?[]:[unit]},Cities:{getCities:()=>cities},Armies:{getUnitReinforcementCommanderId:()=>o.reinforcing?30:-1}})},
 GameInfo:{Units:{lookup:()=>({UnitType:o.wrongRole?'UNIT_SCOUT':'UNIT_MERCHANT'})}},MapCities:{getCity:()=>cities[0].id},
 GameplayMap:{getGridWidth:()=>10,getGridHeight:()=>10,getRevealedState:()=>o.hidden?0:2,getOwner:()=>o.foreign?1:0,getIndexFromLocation:l=>l.x+l.y*10},RevealedStates:{VISIBLE:2},
 Game:{turn:62,age:42,UnitCommands:{canStart:(id,op,args,exclusion)=>{calls.push({kind:'check',id,op,args,exclusion});if(o.changed)ctx.Game.turn++;return{Success:!o.blocked,Plots:o.notOffered?[]:[44],RequiresConfirmation:Boolean(o.confirm)};},sendRequest:(id,op,args)=>calls.push({kind:'send',id,op,args})}}};
 return JSON.parse(JSON.stringify({data:vm.runInNewContext(fs.readFileSync(`civ7/${script}`,'utf8'),ctx),calls}));
}
test('Merchant road binds visible owned endpoints and exact native destination, never a movement fallback',()=>{
 const r=run();assert.equal(r.data.status,'submitted');assert.deepEqual(r.calls.at(-1),{kind:'send',id:{owner:0,id:10,type:26},op:'UNITCOMMAND_CONNECT_WITH_ROAD',args:{X:4,Y:4}});
 assert.equal(run({applied:true},'merchant_road_state.js').data.roadConnectionObserved,true);
 assert.equal(run({},'merchant_road_state.js').data.roadConnectionObserved,false);
 for(const o of[{wrongRole:true},{hidden:true},{foreign:true},{reinforcing:true},{notOffered:true},{blocked:true},{confirm:true},{changed:true},{connected:true}]){const r=run(o);assert.equal(r.data.status,'rejected');assert.equal(r.calls.filter(c=>c.kind==='send').length,0);}
});
