const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const{test}=require('node:test');

function run(o={},script='respond_first_meet.js'){
 const calls=[],id={owner:0,id:23,type:20},n={Type:100,Player:o.wrongPlayer?4:3,Player2:0,AddedOnTurn:1,Dismissed:Boolean(o.dismissed),Expired:Boolean(o.expired),BlocksTurnAdvancement:true,CanUserDismiss:false};
 const player={isTurnActive:true,Treasury:{goldBalance:o.gold??140},DiplomacyTreasury:{diplomacyBalance:o.balance??357},Diplomacy:{hasMet:id=>id===3&&!o.unmet,isAtWarWith:()=>Boolean(o.war),hasAllied:()=>Boolean(o.allied),getRelationshipLevel:()=>o.relationship??0,getPlayerRelationshipHistory:()=>o.unknownHistory?null:o.history?[{eventType:50,amount:o.historyAmount??5}]:[]}};
 const ctx={queryArguments:{target_player_id:3,greeting:o.greeting??'friendly',max_influence_cost:o.cap??20,expected_turn:1},UI:{isInGame:()=>true,getGameLoadingState:()=>o.unknownLoading?undefined:o.loading?6:8},UIGameLoadingState:{GameStarted:8},GameContext:{localPlayerID:0,hasSentTurnComplete:()=>false},Players:{get:id=>id===0?player:{isMajor:true}},
  DiplomacyPlayerFirstMeets:{PLAYER_REALATIONSHIP_FIRSTMEET_FRIENDLY:11,PLAYER_REALATIONSHIP_FIRSTMEET_NEUTRAL:12,PLAYER_REALATIONSHIP_FIRSTMEET_UNFRIENDLY:13},PlayerOperationTypes:{RESPOND_DIPLOMATIC_FIRST_MEET:900},
  Game:{turn:1,age:42,Notifications:{getIdsForPlayer:()=>o.unknownInventory?null:o.missing?[]:o.duplicate?[id,{owner:0,id:24,type:20}]:[id],getType:()=>100,getTypeName:()=>o.wrongType?'NOTIFICATION_DIPLOMACY_SESSION':'NOTIFICATION_PLAYER_MET',find:()=>o.missingRecord?null:n},
   Diplomacy:{getFirstMeetResponseCostAndRelDelta:type=>type===12?[0,0]:[o.missingQuote?null:o.cost??20,type===11?20:-20]},PlayerOperations:{canStart:(p,op,args,exclusion)=>{
   calls.push({kind:'check',p,op,args,exclusion});if(ctx.armed&&o.changedTurn)ctx.Game.turn++;if(ctx.armed&&o.changedBalance)player.DiplomacyTreasury.diplomacyBalance--;
    if(ctx.armed){ctx.armedChecks=(ctx.armedChecks??0)+1;if(ctx.armedChecks===6&&o.finalQuote)o.cost=21;if(ctx.armedChecks===6&&o.finalBalance)player.DiplomacyTreasury.diplomacyBalance--;if(ctx.armedChecks===6&&o.finalLoading)o.loading=true;}
    if(ctx.armed&&ctx.armedChecks===6&&o.finalHistory)o.historyAmount=6;
    return{Success:!o.blocked,RequiresConfirmation:Boolean(o.confirm),FailureReasons:[]};},sendRequest:(p,op,args)=>{calls.push({kind:'send',p,op,args});if(o.throws)throw Error('Lost acknowledgement');}}}};
 ctx.firstMeet=vm.runInNewContext(fs.readFileSync('civ7/first_meet.js','utf8'),ctx);
 if(script==='diplomacy.js'){
  ctx.Players.getAliveIds=()=>[0,3];ctx.Locale={compose:v=>v};ctx.GameInfo={Leaders:{lookup:()=>null}};
  Object.assign(player.Diplomacy,{getRelationshipLevelName:()=> 'Neutral',getRelationshipEnum:()=>0});player.Stats={getNetYield:()=>0};
  Object.assign(ctx.Game.Diplomacy,{getPlayerEvents:()=>[],getProjectDataForUI:()=>[]});ctx.Game.DiplomacyDeals={hasPendingDeal:()=>false,getDealIds:()=>[]};
  ctx.YieldTypes={YIELD_DIPLOMACY:1};ctx.DiplomacyActionTargetTypes={NO_DIPLOMACY_TARGET:-1};ctx.DiplomacyActionGroups={NO_DIPLOMACY_ACTION_GROUP:-1};
 }
 const snapshot=ctx.firstMeet.snapshot(0,3);if(script==='snapshot')return JSON.parse(JSON.stringify({data:snapshot,calls}));
 ctx.queryArguments.notification_token=o.stale?'old token':snapshot?.notificationToken??'missing';ctx.armed=true;
 if(o.changedHistory)o.historyAmount=6;
 if(script==='first_meet_state.js'){
  const expectedRelationship=(o.relationship??0)+(o.greeting==='neutral'?0:o.greeting==='unfriendly'?-20:20);
  ctx.queryArguments={target_player_id:3,notification:id,before_gold:140,expected_influence:o.greeting==='neutral'?357:337,expected_relationship:expectedRelationship,before_allied:false};
  if(o.applied){o.missing=true;player.DiplomacyTreasury.diplomacyBalance=o.badDebit?336:o.greeting==='neutral'?357:337;player.Diplomacy.getRelationshipLevel=()=>o.badRelationship?expectedRelationship-1:expectedRelationship;}
 }
 let data;try{data=vm.runInNewContext(fs.readFileSync(`civ7/${script}`,'utf8'),ctx);}catch(e){if(!o.throws)throw e;data={error:e.message};}
 return JSON.parse(JSON.stringify({data,calls}));
}

test('pending PLAYER_MET notice, not permissive native canStart or generic session, binds first-meet options',()=>{
 const r=run({},'snapshot');assert.equal(r.data.notification.id,23);assert.equal(r.data.options.length,3);assert.equal(r.data.options[1].quotedInfluenceCost,0);assert.equal(r.data.options[2].quotedRelationshipDelta,-20);assert.ok(r.data.notificationToken);
 const inherited=run({history:true,relationship:5},'snapshot').data;assert.equal(inherited.supportedProfile,true);assert.equal(inherited.options[0].availableNow,true,'pre-existing modifiers do not invalidate a genuine native greeting');
 for(const o of [{missing:true},{dismissed:true},{expired:true},{duplicate:true},{wrongPlayer:true},{wrongType:true},{unmet:true},{missingRecord:true},{unknownInventory:true}]){
  const r=run(o,'snapshot');assert.equal(r.data,null);assert.equal(r.calls.length,0,'no permissive operation probing without exact pending choice');
 }
});
test('first-meet response sends exactly one native quoted greeting from a fresh notification token',()=>{
 for(const [greeting,type,cost]of[['friendly',11,20],['neutral',12,0],['unfriendly',13,20]]){
  const r=run({greeting,cap:cost});assert.equal(r.data.status,'submitted');assert.deepEqual(r.calls.at(-1),{kind:'send',p:0,op:900,args:{Player1:0,Player2:3,Type:type}});assert.equal(r.data.expected.firstMeetApplied,true);
 }
 for(const o of [{stale:true},{cap:19},{missingQuote:true},{blocked:true},{confirm:true},{changedTurn:true},{changedBalance:true},{finalQuote:true},{finalBalance:true},{unknownHistory:true},{war:true},{allied:true},{missing:true}]){
  const r=run(o);assert.equal(r.data.status,'rejected',JSON.stringify(o));assert.equal(r.calls.some(c=>c.kind==='send'),false);
 }
 assert.equal(run({throws:true}).calls.filter(c=>c.kind==='send').length,1,'lost acknowledgement is never retried');
});
test('inherited first-meet relationship/history uses the native quote from its actual baseline',()=>{
  for(const baseline of [{history:true},{relationship:5},{history:true,relationship:-15}]){
    for(const [greeting,delta]of[['friendly',20],['neutral',0],['unfriendly',-20]]){
      const r=run({...baseline,greeting});
      assert.equal(r.data.status,'submitted');
      assert.equal(r.calls.filter(c=>c.kind==='send').length,1);
      assert.equal(r.data.verificationArguments.expected_relationship,(baseline.relationship??0)+delta);
      assert.equal(run({...baseline,greeting,applied:true},'first_meet_state.js').data.firstMeetApplied,true);
      assert.equal(run({...baseline,greeting,applied:true,badRelationship:true},'first_meet_state.js').data.firstMeetApplied,false);
    }
  }
});
test('nonempty history is token-bound and rechecked, not an unsupported encounter',()=>{
  for(const extra of [{changedHistory:true},{finalHistory:true},{blocked:true},{confirm:true},{cap:19},{balance:19}]){
    const r=run({history:true,relationship:5,...extra});
    assert.equal(r.data.status,'rejected',JSON.stringify(extra));
    assert.equal(r.calls.some(c=>c.kind==='send'),false);
  }
  const exposed=run({history:true,relationship:5},'diplomacy.js').data.majorPlayers[0].firstMeet;
  assert.equal(exposed.supportedProfile,true);
  assert.equal(exposed.historyEmpty,false);
  assert.equal(exposed.options[0].availableNow,true);
});
test('first-meet readback requires pending notice clearance plus exact own debit/relationship delta, stable Gold/peace/alliance',()=>{
 for(const greeting of ['friendly','neutral','unfriendly'])assert.equal(run({greeting,applied:true},'first_meet_state.js').data.firstMeetApplied,true);
 for(const o of [{},{applied:true,badDebit:true},{applied:true,badRelationship:true},{applied:true,gold:139},{applied:true,war:true},{applied:true,allied:true}])assert.equal(run(o,'first_meet_state.js').data.firstMeetApplied,false);
 assert.throws(()=>run({missingRecord:true},'first_meet_state.js'),/inventory unavailable/,'unknown notification lookup is not clearance');
 assert.throws(()=>run({unknownInventory:true},'first_meet_state.js'),/inventory unavailable/);
});
test('existing diplomacy readout exposes only the real pending first-meet notification and its fresh native quotes',()=>{
 const r=run({},'diplomacy.js');assert.equal(r.data.majorPlayers[0].firstMeet.notification.id,23);assert.equal(r.data.majorPlayers[0].firstMeet.options[0].quotedInfluenceCost,20);assert.equal(r.calls.some(c=>c.kind==='send'),false);
 assert.equal(run({missing:true},'diplomacy.js').data.majorPlayers[0].firstMeet,null);
});
test('first-meet rejects the Begin loading gate even when isInGame, turn-active and native permission are true',()=>{
 for(const o of [{loading:true},{unknownLoading:true},{finalLoading:true}]){
  const r=run(o);assert.equal(r.data.status,'rejected');assert.equal(r.calls.some(c=>c.kind==='send'),false,'never queue a greeting behind Begin');
 }
 const s=run({loading:true},'snapshot').data;assert.equal(s.gameStarted,false);assert.equal(s.supportedProfile,false);assert.equal(s.options[0].availableNow,false);
 assert.equal(run({applied:true,loading:true},'first_meet_state.js').data.firstMeetApplied,false,'loading snapshots never prove completed execution');
});
