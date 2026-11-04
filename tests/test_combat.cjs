const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run({ visible = true, unitVisible = true, met = true, atWar = true, district = false, packed = false } = {}) {
  const script = path.join(__dirname, '../civ7/combat.js');
  assert.ok(fs.existsSync(script), 'bundled combat evidence query exists');
  const attacker = { id: { owner: 0, id: 7, type: 26 }, type: 'ARCHER', owner: 0, location: packed ? { x: -1, y: -1 } : { x: 0, y: 0 },
    Combat: { isCombat: true, canAttack: true, rangedStrength: 30, bombardStrength: 0, getMeleeStrength: () => 20 },
    Health: { maxDamage: 100, damage: 5 } };
  const defenderId = { owner: 1, id: 8, type: district ? 4 : 26 };
  const defender = { id: defenderId, owner: 1, type: 'DEFENDER', location: { x: 1, y: 0 }, getMaxDamage: 100, getDamage: 10,
    Health: { maxDamage: 100, damage: 10 }, Combat: { getMeleeStrength: () => 25, rangedStrength: 0, bombardStrength: 0 } };
  let queries = 0;
  const data = vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    queryArguments: { unit_id: 7, x: 1, y: 0 }, UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    Players: { get: id => id === 0 ? { Units: { getUnits: () => [attacker] }, Diplomacy: { hasMet: () => met, isAtWarWith: () => atWar } }
      : { civilizationFullName: 'Known enemy' } },
    GameplayMap: { getGridWidth: () => 2, getGridHeight: () => 1, getRevealedState: () => visible ? 2 : 1 },
    RevealedStates: { VISIBLE: 2 }, Visibility: { isVisible: () => unitVisible },
    Units: { get: () => { assert.ok(unitVisible, 'invisible defenders are never inspected'); return defender; } },
    Districts: { get: () => defender },
    GameInfo: { Units: { lookup: type => ({ UnitType: type, Name: type }) }, Districts: { lookup: () => ({ Name: 'Fortified district' }) } },
    UnitOperationTypes: { MOVE_TO: 'MOVE', RANGE_ATTACK: 'RANGED' }, UnitOperationMoveModifiers: { ATTACK: 1 },
    Game: { turn: 109, Combat: {
      getDefensibleDistrict: () => { assert.ok(visible); assert.equal(packed, false); return district ? defenderId : { owner: -1, id: -1 }; },
      getBestDefender: () => { assert.ok(visible); assert.equal(packed, false); return defenderId; },
      simulateAttackAsync: () => { throw Error('Stateful preview requests are forbidden'); },
    }, UnitOperations: { canStart: (id, op, args, shown) => {
      queries++; assert.equal(id.owner, 0); assert.equal(args.X, 1); assert.equal(args.Y, 0); assert.equal(shown, false);
      return { Success: op === 'RANGED', FailureReasons: op === 'RANGED' ? [] : ['Out of range'] };
    } } },
  });
  return { data: JSON.parse(JSON.stringify(data)), queries };
}

test('combat evidence exposes observable strength and native attack eligibility but never invents damage', () => {
  const { data } = run();
  assert.equal(data.defender.kind, 'unit');
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
  assert.equal(data.defender.health.current, 90);
  assert.equal(data.defender.strength, null);
});

test('packed attackers do not enter target-specific native combat queries', () => {
  const { data, queries } = run({ packed: true });
  assert.equal(data.defender, null);
  assert.deepEqual(data.options, []);
  assert.equal(queries, 0);
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
