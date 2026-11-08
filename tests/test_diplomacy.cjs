const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run(o={}) {
  const projects = [
    { actionTypeName: 'BORDERS', projectStatus: 0, targetList1: [{ targetID: 1, costYieldD: 40 }, { targetID: 2, costYieldD: 1, targetPlot: { x: 999, y: 999 } }] },
    { actionTypeName: 'WAR', projectStatus: 0, targetList1: [{ targetID: 1, costYieldD: 0 }] },
    { actionTypeName: 'BLOCKED_TARGET', projectStatus: 0, resultData: { FailureReasons: ['Blocked'] }, targetList1: [{ targetID: 1, costYieldD: 70, resultData: { FailureReasons: ['Blocked', 'Need friendship'] } }] },
    { actionTypeName: 'SECONDARY', projectStatus: 0, targetList1: [{ targetID: 1, costYieldD: 0 }], targetList2: [{ targetID: 2, costYieldD: 500, targetPlot: { x: 999, y: 999 } }] },
    { actionTypeName: 'NO_TARGET', projectStatus: 0, targetList1: [{ targetID: 2, costYieldD: 1 }] },
    { actionTypeName: 'NO_COST', projectStatus: 0, targetList1: [{ targetID: 1 }] },
    { actionTypeName: 'UNLOCKED_LATER', projectStatus: -2 },
    { actionTypeName: 'ACTIVE', projectStatus: 1 },
  ];
  const local = {
    Diplomacy: {
      hasMet: id => id === 1, getRelationshipLevelName: () => 'Friendly', getRelationshipLevel: () => 2,
      getRelationshipEnum: () => 2, isAtWarWith: () => Boolean(o.war), hasAllied: () => false, getPlayerRelationshipHistory: () => [],
    }, Stats: { getNetYield: () => 10 },
  };
  return JSON.parse(JSON.stringify(vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/diplomacy.js'), 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    Players: { getAliveIds: () => [0, 1, 2], get: id => { assert.notEqual(id, 2, 'unmet players are not inspected'); return id === 0 ? local : { isMajor: true, civilizationFullName: 'Known', leaderType: 'LEADER' }; } },
    GameInfo: { Leaders: { lookup: () => ({ Name: 'Leader' }) } },
    DiplomacyActionTargetTypes: { NO_DIPLOMACY_TARGET: -1 }, DiplomacyActionGroups: { NO_DIPLOMACY_ACTION_GROUP: -1 },
    DiplomacyProjectStatus: { PROJECT_AVAILABLE: 0, PROJECT_ACTIVE: 1, PROJECT_BLOCKED: -1, PROJECT_NOT_UNLOCKED: -2 },
    YieldTypes: { YIELD_DIPLOMACY: 1 },
    PlayerOperationTypes:{SUPPORT_DIPLOMATIC_ACTION:900},DiplomacyTokenTypes:{DIPLOMACY_TOKEN_GLOBAL:200},
    Game: { turn: 108,
      Diplomacy: {getInfluenceForNextSupport:()=>180,getNumSupportEnvoysForPlayer:()=>0,getNumOpposeEnvoysForPlayer:()=>0,getCompletionData:()=>({}), getProjectDataForUI: (id, target) => { assert.equal(id, 0); assert.equal(target, 1); return projects; }, getPlayerEvents: () => o.war?[{uniqueID:78,initialPlayer:0,targetPlayer:1,actionTypeName:'DIPLOMACY_ACTION_DECLARE_WAR',actionType:100,revealed:true,hidden:false,failed:false,gameTurnEnd:-1}]:[] },
      PlayerOperations:{canStart:()=>({Success:false,FailureReasons:['Insufficient Influence']})},
      DiplomacyDeals: { hasPendingDeal: () => false, getDealIds: () => [] },
    },
  })));
}

test('major diplomacy reads selected-player costs from targetList1 and preserves zero-cost actions', () => {
  const actions = run().majorPlayers[0].availableActions;
  assert.equal(actions[0].influenceCost, 40);
  assert.equal(actions[0].targetChoices, 1);
  assert.equal(actions[1].influenceCost, 0);
  assert.equal(actions[1].available, true);
  assert.ok(!actions.some(a => ['UNLOCKED_LATER', 'ACTIVE'].includes(a.id)));
});
test('own ongoing war exposes native next-support cost and exact side without writing or assuming affordability',()=>{
 const s=run({war:true}).majorPlayers[0].ongoingActions[0].ownWarSupport;
 assert.equal(s.quotedInfluenceCost,180);assert.equal(s.side,'initial');assert.equal(s.availableNow,false);assert.equal(s.ownTokens,0);
});

test('selected-target failure reasons and missing targets prevent false availability', () => {
  const actions = run().majorPlayers[0].availableActions;
  assert.equal(actions[2].available, false);
  assert.deepEqual(actions[2].failureReasons, ['Blocked', 'Need friendship']);
  assert.equal(actions.find(a => a.id === 'NO_TARGET').available, false);
  assert.equal(actions.find(a => a.id === 'NO_COST').influenceCost, null);
});

test('secondary target costs are incomplete and foreign target counts/coordinates are not exposed', () => {
  const data = run();
  const secondary = data.majorPlayers[0].availableActions.find(a => a.id === 'SECONDARY');
  assert.equal(secondary.requiresSecondaryTarget, true);
  assert.equal(secondary.selectedTargetInfluenceCost, 0);
  assert.equal(secondary.influenceCost, null);
  assert.equal(secondary.secondaryTargetChoices, null);
  assert.ok(!JSON.stringify(data).includes('999'));
});
