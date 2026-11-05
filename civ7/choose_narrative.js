(() => {
  const {instance_id: instanceId, instance_type: instanceType, choice, expected_turn: expectedTurn} = queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (![instanceId, instanceType, expectedTurn].every(v => Number.isInteger(v) && v >= 0) ||
      typeof choice !== "string" || !choice.trim()) return reject("An exact pending instance, choice ID and expected turn are required");
  if (!UI.isInGame()) return reject("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) return reject("No local player");
  const player = Players.get(playerId);
  if (!player || player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return reject("Local turn is not active");
  if (Game.turn !== expectedTurn) return reject("The observed turn is stale");
  const stories = player.Stories;
  const pendingMatches = () => [...(stories.getPendingMetIds() ?? []), stories.getFirstPendingMetId(), stories.getFirstPendingDiscoveryLastMetID()]
    .filter(id => id?.owner === playerId && id.id === instanceId && id.type === instanceType);
  const matches = pendingMatches();
  if (!matches.length) return reject("No owned pending narrative instance matches this identity");
  const id = matches[0], story = stories.find(id), def = story && GameInfo.NarrativeStories.lookup(story.type);
  if (!def || typeof def.NarrativeStoryType !== "string" || def.UIActivation === "TRIAL") return reject("Narrative identity is unverified or requires unsupported trial handling");
  const before = {turn: Game.turn, age: Game.age, playerId, instanceId, instanceType,
    storyType: def.NarrativeStoryType, storyHash: story.type};
  function choices() {
    const links = def.VariableLinks ? stories.getOrderedLinks(id) ?? [] : GameInfo.NarrativeStory_Links
      .filter(link => link.FromNarrativeStoryType === def.NarrativeStoryType).map(link => link.ToNarrativeStoryType);
    if (!Array.isArray(links)) return null;
    const offered = new Map();
    for (const link of links) {
      const option = GameInfo.NarrativeStories.lookup(link);
      if (!option || typeof option.Activation !== "string" || typeof option.NarrativeStoryType !== "string") return null;
      const activation = option.Activation.toUpperCase();
      if (activation === "LINKED" || (["LINKED_REQUISITE", "LINKED_COMMON", "LINKED_SUBJECT_REQUISITE"].includes(activation) &&
          stories.determineRequisiteLink(option.NarrativeStoryType, id))) offered.set(option.NarrativeStoryType, option);
    }
    if (!offered.size) offered.set("CLOSE", {Cost: 0});
    return offered;
  }
  const offered = choices(), option = offered?.get(choice);
  if (!option) return reject("Choice is not offered for this pending narrative instance");
  if (option.Cost !== 0) return reject("Only definition-zero-cost narrative choices are supported; runtime spending quotes are unavailable");
  const args = {TargetType: choice, Target: id, Action: PlayerOperationParameters.Activate};
  const operation = PlayerOperationTypes.CHOOSE_NARRATIVE_STORY_DIRECTION;
  const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
  if (check?.Success !== true) return reject("Native narrative choice check failed", check?.FailureReasons ?? []);
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || !pendingMatches().length ||
      stories.find(id)?.type !== before.storyHash || choices()?.get(choice)?.Cost !== 0) return reject("Narrative choice or game context changed during validation");
  const verificationArguments = {instance_id: instanceId, instance_type: instanceType, story_type: before.storyType};
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", before, requestedChoice: choice,
    expected: {instanceId, instanceType, storyType: before.storyType, resolved: true}, verificationArguments,
    verificationScope: "The exact submitted pending instance was consumed; scripted rewards and side effects are not independently verified"};
})()
