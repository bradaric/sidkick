const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const{test}=require('node:test');
function run(o={},script='group_air_attack.js'){
 const calls=[],id=(owner,n,type=26)=>({owner,id:n,type}),base={id:id(0,30),type:300,isCommanderUnit:true,isSquadronCommander:true,isOnMap:true,operationQueueSize:0,location:{x:2,y:2},armyId:id(0,40,29),Movement:{movementMovesRemaining:8}};
  const plane=n=>({id:id(0,n),type:100,isOnMap:false,operationQueueSize:0,armyId:base.armyId,Health:{damage:0,maxDamage:100},location:{x:-9999,y:-9999},Movement:{movementMovesRemaining:8},Combat:{isCombat:true,canAttack:!o.spent||n===11,attacksRemaining:o.spent&&(n===10||o.allSpent)?0:1}}),planes=[plane(10),plane(11)];
 const enemy={id:id(1,20),type:200,isOnMap:true,isCommanderUnit:false,location:{x:3,y:3},Combat:{isCombat:true},Health:{damage:o.damaged?30:0,maxDamage:100}};
 const baseline=[{commanderId:30,commanderType:300,componentType:26,armyId:40,packedUnitIds:[10,11]}],participants=planes.map(p=>({unitId:p.id.id,componentType:26,unitType:100,attacks:1}));
 const owned=()=>[base,...planes.filter(p=>!o.lost||p.id.id!==10)];
 const ctx={queryArguments:{commander_id:30,mission:o.sweep?'sweep':o.bomb?'bomb':o.air?'air':'land',target_player:1,target_unit_id:20,district_id:99,x:3,y:3,expected_turn:62,
 source:{commanderId:30,commanderType:300,componentType:26,armyId:40,armyComponentType:29,location:{x:2,y:2},carrier:Boolean(o.carrier)},baseline_armies:baseline,participants,target_type:200,target_component_type:o.bomb?4:26,before_target_damage:0,
 ...(o.rural?{target_token:o.staleToken?'stale':JSON.stringify([{owner:1,instanceId:90,componentType:2,type:500,complete:true,damaged:false}]),baseline_constructibles:[{owner:1,instanceId:90,componentType:2,type:500,complete:true,damaged:false}]}:{})},
 UI:{isInGame:()=>true},GameContext:{localPlayerID:0,hasSentTurnComplete:()=>Boolean(o.sent)},Players:{get:()=>({isTurnActive:!o.inactive,Units:{getUnits:owned},Armies:{getUnitReinforcementCommanderId:()=>-1},Diplomacy:{hasMet:()=>!o.unmet,isAtWarWith:()=>!o.peace}})},
 Armies:{get:()=>({owner:0,localId:40,getCommanderId:()=>base.id,getUnitIds:()=>o.changedPacking?[]:owned().filter(u=>u!==base).map(u=>u.id)})},
 GameInfo:{TypeTags:[{Type:'UNIT_TEST',Tag:o.bomb?'UNIT_CLASS_BOMBER':o.fighters?'UNIT_CLASS_AIR_FIGHTER':'UNIT_CLASS_GROUND_ATTACKER'}],UnitCommands:{lookup:()=>o.undefinedCommand?null:{CommandType:o.sweep||o.air?'UNITCOMMAND_FOCUSED_ATTACK_AIR_TO_AIR':o.bomb?'UNITCOMMAND_FOCUSED_ATTACK_AIR_BOMB':'UNITCOMMAND_FOCUSED_ATTACK_AIR_TO_LAND'}},Units:{lookup:type=>({UnitType:type===300?(o.carrier?'UNIT_CARRIER_COMMANDER':'UNIT_SQUADRON_COMMANDER'):'UNIT_TEST',Domain:type===100||type===300||o.air?'DOMAIN_AIR':'DOMAIN_LAND',FormationClass:type===200&&!o.air?'FORMATION_CLASS_LAND_COMBAT':'FORMATION_CLASS_AIR'})}},
 GameplayMap:{getGridWidth:()=>10,getGridHeight:()=>10,getRevealedState:()=>o.hidden?0:2,getOwner:x=>o.bomb&&x===3?1:o.foreignTile?1:0,isWater:()=>Boolean(o.carrier&&!o.landCarrier),getIndexFromLocation:l=>l.x+l.y*10},RevealedStates:{VISIBLE:2},Visibility:{isVisible:()=>true},MapCities:{getDistrict:()=>o.district||o.bomb?id(1,99,4):null},MapUnits:{getUnits:()=>o.gone||o.bomb?[]:o.stacked?[enemy.id,id(1,21)]:[enemy.id]},Units:{get:()=>enemy},Districts:{get:()=>({id:id(1,99,4),owner:1,type:200,location:{x:3,y:3},getDamage:o.rural?0:o.damaged?30:0,getMaxDamage:o.rural?0:100})},
 MapConstructibles:{getConstructibles:()=>[id(1,90,2)]},Constructibles:{get:()=>({id:id(1,90,2),type:500,location:{x:3,y:3},complete:true,damaged:Boolean(o.damaged)})},
 Game:{turn:62,age:42,UnitCommands:{canStart:(id,command,args,exclusion)=>{calls.push({kind:'check',id,command,args,exclusion});if(o.changed)ctx.Game.turn++;return{Success:!o.blocked,RequiresConfirmation:Boolean(o.confirm),Plots:o.notOffered?[]:[33]};},sendRequest:(id,command,args)=>calls.push({kind:'send',id,command,args})}}};
  if(o.observe){
    ctx.queryArguments.observe_effects=true;let clock=1000,gone=false;ctx.Date={now:()=>clock};const listeners={};ctx.engine={on:(name,cb)=>{(listeners[name]??=[]).push(cb);return{clear:()=>{listeners[name]=listeners[name].filter(c=>c!==cb);}};}};
    ctx.GameplayMap.getPlotDistance=(x,y,a,b)=>Math.max(Math.abs(x-a),Math.abs(y-b));
    ctx.MapUnits.getUnits=(x,y)=>x===3&&y===3&&!o.bomb&&!gone?[enemy.id]:[];
    ctx.combatObserver=vm.runInNewContext(fs.readFileSync('civ7/combat_observation.js','utf8'),ctx);
    ctx.Game.UnitCommands.sendRequest=(id,command,args)=>{calls.push({kind:'send',id,command,args});
      for(const p of planes){p.Combat.attacksRemaining=0;for(const cb of listeners.Combat??[])cb({attacker:p.id,defender:enemy.id});}
      enemy.Health.damage=30;
      if(o.bomb)o.damaged=true;
      if(o.nativeKill){for(const cb of listeners.UnitKilledInCombat??[])cb({unitKiller:planes[1].id,unitKilled:enemy.id});gone=true;}
      if(!o.deferQuiet)clock+=600;
    };
  }
  const data=vm.runInNewContext(fs.readFileSync(`civ7/${script}`,'utf8'),ctx);let after=null;
  if(o.observe&&data.status==='submitted'){ctx.queryArguments=data.verificationArguments;after=vm.runInNewContext(fs.readFileSync('civ7/group_air_attack_state.js','utf8'),ctx);}
  return JSON.parse(JSON.stringify({data,calls,after}));
}
test('focused ground-attack mission binds role-eligible packed aircraft; fighter sweep is not an exact air-target attack',()=>{
 const r=run();assert.equal(r.data.status,'submitted');assert.equal(r.calls.at(-1).command,'UNITCOMMAND_FOCUSED_ATTACK_AIR_TO_LAND');assert.equal(r.data.before.participants.length,2);
 for(const o of [{fighters:true},{air:true},{hidden:true},{foreignTile:true},{district:true},{stacked:true},{blocked:true},{confirm:true},{changed:true},{changedPacking:true},{notOffered:true},{undefinedCommand:true},{carrier:true,landCarrier:true},{peace:true}]){const r=run(o);assert.equal(r.data.status,'rejected',JSON.stringify(o));assert.equal(r.calls.filter(c=>c.kind==='send').length,0);}
});
test('observed grouped air mission captures exact packed actors, visible deltas and bounded quiet readback',()=>{
 const r=run({observe:true});assert.equal(r.data.status,'submitted');assert.equal(r.data.expected.observationQuiescent,true);assert.equal(r.after.combatObservation.nativeCombats.length,2);assert.equal(r.after.observationQuiescent,true);assert.equal(r.after.combatObservation.units.find(u=>u.instanceId===20).damageDelta,30);
 const flight=run({observe:true,deferQuiet:true});assert.equal(flight.after.groupAirAttackObserved,true);assert.equal(flight.after.observationQuiescent,false);assert.equal(flight.after.combatObservation.closed,false);
 assert.equal(run({observe:true,nativeKill:true}).after.killConfirmed,true);
 for(const extra of [{sweep:true,fighters:true},{bomb:true},{bomb:true,rural:true}]){
  const r=run({observe:true,...extra});assert.equal(r.data.status,'submitted');assert.equal(r.after.observationQuiescent,true);assert.equal(r.after.basePreserved,true);assert.equal(r.after.killConfirmed,null,'unit kill evidence cannot be mistaken for district destruction or Sweep primary target');
 }
});

test('Fighter Sweep is a location mission and Carpet Bomb binds one exact visible enemy district',()=>{
 const sweep=run({sweep:true,fighters:true});assert.equal(sweep.data.status,'submitted');assert.equal(sweep.calls.at(-1).command,'UNITCOMMAND_FOCUSED_ATTACK_AIR_TO_AIR');
 assert.equal(run({sweep:true,fighters:true,spent:true},'group_air_attack_state.js').data.sweepObserved,true,'consumption verifies execution, never a kill/interception claim');
 const bomb=run({bomb:true});assert.equal(bomb.data.status,'submitted');assert.equal(bomb.calls.at(-1).command,'UNITCOMMAND_FOCUSED_ATTACK_AIR_BOMB');
 assert.equal(run({bomb:true,spent:true,damaged:true},'group_air_attack_state.js').data.groupAirAttackObserved,true);
 assert.equal(run({bomb:true,spent:true},'group_air_attack_state.js').data.groupAirAttackObserved,false);
 assert.equal(run({bomb:true,rural:true}).data.status,'submitted','zero-HP rural district requires exact intact constructible token');
 assert.equal(run({bomb:true,rural:true,spent:true,damaged:true},'group_air_attack_state.js').data.groupAirAttackObserved,true);
 assert.equal(run({bomb:true,rural:true,staleToken:true}).data.status,'rejected');
 for(const o of [{sweep:true},{sweep:true,fighters:true,hidden:true},{bomb:true,peace:true},{bomb:true,hidden:true}])assert.equal(run(o).data.status,'rejected');
});
test('focused air readback separates some/all captured aircraft consumption and exact surviving membership from target departure',()=>{
 const r=run({spent:true,damaged:true},'group_air_attack_state.js').data;assert.equal(r.groupAirAttackObserved,true);assert.equal(r.allParticipantsConsumed,false);
 assert.equal(run({spent:true,allSpent:true,damaged:true},'group_air_attack_state.js').data.allParticipantsConsumed,true);
 assert.equal(run({lost:true,damaged:true},'group_air_attack_state.js').data.groupAirAttackObserved,true);
 for(const o of [{spent:true},{damaged:true},{spent:true,damaged:true,changedPacking:true},{spent:true,damaged:true,hidden:true}])assert.equal(run(o,'group_air_attack_state.js').data.groupAirAttackObserved,false);
});
