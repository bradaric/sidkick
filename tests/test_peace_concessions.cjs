const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const{test}=require('node:test');
function run(o={},script='peace_concession.js'){
 const calls=[],action=o.action??'add',incoming=['accept','reject'].includes(action),workingId={direction:incoming?1:0,player1:0,player2:3};
 const peace={id:10,type:1,agreementType:10},currency={id:11,from:0,to:3,type:2,subType:20,amount:100,duration:0,isValid:true};
 const items=[peace,...(o.withCurrency?[currency]:[])],deal={id:7,player1:0,player2:3,isDemand:false,isEnacted:false,isExpired:false,itemIds:items.map(i=>i.id)};
 const offer={...currency,id:0,isValid:!o.invalidOffer},token=JSON.stringify({workingDealId:workingId,dealId:7,items});
 const ctx={queryArguments:{target_player_id:3,action,expected_turn:62,deal_token:o.stale?'stale':token,item_token:JSON.stringify(offer),item_id:11,max_gold_cost:o.lowCap?99:100,max_influence_cost:0,
 expected_items:o.action==='remove'?[{type:1,agreementType:10}]:[{type:1,agreementType:10},{type:2,subType:20,from:0,to:3,amount:100,duration:0}],before_gold:1000,before_influence:500,expected_gold:900,expected_influence:500,direction:incoming?1:0},
 UI:{isInGame:()=>true},GameContext:{localPlayerID:0,hasSentTurnComplete:()=>false},Players:{get:id=>id===0?{isTurnActive:true,Treasury:{goldBalance:o.paid?900:1000},DiplomacyTreasury:{diplomacyBalance:500},Diplomacy:{hasMet:()=>true,isAtWarWith:()=>!o.atPeace,canMakePeaceWith:()=>({Success:!o.cooldown})}}:{isMajor:true,Diplomacy:{isAtWarWith:()=>!o.atPeace}}},
 DiplomacyDealDirection:{OUTGOING:0,INCOMING:1},DiplomacyDealItemTypes:{AGREEMENTS:1,GOLD:2,INFLUENCE:3},DiplomacyDealItemAgreementTypes:{MAKE_PEACE:10},DiplomacyDealItemGoldSubTypes:{SMALL_LUMP:20,LARGE_LUMP:21},DiplomacyDealItemInfluenceSubTypes:{SMALL_LUMP:30,LARGE_LUMP:31},DiplomacyDealProposalActions:{PROPOSED:4,ACCEPTED:1,REJECTED:2},
 Game:{turn:62,age:42,DiplomacyDeals:{hasPendingDeal:()=>Boolean(o.pending),getWorkingDeal:()=>{if(o.changed)ctx.Game.turn++;return deal;},getWorkingDealItem:(id,n)=>o.badTerms?{id:n,type:99}:items.find(i=>i.id===n),getPossibleWorkingDealItems:()=>[offer],
 addItemToWorkingDeal:(id,item)=>calls.push({kind:'add',id,item}),removeItemFromWorkingDeal:(id,n)=>calls.push({kind:'remove',id,n}),sendWorkingDeal:(id,operation)=>calls.push({kind:'send',id,operation})}}};
 return JSON.parse(JSON.stringify({data:vm.runInNewContext(fs.readFileSync(`civ7/${script}`,'utf8'),ctx),calls}));
}
test('economic peace edits bind entire existing draft and one exact native valid lump-sum offer, never clear work',()=>{
 const r=run();assert.equal(r.data.status,'submitted');assert.equal(r.calls[0].kind,'add');assert.equal(r.calls[0].item.amount,100);
 const removed=run({action:'remove',withCurrency:true});assert.equal(removed.data.status,'submitted');assert.equal(removed.calls[0].kind,'remove');assert.equal(removed.calls[0].n,11);
 for(const o of [{stale:true},{lowCap:true},{cooldown:true},{invalidOffer:true},{changed:true},{badTerms:true},{pending:true},{withCurrency:true}]){const r=run(o);assert.equal(r.data.status,'rejected',JSON.stringify(o));assert.equal(r.calls.length,0);}
});
test('economic proposal and acceptance require exact token/caps; acceptance readback includes actual agreed currency deltas',()=>{
 assert.equal(run({withCurrency:true},'peace_concession_state.js').data.draftTermsApplied,true);
 assert.equal(run({},'peace_concession_state.js').data.draftTermsApplied,false);
 assert.equal(run({action:'remove'},'peace_concession_state.js').data.draftTermsApplied,true);
 for(const [action,operation]of[['propose',4],['accept',1],['reject',2]]){const r=run({action,withCurrency:true,pending:action!=='propose'});assert.equal(r.data.status,'submitted');assert.equal(r.calls[0].operation,operation);}
 assert.equal(run({action:'accept',withCurrency:true,pending:true,lowCap:true}).data.status,'rejected');
 assert.equal(run({action:'accept',withCurrency:true,atPeace:true,paid:true},'peace_concession_state.js').data.peaceTermsApplied,true);
 assert.equal(run({action:'accept',withCurrency:true,atPeace:true},'peace_concession_state.js').data.peaceTermsApplied,false);
});
