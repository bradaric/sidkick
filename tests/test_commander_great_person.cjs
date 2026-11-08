const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const{test}=require('node:test');
const quote='Activate on an Army Commander to grant it enough experience for 5 [icon:NAR_REW_PROMOTION] Promotions.';
function run(o={},script='activate_commander_great_person.js'){
 const calls=[],id=n=>({owner:0,id:n,type:26}),gp={id:id(10),type:100,isOnMap:true,isEmbarked:false,isCommanderUnit:false,operationQueueSize:0,location:{x:3,y:3},Movement:{movementMovesRemaining:2},Health:{damage:0,maxDamage:100}},
 commanders=[30,40].map(n=>({id:id(n),type:300,isOnMap:true,isEmbarked:false,isCommanderUnit:true,isArmyCommander:true,operationQueueSize:0,location:n===30||o.ambiguous?{x:3,y:3}:{x:5,y:5},armyId:{owner:0,id:n,type:29},Health:{damage:0,maxDamage:100},Experience:{getLevel:n===30&&o.applied?5:0,getStoredPromotionPoints:n===30&&o.applied?5:0,experiencePoints:o.partialXP?1:0}})),units=[...(o.applied?[]:[gp]),...commanders],baseline=[{instanceId:10,componentType:26,unitType:100},...commanders.map(c=>({instanceId:c.id.id,componentType:26,unitType:300}))],armies=commanders.map(c=>({commanderId:c.id.id,componentType:26,unitType:300,armyId:c.id.id,packedUnitIds:[]}));
 const ctx={queryArguments:{unit_id:10,commander_id:30,expected_turn:62,unit_type:100,component_type:26,commander_type:300,commander_component_type:26,before_level:0,before_points:0,before_damage:0,before_gold:1000,before_influence:500,location:{x:3,y:3},baseline_units:baseline,baseline_armies:armies},UI:{isInGame:()=>true},GameContext:{localPlayerID:0,hasSentTurnComplete:()=>false},
 Players:{get:()=>({isTurnActive:true,Units:{getUnits:()=>o.lostOther?units.filter(u=>u.id.id!==40):units},Armies:{getUnitReinforcementCommanderId:()=>-1},Treasury:{goldBalance:1000},DiplomacyTreasury:{diplomacyBalance:500}})},
 GameInfo:{GreatPersonIndividuals:{lookup:()=>({UnitType:o.heal?'UNIT_REVOLUCIONARIO_MORELOS':'UNIT_REVOLUCIONARIO_SANTA_ANNA',ActionCharges:1,ActionRequiresOnUnitType:'UNIT_ARMY_COMMANDER',ActionRequiresGoldCost:o.paidDefinition?100:null,ActionRequiresInfluenceCost:null,ScaleGoldCostByActivation:false,ScaleGoldCostByRelationship:false,ScaleInfluenceCostByRelationship:false})},Units:{lookup:type=>({UnitType:type===100?o.placeholder?'UNIT_GREAT_MERCHANT':o.heal?'UNIT_REVOLUCIONARIO_MORELOS':'UNIT_REVOLUCIONARIO_SANTA_ANNA':'UNIT_ARMY_COMMANDER',Domain:'DOMAIN_LAND'})},UnitCommands:{lookup:()=>({CommandType:'UNITCOMMAND_ACTIVATE_GREAT_PERSON',$hash:900})}},
 Armies:{get:a=>({owner:0,localId:a.id,getCommanderId:()=>id(a.id),getUnitIds:()=>o.packedHeal&&a.id===30?[id(20)]:[]})},GameplayMap:{getGridWidth:()=>10,getGridHeight:()=>10,getIndexFromLocation:l=>l.x+l.y*10,getRevealedState:()=>o.hidden?0:2,getOwner:()=>0,isWater:()=>false},RevealedStates:{VISIBLE:2},MapUnits:{getUnits:()=>[gp.id,commanders[0].id,...(o.ambiguous?[commanders[1].id]:[])]},
 Game:{turn:62,age:42,UnitCommands:{canStart:(id,command,args,exclusion)=>{calls.push({kind:'check',id,command,args,exclusion});if(o.changed)ctx.Game.turn++;return{Success:!o.blocked,RequiresConfirmation:Boolean(o.confirm),Cost:o.paid?10:undefined,AdditionalDescription:[o.wrongQuote?'Unknown bonus':o.heal?'Activate on an Army Commander to [icon:Action_Heal] Heal all Units in the Command Radius to full.':quote]};},sendRequest:(id,command,args)=>calls.push({kind:'send',id,command,args})}}};
 if(o.heal){
  ctx.queryArguments.effect='heal';ctx.queryArguments.before_xp=0;commanders[0].Experience.getLevel=0;commanders[0].Experience.getStoredPromotionPoints=0;
  const inside={id:id(20),type:400,isOnMap:!o.packedHeal,operationQueueSize:0,location:o.packedHeal?{x:-9999,y:-9999}:{x:3,y:4},Health:{damage:o.applied||o.noDamage?0:14,maxDamage:100}},outside={id:id(21),type:400,isOnMap:true,operationQueueSize:0,location:{x:5,y:4},Health:{damage:o.outsideDamage??(o.outsideChanged?0:15),maxDamage:100}};
  units.push(inside,outside);baseline.push({instanceId:20,componentType:26,unitType:400},{instanceId:21,componentType:26,unitType:400});baseline.sort((a,b)=>a.instanceId-b.instanceId);if(o.packedHeal)armies[0].packedUnitIds=[20];
  ctx.Units={getCommandRadiusPlots:()=>[33,43]};ctx.queryArguments.baseline_health=[gp,...commanders,inside,outside].map(u=>({instanceId:u.id.id,componentType:26,unitType:u.type,damage:u.id.id===20?14:u.id.id===21?15:0,maxDamage:100,heal:[10,30,20].includes(u.id.id)})).sort((a,b)=>a.instanceId-b.instanceId);
 }
 if(o.combatGold){
  ctx.queryArguments.effect='combat_gold';ctx.queryArguments.before_xp=0;ctx.queryArguments.baseline_abilities=[7];
  commanders[0].Experience.getLevel=0;commanders[0].Experience.getStoredPromotionPoints=0;
  commanders[0].getAbilities=()=>o.applied?[...(o.lostAbility?[]:[7]),99,...(o.extraAbility?[88]:[])]:o.alreadyAbility?[7,99]:[7];
  ctx.GameInfo.Units.lookup=type=>({UnitType:type===100?'UNIT_REVOLUCIONARIO_VILLA':'UNIT_ARMY_COMMANDER',Domain:'DOMAIN_LAND'});
  ctx.GameInfo.GreatPersonIndividuals.lookup=()=>({UnitType:'UNIT_REVOLUCIONARIO_VILLA',ActionCharges:1,ActionRequiresOnUnitType:'UNIT_ARMY_COMMANDER',ActionRequiresGoldCost:null,ActionRequiresInfluenceCost:null,ScaleGoldCostByActivation:false,ScaleGoldCostByRelationship:false,ScaleInfluenceCostByRelationship:false});
  ctx.GameInfo.UnitAbilities={lookup:()=>({UnitAbilityType:'ABILITY_VILLA',$hash:99})};
  const canStart=ctx.Game.UnitCommands.canStart;ctx.Game.UnitCommands.canStart=(...args)=>({...canStart(...args),AdditionalDescription:['Activate on an Army Commander. When a Unit within this Commander’s Command Radius defeats an enemy Unit, gain[icon:YIELD_GOLD] Gold equal to 25% of its Combat Strength.']});
 }
 return JSON.parse(JSON.stringify({data:vm.runInNewContext(fs.readFileSync(`civ7/${script}`,'utf8'),ctx),calls}));
}
test('concrete Santa Anna activation binds one exact co-located Army Commander and native five-promotion quote',()=>{
 const r=run();assert.equal(r.data.status,'submitted');assert.deepEqual(r.calls.at(-1),{kind:'send',id:{owner:0,id:10,type:26},command:'UNITCOMMAND_ACTIVATE_GREAT_PERSON',args:{X:3,Y:3,UnitAbilityType:-1}});
 for(const o of [{placeholder:true},{ambiguous:true},{hidden:true},{partialXP:true},{blocked:true},{confirm:true},{paid:true},{paidDefinition:true},{wrongQuote:true},{changed:true}]){const r=run(o);assert.equal(r.data.status,'rejected',JSON.stringify(o));assert.equal(r.calls.some(c=>c.kind==='send'),false);}
});
test('Great Person effect readback requires source retirement, five actual levels/points and preserved local inventory/armies/balances',()=>{
 assert.equal(run({applied:true},'commander_great_person_state.js').data.greatPersonEffectObserved,true);
 for(const o of [{applied:false},{applied:true,lostOther:true},{applied:true,partialXP:true}])assert.equal(run(o,'commander_great_person_state.js').data.greatPersonEffectObserved,false);
});
test('Morelos captures primary radius including packed units and separately reports wider native healing, never unexpected damage',()=>{
 for(const packedHeal of [false,true]){const r=run({heal:true,packedHeal});assert.equal(r.data.status,'submitted');assert.equal(r.data.verificationArguments.effect,'heal');assert.equal(r.data.verificationArguments.baseline_health.find(u=>u.instanceId===20).heal,true);assert.equal(r.data.verificationArguments.baseline_health.find(u=>u.instanceId===21).heal,false);
  const after=run({heal:true,packedHeal,applied:true},'commander_great_person_state.js').data;assert.equal(after.greatPersonEffectObserved,true);assert.deepEqual(after.healedUnitIds,[20]);
 }
 assert.equal(run({heal:true,noDamage:true}).data.status,'rejected','do not retire healer when no captured radius unit needs healing');
 const wider=run({heal:true,applied:true,outsideChanged:true},'commander_great_person_state.js').data;
 assert.equal(wider.greatPersonEffectObserved,true);assert.deepEqual(wider.additionalHealedUnitIds,[21]);assert.deepEqual(wider.healthMismatches,[]);
 for(const outsideDamage of [16,-1,8]){
  const mismatch=run({heal:true,applied:true,outsideDamage},'commander_great_person_state.js').data;
  assert.equal(mismatch.greatPersonEffectObserved,false);assert.deepEqual(mismatch.healthMismatches,[{unitId:21,expectedDamage:15,damage:outsideDamage}]);
 }
});
test('Villa grants only the exact native Commander ability without implying combat payouts',()=>{
 const r=run({combatGold:true});assert.equal(r.data.status,'submitted');assert.deepEqual(r.data.verificationArguments.baseline_abilities,[7]);
 assert.equal(run({combatGold:true,alreadyAbility:true}).data.status,'rejected','never retire a duplicate ability source');
 const after=run({combatGold:true,applied:true},'commander_great_person_state.js').data;assert.equal(after.greatPersonEffectObserved,true);assert.deepEqual(after.commanderAbilities,[7,99]);
 for(const extra of [{lostAbility:true},{extraAbility:true}])assert.equal(run({combatGold:true,applied:true,...extra},'commander_great_person_state.js').data.greatPersonEffectObserved,false);
});
