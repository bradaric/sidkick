const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run({ missingCatalog = false } = {}) {
  return JSON.parse(JSON.stringify(vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/empire.js'), 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    Players: { get: id => { assert.equal(id, 0); return {
      leaderType: 1, civilizationType: 2, previousAgeCivilizationType: 3, civilizationFullName: 'Current civilization',
      Treasury: { goldBalance: 100 }, Stats: { getNetYield: () => 5, numSettlements: 2, settlementCap: 3 },
    }; } },
    Database: { query: (database, sql) => {
      assert.equal(database, 'config'); assert.match(sql, /^SELECT /i);
      if (missingCatalog) return null;
      if (/LeaderItems/.test(sql)) return [
        { LeaderType: 'LEADER_PERSONA', Type: 'PERSONA_ABILITY', Kind: 'KIND_TRAIT', Name: 'Persona ability', Description: 'Conditional leader bonus' },
        { LeaderType: 'LEADER_BASE', Type: 'BASE_ABILITY', Kind: 'KIND_TRAIT', Description: 'Wrong persona' },
      ];
      return [
        { CivilizationType: 'CURRENT', AgeType: 'AGE_MODERN', Type: 'CURRENT_ABILITY', Kind: 'KIND_TRAIT', Name: 'Modern ability', Description: 'Current bonus' },
        { CivilizationType: 'CURRENT', AgeType: 'AGE_EXPLORATION', Type: 'OLD_ABILITY', Kind: 'KIND_TRAIT', Description: 'Old-Age bonus' },
        { CivilizationType: 'CURRENT', AgeType: null, Type: 'UNIQUE', Kind: 'KIND_UNIT', Name: 'Unique unit', Description: 'Unit effect' },
        { CivilizationType: 'PREVIOUS', Type: 'PREVIOUS_ABILITY', Kind: 'KIND_TRAIT', Description: 'Previous civilization bonus' },
      ];
    } },
    GameInfo: {
      Yields: [{ YieldType: 'GOLD', $hash: 10 }], Ages: { lookup: () => ({ AgeType: 'AGE_MODERN', Name: 'Modern' }) },
      Leaders: { lookup: () => ({ LeaderType: 'LEADER_PERSONA', Name: 'Persona' }) },
      Civilizations: { lookup: type => ({ CivilizationType: type === 2 ? 'CURRENT' : 'PREVIOUS', Name: type === 2 ? 'Current' : 'Previous' }) },
      LeaderTraits: [{ LeaderType: 'LEADER_PERSONA', TraitType: 'LEADER_TRAIT' }],
      CivilizationTraits: [{ CivilizationType: 'CURRENT', TraitType: 'CIV_TRAIT' }],
      Traits: { lookup: type => ({ TraitType: type, Name: type, Description: null }) },
      TraitModifiers: [{ TraitType: 'CIV_TRAIT', ModifierId: 'MODIFIER' }],
      Modifiers: [{ ModifierId: 'MODIFIER', OwnerRequirementSetId: 'OWNER_CONDITION', SubjectRequirementSetId: 'SUBJECT_CONDITION', secret: 999 }],
      ModifierStrings: [{ ModifierId: 'MODIFIER', Context: 'Description', Text: 'Conditional modifier effect' }],
    },
    Game: { turn: 8, age: 1 },
  })));
}

test('empire adds local leader/persona and current-civilization definitions while retaining totals', () => {
  const data = run();
  assert.equal(data.treasury, 100);
  assert.equal(data.netYields.GOLD, 5);
  assert.ok(data.identity, 'identity ability context is included in empire data');
  assert.equal(data.identity.leader.id, 'LEADER_PERSONA');
  assert.equal(data.identity.leader.items[0].description, 'Conditional leader bonus');
  assert.equal(data.identity.leader.items.length, 1, 'persona matching is exact, not a prefix match');
  assert.deepEqual(data.identity.civilization.items.map(item => item.id), ['CURRENT_ABILITY', 'UNIQUE']);
  assert.equal(data.identity.previousCivilization.id, 'PREVIOUS');
  assert.ok(!JSON.stringify(data.identity).includes('Old-Age bonus'));
  assert.ok(!JSON.stringify(data.identity).includes('Previous civilization bonus'));
});

test('identity-linked modifiers preserve conditions without asserting applied numerical effects', () => {
  const identity = run().identity;
  assert.ok(identity, 'identity evidence is exported');
  const modifier = identity.civilization.traits[0].modifiers[0];
  assert.equal(modifier.ownerRequirementSet, 'OWNER_CONDITION');
  assert.equal(modifier.subjectRequirementSet, 'SUBJECT_CONDITION');
  assert.equal(modifier.description, 'Conditional modifier effect');
  assert.equal(modifier.appliedYieldContribution, null);
  assert.ok(!JSON.stringify(identity).includes('999'));
});

test('missing configuration catalogs stay unknown without losing native empire totals', () => {
  const data = run({ missingCatalog: true });
  assert.equal(data.identity?.leader.items, null);
  assert.equal(data.identity?.civilization.items, null);
  assert.equal(data.treasury, 100);
});
