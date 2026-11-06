(() => {
  if(!UI.isInGame())throw Error("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),{target_player_id:targetId,direction}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0||!player||!Number.isInteger(targetId)||targetId<0||targetId===playerId||player.Diplomacy.hasMet(targetId)!==true||![DiplomacyDealDirection.OUTGOING,DiplomacyDealDirection.INCOMING].includes(direction))throw Error("Invalid captured known peace counterpart/direction");
  const target=Players.get(targetId);if(target?.isMajor!==true)throw Error("Captured major identity changed");
  const workingId={direction,player1:playerId,player2:targetId},d=Game.DiplomacyDeals.getWorkingDeal(workingId),items=[];
  let supported=Boolean(d&&Number.isInteger(d.id)&&d.id>=0&&d.isDemand===false&&Array.isArray(d.itemIds)&&d.itemIds.length===1&&[d.player1,d.player2].includes(playerId)&&[d.player1,d.player2].includes(targetId)&&d.player1!==d.player2);
  if(supported)for(const id of d.itemIds){const item=Game.DiplomacyDeals.getWorkingDealItem(workingId,id);if(!item||item.id!==id||item.type!==DiplomacyDealItemTypes.AGREEMENTS||item.agreementType!==DiplomacyDealItemAgreementTypes.MAKE_PEACE){supported=false;break;}items.push(JSON.parse(JSON.stringify(item)));}
  const pending=Game.DiplomacyDeals.hasPendingDeal(playerId,targetId),war=player.Diplomacy.isAtWarWith(targetId),foreignWar=target.Diplomacy?.isAtWarWith(playerId),peace=war===false&&foreignWar===false;
  return{turn:Game.turn,age:Game.age,playerId,targetPlayerId:targetId,peaceEstablished:peace,pendingDeal:typeof pending==="boolean"?pending:null,
    draftPrepared:supported&&d.isEnacted===false,dealToken:supported?JSON.stringify({workingDealId:workingId,dealId:d.id,items}):null,
    proposalObserved:pending===true||peace,rejectionObserved:pending===false&&war===true&&foreignWar===true,
    note:"Pending negotiation is not peace. Only one MAKE_PEACE agreement is supported; no concessions or foreign settlement inventory exposed"};
})()
