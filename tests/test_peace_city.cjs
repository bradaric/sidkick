const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const{test}=require('node:test');
function run(o={},script='peace_city_action.js'){
 const calls=[],action=o.action??'add',incoming=['accept','reject'].includes(action),w={direction:incoming?1:0,player1:0,player2:3},oldId={owner:o.receiving?3:0,id:7,type:1},newId={owner:o.receiving?0:3,id:50,type:1};
 const city={id:o.transferred?newId:oldId,owner:o.transferred?newId.owner:oldId.owner,location:{x:2,y:3}},other={id:{owner:0,id:8,type:1},location:{x:1,y:1}},peace={id:10,type:1,agreementType:10},offer={id:0,type:4,subType:2,cityTransferType:2,from:oldId.owner,to:newId.owner,duration:0,cityId:oldId},term={...offer,id:11};
 for(const key of ['population','Production','Resources'])Object.defineProperty(city,key,{get(){throw Error('No private foreign city state reads');}});
 const items=[peace,...(o.inDraft?[term]:[])],d={id:7,player1:0,player2:3,isDemand:false,isEnacted:false,isExpired:false,itemIds:items.map(i=>i.id)},token=JSON.stringify({workingDealId:w,dealId:7,items});
 const ctx={queryArguments:{target_player_id:3,city_owner:oldId.owner,city_id:7,x:2,y:3,action,expected_turn:62,deal_token:o.stale?'stale':token,item_token:JSON.stringify(offer),item_id:11,max_gold_cost:0,max_influence_cost:0,
 city_component_type:1,recipient:newId.owner,direction:incoming?1:0,expected_items:o.action==='remove'?[{type:1,agreementType:10}]:[{type:1,agreementType:10},{type:4,subType:2,cityTransferType:2,from:oldId.owner,to:newId.owner,duration:0,cityId:oldId}],baseline_cities:o.receiving?[other.id]:[oldId,other.id],before_gold:1000,before_influence:500,expected_gold:1000,expected_influence:500},
 UI:{isInGame:()=>true},GameContext:{localPlayerID:0,hasSentTurnComplete:()=>false},Players:{get:id=>id===0?{isTurnActive:true,Diplomacy:{hasMet:()=>!o.unmet,isAtWarWith:()=>!o.atPeace,canMakePeaceWith:()=>({Success:!o.cooldown})},Treasury:{goldBalance:1000},DiplomacyTreasury:{diplomacyBalance:500},Cities:{getCities:()=>[...(o.transferred&&!o.receiving?[]:[city]),...(o.lostOther?[]:[other])]}}:{isMajor:true,Diplomacy:{isAtWarWith:()=>!o.atPeace}}},
 GameplayMap:{getGridWidth:()=>10,getGridHeight:()=>10,getRevealedState:()=>o.hidden?0:2,getOwner:()=>city.owner},RevealedStates:{VISIBLE:2},MapCities:{getCity:()=>city.id},Cities:{get:()=>{assert.equal(o.hidden,undefined,'no city metadata read before centre visibility');calls.push({kind:'cityRead'});return city;}},
 DiplomacyDealDirection:{OUTGOING:0,INCOMING:1},DiplomacyDealItemTypes:{AGREEMENTS:1,GOLD:2,INFLUENCE:3,CITIES:4},DiplomacyDealItemAgreementTypes:{MAKE_PEACE:10},DiplomacyDealItemCityTransferTypes:{OFFER:2},DiplomacyDealItemGoldSubTypes:{SMALL_LUMP:20,LARGE_LUMP:21},DiplomacyDealItemInfluenceSubTypes:{SMALL_LUMP:30,LARGE_LUMP:31},DiplomacyDealProposalActions:{PROPOSED:4,ACCEPTED:1,REJECTED:2},
 Game:{turn:62,age:42,DiplomacyDeals:{hasPendingDeal:()=>Boolean(o.pending),getWorkingDeal:()=>{if(o.changed)ctx.Game.turn++;return d;},getWorkingDealItem:(w,n)=>o.badTerms?{id:n,type:99}:items.find(i=>i.id===n),getPossibleWorkingDealItems:()=>[offer],addItemToWorkingDeal:(w,item)=>calls.push({kind:'add',w,item}),removeItemFromWorkingDeal:(w,id)=>calls.push({kind:'remove',w,id}),sendWorkingDeal:(w,operation)=>calls.push({kind:'send',w,operation})}}};
 ctx.peaceCityTerms=vm.runInNewContext(fs.readFileSync('civ7/peace_city_terms.js','utf8'),ctx);
 return JSON.parse(JSON.stringify({data:vm.runInNewContext(fs.readFileSync(`civ7/${script}`,'utf8'),ctx),calls}));
}
test('city peace edits require exact visible owner-qualified centre, whole draft and native city offer; do not send',()=>{
 const r=run();assert.equal(r.data.status,'submitted');assert.equal(r.calls.filter(c=>c.kind==='add').length,1);assert.equal(r.calls.filter(c=>c.kind==='send').length,0);
 assert.equal(run({action:'remove',inDraft:true}).data.status,'submitted');
 for(const o of [{hidden:true},{unmet:true},{cooldown:true},{stale:true},{changed:true},{badTerms:true},{inDraft:true}]){const r=run(o);assert.equal(r.data.status,'rejected',JSON.stringify(o));assert.equal(r.calls.some(c=>['add','remove','send'].includes(c.kind)),false);}
});
test('city acceptance is separate and verifies recipient centre plus every unaffected owned settlement',()=>{
 const r=run({action:'accept',inDraft:true,pending:true});assert.equal(r.data.status,'submitted');assert.equal(r.calls.at(-1).operation,1);
 assert.equal(run({action:'accept',inDraft:true,transferred:true,atPeace:true},'peace_city_state.js').data.cityPeaceApplied,true);
 assert.equal(run({action:'accept',inDraft:true,transferred:true,atPeace:true,lostOther:true},'peace_city_state.js').data.cityPeaceApplied,false);
 assert.equal(run({inDraft:true},'peace_city_state.js').data.cityDraftApplied,true);
 assert.equal(run({},'peace_city_state.js').data.cityDraftApplied,false);
 assert.equal(run({lostOther:true}).data.status,'rejected','never concede last own settlement');
});
test('receiving a visible foreign city also resolves owner-qualified IDs and preserves old own cities',()=>{
 assert.equal(run({receiving:true}).data.status,'submitted');
 assert.equal(run({receiving:true,action:'accept',inDraft:true,transferred:true,atPeace:true},'peace_city_state.js').data.cityPeaceApplied,true);
 assert.equal(run({receiving:true,hidden:true},'peace_city_offer.js').data.status,'unavailable');
});
test('targeted city offer readout does not enumerate private foreign city inventory or mutate drafts',()=>{
 const r=run({},'peace_city_offer.js');assert.equal(r.data.outgoing.offers.length,1);assert.ok(r.data.outgoing.dealToken);assert.equal(r.calls.some(c=>['add','remove','send'].includes(c.kind)),false);
 assert.equal(run({hidden:true},'peace_city_offer.js').data.status,'unavailable');
});
