const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}) {
  const calls = [];
  const def = {TraditionType: 'CARD_TEST', CultureSlotType: o.cardType ?? 'TRADITION_CULTURE_SLOT', $index: 7};
  const active = {10: o.policies ?? ['CARD_POLICY'], 20: o.traditions ?? [], 30: o.crises ?? []};
  const capacities = {10: o.policyCapacity ?? 1, 20: o.traditionCapacity ?? 1, 30: o.crisisCapacity ?? 1};
  const definition = value => ['CARD_TEST', 7, 700].includes(value) ? def :
    typeof value === 'string' && value.startsWith('CARD_') ? {TraditionType: value} : null;
  const culture = {getUnlockedTraditions: () => o.locked ? [] : [700],
    getActiveTraditions: slot => active[slot], getNumCultureSlots: slot => capacities[slot],
    canSwapCultureSlot: () => !o.noSwap};
  const context = {queryArguments: {card: 'CARD_TEST', active: true, slot: 'tradition', expected_turn: 60, ...o.args},
    UI: {isInGame: () => !o.notInGame}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => o.sent ?? false},
    Players: {get: () => ({isTurnActive: !o.inactive, Culture: culture})},
    CultureSlotTypes: {POLICY_CULTURE_SLOT: 10, TRADITION_CULTURE_SLOT: 20, CRISIS_CULTURE_SLOT: 30},
    GameInfo: {Traditions: {lookup: definition}}, PlayerOperationTypes: {CHANGE_TRADITION: 900},
    PlayerOperationParameters: {Activate: 1, Deactivate: 2}, Game: {turn: 60, age: 42,
      PlayerOperations: {canStart: (id, type, args, exclusion) => {
        calls.push({kind: 'check', id, type, args, exclusion});
        if (o.changed) context.Game.turn++;
        if (o.changedInventory) active[20].push('CARD_OTHER');
        return {Success: !o.blocked};
      }, sendRequest: (id, type, args) => {calls.push({kind: 'send', id, type, args}); if (o.sendThrows) throw Error('Lost acknowledgement');}}}};
  let data;
  try {data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/set_culture_card.js'), 'utf8'), context);}
  catch (e) {if (!o.sendThrows) throw e; data = {error: e.message};}
  return JSON.parse(JSON.stringify({data, calls}));
}

test('tradition/crisis card activation uses its native definition INDEX and preserves all other groups', () => {
  for (const [slot, cardType, expectedField] of [['tradition', 'TRADITION_CULTURE_SLOT', 'activeTraditions'],
    ['crisis', 'CRISIS_CULTURE_SLOT', 'activeCrises']]) {
    const {data, calls} = run({cardType, args: {slot}});
    assert.equal(data.status, 'submitted');
    assert.deepEqual(calls.at(-1), {kind: 'send', id: 0, type: 900, args: {TraditionType: 7, Action: 1}});
    assert.deepEqual(data.expected[expectedField], ['CARD_TEST']);
    assert.deepEqual(data.expected.activePolicies, ['CARD_POLICY']);
  }
});

test('ordinary policies enter tradition slots only when ordinary slots are full and tradition capacity is free', () => {
  const {data} = run({cardType: 'POLICY_CULTURE_SLOT'});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(data.expected.activeTraditions, ['CARD_TEST']);
  assert.equal(run({cardType: 'POLICY_CULTURE_SLOT', policyCapacity: 2}).data.status, 'rejected');
  assert.equal(run({cardType: 'POLICY_CULTURE_SLOT', args: {slot: 'policy'}, policyCapacity: 2}).data.status, 'submitted');
  assert.equal(run({args: {slot: 'policy'}}).data.status, 'rejected');
});

test('removing an ordinary card from a tradition slot touches no other active cards', () => {
  const {data, calls} = run({cardType: 'POLICY_CULTURE_SLOT', traditions: ['CARD_TEST'], args: {active: false}});
  assert.equal(data.status, 'submitted');
  assert.deepEqual(data.expected.activeTraditions, []);
  assert.deepEqual(calls.at(-1).args, {TraditionType: 7, Action: 2});
  assert.equal(run({traditions: ['CARD_TEST']}).data.status, 'already_active');
  assert.equal(run({args: {active: false}}).data.status, 'already_inactive');
});

test('card writes reject ambiguous inventories, implicit migrations, capacity, lock and stale/native failures', () => {
  for (const o of [{traditionCapacity: 0}, {locked: true}, {noSwap: true}, {blocked: true}, {changed: true},
    {changedInventory: true}, {notInGame: true}, {inactive: true}, {sent: true}, {traditions: ['CARD_TEST', 'CARD_TEST']},
    {policies: ['CARD_TEST']}, {traditions: ['CARD_POLICY'], policyCapacity: 2},
    {args: {slot: 'raw'}}, {args: {active: 1}}, {args: {expected_turn: 59}}]) {
    const {data, calls} = run(o);
    assert.equal(data.status, 'rejected', JSON.stringify(o));
    assert.equal(calls.filter(c => c.kind === 'send').length, 0);
  }
  assert.equal(run({sendThrows: true}).calls.filter(c => c.kind === 'send').length, 1);
});
