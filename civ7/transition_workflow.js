(() => {
  const visible = node => node?.isConnected === true && node.getClientRects().length > 0;
  const panels = selector => [...document.querySelectorAll(selector)].filter(visible);
  const allowed = (id, type, args) => Game.PlayerOperations.canStart(id, type, args, false)?.Success === true;
  function pending(playerId, typeName) {
    const ids = Game.Notifications.getIdsForPlayer(playerId);
    if (!Array.isArray(ids)) return null;
    const result = [];
    for (const id of ids) {
      if (id.owner !== playerId || Game.Notifications.getTypeName(Game.Notifications.getType(id)) !== typeName) continue;
      const n = Game.Notifications.find(id);
      const blocks = Game.Notifications.getBlocksTurnAdvancement(id);
      if (!n || n.Type !== Game.Notifications.getType(id) || n.Dismissed !== false || n.Expired !== false ||
          typeof blocks !== "boolean" ||
          ![id.id, id.type, n.AddedOnTurn].every(value => Number.isSafeInteger(value) && value >= 0) || n.AddedOnTurn > Game.turn) return null;
      if (!blocks) continue;
      result.push({owner: playerId, id: id.id, type: id.type});
    }
    return result;
  }
  function mementos(selection) {
    if (selection?.selectionOpen !== true) return {available: false, slots: [], loadoutValid: false};
    try {
      // Explicit profile READS, unlike the default planning query. Never instantiate the UI model:
      // its equipMemento also toggles/clears other slots and calls setSeenMemento.
      const metadata = Online.Metaprogression.getMementosData(), slotMetadata = Online.Metaprogression.getMementoSlotData();
      const filtered = GameSetup.getMementoFilteredPlayerParameters(selection.playerId);
      const parameters = GameSetup.getPlayerParameters(selection.playerId);
      if (![metadata, slotMetadata, filtered, parameters].every(Array.isArray) ||
          !Number.isInteger(GameSetupParameterInvalidReason.Valid) || !Number.isInteger(GameSetupDomainValueInvalidReason.Valid) ||
          !Number.isInteger(DisplayType.DISPLAY_UNLOCKED) || !Number.isInteger(DisplayType.DISPLAY_LOCKED)) throw Error("Unknown profile metadata");
      const slots = [], seen = new Set();
      for (const base of filtered) {
        const baseId = GameSetup.resolveString(base.ID);
        if (typeof baseId !== "string" || !baseId.startsWith("PlayerMemento") || base.hidden || base.invalidReason !== GameSetupParameterInvalidReason.Valid) continue;
        const parameterId = `AgeTransition${baseId}`;
        if (seen.has(parameterId)) throw Error("Duplicate Memento slot");
        seen.add(parameterId);
        const matches = parameters.filter(p => GameSetup.resolveString(p.ID) === parameterId);
        const slotMatches = slotMetadata.filter(m => m.mementoTypeId === baseId);
        if (matches.length !== 1 || slotMatches.length !== 1) throw Error("Missing or ambiguous transition slot");
        const parameter = matches[0], display = slotMatches[0].displayType;
        if (![DisplayType.DISPLAY_UNLOCKED, DisplayType.DISPLAY_LOCKED].includes(display)) throw Error("Unknown slot lock");
        const editable = parameter.readOnly === false && parameter.hidden !== true && parameter.invalidReason === GameSetupParameterInvalidReason.Valid;
        const choices = (parameter.domain?.possibleValues ?? []).map(value => {
          const meta = metadata.filter(m => m.mementoTypeId === value.value);
          const unlocked = value.value === "NONE" || meta.length === 1 && meta[0].displayType === DisplayType.DISPLAY_UNLOCKED;
          return {id: String(value.value), name: value.name ? Locale.compose(GameSetup.resolveString(value.name)) : String(value.value),
            profileUnlocked: unlocked, selectionPermission: editable && display === DisplayType.DISPLAY_UNLOCKED &&
              unlocked && value.invalidReason === GameSetupDomainValueInvalidReason.Valid};
        });
        if (typeof parameter.value?.value !== "string") throw Error("Unknown selected Memento");
        slots.push({parameter: parameterId, selected: parameter.value.value, locked: display === DisplayType.DISPLAY_LOCKED, choices});
      }
      const selected = slots.map(slot => slot.selected).filter(id => id !== "NONE");
      const loadoutValid = slots.length > 0 && new Set(selected).size === selected.length && slots.every(slot => {
        const matches = slot.choices.filter(c => c.id === slot.selected);
        return slot.locked ? slot.selected === "NONE" : matches.length === 1 && matches[0].selectionPermission === true;
      });
      return {available: true, slots, loadoutValid};
    } catch { return {available: false, slots: [], loadoutValid: false}; }
  }
  function snapshot() {
    try {
      if (UI.isInGame() !== true || UI.getGameLoadingState() !== UIGameLoadingState.GameStarted ||
          !Number.isInteger(UIGameLoadingState.GameStarted) || Configuration.getGame().isAnyMultiplayer !== false ||
          Configuration.getUser().isAutoEndTurn !== false || (typeof Autoplay !== "undefined" && Autoplay.isActive !== false))
        return {phase: "unavailable", workflowToken: null};
      const playerId = GameContext.localPlayerID, player = Players.get(playerId);
      if (!Number.isInteger(playerId) || playerId < 0 || !Number.isSafeInteger(Game.turn) || !Number.isInteger(Game.age) ||
          player?.isTurnActive !== true || GameContext.hasSentTurnComplete() !== false) return {phase: "unavailable", workflowToken: null};
      const selection = transitionCivilization.snapshot(), deck = dedicationDeck.snapshot(playerId);
      if (!selection) throw Error("Native civilization-choice phase is unavailable");
      const notices = pending(playerId, "NOTIFICATION_AGE_TRANSITION");
      const previousAgeCount = Configuration.getGame().previousAgeCount;
      if (!Number.isSafeInteger(previousAgeCount) || previousAgeCount < 0) throw Error("Unknown Age progression history");
      const dedicationActive = Number.isSafeInteger(previousAgeCount) && previousAgeCount > 0 && notices?.length === 1 && deck?.selectionOpen === true;
      const chooserPanels = panels("#age-transition-screen");
      // The open Dedication model automatically applies more effects on AdvancedStartEffectUsed.
      // Do not submit one-effect operations while that model is mounted, even if hidden.
      const dedicationModelMounted = document.querySelectorAll("screen-dedication-selection").length > 0 ||
        document.querySelectorAll("screen-advanced-start").length > 0;
      const profile = mementos(selection), choicePending = selection.notification !== null && selection.notificationBlocksTurn === true;
      if (selection.notification !== null && typeof selection.notificationBlocksTurn !== "boolean") throw Error("Unknown civilization notification blocking state");
      const effects = [];
      let effectsKnown = Array.isArray(deck?.selected);
      for (const card of deck?.selected ?? []) {
        if (!Array.isArray(card.effects)) {effectsKnown = false; continue;}
        for (const effect of card.effects) {
          const amount = effect.reportedAmount;
          if (typeof effect.id !== "string" || !effect.id || !Number.isSafeInteger(amount) || amount < 0) effectsKnown = false;
          effects.push({cardId: card.id, id: effect.id, amount, placementRequired: effect.placementRequired === true,
            availableNow: dedicationActive && !dedicationModelMounted && amount > 0 && effect.placementRequired === false &&
              allowed(playerId, PlayerOperationTypes.ADVANCED_START_USE_EFFECT, {ID: effect.id})});
        }
      }
      const capital = player.Cities.getCapital(), capitalId = capital?.id?.owner === playerId ? capital.id.id : null;
      const ownedSettlements = [];
      for (const id of player.Cities.getCityIds()) {
        if (id.owner !== playerId || !Number.isSafeInteger(id.id) || id.id < 0) throw Error("Unknown owned settlement identity");
        const city = Cities.get(id);
        if (city?.id?.owner !== playerId || city.id.id !== id.id || !Number.isSafeInteger(city.location?.x) || !Number.isSafeInteger(city.location?.y))
          throw Error("Unknown owned settlement location");
        ownedSettlements.push({id: id.id, x: city.location.x, y: city.location.y});
      }
      ownedSettlements.sort((a, b) => a.id - b.id);
      if (new Set(ownedSettlements.map(city => city.id)).size !== ownedSettlements.length) throw Error("Ambiguous owned settlements");
      const choiceNotification = selection.notification ? {owner: selection.notification.owner, id: selection.notification.id, type: selection.notification.type} : null;
      // An expected loadout captured BEFORE Finished, not a claim about migration results.
      // Native acknowledgement can reset the setup selector to the old civilization.
      const receipt = globalThis.__sidkickTransitionConfirmation;
      const sameReceiptContext = receipt && receipt.turn === Game.turn && receipt.age === Game.age && receipt.playerId === playerId &&
        receipt.previousAgeCount === previousAgeCount && receipt.nextAge === selection.nextAge &&
        JSON.stringify(receipt.ownedSettlements) === JSON.stringify(ownedSettlements) &&
        (!choiceNotification || JSON.stringify(receipt.notification) === JSON.stringify(choiceNotification));
      const choicesAcknowledged = selection.choicesAcknowledged === true ||
        !choicePending && !choiceNotification && Boolean(sameReceiptContext) && Game.AgeProgressManager.isAgeOver === true;
      const confirmedLoadout = choicesAcknowledged && sameReceiptContext && typeof receipt.civilization === "string" && Array.isArray(receipt.mementoSelections)
        ? {civilization: receipt.civilization, mementoSelections: receipt.mementoSelections} : null;
      const requiresExpectedCivilization = choicesAcknowledged && confirmedLoadout === null;
      const capitals = [];
      if (dedicationActive) {
        const ownedIds = player.Cities.getCityIds();
        const potential = player.Cities.getPotentialSwitchCapitalCityIds();
        if (!Array.isArray(ownedIds) || !Array.isArray(potential)) throw Error("Unknown capital candidates");
        for (const id of [capital?.id, ...potential]) {
          if (!id || id.owner !== playerId || !Number.isSafeInteger(id.id) || id.id < 0 ||
              !ownedIds.some(owned => owned.owner === playerId && owned.id === id.id && owned.type === id.type) || capitals.some(c => c.id === id.id)) continue;
          const city = Cities.get(id);
          if (city?.id?.owner !== playerId || city.id.id !== id.id) continue;
          capitals.push({id: id.id, name: Locale.compose(city.name), selected: id.id === capitalId,
            selectionPermission: allowed(playerId, PlayerOperationTypes.SELECT_CAPITAL, {Player1: playerId, City: id.id, Swap: false})});
        }
      }
      const finishAllowed = choicePending && selection.choices.filter(c => c.id === selection.selected && c.selectionPermission === true).length === 1 &&
        profile.loadoutValid && allowed(playerId, PlayerOperationTypes.SET_AGE_TRANSITION_DATA, {Finished: true});
      const completeDeckAllowed = dedicationActive && !dedicationModelMounted && effectsKnown && effects.every(e => e.amount === 0) &&
        Number.isSafeInteger(capitalId) && allowed(playerId, PlayerOperationTypes.ADVANCED_START_MARK_COMPLETED, {});
      const blocker = Game.Notifications.getEndTurnBlockingType(playerId);
      const readyId = UI.Player.getFirstReadyUnit();
      const unit = readyId?.owner === playerId && typeof Units !== "undefined" ? Units.get(readyId) : null;
      const identified = unit?.id?.owner === playerId && unit.id.id === readyId?.id && unit.id.type === readyId?.type;
      const movement = remainingMoves(Game.UnitOperations.canStartAny(playerId), readyId == null ? "none" : identified ? "identified" : "unverified", unit);
      const advanceReady = !choicePending && chooserPanels.length === 0 && Game.AgeProgressManager.isAgeOver === true && Game.AgeProgressManager.isExtendedGame === false &&
        Game.AgeProgressManager.isFinalAge === false && typeof selection?.nextAge === "string" && Number.isInteger(blocker) &&
        Number.isInteger(EndTurnBlockingTypes.NONE) && blocker === EndTurnBlockingTypes.NONE &&
        movement.remainingMovesBlocker === false;
      const advanceAllowed = advanceReady && !requiresExpectedCivilization;
      const transitionCompleted = previousAgeCount > 0 && !choicePending && !choicesAcknowledged && notices?.length === 0 &&
        deck?.selectionComplete === true && Game.AgeProgressManager.isAgeOver === false;
      const state = {turn: Game.turn, age: Game.age, playerId, ageType: GameInfo.Ages.lookup(Game.age)?.AgeType ?? null,
        previousAgeCount, civilization: choicePending ? selection.selected : GameInfo.Civilizations.lookup(player.civilizationType)?.CivilizationType ?? null,
        nextAge: selection?.nextAge ?? null, nextCivilization: choicesAcknowledged ? confirmedLoadout?.civilization ?? null : selection.selected,
        choicePending, choicesAcknowledged, confirmedLoadout, requiresExpectedCivilization, stagedCivilization: selection.selected,
        recoveryCivilizations: requiresExpectedCivilization ? selection.choices.filter(choice => choice.unlocked === true &&
          choice.setupReason === GameSetupDomainValueInvalidReason.Valid).map(choice => choice.id) : [], chooserOpen: chooserPanels.length === 1,
        choiceNotification,
        dedicationPanelOpen: dedicationModelMounted,
        dedicationActive, dedicationNotification: notices?.length === 1 ? notices[0] : null,
        mementos: profile, mementoSelections: profile.slots.map(slot => ({parameter: slot.parameter, selected: slot.selected})),
        selectedCardIds: deck?.selectedCardIds ?? null, totalLegacyPoints: deck?.totalLegacyPoints ?? null,
        effectsKnown, effects, capitalId, capitals, ownedSettlements, finishAllowed, completeDeckAllowed, advanceReady, advanceAllowed, transitionCompleted,
        ageBoundary: {nativeAgeOver: Game.AgeProgressManager.isAgeOver ?? null,
          extendedGame: Game.AgeProgressManager.isExtendedGame ?? null, finalAge: Game.AgeProgressManager.isFinalAge ?? null,
          blocker, remainingMovesBlocker: movement.remainingMovesBlocker},
        selectionComplete: deck?.selectionComplete ?? null,
        phase: choicePending ? "choices" : choicesAcknowledged ? "choices_acknowledged" : dedicationActive ? "dedications" : advanceAllowed ? "boundary_ready" : transitionCompleted ? "complete" : "unavailable"};
      return {...state, workflowToken: JSON.stringify(state)};
    } catch { return {phase: "unavailable", workflowToken: null}; }
  }
  function viewMapControl() {
    try {
      const roots = [...panels("#age-transition-screen"), ...panels("screen-dedication-selection")];
      if (roots.length !== 1) return null;
      const labels = ["LOC_UI_AGE_TRANSITION_VIEW_MAP", "LOC_ADVANCED_START_VIEW_MAP"].map(key => Locale.compose(key).replace(/\s+/g, " ").trim());
      const controls = [...roots[0].querySelectorAll('[role="button"][data-activatable="true"]')].filter(button =>
        visible(button) && labels.includes(button.textContent.replace(/\s+/g, " ").trim()) &&
        !button.hasAttribute("disabled") && button.getAttribute("aria-disabled") !== "true" && !button.classList.contains("disabled"));
      if (controls.length !== 1) return null;
      const button = controls[0], r = button.getBoundingClientRect();
      if (![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0 ||
          !button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))) return null;
      return button;
    } catch { return null; }
  }
  return {snapshot, viewMapControl};
})()
