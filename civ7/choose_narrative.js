(() => {
  const {instance_id: instanceId, instance_type: instanceType, choice, expected_turn: expectedTurn} = queryArguments;
  const {extended=false,max_cost:maximumCost=0,cost_yield:costYield=null,allow_trial:allowTrial=false}=queryArguments;
  const reject = (reason, failureReasons = []) => ({status: "rejected", reason, failureReasons});
  if (![instanceId, instanceType, expectedTurn].every(v => Number.isInteger(v) && v >= 0) ||
      typeof choice !== "string" || !choice.trim() || typeof extended!=="boolean" || typeof allowTrial!=="boolean" || typeof maximumCost!=="number" || !Number.isFinite(maximumCost) || maximumCost<0 ||
      (costYield!==null&&!["YIELD_GOLD","YIELD_DIPLOMACY"].includes(costYield))) return reject("An exact pending instance, choice ID, supported cost cap and expected turn are required");
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
  if (!def || typeof def.NarrativeStoryType !== "string") return reject("Narrative identity is unverified");
  const trial=def.UIActivation==="TRIAL",trialHead=()=>{const head=stories.getFirstPendingDiscoveryLastMetID();return head?.owner===playerId&&head.id===instanceId&&head.type===instanceType;};
  if(trial&&(!extended||!allowTrial||!trialHead()))return reject("Trial requires explicit acknowledgement and the exact native pending trial/discovery head");
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
  const paid=option.Cost!==0;
  if(paid&&(!extended||!Number.isFinite(option.Cost)||option.Cost<0||option.CostYield!==costYield||!["YIELD_GOLD","YIELD_DIPLOMACY"].includes(costYield)||stories.canAfford(choice)!==true))return reject("Paid choice requires explicit supported currency, native affordability and a runtime quote under the cap; definition cost is not a quote");
  const balance=()=>costYield==="YIELD_GOLD"?player.Treasury?.goldBalance:costYield==="YIELD_DIPLOMACY"?player.DiplomacyTreasury?.diplomacyBalance:null;
  if(paid&&(!Number.isFinite(balance())||balance()<0))return reject("Payment currency balance unknown");
  before.definitionCost=option.Cost;before.costYield=paid?costYield:null;before.balance=paid?balance():null;
  const args = {TargetType: choice, Target: id, Action: PlayerOperationParameters.Activate};
  const operation = PlayerOperationTypes.CHOOSE_NARRATIVE_STORY_DIRECTION;
  const check = Game.PlayerOperations.canStart(playerId, operation, args, false);
  if (check?.Success !== true || check.RequiresConfirmation===true) return reject("Native narrative choice failed or requires confirmation", check?.FailureReasons ?? []);
  const quotedCost=paid?check.Cost:0;
  if(paid? !Number.isFinite(quotedCost)||quotedCost<0||quotedCost>maximumCost||quotedCost>before.balance : Number.isFinite(check.Cost)&&check.Cost!==0)return reject("Native runtime price is unavailable, exceeds cap/balance or conflicts with zero-cost intent");
  if (Game.turn !== before.turn || Game.age !== before.age || GameContext.localPlayerID !== playerId ||
      player.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false || !pendingMatches().length ||
      stories.find(id)?.type !== before.storyHash || choices()?.get(choice)?.Cost !== before.definitionCost || (trial&&!trialHead()) ||
      paid&&(choices()?.get(choice)?.CostYield!==costYield||stories.canAfford(choice)!==true||balance()!==before.balance)) return reject("Narrative choice, payment balance or game context changed during validation");
  const verificationArguments = {instance_id: instanceId, instance_type: instanceType, story_type: before.storyType,
    ...(paid?{cost_yield:costYield,before_balance:before.balance,max_cost:maximumCost}:{})};
  Game.PlayerOperations.sendRequest(playerId, operation, args);
  return {status: "submitted", before, requestedChoice: choice, quotedCost,
    expected: {instanceId, instanceType, storyType: before.storyType, resolved: true,...(paid?{netSpendWithinCap:true}:{})}, verificationArguments,
    verificationScope: "Exact submitted pending instance consumed; paid choices require a native runtime quote under the acknowledged currency cap, with net balance readback only. Definition costs are never runtime quotes. Scripted rewards/gross debits and trial/Age effects are not independently accounted for"};
})()
