const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'choose_narrative.js') {
  const calls = [], id = {owner: o.foreign ? 1 : 0, id: 15, type: 30};
  const story = {type: 100};
  const root = {NarrativeStoryType: 'STORY_TEST', UIActivation: o.trial ? 'TRIAL' : 'SYSTEMIC', VariableLinks: o.variable ?? false};
  const option = {NarrativeStoryType: 'STORY_TEST_CHOICE', Activation: o.requisite ? 'LINKED_REQUISITE' : 'LINKED', Cost: o.cost ?? 0,CostYield:o.costYield??'YIELD_GOLD'};
  const pending = () => o.notPending ? [] : [id];
  const stories = {getPendingMetIds: pending, getFirstPendingMetId: () => o.notPending ? null : id,
    getFirstPendingDiscoveryLastMetID: () => o.trial&&!o.notPending?id:null, find: () => story,
    getOrderedLinks: () => o.noLinks ? [] : [200], determineRequisiteLink: () => !o.failedRequisite,
    canAfford: () => !o.unaffordable};
  const lookup = value => [100, 'STORY_TEST'].includes(value) ? root :
    [200, 'STORY_TEST_CHOICE'].includes(value) ? option : null;
  const context = {queryArguments: {instance_id: 15, instance_type: 30, choice: 'STORY_TEST_CHOICE', expected_turn: 60,
      story_type: 'STORY_TEST', ...o.args}, UI: {isInGame: () => !o.notInGame},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sent ?? false},
    Players: {get: () => ({isTurnActive: !o.inactive, Stories: stories,Treasury:{goldBalance:o.balance??1000},DiplomacyTreasury:{diplomacyBalance:100}})},
    GameInfo: {NarrativeStories: {lookup}, NarrativeStory_Links: {
      filter: predicate => (o.noLinks ? [] : [{FromNarrativeStoryType: 'STORY_TEST', ToNarrativeStoryType: 'STORY_TEST_CHOICE'}]).filter(predicate)}},
    PlayerOperationTypes: {CHOOSE_NARRATIVE_STORY_DIRECTION: 900}, PlayerOperationParameters: {Activate: 1},
    Game: {turn: 60, age: 42, PlayerOperations: {canStart: (player, type, args, exclusion) => {
      calls.push({kind: 'check', player, type, args, exclusion});
      if (o.changed) context.Game.turn++;
      if (o.changedStory) story.type = 200;
      return {Success: !o.blocked,RequiresConfirmation:Boolean(o.confirm),...(o.quote!==undefined?{Cost:o.quote}:{})};
    }, sendRequest: (player, type, args) => {calls.push({kind: 'send', player, type, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('narrative submits one exact owned pending instance and a zero-cost offered linked choice', () => {
  for (const variable of [false, true]) {
    const {data, calls} = run({variable});
    assert.equal(data.status, 'submitted');
    assert.deepEqual(calls.at(-1), {kind: 'send', player: 0, type: 900,
      args: {TargetType: 'STORY_TEST_CHOICE', Target: {owner: 0, id: 15, type: 30}, Action: 1}});
    assert.equal(data.expected.resolved, true);
    assert.equal(data.verificationArguments.story_type, 'STORY_TEST');
  }
});

test('extended narrative handles exact trial head and paid choices only with an actual native quote under the acknowledged currency cap',()=>{
 assert.equal(run({trial:true,args:{extended:true,allow_trial:true,max_cost:0}}).data.status,'submitted');
 const opts={cost:50,quote:60,args:{extended:true,max_cost:60,cost_yield:'YIELD_GOLD'}};
 const r=run(opts);assert.equal(r.data.status,'submitted');assert.equal(r.data.quotedCost,60);
 for(const o of [{quote:undefined},{quote:61},{unaffordable:true},{confirm:true},{costYield:'YIELD_UNKNOWN'},{args:{extended:true,max_cost:60,cost_yield:'YIELD_DIPLOMACY'}}]){
  const r=run({...opts,...o});assert.equal(r.data.status,'rejected');assert.equal(r.calls.filter(c=>c.kind==='send').length,0);
 }
 assert.equal(run({trial:true,args:{extended:true,allow_trial:false,max_cost:0}}).data.status,'rejected');
 assert.equal(run({confirm:true}).data.status,'rejected');
});

test('CLOSE is offered only when there are no eligible links, not when choices are unaffordable', () => {
  assert.equal(run({noLinks: true, args: {choice: 'CLOSE'}}).data.status, 'submitted');
  assert.equal(run({requisite: true, failedRequisite: true, args: {choice: 'CLOSE'}}).data.status, 'submitted');
  for (const o of [{args: {choice: 'CLOSE'}}, {cost: 1, args: {choice: 'CLOSE'}}, {cost: 1},
    {requisite: true, failedRequisite: true}, {args: {choice: 'UNRELATED_STORY'}}]) {
    assert.equal(run(o).data.status, 'rejected', JSON.stringify(o));
  }
});

test('narrative rejects unowned, nonpending, trial, stale, changed or native-blocked choices without submission', () => {
  for (const o of [{foreign: true}, {notPending: true}, {trial: true}, {inactive: true}, {sent: true}, {notInGame: true},
    {blocked: true}, {changed: true}, {changedStory: true}, {args: {instance_id: true}}, {args: {instance_type: 31}},
    {args: {expected_turn: 59}}]) {
    const {data, calls} = run(o);
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});

test('narrative readback only verifies the captured instance leaves the pending queue, not promised rewards', () => {
  for (const notPending of [false, true]) {
    const {data, calls} = run({notPending}, 'narrative_state.js');
    assert.equal(data.resolved, notPending);
    assert.equal(data.instanceId, 15);
    assert.equal(data.instanceType, 30);
    assert.equal(calls.length, 0);
  }
  const args={cost_yield:'YIELD_GOLD',before_balance:1000,max_cost:50};
  assert.equal(run({notPending:true,balance:960,args},'narrative_state.js').data.netSpendWithinCap,true);
  assert.equal(run({notPending:true,balance:900,args},'narrative_state.js').data.netSpendWithinCap,false);
});
