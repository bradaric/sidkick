(() => {
  const {target_player_id:targetId,action,expected_turn:expectedTurn}=queryArguments,reject=(reason,failureReasons=[])=>({status:'rejected',reason,failureReasons});
  if(![targetId,expectedTurn].every(v=>Number.isInteger(v)&&v>=0)||!['form','cancel'].includes(action))return reject('Exact met major, form/cancel intent and expected turn required');
  if(!UI.isInGame())return reject('Load a save first');
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),target=Number.isInteger(playerId)&&player&&player.Diplomacy.hasMet(targetId)===true?Players.get(targetId):null,age=Game.age;
  if(!Number.isInteger(playerId)||playerId<0||targetId===playerId||!target||target.isMajor!==true||Game.turn!==expectedTurn||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||player.Diplomacy.isAtWarWith(targetId)!==false||Game.DiplomacyDeals.hasPendingDeal(playerId,targetId)!==false)return reject('Fresh active peaceful met major with no pending deal required');
  const desired=action==='form',local=player.Diplomacy.hasAllied(targetId),other=target.Diplomacy.hasAllied(playerId),def=GameInfo.DiplomacyActions.lookup('DIPLOMACY_ACTION_FORM_ALLIANCE');
  if(typeof local!=='boolean'||local!==other||def?.DiplomacyActionType!=='DIPLOMACY_ACTION_FORM_ALLIANCE'||!Number.isInteger(def.$hash))return reject('Bilateral alliance flags and installed definition must be coherent');
  if(local===desired)return{status:desired?'already_active':'already_inactive',before:{turn:expectedTurn,age,playerId,targetPlayerId:targetId,allied:local}};
  if(!desired&&(def.CancelPenalty!==0||def.UnsupportPenalty!==0))return reject('Cancellation requires known zero native definition penalties; no inferred paid cancellation');
  const operation=desired?PlayerOperationTypes.FORM_ALLIANCE:PlayerOperationTypes.CANCEL_ALLIANCE,args={Player1:playerId,Player2:targetId,Type:def.$hash};
  function formQuote(){
    if(!desired)return true;
    const rows=Game.Diplomacy.getProjectDataForUI(playerId,targetId,DiplomacyActionTargetTypes.NO_DIPLOMACY_TARGET,DiplomacyActionGroups.NO_DIPLOMACY_ACTION_GROUP,-1,DiplomacyActionTargetTypes.NO_DIPLOMACY_TARGET);
    if(!Array.isArray(rows))return false;const offered=rows.filter(r=>r.actionTypeName===def.DiplomacyActionType&&r.projectStatus===DiplomacyProjectStatus.PROJECT_AVAILABLE);
    if(offered.length!==1)return false;const r=offered[0],selected=r.targetList1?.filter(t=>t.targetID===targetId);
    return r.actionType===def.$hash&&r.operationType===operation&&Array.isArray(r.targetList2)&&r.targetList2.length===0&&[DiplomacyActionTargetTypes.NO_DIPLOMACY_TARGET,DiplomacyActionTargetTypes.DIPLOMACY_TARGET_NONE].includes(r.target2Type)&&selected?.length===1&&selected[0].costYieldD===0;
  }
  if(!Number.isInteger(operation)||!formQuote())return reject('Unique exact native zero-cost alliance offer required; no secondary terms or inferred price');
  function wars(){const ids=Players.getAliveIds();if(!Array.isArray(ids)||ids.length>64)return null;const out=[];
    for(const id of ids)if(id!==playerId&&player.Diplomacy.hasMet(id)===true&&Players.get(id)?.isMajor===true){const atWar=player.Diplomacy.isAtWarWith(id);if(typeof atWar!=='boolean')return null;out.push({playerId:id,atWar});}
    return out.sort((a,b)=>a.playerId-b.playerId);
  }
  const baseline=wars(),gold=player.Treasury?.goldBalance,influence=player.DiplomacyTreasury?.diplomacyBalance;
  if(!baseline||![gold,influence].every(Number.isFinite))return reject('Known local war/balance baseline required');
  const check=Game.PlayerOperations.canStart(playerId,operation,args,false);
  if(check?.Success!==true||check.RequiresConfirmation===true||check.InsufficientFunds===true||check.Cost!==undefined&&check.Cost!==0)return reject('Native alliance operation rejected, nonzero quoted cost or unsupported confirmation',check?.FailureReasons??[]);
  if(Game.turn!==expectedTurn||Game.age!==age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||player.Diplomacy.hasAllied(targetId)!==local||target.Diplomacy.hasAllied(playerId)!==other||Game.DiplomacyDeals.hasPendingDeal(playerId,targetId)!==false||
      !formQuote()||JSON.stringify(wars())!==JSON.stringify(baseline)||player.Treasury.goldBalance!==gold||player.DiplomacyTreasury.diplomacyBalance!==influence)return reject('Alliance, native offer, local wars, balances or context changed');
  Game.PlayerOperations.sendRequest(playerId,operation,args);
  return{status:'submitted',before:{turn:expectedTurn,age,playerId,targetPlayerId:targetId,allied:local,gold,influence,wars:baseline},expected:{allianceApplied:true},verificationArguments:{target_player_id:targetId,expected_allied:desired,before_gold:gold,before_influence:influence,before_wars:baseline},
    verificationScope:'Exact native bilateral alliance formation/cancellation, unchanged own balances and captured known local wars. Formation needs actual zero-cost native offer; cancellation zero definition penalties. Access/relationships/projects/diplomatic cascades can change and are not fully accounted for. No forced eligibility, turn, automatic repair or retry'};
})()
