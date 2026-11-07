(() => {
  const {target_player_id:targetId,greeting,max_influence_cost:cap,notification_token:token,expected_turn:expectedTurn}=queryArguments,reject=(reason,failureReasons=[])=>({status:'rejected',reason,failureReasons});
  if(![targetId,expectedTurn].every(v=>Number.isInteger(v)&&v>=0)||!['friendly','neutral','unfriendly'].includes(greeting)||!Number.isFinite(cap)||cap<0||typeof token!=='string'||!token||token.length>100000)return reject('Exact pending first-meet target/token, fixed greeting, finite Influence cap and expected turn required');
  if(!firstMeet.ready())return reject('Finish loading and click Begin first; native GameStarted readiness is required');
  const playerId=GameContext.localPlayerID,player=Players.get(playerId);
  if(!Number.isInteger(playerId)||playerId<0||!player||Game.turn!==expectedTurn||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false)return reject('Fresh active local turn required');
  const before=firstMeet.snapshot(playerId,targetId);
  if(!before||before.notificationToken!==token)return reject('No unique pending PLAYER_MET choice or its displayed notification/quote/context token is stale');
  if(before.supportedProfile!==true)return reject('A ready peaceful nonallied first-meet with known balances, relationship and history is required');
  const selected=before.options.find(o=>o.greeting===greeting),cost=selected?.quotedInfluenceCost,delta=selected?.quotedRelationshipDelta;
  if(selected?.availableNow!==true||cost===null||delta===null||cost>cap)return reject('Selected native greeting/quote is blocked, unknown, unaffordable or over cap',selected?.failureReasons??[]);
  const latest=firstMeet.snapshot(playerId,targetId);
  const quote=Game.Diplomacy.getFirstMeetResponseCostAndRelDelta(selected.type,playerId),notices=firstMeet.pending(playerId,targetId),history=player.Diplomacy.getPlayerRelationshipHistory(targetId);
  if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||!firstMeet.ready()||latest?.notificationToken!==token||
      player.Treasury.goldBalance!==before.gold||player.DiplomacyTreasury.diplomacyBalance!==before.influence||player.Diplomacy.getRelationshipLevel(targetId)!==before.relationship||player.Diplomacy.isAtWarWith(targetId)!==false||player.Diplomacy.hasAllied(targetId)!==false||
      !Array.isArray(quote)||quote[0]!==cost||quote[1]!==delta||!Array.isArray(history)||JSON.stringify(history)!==before.historyToken||JSON.stringify(notices)!==JSON.stringify([{notification:before.notification,addedOnTurn:before.addedOnTurn}]))return reject('Pending first-meet, quote, balances, relationship/history or loading/context changed during validation');
  const verificationArguments={target_player_id:targetId,notification:before.notification,before_gold:before.gold,expected_influence:before.influence-cost,expected_relationship:before.relationship+delta,before_allied:before.allied};
  Game.PlayerOperations.sendRequest(playerId,PlayerOperationTypes.RESPOND_DIPLOMATIC_FIRST_MEET,{Player1:playerId,Player2:targetId,Type:selected.type});
  return{status:'submitted',before,quotedInfluenceCost:cost,quotedRelationshipDelta:delta,expected:{firstMeetApplied:true},verificationArguments,
    verificationScope:'Exactly one native greeting bound to an active blocking PLAYER_MET notification. Verifies notification clearance, exact own Influence debit/relationship delta and stable Gold/peace/alliance. Friendly may reveal capitals; not full reveal/relationship/global-effect accounting or UI-session closure. No manufactured pending choice, turn, notification dismissal or retry'};
})()
