(() => {
  const {target_player_id:targetId,war_type:kind,expected_turn:expectedTurn}=queryArguments;
  const reject=(reason,failureReasons=[])=>({status:"rejected",reason,failureReasons});
  if(![targetId,expectedTurn].every(v=>Number.isInteger(v)&&v>=0)||!["surprise","formal"].includes(kind))return reject("Exact met major, surprise/formal type and expected turn required");
  if(!UI.isInGame())return reject("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId);
  if(!Number.isInteger(playerId)||playerId<0||!player||Game.turn!==expectedTurn||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||targetId===playerId||player.Diplomacy.hasMet(targetId)!==true)return reject("Fresh active turn and met foreign major required");
  const target=Players.get(targetId);
  if(target?.isMajor!==true)return reject("Only explicit met major declarations supported");
  const war=player.Diplomacy.isAtWarWith(targetId);
  if(typeof war!=="boolean")return reject("Current war state unknown");
  const before={turn:Game.turn,age:Game.age,playerId,targetId,atWar:war};
  if(war)return{status:"already_active",before};
  const type=kind==="formal"?DiplomacyActionTypes.DIPLOMACY_ACTION_DECLARE_FORMAL_WAR:DiplomacyActionTypes.DIPLOMACY_ACTION_DECLARE_WAR;
  if(!Number.isInteger(type)||kind==="formal"&&!Number.isInteger(WarTypes.FORMAL_WAR))return reject("Installed native war type unavailable");
  const eligibility=kind==="formal"?player.Diplomacy.canDeclareWarOn(targetId,WarTypes.FORMAL_WAR):player.Diplomacy.canDeclareWarOn(targetId);
  if(eligibility?.Success!==true)return reject("Native declaration eligibility failed",eligibility?.FailureReasons??[]);
  const args={Player1:playerId,Player2:targetId,Type:type},operation=PlayerOperationTypes.DECLARE_WAR;
  const check=Game.PlayerOperations.canStart(playerId,operation,args,false);
  if(check?.Success!==true||check.RequiresConfirmation===true)return reject("Native declaration failed or needs additional confirmation",check?.FailureReasons??[]);
  if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||player.Diplomacy.hasMet(targetId)!==true||target.isMajor!==true||player.Diplomacy.isAtWarWith(targetId)!==false)return reject("War target or game context changed during validation");
  Game.PlayerOperations.sendRequest(playerId,operation,args);
  return{status:"submitted",before,expected:{targetPlayerId:targetId,atWar:true},verificationArguments:{target_player_id:targetId},
    verificationScope:"Bilateral declared war with exact met major. Native alliance/war-support/relationship cascades may occur and are not completely accounted for; no peace terms or turn advancement"};
})()
