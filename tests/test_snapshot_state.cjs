const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run({ inGame = true, playerId = 0, player = { civilizationType: 20, leaderType: 30 } } = {}) {
  const script = path.join(__dirname, '../civ7/snapshot_state.js');
  assert.ok(fs.existsSync(script), 'bundled snapshot boundary query exists');
  return JSON.parse(JSON.stringify(vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    UI: { isInGame: () => inGame }, GameContext: { localPlayerID: playerId },
    Players: { get: id => { assert.equal(id, 0); return player; } },
    Game: { turn: 140, age: -123 },
  })));
}

test('snapshot state reads only local stable identity and turn/Age markers', () => {
  assert.deepEqual(run(), { turn: 140, age: -123, playerId: 0, civilization: 20, leader: 30 });
});

test('snapshot state rejects loading screens and missing local players', () => {
  assert.throws(() => run({ inGame: false }), /save/i);
  assert.throws(() => run({ playerId: -1 }), /local player/i);
  assert.throws(() => run({ player: null }), /local player/i);
});
