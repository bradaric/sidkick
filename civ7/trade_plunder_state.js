(() => {
  if(!UI.isInGame())throw Error("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),{unit_id:unitId,unit_type:unitType,component_type:componentType,location,before_moves:moves,before_gold:gold}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0||!player||![unitId,componentType,location?.x,location?.y].every(v=>Number.isInteger(v)&&v>=0)||!Number.isInteger(unitType)||!Number.isFinite(moves)||moves<=0||!Number.isFinite(gold))throw Error("Invalid captured trade plunder identity/treasury");
  const units=player.Units.getUnits().filter(u=>u.id.owner===playerId&&u.id.id===unitId);if(units.length!==1||units[0].id.type!==componentType||units[0].type!==unitType)throw Error("Captured plunder unit identity changed");
  const unit=units[0],balance=player.Treasury?.goldBalance,current=unit.Movement?.movementMovesRemaining;
  const settled=unit.isOnMap===true&&unit.isDead!==true&&unit.operationQueueSize===0&&unit.location?.x===location.x&&unit.location?.y===location.y&&GameplayMap.getRevealedState(playerId,location.x,location.y)===RevealedStates.VISIBLE;
  const unavailable=settled?Game.UnitCommands.canStart(unit.id,"UNITCOMMAND_PLUNDER_TRADE_ROUTE",{X:-9999,Y:-9999,UnitAbilityType:-1},false)?.Success===false:false;
  return{turn:Game.turn,age:Game.age,playerId,unitId,goldGain:Number.isFinite(balance)?balance-gold:null,movesRemaining:current??null,
    plunderObserved:Boolean(settled&&unavailable&&Number.isFinite(current)&&current>=0&&current<moves&&Number.isFinite(balance)&&balance>gold)};
})()
