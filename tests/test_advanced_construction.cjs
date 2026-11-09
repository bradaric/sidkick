const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
function run(o = {}, script = 'advanced_construction.js') {
  const calls = [], intent = o.intent ?? 'wonder', old = {id: {owner: 0, id: 20, type: 2}, type: intent === 'repair' ? 100 : 200,
    complete: o.oldComplete ?? true, damaged: o.oldDamaged ?? intent === 'repair', location: {x: 3, y: 3}};
  const assets = ['repair', 'overbuild'].includes(intent) || o.replaceImprovement ? [old] : [];
  const records = assets.map(c => ({owner: 0, instanceId: c.id.id, componentType: 2, type: c.type, complete: c.complete, damaged: c.damaged}));
  const def = {ConstructibleType: 'CONSTRUCTIBLE_TEST', ConstructibleClass: intent === 'wonder' ? 'WONDER' : intent === 'improvement' ? 'IMPROVEMENT' : 'BUILDING', $hash: 100, Repairable: true};
  const oldDef = {ConstructibleType: 'OLD', ConstructibleClass: o.oldClass ?? (o.replaceImprovement ? 'IMPROVEMENT' : 'BUILDING'), $hash: 200, $index: 2};
  const constructibles = Object.assign([def, oldDef], {
    // Native preview IDs are definition indices, not the hashes used for construction.
    lookup: key => key === 'CONSTRUCTIBLE_TEST' || key === 100 ? def : key === 'OLD' || key === 200 ? oldDef : null,
  });
  const queue = Object.hasOwn(o, 'queue') ? o.queue : o.applied ? [{type: 100, location: {x: 3, y: 3}}] : [];
  const city = {id: {owner: 0, id: 7, type: 1}, name: 'Home', isTown: Boolean(o.town), BuildQueue: {getQueue: () => queue},
    Yields: {calculateAllBuildingsPlacements: () => ({buildings: [{constructibleType: 100, placements: [{plotID: 33, overbuiltConstructibleID: o.previous ?? (intent === 'overbuild' || o.replaceImprovement ? 2 : -1)}]}]})}};
  let tileOwner = o.foreign ? 1 : o.unowned ? -1 : 0;
  let tileCity = Object.hasOwn(o, 'tileCity') ? o.tileCity : o.unassigned ? {owner: -1, id: -1, type: 0} : city.id;
  const ctx = {queryArguments: {settlement: 'Home', item: 'CONSTRUCTIBLE_TEST', construction_intent: intent, target_token: JSON.stringify(records), x: 3, y: 3,
      expected_turn: 62, mode: 'append', city_id: 7, baseline_queue: [], baseline_asset_ids: [], ...o.args}, UI: {isInGame: () => true},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)}, Locale: {compose: s => s},
    Players: {get: () => ({isTurnActive: !o.inactive, Cities: {getCities: () => [city]}})},
    GameInfo: {Constructibles: constructibles, Units: {lookup: () => null}, Projects: {lookup: () => null}},
    MapConstructibles: {getConstructibles: () => o.unavailableTile ? null : assets.map(c => c.id)}, Constructibles: {getByComponentID: () => old},
    MapCities: {getCity: () => tileCity}, GameplayMap: {getIndexFromLocation: l => l.x + l.y * 10, getLocationFromIndex: () => ({x: 3, y: 3}),
      getOwner: () => tileOwner, getRevealedState: () => o.hidden ? 0 : 2}, RevealedStates: {VISIBLE: 2}, PlayerIds: o.noPlayerIds ? undefined : {NO_PLAYER: -1},
    CityOperationTypes: {BUILD: 10}, CityOperationsParametersValues: {Append: 20},
    Game: {turn: 62, age: 42, CityOperations: {canStart: (id, operation, args, exclusion) => {calls.push({kind: 'check', id, operation, args, exclusion});
      if (o.changed || o.changedGeneral && args.X == null) ctx.Game.turn++; if (o.changedTarget) old.damaged = false;
      if (args.X != null) {
        if (o.changedOwner) tileOwner = tileOwner === 0 ? -1 : 0;
        if (o.changedAssignment) tileCity = city.id;
        if (o.addedAsset) assets.push(old);
        if (o.changedQueue) queue.push({type: 200});
        if (o.changedOld) old.damaged = true;
      }
      return {Success: !o.blocked && !(o.blockedSelected && args.X != null),
        Plots: o.notOffered || o.expansion ? [] : [33], ExpandUrbanPlots: !o.notOffered && o.expansion ? [33] : [],
        RepairDamaged: intent === 'repair', RequiresConfirmation: Boolean(o.confirm)};},
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

test('an ordinary building can explicitly replace a rural improvement through overbuild intent', () => {
  const {data, calls} = run({intent: 'overbuild', replaceImprovement: true, expansion: true,
    args: {replace_improvement: true}});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.filter(c => c.kind === 'send').map(c => c.args),
    [{ConstructibleType: 100, X: 3, Y: 3, InsertMode: 20}]);
  assert.equal(data.before.tile[0].type, 200, 'bind the old improvement hash, not its preview index');
  assert.equal(data.verificationArguments.construction_intent, 'overbuild');
  assert.equal(run({intent: 'overbuild', replaceImprovement: true, args: {replace_improvement: true}, applied: true},
    'city_construction_state.js').data.queueAppendObserved, true);
});

test('building rural replacement never bypasses acknowledgement, tile binding or native checks', () => {
  const base = {intent: 'overbuild', replaceImprovement: true, expansion: true, args: {replace_improvement: true}};
  for (const extra of [{args: {replace_improvement: false}}, {oldClass: 'BUILDING'}, {oldClass: 'WONDER'},
    {oldDamaged: true}, {oldComplete: false}, {previous: 999}, {args: {target_token: 'stale'}},
    {foreign: true}, {hidden: true}, {town: true}, {unassigned: true},
    {tileCity: {owner: 0, id: 8, type: 1}}, {blocked: true}, {blockedSelected: true}, {notOffered: true},
    {confirm: true}, {changedOwner: true}, {changedOld: true}, {changedQueue: true}]) {
    const {data, calls} = run({...base, ...extra, args: {...base.args, ...extra.args}});
    assert.equal(data.status, 'rejected', JSON.stringify(extra));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
});

test('empty unassigned wonder/improvement sites require exact native urban-expansion permission', () => {
  for (const intent of ['wonder', 'improvement']) {
    for (const unowned of [false, true]) {
      for (const tileCity of [null, {owner: -1, id: -1, type: 0}]) {
        const {data, calls} = run({intent, unowned, tileCity, expansion: true});
        assert.equal(data.status, 'submitted', JSON.stringify({intent, unowned, tileCity}));
        assert.deepEqual(calls.filter(c => c.kind === 'check').map(c => c.args),
          [{ConstructibleType: 100, InsertMode: 20}, {ConstructibleType: 100, X: 3, Y: 3, InsertMode: 20}]);
        assert.deepEqual(calls.filter(c => c.kind === 'send').map(c => c.args),
          [{ConstructibleType: 100, X: 3, Y: 3, InsertMode: 20}]);
      }
    }
  }
});

test('expansion never bypasses ownership, visibility, native permission or exact empty-tile evidence', () => {
  const base = {unassigned: true, unowned: true, expansion: true};
  for (const extra of [{foreign: true}, {hidden: true}, {tileCity: {owner: 1, id: 8, type: 1}},
    {unowned: false, tileCity: {owner: 0, id: 8, type: 1}}, {tileCity: {owner: 0, id: 7, type: 1}},
    {tileCity: {}}, {tileCity: undefined}, {noPlayerIds: true},
    {expansion: false}, {notOffered: true}, {blocked: true}, {blockedSelected: true}, {confirm: true},
    {replaceImprovement: true, args: {replace_improvement: true}}, {intent: 'repair'}, {intent: 'overbuild'},
    {unavailableTile: true}, {args: {target_token: 'stale'}}, {changed: true}, {changedOwner: true},
    {unowned: false, changedOwner: true}, {changedAssignment: true}, {addedAsset: true}, {changedQueue: true}]) {
    const {data, calls} = run({...base, ...extra});
    assert.equal(data.status, 'rejected', JSON.stringify(extra));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
});

test('tile ownership, unavailable ledger, stale token and queue failures have distinct diagnostics', () => {
  for (const [options, reason] of [[{foreign: true}, /ownership|assigned|placement tile/i],
    [{unavailableTile: true}, /tile.*(unavailable|invalid)/i],
    [{args: {target_token: 'stale'}}, /token.*stale/i],
    [{queue: null}, /queue.*unavailable/i], [{queue: Array(64).fill({type: 200})}, /queue.*full/i]]) {
    const {data, calls} = run(options);
    assert.equal(data.status, 'rejected');
    assert.match(data.reason, reason);
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
});
