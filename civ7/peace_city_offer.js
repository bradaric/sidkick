(() => {
  if(!UI.isInGame())throw Error("Load a save first");
  const playerId=GameContext.localPlayerID,{target_player_id:targetId,city_owner:owner,city_id:cityId,x,y}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0)throw Error("No local player");
  const c=peaceCityTerms.city(playerId,targetId,owner,cityId,x,y);if(!c)return{status:"unavailable",reason:"Exact known counterpart and currently visible owner-qualified centre required; no foreign city enumeration"};
  function draft(direction){const w={direction,player1:playerId,player2:targetId},d=peaceCityTerms.snapshot(w,c),offers=[];
    if(direction===DiplomacyDealDirection.OUTGOING){const rows=Game.DiplomacyDeals.getPossibleWorkingDealItems(w,owner,DiplomacyDealItemTypes.CITIES);if(Array.isArray(rows))for(const item of rows)if(peaceCityTerms.cityItem(item,c,playerId,targetId))offers.push({itemToken:JSON.stringify(item)});}
    return{dealToken:d?JSON.stringify(d):null,offers};
  }
  return{turn:Game.turn,age:Game.age,playerId,targetPlayerId:targetId,city:c,outgoing:draft(DiplomacyDealDirection.OUTGOING),incoming:draft(DiplomacyDealDirection.INCOMING),note:"Targeted visible-city metadata/native offer only, no hidden city/asset/private treasury inventory. OFFER city terms only; cooldown and full native draft rechecked on writes"};
})()
