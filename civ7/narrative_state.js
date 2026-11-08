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
  const {cost_yield:yieldType,before_balance:balance,max_cost:cap}=queryArguments;
  let payment={};
  if(yieldType!==undefined){
    const current=yieldType==="YIELD_GOLD"?player.Treasury?.goldBalance:yieldType==="YIELD_DIPLOMACY"?player.DiplomacyTreasury?.diplomacyBalance:null;
    if(!Number.isFinite(balance)||!Number.isFinite(cap)||cap<0||!Number.isFinite(current))throw Error("Captured payment balance is unknown");
    payment={netSpend:balance-current,netSpendWithinCap:balance-current<=cap};
  }
  return {turn: Game.turn, age: Game.age, playerId, instanceId, instanceType, storyType, resolved: !pending.length,...payment};
})()
