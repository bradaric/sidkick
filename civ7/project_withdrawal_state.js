(() => {
  if(!UI.isInGame())throw Error("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),{event_id:eventId,target_player_id:targetId,action_type:actionType,before_gold:gold,before_influence:influence}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0||!player||![eventId,targetId].every(v=>Number.isInteger(v)&&v>=0)||!Number.isInteger(actionType)||![gold,influence].every(Number.isFinite)||!(player.Diplomacy.hasMet(targetId)===true||Game.IndependentPowers?.independentVillageDiscoveredByPlayer(targetId,playerId)===true))throw Error("Invalid captured known own project");
  const rows=Game.Diplomacy.getPlayerEvents(targetId);if(!Array.isArray(rows))throw Error("Own project inventory unknown");
  const matches=rows.filter(e=>e.uniqueID===eventId);if(matches.length>1||matches.length&&(matches[0].initialPlayer!==playerId||matches[0].targetPlayer!==targetId||matches[0].actionType!==actionType))throw Error("Captured project identity changed");
  const canceled=Game.Diplomacy.isProjectCanceled(eventId);
  if(canceled!==true&&!matches.length)throw Error("Project disappeared without native cancellation evidence");
  const support=canceled===true?0:Game.Diplomacy.getNumSupportEnvoysForPlayer(eventId,playerId),currentGold=player.Treasury?.goldBalance,currentInfluence=player.DiplomacyTreasury?.diplomacyBalance;
  return{turn:Game.turn,age:Game.age,playerId,eventId,projectCanceled:typeof canceled==="boolean"?canceled:null,ownSupport:support,
    cancellationScheduled:canceled!==true&&matches.length===1?Game.Diplomacy.getCompletionData(eventId)?.bWillCancel??null:false,
    ownSupportWithdrawn:support===0&&Number.isFinite(currentGold)&&Number.isFinite(currentInfluence)&&currentGold>=gold&&currentInfluence>=influence};
})()
