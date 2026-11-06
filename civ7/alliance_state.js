(() => {
  if(!UI.isInGame())throw Error('Load a save first');
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),{target_player_id:targetId,expected_allied:desired,before_gold:gold,before_influence:influence,before_wars:baseline}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0||!player||!Number.isInteger(targetId)||targetId<0||targetId===playerId||player.Diplomacy.hasMet(targetId)!==true||typeof desired!=='boolean'||!Array.isArray(baseline)||baseline.length>64||![gold,influence].every(Number.isFinite))throw Error('Invalid captured alliance counterpart/baseline');
  const target=Players.get(targetId);if(target?.isMajor!==true)throw Error('Captured alliance counterpart changed');
  const wars=[];for(const id of Players.getAliveIds())if(id!==playerId&&player.Diplomacy.hasMet(id)===true&&Players.get(id)?.isMajor===true)wars.push({playerId:id,atWar:player.Diplomacy.isAtWarWith(id)});wars.sort((a,b)=>a.playerId-b.playerId);
  const local=player.Diplomacy.hasAllied(targetId),other=target.Diplomacy.hasAllied(playerId);
  return{turn:Game.turn,age:Game.age,playerId,targetPlayerId:targetId,localAllied:local,counterpartAllied:other,knownWarsUnchanged:JSON.stringify(wars)===JSON.stringify(baseline),
    allianceApplied:local===desired&&other===desired&&JSON.stringify(wars)===JSON.stringify(baseline)&&player.Treasury?.goldBalance===gold&&player.DiplomacyTreasury?.diplomacyBalance===influence};
})()
