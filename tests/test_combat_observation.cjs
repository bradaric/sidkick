const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const{test}=require('node:test');
function fixture(){
 const listeners={},id=(owner,n)=>({owner,id:n,type:26}),units=[{id:id(0,10),type:100,location:{x:2,y:3},Health:{damage:0,maxDamage:100}},{id:id(1,20),type:200,location:{x:3,y:3},Health:{damage:0,maxDamage:100}},{id:id(1,21),type:200,location:{x:4,y:3},Health:{damage:0,maxDamage:100}}],hidden=new Set(),reads=[];
 const ctx={Game:{turn:62,age:42},GameContext:{localPlayerID:0},Players:{get:()=>({Diplomacy:{hasMet:owner=>owner===1},Units:{getUnits:()=>units.filter(u=>u.id.owner===0)}})},
 GameplayMap:{getGridWidth:()=>10,getGridHeight:()=>10,getPlotDistance:(x,y,a,b)=>Math.max(Math.abs(x-a),Math.abs(y-b)),getRevealedState:(p,x,y)=>hidden.has(`${x},${y}`)?0:2},RevealedStates:{VISIBLE:2},
 MapUnits:{getUnits:(x,y)=>units.filter(u=>u.location.x===x&&u.location.y===y).map(u=>u.id)},Visibility:{isVisible:(p,id)=>id.id!==99},Units:{get:id=>{const u=units.find(u=>u.id.owner===id.owner&&u.id.id===id.id);assert.ok(!hidden.has(`${u.location.x},${u.location.y}`),'no hidden unit instance reads');reads.push(id.id);return u;}},
 engine:{on:(name,callback)=>{(listeners[name]??=[]).push(callback);return{clear:()=>{listeners[name]=listeners[name].filter(c=>c!==callback);}};}}};
 const api=vm.runInNewContext(fs.readFileSync('civ7/combat_observation.js','utf8'),ctx),baseline=api.capture(0,3,3,1,id(0,10));
 return{ctx,api,baseline,units,hidden,reads,emit:(name,data)=>{for(const cb of [...(listeners[name]??[])])cb(data);},listeners,id};
}
test('bounded combat observation records visible health deltas and confirms kills only from exact native attribution',()=>{
 const f=fixture(),token=f.api.start(0,f.id(0,10),f.baseline,15000);assert.equal(f.baseline.length,3);
 f.units[2].Health.damage=12;f.emit('Combat',{attacker:f.id(0,10),defender:f.id(1,20)});f.emit('UnitKilledInCombat',{unitKiller:f.id(0,10),unitKilled:f.id(1,20)});f.units.splice(1,1);
 const r=JSON.parse(JSON.stringify(f.api.read(token,true)));assert.equal(r.units.find(u=>u.instanceId===20).killConfirmed,true);assert.equal(r.units.find(u=>u.instanceId===21).damageDelta,12);assert.equal(r.nativeCombats.length,1);assert.equal(f.listeners.Combat.length,0);
});
test('departures, hidden units and unrelated events never turn into kill evidence or private reads',()=>{
 const f=fixture(),token=f.api.start(0,f.id(0,10),f.baseline,15000);f.units.splice(1,1);f.hidden.add('4,3');f.reads.length=0;
 f.emit('UnitKilledInCombat',{unitKiller:f.id(0,55),unitKilled:f.id(1,20)});f.emit('UnitKilledInCombat',{unitKiller:f.id(0,10),unitKilled:f.id(2,99)});
 const r=f.api.read(token,true);assert.equal(r.units.find(u=>u.instanceId===20).killConfirmed,null);assert.equal(r.units.find(u=>u.instanceId===21).status,'visibility_lost');assert.equal(f.reads.includes(21),false);assert.equal(JSON.stringify(r).includes('99'),false);
});
test('observers are replaced/closed and context changes fail closed',()=>{
 const f=fixture(),old=f.api.start(0,f.id(0,10),f.baseline,15000),next=f.api.start(0,f.id(0,10),f.baseline,15000);assert.notEqual(old,next);assert.equal(f.api.read(old).available,false);assert.equal(f.listeners.Combat.length,1);
 f.ctx.Game.turn++;assert.equal(f.api.read(next).available,false);assert.equal(f.listeners.Combat.length,0);
});
test('unmet/invisible identities never enter capture and observer overflow/expiry close native listeners',()=>{
 const f=fixture();f.units.push({id:f.id(2,99),type:200,location:{x:4,y:3},Health:{damage:0,maxDamage:100}});
 assert.equal(f.api.capture(0,3,3,1,f.id(0,10)).some(u=>u.instanceId===99),false);assert.equal(f.reads.includes(99),false);
 const token=f.api.start(0,f.id(0,10),f.baseline,15000);for(let n=0;n<70;n++)f.emit('Combat',{attacker:f.id(0,10),defender:f.id(1,20)});
 const r=f.api.read(token);assert.equal(r.overflow,true);assert.equal(r.nativeCombats.length,64);assert.equal(r.capturedSetFullyObserved,false);assert.equal(f.listeners.Combat.length,0);
 const next=f.api.start(0,f.id(0,10),f.baseline,15000);f.ctx.__sidkickCombatObservation.expires=0;assert.equal(f.api.read(next).closed,true);assert.equal(f.listeners.Combat.length,0);
});
test('one grouped action attributes events only to its captured list of local attackers',()=>{
 const f=fixture();f.units.push({id:f.id(0,11),type:100,location:{x:2,y:2},Health:{damage:0,maxDamage:100}});
 const actors=[f.id(0,10),f.id(0,11)],baseline=f.api.capture(0,3,3,1,actors),token=f.api.start(0,actors,baseline,15000);
 f.emit('UnitKilledInCombat',{unitKiller:f.id(0,11),unitKilled:f.id(1,20)});
 assert.equal(f.api.read(token,true).units.find(u=>u.instanceId===20).killConfirmed,true);
});
