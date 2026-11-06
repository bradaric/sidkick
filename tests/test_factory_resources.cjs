const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const{test}=require('node:test');
function run(o={},script='clear_factory_resources.js'){
 const calls=[],resource=(value,type)=>({value,isOffMap:false,uniqueResource:{resource:type}}),a=resource(10,100),b=resource(11,200),owned=[a,b];
 const city={id:{owner:0,id:7,type:1},name:'Home',Resources:{getAssignedResources:()=>o.applied?[]:[a],getFactoryResource:()=>100,getNumFactoryResources:()=>o.applied?0:1,isTreasureConstructiblePrereqMet:()=>!o.noFactory}};
 const other={id:{owner:0,id:8,type:1},name:'Other',Resources:{getAssignedResources:()=>o.changedOther?[]:[b]}};
 const baseline={owned:[{instance:10,offMap:false,type:100},{instance:11,offMap:false,type:200}],cities:[{cityId:7,componentType:1,resources:[{instance:10,offMap:false,type:100}]},{cityId:8,componentType:1,resources:[{instance:11,offMap:false,type:200}]}]};
 const ctx={queryArguments:{settlement:'Home',resource:'RESOURCE_FACTORY',target_token:'{"resourceType":"RESOURCE_FACTORY","count":1,"resources":[{"instance":10,"offMap":false}]}',expected_turn:62,
 city_id:7,city_component_type:1,baseline,expected_ledger:{...baseline,cities:[{...baseline.cities[0],resources:[]},baseline.cities[1]]}},
 UI:{isInGame:()=>true},Locale:{compose:s=>s},GameContext:{localPlayerID:0,hasSentTurnComplete:()=>false},
 Players:{get:()=>({isTurnActive:true,Cities:{getCities:()=>[city,other]},Resources:{getResources:()=>o.lostResource?[b]:owned,isResourceAssignmentLocked:()=>Boolean(o.locked)}})},
 GameInfo:{Ages:{lookup:()=>({AgeType:o.earlier?'AGE_ANTIQUITY':'AGE_MODERN'})},Resources:{lookup:n=>n===100||n==='RESOURCE_FACTORY'?{ResourceType:'RESOURCE_FACTORY',ResourceClassType:'RESOURCECLASS_FACTORY',$hash:100}:{ResourceType:'RESOURCE_OTHER',ResourceClassType:'RESOURCECLASS_CITY',$hash:200}}},
 PlayerOperationTypes:{ASSIGN_RESOURCE:10},PlayerOperationParameters:{Clear:2},Game:{turn:62,age:42,PlayerOperations:{canStart:(id,op,args,exclusion)=>{calls.push({kind:'check',id,op,args,exclusion});if(o.changed)ctx.Game.turn++;return{Success:!o.blocked,RequiresConfirmation:Boolean(o.confirm)};},sendRequest:(id,op,args)=>calls.push({kind:'send',id,op,args})}}};
 return JSON.parse(JSON.stringify({data:vm.runInNewContext(fs.readFileSync(`civ7/${script}`,'utf8'),ctx),calls}));
}
test('factory reset binds exact selected factory type and token and uses one native bulk Clear',()=>{
 const r=run();assert.equal(r.data.status,'submitted');assert.deepEqual(r.calls.at(-1),{kind:'send',id:0,op:10,args:{ResourceType:100,City:7,Action:2}});
 assert.equal(run({applied:true},'factory_resource_state.js').data.factoryClearObserved,true);
 for(const o of [{applied:true,changedOther:true},{applied:true,lostResource:true},{}])assert.equal(run(o,'factory_resource_state.js').data.factoryClearObserved,false);
 for(const o of [{earlier:true},{noFactory:true},{locked:true},{changed:true},{blocked:true},{confirm:true}]){const r=run(o);assert.equal(r.data.status,'rejected');assert.equal(r.calls.filter(c=>c.kind==='send').length,0);}
});
