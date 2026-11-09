const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run({ pendingBonus = 2, suzerain = 0, inGame = true, playerId = 0, independentType = 'MILITARISTIC', independentMet = false, rival = {}, missingCompletion = false } = {}) {
  const script = path.join(__dirname, '../civ7/city_states.js');
  assert.ok(fs.existsSync(script), 'bundled city-state query exists');
  const playerReads = [], projectReads = [], completionReads = [], operations = [];
  const statuses = { PROJECT_AVAILABLE: 0, PROJECT_ACTIVE: 1, PROJECT_BLOCKED: -1, PROJECT_NOT_UNLOCKED: -2, PROJECT_NO_VIABLE_TARGETS: -3 };
  const bonuses = [
    { $hash: -44, CityStateBonusType: 'BONUS_CURRENT', Name: 'Current bonus', Description: '+10 science' },
    { $hash: 45, CityStateBonusType: 'BONUS_CHOICE', Name: 'New bonus', Description: '+5 culture' },
  ];
  const local = {
    civilizationFullName: 'Us', DiplomacyTreasury: { diplomacyBalance: 1500 }, Stats: { getNetYield: () => 15 },
    Diplomacy: { hasMet: id => [1, 2].includes(id) || (id === 4 && independentMet), isAtWarWith: () => false },
  };
  const actors = {
    0: local,
    1: { id: 1, isMajor: true, civilizationFullName: 'Known leader' },
    2: { id: 2, isMinor: true, isIndependent: false, civilizationFullName: 'Known city-state', Influence: { getSuzerain: () => suzerain }, getCityStateCityStateType: () => 'SCIENTIFIC' },
    4: { id: 4, isMinor: false, isIndependent: true, civilizationFullName: 'Vatican City', Influence: { getSuzerain: () => -1 }, getCityStateCityStateType: () => independentType },
  };
  const projects = target => target === 2 ? [
    { actionTypeName: 'DIPLOMACY_ACTION_CS_INCORPORATE', actionDisplayName: 'Incorporate', projectDescription: 'Become our town', projectStatus: 0,
      targetList1: [{ targetID: 2, costYieldD: 480, targetPlot: { x: 999, y: 999 }, resultData: {} }, { targetID: 3, costYieldD: 1 }], targetList2: [], resultData: {} },
    { actionTypeName: 'DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN', projectStatus: 1, projectDescription: 'UNRELATED_ACTIVE_PROJECT', targetList1: [{ targetID: 3 }], resultData: {} },
    { actionTypeName: 'DIPLOMACY_ACTION_RESEARCH_COLLABORATION', projectStatus: -1, resultData: {} },
    { actionTypeName: 'DIPLOMACY_ACTION_CS_LEVY_UNIT', actionDisplayName: 'Levy Unit', projectStatus: 0,
      targetList1: [{ targetID: 2, costYieldD: 0 }], targetList2: [{ parameterName: 'Unit', targetID: 99, costYieldD: 250, targetPlot: { x: 999, y: 999 } }], resultData: {} },
  ] : [
    { actionTypeName: 'DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN', actionDisplayName: 'Befriend', projectDescription: 'Improve relations', projectStatus: -3,
      targetList1: [{ targetID: 4, costYieldD: 680, resultData: { FailureReasons: ['Already running'] } }], targetList2: [], resultData: { FailureReasons: ['Already running'] } },
    {actionTypeName:'DIPLOMACY_ACTION_INCITE_RAID',actionType:100,operationType:'RAID',projectStatus:0,targetList1:[{targetID:4,costYieldD:0}],targetList2:[{parameterName:'Player3',targetID:1,costYieldD:40},{parameterName:'Player3',targetID:3,costYieldD:1}],resultData:{}},
  ];
  const ownEvent = { uniqueID: 9, initialPlayer: 0, targetPlayer: 4, actionTypeName: 'DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN', actionType: 99, name: 'Befriending', progressScore: 20, completionScore: 60, support: 2, gameTurnStart: 89, hidden: false, revealed: true, failed: false, gameTurnEnd: -1 };
  const result = vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    UI: { isInGame: () => inGame }, GameContext: { localPlayerID: playerId }, Locale: { compose: s => s },
    Players: {
      getAliveIds: () => [0, 1, 2, 3, 4], getAliveIndependentIds: () => [3, 4],
      get: id => { playerReads.push(id); assert.notEqual(id, 3, 'hidden players must not be inspected'); return actors[id]; },
    },
    GameInfo: { CityStateTypes: { lookup: type => ({
      SCIENTIFIC: { CityStateType: 'SCIENTIFIC', Name: 'Scientific' },
      MILITARISTIC: { CityStateType: 'MILITARISTIC', Name: 'Militaristic' },
    })[type] }, CityStateBonuses: bonuses },
    YieldTypes: { YIELD_DIPLOMACY: 1 },
    DiplomacyActionTargetTypes: { NO_DIPLOMACY_TARGET: -1 }, DiplomacyActionGroups: { NO_DIPLOMACY_ACTION_GROUP: -1 },
    DiplomacyProjectStatus: statuses,
    DiplomacyActionTypes: { DIPLOMACY_ACTION_GIVE_INFLUENCE_TOKEN: 99 },
    DiplomacyTokenTypes: { DIPLOMACY_TOKEN_GLOBAL: 'GLOBAL' },
    PlayerOperationTypes: { SUPPORT_DIPLOMATIC_ACTION: 'SUPPORT', CHOOSE_CITY_STATE_BONUS: 'BONUS' },
    Game: {
      turn: 99,
      IndependentPowers: { independentVillageDiscoveredByPlayer: (id, localId) => { assert.equal(localId, 0); return id === 4; }, getIndependentHostility: () => 'Friendly' },
      CityStates: {
        getCityStateBonusToSelect: () => pendingBonus, getBonusType: () => -44,
        canHaveBonus: (id, otherId, type) => { assert.equal(id, 0); assert.equal(otherId, 2); return type === 'BONUS_CHOICE'; },
      },
      Diplomacy: {
        getProjectDataForUI: (id, target) => { assert.equal(id, 0); projectReads.push(target); return projects(target); },
        getPlayerEvents: target => target === 4 ? [ownEvent,
          { ...ownEvent, uniqueID: 10, initialPlayer: 1, progressScore: 36, ...rival },
          { ...ownEvent, uniqueID: 11, targetPlayer: 2 },
          { ...ownEvent, uniqueID: 12, initialPlayer: 3, progressScore: 999999 },
        ] : [],
        getCompletionData: eventId => { completionReads.push(eventId); assert.ok([9, 10].includes(eventId)); return missingCompletion ? null : { requiredProgress: 60, turnsToCompletion: eventId === 9 ? 20 : 12, progressPerTurn: 2, stageTurnsToComplete: [-1, -1, eventId === 9 ? 13 : 5, eventId === 9 ? 20 : 12] }; },
        getStages: eventId => { assert.ok([9, 10].includes(eventId)); return [{requiredProgress: 0, stageToolTip: 'Hostile'}, {requiredProgress: 30, stageToolTip: 'Friendly'}, {requiredProgress: 45, stageToolTip: 'City-state'}, {requiredProgress: 60, stageToolTip: 'Suzerain'}]; },
        getInfluenceForNextSupport: (eventId, id, positive) => { assert.equal(eventId, 9); assert.equal(id, 0); assert.equal(positive, true); return 400; },
      },
      PlayerOperations: { canStart: (id, op, args, visible) => {
        assert.equal(id, 0); assert.equal(visible, false); operations.push({ op, args });
        return { Success: true };
      } },
    },
  });
  return { data: JSON.parse(JSON.stringify(result)), playerReads, projectReads, completionReads, operations };
}

test('only met or discovered powers are inspected, never hidden players or target coordinates', () => {
  const { data, playerReads, projectReads } = run();
  assert.deepEqual(data.powers.map(p => p.playerId), [2, 4]);
  assert.deepEqual(projectReads, [2, 4]);
  assert.ok(!playerReads.includes(3));
  assert.equal(data.powers[1].villageDiscovered, true);
  assert.ok(!JSON.stringify(data).includes('999'));
  assert.ok(!JSON.stringify(data).includes('UNRELATED_ACTIVE_PROJECT'));
  const raid=data.powers[1].actions.find(a=>a.id==='DIPLOMACY_ACTION_INCITE_RAID');
  assert.deepEqual(raid.secondaryPlayers.map(p=>p.playerId),[1]);assert.equal(raid.secondaryPlayers[0].quotedInfluenceCost,40);
});

test('reports suzerainty, selected bonus effects, and selected-target incorporation costs', () => {
  const data = run().data;
  assert.equal(data.influence.balance, 1500);
  assert.equal(data.influence.netPerTurn, 15);
  const state = data.powers[0];
  assert.equal(state.youAreSuzerain, true);
  assert.equal(state.suzerain.isLocal, true);
  assert.equal(state.bonus.description, '+10 science');
  assert.equal(state.actions[0].id, 'DIPLOMACY_ACTION_CS_INCORPORATE');
  assert.equal(state.actions[0].influenceCost, 480);
  assert.equal(state.actions[0].availableNow, true);
  assert.equal(run({ suzerain: 3 }).data.powers[0].suzerain, null);
});

test('reports native specialization for city-states and met or discovered independents, not from names', () => {
  for (const independentMet of [false, true]) {
    const { data } = run({ independentMet });
    assert.deepEqual(data.powers[0].type, { id: 'SCIENTIFIC', name: 'Scientific' });
    const independent = data.powers[1];
    assert.equal(independent.name, 'Vatican City');
    assert.deepEqual(independent.type, { id: 'MILITARISTIC', name: 'Militaristic' });
    assert.equal(independent.bonus, null);
    assert.deepEqual(independent.bonusChoices, []);
  }
});

test('unknown specialization remains null without guessing from the independent name', () => {
  assert.equal(run({ independentType: 'UNKNOWN' }).data.powers[1].type, null);
});

test('local ongoing befriending uses direct progress and includes support cost and eligibility', () => {
  const { data, completionReads, operations } = run();
  const events = data.powers[1].ongoingActions;
  assert.equal(events.length, 1);
  assert.equal(events[0].progress, 20);
  assert.equal(events[0].requiredProgress, 60);
  assert.equal(events[0].turnsRemaining, 20);
  assert.equal(events[0].supportAction.influenceCost, 400);
  assert.equal(events[0].supportAction.availableNow, true);
  assert.ok(completionReads.includes(9));
  assert.ok(operations.some(c => c.op === 'SUPPORT' && c.args.ID === 9 && c.args.Type === 'GLOBAL' && c.args.Amount === 1 && c.args.SubType === true));
  assert.equal(data.powers[1].actions[0].availableNow, false);
  assert.deepEqual(data.powers[1].actions[0].failureReasons, ['Already running']);
});

test('contested befriending exposes native revealed known rival progress and stage timings', () => {
  const {data} = run(), race = data.powers[1].befriendingRace;
  assert.equal(race.contested, true);
  assert.deepEqual(race.participants.map(p => [p.playerId, p.isLocal, p.progress, p.requiredProgress, p.progressPerTurn, p.turnsRemaining]),
    [[0, true, 20, 60, 2, 20], [1, false, 36, 60, 2, 12]]);
  assert.deepEqual(race.participants[1].stages[2], {requiredProgress: 45, turnsRemaining: 5, reached: false, description: 'City-state'});
  assert.equal(race.participants[1].stages[1].reached, true);
  assert.match(data.scope, /revealed.*befriending/i);
});

test('race omits hidden, unrevealed, failed, ended, wrong-target/type and unmet rival projects', () => {
  for (const rival of [{hidden: true}, {revealed: false}, {failed: true}, {gameTurnEnd: 99}, {targetPlayer: 2},
    {actionType: 123}, {initialPlayer: 3}]) {
    const {data, completionReads} = run({rival});
    assert.deepEqual(data.powers[1].befriendingRace.participants.map(p => p.playerId), [0]);
    assert.equal(data.powers[1].befriendingRace.contested, false);
    assert.ok(!completionReads.includes(10));
  }
});

test('missing native completion data stays unknown rather than manufacturing race ETAs', () => {
  const race = run({missingCompletion: true}).data.powers[1].befriendingRace;
  assert.equal(race.participants[1].turnsRemaining, null);
  assert.equal(race.participants[1].stages[2].turnsRemaining, null);
});

test('secondary-target actions do not treat placeholder costs as complete totals', () => {
  const levy = run().data.powers[0].actions.find(a => a.id === 'DIPLOMACY_ACTION_CS_LEVY_UNIT');
  assert.equal(levy.availableNow, true, 'the UI offers the target picker');
  assert.equal(levy.requiresSecondaryTarget, true);
  assert.equal(levy.selectedTargetInfluenceCost, 0);
  assert.equal(levy.influenceCost, null, 'a unit must be selected before the total cost is known');
});

test('bonus eligibility is not availability without a pending local choice and suzerainty', () => {
  const { data, operations } = run();
  assert.equal(data.pendingBonusSelection, 2);
  assert.equal(data.powers[0].bonusChoices[0].availableNow, true);
  assert.ok(operations.some(c => c.op === 'BONUS' && c.args.OtherPlayer === 2 && c.args.CityStateBonusType === 45));
  assert.equal(run({ pendingBonus: -1 }).data.powers[0].bonusChoices[0].availableNow, false);
  assert.equal(run({ suzerain: 1 }).data.powers[0].bonusChoices[0].availableNow, false);
  assert.equal(run({ pendingBonus: 3 }).data.pendingBonusSelection, null);
});

test('requires a loaded save and valid local player', () => {
  assert.throws(() => run({ inGame: false }), /Load a save first/);
  assert.throws(() => run({ playerId: -1 }), /No local player/);
});
