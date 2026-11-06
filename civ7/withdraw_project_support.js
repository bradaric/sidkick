(() => {
  const {event_id:eventId,target_player_id:targetId,expected_turn:expectedTurn}=queryArguments,reject=(reason,failureReasons=[])=>({status:"rejected",reason,failureReasons});
  const {extended=false,max_cancel_penalty:cancelCap=0,max_unsupport_penalty:unsupportCap=0}=queryArguments;
  if(typeof extended!=="boolean"||![cancelCap,unsupportCap].every(v=>Number.isInteger(v)&&v>=0)||!extended&&(cancelCap!==0||unsupportCap!==0))return reject("Explicit nonnegative native-definition penalty caps required for extended withdrawal");
  if(![eventId,targetId,expectedTurn].every(v=>Number.isInteger(v)&&v>=0))return reject("Exact own project event/counterpart and expected turn required");
  if(!UI.isInGame())return reject("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),known=()=>player?.Diplomacy.hasMet(targetId)===true||Game.IndependentPowers?.independentVillageDiscoveredByPlayer(targetId,playerId)===true;
  if(!Number.isInteger(playerId)||playerId<0||!player||targetId===playerId||Game.turn!==expectedTurn||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||!known())return reject("Fresh active turn and known foreign project counterpart required");
  const allowed=["DIPLOMACY_ACTION_OPEN_BORDERS","DIPLOMACY_ACTION_RESEARCH_COLLABORATION","DIPLOMACY_ACTION_CULTURAL_EXCHANGE","DIPLOMACY_ACTION_LOCAL_FESTIVALS","DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN","DIPLOMACY_ACTION_CS_PROMOTE_GROWTH","DIPLOMACY_ACTION_CS_BOLSTER_MILITARY","DIPLOMACY_ACTION_CS_INCORPORATE","DIPLOMACY_ACTION_COUNTER_SPY","DIPLOMACY_ACTION_ESPIONAGE_MILITARY_SABOTAGE","DIPLOMACY_ACTION_ESPIONAGE_STEAL_TECH","DIPLOMACY_ACTION_ESPIONAGE_STEAL_CIVIC","DIPLOMACY_ACTION_ESPIONAGE_MILITARY_INFILTRATION"];
  if(extended)allowed.push("DIPLOMACY_ACTION_SABOTAGE_RESEARCH","DIPLOMACY_ACTION_SABOTAGE_CIVIC_STUDY","DIPLOMACY_ACTION_SABOTAGE_TREASURY","DIPLOMACY_ACTION_SABOTAGE_MORALE","DIPLOMACY_ACTION_SABOTAGE_MILITARY_PRODUCTION","DIPLOMACY_ACTION_SABOTAGE_FOOD_PRODUCTION");
  function snapshot(){
    const rows=Game.Diplomacy.getPlayerEvents(targetId);if(!Array.isArray(rows))return null;
    const matches=rows.filter(e=>e.uniqueID===eventId&&e.initialPlayer===playerId&&e.targetPlayer===targetId&&e.gameTurnEnd===-1&&e.failed!==true);
    if(matches.length!==1)return null;
    const e=matches[0],def=GameInfo.DiplomacyActions.lookup(e.actionType),count=Game.Diplomacy.getNumSupportEnvoysForPlayer(eventId,playerId),rawSupporters=Game.Diplomacy.getSupportingPlayers(eventId);
    // Native returns one player entry per token (e.g. [0,0]), not unique players.
    if(!Array.isArray(rawSupporters)||rawSupporters.length>32||rawSupporters.some(id=>!Number.isInteger(id)||id<0))return null;
    const supporters=[...new Set(rawSupporters)].sort((a,b)=>a-b);
    if(!def||def.$hash!==e.actionType||def.DiplomacyActionType!==e.actionTypeName||!allowed.includes(def.DiplomacyActionType)||![def.CancelPenalty,def.UnsupportPenalty].every(v=>Number.isInteger(v)&&v>=0)||def.CancelPenalty>cancelCap||def.UnsupportPenalty>unsupportCap||!Number.isInteger(count)||count<1||count>16||supporters.length>16||!supporters.includes(playerId)||
        (!extended&&(count!==1||supporters.length!==1))||(count===1&&supporters.length>1))return null;
    const others=[];for(const id of supporters.filter(id=>id!==playerId)){
      if(!Number.isInteger(id)||id<0||player.Diplomacy.hasMet(id)!==true)return null;
      const count=Game.Diplomacy.getNumSupportEnvoysForPlayer(eventId,id);if(!Number.isInteger(count)||count<1||count>16)return null;others.push({playerId:id,count});
    }others.sort((a,b)=>a.playerId-b.playerId);
    return{eventId,actionType:e.actionType,action:e.actionTypeName,startTurn:e.gameTurnStart,ownSupport:count,cancelPenalty:def.CancelPenalty,unsupportPenalty:def.UnsupportPenalty,otherSupport:others};
  }
  const source=snapshot();if(!source)return reject("Supported exact own project with known penalties within explicit caps and known support required; default remains sole-token/zero-penalty. Never remove last own token while others support it");
  const before={turn:Game.turn,age:Game.age,playerId,source,gold:player.Treasury?.goldBalance,influence:player.DiplomacyTreasury?.diplomacyBalance};
  if(![before.gold,before.influence].every(Number.isFinite)||!Number.isInteger(PlayerOperationTypes.UNSUPPORT_DIPLOMATIC_ACTION)||!Number.isInteger(DiplomacyTokenTypes.DIPLOMACY_TOKEN_GLOBAL))return reject("Known currency balances and installed native withdrawal/token types required");
  const args={ID:eventId,Type:DiplomacyTokenTypes.DIPLOMACY_TOKEN_GLOBAL,Amount:1,SubType:true},operation=PlayerOperationTypes.UNSUPPORT_DIPLOMATIC_ACTION,check=Game.PlayerOperations.canStart(playerId,operation,args,false);
  if(check?.Success!==true||check.RequiresConfirmation===true||Number.isFinite(check.Cost)&&check.Cost>0)return reject("Native support withdrawal failed, needs confirmation or quotes an unsupported cost",check?.FailureReasons??[]);
  if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||!known()||JSON.stringify(snapshot())!==JSON.stringify(source)||player.Treasury.goldBalance!==before.gold||player.DiplomacyTreasury.diplomacyBalance!==before.influence)return reject("Project support, penalties, currency balances or context changed during validation");
  Game.PlayerOperations.sendRequest(playerId,operation,args);
  return{status:"submitted",before,expected:{ownSupportWithdrawn:true},verificationArguments:{event_id:eventId,target_player_id:targetId,action_type:source.actionType,before_gold:before.gold,before_influence:before.influence,before_support:source.ownSupport,other_support:source.otherSupport},
    verificationScope:"Exactly one own support token withdrawn, captured other known supporters preserved, no unexpected net currency debit. Native canceled/scheduled status separate. Definition penalty caps acknowledge native penalty fields, not a currency/runtime relationship quote; full diplomatic consequences, refunds and eventual expiry not claimed"};
})()
