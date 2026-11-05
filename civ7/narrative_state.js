(() => {
  if (!UI.isInGame()) throw Error("Load a save first");
  const playerId = GameContext.localPlayerID;
  if (!Number.isInteger(playerId) || playerId < 0) throw Error("No local player");
  const player = Players.get(playerId);
  if (!player) throw Error("No local player");
  const {instance_id: instanceId, instance_type: instanceType, story_type: storyType} = queryArguments;
  if (![instanceId, instanceType].every(v => Number.isInteger(v) && v >= 0) || typeof storyType !== "string" || !storyType) throw Error("Invalid submitted narrative identity");
  const stories = player.Stories;
  const pending = [...(stories.getPendingMetIds() ?? []), stories.getFirstPendingMetId(), stories.getFirstPendingDiscoveryLastMetID()]
    .filter(id => id?.owner === playerId && id.id === instanceId && id.type === instanceType);
  if (pending.length) {
    const story = stories.find(pending[0]);
    if (!story || GameInfo.NarrativeStories.lookup(story.type)?.NarrativeStoryType !== storyType) throw Error("Pending narrative identity changed");
  }
  return {turn: Game.turn, age: Game.age, playerId, instanceId, instanceType, storyType, resolved: !pending.length};
})()
