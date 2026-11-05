const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run({ unknownProgress = false, unknownTiming = false, primaryBlocked = false, noPrimary = false,
  emptySecondary = false, operationAllowed = true, privateEvents = false, signedUnit = false,
  visibleCity = false, cityIdCollision = false, cityPlotState = 2, centreState = 2,
  cityOwner = 1, missingCityApi = false, wrongCityId = false, noCityPlot = false, ownedPlotState = 1,
  invalidCityPlot = false } = {}) {
  const calls = [];
  const cityReads = [], mapReads = [];
  const foreignCityId = cityIdCollision ? 1000 : 2000;
  const secretPlot = {get x() {throw Error('Target plots must not be inspected');}};
  const projects = [{actionTypeName: 'SECONDARY', actionType: 10, operationType: 'OP', projectStatus: 0,
    projectDescription: 'Choose a secondary target', target2Type: 22, lastStageDuration: 15,
    targetList1: noPrimary ? [] : [{targetID: 1, costYieldD: 10, resultData: {FailureReasons: primaryBlocked ? ['Primary blocked'] : []}}],
    targetList2: emptySecondary ? [] : [
      {parameterName: 'Player3', targetID: 2, targetName: 'SECRET_PLAYER', targetPlot: secretPlot},
      {parameterName: 'Player3', targetID: 3, targetPlot: secretPlot, costYieldD: 30},
      {parameterName: 'Amount2', targetID: 100, targetName: '100 Gold', costYieldD: 0},
      {parameterName: 'City', targetID: 1000, targetName: 'Home', targetPlot: {x: 1, y: 0}},
      {parameterName: 'City', targetID: foreignCityId, targetName: 'SECRET_CITY', targetPlot: noCityPlot ? undefined : {x: invalidCityPlot ? 999 : 2, y: 0}},
      {parameterName: 'Unit', targetID: signedUnit ? -55 : 55, targetName: 'UNIT_PUBLIC', targetPlot: secretPlot},
      {parameterName: 'ID2', targetID: 4, targetPlot: secretPlot},
      {parameterName: 'UNSUPPORTED', targetID: 9999, targetName: 'SECRET_DATA', targetPlot: secretPlot},
    ]}];
  const events = [
    {uniqueID: 11, initialPlayer: 0, targetPlayer: 1, actionType: 10, actionTypeName: 'ENDEAVOR',
      gameTurnStart: unknownTiming ? -1 : 39, gameTurnEnd: -1, progressScore: unknownProgress ? undefined : 13,
      completionScore: 15, support: 2, responseType: 9, lastStageDuration: 15},
    {uniqueID: 12, initialPlayer: 1, targetPlayer: 0, revealed: true, actionType: 10, actionTypeName: 'INCOMING', progressScore: 0},
    ...(privateEvents ? [{uniqueID: 13, initialPlayer: 1, targetPlayer: 0, revealed: true, hidden: true, actionGroup: 44, actionType: 20, name: 'SECRET_ESPIONAGE'}] : []),
    {uniqueID: 14, initialPlayer: 1, targetPlayer: 3, revealed: true, actionType: 10, name: 'SECRET_FOREIGN_EVENT'},
    {uniqueID: 15, initialPlayer: 1, targetPlayer: 0, revealed: false, actionType: 10, name: 'SECRET_UNREVEALED'},
  ];
  const local = {
    Diplomacy: {hasMet: id => [1, 3, 4].includes(id), getRelationshipLevelName: () => 'Friendly', getRelationshipLevel: () => 2,
      getRelationshipEnum: () => 2, isAtWarWith: () => false, hasAllied: () => false, getPlayerRelationshipHistory: () => []},
    Stats: {getNetYield: () => 10}, Cities: {getCities: () => [{id: {owner: 0, id: 1000}, name: 'Home', location: {x: 1, y: 0}}]},
  };
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/diplomacy.js'), 'utf8'), {
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0}, Locale: {compose: s => s},
    Players: {getAliveIds: () => [0, 1, 2, 3, 4], get: id => {
      assert.notEqual(id, 2, 'unmet players are filtered before object reads');
      return id === 0 ? local : {id, isMajor: id !== 4, isIndependent: id === 4, civilizationFullName: `Known ${id}`};
    }},
    GameInfo: {Leaders: {lookup: () => null}, Units: {lookup: type => type === 'UNIT_PUBLIC' ? {UnitType: type, Name: 'Public unit'} : null},
      DiplomacyActions: {lookup: () => ({BaseDuration: 15, Description: 'Conditional agreement terms', IsMutualSupport: true, Supportable: true, Opposable: true})}},
    GameplayMap: {getGridWidth: () => 5, getGridHeight: () => 1,
      getRevealedState: (id, x) => {assert.equal(id, 0); return x === 1 ? ownedPlotState : x === 2 ? visibleCity ? cityPlotState : 0 : x === 3 ? centreState : 0;}},
    RevealedStates: {HIDDEN: 0, REVEALED: 1, VISIBLE: 2},
    MapCities: missingCityApi ? undefined : {getCity: (x, y) => {
      assert.equal(x, 2); assert.equal(y, 0); assert.equal(cityPlotState, 2, 'no fogged foreign discovery');
      mapReads.push(x); return {owner: cityOwner, id: foreignCityId};
    }},
    Cities: {get: component => {
      assert.equal(component.owner, 1, 'unmet/unrelated owners are rejected before city metadata reads');
      cityReads.push(component.id);
      return {id: {owner: 1, id: wrongCityId ? 9999 : foreignCityId}, owner: 1, location: {x: 3, y: 0},
        get name() {assert.equal(centreState, 2, 'a visible district cannot expose a fogged centre name'); return 'Visible foreign city';},
        get Production() {throw Error('No private foreign production');}};
    }},
    DiplomacyActionTargetTypes: {NO_DIPLOMACY_TARGET: -1, DIPLOMACY_TARGET_NONE: 0},
    DiplomacyActionGroups: {NO_DIPLOMACY_ACTION_GROUP: -1, DIPLOMACY_ACTION_GROUP_ESPIONAGE: 44},
    DiplomacyProjectStatus: {PROJECT_AVAILABLE: 0, PROJECT_ACTIVE: 1, PROJECT_BLOCKED: -1, PROJECT_NOT_UNLOCKED: -2},
    DiplomaticResponseTypes: {INVALID_RESPONSE: -1, DIPLOMACY_RESPONSE_SUPPORT: 9},
    YieldTypes: {YIELD_DIPLOMACY: 1},
    Game: {turn: 53, Diplomacy: {
      getProjectDataForUI: (id, peer) => {assert.equal(id, 0); return peer === 1 ? projects : [];},
      getBaseDiplomaticActionDuration: type => {assert.equal(type, 10); return 20;},
      getPlayerEvents: peer => peer === 1 ? events : [],
      getCompletionData: id => {
        assert.ok([11, 12].includes(id), 'private events are filtered before detailed queries');
        return {turnsToCompletion: unknownTiming ? -1 : 2, requiredProgress: 15, progressPerTurn: 2, turnsToNextStage: -1,
          secret: 'SECRET_COMPLETION'};
      },
      getActiveStage: id => {assert.ok([11, 12].includes(id)); return {stageType: 'ENDEAVOR_ACTIVE', previouslyEntered: true,
        stageModifiers: [{description: 'Native stage effect', available: true, secret: 'SECRET_EFFECT'}]};},
    }, PlayerOperations: {
      canStart: (id, operation, args, visibleOnly) => {
        assert.equal(id, 0); assert.equal(operation, 'OP'); assert.equal(visibleOnly, false);
        assert.equal(args.Player1, 0); assert.equal(args.Player2, 1); assert.equal(args.Type, 10); assert.equal(args.Amount, 1);
        assert.ok(!('X' in args) && !('Y' in args));
        calls.push(JSON.parse(JSON.stringify(args)));
        return {Success: operationAllowed && !('Amount2' in args), FailureReasons: 'Amount2' in args ? ['Not enough Gold'] : [], secret: 'SECRET_RESULT'};
      },
      sendRequest: () => {throw Error('Diplomatic actions are forbidden');},
    }, DiplomacyDeals: {
      hasPendingDeal: () => false, getDealIds: () => [],
      getDeal: () => {throw Error('No guessed enacted-deal schema');}, getDealItem: () => {throw Error('No guessed enacted-item schema');},
      getWorkingDeal: () => {throw Error('No working-deal access');}, clearWorkingDeal: () => {throw Error('No working-deal mutation');},
      sendWorkingDeal: () => {throw Error('No deal requests');},
    }},
  });
  return {data: JSON.parse(JSON.stringify(data)), calls, cityReads, mapReads};
}

test('secondary choices check exact selected arguments and exclude unmet players, hidden cities and raw plots', () => {
  const {data, calls} = run();
  const action = data.majorPlayers[0].availableActions[0];
  assert.ok(action.secondaryTargets, 'safe secondary choices are exported');
  assert.deepEqual(action.secondaryTargets.map(target => target.parameter), ['Player3', 'Amount2', 'City', 'Unit', 'ID2']);
  assert.equal(calls.length, 5);
  assert.equal(calls[0].Player3, 3);
  assert.equal(calls[1].Amount2, 100);
  assert.equal(calls[2].City, 1000);
  assert.equal(calls[3].Unit, 55);
  assert.equal(calls[4].ID2, 4);
  assert.equal(action.secondaryTargets[0].availableNow, true);
  assert.equal(action.secondaryTargets[1].availableNow, false);
  assert.deepEqual(action.secondaryTargets[1].failureReasons, ['Not enough Gold']);
  assert.equal(action.secondaryTargets[0].quotedInfluenceCost, 30);
  assert.equal(action.influenceCost, null, 'secondary quotes are not fabricated complete totals');
  assert.equal(action.secondaryTargetsComplete, false);
  assert.ok(!JSON.stringify(data).includes('SECRET'));
  assert.ok(!JSON.stringify(data).includes('9999'));
});

test('secondary action availability requires an eligible checked choice and primary eligibility', () => {
  assert.equal(run().data.majorPlayers[0].availableActions[0].available, true);
  assert.equal(run({operationAllowed: false}).data.majorPlayers[0].availableActions[0].available, false);
  assert.equal(run({primaryBlocked: true}).data.majorPlayers[0].availableActions[0].available, false);
  assert.equal(run({noPrimary: true}).calls.length, 0);
  const empty = run({emptySecondary: true}).data.majorPlayers[0].availableActions[0];
  assert.equal(empty.requiresSecondaryTarget, true, 'required target type matters even with an empty candidate list');
  assert.equal(empty.available, false);
});

test('ongoing progress uses native event scores and timing instead of a reconstructed duration formula', () => {
  const action = run().data.majorPlayers[0].ongoingActions[0];
  assert.equal(action.completion.progress, 13, 'not 15 minus 2 turns times 2 progress');
  assert.equal(action.completion.turnsRemaining, 2);
  assert.equal(action.completion.turnsToNextStage, null);
  assert.equal(action.turnEnded, null);
  assert.equal(action.completion.progressPerTurn, 2);
  const unknown = run({unknownProgress: true, unknownTiming: true}).data.majorPlayers[0].ongoingActions[0];
  assert.equal(unknown.completion.progress, null);
  assert.equal(unknown.completion.turnsRemaining, null);
  assert.equal(unknown.turnStarted, null);
});

test('terms and native active-stage effects are evidence, not a predicted agreement expiry', () => {
  const peer = run().data.majorPlayers[0];
  const action = peer.ongoingActions[0];
  assert.ok(action.terms, 'public agreement terms are included');
  assert.equal(action.terms.definitionBaseDuration, 15);
  assert.equal(action.terms.description, 'Conditional agreement terms');
  assert.equal(action.response, 'DIPLOMACY_RESPONSE_SUPPORT');
  assert.equal(action.activeStage.id, 'ENDEAVOR_ACTIVE');
  assert.deepEqual(action.activeStage.effects, [{description: 'Native stage effect', available: true}]);
  assert.equal(peer.availableActions[0].quotedBaseDuration, 20, 'native duration quotes stay distinct from base definitions');
});

test('hidden incoming espionage is not attributed to a known leader or queried for private detail', () => {
  const {data} = run({privateEvents: true});
  assert.deepEqual(data.majorPlayers[0].ongoingActions.map(action => action.id), [11, 12]);
  assert.ok(!JSON.stringify(data).includes('SECRET'));
});

test('public unit selectors retain signed native type hashes rather than requiring positive instance IDs', () => {
  const {data, calls} = run({signedUnit: true});
  const choice = data.majorPlayers[0].availableActions[0].secondaryTargets.find(target => target.parameter === 'Unit');
  assert.ok(choice, 'signed public unit selector is retained');
  assert.equal(choice.value, -55);
  assert.equal(calls.find(args => 'Unit' in args).Unit, -55);
});

test('offered City choices include only the met counterpart’s currently visible centre with exact native eligibility', () => {
  const {data, calls, cityReads} = run({visibleCity: true});
  const action = data.majorPlayers[0].availableActions[0];
  const choice = action.secondaryTargets.find(target => target.kind === 'visible-foreign-settlement');
  assert.ok(choice, 'visible foreign City choice is exported');
  assert.equal(choice.name, 'Visible foreign city');
  assert.deepEqual(choice.settlement, {ownerId: 1, cityId: 2000, location: {x: 3, y: 0}});
  assert.equal(choice.parameter, 'City');
  assert.equal(choice.value, 2000);
  assert.equal(choice.availableNow, true);
  assert.ok(calls.some(args => args.City === 2000));
  assert.deepEqual(cityReads, [2000]);
  assert.equal(action.influenceCost, null);
  assert.equal(action.secondaryTargetsComplete, false);
  assert.ok(!JSON.stringify(data).includes('SECRET'));
  assert.ok(!JSON.stringify(choice).includes('targetPlot'));
});

test('reused city IDs are resolved by offered plot ownership rather than mislabelled as an owned city', () => {
  const {data} = run({visibleCity: true, cityIdCollision: true});
  const choices = data.majorPlayers[0].availableActions[0].secondaryTargets.filter(target => target.parameter === 'City');
  assert.deepEqual(choices.map(choice => [choice.kind, choice.name]), [
    ['owned-settlement', 'Home'], ['visible-foreign-settlement', 'Visible foreign city'],
  ]);
  assert.deepEqual(choices.map(choice => choice.settlement.ownerId), [0, 1]);
});

test('hidden/fogged plots, fogged centres, unmet/unrelated owners and mismatched city IDs are omitted before checks', () => {
  for (const options of [{cityPlotState: 0}, {cityPlotState: 1}, {centreState: 1}, {centreState: 0},
    {cityOwner: 2}, {cityOwner: 3}, {wrongCityId: true}, {missingCityApi: true}]) {
    const {data, calls, mapReads, cityReads} = run({visibleCity: true, ...options});
    assert.equal(data.majorPlayers[0].availableActions[0].secondaryTargets.filter(target => target.parameter === 'City').length, 1);
    assert.ok(!calls.some(args => args.City === 2000));
    if (options.cityPlotState != null && options.cityPlotState !== 2) assert.equal(mapReads.length, 0);
    if (options.cityOwner != null) assert.equal(cityReads.length, 0);
  }
});

test('a missing offered plot cannot identify an ambiguous city and native rejection never becomes availability', () => {
  const ambiguous = run({visibleCity: true, cityIdCollision: true, noCityPlot: true});
  assert.equal(ambiguous.data.majorPlayers[0].availableActions[0].secondaryTargets.filter(target => target.parameter === 'City').length, 1);
  const blocked = run({visibleCity: true, operationAllowed: false}).data.majorPlayers[0].availableActions[0].secondaryTargets
    .find(target => target.kind === 'visible-foreign-settlement');
  assert.ok(blocked);
  assert.equal(blocked.operationAllowed, false);
  assert.equal(blocked.availableNow, false);
});

test('invalid offered coordinates and unknown visibility cannot produce City eligibility', () => {
  const invalid = run({visibleCity: true, invalidCityPlot: true});
  assert.equal(invalid.mapReads.length, 0);
  assert.ok(!invalid.calls.some(args => args.City === 2000));
  const unknown = run({ownedPlotState: null});
  assert.ok(!unknown.calls.some(args => args.City === 1000));
});
