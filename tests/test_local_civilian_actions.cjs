const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const OPS = {found: 'UNITOPERATION_FOUND_CITY',found_adjacent:'UNITOPERATION_FOUND_CITY_ADJACENT_PLOT',foreign_spread:'UNITOPERATION_SPREAD_RELIGION', excavate: 'UNITOPERATION_EXCAVATE', research: 'UNITOPERATION_RESEARCH_ARTIFACTS', spread: 'UNITOPERATION_SPREAD_RELIGION', great_person: 'UNITCOMMAND_ACTIVATE_GREAT_PERSON', resettle: 'UNITCOMMAND_RESETTLE', treat_sick: 'UNITCOMMAND_TREAT_SICK'};
function run(o = {}, script = 'local_civilian_action.js') {
  const calls = [], kind = o.kind ?? 'found', operation = OPS[kind];
  const location = o.location ?? {x: 3, y: 3};
  const founding=['found','found_adjacent'].includes(kind),foreignSpread=kind==='foreign_spread';
  const unit = {id: {owner: 0, id: 10, type: 26}, type: 100, isOnMap: true, isEmbarked: Boolean(o.embarked), isCommanderUnit: false,
    operationQueueSize: o.queued ? 1 : o.applied && ['excavate','research'].includes(kind) ? 1 : 0, getOperationType: () => o.applied ? 500 : -1,
    location, Movement: {movementMovesRemaining: 2}};
  const city = {id: o.cityIdentity ?? {owner: foreignSpread?1:0, id: 7, type: 1},owner:foreignSpread?1:0, location: kind==='found_adjacent'?{x:4,y:3}:location, population: o.applied ? 6 : 5, pendingPopulation: 0,
    Happiness: {hasUnrest: Object.hasOwn(o,'unrest') ? o.unrest : !o.applied}};
  if(foreignSpread)Object.defineProperty(city,'population',{get(){throw Error('Foreign population must not be read');}});
  const def = {UnitType: kind==='treat_sick'?'UNIT_PHYSICIAN':'UNIT_TEST', FoundCity: founding, ExtractsArtifacts: ['excavate','research'].includes(kind), SpreadCharges: ['spread','foreign_spread'].includes(kind) ? 3 : 0};
  const ctx = {queryArguments: {kind, unit_id: 10, expected_turn: 62, ability: null, unit_type: 100, component_type: 26,
      operation, operation_hash: 500, command: ['great_person','resettle','treat_sick'].includes(kind), args: {X: location.x, Y: location.y, UnitAbilityType: -1}, location,
       baseline_cities: [], before_charges: kind==='treat_sick'?null:3, before_research: 0, continent: 1, source_city_id: 7, before_population: 5, before_pending_population: 0,
       source_city: {owner:0,id:7,type:1}, before_unrest: true,
       ...(kind==='found_adjacent'?{x:4,y:3,location:{x:4,y:3}}:{}),...(foreignSpread?{target_player:1,target_city_id:7}:{}),...o.args},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)},
    Players: {get: () => ({isTurnActive: !o.inactive,Diplomacy:{hasMet:()=>!o.unmet}, Units: {getUnits: () => o.lost || o.applied && (founding||kind==='great_person') ? [] : [unit]},
      Cities: {getCities: () => founding&&!o.applied||foreignSpread ? [] : [city]}, Culture: {getNumAgesResearched: () => o.applied ? 1 : 0},
      Armies: {getUnitReinforcementCommanderId: () => o.reinforcing ? 30 : -1}})},
    GameInfo: {Units: {lookup: () => o.wrongRole ? {} : def}, Constructibles: {lookup: () => ({ConstructibleType:'IMPROVEMENT_RUINS'})}, UnitOperations: {lookup: () => ({$hash: 500})}, UnitCommands: {lookup: () => ({$hash: 500})}, UnitAbilities: {lookup: () => null}},
    GameplayMap: {getGridWidth: () => 10, getGridHeight: () => 10, getRevealedState: () => o.hidden ? 0 : 2, getIndexFromLocation:l=>l.x+l.y*10,
      getPlotDistance:()=>o.distant?2:1,isWater:()=>Boolean(o.waterTarget),getOwner: () => o.neutralRuin ? 63 : founding ? -1 : o.foreign||foreignSpread ? 1 : 0, getContinentType: () => 1}, RevealedStates: {VISIBLE: 2},
    MapCities: {getCity: () => founding || o.neutralRuin || o.noCity ? null : o.cityChanged && calls.some(c=>c.kind==='check') ? {...city.id,id:8} : city.id},Cities:{get:()=>city}, MapUnits: {getUnits: x => {
      if (kind==='found_adjacent'&&x===4) return [];
      if (o.unknownStack) return null;
      const owners = calls.some(c=>c.kind==='check') ? o.stackAfterCheck ?? o.stackOwners ?? [] : o.stackOwners ?? [];
      return [...(o.missingSource ? [] : [unit.id]), ...owners.map((owner,i)=>({owner,id:20+i,type:26}))];
    }},
    MapConstructibles: {getHiddenFilteredConstructibles: () => o.neutralRuin ? [{owner:63,id:99,type:2}] : []}, Constructibles: {getByComponentID: () => ({type:400})},
    Game: {turn: 62, age: 42}};
  const api = {canStart: (id, op, args, exclusion) => {calls.push({kind: 'check', id, op, args, exclusion}); if (o.changed) ctx.Game.turn++;
     if (o.unrestChanged) city.Happiness.hasUnrest = false;
     if (kind==='treat_sick') return {Success: !o.blocked, ...(o.confirm?{RequiresConfirmation:true}:{})};
     return {Success: !o.blocked, Plots:o.notOffered?[]:[33,34], RequiresConfirmation: Boolean(o.confirm), ChargesRemaining: Object.hasOwn(o,'charges') ? o.charges : o.applied ? 2 : 3};},
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
test('Treat the Sick accepts the real native Success-only result and sends exactly one current-tile command', () => {
  const {data, calls} = run({kind:'treat_sick'});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.filter(c=>c.kind==='send'), [{kind:'send',id:{owner:0,id:10,type:26},op:'UNITCOMMAND_TREAT_SICK',args:{X:3,Y:3,UnitAbilityType:-1}}]);
  assert.equal(data.verificationArguments.command, true);
  assert.equal(data.verificationArguments.before_charges, null);
  assert.deepEqual(data.verificationArguments.source_city, {owner:0,id:7,type:1});
  assert.equal(data.verificationArguments.before_unrest, true);
});
test('Treat the Sick rejects ineligible Physicians, unknown Unrest and changed settlements without submission', () => {
  for (const o of [{wrongRole:true},{noCity:true},{cityChanged:true},{foreign:true},{neutralRuin:true},
    {unrest:false},{unrest:null},{unrest:undefined},{unrestChanged:true},{blocked:true},{confirm:true},
    {queued:true},{reinforcing:true},{hidden:true},{embarked:true},{sent:true},{inactive:true},
    {changed:true},{stackOwners:[1]},{missingSource:true},{unknownStack:true},
    {args:{expected_turn:61}},{args:{ability:'UNLINKED_ABILITY'}}]) {
    const r = run({kind:'treat_sick',...o});
    assert.equal(r.data.status, 'rejected', JSON.stringify(o));
    assert.equal(r.calls.filter(c=>c.kind==='send').length, 0, JSON.stringify(o));
  }
});
test('Treat the Sick verifies Unrest removal in the exact owned settlement, with or without Physician consumption', () => {
  for (const o of [{applied:true},{applied:true,lost:true}]) {
    const r=run({kind:'treat_sick',...o},'local_civilian_state.js').data;
    assert.equal(r.activityObserved,true);
    assert.equal(r.unrestRemoved,true);
    assert.equal(r.unrestNow,false);
    assert.equal(r.chargeConsumed,false);
  }
  for (const o of [{},{queued:true},{lost:true},{applied:true,unrest:true},{applied:true,unrest:null},
    {applied:true,noCity:true},{applied:true,foreign:true},{applied:true,hidden:true},
    {applied:true,cityIdentity:{owner:0,id:8,type:1}},{applied:true,cityIdentity:{owner:0,id:7,type:2}},
    {applied:true,cityIdentity:{owner:1,id:7,type:1}},{applied:true,args:{before_unrest:false}}]) {
    const r=run({kind:'treat_sick',...o},'local_civilian_state.js').data;
    assert.equal(r.activityObserved,false,JSON.stringify(o));
    assert.equal(r.unrestRemoved,false,JSON.stringify(o));
  }
});
test('found at (4,9) uses the tile beneath the Settler, not adjacent founding or a movement workaround', () => {
  const location = {x: 4, y: 9};
  const {data, calls} = run({kind: 'found', location});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.filter(call => call.kind === 'send'), [{kind: 'send',
    id: {owner: 0, id: 10, type: 26}, op: 'UNITOPERATION_FOUND_CITY', args: {X: 4, Y: 9, UnitAbilityType: -1}}]);
  assert.ok(calls.every(call => call.op === 'UNITOPERATION_FOUND_CITY'));
  const after = run({kind: 'found', location, applied: true}, 'local_civilian_state.js').data;
  assert.equal(after.activityObserved, true);
  assert.equal(after.unitConsumed, true);
  assert.deepEqual(after.newSettlements[0].location, location);
});
test('adjacent founding is a fixed native offered adjacent plot, foreign spread binds exact visible city without private reads',()=>{
 const r=run({kind:'found_adjacent',embarked:true});assert.equal(r.data.status,'submitted');assert.deepEqual(r.calls.at(-1).args,{X:4,Y:3});
 for(const o of [{notOffered:true},{distant:true},{waterTarget:true},{args:{ability:'ANY'}}])assert.equal(run({kind:'found_adjacent',...o}).data.status,'rejected');
 for(const o of [{unmet:true},{args:{target_city_id:8}},{args:{target_player:2}}])assert.equal(run({kind:'foreign_spread',...o}).data.status,'rejected');
});
test('foreign spread permits the exact target owner stack and sends one fixed native operation',()=>{
  const r=run({kind:'foreign_spread',stackOwners:[1],charges:4});
  assert.equal(r.data.status,'submitted');
  const sends=r.calls.filter(c=>c.kind==='send');
  assert.equal(sends.length,1);
  assert.deepEqual(sends[0],{kind:'send',id:{owner:0,id:10,type:26},op:OPS.foreign_spread,args:{X:3,Y:3,UnitAbilityType:-1}});
  assert.equal(r.data.verificationArguments.before_charges,4);
});
test('foreign spread with a target owner stack retains exact target, source, native and revalidation guards',()=>{
  for (const o of [{stackOwners:[2]},{stackOwners:[1,2]},{stackAfterCheck:[2]},
    {missingSource:true},{unknownStack:true},{blocked:true},{confirm:true},{charges:0},{charges:null},
    {hidden:true},{unmet:true},{reinforcing:true},{queued:true},{args:{target_city_id:8}},{args:{target_player:2}}]) {
    const r=run({kind:'foreign_spread',stackOwners:[1],...o});
    assert.equal(r.data.status,'rejected',JSON.stringify(o));
    assert.equal(r.calls.filter(c=>c.kind==='send').length,0,JSON.stringify(o));
  }
});
test('other civilian activities still reject foreign stacks',()=>{
  for (const kind of Object.keys(OPS).filter(kind=>kind!=='foreign_spread')) {
    const r=run({kind,stackOwners:[1]});
    assert.equal(r.data.status,'rejected',kind);
    assert.equal(r.calls.filter(c=>c.kind==='send').length,0,kind);
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
