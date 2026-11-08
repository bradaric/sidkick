const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run({airfieldComplete = false, missingInventory = false, missingTraits = false,
  missingLedger = false, artifactDisplayed = true, hiddenAirfield = false, hiddenDisplay = false,
  missingDisplay = false, missingArchive = false, missingArchiveGetter = false, archiveCount = 1,
  missingTags = false, missingQuarterApi = false, missingQuarterDefinitions = false,
  recognizedQuarter = true, foreignDistrict = false, quarterComplete = true, quarterDamaged = false,
  scoringOverride = undefined} = {}) {
  let localLedgerReads = 0;
  const districtReads = [];
  const trackerTypes = {VICTORY_TRACKER_UNIQUE_IMPROVEMENT: 1, VICTORY_TRACKER_UNIQUE_QUARTER: 2,
    VICTORY_TRACKER_WONDER: 3, VICTORY_TRACKER_GREAT_WORK: 4, VICTORY_TRACKER_IMPROVED_FEATURE: 5};
  const rules = [
    {ScoringId: 'RAIL', TrackerType: 'VICTORY_TRACKER_UNIQUE_IMPROVEMENT', RequiresActivation: true},
    {ScoringId: 'FLIGHT', TrackerType: 'VICTORY_TRACKER_UNIQUE_QUARTER', RequiresActivation: true},
    {ScoringId: 'WONDERS', TrackerType: 'VICTORY_TRACKER_WONDER', Data: 'AGE_MODERN'},
    {ScoringId: 'ARTIFACTS', TrackerType: 'VICTORY_TRACKER_GREAT_WORK', Data: 'GREATWORKOBJECT_ARTIFACT'},
    {ScoringId: 'ARTIFACT_BONUS', TrackerType: 'VICTORY_TRACKER_GREAT_WORK', Data: 'GREATWORKOBJECT_ARTIFACT', RequiresActivation: true},
    {ScoringId: 'UNSUPPORTED', TrackerType: 'VICTORY_TRACKER_IMPROVED_FEATURE'},
  ].map(rule => ({VictoryType: 'CULTURE', Points: 3, ...rule}));
  const assets = new Map([
    [1, {type: 'GENERIC', complete: true, damaged: false}],
    [2, {type: 'UNIQUE_IMP', complete: true, damaged: false}],
    [3, {type: 'UNIQUE_IMP', complete: false, damaged: false}],
    [4, {type: 'UNIQUE_IMP', complete: true, damaged: true}],
    [5, {type: 'UNIQUE_BUILDING', complete: true, damaged: false}],
    [6, {type: 'WONDER', complete: true, damaged: false, location: {x: hiddenDisplay ? 0 : 2, y: 0}}],
    [8, {type: 'SECRET_HIDDEN', complete: true, damaged: false, location: {x: 0, y: 0}}],
    [9, {type: 'AIRFIELD', complete: airfieldComplete, damaged: false, location: {x: hiddenAirfield ? 0 : 2, y: 0}}],
    [10, {type: 'MONASTERY', complete: true, damaged: false}],
    [11, {type: 'TRAIT_ONLY_IMP', complete: true, damaged: false}],
    [12, {type: 'SECOND_UNIQUE_BUILDING', complete: quarterComplete, damaged: quarterDamaged}],
  ].map(([id, value]) => [id, {id: {owner: 0, id}, owner: 0, location: {x: 2, y: 0}, ...value}]));
  const cities = [10, 11].map((cityId, i) => ({id: {owner: 0, id: cityId}, name: `Home ${i}`, isTown: Boolean(i),
    Trade: {isInRailNetwork: () => !i},
    Constructibles: {
      getIds: missingInventory ? undefined : () => i ? [] : [...assets.keys()].map(id => ({owner: 0, id})).concat({owner: 9, id: 999}),
      getGreatWorkBuildings: missingDisplay ? undefined : () => i ? [] : [{constructibleID: {owner: 0, id: 6}, slots: [
        ...(artifactDisplayed ? [{greatWorkIndex: 20}] : []), {greatWorkIndex: 21}, {greatWorkIndex: -1}]}],
    },
  }));
  const local = {isMajor: true, team: 0, Cities: {getCities: () => cities},
    Diplomacy: {hasMet: id => id === 1},
    Culture: missingArchive ? undefined : {getNumWorksInArchive: () => archiveCount,
      getArchivedGreatWork: missingArchiveGetter ? undefined : index => {assert.equal(index, 0); return 22;}},
    Victories: {getVictoryCountdownStatus: () => null, getPointsForVictoryType: () => 100,
      getScoringForVictoryType: () => {localLedgerReads++; return missingLedger ? null : scoringOverride ?? [
        {name: 'Historic improvement', points: 1, trackerType: 1, age: 1, turn: 10},
        {name: 'Artifact award', points: 5, trackerType: 4, age: 2, turn: 42},
        {name: 'Historic relic award', points: 39, trackerType: 4, age: 1, turn: 100},
      ];}},
  };
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/victory.js'), 'utf8'), {
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0}, Locale: {compose: s => s},
    Players: {getAliveIds: () => [0, 1, 2], get: id => {
      if (id === 2) return {isMajor: true,
        Victories: {getPointsForVictoryType: () => 72, getVictoryCountdownStatus: () => null,
          getScoringForVictoryType: () => {throw Error('Unmet scoring history must not be inspected');}},
        get Cities() {throw Error('Unmet assets must not be inspected');},
        get Constructibles() {throw Error('Unmet constructibles must not be inspected');},
        get civilizationFullName() {throw Error('Unmet civilization must not be inspected');},
        get leaderType() {throw Error('Unmet leader must not be inspected');},
        get leaderName() {throw Error('Unmet leader name must not be inspected');},
        get team() {throw Error('Unmet team must not be inspected');}};
      return id === 0 ? local : {isMajor: true, team: 1, Victories: {getVictoryCountdownStatus: () => null,
        getPointsForVictoryType: () => 200, getScoringForVictoryType: () => []},
        get Cities() {throw Error('Foreign assets must not be inspected');}};
    }},
    Constructibles: {getByComponentID: component => {assert.equal(component.owner, 0); return assets.get(component.id);}},
    Districts: missingQuarterApi ? undefined : {getAtLocation: location => {
      assert.equal(location.x, 2, 'district reads are limited to revealed owned building locations');
      districtReads.push(location.x);
      return {owner: foreignDistrict ? 1 : 0, id: {owner: foreignDistrict ? 1 : 0, id: 80},
        get uniqueQuarterType() {assert.equal(foreignDistrict, false, 'foreign district metadata is not read'); return recognizedQuarter ? 9 : -1;},
        isUniqueQuarter: recognizedQuarter};
    }},
    UniqueQuarterTypes: {NO_QUARTER: -1},
    GameInfo: {
      Ages: {lookup: () => ({AgeType: 'AGE_EXPLORATION', Name: 'Age'})}, Leaders: {lookup: () => null},
      VictoryTypes: [{$hash: 50, VictoryType: 'CULTURE', CountdownDuration: 5}],
      Victories: [{VictoryType: 'CULTURE', VictoryClassType: 'VICTORY_CLASS_CULTURE'}], VictoryScorings: rules,
      VictoryScoringArgs: [{ScoringId: 'RAIL', Key: 'REQUIRED_RAIL_NETWORK', ValueAsInt: 0},
        {ScoringId: 'FLIGHT', Key: 'REQUIRED_CONSTRUCTIBLE', ValueAsText: 'AIRFIELD', ValueAsInt: 0}],
      Constructibles: {lookup: type => {assert.notEqual(type, 'SECRET_HIDDEN'); return {ConstructibleType: type, Name: type,
        Age: 'AGE_MODERN', ConstructibleClass: type === 'WONDER' ? 'WONDER' : ['UNIQUE_IMP', 'MONASTERY', 'TRAIT_ONLY_IMP'].includes(type) ? 'IMPROVEMENT' : 'BUILDING'};}},
      Improvements: missingTraits ? undefined : {lookup: type => ({TraitType: type === 'MONASTERY' ? null : 'UNIQUE_TRAIT'})},
      Buildings: {lookup: type => ({TraitType: type.includes('UNIQUE_BUILDING') ? 'UNIQUE_TRAIT' : null})},
      TypeTags: missingTags ? undefined : [{Type: 'UNIQUE_IMP', Tag: 'UNIQUE_IMPROVEMENT'},
        {Type: 'MONASTERY', Tag: 'UNIQUE_IMPROVEMENT'}, {Type: 'MONASTERY', Tag: 'CITY_STATE_UNIQUE_IMPROVEMENT'}],
      UniqueQuarters: missingQuarterDefinitions ? undefined : {lookup: type => {
        assert.equal(type, 9); return {UniqueQuarterType: 'QUARTER_PAIR', Name: 'Pair', BuildingType1: 'UNIQUE_BUILDING', BuildingType2: 'SECOND_UNIQUE_BUILDING'};
      }},
      GreatWorks: {lookup: type => ({GreatWorkType: type, Name: type, GreatWorkObjectType: type === 'WORK_21' ? 'GREATWORKOBJECT_RELIC' : 'GREATWORKOBJECT_ARTIFACT'})},
    },
    VictoryTrackerTypes: trackerTypes,
    GameplayMap: {getGridWidth: () => 4, getGridHeight: () => 1, getRevealedState: (id, x) => x === 0 ? 0 : 2},
    RevealedStates: {HIDDEN: 0, VISIBLE: 2},
    Game: {turn: 57, age: 2, VictoryManager: {getVictories: () => [], isCountdownVictoryEnabled: () => true, getCountdownVictoryDominanceScore: () => 300},
      AgeProgressManager: {getCurrentAgeProgressionPoints: () => 40, getMaxAgeProgressionPoints: () => 100},
      Culture: {getGreatWorkType: index => {assert.ok([20, 21, 22].includes(index), 'only proven owned work indices are read');
        if (hiddenDisplay) assert.equal(index, 22, 'hidden building contents are not inspected');
        return `WORK_${index}`;}},
      PlayerOperations: {sendRequest: () => {throw Error('No actions or previews');}},
    },
  });
  return {data: JSON.parse(JSON.stringify(data)), localLedgerReads, districtReads};
}

const rule = (data, id) => data.victoryConditions[0].scoringRules.find(value => value.id === id);

test('Culture rules link to observed owned candidate assets and retain incomplete/damaged state without point estimates', () => {
  const {data} = run();
  const rail = rule(data, 'RAIL');
  assert.ok(rail.localEvidence, 'local candidate evidence is exported');
  assert.equal(rail.localEvidence.assetBasis, 'tagged-unique-improvements');
  const city = rail.localEvidence.settlements[0];
  assert.equal(city.railNetworkMembership, true);
  assert.deepEqual(city.candidateAssets.map(asset => asset.instanceId), [2, 3, 4, 10]);
  assert.equal(city.candidateAssets[1].complete, false);
  assert.equal(city.candidateAssets[2].damaged, true);
  assert.equal(rail.localEvidence.qualifyingCount, null);
  assert.equal(rail.activeForLocalPlayer, null);
  assert.equal(rail.arguments[0].value, 0, 'presence of the rail argument is not mistaken for a false requirement');
  assert.equal(rule(data, 'WONDERS').localEvidence.settlements[0].candidateAssets[0].id, 'WONDER');
});

test('loaded constructible prerequisites retain per-settlement observations without asserting requirement scope', () => {
  const {data} = run();
  const flight = rule(data, 'FLIGHT').localEvidence;
  assert.ok(flight, 'loaded prerequisite observations are exported');
  assert.equal(flight.settlements[0].requiredConstructible.id, 'AIRFIELD');
  assert.equal(flight.settlements[0].requiredConstructible.observedCompleteUndamaged, null, 'withheld inventory prevents an absence claim');
  assert.equal(flight.settlements[1].requiredConstructible.observedCompleteUndamaged, false);
  assert.equal(flight.requiredConstructibleScope, null);
  assert.equal(rule(run({airfieldComplete: true}).data, 'FLIGHT').localEvidence.settlements[0].requiredConstructible.observedCompleteUndamaged, true);
  assert.equal(rule(data, 'FLIGHT').activeForLocalPlayer, null);
});

test('displayed and archived Great Works stay separate from historical same-family scoring', () => {
  const {data} = run();
  const evidence = rule(data, 'ARTIFACTS').localEvidence;
  assert.ok(evidence, 'displayed/archive evidence is exported');
  assert.deepEqual(evidence.settlements[0].displayedWorks.map(work => work.instanceIndex), [20]);
  assert.deepEqual(evidence.archivedWorks.map(work => work.instanceIndex), [22]);
  const absent = rule(run({artifactDisplayed: false}).data, 'ARTIFACTS').localEvidence;
  assert.deepEqual(absent.settlements[0].displayedWorks, []);
  assert.deepEqual(absent.ledgerEntryIndices, [1, 2], 'historical awards do not disappear when a current display does');
});

test('ledger links are explicitly tracker-family-only and do not double-attribute base/conditional awards', () => {
  const {data, localLedgerReads} = run();
  const base = rule(data, 'ARTIFACTS').localEvidence;
  const bonus = rule(data, 'ARTIFACT_BONUS').localEvidence;
  assert.ok(base, 'ledger relationship is exported');
  assert.equal(base.ledgerMatchBasis, 'tracker-family-only');
  assert.deepEqual(base.ledgerEntryIndices, [1, 2]);
  assert.deepEqual(bonus.ledgerEntryIndices, [1, 2]);
  assert.equal(base.attributedPoints, null);
  assert.equal(bonus.attributedPoints, null);
  assert.equal(localLedgerReads, 1, 'links refer to the exact same local scoring read as progress.scoring');
});

test('unsupported asset families and missing inventory/classification/ledger remain unknown, not zero', () => {
  const {data} = run();
  assert.ok(rule(data, 'UNSUPPORTED').localEvidence);
  assert.equal(rule(data, 'UNSUPPORTED').localEvidence.assetBasis, 'unknown');
  assert.equal(rule(data, 'UNSUPPORTED').localEvidence.settlements, null);
  assert.equal(rule(run({missingInventory: true}).data, 'FLIGHT').localEvidence.settlements[0].candidateAssets, null);
  assert.equal(rule(run({missingInventory: true}).data, 'FLIGHT').localEvidence.settlements[0].requiredConstructible.observedCompleteUndamaged, null);
  assert.equal(rule(run({missingTags: true}).data, 'RAIL').localEvidence.settlements[0].candidateAssets, null);
  assert.equal(rule(run({missingLedger: true}).data, 'ARTIFACTS').localEvidence.ledgerEntryIndices, null);
  assert.ok(!JSON.stringify(data).includes('SECRET'));
});

test('withheld assets and missing display/archive interfaces cannot become negative presence evidence', () => {
  const flight = rule(run({hiddenAirfield: true}).data, 'FLIGHT').localEvidence.settlements[0];
  assert.equal(flight.inventoryComplete, false);
  assert.equal(flight.requiredConstructible.observedCompleteUndamaged, null);
  assert.equal(rule(run({hiddenDisplay: true}).data, 'ARTIFACTS').localEvidence.settlements[0].displayedWorks, null);
  assert.equal(rule(run({missingDisplay: true}).data, 'ARTIFACTS').localEvidence.settlements[0].displayedWorks, null);
  assert.equal(rule(run({missingArchive: true}).data, 'ARTIFACTS').localEvidence.archivedWorks, null);
});

test('an invalid archive count or missing instance getter leaves archive contents unknown', () => {
  assert.equal(rule(run({archiveCount: 1.5}).data, 'ARTIFACTS').localEvidence.archivedWorks, null);
  assert.equal(rule(run({missingArchiveGetter: true}).data, 'ARTIFACTS').localEvidence.archivedWorks, null);
  assert.deepEqual(rule(run({archiveCount: 0}).data, 'ARTIFACTS').localEvidence.archivedWorks, []);
});

test('unique-improvement tags include traitless Monasteries and exclude untagged trait-linked improvements', () => {
  const {data} = run({missingTraits: true});
  const assets = rule(data, 'RAIL').localEvidence.settlements[0].candidateAssets;
  assert.ok(assets, 'tag-based classification does not require trait definitions');
  assert.deepEqual(assets.map(asset => asset.instanceId), [2, 3, 4, 10]);
  assert.equal(assets.find(asset => asset.id === 'MONASTERY').traitType, null);
});

test('native unique quarters are one district record rather than two trait-linked building counts', () => {
  const {data, districtReads} = run();
  const evidence = rule(data, 'FLIGHT').localEvidence;
  assert.ok(evidence.settlements[0].uniqueQuarters, 'native quarter evidence is exported');
  assert.equal(evidence.settlements[0].uniqueQuarters.length, 1);
  const quarter = evidence.settlements[0].uniqueQuarters[0];
  assert.equal(quarter.id, 'QUARTER_PAIR');
  assert.equal(quarter.isUniqueQuarter, true);
  assert.deepEqual(quarter.requiredBuildingTypes, ['UNIQUE_BUILDING', 'SECOND_UNIQUE_BUILDING']);
  assert.deepEqual(quarter.buildings.map(asset => asset.instanceId), [5, 12]);
  assert.deepEqual(districtReads, [2], 'shared definition rules reuse the owned inventory and same-tile buildings reuse the district read');
  assert.equal(evidence.qualifyingCount, null);
  assert.equal(evidence.attributedPoints, null);
  assert.equal(rule(data, 'FLIGHT').activeForLocalPlayer, null);
});

test('quarter evidence preserves incomplete/damaged buildings and never reconstructs recognition from a pair', () => {
  const evidence = rule(run({quarterComplete: false, quarterDamaged: true}).data, 'FLIGHT').localEvidence;
  assert.ok(evidence.settlements[0].uniqueQuarters);
  const building = evidence.settlements[0].uniqueQuarters[0].buildings.find(asset => asset.instanceId === 12);
  assert.equal(building.complete, false);
  assert.equal(building.damaged, true);
  assert.deepEqual(rule(run({recognizedQuarter: false}).data, 'FLIGHT').localEvidence.settlements[0].uniqueQuarters, []);
});

test('missing native quarter evidence or conflicting ownership stays unknown without foreign metadata reads', () => {
  for (const options of [{missingQuarterApi: true}, {missingQuarterDefinitions: true}, {missingInventory: true}, {foreignDistrict: true}]) {
    const {data} = run(options);
    assert.equal(rule(data, 'FLIGHT').localEvidence.settlements[0].uniqueQuarters, null);
  }
});

test('met infrastructure and matching historical award amounts cannot establish activation or exact rule attribution', () => {
  const {data} = run({airfieldComplete: true, scoringOverride: [
    {name: 'RAIL', id: -1837687688, data: 0, points: 3, trackerType: 1, age: 1, turn: 10},
    {name: 'RAIL', id: -1837687688, data: 0, points: 1, trackerType: 1, age: 1, turn: 10},
    {name: 'FLIGHT', id: -310792786, data: 0, points: 3, trackerType: 2, age: 2, turn: 40},
  ]});
  const flight = rule(data, 'FLIGHT');
  assert.equal(flight.localEvidence.settlements[0].requiredConstructible.observedCompleteUndamaged, true);
  assert.equal(flight.localEvidence.settlements[0].uniqueQuarters[0].isUniqueQuarter, true);
  assert.equal(rule(data, 'RAIL').localEvidence.settlements[0].railNetworkMembership, true);
  for (const id of ['RAIL', 'FLIGHT']) {
    const source = rule(data, id);
    assert.equal(source.activeForLocalPlayer, null);
    assert.equal(source.localEvidence.requiredConstructibleScope, null);
    assert.equal(source.localEvidence.attributedPoints, null);
    assert.equal(source.localEvidence.qualifyingCount, null);
    assert.equal(source.localEvidence.ledgerMatchBasis, 'tracker-family-only');
  }
  assert.deepEqual(rule(data, 'RAIL').localEvidence.ledgerEntryIndices, [0, 1]);
  assert.deepEqual(flight.localEvidence.ledgerEntryIndices, [2]);
});
