(() => {
  const {mode, unit_id: unitId, commander_id: commanderId, x, y, expected_turn: expectedTurn, domain = "DOMAIN_LAND"} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  const {air_transport:airTransport=false}=queryArguments;
  if(typeof airTransport!=="boolean"||airTransport&&domain!=="DOMAIN_LAND")return reject("Air transport is an explicit Infantry/Squadron intent only");
  const airdrop=mode==="airdrop";
  if (!["DOMAIN_LAND", "DOMAIN_SEA"].includes(domain) || !["join", "leave", "airdrop"].includes(mode) || airdrop&&!airTransport || ![unitId, commanderId, expectedTurn].every(v => Number.isInteger(v) && v >= 0) ||
      unitId === commanderId || (mode !== "join" && ![x, y].every(v => Number.isInteger(v) && v >= 0))) return reject("Distinct owned unit/commander IDs, supported membership action/tile and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId);
  if (!Number.isInteger(playerId) || playerId < 0 || !player || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn) return reject("A fresh active local turn is required");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), units = owned.filter(u => u.id.id === unitId), commanders = owned.filter(u => u.id.id === commanderId);
  if (units.length !== 1 || commanders.length !== 1) return reject("Unique owned unit and commander identities are required");
  const unit = units[0], commander = commanders[0], def = GameInfo.Units.lookup(unit.type);
  if (unit.isCommanderUnit || unit.isDead === true || def?.Packable !== true || def.Domain !== domain || commander.isCommanderUnit !== true ||
      commander.isOnMap !== true || commander.isDead === true || GameInfo.Units.lookup(commander.type)?.Domain !== (airTransport?"DOMAIN_AIR":domain) ||
       (domain === "DOMAIN_SEA" && (commander.isFleetCommander !== true || def.FormationClass !== "FORMATION_CLASS_NAVAL"))) return reject("A packable same-domain unit and deployed commander are required; fleet actions require a naval combat unit and Fleet Commander");
  if(airTransport&&(GameInfo.Units.lookup(commander.type)?.UnitType!=="UNIT_SQUADRON_COMMANDER"||def.FormationClass!=="FORMATION_CLASS_LAND_COMBAT"||GameInfo.TypeTags.filter(t=>t.Type===def.UnitType&&t.Tag==="UNIT_CLASS_INFANTRY").length===0||
      commander.Experience?.hasPromotion("DISCIPLINE_SQUADRON_AIRLIFT_OPERATIONS","PROMOTION_SQUADRON_AIRBORNE_FORCES")!==true))return reject("Airlift requires exact Squadron Commander with native Airborne Forces and Infantry role");
  function armies() {
    if (typeof Armies === "undefined" || typeof Armies.get !== "function") return null;
    const seen = new Set(), records = [];
    for (const c of owned.filter(u => u.isCommanderUnit)) {
      const a = Armies.get(c.armyId), identity = a?.getCommanderId?.(), ids = a?.getUnitIds?.();
      if (a?.owner !== playerId || !Number.isInteger(a.localId) || a.localId < 0 || identity?.owner !== playerId || identity.id !== c.id.id || identity.type !== c.id.type ||
          !Array.isArray(ids) || ids.some(id => id.owner !== playerId || id.id === c.id.id ||
            owned.filter(u => u.id.id === id.id && u.id.type === id.type).length !== 1)) return null;
      const members = ids.map(id => id.id).sort((a, b) => a - b);
      for (const id of members) {if (seen.has(id)) return null; seen.add(id);}
      records.push({commanderId: c.id.id, commanderType: c.type, componentType: c.id.type, armyId: a.localId, packedUnitIds: members});
    }
    records.sort((a, b) => a.commanderId - b.commanderId);
    return new Set(records.map(a => a.commanderId)).size === records.length ? records : null;
  }
  const baseline = armies(), selected = baseline?.find(a => a.commanderId === commanderId), containing = baseline?.filter(a => a.packedUnitIds.includes(unitId));
  if (!selected || !containing || containing.length > 1) return reject("Owned army identity and complete packed membership must be known");
  function retainedAircraft(){
    const records=[];for(const id of selected.packedUnitIds.filter(id=>id!==unitId)){
      const u=owned.find(u=>u.id.id===id),def=u&&GameInfo.Units.lookup(u.type);
      if(!u||u.isCommanderUnit||u.isDead===true||u.isOnMap!==false||u.operationQueueSize!==0||def?.Domain!=="DOMAIN_AIR"||def.FormationClass!=="FORMATION_CLASS_AIR"||
          !sameArmy(u.armyId,commander.armyId)||!Number.isFinite(u.Health?.damage)||!Number.isInteger(u.Combat?.attacksRemaining)||u.Combat.attacksRemaining<0||!Number.isFinite(u.Movement?.movementMovesRemaining)||u.Movement.movementMovesRemaining<0)return null;
      records.push({unitId:id,componentType:u.id.type,unitType:u.type,damage:u.Health.damage,attacks:u.Combat.attacksRemaining,moves:u.Movement.movementMovesRemaining});
    }return records;
  }
  const sameArmy=(a,b)=>a?.owner===playerId&&a.owner===b?.owner&&a.id===b.id&&a.type===b.type;
  const retained=airdrop?retainedAircraft():null;
  if(airdrop&&(!containing.length||!selected.packedUnitIds.includes(unitId)||retained===null||selected.packedUnitIds.length>16||unit.isOnMap!==false||
      !Number.isFinite(unit.Health?.damage)||!Number.isFinite(commander.Health?.damage)))return reject("Airdrop requires exactly one packed Infantry, optionally known stationed aircraft retained unchanged; no other payload");
  const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
    commanderId, commanderType: commander.type, commanderComponentType: commander.id.type, armies: baseline,
    unitLocation: {x: unit.location?.x, y: unit.location?.y}, commanderLocation: {x: commander.location?.x, y: commander.location?.y}};
  if(airdrop){before.unitDamage=unit.Health.damage;before.commanderDamage=commander.Health.damage;before.retainedAircraft=retained;}
  if (containing.length && containing[0].commanderId !== commanderId) return reject("Unit is in a different commander; no implicit transfer");
  if (mode === "join" && containing.length) return {status: "already_active", before};
  if (mode === "leave" && !containing.length) return unit.isOnMap === true ? {status: "already_inactive", before} : reject("Unpacked deployment is unverified");
  if (unit.operationQueueSize !== 0 || commander.operationQueueSize !== 0 ||
      typeof player.Armies?.getUnitReinforcementCommanderId !== "function" || player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) return reject("Queued orders or active/unknown reinforcement assignment prevent membership changes");
  const valid = l => l && [l.x, l.y].every(v => Number.isInteger(v) && v >= 0) && l.x < GameplayMap.getGridWidth() && l.y < GameplayMap.getGridHeight();
  const destination = mode === "join" ? before.commanderLocation : {x, y};
  const visible = l => valid(l) && GameplayMap.getRevealedState(playerId, l.x, l.y) === RevealedStates.VISIBLE;
  const water = l => valid(l) && typeof GameplayMap.isWater === "function" && GameplayMap.isWater(l.x, l.y) === true;
  if (!visible(before.commanderLocation) || !visible(destination) || ![-1, playerId].includes(GameplayMap.getOwner(destination.x, destination.y))) return reject("Commander and destination must be currently visible on an own/unowned destination");
  if (domain === "DOMAIN_SEA" && (!water(before.commanderLocation) || !water(destination) || (mode === "join" && !water(before.unitLocation)))) return reject("Fleet commander, joining ship and deployment destination must be on water");
  const airLandSafe=()=>!airTransport||[-1,playerId].includes(GameplayMap.getOwner(before.commanderLocation.x,before.commanderLocation.y))&&GameplayMap.isWater(before.commanderLocation.x,before.commanderLocation.y)===false&&GameplayMap.isWater(destination.x,destination.y)===false&&(mode!=="join"||unit.isEmbarked===false&&GameplayMap.isWater(before.unitLocation.x,before.unitLocation.y)===false);
  if(!airLandSafe())return reject("Infantry airlift membership requires visible land source/base/deployment and an unembarked joining unit");
  function deploymentClear() {
    const ids = MapUnits.getUnits(x, y), distance = GameplayMap.getPlotDistance(before.commanderLocation.x, before.commanderLocation.y, x, y);
    if (!Array.isArray(ids)) return false;
    if(airdrop)return ids.length===0&&["TERRAIN_FLAT","TERRAIN_HILL"].includes(GameInfo.Terrains.lookup(GameplayMap.getTerrainType(x,y))?.TerrainType);
    if (distance === 1) return ids.length === 0;
    return distance === 0 && x === before.commanderLocation.x && y === before.commanderLocation.y && ids.length === 1 &&
      ids[0].owner === playerId && ids[0].id === commanderId && ids[0].type === commander.id.type &&
      owned.filter(u => u.isOnMap === true && u.id.id !== unitId && u.location?.x === x && u.location?.y === y).length === 1;
  }
  if (mode === "join") {
    if (unit.isOnMap !== true || !visible(before.unitLocation) || GameplayMap.getPlotDistance(before.unitLocation.x, before.unitLocation.y, destination.x, destination.y) > 1 ||
        owned.filter(c => c.isCommanderUnit && c.isOnMap === true && c.location?.x === destination.x && c.location?.y === destination.y).length !== 1) return reject("Joining requires a deployed nearby unit and one unambiguous commander on the destination");
  } else if (!deploymentClear()) return reject("Leaving requires an adjacent empty plot or the exact origin occupied only by this commander");
  if(airdrop&&(GameInfo.UnitOperations.lookup("UNITOPERATION_UNIT_AIR_DROP")?.OperationType!=="UNITOPERATION_UNIT_AIR_DROP"||!Number.isFinite(commander.Movement?.movementMovesRemaining)||commander.Movement.movementMovesRemaining<=0))return reject("Installed Airdrop operation and ready Squadron required");
  const command = airdrop?"UNITOPERATION_UNIT_AIR_DROP":mode === "join" ? "UNITCOMMAND_ADD_TO_ARMY" : "UNITCOMMAND_REMOVE_FROM_ARMY", args = {X: destination.x, Y: destination.y};
  const source=airdrop?commander:unit,api=airdrop?Game.UnitOperations:Game.UnitCommands;
  const picker = api.canStart(source.id, command, {}, false);
  if (picker?.Success !== true || !Array.isArray(picker.Plots) || !picker.Plots.includes(GameplayMap.getIndexFromLocation(destination))) return reject("Destination is not offered by the native membership picker", picker?.FailureReasons ?? []);
  const check = api.canStart(source.id, command, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native membership command failed or needs unsupported confirmation", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      unit.id.owner !== playerId || unit.id.type !== before.componentType || unit.type !== before.unitType || unit.operationQueueSize !== 0 ||
      commander.id.owner !== playerId || commander.id.type !== before.commanderComponentType || commander.type !== before.commanderType || commander.operationQueueSize !== 0 ||
      commander.location.x !== before.commanderLocation.x || commander.location.y !== before.commanderLocation.y ||
      JSON.stringify(armies()) !== JSON.stringify(baseline) || !visible(destination) || ![-1, playerId].includes(GameplayMap.getOwner(destination.x, destination.y)) ||
      !airLandSafe()||(airTransport&&commander.Experience.hasPromotion("DISCIPLINE_SQUADRON_AIRLIFT_OPERATIONS","PROMOTION_SQUADRON_AIRBORNE_FORCES")!==true)||
      (airdrop&&(unit.isOnMap!==false||unit.Health.damage!==before.unitDamage||commander.Health.damage!==before.commanderDamage||commander.Movement.movementMovesRemaining<=0||JSON.stringify(retainedAircraft())!==JSON.stringify(retained)))||
      (domain === "DOMAIN_SEA" && (!water(before.commanderLocation) || !water(destination) || (mode === "join" && !water(before.unitLocation)))) ||
      player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1 ||
      (mode === "join" ? unit.isOnMap !== true || unit.location.x !== before.unitLocation.x || unit.location.y !== before.unitLocation.y : !deploymentClear())) return reject("Unit, commander, membership, destination or game context changed during validation");
  const expectedArmies = baseline.map(a => ({...a, packedUnitIds: a.commanderId !== commanderId ? a.packedUnitIds :
    mode === "join" ? [...a.packedUnitIds, unitId].sort((a, b) => a - b) : a.packedUnitIds.filter(id => id !== unitId)}));
  const verificationArguments = {unit_id: unitId, commander_id: commanderId, component_type: before.componentType, unit_type: before.unitType,
    commander_component_type: before.commanderComponentType, commander_type: before.commanderType,...(airdrop?{retained_aircraft:retained}:{})};
  api.sendRequest(source.id, command, args);
  return {status: "submitted", before, expected: {unitId, unitType: before.unitType, componentType: before.componentType,
    commanderId, commanderType: before.commanderType, commanderComponentType: before.commanderComponentType, packed: mode === "join", armies: expectedArmies,
    ...(mode !== "join" ? {location: destination} : {}),...(airdrop?{commanderLocation:before.commanderLocation,unitDamage:before.unitDamage,commanderDamage:before.commanderDamage,unitQueueSize:0,commanderQueueSize:0,retainedAircraftPreserved:true}:{})}, verificationArguments};
})()
