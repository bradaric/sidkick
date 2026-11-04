const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run({ bypass = false, closed = true, full = false, missingProgress = false, unknownProgress = false,
  finalAge = false, mode = 'AGE_TRANSITION_SETTING_KEEP_MORE', speedFactor = 1 } = {}) {
  const script = path.join(__dirname, '../civ7/age_transition.js');
  assert.ok(fs.existsSync(script), 'bundled age-transition query exists');
  const card = { id: 'CARD_AT_EX_TEST', name: 'Dedication', description: 'Benefit', cost: [{ category: 1, value: 2 }],
    individualLimit: 1, groupLimit: -1, effects: [{ id: 'EFFECT', amount: 1, metadata: { x: 999 } }] };
  const currentSlot = { ID: 'PlayerMementoMajorSlot', invalidReason: 0, value: { value: 'M', name: 'Memento' },
    domain: { possibleValues: [{ value: 'M', name: 'Memento', invalidReason: 0 }] } };
  const futureSlot = { ...currentSlot, ID: 'AgeTransitionPlayerMementoMajorSlot', value: { value: 'NONE', name: 'None' } };
  const data = vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: (text, ...args) => [text, ...args].join('|') },
    Players: { get: id => { assert.equal(id, 0); return {
      Treasury: { goldBalance: 12000 }, DiplomacyTreasury: { diplomacyBalance: 1500 },
      Cities: { getCities: () => [{ name: 'Capital', isCapital: true }, { name: 'City', isTown: false }] },
      AdvancedStart: { getPlacementComplete: () => closed, getDeckSize: () => 3,
        getCards: () => Array.from({ length: full ? 3 : 1 }, () => ({ info: card })), getAvailableCards: () => [card],
        getLegacyPoints: () => [{ category: 1, value: 2 }] },
    }; } },
    Configuration: { getGame: () => ({ getValue: key => key === 'NoCivilizationUnlocks' ? bypass : mode }) },
    Database: { query: (database, sql) => {
      assert.equal(database, 'config'); assert.match(sql, /^SELECT /i, 'queries must be read-only');
      if (/FROM Ages/i.test(sql)) return [
        { Domain: 'Ages', AgeType: 'AGE_EXPLORATION', ChronologyIndex: 20 },
        { Domain: 'Ages', AgeType: 'AGE_MODERN', Name: 'Modern', ChronologyIndex: 30, PlayerCivilizationDomain: 'ModernCivs' },
        { Domain: 'OtherRules', AgeType: 'WRONG_AGE', ChronologyIndex: 21 },
      ];
      if (/FROM CivilizationItems/i.test(sql)) return [{ CivilizationType: 'CIV_B', AgeType: 'AGE_MODERN', Kind: 'KIND_TRAIT', Name: 'Ability', Description: 'Ability effect' }];
      if (/FROM Mementos/i.test(sql)) return [{ Type: 'M', FunctionalDescription: 'Memento effect' }];
      throw Error(`Unexpected SQL: ${sql}`);
    } },
    GameSetup: {
      resolveString: value => value, findGameParameter: () => ({ value: { originDomain: 'Ages' } }),
      findPlayerParameter: (id, name) => {
        assert.equal(id, 0); assert.equal(name, 'AgeTransitionPlayerCivilization', 'normal civilization setup is not transition eligibility');
        return { value: { value: 'RANDOM' }, domain: { possibleValues: [
          { value: 'CIV_A', name: 'Locked', originDomain: 'ModernCivs', invalidReason: 0 },
          { value: 'CIV_B', name: 'Unlocked', originDomain: 'ModernCivs', invalidReason: 0 },
          { value: 'CIV_OLD', name: 'Old Age', originDomain: 'ExplorationCivs', invalidReason: 0 },
        ] } };
      },
      getMementoFilteredPlayerParameters: () => [currentSlot, futureSlot],
    },
    GameSetupDomainValueInvalidReason: { Valid: 0, NotValidLocked: 3, NotValidOwnership: 2 },
    GameSetupParameterInvalidReason: { Valid: 0 }, RequirementState: { Met: 2, AlwaysMet: 4, NotMet: 3, NeverMet: 5 },
    CardCategories: { CARD_CATEGORY_WILDCARD: 1 },
    PlayerOperationTypes: { SET_AGE_TRANSITION_DATA: 'FINISH', ADVANCED_START_MODIFY_DECK: 'DECK' },
    GameInfo: { Ages: { lookup: () => ({ AgeType: 'AGE_EXPLORATION', Name: 'Exploration' }) },
      UnlockRewards: ['A', 'B'].map(id => ({ UnlockRewardKind: 'KIND_CIVILIZATION', UnlockRewardType: `CIV_${id}`, UnlockType: `UNLOCK_${id}` })),
      UnlockRequirements: ['A', 'B'].map(id => ({ UnlockType: `UNLOCK_${id}`, RequirementSetId: `REQ_${id}`, Description: 'Need three', GameplayUnlock: true })),
    },
    Game: { turn: 113, age: 1, AgeProgressManager: { isFinalAge: finalAge },
      Unlocks: { getProgressForPlayer: (type, id) => { assert.equal(id, 0); if (unknownProgress) return null; return {
        isUnlocked: type === 'UNLOCK_B', progress: missingProgress ? [] : [{ requirementSetId: type.replace('UNLOCK', 'REQ'), state: type === 'UNLOCK_B' ? 2 : 3, current: type === 'UNLOCK_B' ? 3 : 1, total: 3 }],
      }; } },
      EconomicRules: { adjustForGameSpeed: amount => amount * speedFactor },
      PlayerOperations: { canStart: (id, op, args, visible) => { assert.equal(id, 0); assert.equal(visible, false);
        if (op === 'FINISH') { assert.equal(args.Finished, true); return { Success: false }; }
        assert.equal(op, 'DECK'); assert.equal(args.Type, 'ADD'); assert.equal(args.ID, card.id);
        return { Success: true };
      } },
    },
  });
  return JSON.parse(JSON.stringify(data));
}

test('next-Age civilizations combine the transition selector with native local unlock progress', () => {
  const data = run();
  assert.equal(data.nextAge.id, 'AGE_MODERN');
  assert.deepEqual(data.civilizations.choices.map(c => c.id), ['CIV_A', 'CIV_B']);
  const [locked, unlocked] = data.civilizations.choices;
  assert.equal(locked.setupValid, true);
  assert.equal(locked.unlocked, false, 'a valid selector entry is not itself an unlock');
  assert.equal(locked.eligibleByChecks, false);
  assert.equal(unlocked.eligibleByChecks, true);
  assert.equal(unlocked.selectionPermission, null);
  assert.equal(locked.unlockPaths[0].requirements[0].current, 1);
  assert.equal(locked.unlockPaths[0].requirements[0].total, 3);
  assert.equal(locked.unlockPaths[0].requirements[0].met, false);
});

test('missing requirement states stay unknown and the configured unlock bypass is explicit', () => {
  assert.equal(run({ missingProgress: true }).civilizations.choices[0].unlockPaths[0].requirements[0].met, null);
  assert.equal(run({ unknownProgress: true }).civilizations.choices[0].eligibleByChecks, null, 'missing unlock data is not an unlocked civilization');
  const data = run({ bypass: true });
  assert.equal(data.civilizations.unlockBypassEnabled, true);
  assert.equal(data.civilizations.choices[0].unlocked, true);
  assert.equal(data.civilizations.choices[0].unlockPaths[0].isUnlocked, false, 'underlying progress is retained');
});

test('Dedication costs and limits belong to the current deck, not a fabricated future deck', () => {
  const data = run();
  assert.equal(data.dedications.deckAge, 'AGE_EXPLORATION');
  assert.equal(data.dedications.nextAgeChoices, null);
  assert.equal(data.dedications.deckSize, 3);
  assert.equal(data.dedications.choices[0].costs[0].amount, 2);
  assert.equal(data.dedications.choices[0].individualLimit, 1);
  assert.equal(data.dedications.choices[0].operationAllowed, true);
  assert.equal(data.dedications.choices[0].availableNow, false, 'completed decks cannot be changed despite permissive operation checks');
  assert.equal(run({ closed: false, full: true }).dedications.choices[0].availableNow, false);
  assert.equal(run({ closed: false }).dedications.choices[0].availableNow, true);
  assert.ok(!JSON.stringify(data).includes('999'), 'raw effect metadata is not exposed');
});

test('Mementos distinguish current and transition loadouts without assuming profile unlock or equip permission', () => {
  const data = run();
  assert.equal(data.mementos.currentSlots[0].selected.id, 'M');
  assert.equal(data.mementos.transitionSlots[0].selected.id, 'NONE');
  const choice = data.mementos.transitionSlots[0].choices[0];
  assert.equal(choice.functionalDescription, 'Memento effect');
  assert.equal(choice.setupValid, true);
  assert.equal(choice.profileUnlocked, null);
  assert.equal(choice.selectionPermission, null);
});

test('carry-over caps are labelled source estimates and unknown modes/final Ages do not invent another transition', () => {
  const data = run();
  assert.equal(data.carryOverRules.goldCapEstimate, 9000);
  assert.equal(data.carryOverRules.influenceCapEstimate, 1200);
  assert.equal(data.carryOverRules.currentGoldAboveCap, 3000);
  assert.equal(run({ mode: 'AGE_TRANSITION_SETTING_ORIGINAL' }).carryOverRules.goldCapEstimate, 3000);
  assert.equal(run({ mode: 'AGE_TRANSITION_SETTING_ORIGINAL' }).carryOverRules.influenceCapEstimate, 500);
  assert.equal(run({ speedFactor: 2 }).carryOverRules.goldCapEstimate, 18000, 'cap estimates use the native speed adjustment');
  assert.equal(run({ mode: 'UNVERIFIED_MODE' }).carryOverRules.goldCapEstimate, null);
  assert.equal(run({ finalAge: true }).nextAge, null);
  assert.deepEqual(run({ finalAge: true }).civilizations.choices, []);
});
