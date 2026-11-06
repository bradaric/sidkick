(() => {
  if(!UI.isInGame())throw Error("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),targetId=queryArguments.target_player_id;
  if(!Number.isInteger(playerId)||playerId<0||!player||!Number.isInteger(targetId)||targetId<0||targetId===playerId||player.Diplomacy.hasMet(targetId)!==true)throw Error("Exact met foreign target required");
  const target=Players.get(targetId);
  if(target?.isMajor!==true)throw Error("Captured major target identity changed");
  const local=player.Diplomacy.isAtWarWith(targetId),foreign=target.Diplomacy?.isAtWarWith(playerId);
  return{turn:Game.turn,age:Game.age,playerId,targetPlayerId:targetId,atWar:local===true&&foreign===true,atPeace:local===false&&foreign===false};
})()
