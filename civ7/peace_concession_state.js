(() => {
  if(!UI.isInGame())throw Error("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),{target_player_id:targetId,direction,expected_items:expected,before_gold:gold,before_influence:influence,expected_gold:expectedGold,expected_influence:expectedInfluence}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0||!player||!Number.isInteger(targetId)||targetId<0||targetId===playerId||player.Diplomacy.hasMet(targetId)!==true||Players.get(targetId)?.isMajor!==true||![DiplomacyDealDirection.OUTGOING,DiplomacyDealDirection.INCOMING].includes(direction)||!Array.isArray(expected))throw Error("Invalid captured economic peace counterpart/terms");
  const working={direction,player1:playerId,player2:targetId},d=Game.DiplomacyDeals.getWorkingDeal(working),items=[];
  let supported=Boolean(d&&d.isDemand===false&&Array.isArray(d.itemIds)&&d.itemIds.length>=1&&d.itemIds.length<=3),peaceCount=0;const types=new Set();
  if(supported)for(const id of d.itemIds){const i=Game.DiplomacyDeals.getWorkingDealItem(working,id);if(!i||i.id!==id){supported=false;break;}
    if(i.type===DiplomacyDealItemTypes.AGREEMENTS&&i.agreementType===DiplomacyDealItemAgreementTypes.MAKE_PEACE){peaceCount++;items.push({type:i.type,agreementType:i.agreementType});}
    else if([DiplomacyDealItemTypes.GOLD,DiplomacyDealItemTypes.INFLUENCE].includes(i.type)&&!types.has(i.type)&&[playerId,targetId].includes(i.from)&&i.to===(i.from===playerId?targetId:playerId)&&Number.isFinite(i.amount)&&i.amount>0&&i.duration===0){types.add(i.type);items.push({type:i.type,subType:i.subType,from:i.from,to:i.to,amount:i.amount,duration:i.duration});}else{supported=false;break;}}
  items.sort((a,b)=>a.type-b.type);supported=supported&&peaceCount===1;
  const balance=player.Treasury?.goldBalance,currentInfluence=player.DiplomacyTreasury?.diplomacyBalance,pending=Game.DiplomacyDeals.hasPendingDeal(playerId,targetId),war=player.Diplomacy.isAtWarWith(targetId),foreignWar=Players.get(targetId).Diplomacy.isAtWarWith(playerId),peace=war===false&&foreignWar===false;
  return{turn:Game.turn,age:Game.age,playerId,targetPlayerId:targetId,draftTermsApplied:supported&&d.isEnacted===false&&JSON.stringify(items)===JSON.stringify(expected)&&balance===gold&&currentInfluence===influence,
    proposalObserved:pending===true||peace,peaceTermsApplied:peace&&balance===expectedGold&&currentInfluence===expectedInfluence,rejectionObserved:pending===false&&war===true&&foreignWar===true,
    pendingDeal:pending,atPeace:peace,note:"Native pending proposal is not acceptance; own exact agreed economic deltas do not account for all diplomatic effects"};
})()
