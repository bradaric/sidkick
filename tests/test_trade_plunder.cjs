const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const{test}=require('node:test');
function run(o={},script='plunder_trade_route.js'){
 const calls=[],unit={id:{owner:0,id:10,type:26},type:100,isOnMap:true,isCommanderUnit:false,isEmbarked:false,operationQueueSize:o.queued?1:0,location:{x:3,y:3},Movement:{movementMovesRemaining:o.spent?0:2},Combat:{isCombat:!o.civilian}};
 const ctx={queryArguments:{unit_id:10,expected_turn:62,unit_type:100,component_type:26,location:{x:3,y:3},before_moves:2,before_gold:1000},UI:{isInGame:()=>true},
 GameContext:{localPlayerID:0,hasSentTurnComplete:()=>Boolean(o.sent)},Players:{get:()=>({isTurnActive:!o.inactive,Units:{getUnits:()=>[unit]},Armies:{getUnitReinforcementCommanderId:()=>o.reinforcing?30:-1},Treasury:{goldBalance:o.loot?1040:1000},Diplomacy:{hasMet:()=>!o.unmet,isAtWarWith:()=>!o.peace}})},
 GameInfo:{Units:{lookup:()=>({Domain:'DOMAIN_LAND',FormationClass:'FORMATION_CLASS_LAND_COMBAT'})},UnitCommands:{lookup:()=>o.undefinedCommand?null:{CommandType:'UNITCOMMAND_PLUNDER_TRADE_ROUTE'}}},
 GameplayMap:{getGridWidth:()=>10,getGridHeight:()=>10,getRevealedState:()=>o.hidden?0:2,getOwner:()=>o.foreign?1:0},RevealedStates:{VISIBLE:2},MapUnits:{getUnits:()=>o.stacked?[unit.id,{owner:0,id:11,type:26}]:[unit.id]},
 Game:{turn:62,age:42,UnitCommands:{canStart:(id,command,args,exclusion)=>{calls.push({kind:'check',id,command,args,exclusion});if(o.changed)ctx.Game.turn++;return{Success:!o.blocked&&!o.spent,RequiresConfirmation:Boolean(o.confirm)};},sendRequest:(id,command,args)=>calls.push({kind:'send',id,command,args})}}};
 return JSON.parse(JSON.stringify({data:vm.runInNewContext(fs.readFileSync(`civ7/${script}`,'utf8'),ctx),calls}));
}
test('trade plunder is an installed fixed current-tile command, not the legacy road operation',()=>{
 const r=run();assert.equal(r.data.status,'submitted');assert.deepEqual(r.calls.at(-1),{kind:'send',id:{owner:0,id:10,type:26},command:'UNITCOMMAND_PLUNDER_TRADE_ROUTE',args:{X:-9999,Y:-9999,UnitAbilityType:-1}});
 assert.equal(run({spent:true,loot:true},'trade_plunder_state.js').data.plunderObserved,true);
 for(const o of [{spent:true},{loot:true},{spent:true,loot:true,hidden:true}])assert.equal(run(o,'trade_plunder_state.js').data.plunderObserved,false);
 for(const o of [{civilian:true},{queued:true},{reinforcing:true},{hidden:true},{stacked:true},{undefinedCommand:true},{blocked:true},{confirm:true},{changed:true},{foreign:true,peace:true},{foreign:true,unmet:true}]){const r=run(o);assert.equal(r.data.status,'rejected');assert.equal(r.calls.filter(c=>c.kind==='send').length,0);}
});
