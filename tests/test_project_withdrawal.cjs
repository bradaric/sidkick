const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const{test}=require('node:test');
function run(o={},script='withdraw_project_support.js'){
 const calls=[],event={uniqueID:80,initialPlayer:o.foreign?1:0,targetPlayer:4,actionType:100,actionTypeName:o.war?'DIPLOMACY_ACTION_DECLARE_WAR':'DIPLOMACY_ACTION_ESPIONAGE_MILITARY_INFILTRATION',gameTurnStart:62,gameTurnEnd:-1,failed:false};
 const ctx={queryArguments:{event_id:80,target_player_id:4,expected_turn:62,action_type:100,before_gold:1000,before_influence:100},UI:{isInGame:()=>true},GameContext:{localPlayerID:0,hasSentTurnComplete:()=>false},
 Players:{get:()=>({isTurnActive:true,Diplomacy:{hasMet:()=>!o.unmet},Treasury:{goldBalance:o.debit?999:1000},DiplomacyTreasury:{diplomacyBalance:100}})},
 GameInfo:{DiplomacyActions:{lookup:()=>({DiplomacyActionType:event.actionTypeName,$hash:100,CancelPenalty:o.penalty?10:0,UnsupportPenalty:0})}},
 PlayerOperationTypes:{UNSUPPORT_DIPLOMATIC_ACTION:900},DiplomacyTokenTypes:{DIPLOMACY_TOKEN_GLOBAL:200},Game:{turn:62,age:42,Diplomacy:{getPlayerEvents:()=>o.canceled?[]:[event],getNumSupportEnvoysForPlayer:()=>o.withdrawn?0:o.multiple?2:1,getSupportingPlayers:()=>o.otherSupporter?[0,3]:[0],isProjectCanceled:()=>Boolean(o.canceled),getCompletionData:()=>({bWillCancel:Boolean(o.withdrawn)})},
 PlayerOperations:{canStart:(id,op,args,exclusion)=>{calls.push({kind:'check',id,op,args,exclusion});if(o.changed)ctx.Game.turn++;return{Success:!o.blocked,RequiresConfirmation:Boolean(o.confirm)};},sendRequest:(id,op,args)=>calls.push({kind:'send',id,op,args})}}};
 return JSON.parse(JSON.stringify({data:vm.runInNewContext(fs.readFileSync(`civ7/${script}`,'utf8'),ctx),calls}));
}
test('withdrawal removes one sole local support token only from an exact zero-definition-penalty owned project',()=>{
 const r=run();assert.equal(r.data.status,'submitted');assert.deepEqual(r.calls.at(-1),{kind:'send',id:0,op:900,args:{ID:80,Type:200,Amount:1,SubType:true}});
 for(const o of [{foreign:true},{war:true},{penalty:true},{multiple:true},{otherSupporter:true},{unmet:true},{blocked:true},{confirm:true},{changed:true}]){const r=run(o);assert.equal(r.data.status,'rejected');assert.equal(r.calls.filter(c=>c.kind==='send').length,0);}
 assert.equal(run({withdrawn:true},'project_withdrawal_state.js').data.ownSupportWithdrawn,true);
 assert.equal(run({canceled:true},'project_withdrawal_state.js').data.projectCanceled,true);
 assert.equal(run({withdrawn:true,debit:true},'project_withdrawal_state.js').data.ownSupportWithdrawn,false);
});
