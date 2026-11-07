const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run({ percent = 10, previousAges = 2, startAge = 'AGE_ANTIQUITY', unknown = false, fixed = false,
  tourism = false, researchDepth = 1, traditionActive = false, nativeArguments = false,
  unmetPoints = 72, unmetCountdown = {isDominant: true, turns: 1}, missingDiplomacy = false,
  completedVictories = [], victoryClass = 'VICTORY_CLASS_CULTURE',
  targetPoints = 999, scoringArguments = [{ ScoringId: 'WONDERS', Key: 'REQUIRED_CONSTRUCTIBLE', ValueAsText: 'WONDER', ValueAsInt: null }] } = {}) {
  const type = { $hash: 50, VictoryType: 'CULTURE', Name: 'Culture', CountdownDuration: 5,
    ScoringType: fixed ? 'COUNTDOWN_VICTORY_SCORING_TYPE_FIXED_SCORE' : 'COUNTDOWN_VICTORY_SCORING_TYPE_DOMINATION', FinalAge: 1 };
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/victory.js'), 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    Configuration: { getGame: () => ({ campaignStartAgeType: startAge, previousAgeCount: previousAges }) },
    Players: { getAliveIds: () => [0, 1, 2, 3, 4], get: id => {
      if (id === 4) return null;
      if (id === 3) return {isMajor: false};
      if (id === 2) return {
        isMajor: true,
        get team() { throw Error('Unmet team identity must not be read'); },
        get civilizationFullName() { throw Error('Unmet civilization must not be read'); },
        get leaderType() { throw Error('Unmet leader must not be read'); },
        get leaderName() { throw Error('Unmet leader name must not be read'); },
        Victories: {
          getPointsForVictoryType: () => unmetPoints,
          getVictoryCountdownStatus: () => unmetCountdown && {...unmetCountdown,
            get prereqs() { throw Error('Unmet prerequisites must not be read'); }},
          getScoringForVictoryType: () => { throw Error('Unmet scoring history must not be read'); },
        },
      };
      return { isMajor: true, team: id, civilizationFullName: id === 0 ? 'Local' : 'Rival',
        Diplomacy: missingDiplomacy ? null : { hasMet: other => other === 1 },
        Culture: { isTraditionActive: type => { assert.equal(id, 0); assert.equal(type, 88); return traditionActive; } },
        Victories: {
          getPointsForVictoryType: () => id === 0 ? 100 : 250,
          getVictoryCountdownStatus: () => unknown ? { prereqs: [{ description: 'Requirement' }] }
            : { isDominant: id === 1, turns: id === 1 ? 3 : 0, prereqs: [{description: 'Requirement', current: 1, total: 1}] },
          getScoringForVictoryType: () => id === 0 ? [] : [{name: 'Known scoring', points: 250, turn: 88, age: 1, trackerType: 7}],
        },
      };
    } },
    GameInfo: {
      Ages: { lookup: value => ({ AgeType: typeof value === 'string' ? value : 'AGE_EXPLORATION', Name: 'Age' }) },
      Leaders: { lookup: () => null }, VictoryTypes: [type], Victories: [{ VictoryType: 'CULTURE', VictoryClassType: victoryClass }],
      VictoryDominationPercents: [
        ...[[0, 300], [20, 200], [40, 100], [60, 50]].map(([MinAgeProgressPercent, DominationPercent]) => ({
          VictoryType: 'CULTURE', StartingAge: 'AGE_ANTIQUITY', PreviousAgeCount: 2, MinAgeProgressPercent, DominationPercent, Name: `Tier ${MinAgeProgressPercent}`,
        })),
        { VictoryType: 'CULTURE', StartingAge: 'AGE_ANTIQUITY', PreviousAgeCount: 1, MinAgeProgressPercent: 0, DominationPercent: 900 },
        { VictoryType: 'CULTURE', StartingAge: 'AGE_MODERN', PreviousAgeCount: 0, MinAgeProgressPercent: 40, DominationPercent: 100 },
      ],
      VictoryScorings: [{ VictoryType: 'CULTURE', ScoringId: 'WONDERS', Name: 'Wonders', TrackerType: 'VICTORY_TRACKER_WONDER', Points: 12, Data: 'AGE_MODERN', RequiresActivation: true }],
      VictoryScoringArgs: scoringArguments,
      Modifiers: tourism ? [
        { ModifierId: 'ACTIVATE', ModifierType: 'ACTIVATE_TYPE', SubjectRequirementSetId: 'CONDITIONAL_TILES' },
        { ModifierId: 'ATTACH', ModifierType: 'ATTACH_TYPE', OwnerRequirementSetId: 'CONDITIONAL_OWNER' },
        { ModifierId: 'UNRELATED', ModifierType: 'OTHER_TYPE' },
      ] : [],
      DynamicModifiers: ((rows) => nativeArguments ? {find: predicate => rows.find(predicate),
        filter: predicate => rows.filter(predicate), [Symbol.iterator]: () => rows[Symbol.iterator]()} : rows)([
        { ModifierType: 'ACTIVATE_TYPE', EffectType: 'EFFECT_PLAYER_ACTIVATE_VICTORY_POINT_TRACKER', CollectionType: 'COLLECTION_OWNER' },
        { ModifierType: 'ATTACH_TYPE', EffectType: 'EFFECT_ATTACH_MODIFIERS', CollectionType: 'COLLECTION_OWNER' },
      ]),
      ModifierArguments: ((rows) => nativeArguments ? {find: predicate => rows.find(predicate), filter: predicate => rows.filter(predicate)} : rows)([
        { ModifierId: 'ACTIVATE', Name: 'TrackerName', Value: 'WONDERS' },
        { ModifierId: 'ATTACH', Name: 'ModifierId', Value: 'ACTIVATE' },
        { ModifierId: 'UNRELATED', Name: 'TrackerName', Value: 'WONDERS' },
      ]),
      ProgressionTreeNodeUnlocks: [
        { TargetKind: 'KIND_MODIFIER', TargetType: 'ATTACH', ProgressionTreeNodeType: 'MASTERY', UnlockDepth: 2, RequiredGovernmentType: 'GOVERNMENT' },
        { TargetKind: 'KIND_MODIFIER', TargetType: 'ATTACH', ProgressionTreeNodeType: 'SECRET', UnlockDepth: 1, Hidden: true },
      ],
      ProgressionTreeNodes: { lookup: () => ({ $hash: 77, Name: 'Mastery' }) },
      TraditionModifiers: [{ TraditionType: 'POLICY', ModifierId: 'ATTACH' }],
      Traditions: { lookup: () => ({ $hash: 88, Name: 'Policy' }) },
    },
    Game: { turn: 90, age: 1, VictoryManager: { getVictories: () => completedVictories, isCountdownVictoryEnabled: () => true, getCountdownVictoryDominanceScore: () => targetPoints },
      ProgressionTrees: {getNode: (id, type) => {assert.equal(id, 0); assert.equal(type, 77); return researchDepth == null ? null : {depthUnlocked: researchDepth};}},
      AgeProgressManager: { getCurrentAgeProgressionPoints: () => percent, getMaxAgeProgressionPoints: () => 100 },
    },
  });
  return JSON.parse(JSON.stringify(data));
}

test('dominance planning follows matching live rule rows and exposes the 4x to 3x to 2x schedule', () => {
  const data = run();
  const schedule = data.victoryConditions[0].dominanceSchedule;
  assert.ok(schedule, 'matching campaign dominance schedule is exported');
  assert.deepEqual(schedule.tiers.map(tier => tier.multiplier), [4, 3, 2, 1.5]);
  assert.equal(schedule.currentTier.multiplier, 4);
  assert.equal(schedule.nextTier.minAgeProgressPercent, 20);
  assert.equal(schedule.nextTier.multiplier, 3);
  assert.equal(run({ percent: 40 }).victoryConditions[0].dominanceSchedule.currentTier.multiplier, 2);
  assert.equal(data.victoryConditions[0].targetPoints, 999, 'native point target is not replaced with a recomputed rival threshold');
  assert.equal(schedule.estimatedTurnsUntilChange, null);
  assert.equal(run({ startAge: 'AGE_MODERN', previousAges: 0, percent: 10 }).victoryConditions[0].dominanceSchedule.currentTier, null);
  assert.equal(run({ fixed: true }).victoryConditions[0].dominanceSchedule, null);
  assert.equal(run({ previousAges: 3 }).victoryConditions[0].dominanceSchedule.currentTier, null, 'unmatched campaign rules are unknown, not a default ratio');
  assert.equal(run({ percent: null }).victoryConditions[0].dominanceSchedule.currentTier, null);
  assert.equal(run({ startAge: null }).victoryConditions[0].dominanceSchedule.nextTier, null);
});

test('victory alerts surface rival countdowns and scheduled rule easing, not an exact future win', () => {
  const data = run();
  assert.ok(data.victoryAlerts, 'time-sensitive victory evidence is prominent');
  const rival = data.victoryAlerts.find(alert => alert.kind === 'dominance-countdown');
  assert.equal(rival.playerId, 1);
  assert.equal(rival.isLocal, false);
  assert.equal(rival.turnsRemaining, 2);
  assert.equal(data.victoryAlerts.find(alert => alert.kind === 'dominance-threshold-change').nextMultiplier, 3);
  assert.equal(data.players.length, 3, 'public scoreboard includes unmet majors, not minor or missing players');
});

test('unmet scoreboard totals and countdowns are anonymous without identity or history reads', () => {
  const data = run({completedVictories: [{victory: 50, team: 2}]});
  assert.deepEqual(data.players.find(player => player.id === 2), {
    id: 2, isLocal: false, hasMet: false, displayName: 'Unmet player',
    team: null, civilization: null, leader: null,
  });
  const progress = data.victoryConditions[0].progress.find(player => player.playerId === 2);
  assert.ok(progress, 'unmet scoreboard row is retained');
  assert.equal(progress.points, 72);
  assert.equal(progress.won, null, 'no hidden team lookup to infer a completed victory');
  assert.equal(progress.scoring, null, 'withheld history is not an empty ledger');
  assert.deepEqual(progress.countdown, {
    isDominant: true, turnsProgress: 1, turnsRemaining: 4, prerequisites: null,
  });
  const alert = data.victoryAlerts.find(value => value.playerId === 2);
  assert.equal(alert.kind, 'dominance-countdown');
  assert.equal(alert.turnsRemaining, 4);
});

test('unmet zero points and unavailable countdown values are not invented', () => {
  const progress = run({unmetPoints: 0, unmetCountdown: {}}).victoryConditions[0].progress[2];
  assert.equal(progress.points, 0);
  assert.deepEqual(progress.countdown, {
    isDominant: null, turnsProgress: null, turnsRemaining: null, prerequisites: null,
  });
  assert.equal(run({unmetCountdown: null}).victoryConditions[0].progress[2].countdown, null);
});

test('met-player identity and detailed scoring stay available, but missing diplomacy redacts rivals', () => {
  const data = run();
  assert.equal(data.players[0].hasMet, true);
  assert.equal(data.players[1].hasMet, true);
  assert.equal(data.players[1].civilization, 'Rival');
  assert.equal(data.victoryConditions[0].progress[1].scoring[0].name, 'Known scoring');
  assert.equal(data.victoryConditions[0].progress[1].countdown.prerequisites[0].complete, true);
  const unknown = run({missingDiplomacy: true});
  for (const player of unknown.players.filter(value => !value.isLocal)) {
    assert.equal(player.hasMet, false);
    assert.equal(player.displayName, 'Unmet player');
    assert.equal(player.civilization, null);
    assert.equal(unknown.victoryConditions[0].progress.find(value => value.playerId === player.id).scoring, null);
  }
});

test('Culture victory points are labelled Tourism, not Culture yield or a per-turn rate', () => {
  const victory = run().victoryConditions[0];
  assert.equal(victory.pointsLabel, 'Tourism');
  assert.equal(victory.progress[0].points, 100);
  assert.equal(run({victoryClass: 'VICTORY_CLASS_SCIENCE'}).victoryConditions[0].pointsLabel, 'Victory points');
});

test('unknown countdown/prerequisite values remain null rather than invented zeroes or false completion', () => {
  const countdown = run({ unknown: true }).victoryConditions[0].progress[0].countdown;
  assert.equal(countdown.turnsProgress, null);
  assert.equal(countdown.turnsRemaining, null);
  assert.equal(countdown.isDominant, null);
  assert.equal(countdown.prerequisites[0].complete, null);
});

test('public scoring sources retain activation conditions and non-project requirements as definitions', () => {
  const condition = run().victoryConditions[0];
  assert.ok(condition.scoringRules, 'scoring rules explain non-project paths');
  assert.equal(condition.scoringRules[0].id, 'WONDERS');
  assert.equal(condition.scoringRules[0].definitionPoints, 12);
  assert.equal(condition.scoringRules[0].requiresActivation, true);
  assert.equal(condition.scoringRules[0].activeForLocalPlayer, null);
  assert.deepEqual(condition.scoringRules[0].arguments, [{ key: 'REQUIRED_CONSTRUCTIBLE', value: 'WONDER' }]);
});

test('unavailable native victory targets become null while numeric targets are preserved', () => {
  assert.equal(run({ targetPoints: -1 }).victoryConditions[0].targetPoints, null);
  assert.equal(run({ targetPoints: 0 }).victoryConditions[0].targetPoints, 0);
  assert.equal(run({ targetPoints: 100 }).victoryConditions[0].targetPoints, 100);
});

test('scoring arguments preserve text over numeric defaults and retain genuine numeric zeroes', () => {
  const values = [
    { Key: 'REQUIRED_CONSTRUCTIBLE', ValueAsText: 'WONDER', ValueAsInt: 0 },
    { Key: 'TEXT_ZERO', ValueAsText: '0', ValueAsInt: 0 },
    { Key: 'NUMERIC_ZERO', ValueAsText: '', ValueAsInt: 0 },
    { Key: 'NUMERIC_AMOUNT', ValueAsText: null, ValueAsInt: 12 },
    { Key: 'UNKNOWN', ValueAsText: '', ValueAsInt: null },
  ];
  const condition = run({ scoringArguments: values.map(value => ({ ScoringId: 'WONDERS', ...value })) }).victoryConditions[0];
  assert.deepEqual(condition.scoringRules[0].arguments, [
    { key: 'REQUIRED_CONSTRUCTIBLE', value: 'WONDER' },
    { key: 'TEXT_ZERO', value: '0' },
    { key: 'NUMERIC_ZERO', value: 0 },
    { key: 'NUMERIC_AMOUNT', value: 12 },
    { key: 'UNKNOWN', value: null },
  ]);
});

test('Culture scoring exposes public tracker activators and local research/policy evidence, not inferred activation', () => {
  const rule = run({ tourism: true }).victoryConditions[0].scoringRules[0];
  assert.ok(rule.activationEvidence, 'activation evidence is exported for Culture scoring rules');
  assert.deepEqual(rule.activationEvidence.modifiers.map(modifier => modifier.id), ['ACTIVATE', 'ATTACH']);
  assert.equal(rule.activationEvidence.modifiers[0].subjectRequirementSet, 'CONDITIONAL_TILES');
  assert.equal(rule.activationEvidence.modifiers[1].ownerRequirementSet, 'CONDITIONAL_OWNER');
  assert.equal(rule.activationEvidence.unlocks.length, 1, 'hidden unlocks are not presented as local choices');
  assert.equal(rule.activationEvidence.unlocks[0].requiredDepth, 2);
  assert.equal(rule.activationEvidence.unlocks[0].researchRequirementMet, false);
  assert.equal(rule.activationEvidence.unlocks[0].requiredGovernment, 'GOVERNMENT');
  assert.equal(rule.activationEvidence.traditions[0].active, false);
  assert.equal(rule.activeForLocalPlayer, null);
});

test('mastery depth and slotted policy are evidence even when both are met, not proof a tracker is active', () => {
  const rule = run({ tourism: true, researchDepth: 2, traditionActive: true }).victoryConditions[0].scoringRules[0];
  assert.ok(rule.activationEvidence);
  assert.equal(rule.activationEvidence.unlocks[0].researchRequirementMet, true);
  assert.equal(rule.activationEvidence.traditions[0].active, true);
  assert.equal(rule.activeForLocalPlayer, null);
  const missing = run({ tourism: true, researchDepth: null }).victoryConditions[0].scoringRules[0];
  assert.equal(missing.activationEvidence.unlocks[0].researchRequirementMet, null);
});

test('Culture activation evidence supports iterable native GameInfo catalogs without Array.some or map', () => {
  const rule = run({tourism: true, nativeArguments: true}).victoryConditions[0].scoringRules[0];
  assert.equal(rule.activationEvidence.modifiers.length, 2);
});
