const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function run({ percent = 10, previousAges = 2, startAge = 'AGE_ANTIQUITY', unknown = false, fixed = false,
  targetPoints = 999, scoringArguments = [{ ScoringId: 'WONDERS', Key: 'REQUIRED_CONSTRUCTIBLE', ValueAsText: 'WONDER', ValueAsInt: null }] } = {}) {
  const type = { $hash: 50, VictoryType: 'CULTURE', Name: 'Culture', CountdownDuration: 5,
    ScoringType: fixed ? 'COUNTDOWN_VICTORY_SCORING_TYPE_FIXED_SCORE' : 'COUNTDOWN_VICTORY_SCORING_TYPE_DOMINATION', FinalAge: 1 };
  const data = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../civ7/victory.js'), 'utf8'), {
    UI: { isInGame: () => true }, GameContext: { localPlayerID: 0 }, Locale: { compose: s => s },
    Configuration: { getGame: () => ({ campaignStartAgeType: startAge, previousAgeCount: previousAges }) },
    Players: { getAliveIds: () => [0, 1, 2], get: id => {
      assert.notEqual(id, 2, 'unmet players are not inspected, even to compute threats');
      return { isMajor: true, team: id, civilizationFullName: id === 0 ? 'Local' : 'Rival',
        Diplomacy: { hasMet: other => other === 1 },
        Victories: {
          getPointsForVictoryType: () => id === 0 ? 100 : 250,
          getVictoryCountdownStatus: () => unknown ? { prereqs: [{ description: 'Requirement' }] }
            : { isDominant: id === 1, turns: id === 1 ? 3 : 0, prereqs: [{description: 'Requirement', current: 1, total: 1}] },
          getScoringForVictoryType: () => [],
        },
      };
    } },
    GameInfo: {
      Ages: { lookup: value => ({ AgeType: typeof value === 'string' ? value : 'AGE_EXPLORATION', Name: 'Age' }) },
      Leaders: { lookup: () => null }, VictoryTypes: [type], Victories: [{ VictoryType: 'CULTURE', VictoryClassType: 'VICTORY_CLASS_CULTURE' }],
      VictoryDominationPercents: [
        ...[[0, 300], [20, 200], [40, 100], [60, 50]].map(([MinAgeProgressPercent, DominationPercent]) => ({
          VictoryType: 'CULTURE', StartingAge: 'AGE_ANTIQUITY', PreviousAgeCount: 2, MinAgeProgressPercent, DominationPercent, Name: `Tier ${MinAgeProgressPercent}`,
        })),
        { VictoryType: 'CULTURE', StartingAge: 'AGE_ANTIQUITY', PreviousAgeCount: 1, MinAgeProgressPercent: 0, DominationPercent: 900 },
        { VictoryType: 'CULTURE', StartingAge: 'AGE_MODERN', PreviousAgeCount: 0, MinAgeProgressPercent: 40, DominationPercent: 100 },
      ],
      VictoryScorings: [{ VictoryType: 'CULTURE', ScoringId: 'WONDERS', Name: 'Wonders', TrackerType: 'VICTORY_TRACKER_WONDER', Points: 12, Data: 'AGE_MODERN', RequiresActivation: true }],
      VictoryScoringArgs: scoringArguments,
    },
    Game: { turn: 90, age: 1, VictoryManager: { getVictories: () => [], isCountdownVictoryEnabled: () => true, getCountdownVictoryDominanceScore: () => targetPoints },
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

test('victory alerts surface met-rival countdowns and scheduled rule easing, not an exact future win', () => {
  const data = run();
  assert.ok(data.victoryAlerts, 'time-sensitive victory evidence is prominent');
  const rival = data.victoryAlerts.find(alert => alert.kind === 'dominance-countdown');
  assert.equal(rival.playerId, 1);
  assert.equal(rival.isLocal, false);
  assert.equal(rival.turnsRemaining, 2);
  assert.equal(data.victoryAlerts.find(alert => alert.kind === 'dominance-threshold-change').nextMultiplier, 3);
  assert.equal(data.players.length, 2);
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
