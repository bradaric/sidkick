(() => {
  const {settlement,resource,target_token:token,expected_turn:expectedTurn}=queryArguments,reject=reason=>({status:"rejected",reason});
  if(typeof settlement!=="string"||!settlement.trim()||typeof resource!=="string"||!resource||typeof token!=="string"||!token||token.length>100000||!Number.isInteger(expectedTurn)||expectedTurn<0)return reject("Exact settlement, factory resource, fresh token and expected turn required");
  if(!UI.isInGame())return reject("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId);
  if(!Number.isInteger(playerId)||playerId<0||!player||Game.turn!==expectedTurn||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||GameInfo.Ages.lookup(Game.age)?.AgeType!=="AGE_MODERN"||player.Resources.isResourceAssignmentLocked()!==false)return reject("Fresh active Modern turn and unlocked resource assignments required");
  const cities=player.Cities.getCities().filter(c=>c.id.owner===playerId),matches=cities.filter(c=>Locale.compose(c.name).toLowerCase()===settlement.toLowerCase()),def=GameInfo.Resources.lookup(resource);
  if(matches.length!==1||def?.ResourceType!==resource||def.ResourceClassType!=="RESOURCECLASS_FACTORY"||!Number.isInteger(def.$hash))return reject("Exact unique owned factory city and factory resource definition required");
  const city=matches[0],sort=(a,b)=>a.instance-b.instance||Number(a.offMap)-Number(b.offMap),key=r=>`${r.instance}:${r.offMap}`;
  function records(raw){
    if(!Array.isArray(raw)||raw.length>512)return null;
    const out=[];for(const r of raw){if(!Number.isInteger(r.value)||r.value<0||typeof r.isOffMap!=="boolean"||!Number.isInteger(r.uniqueResource?.resource))return null;out.push({instance:r.value,offMap:r.isOffMap,type:r.uniqueResource.resource});}
    out.sort(sort);return new Set(out.map(key)).size===out.length?out:null;
  }
  function ledger(){
    const owned=records(player.Resources.getResources()),all=player.Cities.getCities().filter(c=>c.id.owner===playerId),rows=[],seen=new Set();if(!owned)return null;
    for(const c of all){const assigned=records(c.Resources.getAssignedResources());if(!Number.isInteger(c.id.id)||c.id.id<0||!Number.isInteger(c.id.type)||c.id.type<0||!assigned)return null;
      for(const r of assigned){if(seen.has(key(r))||!owned.some(o=>key(o)===key(r)&&o.type===r.type))return null;seen.add(key(r));}rows.push({cityId:c.id.id,componentType:c.id.type,resources:assigned});}
    rows.sort((a,b)=>a.cityId-b.cityId);return new Set(rows.map(c=>c.cityId)).size===rows.length?{owned,cities:rows}:null;
  }
  function selection(){
    const selected=GameInfo.Resources.lookup(city.Resources.getFactoryResource()),count=city.Resources.getNumFactoryResources(),assigned=records(city.Resources.getAssignedResources());
    if(city.Resources.isTreasureConstructiblePrereqMet()!==true||selected?.ResourceType!==resource||!Number.isInteger(count)||count<=0||!assigned)return null;
    const factory=assigned.filter(r=>GameInfo.Resources.lookup(r.type)?.ResourceClassType==="RESOURCECLASS_FACTORY");
    if(!factory.length||factory.some(r=>GameInfo.Resources.lookup(r.type)?.ResourceType!==resource))return null;
    return{resourceType:resource,count,resources:factory.map(({instance,offMap})=>({instance,offMap}))};
  }
  const baseline=ledger(),selected=selection();
  if(!baseline||!selected||JSON.stringify(selected)!==token)return reject("Factory selection/token or complete owned assignment ledger is stale/unknown");
  if(!Number.isInteger(PlayerOperationParameters.Clear))return reject("Native factory Clear parameter unavailable");
  const before={turn:Game.turn,age:Game.age,playerId,cityId:city.id.id,cityComponentType:city.id.type,selection:selected,ledger:baseline};
  const args={ResourceType:city.Resources.getFactoryResource(),City:city.id.id,Action:PlayerOperationParameters.Clear},operation=PlayerOperationTypes.ASSIGN_RESOURCE;
  const check=Game.PlayerOperations.canStart(playerId,operation,args,false);
  if(check?.Success!==true||check.RequiresConfirmation===true)return{status:"rejected",reason:"Native factory clear failed or needs confirmation",failureReasons:check?.FailureReasons??[]};
  if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||city.id.owner!==playerId||city.id.type!==before.cityComponentType||player.Resources.isResourceAssignmentLocked()!==false||
      JSON.stringify(selection())!==token||JSON.stringify(ledger())!==JSON.stringify(baseline))return reject("Factory, owned assignments, lock or game context changed during validation");
  const released=new Set(selected.resources.map(key)),expectedLedger={owned:baseline.owned,cities:baseline.cities.map(c=>c.cityId!==city.id.id?c:{...c,resources:c.resources.filter(r=>!released.has(key(r)))})};
  Game.PlayerOperations.sendRequest(playerId,operation,args);
  return{status:"submitted",before,expected:{factoryClearObserved:true},verificationArguments:{city_id:city.id.id,city_component_type:city.id.type,baseline,expected_ledger:expectedLedger},
    verificationScope:"Exact factory bulk release, native factory count zero, unchanged owned resource inventory and every other city/nonfactory assignment preserved; not GDP/yield accounting or atomic clear-and-reassign"};
})()
