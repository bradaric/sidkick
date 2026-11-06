const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}, script = 'promote_unit.js') {
  const calls = [];
  const promotion = {UnitPromotionType: 'PROMOTION_TEST', Name: 'Test promotion', Description: 'Test benefit', $hash: 701};
  const discipline = {UnitPromotionDisciplineType: 'DISCIPLINE_TEST', Name: 'Discipline', $hash: 601};
  const experience = {canPromote: !o.noPoint, getStoredPromotionPoints: 1, getStoredCommendations: 0,
    hasPromotion: () => o.acquired ?? false, canEarnPromotion: () => !o.locked};
  const unit = {id: {owner: o.foreign ? 1 : 0, id: 10, type: 26}, type: 500, isOnMap: !o.offMap,
    isCommanderUnit: true, armyId: 3, operationQueueSize: o.queued ? 1 : 0, Experience: experience};
  const player = {isTurnActive: !o.inactive, Units: {getUnits: () => o.missing ? [] : o.duplicate ? [unit, unit] : [unit]}};
  const context = {queryArguments: {unit_id: 10, discipline: 'DISCIPLINE_TEST', promotion: 'PROMOTION_TEST', expected_turn: 62, ...o.args},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sent ?? false},
    Players: {get: () => player}, Locale: {compose: x => x},
    GameInfo: {Units: {lookup: () => ({UnitType: 'UNIT_COMMANDER', PromotionClass: 'CLASS_TEST'})}, Unit_Stats: {lookup: () => null},
      UnitPromotions: {lookup: key => key === 'PROMOTION_TEST' ? promotion : null},
      UnitPromotionDisciplines: {lookup: key => key === 'DISCIPLINE_TEST' ? discipline : null},
      UnitPromotionClassSets: o.wrongClass ? [] : [{PromotionClassType: 'CLASS_TEST', UnitPromotionDisciplineType: 'DISCIPLINE_TEST'}],
      UnitPromotionDisciplineDetails: o.wrongDiscipline ? [] : [{UnitPromotionDisciplineType: 'DISCIPLINE_TEST', UnitPromotionType: 'PROMOTION_TEST'}]},
    Database: {makeHash: key => ({DISCIPLINE_TEST: 601, PROMOTION_TEST: 701})[key]},
    Armies: {get: () => ({owner: 0, getUnitIds: () => []})}, UnitCommandTypes: {PROMOTE: 900},
    Game: {turn: 62, age: 42, UnitCommands: {canStart: (id, command, args, exclusion) => {
      calls.push({kind: 'check', id, command, args, exclusion});
      if (o.changed) context.Game.turn++;
      if (o.changedPoints) experience.getStoredPromotionPoints = 0;
      return {Success: !o.blocked};
    }, sendRequest: (id, command, args) => {calls.push({kind: 'send', id, command, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('promotion uses an offered class/discipline pair, native eligibility and exact hashed UI arguments', () => {
  const {data, calls} = run();
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 10, type: 26}, command: 900,
    args: {PromotionType: 701, PromotionDisciplineType: 601}});
  assert.equal(data.expected.hasPromotion, true);
  assert.equal(run({acquired: true, noPoint: true}).data.status, 'already_active');
});

test('promotions reject unowned/nondeployed/queued units, mismatched trees, locks and stale native checks', () => {
  for (const o of [{foreign: true}, {offMap: true}, {missing: true}, {duplicate: true}, {queued: true}, {wrongClass: true},
    {wrongDiscipline: true}, {noPoint: true}, {locked: true}, {inactive: true}, {sent: true}, {changed: true},
    {changedPoints: true}, {blocked: true}, {args: {unit_id: true}}, {args: {expected_turn: 61}}, {args: {promotion: 'RAW'}}]) {
    const {data, calls} = run(o);
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});

test('targeted promotion state is read-only and records actual acquired status on the same unit', () => {
  for (const acquired of [false, true]) {
    const {data, calls} = run({acquired}, 'unit_promotion_state.js');
    assert.equal(data.hasPromotion, acquired);
    assert.equal(data.unitId, 10);
    assert.equal(calls.length, 0);
  }
});

test('unit readout exports exact discipline and promotion IDs, not just localized names', () => {
  const {data} = run({}, 'units.js');
  assert.equal(data.units[0].experience.promotionChoices[0].disciplineId, 'DISCIPLINE_TEST');
  const owned = run({acquired: true}, 'units.js').data.units[0].experience.promotions[0];
  assert.equal(owned.id, 'PROMOTION_TEST');
  assert.equal(owned.disciplineId, 'DISCIPLINE_TEST');
});
