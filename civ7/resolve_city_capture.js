(() => {
  const {city_id:cityId,choice,expected_turn:expectedTurn}=queryArguments,reject=(reason,failureReasons=[])=>({status:"rejected",reason,failureReasons});
  if(![cityId,expectedTurn].every(v=>Number.isInteger(v)&&v>=0)||!["keep","raze"].includes(choice))return reject("Exact owned pending capture city, keep/raze choice and expected turn required");
  if(!UI.isInGame())return reject("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId);
  if(!Number.isInteger(playerId)||playerId<0||!player||Game.turn!==expectedTurn||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false)return reject("Fresh active local turn required");
  const matches=player.Cities.getCities().filter(c=>c.id.owner===playerId&&c.id.id===cityId);if(matches.length!==1)return reject("Unique owned capture city required");
  const city=matches[0],location={x:city.location?.x,y:city.location?.y};
  const pending=()=>city.isJustConqueredFrom===true&&city.isBeingRazed===false&&[location.x,location.y].every(v=>Number.isInteger(v)&&v>=0)&&GameplayMap.getRevealedState(playerId,location.x,location.y)===RevealedStates.VISIBLE&&GameplayMap.getOwner(location.x,location.y)===playerId;
  if(!pending())return reject("Exact visible owned city must have an unresolved capture choice and not already be razing");
  const before={turn:Game.turn,age:Game.age,playerId,cityId,componentType:city.id.type,location},args={Directive:choice==="keep"?2:3};
  const check=Game.CityCommands.canStart(city.id,CityCommandTypes.DESTROY,args,false);if(check?.Success!==true||check.RequiresConfirmation===true)return reject("Native capture directive failed or needs additional confirmation",check?.FailureReasons??[]);
  if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||city.id.owner!==playerId||city.id.type!==before.componentType||city.location.x!==location.x||city.location.y!==location.y||!pending())return reject("Captured settlement, disposition or context changed during validation");
  Game.CityCommands.sendRequest(city.id,CityCommandTypes.DESTROY,args);
  return{status:"submitted",before,expected:{captureChoiceObserved:true},verificationArguments:{city_id:cityId,city_component_type:city.id.type,location,choice},verificationScope:"Keep consumes exact pending capture choice while retaining city; raze proves native razing started or city disappeared, not future destruction completion. No liberation/foreign transfer or turn advancement"};
})()
