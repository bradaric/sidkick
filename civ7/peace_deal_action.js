(() => {
  const {target_player_id:targetId,action,expected_turn:expectedTurn,deal_token:token=null}=queryArguments,reject=(reason,failureReasons=[])=>({status:"rejected",reason,failureReasons});
  if(![targetId,expectedTurn].every(v=>Number.isInteger(v)&&v>=0)||!["prepare","propose","accept","reject"].includes(action)||(action!=="prepare"&&(typeof token!=="string"||!token||token.length>100000)))return reject("Exact met major, supported white-peace action/token and expected turn required");
  if(!UI.isInGame())return reject("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId);
  if(!Number.isInteger(playerId)||playerId<0||!player||targetId===playerId||Game.turn!==expectedTurn||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||player.Diplomacy.hasMet(targetId)!==true)return reject("Fresh active turn and met foreign major required");
  const target=Players.get(targetId);if(target?.isMajor!==true||player.Diplomacy.isAtWarWith(targetId)!==true)return reject("White-peace family requires an existing major-player war");
  const before={turn:Game.turn,age:Game.age,playerId,targetId};
  const eligibility=player.Diplomacy.canMakePeaceWith(targetId);
  if(eligibility?.Success!==true)return reject("Native peace negotiation eligibility failed",eligibility?.FailureReasons??[]);
  const incoming=["accept","reject"].includes(action),direction=incoming?DiplomacyDealDirection.INCOMING:DiplomacyDealDirection.OUTGOING;
  const workingId={direction,player1:playerId,player2:targetId};
  function snapshot(){
    const d=Game.DiplomacyDeals.getWorkingDeal(workingId);
    if(!d||!Number.isInteger(d.id)||d.id<0||![d.player1,d.player2].includes(playerId)||![d.player1,d.player2].includes(targetId)||d.player1===d.player2||d.isDemand!==false||d.isEnacted!==false||incoming&&d.isExpired!==false||!Array.isArray(d.itemIds)||d.itemIds.length>1||d.itemIds.some(id=>!Number.isInteger(id)||id<0))return null;
    const items=[];for(const id of d.itemIds){const item=Game.DiplomacyDeals.getWorkingDealItem(workingId,id);if(!item||item.id!==id||item.type!==DiplomacyDealItemTypes.AGREEMENTS||item.agreementType!==DiplomacyDealItemAgreementTypes.MAKE_PEACE)return null;items.push(JSON.parse(JSON.stringify(item)));}
    return{workingDealId:workingId,dealId:d.id,items};
  }
  const pending=Game.DiplomacyDeals.hasPendingDeal(playerId,targetId);
  if(typeof pending!=="boolean"||(incoming?!pending:pending))return reject("Incoming response requires an existing pending deal; outgoing work must not overwrite one");
  const draft=snapshot();if(!draft)return reject("Working deal contains unknown, non-white-peace, demand, expired incoming or mismatched terms; no clearing/overwriting");
  before.deal=draft;
  if(action==="prepare"&&draft.items.length===1)return{status:"already_active",before,dealToken:JSON.stringify(draft),verificationScope:"Existing exact white-peace draft preserved; no proposal sent"};
  if(action!=="prepare"&&(draft.items.length!==1||JSON.stringify(draft)!==token))return reject("Exact single-agreement white-peace token is stale/empty");
  if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||player.Diplomacy.hasMet(targetId)!==true||player.Diplomacy.isAtWarWith(targetId)!==true||
      Game.DiplomacyDeals.hasPendingDeal(playerId,targetId)!==pending||JSON.stringify(snapshot())!==JSON.stringify(draft))return reject("Peace working terms, counterpart, pending status or game context changed during validation");
  if(action==="prepare")Game.DiplomacyDeals.addItemToWorkingDeal(workingId,{type:DiplomacyDealItemTypes.AGREEMENTS,agreementType:DiplomacyDealItemAgreementTypes.MAKE_PEACE});
  else Game.DiplomacyDeals.sendWorkingDeal(workingId,action==="propose"?DiplomacyDealProposalActions.PROPOSED:action==="accept"?DiplomacyDealProposalActions.ACCEPTED:DiplomacyDealProposalActions.REJECTED);
  return{status:"submitted",before,expected:{[action==="prepare"?"draftPrepared":action==="propose"?"proposalObserved":action==="accept"?"peaceEstablished":"rejectionObserved"]:true},verificationArguments:{target_player_id:targetId,action,direction},
    verificationScope:"Prepare changes only exact empty outgoing draft, never discards existing work. Propose proves pending negotiation or actual bilateral peace; acceptance proves bilateral peace, rejection cleared pending deal with war retained. White-peace agreement only: no Gold, Influence, settlement, unit, captive or other concessions; no full diplomatic cascade or turn claim"};
})()
