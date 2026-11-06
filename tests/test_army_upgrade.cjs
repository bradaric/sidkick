const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'upgrade_army.js') {
  const calls = [], id = n => ({owner: 0, id: n, type: 26});
  const commander = {id: id(30), type: 300, isCommanderUnit: true, isOnMap: !o.offMap, operationQueueSize: o.queued ? 1 : 0,
    location: {x: 2, y: 3}, armyId: {owner: 0, id: 1}, Movement: {movementMovesRemaining: 3}};
  const oldIds = [10, 11], ids = o.applied && o.replaced ? [20, 21] : oldIds;
  const members = ids.map((n, i) => ({id: id(n), type: (o.applied ? 600 : 500) + (o.heterogeneous && i === 1 ? 1 : 0), isOnMap: false,
    operationQueueSize: o.memberQueued ? 1 : 0, isCommanderUnit: false}));
  const untouched = {id: id(40), type: o.unrelatedChanged ? 701 : 700};
  const other = {...commander, id: id(50), armyId: {owner: 0, id: 2}};
  const owned = [commander, ...members, untouched, ...(o.otherArmy ? [other] : [])];
  if (o.partial) members[1].type = 500;
  if (o.mixed) members[1].type = 600;
  const armyRecord = packed => [{commanderId: 30, commanderType: 300, componentType: 26, armyId: 1, packedUnitIds: packed},
    ...(o.otherArmy ? [{commanderId: 50, commanderType: 300, componentType: 26, armyId: 2, packedUnitIds: [40]}] : [])];
  const inventory = [{unitId: 10, unitType: 500, componentType: 26}, {unitId: 11, unitType: o.heterogeneous ? 501 : 500, componentType: 26},
    {unitId: 30, unitType: 300, componentType: 26}, {unitId: 40, unitType: 700, componentType: 26}];
  if (o.otherArmy) inventory.push({unitId: 50, unitType: 300, componentType: 26});
  const baseline = {turn: 62, age: 42, playerId: 0, commanderId: 30, commanderType: 300, componentType: 26,
    location: {x: 2, y: 3}, gold: 1000, inventory, armies: armyRecord(oldIds),
    plan: oldIds.map((unitId, i) => ({unitId, unitType: o.heterogeneous && i === 1 ? 501 : 500, componentType: 26,
      targetUnitType: o.heterogeneous && i === 1 ? 601 : 600, goldCost: 200})), quotedGoldCost: 400};
  const ctx = {queryArguments: {commander_id: 30, max_gold_cost: 400, expected_turn: 62, baseline, ...o.args},
    UI: {isInGame: () => true}, Locale: {compose: s => s}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)},
    Players: {get: () => ({isTurnActive: !o.inactive, Treasury: {goldBalance: o.gold ?? (o.applied ? 600 : 1000)}, Units: {getUnits: () => owned}})},
    Armies: {get: army => ({owner: o.foreignArmy ? 1 : 0, localId: army.id, getCommanderId: () => id(army.id === 1 ? 30 : 50),
      getUnitIds: () => army.id === 2 ? o.otherArmyChanged ? [] : [id(40)] : o.unknownArmy ? null : o.empty ? [] : members.map(u => u.id)})},
    GameInfo: {Units: {lookup: type => [500, 'UNIT_OLD'].includes(type) ? {UnitType: 'UNIT_OLD', $hash: 500, Domain: o.land ? 'DOMAIN_LAND' : 'DOMAIN_SEA', FormationClass: o.land ? 'FORMATION_CLASS_LAND_COMBAT' : 'FORMATION_CLASS_NAVAL'} :
      [600, 29, 'UNIT_NEW'].includes(type) ? {UnitType: 'UNIT_NEW', $hash: 600, Name: 'Dreadnought', Domain: o.land ? 'DOMAIN_LAND' : 'DOMAIN_SEA'} :
      type === 501 ? {UnitType: 'UNIT_OTHER_OLD', $hash: 501, Domain: 'DOMAIN_SEA', FormationClass: 'FORMATION_CLASS_NAVAL'} :
      [601, 28].includes(type) ? {UnitType: 'UNIT_OTHER_NEW', $hash: 601, Name: 'Destroyer', Domain: 'DOMAIN_SEA'} :
      {UnitType: 'COMMANDER', Domain: o.land ? 'DOMAIN_LAND' : 'DOMAIN_SEA'}},
      UnitUpgrades: o.unlinked ? [] : [{Unit: 'UNIT_OLD', UpgradeUnit: 'UNIT_NEW'}, {Unit: 'UNIT_OTHER_OLD', UpgradeUnit: 'UNIT_OTHER_NEW'}]},
    GameplayMap: {getGridWidth: () => 10, getGridHeight: () => 10, getRevealedState: () => o.hidden ? 0 : 2, getOwner: () => o.foreignTile ? 1 : 0},
    RevealedStates: {VISIBLE: 2},
    Game: {turn: 62, age: 42, UnitCommands: {canStart: (id, command, args, exclusion) => {
      calls.push({kind: 'check', id, command, args, exclusion});
      if (o.changed) ctx.Game.turn++;
      if (command === 'UNITCOMMAND_UPGRADE') return {Success: !o.memberBlocked, UnitType: o.heterogeneous && id.id === 11 ? 28 : 29,
        AdditionalDescription: [`Upgrade to ${o.heterogeneous && id.id === 11 ? 'Destroyer' : 'Dreadnought'}: 200 [icon:YIELD_GOLD] Gold`]};
      return {Success: !o.blocked, RequiresConfirmation: Boolean(o.confirm),
        AdditionalDescription: o.quote ?? [`Upgrade 2 units: ${o.changedPrice && calls.length > 3 ? 401 : 400} [icon:YIELD_GOLD] Gold`]};
    }, sendRequest: (id, command, args) => {calls.push({kind: 'send', id, command, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(`civ7/${script}`, 'utf8'), ctx);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('group upgrade reconciles every member quote with the native aggregate and explicit Gold cap', () => {
  const {data, calls} = run(); assert.equal(data.status, 'submitted'); assert.equal(data.quotedGoldCost, 400);
  assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 30, type: 26}, command: 'UNITCOMMAND_UPGRADE_ARMY',
    args: {X: -9999, Y: -9999, UnitAbilityType: -1}});
  assert.equal(data.verificationArguments.baseline.plan.length, 2); assert.equal(data.expected.upgradeObserved, true);
  assert.equal(run({land: true}).data.status, 'submitted', 'same bounded group semantics support land combat armies');
});

test('group upgrade never guesses localized prices, mixed eligibility, links or aggregate counts', () => {
  for (const o of [{empty: true}, {unknownArmy: true}, {foreignArmy: true}, {unlinked: true}, {memberBlocked: true},
    {queued: true}, {memberQueued: true}, {offMap: true}, {mixed: true},
    {blocked: true}, {confirm: true}, {changed: true}, {changedPrice: true}, {hidden: true}, {foreignTile: true}, {sent: true}, {inactive: true},
    {gold: 399}, {args: {max_gold_cost: 399}}, {args: {max_gold_cost: true}}, {args: {expected_turn: 61}},
    {quote: ['Upgrade 1 units: 400 [icon:YIELD_GOLD] Gold']}, {quote: ['Upgrade 2 units: 399 [icon:YIELD_GOLD] Gold']},
    {quote: ['Améliorer 2 unités: 400 Or']}, {quote: []}]) {
    const {data, calls} = run(o); assert.equal(data.status, 'rejected', JSON.stringify(o)); assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});

test('group readback proves all in-place or replacement upgrades, exact spend and no unrelated inventory changes', () => {
  for (const replaced of [false, true]) {
    const {data, calls} = run({applied: true, replaced}, 'army_upgrade_state.js');
    assert.equal(data.upgradeObserved, true); assert.equal(calls.length, 0);
    assert.deepEqual(data.upgradedMemberIds, replaced ? [20, 21] : [10, 11]);
  }
  for (const o of [{applied: false}, {partial: true}, {gold: 601}, {unrelatedChanged: true}, {empty: true}]) {
    assert.equal(run({applied: true, ...o}, 'army_upgrade_state.js').data.upgradeObserved, false, JSON.stringify(o));
  }
});

test('selected commander logistics reports exact native group count/Gold quote, not an inferred total', () => {
  const {data, calls} = run({args: {unit_id: 30}}, 'logistics.js');
  assert.equal(data.selectedUnit.upgradeArmy.quotedGoldCost, 400);
  assert.equal(data.selectedUnit.upgradeArmy.quotedUnitCount, 2);
  assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  assert.equal(run({args: {unit_id: 30}, quote: ['Unsupported price']}, 'logistics.js').data.selectedUnit.upgradeArmy.quotedGoldCost, null);
});

test('replacement upgrades preserve other armies and cannot mask a foreign membership delta', () => {
  assert.equal(run({applied: true, replaced: true, otherArmy: true}, 'army_upgrade_state.js').data.upgradeObserved, true);
  const {data} = run({applied: true, replaced: true, otherArmy: true, otherArmyChanged: true}, 'army_upgrade_state.js');
  assert.equal(data.upgradeObserved, false); assert.equal(data.unaffectedInventoryPreserved, false);
});

test('heterogeneous eligible members retain distinct direct targets and verify the full replacement type multiset', () => {
  const {data} = run({heterogeneous: true}); assert.equal(data.status, 'submitted');
  assert.deepEqual(data.verificationArguments.baseline.plan.map(p => p.targetUnitType), [600, 601]);
  assert.equal(run({heterogeneous: true, applied: true, replaced: true}, 'army_upgrade_state.js').data.upgradeObserved, true);
});
