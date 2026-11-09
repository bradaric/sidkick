const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

const TYPE = 'NOTIFICATION_CHOOSE_TOWN_PROJECT';
const ARGS = {notification_id: 499, component_type: 20, expected_turn: 63};
const READ = {...ARGS, town_id: 524295, town_component_type: 1, added_on_turn: 63,
  before_growth_type: -1126871330, before_project_type: -1, before_gold: 1000};

function game(o = {}) {
  const calls = [];
  const id = {owner: o.foreign ? 1 : 0, id: 499, type: o.wrongComponent ? 21 : 20};
  const town = {id: {owner: 0, id: 524295, type: 1}, name: 'Quirigua', isTown: !o.notTown,
    Growth: {growthType: o.specialized ? 200 : -1126871330, projectType: o.specialized ? 201 : -1}};
  const notice = {Type: 99, Target: {...town.id}, AddedOnTurn: 63, Dismissed: Boolean(o.dismissed), Expired: Boolean(o.expired)};
  if (o.foreignTarget) notice.Target.owner = 1;
  if (o.unknownActivity) notice.Dismissed = null;
  const player = {isTurnActive: !o.inactive, Treasury: {goldBalance: 1000}, Cities: {getCities: () => o.missingTown ? [] : o.duplicateTown ? [town, town] : [town]}};
  let removed = Boolean(o.missing);
  const forbidden = () => {throw Error('No focus change, generic dismissal, UI navigation, spending or turn advancement');};
  const context = {
    queryArguments: ARGS, UI: {isInGame: () => !o.notInGame, Player: {selectCity: forbidden}},
    Configuration: {getGame: () => ({isAnyMultiplayer: Boolean(o.multiplayer)}),
      getUser: () => ({isAutoEndTurn: o.unknownAuto ? undefined : Boolean(o.autoEndTurn)})},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent), sendTurnComplete: forbidden},
    Players: {get: owner => {assert.equal(owner, 0); return player;}}, Locale: {compose: text => text},
    CityOperationTypes: {CONSIDER_TOWN_PROJECT: 900},
    Game: {turn: 63, age: -123, CityCommands: {sendRequest: forbidden}, PlayerOperations: {sendRequest: forbidden},
      Notifications: {
        getIdsForPlayer: () => o.unknownInventory ? null : removed ? [] : o.duplicateNotice ? [id, id] : o.twoTownReminders ? [id, {...id, id: 500}] : [id],
        find: () => o.missingRecord ? null : notice, getType: () => 99, getTypeName: () => o.type ?? TYPE,
        dismiss: forbidden, activate: forbidden,
      }, CityOperations: {
        canStart: (city, operation, args, exclude) => {
          calls.push(['check', city, operation, args, exclude]);
          if (o.changedTurn) context.Game.turn++;
          if (o.changedTarget) notice.Target.id++;
          if (o.changedRecord) notice.AddedOnTurn--;
          if (o.changedFocus) town.Growth.projectType++;
          if (o.changedGold) player.Treasury.goldBalance--;
          if (o.vanish) removed = true;
          if (o.autoAfterCheck) context.Configuration.getUser = () => ({isAutoEndTurn: true});
          return {Success: !o.blocked, RequiresConfirmation: Boolean(o.confirm), InsufficientFunds: Boolean(o.insufficient)};
        },
        sendRequest: (city, operation, args) => {
          calls.push(['send', city, operation, args]);
          if (!o.noClear) notice.Dismissed = true;
          if (o.removeOnSend) removed = true;
          if (o.focusAfterSend) town.Growth.projectType++;
          if (o.goldAfterSend) player.Treasury.goldBalance--;
          if (o.sendThrows) throw Error('Lost acknowledgement');
        },
      }},
  };
  const sandbox = vm.createContext(context);
  function run(script = 'acknowledge_town_focus.js', args = ARGS) {
    sandbox.queryArguments = args;
    return JSON.parse(JSON.stringify(vm.runInContext(fs.readFileSync(`civ7/${script}`, 'utf8'), sandbox)));
  }
  return {calls, run, town, notice, player};
}

test('one native consider operation acknowledges the exact owned Town reminder and preserves Growing or specialized focus', () => {
  for (const specialized of [false, true]) {
    const g = game({specialized}), before = {...g.town.Growth}, result = g.run();
    assert.equal(result.status, 'submitted');
    assert.deepEqual(JSON.parse(JSON.stringify(g.calls)), [
      ['check', {owner: 0, id: 524295, type: 1}, 900, {}, false],
      ['send', {owner: 0, id: 524295, type: 1}, 900, {}],
    ]);
    assert.deepEqual(g.town.Growth, before);
    const after = g.run('town_focus_reminder_state.js', result.verificationArguments);
    assert.equal(after.acknowledged, true); assert.equal(after.focusUnchanged, true); assert.equal(after.goldUnchanged, true);
    assert.equal(g.calls.length, 2, 'verification is read-only');
  }
});

test('foreign, ambiguous, missing, wrong-type and unsafe-context reminders never reach native permission checks', () => {
  for (const o of [{foreign: true}, {wrongComponent: true}, {foreignTarget: true}, {duplicateNotice: true}, {twoTownReminders: true},
    {missing: true}, {unknownInventory: true}, {missingRecord: true}, {notTown: true}, {missingTown: true}, {duplicateTown: true},
    {unknownActivity: true}, {inactive: true}, {sent: true}, {notInGame: true}, {multiplayer: true}, {autoEndTurn: true}, {unknownAuto: true},
    {type: 'NOTIFICATION_CHOOSE_PRODUCTION'}, {type: 'NOTIFICATION_DIPLOMATIC_ACTION_AGENDA'}]) {
    const g = game(o); assert.equal(g.run().status, 'rejected', JSON.stringify(o)); assert.equal(g.calls.length, 0);
  }
  for (const change of [{notification_id: true}, {component_type: true}, {expected_turn: 62}]) {
    const g = game(); assert.equal(g.run('acknowledge_town_focus.js', {...ARGS, ...change}).status, 'rejected');
    assert.equal(g.calls.length, 0);
  }
});

test('permission, reminder identity, focus, Gold and context are rechecked before the single acknowledgement', () => {
  for (const o of [{blocked: true}, {confirm: true}, {insufficient: true}, {changedTurn: true}, {changedTarget: true},
    {changedRecord: true}, {changedFocus: true}, {changedGold: true}, {vanish: true}, {autoAfterCheck: true}]) {
    const g = game(o); assert.equal(g.run().status, 'rejected', JSON.stringify(o));
    assert.equal(g.calls.filter(c => c[0] === 'send').length, 0);
  }
  for (const o of [{dismissed: true}, {expired: true}]) {
    const g = game(o); assert.equal(g.run().status, 'already_active'); assert.equal(g.calls.length, 0);
  }
  const lost = game({sendThrows: true}); assert.throws(() => lost.run(), /Lost acknowledgement/);
  assert.equal(lost.calls.filter(c => c[0] === 'send').length, 1);
});

test('readback cannot equate changed focus, currency or unverified identities with safe acknowledgement', () => {
  for (const o of [{removeOnSend: true}, {noClear: true}, {focusAfterSend: true}, {goldAfterSend: true}]) {
    const g = game(o), submitted = g.run(), after = g.run('town_focus_reminder_state.js', submitted.verificationArguments);
    assert.equal(after.acknowledged, !o.noClear);
    assert.equal(after.focusUnchanged, !o.focusAfterSend); assert.equal(after.goldUnchanged, !o.goldAfterSend);
  }
  for (const o of [{unknownInventory: true}, {duplicateNotice: true}, {wrongComponent: true}, {missingRecord: true},
    {foreignTarget: true}, {type: 'NOTIFICATION_CHOOSE_PRODUCTION'}, {missingTown: true}, {duplicateTown: true}]) {
    assert.throws(() => game(o).run('town_focus_reminder_state.js', READ), /inventory|identity|type|target|Town/i);
  }
});
