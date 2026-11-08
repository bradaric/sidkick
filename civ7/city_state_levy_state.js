(() => {
  if(!UI.isInGame())throw Error("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),{target_player_id:targetId,expected_unit_type:unitType,before_influence:influence,quoted_cost:cost,baseline_units:baseline}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0||!player||!Number.isInteger(targetId)||targetId<0||targetId===playerId||!Number.isInteger(unitType)||!Number.isFinite(influence)||!Number.isFinite(cost)||cost<0||!Array.isArray(baseline)||player.Diplomacy.hasMet(targetId)!==true)throw Error("Invalid captured known levy identity/inventory");
  const target=Players.get(targetId);if(target?.isMinor!==true)throw Error("Captured city-state identity changed");
  const current=player.Units.getUnits().filter(u=>u.id.owner===playerId).map(u=>({instanceId:u.id.id,componentType:u.id.type,unitType:u.type})),same=(a,b)=>a.instanceId===b.instanceId&&a.componentType===b.componentType&&a.unitType===b.unitType;
  if(new Set(current.map(r=>r.instanceId)).size!==current.length)throw Error("Owned levy receipt inventory ambiguous");
  const added=current.filter(r=>!baseline.some(old=>same(old,r))),balance=player.DiplomacyTreasury?.diplomacyBalance;
  const preserved=baseline.every(old=>current.some(next=>same(old,next)));
  return{turn:Game.turn,age:Game.age,playerId,targetPlayerId:targetId,influence:balance??null,receivedUnits:added,
    levyObserved:preserved&&current.length===baseline.length+1&&added.length===1&&added[0].unitType===unitType&&Number.isFinite(balance)&&influence-balance===cost&&target.Influence?.getSuzerain()===playerId};
})()
