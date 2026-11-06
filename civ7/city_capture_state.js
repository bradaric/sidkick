(() => {
  if(!UI.isInGame())throw Error("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),{city_id:cityId,city_component_type:componentType,location,choice}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0||!player||![cityId,componentType,location?.x,location?.y].every(v=>Number.isInteger(v)&&v>=0)||!["keep","raze"].includes(choice))throw Error("Invalid captured disposition identity");
  const cities=player.Cities.getCities().filter(c=>c.id.owner===playerId&&c.id.id===cityId&&c.id.type===componentType);if(cities.length>1)throw Error("Ambiguous captured city");
  const visible=GameplayMap.getRevealedState(playerId,location.x,location.y)===RevealedStates.VISIBLE,city=cities[0],at=visible?MapCities.getCity(location.x,location.y):null;
  const retained=city&&city.location?.x===location.x&&city.location?.y===location.y&&at?.owner===playerId&&at.id===cityId&&at.type===componentType;
  const observed=visible&&(choice==="keep"?retained&&city.isJustConqueredFrom===false&&city.isBeingRazed===false:retained&&city.isBeingRazed===true||!city&&(!at||at.owner<0));
  return{turn:Game.turn,age:Game.age,playerId,cityId,captureChoiceObserved:Boolean(observed),cityRetained:Boolean(retained),razingStarted:retained?city.isBeingRazed:null};
})()
