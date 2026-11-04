const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const table = (rows, key) => Object.assign(rows, { lookup: value => rows.find(row => row[key] === value || row.$hash === value || row.$index === value) });

function run({ chosen = true, notification = false, pendingCelebration = false, active = false,
  allowed = true, happiness = true, researchAllowed = true, branchLocked = false } = {}) {
  const governments = table([
    { $index: 0, $hash: 100, GovernmentType: 'GOV_A', Name: 'Government A', Description: 'A description' },
    { $index: 1, $hash: 101, GovernmentType: 'GOV_B', Name: 'Government B', Description: 'B description' },
    { $index: 2, $hash: 102, GovernmentType: 'UNAVAILABLE_UNIQUE', Name: 'Not offered' },
  ], 'GovernmentType');
  const goldenAges = table(['A', 'B', 'EXTRA'].map((id, index) => ({ $index: index, $hash: 200 + index,
    GoldenAgeType: `GA_${id}`, Name: `Celebration ${id}`, Description: `Benefit ${id} for turns` })), 'GoldenAgeType');
  const nodes = table([
    { $hash: 20, ProgressionTreeNodeType: 'ENTRY', Name: 'Entry civic' },
    { $hash: 21, ProgressionTreeNodeType: 'LATER', Name: 'Later civic' },
    { $hash: 22, ProgressionTreeNodeType: 'LOCKED_CONTENT', Name: 'Not applicable' },
  ], 'ProgressionTreeNodeType');
  const culture = {
    getResearching: () => null, getAllAvailableNodeTypes: () => [], getGovernmentType: () => chosen ? 101 : -1,
    getGoldenAgeChoices: () => ['GA_B', 'GA_EXTRA', 'GA_B'],
    getChosenIdeology: () => -1, getIdeologyForTradition: () => -1,
    getNodeCost: hash => hash === 20 ? 100 : 200, getTurnsForNode: () => 5,
    getActiveTraditions: () => [], getUnlockedTraditions: () => [], getNumCultureSlots: () => 1, getNumAllCultureSlots: () => 3,
  };
  const calls = [];
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/research.js'), 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 },
    Locale: { compose: (key, ...args) => [key, ...args].join('|') }, Database: { makeHash: type => goldenAges.lookup(type).$hash },
    Players: { get: id => { assert.equal(id, 0); return {
      Techs: culture, Culture: culture, Identity: { getWildcardPoints: () => 0 },
      Happiness: happiness ? { canChoose: () => pendingCelebration, isInGoldenAge: () => active,
        getGoldenAgeDuration: () => 6, getGoldenAgeTurnsLeft: () => 3, getCurrentGoldenAge: () => active ? 201 : -1 } : undefined,
    }; } },
    GameInfo: { Ages: { lookup: () => ({ AgeType: 'AGE_MODERN' }) }, Attributes: [], Governments: governments,
      StartingGovernments: [{ AgeType: 'AGE_MODERN', GovernmentType: 'GOV_A' }, { AgeType: 'AGE_MODERN', GovernmentType: 'GOV_B' },
        { AgeType: 'AGE_MODERN', GovernmentType: 'GOV_A' }, { AgeType: 'AGE_EXPLORATION', GovernmentType: 'UNAVAILABLE_UNIQUE' }],
      GovernmentModifiers: [{ GovernmentType: 'GOV_A', ModifierId: 'PASSIVE' }, { GovernmentType: 'GOV_A', ModifierId: 'MISSING_TEXT' }],
      GoldenAges: goldenAges,
      Traditions: { lookup: type => ({ TraditionType: type, Name: type, Description: 'Tradition benefit' }) },
      ProgressionTrees: { lookup: () => ({ ProgressionTreeType: 'TREE_IDEOLOGY', PrereqFormat: 'OR' }) },
      ProgressionTreeNodes: nodes,
      ProgressionTreeNodeUnlocks: [
        { ProgressionTreeNodeType: 'ENTRY', TargetKind: 'KIND_MODIFIER', TargetType: 'FIRST_BENEFIT', UnlockDepth: 1 },
        { ProgressionTreeNodeType: 'LATER', TargetKind: 'KIND_MODIFIER', TargetType: 'LATER_BENEFIT', UnlockDepth: 1 },
        { ProgressionTreeNodeType: 'ENTRY', TargetKind: 'KIND_TRADITION', TargetType: 'GOV_TRADITION', RequiredGovernmentType: 'GOV_A', UnlockDepth: 2 },
        { ProgressionTreeNodeType: 'ENTRY', TargetKind: 'KIND_TRADITION', TargetType: 'HIDDEN_TRADITION', RequiredGovernmentType: 'GOV_A', Hidden: true },
      ],
      Modifiers: [{ ModifierId: 'EARLY_ADOPTER', ModifierType: 'GRANT_SLOTS' }],
      DynamicModifiers: [{ ModifierType: 'GRANT_SLOTS', EffectType: 'EFFECT_PLAYER_GRANT_TRADITION_SLOTS' }],
      ModifierArguments: [{ ModifierId: 'EARLY_ADOPTER', Name: 'SlotType', Value: 'POLICY_CULTURE_SLOT' },
        { ModifierId: 'EARLY_ADOPTER', Name: 'Amount', Value: '2' }, { ModifierId: 'EARLY_ADOPTER', Name: 'Private', Value: '999' }],
      ModifierStrings: [{ ModifierId: 'PASSIVE', Context: 'Description', Text: 'Passive effect' },
        { ModifierId: 'FIRST_BENEFIT', Context: 'Description', Text: 'First ideology benefit' },
        { ModifierId: 'LATER_BENEFIT', Context: 'Description', Text: 'Later ideology benefit' }],
      Ideologies: table([{ $hash: 300, IdeologyType: 'IDEOLOGY_A', Name: 'Ideology A', FirstTreeNode: 'ENTRY', ProgressionTreeType: 'TREE_IDEOLOGY' }], 'IdeologyType'),
      IdeologyAdoptionModifiers: [{ IdeologyType: 'IDEOLOGY_A', AdoptionOrder: 1, ModifierId: 'EARLY_ADOPTER' }],
    },
    CultureSlotTypes: { POLICY_CULTURE_SLOT: 0, TRADITION_CULTURE_SLOT: 1, CRISIS_CULTURE_SLOT: 2 }, ProgressionTreeNodeState: {},
    PlayerOperationTypes: { CHANGE_GOVERNMENT: 'GOV', CHOOSE_GOLDEN_AGE: 'CELEBRATE', SET_CULTURE_TREE_NODE: 'RESEARCH' },
    PlayerOperationParameters: { Activate: 'ACTIVATE' },
    Game: { turn: 2, age: 1,
      Notifications: { getIdsForPlayer: () => notification ? [1] : [], getType: () => 1, getTypeName: () => 'NOTIFICATION_CHOOSE_GOVERNMENT' },
      Culture: { GetCelebrationTypesForGovernment: type => type === 'GOV_A' ? ['GA_A'] : ['GA_B'] },
      ProgressionTrees: { getTreeStructure: () => [{ nodeType: 20, connectedNodeTypes: [21] }, { nodeType: 21, connectedNodeTypes: [] }, { nodeType: 22 }],
        canEverUnlock: (id, type) => ({ isLocked: branchLocked || type === 22 }),
        getNode: (id, type) => { assert.notEqual(type, 22); return branchLocked ? null : { depthUnlocked: 0, unlockIndices: type === 20 ? [0] : [1] }; },
      },
      PlayerOperations: { sendRequest: () => { throw Error('Game-changing requests are forbidden'); },
        canStart: (id, op, args, visible) => {
          assert.equal(id, 0); assert.equal(visible, false); calls.push({op, args});
          if (op === 'GOV') { assert.ok([0, 1].includes(args.GovernmentType), 'government operation uses table index, not hash'); assert.equal(args.Action, 'ACTIVATE'); }
          else if (op === 'CELEBRATE') assert.ok([201, 202].includes(args.GoldenAgeType), 'only current native picker choices are checked, using hashes');
          else { assert.equal(op, 'RESEARCH'); return { Success: researchAllowed && args.ProgressionTreeNodeType === 20, FailureReasons: ['Research condition'] }; }
          return { Success: allowed, FailureReasons: allowed ? [] : ['Blocked'] };
        },
      },
    },
  });
  return { data: JSON.parse(JSON.stringify(data)), calls };
}

test('government choices follow the current-Age picker and keep every passive and conditional tradition', () => {
  const { data } = run();
  assert.ok(data.governmentSelection, 'government choice evidence is exported even after selection');
  const choices = data.governmentSelection.choices;
  assert.deepEqual(choices.map(choice => choice.id), ['GOV_A', 'GOV_B']);
  assert.equal(data.government.id, 'GOV_B', 'existing selected-government shape is preserved');
  assert.deepEqual(choices[0].passiveEffects, [{id: 'PASSIVE', description: 'Passive effect'}, {id: 'MISSING_TEXT', description: null}]);
  assert.deepEqual(choices[1].passiveEffects, [], 'one government must not inherit another government passive');
  assert.equal(choices[0].traditionUnlocks.length, 1);
  assert.equal(choices[0].traditionUnlocks[0].id, 'GOV_TRADITION');
  assert.equal(choices[0].traditionUnlocks[0].requiredDepth, 2);
  assert.equal(choices[0].celebrations[0].description, 'Benefit A for turns|6');
  assert.equal(choices[0].netYieldChange, null);
});

test('native government permission alone never asserts availability without a pending choice', () => {
  const choice = run().data.governmentSelection?.choices[0];
  assert.equal(choice?.operationAllowed, true);
  assert.equal(choice?.availableNow, false);
  assert.equal(run().data.governmentSelection?.pending, false);
  assert.equal(run({ chosen: false }).data.governmentSelection?.choices[0].availableNow, true);
  assert.equal(run({ notification: true }).data.governmentSelection?.choices[0].availableNow, true);
  const blocked = run({ chosen: false, allowed: false }).data.governmentSelection?.choices[0];
  assert.equal(blocked?.availableNow, false);
  assert.deepEqual(blocked?.failureReasons, ['Blocked']);
});

test('celebration choices include native extra options but require an outstanding choice and native success', () => {
  const data = run().data;
  assert.ok(data.celebration, 'current celebration choice state is exported');
  assert.deepEqual(data.celebration.choices.map(choice => choice.id), ['GA_B', 'GA_EXTRA']);
  assert.equal(data.celebration.choicePending, false);
  assert.equal(data.celebration.choices[0].operationAllowed, true);
  assert.equal(data.celebration.choices[0].availableNow, false);
  assert.equal(data.celebration.remainingTurns, null, 'native duration while inactive is not remaining time');
  assert.equal(run({ pendingCelebration: true }).data.celebration?.choices[0].availableNow, true);
  assert.equal(run({ pendingCelebration: true, allowed: false }).data.celebration?.choices[0].availableNow, false);
  assert.equal(run({ active: true }).data.celebration?.current.id, 'GA_B');
  assert.equal(run({ active: true }).data.celebration?.remainingTurns, 3);
  assert.equal(run({ happiness: false }).data.celebration, null);
  assert.equal(run({ happiness: false }).data.governmentSelection?.choices[0].celebrations[0].description, null);
});

test('ideology branch choices expose later benefits and prerequisite mode without offering direct adoption', () => {
  const choice = run().data.ideology.choices[0];
  assert.ok(choice.branch, 'ideology branch comparison evidence is exported');
  assert.equal(choice.branch.prerequisiteMode, 'OR');
  assert.deepEqual(choice.branch.nodes.map(node => node.id), ['ENTRY', 'LATER']);
  assert.equal(choice.branch.nodes[1].unlocks[0].description, 'Later ideology benefit');
  assert.equal(choice.branch.nodes[1].researchAllowed, false);
  assert.equal(choice.branch.definitionNodes[0].unlocks.find(unlock => unlock.id === 'GOV_TRADITION').requiredGovernment, 'GOV_A');
  assert.equal(choice.adoptionPermission, null);
  assert.equal(choice.diplomaticImpact, null);
});

test('ideology adoption bonuses are conditional public definitions, not inferred first-adopter rank', () => {
  const choice = run().data.ideology.choices[0];
  assert.ok(choice.adoptionBonuses, 'conditional adoption definitions are exported');
  assert.equal(choice.adoptionBonuses[0].adoptionOrder, 1);
  assert.equal(choice.adoptionBonuses[0].effectType, 'EFFECT_PLAYER_GRANT_TRADITION_SLOTS');
  assert.deepEqual(choice.adoptionBonuses[0].definitionArguments, { SlotType: 'POLICY_CULTURE_SLOT', Amount: '2' });
  assert.equal(choice.adoptionBonuses[0].applicableToLocalPlayer, null);
  assert.ok(!JSON.stringify(choice).includes('999'), 'raw modifier metadata is not exported');
});

test('unrevealed ideology trees retain labelled public definition benefits without claiming local research state', () => {
  const choice = run({ branchLocked: true, researchAllowed: false }).data.ideology.choices[0];
  assert.equal(choice.entryCivic, null);
  assert.deepEqual(choice.branch.nodes, []);
  assert.ok(choice.branch.definitionNodes, 'public definition benefits remain comparable before branch reveal');
  assert.equal(choice.branch.definitionNodes[1].unlocks[0].description, 'Later ideology benefit');
  assert.ok(!JSON.stringify(choice.branch.definitionNodes).includes('HIDDEN_TRADITION'));
  assert.equal(choice.researchAllowed, false);
});
