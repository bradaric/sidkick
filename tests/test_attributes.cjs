const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run({ branchPoints = 0, wildcardPoints = 1, nativeAllowed = true } = {}) {
  const definitions = [1, 2, 3, 4].map(n => ({ $hash: n, ProgressionTreeNodeType: `NODE_${n}`, Name: '', Description: null, Cost: 1, Repeatable: false }));
  definitions.lookup = hash => definitions.find(d => d.$hash === hash);
  const states = {
    1: { depthUnlocked: 1, maxDepth: 1, repeatedDepth: 0, unlockIndices: [0] },
    2: { depthUnlocked: 0, maxDepth: 1, repeatedDepth: 0, unlockIndices: [0, 1] },
    3: { depthUnlocked: 0, maxDepth: 1, repeatedDepth: 0, unlockIndices: [0] },
    4: { depthUnlocked: 0, maxDepth: 1, repeatedDepth: 0, unlockIndices: [0] },
  };
  const nodeStates = { 1: 5, 2: 2, 3: 1, 4: 1 };
  const culture = {
    getResearching: () => null, getAllAvailableNodeTypes: () => [], getGovernmentType: () => -1,
    getActiveTraditions: () => [], getUnlockedTraditions: () => [], getNumCultureSlots: () => 1, getNumAllCultureSlots: () => 3,
  };
  const calls = [];
  const result = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/research.js'), 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    Players: { get: id => { assert.equal(id, 0); return {
      Techs: culture, Culture: culture,
      Identity: { getWildcardPoints: () => wildcardPoints, getAvailableAttributePoints: () => branchPoints, getNextAttributePointProgress: () => 0.5 },
    }; } },
    GameInfo: {
      Ages: { lookup: () => ({ AgeType: 'AGE_EXPLORATION' }) },
      StartingGovernments: [],
      Attributes: [
        { AttributeType: 'ATTRIBUTE_SCIENCE', Name: 'Science', ProgressionTreeType: 'TREE_SCIENCE' },
        { AttributeType: 'ATTRIBUTE_WILDCARD', Name: 'Wildcard', ProgressionTreeType: null },
      ],
      Governments: { lookup: () => null }, Traditions: { lookup: () => null },
      ProgressionTrees: { lookup: () => ({ ProgressionTreeType: 'TREE_SCIENCE', Name: 'Science tree', PrereqFormat: 'OR' }) },
      ProgressionTreeNodes: definitions,
      ProgressionTreeNodeUnlocks: [
        { TargetKind: 'KIND_MODIFIER', TargetType: 'EFFECT', UnlockDepth: 1 },
        { TargetKind: 'KIND_MODIFIER', TargetType: 'HIDDEN_EFFECT', UnlockDepth: 1, Hidden: true },
      ],
      Modifiers: [{ ModifierId: 'EFFECT' }],
      ModifierStrings: [{ ModifierId: 'EFFECT', Context: 'Name', Text: 'Useful perk' }, { ModifierId: 'EFFECT', Context: 'Description', Text: '+10 science' }],
    },
    CultureSlotTypes: { POLICY_CULTURE_SLOT: 0, TRADITION_CULTURE_SLOT: 1, CRISIS_CULTURE_SLOT: 2 },
    ProgressionTreeNodeState: { NODE_STATE_INVALID: 0, NODE_STATE_CLOSED: 1, NODE_STATE_OPEN: 2, NODE_STATE_FULLY_UNLOCKED: 5 },
    PlayerOperationTypes: { BUY_ATTRIBUTE_TREE_NODE: 'BUY_ATTRIBUTE' },
    Game: {
      turn: 97,
      Notifications: { getIdsForPlayer: () => [] },
      ProgressionTrees: {
        getTreeStructure: () => [
          { nodeType: 1, connectedNodeTypes: [2, 3] }, { nodeType: 2, connectedNodeTypes: [3] },
          { nodeType: 3, connectedNodeTypes: [] }, { nodeType: 4, connectedNodeTypes: [2] },
        ],
        canEverUnlock: (id, hash) => ({ isLocked: hash === 4 }),
        getNode: (id, hash) => states[hash], getNodeState: (id, hash) => nodeStates[hash],
        hasLegendUnlocked: (id, hash) => ({ isLocked: hash === 3 }),
        getLegendAttributeNodeLockedString: () => 'Requires leader milestone',
      },
      PlayerOperations: { canStart: (id, operation, args, visible) => {
        assert.equal(id, 0); assert.equal(operation, 'BUY_ATTRIBUTE'); assert.equal(visible, false);
        calls.push(args.ProgressionTreeNodeType);
        return { Success: nativeAllowed, FailureReasons: nativeAllowed ? [] : ['Unavailable'] };
      } },
    },
  });
  return { data: JSON.parse(JSON.stringify(result)), calls };
}

test('preserves point totals and adds purchased nodes and effect descriptions', () => {
  const { data } = run();
  assert.equal(data.attributes.wildcardPoints, 1);
  const branch = data.attributes.branches[0];
  assert.equal(branch.availablePoints, 0);
  assert.equal(branch.nextPointProgressPercent, 50);
  assert.ok(Array.isArray(branch.nodes), 'attribute tree nodes are exported');
  assert.equal(branch.nodes[0].purchased, true);
  assert.equal(branch.nodes[0].fullyUnlocked, true);
  assert.equal(branch.nodes[0].availableNow, false);
  assert.equal(branch.nodes[1].unlocks[0].description, '+10 science');
  assert.equal(branch.nodes[1].unlocks.length, 1, 'hidden unlocks are excluded');
  assert.equal(branch.nodes[1].name, 'Useful perk');
});

test('keeps OR prerequisites rather than treating all incoming edges as required', () => {
  const branch = run().data.attributes.branches[0];
  assert.equal(branch.prerequisiteMode, 'OR');
  assert.deepEqual(branch.nodes[2].prerequisites, [{ id: 'NODE_1', purchased: true }, { id: 'NODE_2', purchased: false }]);
});

test('reports wildcard funding separately from actual purchase eligibility', () => {
  const node = run().data.attributes.branches[0].nodes?.[1];
  assert.ok(node, 'attribute node exists');
  assert.equal(node.basePointCost, 1);
  assert.equal(node.funding.coversBaseCost, true);
  assert.equal(node.funding.wildcardPointsNeededAtBaseCost, 1);
  assert.equal(node.availableNow, true);
  const blocked = run({ nativeAllowed: false }).data.attributes.branches[0].nodes[1];
  assert.equal(blocked.availableNow, false);
  assert.deepEqual(blocked.failureReasons, ['Unavailable']);
});

test('hides inapplicable nodes and retains visible legend locks without offering them', () => {
  const { data, calls } = run();
  const nodes = data.attributes.branches[0].nodes;
  assert.ok(Array.isArray(nodes), 'attribute nodes exist');
  assert.deepEqual(nodes.map(n => n.id), ['NODE_1', 'NODE_2', 'NODE_3']);
  assert.equal(nodes[2].legendLocked, true);
  assert.equal(nodes[2].lockedReason, 'Requires leader milestone');
  assert.equal(nodes[2].availableNow, false);
  assert.ok(!calls.includes(4));
  assert.deepEqual(data.attributes.branches[1].nodes, [], 'wildcard has no tree');
});
