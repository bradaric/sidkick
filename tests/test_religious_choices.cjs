const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
function run(o = {}, script = 'religious_choice.js') {
  const calls = [], kind = o.kind ?? 'pantheon', applied = Boolean(o.applied);
  let founded = Object.hasOwn(o, 'founded') ? o.founded : kind === 'belief' || kind === 'found' && applied;
  let beliefReads = 0;
  const beliefs = [{BeliefType: 'BELIEF_TEST', BeliefClassType: o.enhancer ? 'BELIEF_CLASS_ENHANCER' : kind === 'pantheon' ? 'BELIEF_CLASS_PANTHEON' : 'BELIEF_CLASS_FOUNDER', $index: 1, $hash: 100}];
  beliefs.lookup = n => beliefs.find(d => d.BeliefType === n || d.$hash === n);
  const religionType = o.custom ? 'RELIGION_CUSTOM_5' : 'RELIGION_TEST';
  const religionHash = o.custom ? -205 : 200;
  const religion = {hasCreatedReligion: () => founded, canCreateReligion: () => !o.cannotFound,
    getReligionType: () => o.wrongIcon ? 201 : religionHash,
    ...(!o.missingName ? {getReligionName: () => o.observedName ?? 'CUSTOM_NAME_KEY'} : {}),
    getPantheons: () => Object.hasOwn(o, 'rawPantheons') ? o.rawPantheons : kind === 'pantheon' && applied ? [100] : [],
    getBeliefs: () => {
      beliefReads++;
      assert.ok(founded || !o.forbidUnfoundedBeliefRead, 'beliefs must not be queried before founding');
      return Object.hasOwn(o, 'rawBeliefs') ? o.rawBeliefs : kind === 'belief' && applied ? [100] : [];
    },
    getNumPantheonsUnlocked: () => Object.hasOwn(o, 'unlocked') ? o.unlocked : o.noSlots ? 0 : 1,
    getNumBeliefsEarned: () => Object.hasOwn(o, 'earned') ? o.earned : o.noSlots ? 0 : 1};
  const ctx = {queryArguments: {kind, choice: kind === 'found' ? religionType : 'BELIEF_TEST', expected_turn: 62,
      baseline_pantheons: [], baseline_beliefs: [], expected_religion: kind !== 'pantheon' ? religionType : null,
      expected_pantheons: kind === 'pantheon' ? [100] : [], expected_beliefs: kind === 'belief' ? [100] : [], ...o.args},
    UI: {isInGame: () => true}, Locale: {compose: key => key === 'CUSTOM_NAME_KEY' ? 'Butterfly Effect' : key},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)},
    Players: {get: () => ({isTurnActive: !o.inactive, Religion: religion})}, GameInfo: {Beliefs: beliefs,
      Religions: {lookup: n => n === 201 ? {ReligionType: 'RELIGION_OTHER', $hash: 201} :
        n === religionHash || n === religionType ? {ReligionType: religionType, $hash: religionHash, RequiresCustomName: Boolean(o.custom)} : null}},
    PlayerOperationTypes: {FOUND_PANTHEON: 10, ADD_BELIEF: 20, FOUND_RELIGION: 30},
    Game: {turn: o.turn ?? 62, age: 42, Religion: {isBeliefClaimable: () => !o.claimed, hasBeenFounded: () => Boolean(o.claimed)},
      PlayerOperations: {canStart: (id, operation, args, exclusion) => {calls.push({kind: 'check', id, operation, args, exclusion}); if (o.changed) ctx.Game.turn++;
        if (o.changedClaim) o.claimed = true;
        if (o.foundedDuringCheck) founded = true;
        return {Success: !o.blocked, RequiresConfirmation: Boolean(o.confirm)};}, sendRequest: (id, operation, args) => {calls.push({kind: 'send', id, operation, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data; try {data = vm.runInNewContext(fs.readFileSync(`civ7/${script}`, 'utf8'), ctx);} catch(e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls, beliefReads}));
}
test('pantheon, available belief and religion founding are fixed single native operations with exact collection readback', () => {
  for (const kind of ['pantheon', 'belief', 'found']) {
    const r = run({kind}); assert.equal(r.data.status, 'submitted', kind);
    assert.equal(r.calls.at(-1).operation, kind === 'pantheon' ? 10 : kind === 'belief' ? 20 : 30);
    assert.equal(run({kind, applied: true}, 'religious_choice_state.js').data.choiceObserved, true);
  }
});

test('custom founding sends the exact butterfly icon hash and name once, without choosing beliefs', () => {
  const {data, calls} = run({kind: 'found', custom: true, args: {custom_name: 'Butterfly Effect'}});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(calls.map(c => c.kind), ['check', 'send']);
  assert.deepEqual(calls.at(-1), {kind: 'send', id: 0, operation: 30,
    args: {ReligionType: -205, ReligionCustomName: 'Butterfly Effect'}});
  assert.deepEqual(calls[0].args, calls[1].args);
  assert.equal(data.verificationArguments.expected_custom_name, 'Butterfly Effect');
  assert.equal(data.verificationArguments.expected_religion, 'RELIGION_CUSTOM_5');
  assert.deepEqual(data.verificationArguments.expected_beliefs, []);
});

test('founding and pantheon selection do not require a nonexistent pre-founding belief collection', () => {
  for (const kind of ['found', 'pantheon']) for (const rawBeliefs of [null, undefined]) {
    const r = run({kind, custom: kind === 'found', turn: 15, rawBeliefs, rawPantheons: [-300],
      args: {expected_turn: 15, ...(kind === 'found' ? {custom_name: 'Butterfly Effect'} : {})}});
    assert.equal(r.data.status, 'submitted');
    assert.equal(r.beliefReads, 0, 'no getBeliefs call before religion exists');
    assert.deepEqual(r.data.before.beliefs, []);
    assert.deepEqual(r.data.verificationArguments.expected_beliefs, []);
    assert.deepEqual(r.data.verificationArguments.expected_pantheons, kind === 'found' ? [-300] : [-300, 100]);
    assert.equal(r.calls.filter(c => c.kind === 'send').length, 1);
  }
  assert.equal(run({kind: 'found', custom: true, forbidUnfoundedBeliefRead: true,
    args: {custom_name: 'Butterfly Effect'}}).data.status, 'submitted');
});

test('invalid owned religious state identifies the failing fields without submitting or defaulting them', () => {
  for (const [extra, field] of [[{rawPantheons: null}, 'pantheons'], [{rawPantheons: [100, 100]}, 'pantheons'],
    [{kind: 'belief', rawBeliefs: null}, 'beliefs'], [{kind: 'belief', rawBeliefs: ['bad']}, 'beliefs'],
    [{unlocked: null}, 'pantheonChoicesUnlocked'], [{earned: -1}, 'beliefsEarned'],
    [{founded: null}, 'hasCreatedReligion']]) {
    const r = run({kind: 'found', ...extra});
    assert.equal(r.data.status, 'rejected', field);
    assert.ok(Array.isArray(r.data.invalidFields), 'field-specific diagnostics are returned');
    assert.ok(r.data.invalidFields.includes(field), field);
    assert.ok(r.data.reason.includes(field), 'diagnostic is visible in the rejection reason');
    assert.equal(r.calls.length, 0);
  }
});

test('a religion appearing during founding validation still prevents submission', () => {
  const r = run({kind: 'found', custom: true, foundedDuringCheck: true, forbidUnfoundedBeliefRead: true,
    args: {custom_name: 'Butterfly Effect'}});
  assert.equal(r.data.status, 'rejected');
  assert.equal(r.calls.some(c => c.kind === 'send'), false);
});

test('readback skips beliefs until actually founded and never mistakes pending founding for success', () => {
  const pending = run({kind: 'found', custom: true, forbidUnfoundedBeliefRead: true,
    args: {expected_custom_name: 'Butterfly Effect'}}, 'religious_choice_state.js');
  assert.equal(pending.data.choiceObserved, false);
  assert.deepEqual(pending.data.beliefs, []);
  assert.equal(pending.beliefReads, 0);
  const pantheon = run({kind: 'pantheon', applied: true, forbidUnfoundedBeliefRead: true}, 'religious_choice_state.js');
  assert.equal(pantheon.data.choiceObserved, true);
  assert.equal(pantheon.beliefReads, 0);
});

test('post-founding readback still refuses missing beliefs or unknown founded status', () => {
  assert.throws(() => run({kind: 'found', applied: true, rawBeliefs: null}, 'religious_choice_state.js'), /beliefs/);
  assert.throws(() => run({kind: 'found', founded: null}, 'religious_choice_state.js'), /hasCreatedReligion/);
});

test('custom names follow native UI length and markup restrictions and are only accepted for custom founding', () => {
  for (const custom_name of ['', '   ', 'a'.repeat(17), '🦋'.repeat(9), 'bad|name', 'bad<name', 'bad>name',
    'bad[name', 'bad]name', 'bad\nname', 'bad\x00name', '\ud800', true, 12]) {
    const r = run({kind: 'found', custom: true, args: {custom_name}});
    assert.equal(r.data.status, 'rejected', JSON.stringify(custom_name));
    assert.equal(r.calls.length, 0);
  }
  for (const kind of ['pantheon', 'belief', 'found']) {
    const r = run({kind, args: {custom_name: 'Butterfly Effect'}});
    assert.equal(r.data.status, 'rejected', kind);
    assert.equal(r.calls.length, 0);
  }
  assert.equal(run({kind: 'found', custom: true}).data.status, 'rejected', 'custom icons require an explicit name');
  assert.equal(run({kind: 'found', custom: true, args: {custom_name: '🦋'.repeat(8)}}).data.status, 'submitted');
});

test('custom founding retains native refusal, confirmation, claimability and stale-context rejection', () => {
  for (const extra of [{claimed: true}, {cannotFound: true}, {blocked: true}, {confirm: true},
    {changed: true}, {changedClaim: true}, {sent: true}, {inactive: true}]) {
    const r = run({kind: 'found', custom: true, args: {custom_name: 'Butterfly Effect'}, ...extra});
    assert.equal(r.data.status, 'rejected', JSON.stringify(extra));
    assert.equal(r.calls.some(c => c.kind === 'send'), false);
  }
  const uncertain = run({kind: 'found', custom: true, args: {custom_name: 'Butterfly Effect'}, sendThrows: true});
  assert.equal(uncertain.calls.filter(c => c.kind === 'send').length, 1);
});

test('an already founded custom religion is a no-op only for the exact icon and displayed name, never a rename', () => {
  const base = {kind: 'found', custom: true, applied: true, args: {custom_name: 'Butterfly Effect'}};
  assert.equal(run(base).data.status, 'already_active');
  for (const extra of [{observedName: 'Different name'}, {wrongIcon: true}, {missingName: true}]) {
    const r = run({...base, ...extra});
    assert.equal(r.data.status, 'rejected');
    assert.equal(r.calls.length, 0);
  }
});

test('custom founding readback requires exact resolved name and icon, not submission or icon alone', () => {
  const base = {kind: 'found', custom: true, applied: true, args: {expected_custom_name: 'Butterfly Effect'}};
  const applied = run(base, 'religious_choice_state.js');
  assert.equal(applied.data.choiceObserved, true);
  assert.equal(applied.data.religionName, 'Butterfly Effect');
  assert.equal(applied.calls.length, 0);
  for (const extra of [{applied: false}, {observedName: 'Wrong name'}, {wrongIcon: true}, {missingName: true}]) {
    const r = run({...base, ...extra}, 'religious_choice_state.js');
    assert.equal(r.data.choiceObserved, false, JSON.stringify(extra));
    assert.equal(r.calls.length, 0);
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
