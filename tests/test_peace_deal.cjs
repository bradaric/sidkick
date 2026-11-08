const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const{test}=require('node:test');
function run(o={},script='peace_deal_action.js'){
 const calls=[],action=o.action??'prepare',direction=['accept','reject'].includes(action)?1:0,workingId={direction,player1:0,player2:3};
 const item={id:20,type:o.extraTerms?2:1,agreementType:10},deal={id:7,player1:0,player2:3,isEnacted:false,isDemand:Boolean(o.demand),isExpired:false,itemIds:o.extraTerms?[20]:o.empty?[]:[20]};
 const token=JSON.stringify({workingDealId:workingId,dealId:7,items:[item]});
 const player={isTurnActive:!o.inactive,Diplomacy:{hasMet:()=>!o.unmet,isAtWarWith:()=>!o.peace,canMakePeaceWith:()=>({Success:!o.cooldown,FailureReasons:o.cooldown?['10 turns']:[]})}};
 const ctx={queryArguments:{target_player_id:3,action,deal_token:action==='prepare'?null:token,expected_turn:62,direction,...o.args},UI:{isInGame:()=>true},GameContext:{localPlayerID:0,hasSentTurnComplete:()=>Boolean(o.sent)},
 Players:{get:id=>id===0?player:{isMajor:!o.minor,Diplomacy:{isAtWarWith:()=>!o.peace}}},DiplomacyDealDirection:{OUTGOING:0,INCOMING:1},DiplomacyDealItemTypes:{AGREEMENTS:1},DiplomacyDealItemAgreementTypes:{MAKE_PEACE:10},DiplomacyDealProposalActions:{PROPOSED:4,ACCEPTED:1,REJECTED:2},
 Game:{turn:62,age:42,DiplomacyDeals:{hasPendingDeal:()=>Boolean(o.pending),getWorkingDeal:()=>{if(o.changed)ctx.Game.turn++;return deal;},getWorkingDealItem:()=>item,
 addItemToWorkingDeal:(id,item)=>calls.push({kind:'add',id,item}),sendWorkingDeal:(id,operation)=>calls.push({kind:'send',id,operation})}}};
 return JSON.parse(JSON.stringify({data:vm.runInNewContext(fs.readFileSync(`civ7/${script}`,'utf8'),ctx),calls}));
}
test('peace drafting/submission/responses are separate single native writes bound to exact white-peace terms',()=>{
 const prepared=run({empty:true});assert.equal(prepared.data.status,'submitted');assert.deepEqual(prepared.calls,[{kind:'add',id:{direction:0,player1:0,player2:3},item:{type:1,agreementType:10}}]);
 assert.equal(run({}).data.status,'already_active','existing white-peace draft is preserved');
 for(const [action,operation]of[['propose',4],['accept',1],['reject',2]]){const r=run({action,pending:action!=='propose'});assert.equal(r.data.status,'submitted');assert.equal(r.calls[0].operation,operation);}
 for(const o of[{cooldown:true},{unmet:true},{minor:true},{inactive:true},{sent:true},{pending:true},{changed:true},{extraTerms:true},{demand:true}]){const r=run({empty:true,...o});assert.equal(r.data.status,'rejected',JSON.stringify(o));assert.equal(r.calls.length,0);}
 for(const o of[{extraTerms:true},{demand:true},{args:{deal_token:'stale'}},{empty:true}])assert.equal(run({action:'propose',...o}).data.status,'rejected');
});
test('peace readback distinguishes prepared draft, submitted proposal, actual bilateral peace and rejection',()=>{
 assert.equal(run({},'peace_deal_state.js').data.draftPrepared,true);
 assert.equal(run({action:'propose',pending:true},'peace_deal_state.js').data.proposalObserved,true);
 assert.equal(run({action:'accept',peace:true},'peace_deal_state.js').data.peaceEstablished,true);
 assert.equal(run({action:'reject'},'peace_deal_state.js').data.rejectionObserved,true);
 assert.equal(run({action:'reject',pending:true},'peace_deal_state.js').data.rejectionObserved,false);
});
