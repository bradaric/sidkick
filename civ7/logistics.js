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
    if (unit.isCommanderUnit && deployed(unit) && typeof Game.UnitCommands?.canStart === "function") {
      const pack = Game.UnitCommands.canStart(unit.id, "UNITCOMMAND_PACK_ARMY", {X: -9999, Y: -9999, UnitAbilityType: -1}, false);
      const unpack = Game.UnitCommands.canStart(unit.id, "UNITCOMMAND_UNPACK_ARMY", {}, false);
      const options = [...new Set(unpack?.Plots ?? [])].filter(index => Number.isInteger(index) && index >= 0 && index < width * height)
        .map(index => GameplayMap.getLocationFromIndex(index)).filter(location => valid(location) &&
          typeof GameplayMap.getRevealedState === "function" && typeof RevealedStates !== "undefined" &&
          GameplayMap.getRevealedState(id, location.x, location.y) === RevealedStates.VISIBLE &&
          typeof GameplayMap.getOwner === "function" && GameplayMap.getOwner(location.x, location.y) === id)
        .map(location => {
          const check = Game.UnitCommands.canStart(unit.id, "UNITCOMMAND_UNPACK_ARMY", {X: location.x, Y: location.y}, false);
          return {location: {x: location.x, y: location.y}, availableNow: check?.Success === true,
            failureReasons: (check?.FailureReasons ?? []).map(name).filter(Boolean)};
        });
      selectedUnit.pack = {operationAllowed: pack?.Success === true,
        scope: "All native-eligible nearby friendly units, not per-unit selection",
        failureReasons: (pack?.FailureReasons ?? []).map(name).filter(Boolean)};
      selectedUnit.unpack = {operationAllowed: unpack?.Success === true, options,
        failureReasons: (unpack?.FailureReasons ?? []).map(name).filter(Boolean)};
      const upgrade = Game.UnitCommands.canStart(unit.id, "UNITCOMMAND_UPGRADE_ARMY", {X: -9999, Y: -9999, UnitAbilityType: -1}, false);
      const upgradeText = Array.isArray(upgrade?.AdditionalDescription) && upgrade.AdditionalDescription.length === 1 ? upgrade.AdditionalDescription[0] : null;
      const upgradeQuote = typeof upgradeText === "string" ? /^Upgrade ([1-9][0-9]*) units: (0|[1-9][0-9]*) \[icon:YIELD_GOLD\] Gold$/.exec(upgradeText) : null;
      const quoteKnown = upgradeQuote && Number.isSafeInteger(Number(upgradeQuote[1])) && Number.isSafeInteger(Number(upgradeQuote[2]));
      selectedUnit.upgradeArmy = {operationAllowed: upgrade?.Success === true, quotedUnitCount: quoteKnown ? Number(upgradeQuote[1]) : null,
        quotedGoldCost: quoteKnown ? Number(upgradeQuote[2]) : null, quoteSource: quoteKnown ? "exact-native-English-group-description" : null,
        failureReasons: (upgrade?.FailureReasons ?? []).map(name).filter(Boolean),
        scope: "Native aggregate quote only; per-member direct target/price reconciliation and full inventory guards are enforced by the action"};
      if (def?.Domain === "DOMAIN_LAND") {
        const railSource = unit.isEmbarked === false && typeof GameplayMap.isWater === "function" &&
          GameplayMap.isWater(unit.location.x, unit.location.y) === false && typeof GameplayMap.getOwner === "function" &&
          GameplayMap.getOwner(unit.location.x, unit.location.y) === id && typeof GameplayMap.getRevealedState === "function" &&
          typeof RevealedStates !== "undefined" && GameplayMap.getRevealedState(id, unit.location.x, unit.location.y) === RevealedStates.VISIBLE;
        const rail = railSource ? Game.UnitCommands.canStart(unit.id, "UNITCOMMAND_MOVE_BY_RAIL", {}, false) : null, railOptions = [];
        for (const index of [...new Set(rail?.Plots ?? [])]) {
          if (!Number.isInteger(index) || index < 0 || index >= width * height) continue;
          const l = GameplayMap.getLocationFromIndex(index);
          if (!valid(l) || (l.x === unit.location.x && l.y === unit.location.y) ||
              GameplayMap.getRevealedState(id, l.x, l.y) !== RevealedStates.VISIBLE || GameplayMap.getOwner(l.x, l.y) !== id ||
              GameplayMap.isWater(l.x, l.y) !== false || typeof MapUnits === "undefined" ||
              !Array.isArray(MapUnits.getUnits(l.x, l.y)) || MapUnits.getUnits(l.x, l.y).length !== 0) continue;
          const check = Game.UnitCommands.canStart(unit.id, "UNITCOMMAND_MOVE_BY_RAIL", {X: l.x, Y: l.y}, false);
          railOptions.push({location: {x: l.x, y: l.y}, availableNow: rail?.Success === true && check?.Success === true &&
            check.RequiresConfirmation !== true && unit.operationQueueSize === 0 && unit.Movement?.movementMovesRemaining > 0,
            failureReasons: (check?.FailureReasons ?? []).map(name).filter(Boolean)});
        }
        selectedUnit.rail = {operationAllowed: rail ? rail.Success === true : null, options: railOptions,
          failureReasons: (rail?.FailureReasons ?? []).map(name).filter(Boolean)};
        const command = "UNITCOMMAND_GRANT_SECOND_WIND", wind = Game.UnitCommands.canStart(unit.id, command, {}, false), recipients = [];
        for (const index of [...new Set(wind?.Plots ?? [])]) {
          if (!Number.isInteger(index) || index < 0 || index >= width * height) continue;
          const l = GameplayMap.getLocationFromIndex(index);
          if (!valid(l) || typeof GameplayMap.getRevealedState !== "function" || typeof RevealedStates === "undefined" ||
              GameplayMap.getRevealedState(id, l.x, l.y) !== RevealedStates.VISIBLE || typeof GameplayMap.getOwner !== "function" ||
              ![-1, id].includes(GameplayMap.getOwner(l.x, l.y)) || typeof MapUnits === "undefined") continue;
          const ids = MapUnits.getUnits(l.x, l.y), target = Array.isArray(ids) && ids.length === 1 && ids[0].owner === id ? byId.get(ids[0].id) : null;
          if (!target || target.id.type !== ids[0].type || target.isCommanderUnit || !deployed(target) || target.operationQueueSize !== 0 ||
              target.location.x !== l.x || target.location.y !== l.y || GameInfo.Units.lookup(target.type)?.Domain !== "DOMAIN_LAND" ||
              GameInfo.Units.lookup(target.type)?.FormationClass !== "FORMATION_CLASS_LAND_COMBAT" || target.Combat?.isCombat !== true ||
              typeof player.Armies?.getUnitReinforcementCommanderId !== "function" || player.Armies.getUnitReinforcementCommanderId(target.id, id) !== -1) continue;
          const check = Game.UnitCommands.canStart(unit.id, command, {X: l.x, Y: l.y}, false);
          recipients.push({unitId: target.id.id, location: {x: l.x, y: l.y}, availableNow: wind?.Success === true && check?.Success === true &&
            check.RequiresConfirmation !== true && unit.operationQueueSize === 0,
            failureReasons: (check?.FailureReasons ?? []).map(name).filter(Boolean)});
        }
        selectedUnit.secondWind = {operationAllowed: wind?.Success === true, options: recipients,
          failureReasons: (wind?.FailureReasons ?? []).map(name).filter(Boolean)};
      }
    }
    if (!unit.isCommanderUnit && ["DOMAIN_LAND", "DOMAIN_SEA"].includes(def?.Domain) && def.Packable === true && packingKnown && typeof Game.UnitCommands?.canStart === "function" &&
        (def.Domain !== "DOMAIN_SEA" || def.FormationClass === "FORMATION_CLASS_NAVAL")) {
      const membershipCommand = packedBy.has(unit.id.id) ? "UNITCOMMAND_REMOVE_FROM_ARMY" : "UNITCOMMAND_ADD_TO_ARMY";
      const leaving = packedBy.has(unit.id.id), commanderId = packedBy.get(unit.id.id) ?? null;
      const sourceCommander = leaving ? byId.get(commanderId) : null;
      const applicable = leaving ? sourceCommander && deployed(sourceCommander) : deployed(unit);
      const result = applicable ? Game.UnitCommands.canStart(unit.id, membershipCommand, {}, false) : null;
      const options = [];
      for (const index of [...new Set(result?.Plots ?? [])]) {
        if (!Number.isInteger(index) || index < 0 || index >= width * height) continue;
        const l = GameplayMap.getLocationFromIndex(index);
        if (!valid(l) || typeof GameplayMap.getRevealedState !== "function" || typeof RevealedStates === "undefined" ||
            GameplayMap.getRevealedState(id, l.x, l.y) !== RevealedStates.VISIBLE || typeof GameplayMap.getOwner !== "function" ||
            ![-1, id].includes(GameplayMap.getOwner(l.x, l.y))) continue;
        const targets = leaving ? [sourceCommander] : records.map(r => r.unit).filter(c => deployed(c) &&
          GameInfo.Units.lookup(c.type)?.Domain === def.Domain && c.location.x === l.x && c.location.y === l.y);
        if (targets.length !== 1 || !valid(targets[0].location) || typeof GameplayMap.getPlotDistance !== "function") continue;
        const c = targets[0];
        if (GameInfo.Units.lookup(c.type)?.Domain !== def.Domain || (def.Domain === "DOMAIN_SEA" &&
            (c.isFleetCommander !== true || typeof GameplayMap.isWater !== "function" ||
              GameplayMap.isWater(c.location.x, c.location.y) !== true || GameplayMap.isWater(l.x, l.y) !== true ||
              (!leaving && GameplayMap.isWater(unit.location.x, unit.location.y) !== true)))) continue;
        if (leaving) {
          if (GameplayMap.getPlotDistance(c.location.x, c.location.y, l.x, l.y) !== 1 || typeof MapUnits === "undefined" ||
              !Array.isArray(MapUnits.getUnits(l.x, l.y)) || MapUnits.getUnits(l.x, l.y).length !== 0) continue;
        } else if (GameplayMap.getPlotDistance(unit.location.x, unit.location.y, l.x, l.y) > 1) continue;
        const check = Game.UnitCommands.canStart(unit.id, membershipCommand, {X: l.x, Y: l.y}, false);
        options.push({commanderId: c.id.id, location: {x: l.x, y: l.y}, availableNow: result?.Success === true && check?.Success === true &&
          check.RequiresConfirmation !== true && unit.operationQueueSize === 0 && c.operationQueueSize === 0 &&
          typeof player.Armies?.getUnitReinforcementCommanderId === "function" && player.Armies.getUnitReinforcementCommanderId(unit.id, id) === -1,
          failureReasons: (check?.FailureReasons ?? []).map(name).filter(Boolean)});
      }
      selectedUnit[leaving ? "removeFromArmy" : "addToArmy"] = {commanderId, operationAllowed: result?.Success === true, options,
        failureReasons: (result?.FailureReasons ?? []).map(name).filter(Boolean)};
    }
  }
  const wmdStockpile = GameInfo.WMDs == null || typeof player.WMDs?.getWeaponCount !== "function" ? null
    : [...GameInfo.WMDs].map(def => ({id: def.WeaponType, name: name(def.Name), count: nonnegative(player.WMDs.getWeaponCount(def.$hash))}));
  return {turn: Game.turn, commanders,
    airUnits: owned.filter(unit => GameInfo.Units.lookup(unit.type)?.Domain === "DOMAIN_AIR").map(describe),
    reinforcements, wmdStockpile, selectedUnit,
    note: "Owned commander/carrier/squadron/aerodrome membership and native capacity only, not inferred free slots or mission range. Missing membership stays null and suppresses deployment checks; a withheld location does not prove packing. Missing reinforcement assignment APIs return null, not an empty inventory; missing arrival getters leave nativeArrivalTime null. Reinforcement arrival is a native quote, not a guaranteed travel forecast. Optional unit_id checks explicitly REVEALED/VISIBLE native REBASE/REINFORCE_ARMY destinations for one owned deployed unit; selected deployed commanders additionally report pack-nearby permission and currently visible owned UNPACK_ARMY plots with exact selected-plot checks. Packed/off-map units are not checked as deployed. Missing/unknown visibility withholds destinations. No hidden destinations, foreign units, launch eligibility, damage, WMD strikes or requests. This separate logistics query is not included in snapshots/exports"
  };
})()
