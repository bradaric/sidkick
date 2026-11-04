const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const table = (rows, key) => Object.assign(rows, { lookup: value => rows.find(row => row[key] === value || row.$hash === value || row.$index === value) });

function research({ modern = true, allowed = true, chosen = -1, missingNode = false } = {}) {
  const ideologies = table([{ $hash: 100, IdeologyType: 'IDEOLOGY_A', Name: 'Ideology A', FirstTreeNode: 'NODE_A', RivalIdeology: 'IDEOLOGY_B' }], 'IdeologyType');
  const nodes = table(missingNode ? [] : [{ $hash: 20, ProgressionTreeNodeType: 'NODE_A', Name: 'Entry civic' }], 'ProgressionTreeNodeType');
  const culture = {
    getResearching: () => null, getAllAvailableNodeTypes: () => [], getGovernmentType: () => -1,
    getActiveTraditions: () => ['CARD'], getUnlockedTraditions: () => ['CARD'], isTraditionActive: () => true,
    getNumCultureSlots: () => 1, getNumAllCultureSlots: () => 3,
    getChosenIdeology: () => chosen, getIdeologyForTradition: () => 100,
    getNodeCost: () => 900, getTurnsForNode: () => 8,
  };
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/research.js'), 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s, toRomanNumeral: n => String(n) },
    Players: { get: id => { assert.equal(id, 0, 'only local culture is read'); return {
      Techs: culture, Culture: culture, Identity: { getWildcardPoints: () => 0 },
    }; } },
    GameInfo: { Ages: { lookup: () => ({ AgeType: modern ? 'AGE_MODERN' : 'AGE_EXPLORATION' }) },
      Attributes: [], Governments: { lookup: () => null }, Ideologies: ideologies,
      StartingGovernments: [], IdeologyAdoptionModifiers: [], ProgressionTrees: { lookup: () => null },
      Traditions: { lookup: () => ({ TraditionType: 'CARD', Name: 'Policy', Description: 'Policy effect' }) },
      ProgressionTreeNodes: nodes, ProgressionTreeNodeUnlocks: [
        { ProgressionTreeNodeType: 'NODE_A', TargetKind: 'KIND_MODIFIER', TargetType: 'BENEFIT', UnlockDepth: 1 },
        { ProgressionTreeNodeType: 'NODE_A', TargetKind: 'KIND_MODIFIER', TargetType: 'HIDDEN', Hidden: true, UnlockDepth: 1 },
      ],
      Modifiers: [{ ModifierId: 'BENEFIT' }], ModifierStrings: [{ ModifierId: 'BENEFIT', Context: 'Description', Text: 'Adoption benefit' }],
    },
    CultureSlotTypes: { POLICY_CULTURE_SLOT: 0, TRADITION_CULTURE_SLOT: 1, CRISIS_CULTURE_SLOT: 2 },
    ProgressionTreeNodeState: {}, PlayerOperationTypes: { SET_CULTURE_TREE_NODE: 'RESEARCH' },
    Game: { turn: 5, Notifications: { getIdsForPlayer: () => [] }, ProgressionTrees: { getNode: (id, hash) => {
      assert.equal(id, 0); assert.equal(hash, 20); return { depthUnlocked: chosen === 100 ? 1 : 0, unlockIndices: [0, 1] };
    } },
      PlayerOperations: { canStart: (id, operation, args, visible) => {
        assert.equal(id, 0); assert.equal(operation, 'RESEARCH'); assert.equal(args.ProgressionTreeNodeType, 20); assert.equal(visible, false);
        return { Success: allowed, FailureReasons: allowed ? [] : ['Requires Political Theory'] };
      } },
    },
  });
  return JSON.parse(JSON.stringify(data));
}

test('ideology candidates expose entry-civic research permission, not immediate adoption permission', () => {
  const data = research();
  assert.ok(data.ideology, 'Modern ideology data is explicit');
  assert.equal(data.ideology.chosen, null);
  const choice = data.ideology.choices[0];
  assert.equal(choice.id, 'IDEOLOGY_A');
  assert.equal(choice.rivalIdeology, 'IDEOLOGY_B');
  assert.equal(choice.entryCivic.id, 'NODE_A');
  assert.equal(choice.entryCivic.cost, 900);
  assert.equal(choice.entryCivic.unlocks[0].description, 'Adoption benefit');
  assert.equal(choice.entryCivic.unlocks.length, 1);
  assert.equal(choice.researchAllowed, true);
  assert.equal(choice.adoptionPermission, null);
  assert.equal(choice.diplomaticImpact, null);
  assert.deepEqual(research({ allowed: false }).ideology.choices[0].failureReasons, ['Requires Political Theory']);
  assert.equal(research({ allowed: false }).ideology.choices[0].researchAllowed, false);
});

test('chosen ideology and policy affiliation are explicit without offering ideology changes', () => {
  const data = research({ chosen: 100 });
  assert.equal(data.ideology?.chosen.id, 'IDEOLOGY_A');
  assert.equal(data.ideology?.choices[0].chosen, true);
  assert.equal(data.policies.policies.active[0].ideology?.id, 'IDEOLOGY_A');
  assert.equal(research({ modern: false }).ideology, null);
  assert.equal(research({ modern: false }).policies.policies.active[0].ideology, null);
  assert.equal(research({ missingNode: true }).ideology?.choices[0].researchAllowed, null);
});

function victory({ modern = true, completed = false, missingLegacyState = false } = {}) {
  const projects = table([
    { $index: 1, $hash: 101, ProjectType: 'PROJECT_LAUNCH', Name: 'Launch', Description: 'Launch effect', CityOnly: true, Cost: 1000,
      PrereqConstructible: 'LAUNCH_PAD', RequireCompletedLegacyPathType: 'SCIENCE', RequiresUnlock: true, MaxPlayerInstances: 1 },
    { $index: 2, $hash: 102, ProjectType: 'PROJECT_SHARED', Name: 'Shared', CityOnly: true, Cost: 500, PrereqConstructible: 'LAB', PrereqAnyCity: true },
    { $index: 3, ProjectType: 'PROJECT_TOWN_FACTORY', TownOnly: true, Cost: 0 },
    { $index: 4, ProjectType: 'UPGRADE', UpgradeToCity: true, Cost: 500 },
  ], 'ProjectType');
  const city = (name, id, town) => ({ name, id: { owner: 0, id }, isTown: town,
    Constructibles: { hasConstructible: (type, incomplete) => { assert.equal(incomplete, false); return type === 'LAB'; } },
    Production: { getProjectProductionCost: () => 1100 }, BuildQueue: { getTurnsLeft: () => 6 },
  });
  const local = { isMajor: true, team: 0, civilizationFullName: 'Local', Diplomacy: { hasMet: id => id === 1 },
    Victories: {}, Cities: { getCities: () => [city('City', 10, false), city('Town', 11, true)] },
    LegacyPaths: { getCompletedLegacyPaths: () => missingLegacyState ? null : completed ? [77] : [] },
  };
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/victory.js'), 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    Players: { getAliveIds: () => [0, 1, 2], get: id => {
      if (id === 0) return local;
      if (id === 1) return { isMajor: true, team: 1, Victories: {}, civilizationFullName: 'Met empire',
        get Cities() { throw Error('Foreign projects must not be inspected'); } };
      return { isMajor: true, Victories: {}, get Cities() { throw Error('Unmet projects must not be inspected'); } };
    } },
    GameInfo: { Ages: { lookup: () => ({ AgeType: modern ? 'AGE_MODERN' : 'AGE_EXPLORATION', Name: 'Age' }) },
      Leaders: { lookup: () => null }, VictoryTypes: [], Projects: projects,
      Constructibles: { lookup: type => ({ ConstructibleType: type, Name: type }) },
      LegacyPaths: { lookup: type => ({ LegacyPathType: 'SCIENCE', Name: 'Science' }) },
      ProgressionTreeNodeUnlocks: [{ ProgressionTreeNodeType: 'FLIGHT', TargetKind: 'KIND_PROJECT', TargetType: 'PROJECT_LAUNCH', UnlockDepth: 2 },
        { ProgressionTreeNodeType: 'SECRET', TargetKind: 'KIND_PROJECT', TargetType: 'PROJECT_LAUNCH', UnlockDepth: 1, Hidden: true }],
      ProgressionTreeNodes: { lookup: type => { assert.notEqual(type, 'SECRET'); return { $hash: 20, ProgressionTreeNodeType: type, Name: 'Flight' }; } },
    },
    CityOperationTypes: { BUILD: 'BUILD' },
    Game: { turn: 5, VictoryManager: { getVictories: () => [] },
      ProgressionTrees: { getNode: (id, type) => { assert.equal(id, 0); assert.equal(type, 20); return { depthUnlocked: 1 }; } },
      AgeProgressManager: { getCurrentAgeProgressionPoints: () => 1, getMaxAgeProgressionPoints: () => 100 },
      CityOperations: { canStart: (id, operation, args, visible) => {
        assert.equal(id.owner, 0); assert.equal(operation, 'BUILD'); assert.equal(visible, false);
        assert.ok([1, 2].includes(args.ProjectType), 'use project table index, not hash');
        const allowed = args.ProjectType === 2 && id.id === 10;
        return { Success: allowed, Requirements: { MeetsRequirements: allowed, FullFailure: !allowed },
          FailureReasons: allowed ? [] : ['Need launch pad'], InQueue: false, Plots: [999] };
      } },
    },
  });
  return JSON.parse(JSON.stringify(data));
}

test('Modern production-project requirements retain locked projects, mastery depth and native blockers', () => {
  const data = victory();
  assert.ok(data.modernProjects, 'Modern project requirement inventory exists');
  assert.deepEqual(data.modernProjects.projects.map(p => p.id), ['PROJECT_LAUNCH', 'PROJECT_SHARED']);
  const project = data.modernProjects.projects[0];
  assert.equal(project.requirements.constructible.id, 'LAUNCH_PAD');
  assert.equal(project.requirements.constructible.anyOwnedSettlement, false);
  assert.equal(project.requirements.legacyPath.complete, false);
  assert.equal(project.requirements.unlocks[0].requiredDepth, 2);
  assert.equal(project.requirements.unlocks[0].depthUnlocked, 1);
  assert.equal(project.requirements.unlocks[0].met, false);
  assert.equal(project.requirements.unlocks.length, 1);
  assert.equal(project.settlements[0].availableNow, false);
  assert.deepEqual(project.settlements[0].failureReasons, ['Need launch pad']);
  assert.equal(project.settlements[0].prerequisiteConstructiblePresent, false);
  assert.equal(project.settlements[0].meetsNativeRequirements, false);
  assert.equal(project.settlements[0].turnsAtCurrentProduction, null, 'a blocked project has no certified completion time');
  assert.equal(project.completedCopies, null);
  assert.equal(project.completionForecast, null);
  assert.ok(!JSON.stringify(data).includes('999'));
});

test('project prerequisites preserve empire-wide scope, completed legacy paths and non-Modern absence', () => {
  const data = victory({ completed: true });
  assert.equal(data.modernProjects?.projects[0].requirements.legacyPath.complete, true);
  const project = data.modernProjects?.projects[1];
  assert.equal(project.requirements.constructible.anyOwnedSettlement, true);
  assert.equal(project.settlements[0].prerequisiteConstructiblePresent, true);
  assert.equal(project.settlements[0].productionCost, 1100);
  assert.equal(project.settlements[0].turnsAtCurrentProduction, 6);
  assert.equal(project.settlements[1].availableNow, false, 'town eligibility is not guessed from empire prerequisites');
  assert.equal(victory({ missingLegacyState: true }).modernProjects?.projects[0].requirements.legacyPath.complete, null);
  assert.equal(victory({ modern: false }).modernProjects, null);
});
