(() => {
  const {kind, choice, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (!["pantheon", "belief", "found"].includes(kind) || typeof choice !== "string" || !choice || !Number.isInteger(expectedTurn) || expectedTurn < 0) return reject("Supported religious action, exact definition ID and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID, player = Players.get(playerId), r = player?.Religion;
  if (!Number.isInteger(playerId) || playerId < 0 || !r || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || Game.turn !== expectedTurn) return reject("A fresh active local turn is required");
  function state() {
    const pantheons = r.getPantheons(), beliefs = r.getBeliefs(), founded = r.hasCreatedReligion(), unlocked = r.getNumPantheonsUnlocked(), earned = r.getNumBeliefsEarned();
    if (typeof founded !== "boolean" || ![pantheons, beliefs].every(a => Array.isArray(a) && a.every(Number.isInteger) && new Set(a).size === a.length) ||
        ![unlocked, earned].every(v => Number.isInteger(v) && v >= 0)) return null;
    const religion = founded ? GameInfo.Religions.lookup(r.getReligionType())?.ReligionType : null;
    if (founded && typeof religion !== "string") return null;
    return {pantheons: [...pantheons].sort((a, b) => a - b), beliefs: [...beliefs].sort((a, b) => a - b), founded, religion, unlocked, earned};
  }
  const baseline = state();
  if (!baseline) return reject("Owned religious identity/collections/slots are unknown");
  let operation, args, expectedPantheons = baseline.pantheons, expectedBeliefs = baseline.beliefs, expectedReligion = baseline.religion;
  if (kind === "found") {
    const def = GameInfo.Religions.lookup(choice);
    if (def?.ReligionType !== choice || !Number.isInteger(def.$hash)) return reject("Exact religion definition is required");
    if (baseline.founded) return baseline.religion === choice ? {status: "already_active", before: baseline} : reject("A different religion is already founded");
    if (r.canCreateReligion() !== true || Game.Religion.hasBeenFounded(choice) !== false) return reject("Religion founding eligibility or unclaimed religion is not proven");
    operation = PlayerOperationTypes.FOUND_RELIGION; args = {ReligionType: def.$hash}; expectedReligion = choice;
  } else {
    const def = GameInfo.Beliefs.lookup(choice), pantheon = kind === "pantheon";
    if (def?.BeliefType !== choice || !Number.isInteger(def.$hash) || !Number.isInteger(def.$index)) return reject("Exact belief definition is required");
    const current = pantheon ? baseline.pantheons : baseline.beliefs;
    if (current.includes(def.$hash)) return {status: "already_active", before: baseline};
    if (pantheon) {
      if (def.BeliefClassType !== "BELIEF_CLASS_PANTHEON" || baseline.unlocked <= 0) return reject("A pantheon class and an actual unlocked choice are required");
      expectedPantheons = [...current, def.$hash].sort((a, b) => a - b);
    } else {
      const capacities = {BELIEF_CLASS_RELIQUARY: baseline.founded ? 1 : 0,
        BELIEF_CLASS_FOUNDER: [1, 2, 3].includes(baseline.earned) ? 1 : baseline.earned === 4 ? 2 : baseline.earned === 5 ? 3 : 0,
        BELIEF_CLASS_ENHANCER: baseline.earned >= 3 ? 1 : 0};
      const defs = current.map(hash => GameInfo.Beliefs.lookup(hash));
      if (!baseline.founded || defs.some(d => !d) || !(capacities[def.BeliefClassType] > defs.filter(d => d.BeliefClassType === def.BeliefClassType).length) ||
          Game.Religion.isBeliefClaimable(def.$index) !== true) return reject("Founded religion, claimable belief and an actual UI-class slot are required; native ADD_BELIEF alone is insufficient");
      expectedBeliefs = [...current, def.$hash].sort((a, b) => a - b);
    }
    operation = pantheon ? PlayerOperationTypes.FOUND_PANTHEON : PlayerOperationTypes.ADD_BELIEF; args = {BeliefType: def.$hash};
  }
  const before = {turn: Game.turn, age: Game.age, playerId, ...baseline};
  const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
  if (check?.Success !== true || check.RequiresConfirmation === true) return reject("Native religious action failed or requires confirmation", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false ||
      JSON.stringify(state()) !== JSON.stringify(baseline)) return reject("Religious state, slots or game context changed during validation");
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", before, expected: {choiceObserved: true}, verificationArguments: {kind, expected_pantheons: expectedPantheons,
    expected_beliefs: expectedBeliefs, expected_religion: expectedReligion, expected_founded: kind === "found" || baseline.founded},
    verificationScope: "Exact local pantheon/belief collection or founded religion with other selections preserved. Founding does not automatically pick beliefs; remaining mandatory belief choices must be handled separately"};
})()
