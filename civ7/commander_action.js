(() => {
  const {mode, commander_id: commanderId, x, y, expected_turn: expectedTurn, max_steps: maxSteps = 1} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (!["pack", "unpack", "move", "rail", "shore", "air_base"].includes(mode) || ![commanderId, expectedTurn].every(v => Number.isInteger(v) && v >= 0) ||
      (["unpack", "move", "rail", "shore", "air_base"].includes(mode) && ![x, y].every(v => Number.isInteger(v) && v >= 0)) ||
      (mode === "move" && (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 8))) return reject("An owned commander, supported action/tile, bounded step cap and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const owned = player.Units.getUnits().filter(u => u.id.owner === playerId), units = owned.filter(u => u.id.id === commanderId);
  if (units.length !== 1 || units[0].isCommanderUnit !== true || units[0].isOnMap !== true || units[0].operationQueueSize !== 0) return reject("A unique owned deployed unqueued commander is required");
  const commander = units[0], army = typeof Armies !== "undefined" && typeof Armies.get === "function" ? Armies.get(commander.armyId) : null;
  if (!army || army.owner !== playerId || typeof army.getCommanderId !== "function") return reject("Owned commander army identity is unavailable");
  const armyCommander = army.getCommanderId();
  if (armyCommander?.owner !== playerId || armyCommander.id !== commanderId || armyCommander.type !== commander.id.type) return reject("Army does not belong to this commander");
  const baselineIds = owned.map(u => u.id.id);
  if (baselineIds.some(id => !Number.isInteger(id) || id < 0) || new Set(baselineIds).size !== baselineIds.length) return reject("Owned unit inventory is ambiguous");
  function membership() {
    const ids = army.getUnitIds();
    if (!Array.isArray(ids) || ids.some(id => id.owner !== playerId || id.id === commanderId ||
      !owned.some(u => u.id.id === id.id && u.id.type === id.type))) return null;
    const members = ids.map(id => id.id).sort((a, b) => a - b);
    return new Set(members).size === members.length ? members : null;
  }
  const members = membership();
  if (members === null) return reject("Packed membership is unverified");
  const before = {turn: Game.turn, age: Game.age, playerId, commanderId, commanderType: commander.type,
    componentType: commander.id.type, packedUnitIds: members};
  if (mode === "air_base") {
    const operation="UNITOPERATION_ESTABLISH_BASE",destination={x,y},valid=l=>l&&[l.x,l.y].every(v=>Number.isInteger(v)&&v>=0)&&l.x<GameplayMap.getGridWidth()&&l.y<GameplayMap.getGridHeight();
    const visible=l=>valid(l)&&GameplayMap.getRevealedState(playerId,l.x,l.y)===RevealedStates.VISIBLE;
    if(GameInfo.UnitOperations.lookup(operation)?.OperationType!==operation||GameInfo.Units.lookup(commander.type)?.UnitType!=="UNIT_SQUADRON_COMMANDER"||commander.isDead===true||!visible(commander.location)||!visible(destination)||
        !Number.isFinite(commander.Movement?.movementMovesRemaining)||commander.Movement.movementMovesRemaining<=0||!Number.isFinite(commander.Health?.damage)||commander.Health.damage<0||!Number.isInteger(commander.armyId?.type)||commander.armyId.owner!==playerId)return reject("Installed base operation and ready visible exact squadron required");
    const clear=()=>visible(destination)&&[-1,playerId].includes(GameplayMap.getOwner(x,y))&&GameplayMap.isWater(x,y)===false&&Array.isArray(MapUnits.getUnits(x,y))&&MapUnits.getUnits(x,y).length===0&&Array.isArray(MapConstructibles.getConstructibles(x,y))&&MapConstructibles.getConstructibles(x,y).length===0;
    if(!clear())return reject("Air base destination must be visible empty own/unowned land without constructibles");
    before.location={x:commander.location.x,y:commander.location.y};before.movesRemaining=commander.Movement.movementMovesRemaining;before.damage=commander.Health.damage;
    before.armyId={owner:commander.armyId.owner,id:commander.armyId.id,type:commander.armyId.type};
    const picker=Game.UnitOperations.canStart(commander.id,operation,{},false),args={X:x,Y:y};
    if(picker?.Success!==true||!Array.isArray(picker.Plots)||!picker.Plots.includes(GameplayMap.getIndexFromLocation(destination)))return reject("Exact destination not offered for native air-base establishment",picker?.FailureReasons??[]);
    const check=Game.UnitOperations.canStart(commander.id,operation,args,false);
    if(check?.Success!==true||check.RequiresConfirmation===true)return reject("Native air-base establishment failed or requires confirmation",check?.FailureReasons??[]);
    if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||commander.id.owner!==playerId||commander.id.type!==before.componentType||commander.type!==before.commanderType||commander.isOnMap!==true||commander.isDead===true||commander.operationQueueSize!==0||
        commander.location.x!==before.location.x||commander.location.y!==before.location.y||commander.Movement.movementMovesRemaining!==before.movesRemaining||commander.Health.damage!==before.damage||JSON.stringify({owner:commander.armyId.owner,id:commander.armyId.id,type:commander.armyId.type})!==JSON.stringify(before.armyId)||JSON.stringify(membership())!==JSON.stringify(members)||!clear())return reject("Squadron, source membership, destination or context changed during validation");
    const verificationArguments={mode,commander_id:commanderId,component_type:before.componentType,baseline_packed_unit_ids:members,baseline_unit_ids:baselineIds,destination,before_moves:before.movesRemaining,before_damage:before.damage,army_id:before.armyId.id,army_component_type:before.armyId.type};
    Game.UnitOperations.sendRequest(commander.id,operation,args);
    return{status:"submitted",before,expected:{commanderId,commanderType:before.commanderType,componentType:before.componentType,establishmentObserved:true},verificationArguments,
      verificationScope:"Exact squadron base-operation arrival, movement consumption, stable health/army identity and packed membership, clear queue and preserved owned-unit IDs. Native aircraft eligibility checked separately; no invented base flag, construction/recharge or turn claim"};
  }
  if (mode === "rail") {
    const valid = l => l && [l.x, l.y].every(v => Number.isInteger(v) && v >= 0) &&
      l.x < GameplayMap.getGridWidth() && l.y < GameplayMap.getGridHeight();
    const visibleOwnedLand = l => valid(l) && GameplayMap.getRevealedState(playerId, l.x, l.y) === RevealedStates.VISIBLE &&
      GameplayMap.getOwner(l.x, l.y) === playerId && GameplayMap.isWater(l.x, l.y) === false;
    const source = commander.location, destination = {x, y};
    if (GameInfo.Units.lookup(commander.type)?.Domain !== "DOMAIN_LAND" || commander.isEmbarked !== false || commander.isDead === true ||
        !visibleOwnedLand(source) || !visibleOwnedLand(destination) || !Number.isFinite(commander.Movement?.movementMovesRemaining) ||
        commander.Movement.movementMovesRemaining <= 0) return reject("Rail requires a mobile deployed land commander and currently visible owned land endpoints");
    before.location = {x: source.x, y: source.y};
    before.movesRemaining = commander.Movement.movementMovesRemaining;
    if (source.x === x && source.y === y) return {status: "already_active", before};
    const clear = () => visibleOwnedLand(destination) && Array.isArray(MapUnits.getUnits(x, y)) && MapUnits.getUnits(x, y).length === 0;
    if (!clear()) return reject("Rail destination must be empty; no stacking, combat or capture");
    const command = "UNITCOMMAND_MOVE_BY_RAIL", args = {X: x, Y: y};
    const picker = Game.UnitCommands.canStart(commander.id, command, {}, false);
    if (picker?.Success !== true || !Array.isArray(picker.Plots) || !picker.Plots.includes(GameplayMap.getIndexFromLocation(destination))) return reject("Native rail picker does not offer the exact destination; no inferred connection or ordinary movement fallback", picker?.FailureReasons ?? []);
    const check = Game.UnitCommands.canStart(commander.id, command, args, false);
    if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Exact native rail permission failed or needs confirmation", check?.FailureReasons ?? []);
    if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
        commander.id.owner !== playerId || commander.id.type !== before.componentType || commander.type !== before.commanderType ||
        commander.isOnMap !== true || commander.operationQueueSize !== 0 || commander.location.x !== before.location.x || commander.location.y !== before.location.y ||
        commander.Movement.movementMovesRemaining !== before.movesRemaining || JSON.stringify(membership()) !== JSON.stringify(members) ||
        !visibleOwnedLand(commander.location) || !clear()) return reject("Commander, rail endpoints, packed membership or game context changed during validation");
    const verificationArguments = {mode, commander_id: commanderId, component_type: before.componentType,
      baseline_packed_unit_ids: members, baseline_unit_ids: baselineIds};
    Game.UnitCommands.sendRequest(commander.id, command, args);
    return {status: "submitted", before, expected: {commanderId, commanderType: before.commanderType, componentType: before.componentType,
      location: destination, packedUnitIds: members, queueSize: 0}, verificationArguments,
      verificationScope: "Exact native rail arrival, unchanged captured packed members and clear queue; no future-turn travel or inferred rail path"};
  }
  if (mode === "move" || mode === "shore") {
    const valid = l => l && [l.x, l.y].every(v => Number.isInteger(v) && v >= 0) &&
      l.x < GameplayMap.getGridWidth() && l.y < GameplayMap.getGridHeight();
    const domain = GameInfo.Units.lookup(commander.type)?.Domain, destination = {x, y}, source = commander.location;
    if (!valid(source) || !valid(destination) || !["DOMAIN_LAND", "DOMAIN_SEA"].includes(domain) ||
        !Number.isFinite(commander.Movement?.movementMovesRemaining) || commander.Movement.movementMovesRemaining <= 0 ||
        GameplayMap.getRevealedState(playerId, source.x, source.y) !== RevealedStates.VISIBLE) return reject("A mobile deployed land/sea commander with visible source/destination is required");
    const water = GameplayMap.isWater(source.x, source.y);
    const targetWater = GameplayMap.isWater(x,y), shore = mode === "shore";
    if (typeof water !== "boolean" || typeof targetWater !== "boolean" || (domain === "DOMAIN_SEA" && !water))
      return reject("Commander source/destination water classification is unverified or unsupported for its domain");
    let endpointTerrains = null, riverTransition = false;
    if (shore) {
      if (domain !== "DOMAIN_LAND" || typeof commander.isEmbarked !== "boolean" ||
          GameplayMap.getRevealedState(playerId, x, y) !== RevealedStates.VISIBLE)
        return reject("A land commander with known embarkation and a visible crossing destination is required");
      endpointTerrains = [source, destination].map(l => GameInfo.Terrains.lookup(GameplayMap.getTerrainType(l.x, l.y))?.TerrainType);
      if (endpointTerrains.some(t => typeof t !== "string")) return reject("Crossing endpoint terrain is unverified");
      riverTransition = endpointTerrains.includes("TERRAIN_NAVIGABLE_RIVER");
      // Navigable-river embarkation is not equivalent to isWater. Let the exact
      // native MOVE_TO check decide legality, then observe the actual state.
      if (!riverTransition && (commander.isEmbarked !== water || targetWater === water))
        return reject("Non-river shore crossing requires consistent source embarkation and a land/water edge");
    }
    const path = Units.getPathTo(commander.id, destination);
    if (!Array.isArray(path?.plots) || path.plots.length < 2 || path.plots.length > (shore ? 2 : maxSteps + 1) ||
        new Set(path.plots).size !== path.plots.length || path.plots.some(i => !Number.isInteger(i) || i < 0 || i >= GameplayMap.getGridWidth() * GameplayMap.getGridHeight()) ||
        !Array.isArray(path.turns) || path.turns.length !== path.plots.length || path.turns.some(t => t !== 1)) return reject("A bounded current-turn native path is required; no future-turn orders");
    const locations = path.plots.map(i => GameplayMap.getLocationFromIndex(i));
    if (locations.some(l => !valid(l)) || locations[0].x !== source.x || locations[0].y !== source.y ||
        locations.at(-1).x !== x || locations.at(-1).y !== y) return reject("Native path endpoints do not match the requested move");
    const reachable = Units.getReachableMovement(commander.id), attacks = Units.getReachableTargets(commander.id);
    if (!Array.isArray(reachable) || !Array.isArray(attacks) || !Number.isInteger(UnitOperationMoveModifiers.NONE)) return reject("Native movement/attack evidence is unavailable");
    const clear = l => GameplayMap.getRevealedState(playerId, l.x, l.y) === RevealedStates.VISIBLE &&
      [-1, playerId].includes(GameplayMap.getOwner(l.x, l.y)) && GameplayMap.isWater(l.x, l.y) === (shore ? targetWater : water) &&
      Array.isArray(MapUnits.getUnits(l.x, l.y)) && MapUnits.getUnits(l.x, l.y).length === 0;
    for (let i = 1; i < locations.length; i++) {
      const l = locations[i], previous = locations[i - 1];
      if (!clear(l) || GameplayMap.getPlotDistance(previous.x, previous.y, l.x, l.y) !== 1 ||
          !reachable.includes(path.plots[i]) || attacks.includes(path.plots[i]) ||
          Game.Combat.testAttackInto(commander.id, {X: l.x, Y: l.y, Modifiers: UnitOperationMoveModifiers.NONE}) !== CombatTypes.NO_COMBAT) return reject("Every path edge must be visible, empty, owned/unowned, same-terrain and noncombat");
    }
    before.location = {x: source.x, y: source.y};
    before.movesRemaining = commander.Movement.movementMovesRemaining;
    before.embarked = commander.isEmbarked;
    const args = {X: x, Y: y, Modifiers: UnitOperationMoveModifiers.NONE};
    const check = Game.UnitOperations.canStart(commander.id, UnitOperationTypes.MOVE_TO, args, false);
    if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native commander movement check failed", check?.FailureReasons ?? []);
    if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true ||
        GameContext.hasSentTurnComplete() !== false || commander.id.owner !== playerId || commander.type !== before.commanderType ||
        commander.isOnMap !== true || commander.operationQueueSize !== 0 || commander.location.x !== before.location.x || commander.location.y !== before.location.y ||
        commander.Movement.movementMovesRemaining !== before.movesRemaining || commander.isEmbarked !== before.embarked || GameplayMap.isWater(before.location.x,before.location.y) !== water || JSON.stringify(membership()) !== JSON.stringify(members) ||
        !locations.slice(1).every(clear) || shore && (
          GameplayMap.getRevealedState(playerId, source.x, source.y) !== RevealedStates.VISIBLE ||
          JSON.stringify([source, destination].map(l => GameInfo.Terrains.lookup(GameplayMap.getTerrainType(l.x, l.y))?.TerrainType)) !== JSON.stringify(endpointTerrains)))
      return reject("Commander, packed membership, path, crossing terrain or game context changed during validation");
    const verificationArguments = {mode, commander_id: commanderId, component_type: commander.id.type,
      baseline_packed_unit_ids: members, baseline_unit_ids: baselineIds};
    Game.UnitOperations.sendRequest(commander.id, UnitOperationTypes.MOVE_TO, args);
    return {status: "submitted", before, expected: {commanderId, commanderType: before.commanderType,
      componentType: before.componentType, location: destination, packedUnitIds: members,
      ...(shore ? {queueSize: 0, ...(riverTransition ? {embarkationObserved: true} : {embarked: targetWater})} : {})}, verificationArguments,
      path: locations.map(l => ({x: l.x, y: l.y})),
      ...(riverTransition ? {verificationScope: "One native adjacent noncombat river-endpoint MOVE_TO. Verifies arrival, clear queue, preserved packed army and observed native embarkation; never infers river embarkation from isWater. No future-turn order or retry"} : {})};
  }
  const operation = mode === "pack" ? "UNITCOMMAND_PACK_ARMY" : "UNITCOMMAND_UNPACK_ARMY";
  let args = {X: -9999, Y: -9999, UnitAbilityType: -1};
  if (mode === "unpack") {
    if (!members.length) return reject("Commander has no verified packed units");
    if (x >= GameplayMap.getGridWidth() || y >= GameplayMap.getGridHeight() ||
        GameplayMap.getRevealedState(playerId, x, y) !== RevealedStates.VISIBLE || GameplayMap.getOwner(x, y) !== playerId) return reject("Unpacking requires a currently visible owned plot");
    const picker = Game.UnitCommands.canStart(commander.id, operation, {}, false);
    const index = GameplayMap.getIndexFromLocation({x, y});
    if (!Array.isArray(picker?.Plots) || !picker.Plots.includes(index)) return reject("Plot is not offered by the native unpack picker");
    args = {X: x, Y: y};
  }
  const check = Game.UnitCommands.canStart(commander.id, operation, args, false);
  if (check?.Success !== true) return reject("Native commander action check failed", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true ||
      GameContext.hasSentTurnComplete() !== false || commander.id.owner !== playerId || commander.type !== before.commanderType ||
      commander.isOnMap !== true || commander.operationQueueSize !== 0 || JSON.stringify(membership()) !== JSON.stringify(members)) return reject("Commander membership or game context changed during validation");
  const field = mode === "pack" ? "packObserved" : "unpackObserved";
  const verificationArguments = {mode, commander_id: commanderId, component_type: commander.id.type,
    baseline_packed_unit_ids: members, baseline_unit_ids: baselineIds};
  Game.UnitCommands.sendRequest(commander.id, operation, args);
  return {status: "submitted", before,
    expected: {commanderId, commanderType: before.commanderType, componentType: before.componentType, [field]: true}, verificationArguments};
})()
