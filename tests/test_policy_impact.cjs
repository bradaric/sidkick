const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function research({ changeRule = false, missingAmount = false, routeCount = 5, petAmount = '1' } = {}) {
  const cards = ['PET_KOT', 'MAYA_SYNCRETISM_EXPLORATION', 'TEQUITL', 'OTHER'].map(id => ({
    TraditionType: `TRADITION_${id}`, Name: id, CultureSlotType: 'TRADITION_CULTURE_SLOT',
  }));
  const definitions = [
    { ConstructibleType: 'WOODCUTTER', ConstructibleClass: 'IMPROVEMENT' },
    { ConstructibleType: 'MONASTERY', ConstructibleClass: 'IMPROVEMENT' },
    { ConstructibleType: 'UNIVERSITY', ConstructibleClass: 'BUILDING' },
  ];
  const instances = [
    { type: 'WOODCUTTER', location: { x: 1, y: 0 } },
    { type: 'MONASTERY', location: { x: 1, y: 0 } }, // Same rural tile: count once.
    { type: 'WOODCUTTER', location: { x: 2, y: 0 }, damaged: true },
    { type: 'UNIVERSITY', location: { x: 3, y: 0 } },
    { type: 'UNIVERSITY', location: { x: 4, y: 0 }, damaged: true },
    { type: 'UNIVERSITY', location: { x: 5, y: 0 } }, // Hidden: do not inspect feature.
    { type: 'UNIVERSITY', location: { x: 6, y: 0 }, complete: false },
    { type: 'WOODCUTTER', location: { x: 7, y: 0 } }, // Urban: not Pet Kot.
  ].map((item, index) => ({ owner: 0, complete: true, damaged: false, ...item, id: index }));
  const parent = 'PET_KOT_MOD_VEGETATED_SCIENCE';
  const pet = 'ATTACH_PET_KOT_MOD_VEGETATED_SCIENCE';
  const milpa = 'MAYA_SYNCRETISM_EXPLORATION_SCIENCE_VEGETATION_SCIENCE';
  const tequitl = 'TEQUITL_MOD_TRADE_ROUTE_SCIENCE';
  const modifierIds = [parent, pet, milpa, tequitl];
  const modifierArguments = [
    { ModifierId: parent, Name: 'ModifierId', Value: pet },
    ...[[pet, petAmount], [milpa, 2], [tequitl, 2]].flatMap(([id, amount]) => [
      { ModifierId: id, Name: 'Amount', Value: String(amount) },
      { ModifierId: id, Name: 'YieldType', Value: 'YIELD_SCIENCE' },
    ]),
  ].filter(row => !missingAmount || row.ModifierId !== pet || row.Name !== 'Amount');
  const requirements = [
    [parent, 'REQUIREMENT_CITY_IS_CITY', false, {}],
    [pet, 'REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES', false, { FeatureClassType: 'FEATURE_CLASS_VEGETATED' }],
    [pet, 'REQUIREMENT_PLOT_DISTRICT_CLASS', true, { DistrictClass: 'CITYCENTER, URBAN' }],
    [milpa, 'REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES', false, { FeatureClassType: changeRule ? 'FEATURE_CLASS_WET' : 'FEATURE_CLASS_VEGETATED' }],
    [milpa, 'REQUIREMENT_CONSTRUCTIBLE_TAG_MATCHES', false, { Tag: 'SCIENCE' }],
  ];
  const culture = {
    getResearching: () => null, getAllAvailableNodeTypes: () => [], getGovernmentType: () => -1,
    getActiveTraditions: slot => slot === 1 ? [cards[0].TraditionType] : [],
    getUnlockedTraditions: slot => slot === 1 ? cards.map(c => c.TraditionType) : [],
    isTraditionActive: id => id === cards[0].TraditionType,
    getNumCultureSlots: () => 5, getNumAllCultureSlots: () => 5,
  };
  const city = (name, isTown, ids) => ({ name, isTown, Constructibles: { getIds: () => ids } });
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/research.js'), 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    Players: { get: id => { assert.equal(id, 0); return {
      Techs: culture, Culture: culture, Identity: { getWildcardPoints: () => 0 },
      Cities: { getCities: () => [city('Capital', false, instances.map(i => i.id)), city('Town', true, [0, 3])] },
      Trade: { countPlayerTradeRoutes: () => routeCount },
    }; } },
    GameInfo: {
      Ages: { lookup: () => ({ AgeType: 'AGE_EXPLORATION' }) },
      Attributes: [], Governments: { lookup: () => null }, Traditions: { lookup: id => cards.find(c => c.TraditionType === id) },
      Constructibles: { lookup: id => definitions.find(d => d.ConstructibleType === id) },
      Features: { lookup: () => ({ FeatureClassType: 'FEATURE_CLASS_VEGETATED' }) },
      Districts: { lookup: type => ({ DistrictClass: type }) }, TypeTags: [{ Type: 'UNIVERSITY', Tag: 'SCIENCE' }],
      // Native GameInfo tables offer find/filter, but are not JavaScript arrays.
      TraditionModifiers: Object.assign([{ TraditionType: cards[0].TraditionType, ModifierId: parent }, { TraditionType: cards[1].TraditionType, ModifierId: milpa }, { TraditionType: cards[2].TraditionType, ModifierId: tequitl }], { some: undefined }),
      Modifiers: modifierIds.map(id => ({ ModifierId: id, ModifierType: id, SubjectRequirementSetId: id === tequitl ? null : id })),
      DynamicModifiers: [
        [parent, 'COLLECTION_PLAYER_CITIES', 'EFFECT_ATTACH_MODIFIERS'],
        [pet, 'COLLECTION_CITY_PLOT_YIELDS', 'EFFECT_PLOT_ADJUST_YIELD'],
        [milpa, 'COLLECTION_PLAYER_CONSTRUCTIBLES', 'EFFECT_CONSTRUCTIBLE_ADJUST_YIELD'],
        [tequitl, 'COLLECTION_OWNER', 'EFFECT_PLAYER_ADJUST_YIELD_PER_NUM_TRADE_ROUTES'],
      ].map(([ModifierType, CollectionType, EffectType]) => ({ ModifierType, CollectionType, EffectType })),
      ModifierArguments: modifierArguments,
      RequirementSets: [parent, pet, milpa].map(RequirementSetId => ({ RequirementSetId, RequirementSetType: 'REQUIREMENTSET_TEST_ALL' })),
      RequirementSetRequirements: requirements.map(([RequirementSetId], i) => ({ RequirementSetId, RequirementId: String(i) })),
      Requirements: requirements.map(([, RequirementType, Inverse], i) => ({ RequirementId: String(i), RequirementType, Inverse })),
      RequirementArguments: requirements.flatMap(([, , , args], i) => Object.entries(args).map(([Name, Value]) => ({ RequirementId: String(i), Name, Value }))),
    },
    Constructibles: { getByComponentID: id => instances[id] },
    Districts: { getAtLocation: location => ({ type: [3, 4, 6, 7].includes(location.x) ? 'URBAN' : 'RURAL' }) },
    GameplayMap: {
      getRevealedState: (id, x) => x === 5 ? 0 : 1,
      getFeatureType: x => { assert.notEqual(x, 5, 'hidden tiles are never inspected'); return 'FOREST'; },
    },
    RevealedStates: { HIDDEN: 0 }, CultureSlotTypes: { POLICY_CULTURE_SLOT: 0, TRADITION_CULTURE_SLOT: 1, CRISIS_CULTURE_SLOT: 2 },
    ProgressionTreeNodeState: {}, Game: { turn: 106 },
  });
  const group = JSON.parse(JSON.stringify(data)).policies.traditions;
  return Object.fromEntries([...group.active, ...group.available].map(c => [c.name, c]));
}

test('Pet Kot counts distinct revealed undamaged rural improvement tiles in cities, not towns', () => {
  const impact = research().PET_KOT.impact;
  assert.ok(impact, 'cards include impact evidence');
  assert.equal(impact.status, 'estimated');
  assert.equal(impact.qualifyingCount, 1);
  assert.deepEqual(impact.estimatedBaseYields, { YIELD_SCIENCE: 1 });
  assert.equal(impact.estimatedNetYieldChange, null, 'base science is not a simulated swap');
  assert.equal(impact.evidence.length, 1);
  assert.equal(impact.evidence[0].settlement, 'Capital');
});

test('Milpa counts buildings using science tags, includes towns, excludes damaged and incomplete buildings', () => {
  const impact = research().MAYA_SYNCRETISM_EXPLORATION.impact;
  assert.ok(impact, 'Milpa has impact evidence');
  assert.equal(impact.qualifyingCount, 2);
  assert.deepEqual(impact.estimatedBaseYields, { YIELD_SCIENCE: 4 });
  assert.equal(impact.evidence.length, 2);
  assert.ok(!JSON.stringify(impact).includes('"x":5'));
});

test('Tequitl uses the native current route count, not projected route choices', () => {
  const impact = research().TEQUITL.impact;
  assert.ok(impact, 'Tequitl has impact evidence');
  assert.equal(impact.qualifyingCount, 5);
  assert.deepEqual(impact.estimatedBaseYields, { YIELD_SCIENCE: 10 });
  assert.equal(research({ routeCount: 0 }).TEQUITL.impact.estimatedBaseYields.YIELD_SCIENCE, 0);
});

test('unsupported cards and changed or incomplete definitions are unknown, not zero', () => {
  for (const impact of [research().OTHER.impact, research({ changeRule: true }).MAYA_SYNCRETISM_EXPLORATION.impact, research({ missingAmount: true }).PET_KOT.impact]) {
    assert.ok(impact, 'unknown impact is explicit');
    assert.equal(impact.status, 'unknown');
    assert.equal(impact.estimatedBaseYields, null);
    assert.equal(impact.qualifyingCount, null);
  }
  assert.equal(research({ routeCount: null }).TEQUITL.impact.status, 'unknown');
  assert.equal(research({ petAmount: '' }).PET_KOT.impact.status, 'unknown');
  assert.equal(research({ petAmount: 'NaN' }).PET_KOT.impact.status, 'unknown');
  assert.equal(research({ petAmount: '3' }).PET_KOT.impact.estimatedBaseYields.YIELD_SCIENCE, 3, 'uses the loaded amount, not a hardcoded yield');
});

function settlements({ missingSource = false } = {}) {
  const nodes = { INCOME: 1, MINUS_DEDUCTIONS: 2, DEDUCTIONS: 3, BUILDING_YIELDS: 4, IMPROVEMENT_YIELDS: 5, INCOME_MODIFIERS: 6, BUILDING_MAINTENANCE: 7 };
  const source = { description: 'Buildings', value: 10, base: { value: 8 }, modifier: { value: 25 }, context: { x: 999, y: 999, owner: 9 } };
  const city = {
    name: 'Capital', location: { x: 0, y: 0 }, population: 3,
    Constructibles: { getIds: () => [], getGreatWorkBuildings: () => [] },
    Workers: { GetAllPlacementInfo: () => [], getNumWorkers: () => 0, getCityWorkerCap: () => 2 },
    Growth: { turnsUntilGrowth: 3, currentFood: 1, getNextGrowthFoodThreshold: () => ({ value: 10 }) },
    Happiness: { netHappinessPerTurn: 2, hasUnrest: false }, BuildQueue: { getQueue: () => [] },
    Yields: {
      getNetYield: hash => { assert.equal(hash, 101); return 8; },
      getYieldSummaryForNode: (index, path) => { assert.equal(index, 0, 'summary API uses the yield index'); return path[0] === 1 ? { value: 12, base: { value: 10 }, modifier: { value: 20 } } : { value: -4 }; },
      getYieldsForNode: (index, path, details) => {
        assert.equal(index, 0); assert.equal(details, true);
        if (path.at(-1) === 4) return missingSource ? null : source;
        if (path.at(-1) === 6) return { value: 20, base: { steps: [{ description: 'Policy', value: 15 }, { description: 'Leader', value: 5 }] } };
        if (path.at(-1) === 7) return { value: 4, description: 'Building upkeep' };
        return null;
      },
    },
  };
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/settlements.js'), 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: value => value },
    Players: { get: () => ({ Cities: { getCities: () => [city] }, Culture: { getNumWorksInArchive: () => 0 } }) },
    GameInfo: { Yields: [{ $index: 0, $hash: 101, YieldType: 'YIELD_SCIENCE' }] }, CityYieldNodes: nodes,
    Game: { turn: 106 },
  });
  return JSON.parse(JSON.stringify(data)).settlements[0];
}

test('settlements expose engine yield sources and preserve negative deductions and percentage units', () => {
  const city = settlements();
  assert.equal(city.netYields.YIELD_SCIENCE, 8);
  assert.ok(city.yieldBreakdown, 'settlement yield breakdown is exported');
  const science = city.yieldBreakdown.YIELD_SCIENCE;
  assert.equal(science.income.value, 12);
  assert.equal(science.deductions.value, -4);
  assert.equal(science.sources.BUILDING_YIELDS.value, 10);
  assert.equal(science.sources.BUILDING_YIELDS.baseValue, 8);
  assert.equal(science.incomeModifiers.unit, 'percent');
  assert.equal(science.incomeModifiers.value, 20);
  assert.deepEqual(science.incomeModifiers.sources, [{ name: 'Policy', value: 15 }, { name: 'Leader', value: 5 }]);
  assert.equal(science.maintenance.BUILDING_MAINTENANCE.value, 4);
  assert.equal(science.sources.IMPROVEMENT_YIELDS, null);
  assert.equal(science.otherBaseIncome, 0);
  assert.ok(!JSON.stringify(science).includes('999'), 'native source contexts are not exposed');
});

test('missing engine yield sources stay unknown rather than becoming zero', () => {
  const science = settlements({ missingSource: true }).yieldBreakdown?.YIELD_SCIENCE;
  assert.ok(science, 'yield breakdown exists');
  assert.equal(science.sources.BUILDING_YIELDS, null);
  assert.equal(science.otherBaseIncome, 10, 'unattributed income is not silently lost');
});
