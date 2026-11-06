const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'air_attack_unit.js') {
  const calls = [], id = (owner, n, type = 26) => ({owner, id: n, type});
  const plane = {id: id(0, 10), type: 100, isOnMap: false, isCommanderUnit: false, operationQueueSize: o.queued ? 1 : 0,
    armyId: id(0, 40, 29), location: {x: -9999, y: -9999}, Movement: {movementMovesRemaining: o.immobile ? 0 : 8},
    Health: {damage: 0, maxDamage: 100}, Combat: {isCombat: true, canAttack: !o.spent, attacksRemaining: o.spent ? 0 : 1}};
  const base = {id: id(0, 30), type: 300, isCommanderUnit: true, isAerodromeCommander: !o.carrier, isOnMap: true,
    operationQueueSize: 0, location: {x: 2, y: 2}, armyId: id(0, 40, 29)};
  if(o.squadron){base.isAerodromeCommander=false;base.isSquadronCommander=true;}
  if(o.carrier)base.isSquadronCommander=true;
  const enemy = {id: id(1, 20), type: 200, isOnMap: true, isCommanderUnit: false, location: {x: 3, y: 3},
    Combat: {isCombat: !o.civilian}, Health: {damage: o.damaged ? 30 : 0, maxDamage: 100}};
  const baseline = [{commanderId: 30, commanderType: 300, componentType: 26, armyId: 40, packedUnitIds: [10]}];
  const ctx = {queryArguments: {unit_id: 10, target_player: 1, target_unit_id: 20, x: 3, y: 3, expected_turn: 62,
      unit_type: 100, component_type: 26, target_type: 200, target_component_type: 26, before_attacks: 1, before_target_damage: 0,
      baseline_armies: baseline, source_base: {commanderId: 30, commanderType: 300, componentType: 26, armyId: 40, armyComponentType: 29, location: {x: 2, y: 2}, cityId: 7, cityComponentType: 1,...(o.explicitBase?{kind:o.carrier?'carrier':o.squadron?'squadron':'city'}:{})},
      ...(o.explicitBase?{source_commander_id:30}:{}),...o.args},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)},
    Players: {get: () => ({isTurnActive: !o.inactive, Units: {getUnits: () => [...(o.lost ? [] : [plane]), base]},
      Cities: {getCities: () => [{id: id(0, 7, 1), location: {x: 2, y: 2}}]}, Armies: {getUnitReinforcementCommanderId: () => o.reinforcing ? 40 : -1},
      Diplomacy: {hasMet: () => !o.unmet, isAtWarWith: () => !o.peace}})},
    Armies: {get: () => ({owner: 0, localId: 40, getCommanderId: () => base.id, getUnitIds: () => o.unknownArmy ? null : o.lost || o.changedPacking ? [] : [plane.id]})},
    GameInfo: {Units: {lookup: type => ({UnitType:type===300&&o.carrier?'UNIT_CARRIER_COMMANDER':'UNIT_TEST',Domain: type === 100 ? 'DOMAIN_AIR' : 'DOMAIN_SEA', FormationClass: type === 100 ? 'FORMATION_CLASS_AIR' : 'FORMATION_CLASS_NAVAL'})}},
    GameplayMap: {getGridWidth: () => 10, getGridHeight: () => 10, getRevealedState: () => o.hidden ? 0 : 2, getOwner: (x, y) => x === 2 ? o.foreignBase ? 1 : 0 : -1,
      isWater:()=>!o.landCarrier,getIndexFromLocation: l => l.x + l.y * 10}, RevealedStates: {VISIBLE: 2}, Visibility: {isVisible: () => !o.invisible},
    MapUnits: {getUnits: () => o.gone ? [] : o.stacked ? [enemy.id, id(1, 21)] : [enemy.id]},
    MapCities: {getDistrict: () => o.district ? id(1, 90, 4) : null},
    Units: {get: id => {calls.push({kind: 'readTarget', id}); return enemy;}},
    Game: {turn: 62, age: 42, Combat: {getBestDefender: () => enemy.id, getDefensibleDistrict: () => o.district ? id(1, 90, 4) : id(-1, -1, 0)},
      UnitOperations: {canStart: (id, operation, args, exclusion) => {calls.push({kind: 'check', id, operation, args, exclusion});
        if (o.changed) ctx.Game.turn++; if (o.changedTarget) enemy.Health.damage++;
        if (o.changedBase) base.armyId = {owner: 0, id: 41, type: 29};
        return {Success: !o.blocked, Plots: o.notOffered ? [] : [33], RequiresConfirmation: Boolean(o.confirm)};},
        sendRequest: (id, operation, args) => {calls.push({kind: 'send', id, operation, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(`civ7/${script}`, 'utf8'), ctx);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('stationed aircraft uses fixed native AIR_ATTACK with exact source base and field target', () => {
  const {data, calls} = run(); assert.equal(data.status, 'submitted'); assert.equal(data.expected.airAttackObserved, true);
  assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 10, type: 26}, operation: 'UNITOPERATION_AIR_ATTACK', args: {X: 3, Y: 3}});
  assert.deepEqual(data.verificationArguments.baseline_armies[0].packedUnitIds, [10]);
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});

test('explicit commander-base air mission supports carrier/squadron sources without relaxing city-only default',()=>{
 for(const kind of ['carrier','squadron']){
  const o={[kind]:true,explicitBase:true};assert.equal(run(o).data.status,'submitted');
  assert.equal(run({...o,spent:true,damaged:true},'air_attack_state.js').data.airAttackObserved,true);
 }
 for(const o of [{carrier:true,landCarrier:true},{squadron:true,args:{source_commander_id:31}},{carrier:true,foreignBase:true}]){
  const r=run({explicitBase:true,...o});assert.equal(r.data.status,'rejected');assert.equal(r.calls.filter(c=>c.kind==='send').length,0);
 }
});

test('air strikes reject unknown/foreign bases, carrier sources, district/stack/civilian targets and stale/native-blocked context', () => {
  for (const o of [{queued: true}, {immobile: true}, {spent: true}, {reinforcing: true}, {carrier: true}, {unknownArmy: true}, {foreignBase: true},
    {peace: true}, {unmet: true}, {hidden: true}, {invisible: true}, {district: true}, {stacked: true}, {civilian: true},
    {blocked: true}, {notOffered: true}, {confirm: true}, {changed: true}, {changedTarget: true}, {changedBase: true}, {args: {expected_turn: 61}}]) {
    const r = run(o); assert.equal(r.data.status, 'rejected', JSON.stringify(o)); assert.equal(r.calls.filter(c => c.kind === 'send').length, 0);
  }
});

test('air strike readback requires attack spend/loss plus visible target effect and exact remaining source membership', () => {
  for (const o of [{spent: true, damaged: true}, {lost: true, damaged: true}, {spent: true, gone: true}]) {
    assert.equal(run(o, 'air_attack_state.js').data.airAttackObserved, true);
  }
  for (const o of [{spent: false}, {damaged: false}, {hidden: true}, {changedPacking: true}]) {
    const r = run({spent: true, damaged: true, ...o}, 'air_attack_state.js'); assert.equal(r.data.airAttackObserved, false);
    if (o.hidden) assert.equal(r.calls.filter(c => c.kind === 'readTarget').length, 0);
  }
});
