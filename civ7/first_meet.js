(() => {
  const ready=()=>UI.isInGame()===true&&typeof UI.getGameLoadingState==='function'&&typeof UIGameLoadingState!=='undefined'&&Number.isInteger(UIGameLoadingState.GameStarted)&&UI.getGameLoadingState()===UIGameLoadingState.GameStarted;
  function pending(playerId,targetId){
    const ids=Game.Notifications.getIdsForPlayer(playerId);
    if(!Array.isArray(ids))return null;
    const out=[];
    for(const id of ids){
      if(id.owner!==playerId)continue;
      const type=Game.Notifications.getType(id);
      if(Game.Notifications.getTypeName(type)!=='NOTIFICATION_PLAYER_MET')continue;
      const n=Game.Notifications.find(id);
      if(!n||!Number.isInteger(n.Player)||n.Player<0)return null;
      if(n.Player!==targetId||n.Dismissed===true||n.Expired===true)continue;
      if(n.Type!==type||n.Player2!==playerId||n.Dismissed!==false||n.Expired!==false||n.BlocksTurnAdvancement!==true||n.CanUserDismiss!==false||
          !Number.isInteger(id.id)||id.id<0||!Number.isInteger(id.type)||id.type<0||!Number.isInteger(n.AddedOnTurn)||n.AddedOnTurn<0||n.AddedOnTurn>Game.turn)return null;
      out.push({notification:{owner:playerId,id:id.id,type:id.type},addedOnTurn:n.AddedOnTurn});
    }
    return out;
  }
  function snapshot(playerId,targetId){
    const player=Players.get(playerId);
    if(!Number.isInteger(playerId)||playerId<0||!Number.isInteger(targetId)||targetId<0||targetId===playerId||!player||player.Diplomacy.hasMet(targetId)!==true||Players.get(targetId)?.isMajor!==true)return null;
    const notices=pending(playerId,targetId);
    if(!notices||notices.length!==1)return null;
    const history=player.Diplomacy.getPlayerRelationshipHistory(targetId),gold=player.Treasury?.goldBalance,influence=player.DiplomacyTreasury?.diplomacyBalance,
      relationship=player.Diplomacy.getRelationshipLevel(targetId),atWar=player.Diplomacy.isAtWarWith(targetId),allied=player.Diplomacy.hasAllied(targetId);
    const gameStarted=ready(),supportedProfile=gameStarted&&[gold,influence,relationship].every(Number.isFinite)&&atWar===false&&allied===false&&relationship===0&&Array.isArray(history)&&history.length===0;
    const mapping={friendly:DiplomacyPlayerFirstMeets.PLAYER_REALATIONSHIP_FIRSTMEET_FRIENDLY,neutral:DiplomacyPlayerFirstMeets.PLAYER_REALATIONSHIP_FIRSTMEET_NEUTRAL,unfriendly:DiplomacyPlayerFirstMeets.PLAYER_REALATIONSHIP_FIRSTMEET_UNFRIENDLY};
    const options=Object.entries(mapping).map(([greeting,type])=>{
      if(!Number.isInteger(type))return{greeting,quotedInfluenceCost:null,quotedRelationshipDelta:null,operationAllowed:false,availableNow:false,failureReasons:[]};
      const quote=Game.Diplomacy.getFirstMeetResponseCostAndRelDelta(type,playerId),cost=Array.isArray(quote)&&Number.isFinite(quote[0])&&quote[0]>=0?quote[0]:null,
        delta=Array.isArray(quote)&&Number.isFinite(quote[1])?quote[1]:null,args={Player1:playerId,Player2:targetId,Type:type},check=Game.PlayerOperations.canStart(playerId,PlayerOperationTypes.RESPOND_DIPLOMATIC_FIRST_MEET,args,false);
      return{greeting,type,quotedInfluenceCost:cost,quotedRelationshipDelta:delta,operationAllowed:check?.Success===true,
        availableNow:supportedProfile&&cost!==null&&delta!==null&&cost<=influence&&check?.Success===true&&check.RequiresConfirmation!==true&&check.InsufficientFunds!==true,
        failureReasons:check?.FailureReasons??[]};
    });
    const state={turn:Game.turn,age:Game.age,playerId,targetPlayerId:targetId,...notices[0],gold,influence,relationship,atWar,allied,historyEmpty:Array.isArray(history)&&history.length===0,gameStarted,supportedProfile,options};
    return{...state,notificationToken:JSON.stringify(state)};
  }
  return{pending,snapshot,ready};
})()
