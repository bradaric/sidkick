const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'second_wind.js') {
  const calls = [], component = id => ({owner: 0, id, type: 26});
  const commander = {id: component(30), type: 300, isCommanderUnit: true, isOnMap: true, armyId: {owner: 0, id: 1},
    location: {x: 2, y: 2}, operationQueueSize: 0};
  const target = {id: {...component(10), owner: o.foreign ? 1 : 0}, type: 100, isOnMap: !o.offMap, operationQueueSize: o.queued ? 1 : 0,
    location: {x: 3, y: 2}, Combat: {isCombat: true, attacksRemaining: o.applied ? 1 : 0},
    Movement: {movementMovesRemaining: o.applied ? 2 : 0}, Health: {damage: 21, maxDamage: 100}};
  const member = {id: component(11), type: 100, isOnMap: false};
  const owned = [commander, target, member];
  const captured = {commander_id: 30, unit_id: 10, expected_turn: 62, commander_type: 300, commander_component_type: 26,
    unit_type: 100, component_type: 26, commander_location: {x: 2, y: 2}, location: {x: 3, y: 2},
    packed_unit_ids: [11], before_moves: 0, before_attacks: 0, before_damage: 21};
  const ctx = {queryArguments: {...captured, ...o.args}, UI: {isInGame: () => true}, Locale: {compose: x => x},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)},
    Players: {get: () => ({isTurnActive: !o.inactive, Units: {getUnits: () => owned},
      Armies: {getUnitReinforcementCommanderId: () => o.reinforcing ? 1 : -1}})},
    Armies: {get: () => ({owner: 0, getCommanderId: () => component(30), getUnitIds: () => o.unknownArmy ? null :
      o.packedTarget ? [component(10), component(11)] : o.changedMembership ? [] : [component(11)]})},
    GameInfo: {Units: {lookup: type => ({Domain: o.sea ? 'DOMAIN_SEA' : 'DOMAIN_LAND', FormationClass: type === 100 && !o.civilian ? 'FORMATION_CLASS_LAND_COMBAT' : 'FORMATION_CLASS_COMMAND'})}},
    GameplayMap: {getGridWidth: () => 10, getGridHeight: () => 10, getRevealedState: () => o.hidden ? 0 : 2,
      getOwner: () => o.foreignTile ? 1 : 0, getIndexFromLocation: l => l.x + l.y * 10,
      getLocationFromIndex: i => ({x: i % 10, y: Math.floor(i / 10)})}, RevealedStates: {VISIBLE: 2},
    MapUnits: {getUnits: () => o.stacked ? [component(10), component(99)] : [target.id]},
    Game: {turn: 62, age: 42, UnitCommands: {canStart: (id, command, args) => {
      calls.push({kind: 'check', id, command, args});
      if (o.changed) ctx.Game.turn++;
      return {Success: !o.blocked, Plots: o.notOffered ? [] : [23], RequiresConfirmation: Boolean(o.confirm), ChargesRemaining: 1};
    }, sendRequest: (id, command, args) => {calls.push({kind: 'send', id, command, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  if (o.changedHealth) target.Health.damage++;
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(`civ7/${script}`, 'utf8'), ctx);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('Second Wind submits one fixed command at the exact owned recipient tile', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 30, type: 26},
    command: 'UNITCOMMAND_GRANT_SECOND_WIND', args: {X: 3, Y: 2}});
  assert.equal(data.expected.secondWindObserved, true);
  assert.equal(data.verificationArguments.before_attacks, 0);
  assert.deepEqual(data.verificationArguments.packed_unit_ids, [11]);
});

test('Second Wind refuses stale, ambiguous, packed, unsupported and native-ineligible recipients', () => {
  for (const o of [{foreign: true}, {offMap: true}, {queued: true}, {reinforcing: true}, {unknownArmy: true},
    {packedTarget: true}, {sea: true}, {civilian: true}, {hidden: true}, {foreignTile: true}, {stacked: true},
    {inactive: true}, {sent: true}, {changed: true}, {blocked: true}, {notOffered: true}, {confirm: true},
    {args: {expected_turn: 61}}, {args: {unit_id: true}}, {args: {unit_id: 30}}]) {
    const {data, calls} = run(o); assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});

test('Second Wind readback proves exact movement/attack gains, stable health/location and packed membership', () => {
  const {data, calls} = run({applied: true}, 'second_wind_state.js');
  assert.equal(data.secondWindObserved, true); assert.equal(data.movesRemaining, 2); assert.equal(data.attacksRemaining, 1);
  assert.equal(calls.length, 0);
  for (const o of [{applied: false}, {changedMembership: true}, {changedHealth: true}, {offMap: true}, {hidden: true}]) {
    assert.equal(run({applied: true, ...o}, 'second_wind_state.js').data.secondWindObserved, false, JSON.stringify(o));
  }
});

test('commander logistics identifies exact unambiguous Second Wind recipient and checked native permission', () => {
  const {data, calls} = run({args: {unit_id: 30}}, 'logistics.js');
  assert.equal(data.selectedUnit.secondWind.options[0].unitId, 10);
  assert.equal(data.selectedUnit.secondWind.options[0].availableNow, true);
  assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  for (const o of [{hidden: true}, {stacked: true}, {foreign: true}, {queued: true}, {foreignTile: true}]) {
    assert.deepEqual(run({args: {unit_id: 30}, ...o}, 'logistics.js').data.selectedUnit.secondWind.options, []);
  }
});
