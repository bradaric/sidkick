const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run({ index = null, full = false, allowed = true, damaged = false, extraYield = false,
  quoteValue = 2, missingQuoteApi = false, missingDefinitionIndex = false, extraBuilding = false } = {}) {
  const script = path.join(__dirname, '../civ7/great_works.js');
  assert.ok(fs.existsSync(script), 'bundled Great Work inventory/relocation query exists');
  const calls = [];
  const quoteCalls = [];
  const city = { id: { owner: 0, id: 10 }, name: 'Home', Constructibles: {
    getGreatWorkBuildings: () => [{ constructibleID: { owner: 0, id: 9 }, slots: [{ greatWorkIndex: 5 }, {greatWorkIndex: full ? 6 : -1}] },
      ...(extraBuilding ? [{constructibleID: {owner: 0, id: 10}, slots: []}] : [])],
    getNumGreatWorkSlots: () => 2, getBuildingYieldFromGreatWorks: (yieldType, component) => { assert.ok([9, 10].includes(component.id)); assert.equal(yieldType, 20, 'only UI-supported Great Work yields are queried'); return 3; },
    getYieldFromGreatWork: missingQuoteApi ? undefined : (yieldType, definitionIndex) => {
      assert.equal(yieldType, 'YIELD_CULTURE', 'tooltip getter uses the public yield type string');
      assert.equal(definitionIndex, index + 100, 'definition index, not the owned instance index');
      quoteCalls.push({cityId: 10, yieldType, definitionIndex}); return quoteValue;
    },
  } };
  const data = vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    queryArguments: { great_work_index: index }, UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    Players: { get: id => { assert.equal(id, 0); return {
      Cities: { getCities: () => [city] }, Culture: { getNumWorksInArchive: () => 1, getArchivedGreatWork: () => 7 },
    }; } },
    Constructibles: { getByComponentID: component => { assert.equal(component.owner, 0); return { owner: 0, type: component.id === 9 ? 99 : 100, damaged }; } },
    GameInfo: { GreatWorks: { lookup: type => ({ $index: missingDefinitionIndex ? undefined : Number(type.split('_')[1]) + 100,
      GreatWorkType: type, Name: type, GreatWorkObjectType: 'RELIC' }) },
      Constructibles: { lookup: type => ({ ConstructibleType: 'TEMPLE', Name: 'Temple' }) }, Yields: [{ $hash: 20, YieldType: 'YIELD_CULTURE' }, ...(extraYield ? [{ $hash: 999, YieldType: 'UNSUPPORTED_YIELD' }] : [])],
    },
    PlayerOperationTypes: { MOVE_GREAT_WORK: 'MOVE' },
    Game: { turn: 8, Culture: { getGreatWorkType: value => { assert.ok([5, 6, 7].includes(value), 'only proven-owned indices are inspected'); return `WORK_${value}`; } },
      PlayerOperations: { sendRequest: () => { throw Error('Moves are forbidden'); }, canStart: (id, op, args, visible) => {
        assert.equal(id, 0); assert.equal(op, 'MOVE'); assert.equal(visible, false);
        assert.equal(args.Player1, 0); assert.equal(args.DestinationCity, 10);
        assert.ok([99, 100].includes(args.DestinationBuilding), 'use constructible type, not component ID');
        calls.push(args); return { Success: allowed, FailureReasons: allowed ? [] : ['Wrong work type'] };
      } },
    },
  });
  return { data: JSON.parse(JSON.stringify(data)), calls, quoteCalls };
}

test('Great Work inventory exposes owned instance indices and building totals without a relocation matrix', () => {
  const { data, calls } = run();
  assert.deepEqual(data.works.map(work => work.instanceIndex).sort(), [5, 7]);
  assert.equal(data.buildings[0].currentGreatWorkYields.YIELD_CULTURE, 3);
  assert.equal(data.buildings[0].free, 1);
  assert.equal(data.destinations, null);
  assert.equal(calls.length, 0);
});

test('archived and displayed moves use picker-equivalent arguments without inventing marginal yields', () => {
  const archive = run({ index: 7 });
  assert.ok(!('SourceCity' in archive.calls[0]));
  assert.equal(archive.data.destinations[0].availableNow, true);
  assert.equal(archive.data.destinations[0].netYieldChange, null);
  const displayed = run({ index: 5 });
  assert.equal(displayed.calls[0].SourceCity, 10);
  assert.equal(displayed.data.destinations[0].alreadyHere, true);
  assert.equal(displayed.data.destinations[0].availableNow, false);
});

test('full slots and native rejection never become available destinations', () => {
  assert.equal(run({ index: 7, full: true }).data.destinations[0].availableNow, false);
  const blocked = run({ index: 7, allowed: false }).data.destinations[0];
  assert.equal(blocked.availableNow, false);
  assert.deepEqual(blocked.failureReasons, ['Wrong work type']);
});

test('foreign/unknown indices and invalid selectors are rejected before relocation checks', () => {
  assert.throws(() => run({ index: 999 }), /owned/i);
  assert.throws(() => run({ index: true }), /index/i);
  assert.throws(() => run({ index: -1 }), /index/i);
});

test('damaged buildings stay unavailable even if the native permission check is permissive', () => {
  const target = run({ index: 7, damaged: true }).data.destinations[0];
  assert.equal(target.operationAllowed, true);
  assert.equal(target.availableNow, false);
});

test('building yield evidence stays within the six yield families used by the Great Works UI', () => {
  assert.deepEqual(run({ extraYield: true }).data.buildings[0].currentGreatWorkYields, {YIELD_CULTURE: 3});
});

test('targeted city/work-type yield quotes use the tooltip getter without claiming building or marginal gains', () => {
  const {data, quoteCalls} = run({index: 7, extraBuilding: true, extraYield: true});
  const quote = data.destinations[0].cityWorkTypeYieldQuote;
  assert.ok(quote, 'native city/work-type quote is exported');
  assert.deepEqual(quote, {workType: 'WORK_7', yields: {YIELD_CULTURE: 2}, buildingSpecific: false});
  assert.deepEqual(data.destinations[1].cityWorkTypeYieldQuote, quote);
  assert.equal(quoteCalls.length, 1, 'same-city destinations reuse the same quote');
  assert.ok(data.destinations.every(destination => destination.netYieldChange === null));
  assert.equal(data.buildings[0].currentGreatWorkYields.YIELD_CULTURE, 3, 'whole-building totals remain distinct');
  assert.equal(run().quoteCalls.length, 0, 'inventory does not build an all-work quote matrix');
});

test('missing quote APIs/definition indices stay unknown and native zero/negative/unknown quotes are preserved', () => {
  for (const options of [{missingQuoteApi: true}, {missingDefinitionIndex: true}]) {
    const {data, quoteCalls} = run({index: 5, ...options});
    assert.equal(data.destinations[0].cityWorkTypeYieldQuote, null);
    assert.equal(quoteCalls.length, 0);
  }
  for (const value of [0, -2, null, NaN]) {
    const quote = run({index: 7, quoteValue: value}).data.destinations[0].cityWorkTypeYieldQuote;
    assert.ok(quote);
    assert.equal(quote.yields.YIELD_CULTURE, Number.isFinite(value) ? value : null);
  }
});
