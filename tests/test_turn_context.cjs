const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run({ variable = false, trial = false, conditional = true, pending = true, affordable = true, allowed = true,quote, unitOrders = {} } = {}) {
  const rootId = { owner: 0, id: 7, type: 20 };
  const foreignId = { owner: 1, id: 9, type: 20 };
  const root = { $hash: 100, NarrativeStoryType: 'CRISIS_EVENT', UIActivation: trial ? 'TRIAL' : 'CRISIS', VariableLinks: variable };
  const choice = { $hash: 101, NarrativeStoryType: 'RESPONSE', Activation: 'LINKED_REQUISITE', Cost: 50, CostYield: 'YIELD_GOLD' };
  const sameRoot = id => { assert.equal(id.owner, 0, 'foreign stories must not be inspected'); assert.equal(id.id, 7); };
  const calls = [];
  const unitReads = [];
  const ownedUnits = unitOrders.units ?? [];
  const noUiMutation = () => assert.fail('readiness must not select, cycle, focus or order units');
  const result = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/turn_context.js'), 'utf8'), {
    UI: { isInGame: () => true, Player: {
      ...(!unitOrders.missingReadyGetter ? {getFirstReadyUnit: () => {
        unitReads.push('firstReady');
        if (unitOrders.throwReady) throw Error('unavailable');
        return unitOrders.ready ?? null;
      }} : {}), selectNextReadyUnit: noUiMutation, selectUnit: noUiMutation, lookAtID: noUiMutation,
    } }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    Players: { get: id => { assert.equal(id, 0); return {
      Units: {getUnits: () => ownedUnits},
      Stories: { getActiveQuests: () => [], getPendingMetIds: () => pending ? [rootId, rootId, foreignId] : null,
        getNumPendingMet: () => pending ? 1 : 0, getFirstPendingDiscoveryLastMetID: () => pending ? rootId : null, getFirstPendingMetId: () => pending ? rootId : null,
        find: id => { sameRoot(id); return { type: 'CRISIS_EVENT' }; }, getStoryPlotCoord: () => ({ x: 9, y: 9 }),
        determineNarrativeInjectionComponentId: (id, type) => { sameRoot(id); return `${type} injected`; },
        determineNarrativeInjection: (id, hash, type) => { sameRoot(id); assert.equal(hash, 101); return `${type} response`; },
        determineRequisiteLink: () => conditional, canAfford: () => affordable, getOrderedLinks: () => ['RESPONSE'],
      },
      Cities: { getCities: () => [{ name: 'Home', isInfected: true, getPurchasedPlots: () => [0, 1],
        Constructibles: { getIds: () => [1] }, Happiness: { netHappinessPerTurn: -2, hasUnrest: true } }] },
    }; } },
    GameInfo: {
      Ages: { lookup: () => ({ Name: 'Exploration' }) },
      Units: {lookup: type => { assert.equal(type, 100); return {UnitType: 'UNIT_SCOUT', Name: 'Scout'}; }},
      NarrativeStories: { lookup: id => id === 'CRISIS_EVENT' ? root : choice },
      NarrativeStory_Links: [{ FromNarrativeStoryType: 'CRISIS_EVENT', ToNarrativeStoryType: 'RESPONSE' }],
      PlotEffects: { lookup: type => { assert.notEqual(type, 'PRIVATE'); return { PlotEffectType: 'PLOTEFFECT_PLAGUE', Name: 'Plague', Damage: 25 }; } },
      Constructibles: { lookup: () => ({ ConstructibleType: 'TEMPLE', Name: 'Temple' }) },
    },
    StoryTextTypes: { TITLE: 'title', BODY: 'body', OPTION: 'option', REWARD: 'reward', IMPERATIVE: 'action' },
    PlayerOperationParameters: { Activate: 'ACTIVATE' }, PlayerOperationTypes: { CHOOSE_NARRATIVE_STORY_DIRECTION: 'CHOOSE' },
    GameplayMap: { getGridWidth: () => 10, getGridHeight: () => 10, getRevealedState: (id, x) => x === 9 || x === 1 ? 0 : 1,
      getLocationFromIndex: index => ({ x: index, y: 0 }) }, RevealedStates: { HIDDEN: 0 },
    MapPlotEffects: { getPlotEffects: index => { assert.notEqual(index, 1, 'hidden plots are not inspected'); return [
      { effectType: 'PLAGUE', duration: 6, onlyVisibleToOwner: false, owner: -1 },
      { effectType: 'PRIVATE', duration: 9, onlyVisibleToOwner: true, owner: 1 },
    ]; } },
    Constructibles: { getByComponentID: () => ({ type: 'TEMPLE', damaged: true, location: { x: 0, y: 0 } }) },
    EndTurnBlockingTypes: {NONE: 0, UNITS: 1, PRODUCTION: 2},
    Game: { turn: 112, age: 1,
      Notifications: { getIdsForPlayer: () => [], ...(!unitOrders.missingBlockerGetter ? {
        getEndTurnBlockingType: id => {assert.equal(id, 0); return unitOrders.blocker ?? 0;}
      } : {}) },
      UnitOperations: { ...(!unitOrders.missingOperationGetter ? {canStartAny: id => {
        assert.equal(id, 0); unitReads.push('canStartAny');
        return Object.hasOwn(unitOrders, 'canStartAny') ? unitOrders.canStartAny : true;
      }} : {}) },
      CrisisManager: { isCrisisEnabled: () => true, getNumCrisisStages: () => 2, getCurrentCrisisStage: () => 1,
        getCrisisStageTriggerPercent: (index, stage) => { assert.ok(stage < 2, 'stage enumeration comes from the engine'); return 70 + stage * 10; },
        getMinimumTurnsRemainingInCurrentCrisis: () => 1, getMaximumTurnsRemainingInCurrentCrisis: () => 3 },
      AgeProgressManager: { getCurrentAgeProgressionPoints: () => 80, getMaxAgeProgressionPoints: () => 100 },
      PlayerOperations: { canStart: (id, op, args, visible) => { assert.equal(id, 0); assert.equal(op, 'CHOOSE'); sameRoot(args.Target);
        assert.equal(args.Action, 'ACTIVATE'); assert.equal(visible, false); calls.push(args.TargetType);
        return { Success: allowed, ...(quote!==undefined?{Cost:quote}:{}),FailureReasons: allowed ? [] : ['Blocked'] };
      } },
    },
  });
  return { data: JSON.parse(JSON.stringify(result)), calls, unitReads };
}

function readyUnit(overrides = {}) {
  return {id: {owner: 0, id: 42, type: 26}, type: 100, name: 'Western Scout',
    isOnMap: true, location: {x: 2, y: 3}, Movement: {movementMovesRemaining: 2},
    activityType: 7, operationQueueSize: 0, ...overrides};
}

test('turn context identifies the exact native first-ready owned unit without selecting it', () => {
  const unit = readyUnit();
  const {data, unitReads} = run({unitOrders: {blocker: 1, ready: unit.id, units: [unit]}});
  assert.ok(data.unitOrders, 'native unit-order evidence is exposed');
  assert.equal(data.unitOrders.blocker, 1);
  assert.equal(data.unitOrders.blockerName, 'UNITS');
  assert.equal(data.unitOrders.canStartAny, true);
  assert.equal(data.unitOrders.firstReadyUnitStatus, 'identified');
  assert.deepEqual(data.unitOrders.firstReadyUnit, {
    componentId: unit.id, instanceId: 42, id: 'UNIT_SCOUT', name: 'Western Scout',
    location: {x: 2, y: 3}, movesRemaining: 2, activityType: 7, queueSize: 0,
  });
  assert.deepEqual(unitReads, ['canStartAny', 'firstReady']);
  assert.match(data.unitOrders.scope, /not.*(all|full|complete)/i);
});

test('unspent movement does not invent a ready unit and other native blockers stay distinct', () => {
  const unit = readyUnit();
  const none = run({unitOrders: {ready: null, units: [unit]}}).data.unitOrders;
  assert.ok(none, 'native unit-order evidence is exposed');
  assert.equal(none.firstReadyUnitStatus, 'none');
  assert.equal(none.firstReadyUnit, null);
  const other = run({unitOrders: {blocker: 2, ready: unit.id, units: [unit], canStartAny: false}}).data.unitOrders;
  assert.equal(other.blockerName, 'PRODUCTION');
  assert.equal(other.canStartAny, false);
  assert.equal(other.firstReadyUnit.instanceId, 42, 'a ready cycle target does not replace the actual native blocker');
});

test('missing or failed ready-unit APIs remain unavailable, not a false empty checklist', () => {
  for (const extra of [{missingReadyGetter: true}, {throwReady: true}]) {
    const data = run({unitOrders: extra}).data;
    assert.ok(data.unitOrders, 'native unit-order evidence is exposed');
    assert.equal(data.unitOrders.firstReadyUnitStatus, 'unavailable');
    assert.equal(data.unitOrders.firstReadyUnit, null);
    assert.ok(data.pendingEvents.length > 0, 'readiness gaps do not discard other turn context');
  }
  const unknown = run({unitOrders: {missingBlockerGetter: true, missingOperationGetter: true}}).data.unitOrders;
  assert.equal(unknown.blocker, null);
  assert.equal(unknown.blockerName, null);
  assert.equal(unknown.canStartAny, null);
  assert.equal(run({unitOrders: {canStartAny: 1}}).data.unitOrders.canStartAny, null);
});

test('first-ready unit identity must match one exact owned instance; foreign and stale IDs are withheld', () => {
  const unit = readyUnit();
  for (const extra of [{ready: {...unit.id, owner: 1}}, {ready: {...unit.id, type: 99}},
    {ready: {...unit.id, id: 900}}, {ready: {owner: 0, id: -1, type: 26}}, {units: [unit, unit]}]) {
    const result = run({unitOrders: {ready: unit.id, units: [unit], ...extra}}).data.unitOrders;
    assert.ok(result, 'native unit-order evidence is exposed');
    assert.equal(result.firstReadyUnitStatus, 'unverified');
    assert.equal(result.firstReadyUnit, null);
  }
});

test('ready-unit details retain native queue state and withhold hidden or off-map locations', () => {
  for (const overrides of [{location: {x: 9, y: 9}}, {isOnMap: false}, {location: {x: -1, y: -1}}]) {
    const unit = readyUnit({...overrides, operationQueueSize: 1});
    const result = run({unitOrders: {ready: unit.id, units: [unit]}}).data.unitOrders;
    assert.ok(result, 'native unit-order evidence is exposed');
    assert.equal(result.firstReadyUnit.instanceId, 42);
    assert.equal(result.firstReadyUnit.queueSize, 1);
    assert.equal(result.firstReadyUnit.location, null);
    assert.equal(Object.hasOwn(result.firstReadyUnit, 'queuedDestination'), false);
  }
});

test('pending local event choices retain injected text, base costs and native eligibility without reading foreign stories', () => {
  const { data, calls } = run();
  assert.ok(data.pendingEvents, 'pending event choices are exported');
  assert.equal(data.pendingEvents.length, 1, 'queue heads and duplicate IDs are deduplicated');
  const event = data.pendingEvents[0];
  assert.equal(event.location, null);
  assert.equal(event.isCrisis, true);
  assert.equal(event.choices[0].reward, 'reward response');
  assert.deepEqual(event.choices[0].baseCost, { yield: 'YIELD_GOLD', amount: 50 });
  assert.equal(event.choices[0].quotedCost, null, 'a definition cost is not a runtime quote');
  assert.equal(event.choices[0].availableNow, true);
  assert.deepEqual(calls, ['RESPONSE']);
});

test('variable links, affordability and native permission jointly gate narrative choices', () => {
  assert.equal(run({ variable: true }).data.pendingEvents?.[0]?.choices[0].id, 'RESPONSE');
  for (const options of [{ affordable: false }, { allowed: false }]) {
    assert.equal(run(options).data.pendingEvents?.[0]?.choices[0].availableNow, false);
  }
  assert.equal(run({ conditional: false }).data.pendingEvents?.[0]?.choices[0].id, 'CLOSE', 'no eligible links becomes acknowledgement, not a guessed response');
});

test('trial links use the same native choice model with explicit acknowledgement, and runtime quotes are not definition costs', () => {
  assert.equal(run({ trial: true }).data.pendingEvents?.[0]?.choices[0].id, 'RESPONSE');
  assert.equal(run({ trial: true }).data.pendingEvents?.[0]?.trialRequiresAcknowledgement, true);
  assert.deepEqual(run({quote:60}).data.pendingEvents[0].choices[0].quotedCost,{yield:'YIELD_GOLD',amount:60});
  assert.deepEqual(run({ pending: false }).data.pendingEvents, []);
});

test('crisis stages are dynamic and owned infection evidence excludes hidden/private effects without attributing damage', () => {
  const { data } = run();
  assert.equal(data.crisis.stages.length, 2);
  assert.ok(data.crisis.settlements, 'owned crisis settlement evidence is exported');
  const city = data.crisis.settlements[0];
  assert.equal(city.infected, true);
  assert.equal(city.plaguePlots.length, 1);
  assert.equal(city.plaguePlots[0].remainingTurns, 6);
  assert.equal(city.damagedConstructibles[0].damageCause, null);
  assert.equal(city.crisisYieldPenalty, null);
});
