const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const{test}=require('node:test');
function run(o={},script='assault_city.js'){
  const calls=[],id=(owner,n,type)=>({owner,id:n,type}),unit={id:id(0,10,26),type:100,isCommanderUnit:false,isOnMap:true,isEmbarked:false,operationQueueSize:0,Health:{damage:0,maxDamage:100},location:o.captured?{x:3,y:3}:{x:2,y:3},Movement:{movementMovesRemaining:o.spent?0:3},Combat:{isCombat:true,canAttack:!o.spent,attacksRemaining:o.spent?0:1}};
 const oldCity={id:id(0,7,1),location:{x:1,y:1}},city={id:id(o.captured||o.choice?0:1,40,1),owner:o.captured||o.choice?0:1,location:{x:3,y:3},isJustConqueredFrom:!o.resolved,isBeingRazed:Boolean(o.razed)},district={id:id(1,50,4),owner:1,type:500,location:{x:3,y:3},getDamage:o.damaged?40:0,getMaxDamage:100};
 const ctx={queryArguments:{unit_id:10,target_player:1,target_city_id:40,x:3,y:3,expected_turn:62,mode:o.occupy?'occupy':'melee',unit_type:100,component_type:26,before_attacks:1,before_moves:3,
 baseline_cities:[oldCity.id],district_id:district.id,district_type:500,before_district_damage:0,city_id:40,city_component_type:1,location:{x:3,y:3},choice:o.raze?'raze':'keep',...o.args},
 UI:{isInGame:()=>true},GameContext:{localPlayerID:0,hasSentTurnComplete:()=>Boolean(o.sent)},Locale:{compose:s=>s},
 Players:{get:()=>({isTurnActive:!o.inactive,Diplomacy:{hasMet:()=>!o.unmet,isAtWarWith:()=>!o.peace},Units:{getUnits:()=>[unit]},Cities:{getCities:()=>[oldCity,...(o.captured||o.choice?[city]:[])]},Armies:{getUnitReinforcementCommanderId:()=>o.reinforcing?30:-1}})},
 GameInfo:{Units:{lookup:()=>({UnitType:'UNIT_RIFLEMAN',Domain:o.sea?'DOMAIN_SEA':'DOMAIN_LAND',FormationClass:'FORMATION_CLASS_LAND_COMBAT'})}},
 GameplayMap:{getGridWidth:()=>10,getGridHeight:()=>10,getRevealedState:()=>o.hidden?0:2,getOwner:()=>city.owner,isWater:()=>false,getIndexFromLocation:l=>l.x+l.y*10,getPlotDistance:()=>o.distant?2:1},RevealedStates:{VISIBLE:2},
 MapCities:{getCity:()=>city.id,getDistrict:()=>district.id},Cities:{get:()=>city},Districts:{get:()=>district},MapUnits:{getUnits:()=>o.occupied?[id(1,20,26)]:[]},Visibility:{isVisible:()=>true},
 Units:{getReachableTargets:()=>o.notOffered?[]:[33],getReachableMovement:()=>o.notOffered?[]:[33],getPathTo:()=>({plots:[32,33],turns:[1,1]})},
 UnitOperationMoveModifiers:{NONE:0,ATTACK:1},UnitOperationTypes:{MOVE_TO:900},CombatTypes:{COMBAT_MELEE:1,NO_COMBAT:-1},CityCommandTypes:{DESTROY:10},
 Game:{turn:62,age:42,Combat:{getDefensibleDistrict:()=>district.id,testAttackInto:()=>o.occupy?-1:1},UnitOperations:{canStart:(id,op,args,exclusion)=>{calls.push({kind:'check',id,op,args,exclusion});if(o.changed)ctx.Game.turn++;return{Success:!o.blocked,RequiresConfirmation:Boolean(o.confirm)};},sendRequest:(id,op,args)=>calls.push({kind:'send',id,op,args})},CityCommands:{canStart:(id,op,args,exclusion)=>{calls.push({kind:'check',id,op,args,exclusion});if(o.changed)ctx.Game.turn++;return{Success:!o.blocked,RequiresConfirmation:Boolean(o.confirm)};},sendRequest:(id,op,args)=>calls.push({kind:'send',id,op,args})}}};
  if(o.observe){
    ctx.queryArguments.observe_effects=true;let clock=1000;ctx.Date={now:()=>clock};const listeners={};ctx.engine={on:(name,cb)=>{(listeners[name]??=[]).push(cb);return{clear:()=>{listeners[name]=listeners[name].filter(c=>c!==cb);}};}};
    ctx.combatObserver=vm.runInNewContext(fs.readFileSync('civ7/combat_observation.js','utf8'),ctx);
    ctx.Game.UnitOperations.sendRequest=(id,op,args)=>{calls.push({kind:'send',id,op,args});unit.Movement.movementMovesRemaining=0;unit.Combat.attacksRemaining=0;unit.Health.damage=7;
      if(o.appliesCapture){o.captured=true;city.owner=0;city.id.owner=0;unit.location={x:3,y:3};}else district.getDamage=30;
      if(!o.deferQuiet)clock+=600;
    };
  }
  const data=vm.runInNewContext(fs.readFileSync(`civ7/${script}`,'utf8'),ctx);let after=null;if(o.observe&&data.status==='submitted'){ctx.queryArguments=data.verificationArguments;after=vm.runInNewContext(fs.readFileSync('civ7/city_assault_state.js','utf8'),ctx);}
  return JSON.parse(JSON.stringify({data,calls,after}));
}
test('explicit city melee/occupation binds centre identity and native adjacent target permission',()=>{
 for(const occupy of [false,true]){const r=run({occupy});assert.equal(r.data.status,'submitted');assert.equal(r.calls.at(-1).args.Modifiers,occupy?0:1);}
 assert.equal(run({spent:true,damaged:true},'city_assault_state.js').data.assaultObserved,true);
 assert.equal(run({spent:true,captured:true},'city_assault_state.js').data.captured,true);
 assert.equal(run({spent:true},'city_assault_state.js').data.assaultObserved,false);
 for(const o of [{hidden:true},{peace:true},{unmet:true},{distant:true},{sea:true},{reinforcing:true},{notOffered:true},{blocked:true},{confirm:true},{changed:true}]){const r=run(o);assert.equal(r.data.status,'rejected');assert.equal(r.calls.filter(c=>c.kind==='send').length,0);}
 assert.equal(run({occupy:true,occupied:true}).data.status,'rejected');
});
test('observed assault/capture waits for bounded visible health readback without choosing keep/raze',()=>{
 for(const appliesCapture of [false,true]){const r=run({observe:true,appliesCapture});assert.equal(r.data.status,'submitted');assert.equal(r.after.assaultObserved,true);assert.equal(r.after.observationQuiescent,true);assert.equal(r.after.combatObservation.units[0].damageDelta,7);assert.equal(r.calls.filter(c=>c.kind==='send').length,1);if(appliesCapture)assert.equal(r.after.newCity.captureChoicePending,true);}
 assert.equal(run({observe:true,deferQuiet:true}).after.observationQuiescent,false);
});
test('keep/raze is a separate pending owned-city decision using exact native Directive',()=>{
 for(const raze of [false,true]){const r=run({choice:true,raze},'resolve_city_capture.js');assert.equal(r.data.status,'submitted');assert.equal(r.calls.at(-1).args.Directive,raze?3:2);}
 assert.equal(run({choice:true,resolved:true},'city_capture_state.js').data.captureChoiceObserved,true);
 assert.equal(run({choice:true,raze:true,razed:true},'city_capture_state.js').data.captureChoiceObserved,true);
 for(const o of [{hidden:true},{resolved:true},{razed:true},{blocked:true},{confirm:true},{changed:true}]){const r=run({choice:true,...o},'resolve_city_capture.js');assert.equal(r.data.status,'rejected');assert.equal(r.calls.filter(c=>c.kind==='send').length,0);}
});
