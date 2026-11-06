const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const RESEARCH = 'DIPLOMACY_ACTION_RESEARCH_COLLABORATION';
const INCORPORATE = 'DIPLOMACY_ACTION_CS_INCORPORATE';

function run(options = {}, script = 'start_diplomatic_project.js') {
  const kind = options.kind ?? 'major';
  const action = options.action ?? (kind === 'major' ? RESEARCH : kind === 'independent' ? 'DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN' : INCORPORATE);
  const calls = [], playerReads = [], completionReads = [];
  const event = (overrides = {}) => ({uniqueID: 40, initialPlayer: 0, targetPlayer: 3,
    actionType: -101, actionTypeName: action, gameTurnStart: 58, gameTurnEnd: -1, failed: false,
    progressScore: 0, ...overrides});
  const events = options.events ?? (options.existing ? [event()] : []);
  const project = {actionTypeName: action, actionType: -101, operationType: action === INCORPORATE ? 88 : 77,
    projectStatus: options.status ?? 0, target2Type: options.secondaryType ?? -1,
    targetList1: options.wrongTarget ? [{targetID: 99, costYieldD: 1}] : [
      {targetID: 99, costYieldD: 1}, {targetID: 3, costYieldD: options.cost === null ? undefined : options.cost ?? 150,
        resultData: {FailureReasons: options.targetReasons ?? []}},
    ], targetList2: options.secondary ? [{targetID: 99, targetPlot: {x: 9999, y: 9999}}] : [],
    resultData: {FailureReasons: options.projectReasons ?? []}};
  const local = {isTurnActive: options.activeTurn ?? true,
    DiplomacyTreasury: {diplomacyBalance: options.balance ?? 1000},
    Diplomacy: {hasMet: id => id === 3 && !options.unmet, isAtWarWith: () => options.atWar ?? false}};
  const context = {
    queryArguments: {target_kind: kind, target_player_id: 3, action, max_influence_cost: 150,
      expected_turn: 58, baseline_event_ids: options.baseline ?? [], ...options.arguments},
    UI: {isInGame: () => options.inGame !== false},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => options.sentTurn ?? false},
    Players: {get: id => {
      playerReads.push(id);
      if (id === 0) return local;
      assert.ok(!options.unmet || options.discovered, 'undiscovered unmet targets must not be inspected');
      assert.equal(id, 3);
      return {isMajor: options.wrongKind ? !['major','hostile'].includes(kind) : ['major','hostile'].includes(kind),
        isMinor: options.wrongKind ? kind !== 'city-state' : kind === 'city-state',
        isIndependent: options.wrongKind ? kind !== 'independent' : kind === 'independent',
        Influence: {getSuzerain: () => options.suzerain ?? 0}};
    }},
    GameInfo: {DiplomacyActions: {lookup: value => value === action || value === -101
      ? {DiplomacyActionType: action, $hash: -101} : null}},
    DiplomacyProjectStatus: {PROJECT_AVAILABLE: 0, PROJECT_ACTIVE: 1, PROJECT_BLOCKED: -1, PROJECT_NOT_UNLOCKED: -2},
    DiplomacyActionTargetTypes: {NO_DIPLOMACY_TARGET: -1, DIPLOMACY_TARGET_NONE: 0},
    DiplomacyActionGroups: {NO_DIPLOMACY_ACTION_GROUP: -1},
    Game: {turn: 58, age: 42, IndependentPowers: {independentVillageDiscoveredByPlayer: () => Boolean(options.discovered)}, Diplomacy: {
      getProjectDataForUI: (id, target) => {
        assert.equal(id, 0); assert.equal(target, 3);
        const rows = options.ambiguous ? [project, project] : [project];
        if (options.otherActive) rows.unshift({...project, actionID: 64, projectStatus: 1, operationType: -1,
          resultData: {FailureReasons: ['Action not unlocked']}});
        return rows;
      },
      getPlayerEvents: target => {assert.equal(target, 3); return events;},
      getCompletionData: id => {completionReads.push(id); return {turnsToCompletion: 10};},
    }, PlayerOperations: {
      canStart: (id, operation, args, exclusion) => {
        calls.push({kind: 'check', id, operation, args, exclusion});
        if (options.changed) context.Game.turn++;
        if (options.changedCost) project.targetList1[1].costYieldD++;
        return {Success: options.allowed ?? true, FailureReasons: ['Native project blocker']};
      },
      sendRequest: (id, operation, args) => {
        calls.push({kind: 'send', id, operation, args});
        if (options.sendThrows) throw Error('Lost acknowledgement');
      },
    }},
  };
  const source = fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8');
  let result;
  try { result = vm.runInNewContext(source, context); }
  catch (error) { if (!options.sendThrows) throw error; result = {error: error.message}; }
  return JSON.parse(JSON.stringify({data: result, calls, playerReads, completionReads}));
}

test('major project start uses selected-target cost and exact quick-start UI arguments once', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.equal(data.quotedInfluenceCost, 150);
  assert.deepEqual(data.before.eventIds, []);
  assert.deepEqual(data.expected, {targetPlayerId: 3, targetKind: 'major', action: RESEARCH, newProjectObserved: true});
  assert.deepEqual(calls, [
    {kind: 'check', id: 0, operation: 77, args: {Amount: 1, Player1: 0, Type: -101, Player2: 3, ID: 3}, exclusion: false},
    {kind: 'send', id: 0, operation: 77, args: {Amount: 1, Player1: 0, Type: -101, Player2: 3, ID: 3}},
  ]);
  assert.deepEqual(data.verificationArguments.baseline_event_ids, []);
});

test('independent befriending binds one met/discovered power to its native offered capped start, not a major-player action', () => {
  for (const o of [{}, {unmet: true, discovered: true}, {atWar: true}]) {
    const r = run({kind: 'independent', ...o}); assert.equal(r.data.status, 'submitted'); assert.equal(r.calls.at(-1).args.ID, 3);
  }
  for (const o of [{unmet: true}, {wrongKind: true}, {cost: 151}, {secondary: true}]) assert.equal(run({kind: 'independent', ...o}).data.status, 'rejected');
});

test('explicit hostile project family supports fixed sanctions and espionage including during an existing war',()=>{
  for(const action of ['DIPLOMACY_ACTION_DENOUNCE','DIPLOMACY_ACTION_SABOTAGE_TREASURY','DIPLOMACY_ACTION_COUNTER_SPY',
    'DIPLOMACY_ACTION_ESPIONAGE_STEAL_TECH','DIPLOMACY_ACTION_ESPIONAGE_STEAL_CIVIC','DIPLOMACY_ACTION_ESPIONAGE_MILITARY_INFILTRATION','DIPLOMACY_ACTION_ESPIONAGE_MILITARY_SABOTAGE']){
    const r=run({kind:'hostile',action,atWar:true});assert.equal(r.data.status,'submitted');assert.equal(r.calls.at(-1).operation,77);
  }
  for(const o of [{action:'DIPLOMACY_ACTION_DECLARE_WAR'},{action:'DIPLOMACY_ACTION_SABOTAGE_FOOD_PRODUCTION',secondary:true}])
    assert.equal(run({kind:'hostile',...o}).data.status,'rejected');
  const event={uniqueID:90,initialPlayer:0,targetPlayer:3,actionType:-101,gameTurnStart:58,gameTurnEnd:-1,failed:false};
  assert.equal(run({kind:'hostile',action:'DIPLOMACY_ACTION_ESPIONAGE_STEAL_TECH',events:[event]},'diplomatic_project_state.js').data.newProjectObserved,true);
});

test('incorporation uses its distinct native operation and requires local suzerainty', () => {
  const {data, calls} = run({kind: 'city-state'});
  assert.equal(data.status, 'submitted');
  assert.equal(calls[1].operation, 88, 'do not substitute the normal start-project operation');
  const blocked = run({kind: 'city-state', suzerain: 1});
  assert.equal(blocked.data.status, 'rejected');
  assert.equal(blocked.calls.length, 0);
});

test('an active sibling row from another city-state is not an ambiguous available start option', () => {
  const {data, calls} = run({kind: 'city-state', otherActive: true});
  assert.equal(data.status, 'submitted');
  assert.equal(calls[1].operation, 88);
  assert.equal(calls.filter(call => call.kind === 'send').length, 1);
});

test('the other supported projects use their own native picker entry', () => {
  for (const [kind, action] of [
    ['major', 'DIPLOMACY_ACTION_OPEN_BORDERS'], ['major', 'DIPLOMACY_ACTION_CULTURAL_EXCHANGE'],
    ['city-state', 'DIPLOMACY_ACTION_CS_PROMOTE_GROWTH'], ['city-state', 'DIPLOMACY_ACTION_CS_BOLSTER_MILITARY'],
  ]) {
    const {data, calls} = run({kind, action});
    assert.equal(data.status, 'submitted');
    assert.equal(calls[1].operation, 77);
    assert.equal(data.expected.action, action);
  }
});

test('budget, affordability, project status, primary failure and secondary-target gates prevent writes', () => {
  for (const options of [{cost: 151}, {cost: null}, {balance: 149}, {status: -2}, {status: -1},
    {wrongTarget: true}, {ambiguous: true}, {secondary: true}, {secondaryType: 9},
    {targetReasons: ['Target blocked']}, {projectReasons: ['Not offered']}]) {
    const {data, calls} = run(options);
    assert.equal(data.status, 'rejected', JSON.stringify(options));
    assert.equal(calls.length, 0);
    assert.ok(!JSON.stringify(data).includes('9999'), 'hidden native secondary plots must not leak');
  }
});

test('genuine zero-cost projects are permitted with a zero cap', () => {
  const {data} = run({cost: 0, balance: 0, arguments: {max_influence_cost: 0}});
  assert.equal(data.status, 'submitted');
  assert.equal(data.quotedInfluenceCost, 0);
});

test('fractional quotes are retained rather than rounded below the cap', () => {
  assert.equal(run({cost: 150.25, arguments: {max_influence_cost: 150.5}}).data.quotedInfluenceCost, 150.25);
  assert.equal(run({cost: 150.25}).data.status, 'rejected');
});

test('unmet/wrong-kind targets and unsupported or malformed actions cannot use the bridge', () => {
  for (const options of [{unmet: true}, {wrongKind: true}, {atWar: true},
    {arguments: {action: 'DIPLOMACY_ACTION_DECLARE_WAR'}}, {arguments: {target_kind: 'other'}},
    {arguments: {target_player_id: true}}, {arguments: {expected_turn: 57}},
    {arguments: {max_influence_cost: true}}, {arguments: {max_influence_cost: -1}},
    {arguments: {max_influence_cost: Infinity}}, {inGame: false}, {activeTurn: false}, {sentTurn: true}]) {
    const {data, calls, playerReads} = run(options);
    assert.equal(data.status, 'rejected', JSON.stringify(options));
    assert.equal(calls.length, 0);
    if (options.unmet) assert.deepEqual(playerReads, [0]);
  }
});

test('an existing matching own ongoing project is a no-op rather than a second request', () => {
  const {data, calls} = run({existing: true, status: 1});
  assert.equal(data.status, 'already_active');
  assert.equal(calls.length, 0);
});

test('native rejection and changed context never submit; send exceptions never retry', () => {
  for (const options of [{allowed: false}, {changed: true}, {changedCost: true}]) {
    const {data, calls} = run(options);
    assert.equal(data.status, 'rejected');
    assert.deepEqual(calls.map(call => call.kind), ['check']);
  }
  const {data, calls} = run({sendThrows: true});
  assert.match(data.error, /Lost acknowledgement/);
  assert.equal(calls.filter(call => call.kind === 'send').length, 1);
});

test('completed project IDs are captured from owned records, not trusted from caller data', () => {
  const {data, calls} = run({baseline: [999], events: [{uniqueID: 40, initialPlayer: 0,
    targetPlayer: 3, actionType: -101, gameTurnStart: 40, gameTurnEnd: 50, failed: false}]});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(data.verificationArguments.baseline_event_ids, [40]);
  assert.equal(calls.filter(call => call.kind === 'send').length, 1);
});

test('readback requires a new matching own event and never mistakes historical, incoming or failed events for success', () => {
  const event = (overrides = {}) => ({uniqueID: 90, initialPlayer: 0, targetPlayer: 3, actionType: -101,
    gameTurnStart: 58, gameTurnEnd: -1, failed: false, progressScore: 0, ...overrides});
  const {data, calls, completionReads} = run({baseline: [40], events: [
    event({uniqueID: 40, gameTurnStart: 57}), event({uniqueID: 91, initialPlayer: 2}),
    event({uniqueID: 92, targetPlayer: 4}), event({uniqueID: 93, actionType: -202}),
    event({uniqueID: 94, gameTurnEnd: 58}), event({uniqueID: 95, failed: true}), event(),
  ]}, 'diplomatic_project_state.js');
  assert.equal(data.newProjectObserved, true);
  assert.deepEqual(data.newProjects.map(record => record.id), [90]);
  assert.deepEqual(completionReads, [90]);
  assert.equal(calls.length, 0);
});

test('old IDs and wrong/missing start evidence cannot verify a newly submitted project', () => {
  for (const event of [
    {uniqueID: 40, gameTurnStart: 58, gameTurnEnd: -1},
    {uniqueID: 90, gameTurnStart: 57, gameTurnEnd: -1},
    {uniqueID: 90, gameTurnEnd: -1},
    {uniqueID: 90, gameTurnStart: 58, gameTurnEnd: 58},
  ]) {
    const {data} = run({baseline: [40], events: [{initialPlayer: 0, targetPlayer: 3, actionType: -101,
      failed: false, ...event}]}, 'diplomatic_project_state.js');
    assert.equal(data.newProjectObserved, false);
  }
});

test('multiple new matching project records remain ambiguous rather than claiming one submission succeeded cleanly', () => {
  const events = [90, 91].map(uniqueID => ({uniqueID, initialPlayer: 0, targetPlayer: 3,
    actionType: -101, gameTurnStart: 58, gameTurnEnd: -1, failed: false}));
  const {data} = run({events}, 'diplomatic_project_state.js');
  assert.equal(data.newProjectObserved, false);
  assert.equal(data.newProjects.length, 2);
});
