const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(o = {}) {
  const calls = [];
  const wars = o.wars ?? [[1, 4], [3, 4]];
  const identities = {1: ['Japan', 'José Rizal'], 3: ['Maurya', 'Ashoka'], 4: ['Buganda', 'Hatshepsut']};
  const local = {Diplomacy: {
    hasMet: id => [1, 3, 4, 6].includes(id),
    isAtWarWith: id => id === o.localWarWith,
    hasAllied: id => id === 3,
    getRelationshipLevelName: () => 'Neutral', getRelationshipLevel: () => 0,
    getRelationshipEnum: () => 0, getPlayerRelationshipHistory: () => [],
  }, Stats: {getNetYield: () => 10}};
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/diplomacy.js'), 'utf8'), {
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0}, Locale: {compose: key => key},
    Players: {getAliveIds: () => [0, 1, 3, 4, 5, 6], get: id => {
      assert.notEqual(id, 5, 'never inspect an unmet player');
      if (id === 0) return local;
      if (id === 6) return {isMajor: false, get Diplomacy() {throw Error('No minor diplomacy reads');}};
      const [civilizationFullName, leaderName] = identities[id];
      return {isMajor: true, civilizationFullName, leaderName,
        Diplomacy: id === o.missingDiplomacy ? undefined : {
          isAtWarWith: id === o.missingGetter ? undefined : peer => {
            assert.ok(peer !== id && Object.hasOwn(identities, peer), 'only other met majors are checked');
            calls.push([id, peer]);
            if (id === o.throwingPlayer && peer === 3) throw Error('Unavailable war state');
            if (id === o.unknownPlayer && peer === 3) return o.unknownValue;
            return wars.some(pair => pair.includes(id) && pair.includes(peer));
          },
        },
        get Cities() {throw Error('No foreign inventory reads');},
      };
    }},
    GameInfo: {Leaders: {lookup: () => null}}, YieldTypes: {YIELD_DIPLOMACY: 1},
    DiplomacyActionTargetTypes: {NO_DIPLOMACY_TARGET: -1},
    DiplomacyActionGroups: {NO_DIPLOMACY_ACTION_GROUP: -1},
    Game: {turn: 46, Diplomacy: {
      getProjectDataForUI: () => [], getPlayerEvents: () => o.events ?? [],
      getCompletionData: () => {throw Error('Do not expand third-party event disclosure');},
    }, DiplomacyDeals: {hasPendingDeal: () => false, getDealIds: () => []}},
  });
  return {data: JSON.parse(JSON.stringify(data)), calls};
}

test('all met majors expose current named opponents without ally notifications or war events', () => {
  const {data, calls} = run();
  const [jose, ally, third] = data.majorPlayers;
  assert.equal(jose.atWar, false, 'existing atWar still means war with us');
  assert.equal(jose.allied, false);
  assert.deepEqual(jose.warOpponents, [{playerId: 4, civilization: 'Buganda', leader: 'Hatshepsut'}]);
  assert.deepEqual(ally.warOpponents, jose.warOpponents);
  assert.deepEqual(third.warOpponents, [
    {playerId: 1, civilization: 'Japan', leader: 'José Rizal'},
    {playerId: 3, civilization: 'Maurya', leader: 'Ashoka'},
  ]);
  assert.ok(data.majorPlayers.every(row => row.warOpponentsComplete === true));
  assert.equal(calls.length, 6);
  assert.match(data.warScope, /atWar.*local/i);
  assert.match(data.warScope, /met major/i);
});

test('peace and ended third-party war events do not invent current opponents', () => {
  const {data} = run({wars: [], localWarWith: 1, events: [{
    uniqueID: 80, initialPlayer: 1, targetPlayer: 4,
    actionTypeName: 'DIPLOMACY_ACTION_DECLARE_WAR', gameTurnEnd: 45, revealed: true, hidden: false,
  }]});
  assert.equal(data.majorPlayers[0].atWar, true);
  assert.ok(data.majorPlayers.every(row => row.warOpponents.length === 0 && row.warOpponentsComplete === true));
  assert.ok(data.majorPlayers.every(row => row.ongoingActions.length === 0));
});

test('unavailable or nonboolean war reads remain incomplete, not confirmed peace', () => {
  for (const options of [{missingDiplomacy: 1}, {missingGetter: 1}, {throwingPlayer: 1},
    ...[undefined, null, 0, 1, 'false'].map(unknownValue => ({unknownPlayer: 1, unknownValue}))]) {
    const {data} = run(options);
    const jose = data.majorPlayers[0];
    assert.equal(jose.warOpponentsComplete, false);
    if (options.missingDiplomacy || options.missingGetter) assert.deepEqual(jose.warOpponents, []);
    else assert.deepEqual(jose.warOpponents.map(row => row.playerId), [4], 'retain positively observed wars');
    assert.equal(data.majorPlayers[1].warOpponentsComplete, true, 'one unavailable leader does not break the readout');
  }
});
