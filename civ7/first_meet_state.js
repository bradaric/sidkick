(() => {
  if(!UI.isInGame())throw Error('Load a save first');
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),{target_player_id:targetId,notification,before_gold:gold,expected_influence:influence,expected_relationship:relationship,before_allied:allied}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0||!player||!Number.isInteger(targetId)||targetId<0||targetId===playerId||notification?.owner!==playerId||![notification.id,notification.type].every(v=>Number.isInteger(v)&&v>=0)||![gold,influence,relationship].every(Number.isFinite)||typeof allied!=='boolean'||player.Diplomacy.hasMet(targetId)!==true||Players.get(targetId)?.isMajor!==true)throw Error('Invalid captured first-meet identity/balances');
  const notices=firstMeet.pending(playerId,targetId);if(!notices)throw Error('Pending first-meet inventory unavailable');
  const pending=notices.length>0,currentGold=player.Treasury?.goldBalance,currentInfluence=player.DiplomacyTreasury?.diplomacyBalance,currentRelationship=player.Diplomacy.getRelationshipLevel(targetId);
  const gameStarted=firstMeet.ready();
  return{turn:Game.turn,age:Game.age,playerId,targetPlayerId:targetId,gameStarted,firstMeetPending:pending,gold:currentGold,influence:currentInfluence,relationship:currentRelationship,
    firstMeetApplied:gameStarted&&!pending&&currentGold===gold&&currentInfluence===influence&&currentRelationship===relationship&&player.Diplomacy.isAtWarWith(targetId)===false&&player.Diplomacy.hasAllied(targetId)===allied};
})()
