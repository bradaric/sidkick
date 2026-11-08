const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'upgrade_unit.js') {
  const calls = [], from = {UnitType: 'UNIT_OLD', $hash: 500, Name: 'Old'}, to = {UnitType: 'UNIT_NEW', $hash: 600, $index: 26, Name: 'New'};
  const unit = {id: {owner: o.foreign ? 1 : 0, id: o.replaced ? 20 : 10, type: 26}, type: o.upgraded ? 600 : 500,
    isOnMap: !o.offMap, isCommanderUnit: false, operationQueueSize: o.queued ? 1 : 0,
    location: {x: 2, y: 3}, Movement: {movementMovesRemaining: 3}};
  const player = {isTurnActive: !o.inactive, Treasury: {goldBalance: o.gold ?? 1000},
    Units: {getUnits: () => o.missing ? [] : o.ambiguous ? [unit, {...unit, id: {owner: 0, id: 21, type: 26}}] : [unit]}};
  let checks = 0;
  const context = {queryArguments: {unit_id: 10, target_unit_type: 'UNIT_NEW', max_gold_cost: 200, expected_turn: 62,
      baseline_unit_ids: [10], source_location: {x: 2, y: 3}, source_component_type: 26, before_gold: 1000, quoted_gold_cost: 200, ...o.args},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sent ?? false},
    Players: {get: () => player}, Locale: {compose: x => x}, UnitCommandTypes: {UPGRADE: 900},
    GameInfo: {Units: {lookup: value => [500, 'UNIT_OLD'].includes(value) ? from : [600, 26, 'UNIT_NEW'].includes(value) ? to : null},
      Unit_Stats: {lookup: () => null}, UnitUpgrades: o.notLinked ? [] : [{Unit: 'UNIT_OLD', UpgradeUnit: 'UNIT_NEW'}]},
    Game: {turn: 62, age: 42, UnitCommands: {canStart: (id, command, args, exclusion) => {
      checks++; calls.push({kind: 'check', id, command, args, exclusion});
      if (o.changed) context.Game.turn++;
      if (o.changedLocation) unit.location = {x: 3, y: 3};
      const cost = o.changedPrice && checks > 1 ? 201 : o.cost ?? 200;
      return {Success: !o.blocked, UnitType: o.wrongTarget ? -1 : 26,
        ...(o.noQuote ? {} : {AdditionalDescription: o.quote ?? [`Upgrade to New: ${cost} [icon:YIELD_GOLD] Gold`]})};
    }, sendRequest: (id, command, args) => {calls.push({kind: 'send', id, command, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('upgrade checks exact target and fresh native quote twice, then submits the fixed UI command once', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.equal(data.quotedGoldCost, 200);
  assert.equal(calls.filter(c => c.kind === 'check').length, 2);
  assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 10, type: 26}, command: 900,
    args: {X: -9999, Y: -9999, UnitAbilityType: -1}});
  assert.equal(data.expected.unitType, 'UNIT_NEW');
  assert.equal(run({upgraded: true}).data.status, 'already_active');
  assert.equal(run({cost: 0, gold: 0, args: {max_gold_cost: 0}}).data.status, 'submitted');
});

test('upgrade never guesses missing/localized/multiple prices or ignores explicit cap and target', () => {
  for (const o of [{noQuote: true}, {cost: 201}, {gold: 199}, {changedPrice: true}, {wrongTarget: true}, {notLinked: true},
    {quote: ['Upgrade to New: 2,000 [icon:YIELD_GOLD] Gold']}, {quote: ['Améliorer: 200 Or']},
    {quote: ['Upgrade to New: 200 [icon:YIELD_GOLD] Gold', 'Another cost']},
    {args: {max_gold_cost: true}}, {args: {target_unit_type: 'UNIT_OTHER'}}]) {
    const {data, calls} = run(o);
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
});

test('upgrade requires a local deployed unqueued unit in a fresh active turn with native permission', () => {
  for (const o of [{foreign: true}, {missing: true}, {offMap: true}, {queued: true}, {inactive: true}, {sent: true},
    {blocked: true}, {changed: true}, {changedLocation: true}, {args: {expected_turn: 61}}, {args: {unit_id: true}}]) {
    const {data, calls} = run(o); assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});

test('upgrade state reads the actual unit type and balance without another native action', () => {
  const {data, calls} = run({upgraded: true, gold: 800}, 'unit_upgrade_state.js');
  assert.equal(data.unitId, 10); assert.equal(data.unitType, 'UNIT_NEW'); assert.equal(data.gold, 800);
  assert.equal(calls.length, 0);
});

test('native replacement is proven by original disappearance, one new same-tile target and exact Gold spend', () => {
  const {data, calls} = run({replaced: true, upgraded: true, gold: 800}, 'unit_upgrade_state.js');
  assert.equal(data.upgradeObserved, true); assert.equal(data.originalUnitId, 10); assert.equal(data.unitId, 20);
  assert.equal(calls.length, 0);
  assert.equal(run({missing: true, gold: 800}, 'unit_upgrade_state.js').data.upgradeObserved, false, 'allow transient replacement gap');
  assert.equal(run({replaced: true, upgraded: true, gold: 801}, 'unit_upgrade_state.js').data.upgradeObserved, false);
  assert.equal(run({replaced: true, upgraded: true, gold: 800, args: {baseline_unit_ids: [10, 20]}}, 'unit_upgrade_state.js').data.upgradeObserved, false);
  assert.throws(() => run({replaced: true, upgraded: true, gold: 800, ambiguous: true}, 'unit_upgrade_state.js'), /ambiguous/i);
});

test('unit readout exposes exact upgrade target/quote and withholds unsupported quote formats', () => {
  const {data} = run({}, 'units.js');
  assert.equal(data.units[0].upgrade.targetUnitType, 'UNIT_NEW');
  assert.equal(data.units[0].upgrade.quotedGoldCost, 200);
  assert.equal(data.units[0].upgrade.availableNow, true);
  const unknown = run({noQuote: true}, 'units.js').data.units[0].upgrade;
  assert.equal(unknown.quotedGoldCost, null); assert.equal(unknown.availableNow, false);
});
