(() => {
  function snapshot() {
    try {
      const playerId = GameContext.localPlayerID;
      if (!Number.isInteger(playerId) || playerId < 0 || !Number.isSafeInteger(Game.turn) || !Number.isInteger(Game.age)) return null;
      const parameter = GameSetup.findPlayerParameter(playerId, "AgeTransitionPlayerCivilization");
      const ageDomain = GameSetup.resolveString(GameSetup.findGameParameter("Age")?.value?.originDomain);
      const ages = (Database.query("config", "SELECT * FROM Ages") ?? [])
        .filter(age => age.Domain === ageDomain && !age.Hidden).sort((a, b) => a.ChronologyIndex - b.ChronologyIndex);
      const current = ages.find(age => age.AgeType === GameInfo.Ages.lookup(Game.age)?.AgeType);
      const next = current && Game.AgeProgressManager.isFinalAge === false
        ? ages.find(age => age.ChronologyIndex > current.ChronologyIndex) : null;
      const ids = Game.Notifications.getIdsForPlayer(playerId);
      if (!Array.isArray(ids)) return null;
      const notices = [];
      for (const id of ids) {
        if (id.owner !== playerId) continue;
        const type = Game.Notifications.getType(id);
        if (Game.Notifications.getTypeName(type) !== "NOTIFICATION_CHOOSE_CIVILIZATION") continue;
        const notice = Game.Notifications.find(id);
        if (!notice || notice.Type !== type || notice.Dismissed !== false || notice.Expired !== false ||
            Game.Notifications.getBlocksTurnAdvancement(id) !== true ||
            ![id.id, id.type, notice.AddedOnTurn].every(value => Number.isSafeInteger(value) && value >= 0) ||
            notice.AddedOnTurn > Game.turn) return null;
        notices.push({owner: playerId, id: id.id, type: id.type, addedOnTurn: notice.AddedOnTurn});
      }
      const selectionOpen = UI.isInGame() === true && Number.isInteger(UIGameLoadingState.GameStarted) &&
        UI.getGameLoadingState() === UIGameLoadingState.GameStarted && Configuration.getGame().isAnyMultiplayer === false &&
        (typeof Autoplay === "undefined" || Autoplay.isActive === false) && Players.get(playerId)?.isTurnActive === true &&
        GameContext.hasSentTurnComplete() === false && notices.length === 1 && Boolean(next?.PlayerCivilizationDomain) &&
        parameter?.readOnly === false && parameter.hidden !== true && parameter.invalidReason === GameSetupParameterInvalidReason.Valid &&
        typeof parameter.value?.value === "string";
      const bypass = Configuration.getGame().getValue("NoCivilizationUnlocks") === true;
      const choices = (parameter?.domain?.possibleValues ?? [])
        .filter(value => next && GameSetup.resolveString(value.originDomain) === next.PlayerCivilizationDomain && value.value !== "RANDOM")
        .map(value => {
          const unlocked = bypass || GameInfo.UnlockRewards.filter(reward => reward.UnlockRewardKind === "KIND_CIVILIZATION" &&
            reward.UnlockRewardType === value.value).some(reward => Game.Unlocks.getProgressForPlayer(reward.UnlockType, playerId)?.isUnlocked === true);
          return {id: String(value.value), setupReason: value.invalidReason ?? null, unlocked,
            selectionPermission: selectionOpen && value.invalidReason === GameSetupDomainValueInvalidReason.Valid && unlocked};
        });
      const state = {turn: Game.turn, age: Game.age, playerId, nextAge: next?.AgeType ?? null,
        selected: parameter?.value?.value ?? null, selectionOpen, notification: notices.length === 1 ? notices[0] : null,
        unlockBypassEnabled: bypass, choices};
      return {...state, selectionToken: selectionOpen ? JSON.stringify(state) : null};
    } catch { return null; } // Missing native phase/permission data never authorizes a write.
  }
  return {snapshot};
})()
