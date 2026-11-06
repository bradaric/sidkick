const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const{test}=require('node:test');
function run(o={},script='declare_war.js'){
 const calls=[],local={isTurnActive:!o.inactive,Diplomacy:{hasMet:()=>!o.unmet,isAtWarWith:()=>Boolean(o.atWar),canDeclareWarOn:(...args)=>{calls.push({kind:'warcheck',args});return{Success:!o.blockedWar};}}};
 const ctx={queryArguments:{target_player_id:3,war_type:o.formal?'formal':'surprise',expected_turn:62},UI:{isInGame:()=>true},GameContext:{localPlayerID:0,hasSentTurnComplete:()=>Boolean(o.sent)},
 Players:{get:id=>id===0?local:{isMajor:!o.minor,Diplomacy:{isAtWarWith:()=>Boolean(o.atWar)}}},WarTypes:{FORMAL_WAR:2},DiplomacyActionTypes:{DIPLOMACY_ACTION_DECLARE_WAR:100,DIPLOMACY_ACTION_DECLARE_FORMAL_WAR:200},PlayerOperationTypes:{DECLARE_WAR:10},
 Game:{turn:62,age:42,PlayerOperations:{canStart:(id,op,args,exclusion)=>{calls.push({kind:'check',id,op,args,exclusion});if(o.changed)ctx.Game.turn++;return{Success:!o.blocked,RequiresConfirmation:Boolean(o.confirm)};},
 sendRequest:(id,op,args)=>{calls.push({kind:'send',id,op,args});if(o.sendThrows)throw Error('Lost acknowledgement');}}}};
 let data;try{data=vm.runInNewContext(fs.readFileSync(`civ7/${script}`,'utf8'),ctx);}catch(e){if(!o.sendThrows)throw e;data={error:e.message};}return JSON.parse(JSON.stringify({data,calls}));
}
test('war declaration is an explicit fixed native surprise/formal operation with exact met major target',()=>{
 for(const formal of [false,true]){const r=run({formal});assert.equal(r.data.status,'submitted');assert.deepEqual(r.calls.at(-1),{kind:'send',id:0,op:10,args:{Player1:0,Player2:3,Type:formal?200:100}});}
 assert.equal(run({atWar:true}).data.status,'already_active');
 assert.equal(run({atWar:true},'war_state.js').data.atWar,true);assert.equal(run({},'war_state.js').data.atWar,false);
 for(const o of [{unmet:true},{minor:true},{inactive:true},{sent:true},{blockedWar:true},{blocked:true},{confirm:true},{changed:true}]){const r=run(o);assert.equal(r.data.status,'rejected');assert.equal(r.calls.filter(c=>c.kind==='send').length,0);}
 assert.equal(run({sendThrows:true}).calls.filter(c=>c.kind==='send').length,1);
});
