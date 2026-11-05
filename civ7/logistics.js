(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const id = GameContext.localPlayerID;
  if (!Number.isInteger(id) || id < 0) throw Error("No local player");
  const player = Players.get(id);
  if (!player) throw Error("No local player");
  const selectedId = queryArguments.unit_id;
  if (selectedId != null && (!Number.isInteger(selectedId) || selectedId < 0)) throw Error("A nonnegative owned unit instance ID is required");
  const owned = player.Units.getUnits().filter(unit => unit.id.owner === id);
  const matches = selectedId == null ? [] : owned.filter(unit => unit.id.id === selectedId);
  if (selectedId != null && matches.length !== 1) throw Error("No unique owned unit matches this instance ID");
  const byId = new Map(owned.map(unit => [unit.id.id, unit]));
  const name = key => key ? Locale.compose(key) : null;
  const nonnegative = value => Number.isFinite(value) && value >= 0 ? value : null;
  const width = GameplayMap.getGridWidth(), height = GameplayMap.getGridHeight();
  const valid = location => location && Number.isInteger(location.x) && Number.isInteger(location.y) &&
    location.x >= 0 && location.y >= 0 && location.x < width && location.y < height;
  const records = owned.filter(unit => unit.isCommanderUnit).map(unit => {
    const candidate = typeof Armies !== "undefined" && typeof Armies?.get === "function" ? Armies.get(unit.armyId) : null;
    const army = candidate?.owner === id ? candidate : null;
    const members = typeof army?.getUnitIds === "function" ? army.getUnitIds() : null;
    const packedUnitIds = members != null ? [...new Set(members.filter(component =>
      component.owner === id && byId.has(component.id)).map(component => component.id))] : null;
    return {unit, army, packedUnitIds};
  });
  const packedBy = new Map();
  for (const record of records) for (const packedId of record.packedUnitIds ?? []) packedBy.set(packedId, record.unit.id.id);
  const packingKnown = records.every(record => record.packedUnitIds !== null);
  const deployed = unit => Boolean(packingKnown && valid(unit.location) && !packedBy.has(unit.id.id) && unit.isOnMap !== false);
  const describe = unit => ({instanceId: unit.id.id, id: GameInfo.Units.lookup(unit.type)?.UnitType ?? null,
    name: name(unit.name ?? GameInfo.Units.lookup(unit.type)?.Name),
    location: deployed(unit) ? {x: unit.location.x, y: unit.location.y} : null,
    packedInCommander: packedBy.get(unit.id.id) ?? null});
  const commanders = records.map(({unit, army, packedUnitIds}) => ({...describe(unit),
    armyCommander: unit.isArmyCommander ?? null, fleetCommander: unit.isFleetCommander ?? null,
    squadronCommander: unit.isSquadronCommander ?? null, aerodromeCommander: unit.isAerodromeCommander ?? null,
    combatCapacity: nonnegative(army?.combatUnitCapacity), nonCombatCapacity: nonnegative(army?.nonCombatUnitCapacity), packedUnitIds}));
  const reinforcements = typeof player.Armies?.getUnitReinforcementCommanderId === "function" ? [] : null;
  if (reinforcements !== null) for (const unit of owned) {
    const armyId = player.Armies.getUnitReinforcementCommanderId(unit.id, id);
    if (!Number.isInteger(armyId) || armyId < 0) continue;
    const target = records.find(record => record.army && record.army.localId === armyId);
    if (!target) continue;
    reinforcements.push({...describe(unit), commanderInstanceId: target.unit.id.id,
      nativeArrivalTime: typeof player.Armies.getUnitReinforcementETA === "function"
        ? nonnegative(player.Armies.getUnitReinforcementETA(unit.id, id)) : null});
  }
  function transport(unit, operation) {
    const result = deployed(unit) ? Game.UnitOperations.canStart(unit.id, operation, {}, false) : null;
    const options = [...new Set(result?.Plots ?? [])].filter(index => Number.isInteger(index) && index >= 0 && index < width * height)
      .map(index => GameplayMap.getLocationFromIndex(index)).filter(location => {
        if (!valid(location) || typeof GameplayMap.getRevealedState !== "function" || typeof RevealedStates === "undefined") return false;
        const state = GameplayMap.getRevealedState(id, location.x, location.y);
        return state != null && (state === RevealedStates?.REVEALED || state === RevealedStates?.VISIBLE);
      })
      .map(location => ({location: {x: location.x, y: location.y}, availableNow: Boolean(result?.Success)}));
    return {operationAllowed: result ? Boolean(result.Success) : null, options,
      failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean), travelTurns: null};
  }
  let selectedUnit = null;
  if (matches.length) {
    const unit = matches[0], def = GameInfo.Units.lookup(unit.type);
    selectedUnit = {...describe(unit), deployed: deployed(unit),
      rebase: def?.Domain === "DOMAIN_AIR" ? transport(unit, "UNITOPERATION_REBASE") : null,
      reinforceArmy: def?.Packable && !unit.isCommanderUnit ? transport(unit, "UNITOPERATION_REINFORCE_ARMY") : null};
  }
  const wmdStockpile = GameInfo.WMDs == null || typeof player.WMDs?.getWeaponCount !== "function" ? null
    : [...GameInfo.WMDs].map(def => ({id: def.WeaponType, name: name(def.Name), count: nonnegative(player.WMDs.getWeaponCount(def.$hash))}));
  return {turn: Game.turn, commanders,
    airUnits: owned.filter(unit => GameInfo.Units.lookup(unit.type)?.Domain === "DOMAIN_AIR").map(describe),
    reinforcements, wmdStockpile, selectedUnit,
    note: "Owned commander/carrier/squadron/aerodrome membership and native capacity only, not inferred free slots or mission range. Missing membership stays null and suppresses deployment checks; a withheld location does not prove packing. Missing reinforcement assignment APIs return null, not an empty inventory; missing arrival getters leave nativeArrivalTime null. Reinforcement arrival is a native quote, not a guaranteed travel forecast. Optional unit_id checks explicitly REVEALED/VISIBLE native REBASE/REINFORCE_ARMY destinations for one owned deployed unit; packed/off-map units are not checked as deployed. Missing/unknown visibility withholds destinations. No hidden destinations, foreign units, launch eligibility, damage, WMD strikes or requests. This separate logistics query is not included in snapshots/exports"
  };
})()
