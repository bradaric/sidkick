(() => {
  const same=(a,b)=>a?.owner===b?.owner&&a?.id===b?.id&&a?.type===b?.type;
  function city(playerId,targetId,owner,id,x,y){
    if(![targetId,owner,id,x,y].every(v=>Number.isInteger(v)&&v>=0)||targetId===playerId||![playerId,targetId].includes(owner)||Players.get(playerId).Diplomacy.hasMet(targetId)!==true||Players.get(targetId)?.isMajor!==true||x>=GameplayMap.getGridWidth()||y>=GameplayMap.getGridHeight()||GameplayMap.getRevealedState(playerId,x,y)!==RevealedStates.VISIBLE||GameplayMap.getOwner(x,y)!==owner)return null;
    const at=MapCities.getCity(x,y);if(at?.owner!==owner||at.id!==id||!Number.isInteger(at.type)||at.type<0)return null;
    const c=Cities.get(at);if(!c||!same(c.id,at)||c.owner!==owner||c.location?.x!==x||c.location?.y!==y)return null;
    return{owner,id,componentType:at.type,location:{x,y}};
  }
  function currency(i,playerId,targetId){
    const gold=i?.type===DiplomacyDealItemTypes.GOLD,inf=i?.type===DiplomacyDealItemTypes.INFLUENCE,types=gold?DiplomacyDealItemGoldSubTypes:DiplomacyDealItemInfluenceSubTypes;
    return(gold||inf)&&[types.SMALL_LUMP,types.LARGE_LUMP].includes(i.subType)&&[playerId,targetId].includes(i.from)&&i.to===(i.from===playerId?targetId:playerId)&&Number.isFinite(i.amount)&&i.amount>0&&i.duration===0&&i.isValid===true;
  }
  const cityItem=(i,c,playerId,targetId)=>i?.type===DiplomacyDealItemTypes.CITIES&&i.subType===DiplomacyDealItemCityTransferTypes.OFFER&&i.cityTransferType===DiplomacyDealItemCityTransferTypes.OFFER&&i.from===c.owner&&i.to===(c.owner===playerId?targetId:playerId)&&i.duration===0&&i.isValid!==false&&same(i.cityId,{owner:c.owner,id:c.id,type:c.componentType});
  function snapshot(w,c){
    const d=Game.DiplomacyDeals.getWorkingDeal(w),items=[],seen=new Set();let peace=0;
    if(!d||!Number.isInteger(d.id)||d.id<0||d.isDemand!==false||d.isEnacted!==false||w.direction===DiplomacyDealDirection.INCOMING&&d.isExpired!==false||![d.player1,d.player2].includes(w.player1)||![d.player1,d.player2].includes(w.player2)||d.player1===d.player2||!Array.isArray(d.itemIds)||d.itemIds.length<1||d.itemIds.length>4||new Set(d.itemIds).size!==d.itemIds.length)return null;
    for(const id of d.itemIds){const i=Game.DiplomacyDeals.getWorkingDealItem(w,id);if(!i||i.id!==id)return null;
      if(i.type===DiplomacyDealItemTypes.AGREEMENTS&&i.agreementType===DiplomacyDealItemAgreementTypes.MAKE_PEACE)peace++;
      else{if(seen.has(i.type)||!(currency(i,w.player1,w.player2)||cityItem(i,c,w.player1,w.player2)))return null;seen.add(i.type);}items.push(JSON.parse(JSON.stringify(i)));}
    return peace===1?{workingDealId:w,dealId:d.id,items}:null;
  }
  const normalize=items=>items.map(i=>i.type===DiplomacyDealItemTypes.AGREEMENTS?{type:i.type,agreementType:i.agreementType}:i.type===DiplomacyDealItemTypes.CITIES?
    {type:i.type,subType:i.subType,cityTransferType:i.cityTransferType,from:i.from,to:i.to,duration:i.duration,cityId:{owner:i.cityId.owner,id:i.cityId.id,type:i.cityId.type}}:
    {type:i.type,subType:i.subType,from:i.from,to:i.to,amount:i.amount,duration:i.duration}).sort((a,b)=>a.type-b.type);
  function ledger(playerId){const ids=Players.get(playerId).Cities.getCities().filter(c=>c.id.owner===playerId).map(c=>({owner:c.id.owner,id:c.id.id,type:c.id.type})).sort((a,b)=>a.id-b.id);
    return ids.length<=256&&ids.every(id=>[id.id,id.type].every(v=>Number.isInteger(v)&&v>=0))&&new Set(ids.map(id=>id.id)).size===ids.length?ids:null;
  }
  return{city,currency,cityItem,snapshot,normalize,ledger,same};
})()
