const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
function run(o = {}, script = 'choose_city_state_bonus.js') {
  const calls = [], ctx = {queryArguments: {city_state_id: 3, bonus: 'BONUS_TEST', expected_turn: 62, expected_bonus: 100},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)},
    Players: {get: id => id === 0 ? {isTurnActive: !o.inactive, Diplomacy: {hasMet: () => !o.unmet}} : {isMinor: !o.major, Influence: {getSuzerain: () => o.foreignSuzerain ? 1 : 0}}},
    GameInfo: {CityStateBonuses: {lookup: () => ({CityStateBonusType: 'BONUS_TEST', $hash: 100})}}, PlayerOperationTypes: {CHOOSE_CITY_STATE_BONUS: 10},
    Game: {turn: 62, age: 42, CityStates: {getCityStateBonusToSelect: () => o.applied || o.noPending ? -1 : 3, getBonusType: () => o.applied ? 100 : -1, canHaveBonus: () => !o.ineligible},
      PlayerOperations: {canStart: (id, operation, args, exclusion) => {calls.push({kind: 'check', id, operation, args, exclusion}); if (o.changed) ctx.Game.turn++;
        return {Success: !o.blocked, RequiresConfirmation: Boolean(o.confirm)};}, sendRequest: (id, operation, args) => {calls.push({kind: 'send', id, operation, args});}}}};
  return JSON.parse(JSON.stringify({data: vm.runInNewContext(fs.readFileSync(`civ7/${script}`, 'utf8'), ctx), calls}));
}
test('pending city-state bonus requires local suzerainty, exact eligibility and native permission', () => {
  const r=run(); assert.equal(r.data.status, 'submitted'); assert.deepEqual(r.calls.at(-1).args, {OtherPlayer: 3, CityStateBonusType: 100});
  assert.equal(run({applied: true}, 'city_state_bonus_state.js').data.bonusObserved, true);
  assert.equal(run({}, 'city_state_bonus_state.js').data.bonusObserved, false);
  for (const o of [{sent: true}, {inactive: true}, {unmet: true}, {major: true}, {foreignSuzerain: true}, {noPending: true}, {ineligible: true}, {changed: true}, {blocked: true}, {confirm: true}]) {
    const r=run(o); assert.equal(r.data.status, 'rejected'); assert.equal(r.calls.filter(c=>c.kind==='send').length,0);
  }
});
