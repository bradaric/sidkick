(() => {
  if(!UI.isInGame())throw Error('Load a save first');
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),{event_id:eventId,target_player_id:targetId,action_type:actionType,initial,before_gold:gold,expected_influence:influence,expected_support:expected}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0||!player||![eventId,targetId].every(v=>Number.isInteger(v)&&v>=0)||!Number.isInteger(actionType)||typeof initial!=='boolean'||!Array.isArray(expected)||expected.length>64||![gold,influence].every(Number.isFinite)||player.Diplomacy.hasMet(targetId)!==true)throw Error('Invalid captured own-war support baseline');
  const rows=Game.Diplomacy.getPlayerEvents(targetId);if(!Array.isArray(rows))throw Error('Own war inventory unknown');
  const matches=rows.filter(e=>e.uniqueID===eventId),e=matches.length===1?matches[0]:null;
  const warPreserved=Boolean(e&&e.actionType===actionType&&e.initialPlayer===(initial?playerId:targetId)&&e.targetPlayer===(initial?targetId:playerId)&&e.hidden===false&&e.revealed===true&&e.failed===false&&e.gameTurnEnd===-1&&Game.Diplomacy.isProjectCanceled(eventId)===false&&player.Diplomacy.isAtWarWith(targetId)===true);
  const support=[];for(const p of expected){if(!Number.isInteger(p.playerId)||p.playerId<0||p.playerId!==playerId&&player.Diplomacy.hasMet(p.playerId)!==true)throw Error('Captured known participant changed');
    support.push({playerId:p.playerId,support:Game.Diplomacy.getNumSupportEnvoysForPlayer(eventId,p.playerId),oppose:Game.Diplomacy.getNumOpposeEnvoysForPlayer(eventId,p.playerId)});}
  return{turn:Game.turn,age:Game.age,playerId,eventId,warPreserved,support,warSupportApplied:warPreserved&&JSON.stringify(support)===JSON.stringify(expected)&&player.Treasury?.goldBalance===gold&&player.DiplomacyTreasury?.diplomacyBalance===influence};
})()
