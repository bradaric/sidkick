const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const{test}=require('node:test');
function run(o={},script='alliance_action.js'){
 const calls=[],cancel=o.action==='cancel',allied=o.applied?!cancel:cancel,row={actionTypeName:'DIPLOMACY_ACTION_FORM_ALLIANCE',actionType:100,operationType:900,projectStatus:0,target2Type:-1,targetList2:[],targetList1:[{targetID:3,costYieldD:o.paid?10:0}]},wars=[{playerId:3,atWar:false},{playerId:4,atWar:true}];
 const ctx={queryArguments:{target_player_id:3,action:o.action??'form',expected_turn:62,expected_allied:!cancel,before_gold:1000,before_influence:500,before_wars:wars},UI:{isInGame:()=>true},GameContext:{localPlayerID:0,hasSentTurnComplete:()=>false},
 Players:{getAliveIds:()=>[0,3,4,9],get:id=>id===0?{isTurnActive:true,Treasury:{goldBalance:1000},DiplomacyTreasury:{diplomacyBalance:500},Diplomacy:{hasMet:id=>id===3||id===4,isAtWarWith:id=>Boolean(id===4||o.newWar&&id===3),hasAllied:()=>allied}}:{isMajor:true,Diplomacy:{hasAllied:()=>o.asymmetric?!allied:allied}}},
 GameInfo:{DiplomacyActions:{lookup:()=>({$hash:100,DiplomacyActionType:row.actionTypeName,CancelPenalty:o.penalty?10:0,UnsupportPenalty:0})}},PlayerOperationTypes:{FORM_ALLIANCE:900,CANCEL_ALLIANCE:901},DiplomacyActionTargetTypes:{NO_DIPLOMACY_TARGET:-1,DIPLOMACY_TARGET_NONE:-1},DiplomacyActionGroups:{NO_DIPLOMACY_ACTION_GROUP:-1},DiplomacyProjectStatus:{PROJECT_AVAILABLE:0},
 Game:{turn:62,age:42,Diplomacy:{getProjectDataForUI:()=>o.noOffer?[]:[row]},DiplomacyDeals:{hasPendingDeal:()=>Boolean(o.pending)},PlayerOperations:{canStart:(id,op,args,exclusion)=>{calls.push({kind:'check',id,op,args,exclusion});if(o.changed)ctx.Game.turn++;return{Success:!o.blocked,RequiresConfirmation:Boolean(o.confirm)};},sendRequest:(id,op,args)=>calls.push({kind:'send',id,op,args})}}};
 return JSON.parse(JSON.stringify({data:vm.runInNewContext(fs.readFileSync(`civ7/${script}`,'utf8'),ctx),calls}));
}
test('alliance formation uses exact native zero-cost offered operation; cancellation is distinct zero-definition-penalty intent',()=>{
 for(const action of ['form','cancel']){const r=run({action});assert.equal(r.data.status,'submitted');assert.deepEqual(r.calls.at(-1),{kind:'send',id:0,op:action==='form'?900:901,args:{Player1:0,Player2:3,Type:100}});}
 for(const o of [{paid:true},{noOffer:true},{asymmetric:true},{pending:true},{blocked:true},{confirm:true},{changed:true},{action:'cancel',penalty:true}]){const r=run(o);assert.equal(r.data.status,'rejected');assert.equal(r.calls.some(c=>c.kind==='send'),false);}
});
test('alliance readback proves both flags, exact own balances and unchanged captured known wars',()=>{
 for(const action of ['form','cancel'])assert.equal(run({action,applied:true},'alliance_state.js').data.allianceApplied,true);
 for(const o of [{applied:false},{applied:true,asymmetric:true},{applied:true,newWar:true}])assert.equal(run(o,'alliance_state.js').data.allianceApplied,false);
});
