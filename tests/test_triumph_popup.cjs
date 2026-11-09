const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function game(o = {}) {
  const calls = [], player = {isTurnActive: !o.inactive, Treasury: {goldBalance: 1000}, DiplomacyTreasury: {diplomacyBalance: 200}};
  let panelOpen = !o.closed;
  const title = {textContent: "Let's Calicut a Deal"};
  const card = {textContent: "Let's Calicut a Deal First to start a Trade Route with every Leader. 4/4 Dedication Complete",
    querySelectorAll: selector => {assert.equal(selector, '.text-secondary.font-title'); return o.badTitle ? [] : [title];}};
  const host = {isConnected: true, getClientRects: () => [{}], contains: el => el === panel};
  const button = {isConnected: true, textContent: o.otherLabel ? 'Choose reward' : 'Close',
    getAttribute: name => ({'data-activatable': 'true', 'aria-disabled': o.disabled ? 'true' : null})[name] ?? null,
    hasAttribute: () => false, classList: {contains: name => name === 'disabled' && Boolean(o.disabled)},
    getClientRects: () => [{}], getBoundingClientRect: () => ({x: 10, y: 10, width: 100, height: 40}), contains: el => el === button,
    dispatchEvent: event => {
      calls.push(JSON.parse(JSON.stringify(event)));
      if (event.type === 'engine-input' && event.detail.status === 1 && event.detail.name === 'accept' && !o.keepOpen) {
        host.isConnected = false; panel.isConnected = false; button.isConnected = false; panelOpen = Boolean(o.nextPopup);
      }
      if (o.spendGold) player.Treasury.goldBalance--;
      if (o.sendThrows) throw Error('Lost response');
    }};
  const panel = {isConnected: true, textContent: `Triumph Complete ${card.textContent} Close`, getClientRects: () => o.hidden ? [] : [{}],
    querySelectorAll: selector => selector === '.triumph-card' ? o.ambiguousCard ? [card, card] : [card]
      : selector === '.triumph-complete-frame .fxs-button[data-name="Button"][role="button"]' ? o.ambiguousButton ? [button, button] : [button] : []};
  const nextButton = {...button, isConnected: true, contains: el => el === nextButton,
    dispatchEvent: () => {throw Error('Never close the next queued popup');}};
  const nextPanel = {...panel, isConnected: true,
    querySelectorAll: selector => selector === '.triumph-card' ? [card] : [nextButton]};
  const nextHost = {isConnected: true, getClientRects: () => [{}], contains: el => el === nextPanel};
  const forbidden = () => {throw Error('No notification activation/dismissal, game operation, reward selection or turn advancement');};
  const context = {queryArguments: {},
    UI: {isInGame: () => !o.notInGame, getGameLoadingState: () => o.loading ? 7 : 8}, UIGameLoadingState: {GameStarted: 8},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent), sendTurnComplete: forbidden},
    Configuration: {getGame: () => ({isAnyMultiplayer: Boolean(o.multiplayer)}), getUser: () => ({isAutoEndTurn: Boolean(o.autoEndTurn)})},
    Players: {get: owner => {assert.equal(owner, 0); return player;}},
    Game: {turn: 63, age: -123, Notifications: {activate: forbidden, dismiss: forbidden}, PlayerOperations: {sendRequest: forbidden}},
    InputActionStatuses: {FINISH: 1}, CustomEvent: class {constructor(type, options) {this.type = type; Object.assign(this, options);}},
    Locale: {compose: key => ({LOC_LEGACIES_COMPLETE_TITLE: 'Triumph Complete', LOC_UI_CITY_CLOSE_YIELDS: 'Close'})[key] ?? key},
    document: {
      querySelectorAll: selector => {
        if (!panelOpen) return [];
        const item = selector === 'triumph-complete-popup' ? host : panel;
        if (!host.isConnected) return [selector === 'triumph-complete-popup' ? nextHost : nextPanel];
        return o.ambiguousPanel ? [item, item] : [item];
      },
      elementFromPoint: () => o.covered ? {} : !host.isConnected && o.nextPopup ? nextButton : button,
    },
  };
  const sandbox = vm.createContext(context);
  sandbox.triumphPopup = vm.runInContext(fs.readFileSync('civ7/triumph_popup.js', 'utf8'), sandbox);
  const snapshot = () => JSON.parse(JSON.stringify(sandbox.triumphPopup.snapshot()));
  const run = (script, args) => {sandbox.queryArguments = args; return JSON.parse(JSON.stringify(vm.runInContext(fs.readFileSync(`civ7/${script}`, 'utf8'), sandbox)));};
  return {calls, context, player, host, panel, card, title, snapshot, run,
    close: token => run('close_triumph_popup.js', {popup_token: token, expected_turn: 63, request_id: 'closing'})};
}

test('read-only popup discovery binds visible Triumph text and native Close control without using legacy notifications', () => {
  const g = game(), state = g.snapshot();
  assert.equal(state.status, 'open'); assert.equal(state.title, "Let's Calicut a Deal");
  assert.equal(state.availableNow, true); assert.equal(typeof state.popupToken, 'string');
  assert.equal(state.responseTool, 'close_civ7_triumph_popup'); assert.deepEqual(g.calls, []);
});

test('exact native Close input is sent once and readback proves the captured DOM popup detached', () => {
  const g = game(), submitted = g.close(g.snapshot().popupToken);
  assert.equal(submitted.status, 'submitted');
  assert.deepEqual(g.calls, [{type: 'engine-input', bubbles: false, cancelable: true, detail: {name: 'accept', status: 1}}]);
  const after = g.run('triumph_popup_state.js', submitted.verificationArguments);
  assert.equal(after.capturedPopupClosed, true); assert.equal(after.balancesUnchanged, true);
  assert.equal(g.calls.length, 1);
});

test('missing, ambiguous, hidden, disabled or covered popup/Close controls never receive input', () => {
  const token = game().snapshot().popupToken;
  for (const o of [{closed: true}, {ambiguousPanel: true}, {ambiguousCard: true}, {ambiguousButton: true}, {badTitle: true},
    {hidden: true}, {disabled: true}, {covered: true}, {otherLabel: true}, {notInGame: true}, {loading: true},
    {multiplayer: true}, {autoEndTurn: true}, {inactive: true}, {sent: true}]) {
    const g = game(o); assert.equal(g.close(token).status, 'rejected', JSON.stringify(o)); assert.deepEqual(g.calls, []);
  }
  const stale = game(), old = stale.snapshot().popupToken; stale.card.textContent += ' changed';
  assert.equal(stale.close(old).status, 'rejected'); assert.deepEqual(stale.calls, []);
});

test('verification distinguishes failure to close from currency changes and never presses the next queued popup', () => {
  for (const o of [{keepOpen: true}, {spendGold: true}, {nextPopup: true}]) {
    const g = game(o), token = g.snapshot().popupToken, submitted = g.close(token);
    const after = g.run('triumph_popup_state.js', submitted.verificationArguments);
    assert.equal(after.capturedPopupClosed, !o.keepOpen); assert.equal(after.balancesUnchanged, !o.spendGold);
    if (o.nextPopup) {
      assert.equal(after.currentPopup.status, 'open');
      assert.equal(after.currentPopup.popupToken, token, 'identical next popup text cannot invalidate captured DOM detachment proof');
    }
    assert.equal(g.calls.length, 1);
  }
  const lost = game({sendThrows: true}), token = lost.snapshot().popupToken;
  assert.throws(() => lost.close(token), /Lost response/); assert.equal(lost.calls.length, 1);
  assert.throws(() => lost.run('triumph_popup_state.js', {request_id: 'different'}), /identity|capture/i);
});
