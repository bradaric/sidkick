(() => {
  const {unit_id: unitId, x, y, expected_turn: expectedTurn, mode = "step", target_player: targetPlayer} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons,
    ...(mode === "normal" ? {rejectionSource: "sidkick"} : {})});
  if (!["normal", "step", "rail", "advance", "travel"].includes(mode) || [unitId, x, y, expectedTurn].some(value => !Number.isInteger(value) || value < 0) ||
      (mode === "advance" && (!Number.isInteger(targetPlayer) || targetPlayer < 0))) return reject("Exact owned unit, supported move/tile/enemy and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const units = player.Units.getUnits().filter(value => value.id.owner === playerId);
  const matches = units.filter(value => value.id.id === unitId);
  if (matches.length !== 1) return reject("No unique owned unit matches this instance ID");
  const unit = matches[0];
  const valid = location => location && Number.isInteger(location.x) && Number.isInteger(location.y) &&
    location.x >= 0 && location.y >= 0 && location.x < GameplayMap.getGridWidth() && location.y < GameplayMap.getGridHeight();
  const destination = {x, y};
  if (mode === "normal") {
    const refuse = (reason, rejectionSource = "sidkick", failureReasons = []) => ({status: "rejected", reason, rejectionSource, failureReasons});
    if (Configuration.getGame().isAnyMultiplayer !== false || !valid(unit.location) || !valid(destination) ||
        unit.isOnMap !== true || unit.isDead === true || unit.isCommanderUnit ||
        !["DOMAIN_LAND", "DOMAIN_SEA"].includes(GameInfo.Units.lookup(unit.type)?.Domain))
      return refuse("A live owned on-map land/sea noncommander and a valid single-player destination are required");
    const modifier = UnitOperationMoveModifiers.MOVE_IGNORE_UNEXPLORED_DESTINATION;
    if (!Number.isInteger(modifier) || !Number.isInteger(UnitOperationMoveModifiers.ATTACK) ||
        (modifier & UnitOperationMoveModifiers.ATTACK) !== 0 || !Number.isInteger(UnitOperationTypes.MOVE_TO))
      return refuse("Native fog-capable nonattack movement modifier/operation is unavailable");
    const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
      location: {x: unit.location.x, y: unit.location.y}, movesRemaining: unit.Movement?.movementMovesRemaining ?? null,
      queueSize: unit.operationQueueSize ?? null, moveOperation: UnitOperationTypes.MOVE_TO};
    if (before.location.x === x && before.location.y === y) return {status: "already_active", before};
    const args = {X: x, Y: y, Modifiers: modifier};
    if (typeof player.Diplomacy?.willMoveStartWar !== "function") return refuse("Native war-check API is unavailable");
    const war = player.Diplomacy.willMoveStartWar(unit.id, destination);
    if (war?.Success === true) return refuse("Native movement requires war confirmation", "native");
    if (GameplayMap.getRevealedState(playerId, x, y) === RevealedStates.VISIBLE &&
        Game.Combat.testAttackInto(unit.id, args) !== CombatTypes.NO_COMBAT)
      return refuse("Native preview identifies combat; an explicit attack order is required", "native");
    const check = Game.UnitOperations.canStart(unit.id, UnitOperationTypes.MOVE_TO, args, false);
    if (check?.Success !== true || check.RequiresConfirmation === true)
      return refuse("Native movement check rejected or requires confirmation", "native", check?.FailureReasons ?? []);
    if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
        player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || unit.id.owner !== playerId ||
        unit.id.id !== unitId || unit.id.type !== before.componentType || unit.type !== before.unitType || unit.isOnMap !== true || unit.isDead === true)
      return refuse("Turn or owned-unit identity changed during submission checks");
    // Native Move-To explicitly supports fog. Do not use WorldInput, add ATTACK,
    // inspect hidden occupants/terrain, or insist on a fully visible empty path.
    Game.UnitOperations.sendRequest(unit.id, UnitOperationTypes.MOVE_TO, args);
    return {status: "submitted", before, destination, verificationArguments: {unit_id: unitId},
      verificationScope: "One normal nonattack MOVE_TO, including fog and native queued continuation/replacement. Readback reports actual coordinates/queue, not hidden-path safety, future arrival or an unavailable exact queued-target binding. No war declaration, attack/swap helper or turn advancement"};
  }
  if (!valid(unit.location) || !valid(destination) || unit.isOnMap === false || unit.isCommanderUnit ||
      !Number.isFinite(unit.Movement?.movementMovesRemaining) || unit.Movement.movementMovesRemaining <= 0) return reject("A mobile on-map noncommander unit is required");
  const domain = GameInfo.Units.lookup(unit.type)?.Domain;
  const fromWater = GameplayMap.isWater(unit.location.x, unit.location.y);
  const toWater = GameplayMap.isWater(x, y);
  const shore = fromWater !== toWater;
  if (!["DOMAIN_LAND", "DOMAIN_SEA"].includes(domain) ||
      typeof fromWater !== "boolean" || typeof toWater !== "boolean" ||
      (domain === "DOMAIN_SEA" && (!fromWater || !toWater)) ||
      (shore && (domain !== "DOMAIN_LAND" || unit.isEmbarked !== fromWater))) return reject("Land shore crossings need consistent native embarkation; sea units must stay on water");
  const sameId = (a, b) => a.owner === b.owner && a.id === b.id && a.type === b.type;
  for (const commander of units.filter(value => value.isCommanderUnit)) {
    const army = typeof Armies !== "undefined" ? Armies.get(commander.armyId) : null;
    const packed = army?.owner === playerId && typeof army.getUnitIds === "function" ? army.getUnitIds() : null;
    if (!Array.isArray(packed) || packed.some(id => sameId(id, unit.id))) return reject("Unit packing state is packed or unverified");
  }
  if (typeof player.Armies?.getUnitReinforcementCommanderId !== "function" ||
      player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) return reject("Unit reinforcement state is active or unverified");
  if(mode==="travel"){
    const {max_steps:maxSteps=1,peaceful_player_id:peacefulId=null}=queryArguments;
    const peace=()=>peacefulId===null||Number.isInteger(peacefulId)&&peacefulId>=0&&peacefulId!==playerId&&player.Diplomacy.hasMet(peacefulId)===true&&player.Diplomacy.isAtWarWith(peacefulId)===false;
    if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>8||!peace()||unit.isOnMap!==true||unit.isDead===true||unit.operationQueueSize!==0||shore||
        domain==="DOMAIN_LAND"&&unit.isEmbarked!==fromWater||!Number.isFinite(unit.Health?.damage)||!Number.isInteger(UnitOperationMoveModifiers.NONE)||typeof player.Diplomacy.willMoveStartWar!=="function")return reject("Bounded unqueued same-surface current-turn travel and explicit known peaceful counterpart required");
    const source={x:unit.location.x,y:unit.location.y},visible=l=>valid(l)&&GameplayMap.getRevealedState(playerId,l.x,l.y)===RevealedStates.VISIBLE;
    const allowed=l=>{
      if(!visible(l)||GameplayMap.isWater(l.x,l.y)!==fromWater)return false;
      const owner=GameplayMap.getOwner(l.x,l.y);
      if([-1,playerId].includes(owner))return true;
      return owner===peacefulId&&peace()&&MapCities.getDistrict(l.x,l.y)===null;
    };
    if(!allowed(source))return reject("Visible own/unowned or exact peaceful non-district source required");
    const path=Units.getPathTo(unit.id,destination),width=GameplayMap.getGridWidth(),height=GameplayMap.getGridHeight();
    if(!Array.isArray(path?.plots)||path.plots.length<2||path.plots.length>maxSteps+1||new Set(path.plots).size!==path.plots.length||path.plots.some(i=>!Number.isInteger(i)||i<0||i>=width*height)||
        !Array.isArray(path.turns)||path.turns.length!==path.plots.length||path.turns.some(t=>t!==1))return reject("Exact bounded current-turn native path required; no queued future turns");
    const locations=path.plots.map(i=>GameplayMap.getLocationFromIndex(i));
    if(locations.some(l=>!valid(l))||locations[0].x!==source.x||locations[0].y!==source.y||locations.at(-1).x!==x||locations.at(-1).y!==y)return reject("Native travel endpoints mismatch");
    const reachable=Units.getReachableMovement(unit.id),attacks=Units.getReachableTargets(unit.id);
    const clear=l=>allowed(l)&&Array.isArray(MapUnits.getUnits(l.x,l.y))&&MapUnits.getUnits(l.x,l.y).length===0;
    const noWar=l=>player.Diplomacy.willMoveStartWar(unit.id,{x:l.x,y:l.y})?.Success===false;
    const safePath=()=>{
      if(!allowed(source)||!peace())return false;
      for(let i=1;i<locations.length;i++){
        const l=locations[i],previous=locations[i-1];
        if(!clear(l)||GameplayMap.getPlotDistance(previous.x,previous.y,l.x,l.y)!==1||!reachable.includes(path.plots[i])||attacks.includes(path.plots[i])||!noWar(l)||
            Game.Combat.testAttackInto(unit.id,{X:l.x,Y:l.y,Modifiers:UnitOperationMoveModifiers.NONE})!==CombatTypes.NO_COMBAT)return false;
      }return true;
    };
    if(!Array.isArray(reachable)||!Array.isArray(attacks)||!safePath())return reject("Every travel edge must be visible, empty, natively reachable and positively nonwar/noncombat");
    const before={turn:Game.turn,age:Game.age,playerId,unitId,unitType:unit.type,componentType:unit.id.type,location:source,movesRemaining:unit.Movement.movementMovesRemaining,embarked:unit.isEmbarked,damage:unit.Health.damage},args={X:x,Y:y,Modifiers:UnitOperationMoveModifiers.NONE};
    const check=Game.UnitOperations.canStart(unit.id,UnitOperationTypes.MOVE_TO,args,false);
    if(check?.Success!==true||check.RequiresConfirmation===true)return reject("Native travel permission rejected or requires confirmation",check?.FailureReasons??[]);
    const packingClear=()=>player.Units.getUnits().filter(u=>u.id.owner===playerId&&u.isCommanderUnit).every(c=>{
      const a=Armies.get(c.armyId),ids=a?.owner===playerId?a.getUnitIds?.():null;return Array.isArray(ids)&&!ids.some(id=>sameId(id,unit.id));
    });
    if(Game.turn!==before.turn||Game.age!==before.age||GameContext.localPlayerID!==playerId||player.isTurnActive!==true||GameContext.hasSentTurnComplete()!==false||unit.id.owner!==playerId||unit.id.type!==before.componentType||unit.type!==before.unitType||
        unit.isOnMap!==true||unit.isDead===true||unit.operationQueueSize!==0||unit.location.x!==source.x||unit.location.y!==source.y||unit.Movement.movementMovesRemaining!==before.movesRemaining||unit.isEmbarked!==before.embarked||unit.Health.damage!==before.damage||
        !packingClear()||player.Armies.getUnitReinforcementCommanderId(unit.id,playerId)!==-1||JSON.stringify(Units.getPathTo(unit.id,destination))!==JSON.stringify(path)||!safePath())return reject("Travel identity, readiness, packing, path, diplomacy or context changed during validation");
    Game.UnitOperations.sendRequest(unit.id,UnitOperationTypes.MOVE_TO,args);
    return{status:"submitted",before,expected:{unitId,unitType:before.unitType,componentType:before.componentType,location:destination,queueSize:0,damage:before.damage,...(domain==="DOMAIN_LAND"?{embarked:before.embarked}:{}),...(peacefulId!==null?{peacePreserved:true}:{})},
      verificationArguments:{unit_id:unitId,...(peacefulId!==null?{peaceful_player_id:peacefulId}:{})},path:locations.map(l=>({x:l.x,y:l.y})),verificationScope:"One bounded current-turn MOVE_TO; all path edges verified visible/empty/nonwar/noncombat, no shore crossing/fog exploration or future orders. Explicit peaceful counterpart never implies new access permission"};
  }
  if (mode === "rail") {
    const visibleOwnedLand = l => valid(l) && GameplayMap.getRevealedState(playerId, l.x, l.y) === RevealedStates.VISIBLE &&
      GameplayMap.getOwner(l.x, l.y) === playerId && GameplayMap.isWater(l.x, l.y) === false;
    if (domain !== "DOMAIN_LAND" || unit.isEmbarked !== false || unit.isOnMap !== true || unit.isDead === true || unit.operationQueueSize !== 0 ||
        !visibleOwnedLand(unit.location) || !visibleOwnedLand(destination)) return reject("Rail requires an unqueued unembarked land unit and visible owned land endpoints");
    const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
      location: {x: unit.location.x, y: unit.location.y}, movesRemaining: unit.Movement.movementMovesRemaining};
    if (before.location.x === x && before.location.y === y) return {status: "already_active", before};
    const clear = () => visibleOwnedLand(destination) && Array.isArray(MapUnits.getUnits(x, y)) && MapUnits.getUnits(x, y).length === 0;
    if (!clear()) return reject("Rail requires an empty destination");
    const command = "UNITCOMMAND_MOVE_BY_RAIL", args = {X: x, Y: y};
    const picker = Game.UnitCommands.canStart(unit.id, command, {}, false);
    if (picker?.Success !== true || !Array.isArray(picker.Plots) || !picker.Plots.includes(GameplayMap.getIndexFromLocation(destination))) return reject("Exact destination is not offered by native rail; no ordinary-movement fallback", picker?.FailureReasons ?? []);
    const check = Game.UnitCommands.canStart(unit.id, command, args, false);
    if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native rail permission failed or needs confirmation", check?.FailureReasons ?? []);
    const packingClear = units.filter(u => u.isCommanderUnit).every(c => {
      const a = Armies.get(c.armyId), ids = a?.owner === playerId ? a.getUnitIds?.() : null;
      return Array.isArray(ids) && !ids.some(id => sameId(id, unit.id));
    });
    if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
        unit.id.owner !== playerId || unit.id.type !== before.componentType || unit.type !== before.unitType || unit.isOnMap !== true || unit.operationQueueSize !== 0 ||
        unit.location.x !== before.location.x || unit.location.y !== before.location.y || unit.Movement.movementMovesRemaining !== before.movesRemaining ||
        !visibleOwnedLand(unit.location) || !clear() || !packingClear || player.Armies.getUnitReinforcementCommanderId(unit.id, playerId) !== -1) return reject("Unit, rail endpoints or game context changed during validation");
    Game.UnitCommands.sendRequest(unit.id, command, args);
    return {status: "submitted", before, expected: {unitId, unitType: before.unitType, componentType: before.componentType, location: destination, queueSize: 0}, verificationArguments: {unit_id: unitId}};
  }
  if (GameplayMap.getPlotDistance(unit.location.x, unit.location.y, x, y) !== 1 ||
      GameplayMap.getRevealedState(playerId, unit.location.x, unit.location.y) !== RevealedStates.VISIBLE ||
      GameplayMap.getRevealedState(playerId, x, y) !== RevealedStates.VISIBLE) return reject("Only an adjacent currently visible step is supported");
  const owner = GameplayMap.getOwner(x, y);
  const enemyField = () => owner === targetPlayer && targetPlayer !== playerId && player.Diplomacy.hasMet(targetPlayer) === true && player.Diplomacy.isAtWarWith(targetPlayer) === true &&
    typeof MapCities !== "undefined" && typeof MapCities.getDistrict === "function" && MapCities.getDistrict(x, y) === null;
  if (mode === "advance") {
    if (!enemyField() || unit.isOnMap !== true || unit.isDead === true || unit.operationQueueSize !== 0 || unit.isEmbarked !== false || shore ||
        (domain === "DOMAIN_LAND" && fromWater !== false) || unit.Combat?.isCombat !== true ||
        !["FORMATION_CLASS_LAND_COMBAT", "FORMATION_CLASS_NAVAL"].includes(GameInfo.Units.lookup(unit.type)?.FormationClass)) return reject("Advance requires an unqueued land/sea combat unit and an empty-field target owned by an exact met wartime enemy; no district/city or shore crossing");
  } else if (owner !== -1 && owner !== playerId) return reject("Foreign territory is not supported");
  const occupants = MapUnits.getUnits(x, y);
  if (!Array.isArray(occupants) || occupants.length) return reject("An empty destination is required; no captures or swaps");
  const plot = GameplayMap.getIndexFromLocation(destination);
  const reachable = Units.getReachableMovement(unit.id), attacks = Units.getReachableTargets(unit.id);
  if (!Array.isArray(reachable) || !reachable.includes(plot) || !Array.isArray(attacks) || attacks.includes(plot)) return reject("Destination is not verified reachable noncombat movement");
  const path = Units.getPathTo(unit.id, destination);
  if (!Array.isArray(path?.plots) || path.plots.length !== 2) return reject("A direct one-edge path is required");
  const from = GameplayMap.getLocationFromIndex(path.plots[0]), to = GameplayMap.getLocationFromIndex(path.plots[1]);
  if (from.x !== unit.location.x || from.y !== unit.location.y || to.x !== x || to.y !== y) return reject("The native path does not match this direct step");
  if (!Number.isInteger(UnitOperationMoveModifiers.NONE)) return reject("Native nonattack movement modifier is unavailable");
  const args = {X: x, Y: y, Modifiers: UnitOperationMoveModifiers.NONE};
  if (Game.Combat.testAttackInto(unit.id, args) !== CombatTypes.NO_COMBAT) return reject("Native combat check did not confirm noncombat movement");
  const before = {turn: Game.turn, age: Game.age, playerId, unitId, unitType: unit.type, componentType: unit.id.type,
    location: {x: unit.location.x, y: unit.location.y}, movesRemaining: unit.Movement.movementMovesRemaining,
    embarked: typeof unit.isEmbarked === "boolean" ? unit.isEmbarked : null};
  const check = Game.UnitOperations.canStart(unit.id, UnitOperationTypes.MOVE_TO, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native movement check failed or needs confirmation", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || unit.id.owner !== playerId ||
      unit.location.x !== before.location.x || unit.location.y !== before.location.y ||
      (shore && (unit.isEmbarked !== before.embarked || GameplayMap.isWater(x, y) !== toWater ||
        GameplayMap.isWater(before.location.x, before.location.y) !== fromWater)) ||
      unit.Movement.movementMovesRemaining !== before.movesRemaining || GameplayMap.getOwner(x, y) !== owner ||
      (mode === "advance" && (!enemyField() || unit.id.type !== before.componentType || unit.type !== before.unitType || unit.isOnMap !== true || unit.isDead === true || unit.operationQueueSize !== 0 || unit.isEmbarked !== false)) ||
      MapUnits.getUnits(x, y)?.length !== 0) return reject("Game context, unit or destination changed during validation");
  // Do not invoke WorldInput: its helper can attack, declare war or swap units.
  Game.UnitOperations.sendRequest(unit.id, UnitOperationTypes.MOVE_TO, args);
  return {status: "submitted", before, expected: {unitId, unitType: unit.type, componentType: unit.id.type, location: {x, y},
    ...(shore ? {embarked: toWater} : {}), ...(mode === "advance" ? {queueSize: 0, embarked: false} : {})},
    verificationArguments: {unit_id: unitId}};
})()
