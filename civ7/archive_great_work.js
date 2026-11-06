(() => {
  const {great_work_index:index,expected_turn:expectedTurn}=queryArguments,reject=reason=>({status:"rejected",reason});
  if(![index,expectedTurn].every(v=>Number.isInteger(v)&&v>=0))return reject("Exact owned Great Work index and expected turn required");
  if(!UI.isInGame())return reject("Load a save first");
  const playerId=GameContext.localPlayerID,player=Players.get(playerId);
  if(!Number.isInteger(playerId)||playerId<0||!player||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||Game.turn!==expectedTurn)return reject("Fresh active local turn required");
  function inventory(){
    const records=[],count=player.Culture.getNumWorksInArchive();
    if(!Number.isInteger(count)||count<0||count>512)return null;
    for(let i=0;i<count;i++){const work=player.Culture.getArchivedGreatWork(i);if(!Number.isInteger(work)||work<0)return null;records.push({index:work,location:{archived:true,cityId:null,buildingType:null},damaged:false});}
    for(const city of player.Cities.getCities().filter(c=>c.id.owner===playerId)){
      const entries=city.Constructibles.getGreatWorkBuildings();if(!Array.isArray(entries))return null;
      for(const entry of entries){
        if(entry.constructibleID?.owner!==playerId)continue;
        const c=Constructibles.getByComponentID(entry.constructibleID);
        if(!c||c.owner!=null&&c.owner!==playerId)return null;
        const def=GameInfo.Constructibles.lookup(c.type);
        if(typeof def?.ConstructibleType!=="string"||typeof c.damaged!=="boolean"||!Array.isArray(entry.slots)||entry.slots.some(s=>!Number.isInteger(s.greatWorkIndex)))return null;
        for(const slot of entry.slots.filter(s=>s.greatWorkIndex>=0))records.push({index:slot.greatWorkIndex,location:{archived:false,cityId:city.id.id,buildingType:def.ConstructibleType},damaged:c.damaged});
      }
    }
    records.sort((a,b)=>a.index-b.index);return new Set(records.map(r=>r.index)).size===records.length?records:null;
  }
  const baseline=inventory(),source=baseline?.find(r=>r.index===index);
  if(!source)return reject("Complete unique owned work ledger and exact source required");
  const before={turn:Game.turn,age:Game.age,playerId,greatWorkIndex:index,inventory:baseline};
  if(source.location.archived)return{status:"already_active",before};
  if(source.damaged!==false)return reject("Source building damage present or unknown");
  const operation=PlayerOperationTypes.MOVE_GREAT_WORK,args={Player1:playerId,GreatWorkIndex:index,SourceCity:source.location.cityId,DestinationCity:-1,DestinationBuilding:-1};
  const check=Game.PlayerOperations.canStart(playerId,operation,args,false);
  if(check?.Success!==true||check.RequiresConfirmation===true)return{status:"rejected",reason:"Native archive destination failed or needs confirmation",failureReasons:check?.FailureReasons??[]};
  if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||JSON.stringify(inventory())!==JSON.stringify(baseline))return reject("Work ledger or game context changed during validation");
  const expectedInventory=baseline.map(r=>({index:r.index,location:r.index===index?{archived:true,cityId:null,buildingType:null}:r.location}));
  Game.PlayerOperations.sendRequest(playerId,operation,args);
  return{status:"submitted",before,expected:{greatWorkIndex:index,location:{archived:true,cityId:null,buildingType:null},inventoryPreserved:true},
    verificationArguments:{great_work_index:index,expected_inventory:expectedInventory},verificationScope:"Exact work archived with complete owned work location/ownership ledger otherwise preserved; not Tourism/yield effect accounting"};
})()
