const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'attack_unit.js') {
  const calls = [], attacker = {id: {owner: o.foreign ? 1 : 0, id: 10, type: 26}, type: 100,
    isOnMap: !o.offMap, isCommanderUnit: o.commander ?? false, isEmbarked: o.embarked ?? false,
    operationQueueSize: o.queued ? 1 : 0, location: {x: 2, y: 3},
    Health: {damage: 0, maxDamage: 100}, Movement: {movementMovesRemaining: 2},
    Combat: {isCombat: true, canAttack: !o.spent, attacksRemaining: o.spent ? 0 : 1, hasAttacked: o.spent ?? false}};
  const target = {id: {owner: 1, id: 20, type: 26}, type: 200, isOnMap: true, isCommanderUnit: false,
    location: {x: 3, y: 3}, Health: {damage: o.damaged ? 30 : 0, maxDamage: 100}, Combat: {isCombat: !o.civilian}};
  const commander = {id: {owner: 0, id: 30, type: 26}, type: 300, isOnMap: true, isCommanderUnit: true,
    operationQueueSize: o.queuedCommander ? 1 : 0, location: {x: 2, y: 2}, armyId: {owner: 0, id: 30, type: 29},
    Movement: {movementMovesRemaining: 2}, Combat: {attacksRemaining: 1}};
  const second = {...attacker, id: {owner: 0, id: 11, type: 26}, location: {x: 3, y: 2}};
  const player = {isTurnActive: !o.inactive, Units: {getUnits: () => [...(o.deadAttacker ? [] : [attacker]), ...(o.secondParticipant ? [second] : []), ...(o.group ? [commander] : [])]},
    Armies: {getUnitReinforcementCommanderId: () => o.reinforcing ? 10 : -1},
    Diplomacy: {hasMet: () => !o.unmet, isAtWarWith: () => !o.peace}};
  const args = {unit_id: 10, commander_id: 30, target_player: 1, target_unit_id: 20, x: 3, y: 3, kind: 'melee', expected_turn: 62,
    attacker_component_type: 26, attacker_type: 100, before_attacks: 1, before_has_attacked: false,
    target_component_type: 26, target_type: 200, before_target_damage: 0, ...o.args};
  const context = {queryArguments: args, UI: {isInGame: () => true},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sent ?? false}, Players: {get: () => player},
    GameInfo: {TypeTags: [{Type: 'UNIT_RANGED', Tag: o.siegeOnly ? 'UNIT_CLASS_SIEGE' : 'UNIT_CLASS_RANGED'}],
      Units: {lookup: type => ({UnitType: type === 100 ? 'UNIT_RANGED' : `UNIT_${type}`, Domain: o.air ? 'DOMAIN_AIR' : 'DOMAIN_LAND',
      FormationClass: type === 200 && o.civilianDefinition ? 'FORMATION_CLASS_CIVILIAN' : 'FORMATION_CLASS_LAND_COMBAT'})}},
    GameplayMap: {getGridWidth: () => 10, getGridHeight: () => 10, getRevealedState: () => o.hidden ? 0 : 2,
      getPlotDistance: () => o.distant ? 2 : 1, getIndexFromLocation: l => l.x + l.y * 10, getOwner: () => o.enemyTile ? 1 : -1},
    RevealedStates: {VISIBLE: 2}, Visibility: {isVisible: () => !o.invisible},
    MapUnits: {getUnits: () => o.gone ? [] : o.stacked ? [target.id, {owner: 1, id: 21, type: 26}] : [target.id]},
    Armies: {get: () => o.unknownArmy ? null : {owner: 0, getCommanderId: () => commander.id, getUnitIds: () => o.packedGroup ? [attacker.id] : []}},
    Units: {get: id => {calls.push({kind: 'readTarget', id}); return target;}, getReachableTargets: () => o.unreachable ? [] : [33],
      getCommandRadiusPlots: () => o.outsideRadius ? [] : [32, 23]},
    UnitOperationTypes: {MOVE_TO: 900, RANGE_ATTACK: 901}, UnitOperationMoveModifiers: {ATTACK: 1},
    CombatTypes: {COMBAT_MELEE: 11, NO_COMBAT: -1}, OperationPlotModifiers: {NONE: 0, TARGET: 9, BLOCKED: 8},
    Game: {turn: 62, age: 42, Combat: {getBestDefender: () => o.wrongDefender ? {...target.id, id: 99} : target.id,
      getDefensibleDistrict: () => o.district ? {owner: 1, id: 99, type: 12} : {owner: -1, id: -1, type: 0},
      testAttackInto: () => o.notMelee ? -1 : 11}, UnitCommands: {canStart: (id, command, args, exclusion) => {
        calls.push({kind: 'commandCheck', id, command, args, exclusion});
        if (o.changedCommand) context.Game.turn++;
        if (o.changedTargetType) target.type++;
        return {Success: !o.commandBlocked, Plots: o.notOffered ? [] : [33], RequiresConfirmation: o.confirm};
      }, sendRequest: (id, command, args) => {calls.push({kind: 'commandSend', id, command, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}},
      UnitOperations: {canStart: (id, operation, args, exclusion) => {
        calls.push({kind: 'check', id, operation, args, exclusion});
        if (o.changed) context.Game.turn++;
        if (o.changedTarget) target.Health.damage++;
        return {Success: !o.blocked, RequiresConfirmation: o.confirm ?? false,
          Plots: o.unreachable ? [] : [33], Modifiers: [o.blockedPlot ? 8 : 9]};
      }, sendRequest: (id, operation, args) => {calls.push({kind: 'send', id, operation, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  attacker.Combat.rangedStrength = o.noRanged ? 0 : 40;
  try {data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('single melee/ranged unit attacks bind explicit hostile component and fixed native arguments', () => {
  for (const kind of ['melee', 'ranged']) {
    const {data, calls} = run({args: {kind}});
    assert.equal(data.status, 'submitted');
    assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 10, type: 26}, operation: kind === 'melee' ? 900 : 901,
      args: kind === 'melee' ? {X: 3, Y: 3, Modifiers: 1} : {X: 3, Y: 3}});
    assert.equal(data.expected.attackObserved, true);
    assert.equal(data.verificationArguments.before_target_damage, 0);
  }
});

test('focused ranged army attack binds one visible primary target and captures ready deployed radius units', () => {
  const {data, calls} = run({group: true}, 'army_ranged_attack.js');
  assert.equal(data.status, 'submitted');
  assert.equal(data.verificationArguments.participants[0].unit_id, 10);
  assert.deepEqual(calls.at(-1), {kind: 'commandSend', id: {owner: 0, id: 30, type: 26},
    command: 'UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED', args: {X: 3, Y: 3}});
  assert.match(data.verificationScope, /primary.*splash/i);
});

test('focused army attack cannot bypass native permission, radius, known membership or primary-target safeguards', () => {
  for (const o of [{unknownArmy: true}, {packedGroup: true}, {queuedCommander: true}, {outsideRadius: true}, {noRanged: true}, {siegeOnly: true},
    {peace: true}, {hidden: true}, {invisible: true}, {district: true}, {stacked: true}, {civilianDefinition: true}, {enemyTile: true},
    {spent: true}, {commandBlocked: true}, {notOffered: true}, {confirm: true}, {changedCommand: true}, {changedTargetType: true}, {args: {commander_id: true}}]) {
    const {data, calls} = run({group: true, ...o}, 'army_ranged_attack.js');
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'commandSend').length, 0);
  }
  assert.equal(run({group: true, sendThrows: true}, 'army_ranged_attack.js').calls.filter(c => c.kind === 'commandSend').length, 1);
});

test('army readback observes actual participant consumption, never commander readiness alone', () => {
  const args = {unit_id: 30, attacker_type: 300, participants: [{unit_id: 10, component_type: 26, unit_type: 100, before_attacks: 1}]};
  const good = run({group: true, spent: true, damaged: true, args}, 'unit_attack_state.js');
  assert.equal(good.data.attackObserved, true); assert.deepEqual(good.data.consumedUnitIds, [10]);
  assert.equal(run({group: true, damaged: true, args}, 'unit_attack_state.js').data.attackObserved, false);
  assert.throws(() => run({group: true, args: {...args, participants: []}}, 'unit_attack_state.js'), /participant/i);
});

test('focused army command captures multiple eligible participants without issuing per-unit attacks', () => {
  const {data, calls} = run({group: true, secondParticipant: true}, 'army_ranged_attack.js');
  assert.deepEqual(data.verificationArguments.participants.map(p => p.unit_id), [10, 11]);
  assert.equal(calls.filter(c => c.kind === 'commandSend').length, 1);
  assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  const args = {unit_id: 30, attacker_type: 300, participants: data.verificationArguments.participants};
  const read = run({group: true, secondParticipant: true, spent: true, damaged: true, args}, 'unit_attack_state.js');
  assert.deepEqual(read.data.consumedUnitIds, [10, 11]); assert.equal(read.data.attackObserved, true);
});

test('attacks cannot declare wars, hit hidden/stacked/district/civilian targets or silently replace the selected defender', () => {
  for (const o of [{peace: true}, {unmet: true}, {hidden: true}, {invisible: true}, {stacked: true}, {district: true},
    {civilian: true}, {civilianDefinition: true}, {enemyTile: true}, {wrongDefender: true}, {gone: true}, {args: {target_player: 0}}, {args: {target_unit_id: 99}}]) {
    const {data, calls} = run(o); assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
    if (o.hidden || o.invisible || o.peace || o.unmet) assert.equal(calls.filter(c => c.kind === 'readTarget').length, 0);
  }
});

test('attacks require deployed ready unqueued noncommander and exact fresh native permission', () => {
  for (const o of [{foreign: true}, {offMap: true}, {commander: true}, {embarked: true}, {queued: true}, {spent: true},
    {air: true}, {reinforcing: true}, {inactive: true}, {sent: true}, {blocked: true}, {confirm: true}, {changed: true},
    {changedTarget: true}, {unreachable: true}, {distant: true}, {notMelee: true}, {args: {unit_id: true}},
    {args: {expected_turn: 61}}, {args: {kind: 'air'}}, {args: {kind: 'ranged'}, blockedPlot: true}]) {
    const {data, calls} = run(o); assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});

test('attack readback requires attack consumption plus actual visible damage or target leaving tile', () => {
  for (const o of [{spent: true, damaged: true}, {spent: true, gone: true}, {deadAttacker: true, damaged: true}]) {
    assert.equal(run(o, 'unit_attack_state.js').data.attackObserved, true);
  }
  for (const o of [{}, {spent: true}, {damaged: true}, {spent: true, damaged: true, hidden: true},
    {spent: true, damaged: true, invisible: true}]) {
    const {data, calls} = run(o, 'unit_attack_state.js'); assert.equal(data.attackObserved, false, JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
    if (o.hidden || o.invisible) assert.equal(calls.filter(c => c.kind === 'readTarget').length, 0);
  }
});
