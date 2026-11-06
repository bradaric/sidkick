(() => {
  const {event_id:eventId,target_player_id:targetId,expected_turn:expectedTurn}=queryArguments,reject=(reason,failureReasons=[])=>({status:"rejected",reason,failureReasons});
  if(![eventId,targetId,expectedTurn].every(v=>Number.isInteger(v)&&v>=0))return reject("Exact own project event/counterpart and expected turn required");
  if(!UI.isInGame())return reject("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),known=()=>player?.Diplomacy.hasMet(targetId)===true||Game.IndependentPowers?.independentVillageDiscoveredByPlayer(targetId,playerId)===true;
  if(!Number.isInteger(playerId)||playerId<0||!player||targetId===playerId||Game.turn!==expectedTurn||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||!known())return reject("Fresh active turn and known foreign project counterpart required");
  const allowed=["DIPLOMACY_ACTION_OPEN_BORDERS","DIPLOMACY_ACTION_RESEARCH_COLLABORATION","DIPLOMACY_ACTION_CULTURAL_EXCHANGE","DIPLOMACY_ACTION_LOCAL_FESTIVALS","DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN","DIPLOMACY_ACTION_CS_PROMOTE_GROWTH","DIPLOMACY_ACTION_CS_BOLSTER_MILITARY","DIPLOMACY_ACTION_CS_INCORPORATE","DIPLOMACY_ACTION_COUNTER_SPY","DIPLOMACY_ACTION_ESPIONAGE_MILITARY_SABOTAGE","DIPLOMACY_ACTION_ESPIONAGE_STEAL_TECH","DIPLOMACY_ACTION_ESPIONAGE_STEAL_CIVIC","DIPLOMACY_ACTION_ESPIONAGE_MILITARY_INFILTRATION"];
  function snapshot(){
    const rows=Game.Diplomacy.getPlayerEvents(targetId);if(!Array.isArray(rows))return null;
    const matches=rows.filter(e=>e.uniqueID===eventId&&e.initialPlayer===playerId&&e.targetPlayer===targetId&&e.gameTurnEnd===-1&&e.failed!==true);
    if(matches.length!==1)return null;
    const e=matches[0],def=GameInfo.DiplomacyActions.lookup(e.actionType),count=Game.Diplomacy.getNumSupportEnvoysForPlayer(eventId,playerId),supporters=Game.Diplomacy.getSupportingPlayers(eventId);
    if(!def||def.$hash!==e.actionType||def.DiplomacyActionType!==e.actionTypeName||!allowed.includes(def.DiplomacyActionType)||def.CancelPenalty!==0||def.UnsupportPenalty!==0||count!==1||!Array.isArray(supporters)||supporters.length!==1||supporters[0]!==playerId)return null;
    return{eventId,actionType:e.actionType,action:e.actionTypeName,startTurn:e.gameTurnStart,ownSupport:count,cancelPenalty:0,unsupportPenalty:0};
  }
  const source=snapshot();if(!source)return reject("One sole local support token on a supported own active project with known zero cancel/unsupport penalties required; no wars, third-party support or paid cancellation");
  const before={turn:Game.turn,age:Game.age,playerId,source,gold:player.Treasury?.goldBalance,influence:player.DiplomacyTreasury?.diplomacyBalance};
  if(![before.gold,before.influence].every(Number.isFinite)||!Number.isInteger(PlayerOperationTypes.UNSUPPORT_DIPLOMATIC_ACTION)||!Number.isInteger(DiplomacyTokenTypes.DIPLOMACY_TOKEN_GLOBAL))return reject("Known currency balances and installed native withdrawal/token types required");
  const args={ID:eventId,Type:DiplomacyTokenTypes.DIPLOMACY_TOKEN_GLOBAL,Amount:1,SubType:true},operation=PlayerOperationTypes.UNSUPPORT_DIPLOMATIC_ACTION,check=Game.PlayerOperations.canStart(playerId,operation,args,false);
  if(check?.Success!==true||check.RequiresConfirmation===true||Number.isFinite(check.Cost)&&check.Cost>0)return reject("Native support withdrawal failed, needs confirmation or quotes an unsupported cost",check?.FailureReasons??[]);
  if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||!known()||JSON.stringify(snapshot())!==JSON.stringify(source)||player.Treasury.goldBalance!==before.gold||player.DiplomacyTreasury.diplomacyBalance!==before.influence)return reject("Project support, penalties, currency balances or context changed during validation");
  Game.PlayerOperations.sendRequest(playerId,operation,args);
  return{status:"submitted",before,expected:{ownSupportWithdrawn:true},verificationArguments:{event_id:eventId,target_player_id:targetId,action_type:source.actionType,before_gold:before.gold,before_influence:before.influence},
    verificationScope:"One sole own support token withdrawn, no unexpected net currency debit; native canceled/scheduled status reported separately. Immediate cancellation is not assumed, future expiry/refund/full diplomatic effects not claimed. Only known zero-definition-penalty projects"};
})()
