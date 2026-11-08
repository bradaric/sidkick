(() => {
  const {target_player_id:targetId,action,deal_token:token,item_token:itemToken,item_id:itemId,max_gold_cost:goldCap,max_influence_cost:influenceCap,expected_turn:expectedTurn}=queryArguments,reject=reason=>({status:"rejected",reason});
  if(![targetId,expectedTurn].every(v=>Number.isInteger(v)&&v>=0)||!["add","remove","propose","accept","reject"].includes(action)||typeof token!=="string"||!token||token.length>100000||![goldCap,influenceCap].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0))return reject("Exact known counterpart, economic peace action/draft token, finite gross spending caps and expected turn required");
  if(!UI.isInGame())return reject("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),incoming=["accept","reject"].includes(action),initialAge=Game.age;
  if(!Number.isInteger(playerId)||playerId<0||!player||targetId===playerId||Game.turn!==expectedTurn||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||player.Diplomacy.hasMet(targetId)!==true||Players.get(targetId)?.isMajor!==true||player.Diplomacy.isAtWarWith(targetId)!==true||player.Diplomacy.canMakePeaceWith(targetId)?.Success!==true)return reject("Fresh active existing met-major war and native peace eligibility required");
  const direction=incoming?DiplomacyDealDirection.INCOMING:DiplomacyDealDirection.OUTGOING,working={direction,player1:playerId,player2:targetId};
  const pending=Game.DiplomacyDeals.hasPendingDeal(playerId,targetId);if(incoming?pending!==true:pending!==false)return reject("Outgoing edits must not overwrite pending negotiation; responses require a pending incoming deal");
  function currency(item){
    const gold=item?.type===DiplomacyDealItemTypes.GOLD,influence=item?.type===DiplomacyDealItemTypes.INFLUENCE,types=gold?DiplomacyDealItemGoldSubTypes:DiplomacyDealItemInfluenceSubTypes;
    return(gold||influence)&&[types.SMALL_LUMP,types.LARGE_LUMP].includes(item.subType)&&[playerId,targetId].includes(item.from)&&item.to===(item.from===playerId?targetId:playerId)&&Number.isFinite(item.amount)&&item.amount>0&&item.duration===0&&item.isValid===true;
  }
  function snapshot(){
    const d=Game.DiplomacyDeals.getWorkingDeal(working);
    if(!d||!Number.isInteger(d.id)||d.id<0||d.isDemand!==false||d.isEnacted!==false||incoming&&d.isExpired!==false||![d.player1,d.player2].includes(playerId)||![d.player1,d.player2].includes(targetId)||d.player1===d.player2||!Array.isArray(d.itemIds)||d.itemIds.length<1||d.itemIds.length>3||new Set(d.itemIds).size!==d.itemIds.length)return null;
    const items=[],currencies=new Set();let peace=0;
    for(const id of d.itemIds){const item=Game.DiplomacyDeals.getWorkingDealItem(working,id);if(!item||item.id!==id)return null;
      if(item.type===DiplomacyDealItemTypes.AGREEMENTS&&item.agreementType===DiplomacyDealItemAgreementTypes.MAKE_PEACE)peace++;
      else{if(!currency(item)||currencies.has(item.type))return null;currencies.add(item.type);}items.push(JSON.parse(JSON.stringify(item)));}
    return peace===1?{workingDealId:working,dealId:d.id,items}:null;
  }
  const draft=snapshot(),gold=player.Treasury?.goldBalance,influence=player.DiplomacyTreasury?.diplomacyBalance;
  if(!draft||JSON.stringify(draft)!==token||![gold,influence].every(v=>Number.isFinite(v)&&v>=0))return reject("Complete economic draft/token or currency balances stale/unknown; only peace plus one Gold/one Influence lump, never other assets");
  const before={turn:expectedTurn,age:initialAge,playerId,draft,gold,influence};let selected=null,expectedItems=draft.items;
  if(action==="add"){
    if(typeof itemToken!=="string"||!itemToken||itemToken.length>10000)return reject("Exact native offered currency item token required");
    const offers=[];for(const from of [playerId,targetId])for(const type of [DiplomacyDealItemTypes.GOLD,DiplomacyDealItemTypes.INFLUENCE]){
      const rows=Game.DiplomacyDeals.getPossibleWorkingDealItems(working,from,type);if(!Array.isArray(rows))return reject("Native economic offer inventory unknown");
      offers.push(...rows.filter(item=>item.from===from&&item.type===type&&currency(item)&&JSON.stringify(item)===itemToken));}
    if(offers.length!==1||draft.items.some(item=>item.type===offers[0].type))return reject("One unique valid offered lump required, with no existing same-currency term");
    selected=JSON.parse(JSON.stringify(offers[0]));expectedItems=[...draft.items,selected];
  }else if(action==="remove"){
    if(!Number.isInteger(itemId)||itemId<0)return reject("Exact existing economic item ID required");
    const rows=draft.items.filter(item=>item.id===itemId&&currency(item));if(rows.length!==1)return reject("Can remove only an exact existing economic term, never the peace agreement");
    selected=rows[0];expectedItems=draft.items.filter(item=>item.id!==itemId);
  }
  const out=(items,type)=>items.filter(i=>i.type===type&&i.from===playerId).reduce((n,i)=>n+i.amount,0);
  if(out(expectedItems,DiplomacyDealItemTypes.GOLD)>Math.min(goldCap,gold)||out(expectedItems,DiplomacyDealItemTypes.INFLUENCE)>Math.min(influenceCap,influence))return reject("Gross local economic obligations exceed acknowledged caps/balances");
  const net=(type)=>draft.items.filter(i=>i.type===type).reduce((n,i)=>n+(i.to===playerId?i.amount:-i.amount),0);
  const normalize=items=>items.map(i=>i.type===DiplomacyDealItemTypes.AGREEMENTS?{type:i.type,agreementType:i.agreementType}:{type:i.type,subType:i.subType,from:i.from,to:i.to,amount:i.amount,duration:i.duration}).sort((a,b)=>a.type-b.type);
  const fresh=snapshot();
  if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||player.Diplomacy.isAtWarWith(targetId)!==true||Game.DiplomacyDeals.hasPendingDeal(playerId,targetId)!==pending||player.Treasury.goldBalance!==gold||player.DiplomacyTreasury.diplomacyBalance!==influence||JSON.stringify(fresh)!==token)return reject("Economic peace terms, obligations, balances or context changed during validation");
  if(action==="add")Game.DiplomacyDeals.addItemToWorkingDeal(working,selected);
  else if(action==="remove")Game.DiplomacyDeals.removeItemFromWorkingDeal(working,itemId);
  else Game.DiplomacyDeals.sendWorkingDeal(working,action==="propose"?DiplomacyDealProposalActions.PROPOSED:action==="accept"?DiplomacyDealProposalActions.ACCEPTED:DiplomacyDealProposalActions.REJECTED);
  return{status:"submitted",before,expected:{[action==="add"||action==="remove"?"draftTermsApplied":action==="propose"?"proposalObserved":action==="accept"?"peaceTermsApplied":"rejectionObserved"]:true},
    verificationArguments:{target_player_id:targetId,action,direction,expected_items:normalize(expectedItems),before_gold:gold,before_influence:influence,expected_gold:gold+net(DiplomacyDealItemTypes.GOLD),expected_influence:influence+net(DiplomacyDealItemTypes.INFLUENCE)},
    verificationScope:"One native economic draft edit or exact-token proposal/response, no automatic send/acceptance. Edits prove full normalized terms and unchanged currencies; acceptance proves bilateral peace and agreed own currency deltas. No settlement/unit/work/captive concessions or full diplomacy effect accounting"};
})()
