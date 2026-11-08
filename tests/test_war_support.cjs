const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const{test}=require('node:test');
function run(o={},script='support_war.js'){
 const calls=[],event={uniqueID:78,initialPlayer:o.defending?4:0,targetPlayer:o.defending?0:4,actionType:100,actionTypeName:'DIPLOMACY_ACTION_DECLARE_WAR',hidden:Boolean(o.hidden),revealed:!o.hidden,failed:false,gameTurnStart:62,gameTurnEnd:-1},baseline=[{playerId:0,support:0,oppose:0},{playerId:4,support:0,oppose:0}],expected=baseline.map(p=>({...p,...(p.playerId===0?o.defending?{oppose:1}:{support:1}:{})}));
 const ctx={queryArguments:{event_id:78,target_player_id:4,max_influence_cost:o.cap??180,expected_turn:62,action_type:100,initial:!o.defending,before_gold:1000,expected_influence:320,expected_support:expected},UI:{isInGame:()=>true},GameContext:{localPlayerID:0,hasSentTurnComplete:()=>false},
 Players:{getAliveIds:()=>[0,4,9],get:id=>id===0?{isTurnActive:true,Treasury:{goldBalance:1000},DiplomacyTreasury:{diplomacyBalance:o.applied?320:500},Diplomacy:{hasMet:id=>id===4,isAtWarWith:()=>!o.peace}}:{isMajor:true}},
 GameInfo:{DiplomacyActions:{lookup:()=>({$hash:100,DiplomacyActionType:event.actionTypeName})}},PlayerOperationTypes:{SUPPORT_DIPLOMATIC_ACTION:900},DiplomacyTokenTypes:{DIPLOMACY_TOKEN_GLOBAL:200},
 Game:{turn:62,age:42,Diplomacy:{getPlayerEvents:()=>o.missing?[]:[event],isProjectCanceled:()=>false,getInfluenceForNextSupport:()=>180,getNumSupportEnvoysForPlayer:(id,p)=>{assert.notEqual(p,9,'never read unmet war supporters');return o.applied&&p===0&&!o.defending?1:o.otherChanged&&p===4?1:0;},getNumOpposeEnvoysForPlayer:(id,p)=>{assert.notEqual(p,9);return o.applied&&p===0&&o.defending?1:0;}},PlayerOperations:{canStart:(id,operation,args,exclusion)=>{calls.push({kind:'check',id,operation,args,exclusion});if(o.changed)ctx.Game.turn++;return{Success:!o.blocked,RequiresConfirmation:Boolean(o.confirm)};},sendRequest:(id,operation,args)=>{calls.push({kind:'send',id,operation,args});if(o.throws)throw Error('Lost acknowledgement');}}}};
 let data;try{data=vm.runInNewContext(fs.readFileSync(`civ7/${script}`,'utf8'),ctx);}catch(e){if(!o.throws)throw e;data={error:e.message};}return JSON.parse(JSON.stringify({data,calls}));
}
test('own-war support uses exact native side and one runtime-priced support token, never third-party war backing',()=>{
 for(const defending of [false,true]){const r=run({defending});assert.equal(r.data.status,'submitted');assert.deepEqual(r.calls.at(-1),{kind:'send',id:0,operation:900,args:{ID:78,Type:200,Amount:1,SubType:!defending}});assert.equal(r.data.quotedInfluenceCost,180);}
 for(const o of [{cap:179},{hidden:true},{peace:true},{blocked:true},{confirm:true},{changed:true},{missing:true}]){const r=run(o);assert.equal(r.data.status,'rejected');assert.equal(r.calls.some(c=>c.kind==='send'),false);}
 assert.equal(run({throws:true}).calls.filter(c=>c.kind==='send').length,1);
});
test('war support readback requires exact own decrement in Influence, chosen-side token increment and all captured known counts unchanged',()=>{
 for(const defending of [false,true])assert.equal(run({defending,applied:true},'war_support_state.js').data.warSupportApplied,true);
 for(const o of [{applied:false},{applied:true,otherChanged:true},{applied:true,peace:true}])assert.equal(run(o,'war_support_state.js').data.warSupportApplied,false);
});
