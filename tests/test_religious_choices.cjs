const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
function run(o = {}, script = 'religious_choice.js') {
  const calls = [], kind = o.kind ?? 'pantheon', applied = Boolean(o.applied), founded = kind === 'belief' || kind === 'found' && applied;
  const beliefs = [{BeliefType: 'BELIEF_TEST', BeliefClassType: o.enhancer ? 'BELIEF_CLASS_ENHANCER' : kind === 'pantheon' ? 'BELIEF_CLASS_PANTHEON' : 'BELIEF_CLASS_FOUNDER', $index: 1, $hash: 100}];
  beliefs.lookup = n => beliefs.find(d => d.BeliefType === n || d.$hash === n);
  const religion = {hasCreatedReligion: () => founded, canCreateReligion: () => !o.cannotFound, getReligionType: () => 200,
    getPantheons: () => kind === 'pantheon' && applied ? [100] : [], getBeliefs: () => kind === 'belief' && applied ? [100] : [],
    getNumPantheonsUnlocked: () => o.noSlots ? 0 : 1, getNumBeliefsEarned: () => o.noSlots ? 0 : 1};
  const ctx = {queryArguments: {kind, choice: kind === 'found' ? 'RELIGION_TEST' : 'BELIEF_TEST', expected_turn: 62,
      baseline_pantheons: [], baseline_beliefs: [], expected_religion: kind !== 'pantheon' ? 'RELIGION_TEST' : null,
      expected_pantheons: kind === 'pantheon' ? [100] : [], expected_beliefs: kind === 'belief' ? [100] : [], ...o.args},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)},
    Players: {get: () => ({isTurnActive: !o.inactive, Religion: religion})}, GameInfo: {Beliefs: beliefs,
      Religions: {lookup: n => n === 200 || n === 'RELIGION_TEST' ? {ReligionType: 'RELIGION_TEST', $hash: 200} : null}},
    PlayerOperationTypes: {FOUND_PANTHEON: 10, ADD_BELIEF: 20, FOUND_RELIGION: 30},
    Game: {turn: 62, age: 42, Religion: {isBeliefClaimable: () => !o.claimed, hasBeenFounded: () => Boolean(o.claimed)},
      PlayerOperations: {canStart: (id, operation, args, exclusion) => {calls.push({kind: 'check', id, operation, args, exclusion}); if (o.changed) ctx.Game.turn++;
        return {Success: !o.blocked, RequiresConfirmation: Boolean(o.confirm)};}, sendRequest: (id, operation, args) => {calls.push({kind: 'send', id, operation, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data; try {data = vm.runInNewContext(fs.readFileSync(`civ7/${script}`, 'utf8'), ctx);} catch(e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}
test('pantheon, available belief and religion founding are fixed single native operations with exact collection readback', () => {
  for (const kind of ['pantheon', 'belief', 'found']) {
    const r = run({kind}); assert.equal(r.data.status, 'submitted', kind);
    assert.equal(r.calls.at(-1).operation, kind === 'pantheon' ? 10 : kind === 'belief' ? 20 : 30);
    assert.equal(run({kind, applied: true}, 'religious_choice_state.js').data.choiceObserved, true);
  }
});
test('religious choices cannot bypass class slots, claimability, founding state or stale/native context', () => {
  for (const kind of ['pantheon', 'belief', 'found']) for (const o of [{sent: true}, {inactive: true}, {changed: true}, {blocked: true}, {confirm: true}, {args: {expected_turn: 61}}, {args: {kind: 'raw'}}]) {
    const r = run({kind, ...o}); assert.equal(r.data.status, 'rejected'); assert.equal(r.calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({noSlots: true}).data.status, 'rejected');
  assert.equal(run({kind: 'belief', noSlots: true}).data.status, 'rejected');
  assert.equal(run({kind: 'belief', enhancer: true}).data.status, 'rejected');
  assert.equal(run({kind: 'belief', claimed: true}).data.status, 'rejected');
  assert.equal(run({kind: 'found', claimed: true}).data.status, 'rejected');
  assert.equal(run({kind: 'found', cannotFound: true}).data.status, 'rejected');
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});
