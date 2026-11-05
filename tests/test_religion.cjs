const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const scriptPath = path.join(__dirname, '../civ7/religion.js');
const founderClass = 'BELIEF_CLASS_FOUNDER';
const enhancerClass = 'BELIEF_CLASS_ENHANCER';
const reliquaryClass = 'BELIEF_CLASS_RELIQUARY';
const pantheonClass = 'BELIEF_CLASS_PANTHEON';

function run({ created = true, canFound = false, earned = 3, pantheonChoices = 0,
  claimable = true, operationAllowed = true, inGame = true, playerId = 0,
  missionary = false, packed = false, spreadAllowed = true, charges = 2,
  packedValidCoordinates = false, offMap = false, unknownArmy = false, foreignArmy = false, foreignUnit = false,
  spreadDescriptions = ['Native current ability description'] } = {}) {
  assert.ok(fs.existsSync(scriptPath), 'bundled religion query exists');
  const definitions = [
    { $index: 0, $hash: -200, BeliefType: 'OWN_FOUNDER', BeliefClassType: founderClass, Name: 'Own founder', Description: 'Selected founder effect' },
    { $index: 1, $hash: 201, BeliefType: 'OWN_ENHANCER', BeliefClassType: enhancerClass, Name: 'Own enhancer', Description: 'Selected enhancer effect' },
    { $index: 2, $hash: 202, BeliefType: 'OWN_RELIC', BeliefClassType: reliquaryClass, Name: 'Own relic', Description: 'Selected reliquary effect' },
    { $index: 3, $hash: 203, BeliefType: 'FREE_FOUNDER', BeliefClassType: founderClass, Name: 'Free founder', Description: 'Founder effect' },
    { $index: 4, $hash: 204, BeliefType: 'FREE_ENHANCER', BeliefClassType: enhancerClass, Name: 'Free enhancer', Description: 'Enhancer effect' },
    { $index: 5, $hash: 205, BeliefType: 'FREE_RELIC', BeliefClassType: reliquaryClass, Name: 'Free relic', Description: 'Reliquary effect' },
    { $index: 6, $hash: 206, BeliefType: 'OWN_PANTHEON', BeliefClassType: pantheonClass, Name: 'Own pantheon', Description: 'Pantheon effect' },
    { $index: 7, $hash: 207, BeliefType: 'FREE_PANTHEON', BeliefClassType: pantheonClass, Name: 'Free pantheon', Description: 'New pantheon effect' },
  ];
  definitions.lookup = key => definitions.find(d => d.$hash === key || d.BeliefType === key);
  const religions = [
    { $hash: -1010, ReligionType: 'RELIGION_LOCAL', Name: 'Local default' },
    { $hash: 1020, ReligionType: 'RELIGION_MET', Name: 'Met default' },
    { $hash: 1030, ReligionType: 'RELIGION_UNMET', Name: 'Unmet default' },
  ];
  religions.lookup = key => religions.find(d => d.$hash === key || d.ReligionType === key);
  const religion = {
    hasCreatedReligion: () => created,
    canCreateReligion: () => canFound,
    getReligionType: () => created ? -1010 : -1,
    getReligionName: () => { assert.ok(created, 'no religion name queried before founding'); return 'My custom religion'; },
    getPantheons: () => [206],
    getNumPantheonsUnlocked: () => pantheonChoices,
    getBeliefs: () => created ? [-200, 201, 202] : [],
    getNumBeliefsEarned: () => earned,
    hasHolyCity: () => created,
    getHolyCityName: () => { assert.ok(created); return 'Holy City'; },
  };
  const cities = [
    { id: { owner: 0, id: 1, type: 1 }, name: 'Holy City', location: { x: 1, y: 2 }, isTown: false,
      Religion: { majorityReligion: -1010, urbanReligion: -1010, ruralReligion: -1010, isHolyCity: true } },
    { id: { owner: 0, id: 2, type: 1 }, name: 'Split Town', location: { x: 3, y: 4 }, isTown: true,
      Religion: { majorityReligion: -1, urbanReligion: 1020, ruralReligion: 1030, isHolyCity: false } },
  ];
  if (!created) cities[0].Religion = { majorityReligion: -1, urbanReligion: -1, ruralReligion: -1, isHolyCity: false };
  const player = { civilizationFullName: 'Our civilization', Religion: religion,
    Units: { getUnits: () => missionary ? [{ id: { owner: 0, id: 7 }, type: 'MISSIONARY', name: 'Missionary',
      isOnMap: !offMap, location: packed && !packedValidCoordinates ? {x: -1, y: -1} : {x: 1, y: 2} },
      ...(packed || unknownArmy || foreignArmy ? [{id: {owner: 0, id: 8}, type: 'COMMANDER', isCommanderUnit: true, armyId: 10}] : []),
      ...(foreignUnit ? [{id: {owner: 2, id: 99}, type: 'MISSIONARY', name: 'SECRET_FOREIGN_UNIT', location: {x: 1, y: 2}}] : [])] : [] },
    Cities: { getCities: () => cities }, Diplomacy: { hasMet: id => id === 1 } };
  const playerReads = [];
  const operations = [];
  const claimChecks = [];
  const result = vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), {
    UI: { isInGame: () => inGame }, GameContext: { localPlayerID: playerId },
    Players: { get: id => {
      playerReads.push(id);
      if (id === 0) return player;
      assert.equal(id, 1, 'unmet players must never be inspected');
      return { civilizationFullName: 'Known civilization', Religion: { getReligionName: () => 'Known custom religion' } };
    } },
    GameInfo: { Beliefs: definitions, Religions: religions, Units: { lookup: type => ({ UnitType: type, SpreadCharges: type === 'MISSIONARY' ? 3 : 0 }) } }, Locale: { compose: key => key },
    Armies: unknownArmy ? undefined : {get: armyId => {
      assert.equal(armyId, 10); return {owner: foreignArmy ? 2 : 0, getUnitIds: () => {
        assert.equal(foreignArmy, false, 'foreign army membership must not be inspected');
        return packed ? [{owner: 0, id: 7}, {owner: 2, id: 99}] : [];
      }};
    }},
    GameplayMap: { getGridWidth: () => 10, getGridHeight: () => 10 },
    PlayerOperationTypes: { FOUND_PANTHEON: 'FOUND_PANTHEON', ADD_BELIEF: 'ADD_BELIEF' },
    Game: {
      turn: 96,
      UnitOperations: { canStart: (id, operation, args, visible) => {
        assert.equal(packed, false); assert.equal(id.owner, 0); assert.equal(operation, 'UNITOPERATION_SPREAD_RELIGION');
        assert.equal(offMap, false); assert.equal(unknownArmy, false); assert.equal(foreignArmy, false);
        assert.equal(args.X, -9999); assert.equal(args.Y, -9999); assert.equal(args.UnitAbilityType, -1); assert.equal(visible, false);
        return { Success: spreadAllowed, ChargesRemaining: charges, FailureReasons: spreadAllowed ? [] : ['No spreads left'],
          AdditionalDescription: spreadDescriptions, Plots: [999] };
      } },
      Religion: {
        getPlayerFromReligion: type => ({ RELIGION_LOCAL: 0, RELIGION_MET: 1, RELIGION_UNMET: 3 })[type],
        isBeliefClaimable: index => { claimChecks.push(index); return claimable; },
      },
      PlayerOperations: { canStart: (id, operation, args, visible) => {
        assert.equal(id, 0);
        assert.equal(visible, false);
        assert.equal(typeof args.BeliefType, 'number');
        operations.push({ operation, hash: args.BeliefType });
        if (!claimable) return { Success: false, FailureReasons: ['Already claimed'], AdditionalDescription: ['Choose another belief'] };
        return operationAllowed ? { Success: true } : { Success: false, FailureReasons: ['Requirement not met'] };
      } },
    },
  });
  return { data: JSON.parse(JSON.stringify(result)), playerReads, operations, claimChecks };
}

test('returns selected pantheon and belief effects, custom religion, and holy city', () => {
  const { data } = run();
  assert.equal(data.turn, 96);
  assert.equal(data.hasCreatedReligion, true);
  assert.equal(data.religion.name, 'My custom religion');
  assert.equal(data.religion.id, 'RELIGION_LOCAL', 'negative hashes are valid religion identifiers');
  assert.equal(data.holyCityName, 'Holy City');
  assert.equal(data.pantheons[0].description, 'Pantheon effect');
  assert.deepEqual(data.beliefs.map(b => b.id), ['OWN_FOUNDER', 'OWN_ENHANCER', 'OWN_RELIC']);
  assert.equal(data.beliefs[0].description, 'Selected founder effect');
  assert.equal(data.beliefsEarned, 3);
});

test('owned religious units expose native current-state spread readiness and charge quotes, not target forecasts', () => {
  const data = run({ missionary: true }).data;
  assert.ok(data.religiousUnits, 'spread-unit readiness is exported');
  assert.equal(data.religiousUnits[0].instanceId, 7);
  assert.equal(data.religiousUnits[0].baseSpreadCharges, 3);
  assert.equal(data.religiousUnits[0].chargesRemaining, 2);
  assert.equal(data.religiousUnits[0].availableNow, true);
  assert.equal(data.religiousUnits[0].targetConversionPreview, null);
  assert.ok(!JSON.stringify(data.religiousUnits).includes('999'));
  const blocked = run({ missionary: true, spreadAllowed: false, charges: 0 }).data.religiousUnits[0];
  assert.equal(blocked.chargesRemaining, 0);
  assert.equal(blocked.availableNow, false);
  assert.deepEqual(blocked.failureReasons, ['No spreads left']);
  assert.equal(run({ missionary: true, packed: true }).data.religiousUnits[0].operationAllowed, null);
});

test('reports owned settlement urban/rural religions without inspecting unmet founders', () => {
  const { data, playerReads } = run();
  assert.equal(data.settlements.length, 2);
  assert.equal(data.settlements[0].isHolyCity, true);
  const split = data.settlements[1];
  assert.equal(split.majority, null);
  assert.equal(split.urban.name, 'Known custom religion');
  assert.equal(split.urban.founder.civilization, 'Known civilization');
  assert.equal(split.rural.name, 'Unmet default');
  assert.equal(split.rural.founder, null);
  assert.ok(!playerReads.includes(3));
});

test('claimable beliefs are not available when the picker class slot is full', () => {
  const { data, claimChecks } = run();
  const founder = data.choices.beliefs.find(b => b.id === 'FREE_FOUNDER');
  assert.equal(founder.claimable, true);
  assert.equal(founder.operationAllowed, true);
  assert.equal(founder.slotAvailable, false);
  assert.equal(founder.availableNow, false);
  assert.equal(data.slots[founderClass].capacity, 1);
  assert.equal(data.slots[founderClass].used, 1);
  assert.equal(data.slots[founderClass].free, 0);
  assert.ok(!data.choices.beliefs.some(b => b.id === 'OWN_FOUNDER'));
  assert.ok(claimChecks.includes(3), 'claimability uses the definition index, not hash');
});

test('earned founder slots and native checks jointly determine available choices', () => {
  const { data, operations } = run({ earned: 4 });
  const founder = data.choices.beliefs.find(b => b.id === 'FREE_FOUNDER');
  assert.equal(data.slots[founderClass].capacity, 2);
  assert.equal(founder.availableNow, true);
  assert.ok(operations.some(op => op.operation === 'ADD_BELIEF' && op.hash === 203));
  const locked = run({ earned: 4, claimable: false }).data.choices.beliefs.find(b => b.id === 'FREE_FOUNDER');
  assert.equal(locked.availableNow, false);
  assert.deepEqual(locked.failureReasons, ['Already claimed']);
  assert.deepEqual(locked.additionalDescriptions, ['Choose another belief']);
  const blocked = run({ earned: 4, operationAllowed: false }).data.choices.beliefs.find(b => b.id === 'FREE_FOUNDER');
  assert.equal(blocked.claimable, true);
  assert.equal(blocked.slotAvailable, true);
  assert.equal(blocked.operationAllowed, false);
  assert.equal(blocked.availableNow, false);
});

test('pantheon choices require a pending unlock as well as native operation eligibility', () => {
  const none = run().data.choices.pantheons[0];
  assert.equal(none.availableNow, false);
  const { data, operations } = run({ pantheonChoices: 1 });
  assert.equal(data.pantheonChoicesUnlocked, 1);
  assert.equal(data.choices.pantheons[0].id, 'FREE_PANTHEON');
  assert.equal(data.choices.pantheons[0].availableNow, true);
  assert.ok(operations.some(op => op.operation === 'FOUND_PANTHEON' && op.hash === 207));
  assert.equal(run({ pantheonChoices: 1, operationAllowed: false }).data.choices.pantheons[0].availableNow, false);
});

test('before founding, identity is null and founding choices are distinct from add-now', () => {
  const { data } = run({ created: false, canFound: true, earned: 0 });
  assert.equal(data.religion, null);
  assert.equal(data.holyCityName, null);
  assert.deepEqual(data.beliefs, []);
  assert.equal(data.canFoundReligion, true);
  const founder = data.choices.beliefs.find(b => b.id === 'FREE_FOUNDER');
  assert.equal(founder.availableNow, false);
  assert.equal(founder.availableForFounding, true);
  assert.equal(data.choices.beliefs.find(b => b.id === 'FREE_RELIC').availableForFounding, true);
  assert.equal(data.choices.beliefs.find(b => b.id === 'FREE_ENHANCER').availableForFounding, false);
  const locked = run({ created: false, canFound: false, earned: 0 }).data;
  assert.ok(locked.choices.beliefs.every(b => !b.availableNow && !b.availableForFounding));
});

test('requires an in-game local player', () => {
  assert.throws(() => run({ inGame: false }), /Load a save first/);
  assert.throws(() => run({ playerId: -1 }), /No local player/);
});

test('packed or off-map missionaries are never queried as deployed even with valid-looking coordinates', () => {
  for (const options of [{packed: true, packedValidCoordinates: true}, {offMap: true}, {unknownArmy: true}, {foreignArmy: true}]) {
    const unit = run({missionary: true, ...options}).data.religiousUnits[0];
    assert.equal(unit.location, null);
    assert.equal(unit.operationAllowed, null);
    assert.equal(unit.availableNow, false);
    assert.equal(unit.targetConversionPreview, null);
  }
});

test('religious readiness inspects only proven owned units and does not export foreign packed members', () => {
  const data = run({missionary: true, foreignUnit: true}).data;
  assert.deepEqual(data.religiousUnits.map(unit => unit.instanceId), [7]);
  assert.ok(!JSON.stringify(data).includes('SECRET'));
  const packedData = run({missionary: true, packed: true, packedValidCoordinates: true, foreignUnit: true}).data;
  assert.deepEqual(packedData.religiousUnits.map(unit => unit.instanceId), [7]);
  assert.ok(!JSON.stringify(packedData.religiousUnits).includes('99'));
});

test('spread readiness preserves native action-panel descriptions without parsing them into conversion forecasts', () => {
  const unit = run({missionary: true}).data.religiousUnits[0];
  assert.deepEqual(unit.additionalDescriptions, ['Native current ability description']);
  assert.equal(unit.targetConversionPreview, null);
  assert.deepEqual(run({missionary: true, spreadDescriptions: null}).data.religiousUnits[0].additionalDescriptions, []);
  assert.deepEqual(run({missionary: true, packed: true}).data.religiousUnits[0].additionalDescriptions, []);
});
