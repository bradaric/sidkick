(() => {
  if(!UI.isInGame())throw Error("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId),{city_id:cityId,city_component_type:componentType,expected_ledger:expected}=queryArguments;
  if(!Number.isInteger(playerId)||playerId<0||!player||![cityId,componentType].every(v=>Number.isInteger(v)&&v>=0)||!expected||!Array.isArray(expected.owned)||!Array.isArray(expected.cities))throw Error("Invalid captured factory ledger");
  const cities=player.Cities.getCities().filter(c=>c.id.owner===playerId),matches=cities.filter(c=>c.id.id===cityId&&c.id.type===componentType);
  if(matches.length!==1)throw Error("Captured factory city identity changed");
  const sort=(a,b)=>a.instance-b.instance||Number(a.offMap)-Number(b.offMap),records=raw=>{
    if(!Array.isArray(raw))throw Error("Owned resource inventory unknown");
    const out=raw.map(r=>({instance:r.value,offMap:r.isOffMap,type:r.uniqueResource?.resource}));
    if(out.some(r=>!Number.isInteger(r.instance)||r.instance<0||typeof r.offMap!=="boolean"||!Number.isInteger(r.type)))throw Error("Owned resource identity unknown");
    return out.sort(sort);
  };
  const ledger={owned:records(player.Resources.getResources()),cities:cities.map(c=>({cityId:c.id.id,componentType:c.id.type,resources:records(c.Resources.getAssignedResources())})).sort((a,b)=>a.cityId-b.cityId)};
  const count=matches[0].Resources.getNumFactoryResources();
  return{turn:Game.turn,age:Game.age,playerId,cityId,factoryResourceCount:count,ledger,
    factoryClearObserved:count===0&&JSON.stringify(ledger)===JSON.stringify(expected)};
})()
