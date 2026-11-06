const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const OPS = {found: 'UNITOPERATION_FOUND_CITY', excavate: 'UNITOPERATION_EXCAVATE', research: 'UNITOPERATION_RESEARCH_ARTIFACTS', spread: 'UNITOPERATION_SPREAD_RELIGION', great_person: 'UNITCOMMAND_ACTIVATE_GREAT_PERSON', resettle: 'UNITCOMMAND_RESETTLE'};
function run(o = {}, script = 'local_civilian_action.js') {
  const calls = [], kind = o.kind ?? 'found', operation = OPS[kind];
  const unit = {id: {owner: 0, id: 10, type: 26}, type: 100, isOnMap: true, isEmbarked: false, isCommanderUnit: false,
    operationQueueSize: o.queued ? 1 : o.applied && ['excavate','research'].includes(kind) ? 1 : 0, getOperationType: () => o.applied ? 500 : -1,
    location: {x: 3, y: 3}, Movement: {movementMovesRemaining: 2}};
  const city = {id: {owner: 0, id: 7, type: 1}, location: {x: 3, y: 3}, population: o.applied ? 6 : 5, pendingPopulation: 0};
  const def = {UnitType: 'UNIT_TEST', FoundCity: kind === 'found', ExtractsArtifacts: ['excavate','research'].includes(kind), SpreadCharges: kind === 'spread' ? 3 : 0};
  const ctx = {queryArguments: {kind, unit_id: 10, expected_turn: 62, ability: null, unit_type: 100, component_type: 26,
      operation, operation_hash: 500, command: ['great_person','resettle'].includes(kind), args: {X: 3, Y: 3, UnitAbilityType: -1}, location: {x: 3, y: 3},
      baseline_cities: [], before_charges: 3, before_research: 0, continent: 1, source_city_id: 7, before_population: 5, before_pending_population: 0, ...o.args},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)},
    Players: {get: () => ({isTurnActive: !o.inactive, Units: {getUnits: () => o.lost || o.applied && ['found','great_person'].includes(kind) ? [] : [unit]},
      Cities: {getCities: () => kind === 'found' && !o.applied ? [] : [city]}, Culture: {getNumAgesResearched: () => o.applied ? 1 : 0},
      Armies: {getUnitReinforcementCommanderId: () => o.reinforcing ? 30 : -1}})},
    GameInfo: {Units: {lookup: () => o.wrongRole ? {} : def}, Constructibles: {lookup: () => ({ConstructibleType:'IMPROVEMENT_RUINS'})}, UnitOperations: {lookup: () => ({$hash: 500})}, UnitCommands: {lookup: () => ({$hash: 500})}, UnitAbilities: {lookup: () => null}},
    GameplayMap: {getGridWidth: () => 10, getGridHeight: () => 10, getRevealedState: () => o.hidden ? 0 : 2, getIndexFromLocation:l=>l.x+l.y*10,
      getOwner: () => o.neutralRuin ? 63 : kind === 'found' ? -1 : o.foreign ? 1 : 0, getContinentType: () => 1}, RevealedStates: {VISIBLE: 2},
    MapCities: {getCity: () => kind === 'found' || o.neutralRuin ? null : city.id}, MapUnits: {getUnits: () => [unit.id]},
    MapConstructibles: {getHiddenFilteredConstructibles: () => o.neutralRuin ? [{owner:63,id:99,type:2}] : []}, Constructibles: {getByComponentID: () => ({type:400})},
    Game: {turn: 62, age: 42}};
  const api = {canStart: (id, op, args, exclusion) => {calls.push({kind: 'check', id, op, args, exclusion}); if (o.changed) ctx.Game.turn++;
    return {Success: !o.blocked, Plots:o.notOffered?[]:[33], RequiresConfirmation: Boolean(o.confirm), ChargesRemaining: o.applied ? 2 : 3};},
    sendRequest: (id, op, args) => {calls.push({kind: 'send', id, op, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}};
  ctx.Game.UnitOperations = api; ctx.Game.UnitCommands = api;
  let data; try {data = vm.runInNewContext(fs.readFileSync(`civ7/${script}`, 'utf8'), ctx);} catch(e) {if (!o.sendThrows) throw e; data={error:e.message};}
  return JSON.parse(JSON.stringify({data,calls}));
}
test('fixed local civilian activities use exact owned current tile and one native operation/command', () => {
  for (const kind of Object.keys(OPS)) {
    const r=run({kind}); assert.equal(r.data.status,'submitted',kind); assert.equal(r.calls.at(-1).op,OPS[kind]);
    assert.equal(run({kind,applied:true},'local_civilian_state.js').data.activityObserved,true,kind);
  }
});
test('civilian activities reject stale/foreign/queued/reinforcing/hidden and native-blocked context', () => {
  for (const o of [{sent:true},{inactive:true},{queued:true},{reinforcing:true},{hidden:true},{blocked:true},{confirm:true},{changed:true},{wrongRole:true},{args:{expected_turn:61}},{args:{kind:'raw'}}]) {
    const r=run(o); assert.equal(r.data.status,'rejected',JSON.stringify(o)); assert.equal(r.calls.filter(c=>c.kind==='send').length,0);
  }
  assert.equal(run({kind:'research',foreign:true}).data.status,'rejected');
  assert.equal(run({kind:'resettle',notOffered:true}).data.status,'rejected');
  assert.equal(run({sendThrows:true}).calls.filter(c=>c.kind==='send').length,1);
  assert.equal(run({kind:'excavate'},'local_civilian_state.js').data.activityObserved,false);
});
test('excavation accepts a visible UI-filtered ruin outside any settlement even with native neutral-owner sentinel',()=>{
  assert.equal(run({kind:'excavate',neutralRuin:true}).data.status,'submitted');
  assert.equal(run({kind:'research',neutralRuin:true}).data.status,'rejected');
});
