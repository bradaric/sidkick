const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

function game(o = {}) {
  const calls = [], id = {owner: 0, id: 307, type: 20};
  const notice = {Type: -100, AddedOnTurn: 40, Target: {owner: 3, id: 24, type: 34},
    Dismissed: false, Expired: false, BlocksTurnAdvancement: true, CanUserDismiss: false, ...o.notice};
  const summary = 'Hatshepsut stole Feudalism. This is a report, not a new diplomatic choice.';
  let panelOpen = Boolean(o.panelOpen), continued = false, activated = false;
  const forbidden = () => {calls.push('forbidden'); throw Error('No generic dismissal, diplomacy or gameplay request');};
  const button = {textContent: o.acknowledgeLabel ?? 'Continue', hasAttribute: () => false,
    querySelector: selector => selector === '.espionage-details-acknowledge-icon' ? {} : null,
    dispatchEvent: event => {
      calls.push(['continue', event.type, event.bubbles]);
      if (!o.keepOpen) panelOpen = false;
      continued = true;
    }};
  const diploButton = {textContent: 'Go to Diplomacy', querySelector: selector =>
    selector === '.espionage-details-diplomacy-icon' ? {} : null, dispatchEvent: forbidden};
  const panel = {isConnected: true, getClientRects: () => [{}], querySelectorAll: selector => {
    if (selector === '#espionage-details-container .font-body.text-base.font-fit-shrink') return [{innerHTML: o.otherReport ? 'Different report' : summary}];
    if (selector === '#espionage-details-button-container > chooser-item') return o.badButtons ? [diploButton, button] : [button, diploButton];
    return [];
  }};
  const player = {isTurnActive: !o.inactive, Treasury: {goldBalance: 1000}, DiplomacyTreasury: {diplomacyBalance: 500}};
  const context = {
    queryArguments: {}, UI: {isInGame: () => true, getGameLoadingState: () => o.loading ? 6 : 8}, UIGameLoadingState: {GameStarted: 8},
    Configuration: {getGame: () => ({isAnyMultiplayer: Boolean(o.multiplayer)}), getUser: () => ({isAutoEndTurn: Boolean(o.autoEndTurn)})},
    GameContext: {localPlayerID: 0, hasSentTurnComplete: () => Boolean(o.sent), sendTurnComplete: forbidden},
    Players: {get: owner => {assert.equal(owner, 0, 'do not inspect an espionage culprit or foreign inventory'); return player;}},
    Locale: {compose: key => ({LOC_DIPLOMACY_ESPIONAGE_DETAILS_ACKNOWLEDGE: o.acknowledgeLabel ?? 'Continue', LOC_DIPLOMACY_OPEN_DIPLOMACY: 'Go to Diplomacy'})[key] ?? key,
      stylize: text => text},
    CustomEvent: class {constructor(type, options) {this.type = type; Object.assign(this, options);}},
    document: {querySelectorAll: selector => {
      assert.equal(selector, 'screen-espionage-details');
      return panelOpen ? o.ambiguousPanel ? [panel, panel] : [panel] : [];
    }},
    Game: {turn: 40, age: 42, Notifications: {
      getIdsForPlayer: () => o.missing || activated && o.removeOnActivate ? [] : o.duplicate ? [id, id]
        : o.duplicateBody ? [id, {...id, id: 308}] : [id],
      find: () => notice, getType: () => -100, getTypeName: () => o.type ?? 'NOTIFICATION_DIPLOMATIC_ACTION_ESPIONAGE',
      getSummary: () => summary, dismiss: forbidden,
      activate: selected => {
        calls.push(['activate', JSON.parse(JSON.stringify(selected))]);
        activated = true;
        if (!o.noAcknowledgement) notice.Dismissed = true;
        if (!o.noPanel) panelOpen = true;
        if (o.activateThrows) throw Error('Lost acknowledgement');
      },
    }, Diplomacy: {getDiplomaticEventData: selected => {
      assert.equal(selected, 24);
      return {uniqueID: o.wrongEvent ? 25 : 24, failed: false, revealed: true,
        get initialPlayer() {throw Error('Do not expose hidden culprit identity');}};
    }}, PlayerOperations: {sendRequest: forbidden}},
  };
  const sandbox = vm.createContext(context);
  const helper = fs.readFileSync('civ7/espionage_report_observation.js', 'utf8');
  sandbox.espionageReport = vm.runInContext(helper, sandbox);
  function run(script, args) {
    sandbox.queryArguments = args;
    return JSON.parse(JSON.stringify(vm.runInContext(fs.readFileSync(`civ7/${script}`, 'utf8'), sandbox)));
  }
  return {context, calls, notice, player, run,
    read: () => JSON.parse(JSON.stringify(sandbox.espionageReport.snapshot(0, id))),
    continued: () => continued};
}

function args(g) {return {notification_id: 307, component_type: 20, expected_turn: 40, report_token: g.read().reportToken, phase: 'open'};}

test('report reader exposes Continue as the only supported action; diplomacy is navigation only', () => {
  const g = game(), report = g.read();
  assert.equal(report.pending, true);
  assert.deepEqual(report.responseOptions.map(option => option.response), ['continue', 'open_diplomacy']);
  assert.equal(report.responseOptions[0].supportedByWriteTool, true);
  assert.equal(report.responseOptions[1].supportedByWriteTool, false);
  assert.equal(report.responseOptions[1].navigationOnly, true);
  assert.equal(typeof report.reportToken, 'string');
  assert.ok(!report.reportToken.includes('"owner":3'), 'opaque event binding must not disclose a hidden culprit');
  assert.deepEqual(g.calls, []);
});

test('native activation and exact Continue are separate single writes, with read-only observations between them', () => {
  const g = game(), request = args(g);
  const opened = g.run('acknowledge_espionage_report.js', request);
  assert.equal(opened.status, 'submitted');
  assert.deepEqual(g.calls, [['activate', {owner: 0, id: 307, type: 20}]]);
  const observed = g.run('espionage_report_state.js', {before: opened.before});
  assert.equal(observed.uiStatus, 'matching');
  assert.equal(observed.acknowledged, true);
  assert.equal(g.calls.length, 1, 'readback must never press Continue');
  assert.equal(g.run('acknowledge_espionage_report.js', {phase: 'continue', before: opened.before}).status, 'submitted');
  assert.equal(g.continued(), true);
  const after = g.run('espionage_report_state.js', {before: opened.before});
  assert.equal(after.acknowledged, true);
  assert.equal(after.popupClosed, true);
  assert.deepEqual(g.calls, [['activate', {owner: 0, id: 307, type: 20}], ['continue', 'action-activate', false]]);
});

test('wrong identities, stale reports, loading, multiplayer and auto-end-turn never activate a notification', () => {
  const token = game().read().reportToken;
  for (const o of [{type: 'NOTIFICATION_PLAYER_MET'}, {type: 'NOTIFICATION_DIPLOMATIC_ACTION_AGENDA'},
    {duplicate: true}, {duplicateBody: true}, {missing: true}, {wrongEvent: true}, {loading: true}, {multiplayer: true}, {autoEndTurn: true},
    {inactive: true}, {sent: true}, {panelOpen: true, otherReport: true}, {panelOpen: true, badButtons: true}]) {
    const g = game(o);
    const result = g.run('acknowledge_espionage_report.js', {notification_id: 307, component_type: 20, expected_turn: 40, report_token: token, phase: 'open'});
    assert.equal(result.status, 'rejected', JSON.stringify(o));
    assert.deepEqual(g.calls, []);
  }
  const g = game();
  assert.equal(g.run('acknowledge_espionage_report.js', {...args(g), expected_turn: 39}).status, 'rejected');
  assert.equal(g.run('acknowledge_espionage_report.js', {...args(g), report_token: 'stale'}).status, 'rejected');
  assert.deepEqual(g.calls, []);
});

test('wrong or ambiguous panel, changed report/context or balances can never click Continue', () => {
  for (const o of [{otherReport: true}, {ambiguousPanel: true}, {badButtons: true}, {noPanel: true}]) {
    const g = game(o), opened = g.run('acknowledge_espionage_report.js', args(g));
    assert.equal(g.run('acknowledge_espionage_report.js', {phase: 'continue', before: opened.before}).status, 'rejected');
    assert.equal(g.continued(), false);
  }
  for (const change of [g => g.context.Game.turn++, g => g.notice.Target.id++, g => g.player.Treasury.goldBalance--,
    g => g.player.DiplomacyTreasury.diplomacyBalance--]) {
    const g = game(), opened = g.run('acknowledge_espionage_report.js', args(g));
    change(g);
    assert.equal(g.run('acknowledge_espionage_report.js', {phase: 'continue', before: opened.before}).status, 'rejected');
    assert.equal(g.continued(), false);
  }
});

test('readback cannot confuse native notification clearance with popup closure or silently dismiss a blocker', () => {
  for (const o of [{}, {removeOnActivate: true}]) {
    const g = game(o), opened = g.run('acknowledge_espionage_report.js', args(g));
    assert.equal(g.run('espionage_report_state.js', {before: opened.before}).popupClosed, false);
    g.run('acknowledge_espionage_report.js', {phase: 'continue', before: opened.before});
    assert.equal(g.run('espionage_report_state.js', {before: opened.before}).acknowledged, true);
  }
  const g = game({noAcknowledgement: true}), opened = g.run('acknowledge_espionage_report.js', args(g));
  g.run('acknowledge_espionage_report.js', {phase: 'continue', before: opened.before});
  const after = g.run('espionage_report_state.js', {before: opened.before});
  assert.equal(after.popupClosed, true);
  assert.equal(after.acknowledged, false);
});

test('an already-open matching report uses its localized Acknowledge button without reopening it', () => {
  const g = game({panelOpen: true, acknowledgeLabel: 'Acknowledge', notice: {Dismissed: true}});
  const opened = g.run('acknowledge_espionage_report.js', args(g));
  assert.equal(opened.status, 'submitted');
  assert.deepEqual(g.calls, []);
  g.run('acknowledge_espionage_report.js', {phase: 'continue', before: opened.before});
  assert.deepEqual(g.calls, [['continue', 'action-activate', false]]);
  assert.equal(g.run('espionage_report_state.js', {before: opened.before}).popupClosed, true);
});

test('acknowledged and closed reports are no-ops, never activated again', () => {
  const token = game().read().reportToken, g = game({notice: {Dismissed: true}});
  const result = g.run('acknowledge_espionage_report.js', {
    phase: 'open', notification_id: 307, component_type: 20, expected_turn: 40, report_token: token});
  assert.equal(result.status, 'already_active');
  assert.deepEqual(g.calls, []);
});
