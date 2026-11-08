(() => {
  const {event_id:eventId,target_player_id:targetId,max_influence_cost:cap,expected_turn:expectedTurn}=queryArguments,reject=(reason,failureReasons=[])=>({status:'rejected',reason,failureReasons});
  if(![eventId,targetId,expectedTurn].every(v=>Number.isInteger(v)&&v>=0)||typeof cap!=='number'||!Number.isFinite(cap)||cap<0)return reject('Exact own-war event/counterpart, Influence cap and expected turn required');
  if(!UI.isInGame())return reject('Load a save first');
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),age=Game.age;
  if(!Number.isInteger(playerId)||playerId<0||!player||targetId===playerId||Game.turn!==expectedTurn||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||player.Diplomacy.hasMet(targetId)!==true||Players.get(targetId)?.isMajor!==true||player.Diplomacy.isAtWarWith(targetId)!==true)return reject('Fresh active own war with exact met major counterpart required');
  const find=()=>{
    const rows=Game.Diplomacy.getPlayerEvents(targetId);if(!Array.isArray(rows))return null;
    const matches=rows.filter(e=>e.uniqueID===eventId);if(matches.length!==1)return null;const e=matches[0],d=GameInfo.DiplomacyActions.lookup(e.actionType);
    return [e.initialPlayer,e.targetPlayer].includes(playerId)&&[e.initialPlayer,e.targetPlayer].includes(targetId)&&e.initialPlayer!==e.targetPlayer&&e.hidden===false&&e.revealed===true&&e.failed===false&&e.gameTurnEnd===-1&&
      ['DIPLOMACY_ACTION_DECLARE_WAR','DIPLOMACY_ACTION_DECLARE_FORMAL_WAR'].includes(e.actionTypeName)&&d?.$hash===e.actionType&&d.DiplomacyActionType===e.actionTypeName&&Game.Diplomacy.isProjectCanceled(eventId)===false?
      {initialPlayer:e.initialPlayer,targetPlayer:e.targetPlayer,actionType:e.actionType,startTurn:e.gameTurnStart}:null;
  };
  const source=find();if(!source)return reject('Exact ongoing revealed own war required; no backing unrelated foreign wars');
  const initial=source.initialPlayer===playerId,quote=()=>Game.Diplomacy.getInfluenceForNextSupport(eventId,playerId,initial),cost=quote(),gold=player.Treasury?.goldBalance,influence=player.DiplomacyTreasury?.diplomacyBalance;
  if(!Number.isFinite(cost)||cost<0||cost>cap||!Number.isFinite(gold)||!Number.isFinite(influence)||cost>influence)return reject('Exact native next-support Influence quote required within cap/balance');
  const known=()=>Players.getAliveIds().filter(id=>id===playerId||player.Diplomacy.hasMet(id)===true).sort((a,b)=>a-b);
  const ids=known();if(ids.length>64||new Set(ids).size!==ids.length||!ids.includes(playerId)||!ids.includes(targetId))return reject('Known local/met participant inventory unavailable');
  function support(){const out=[];for(const id of ids){const support=Game.Diplomacy.getNumSupportEnvoysForPlayer(eventId,id),oppose=Game.Diplomacy.getNumOpposeEnvoysForPlayer(eventId,id);if(![support,oppose].every(n=>Number.isInteger(n)&&n>=0&&n<=1000))return null;out.push({playerId:id,support,oppose});}return out;}
  const baseline=support();if(!baseline)return reject('Known native war-support counters required');
  const args={ID:eventId,Type:DiplomacyTokenTypes.DIPLOMACY_TOKEN_GLOBAL,Amount:1,SubType:initial},operation=PlayerOperationTypes.SUPPORT_DIPLOMATIC_ACTION;
  const check=Game.PlayerOperations.canStart(playerId,operation,args,false);if(check?.Success!==true||check.RequiresConfirmation===true||check.InsufficientFunds===true)return reject('Native own-war support rejected or requires confirmation',check?.FailureReasons??[]);
  if(Game.turn!==expectedTurn||Game.age!==age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||player.Diplomacy.isAtWarWith(targetId)!==true||JSON.stringify(find())!==JSON.stringify(source)||JSON.stringify(known())!==JSON.stringify(ids)||JSON.stringify(support())!==JSON.stringify(baseline)||quote()!==cost||player.Treasury.goldBalance!==gold||player.DiplomacyTreasury.diplomacyBalance!==influence)return reject('War, native quote, support counts, balances or context changed');
  const expected=baseline.map(p=>({...p,...(p.playerId===playerId?initial?{support:p.support+1}:{oppose:p.oppose+1}:{})}));
  Game.PlayerOperations.sendRequest(playerId,operation,args);
  return{status:'submitted',before:{turn:expectedTurn,age,playerId,source,support:baseline,gold,influence},quotedInfluenceCost:cost,expected:{warSupportApplied:true},verificationArguments:{event_id:eventId,target_player_id:targetId,action_type:source.actionType,initial,before_gold:gold,expected_influence:influence-cost,expected_support:expected},
    verificationScope:'Exactly one token backing own side of existing war, exact native Influence debit, Gold unchanged and every captured local/met support/opposition count preserved except chosen increment. Not a complete strength/yield/global diplomacy or unmet-support inventory claim; no third-party war, turn or retry'};
})()
