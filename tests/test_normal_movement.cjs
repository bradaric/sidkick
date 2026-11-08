const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function run(options = {}, script = 'move_unit.js') {
  const calls = [];
  const unit = {id: {owner: 0, id: 7, type: 26}, type: 101, isOnMap: true, isDead: false,
    isCommanderUnit: false, location: {x: 1, y: 1}, operationQueueSize: options.queue ?? 0,
    getOperationType: () => options.operation ?? 900,
    Movement: {movementMovesRemaining: options.moves ?? 3}, Health: {damage: options.damage ?? 0},
    isEmbarked: false, ...options.unit};
  const forbidden = () => {throw Error('No hidden terrain/occupancy inspection or full-path gate');};
  const context = {
    queryArguments: {unit_id: 7, x: 20, y: 20, expected_turn: 1, mode: 'normal', ...options.args},
    UI: {isInGame: () => true}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => false},
    Configuration: {getGame: () => ({isAnyMultiplayer: Boolean(options.multiplayer)})},
    Players: {get: () => ({isTurnActive: !options.inactive, Units: {getUnits: () => options.missing ? [] : [unit]},
      Diplomacy: {willMoveStartWar: () => options.warUnknown ? {} : {Success: Boolean(options.war)}}})},
    GameInfo: {Units: {lookup: () => ({Domain: options.domain ?? 'DOMAIN_LAND', UnitType: options.unitType})}},
    GameplayMap: {getGridWidth: () => 80, getGridHeight: () => 50,
      getRevealedState: () => options.visibility ?? -1,
      isWater: forbidden, getOwner: forbidden, getTerrainType: forbidden},
    MapUnits: {getUnits: forbidden}, MapCities: {getDistrict: forbidden},
    Units: {getPathTo: forbidden, getReachableMovement: forbidden, getReachableTargets: forbidden},
    RevealedStates: {HIDDEN: -1, REVEALED: 0, VISIBLE: 2},
    UnitOperationMoveModifiers: {NONE: 0, ATTACK: 1, MOVE_IGNORE_UNEXPLORED_DESTINATION: options.missingModifier ? undefined : 2},
    UnitOperationTypes: {MOVE_TO: 900}, CombatTypes: {NO_COMBAT: 0},
    Game: {turn: 1, age: 42, Combat: {testAttackInto: () => {
      assert.equal(options.visibility, 2, 'hidden/fogged combat state is not probed');
      return options.combat ? 1 : 0;
    }}, UnitOperations: {
      canStart: (id, type, args, visible) => {
        calls.push({kind: 'check', id, type, args, visible});
        if (options.changedTurn) context.Game.turn++;
        return {Success: !options.blocked, RequiresConfirmation: Boolean(options.confirm), FailureReasons: ['Native restriction']};
      },
      sendRequest: (id, type, args) => calls.push({kind: 'send', id, type, args}),
    }},
  };
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7', script), 'utf8'), context);
  return JSON.parse(JSON.stringify({data, calls}));
}

test('normal movement allows distant unexplored, fogged and visible destinations without scanning hidden tiles', () => {
  for (const domain of ['DOMAIN_LAND', 'DOMAIN_SEA']) for (const visibility of [-1, 0, 2]) {
    const {data, calls} = run({visibility, domain});
    assert.equal(data.status, 'submitted');
    assert.deepEqual(calls.at(-1), {kind: 'send', id: {owner: 0, id: 7, type: 26}, type: 900,
      args: {X: 20, Y: 20, Modifiers: 2}});
    assert.equal(calls.filter(call => call.kind === 'send').length, 1);
    assert.equal(calls.at(-1).args.Modifiers & 1, 0, 'never adds ATTACK');
  }
});

test('native orders can replace an existing queue and queue movement with no moves remaining', () => {
  for (const options of [{queue: 1}, {moves: 0}, {queue: 1, moves: 0}]) {
    assert.equal(run(options).data.status, 'submitted');
  }
  assert.equal(run({warUnknown: true}).data.status, 'submitted', 'like native UI, only an explicit war indication blocks movement');
});

test('ordinary movement has no river/embarkation terrain gate for civilian or combat unit roles', () => {
  for (const unitType of ['UNIT_SCOUT', 'UNIT_SETTLER', 'UNIT_MERCHANT', 'UNIT_MISSIONARY', 'UNIT_EXPLORER', 'UNIT_RIFLEMAN']) {
    const options = {unitType, visibility: 2, unit: {isEmbarked: true}};
    const allowed = run(options);
    assert.equal(allowed.data.status, 'submitted', unitType);
    assert.equal(allowed.calls.filter(call => call.kind === 'send').length, 1);
    // Fixture isWater/getTerrainType throw: normal movement must rely on native legality.
    const blocked = run({...options, blocked: true});
    assert.equal(blocked.data.status, 'rejected');
    assert.equal(blocked.data.rejectionSource, 'native');
    assert.equal(blocked.calls.some(call => call.kind === 'send'), false);
  }
});

test('native legality, war/attack confirmation and stale identity guards remain with clear rejection sources', () => {
  for (const options of [{blocked: true}, {confirm: true}, {war: true}, {visibility: 2, combat: true},
    {changedTurn: true}, {missingModifier: true}, {missing: true}, {multiplayer: true}, {inactive: true},
    {args: {expected_turn: 0}}, {args: {x: 80}}, {unit: {isOnMap: false}}, {unit: {isCommanderUnit: true}}]) {
    const {data, calls} = run(options);
    assert.equal(data.status, 'rejected', JSON.stringify(options));
    assert.equal(calls.some(call => call.kind === 'send'), false);
    assert.ok(['native', 'sidkick'].includes(data.rejectionSource));
  }
  assert.equal(run({blocked: true}).data.rejectionSource, 'native');
});

test('normal movement readback reports actual position, queue and damage without inspecting the world', () => {
  const {data, calls} = run({queue: 1, moves: 0, damage: 20}, 'normal_move_state.js');
  assert.equal(data.present, true);
  assert.deepEqual(data.location, {x: 1, y: 1});
  assert.equal(data.queueSize, 1);
  assert.equal(data.operation, 900);
  assert.equal(data.damage, 20);
  assert.equal(calls.length, 0);
  assert.equal(run({missing: true}, 'normal_move_state.js').data.present, false);
});
