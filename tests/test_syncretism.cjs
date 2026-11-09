const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}) {
  const checks = [], unlockReads = [];
  const table = (rows, key) => ({lookup: value => rows.find(r => r[key] === value || r.$hash === value)});
  const culture = {getResearching: () => null, getAllAvailableNodeTypes: () => [], getGovernmentType: () => -1,
    getActiveTraditions: () => [], getUnlockedTraditions: () => [], getNumCultureSlots: () => 1, getNumAllCultureSlots: () => 3};
  const civs = [{$hash: 100, CivilizationType: 'CIV_MAYA', Name: 'Maya'}, {$hash: 200, CivilizationType: 'CIV_NORMAN', Name: 'Norman'},
    {$hash: 300, CivilizationType: 'CIV_NOT_OFFERED', Name: 'Not offered'}];
  const units = [{$hash: -20, UnitType: 'UNIT_KNIGHT_2', Name: 'Knight II', Description: 'Tier II cavalry effect'},
    {$hash: -21, UnitType: 'UNIT_KNIGHT', Name: 'Knight', Description: 'Tier I cavalry effect'}];
  const notification = {owner: o.foreign ? 1 : 0, id: 536, type: 20};
  const context = {
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0}, Locale: {compose: value => value},
    Players: {get: id => {assert.equal(id, 0, 'only local state is read'); return {
      Techs: culture, Culture: culture,
      Identity: {getWildcardPoints: () => 0, getSyncreticCivType: () => o.chosen ? 200 : -1,
        getSyncreticChoiceType: () => o.chosen ? 10 : -1},
      Units: {isReplacedUnitUnlocked: (type, first, second) => {assert.ok(type.startsWith('UNIT_')); assert.equal(first, true); assert.equal(second, false); return true;}},
    };}},
    SyncreticChoiceTypes: {SYNCRETIC_CHOICE_UNITS: 10, SYNCRETIC_CHOICE_INFRASTRUCTURE: 11, SYNCRETIC_CHOICE_SELF: 12},
    PlayerOperationTypes: {CHOOSE_SYNCRETISM_UNITS: 40, CHOOSE_SYNCRETISM_INFRASTRUCTURE: 41, CHOOSE_SYNCRETISM_SELF: 42},
    CultureSlotTypes: {POLICY_CULTURE_SLOT: 0, TRADITION_CULTURE_SLOT: 1, CRISIS_CULTURE_SLOT: 2}, ProgressionTreeNodeState: {},
    Database: {query: (db, query, type) => {assert.equal(db, 'config'); assert.match(query, /CivilizationItems/); return type === 'UNIT_KNIGHT' ? [{Description: 'Public base cavalry effect'}] : []; }},
    GameInfo: {Ages: {lookup: () => ({AgeType: 'AGE_EXPLORATION'})}, Attributes: [], StartingGovernments: [],
      Governments: {lookup: () => null},
      Civilizations: table(civs, 'CivilizationType'),
      LegacyCivilizationTraits: table(o.missingDefinition ? [] : [{$hash: -123, CivilizationType: 'CIV_NORMAN'}, {$hash: -456, CivilizationType: 'CIV_MAYA'}], 'LegacyCivilizationTraitType'),
      Units: table(units, 'UnitType'),
      Constructibles: table([{$hash: 50, ConstructibleType: 'BUILDING_BAILEY', Name: 'Bailey', Description: '+6 Culture'},
        {$hash: 51, ConstructibleType: 'IMPROVEMENT_FARM', Name: 'Farm', Description: '+4 Food'}], 'ConstructibleType'),
      UniqueQuarters: table([{$hash: 52, UniqueQuarterType: 'QUARTER_DONJON', Name: 'Donjon', Description: 'Free Chevaler'}], 'UniqueQuarterType'),
      Traditions: table([{$hash: 60, TraditionType: 'TRADITION_MAYA_SYNCRETISM_EXPLORATION', Name: 'Milpa I', Description: '+2 Science on Science Buildings on Vegetated Terrain'}], 'TraditionType'),
      CultureSlots: table([{$hash: 61, CultureSlotType: 'TRADITION_CULTURE_SLOT', Name: 'Tradition Slot'}], 'CultureSlotType'),
    },
    Game: {turn: 68, age: 1,
      Notifications: {getIdsForPlayer: () => o.noNotification ? [] : [notification], find: () => o.missingNotification ? null : ({Dismissed: Boolean(o.dismissed), Expired: Boolean(o.expired)}),
        getType: () => 20, getTypeName: () => 'NOTIFICATION_CHOOSE_SYNCRETISM'},
      Unlocks: {
        getSyncreticCivUnlocksForChoice: (id, kind) => {assert.equal(id, 0); unlockReads.push(kind); return o.missingOffer ? null : kind === 12 ? [-456] : [-123];},
        getUnitChoiceSyncreticUnlocks: civ => {assert.equal(civ, 'CIV_NORMAN'); return [{kind: 'KIND_UNIT', typeHash: -20}, {kind: 'KIND_UNIT', typeHash: -21}];},
        getInfrastructureChoiceSyncreticUnlocks: civ => {assert.equal(civ, 'CIV_NORMAN'); return [{kind: 'KIND_QUARTER', typeHash: 52},
          {kind: 'KIND_CONSTRUCTIBLE', typeHash: 50}, {kind: 'KIND_CONSTRUCTIBLE', typeHash: 51}, {kind: 'KIND_UNIT', typeHash: -20}];},
        getSelfChoiceSyncreticUnlocks: civ => {assert.equal(civ, 'CIV_MAYA'); return [{kind: 'KIND_TRADITION', typeHash: 60}, {kind: 'KIND_CULTURE_SLOT', typeHash: 61}];},
      },
      PlayerOperations: {
        sendRequest: () => {throw Error('Syncretism readout must never submit a choice');},
        canStart: (id, op, args, visible) => {
          assert.equal(id, 0); assert.equal(visible, false); assert.ok([40, 41, 42].includes(op));
          assert.equal(args.CivilizationType, op === 42 ? -456 : -123, 'use the signed native offered trait, not the civilization hash');
          checks.push({op, args});
          return {Success: !o.blocked, RequiresConfirmation: Boolean(o.confirmation), FailureReasons: o.blocked ? ['Blocked by native rule'] : [],
            Units: op === 40 && !o.missingWarningUnit ? [-20] : [], AdditionalDescription: op === 40 ? ['Will replace 7 Units.'] : []};
        },
      },
    },
  };
  if (o.noApi) delete context.Game.Unlocks;
  if (o.noIdentity) {
    const get = context.Players.get;
    context.Players.get = id => {const player = get(id); delete player.Identity.getSyncreticCivType; return player;};
  }
  const data = vm.runInNewContext(fs.readFileSync('civ7/research.js', 'utf8'), context);
  return {data: JSON.parse(JSON.stringify(data)), checks, unlockReads};
}

test('research reports exact native Syncretism civilizations by reward family without guessing from a catalog', () => {
  const {data, checks} = run();
  assert.ok(data.syncretism, 'Syncretism comparison is included in the existing research query');
  assert.equal(data.syncretism.status, 'ready'); assert.equal(data.syncretism.pending, true);
  assert.equal(data.syncretism.responseTool, 'choose_civ7_syncretism');
  assert.equal(data.syncretism.choiceMade, false); assert.equal(data.syncretism.chosen, null);
  assert.deepEqual(data.syncretism.choices.map(c => [c.kind, c.choiceId, c.civilization.id]),
    [['units', -123, 'CIV_NORMAN'], ['infrastructure', -123, 'CIV_NORMAN'], ['self', -456, 'CIV_MAYA']]);
  assert.equal(checks.length, 3); assert.ok(data.syncretism.choices.every(c => c.availableNow));
  assert.ok(!JSON.stringify(data.syncretism).includes('CIV_NOT_OFFERED'));
});

test('Affirmation includes the exact Tradition description AND the offered Tradition slot', () => {
  const state = run().data.syncretism;
  assert.ok(state);
  const rewards = state.choices.find(c => c.kind === 'self').rewards;
  assert.deepEqual(rewards.map(r => r.id), ['TRADITION_MAYA_SYNCRETISM_EXPLORATION', 'TRADITION_CULTURE_SLOT']);
  assert.equal(rewards[0].name, 'Milpa I'); assert.equal(rewards[0].description, '+2 Science on Science Buildings on Vegetated Terrain');
  assert.equal(rewards[1].name, 'Tradition Slot');
});

test('unit descriptions and native replacement warnings are preserved without interpreting unit-type hashes as instances', () => {
  const state = run().data.syncretism;
  assert.ok(state);
  const units = state.choices.find(c => c.kind === 'units');
  assert.deepEqual(units.rewards.map(r => r.description), ['Tier II cavalry effect', 'Public base cavalry effect']);
  assert.deepEqual(units.replacementWarnings, [{unitId: 'UNIT_KNIGHT_2', description: 'Will replace 7 Units.'}]);
  assert.equal(units.rewards[0].replacedUnitUnlocked, true);
  assert.deepEqual(state.choices.find(c => c.kind === 'infrastructure').rewards.map(r => r.id),
    ['QUARTER_DONJON', 'BUILDING_BAILEY', 'IMPROVEMENT_FARM', 'UNIT_KNIGHT_2']);
});

test('native permission is not an offered pending choice after dismissal, expiry, foreign notification or prior selection', () => {
  for (const o of [{noNotification: true}, {dismissed: true}, {expired: true}, {foreign: true}, {chosen: true}, {blocked: true}, {confirmation: true}]) {
    const state = run(o).data.syncretism;
    assert.ok(state); assert.ok(state.choices.every(c => c.availableNow === false), JSON.stringify(o));
  }
  const chosen = run({chosen: true}).data.syncretism;
  assert.equal(chosen.choiceMade, true); assert.equal(chosen.chosen.kind, 'units');
  assert.equal(chosen.chosen.civilization.id, 'CIV_NORMAN');
  assert.deepEqual(run({blocked: true}).data.syncretism.choices[0].failureReasons, ['Blocked by native rule']);
});

test('missing APIs, picker data or identity remain explicitly unknown and never become empty offered choices or availability', () => {
  for (const o of [{noApi: true}, {missingOffer: true}, {missingDefinition: true}, {noIdentity: true}]) {
    const {data} = run(o); assert.ok(data.syncretism);
    assert.notEqual(data.syncretism.status, 'ready');
    assert.ok(data.syncretism.choices.every(c => c.availableNow === false));
    assert.ok(data.policies, 'unavailable Syncretism must not break the rest of research');
  }
});

test('a missing notification record leaves pending status unknown, not a resolved chooser', () => {
  const state = run({missingNotification: true}).data.syncretism;
  assert.equal(state.pending, null);
  assert.notEqual(state.status, 'ready');
  assert.ok(state.choices.every(c => !c.availableNow));
});

test('a native replacement warning without a matching public unit type is retained but not misattributed', () => {
  const state = run({missingWarningUnit: true}).data.syncretism;
  assert.deepEqual(state.choices[0].replacementWarnings, [{unitId: null, description: 'Will replace 7 Units.'}]);
});
