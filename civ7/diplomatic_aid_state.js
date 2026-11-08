(() => {
  if(!UI.isInGame())throw Error("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),{target_player_id:targetId,secondary_value:amount,before_gold:gold,before_influence:influence,quoted_cost:cost}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0||!player||!Number.isInteger(targetId)||targetId<0||targetId===playerId||!Number.isInteger(amount)||amount<=0||![gold,influence,cost].every(Number.isFinite)||cost<0||player.Diplomacy.hasMet(targetId)!==true)throw Error("Invalid captured aid amount/counterpart/balances");
  const target=Players.get(targetId);if(target?.isMajor!==true)throw Error("Captured aid counterpart identity changed");
  const currentGold=player.Treasury?.goldBalance,currentInfluence=player.DiplomacyTreasury?.diplomacyBalance;
  return{turn:Game.turn,age:Game.age,playerId,targetPlayerId:targetId,gold:currentGold??null,influence:currentInfluence??null,
    aidObserved:Number.isFinite(currentGold)&&Number.isFinite(currentInfluence)&&gold-currentGold===amount&&influence-currentInfluence===cost&&player.Diplomacy.hasAllied(targetId)===true};
})()
