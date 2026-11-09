const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function game(o = {}) {
  const calls = [];
  let selectedCiv = o.chosen ? 200 : -1, selectedKind = o.chosen ? 10 : -1, offers = [-123];
  const notificationId = {owner: 0, id: 536, type: 20};
  let inventory = o.noPending ? [] : [notificationId];
  const notification = {Dismissed: false, Expired: false, AddedOnTurn: 68, ...o.notification};
  let warnings = o.replacements ? ['Will replace 7 Units.'] : [], checks = 0;
  const rewards = [{kind: o.kind === 'units' || o.infrastructureUnit ? 'KIND_UNIT' : o.kind === 'infrastructure' ? 'KIND_CONSTRUCTIBLE' : 'KIND_TRADITION', typeHash: -77}];
  const player = {isTurnActive: !o.inactive, Treasury: {goldBalance: 600}, DiplomacyTreasury: {diplomacyBalance: 400},
    Identity: {getSyncreticCivType: () => selectedCiv, getSyncreticChoiceType: () => selectedKind}};
  const trait = {$hash: -123, CivilizationType: 'CIV_MAYA'};
  const civ = {$hash: 200, CivilizationType: 'CIV_MAYA', Name: 'Maya'};
  const context = {
    UI: {isInGame: () => !o.menu}, GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent)},
    Configuration: {getGame: () => ({isAnyMultiplayer: Boolean(o.multiplayer)}), getUser: () => ({isAutoEndTurn: Boolean(o.autoEndTurn)})},
    Players: {get: id => {assert.equal(id, 0); return player;}},
    SyncreticChoiceTypes: {SYNCRETIC_CHOICE_UNITS: 10, SYNCRETIC_CHOICE_INFRASTRUCTURE: 11, SYNCRETIC_CHOICE_SELF: 12},
    PlayerOperationTypes: {CHOOSE_SYNCRETISM_UNITS: 40, CHOOSE_SYNCRETISM_INFRASTRUCTURE: 41, CHOOSE_SYNCRETISM_SELF: 42},
    GameInfo: {LegacyCivilizationTraits: {lookup: value => value === -123 && !o.missingDefinition ? trait : null},
      Civilizations: {lookup: value => ['CIV_MAYA', 200].includes(value) ? civ : null}},
    Game: {turn: 68, age: -300,
      Notifications: {
        getIdsForPlayer: () => o.duplicate ? [...inventory, notificationId] : inventory,
        getType: id => {assert.equal(id.id, 536); return 20;}, getTypeName: () => o.wrongNotification ? 'NOTIFICATION_CHOOSE_GOVERNMENT' : 'NOTIFICATION_CHOOSE_SYNCRETISM',
        find: () => o.missingNotification ? null : notification,
      },
      Unlocks: {
        getSyncreticCivUnlocksForChoice: (id, flag) => {assert.equal(id, 0); assert.equal(flag, {units: 10, infrastructure: 11, self: 12}[o.kind ?? 'self']); return o.unoffered ? [123] : offers;},
        getUnitChoiceSyncreticUnlocks: () => rewards,
        getInfrastructureChoiceSyncreticUnlocks: () => rewards,
        getSelfChoiceSyncreticUnlocks: () => rewards,
      },
      PlayerOperations: {
        canStart: (id, operation, args, visible) => {
          checks++;
          assert.equal(id, 0); assert.equal(operation, {units: 40, infrastructure: 41, self: 42}[o.kind ?? 'self']);
          assert.equal(visible, false); assert.deepEqual(JSON.parse(JSON.stringify(args)), {CivilizationType: -123});
          o.change?.({context, player, notification, rewards, trait, civ,
            setChosen: () => {selectedCiv = 200; selectedKind = 12;}, setOffers: () => {offers = [];},
            setWarnings: () => {warnings = ['Will replace 8 Units.'];}});
          if (o.changeWarnings && checks === 2) warnings = ['Will replace 8 Units.'];
          return {Success: !o.blocked, RequiresConfirmation: Boolean(o.confirmation), InsufficientFunds: Boolean(o.funds),
            Cost: o.cost ?? 0, Units: warnings.length || o.unitWarningWithoutText ? [-77] : [], AdditionalDescription: [...warnings]};
        },
        sendRequest: (id, operation, args) => {
          calls.push({id, operation, args: JSON.parse(JSON.stringify(args))});
          if (!o.noApply) {
            selectedCiv = o.wrongCiv ? 201 : 200;
            selectedKind = o.wrongKind ? 99 : {units: 10, infrastructure: 11, self: 12}[o.kind ?? 'self'];
            if (!o.keepPending) notification.Dismissed = true;
          }
          if (o.spendGold) player.Treasury.goldBalance--;
          if (o.throwSend) throw Error('Lost submission response');
        },
      }},
  };
  const sandbox = vm.createContext(context);
  const run = (file, args) => {
    assert.ok(fs.existsSync(`civ7/${file}`), `bundled ${file} exists`);
    sandbox.queryArguments = args;
    return JSON.parse(JSON.stringify(vm.runInContext(fs.readFileSync(`civ7/${file}`, 'utf8'), sandbox)));
  };
  return {calls, context, player, notification, run, removeNotification: () => {inventory = [];},
    submit: (args = {}) => run('choose_syncretism.js', {kind: o.kind ?? 'self', choice_id: -123, expected_turn: 68,
      confirm_unit_replacements: false, ...args})};
}

test('Affirmation submits the exact signed legacy-trait hash once and verifies selected identity and cleared pending choice', () => {
  const g = game(), submitted = g.submit();
  assert.equal(submitted.status, 'submitted');
  assert.deepEqual(g.calls, [{id: 0, operation: 42, args: {CivilizationType: -123}}]);
  const state = g.run('syncretism_state.js', submitted.verificationArguments);
  assert.equal(state.syncretismObserved, true);
  assert.equal(g.calls.length, 1);
});

test('all three families use their own operation and require acknowledgement whenever units may be replaced', () => {
  for (const kind of ['units', 'infrastructure', 'self']) {
    const g = game({kind}), submitted = g.submit({confirm_unit_replacements: true});
    assert.equal(submitted.status, 'submitted');
    assert.equal(g.calls[0].operation, {units: 40, infrastructure: 41, self: 42}[kind]);
    assert.equal(g.run('syncretism_state.js', submitted.verificationArguments).syncretismObserved, true);
  }
  for (const o of [{kind: 'units'}, {kind: 'infrastructure', infrastructureUnit: true}, {replacements: true}, {unitWarningWithoutText: true}]) {
    const g = game(o); assert.equal(g.submit().status, 'rejected'); assert.deepEqual(g.calls, []);
  }
  assert.equal(game({kind: 'infrastructure'}).submit().status, 'submitted');
});

test('replacement notices changing during validation invalidate even an acknowledged choice', () => {
  const g = game({kind: 'units', replacements: true, changeWarnings: true});
  assert.equal(g.submit({confirm_unit_replacements: true}).status, 'rejected');
  assert.deepEqual(g.calls, []);
});

test('stale, missing, ambiguous, already-selected, foreign and unsafe contexts never submit', () => {
  for (const o of [{menu: true}, {inactive: true}, {sent: true}, {multiplayer: true}, {autoEndTurn: true},
    {noPending: true}, {duplicate: true}, {chosen: true}, {wrongNotification: true}, {missingNotification: true},
    {notification: {Dismissed: true}}, {notification: {Expired: true}}, {notification: {AddedOnTurn: 69}},
    {missingDefinition: true}, {unoffered: true}, {blocked: true}, {confirmation: true}, {funds: true}, {cost: 1}]) {
    const g = game(o); assert.equal(g.submit().status, 'rejected', JSON.stringify(o)); assert.deepEqual(g.calls, []);
  }
  for (const args of [{expected_turn: 67}, {kind: 'random'}, {choice_id: -1}, {choice_id: true}, {choice_id: 200},
    {confirm_unit_replacements: 1}]) {
    const g = game(); assert.equal(g.submit(args).status, 'rejected', JSON.stringify(args)); assert.deepEqual(g.calls, []);
  }
  const foreign = game(); foreign.context.Game.Notifications.getIdsForPlayer = () => [{owner: 1, id: 536, type: 20}];
  assert.equal(foreign.submit().status, 'rejected'); assert.deepEqual(foreign.calls, []);
});

test('pending identity, offers, rewards, balances and readiness are rechecked before the single submission', () => {
  for (const change of [({notification}) => notification.AddedOnTurn--, ({notification}) => notification.Dismissed = true,
    ({setOffers}) => setOffers(), ({setChosen}) => setChosen(), ({rewards}) => rewards[0].typeHash++,
    ({player}) => player.Treasury.goldBalance--, ({player}) => player.DiplomacyTreasury.diplomacyBalance--,
    ({player}) => player.isTurnActive = false, ({context}) => context.Game.turn++, ({context}) => context.Game.age++,
    ({civ}) => civ.$hash++, ({trait}) => trait.CivilizationType = 'CIV_OTHER']) {
    const g = game({change}); assert.equal(g.submit().status, 'rejected'); assert.deepEqual(g.calls, []);
  }
});

test('verification cannot substitute chosen flags, currency changes or reused notification identity for a cleared exact choice', () => {
  for (const o of [{noApply: true}, {wrongCiv: true}, {wrongKind: true}, {keepPending: true}, {spendGold: true}]) {
    const g = game(o), submitted = g.submit(); assert.equal(submitted.status, 'submitted');
    assert.equal(g.run('syncretism_state.js', submitted.verificationArguments).syncretismObserved, false, JSON.stringify(o));
    assert.equal(g.calls.length, 1);
  }
  const reused = game(), submitted = reused.submit(); reused.notification.AddedOnTurn--;
  assert.equal(reused.run('syncretism_state.js', submitted.verificationArguments).syncretismObserved, false);
  const removed = game(), result = removed.submit(); removed.removeNotification();
  assert.equal(removed.run('syncretism_state.js', result.verificationArguments).syncretismObserved, true);
  const lost = game({throwSend: true}); assert.throws(() => lost.submit(), /Lost submission/); assert.equal(lost.calls.length, 1);
});

test('a different active Syncretism reminder or unknown notification record prevents verification', () => {
  const g = game(), submitted = g.submit();
  g.context.Game.Notifications.getIdsForPlayer = () => [{owner: 0, id: 536, type: 20}, {owner: 0, id: 537, type: 20}];
  g.context.Game.Notifications.getType = () => 20;
  g.context.Game.Notifications.find = id => id.id === 536 ? g.notification : {Dismissed: false, Expired: false, AddedOnTurn: 68};
  assert.equal(g.run('syncretism_state.js', submitted.verificationArguments).syncretismObserved, false);
  g.context.Game.Notifications.find = () => null;
  assert.throws(() => g.run('syncretism_state.js', submitted.verificationArguments), /unknown/);
  assert.equal(g.calls.length, 1);
});
