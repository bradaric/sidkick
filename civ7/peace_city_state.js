(() => {
  if(!UI.isInGame())throw Error("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),{target_player_id:targetId,city_owner:owner,city_id:cityId,city_component_type:componentType,x,y,recipient,direction,expected_items:expected,baseline_cities:baseline,before_gold:gold,before_influence:influence,expected_gold:expectedGold,expected_influence:expectedInfluence}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0||!player||![targetId,owner,cityId,componentType,x,y,recipient].every(v=>Number.isInteger(v)&&v>=0)||player.Diplomacy.hasMet(targetId)!==true||!Array.isArray(baseline)||!Array.isArray(expected))throw Error('Invalid captured city peace identity/ledger');
  const current=peaceCityTerms.ledger(playerId);if(!current)throw Error('Owned city ledger unknown');
  const c=peaceCityTerms.city(playerId,targetId,owner,cityId,x,y),w={direction,player1:playerId,player2:targetId},d=c?peaceCityTerms.snapshot(w,c):null;
  const pending=Game.DiplomacyDeals.hasPendingDeal(playerId,targetId),war=player.Diplomacy.isAtWarWith(targetId),foreignWar=Players.get(targetId)?.Diplomacy.isAtWarWith(playerId),peace=war===false&&foreignWar===false,balance=player.Treasury?.goldBalance,currentInfluence=player.DiplomacyTreasury?.diplomacyBalance;
  let transferred=false,otherCitiesPreserved=false;
  if(GameplayMap.getRevealedState(playerId,x,y)===RevealedStates.VISIBLE){const at=MapCities.getCity(x,y);
    if(at?.owner===recipient&&Number.isInteger(at.id)&&Number.isInteger(at.type)){const city=Cities.get(at);transferred=peaceCityTerms.same(city?.id,at)&&city.owner===recipient&&city.location?.x===x&&city.location?.y===y;
      const unaffected=baseline.filter(id=>!(owner===playerId&&id.id===cityId&&id.type===componentType)),added=current.filter(id=>!unaffected.some(old=>peaceCityTerms.same(id,old)));
      otherCitiesPreserved=unaffected.every(id=>current.some(next=>peaceCityTerms.same(id,next)))&&(owner===playerId?current.length===baseline.length-1&&added.length===0:current.length===baseline.length+1&&added.length===1&&peaceCityTerms.same(added[0],at));
    }
  }
  return{turn:Game.turn,age:Game.age,playerId,targetPlayerId:targetId,cityDraftApplied:Boolean(d&&JSON.stringify(peaceCityTerms.normalize(d.items))===JSON.stringify(expected)&&JSON.stringify(current)===JSON.stringify(baseline)&&balance===gold&&currentInfluence===influence),
    cityPeaceApplied:peace&&transferred&&otherCitiesPreserved&&balance===expectedGold&&currentInfluence===expectedInfluence,proposalObserved:pending===true||peace,rejectionObserved:pending===false&&war===true&&foreignWar===true,cityTransferred:transferred,otherCitiesPreserved,pendingDeal:pending,atPeace:peace};
})()
