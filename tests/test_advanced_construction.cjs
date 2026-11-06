const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
function run(o = {}, script = 'advanced_construction.js') {
  const calls = [], intent = o.intent ?? 'wonder', old = {id: {owner: 0, id: 20, type: 2}, type: intent === 'repair' ? 100 : 200,
    complete: true, damaged: intent === 'repair', location: {x: 3, y: 3}};
  const assets = ['repair', 'overbuild'].includes(intent) || o.replaceImprovement ? [old] : [];
  const records = assets.map(c => ({owner: 0, instanceId: c.id.id, componentType: 2, type: c.type, complete: true, damaged: c.damaged}));
  const def = {ConstructibleType: 'CONSTRUCTIBLE_TEST', ConstructibleClass: intent === 'wonder' ? 'WONDER' : intent === 'improvement' ? 'IMPROVEMENT' : 'BUILDING', $hash: 100, Repairable: true};
  const city = {id: {owner: 0, id: 7, type: 1}, name: 'Home', isTown: Boolean(o.town), BuildQueue: {getQueue: () => o.applied ? [{type: 100, location: {x: 3, y: 3}}] : []},
    Yields: {calculateAllBuildingsPlacements: () => ({buildings: [{constructibleType: 100, placements: [{plotID: 33, overbuiltConstructibleID: intent === 'overbuild' || o.replaceImprovement ? 2 : -1}]}]})}};
  const ctx = {queryArguments: {settlement: 'Home', item: 'CONSTRUCTIBLE_TEST', construction_intent: intent, target_token: JSON.stringify(records), x: 3, y: 3,
      expected_turn: 62, mode: 'append', city_id: 7, baseline_queue: [], baseline_asset_ids: [], ...o.args}, UI: {isInGame: () => true},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)}, Locale: {compose: s => s},
    Players: {get: () => ({isTurnActive: !o.inactive, Cities: {getCities: () => [city]}})},
    GameInfo: {Constructibles: {lookup: key => key === 2 || key === 200 ? {ConstructibleType: 'OLD', ConstructibleClass: o.replaceImprovement ? 'IMPROVEMENT' : 'BUILDING', $hash: 200} : def}, Units: {lookup: () => null}, Projects: {lookup: () => null}},
    MapConstructibles: {getConstructibles: () => assets.map(c => c.id)}, Constructibles: {getByComponentID: () => old},
    MapCities: {getCity: () => city.id}, GameplayMap: {getIndexFromLocation: l => l.x + l.y * 10, getLocationFromIndex: () => ({x: 3, y: 3}),
      getOwner: () => o.foreign ? 1 : 0, getRevealedState: () => o.hidden ? 0 : 2}, RevealedStates: {VISIBLE: 2},
    CityOperationTypes: {BUILD: 10}, CityOperationsParametersValues: {Append: 20},
    Game: {turn: 62, age: 42, CityOperations: {canStart: (id, operation, args, exclusion) => {calls.push({kind: 'check', id, operation, args, exclusion});
      if (o.changed || o.changedGeneral && args.X == null) ctx.Game.turn++; if (o.changedTarget) old.damaged = false;
      return {Success: !o.blocked, Plots: o.notOffered ? [] : [33], RepairDamaged: intent === 'repair', RequiresConfirmation: Boolean(o.confirm)};},
      sendRequest: (id, operation, args) => {calls.push({kind: 'send', id, operation, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data; try {data = vm.runInNewContext(fs.readFileSync(`civ7/${script}`, 'utf8'), ctx);} catch(e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}
test('advanced append binds explicit wonder/repair/overbuild/improvement intent and native tile permission', () => {
  for (const intent of ['wonder', 'repair', 'overbuild', 'improvement']) {
    const {data, calls} = run({intent}); assert.equal(data.status, 'submitted', intent);
    assert.deepEqual(calls.at(-1).args, {ConstructibleType: 100, X: 3, Y: 3, InsertMode: 20});
    assert.equal(run({intent, applied: true}, 'city_construction_state.js').data.queueAppendObserved, true);
  }
});
test('advanced append rejects stale tile token, wrong intent/owner, hidden/town and native/stale context', () => {
  for (const o of [{town: true}, {foreign: true}, {hidden: true}, {sent: true}, {inactive: true}, {changed: true}, {changedGeneral: true}, {blocked: true}, {notOffered: true}, {confirm: true},
    {intent: 'repair', changedTarget: true}, {args: {target_token: 'stale'}}, {args: {construction_intent: 'raw'}}, {args: {expected_turn: 61}}]) {
    const {data, calls} = run(o); assert.equal(data.status, 'rejected', JSON.stringify(o)); assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});
test('wonder/unique-improvement rural replacement must be explicitly acknowledged and bind the exact old improvement', () => {
  for (const intent of ['wonder', 'improvement']) {
    assert.equal(run({intent, replaceImprovement: true}).data.status, 'rejected');
    assert.equal(run({intent, replaceImprovement: true, args: {replace_improvement: true}}).data.status, 'submitted');
  }
});
