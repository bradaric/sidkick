(() => {
  if(!UI.isInGame())throw Error("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),{unit_id:unitId,unit_type:unitType,component_type:componentType,before_attacks:attacks,before_moves:moves,target_player:targetPlayer,target_city_id:cityId,x,y,mode,baseline_cities:baseline,district_id:districtId,district_type:districtType,before_district_damage:damage}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0||!player||![unitId,componentType,targetPlayer,cityId,x,y].every(v=>Number.isInteger(v)&&v>=0)||!Number.isInteger(unitType)||!["melee","occupy"].includes(mode)||!Array.isArray(baseline))throw Error("Invalid captured settlement assault identity");
  const units=player.Units.getUnits().filter(u=>u.id.owner===playerId&&u.id.id===unitId);if(units.length>1||units.length&&(units[0].type!==unitType||units[0].id.type!==componentType))throw Error("Captured attacker identity changed");
  const unit=units[0],same=(a,b)=>a?.owner===b?.owner&&a?.id===b?.id&&a?.type===b?.type,cities=player.Cities.getCities().filter(c=>c.id.owner===playerId),fresh=cities.filter(c=>!baseline.some(id=>same(id,c.id)));
  const visible=GameplayMap.getRevealedState(playerId,x,y)===RevealedStates.VISIBLE,centre=visible?MapCities.getCity(x,y):null;
  const preserved=baseline.every(id=>cities.some(c=>same(c.id,id))),newCity=fresh.length===1&&fresh[0].location?.x===x&&fresh[0].location?.y===y&&same(centre,fresh[0].id);
  const attackSpent=!unit||Number.isInteger(unit.Combat?.attacksRemaining)&&Number.isInteger(attacks)&&unit.Combat.attacksRemaining>=0&&unit.Combat.attacksRemaining<attacks;
  const moved=unit&&unit.isOnMap===true&&unit.operationQueueSize===0&&unit.location?.x===x&&unit.location?.y===y&&Number.isFinite(unit.Movement?.movementMovesRemaining)&&Number.isFinite(moves)&&unit.Movement.movementMovesRemaining>=0&&unit.Movement.movementMovesRemaining<moves;
  const captured=Boolean(visible&&centre?.owner===playerId&&preserved&&newCity&&cities.length===baseline.length+1&&moved);
  let currentDamage=null;
  if(visible&&centre?.owner===targetPlayer&&centre.id===cityId&&districtId&&same(MapCities.getDistrict(x,y),districtId)){
    const d=Districts.get(districtId);if(d?.type!==districtType)throw Error("Visible captured centre-district identity changed");if(Number.isFinite(d.getDamage))currentDamage=d.getDamage;
  }
  return{turn:Game.turn,age:Game.age,playerId,unitId,captured,assaultObserved:captured||Boolean(attackSpent&&Number.isFinite(damage)&&currentDamage!==null&&currentDamage>damage),districtDamage:currentDamage,
    newCity:captured?{id:fresh[0].id,location:fresh[0].location,captureChoicePending:fresh[0].isJustConqueredFrom??null}:null};
})()
