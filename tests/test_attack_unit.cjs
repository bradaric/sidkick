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
  const district = {id: {owner: 1, id: 99, type: 4}, owner: 1, type: 500, location: {x: 3, y: 3}, getMaxDamage: 100, getDamage: o.damaged ? 30 : 0};
  const commander = {id: {owner: 0, id: 30, type: 26}, type: 300, isOnMap: true, isCommanderUnit: true,
    operationQueueSize: o.queuedCommander ? 1 : 0, location: {x: 2, y: 2}, armyId: {owner: 0, id: 30, type: 29},
    isEmbarked: false, Movement: {movementMovesRemaining: 2}, Combat: {attacksRemaining: 1}};
  if (o.movedCommander) {commander.location = {x: 3, y: 3}; commander.Movement.movementMovesRemaining = 0;}
  if (o.spentCommander) commander.Movement.movementMovesRemaining = 0;
  const second = {...attacker, id: {owner: 0, id: 11, type: 26}, location: {x: 3, y: 2}};
  if (o.secondUnspent) second.Combat = {...second.Combat, attacksRemaining: 1};
  if (o.negativeAttacks) attacker.Combat.attacksRemaining = -1;
  const player = {isTurnActive: !o.inactive, Units: {getUnits: () => [...(o.deadAttacker ? [] : [attacker]), ...(o.secondParticipant ? [second] : []), ...(o.group ? [commander] : [])]},
    Armies: {getUnitReinforcementCommanderId: () => o.reinforcing ? 10 : -1},
    Diplomacy: {hasMet: () => !o.unmet, isAtWarWith: () => !o.peace}};
  const args = {unit_id: 10, commander_id: 30, target_player: 1, target_unit_id: 20, x: 3, y: 3, kind: 'melee', attack_kind: 'ranged', expected_turn: 62,
    attacker_component_type: 26, attacker_type: 100, before_attacks: 1, before_has_attacked: false,
    target_component_type: 26, target_type: 200, before_target_damage: 0, ...o.args};
  const context = {queryArguments: args, UI: {isInGame: () => true},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sent ?? false}, Players: {get: () => player},
    GameInfo: {TypeTags: [{Type: 'UNIT_RANGED', Tag: o.navalGroup?o.lightNaval?'UNIT_CLASS_LIGHT':'UNIT_CLASS_HEAVY':o.meleeRole ?? (o.siegeOnly ? 'UNIT_CLASS_SIEGE' : 'UNIT_CLASS_RANGED')}],
       Units: {lookup: type => ({UnitType: type===300&&o.navalGroup?'UNIT_FLEET_COMMANDER':type === 100 ? 'UNIT_RANGED' : `UNIT_${type}`, Domain: type === 200 && o.shoreLandTarget ? 'DOMAIN_LAND' : o.air ? 'DOMAIN_AIR' : o.sea ? 'DOMAIN_SEA' : 'DOMAIN_LAND',
       FormationClass: type === 200 && o.civilianDefinition ? 'FORMATION_CLASS_CIVILIAN' : type === 200 && o.shoreLandTarget ? 'FORMATION_CLASS_LAND_COMBAT' : o.sea ? 'FORMATION_CLASS_NAVAL' : 'FORMATION_CLASS_LAND_COMBAT'})}},
    GameplayMap: {getGridWidth: () => 10, getGridHeight: () => 10, getRevealedState: () => o.hidden ? 0 : 2,
      getPlotDistance: () => o.distant ? 2 : 1, getIndexFromLocation: l => l.x + l.y * 10, getOwner: () => o.tileOwner ?? (o.enemyTile ? 1 : -1),
      isWater: x => o.shoreSource ? x === 2 : o.waterTarget ?? o.sea ?? false},
    RevealedStates: {VISIBLE: 2}, Visibility: {isVisible: () => !o.invisible},
    MapCities: {getCity: () => o.noCity ? null : {owner: 1, id: 9, type: 1},
      getDistrict: () => o.district && !o.districtGone ? district.id : o.undefendedDistrict ? {owner: 1, id: 8, type: 4} : null},
    Districts: {get: id => {calls.push({kind: 'readDistrict', id}); return district;}},
    Cities: {get: () => o.unknownCity ? null : {owner: 1, location: o.cityCentre ? {x: 3, y: 3} : {x: 4, y: 4}}},
    MapUnits: {getUnits: () => o.gone ? [] : o.stacked ? [target.id, {owner: 1, id: 21, type: 26}] : [target.id]},
    Armies: {get: () => o.unknownArmy ? null : {owner: 0, localId: 30, getCommanderId: () => commander.id, getUnitIds: () => o.packedGroup ? [attacker.id] : []}},
    Units: {get: id => {calls.push({kind: 'readTarget', id}); return target;}, getReachableTargets: () => o.unreachable ? [] : [33],
      getCommandRadiusPlots: () => o.outsideRadius ? [] : [32, 23]},
    UnitOperationTypes: {MOVE_TO: 900, RANGE_ATTACK: 901}, UnitOperationMoveModifiers: {ATTACK: 1},
    CombatTypes: {COMBAT_MELEE: 11, NO_COMBAT: -1}, OperationPlotModifiers: {NONE: 0, TARGET: 9, BLOCKED: 8},
    Game: {turn: 62, age: 42, Combat: {getBestDefender: () => o.wrongDefender ? {...target.id, id: 99} : target.id,
      getDefensibleDistrict: () => o.district ? district.id : {owner: -1, id: -1, type: 0},
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
        if (o.changedDistrict) district.getDamage++;
        return {Success: !o.blocked, RequiresConfirmation: o.confirm ?? false,
          Plots: o.unreachable ? [] : [33], ...(o.noModifiers ? {} : {Modifiers: [o.blockedPlot ? 8 : 9]})};
       }, sendRequest: (id, operation, args) => {calls.push({kind: 'send', id, operation, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  if(o.observe){
    args.observe_effects=true;args.observation_radius=1;let gone=false;const listeners={};
    let clock=1000;context.Date={now:()=>clock};context.advanceObservationClock=()=>{clock+=600;};
    context.engine={on:(name,cb)=>{(listeners[name]??=[]).push(cb);return{clear:()=>{listeners[name]=listeners[name].filter(c=>c!==cb);}};}};
    context.MapUnits.getUnits=(x,y)=>x===2&&y===3?[attacker.id]:x===3&&y===3&&!gone?[target.id]:[];
    context.combatObserver=vm.runInNewContext(fs.readFileSync('civ7/combat_observation.js','utf8'),context);
    context.Game.UnitOperations.sendRequest=(id,operation,args)=>{
      calls.push({kind:'send',id,operation,args});attacker.Combat.attacksRemaining=0;target.Health.damage=30;district.getDamage=30;
      for(const cb of listeners.Combat??[])cb({attacker:attacker.id,defender:target.id});
      if(o.nativeKill){for(const cb of listeners.UnitKilledInCombat??[])cb({unitKiller:attacker.id,unitKilled:target.id});gone=true;}
    };
    if(o.group)context.Game.UnitCommands.sendRequest=(id,command,args)=>{
      calls.push({kind:'commandSend',id,command,args});target.Health.damage=30;
      for(const u of [attacker,...(o.secondParticipant?[second]:[])]){u.Combat.attacksRemaining=0;for(const cb of listeners.Combat??[])cb({attacker:u.id,defender:target.id});}
    };
  }
  let data;
  if (o.hiddenCentre) context.GameplayMap.getRevealedState = (p, x, y) => x === 4 && y === 4 ? 0 : 2;
  attacker.Combat.rangedStrength = o.noRanged ? 0 : 40;
  try {data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  let after=null;if(o.observe&&data.status==='submitted'){if(!o.deferQuiet)context.advanceObservationClock();context.queryArguments=data.verificationArguments;after=vm.runInNewContext(fs.readFileSync(`civ7/${script==='ranged_district_attack.js'?'district_attack_state.js':'unit_attack_state.js'}`,'utf8'),context);}
  return JSON.parse(JSON.stringify({data, calls,after}));
}

test('observed field strikes keep native single submission and attribute primary kill only to the exact kill event',()=>{
 const damaged=run({observe:true});assert.equal(damaged.data.status,'submitted');assert.ok(damaged.data.verificationArguments.observation_token);assert.equal(damaged.after.killConfirmed,null);assert.equal(damaged.after.combatObservation.units.find(u=>u.instanceId===20).damageDelta,30);
 const killed=run({observe:true,nativeKill:true});assert.equal(killed.after.killConfirmed,true);assert.equal(killed.after.combatObservation.closed,true);assert.equal(killed.calls.filter(c=>c.kind==='send').length,1);
 const inFlight=run({observe:true,deferQuiet:true});assert.equal(inFlight.after.attackObserved,true);assert.equal(inFlight.after.observationQuiescent,false);assert.equal(inFlight.after.combatObservation.closed,false,'first primary damage must not close event capture while native group effects may still resolve');
});
test('observed district bombardment keeps primary district accounting separate from captured visible garrison deltas',()=>{
 const base={observe:true,district:true,enemyTile:true,args:{district_id:99}};
 const r=run(base,'ranged_district_attack.js');assert.equal(r.data.status,'submitted');assert.equal(r.data.expected.observationQuiescent,true);assert.equal(r.after.districtAttackObserved,true);assert.equal(r.after.observationQuiescent,true);assert.equal(r.after.combatObservation.units.find(u=>u.instanceId===20).damageDelta,30);assert.equal(r.after.districtDamage,30);assert.equal(r.after.districtDestroyed,null);
 const early=run({...base,deferQuiet:true},'ranged_district_attack.js');assert.equal(early.after.observationQuiescent,false);assert.equal(early.after.combatObservation.closed,false);
});

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

test('fleet focused attacks use exact Heavy/Light naval roles, deployed radius members and native NAVAL_ATTACK eligibility',()=>{
 for(const lightNaval of [false,true]){
  const o={group:true,sea:true,navalGroup:true,lightNaval,args:{attack_kind:lightNaval?'sea_melee':'sea_ranged'}};
  const r=run(o,'army_attack.js');assert.equal(r.data.status,'submitted');assert.equal(r.calls.at(-1).command,lightNaval?'UNITCOMMAND_FOCUSED_ATTACK_SEA_MELEE':'UNITCOMMAND_FOCUSED_ATTACK_SEA_RANGED');
  assert.equal(r.calls.some(c=>c.kind==='check'&&c.operation==='UNITOPERATION_NAVAL_ATTACK'),true);
  for(const extra of [{sea:false},{packedGroup:true},{distant:true,lightNaval:true},{outsideRadius:true}])assert.equal(run({...o,...extra},'army_attack.js').data.status,'rejected');
 }
});
test('observed land group attack captures multiple actual participant events and waits for quiet readback',()=>{
 const r=run({group:true,secondParticipant:true,observe:true},'army_attack.js');assert.equal(r.data.status,'submitted');assert.equal(r.data.expected.observationQuiescent,true);assert.equal(r.after.observationQuiescent,true);assert.equal(r.after.combatObservation.nativeCombats.length,2);assert.equal(r.after.allCapturedParticipantsConsumed,true);assert.equal(r.calls.filter(c=>c.kind==='commandSend').length,1);
});

test('army combat readback distinguishes primary effect from complete participant consumption', () => {
  const args = {unit_id: 30, attacker_type: 300, participants: [10, 11].map(unit_id => ({unit_id, component_type: 26, unit_type: 100, before_attacks: 1}))};
  const complete = run({group: true, secondParticipant: true, spent: true, damaged: true, args}, 'unit_attack_state.js').data;
  assert.equal(complete.allCapturedParticipantsConsumed, true); assert.equal(complete.participantObservations.length, 2);
  assert.deepEqual(complete.participantObservations.map(p => p.attacksRemaining), [0, 0]);
  const partial = run({group: true, secondParticipant: true, secondUnspent: true, spent: true, damaged: true, args}, 'unit_attack_state.js').data;
  assert.equal(partial.attackObserved, true); assert.equal(partial.allCapturedParticipantsConsumed, false);
  assert.deepEqual(partial.participantObservations.map(p => p.attackConsumedOrLost), [true, false]);
  assert.equal(run({spent: true, negativeAttacks: true, damaged: true}, 'unit_attack_state.js').data.attackObserved, false);
});

test('explicit enemy-field ranged mode allows only positively classified visible non-city wartime fields', () => {
  const args = {kind: 'ranged', target_territory: 'enemy_field'};
  const {data, calls} = run({enemyTile: true, args});
  assert.equal(data.status, 'submitted'); assert.equal(calls.filter(c => c.kind === 'send').length, 1);
  assert.equal(data.before.targetTerritory, 'enemy_field');
  for (const o of [{district: true}, {undefendedDistrict: true}, {cityCentre: true}, {unknownCity: true}, {noCity: true}, {hiddenCentre: true},
    {tileOwner: 2}, {enemyTile: false}, {stacked: true}, {hidden: true}, {peace: true}, {civilianDefinition: true},
    {args: {...args, target_territory: 'arbitrary'}}]) {
    const result = run({enemyTile: true, args, ...o});
    assert.equal(result.data.status, 'rejected', JSON.stringify(o)); assert.equal(result.calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({enemyTile: true, args: {kind: 'ranged'}}).data.status, 'rejected', 'default boundary is unchanged');
  const melee = run({enemyTile: true, args: {...args, kind: 'melee'}});
  assert.equal(melee.data.status, 'submitted'); assert.equal(melee.calls.at(-1).args.Modifiers, 1);
  assert.equal(run({enemyTile: true, district: true, args: {...args, kind: 'melee'}}).data.status, 'rejected');
});

test('naval attack uses the distinct native naval operation and its offered plots without ranged modifiers', () => {
  const {data, calls} = run({sea: true, noModifiers: true, args: {kind: 'naval'}});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 10, type: 26}, operation: 'UNITOPERATION_NAVAL_ATTACK', args: {X: 3, Y: 3}});
  assert.equal(data.verificationArguments.before_attacks, 1);
  for (const o of [{sea: false}, {waterTarget: false}, {spent: true}, {blocked: true}, {unreachable: true}, {confirm: true},
    {stacked: true}, {district: true}, {enemyTile: true}, {civilianDefinition: true}, {group: true, packedGroup: true},
    {group: true, unknownArmy: true}, {hidden: true}, {peace: true}, {reinforcing: true}]) {
    const result = run({sea: true, args: {kind: 'naval'}, ...o});
    assert.equal(result.data.status, 'rejected', JSON.stringify(o)); assert.equal(result.calls.filter(c => c.kind === 'send').length, 0);
  }
});

test('explicit shore fire uses NAVAL_ATTACK on one positively classified land field target, never enters the tile', () => {
  const opts = {sea: true, shoreSource: true, shoreLandTarget: true, enemyTile: true, noModifiers: true,
    args: {kind: 'shore', target_territory: 'enemy_field'}};
  const r = run(opts); assert.equal(r.data.status, 'submitted');
  assert.deepEqual(r.calls.at(-1).args, {X: 3, Y: 3}); assert.equal(r.calls.at(-1).operation, 'UNITOPERATION_NAVAL_ATTACK');
  assert.equal(run({...opts, undefendedDistrict: true}).data.status, 'submitted', 'shore fire may hit a unit in a non-defensible district, never its centre');
  for (const o of [{district: true}, {cityCentre: true}, {stacked: true}, {shoreLandTarget: false}, {shoreSource: false}, {hiddenCentre: true}]) {
    assert.equal(run({...opts, ...o}).data.status, 'rejected');
  }
});

test('direct commander attack binds native ability target without attacking through packed members', () => {
  const {data, calls} = run({group: true, packedGroup: true}, 'commander_attack.js');
  assert.equal(data.status, 'submitted'); assert.equal(data.expected.abilityAttackObserved, true);
  assert.deepEqual(calls.at(-1), {kind: 'commandSend', id: {owner: 0, id: 30, type: 26}, command: 'UNITCOMMAND_COMMANDER_ATTACK', args: {X: 3, Y: 3}});
  assert.deepEqual(data.verificationArguments.baseline_packed_unit_ids, [10]);
  assert.equal(run({group: true, sea: true}, 'commander_attack.js').data.status, 'submitted');
  for (const o of [{unknownArmy: true}, {spentCommander: true}, {queuedCommander: true}, {hidden: true}, {peace: true}, {enemyTile: true},
    {stacked: true}, {district: true}, {undefendedDistrict: true}, {civilianDefinition: true}, {commandBlocked: true}, {notOffered: true},
    {confirm: true}, {changedCommand: true}]) {
    const result = run({group: true, packedGroup: true, ...o}, 'commander_attack.js');
    assert.equal(result.data.status, 'rejected', JSON.stringify(o)); assert.equal(result.calls.filter(c => c.kind === 'commandSend').length, 0);
  }
});

test('commander ability readback requires observed source spend plus primary-target effect and unchanged packing', () => {
  const args = {unit_id: 30, attacker_type: 300, commander_attack: true, before_moves: 2, commander_before_attacks: 1,
    baseline_packed_unit_ids: [10], baseline_army_id: 30, commander_location: {x: 2, y: 2}};
  const good = run({group: true, packedGroup: true, spentCommander: true, damaged: true, args}, 'unit_attack_state.js');
  assert.equal(good.data.abilityAttackObserved, true); assert.equal(good.data.sourceMovementSpent, true);
  for (const o of [{spentCommander: false}, {damaged: false}, {packedGroup: false}, {hidden: true}]) {
    assert.equal(run({group: true, packedGroup: true, spentCommander: true, damaged: true, args, ...o}, 'unit_attack_state.js').data.abilityAttackObserved, false);
  }
});

test('ranged district attack binds the exact native defensible district even when a hostile garrison is present', () => {
  const args = {district_id: 99};
  const {data, calls} = run({district: true, enemyTile: true, args}, 'ranged_district_attack.js');
  assert.equal(data.status, 'submitted'); assert.equal(data.expected.districtAttackObserved, true);
  assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 10, type: 26}, operation: 901, args: {X: 3, Y: 3}});
  for (const o of [{hidden: true}, {peace: true}, {district: false}, {enemyTile: false}, {spent: true}, {air: true}, {sea: true},
    {blocked: true}, {blockedPlot: true}, {unreachable: true}, {confirm: true}, {changedDistrict: true}, {args: {district_id: 100}}, {group: true, packedGroup: true}]) {
    const r = run({district: true, enemyTile: true, args, ...o}, 'ranged_district_attack.js');
    assert.equal(r.data.status, 'rejected', JSON.stringify(o)); assert.equal(r.calls.filter(c => c.kind === 'send').length, 0);
  }
});

test('naval district bombardment uses native NAVAL_ATTACK from water to land, never ranged fallback', () => {
  const r = run({sea: true, shoreSource: true, district: true, enemyTile: true, args: {district_id: 99, domain: 'DOMAIN_SEA'}}, 'ranged_district_attack.js');
  assert.equal(r.data.status, 'submitted'); assert.equal(r.calls.at(-1).operation, 'UNITOPERATION_NAVAL_ATTACK');
  const blocked = run({sea: true, district: true, enemyTile: true, args: {district_id: 99, domain: 'DOMAIN_SEA'}}, 'ranged_district_attack.js');
  assert.equal(blocked.data.status, 'rejected');
});

test('district readback needs an actual attack spend and visible damage/departure; never reads a hidden/departed district', () => {
  const args = {district_id: 99, district_component_type: 4, district_type: 500, before_district_damage: 0};
  const r = run({district: true, spent: true, damaged: true, args}, 'district_attack_state.js');
  assert.equal(r.data.districtAttackObserved, true);
  for (const o of [{spent: false}, {damaged: false}, {hidden: true}]) assert.equal(run({district: true, spent: true, damaged: true, args, ...o}, 'district_attack_state.js').data.districtAttackObserved, false);
  const gone = run({district: true, districtGone: true, spent: true, args}, 'district_attack_state.js');
  assert.equal(gone.data.districtAttackObserved, true); assert.equal(gone.calls.filter(c => c.kind === 'readDistrict').length, 0);
});

test('packed land army Overrun uses exact offered target and native weaker-target permission, not guessed odds', () => {
  const {data, calls} = run({group: true, packedGroup: true}, 'army_overrun.js');
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.at(-1), {kind: 'commandSend', id: {owner: 0, id: 30, type: 26},
    command: 'UNITCOMMAND_ARMY_OVERRUN', args: {X: 3, Y: 3}});
  assert.equal(data.expected.overrunObserved, true);
  assert.deepEqual(data.verificationArguments.baseline_packed_unit_ids, [10]);
});

test('Overrun rejects unpacked, nonadjacent, hidden, nonhostile, civilian/stack/district and native-disallowed targets', () => {
  for (const o of [{packedGroup: false}, {unknownArmy: true}, {distant: true}, {waterTarget: true}, {queuedCommander: true},
    {hidden: true}, {invisible: true}, {peace: true}, {district: true}, {stacked: true}, {civilianDefinition: true},
    {enemyTile: true}, {commandBlocked: true}, {notOffered: true}, {confirm: true}, {changedCommand: true},
    {args: {commander_id: true}}]) {
    const {data, calls} = run({group: true, packedGroup: true, ...o}, 'army_overrun.js');
    assert.equal(data.status, 'rejected', JSON.stringify(o)); assert.equal(calls.filter(c => c.kind === 'commandSend').length, 0);
  }
  assert.equal(run({group: true, packedGroup: true, sendThrows: true}, 'army_overrun.js').calls.filter(c => c.kind === 'commandSend').length, 1);
});

test('Overrun readback requires target departure, commander arrival, movement spent and unchanged packed membership', () => {
  const args = {mode: 'overrun', commander_id: 30, component_type: 26, baseline_packed_unit_ids: [10], baseline_unit_ids: [10, 30],
    target_player: 1, target_unit_id: 20, target_component_type: 26, x: 3, y: 3, before_moves: 2};
  const good = run({group: true, packedGroup: true, movedCommander: true, gone: true, args}, 'commander_action_state.js');
  assert.equal(good.data.overrunObserved, true); assert.equal(good.data.killConfirmed, null);
  for (const o of [{gone: false}, {movedCommander: false}, {packedGroup: false}, {hidden: true}]) {
    const read = run({group: true, packedGroup: true, movedCommander: true, gone: true, args, ...o}, 'commander_action_state.js');
    assert.equal(read.data.overrunObserved, false, JSON.stringify(o));
    assert.equal(read.calls.filter(c => c.kind === 'readTarget').length, 0, 'never look up a departed/hidden target');
  }
});

test('focused ranged army attack binds one visible primary target and captures ready deployed radius units', () => {
  const {data, calls} = run({group: true}, 'army_attack.js');
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
    const {data, calls} = run({group: true, ...o}, 'army_attack.js');
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'commandSend').length, 0);
  }
  assert.equal(run({group: true, sendThrows: true}, 'army_attack.js').calls.filter(c => c.kind === 'commandSend').length, 1);
});

test('army readback observes actual participant consumption, never commander readiness alone', () => {
  const args = {unit_id: 30, attacker_type: 300, participants: [{unit_id: 10, component_type: 26, unit_type: 100, before_attacks: 1}]};
  const good = run({group: true, spent: true, damaged: true, args}, 'unit_attack_state.js');
  assert.equal(good.data.attackObserved, true); assert.deepEqual(good.data.consumedUnitIds, [10]);
  assert.equal(run({group: true, damaged: true, args}, 'unit_attack_state.js').data.attackObserved, false);
  assert.throws(() => run({group: true, args: {...args, participants: []}}, 'unit_attack_state.js'), /participant/i);
});

test('focused army command captures multiple eligible participants without issuing per-unit attacks', () => {
  const {data, calls} = run({group: true, secondParticipant: true}, 'army_attack.js');
  assert.deepEqual(data.verificationArguments.participants.map(p => p.unit_id), [10, 11]);
  assert.equal(calls.filter(c => c.kind === 'commandSend').length, 1);
  assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  const args = {unit_id: 30, attacker_type: 300, participants: data.verificationArguments.participants};
  const read = run({group: true, secondParticipant: true, spent: true, damaged: true, args}, 'unit_attack_state.js');
  assert.deepEqual(read.data.consumedUnitIds, [10, 11]); assert.equal(read.data.attackObserved, true);
});

test('coordinated melee uses adjacent native-reachable Infantry/Cavalry participants and fixed selected command', () => {
  for (const role of ['UNIT_CLASS_INFANTRY', 'UNIT_CLASS_CAVALRY']) {
    const {data, calls} = run({group: true, meleeRole: role, secondParticipant: true, args: {attack_kind: 'melee'}}, 'army_attack.js');
    assert.equal(data.status, 'submitted');
    assert.deepEqual(calls.at(-1), {kind: 'commandSend', id: {owner: 0, id: 30, type: 26},
      command: 'UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE', args: {X: 3, Y: 3}});
    assert.equal(data.verificationArguments.participants[0].unit_id, 10);
    assert.deepEqual(data.verificationArguments.participants.map(p => p.unit_id), [10, 11]);
  }
  for (const o of [{distant: true}, {notMelee: true}, {unreachable: true}, {meleeRole: 'UNIT_CLASS_SIEGE'},
    {meleeRole: 'UNIT_CLASS_RANGED'}, {waterTarget: true}, {commandBlocked: true}, {hidden: true}, {district: true}, {stacked: true}, {args: {attack_kind: 'raw'}}]) {
    const {data, calls} = run({group: true, meleeRole: 'UNIT_CLASS_INFANTRY', args: {attack_kind: 'melee'}, ...o}, 'army_attack.js');
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'commandSend').length, 0);
  }
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
