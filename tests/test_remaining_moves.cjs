const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const script = fs.readFileSync(path.join(__dirname, '../civ7/remaining_moves.js'), 'utf8');

function run(allowed, status, unit, setting) {
  return vm.runInNewContext(script, {
    Configuration: {getUser: () => ({isUnitCycle_RemainingMoves: setting})},
  })(allowed, status, unit);
}

test('remaining-moves predicate matches the native preference and movement truth table', () => {
  for (const setting of [true, false]) {
    for (const canMove of [true, false]) {
      for (const hasMoved of [true, false]) {
        assert.equal(run(true, 'identified', {canMove, hasMoved}, setting).remainingMovesBlocker,
          setting || canMove && !hasMoved);
      }
    }
  }
});

test('unknown permission, identity, preference and movement flags stay unknown', () => {
  for (const args of [
    [null, 'identified', {canMove: true, hasMoved: false}, false],
    [true, 'unavailable', null, false], [true, 'unverified', null, true],
    [true, 'identified', {}, false],
    [true, 'identified', {canMove: true, hasMoved: false}, undefined],
  ]) assert.equal(run(...args).remainingMovesBlocker, null);
  assert.equal(run(false, 'unavailable', null, undefined).remainingMovesBlocker, false);
  assert.equal(run(true, 'none', null, undefined).remainingMovesBlocker, false);
});
