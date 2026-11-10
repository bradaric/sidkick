const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
function run(o = {}, script = 'advanced_construction.js') {
  const calls = [], intent = o.intent ?? 'wonder', old = {id: {owner: 0, id: 20, type: 2}, type: intent === 'repair' ? 100 : 200,
    complete: o.oldComplete ?? true, damaged: o.oldDamaged ?? intent === 'repair', location: {x: 3, y: 3}, ...o.old};
  const assets = [...(['repair', 'overbuild'].includes(intent) || o.replaceImprovement ? [old] : []), ...(o.extraAssets ?? [])];
  const records = assets.map(c => ({owner: c.id.owner, instanceId: c.id.id, componentType: c.id.type, type: c.type, complete: c.complete, damaged: c.damaged}))
    .sort((a, b) => a.instanceId - b.instanceId || a.componentType - b.componentType);
  const def = {ConstructibleType: 'CONSTRUCTIBLE_TEST', ConstructibleClass: o.constructibleClass ?? (intent === 'wonder' ? 'WONDER' : intent === 'improvement' ? 'IMPROVEMENT' : 'BUILDING'), $hash: 100, Repairable: o.repairable ?? true};
  const oldDef = {ConstructibleType: 'OLD', ConstructibleClass: o.oldClass ?? (o.replaceImprovement ? 'IMPROVEMENT' : 'BUILDING'), $hash: 200, $index: 2};
  const constructibles = Object.assign([def, oldDef], {
    // Native preview IDs are definition indices, not the hashes used for construction.
    lookup: key => key === 'CONSTRUCTIBLE_TEST' || key === 100 ? def : key === 'OLD' || key === 200 ? oldDef : null,
  });
  const queue = Object.hasOwn(o, 'queue') ? o.queue : o.applied ? [{type: 100, location: {x: 3, y: 3}}] : [];
  const city = {id: {owner: 0, id: 7, type: 1}, name: 'Home', isTown: Boolean(o.town), BuildQueue: {getQueue: () => queue},
    Gold: o.noGold ? undefined : {getBuildingPurchaseCost: (yieldType, item) => {
      calls.push({kind: 'quote', yieldType, item});
      if (o.quoteChangesGold) player.Treasury.goldBalance = 0;
      if (o.quoteChangesTarget) old.damaged = false;
      return o.fallbackCost;
    }},
    Yields: {calculateAllBuildingsPlacements: () => ({buildings: [{constructibleType: 100, placements: [{plotID: 33, overbuiltConstructibleID: o.previous ?? (intent === 'overbuild' || o.replaceImprovement ? 2 : -1)}]}]})}};
  let tileOwner = o.foreign ? 1 : o.unowned ? -1 : 0;
  let tileCity = Object.hasOwn(o, 'tileCity') ? o.tileCity : o.unassigned ? {owner: -1, id: -1, type: 0} : city.id;
  const player = {isTurnActive: !o.inactive, Cities: {getCities: () => [city]}, Treasury: {goldBalance: o.gold ?? 1000}};
  const native = {canStart: (id, operation, args, exclusion) => {calls.push({kind: 'check', id, operation, args, exclusion});
      if (o.changed || o.changedGeneral && args.X == null) ctx.Game.turn++; if (o.changedTarget) old.damaged = false;
      if (args.X != null) {
        if (o.changedOwner) tileOwner = tileOwner === 0 ? -1 : 0;
        if (o.changedAssignment) tileCity = city.id;
        if (o.addedAsset) assets.push(old);
        if (o.changedQueue) queue.push({type: 200});
        if (o.changedOld) old.damaged = true;
        if (o.changedGold) player.Treasury.goldBalance = 0;
      }
      return {Success: !o.blocked && !(o.blockedSelected && args.X != null), Cost: 120,
        Plots: o.notOffered || o.expansion ? [] : [33], ExpandUrbanPlots: !o.notOffered && o.expansion ? [33] : [],
        RepairDamaged: intent === 'repair', RequiresConfirmation: Boolean(o.confirm),
        ...(args.X == null ? o.generalResult : o.selectedResult)};},
    sendRequest: (id, operation, args) => {calls.push({kind: 'send', id, operation, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}};
  const ctx = {queryArguments: {settlement: 'Home', item: 'CONSTRUCTIBLE_TEST', construction_intent: intent, target_token: JSON.stringify(records), x: 3, y: 3,
      expected_turn: 62, mode: 'append', city_id: 7, baseline_queue: [], baseline_asset_ids: [], ...o.args}, UI: {isInGame: () => true},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)}, Locale: {compose: s => s},
    Players: {get: () => player},
    GameInfo: {Constructibles: constructibles, Units: {lookup: () => null}, Projects: {lookup: () => null}},
    MapConstructibles: {getConstructibles: () => o.unavailableTile ? null : assets.map(c => c.id)}, Constructibles: {getByComponentID: id => assets.find(c => JSON.stringify(c.id) === JSON.stringify(id))},
    MapCities: {getCity: () => tileCity}, GameplayMap: {getIndexFromLocation: l => l.x + l.y * 10, getLocationFromIndex: () => ({x: 3, y: 3}),
      getOwner: () => tileOwner, getRevealedState: () => o.hidden ? 0 : 2}, RevealedStates: {VISIBLE: 2}, PlayerIds: o.noPlayerIds ? undefined : {NO_PLAYER: -1},
    CityOperationTypes: {BUILD: 10}, CityOperationsParametersValues: {Append: 20}, CityCommandTypes: {PURCHASE: 30}, YieldTypes: {YIELD_GOLD: 77},
    Game: {turn: 62, age: 42, CityOperations: native, CityCommands: native}};
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

const repairPurchase = {intent: 'repair', args: {mode: 'purchase', max_gold_cost: 120}};
test('repair purchases use the native UI price getter when canStart omits Cost', () => {
  for (const missing of [undefined, null]) {
    const {data, calls} = run({...repairPurchase, constructibleClass: 'IMPROVEMENT', gold: 795.66796875,
      generalResult: {Cost: missing}, selectedResult: {Cost: missing}, fallbackCost: 24,
      args: {mode: 'purchase', max_gold_cost: 24}});
    assert.equal(data.status, 'submitted');
    assert.equal(data.quotedGoldCost, 24);
    assert.deepEqual(calls.filter(c => c.kind === 'quote'), [{kind: 'quote', yieldType: 77, item: 'CONSTRUCTIBLE_TEST'}]);
    assert.equal(calls.filter(c => c.kind === 'send').length, 1);
    assert.equal(data.expected.repairObserved, true);
  }
  for (const fallbackCost of [0, 23.5]) {
    const {data} = run({...repairPurchase, selectedResult: {Cost: undefined}, fallbackCost,
      gold: fallbackCost, args: {mode: 'purchase', max_gold_cost: fallbackCost}});
    assert.equal(data.status, 'submitted');
    assert.equal(data.quotedGoldCost, fallbackCost);
  }
});

test('fallback repair prices cannot bypass budget, missing/invalid quotes or changed state', () => {
  for (const extra of [{fallbackCost: undefined}, {fallbackCost: null}, {fallbackCost: NaN},
    {fallbackCost: Infinity}, {fallbackCost: -1}, {fallbackCost: '24'}, {fallbackCost: true}, {noGold: true},
    {fallbackCost: 120.01}, {gold: 23}, {quoteChangesGold: true}, {quoteChangesTarget: true}]) {
    const {data, calls} = run({...repairPurchase, generalResult: {Cost: 1}, selectedResult: {Cost: undefined},
      fallbackCost: 24, ...extra});
    assert.equal(data.status, 'rejected', JSON.stringify(extra));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
});

test('explicit selected repair Cost takes precedence, including zero and invalid values', () => {
  for (const cost of [0, 23.5, 121, -1, NaN, Infinity, '24', true]) {
    const {data, calls} = run({...repairPurchase, selectedResult: {Cost: cost}, fallbackCost: 24});
    assert.equal(data.status, cost === 0 || cost === 23.5 ? 'submitted' : 'rejected');
    assert.equal(calls.filter(c => c.kind === 'quote').length, 0);
  }
});

test('repair purchases use one exact native command and selected-tile cost, including towns and repairable classes', () => {
  for (const constructibleClass of ['BUILDING', 'IMPROVEMENT', 'WONDER']) {
    for (const town of [false, true]) {
      const {data, calls} = run({...repairPurchase, constructibleClass, town,
        generalResult: {Cost: 999}, selectedResult: {Cost: 119.5, Plots: undefined}});
      assert.equal(data.status, 'submitted');
      assert.equal(data.quotedGoldCost, 119.5);
      assert.deepEqual(calls.filter(c => c.kind === 'send'), [{kind: 'send', id: {owner: 0, id: 7, type: 1},
        operation: 30, args: {ConstructibleType: 100, X: 3, Y: 3}}]);
      assert.equal(data.expected.repairObserved, true);
      assert.equal(data.verificationArguments.baseline_tile[0].damaged, true);
      assert.deepEqual(data.verificationArguments.baseline_queue, []);
    }
  }
  assert.equal(run({...repairPurchase, selectedResult: {Cost: 0}, gold: 0,
    args: {mode: 'purchase', max_gold_cost: 0}}).data.status, 'submitted');
});

test('repair purchases fail closed on target, native, budget and context changes without submitting', () => {
  for (const extra of [{foreign: true}, {hidden: true}, {unassigned: true}, {unavailableTile: true},
    {oldDamaged: false}, {oldComplete: false}, {repairable: false}, {constructibleClass: 'UNKNOWN'},
    {args: {target_token: 'stale'}}, {args: {expected_turn: 61}}, {args: {x: true}},
    {args: {max_gold_cost: -1}}, {args: {max_gold_cost: true}}, {args: {max_gold_cost: Infinity}},
    {args: {mode: 'other'}}, {intent: 'wonder'}, {args: {replace_improvement: true}},
    {selectedResult: {Cost: 121}}, {selectedResult: {Cost: undefined}}, {selectedResult: {Cost: NaN}},
    {selectedResult: {Cost: -1}}, {gold: 119}, {blocked: true}, {blockedSelected: true},
    {notOffered: true}, {confirm: true}, {generalResult: {RepairDamaged: false}},
    {generalResult: {InQueue: true}}, {selectedResult: {InProgress: true}},
    {selectedResult: {InsufficientFunds: true}}, {selectedResult: {RequiresConfirmation: true}},
    {sent: true}, {inactive: true}, {changed: true}, {changedGold: true}, {changedTarget: true},
    {changedOwner: true}, {changedQueue: true}, {addedAsset: true}]) {
    const {data, calls} = run({...repairPurchase, ...extra, args: {...repairPurchase.args, ...extra.args}});
    assert.equal(data.status, 'rejected', JSON.stringify(extra));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({...repairPurchase, sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});

test('repair readback proves the same damaged instance became intact, not Gold loss, replacement or queue edits', () => {
  const submitted = run(repairPurchase).data;
  assert.equal(submitted.status, 'submitted');
  const read = extra => run({intent: 'repair', oldDamaged: false, ...extra,
    args: submitted.verificationArguments}, 'city_construction_state.js');
  assert.equal(read({}).data.repairObserved, true);
  assert.equal(read({}).calls.length, 0);
  for (const extra of [{oldDamaged: true, gold: 880}, {oldComplete: false}, {queue: [{type: 200}]},
    {old: {id: {owner: 0, id: 21, type: 2}}}, {old: {type: 200}}, {foreign: true},
    {old: {location: {x: 4, y: 3}}}, {unassigned: true}, {hidden: true}]) {
    assert.equal(read(extra).data.repairObserved, false, JSON.stringify(extra));
  }
});

test('repair purchase binds the whole tile but repairs only one exact instance', () => {
  const other = {id: {owner: 0, id: 21, type: 2}, type: 200, complete: true, damaged: true, location: {x: 3, y: 3}};
  const submitted = run({...repairPurchase, extraAssets: [other]}).data;
  assert.equal(submitted.status, 'submitted');
  const read = extraAssets => run({intent: 'repair', oldDamaged: false, extraAssets,
    args: submitted.verificationArguments}, 'city_construction_state.js').data;
  assert.equal(read([other]).repairObserved, true);
  for (const assets of [[], [{...other, damaged: false}], [other, {...other, id: {...other.id, id: 22}}], [other, other]]) {
    assert.equal(read(assets).repairObserved, false);
  }
  for (const assets of [[{...other, type: 100}], [{...other, id: {...other.id, id: 20}}]]) {
    const {data, calls} = run({...repairPurchase, extraAssets: assets});
    assert.equal(data.status, 'rejected');
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
});
