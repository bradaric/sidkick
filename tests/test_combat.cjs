const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run({ visible = true, unitVisible = true, met = true, atWar = true, district = false, packed = false,
  commander = false, canAttack = true, commandAllowed = true, commanderTarget = true, missingState = false, selectedCommanderBlocked = false } = {}) {
  const script = path.join(__dirname, '../civ7/combat.js');
  assert.ok(fs.existsSync(script), 'bundled combat evidence query exists');
  const attacker = { id: { owner: 0, id: 7, type: 26 }, type: 'ARCHER', owner: 0, location: packed ? { x: -1, y: -1 } : { x: 0, y: 0 },
    isCommanderUnit: commander, isFortified: missingState ? undefined : true, isEmbarked: false,
    Movement: { movementMovesRemaining: 1, hasMoved: true },
    Combat: { isCombat: true, canAttack, rangedStrength: 30, bombardStrength: 0, getMeleeStrength: () => 20,
      attacksRemaining: missingState ? undefined : 1, maxNumAttacks: 2, attackRange: 3, antiAirStrength: 4,
      canAttackAfterMoving: false, hasAttacked: true, hasMovedIntoZOC: false,
      combatModifiers: { combatStrengthModifier: 5, rangedStrengthModifier: 2, friendlyTerritoryCombatMod: 3,
        canMoveAfterAttacking: true, numberEnemyNeighborCombatModifier: 999, secret: { x: 999 } } },
    Health: { maxDamage: 100, damage: 5 } };
  const defenderId = { owner: 1, id: 8, type: district ? 4 : 26 };
  const defender = { id: defenderId, owner: 1, type: 'DEFENDER', location: { x: 1, y: 0 }, getMaxDamage: 100, getDamage: 10,
    Health: { maxDamage: 100, damage: 10 }, Combat: { getMeleeStrength: () => 25, rangedStrength: 0, bombardStrength: 0 } };
  let queries = 0, commandQueries = 0, focusedQueries = 0, meleeQueries = 0, overrunQueries = 0;
  const data = vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    queryArguments: { unit_id: 7, x: 1, y: 0 }, UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    Players: { get: id => id === 0 ? { Units: { getUnits: () => [attacker] }, Diplomacy: { hasMet: () => met, isAtWarWith: () => atWar } }
      : { civilizationFullName: 'Known enemy' } },
    GameplayMap: { getGridWidth: () => 2, getGridHeight: () => 1, getRevealedState: () => visible ? 2 : 1,
      getIndexFromLocation: location => location.x,
      getTerrainType: (x, y) => { assert.ok(visible); assert.equal(x, 1); return 'HILLS'; },
      getFeatureType: () => 'FOREST', getBiomeType: () => 'TEMPERATE' },
    RevealedStates: { VISIBLE: 2 }, Visibility: { isVisible: () => unitVisible },
    Units: { get: () => { assert.ok(unitVisible, 'invisible defenders are never inspected'); return defender; } },
    Districts: { get: () => defender },
    GameInfo: { Units: { lookup: type => ({ UnitType: type, Name: type }) }, Districts: { lookup: () => ({ Name: 'Fortified district' }) },
      Terrains: { lookup: () => ({ TerrainType: 'HILLS', Name: 'Hills', DefenseModifier: 3 }) },
      Features: { lookup: () => ({ FeatureType: 'FOREST', Name: 'Forest', DefenseModifier: 2 }) },
      Biomes: { lookup: () => ({ BiomeType: 'TEMPERATE', Name: 'Temperate' }) } },
    UnitOperationTypes: { MOVE_TO: 'MOVE', RANGE_ATTACK: 'RANGED' }, UnitOperationMoveModifiers: { ATTACK: 1 },
    Game: { turn: 109, Combat: {
      getDefensibleDistrict: () => { assert.ok(visible); assert.equal(packed, false); return district ? defenderId : { owner: -1, id: -1 }; },
      getBestDefender: () => { assert.ok(visible); assert.equal(packed, false); return defenderId; },
      simulateAttackAsync: () => { throw Error('Stateful preview requests are forbidden'); },
    }, UnitOperations: { canStart: (id, op, args, shown) => {
      queries++; assert.equal(id.owner, 0); assert.equal(args.X, 1); assert.equal(args.Y, 0); assert.equal(shown, false);
      return { Success: op === 'RANGED', FailureReasons: op === 'RANGED' ? [] : ['Out of range'] };
    } }, UnitCommands: { canStart: (id, command, args, shown) => {
      assert.equal(packed, false); assert.equal(id.owner, 0); assert.equal(id.id, 7); assert.equal(shown, false);
      if (command === 'UNITCOMMAND_COMMANDER_ATTACK') {
        commandQueries++;
      } else {
        assert.ok(['UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED', 'UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE', 'UNITCOMMAND_ARMY_OVERRUN'].includes(command));
        if (command === 'UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED') focusedQueries++;
        else if (command === 'UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE') meleeQueries++; else overrunQueries++;
        if (Object.keys(args).length) assert.deepEqual(JSON.parse(JSON.stringify(args)), {X: 1, Y: 0});
      }
      return { Success: commandAllowed && !(selectedCommanderBlocked && command === 'UNITCOMMAND_COMMANDER_ATTACK' && Object.keys(args).length), FailureReasons: commandAllowed ? [] : ['No eligible army units'],
        Plots: commanderTarget ? [1, 999] : [999], Modifiers: [{ secret: 999 }] };
    } } },
  });
  return { data: JSON.parse(JSON.stringify(data)), queries, commandQueries, focusedQueries, meleeQueries, overrunQueries };
}

test('combat evidence exposes observable strength and native attack eligibility but never invents damage', () => {
  const { data } = run();
  assert.equal(data.defender.kind, 'unit');
  assert.equal(data.defender.ownerId, 1);
  assert.equal(data.defender.instanceId, 8);
  assert.equal(data.defender.componentType, 26);
  assert.equal(data.attacker.health.current, 95);
  assert.equal(data.defender.strength.melee, 25);
  assert.equal(data.options.find(o => o.kind === 'ranged').availableNow, true);
  assert.equal(data.options.find(o => o.kind === 'melee').availableNow, false);
  assert.equal(data.expectedDamageToAttacker, null);
  assert.equal(data.expectedDamageToDefender, null);
  assert.equal(data.outcome, null);
});

test('fogged tiles are rejected before querying defenders', () => {
  assert.throws(() => run({ visible: false }), /visible/i);
});

test('invisible units, unmet owners and non-hostile targets are not exposed or offered as attacks', () => {
  for (const options of [{ unitVisible: false }, { met: false }, { atWar: false }]) {
    const { data, queries } = run(options);
    assert.equal(data.defender, null);
    assert.deepEqual(data.options, []);
    assert.equal(queries, 0);
  }
});

test('visible enemy districts use observable health without fabricating a district strength', () => {
  const { data } = run({ district: true });
  assert.equal(data.defender.kind, 'district');
  assert.equal(data.defender.ownerId, 1); assert.equal(data.defender.instanceId, 8); assert.equal(data.defender.componentType, 4);
  assert.equal(data.defender.health.current, 90);
  assert.equal(data.defender.strength, null);
});

test('packed attackers do not enter target-specific native combat queries', () => {
  const { data, queries } = run({ packed: true });
  assert.equal(data.defender, null);
  assert.deepEqual(data.options, []);
  assert.equal(queries, 0);
});

test('combat readiness and local reported modifiers stay separate from contextual totals', () => {
  const { data } = run();
  assert.ok(data.attacker.readiness, 'attack-readiness evidence is exported');
  assert.equal(data.attacker.readiness.attacksRemaining, 1);
  assert.equal(data.attacker.readiness.maximumAttacks, 2);
  assert.equal(data.attacker.readiness.attackRange, 3);
  assert.equal(data.attacker.readiness.fortified, true);
  assert.equal(data.attacker.readiness.embarked, false);
  assert.equal(data.attacker.readiness.hasMoved, true);
  assert.equal(data.attacker.readiness.canAttackAfterMoving, false);
  assert.equal(data.attacker.reportedModifiers.combatStrengthModifier, 5);
  assert.equal(data.attacker.reportedModifiers.rangedStrengthModifier, 2);
  assert.equal(data.attacker.reportedModifiers.canMoveAfterAttacking, true);
  assert.equal(data.attacker.reportedModifiers.bombardStrengthModifier, null);
  assert.equal(data.contextualStrength, null);
  assert.ok(!JSON.stringify(data).includes('999'), 'raw modifiers and hidden-context counters are not exported');
  const unknown = run({ missingState: true }).data.attacker.readiness;
  assert.equal(unknown.attacksRemaining, null);
  assert.equal(unknown.fortified, null, 'unavailable state is not false or zero');
});

test('visible target terrain reports definition modifiers without adding them into a forecast', () => {
  const { data } = run();
  assert.ok(data.targetTerrain, 'visible target terrain evidence is exported');
  assert.equal(data.targetTerrain.terrain.id, 'HILLS');
  assert.equal(data.targetTerrain.terrain.definitionDefenseModifier, 3);
  assert.equal(data.targetTerrain.feature.definitionDefenseModifier, 2);
  assert.equal(data.targetTerrain.biome.id, 'TEMPERATE');
  assert.equal(data.expectedDamageToDefender, null);
});

test('commander attack has its own permission and requires the visible target in native plots', () => {
  const { data, queries, commandQueries } = run({ commander: true, canAttack: false });
  assert.equal(queries, 0, 'a commander command must not require a regular attack check');
  assert.equal(commandQueries, 2);
  assert.ok(data.commanderAttack, 'distinct commander attack evidence is exported');
  assert.equal(data.commanderAttack.operationAllowed, true);
  assert.equal(data.commanderAttack.targetInNativePlots, true);
  assert.equal(data.commanderAttack.availableNow, true);
  assert.equal(data.commanderAttack.selectedTargetAllowed, true);
  assert.equal(run({commander: true, selectedCommanderBlocked: true}).data.commanderAttack.availableNow, false);
  assert.equal(run({ commander: true, district: true, canAttack: false }).data.commanderAttack?.availableNow, true);
  assert.equal(run({ commander: true, commanderTarget: false }).data.commanderAttack?.availableNow, false);
  const blocked = run({ commander: true, commandAllowed: false }).data.commanderAttack;
  assert.equal(blocked?.availableNow, false);
  assert.deepEqual(blocked?.failureReasons, ['No eligible army units']);
  assert.ok(!JSON.stringify(data).includes('999'), 'other native target plots and command metadata remain private');
});

test('commander target checks require a deployed owned commander and observable hostile defender', () => {
  for (const options of [{}, { commander: true, packed: true }, { commander: true, unitVisible: false },
    { commander: true, met: false }, { commander: true, atWar: false }]) {
    const { data, commandQueries } = run(options);
    assert.equal(commandQueries, 0);
    assert.equal(data.commanderAttack, null);
  }
});

test('focused land-ranged command readout checks the offered target and exact selected-plot permission', () => {
  const {data, focusedQueries} = run({commander: true});
  assert.ok(data.focusedLandRangedAttack);
  assert.equal(data.focusedLandRangedAttack.availableNow, true);
  assert.equal(focusedQueries, 2);
  assert.equal(run({commander: true, commanderTarget: false}).data.focusedLandRangedAttack.availableNow, false);
  assert.equal(run({commander: true, commandAllowed: false}).data.focusedLandRangedAttack.availableNow, false);
  assert.equal(run({commander: true, unitVisible: false}).focusedQueries, 0);
});

test('coordinated melee readout checks the separate offered and selected command without firing', () => {
  const {data, meleeQueries} = run({commander: true});
  assert.equal(data.focusedLandMeleeAttack.availableNow, true); assert.equal(meleeQueries, 2);
  assert.equal(run({commander: true, commanderTarget: false}).data.focusedLandMeleeAttack.availableNow, false);
  assert.equal(run({commander: true, unitVisible: false}).meleeQueries, 0);
});

test('Overrun readout uses native offered/selected permission without guessing a strength threshold', () => {
  const {data, overrunQueries} = run({commander: true});
  assert.equal(data.overrun.availableNow, true); assert.equal(overrunQueries, 2);
  assert.equal(run({commander: true, commandAllowed: false}).data.overrun.availableNow, false);
  assert.equal(run({commander: true, commanderTarget: false}).data.overrun.availableNow, false);
  assert.equal(run({commander: true, unitVisible: false}).overrunQueries, 0);
});

function promotions({ canPromote = true, canEarn = true, allowed = true } = {}) {
  const records = [
    { UnitPromotionType: 'OWNED', Name: 'Owned', $hash: 10 },
    { UnitPromotionType: 'CHOICE', Name: 'Choice', Description: '+strength', $hash: 11 },
    { UnitPromotionType: 'COMMENDATION', Name: 'Medal', Commendation: true, $hash: 12 },
  ];
  const details = [
    { UnitPromotionDisciplineType: 'DISC', UnitPromotionType: 'OWNED' },
    { UnitPromotionDisciplineType: 'DISC', UnitPromotionType: 'CHOICE', PrereqUnitPromotion: 'OWNED' },
    { UnitPromotionDisciplineType: 'DISC', UnitPromotionType: 'CHOICE', PrereqUnitPromotion: 'OTHER' },
    { UnitPromotionDisciplineType: 'DISC', UnitPromotionType: 'COMMENDATION' },
  ];
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/units.js'), 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    Players: { get: () => ({ Units: { getUnits: () => [{ id: { owner: 0, id: 7 }, type: 'COMMANDER', location: { x: 0, y: 0 }, Experience: {
      canPromote, hasPromotion: (discipline, type) => type === 'OWNED', canEarnPromotion: () => canEarn,
    } }] } }) },
    GameInfo: { Units: { lookup: () => ({ UnitType: 'COMMANDER', PromotionClass: 'CLASS' }) }, Unit_Stats: { lookup: () => null },
      UnitPromotionClassSets: [{ PromotionClassType: 'CLASS', UnitPromotionDisciplineType: 'DISC' }],
      UnitPromotionDisciplines: { lookup: () => ({ Name: 'Discipline', UnitPromotionDisciplineType: 'DISC', $hash: 20 }) },
      UnitPromotionDisciplineDetails: details, UnitPromotions: { lookup: id => records.find(r => r.UnitPromotionType === id) },
    },
    Database: { makeHash: key => key === 'DISC' ? 20 : records.find(r => r.UnitPromotionType === key).$hash },
    UnitCommandTypes: { PROMOTE: 'PROMOTE' },
    Game: { turn: 109, UnitCommands: { canStart: (id, command, args, shown) => {
      assert.equal(command, 'PROMOTE'); assert.equal(args.PromotionDisciplineType, 20); assert.equal(shown, false);
      return { Success: allowed, FailureReasons: allowed ? [] : ['Unavailable'] };
    } } },
  });
  return JSON.parse(JSON.stringify(data)).units[0].experience;
}

test('promotion choices are deduplicated, retain prerequisite ownership and include commendations', () => {
  const experience = promotions();
  assert.ok(experience.promotionChoices, 'unowned promotion choices are exported');
  assert.deepEqual(experience.promotionChoices.map(p => p.id), ['CHOICE', 'COMMENDATION']);
  assert.deepEqual(experience.promotionChoices[0].prerequisites, [{ id: 'OWNED', purchased: true }, { id: 'OTHER', purchased: false }]);
  assert.equal(experience.promotionChoices[0].availableNow, true, 'native eligibility, not inferred prerequisite logic, is authoritative');
  assert.equal(experience.promotionChoices[1].commendation, true);
});

test('promotion availability needs picker eligibility and native operation permission', () => {
  for (const options of [{ canPromote: false }, { canEarn: false }, { allowed: false }]) {
    const choice = promotions(options).promotionChoices?.[0];
    assert.ok(choice, 'locked choices remain visible');
    assert.equal(choice.availableNow, false);
  }
});
